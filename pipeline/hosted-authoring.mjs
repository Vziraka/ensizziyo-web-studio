import {reconcileGeneration} from './refinement-generation.mjs';
import {supportsProjectAuthoring} from './shared-project-continuation.mjs';
import {check,hash} from './lifecycle.mjs';
import {originalChunkSize,originalDigest,blobProjectOriginalStore} from './shared-project-originals.mjs';
import {beginContinuation,renderContinuation,readContinuation,completeContinuation,retainContinuationRasters} from './project-continuation.mjs';
import {readAuthoringFile,resumeAuthoring,reviseAuthoring} from './project-authoring.mjs';
import {projectWorkContext} from './project-work.mjs';
import {nodePDFResources} from './project-authoring-node.mjs';
import {hostedBackupInventory} from './lifecycle-backup.mjs';
import {blobAudioStore} from './call-audio.mjs';
import {recoveryNames,recoveryName,validateAuthoringRecovery} from './authoring-recovery.mjs';

const jobID=v=>typeof v==='string'&&/^author-[a-f0-9]{32}$/.test(v),sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nameOK=v=>typeof v==='string'&&(/^(context|input|authored|runtime|export|renderer-evidence)\.json$|^output\.pdf$|^(review-)?page-[1-9][0-9]?\.(json|png)$/.test(v)||recoveryName.test(v));
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
  async evidence(id){
   const files=[],bytes=new Map();let total=0;
   for(const name of recoveryNames){
    const f={name,published:null,candidate:null};
    for(const [authority,key] of [['published','manifest'],['candidate','candidate']]){
     const saved=await stored(raw,prefix(id,name)+'/'+key);if(!saved)continue;
     const m=manifest(JSON.parse(Buffer.from(saved.data)),limit(name)),chunks=[];let complete=true,corrupt=false;const data=[];
     for(let i=0;i<m.chunks.length;i++){
      const saved=await stored(raw,chunkKey(m,i)),c={index:i,expected_sha256:m.chunks[i]};
      if(!saved){c.disposition='absent-at-observation';complete=false;}else{
       const b=Buffer.from(saved.data);check(b.length>0&&b.length<=originalChunkSize,'Oversized recovery evidence');const valid=b.length===length(m,i)&&originalDigest(b)===m.chunks[i];
       Object.assign(c,{disposition:valid?'available':'corrupt-at-observation',sha256:originalDigest(b),bytes:b.length,evidence:`recovery-${originalDigest(b)}.bin`});if(!bytes.has(c.evidence)){total+=b.length;check(total<=512_000_000,'Recovery evidence exceeds the existing backup bound');bytes.set(c.evidence,b);}data.push(b);if(!valid)corrupt=true;
      }chunks.push(c);
     }
     if(complete&&!corrupt&&originalDigest(Buffer.concat(data))!==m.sha256)corrupt=true;
     f[authority]={manifest:m,chunks,disposition:corrupt?'corrupt':complete?'available':'partial'};
    }files.push(f);
   }return {files,bytes};
  },
  async publish(id,name,m){m=manifest(m);await immutable(raw,prefix(id,name)+'/manifest',Buffer.from(JSON.stringify(m)));},
  async get(id,name){if(jobID(id)&&['renderer.mjs','renderer.py'].includes(name))return null;const m=await this.manifest(id,name);if(!m)return null;const chunks=[];for(let i=0;i<m.chunks.length;i++)chunks.push(await this.chunk(m,i));const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256,'Authoring whole-file checksum changed');return bytes;},
  async put(id,name,bytes){const m=authoringManifest(bytes);for(let i=0;i<m.chunks.length;i++)await this.putChunk(m,i,bytes.subarray(i*originalChunkSize,(i+1)*originalChunkSize));await this.publish(id,name,m);}
 };
}
export function attachHostedAuthoring(app,raw){check(!app.store?.inertBinding&&!app.store?.manualBinding&&(app.config.mode==='controlled'||supportsProjectAuthoring(app)),'Hosted authoring requires the fictional controlled workspace or an exact shared project binding');app.authoringStore=blobAuthoringStore(raw);app.originalStore=blobProjectOriginalStore(raw);return app;}
function locate(state,id){check(jobID(id),'Choose an exact authoring job');const results=Object.values(state.prospects).flatMap(r=>Object.values(r.project_work??{}).filter(w=>w.execution?.id===id).map(w=>({project_id:r.id,work_id:w.id,job_id:id,job:w.execution})));check(results.length===1,'Unknown current authoring job');return results[0];}
export function registeredAuthoring(state,id){
 check(jobID(id),'Choose an exact authoring job');const found=[];
 function visit(w){if(w.execution?.id===id)found.push(w.execution);for(const j of w.authoring_history??[])if(j.id===id)found.push(j);for(const prior of w.history??[])visit(prior);}
 for(const r of Object.values(state.prospects))for(const w of Object.values(r.project_work??{}))visit(w);
 check(found.length===1,'Unknown or ambiguous registered authoring job');return found[0];
}
async function recoveryObservation(app,id){const state=await app.snapshot(),job=registeredAuthoring(state,id);check(job.status!=='Review','Published authoring cannot be reconciled');if(job.status==='Reconciled')return {state,job,files:job.recovery.files,snapshot:job.recovery.snapshot};const evidence=await app.authoringStore.evidence(id);return {state,job,...evidence,snapshot:hash({state,job_id:id,files:evidence.files})};}
async function reconcile(app,input,actor){
 check(Object.keys(input).every(k=>['job_id','snapshot','reason','disposition'].includes(k))&&input.disposition==='close-publication'&&typeof input.reason==='string'&&input.reason.trim()&&input.reason.length<=1600,'Explicitly close publication with a reason; renderer stop cannot be attested');
 const observed=await recoveryObservation(app,input.job_id),{job}=observed;
 check(job.actor===actor,'Only the preparing operator may reconcile this attempt');
 if(job.status==='Reconciled'){check(job.recovery.snapshot===input.snapshot&&job.recovery.reason===input.reason,'Reconciliation retry differs; inspect retained recovery');return job;}
 check(['Claimed','Rendering','Rendered','Held'].includes(job.status)&&observed.snapshot===input.snapshot,'Recovery snapshot changed; inspect exact dependencies again');
 const recovery={schema_version:1,disposition:'close-publication',snapshot:input.snapshot,reason:input.reason,actor,at:app.now().toISOString(),prior_status:job.status,execution:'not-attested-stopped',export_usable:false,observation:'Exact available bytes at per-dependency observation; absent or late in-flight writes remain uncertain and grant no file/export authority.',files:observed.files};
 const result={...job,status:'Reconciled',recovery};await validateAuthoringRecovery(result,async(name)=>observed.bytes.get(name));
 // Content-addressed evidence may survive a failed CAS. It grants no authority until the state commit.
 for(const [name,bytes] of observed.bytes)await app.authoringStore.put(job.id,name,bytes);
 // Evidence persistence can advance the clock; closure keeps the captured transaction timestamp.
 return app.change(s=>{check(hash(s)===hash(observed.state),'Recovery snapshot changed before closure; inspect again');const current=registeredAuthoring(s,job.id);check(hash(current)===hash(job),'Authoring ownership changed');Object.assign(current,result);reconcileGeneration(s,job,recovery.at);s.revision++;s.updated_at=recovery.at;return current;},{projectReconcile:{job,result,snapshot:input.snapshot,actor}});
}
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
 if(operation==='recovery'){const v=await recoveryObservation(app,input.job_id);return {job_id:v.job.id,status:v.job.status,snapshot:v.snapshot,files:v.files,recovery:v.job.recovery??null};}
 if(operation==='reconcile')return reconcile(app,input,actor);
 const id=input.job_id,ids=locate(await app.snapshot(),id);
 if(operation==='inspect')return readContinuation(app,id,actor);
 if(operation==='render'){const source=JSON.parse(await readAuthoringFile(app,id,'input.json')),runtime=JSON.parse(await readAuthoringFile(app,id,'runtime.json',36_000_000));return renderContinuation(app,id,source,runtime,actor);}
 if(operation==='resume')return resumeAuthoring(app,ids,actor);
 if(operation==='revise')return reviseAuthoring(app,{...ids,reason:input.reason},actor);
 if(operation==='rasters'){const job=ids.job;check(job.pages?.length,'Render the exact PDF first');const pages=[];for(let i=0;i<job.pages.length;i++)pages.push(await readAuthoringFile(app,id,`review-page-${i+1}.png`,16_000_000));return retainContinuationRasters(app,id,{pdf_sha256:input.pdf_sha256,rasterizer:input.rasterizer,pages},actor);}
 if(operation==='complete')return completeContinuation(app,id,input.review,actor);
 throw Error('Use the existing begin/render/inspect/resume/rasters/complete/revise/recovery/reconcile caller');
}
export async function hostedAuthoringFile(app,id,name,index){
 // Both signed operators can read current and retained attempts, only within registered workspace history.
 const state=await app.snapshot();check(Object.values(state.prospects).some(r=>Object.values(r.project_work??{}).some(function history(w){return w.execution?.id===id||w.authoring_history?.some(j=>j.id===id)||w.history?.some(history);})),'Unknown registered authoring history');
 check(nameOK(name),'Choose an exact retained authoring file');const m=await app.authoringStore.manifest(id,name);check(m,'Authoring dependency is incomplete');return index===undefined?m:{bytes:await app.authoringStore.chunk(m,index),sha256:m.chunks[index]};
}
export async function hostedAuthoringBackup(app,raw){
 const result=await hostedBackupInventory(app,blobAudioStore(raw)),body=JSON.stringify(result.state),files=[...result.files].map(([path,bytes])=>({path,bytes:bytes.length,sha256:originalDigest(bytes)}));
 const bundle={schema_version:2,created_at:result.state.updated_at,sha256:hash(body),body,files,files_sha256:hash(files)};
 const bytes=Buffer.from(body),wire=bytes.length<=3_000_000?bundle:{...bundle,body:undefined,body_manifest:authoringManifest(bytes)};
 check(Buffer.byteLength(JSON.stringify(wire))<=4_000_000,'Hosted backup manifest exceeds the bounded response limit');return {bundle,wire,body:bytes,files:result.files};
}
