import {requestedInformationSource,requestedInformationDraftCurrent} from './requested-information.mjs';
import {check,hash,businessDate} from './lifecycle.mjs';
import {replyDraftCurrent} from './reply-content.mjs';
import {currentReplyAttachments} from './reply-attachments.mjs';
import {assertMailboxWorkReplySource} from './mailbox-work.mjs';
import {outreachReviewView} from './outreach-review.mjs';
import {outreachFooter} from './outreach-content.mjs';
import {mailMessageId} from './google-hosted-transport.mjs';

export const mailboxDeliveryCapability='shared-mailbox-delivery-v1';
export const isMailboxDeliveryCapability=value=>[mailboxDeliveryCapability,'shared-operations-desk-v1'].includes(value);
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const count=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const text=(v,max=500)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const exact=(v,fields)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.split(',').sort().join(','),'Closed mailbox delivery fields required');
const operator=a=>check(['owner','friend'].includes(a),'Signed assigned operator required');
export function validateMailboxDeliveryPolicy(p){
 exact(p,'schema_version,site_id,deploy_id,origin,account,grant_id,from,recovery_generation,expires_at,max_intents,max_per_day,kinds,sender_ready,postal_address_verified');
 check(p.schema_version===1&&[p.site_id,p.deploy_id,p.grant_id,p.recovery_generation].every(key)&&utc(p.expires_at),'Exact delivery identity required');
 const origin=new URL(p.origin);check(origin.protocol==='https:'&&origin.origin===p.origin,'Exact delivery HTTPS origin required');
 check(typeof p.account==='string'&&/^[A-Za-z0-9._%+-]+@evzdigital\.studio$/.test(p.account)&&p.from==='hello@evzdigital.studio','Exact business account and sender required');
 check(count(p.max_intents,10000)&&p.max_intents>0&&count(p.max_per_day,500)&&p.max_per_day>0&&[hash(['reply','outreach']),hash(['reply','outreach','requested-information'])].includes(hash(p.kinds))&&typeof p.sender_ready==='boolean'&&typeof p.postal_address_verified==='boolean','Finite closed delivery policy required');return p;
}
function policy(c,now,live=true){
 check(isMailboxDeliveryCapability(c.shared_capability)&&c.mode==='production'&&c.outreach_enabled===false,'Exact mailbox delivery capability required');
 const p=validateMailboxDeliveryPolicy(c.mailbox_delivery);check(!p.kinds.includes('requested-information')||c.shared_capability==='shared-operations-desk-v1','Requested information requires operations capability');check(utc(now)&&(!live||Date.parse(now)<Date.parse(p.expires_at)),'Mailbox delivery policy expired');
 check(c.mailbox?.account===p.account&&c.mailbox?.grant_id===p.grant_id&&c.sender?.email===p.from,'Delivery account differs from canonical mailbox');return p;
}
const approvalId=(s,p,a,epoch)=>'mail-approval-'+hash({run:s.run_id,package:p.sha256,actor:a,epoch}).slice(0,40);
export const mailboxDeliveryIntentId=(state,approval)=>'mail-delivery-'+hash({run:state.run_id,project:approval.package.project_id,package:approval.package.sha256,approval:approval.id}).slice(0,40);
function fresh(p,at){return {schema_version:1,policy_sha256:hash(p),account:p.account,grant_id:p.grant_id,recovery_generation:p.recovery_generation,paused:true,pause:null,epoch:0,allowance_id:null,allowances:{},approvals:{},intents:{},updated_at:at};}
function bound(d,p){check(d.policy_sha256===hash(p)&&d.recovery_generation===p.recovery_generation,'Delivery policy changed; retained intents remain held');}
function allowanceShape(a){exact(a,'id,evidence_ref,observed_at,expires_at,included_only,max_intents');check(key(a.id)&&text(a.evidence_ref)&&utc(a.observed_at)&&utc(a.expires_at)&&a.expires_at>a.observed_at&&a.included_only===true&&count(a.max_intents,10000)&&a.max_intents>0,'Finite reviewed delivery allowance required');}
function packageShape(p){
 exact(p,'schema_version,kind,project_id,owner,from,to,subject,body,attachments,thread_id,in_reply_to,references,source,sha256');
 const {sha256,...content}=p;check(p.schema_version===1&&['reply','outreach','requested-information'].includes(p.kind)&&key(p.project_id)&&['owner','friend'].includes(p.owner)&&p.from==='hello@evzdigital.studio'&&typeof p.to==='string'&&/^[^\s<>@]+@[^\s<>@]+$/.test(p.to)&&text(p.subject,200)&&typeof p.body==='string'&&p.body.trim()&&p.body.length<=12000&&Array.isArray(p.attachments)&&p.attachments.length<=2&&sha(sha256)&&hash(content)===sha256,'Invalid retained exact package');
 check(p.thread_id===null||key(p.thread_id),'Invalid exact thread');check(p.in_reply_to===null||text(p.in_reply_to,1000),'Invalid reply header');check(Array.isArray(p.references)&&p.references.length<=30&&new Set(p.references).size===p.references.length&&p.references.every(x=>/^<[^\s<>@]+@[^\s<>@]+>$/.test(x)&&x.length<255),'Invalid references');
 let total=0;for(const a of p.attachments){check(key(a.asset_id)&&key(a.version_id)&&sha(a.sha256)&&a.mime==='application/pdf'&&a.filename===a.sha256+'.pdf'&&count(a.bytes,20000000)&&a.bytes>0,'Exact bounded PDF descriptor required');total+=a.bytes;}check(total<=20000000,'Combined PDF bound exceeded');
 if(p.kind==='requested-information')exact(p.source,'draft_sha256,approval_event,request_id,request_sha256,call_id');
 else if(p.kind==='reply')exact(p.source,'draft_sha256,approval_event,reply_sha256,source_id');
 else exact(p.source,'draft_sha256,approval_event,scheduled_at,kind,company_id,timezone,first_intent,not_before');
 check(sha(p.source.draft_sha256)&&key(p.source.approval_event),'Exact reviewed source required');
 if(p.kind==='requested-information')check(key(p.source.request_id)&&key(p.source.call_id)&&sha(p.source.request_sha256)&&p.thread_id===null&&p.in_reply_to===null&&p.references.length===0,'Exact requested source required');
 else if(p.kind==='reply')check(sha(p.source.reply_sha256)&&key(p.source.source_id)&&p.thread_id!==null,'Exact reply source required');
 else check(utc(p.source.scheduled_at)&&['new-business','previously-called','follow-up'].includes(p.source.kind)&&key(p.source.company_id)&&text(p.source.timezone,80)&&(p.source.first_intent===null||key(p.source.first_intent))&&(p.source.not_before===null||utc(p.source.not_before))&&p.attachments.length===0,'Exact outreach source required');
}
// Project new receipts into the existing cadence/review reader without rewriting historical state.
export function mailboxDeliveryOutreachState(state){
 const s={...state,outreach_delivery:{...state.outreach_delivery,intents:{...state.outreach_delivery?.intents}}};
 for(const i of Object.values(state.mailbox_delivery?.intents??{}))if(i.package.kind==='outreach')s.outreach_delivery.intents[i.id]={id:i.id,project_id:i.package.project_id,company_id:i.package.source.company_id,to:i.package.to,kind:i.package.source.kind,owner:i.package.owner,package_sha256:i.package.source.draft_sha256,timezone:i.package.source.timezone,sender_day:i.sender_day,status:i.status,receipt:i.receipt};
 return s;
}
export function mailboxDeliveryPackage(state,config,input,actor,now){
 exact(input,'kind,project_id');operator(actor);policy(config,now);check(key(input.project_id),'Exact project required');const r=state.prospects[input.project_id];check(r?.follow_up_owner===actor,'Assigned operator required');
 let result;
 if(input.kind==='requested-information'){
  const source=requestedInformationSource(state,config,r.id,now),d=r.requested_information.draft,footer=outreachFooter(config.sender?.postal_address),e=state.events[d?.approval_event];
  check(config.mailbox_delivery.postal_address_verified&&footer&&config.sender.postal_address.trim(),'Commercial mailing address remains required');
  check(d?.status==='Approved'&&d.approved_by===actor&&e?.actor===actor&&e.type==='requested_information_approve'&&e.data?.draft_sha256===d.sha256&&requestedInformationDraftCurrent(state,config,r.id,now),'Exact requested content approval required');
  result={schema_version:1,kind:'requested-information',project_id:r.id,owner:actor,from:config.sender.email,to:d.content.to,subject:d.content.subject,body:d.content.body+'\n\n'+d.content.signature+'\n\n'+footer,attachments:currentReplyAttachments(state,r.id,d.content.attachments).map(a=>({...a,filename:a.sha256+'.pdf'})),thread_id:null,in_reply_to:null,references:[],source:{draft_sha256:d.sha256,approval_event:d.approval_event,request_id:source.request.id,request_sha256:source.sha256,call_id:source.request.call_id}};
 }else if(input.kind==='reply'){
  assertMailboxWorkReplySource(state,config,r.id,now);const d=r.reply_draft,e=state.events[d?.approval_event];
  check(d?.status==='Approved; sending held'&&replyDraftCurrent(r,d,config,state)&&e?.type==='reply_draft_approved'&&e.prospect_id===r.id&&e.actor===actor&&d.approved_by===actor&&e.data?.sha256===d.sha256&&e.data.approved===true&&e.data.facts_checked===true,'Separate exact content and facts approval required');
  const c=d.content,refs=(r.reply.content.references??'').split(/\s+/).filter(Boolean).filter(x=>x!==c.in_reply_to);
  result={schema_version:1,kind:'reply',project_id:r.id,owner:actor,from:c.from,to:c.to,subject:c.subject,body:c.body+'\n\n'+c.signature,attachments:currentReplyAttachments(state,r.id,c.attachments??[]).map(a=>({...a,filename:a.sha256+'.pdf'})),thread_id:c.thread_id,in_reply_to:c.in_reply_to,references:[...new Set(refs),c.in_reply_to],source:{draft_sha256:d.sha256,approval_event:d.approval_event,reply_sha256:d.reply_sha256,source_id:d.source_id}};
 }else{
  check(input.kind==='outreach','Closed delivery kind required');const p=config.mailbox_delivery,footer=outreachFooter(config.sender?.postal_address);
  check(p.postal_address_verified&&footer&&config.sender.postal_address.trim(),'Commercial mailing address remains required');
  const s=mailboxDeliveryOutreachState(state),d=state.outreach_review?.drafts?.[r.id],view=outreachReviewView(s,null,new Date(now)).items.find(x=>x.project_id===r.id),e=state.events[d?.schedule?.approval_event];
  check(view?.eligible&&d.schedule&&d.owner===actor&&d.schedule.approved_by===actor&&e?.type==='outreach_batch_approved'&&e.actor===actor&&e.data?.facts_checked===true&&e.data.items?.some(x=>x.project_id===r.id&&x.sha256===d.sha256),'Exact eligible approved outreach required');
  const {sha256,saved_at,schedule,...content}=d;check(hash(content)===sha256&&d.body.endsWith(footer)&&Date.parse(now)<Date.parse(schedule.at)+60000,'Outreach package changed or slot missed');
  check(!Object.values(state.actions??{}).some(a=>a.prospect_id===r.id&&a.payload?.exact_mail&&!a.payload.internal_notification&&state.operations?.requests?.[a.id+'-intent']?.dispatch_started_at&&state.operations.requests[a.id+'-intent'].status!=='Verified'),'Reconcile the original exact mail action');
  const sync=state.mailbox_sync;check(sync?.policy_sha256===hash(config.mailbox)&&sync.phase==='history'&&utc(sync.checked_at)&&sync.checked_at<=now&&!sync.pending.length&&!sync.page&&!sync.next_cursor&&!sync.hold&&!state.mailbox_failure,'Mailbox catch-up required before outreach');
  check(!Object.values(sync.held_sources??{}).some(x=>x.matched_projects?.includes(r.id))&&!Object.values(state.inquiry_intake?.sources??{}).some(x=>(x.project_id===r.id||x.paused_projects?.includes(r.id)||x.candidates?.includes(r.id)||x.source?.content?.from?.toLowerCase()===r.contact.email.toLowerCase())&&!(x.status==='Excluded'&&['newsletter','spam','automatic_reply'].includes(x.classification))),'Outreach has unresolved incoming evidence');
  result={schema_version:1,kind:'outreach',project_id:r.id,owner:actor,from:d.from,to:d.to,subject:d.subject,body:d.body,attachments:[],thread_id:null,in_reply_to:null,references:[],source:{draft_sha256:d.sha256,approval_event:schedule.approval_event,scheduled_at:schedule.at,kind:d.kind,company_id:d.company_id,timezone:d.timezone,first_intent:d.first_intent??null,not_before:d.not_before??null}};
 }
 check((result.kind==='requested-information'||result.to.toLowerCase()===r.contact.email.toLowerCase())&&result.from===config.mailbox_delivery.from,'Exact current recipient and sender required');const p={...result,sha256:hash(result)};packageShape(p);
 check(!Object.values(state.mailbox_delivery?.intents??{}).some(i=>i.package.project_id===r.id&&i.status!=='Verified'&&i.package.sha256!==p.sha256),'Reconcile the original unsettled delivery before replacing its package');return p;
}
function active(d,p,now){bound(d,p);check(!d.paused&&now>=d.updated_at&&p.sender_ready,'Delivery paused, time moved backwards or sender unverified');const a=d.allowances[d.allowance_id];check(a&&a.recorded_at<=now&&now<a.expires_at,'Current finite allowance required');return a;}
function currentApproval(state,c,a,now){const p=policy(c,now),d=state.mailbox_delivery;active(d,p,now);check(a&&a.epoch===d.epoch,'Fresh exact send approval required after pause');const current=mailboxDeliveryPackage(state,c,{kind:a.package.kind,project_id:a.package.project_id},a.actor,now);check(current.sha256===a.package.sha256,'Approved delivery source changed');return current;}
export function assertMailboxDeliveryCurrent(state,config,id,now){
 validateMailboxDeliveryState(state,config);check(key(id),'Exact intent identity required');const d=state.mailbox_delivery,i=d?.intents[id];check(i&&['Reserved','Uncertain'].includes(i.status),'Exact unsettled delivery intent required');
 const p=policy(config,now),a=active(d,p,now);check(i.allowance_id===a.id&&i.expires_at>now&&businessDate(new Date(now))===i.sender_day,'Delivery reservation expired or allowance replaced');currentApproval(state,config,d.approvals[i.approval_id],now);
 if(i.package.kind==='outreach')check(now>=i.package.source.scheduled_at&&now<new Date(Date.parse(i.package.source.scheduled_at)+60000).toISOString()&&(!i.package.source.not_before||now>=i.package.source.not_before),'Exact approved outreach slot required');return i;
}
function mimeShape(m,id){exact(m,'reference,sha256,bytes,message_id');check(sha(m.sha256)&&m.reference==='mailbox-mime/'+m.sha256&&count(m.bytes,28000000)&&m.bytes>0&&m.message_id===mailMessageId(id),'Exact immutable MIME metadata required');}
function receiptShape(r,i){exact(r,'message_id,thread_id,rfc_message_id,mime_sha256,sent_at');check(key(r.message_id)&&key(r.thread_id)&&r.rfc_message_id===i.mime.message_id&&r.mime_sha256===i.mime.sha256&&utc(r.sent_at)&&Date.parse(r.sent_at)>=Date.parse(i.claimed_at)-60000&&(!i.package.thread_id||r.thread_id===i.package.thread_id)&&(!i.provider_message_id||r.message_id===i.provider_message_id)&&(!i.provider_thread_id||r.thread_id===i.provider_thread_id),'Receipt differs from original claimed MIME');}
export function validateMailboxDeliveryState(state,config){
 const p=validateMailboxDeliveryPolicy(config.mailbox_delivery),d=state.mailbox_delivery;if(d===undefined)return;
 exact(d,'schema_version,policy_sha256,account,grant_id,recovery_generation,paused,pause,epoch,allowance_id,allowances,approvals,intents,updated_at');check(d.account===p.account&&d.grant_id===p.grant_id,'Retained delivery account or grant differs');check(d.schema_version===1&&sha(d.policy_sha256)&&key(d.recovery_generation)&&typeof d.paused==='boolean'&&count(d.epoch,Number.MAX_SAFE_INTEGER)&&utc(d.updated_at),'Invalid delivery state');
 if(d.pause!==null){exact(d.pause,'by,at,reason');operator(d.pause.by);check(utc(d.pause.at)&&d.pause.at<=d.updated_at&&text(d.pause.reason),'Invalid pause');}
 for(const [name,max]of [['allowances',100],['approvals',10000],['intents',10000]])check(d[name]&&typeof d[name]==='object'&&!Array.isArray(d[name])&&Object.keys(d[name]).length<=max,'Bounded delivery history required');
 for(const [id,a]of Object.entries(d.allowances)){const {used_intents,recorded_by,recorded_at,...input}=a;allowanceShape(input);operator(recorded_by);check(id===a.id&&count(used_intents,a.max_intents)&&utc(recorded_at)&&a.observed_at<=recorded_at&&recorded_at<a.expires_at&&recorded_at<=d.updated_at,'Invalid allowance history');}
 check(d.allowance_id===null||Object.hasOwn(d.allowances,d.allowance_id),'Missing current allowance');
 for(const [id,a]of Object.entries(d.approvals)){exact(a,'id,actor,at,epoch,package');operator(a.actor);packageShape(a.package);check(key(id)&&a.id===id&&utc(a.at)&&a.at<=d.updated_at&&count(a.epoch,d.epoch)&&a.actor===a.package.owner&&id===approvalId(state,a.package,a.actor,a.epoch),'Invalid exact send approval');}
 const charged={};for(const [id,i]of Object.entries(d.intents)){
  exact(i,'id,approval_id,package,allowance_id,sender_day,reserved_at,expires_at,status,mime,claimed_at,provider_message_id,provider_thread_id,receipt,hold');
  const a=d.approvals[i.approval_id],grant=d.allowances[i.allowance_id];check(a&&grant&&i.id===id&&id===mailboxDeliveryIntentId(state,a)&&hash(i.package)===hash(a.package)&&utc(i.reserved_at)&&a.at<=i.reserved_at&&i.reserved_at<=d.updated_at&&utc(i.expires_at)&&i.expires_at>i.reserved_at&&i.expires_at<=grant.expires_at&&i.sender_day===businessDate(new Date(i.reserved_at))&&['Reserved','Uncertain','Verified','Held'].includes(i.status),'Invalid permanent delivery intent');mimeShape(i.mime,id);charged[grant.id]=(charged[grant.id]??0)+1;
  check(i.claimed_at===null||utc(i.claimed_at)&&i.claimed_at>=i.reserved_at&&i.claimed_at<i.expires_at&&i.claimed_at<=d.updated_at,'Invalid dispatch claim');check((i.provider_message_id===null&&i.provider_thread_id===null)||(key(i.provider_message_id)&&key(i.provider_thread_id)&&i.claimed_at!==null),'Invalid provider acknowledgement');check(i.status!=='Reserved'||i.claimed_at===null,'Reserved intent was already claimed');check(!['Uncertain','Verified'].includes(i.status)||i.claimed_at!==null,'Missing permanent dispatch claim');
  if(i.receipt!==null){check(i.status==='Verified'&&i.claimed_at!==null,'Receipt without dispatch');receiptShape(i.receipt,i);check(Date.parse(i.receipt.sent_at)<=Date.parse(d.updated_at)+60000,'Future receipt');}else check(i.status!=='Verified','Verified intent lacks original receipt');
  check(i.hold===null||text(i.hold),'Invalid delivery hold');
 }
 for(const a of Object.values(d.allowances))check((charged[a.id]??0)===a.used_intents,'Permanent allowance charges differ');
 if(d.policy_sha256===hash(p)){check(Object.keys(d.intents).length<=p.max_intents,'Lifetime intent ceiling exceeded');const days={};for(const i of Object.values(d.intents)){days[i.sender_day]=(days[i.sender_day]??0)+1;check(days[i.sender_day]<=p.max_per_day&&i.expires_at<=p.expires_at,'Delivery policy bounds exceeded');}}
}
export function mailboxDeliveryStatus(state,config,now){const p=policy(config,now,false);validateMailboxDeliveryState(state,config);const d=state.mailbox_delivery,a=d?.allowances[d.allowance_id];return {status:!d?'Allowance required':d.policy_sha256!==hash(p)?'Policy changed':now>=p.expires_at?'Expired':d.paused?'Paused':!p.sender_ready?'Sender unverified':!a||now>=a.expires_at?'Allowance required':a.used_intents>=a.max_intents?'Allowance exhausted':'Ready',paused:d?.paused??true,allowance:a?structuredClone(a):null,intents:Object.keys(d?.intents??{}).length,uncertain:Object.values(d?.intents??{}).filter(i=>i.claimed_at&&i.status!=='Verified').length,allowance_basis:'Finite reviewed intents; provider and hosting balances are not live metered'};}
export function applyMailboxDeliveryTransition(state,config,tr){
 exact(tr,'type,actor,at,input');const {type,actor,at,input}=tr,p=policy(config,at,!['verify','ack','hold','pause'].includes(type));validateMailboxDeliveryState(state,config);const next=structuredClone(state),d=next.mailbox_delivery??=fresh(p,at);if(!['verify','ack','hold','pause'].includes(type))bound(d,p);check(at>=d.updated_at,'Delivery time moved backwards');d.updated_at=at;let result,duplicate=false;
 if(type==='approve-batch'){
  operator(actor);exact(input,'revision,items');check(input.revision===state.revision&&Array.isArray(input.items)&&input.items.length>0&&input.items.length<=100,'Review 1-100 exact send packages');
  check(new Set(input.items.map(i=>i.project_id)).size===input.items.length,'Each business appears once');
  const approvals=[];
  for(const item of input.items){exact(item,'project_id,package_sha256');const packet=mailboxDeliveryPackage(next,config,{kind:'outreach',project_id:item.project_id},actor,at);check(packet.sha256===item.package_sha256,'Exact batch package changed');const id=approvalId(next,packet,actor,d.epoch);d.approvals[id]??={id,actor,at,epoch:d.epoch,package:packet};approvals.push(id);}
  result={approval_ids:approvals};
 }else if(['approve','pause','allowance'].includes(type)){
  operator(actor);check(input.revision===state.revision,'Current delivery revision required');
  if(type==='pause'){exact(input,'revision,paused,reason');check(typeof input.paused==='boolean'&&text(input.reason),'Exact pause decision required');if(input.paused)d.epoch++;d.paused=input.paused;d.pause={by:actor,at,reason:input.reason};}
  if(type==='allowance'){exact(input,'revision,allowance');allowanceShape(input.allowance);const a=input.allowance;check(a.observed_at<=at&&at<a.expires_at&&a.expires_at<=p.expires_at,'Allowance future, expired or beyond policy');check(!Object.hasOwn(d.allowances,a.id),'Allowance identity already used');check(Object.keys(d.allowances).length<100,'Allowance history full');d.allowances[a.id]={...structuredClone(a),used_intents:0,recorded_by:actor,recorded_at:at};d.allowance_id=a.id;}
  if(type==='approve'){exact(input,'revision,kind,project_id,package_sha256');const packet=mailboxDeliveryPackage(next,config,{kind:input.kind,project_id:input.project_id},actor,at);check(packet.sha256===input.package_sha256,'Review the exact package');const id=approvalId(next,packet,actor,d.epoch);if(d.approvals[id])duplicate=true;else d.approvals[id]={id,actor,at,epoch:d.epoch,package:packet};result={approval_id:id,package:packet};}
 }else{
  check(actor==='delivery','Trusted delivery worker required');
  if(type==='reserve'){
   exact(input,'revision,approval_id,mime');check(input.revision===state.revision&&key(input.approval_id),'Current delivery revision and approval identity required');const a=d.approvals[input.approval_id],grant=active(d,p,at),packet=currentApproval(next,config,a,at),id=mailboxDeliveryIntentId(next,a);mimeShape(input.mime,id);
   check(!d.intents[id],'Original intent already reserved; reconcile without resend');check(Object.keys(d.intents).length<p.max_intents&&grant.used_intents<grant.max_intents,'Finite delivery allowance exhausted');const day=businessDate(new Date(at));check(Object.values(d.intents).filter(i=>i.sender_day===day).length<p.max_per_day,'Daily delivery ceiling reached');
   if(packet.kind==='reply')check(!Object.values(d.intents).some(i=>i.package.kind==='reply'&&i.package.project_id===packet.project_id&&i.package.source.source_id===packet.source.source_id),'Original reply already reserved');
   else if(packet.kind==='requested-information')check(!Object.values(d.intents).some(i=>i.package.kind==='requested-information'&&i.package.project_id===packet.project_id&&i.package.source.call_id===packet.source.call_id),'Original requested response already reserved; reconcile without resend');
   else{
    const previous=Object.values(mailboxDeliveryOutreachState(next).outreach_delivery.intents),same=previous.filter(i=>i.company_id===packet.source.company_id||i.to?.toLowerCase()===packet.to.toLowerCase());
    check(packet.source.kind==='follow-up'?same.length===1&&same[0].id===packet.source.first_intent&&same[0].status==='Verified'&&same[0].to.toLowerCase()===packet.to.toLowerCase():same.length===0,'Original business or recipient intent must be reconciled');check(packet.source.kind!=='new-business'||previous.filter(i=>i.kind==='new-business'&&i.sender_day===day).length<100,'Daily 100 new-business ceiling reached');
   }
   const expires_at=new Date(Math.min(Date.parse(p.expires_at),Date.parse(grant.expires_at),Date.parse(at)+25000,...(packet.kind==='outreach'?[Date.parse(packet.source.scheduled_at)+60000]:[]))).toISOString();
   d.intents[id]={id,approval_id:a.id,package:structuredClone(packet),allowance_id:grant.id,sender_day:day,reserved_at:at,expires_at,status:'Reserved',mime:structuredClone(input.mime),claimed_at:null,provider_message_id:null,provider_thread_id:null,receipt:null,hold:null};grant.used_intents++;assertMailboxDeliveryCurrent(next,config,id,at);result={id};
  }else{
   check(key(input.id)&&Object.hasOwn(d.intents,input.id),'Original intent required');const i=d.intents[input.id];result={id:i.id};
   if(type==='claim'){exact(input,'id');assertMailboxDeliveryCurrent(next,config,i.id,at);check(i.status==='Reserved'&&!i.claimed_at,'Original dispatch already claimed; never resend');i.status='Uncertain';i.claimed_at=at;}
   else if(type==='ack'){exact(input,'id,message_id,thread_id');check(i.claimed_at&&['Uncertain','Held'].includes(i.status)&&key(input.message_id)&&key(input.thread_id)&&(!i.package.thread_id||input.thread_id===i.package.thread_id),'Exact original dispatch acknowledgement required');check(!i.provider_message_id||i.provider_message_id===input.message_id&&i.provider_thread_id===input.thread_id,'Conflicting acknowledgement');i.provider_message_id=input.message_id;i.provider_thread_id=input.thread_id;}
   else if(type==='verify'){exact(input,'id,receipt');check(i.claimed_at,'Cannot verify an unclaimed intent');receiptShape(input.receipt,i);check(Date.parse(input.receipt.sent_at)<=Date.parse(at)+60000,'Future sender receipt');if(i.receipt){check(hash(i.receipt)===hash(input.receipt),'Conflicting original receipt');duplicate=true;}else{i.receipt=structuredClone(input.receipt);i.status='Verified';i.hold=null;}}
   else if(type==='hold'){exact(input,'id,reason');check(i.status!=='Verified'&&text(input.reason),'Exact unresolved hold required');i.hold=input.reason;i.status='Held';}
   else check(false,'Unsupported delivery transition');
  }
 }
 if(!duplicate){d.updated_at=at;next.revision++;next.updated_at=at;validateMailboxDeliveryState(next,config);state.mailbox_delivery=d;state.revision=next.revision;state.updated_at=at;}
 return {...result,duplicate,...mailboxDeliveryStatus(state,config,at)};
}
// Invoke immediately before CAS with the store-owned current clock, after independent replay.
export function assertMailboxDeliveryTransitionLive(before,after,config,tr,now){
 if(['reserve','claim'].includes(tr.type)){policy(config,now);const id=tr.type==='claim'?tr.input.id:mailboxDeliveryIntentId(after,after.mailbox_delivery.approvals[tr.input.approval_id]);assertMailboxDeliveryCurrent(after,config,id,now);}
 else if(tr.type==='approve-batch'){policy(config,now);for(const item of tr.input.items)check(mailboxDeliveryPackage(before,config,{kind:'outreach',project_id:item.project_id},tr.actor,now).sha256===item.package_sha256,'Exact batch changed before CAS');}
 else if(tr.type==='approve'){policy(config,now);const p=mailboxDeliveryPackage(before,config,{kind:tr.input.kind,project_id:tr.input.project_id},tr.actor,now);check(p.sha256===tr.input.package_sha256,'Exact send approval source changed before CAS');}
 else if(tr.type==='allowance'){policy(config,now);check(now<tr.input.allowance.expires_at,'Delivery allowance expired before CAS');}
}
