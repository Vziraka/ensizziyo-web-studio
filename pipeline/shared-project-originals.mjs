import {createHash} from 'node:crypto';
import {check,hash} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';
import {projectAssetVersion,archiveProjectAsset,projectOriginalLimit} from './project-assets.mjs';
import {originalEvidenceDeclaration,originalEvidencePath,originalEvidencePattern,originalRecoveryTarget,originalUnobserved,originalObservationHash,originalPrior,validateOriginalRecovery} from './original-recovery.mjs';

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
  async evidence(declaration){
   check(sha(declaration.sha256)&&Number.isSafeInteger(declaration.bytes)&&declaration.bytes>0&&declaration.bytes<=projectOriginalLimit&&Array.isArray(declaration.chunks)&&declaration.chunks.length<=Math.ceil(declaration.bytes/originalChunkSize)&&declaration.chunks.every(sha),'Invalid bounded original observations');
   const chunks=[],bytes=new Map();
   for(const [index,expected_sha256] of declaration.chunks.entries()){
    const c={index,expected_sha256,expected_bytes:Math.min(originalChunkSize,declaration.bytes-index*originalChunkSize)};let saved;
    try{saved=await stored(store,chunkKey(declaration,index));}catch{chunks.push({...c,disposition:'read-unavailable/uncertain'});continue;}
    if(!saved){chunks.push({...c,disposition:'absent-at-observation'});continue;}
    check(saved.data?.byteLength>0&&saved.data.byteLength<=originalChunkSize,'Original recovery evidence exceeds the bounded chunk size; keep recovery held');
    const b=Buffer.from(saved.data),sha256=originalDigest(b),evidence=originalEvidencePath(sha256);
    chunks.push({...c,disposition:b.length===c.expected_bytes&&sha256===expected_sha256?'available':'corrupt-at-observation',sha256,bytes:b.length,evidence});bytes.set(evidence,b);
   }
   return {chunks,bytes};
  },
  async putEvidence(path,bytes){check(originalEvidencePattern.test(path)&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=originalChunkSize&&path===originalEvidencePath(originalDigest(bytes)),'Invalid inert original evidence');await immutable(store,path,bytes);},
  async getEvidence(path){check(originalEvidencePattern.test(path),'Choose exact inert original evidence');const saved=await stored(store,path);check(saved&&saved.data?.byteLength>0&&saved.data.byteLength<=originalChunkSize,'Original recovery evidence is missing or oversized');const bytes=Buffer.from(saved.data);check(path===originalEvidencePath(originalDigest(bytes)),'Original recovery evidence changed');return bytes;},
  async manifest(original){
   check(sha(original.sha256),'Invalid original hash');const saved=await stored(store,manifestKey(original));
   check(saved,'Verified shared original is unavailable');let data;try{data=JSON.parse(Buffer.from(saved.data).toString());}catch{throw Error('Shared original manifest is corrupt');}
   const m=validateManifest(data);check(m.sha256===original.sha256&&m.bytes===original.bytes,'Shared original manifest differs from the verified version');return m;
  },
  async chunk(manifest,index){const m=validateManifest(manifest),length=chunkLength(m,index),saved=await stored(store,chunkKey(m,index));check(saved,'Original chunk is missing; keep this transfer incomplete');const bytes=Buffer.from(saved.data);check(bytes.length===length&&originalDigest(bytes)===m.chunks[index],'Original chunk integrity changed');return bytes;},
  async candidate(original,index,digest){
   check(sha(original.sha256)&&sha(digest)&&Number.isSafeInteger(original.bytes)&&original.bytes>0&&original.bytes<=projectOriginalLimit&&Number.isInteger(index)&&index>=0&&index<Math.ceil(original.bytes/originalChunkSize),'Choose an exact bounded original candidate');
   const saved=await stored(store,`project-originals/${original.sha256}/${index}-${digest}`);check(saved,'Original chunk is missing; keep this transfer incomplete');const bytes=Buffer.from(saved.data);check(bytes.length===Math.min(originalChunkSize,original.bytes-index*originalChunkSize)&&originalDigest(bytes)===digest,'Original chunk integrity changed');return bytes;
  },
  async stageChunk(original,index,bytes){
   check(sha(original.sha256)&&Number.isSafeInteger(original.bytes)&&original.bytes>0&&original.bytes<=projectOriginalLimit&&Number.isInteger(index)&&index>=0&&index<Math.ceil(original.bytes/originalChunkSize)&&Buffer.isBuffer(bytes)&&bytes.length===Math.min(originalChunkSize,original.bytes-index*originalChunkSize),'Invalid bounded original candidate chunk');
   const digest=originalDigest(bytes);await immutable(store,`project-originals/${original.sha256}/${index}-${digest}`,bytes);return digest;
  },
  async putChunk(manifest,index,bytes){const m=validateManifest(manifest);check(Buffer.isBuffer(bytes)&&bytes.length===chunkLength(m,index)&&originalDigest(bytes)===m.chunks[index],'Original chunk differs from the exact reservation');await immutable(store,chunkKey(m,index),bytes);},
  async publish(manifest){const m=validateManifest(manifest);await immutable(store,manifestKey(m),Buffer.from(JSON.stringify(m)));},
  async put(bytes){const m=originalManifest(bytes);for(let index=0;index<m.chunks.length;index++)await this.putChunk(m,index,bytes.subarray(index*originalChunkSize,(index+1)*originalChunkSize));await this.publish(m);},
  async get(original){const m=await this.manifest(original),chunks=[];for(let index=0;index<m.chunks.length;index++)chunks.push(await this.chunk(m,index));const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256&&bytes.subarray(0,5).toString()==='%PDF-','Original whole-file integrity changed');return bytes;}
 };
}
function target(state,input){return projectAssetVersion(state,input.project_id,input.asset_id,input.version_id);}
export function originalBaseContext(state,input){const copy=structuredClone(state),version=target(copy,input);if(version.original_transfer?.had_original===false)delete version.verified_original;delete version.original_transfer;return projectContext(copy,input.project_id).context_sha256;}
function currentTransfer(state,input){
 const version=target(state,input),transfer=version.original_transfer;
 check(transfer&&transfer.id===input.transfer_id&&transfer.source.reference===version.reference,'Choose the exact registered original transfer');
 check(!transfer.recovery,'Original publication is closed; inspect retained recovery evidence');
 check(originalBaseContext(state,input)===transfer.context_sha256,'Project context changed; refresh and reserve the exact transfer again');return {version,transfer};
}
export async function reserveSharedOriginal(app,input,actor){
 check(['owner','friend'].includes(actor),'Original transfer needs a signed operator');const manifest=validateManifest(input.manifest),source=input.source;
 check(source&&typeof source.name==='string'&&source.name.trim().length>0&&source.name.length<=200&&source.mime_type==='application/pdf'&&typeof source.modified_time==='string'&&source.modified_time.length<=50&&Number.isFinite(Date.parse(source.modified_time))&&(source.account==null||typeof source.account==='string'&&source.account.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.account)),'Original source metadata is incomplete');
 const normalized={reference:source.reference,name:source.name,mime_type:'application/pdf',modified_time:source.modified_time,account:source.account??null},id=hash({project_id:input.project_id,asset_id:input.asset_id,version_id:input.version_id,manifest,source:normalized});
 return app.change(state=>{
  const version=target(state,input),prior=version.original_transfer;
  check(!prior?.recovery,'Original publication is closed; retain its recovery and register any new version separately');
  check(version.reference===normalized.reference,'Original source does not match this registered version');
  check(!version.verified_original||version.verified_original.sha256===manifest.sha256&&version.verified_original.bytes===manifest.bytes,'This version already has different original bytes; register a new version');
  if(version.verified_original)check(hash(normalized)===hash(Object.fromEntries(Object.keys(normalized).map(k=>[k,version.verified_original[k]??null]))),'Retain the verified original source provenance');
  check(!prior||prior.id===id,'This version has a different reserved original; register a new version');
  const context=originalBaseContext(state,input);
  if(prior&&context===prior.context_sha256)return prior;
  check(projectContext(state,input.project_id).context_sha256===input.context_sha256,'Project context changed; reload before reserving');
  const transfer={id,manifest,source:normalized,had_original:prior?.had_original??Boolean(version.verified_original),context_sha256:context,reserved_by:actor,reserved_at:app.now().toISOString()};
  version.original_transfer=transfer;projectContext(state,input.project_id);state.revision++;state.updated_at=transfer.reserved_at;return transfer;
 });
}
export async function uploadSharedOriginalChunk(app,store,input,index,bytes){const {transfer}=currentTransfer(await app.snapshot(),input);await store.putChunk(transfer.manifest,index,bytes);return {transfer_id:transfer.id,index,sha256:transfer.manifest.chunks[index]};}
export async function completeSharedOriginal(app,store,input,actor,{assertCurrent=async()=>{}}={}){
 check(['owner','friend'].includes(actor),'Original transfer needs a signed operator');
 await assertCurrent();const state=await app.snapshot(),{version,transfer}=currentTransfer(state,input),m=transfer.manifest,chunks=[];
 for(let index=0;index<m.chunks.length;index++){await assertCurrent();chunks.push(await store.chunk(m,index));await assertCurrent();}
 const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256&&bytes.subarray(0,5).toString()==='%PDF-','Original whole-file hash or PDF type differs; keep this transfer incomplete');
 // Immutable files may survive a lost CAS race; only the shared version record grants retrieval.
 await assertCurrent();await store.publish(m);await assertCurrent();
 if(version.verified_original){await app.change(current=>{currentTransfer(current,input);});return version.verified_original;}
 app.originalStore={...store,async put(candidate){check(candidate.equals(bytes),'Original bytes changed before publication');}};
 return archiveProjectAsset(app,{...input,context_sha256:projectContext(state,input.project_id).context_sha256,expected_sha256:m.sha256},bytes,transfer.source,actor);
}
export async function sharedOriginalManifest(app,store,input){const version=target(await app.snapshot(),input),original=version.verified_original;check(original&&original.reference===version.reference,'Original is not verified; complete the exact transfer first');return {original,manifest:await store.manifest(original)};}
export async function readSharedOriginalChunk(app,store,input,index){const packet=await sharedOriginalManifest(app,store,input);return {bytes:await store.chunk(packet.manifest,index),sha256:packet.manifest.chunks[index]};}

