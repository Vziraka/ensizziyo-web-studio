import {StudioLifecycle,check,hash} from './lifecycle.mjs';
import {outreachReviewView} from './outreach-review.mjs';
import {composeExactMail,byteHash} from './google-hosted-transport.mjs';
import {outreachDailySummary} from './outreach-cadence.mjs';
import {replyContent} from './reply-content.mjs';
import {outreachFooter} from './outreach-content.mjs';

const day=(at,zone='America/New_York')=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
const bump=(s,now)=>{s.revision++;s.updated_at=now.toISOString();};
const intentId=(run,d)=>'outreach-'+hash({run,project:d.project_id,approval:d.schedule.approval_event,sha256:d.sha256}).slice(0,40);
function policy(c){
 const p=c.outreach_delivery;
 check(c.outreach_enabled===true&&p?.profile==='approved-outreach-v1'&&p.enabled===true&&p.sender_ready===true&&p.postal_address_verified===true&&typeof c.sender?.postal_address==='string'&&c.sender.postal_address.trim(),'Outreach release prerequisites are incomplete');
 check(typeof p.account==='string'&&p.account.endsWith('@evzdigital.studio')&&Number.isInteger(p.daily_limit)&&p.daily_limit>=1&&p.daily_limit<=500,'Explicit business account and included daily limit required');
 return p;
}
function current(s,id,now){return outreachReviewView(s,null,now).items.find(d=>d.project_id===id);}
function due(d,now){
 check(d?.eligible&&d.schedule&&+now>=Date.parse(d.schedule.at)&&+now<Date.parse(d.schedule.at)+60000,'No current approved slot; missed slots require review, never catch-up');
}
function usage(s,now){return Object.values(s.outreach_delivery?.intents??{}).filter(i=>i.sender_day===day(now)).length;}
function unresolved(s,now){return Object.values(s.outreach_delivery?.intents??{}).filter(i=>i.sender_day===day(now)&&i.status!=='Verified').length;}
function expected(i){const raw=Buffer.from(i.raw_base64url,'base64url');check(byteHash(raw)===i.mime_sha256,'Retained MIME integrity failed');return {raw,message_id:i.message_id,thread_id:null};}

