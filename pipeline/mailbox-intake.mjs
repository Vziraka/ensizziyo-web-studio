import {StudioLifecycle,check,hash,pauseCold} from './lifecycle.mjs';
import {replyContent,replyHeader} from './reply-content.mjs';
import {applyLocalInquiry} from './local-inquiry-intake.mjs';
import {mailObservationJSON,gmailScopes} from './google-hosted-transport.mjs';

export const mailboxCapability='shared-mailbox-review-v1';
export const mailboxProfile='shared-mailbox-gmail-v1';
export const mailboxReviewEvents=['conversation_claimed','inquiry_classification_reviewed','inquiry_identity_resolved','reply_reviewed','reply_draft_saved','reply_draft_approved'];
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const history=v=>typeof v==='string'&&/^[1-9][0-9]{0,29}$/.test(v);
const page=v=>v===null||typeof v==='string'&&v.length>0&&v.length<=500;
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,fields)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.split(',').sort().join(','),'Closed mailbox evidence required');
export function validateMailboxPolicy(p){
 exact(p,'schema_version,account,grant_id,after');
 check(p.schema_version===1&&p.account==='ensizziyo@evzdigital.studio'&&key(p.grant_id)&&utc(p.after),'Exact business mailbox and dated initial boundary required');return p;
}
function expected(sync){return !sync?{operation:'profile',input:null}:sync.pending.length?{operation:'message',input:sync.pending[0]}:sync.phase==='bootstrap'?{operation:'list',input:{after:sync.after,page:sync.page}}:{operation:'history',input:{cursor:sync.cursor,page:sync.page}};}
function identities(messages){
 check(Array.isArray(messages)&&messages.length<=100&&messages.every(m=>key(m.id)&&key(m.threadId)),'Bounded complete message identities required');
 const unique=new Map();for(const m of messages){check(!unique.has(m.id)||unique.get(m.id).threadId===m.threadId,'Conflicting Gmail message identities');unique.set(m.id,{id:m.id,threadId:m.threadId});}return [...unique.values()];
}
function paging(sync,value){
 const next=value.nextPageToken??null;check(page(next)&&(!next||!sync.pages.includes(next)&&sync.pages.length<100),'Mailbox pagination is invalid or incomplete');
 sync.page=next;if(next)sync.pages.push(next);else sync.pages=[];
}
function adoptMessage(state,config,m,at){
 const sync=state.mailbox_sync;
 check(key(m.id)&&key(m.threadId)&&Array.isArray(m.labelIds)&&m.labelIds.every(v=>typeof v==='string')&&Number.isSafeInteger(Number(m.internalDate))&&Number(m.internalDate)>0&&Number(m.internalDate)<=Date.parse(at)+60000,'Complete dated Gmail message required');
 if(m.labelIds.some(l=>['SENT','DRAFT','SPAM','TRASH'].includes(l))||Number(m.internalDate)<Date.parse(sync.after))return;
 if(state.inquiry_intake?.sources?.[m.id]||sync.held_sources[m.id])return;
 const content=replyContent(m,m.threadId);
 const matches=Object.values(state.prospects).filter(r=>Boolean(content.from)&&r.contact?.email?.toLowerCase()===content.from||r.reply?.thread_id===m.threadId||r.conversation_histories?.[m.threadId]||Object.values(state.outreach_delivery?.intents??{}).some(i=>i.project_id===r.id&&i.receipt?.thread_id===m.threadId));
 const eventId='gmail-'+hash(m.id).slice(0,32),oldActions=new Set(Object.keys(state.actions));
 for(const r of matches)pauseCold(state,r,eventId,'Incoming business mail awaits review');
 if(content.status!=='Complete'){
  check(Object.keys(sync.held_sources).length<1000,'Held mailbox source limit reached');
  sync.held_sources[m.id]={id:m.id,thread_id:m.threadId,received_at:new Date(Number(m.internalDate)).toISOString(),source_sha256:hash(m),status:'Original review required',reason:content.hold,matched_projects:matches.map(r=>r.id)};
 }else{
  const app=new StudioLifecycle(null,()=>new Date(at));app.config=config;
  const list=replyHeader(m,'List-ID')||replyHeader(m,'List-Unsubscribe'),automatic=replyHeader(m,'Auto-Submitted');
  const classification=list?'newsletter':automatic&&automatic.toLowerCase()!=='no'?'automatic_reply':'uncertain';
  applyLocalInquiry(app,state,{id:eventId,prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:content.from,classification,reply:{source_id:m.id,thread_id:m.threadId,kind:'reply',received_at:new Date(Number(m.internalDate)).toISOString(),content}}},'provider',state.revision,{shared:true});
 }
 for(const [id,a] of Object.entries(state.actions))if(!oldActions.has(id))a.execution_hold='Incoming review only; provider execution disabled';
}
export function applyMailboxObservation(state,config,o){
 check(config.shared_capability===mailboxCapability&&config.outreach_enabled===false,'Exact read-only mailbox workspace required');const policy=validateMailboxPolicy(config.mailbox);
 exact(o,'operation,input,before_sha256,policy_sha256,at,value,grant');
 check(utc(o.at)&&o.policy_sha256===hash(policy)&&o.before_sha256===hash(state.mailbox_sync??null),'Mailbox policy or cursor changed');
 check(!state.mailbox_sync||state.mailbox_sync.policy_sha256===hash(policy),'Mailbox state belongs to another policy');
 const want=expected(state.mailbox_sync);check(o.operation===want.operation&&hash(o.input)===hash(want.input),'Unexpected mailbox read or cursor');
 const g=o.grant;exact(g,'profile,account,grant_id,scopes,expires_at');
 check(g.profile===mailboxProfile&&g.account===policy.account&&g.grant_id===policy.grant_id&&Number.isSafeInteger(g.expires_at)&&g.expires_at>Date.parse(o.at)&&Array.isArray(g.scopes)&&g.scopes.length===4&&new Set(g.scopes).size===4&&['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes].every(s=>g.scopes.includes(s)),'Exact current mailbox grant evidence required');
 mailObservationJSON(o.value);check(Buffer.byteLength(JSON.stringify(o.value))<=2_000_000,'Mailbox observation exceeds its bound');
 if(o.operation==='profile'){
  check(o.value.emailAddress===policy.account&&history(o.value.historyId),'Business Gmail profile differs');
  state.mailbox_sync={policy_sha256:hash(policy),after:policy.after,phase:'bootstrap',cursor:o.value.historyId,next_cursor:null,page:null,pages:[],pending:[],held_sources:{},checked_at:null,last_read_at:o.at,hold:null};
 }else{
  const s=state.mailbox_sync;
  if(o.operation==='message'){
   check(o.value.id===o.input.id&&o.value.threadId===o.input.threadId,'Gmail message identity differs');adoptMessage(state,config,o.value,o.at);s.pending.shift();
  }else if(o.operation==='list'){
   s.pending=identities(o.value.messages??[]);paging(s,o.value);if(!s.page)s.phase='history';
  }else{
   check(history(o.value.historyId)&&BigInt(o.value.historyId)>=BigInt(s.cursor)&&Array.isArray(o.value.history??[])&&(o.value.history??[]).length<=50,'Complete monotonic Gmail history required');
   const messages=[];for(const h of o.value.history??[]){check(history(h.id)&&BigInt(h.id)>BigInt(s.cursor)&&BigInt(h.id)<=BigInt(o.value.historyId)&&Array.isArray(h.messagesAdded??[]),'Malformed Gmail history entry');for(const entry of h.messagesAdded??[])messages.push(entry.message);}
   s.pending=identities(messages);paging(s,o.value);
   if(!s.page)s.next_cursor=o.value.historyId;
  }
  if(!s.pending.length&&s.next_cursor){s.cursor=s.next_cursor;s.next_cursor=null;s.checked_at=o.at;}
  s.last_read_at=o.at;s.hold=null;
 }
 delete state.mailbox_failure;state.revision++;state.updated_at=o.at;return {operation:o.operation,pending:state.mailbox_sync.pending.length,checked_at:state.mailbox_sync.checked_at};
}
export function applyMailboxFailure(state,config,f){
 check(config.shared_capability===mailboxCapability&&config.outreach_enabled===false,'Exact read-only mailbox workspace required');
 exact(f,'before_sha256,policy_sha256,at,operation,reason');
 check(utc(f.at)&&f.before_sha256===hash(state.mailbox_sync??null)&&f.policy_sha256===hash(validateMailboxPolicy(config.mailbox))&&f.operation===expected(state.mailbox_sync).operation&&['Source unavailable','History expired; full recovery required','Message unavailable; original review required','Capacity reached'].includes(f.reason),'Invalid mailbox failure evidence');
 state.mailbox_failure=structuredClone(f);state.revision++;state.updated_at=f.at;return {held:true,reason:f.reason};
}
export async function syncMailboxStep(app,{transport}={}){
 check(app.store?.manualBinding?.scope.capability===mailboxCapability,'Exact shared mailbox store required');
 const config=await app.loadConfig(),policy=validateMailboxPolicy(config.mailbox),state=await app.snapshot(),sync=state.mailbox_sync??null;
 const request=expected(sync),before=hash(sync),configuration=hash(config),guard=async()=>check(hash(await app.loadConfig())===configuration&&hash((await app.snapshot()).mailbox_sync??null)===before,'Mailbox source changed during provider read');
 const hold=reason=>{const mailboxFailure={before_sha256:before,policy_sha256:hash(policy),at:app.now().toISOString(),operation:request.operation,reason};return app.change((s,c)=>applyMailboxFailure(s,c,mailboxFailure),{configFingerprint:configuration,mailboxFailure});};
 if(Buffer.byteLength(JSON.stringify(state))>=18_500_000)return hold('Capacity reached');
 if(state.mailbox_failure?.reason==='History expired; full recovery required')return {held:true,reason:state.mailbox_failure.reason};
 await guard();let value;
 try{
 if(request.operation==='profile')value=await transport.incomingProfile();
 else if(request.operation==='list')value=await transport.mailboxList(policy.after,request.input.page);
 else if(request.operation==='history')value=await transport.incomingHistory(request.input.cursor,request.input.page);
 else value=await transport.mailboxMessage(request.input.id);
 await guard();
 const observation={...request,before_sha256:before,policy_sha256:hash(policy),at:app.now().toISOString(),value,grant:transport.grant()};
 return await app.change((s,c)=>applyMailboxObservation(s,c,observation),{configFingerprint:configuration,mailboxObservation:observation});
 }catch(error){
  if(['STATE_CONFLICT','STATE_UNCERTAIN'].includes(error.code))throw error;
  await guard();return hold(error.status===404&&request.operation==='history'?'History expired; full recovery required':error.status===404&&request.operation==='message'?'Message unavailable; original review required':'Source unavailable');
 }
}
