import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {projectAssetVersion} from './project-assets.mjs';
import {projectContext} from './project-work.mjs';
import {blobProjectOriginalStore,reserveSharedOriginal,uploadSharedOriginalChunk,completeSharedOriginal} from './shared-project-originals.mjs';
import {operationsPdfCapability,operationsPdfLimits,validateOperationsPdfState,applyOperationsPdfRecord} from './operations-pdf.mjs';

const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(','),'Use exact PDF caller fields');
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
function boundary(app,actor){check(['owner','friend'].includes(actor),'Signed operator required');check(app.store?.key==='workspace'&&app.store.manualBinding?.scope.capability===operationsPdfCapability&&!app.store.dispatchBinding&&!app.store.projectBinding&&!app.store.emailTaskBinding&&!app.store.inertBinding,'Exact operations PDF manual workspace required');}
function target(ids){exact(ids,'project_id,asset_id,version_id');check(Object.values(ids).every(key),'Exact PDF target required');return structuredClone(ids);}
function shadow(state,config,at){const app=new StudioLifecycle(null,()=>new Date(at));app.config=config;app.snapshot=async()=>structuredClone(state);app.change=async fn=>fn(state);return app;}
async function invocation(app,actor,run,{deadline:callerDeadline=Infinity}={}){
 boundary(app,actor);const binding=hash(app.store.manualBinding),deadline=Math.min(callerDeadline,+app.now()+25000),signal=AbortSignal.timeout(Math.max(1,deadline-+app.now()));
 const alive=()=>check(!signal.aborted&&+app.now()<deadline,'PDF invocation expired; retain the exact transfer');
 const expired=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('PDF invocation expired; retain the exact transfer')),{once:true}));
 const work=(async()=>{
  alive();const base=(await app.store.envelope()).data;alive();validateOperationsPdfState(base.state,base.config);
  const fingerprint=hash(base.config),stateHash=hash(base.state),at=app.now().toISOString();
  const guard=async()=>{alive();boundary(app,actor);check(hash(app.store.manualBinding)===binding,'PDF workspace binding changed');const current=(await app.store.envelope()).data;alive();validateOperationsPdfState(current.state,current.config);check(hash(current.config)===fingerprint&&hash(current.state)===stateHash,'PDF source or workspace changed; refresh exact state');};
  const raw=blobProjectOriginalStore(app.store.store),store={};
  for(const name of ['get','manifest','chunk','putChunk','publish'])store[name]=async(...args)=>{await guard();const result=await raw[name](...args);await guard();return result;};
  const readOnly={chunk:store.chunk,publish:async m=>check(hash(await store.manifest(m))===hash(m),'Published original manifest differs')};
  async function commit(tr,reconstruct){
   await guard();
   return app.change(async(s,c)=>{alive();boundary(app,actor);check(hash(app.store.manualBinding)===binding&&hash(c)===fingerprint&&hash(s)===stateHash,'PDF source changed before commit');const result=await reconstruct(s,c);alive();return result;},{configFingerprint:fingerprint,operationsPdf:tr,operationsPdfDeadline:deadline});
  }
  return run({base,at,guard,store,readOnly,commit,alive});
 })();return Promise.race([work,expired]);
}
// Actor is a trusted server argument obtained from the signed session, never request JSON.
export async function operationsPdfRecord(app,input,actor,options={}){
 input=structuredClone(input);
 return invocation(app,actor,async({base,at,store,commit})=>{
  exact(input,input?.event?.type==='workspace_project_created'?'revision,event':['asset_registered','asset_version_registered'].includes(input?.event?.type)?'revision,event,source':'revision,event,inspected_original');
  const tr={schema_version:1,type:'record',actor,at,input};
  check(input.event&&typeof input.event.at==='string'&&Number.isFinite(Date.parse(input.event.at)),'PDF event timestamp required');
  input.event.at=at; // Server time binds the signed record and its typed witness.
  applyOperationsPdfRecord(structuredClone(base.state),base.config,tr);
  if(input.inspected_original){const o=base.state.asset_index[input.event.data.asset_id].versions[input.event.data.version_id].verified_original;await store.get(o);}
  return commit(tr,(s,c)=>applyOperationsPdfRecord(s,c,tr));
 },options);
}
export async function operationsPdfReserve(app,ids,input,actor,options={}){
 ids=target(ids);input=structuredClone(input);exact(input,'revision,context_sha256,manifest,source');
 return invocation(app,actor,async({base,at,commit})=>{
  const tr={schema_version:1,type:'reserve',actor,at,input:{ids,...input}},candidate=structuredClone(base.state);
  check(input.revision===candidate.revision,'PDF revision changed');
  const v=projectAssetVersion(candidate,ids.project_id,ids.asset_id,ids.version_id),d=v.operations_pdf_source;
  exact(input.source,'reference,name,mime_type,modified_time,account');exact(input.manifest,'format,sha256,bytes,chunk_size,chunks');
  check(d&&d.bytes<=operationsPdfLimits.original_bytes&&input.manifest.sha256===d.sha256&&input.manifest.bytes===d.bytes&&hash(input.source)===hash(Object.fromEntries(Object.keys(input.source).map(k=>[k,d[k]]))),'Upload differs from bounded registered original');
  await reserveSharedOriginal(shadow(candidate,base.config,at),{...ids,...input},actor);
  validateOperationsPdfState(candidate,base.config);
  return commit(tr,async(s,c)=>reserveSharedOriginal(shadow(s,c,at),{...ids,...input},actor));
 },options);
}
export async function operationsPdfUploadChunk(app,ids,index,bytes,transfer_id,actor,options={}){
 ids=target(ids);check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=operationsPdfLimits.chunk_bytes&&Number.isSafeInteger(index)&&index>=0&&typeof transfer_id==='string'&&/^[a-f0-9]{64}$/.test(transfer_id),'Bounded exact original chunk required');bytes=Buffer.from(bytes);
 return invocation(app,actor,async({base,at,store,guard})=>{
  const v=projectAssetVersion(base.state,ids.project_id,ids.asset_id,ids.version_id);check(v.operations_pdf_source&&v.operations_pdf_source.bytes<=operationsPdfLimits.original_bytes,'Registered bounded original required');
  await guard();const result=await uploadSharedOriginalChunk(shadow(structuredClone(base.state),base.config,at),store,{...ids,transfer_id},index,bytes);await guard();return result;
 },options);
}
export async function operationsPdfComplete(app,ids,input,actor,options={}){
 ids=target(ids);input=structuredClone(input);exact(input,'revision,context_sha256,transfer_id');
 return invocation(app,actor,async({base,at,store,readOnly,guard,commit})=>{
  const tr={schema_version:1,type:'complete',actor,at,input:{ids,...input}},candidate=structuredClone(base.state),v=projectAssetVersion(candidate,ids.project_id,ids.asset_id,ids.version_id);
  check(input.revision===candidate.revision&&projectContext(candidate,ids.project_id).context_sha256===input.context_sha256,'PDF revision or project context changed');check(v.operations_pdf_source&&v.operations_pdf_source.bytes<=operationsPdfLimits.original_bytes,'Registered bounded original required');
  await completeSharedOriginal(shadow(candidate,base.config,at),store,{...ids,transfer_id:input.transfer_id},actor,{assertCurrent:guard});validateOperationsPdfState(candidate,base.config);
  // Immutable publication above grants no canonical authority. Reconstruct only from its exact bytes.
  return commit(tr,async(s,c)=>{const result=await completeSharedOriginal(shadow(s,c,at),readOnly,{...ids,transfer_id:input.transfer_id},actor,{assertCurrent:guard});check(hash(s)===hash(candidate),'Original completion candidate changed');return result;});
 },options);
}