// No provider call occurs inside change(): conflicts never rerun external effects.
// A reservation is permanent even when its acknowledgement or POST response is lost.
export async function dispatchOutreach(app,projectId,{transport,allowance}={}){
 const signal=AbortSignal.timeout(40000);
 const config=await app.loadConfig(),p=policy(config),initial=await app.snapshot(),now=app.now(),d=current(initial,projectId,now);
 due(d,now);const id=intentId(initial.run_id,d),prior=initial.outreach_delivery?.intents?.[id];
 if(prior)return {id,status:prior.status};
 check(d.body.endsWith(outreachFooter(config.sender.postal_address)),'Review the complete message with the current mailing address and opt-out footer');
 check(typeof allowance==='function','Verified included allowance reader required');
 const quota=await allowance();check(quota?.included_only===true&&Number.isInteger(quota.remaining)&&quota.remaining>0,'Included allowance unavailable or exhausted');
 const configHash=hash(config),packageHash=d.sha256;
 const guard=async()=>{
  check(!signal.aborted,'Outreach invocation deadline expired; retain original intent');
  check(hash(await app.loadConfig())===configHash,'Outreach configuration changed');
  const s=await app.snapshot(),active=current(s,projectId,app.now());due(active,app.now());
  check(active.sha256===packageHash&&intentId(s.run_id,active)===id,'Exact approval changed');
  const i=s.outreach_delivery?.intents?.[id];check(!i||i.status==='Reserved'||i.status==='Uncertain','Intent is already terminal');
 };
 await guard();const identity=await transport.preflight({guard,signal});
 check(identity?.account===p.account&&identity.from==='hello@evzdigital.studio'&&typeof identity.grant_id==='string'&&identity.grant_id,'Bound business grant differs');
 if(d.kind==='follow-up'){const incoming=await syncOutreachReplies(app,{transport,projectId});check(incoming.checked===1,'Original follow-up thread must be current');}
 await transport.freshSource({...d,attachments:[]},{guard,signal});await guard();
 const reservedAt=app.now(),wire=composeExactMail({...d,attachments:[]},id,reservedAt.toISOString());
 await app.change((s,c)=>{
  check(hash(c??config)===configHash,'Outreach configuration changed');const active=current(s,projectId,app.now());due(active,app.now());
  check(active.sha256===packageHash&&intentId(s.run_id,active)===id,'Exact approval changed');
  s.outreach_delivery??={intents:{}};check(!s.outreach_delivery.intents[id],'Intent already reserved; read back before continuing');
  check(usage(s,app.now())<p.daily_limit&&unresolved(s,app.now())<quota.remaining,'Included daily allowance is reserved or exhausted');
  check(d.kind!=='new-business'||Object.values(s.outreach_delivery.intents).filter(i=>i.kind==='new-business'&&i.sender_day===day(app.now())).length<100,'One hundred new-business intents are already reserved for this day');
  const previous=Object.values(s.outreach_delivery.intents).filter(i=>i.company_id===d.company_id||i.to.toLowerCase()===d.to.toLowerCase());
  check(d.kind==='follow-up'?previous.length===1&&previous[0].id===d.first_intent&&previous[0].status==='Verified'&&previous[0].to===d.to&&Date.parse(d.not_before)<=+app.now():previous.length===0,'Prior business/recipient intent must be reconciled; no replacement send');
  s.outreach_delivery.intents[id]={id,project_id:projectId,company_id:d.company_id,to:d.to,kind:d.kind,owner:d.owner,account:identity.account,grant_id:identity.grant_id,package_sha256:packageHash,approval_event:d.schedule.approval_event,timezone:d.timezone,sender_day:day(app.now()),reserved_at:reservedAt.toISOString(),status:'Reserved',message_id:wire.message_id,mime_sha256:byteHash(wire.raw),raw_base64url:wire.raw.toString('base64url')};bump(s,app.now());
 });
 // Claim before POST. A process lost after this point has read-only recovery.
 await guard();await app.change(s=>{const i=s.outreach_delivery.intents[id];check(i?.status==='Reserved','Dispatch already claimed');i.status='Uncertain';i.dispatch_at=app.now().toISOString();bump(s,app.now());});
 try{
  const sent=await transport.send(wire,{guard,signal});
  await app.change(s=>{const i=s.outreach_delivery.intents[id];check(i?.status==='Uncertain','Original dispatch changed');i.provider_message_id=sent.id;bump(s,app.now());});
  return await reconcileOutreach(app,id,{transport,signal});
 }catch{
  // A stop, failed readback or lost ACK does not erase the original liability.
  try{const saved=(await app.snapshot()).outreach_delivery?.intents?.[id];if(saved?.status==='Verified')return {id,status:'Verified',receipt:saved.receipt};await app.change(s=>{s.outreach_delivery.alert={at:app.now().toISOString(),intent_id:id,message:'An email outcome is uncertain. Read the original sender record; do not resend.'};bump(s,app.now());});}catch{}
  return {id,status:'Uncertain',message:'Read the original sender record before any further email; automatic resend is disabled'};
 }
}

export async function reconcileOutreach(app,id,{transport,signal=AbortSignal.timeout(40000)}={}){
 const s=await app.snapshot(),i=s.outreach_delivery?.intents?.[id];
 check(i&&i.dispatch_at,'Original claimed intent required');if(i.status==='Verified')return {id,status:i.status,receipt:i.receipt};
 const receipt=await transport.reconcileSent(expected(i),i.provider_message_id??null,{sentTimestamp:true,signal});
 const grant=transport.grant();check(grant?.account===i.account&&grant.grant_id===i.grant_id,'Original business grant required for readback');
 check(receipt?.rfc_message_id===i.message_id&&receipt.mime_sha256===i.mime_sha256,'Receipt differs from original MIME');
 check(Number.isFinite(Date.parse(receipt.sent_at))&&Date.parse(receipt.sent_at)>=Date.parse(i.reserved_at)-60000&&Date.parse(receipt.sent_at)<=+app.now()+60000,'Actual provider send time differs from the reserved intent');
 await app.change(state=>{
  const saved=state.outreach_delivery?.intents?.[id];check(saved&&saved.mime_sha256===i.mime_sha256,'Original intent changed');
  if(saved.status==='Verified'){check(hash(saved.receipt)===hash(receipt),'Conflicting original receipt');return;}
  saved.status='Verified';saved.receipt=receipt;saved.verified_at=app.now().toISOString();bump(state,app.now());
 });return {id,status:'Verified',receipt};
}

