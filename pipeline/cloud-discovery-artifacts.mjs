import {createHash} from 'node:crypto';

export const cloudDiscoveryArtifactMaxBytes=2_000_000;
const chunkSize=1_000_000,digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const closed=(value,keys)=>object(value)&&Reflect.ownKeys(value).every(k=>typeof k==='string'&&Object.getOwnPropertyDescriptor(value,k).enumerable&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'))&&Object.keys(value).sort().join(',')===keys;

// Reject lossy/non-JSON values before serialization, including getters and prototype-shaped fields.
function encode(payload){
 check(object(payload),'Discovery artifact must be a JSON object');let nodes=0,textBytes=0;const ancestors=new Set();
 function visit(value,depth){
  check(++nodes<=100000&&depth<=64,'Discovery JSON structure exceeds bounds');
  if(typeof value==='string'){textBytes+=Buffer.byteLength(value);check(textBytes<=cloudDiscoveryArtifactMaxBytes,'Discovery JSON exceeds byte bound');return;}
  if(value===null||typeof value==='boolean')return;
  if(typeof value==='number'){check(Number.isFinite(value)&&!Object.is(value,-0),'Exact JSON number required');return;}
  check(object(value)||Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype,'Only JSON values are permitted');check(!ancestors.has(value),'Cyclic discovery JSON');ancestors.add(value);
  const descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(descriptors);
  if(Array.isArray(value))check(value.length<=100000&&keys.length===value.length+1,'Dense JSON array required');
  for(const key of keys){
   if(Array.isArray(value)&&key==='length')continue;
   check(typeof key==='string'&&!['__proto__','prototype','constructor'].includes(key),'Unsafe discovery JSON key');
   if(Array.isArray(value))check(/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<value.length,'Dense JSON array required');
   const d=descriptors[key];check(d.enumerable&&Object.hasOwn(d,'value'),'Plain JSON data fields required');textBytes+=Buffer.byteLength(key);check(textBytes<=cloudDiscoveryArtifactMaxBytes,'Discovery JSON exceeds byte bound');visit(d.value,depth+1);
  }
  ancestors.delete(value);
 }
 visit(payload,0);const bytes=Buffer.from(JSON.stringify(payload));check(bytes.length<=cloudDiscoveryArtifactMaxBytes,'Discovery JSON exceeds byte bound');return bytes;
}
export function validateCloudDiscoveryArtifactReference(ref){
 check(closed(ref,'bytes,reference,sha256')&&sha(ref.sha256)&&Number.isSafeInteger(ref.bytes)&&ref.bytes>=2&&ref.bytes<=cloudDiscoveryArtifactMaxBytes&&ref.reference==='cloud-discovery/'+ref.sha256,'Exact bounded discovery artifact reference required');return ref;
}
function manifest(bytes){const chunks=[];for(let offset=0;offset<bytes.length;offset+=chunkSize)chunks.push(digest(bytes.subarray(offset,offset+chunkSize)));return {format:'cloud-discovery-json-v1',sha256:digest(bytes),bytes:bytes.length,chunk_size:chunkSize,chunks};}
function validateManifest(m,ref){
 check(closed(m,'bytes,chunk_size,chunks,format,sha256')&&m.format==='cloud-discovery-json-v1'&&m.sha256===ref.sha256&&m.bytes===ref.bytes&&m.chunk_size===chunkSize&&Array.isArray(m.chunks)&&m.chunks.length===Math.ceil(ref.bytes/chunkSize)&&m.chunks.every(sha),'Discovery artifact manifest differs');return m;
}

// Artifacts are evidence only. A stored JSON object grants no research, import or execution authority.
export function cloudDiscoveryArtifactStore(store){
 async function read(path,max,guard){
  await guard();const saved=await store.getWithMetadata(path,{type:'arrayBuffer',consistency:'strong'});await guard();
  check(saved?.data?.byteLength>0&&saved.data.byteLength<=max,'Discovery artifact is missing or oversized');return Buffer.from(saved.data);
 }
 async function putExact(path,bytes,guard){
  await guard();let result;try{result=await store.set(path,bytes,{onlyIfNew:true});}catch{}await guard();
  if(result?.modified===true)return;
  check((await read(path,bytes.length,guard)).equals(bytes),'Discovery artifact write uncertain or conflicting');
 }
 return {
  async put(payload,{guard=async()=>{}}={}){
   const bytes=encode(payload),m=manifest(bytes),ref={sha256:m.sha256,bytes:m.bytes,reference:'cloud-discovery/'+m.sha256};
   for(let i=0;i<m.chunks.length;i++)await putExact(`${ref.reference}/${i}-${m.chunks[i]}`,bytes.subarray(i*chunkSize,(i+1)*chunkSize),guard);
   await putExact(`${ref.reference}/manifest`,Buffer.from(JSON.stringify(m)),guard);return ref;
  },
  async get(input,{guard=async()=>{}}={}){
   validateCloudDiscoveryArtifactReference(input);const ref={...input},m=validateManifest(JSON.parse((await read(`${ref.reference}/manifest`,5000,guard)).toString()),ref),chunks=[];
   for(let i=0;i<m.chunks.length;i++){
    const size=Math.min(chunkSize,m.bytes-i*chunkSize),bytes=await read(`${ref.reference}/${i}-${m.chunks[i]}`,size,guard);
    check(bytes.length===size&&digest(bytes)===m.chunks[i],'Discovery artifact chunk integrity failed');chunks.push(bytes);
   }
   const bytes=Buffer.concat(chunks);check(bytes.length===ref.bytes&&digest(bytes)===ref.sha256,'Discovery artifact whole-file integrity failed');
   const payload=JSON.parse(bytes.toString('utf8'));check(encode(payload).equals(bytes),'Discovery artifact JSON bytes are not exact');await guard();return payload;
  }
 };
}
