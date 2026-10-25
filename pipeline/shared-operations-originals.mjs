import {check,hash} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';
import {projectAssetVersion,projectOriginalLimit} from './project-assets.mjs';
import {blobProjectOriginalStore,originalBaseContext,originalChunkSize,originalDigest,reserveSharedOriginal,completeSharedOriginal,reconcileOriginalRecovery} from './shared-project-originals.mjs';

export const operationsOriginalsCapability='shared-operations-originals-v1';
export const originalTransitionSchema=Object.freeze({version:1,transitions:['claim','progress','hold','reserve','complete','verified','reconcile'],recovery:'observed-hash-close-publication-v1',grant_profile:'drive-originals-readonly-v1'});
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),safe=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(v);
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.split(',').sort().join(','),'Unknown or missing original transition fields');
export const hasOperationsOriginals=app=>app.config?.shared_capability===operationsOriginalsCapability&&app.store?.dispatchBinding?.scope.capability===operationsOriginalsCapability;
export const driveOriginalSource=s=>({reference:s.reference,name:s.name,mime_type:s.mime_type,modified_time:s.modified_time,account:'ensizziyo@evzdigital.studio'});
export function validateDriveOriginalPolicy(config,state){
 exact(config,'account,grant_id,sources');check(config.account==='ensizziyo@evzdigital.studio'&&safe(config.grant_id)&&config.grant_id.length<=100&&Array.isArray(config.sources)&&config.sources.length>0&&config.sources.length<=64,'Exact business Drive read policy is unavailable');
 const seen=new Set();
 for(const s of config.sources){
  check(s&&Object.keys(s).every(k=>['project_id','asset_id','version_id','reference','name','mime_type','modified_time','drive_version','bytes','sha256','etag'].includes(k)),'Drive policy accepts exact metadata only');
  const v=projectAssetVersion(state,s.project_id,s.asset_id,s.version_id),id=hash([s.project_id,s.asset_id,s.version_id]);check(!seen.has(id),'Duplicate registered Drive source');seen.add(id);
  check(/^drive:[A-Za-z0-9_-]{10,256}$/.test(s.reference??'')&&v.reference===s.reference&&s.mime_type==='application/pdf'&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=200&&!/[\x00-\x1f\x7f]/.test(s.name)&&typeof s.modified_time==='string'&&s.modified_time.length<=50&&Number.isFinite(Date.parse(s.modified_time))&&/^[1-9][0-9]{0,24}$/.test(s.drive_version??'')&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=projectOriginalLimit&&sha(s.sha256)&&(s.etag===undefined||typeof s.etag==='string'&&/^"[^"\x00-\x20\x7f]{1,200}"$/.test(s.etag)),'Exact registered PDF metadata is required');
  if(v.verified_original){const o=v.verified_original;check(o.sha256===s.sha256&&o.bytes===s.bytes&&hash(driveOriginalSource(s))===hash(Object.fromEntries(Object.keys(driveOriginalSource(s)).map(k=>[k,o[k]??null]))),'Retain the verified original hash, bytes and source provenance');}
  if(v.original_transfer)check(v.original_transfer.manifest.sha256===s.sha256&&v.original_transfer.manifest.bytes===s.bytes&&hash(v.original_transfer.source)===hash(driveOriginalSource(s)),'Retain the exact reserved source provenance');
 }return config;
}
export function operationsOriginalSource(app,state,ids,env){
 check(hasOperationsOriginals(app)&&!app.store.projectBinding&&app.store.key==='workspace','Exact shared originals dispatch authority required');
 const b=app.store.dispatchBinding.scope;
 check(env.CONTEXT==='production'&&env.EVZ_OPERATIONS_DESK_ENABLED===operationsOriginalsCapability&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&hash(JSON.parse(env.EVZ_INTERNAL_DISPATCH_BINDING??'null'))===hash(app.store.dispatchBinding),'Original deployment binding changed');
 check(env.EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS===operationsOriginalsCapability,'Hosted Drive original read is disabled');
 const config=validateDriveOriginalPolicy(app.config.google_drive_originals,state),s=config.sources.find(s=>s.project_id===ids.project_id&&s.asset_id===ids.asset_id&&s.version_id===ids.version_id);check(s,'Choose an exact allowed registered Drive original');
 let keys;try{keys=JSON.parse(env.EVZ_DRIVE_RESOURCE_KEYS??'{}');}catch{throw Error('Server Drive resource-key configuration is invalid');}
 check(keys&&typeof keys==='object'&&!Array.isArray(keys)&&Object.keys(keys).length<=64&&Object.entries(keys).every(([id,key])=>safe(id)&&safe(key)),'Server Drive resource-key configuration is invalid');
 const resourceKey=Object.hasOwn(keys,s.reference.slice(6))?keys[s.reference.slice(6)]:null;
 const policy=hash({capability:operationsOriginalsCapability,authority_key:app.store.key,binding_sha256:hash(app.store.dispatchBinding),source_policy_sha256:hash(config),account:config.account,grant_id:config.grant_id,source:s,resource_key_sha256:hash(resourceKey)});
 return {config,s,resourceKey,version:projectAssetVersion(state,ids.project_id,ids.asset_id,ids.version_id),policy};
}
function receipt(state,w){return w.type==='reconcile'&&w.input.kind==='manual'?projectAssetVersion(state,w.ids.project_id,w.ids.asset_id,w.ids.version_id).original_transfer:state.drive_original_reads?.[w.receipt_id];}
// Only server callers construct this witness; replay reconstructs from the actual before envelope and immutable bytes.
export function originalTransitionApp(app,details){
 if(!hasOperationsOriginals(app))return app;
 const wrapped=Object.create(app);wrapped.change=(fn,options={})=>{const witness={},typed={...options,configFingerprint:hash(app.config),projectOriginal:witness};return app.change(async state=>{
  const prior=structuredClone(receipt(state,details)),result=await fn(state);
  Object.assign(witness,{...structuredClone(details),http_deadline:details.http_deadline??details.deadline,binding_sha256:hash(app.store.dispatchBinding),config_sha256:hash(app.config),source_policy_sha256:hash(app.config.google_drive_originals),prior_sha256:prior?hash(prior):null,claim_sha256:prior?.claim?hash({claim:prior.claim,lease_until:prior.lease_until}):null,at:state.updated_at});return result;
 },typed);};return wrapped;
}
function applyReceipt(state,w,app,env,now){
 const {s,policy}=operationsOriginalSource(app,state,w.ids,env),context=originalBaseContext(state,w.ids),id=hash({policy,context}),prior=state.drive_original_reads?.[id];
 check(w.receipt_id===id&&w.input.context_sha256===projectContext(state,w.ids.project_id).context_sha256,'Original policy or context changed');
 check(!prior?.recovery&&prior?.status!=='Reconciled','Original publication is closed');
 const base=prior??{schema:1,id,policy,context,target:{...w.ids,reference:s.reference},sha256:s.sha256,bytes:s.bytes,chunks:[]};
 if(prior)check(prior.id===id&&prior.policy===policy&&prior.context===context&&prior.sha256===s.sha256&&prior.bytes===s.bytes&&hash(prior.target)===hash({...w.ids,reference:s.reference}),'Drive receipt binding differs');
 let next;
 if(w.type==='claim'){
  exact(w.details,'claim');check(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(w.details.claim??'')&&(!prior||['Ready','Reading'].includes(prior.status))&&(!prior||prior.status!=='Reading'||prior.lease_until<=now),'Drive original read is already claimed or closed');
  check(w.deadline>now&&w.deadline<=now+45_000,'Exact bounded original lease required');next={...base,status:'Reading',claimed_by:w.actor,claim:w.details.claim,lease_until:w.deadline};
 }else{
  check(prior?.status==='Reading'&&prior.claimed_by===w.actor&&prior.lease_until>now&&prior.lease_until===w.deadline,'Original claim expired or changed');
  if(w.type==='progress'){exact(w.details,'sha256,metadata');check(sha(w.details.sha256)&&sha(w.details.metadata)&&(!prior.metadata||prior.metadata===w.details.metadata)&&prior.chunks.length<Math.ceil(s.bytes/originalChunkSize),'Original metadata or progress changed');next={...prior,metadata:w.details.metadata,chunks:[...prior.chunks,w.details.sha256],status:'Ready',lease_until:0};}
  else if(w.type==='hold'){exact(w.details,'hold');check(typeof w.details.hold==='string'&&w.details.hold.trim()&&w.details.hold.length<=1600,'Bounded original hold required');next={...prior,status:'Held',hold:w.details.hold,lease_until:0};}
  else{check(w.type==='verified'&&Object.keys(w.details).length===0,'Unsupported original receipt transition');const v=projectAssetVersion(state,w.ids.project_id,w.ids.asset_id,w.ids.version_id);check(v.verified_original?.sha256===s.sha256&&v.verified_original.bytes===s.bytes&&prior.chunks.length===Math.ceil(s.bytes/originalChunkSize),'Only an archived whole original can complete its receipt');next={...prior,status:'Verified',lease_until:0};}
 }
 const receipts=state.drive_original_reads??={};check(prior||Object.keys(receipts).length<64,'Original receipt limit reached');receipts[id]=next;state.revision++;state.updated_at=w.at;return next;
}
export async function replayOriginalTransition(before,expected,w,raw,{binding,env,now}={}){
 exact(w,'type,actor,ids,input,receipt_id,deadline,http_deadline,details,binding_sha256,config_sha256,source_policy_sha256,prior_sha256,claim_sha256,at');
 check(originalTransitionSchema.transitions.includes(w.type)&&['owner','friend'].includes(w.actor)&&hash(binding)===w.binding_sha256&&w.config_sha256===hash(before.config)&&w.source_policy_sha256===hash(before.config.google_drive_originals),'Original transition binding changed');
 exact(w.ids,'project_id,asset_id,version_id');projectAssetVersion(before.state,w.ids.project_id,w.ids.asset_id,w.ids.version_id);
 const prior=receipt(before.state,w),at=Date.parse(w.at),clock=()=>+now();
 check(sha(w.receipt_id)&&Number.isFinite(at)&&at<=clock()&&Number.isSafeInteger(w.deadline)&&Number.isSafeInteger(w.http_deadline)&&w.http_deadline<=w.deadline&&(w.type==='reconcile'||w.http_deadline<=at+40_000)&&clock()<w.http_deadline&&w.prior_sha256===(prior?hash(prior):null)&&w.claim_sha256===(prior?.claim?hash({claim:prior.claim,lease_until:prior.lease_until}):null),'Original receipt, claim or deadline changed');
 const app={config:before.config,store:{dispatchBinding:binding,projectBinding:null,key:'workspace'},now:()=>new Date(at),snapshot:async()=>structuredClone(expected),change:async fn=>fn(expected)},store=blobProjectOriginalStore(raw);
 const guard=()=>{check(clock()<w.http_deadline,'Original transition deadline expired');if(w.type!=='reconcile')operationsOriginalSource(app,before.state,w.ids,env);};guard();
 if(['claim','progress','hold','verified'].includes(w.type)){
  exact(w.input,'context_sha256');
  if(w.type==='progress'){const index=prior.chunks.length,b=await store.candidate(prior,index,w.details.sha256);guard();check(index!==0||b.subarray(0,5).toString()==='%PDF-','Original candidate is not a PDF');}
  if(w.type==='verified'){const v=projectAssetVersion(before.state,w.ids.project_id,w.ids.asset_id,w.ids.version_id),m=await store.manifest(v.verified_original),parts=[];guard();for(let i=0;i<m.chunks.length;i++){parts.push(await store.chunk(m,i));guard();}const bytes=Buffer.concat(parts);check(bytes.subarray(0,5).toString()==='%PDF-'&&originalDigest(bytes)===prior.sha256,'Verified original bytes changed');}
  applyReceipt(expected,w,app,env,at);
 }else if(w.type==='reserve'||w.type==='complete'){
  exact(w.input,'context_sha256');exact(w.details,'');check(prior?.status==='Reading'&&!prior.recovery&&prior.claimed_by===w.actor&&prior.lease_until===w.deadline&&prior.lease_until>at,'Original live publication claim required');
  const selected=operationsOriginalSource(app,expected,w.ids,env),context=originalBaseContext(expected,w.ids);check(prior.id===hash({policy:selected.policy,context})&&prior.policy===selected.policy&&prior.context===context&&hash(prior.target)===hash({...w.ids,reference:selected.s.reference})&&w.input.context_sha256===projectContext(expected,w.ids.project_id).context_sha256,'Original publication source or context changed');
  const manifest={format:'project-original-chunks-v1',sha256:selected.s.sha256,bytes:selected.s.bytes,chunk_size:originalChunkSize,chunks:prior.chunks},source=driveOriginalSource(selected.s);
  if(w.type==='reserve')await reserveSharedOriginal(app,{...w.ids,context_sha256:w.input.context_sha256,manifest,source},w.actor);
  else{
   const transfer=projectAssetVersion(expected,w.ids.project_id,w.ids.asset_id,w.ids.version_id).original_transfer;check(transfer&&hash(transfer.manifest)===hash(manifest)&&hash(transfer.source)===hash(source),'Exact original reservation required');
   await completeSharedOriginal(app,{...store,async publish(m){const saved=await store.manifest(m);guard();check(hash(saved)===hash(m),'Immutable original manifest changed');}},{...w.ids,transfer_id:transfer.id},w.actor,{assertCurrent:async()=>guard()});
  }
 }else{
  exact(w.details,'');check(w.input.transfer_id===w.receipt_id&&w.deadline===Date.parse(w.input.observed_at)+45_000,'Exact original recovery observation required');
  app.store.config=async()=>before.config;
  await reconcileOriginalRecovery(app,{...store,async putEvidence(path,bytes){const saved=await store.getEvidence(path);guard();check(saved.equals(bytes),'Inert original evidence changed');}},w.ids,w.input,w.actor,{resolveDriveTarget:()=>{throw Error('Unbound legacy Drive receipt cannot gain shared authority');}});
 }
 guard();
}
