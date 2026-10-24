import {check,hash} from './lifecycle.mjs';
import {originalChunkSize,originalDigest,blobProjectOriginalStore} from './shared-project-originals.mjs';
import {beginContinuation,renderContinuation,readContinuation,completeContinuation,retainContinuationRasters} from './project-continuation.mjs';
import {readAuthoringFile,resumeAuthoring,reviseAuthoring} from './project-authoring.mjs';
import {projectWorkContext} from './project-work.mjs';
import {nodePDFResources} from './project-authoring-node.mjs';
import {hostedBackupInventory} from './lifecycle-backup.mjs';
import {blobAudioStore} from './call-audio.mjs';

const jobID=v=>typeof v==='string'&&/^author-[a-f0-9]{32}$/.test(v),sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nameOK=v=>typeof v==='string'&&/^(context|input|authored|runtime|export|renderer-evidence)\.json$|^output\.pdf$|^(review-)?page-[1-9][0-9]?\.(json|png)$/.test(v);
const uploadOK=name=>['input.json','runtime.json'].includes(name)||/^review-page-([1-9]|1[0-6])\.png$/.test(name);
const limit=name=>name==='runtime.json'?36_000_000:name==='input.json'?4_000_000:name.startsWith('review-page-')?16_000_000:64_000_000;
export function authoringManifest(bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=64_000_000,'Invalid bounded authoring bytes');
 const chunks=[];for(let offset=0;offset<bytes.length;offset+=originalChunkSize)chunks.push(originalDigest(bytes.subarray(offset,offset+originalChunkSize)));
 return {format:'authoring-chunks-v1',sha256:originalDigest(bytes),bytes:bytes.length,chunk_size:originalChunkSize,chunks};
}
function manifest(value,max=64_000_000){check(value?.format==='authoring-chunks-v1'&&sha(value.sha256)&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=max&&value.chunk_size===originalChunkSize&&Array.isArray(value.chunks)&&value.chunks.length===Math.ceil(value.bytes/originalChunkSize)&&value.chunks.every(sha),'Invalid bounded authoring manifest');return {format:value.format,sha256:value.sha256,bytes:value.bytes,chunk_size:originalChunkSize,chunks:[...value.chunks]};}
function length(m,index){check(Number.isInteger(index)&&index>=0&&index<m.chunks.length,'Choose an exact authoring chunk');return Math.min(originalChunkSize,m.bytes-index*originalChunkSize);}
async function stored(raw,key){try{return await raw.getWithMetadata(key,{type:'arrayBuffer',consistency:'strong'});}catch{throw Error('Authoring storage unavailable; retain the exact job and transfer');}}
async function immutable(raw,key,bytes){
 try{const result=await raw.set(key,bytes,{onlyIfNew:true});check(typeof result?.modified==='boolean','Missing storage acknowledgement');if(result.modified)return;}catch{}
 const saved=await stored(raw,key);check(saved&&Buffer.from(saved.data).equals(bytes),'Authoring storage outcome differs or is uncertain; inspect this exact job before continuing');
}
// Chunk data is content addressed. The immutable job/name manifest alone grants file authority.
export function blobAuthoringStore(raw){
 const prefix=(id,name)=>{check(jobID(id)&&nameOK(name),'Unsafe authoring file identity');return `project-authored/${id}/${name}`;};
 const chunkKey=(m,i)=>`authoring-chunks/${m.sha256}/${i}-${m.chunks[i]}`;
 return {
  async manifest(id,name){const saved=await stored(raw,prefix(id,name)+'/manifest');return saved?manifest(JSON.parse(Buffer.from(saved.data))):null;},
  async chunk(m,index){m=manifest(m);const size=length(m,index),saved=await stored(raw,chunkKey(m,index));check(saved,'Missing authoring chunk; keep this dependency incomplete');const bytes=Buffer.from(saved.data);check(bytes.length===size&&originalDigest(bytes)===m.chunks[index],'Authoring chunk integrity changed');return bytes;},
  async putChunk(m,index,bytes){m=manifest(m);check(Buffer.isBuffer(bytes)&&bytes.length===length(m,index)&&originalDigest(bytes)===m.chunks[index],'Authoring chunk differs from the reserved manifest');await immutable(raw,chunkKey(m,index),bytes);},
  async reserve(id,name,m){m=manifest(m,limit(name));await immutable(raw,prefix(id,name)+'/candidate',Buffer.from(JSON.stringify(m)));return m;},
  async candidate(id,name){const saved=await stored(raw,prefix(id,name)+'/candidate');check(saved,'Reserve the exact authoring file first');return manifest(JSON.parse(Buffer.from(saved.data)),limit(name));},
  async publish(id,name,m){m=manifest(m);await immutable(raw,prefix(id,name)+'/manifest',Buffer.from(JSON.stringify(m)));},
  async get(id,name){if(jobID(id)&&['renderer.mjs','renderer.py'].includes(name))return null;const m=await this.manifest(id,name);if(!m)return null;const chunks=[];for(let i=0;i<m.chunks.length;i++)chunks.push(await this.chunk(m,i));const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256,'Authoring whole-file checksum changed');return bytes;},
  async put(id,name,bytes){const m=authoringManifest(bytes);for(let i=0;i<m.chunks.length;i++)await this.putChunk(m,i,bytes.subarray(i*originalChunkSize,(i+1)*originalChunkSize));await this.publish(id,name,m);}
 };
}
export function attachHostedAuthoring(app,raw){check(!app.store?.inertBinding&&app.config.mode==='controlled','Hosted authoring permits only the fictional controlled workspace');app.authoringStore=blobAuthoringStore(raw);app.originalStore=blobProjectOriginalStore(raw);return app;}
function locate(state,id){check(jobID(id),'Choose an exact authoring job');const results=Object.values(state.prospects).flatMap(r=>Object.values(r.project_work??{}).filter(w=>w.execution?.id===id).map(w=>({project_id:r.id,work_id:w.id,job_id:id,job:w.execution})));check(results.length===1,'Unknown current authoring job');return results[0];}
function writable(state,id,name,actor){
 check(uploadOK(name),'Upload only submitted source, registered runtime or actual raster pages');const input=locate(state,id),work=state.prospects[input.project_id].project_work[input.work_id],packet=projectWorkContext(state,input.project_id,input.work_id);
 check(work.status==='Ready'&&work.assigned_to===actor&&input.job.actor===actor&&packet.context_sha256===input.job.context_sha256&&!work.context_hold,'Authoring context or operator changed; hold this transfer');
 check(name.startsWith('review-page-')?input.job.status==='Rendered'&&input.job.renderer==='node-pdf-v1'&&Number(/\d+/.exec(name)[0])<=input.job.pages.length:input.job.status==='Claimed','This job no longer accepts that dependency');return input;
}
export async function hostedAuthoringTransfer(app,id,name,operation,input,actor,index,bytes){
 writable(await app.snapshot(),id,name,actor);const store=app.authoringStore;
 if(operation==='reserve')return store.reserve(id,name,manifest(input.manifest,limit(name)));
 const m=await store.candidate(id,name);check(input.transfer_id===hash(m),'Use the exact reserved authoring transfer');
 if(operation==='chunk'){await store.putChunk(m,index,bytes);return {index,sha256:m.chunks[index]};}
 check(operation==='complete','Use the bounded authoring transfer operation');const chunks=[];for(let i=0;i<m.chunks.length;i++)chunks.push(await store.chunk(m,i));const data=Buffer.concat(chunks);check(originalDigest(data)===m.sha256,'Incomplete authoring dependency');
 if(name==='input.json'){const source=JSON.parse(data);check(source.context_sha256===locate(await app.snapshot(),id).job.context_sha256&&Buffer.from(JSON.stringify(source,null,2)).equals(data),'Source must be canonical JSON bound to this job');}
 if(name==='runtime.json'){const runtime=JSON.parse(data);nodePDFResources(runtime,locate(await app.snapshot(),id).project_id);check(Buffer.from(JSON.stringify(runtime,null,2)).equals(data),'Runtime must be canonical JSON');}
 // Retained files may survive a later context change; output publication still requires lifecycle CAS.
 writable(await app.snapshot(),id,name,actor);await store.publish(id,name,m);return m;
}
export async function hostedAuthoringCommand(app,operation,input,actor){
 if(operation==='begin'){const result=await beginContinuation(app,input,actor);for(const original of result.originals)if(original.editable_source?.source){delete original.editable_source.source;original.editable_source.retrieval='Download the exact authored.json through this signed authoring caller';}return result;}
 const id=input.job_id,ids=locate(await app.snapshot(),id);
 if(operation==='inspect')return readContinuation(app,id,actor);
 if(operation==='render'){const source=JSON.parse(await readAuthoringFile(app,id,'input.json')),runtime=JSON.parse(await readAuthoringFile(app,id,'runtime.json',36_000_000));return renderContinuation(app,id,source,runtime,actor);}
 if(operation==='resume')return resumeAuthoring(app,ids,actor);
 if(operation==='revise')return reviseAuthoring(app,{...ids,reason:input.reason},actor);
 if(operation==='rasters'){const job=ids.job;check(job.pages?.length,'Render the exact PDF first');const pages=[];for(let i=0;i<job.pages.length;i++)pages.push(await readAuthoringFile(app,id,`review-page-${i+1}.png`,16_000_000));return retainContinuationRasters(app,id,{pdf_sha256:input.pdf_sha256,rasterizer:input.rasterizer,pages},actor);}
 if(operation==='complete')return completeContinuation(app,id,input.review,actor);
 throw Error('Use the existing begin/render/inspect/resume/rasters/complete/revise caller');
}
export async function hostedAuthoringFile(app,id,name,index){
 // Both signed operators can read current and retained attempts, only within registered workspace history.
 const state=await app.snapshot();check(Object.values(state.prospects).some(r=>Object.values(r.project_work??{}).some(function history(w){return w.execution?.id===id||w.authoring_history?.some(j=>j.id===id)||w.history?.some(history);})),'Unknown registered authoring history');
 check(nameOK(name),'Choose an exact retained authoring file');const m=await app.authoringStore.manifest(id,name);check(m,'Authoring dependency is incomplete');return index===undefined?m:{bytes:await app.authoringStore.chunk(m,index),sha256:m.chunks[index]};
}
export async function hostedAuthoringBackup(app,raw){
 const result=await hostedBackupInventory(app,blobAudioStore(raw)),body=JSON.stringify(result.state),files=[...result.files].map(([path,bytes])=>({path,bytes:bytes.length,sha256:originalDigest(bytes)}));
 const bundle={schema_version:2,created_at:result.state.updated_at,sha256:hash(body),body,files,files_sha256:hash(files)};
 check(Buffer.byteLength(JSON.stringify(bundle))<=4_000_000,'Hosted backup manifest exceeds this fictional workspace response bound');return {bundle,files:result.files};
}
