import {check,hash} from './lifecycle.mjs';
import {conversationSchema} from './conversation-records.mjs';

export const dispatchEmailTaskSchema=Object.freeze({version:1,mode:'fictional-existing-thread-v1',ttl_seconds:7200,max_tasks:100,max_attachments:2,max_pdf_bytes:512000});
export const dispatchReplyBundleSchema=Object.freeze({version:1,mode:'exact-approved-task-reply-v1',max_attachments:2,max_pdf_bytes:512000});
export const dispatchEmailTaskPolicy=c=>c?.internal_dispatch?.email_draft_tasks;
export const dispatchReplyBundlePolicy=c=>c?.internal_dispatch?.mail?.reply_bundle;
const exact=(v,names)=>check(v&&Object.keys(v).sort().join(',')===names.split(',').sort().join(','),'Unknown or missing task/reply-bundle policy fields');
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
export function validateDispatchEmailPolicy(p){
 const t=p.email_draft_tasks,b=p.mail?.reply_bundle;check(Boolean(t)===Boolean(b),'Task authority and reply-bundle permission must be paired');if(!t)return false;
 check(p.capability==='shared-operations-exact-mail-v1'&&hash(p.conversation_records)===hash(conversationSchema),'Exact declared-thread mail and conversation schema required');
 exact(t,'version,mode,project_id,thread_id,recovery_generation');exact(b,'version,mode,project_id,thread_id,max_attachments,max_pdf_bytes');
 check(t.version===1&&t.mode===dispatchEmailTaskSchema.mode&&[t.project_id,t.thread_id,t.recovery_generation].every(key)&&b.version===1&&b.mode===dispatchReplyBundleSchema.mode&&b.project_id===t.project_id&&b.thread_id===t.thread_id&&b.max_attachments===2&&b.max_pdf_bytes===512000,'Exact bounded fictional task/reply-bundle policy required');
 check(p.routes.length===1&&p.routes[0].project_id===t.project_id&&p.routes[0].thread_id===t.thread_id&&p.routes[0].to.endsWith('@example.invalid'),'Task authority requires exactly one declared fictional conversation');return true;
}
export function dispatchTaskScope(c){const p=c.internal_dispatch;return {...p.binding,schema_version:1,capability:p.capability,mode:'production',state_schema:1,policy_sha256:hash(p)};}
export const sharedDispatchEmailTasks=app=>app.store?.key==='workspace'&&Boolean(app.store.dispatchBinding)&&Boolean(dispatchEmailTaskPolicy(app.config))&&app.config.shared_capability==='shared-operations-exact-mail-v1'&&hash(app.store.dispatchBinding?.scope)===hash(dispatchTaskScope(app.config));
export function emailDraftReviewBinding(c){
 if(c?.shared_capability==='shared-mailbox-work-v1')return hash({capability:c.shared_capability,mailbox:c.mailbox,worker:c.mailbox_work});
 if(dispatchEmailTaskPolicy(c))return hash({scope:dispatchTaskScope(c),task_schema:dispatchEmailTaskSchema,reply_bundle:dispatchReplyBundlePolicy(c)});
 return c?.email_task_proof?.schema_version===2?c.email_task_proof.binding_sha256:null;
}