function recoveryRecord(state,ids,input,resolveDriveTarget){
 check(['manual','drive'].includes(input.kind)&&sha(input.transfer_id),'Choose an exact manual or Drive receipt');
 const selected=originalRecoveryTarget(state,ids),version=target(state,ids),record=input.kind==='manual'?version.original_transfer:state.drive_original_reads?.[input.transfer_id];
 check(record?.id===input.transfer_id,'Choose the exact registered original recovery receipt');
 if(input.kind==='manual'){
  check(record.source?.reference===selected.reference,'Original transfer reference changed');
  const {reference,...targetIds}=selected;check(record.id===hash({...targetIds,manifest:record.manifest,source:record.source}),'Original transfer target differs from its reserving project');
 }
 else{
  const bound=record.recovery?.observation.target??record.target??resolveDriveTarget?.(state,ids,record);
  check(bound&&hash(bound)===hash(selected),'Drive receipt has no exact registered recovery target; keep backup held');
 }
 return {record,selected};
}
function recoveryInput(input,names){check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>names.includes(k)),'Unsupported original recovery fields');}
async function originalObservation(app,store,ids,input,{resolveDriveTarget,observed_at=app.now().toISOString()}={}){
 const state=await app.snapshot(),config=app.store?await app.store.config():app.config,{record,selected}=recoveryRecord(state,ids,input,resolveDriveTarget);
 check(projectContext(state,ids.project_id).context_sha256===input.context_sha256,'Project context changed; inspect original recovery again');
 if(record.recovery)return {observation:record.recovery.observation,recovery:record.recovery,record};
 check(input.kind==='manual'||['Reading','Ready','Held'].includes(record.status),'Verified Drive original needs no partial recovery');
 const started=Date.parse(observed_at);check(Number.isFinite(started)&&+app.now()>=started&&+app.now()<started+45_000,'Original recovery observation expired; inspect again');
 const prior=originalPrior(input.kind,record),declaration=originalEvidenceDeclaration(input.kind,prior),evidence=await store.evidence(declaration);
 const observation={schema_version:1,kind:input.kind,transfer_id:record.id,target:selected,revision:state.revision,state_sha256:hash(state),config_sha256:hash(config),context_sha256:input.context_sha256,prior_sha256:hash(prior),claim_sha256:input.kind==='drive'?hash({claim:record.claim,lease_until:record.lease_until}):null,observed_at,chunks:evidence.chunks,unobserved:originalUnobserved(declaration)};
 observation.snapshot=originalObservationHash(observation);
 check(hash(await app.snapshot())===hash(state)&&hash(app.store?await app.store.config():app.config)===hash(config)&&+app.now()<started+45_000,'Original recovery state or clock changed during observation; inspect again');
 return {state,record,observation,bytes:evidence.bytes};
}
export async function observeOriginalRecovery(app,store,ids,input,actor,options={}){
 check(['owner','friend'].includes(actor),'Original recovery needs a signed operator');recoveryInput(input,['kind','transfer_id','context_sha256']);
 const {observation,recovery}=await originalObservation(app,store,ids,input,options);return {...observation,...(recovery?{recovery}:{})};
}
export async function reconcileOriginalRecovery(app,store,ids,input,actor,options={}){
 check(['owner','friend'].includes(actor),'Original recovery needs a signed operator');recoveryInput(input,['kind','transfer_id','context_sha256','snapshot','observed_at','reason','disposition']);
 check(input.disposition==='close-publication'&&typeof input.reason==='string'&&input.reason.trim()&&input.reason.length<=1600&&sha(input.snapshot),'Explicitly close original publication with the exact observation and a reason');
 const first=await app.snapshot(),{record}=recoveryRecord(first,ids,input,options.resolveDriveTarget);
 if(record.recovery){const r=record.recovery,o=r.observation;check(o.snapshot===input.snapshot&&o.context_sha256===input.context_sha256&&o.observed_at===input.observed_at&&r.reason===input.reason,'Original reconciliation retry differs; inspect retained recovery');return r;}
 const at=app.now().toISOString(),observed=await originalObservation(app,store,ids,input,{...options,observed_at:input.observed_at});
 check(!observed.recovery&&observed.observation.snapshot===input.snapshot,'Original recovery observation changed; inspect exact chunks again');
 const event_id='original-recovery-'+hash({kind:input.kind,target:observed.observation.target,snapshot:input.snapshot}).slice(0,32),prior=originalPrior(input.kind,observed.record);
 const recovery={schema_version:1,disposition:'close-publication',reason:input.reason,actor,at,prior_status:input.kind==='drive'?prior.status:'Reserved',execution:'not-attested-stopped',export_usable:false,observation:observed.observation,prior,event_id};
 const proposed=structuredClone(observed.state),closed=recoveryRecord(proposed,ids,input,options.resolveDriveTarget).record;
 closed.recovery=recovery;if(input.kind==='drive')closed.status='Reconciled';
 check(Object.keys(proposed.events).length<20_000&&!proposed.events[event_id],'Original recovery event limit or conflict');
 proposed.events[event_id]={id:event_id,type:'asset_original_reconciled',prospect_id:ids.project_id,actor,at,data:{kind:input.kind,transfer_id:input.transfer_id,target:observed.observation.target,snapshot:input.snapshot,prior_status:recovery.prior_status,reason:input.reason,execution:recovery.execution,export_usable:false}};
 proposed.revision++;proposed.updated_at=at;
 await validateOriginalRecovery(proposed,input.kind,closed,path=>observed.bytes.get(path));
 // Immutable evidence can survive a lost CAS; it grants no original authority.
 for(const [path,bytes] of observed.bytes)await store.putEvidence(path,bytes);
 return app.change(state=>{check(hash(state)===hash(observed.state)&&+app.now()<Date.parse(input.observed_at)+45_000,'Original recovery state or clock changed before closure; inspect again');Object.assign(state,proposed);return recovery;},{configFingerprint:observed.observation.config_sha256});
}
export async function originalChunkRequest(request){
 check(request.headers.get('content-type')==='application/octet-stream','Supply original chunk bytes');const reader=request.body?.getReader();check(reader,'Supply original chunk bytes');let total=0;const chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;check(total<=originalChunkSize,'Original chunk exceeds 1 MB');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
