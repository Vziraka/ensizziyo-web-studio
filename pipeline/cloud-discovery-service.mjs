import {check,hash} from './lifecycle.mjs';
import {cloudDiscoveryCapability,applyCloudDiscoveryTransition,cloudDiscoveryStatus,assertCloudDiscoveryWorkerContext,cloudDiscoveryContextContract} from './cloud-discovery.mjs';
import {cloudDiscoveryArtifactStore} from './cloud-discovery-artifacts.mjs';
import {schemasFor} from './schemas.mjs';
import {evidenceReviewSchema} from './evidence-review.mjs';

const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys,'Closed discovery service input required');
function boundary(app){check(app.store?.key==='workspace'&&app.store.manualBinding?.scope.capability===cloudDiscoveryCapability,'Exact canonical discovery workspace required');}
function budget(app,{deadline=Infinity}={}){const end=Math.min(deadline,+app.now()+25000);check(Number.isFinite(end)&&+app.now()<end,'Discovery invocation expired');const signal=AbortSignal.timeout(Math.max(1,end-+app.now()));return {end,alive(){check(!signal.aborted&&+app.now()<end,'Discovery invocation expired');}};}
async function envelope(app,fingerprint,b){b?.alive();boundary(app);const {data}=await app.store.envelope();b?.alive();check(!fingerprint||hash(data.config)===fingerprint,'Discovery policy binding changed');return data;}
async function transition(app,type,input,actor,config,b){
 b.alive();
 const cloudDiscovery={type,actor,at:app.now().toISOString(),input};
 return app.change((s,c)=>{b.alive();return applyCloudDiscoveryTransition(s,c,cloudDiscovery);},{configFingerprint:hash(config),cloudDiscovery,cloudDiscoveryDeadline:b.end});
}
async function importTask(app,input,actor,b){
 exact(input,'id,revision');check(key(input.id),'Exact discovery task required');const data=await envelope(app,null,b),task=data.state.cloud_discovery?.tasks[input.id];
 check(task&&(actor==='discovery'||actor===task.assigned_to),'Assigned operator or trusted coordinator required');
 if(task.imports)return {id:task.id,status:'Imported',imports:structuredClone(task.imports),duplicate:true};
 check(task.submission&&task.review,'Completed independent review required');const fingerprint=hash(data.config);
 const guard=async()=>{const current=await envelope(app,fingerprint,b),t=current.state.cloud_discovery?.tasks[input.id];check(hash(t)===hash(task),'Discovery task changed during artifact read');check(cloudDiscoveryStatus(current.state,current.config,app.now().toISOString()).status==='Ready','Discovery allowance, pause or policy held');};
 const artifacts=cloudDiscoveryArtifactStore(app.store.store),submission=await artifacts.get(task.submission.artifact,{guard}),review=await artifacts.get(task.review.artifact,{guard});await guard();
 const exactInput={...input,submission,review};
 try{applyCloudDiscoveryTransition(structuredClone(data.state),data.config,{type:'import',actor,at:app.now().toISOString(),input:exactInput});}
 catch(error){if(error.code==='DISCOVERY_IMPORT_INVALID')error.task_sha256=hash(task);throw error;}
 return transition(app,'import',exactInput,actor,data.config,b);
}
export async function cloudDiscoveryCommand(app,type,input,actor,options={}){
 boundary(app);check(['owner','friend'].includes(actor)&&['create','pause','allowance','import'].includes(type),'Signed discovery command required');
 const b=budget(app,options);if(type==='import')return importTask(app,input,actor,b);const data=await envelope(app,null,b);return transition(app,type,input,actor,data.config,b);
}
// Only trusted hosting code exposes these coordinator operations; worker objects never contain them.
export async function cloudDiscoveryCoordinator(app,type,input,options={}){
 boundary(app);check(['queue-daily','import','hold'].includes(type),'Closed coordinator operation required');
 const b=budget(app,options);if(type==='import')return importTask(app,input,'discovery',b);const data=await envelope(app,null,b);return transition(app,type,input,'discovery',data.config,b);
}
export function createCloudDiscoveryWorker(app,{actor,context_id,deadline=Infinity}={}){
 boundary(app);const config=app.config,p=config.cloud_discovery,fingerprint=hash(config);
 check(p&&[p.researcher_id,p.reviewer_id].includes(actor)&&key(context_id),'Authenticated bound worker/context required');
 const reviewer=actor===p.reviewer_id,claimField=reviewer?'review_claim':'research_claim',resultField=reviewer?'review':'submission';
 async function read(b){const data=await envelope(app,fingerprint,b);check(data.state.cloud_discovery?.policy_sha256===hash(p),'Discovery generation changed');return data;}
 function own(data,input,live=true){
  exact(input,'claim_id,id');check(key(input.id)&&key(input.claim_id),'Exact discovery claim identity required');
  if(live)return assertCloudDiscoveryWorkerContext(data.state,data.config,{...input,context_id},actor,app.now().toISOString());
  const task=data.state.cloud_discovery?.tasks[input.id],claim=task?.[claimField];check(claim&&claim.id===input.claim_id&&claim.actor===actor&&claim.context_id===context_id,'Original worker receipt required');return task;
 }
 function receipt(task){return {id:task.id,status:task.status,claim:structuredClone(task[claimField]),artifact:structuredClone(task[resultField]?.artifact??null),imported:task.status==='Imported'};}
 return {
  async list(){const b=budget(app,{deadline}),data=await read(b);check(cloudDiscoveryStatus(data.state,data.config,app.now().toISOString()).status==='Ready','Discovery allowance, pause or policy held');return {tasks:Object.values(data.state.cloud_discovery.tasks).filter(t=>t.epoch===data.state.cloud_discovery.epoch&&t.status===(reviewer?'Awaiting review':'Queued')).slice(0,25).map(({id,lane,count,status})=>({id,lane,count,status}))};},
  async claim(input){
   const b=budget(app,{deadline});exact(input,'claim_id,id');const data=await read(b);
   const prior=data.state.cloud_discovery?.tasks[input.id]?.[claimField];if(prior){const task=own(data,input,false);return {...receipt(task),duplicate:true};}
   return transition(app,reviewer?'claim-review':'claim',{...input,context_id,revision:data.state.revision},actor,data.config,b);
  },
  async context(input){
   const b=budget(app,{deadline}),data=await read(b),task=own(data,input),guard=async()=>own(await read(b),input);
   const scope={id:task.id,lane:task.lane,count:task.count,area:task.area,subtypes:structuredClone(task.subtypes),claim:structuredClone(task[claimField]),contract:cloudDiscoveryContextContract(task),...(task.lane==='email-qualified'?{report_schema:schemasFor({research_version:3}).report}:{})};
   if(!reviewer)return scope;
   const submission=await cloudDiscoveryArtifactStore(app.store.store).get(task.submission.artifact,{guard});await guard();
   const review_schemas=task.lane==='email-qualified'?submission.candidates.map(c=>{const {job,snapshots,report}=c.research;return {candidate_id:c.id,schema:evidenceReviewSchema({job,snapshots,report,state:{attempt_id:task.research_claim.id},report_sha256:hash(report),sources_sha256:hash(snapshots)},p.reviewer_id)};}):[];
   return {...scope,submission,submission_artifact:structuredClone(task.submission.artifact),review_schemas};
  },
  async submit(input){
   const b=budget(app,{deadline});exact(input,'claim_id,id,payload');const selector={id:input.id,claim_id:input.claim_id},data=await read(b),task=own(data,selector,false),payload=structuredClone(input.payload);
   const artifact={sha256:hash(payload),bytes:Buffer.byteLength(JSON.stringify(payload)),reference:'cloud-discovery/'+hash(payload)};
   if(task[resultField]){check(hash(task[resultField].artifact)===hash(artifact),'Original result already retained; changed retry rejected');return {...receipt(task),duplicate:true};}
   own(data,selector);const guard=async()=>{const current=await read(b),t=own(current,selector);check(!t[resultField],'Result already saved; read the original receipt');};
   const artifacts=cloudDiscoveryArtifactStore(app.store.store),submission=reviewer?await artifacts.get(task.submission.artifact,{guard}):null;
   const type=reviewer?'review':'submit',trInput={...selector,revision:data.state.revision,artifact,payload,...(reviewer?{submission}:{})};
   applyCloudDiscoveryTransition(structuredClone(data.state),data.config,{type,actor,at:app.now().toISOString(),input:trInput});
   const saved=await artifacts.put(payload,{guard});check(hash(saved)===hash(artifact),'Artifact changed while storing');await guard();return transition(app,type,trInput,actor,data.config,b);
  },
  async receipt(input){return receipt(own(await read(budget(app,{deadline})),input,false));}
 };
}
