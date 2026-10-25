import {researchCapability,validateResearchPolicy,validateResearchTransition,applyResearchTransition,researchProjection,researchStatusText} from './known-identity-research.mjs';
import {sharedProjectEvents} from './shared-project-events.mjs';
export {sharedProjectEvents} from './shared-project-events.mjs';
import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {prepareInertWorkspace,inertReconciliation} from './inert-shared-workspace.mjs';
import {validateBackupDependencies,hostedBackupInventory} from './lifecycle-backup.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';
import {blobAuthoringStore,attachHostedAuthoring} from './hosted-authoring.mjs';
import {blobAudioStore} from './call-audio.mjs';
import {applyAuthoringTransition,validateAuthoringTransition} from './project-authoring.mjs';
import {validateAuthoringRecovery} from './authoring-recovery.mjs';
import {refinementCapability,validateRefinementPolicy,applyGenerationTransition,validateGenerationTransition,reconcileGeneration,validateGenerationAuthoring,refinementPolicyProjection,refinementStatusText} from './refinement-generation.mjs';

export const supportsProjectAuthoring=app=>Boolean(app.store?.projectBinding&&['shared-project-continuation-v1',refinementCapability].includes(app.config.shared_capability)||['shared-operations-authoring-v1','shared-operations-refinement-v1'].includes(app.store?.dispatchBinding?.scope.capability)&&app.config.shared_capability===app.store.dispatchBinding.scope.capability);

