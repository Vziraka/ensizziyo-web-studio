import {createHash} from 'node:crypto';
import {check,hash} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';
import {projectAssetVersion,archiveProjectAsset,projectOriginalLimit} from './project-assets.mjs';

export const originalChunkSize=1_000_000;
export const originalDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function originalManifest(bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=projectOriginalLimit&&bytes.subarray(0,5).toString()==='%PDF-','Use a bounded PDF original');
 const chunks=[];for(let offset=0;offset<bytes.length;offset+=originalChunkSize)chunks.push(originalDigest(bytes.subarray(offset,offset+originalChunkSize)));
 return {format:'project-original-chunks-v1',sha256:originalDigest(bytes),bytes:bytes.length,chunk_size:originalChunkSize,chunks};
}
function validateManifest(m){
 check(m?.format==='project-original-chunks-v1'&&sha(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=projectOriginalLimit&&m.chunk_size===originalChunkSize&&Array.isArray(m.chunks)&&m.chunks.length===Math.ceil(m.bytes/originalChunkSize)&&m.chunks.every(sha),'Invalid bounded original manifest');
 return {format:m.format,sha256:m.sha256,bytes:m.bytes,chunk_size:m.chunk_size,chunks:[...m.chunks]};
}
function chunkLength(m,index){check(Number.isInteger(index)&&index>=0&&index<m.chunks.length,'Choose a registered original chunk');return Math.min(originalChunkSize,m.bytes-index*originalChunkSize);}
const chunkKey=(m,index)=>`project-originals/${m.sha256}/${index}-${m.chunks[index]}`;
const manifestKey=m=>`project-originals/${m.sha256}/manifest`;
async function stored(store,key){try{return await store.getWithMetadata(key,{type:'arrayBuffer',consistency:'strong'});}catch{throw Error('Shared original storage is unavailable; retain this exact transfer');}}
async function immutable(store,key,bytes){
 try{const result=await store.set(key,bytes,{onlyIfNew:true});check(typeof result?.modified==='boolean','Original storage acknowledgement is unavailable');if(result.modified)return;}catch{}
 const saved=await stored(store,key);
 check(saved&&Buffer.from(saved.data).equals(bytes),'Original storage outcome is uncertain; retry the same exact transfer');
}
export function blobProjectOriginalStore(store){
 return {
  async manifest(original){
   check(sha(original.sha256),'Invalid original hash');const saved=await stored(store,manifestKey(original));
   check(saved,'Verified shared original is unavailable');let data;try{data=JSON.parse(Buffer.from(saved.data).toString());}catch{throw Error('Shared original manifest is corrupt');}
   const m=validateManifest(data);check(m.sha256===original.sha256&&m.bytes===original.bytes,'Shared original manifest differs from the verified version');return m;
  },
  async chunk(manifest,index){const m=validateManifest(manifest),length=chunkLength(m,index),saved=await stored(store,chunkKey(m,index));check(saved,'Original chunk is missing; keep this transfer incomplete');const bytes=Buffer.from(saved.data);check(bytes.length===length&&originalDigest(bytes)===m.chunks[index],'Original chunk integrity changed');return bytes;},
  async putChunk(manifest,index,bytes){const m=validateManifest(manifest);check(Buffer.isBuffer(bytes)&&bytes.length===chunkLength(m,index)&&originalDigest(bytes)===m.chunks[index],'Original chunk differs from the exact reservation');await immutable(store,chunkKey(m,index),bytes);},
  async publish(manifest){const m=validateManifest(manifest);await immutable(store,manifestKey(m),Buffer.from(JSON.stringify(m)));},
  async put(bytes){const m=originalManifest(bytes);for(let index=0;index<m.chunks.length;index++)await this.putChunk(m,index,bytes.subarray(index*originalChunkSize,(index+1)*originalChunkSize));await this.publish(m);},
  async get(original){const m=await this.manifest(original),chunks=[];for(let index=0;index<m.chunks.length;index++)chunks.push(await this.chunk(m,index));const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256&&bytes.subarray(0,5).toString()==='%PDF-','Original whole-file integrity changed');return bytes;}
 };
}
function target(state,input){return projectAssetVersion(state,input.project_id,input.asset_id,input.version_id);}
function baseContext(state,input){const copy=structuredClone(state),version=target(copy,input);if(version.original_transfer?.had_original===false)delete version.verified_original;delete version.original_transfer;return projectContext(copy,input.project_id).context_sha256;}
function currentTransfer(state,input){
 const version=target(state,input),transfer=version.original_transfer;
 check(transfer&&transfer.id===input.transfer_id&&transfer.source.reference===version.reference,'Choose the exact registered original transfer');
 check(baseContext(state,input)===transfer.context_sha256,'Project context changed; refresh and reserve the exact transfer again');return {version,transfer};
}
export async function reserveSharedOriginal(app,input,actor){
 check(['owner','friend'].includes(actor),'Original transfer needs a signed operator');const manifest=validateManifest(input.manifest),source=input.source;
 check(source&&typeof source.name==='string'&&source.name.trim().length>0&&source.name.length<=200&&source.mime_type==='application/pdf'&&typeof source.modified_time==='string'&&source.modified_time.length<=50&&Number.isFinite(Date.parse(source.modified_time))&&(source.account==null||typeof source.account==='string'&&source.account.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.account)),'Original source metadata is incomplete');
 const normalized={reference:source.reference,name:source.name,mime_type:'application/pdf',modified_time:source.modified_time,account:source.account??null},id=hash({project_id:input.project_id,asset_id:input.asset_id,version_id:input.version_id,manifest,source:normalized});
 return app.change(state=>{
  const version=target(state,input),prior=version.original_transfer;
  check(version.reference===normalized.reference,'Original source does not match this registered version');
  check(!version.verified_original||version.verified_original.sha256===manifest.sha256&&version.verified_original.bytes===manifest.bytes,'This version already has different original bytes; register a new version');
  if(version.verified_original)check(hash(normalized)===hash(Object.fromEntries(Object.keys(normalized).map(k=>[k,version.verified_original[k]??null]))),'Retain the verified original source provenance');
  check(!prior||prior.id===id,'This version has a different reserved original; register a new version');
  const context=baseContext(state,input);
  if(prior&&context===prior.context_sha256)return prior;
  check(projectContext(state,input.project_id).context_sha256===input.context_sha256,'Project context changed; reload before reserving');
  const transfer={id,manifest,source:normalized,had_original:prior?.had_original??Boolean(version.verified_original),context_sha256:context,reserved_by:actor,reserved_at:app.now().toISOString()};
  version.original_transfer=transfer;projectContext(state,input.project_id);state.revision++;state.updated_at=transfer.reserved_at;return transfer;
 });
}
export async function uploadSharedOriginalChunk(app,store,input,index,bytes){const {transfer}=currentTransfer(await app.snapshot(),input);await store.putChunk(transfer.manifest,index,bytes);return {transfer_id:transfer.id,index,sha256:transfer.manifest.chunks[index]};}
export async function completeSharedOriginal(app,store,input,actor){
 check(['owner','friend'].includes(actor),'Original transfer needs a signed operator');
 const state=await app.snapshot(),{version,transfer}=currentTransfer(state,input),m=transfer.manifest,chunks=[];
 for(let index=0;index<m.chunks.length;index++)chunks.push(await store.chunk(m,index));
 const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256&&bytes.subarray(0,5).toString()==='%PDF-','Original whole-file hash or PDF type differs; keep this transfer incomplete');
 // Immutable files may survive a lost CAS race; only the shared version record grants retrieval.
 await store.publish(m);
 if(version.verified_original){await app.change(current=>{currentTransfer(current,input);});return version.verified_original;}
 app.originalStore={...store,async put(candidate){check(candidate.equals(bytes),'Original bytes changed before publication');}};
 return archiveProjectAsset(app,{...input,context_sha256:projectContext(state,input.project_id).context_sha256,expected_sha256:m.sha256},bytes,transfer.source,actor);
}
export async function sharedOriginalManifest(app,store,input){const version=target(await app.snapshot(),input),original=version.verified_original;check(original&&original.reference===version.reference,'Original is not verified; complete the exact transfer first');return {original,manifest:await store.manifest(original)};}
export async function readSharedOriginalChunk(app,store,input,index){const packet=await sharedOriginalManifest(app,store,input);return {bytes:await store.chunk(packet.manifest,index),sha256:packet.manifest.chunks[index]};}
export async function originalChunkRequest(request){
 check(request.headers.get('content-type')==='application/octet-stream','Supply original chunk bytes');const reader=request.body?.getReader();check(reader,'Supply original chunk bytes');let total=0;const chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;check(total<=originalChunkSize,'Original chunk exceeds 1 MB');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
