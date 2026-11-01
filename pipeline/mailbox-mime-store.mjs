import {createHash} from 'node:crypto';

const chunkSize=1_000_000,maxBytes=28_000_000;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function validateMailboxMimeReference(value){
 check(value&&Object.keys(value).sort().join(',')==='bytes,sha256'&&sha(value.sha256)&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=maxBytes,'Exact bounded MIME reference required');
 return value;
}
const key=ref=>`mailbox-mime/${ref.sha256}`;
function manifest(bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=maxBytes,'Bounded exact MIME bytes required');
 const chunks=[];for(let offset=0;offset<bytes.length;offset+=chunkSize)chunks.push(digest(bytes.subarray(offset,offset+chunkSize)));
 return {format:'mailbox-mime-v1',sha256:digest(bytes),bytes:bytes.length,chunk_size:chunkSize,chunks};
}
function validateManifest(value,ref){
 validateMailboxMimeReference(ref);
 check(value&&Object.keys(value).sort().join(',')==='bytes,chunk_size,chunks,format,sha256'&&value.format==='mailbox-mime-v1'&&value.sha256===ref.sha256&&value.bytes===ref.bytes&&value.chunk_size===chunkSize&&Array.isArray(value.chunks)&&value.chunks.length===Math.ceil(ref.bytes/chunkSize)&&value.chunks.every(sha),'Stored MIME manifest differs from exact reference');return value;
}

// A stored artifact does not authorize delivery. Only a conditional intent can do that.
export function mailboxMimeStore(store){
 async function read(path,max,guard){
  await guard();const saved=await store.getWithMetadata(path,{type:'arrayBuffer',consistency:'strong'});await guard();
  check(saved?.data?.byteLength>0&&saved.data.byteLength<=max,'Exact MIME artifact is missing or oversized');return Buffer.from(saved.data);
 }
 async function putExact(path,bytes,guard){
  await guard();let result;try{result=await store.set(path,bytes,{onlyIfNew:true});}catch{}await guard();
  if(result?.modified===true)return;
  check((await read(path,bytes.length,guard)).equals(bytes),'MIME write outcome is uncertain or conflicts; preserve original intent');
 }
 return {
  async put(bytes,{guard=async()=>{}}={}){
   const m=manifest(bytes),ref={sha256:m.sha256,bytes:m.bytes};
   for(let i=0;i<m.chunks.length;i++)await putExact(`${key(ref)}/${i}-${m.chunks[i]}`,bytes.subarray(i*chunkSize,(i+1)*chunkSize),guard);
   await putExact(`${key(ref)}/manifest`,Buffer.from(JSON.stringify(m)),guard);return ref;
  },
  async get(ref,{guard=async()=>{}}={}){
   validateMailboxMimeReference(ref);const m=validateManifest(JSON.parse((await read(`${key(ref)}/manifest`,5000,guard)).toString()),ref),chunks=[];
   for(let i=0;i<m.chunks.length;i++){
    const size=Math.min(chunkSize,m.bytes-i*chunkSize),bytes=await read(`${key(ref)}/${i}-${m.chunks[i]}`,size,guard);
    check(bytes.length===size&&digest(bytes)===m.chunks[i],'Exact MIME chunk integrity failed');chunks.push(bytes);
   }
   const bytes=Buffer.concat(chunks);check(bytes.length===ref.bytes&&digest(bytes)===ref.sha256,'Exact MIME whole-file integrity failed');await guard();return bytes;
  }
 };
}
