import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {applyEmailTaskTransition,applyEmailTaskAdoption,sharedDraftReview,safeEmailTaskMaterial,emailDraftTaskContext,emailDraftTaskReceipt,submitEmailDraftResult,readEmailTaskAttachment} from './email-draft-tasks.mjs';
import {blobProjectOriginalStore} from './shared-project-originals.mjs';
import {validateWritingProfiles} from './conversation-records.mjs';
import {currentReplyAttachments} from './reply-attachments.mjs';
import {readProjectAsset} from './project-assets.mjs';

export const emailTaskProofCapability='fictional-email-draft-task-v1';
export const emailTaskReviewCapability='fictional-email-draft-review-v1';
export const emailTaskReviewEvents=Object.freeze(['reply_draft_saved','reply_draft_approved','follow_up_handed_off','contact_stopped']);
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.split(',').sort().join(','),'Unknown fictional task binding fields');
export function validateEmailTaskBinding(binding){
 exact(binding,'scope,manifest_sha256');const b=binding.scope;exact(b,'schema_version,capability,workspace_id,run_id,site_id,deploy_id,origin,namespace,recovery_generation,routes');
 check(b.schema_version===1&&[emailTaskProofCapability,emailTaskReviewCapability].includes(b.capability)&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id,b.recovery_generation].every(key)&&sha(binding.manifest_sha256),'Exact fictional task deployment and recovery binding required');
 const u=new URL(b.origin);check(u.protocol==='https:'&&u.origin===b.origin&&/^evz-redesign-proof-[a-z0-9-]{8,44}$/.test(b.namespace),'Fictional task origin or namespace changed');
 check(Array.isArray(b.routes)&&b.routes.length>0&&b.routes.length<=12&&new Set(b.routes.map(r=>r.project_id)).size===b.routes.length,'Bound exact fictional existing conversations');
 for(const r of b.routes){exact(r,'project_id,thread_id');check(key(r.project_id)&&key(r.thread_id),'Exact fictional conversation identity required');}return binding;
}
export function validateEmailTaskEnvelope(data,binding){
 validateEmailTaskBinding(binding);const b=binding.scope,m=data.email_task_source;
 exact(data,'schema_version,config,state,email_task_source');exact(m,'schema_version,kind,binding,config_sha256,source_state_sha256');
 check(m.schema_version===1&&m.kind===b.capability&&sha(m.source_state_sha256)&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(b),'Exact fictional task source manifest required');
 const c=data.config,s=data.state,review=b.capability===emailTaskReviewCapability;check(data.schema_version===1&&c.schema_version===1&&s.schema_version===1&&c.mode==='controlled'&&s.mode==='controlled'&&c.run_id===b.run_id&&s.run_id===b.run_id&&hash(c)===m.config_sha256&&hash(c.email_task_proof)===hash({schema_version:review?2:1,binding_sha256:hash(b)}),'Immutable fictional task configuration or run changed');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(c[flag]===false,'Fictional task execution must remain disabled');
 check(c.runtime?.enabled===false&&c.operations?.enabled===false&&c.transcript_ai?.enabled===false&&c.release?.approved===false&&c.call_release?.approved===false&&!c.shared_capability,'Fictional task release and provider execution remain disabled');
 check(Object.values(s.prospects).every(r=>r.controlled===true&&(!r.contact?.email||/@[^@]+\.invalid$/i.test(r.contact.email)))&&Object.keys(s.email_draft_tasks??{}).length<=100,'Fictional task scope or bounded task inventory changed');
 validateWritingProfiles(s);
 for(const [id,t] of Object.entries(s.email_draft_tasks??{}))check(key(id)&&t?.id===id&&b.routes.some(r=>r.project_id===t.project_id)&&sha(t.token_sha256)&&sha(t.workspace_sha256)&&['Ready','Review','Superseded',...(review?['Adopted']:[])].includes(t.status)&&(!t.result||hash(t.result)===t.result_sha256),'Invalid retained fictional task or result integrity');
 if(review)validateReviewEvidence(s);
}
function signedEvent(event){const {actor,fingerprint,...original}=event??{};check(['owner','friend'].includes(actor)&&fingerprint===hash({event:original,actor}),'Shared review signed event identity differs');return event;}
function validateReviewEvidence(s){
 for(const t of Object.values(s.email_draft_tasks??{}))if(t.status==='Adopted'||t.adoption_event){const e=signedEvent(s.events[t.adoption_event]);check(t.result&&sha(t.adoption_binding_sha256)&&e.id===t.adoption_event&&e.id==='agent-draft-'+t.id&&e.type==='reply_draft_saved'&&e.prospect_id===t.project_id&&e.actor===t.adopted_by&&e.at===t.adopted_at&&e.data.agent_task_id===t.id&&e.data.agent_result_sha256===t.result_sha256&&e.data.agent_context_sha256===t.context_sha256&&e.data.body===t.result.body&&hash(e.data.attachments??[])===hash(t.result.attachments??[]),'Shared task adoption event or result linkage differs');}
 for(const r of Object.values(s.prospects))for(const d of [r.reply_draft,...(r.reply_draft_history??[]),...(r.reply_drafts??[])].filter(Boolean)){
  if(d.content?.agent_origin||d.agent_task_id){const o=d.content?.agent_origin,t=s.email_draft_tasks?.[o?.task_id];exact(o,'task_id,result_sha256,context_sha256,source_ids,uncertainties');check(t?.adoption_event&&t.project_id===r.id&&o.result_sha256===t.result_sha256&&o.context_sha256===t.context_sha256&&hash(o.source_ids)===hash(t.result.source_ids)&&hash(o.uncertainties)===hash(t.result.uncertainties)&&sha(d.content.review_binding_sha256)&&d.sha256===hash(d.content),'Shared draft origin or exact content differs');}
  if(d.approval_event){const e=signedEvent(s.events[d.approval_event]);check(e.type==='reply_draft_approved'&&e.prospect_id===r.id&&e.actor===d.approved_by&&e.at===d.approved_at&&e.data.sha256===d.sha256&&e.data.approved===true&&e.data.facts_checked===true,'Shared exact content approval linkage differs');}
  if(d.status==='Approved; sending held')check(d.approval_event,'Shared approved content needs its separate signed approval');
 }
}
async function applyReviewRecord(app,s,tr){
 check(sharedDraftReview(app),'Shared reply review requires its exact review profile');check(['owner','friend'].includes(tr.actor),'Signed operator required');exact(tr.input,'event,revision');const {event,revision}=tr.input;exact(event,'id,prospect_id,type,at,data');check(key(event.id)&&key(event.prospect_id)&&Number.isSafeInteger(revision)&&emailTaskReviewEvents.includes(event.type)&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=+app.now()+60000,'Exact bounded signed reply review event required');check(app.store.emailTaskBinding.scope.routes.some(r=>r.project_id===event.prospect_id),'Choose an allowed fictional conversation');
 const fields={reply_draft_saved:'source_id,reply_sha256,source_sha256,body'+(Object.hasOwn(event.data??{},'attachments')?',attachments':''),reply_draft_approved:'sha256,approved,facts_checked',follow_up_handed_off:'to',contact_stopped:'reason'};exact(event.data,fields[event.type]);safeEmailTaskMaterial(event.data);
 if(event.type==='reply_draft_saved'){check(s.prospects[event.prospect_id]?.reply_draft,'Adopt a proposal before editing its saved reply');check(typeof event.data.body==='string'&&event.data.body.trim()&&event.data.body.length<=3000,'Write a bounded current reply');if(Object.hasOwn(event.data,'attachments'))check(Array.isArray(event.data.attachments)&&event.data.attachments.length===0,'Manual review may only remove attachments');}
 const prior=s.events[event.id];if(prior){check(prior.fingerprint===hash({event,actor:tr.actor}),'Event ID conflicts with saved evidence');return {duplicate:true,revision:s.revision};}
 if(['reply_draft_saved','reply_draft_approved'].includes(event.type))check(s.prospects[event.prospect_id].follow_up_owner===tr.actor,'Only the assigned signed operator may edit or approve this reply');
 if(['reply_draft_saved','reply_draft_approved'].includes(event.type)&&event.data.attachments===undefined)for(const part of currentReplyAttachments(s,event.prospect_id,s.prospects[event.prospect_id].reply_draft?.content.attachments??[])){check(part.bytes<=512000,'Shared review PDF exceeds the proof size limit; remove the bundle explicitly');if(event.type==='reply_draft_approved'){const read=await readProjectAsset(app,event.prospect_id,part.asset_id,part.version_id);check(read.original.sha256===part.sha256&&read.bytes.length===part.bytes&&read.bytes.subarray(0,5).toString()==='%PDF-','Exact approved reply PDF original changed');}}
 const reducer=new StudioLifecycle(null,app.now);reducer.config=app.config;reducer.store=app.store;return reducer.reduceEvent(s,event,{actor:tr.actor,expectedRevision:revision});
}
export async function recordEmailTaskReview(app,event,actor,revision){const config=await app.loadConfig();check(sharedDraftReview(app),'Shared reply review requires its exact review profile');const tr={type:'record',actor,at:app.now().toISOString(),input:{event,revision}};return app.change(s=>{const view=Object.create(app);view.config=config;view.now=()=>new Date(tr.at);view.snapshot=async()=>structuredClone(s);return applyReviewRecord(view,s,tr);},{configFingerprint:hash(config),emailTask:tr});}
export async function validateEmailTaskChange(before,after,options,binding,clock,raw){
 exact(options,'configFingerprint,emailTask');const tr=options.emailTask;exact(tr,'type,actor,at,input');
 check(options.configFingerprint===hash(before.config)&&hash(before.config)===hash(after.config)&&hash(before.email_task_source)===hash(after.email_task_source),'Fictional task configuration or source manifest changed');
 const time=Date.parse(tr.at),now=clock();check(typeof tr.at==='string'&&new Date(time).toISOString()===tr.at&&time<=+now&&time>+now-60000,'Current typed task transition time required');
 const expected=structuredClone(before.state),app={config:before.config,store:{key:'workspace',emailTaskBinding:binding},now:()=>new Date(tr.at),snapshot:async()=>structuredClone(expected),originalStore:blobProjectOriginalStore(raw)};
 if(tr.type==='adopt')await applyEmailTaskAdoption(app,expected,tr.input,tr.actor);else if(tr.type==='record')await applyReviewRecord(app,expected,tr);else applyEmailTaskTransition(app,expected,tr);
 check(hash(expected)===hash(after.state),'Typed task transition changed protected records or result evidence');
 // Independent original reads may outlast the transition or worker credential.
 const publicationTime=+clock();check(time<=publicationTime&&time>publicationTime-60000,'Current typed task transition time required before conditional publication');
 if(['create','result'].includes(tr.type)||tr.type==='adopt'&&before.state.email_draft_tasks[tr.input.id]?.status==='Review'){const t=after.state.email_draft_tasks[tr.input.id];check(Date.parse(t.expires_at)>publicationTime,'Email task expired before conditional publication');}
}
export function prepareEmailTaskProof({config,state,scope}){
 const c=structuredClone(config),s=structuredClone(state);c.email_task_proof={schema_version:scope.capability===emailTaskReviewCapability?2:1,binding_sha256:hash(scope)};
 // Preparing a new exact deployment preserves evidence but never transfers old worker authority.
 for(const t of Object.values(s.email_draft_tasks??{}))if(['Ready','Review'].includes(t.status)){t.status='Superseded';t.closure_reason='New fictional proof binding; prepare a new task';}
 const manifest={schema_version:1,kind:scope.capability,binding:structuredClone(scope),config_sha256:hash(c),source_state_sha256:hash(s)},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)},envelope={schema_version:1,config:c,state:s,email_task_source:manifest};
 validateEmailTaskEnvelope(envelope,binding);return {envelope,binding};
}
export function emailTaskBindingFromEnvironment(env){
 check(env.CONTEXT==='deploy-preview'&&env.EVZ_OPERATIONS_DESK_ENABLED==='fictional-preview','Fictional email tasks require the exact private preview');
 const binding=JSON.parse(env.EVZ_OPERATIONS_EMAIL_TASK_BINDING??'null');validateEmailTaskBinding(binding);const b=binding.scope;
 check(env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace,'Fictional task deployment binding changed');return binding;
}
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
export async function openFictionalEmailTaskApp({env,context,storeFactory=defaultStore,now=()=>new Date()}){
 const binding=emailTaskBindingFromEnvironment(env),b=binding.scope;
 check(context?.site?.id===b.site_id&&context?.deploy?.id===b.deploy_id&&context.deploy.context==='deploy-preview','Trusted fictional preview context required');
 const raw=await storeFactory(b.namespace),{ConditionalLifecycleStore}=await import('./lifecycle-store.mjs'),store=new ConditionalLifecycleStore(raw,{emailTaskBinding:binding,maxBytes:2_000_000,now});
 const app=await StudioLifecycle.fromStore({store,now});app.originalStore=blobProjectOriginalStore(raw);return app;
}
export async function openFictionalEmailTaskAuthority(options){
 const app=await openFictionalEmailTaskApp(options);return {origin:app.store.emailTaskBinding.scope.origin,context:(id,token)=>emailDraftTaskContext(app,id,token),readPdf:(id,token,asset,version)=>readEmailTaskAttachment(app,id,token,asset,version),submit:(id,token,result)=>submitEmailDraftResult(app,id,token,result),receipt:(id,token)=>emailDraftTaskReceipt(app,id,token)};
}
