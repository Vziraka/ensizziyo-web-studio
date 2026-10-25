import {StudioLifecycle,check,hash,pauseCold} from './lifecycle.mjs';
import {googleHostedTransport} from './google-hosted-transport.mjs';
import {replyContent,replyHeader as header} from './reply-content.mjs';
import {prepareNotificationsInState} from './team-notifications.mjs';

const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const historyId=v=>typeof v==='string'&&/^[1-9][0-9]{0,29}$/.test(v);
const rfc=v=>typeof v==='string'&&/^<[^<>\s@]+@[^<>\s@]+>$/.test(v)&&v.length<255;
const address=v=>{const m=v.match(/[^\s<>\",;]+@[^\s<>\",;]+\.[^\s<>\",;]+/g)??[];return m.length===1?m[0].toLowerCase():'';};
function capability(app,c,env){
 check(!app.store?.inertBinding&&c.shared_capability!=='inert-shared-v1','D2 notes-only authority rejects incoming synchronization');
 const g=c.google_incoming_mail;
 check(env.EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL==='fictional-incoming-v1'&&c.mode==='controlled'&&g?.enabled===true&&g.capability==='fictional-incoming-v1','Hosted incoming synchronization is disabled; production capability is unavailable');
 check(g.run_id===c.run_id&&key(g.grant_id)&&typeof g.account_email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.account_email)&&g.account_email===c.sender.account_email&&c.sender.email==='hello@evzdigital.studio','Exact incoming workspace, business account and grant required');return g;
}
function routes(state,c){
 const all=[];
 for(const [project_id,b] of Object.entries(c.operations?.threads??{}))all.push({project_id,...b});
 for(const [id,e] of Object.entries(state.operations?.email??{})){
  const a=state.actions[id];if(!a||a.payload?.internal_notification===true)continue;
  if(e.thread)all.push({project_id:a.prospect_id,...e.thread});
  const d=a.delivery,p=a.payload?.package;
  if(a.payload?.exact_mail&&a.status==='Verified'&&d?.rfc_message_id&&p)all.push({project_id:a.prospect_id,thread_id:d.thread_id,original_id:d.message_id,from:p.from,to:p.to,subject:p.subject,rfc_message_id:d.rfc_message_id});
 }
 const result=[];
 for(const b of all){
  const r=state.prospects[b.project_id];
  check(key(b.project_id)&&key(b.thread_id)&&key(b.original_id)&&r?.origin!=='workspace'&&r?.controlled===true&&r.contact?.verified===true&&r.contact.email.toLowerCase()===b.to?.toLowerCase()&&b.to.endsWith('@example.invalid')&&b.from===c.sender.email,'Registered incoming route/contact differs');
  const same=result.find(x=>x.thread_id===b.thread_id);
  check(!same||same.project_id===b.project_id&&same.to===b.to&&same.from===b.from,'Ambiguous registered thread association');
  if(!same)result.push({...b,contact_sha256:hash(r.contact)});
 }
 check(result.length>0&&result.length<=12,'Incoming sync requires 1–12 existing registered conversation threads');
 return result.sort((a,b)=>a.thread_id.localeCompare(b.thread_id));
}
function eventsForThread(thread,b,now){
 check(thread?.id===b.thread_id&&Array.isArray(thread.messages)&&thread.messages.length>0&&thread.messages.length<20&&!thread.nextPageToken,'Missing, truncated or oversized registered thread');
 const messages=thread.messages;
 check(new Set(messages.map(m=>m.id)).size===messages.length&&messages.every(m=>key(m.id)&&m.threadId===thread.id&&Array.isArray(m.labelIds)&&Array.isArray(m.payload?.headers)&&m.payload.headers.length<=80&&Buffer.byteLength(JSON.stringify(m.payload.headers))<=16_000&&Number.isSafeInteger(Number(m.internalDate))&&Number(m.internalDate)>0&&Number(m.internalDate)<=+now),'Invalid incoming thread identity or chronology');
 const original=messages.find(m=>m.id===b.original_id);
 check(original?.labelIds.includes('SENT')&&address(header(original,'from'))===b.from&&address(header(original,'to'))===b.to&&header(original,'subject')===b.subject&&rfc(header(original,'message-id'))&&(!b.rfc_message_id||header(original,'message-id')===b.rfc_message_id),'Registered original Sent message differs');
 if(b.sent_after||b.sent_before)check(Number(original.internalDate)>=Date.parse(b.sent_after)&&Number(original.internalDate)<=Date.parse(b.sent_before),'Registered original date differs');
 const sent=messages.filter(m=>m.labelIds.includes('SENT')&&address(header(m,'from'))===b.from&&address(header(m,'to'))===b.to).map(m=>header(m,'message-id')).filter(rfc);
 const result=[];
 for(const m of messages){
  if(m.id===original.id||Number(m.internalDate)<Number(original.internalDate))continue;
  const from=address(header(m,'from'));
  if(m.labelIds.includes('SENT')||m.labelIds.includes('DRAFT')||[b.from,b.account_email].includes(from))continue;
  check(from===b.to&&address(header(m,'to'))===b.from&&!header(m,'cc')&&!header(m,'bcc')&&(!header(m,'reply-to')||address(header(m,'reply-to'))===from)&&(!header(m,'sender')||address(header(m,'sender'))===from),'Unrelated or ambiguous sender in registered thread; original review required');
  const refs=header(m,'references').split(/\s+/).filter(Boolean);
  check(sent.includes(header(m,'in-reply-to'))||refs.some(ref=>sent.includes(ref)),'Incoming reply lacks exact registered RFC reference');
  const auth=header(m,'authentication-results'),domain=from.split('@')[1];
  const dmarc=auth.split(';').slice(1).map(v=>v.trim()).filter(v=>/^dmarc=/i.test(v));
  check(/^mx\.google\.com\s*;/i.test(auth)&&dmarc.length===1&&new RegExp('^dmarc=pass(?:\\s+\\([^()]*\\))?\\s+header\\.from='+domain.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*$','i').test(dmarc[0]),'Incoming sender authentication is absent or unaligned; spoof review required');
  const auto=header(m,'auto-submitted'),precedence=header(m,'precedence');
  const bounce=/multipart\/report|message\/delivery-status/i.test(m.payload.mimeType??'')||/mailer-daemon|postmaster/i.test(from)||header(m,'return-path')==='<>',automatic=bounce||auto&&auto.toLowerCase()!=='no'||/bulk|list|junk/i.test(precedence)||header(m,'list-id')||header(m,'x-autoreply')||header(m,'x-autorespond');
  const content=replyContent(m,thread.id),at=new Date(Number(m.internalDate)).toISOString();
  const data={source_id:m.id,thread_id:thread.id,kind:bounce?'bounce':automatic?'out_of_office':'reply',content,provider_date:header(m,'date'),provider_internal_date:m.internalDate,provider_history_id:m.historyId??null,provider_source_sha256:hash({id:m.id,thread_id:m.threadId,date:m.internalDate,payload:m.payload})};
  result.push({id:'reply-'+hash(`${b.project_id}:${m.id}:${hash(data)}`).slice(0,40),prospect_id:b.project_id,type:'reply_received',at,data});
 }
 return result.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.data.source_id.localeCompare(b.data.source_id));
}
export function incomingMailView(state){const s=state.operations?.gmail_incoming;return s?{status:s.status,cursor:s.cursor??null,phase:s.phase,checked_at:s.checked_at,hold:s.hold??null,resync_hold:s.resync_hold??null,registered_threads:s.routes.length,processed_sources:Object.keys(s.seen).length,page_pending:Boolean(s.page||s.pending),unrouted_additions:s.unrouted_additions??0,read_only:true}:{status:'Not started',read_only:true};}

// One invocation reads one registered thread or one history page. No HTTP runs inside CAS.
export async function syncIncomingMail(app,{actor,env=process.env,getAccessToken,fetcher}={}){
 check(['owner','friend'].includes(actor),'Incoming sync requires a signed operator');
 const c=await app.loadConfig(),g=capability(app,c,env),state=await app.snapshot(),saved=state.operations?.gmail_incoming,revision=state.revision;
 let registered;try{registered=routes(state,c);}catch(error){if(!saved)throw error;return registrationHold(app,revision,error.message);}
 const binding=hash({g,registered});
 if(saved&&saved.binding!==binding)return registrationHold(app,revision,'Incoming account/grant/contact/route registration changed; review the previous cursor before reinitialization');
 const provider=googleHostedTransport({getAccessToken,fetcher,account:g.account_email,grantId:g.grant_id});
 async function readThread(b,expected=[]){
  const thread=await provider.incomingThread(b.thread_id),known=state.prospects[b.project_id].reply;
  const ids=[...expected,...(known?.thread_id===b.thread_id?[known.source_id]:[])];
  check(ids.every(id=>thread.messages?.some(m=>m.id===id)),'A known incoming message disappeared from its registered thread; source review required');
  return eventsForThread(thread,{...b,account_email:g.account_email},app.now());
 }
 let next=structuredClone(saved??{binding,routes:registered,seen:{},phase:'bootstrap',index:0,status:'Initial registered-thread sync'}),events=[],failure=null;
 try{
  const profile=await provider.incomingProfile();check(profile.emailAddress===g.account_email&&historyId(profile.historyId),'Incoming business mailbox/history identity differs');
  if(next.phase==='bootstrap'&&!next.start)next.start=profile.historyId;
  if(next.phase==='bootstrap'){
   events=await readThread(registered[next.index]);
   next.index++;if(next.index===registered.length){next.phase='history';next.cursor=next.start;delete next.start;next.status='Registered threads read; history catch-up required';}
  }else if(next.pending){
   const b=registered.find(b=>b.thread_id===next.pending.threads[next.pending.index]);
   events=await readThread(b,next.pending.messages.filter(m=>m.threadId===b.thread_id).map(m=>m.id));next.pending.index++;
   if(next.pending.index===next.pending.threads.length){finishPage(next,next.pending);delete next.pending;}
  }else{
   let page;
   try{page=await provider.incomingHistory(next.cursor,next.page);}catch(error){if(error.status!==404)throw error;next={...next,phase:'bootstrap',index:0,start:profile.historyId,page:null,pages:[],status:'Expired history; bounded registered-thread resync',resync_hold:'History expired; registered threads are being re-read. Mail deleted before resync cannot be recovered; operator mailbox review remains required.'};failure=next.resync_hold;}
   if(page){
    check(historyId(page.historyId)&&BigInt(page.historyId)>=BigInt(next.cursor)&&(!page.history||Array.isArray(page.history)&&page.history.length<=50),'Invalid bounded Gmail history');
    let previous=BigInt(next.cursor);
    const added=(page.history??[]).flatMap(h=>{check(historyId(h.id)&&BigInt(h.id)>previous&&BigInt(h.id)<=BigInt(page.historyId)&&Array.isArray(h.messagesAdded??[]),'Malformed Gmail history record');previous=BigInt(h.id);return h.messagesAdded??[];});
    check(added.length<=100&&added.every(a=>key(a.message?.id)&&key(a.message?.threadId)),'Excessive or malformed added messages');
    const deleted=(page.history??[]).flatMap(h=>{check(Array.isArray(h.messagesDeleted??[]),'Malformed deleted-message history');return h.messagesDeleted??[];});
    check(deleted.length<=100&&deleted.every(a=>key(a.message?.id)&&key(a.message?.threadId)),'Excessive or malformed deleted messages');
    check(!deleted.some(a=>registered.some(b=>b.thread_id===a.message.threadId&&(state.prospects[b.project_id].reply?.source_id===a.message.id||next.seen[hash({project:b.project_id,message:a.message.id})]))),'Known incoming source was deleted; review retained provenance and the original mailbox before cursor recovery');
    if(page.nextPageToken)check(typeof page.nextPageToken==='string'&&page.nextPageToken.length<=500&&!next.pages?.includes(page.nextPageToken)&&(next.pages?.length??0)<20,'Looping or excessive history pagination; review before continuing');
    const touched=new Set(added.map(a=>a.message.threadId)),pending={threads:registered.filter(b=>touched.has(b.thread_id)).map(b=>b.thread_id),messages:added.filter(a=>registered.some(b=>b.thread_id===a.message.threadId)).map(a=>({id:a.message.id,threadId:a.message.threadId})),index:0,historyId:page.historyId,nextPageToken:page.nextPageToken??null};
    next.unrouted_additions=(next.unrouted_additions??0)+added.length-pending.messages.length;
    if(pending.threads.length){next.pending=pending;next.status='History page retained; registered thread read required';}else finishPage(next,pending);
   }
  }
 }catch(error){failure=error.message;next=structuredClone(saved??next);events=[];next.status='Held';}
 const newSources=new Set(events.map(e=>hash({project:e.prospect_id,message:e.data.source_id})).filter(id=>!Object.hasOwn(next.seen,id)));
 if(Object.keys(next.seen).length+newSources.size>1000){next=structuredClone(saved??next);events=[];next.status='Held';failure='Incoming dedup history is full; review retention without advancing cursor';}
 next.checked_at=app.now().toISOString();if(failure)next.hold=failure;else delete next.hold;
 // Reuse the lifecycle reducer against the single prospective CAS state. Effects, stops,
 // notification preparation, dedup and cursor are committed together or none are.
 return app.change(async s=>{
  check(s.revision===revision,'Incoming workspace changed during read; no cursor or effects committed');
  check(hash(routes(s,c))===hash(registered),'Incoming routing changed during read');
  const reducer=new StudioLifecycle(null,app.now);reducer.store={config:async()=>c,change:async fn=>fn(s)};
  for(const event of events){
   const identity=hash({project:event.prospect_id,message:event.data.source_id}),source=hash(event.data);
   if(next.seen[identity]===source)continue;
   check(Object.keys(next.seen).length<1000||Object.hasOwn(next.seen,identity),'Incoming dedup history is full; review retention without advancing cursor');
   await reducer.apply(event,{actor:'provider'});next.seen[identity]=source;
  }
  s.operations??={};s.operations.gmail_incoming=next;s.operations.holds??={};
  if(next.hold||next.resync_hold){s.operations.holds.gmail_incoming=next.hold??next.resync_hold;for(const b of registered)pauseCold(s,s.prospects[b.project_id],'incoming-hold-'+hash(binding).slice(0,20),'Incoming source synchronization needs review');}
  else delete s.operations.holds.gmail_incoming;
  prepareNotificationsInState(s,app.now(),{origin:'gmail-incoming',includeDigest:false});s.revision++;s.updated_at=app.now().toISOString();return incomingMailView(s);
 },{configFingerprint:hash(c)});
}
function finishPage(next,page){
 if(page.nextPageToken){next.page=page.nextPageToken;next.pages=[...(next.pages??[]),page.nextPageToken];next.status='History page saved; more pages required';}
 else{next.cursor=page.historyId;next.page=null;next.pages=[];next.status=next.resync_hold?'Caught up; expired-history review remains required':'Caught up';}
}
async function registrationHold(app,revision,reason){return app.change(s=>{
 check(s.revision===revision,'Incoming workspace changed; no registration hold committed');
 const n=s.operations.gmail_incoming;n.status='Held';n.hold=reason;n.checked_at=app.now().toISOString();s.operations.holds??={};s.operations.holds.gmail_incoming=reason;
 for(const b of n.routes)if(s.prospects[b.project_id])pauseCold(s,s.prospects[b.project_id],'incoming-registration-hold','Incoming registration needs review');
 prepareNotificationsInState(s,app.now(),{origin:'gmail-incoming',includeDigest:false});s.revision++;s.updated_at=app.now().toISOString();return incomingMailView(s);
});}
