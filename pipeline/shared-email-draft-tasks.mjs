import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {applyEmailTaskTransition,emailDraftTaskContext,emailDraftTaskReceipt,submitEmailDraftResult,readEmailTaskAttachment} from './email-draft-tasks.mjs';
import {blobProjectOriginalStore} from './shared-project-originals.mjs';
import {validateWritingProfiles} from './conversation-records.mjs';

export const emailTaskProofCapability='fictional-email-draft-task-v1';
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===names.split(',').sort().join(','),'Unknown fictional task binding fields');
export function validateEmailTaskBinding(binding){
 exact(binding,'scope,manifest_sha256');const b=binding.scope;exact(b,'schema_version,capability,workspace_id,run_id,site_id,deploy_id,origin,namespace,recovery_generation,routes');
 check(b.schema_version===1&&b.capability===emailTaskProofCapability&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id,b.recovery_generation].every(key)&&sha(binding.manifest_sha256),'Exact fictional task deployment and recovery binding required');
 const u=new URL(b.origin);check(u.protocol==='https:'&&u.origin===b.origin&&/^evz-redesign-proof-[a-z0-9-]{8,44}$/.test(b.namespace),'Fictional task origin or namespace changed');
 check(Array.isArray(b.routes)&&b.routes.length>0&&b.routes.length<=12&&new Set(b.routes.map(r=>r.project_id)).size===b.routes.length,'Bound exact fictional existing conversations');
 for(const r of b.routes){exact(r,'project_id,thread_id');check(key(r.project_id)&&key(r.thread_id),'Exact fictional conversation identity required');}return binding;
}
export function validateEmailTaskEnvelope(data,binding){
 validateEmailTaskBinding(binding);const b=binding.scope,m=data.email_task_source;
 exact(data,'schema_version,config,state,email_task_source');exact(m,'schema_version,kind,binding,config_sha256,source_state_sha256');
 check(m.schema_version===1&&m.kind===emailTaskProofCapability&&sha(m.source_state_sha256)&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(b),'Exact fictional task source manifest required');
 const c=data.config,s=data.state;check(data.schema_version===1&&c.schema_version===1&&s.schema_version===1&&c.mode==='controlled'&&s.mode==='controlled'&&c.run_id===b.run_id&&s.run_id===b.run_id&&hash(c)===m.config_sha256&&hash(c.email_task_proof)===hash({schema_version:1,binding_sha256:hash(b)}),'Immutable fictional task configuration or run changed');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(c[flag]===false,'Fictional task execution must remain disabled');
 check(c.runtime?.enabled===false&&c.operations?.enabled===false&&c.transcript_ai?.enabled===false&&c.release?.approved===false&&c.call_release?.approved===false&&!c.shared_capability,'Fictional task release and provider execution remain disabled');
 check(Object.values(s.prospects).every(r=>r.controlled===true&&(!r.contact?.email||/@[^@]+\.invalid$/i.test(r.contact.email)))&&Object.keys(s.email_draft_tasks??{}).length<=100,'Fictional task scope or bounded task inventory changed');
 validateWritingProfiles(s);
 for(const [id,t] of Object.entries(s.email_draft_tasks??{}))check(key(id)&&t?.id===id&&b.routes.some(r=>r.project_id===t.project_id)&&sha(t.token_sha256)&&sha(t.workspace_sha256)&&['Ready','Review','Superseded'].includes(t.status)&&(!t.result||hash(t.result)===t.result_sha256),'Invalid retained fictional task or result integrity');
}
export function validateEmailTaskChange(before,after,options,binding,now){
 exact(options,'configFingerprint,emailTask');const tr=options.emailTask;exact(tr,'type,actor,at,input');
 check(options.configFingerprint===hash(before.config)&&hash(before.config)===hash(after.config)&&hash(before.email_task_source)===hash(after.email_task_source),'Fictional task configuration or source manifest changed');
 const time=Date.parse(tr.at);check(typeof tr.at==='string'&&new Date(time).toISOString()===tr.at&&time<=+now&&time>+now-60000,'Current typed task transition time required');
 const expected=structuredClone(before.state),app={config:before.config,store:{key:'workspace',emailTaskBinding:binding},now:()=>new Date(tr.at)};
 applyEmailTaskTransition(app,expected,tr);
 check(hash(expected)===hash(after.state),'Typed task transition changed protected records or result evidence');
 // A task may expire while the conditional write is being prepared.
 if(['create','result'].includes(tr.type)){const t=after.state.email_draft_tasks[tr.input.id];check(Date.parse(t.expires_at)>+now,'Email task expired before conditional publication');}
}
export function prepareEmailTaskProof({config,state,scope}){
 const c=structuredClone(config),s=structuredClone(state);c.email_task_proof={schema_version:1,binding_sha256:hash(scope)};
 // Preparing a new exact deployment preserves evidence but never transfers old worker authority.
 for(const t of Object.values(s.email_draft_tasks??{}))if(['Ready','Review'].includes(t.status)){t.status='Superseded';t.closure_reason='New fictional proof binding; prepare a new task';}
 const manifest={schema_version:1,kind:emailTaskProofCapability,binding:structuredClone(scope),config_sha256:hash(c),source_state_sha256:hash(s)},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)},envelope={schema_version:1,config:c,state:s,email_task_source:manifest};
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