export async function outreachTick(app,options){
 await syncOutreachReplies(app,options);
 const state=await app.snapshot(),now=app.now(),report=outreachDailySummary(state,now);
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now));
 if(hour>=18&&!state.outreach_delivery?.summaries?.[report.date])await app.change(s=>{s.outreach_delivery??={intents:{}};s.outreach_delivery.summaries??={};if(!s.outreach_delivery.summaries[report.date]){s.outreach_delivery.summaries[report.date]=outreachDailySummary(s,app.now());bump(s,app.now());}});
 const pending=outreachReviewView(state,null,now).items.filter(d=>d.eligible&&d.schedule&&+now>=Date.parse(d.schedule.at)&&+now<Date.parse(d.schedule.at)+60000&&!Object.values(state.outreach_delivery?.intents??{}).some(i=>i.package_sha256===d.sha256));
 if(!pending.length)return {status:'Idle',summary:report};
 try{return await dispatchOutreach(app,pending.sort((a,b)=>a.schedule.at.localeCompare(b.schedule.at))[0].project_id,options);}
 catch{
  await app.change(s=>{s.outreach_delivery??={intents:{}};const message='Outreach is held: release, account, allowance, source or storage check failed. Review before resuming.';if(s.outreach_delivery.alert?.message!==message){s.outreach_delivery.alert={message,at:app.now().toISOString()};bump(s,app.now());}});
  return {status:'Held',message:'Review the saved outreach alert; no automatic retry of an existing intent'};
 }
}

export async function syncOutreachReplies(app,{transport,projectId=null}={}){
 const state=await app.snapshot(),config=await app.loadConfig();
 const threads=[...new Map(Object.values(state.outreach_delivery?.intents??{}).filter(i=>i.status==='Verified'&&i.receipt?.thread_id&&(!projectId||i.project_id===projectId)).map(i=>[i.receipt.thread_id,i])).values()].sort((a,b)=>a.id.localeCompare(b.id));
 if(!threads.length)return {checked:0};
 const cursor=state.outreach_delivery.reply_cursor??0,first=threads[cursor%threads.length],threadId=first.receipt.thread_id;
 try{
  const thread=await transport.incomingThread(threadId),grant=transport.grant();
  check(grant?.account===first.account&&grant.grant_id===first.grant_id,'Original business grant required for incoming read');
  check(thread?.id===threadId&&Array.isArray(thread.messages)&&thread.messages.length>0&&thread.messages.length<100&&!thread.nextPageToken&&thread.messages.some(m=>m.id===first.receipt.message_id&&m.labelIds?.includes('SENT')),'Complete original outreach thread required');
  check(new Set(thread.messages.map(m=>m.id)).size===thread.messages.length&&thread.messages.every(m=>typeof m.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(m.id)&&m.threadId===threadId&&Number.isSafeInteger(Number(m.internalDate))&&Number(m.internalDate)<=+app.now()+60000),'Invalid incoming message identity or time');
  const incoming=thread.messages.filter(m=>!m.labelIds?.includes('SENT')&&!m.labelIds?.includes('DRAFT')&&Number(m.internalDate)>=Date.parse(first.receipt.sent_at)).sort((a,b)=>Number(a.internalDate)-Number(b.internalDate));
  await app.change((s,currentConfig)=>{
   check(hash(config)===hash(currentConfig??config),'Incoming configuration changed');
   const local=new StudioLifecycle(null,app.now);local.config=config;
   for(const m of incoming){
    const event={id:'outreach-reply-'+hash({project:first.project_id,message:m.id}).slice(0,40),prospect_id:first.project_id,type:'reply_received',at:new Date(Number(m.internalDate)).toISOString(),data:{source_id:m.id,thread_id:threadId,kind:'reply',content:replyContent(m,threadId)}};
    // Every incoming message stops cold contact before any semantic disposition.
    local.reduceEvent(s,event,{actor:'provider'});
   }
   if(!projectId)s.outreach_delivery.reply_cursor=(cursor+1)%threads.length;s.outreach_delivery.last_reply_check={at:app.now().toISOString(),thread_id:threadId};bump(s,app.now());
  },{configFingerprint:hash(config)});return {checked:1,received:incoming.length};
 }catch{
  await app.change(s=>{const r=s.prospects[first.project_id];if(r)r.cold_paused=true;s.outreach_delivery.alert={at:app.now().toISOString(),message:'Incoming mail could not be verified. The affected outreach is paused until its original thread is reviewed.'};bump(s,app.now());});
  return {checked:0,status:'Held'};
 }
}
