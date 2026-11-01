import {check,hash} from './lifecycle.mjs';
import {dispatchEmailTaskPolicy} from './email-draft-policy.mjs';

const recordTypes=['reply_reviewed','reply_draft_saved','reply_draft_approved','follow_up_handed_off','contact_stopped'];
const taskTypes=['create','result','adopt','record'];
const mailTypes=['approve','reserve','materialize','dispatch','sent','read','verified','hold'];
const path=(...parts)=>parts;

// This is a companion to existing typed witnesses, never a new authority or saved record.
export function emailDependencyContract(before,options,binding,etag){
 const paired=Boolean(dispatchEmailTaskPolicy(before.config));
 const preview=['fictional-email-draft-task-v1','fictional-email-draft-review-v1'].includes(binding?.scope?.capability);
 if(!binding||!paired&&!preview)return null;
 let option=options.emailTask?'emailTask':paired&&options.projectMail?'projectMail':paired&&options.mailRecord?'mailRecord':null;
 if(!option&&paired)option=['manualRecord','projectRecord'].find(k=>recordTypes.includes(options[k]?.event?.type));
 if(!option)return null;
 const w=options[option],s=before.state,task=option==='emailTask',mail=option==='projectMail';
 check((task?taskTypes:mail?mailTypes:recordTypes).includes(task||mail?w.type:w.event?.type),'Unknown email dependency contract command');
 const event=task&&w.type==='record'?w.input?.event:!task&&!mail?w.event:null;
 if(event)check(recordTypes.includes(event.type),'Unknown email dependency contract record');
 const taskId=task&&!event?w.input?.id:null;
 const project=event?.prospect_id??(task?(w.type==='create'?w.input?.project_id:s.email_draft_tasks?.[taskId]?.project_id):w.selector?.project_id);
 check(typeof project==='string'&&Object.hasOwn(s.prospects,project)&&typeof etag==='string'&&etag.length>0,'Email dependency contract needs its actual workspace and project');
 const writes=[path('state','revision'),path('state','updated_at')];
 const reads=[
  {name:'whole-state-replay',paths:[[]]},
  {name:'policy-runtime-recovery',paths:[['config'],['dispatch_source'],['email_task_source']]},
  {name:'client-source-assignment-restriction',paths:[['state','prospects',project]]},
  {name:'incoming-and-unsettled-send-predicates',paths:[['state','operations'],['state','actions'],['state','prospects']]},
  {name:'historical-event-identity-and-order',paths:[['state','events']]},
  {name:'style-and-eligible-catalogue',paths:[['state','operator_writing_styles'],['state','asset_index']]},
  {name:'task-identity-token-uniqueness-and-capacity',paths:[['state','email_draft_tasks']]}
 ];
 if(task&&!event){
  writes.push(path('state','email_draft_tasks',taskId));
  if(w.type==='create'){
   writes.push(path('state','prospects',project,'email_draft_task_id'));
   const previous=s.prospects[project].email_draft_task_id;
   if(previous)writes.push(path('state','email_draft_tasks',previous));
  }
 }
 if(event||task&&w.type==='adopt'){
  const eventId=event?.id??'agent-draft-'+taskId;
  writes.push(path('state','prospects',project),path('state','events',eventId),path('state','team_notifications'),path('state','operations','cycle'));
  reads.push({name:'notification-and-cycle-sources',paths:[['state','prospects'],['state','actions'],['state','exceptions'],['state','operations'],['state','runtime'],['state','team_notifications']]});
  if(['follow_up_handed_off','contact_stopped','reply_reviewed'].includes(event?.type)){
   for(const [id,a]of Object.entries(s.actions))if(a.prospect_id===project)writes.push(path('state','actions',id));
  }
  if(event?.type==='reply_reviewed'&&event.data.outcome==='requested_info')writes.push(path('state','actions',eventId+'-information_task'));
  if(event?.type==='contact_stopped'&&s.prospects[project].apollo?.sequence_id)writes.push(path('state','actions',eventId+'-sequence_stop'));
 }
 if(mail){
  writes.push(path('state','actions',w.action_id));
  if(w.type==='approve')writes.push(path('state','events',w.approval_event_id));
  else writes.push(path('state','operations','requests',w.action_id+'-intent'),path('state','operations','email',w.action_id));
  reads.push({name:'sender-reservations-legacy-approvals-and-capacity',paths:[['state','operations','requests'],['state','prospects'],['state','actions']]});
 }
 return {version:1,boundary:'whole-workspace',source:{etag,revision:s.revision,envelope_sha256:hash(before),binding_sha256:hash(binding)},
  witness:{option,command:event?.type??w.type,actor:w.actor,project_id:project,identity:event?.id??taskId??w.action_id,at:w.at,deadline:w.deadline??null,sha256:hash(w)},reads,writes};
}

export function validateEmailDependencyContract(contract,before,after,options,binding,etag){
 const expected=emailDependencyContract(before,options,binding,etag);
 check(expected&&contract&&hash(contract)===hash(expected),'Incomplete or changed email dependency contract');
 const permitted=parts=>contract.writes.some(prefix=>prefix.length<=parts.length&&prefix.every((key,i)=>key===parts[i]));
 const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 function unchanged(a,b,parts=[]){
  if(JSON.stringify(a)===JSON.stringify(b)||permitted(parts))return;
  if((object(a)||a===undefined)&&(object(b)||b===undefined)){
   const ak=Object.keys(a??{}),bk=Object.keys(b??{}),keys=[...new Set([...ak,...bk])];
   // Historical object order is hashed; equal-valued reordering is still a write.
   check(keys.length>0&&!(ak.length===bk.length&&ak.every(k=>bk.includes(k))&&JSON.stringify(ak)!==JSON.stringify(bk)),'Undeclared write changed protected email dependency contract state');
   for(const key of keys)unchanged(a?.[key],b?.[key],[...parts,key]);
   return;
  }
  check(false,'Undeclared write changed protected email dependency contract state');
 }
 unchanged(before,after);
}