const fields={note_added:['note'],asset_feedback_added:['asset_id','version_id','feedback','scope','project_id'],asset_version_selected:['asset_id','version_id'],asset_version_disputed:['asset_id','version_id'],project_preparation_requested:[],concept_refinement_requested:['asset_id','version_id','selected_direction','feedback','exception_id'],unpaid_refinement_exception:['reason','approved','extra_rounds']};
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
export function validateProjectBinding(b){
 const generation=[refinementCapability,researchCapability].includes(b?.capability);
 check(b?.schema_version===1&&['shared-project-continuation-v1',refinementCapability,researchCapability].includes(b.capability)&&b.mode==='production'&&b.state_schema===1&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id].every(key),'Invalid shared project binding');
 const origin=new URL(b.origin);check(origin.protocol==='https:'&&origin.origin===b.origin&&/^evz-project-shared-[a-z0-9-]{8,40}$/.test(b.namespace),'Invalid shared project origin or separate namespace');
 check(Object.keys(b).sort().join(',')===(generation?'capability,deploy_id,mode,namespace,origin,policy_sha256,run_id,schema_version,site_id,state_schema,workspace_id':'capability,deploy_id,mode,namespace,origin,run_id,schema_version,site_id,state_schema,workspace_id'),'Unknown shared project binding fields');if(generation)check(/^[a-f0-9]{64}$/.test(b.policy_sha256),'Exact refinement policy binding required');return b;
}
export function validateProjectEnvelope(data,binding){
 validateProjectBinding(binding.scope);const m=data.project_source;
 check(!data.inert_source&&!data.manual_source&&data?.schema_version===1&&data.config?.schema_version===1&&data.state?.schema_version===1,'Unknown shared project format');
 check(/^[a-f0-9]{64}$/.test(binding.manifest_sha256)&&m?.kind==='shared-project-source-v1'&&m.schema_version===1&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(binding.scope),'Shared project manifest or deployment binding changed');
 check(hash(data.config)===m.config_sha256&&data.config.shared_capability===binding.scope.capability&&data.config.mode==='production'&&data.config.run_id===binding.scope.run_id,'Shared project configuration changed');
 if(binding.scope.capability===researchCapability){validateResearchPolicy(data.config.known_identity_research);check(hash(data.config.known_identity_research)===binding.scope.policy_sha256,'Research policy changed');}
 if(binding.scope.capability===refinementCapability){validateRefinementPolicy(data.config.refinement_generation);check(hash(data.config.refinement_generation)===binding.scope.policy_sha256,'Refinement policy changed');}
 check(data.state.mode==='production'&&data.state.run_id===binding.scope.run_id,'Shared project identity changed');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(data.config[flag]===false,'Shared project cannot enable external execution');
 check(data.config.runtime?.enabled===false&&data.config.operations?.enabled===false&&data.config.transcript_ai?.enabled===false&&data.config.release?.approved===false&&data.config.call_release?.approved===false,'Shared project release must remain revoked');
}
export async function prepareProjectWorkspace({backup,sourceConfig,scope,refinementPolicy,researchPolicy}){
 validateProjectBinding(scope);const inertScope={...scope,capability:'inert-shared-v1',namespace:scope.namespace.replace('evz-project-shared-','evz-inert-shared-')};delete inertScope.policy_sha256;
 const packet=await prepareInertWorkspace({backup,sourceConfig,scope:inertScope}),config={...packet.envelope.config,shared_capability:scope.capability};
 if(scope.capability===researchCapability){validateResearchPolicy(researchPolicy);check(hash(researchPolicy)===scope.policy_sha256,'Prepare exact unapproved research policy');config.known_identity_research=structuredClone(researchPolicy);}
 if(scope.capability===refinementCapability){validateRefinementPolicy(refinementPolicy);check(hash(refinementPolicy)===scope.policy_sha256,'Prepare the exact unapproved refinement policy');config.refinement_generation=structuredClone(refinementPolicy);}
 const blockers=[];
 for(const [path,bytes] of packet.files){
  const author=/^project-authored\/(author-[a-f0-9]{32})\/(.+)$/.exec(path);if(!author)continue;
  if(!/^(context|input|authored|runtime|export|renderer-evidence)\.json$|^output\.pdf$|^page-[1-9][0-9]?\.json$|^review-page-[1-9][0-9]?\.png$|^recovery-[a-f0-9]{64}\.bin$/.test(author[2]))blockers.push(path);
  else if(author[2]==='runtime.json'&&JSON.parse(bytes).renderer!=='node-pdf-v1')blockers.push(path+' (local runtime)');
 }
 check(!blockers.length,'Shared project installation held; preserve the complete original G1 package. Unsupported retained dependencies ('+blockers.length+'): '+blockers.slice(0,20).join(', '));

 const dependencies=[...packet.files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:'shared-immutable-dependency'}));
 const manifest={...packet.envelope.inert_source,kind:'shared-project-source-v1',binding:structuredClone(scope),config_sha256:hash(config),dependencies,allowed_events:scope.capability===researchCapability?[]:[...sharedProjectEvents],unsupported:scope.capability===researchCapability?['autonomous-discovery','trusted-import','automatic-semantic-review','contact-execution','sending']:scope.capability===refinementCapability?['general-provider-execution','automatic-migration','automatic-design-review','new-concept-exploration']:['provider-execution','automatic-migration','unattended-authoring']};
 const envelope={schema_version:1,config,state:packet.envelope.state,project_source:manifest},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)};
 validateProjectEnvelope(envelope,binding);return {envelope,binding,files:packet.files};
}
export async function installProjectWorkspace(store,packet,{commit=false}={}){
 const {envelope,binding,files}=packet;validateProjectEnvelope(envelope,binding);store.validate(envelope);
 check(hash(envelope.state)===envelope.project_source.source_state_sha256,'Shared project source changed after preparation');await validateBackupDependencies(envelope.state,files);
 check(hash([...files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:'shared-immutable-dependency'})))===hash(envelope.project_source.dependencies),'Shared project dependencies changed');
 if(!commit)return {dry_run:true,execution:'external-disabled',binding,dependencies:envelope.project_source.dependencies};
 check(hash(store.projectBinding)===hash(binding),'Import store must match the exact reviewed shared project binding');
 check(!await store.store.getWithMetadata(store.key,{type:'json',consistency:'strong'}),'Shared project destination exists; never overwrite or reseed');
 const originals=blobProjectOriginalStore(store.store),authored=blobAuthoringStore(store.store),audio=blobAudioStore(store.store);
 for(const [path,bytes] of files){
  const author=/^project-authored\/(author-[a-f0-9]{32})\/(.+)$/.exec(path);
  if(author)await authored.put(author[1],author[2],bytes);
  else if(path.startsWith('project-originals/'))await originals.put(bytes);
  else {check(path.startsWith('call-audio/'),'Unsupported shared project dependency');await audio.put(path.slice(11),bytes);}
 }
 // Validate the actual stored inventory before publishing the state authority.
 const probe={store,config:envelope.config,snapshot:async()=>structuredClone(envelope.state)};attachHostedAuthoring(probe,store.store);await hostedBackupInventory(probe,audio);
 let written;try{written=await store.store.setJSON(store.key,envelope,{onlyIfNew:true});}catch{check(hash((await store.envelope()).data)===hash(envelope),'Shared project import outcome uncertain; inspect exact manifest');return {reconciled:true,execution:'external-disabled'};}
 check(written?.modified===true,'Shared project destination changed');check(hash((await store.envelope()).data)===hash(envelope),'Shared project import readback differs');return {dry_run:false,execution:'external-disabled'};
}
export function applySharedProjectEvent(state,event,actor,revision,now,config){
 check(config.shared_capability!==researchCapability,'Research capability permits exact typed research transitions only');
 check(['owner','friend'].includes(actor)&&sharedProjectEvents.includes(event?.type),'Shared project permits signed supported design feedback and preparation only');
 check(key(event.id)&&key(event.prospect_id)&&typeof event.at==='string'&&/Z$|[+-]\d\d:\d\d$/.test(event.at)&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=+now+60_000,'Shared project event needs stable IDs and a nonfuture timestamp');
 check(Object.keys(event).every(k=>['id','prospect_id','type','at','data'].includes(k))&&event.data&&typeof event.data==='object'&&!Array.isArray(event.data)&&Object.keys(event.data).every(k=>fields[event.type].includes(k)),'Unsupported shared project event fields');
 check(Number.isSafeInteger(revision),'Shared project edit needs exact current revision');
 if(event.type.startsWith('asset_'))check(event.prospect_id==='studio-assets'&&Object.hasOwn(state.asset_index??{},event.data.asset_id),'Choose an existing shared asset');
 else check(Object.hasOwn(state.prospects,event.prospect_id),'Choose an existing shared project');
 const app=new StudioLifecycle(null,()=>new Date(now));app.config=config;
 return app.reduceEvent(state,event,{actor,expectedRevision:revision,projectRecording:true});
}
export async function validateProjectChange(before,after,options,raw){
 check(hash(before.config)===hash(after.config)&&hash(before.project_source)===hash(after.project_source),'Shared project configuration or binding changed');
 const expected=structuredClone(before.state),now=new Date(after.state.updated_at);
 check([options.projectRecord,options.projectAuthoring,options.projectReconcile,options.projectGeneration,options.projectResearch].filter(Boolean).length===1,'Shared project storage requires one typed human or authoring transition');
 if(options.projectResearch){check(before.project_source.binding.capability===researchCapability,'Existing capabilities reject research execution');const app={store:{projectBinding:{scope:before.project_source.binding,manifest_sha256:hash(before.project_source)}},config:before.config};validateResearchTransition(app,options.projectResearch);applyResearchTransition(expected,options.projectResearch,before.config,now);}
 if(before.project_source.binding.capability===researchCapability)check(options.projectResearch,'Research capability rejects other mutation types');
 if(options.projectGeneration){check(before.project_source.binding.capability===refinementCapability,'Existing project capability rejects provider execution');const app={store:{projectBinding:{scope:before.project_source.binding,manifest_sha256:hash(before.project_source)}},config:before.config,now:()=>now,snapshot:async()=>structuredClone(before.state)};attachHostedAuthoring(app,raw);await validateGenerationTransition(app,options.projectGeneration);applyGenerationTransition(expected,options.projectGeneration,before.config,now);}
 if(options.projectRecord){const {event,actor,revision}=options.projectRecord;applySharedProjectEvent(expected,event,actor,revision,now,before.config);}
 const app={store:{projectBinding:{scope:before.project_source.binding,manifest_sha256:hash(before.project_source)}},config:before.config,now:()=>now,snapshot:async()=>structuredClone(before.state)};
 if(options.projectAuthoring||options.projectReconcile)await replayProjectAuthoring(app,expected,options,raw,now);
 check(hash(expected)===hash(after.state),'Shared project edit changed protected records, budgets, approvals, history or execution evidence');
}
// Both exact shared profiles independently replay the existing authoring/recovery witnesses.
export async function replayProjectAuthoring(app,expected,options,raw,now){
 const state=await app.snapshot();attachHostedAuthoring(app,raw);
 if(options.projectAuthoring){await validateGenerationAuthoring(app,options.projectAuthoring);await validateAuthoringTransition(app,options.projectAuthoring);applyAuthoringTransition(expected,options.projectAuthoring,app.config,now);}
 if(options.projectReconcile){
  const {job,result,snapshot,actor}=options.projectReconcile;
  const matches=[];function visit(w){for(const j of [...(w.authoring_history??[]),...(w.execution?[w.execution]:[])])if(j.id===job.id)matches.push(j);for(const prior of w.history??[])visit(prior);}
  for(const r of Object.values(expected.prospects))for(const w of Object.values(r.project_work??{}))visit(w);
  check(matches.length===1&&hash(matches[0])===hash(job)&&actor===job.actor&&['Claimed','Rendering','Rendered','Held'].includes(job.status),'Shared reconciliation job or actor changed');
  check(Object.keys(result.recovery??{}).sort().join(',')==='actor,at,disposition,execution,export_usable,files,observation,prior_status,reason,schema_version,snapshot','Unknown shared recovery fields');
  const evidence=await blobAuthoringStore(raw).evidence(job.id);check(snapshot===hash({state,job_id:job.id,files:evidence.files})&&hash(result)===hash({...job,status:'Reconciled',recovery:{...result.recovery,files:evidence.files}})&&result.recovery.snapshot===snapshot&&result.recovery.actor===actor&&result.recovery.prior_status===job.status&&result.recovery.at===now.toISOString(),'Authoring recovery observation changed; inspect exact dependencies again');
  await validateAuthoringRecovery(result,async name=>evidence.bytes.get(name));Object.assign(matches[0],result);reconcileGeneration(expected,job,now.toISOString());expected.revision++;expected.updated_at=now.toISOString();
 }
}
export function sharedProjectDashboard(binding,state,now=new Date()){
 const view={capability:binding.scope.capability,workspace_id:binding.scope.workspace_id,manifest_sha256:binding.manifest_sha256,allowed_edits:sharedProjectEvents,reconciliation:inertReconciliation(state),execution:'External execution disabled; interactive Node authoring only',unsupported:['provider-execution','unattended-authoring']};
 if(binding.scope.capability===refinementCapability){view.generation=refinementPolicyProjection(binding,state,now);view.execution=refinementStatusText(view.generation);view.unsupported=['general-provider-execution','automatic-design-review','new-concept-exploration','contact-execution','sending'];}
 if(binding.scope.capability===researchCapability){view.candidates=Object.values(state.discovery_batches??{}).flatMap(b=>b.candidates.map(c=>({batch_id:b.id,candidate_id:c.id,name:c.name,status:c.status,intake:c.research_intake,reason:c.reason})));view.research=researchProjection(binding,state,now);view.execution=researchStatusText(view.research);view.allowed_edits=[];view.unsupported=['autonomous-discovery','trusted-import','independent-model-review','contact-execution','sending'];}
 return view;
}
