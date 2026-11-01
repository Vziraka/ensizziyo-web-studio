import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';
import {projectAssetVersion,projectOriginalLimit} from './project-assets.mjs';
import {originalChunkSize,reserveSharedOriginal,completeSharedOriginal} from './shared-project-originals.mjs';
import {replyAttachmentLimit,replyAttachmentCatalogue} from './reply-attachments.mjs';

export const operationsPdfCapability='shared-operations-desk-v1';
export const operationsPdfSchema=Object.freeze({version:1,mode:'registered-existing-pdfs',transitions:['record','reserve','complete']});
// Shared lifecycle imports are cyclic; resolve existing bounds when the caller reads them.
export const operationsPdfLimits=Object.freeze({get original_bytes(){return projectOriginalLimit;},get attachment_bytes(){return replyAttachmentLimit;},attachments:2,get chunk_bytes(){return originalChunkSize;}});
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===keys.split(',').filter(Boolean).sort().join(','),'Unknown or missing PDF fields');
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v,n)=>typeof v==='string'&&v.trim()&&v.length<=n&&!/[\x00-\x1f\x7f]/.test(v);
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const events={workspace_project_created:'name,purpose,controlled',asset_registered:'asset_id,scope,name,kind,version_id,version_label,reference',asset_version_registered:'asset_id,version_id,version_label,reference',asset_version_selected:'asset_id,version_id',asset_version_disputed:'asset_id,version_id'};
const registration=type=>['asset_registered','asset_version_registered'].includes(type);
export function validateOperationsPdfPolicy(p){
 exact(p,'schema_version,mode,max_assets,max_versions_per_asset');
 check(p.schema_version===1&&p.mode===operationsPdfSchema.mode&&Number.isSafeInteger(p.max_assets)&&p.max_assets>=1&&p.max_assets<=64&&Number.isSafeInteger(p.max_versions_per_asset)&&p.max_versions_per_asset>=1&&p.max_versions_per_asset<=16,'Invalid bounded existing PDF policy');return p;
}
function policy(c){check(c?.shared_capability===operationsPdfCapability,'Existing PDF operations require their exact capability');return validateOperationsPdfPolicy(c.operations_pdf);}
function source(s){
 exact(s,'reference,name,mime_type,modified_time,account,sha256,bytes');
 check(typeof s.reference==='string'&&/^drive:[a-zA-Z0-9_-]{10,256}$/.test(s.reference)&&text(s.name,200)&&s.mime_type==='application/pdf'&&utc(s.modified_time)&&(s.account===null||typeof s.account==='string'&&s.account.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.account))&&sha(s.sha256)&&Number.isSafeInteger(s.bytes)&&s.bytes>0,'Exact retained PDF source metadata required');return s;
}
const provenance=s=>Object.fromEntries(['reference','name','mime_type','modified_time','account'].map(k=>[k,s[k]]));
export function validateOperationsPdfState(s,c){
 policy(c);
 for(const a of Object.values(s.asset_index??{}))for(const v of Object.values(a.versions??{}))if(v.operations_pdf_source){
  const d=source(v.operations_pdf_source);check(d.reference===v.reference,'Registered PDF reference changed');
  if(v.verified_original){const o=v.verified_original;check(d.bytes<=projectOriginalLimit&&o.sha256===d.sha256&&o.bytes===d.bytes&&hash(provenance(o))===hash(provenance(d)),'Verified PDF differs from registered original');}
  if(v.original_transfer){const t=v.original_transfer;check(d.bytes<=projectOriginalLimit&&t.manifest.sha256===d.sha256&&t.manifest.bytes===d.bytes&&hash(t.source)===hash(provenance(d)),'Reserved PDF differs from registered original');}
 }return s;
}
function transition(s,c,tr){
 validateOperationsPdfState(s,c);exact(tr,'schema_version,type,actor,at,input');
 check(tr.schema_version===1&&operationsPdfSchema.transitions.includes(tr.type)&&['owner','friend'].includes(tr.actor)&&utc(tr.at),'Signed existing PDF transition required');
 check(Number.isSafeInteger(tr.input?.revision)&&tr.input.revision===s.revision,'PDF workspace changed; refresh before continuing');
}
// The server supplies actor from its signed session. Caller JSON must never select it.
export function applyOperationsPdfRecord(s,c,tr){
 transition(s,c,tr);check(tr.type==='record','Choose a PDF record transition');
 const {event}=tr.input;check(event&&Object.hasOwn(events,event.type),'PDF record event unavailable');
 exact(tr.input,event.type==='workspace_project_created'?'revision,event':registration(event.type)?'revision,event,source':'revision,event,inspected_original');exact(event,'id,type,prospect_id,at,data');
 if(event.type==='workspace_project_created'){
  check(key(event.id)&&key(event.prospect_id)&&event.at===tr.at,'Exact signed workspace event required');exact(event.data,events[event.type]);
  const next=structuredClone(s),app=new StudioLifecycle(null,()=>new Date(tr.at));app.config=c;const result=app.reduceEvent(next,event,{actor:tr.actor,expectedRevision:tr.input.revision});validateOperationsPdfState(next,c);Object.assign(s,next);return result;
 }
 check(key(event.id)&&event.prospect_id==='studio-assets'&&event.at===tr.at,'Exact signed PDF event required');
 const data=event.data;exact(data,events[event.type]+(event.type==='asset_registered'&&data?.scope==='project'?',project_id':''));
 check(key(data.asset_id)&&key(data.version_id),'Exact asset and version required');
 const existing=s.asset_index?.[data.asset_id],p=policy(c);
 if(registration(event.type)){
  source(tr.input.source);check(tr.input.source.reference===data.reference,'Registered source reference differs');
  if(event.type==='asset_registered')check(Object.keys(s.asset_index??{}).length<p.max_assets,'Existing PDF asset limit reached');
  else check(existing&&Object.keys(existing.versions).length<p.max_versions_per_asset,'Existing PDF version limit reached');
 }else{
  exact(tr.input.inspected_original,'sha256,bytes');const v=existing?.versions?.[data.version_id],o=v?.verified_original;
  check(o&&o.mime_type==='application/pdf'&&o.reference===v.reference&&o.bytes<=projectOriginalLimit&&sha(o.sha256)&&o.sha256===tr.input.inspected_original.sha256&&o.bytes===tr.input.inspected_original.bytes,'Inspect the exact verified original before baseline review');
 }
 const next=structuredClone(s),app=new StudioLifecycle(null,()=>new Date(tr.at));app.config=c;
 // Preserve the established owner/friend baseline/dispute reducer; reply ownership is separate.
 const result=app.reduceEvent(next,event,{actor:tr.actor,expectedRevision:tr.input.revision});
 if(registration(event.type)){
  const v=next.asset_index[data.asset_id].versions[data.version_id];
  check(!v.operations_pdf_source||hash(v.operations_pdf_source)===hash(tr.input.source),'Registered source changed');v.operations_pdf_source=structuredClone(tr.input.source);
 }
 validateOperationsPdfState(next,c);Object.assign(s,next);return result;
}
function target(s,input){exact(input.ids,'project_id,asset_id,version_id');check(Object.values(input.ids).every(key),'Exact original target required');return projectAssetVersion(s,input.ids.project_id,input.ids.asset_id,input.ids.version_id);}
// Reconstructs state using only existing immutable bytes. No writes or provider calls occur here.
export async function replayOperationsPdfTransition(before,after,tr,{originalStore,now=()=>new Date()}={}){
 check(hash(before.config)===hash(after.config),'PDF transition cannot change configuration');const c=before.config,s=structuredClone(before.state);transition(s,c,tr);
 const guard=()=>{const at=+now();check(Number.isFinite(at)&&at>=Date.parse(tr.at)&&at<Date.parse(tr.at)+25000,'PDF transition expired; refresh exact state');};guard();
 if(tr.type==='record'){
  applyOperationsPdfRecord(s,c,tr);
  if(!registration(tr.input.event.type)&&tr.input.event.type!=='workspace_project_created'){
   const o=s.asset_index[tr.input.event.data.asset_id].versions[tr.input.event.data.version_id].verified_original;
   check(originalStore,'Original read authority required');await originalStore.get(o);guard();
  }
 }else{
  exact(tr.input,tr.type==='reserve'?'ids,revision,context_sha256,manifest,source':'ids,revision,context_sha256,transfer_id');
  const v=target(s,tr.input),d=source(v.operations_pdf_source);check(d.bytes<=projectOriginalLimit,'Original exceeds 64,000,000 bytes; retain the external reference');
  check(projectContext(s,tr.input.ids.project_id).context_sha256===tr.input.context_sha256,'PDF project context changed');
  const app=new StudioLifecycle(null,()=>new Date(tr.at));app.config=c;app.snapshot=async()=>structuredClone(s);app.change=async fn=>{guard();const r=await fn(s);guard();return r;};
  if(tr.type==='reserve'){
   exact(tr.input.manifest,'format,sha256,bytes,chunk_size,chunks');exact(tr.input.source,'reference,name,mime_type,modified_time,account');
   check(tr.input.manifest.sha256===d.sha256&&tr.input.manifest.bytes===d.bytes&&hash(tr.input.source)===hash(provenance(d)),'Upload differs from registered original');
   await reserveSharedOriginal(app,{...tr.input.ids,...tr.input},tr.actor);
  }else{
   check(originalStore,'Original read authority required');
   const readOnly={chunk:async(m,i)=>{guard();const b=await originalStore.chunk(m,i);guard();return b;},publish:async m=>{guard();check(hash(await originalStore.manifest(m))===hash(m),'Published original manifest changed');guard();}};
   await completeSharedOriginal(app,readOnly,{...tr.input.ids,transfer_id:tr.input.transfer_id},tr.actor,{assertCurrent:async()=>guard()});
  }
 }
 guard();validateOperationsPdfState(s,c);check(hash(s)===hash(after.state),'PDF mutation differs from exact typed replay');return true;
}
export function operationsPdfView(s,c,projectId){
 validateOperationsPdfState(s,c);if(projectId!==undefined)check(key(projectId)&&Object.hasOwn(s.prospects,projectId),'Choose an existing project');
 const attachable=projectId?new Set(replyAttachmentCatalogue(s,projectId).items.map(x=>x.asset_id+':'+x.version_id)):new Set();
 return {limits:operationsPdfLimits,items:Object.values(s.asset_index??{}).filter(a=>!projectId||a.scope==='studio'||a.project_id===projectId).flatMap(a=>Object.values(a.versions).map(v=>{
  const d=v.operations_pdf_source??v.verified_original,o=v.verified_original;
  return {asset_id:a.id,version_id:v.id,scope:a.scope,project_id:a.project_id??null,name:a.name,label:v.label,reference:v.reference,source:d??null,original_status:d?.bytes>projectOriginalLimit?'External reference only':o?'Verified original declared':'Original not uploaded',hosted_original_declared:Boolean(o),attachment_size_allowed:Boolean(o&&o.bytes<=replyAttachmentLimit),attachable:attachable.has(a.id+':'+v.id),baseline:a.baseline_version===v.id,disputed:Boolean(a.dispute)};
 }))};
}
