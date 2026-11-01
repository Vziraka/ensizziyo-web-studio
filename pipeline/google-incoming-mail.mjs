import {isDispatchCapability} from './shared-internal-dispatch.mjs';
import {StudioLifecycle,check,hash,pauseCold} from './lifecycle.mjs';
import {googleHostedTransport,mailObservationJSON,byteHash,verifySentRaw} from './google-hosted-transport.mjs';
import {replyContent,replyHeader as header} from './reply-content.mjs';
import {prepareNotificationsInState} from './team-notifications.mjs';
import {operationsPDFMailCapability,pdfAuthorization,validateIncomingGrant} from './shared-operations-exact-mail.mjs';

const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const historyId=v=>typeof v==='string'&&/^[1-9][0-9]{0,29}$/.test(v);
const rfc=v=>typeof v==='string'&&/^<[^<>\s@]+@[^<>\s@]+>$/.test(v)&&v.length<255;
const address=v=>{const m=v.match(/[^\s<>\",;]+@[^\s<>\",;]+\.[^\s<>\",;]+/g)??[];return m.length===1?m[0].toLowerCase():'';};
function capability(app,c,env){
 check(!app.store?.inertBinding&&c.shared_capability!=='inert-shared-v1','D2 notes-only authority rejects incoming synchronization');
 const g=c.google_incoming_mail;
 const shared=app.store?.dispatchBinding&&isDispatchCapability(c.shared_capability)&&env.EVZ_INTERNAL_DISPATCH_RUNTIME===c.shared_capability;
 check(shared&&g?.capability==='shared-registered-incoming-v1'||env.EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL==='fictional-incoming-v1'&&c.mode==='controlled'&&g?.capability==='fictional-incoming-v1','Hosted incoming synchronization is disabled; production capability is unavailable');
 check(g?.enabled===true,'Registered incoming synchronization is disabled');
 check(g.run_id===c.run_id&&key(g.grant_id)&&typeof g.account_email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.account_email)&&g.account_email===c.sender.account_email&&c.sender.email==='hello@evzdigital.studio','Exact incoming workspace, business account and grant required');return g;
}
export function incomingRoutes(state,c){
 const shared=isDispatchCapability(c.shared_capability);
 const all=[];
 if(shared)all.push(...c.internal_dispatch.routes);
 else for(const [project_id,b] of Object.entries(c.operations?.threads??{}))all.push({project_id,...b});
 for(const [id,e] of Object.entries(state.operations?.email??{})){
  const a=state.actions[id];if(!a||a.payload?.internal_notification===true)continue;
  if(e.thread)all.push({project_id:a.prospect_id,...e.thread});
  const d=a.delivery,p=a.payload?.package;
  if(a.payload?.exact_mail&&a.status==='Verified'&&d?.rfc_message_id&&p)all.push({project_id:a.prospect_id,thread_id:d.thread_id,original_id:d.message_id,from:p.from,to:p.to,subject:p.subject,rfc_message_id:d.rfc_message_id});
 }
 const result=[];
 for(const b of all){
  const r=state.prospects[b.project_id];
  check(key(b.project_id)&&key(b.thread_id)&&key(b.original_id)&&r?.origin!=='workspace'&&(shared||r?.controlled===true)&&r.contact?.verified===true&&r.contact.email.toLowerCase()===b.to?.toLowerCase()&&(shared||b.to.endsWith('@example.invalid'))&&b.from===c.sender.email,'Registered incoming route/contact differs');
  const same=result.find(x=>x.thread_id===b.thread_id);
  check(!same||same.project_id===b.project_id&&same.to===b.to&&same.from===b.from,'Ambiguous registered thread association');
  if(!same)result.push({...b,contact_sha256:hash(r.contact)});
 }
 check(result.length>0&&result.length<=12,'Incoming sync requires 1–12 existing registered conversation threads');
 return result.sort((a,b)=>a.thread_id.localeCompare(b.thread_id));
}
const routes=incomingRoutes;
export function pdfIncomingRequest(state,c){
 if(c.shared_capability!==operationsPDFMailCapability)return null;
 const action_id=c.internal_dispatch.incoming_pdf.permission.action_id,request=state.operations?.requests?.[action_id+'-intent'];return request?.incoming_pdf?{action_id,request,action:state.actions[action_id]}:null;
}
function authorizedRoutes(state,c){
 const original=c.internal_dispatch.routes,entry=pdfIncomingRequest(state,c),x=entry?.request.incoming_pdf;
 if(!x?.route)return original;
 pdfAuthorization(state,c,entry.action.payload.package,{approval:state.events[entry.action.payload.approval_event]});
 check(entry.request.status==='Verified'&&x.status!=='Unresolved'&&x.hold?.code!=='SCOPE_CONFLICT','Unresolved or conflicting PDF incoming scope');
 if(!x.scope_change){check(original.some(b=>b.thread_id===x.route.thread_id)&&x.status==='Held','Missing complete former incoming scope');return original;}
 return [...original,...(original.some(b=>b.thread_id===x.route.thread_id)?[]:[x.route])].sort((a,b)=>a.thread_id.localeCompare(b.thread_id));
}
export function incomingScopeCurrent(state,c){return hash(incomingRoutes(state,c))===hash(authorizedRoutes(state,c));}
export function publishPDFRoute(state,c,id,at,active){
 const a=state.actions[id],q=state.operations.requests[id+'-intent'],x=q.incoming_pdf,p=a.payload.package,receipt=q.receipt,n=state.operations.gmail_incoming;
 const route={project_id:p.project_id,thread_id:receipt.thread_id,original_id:receipt.message_id,from:p.from,to:p.to,subject:p.subject,rfc_message_id:receipt.rfc_message_id,contact_sha256:p.contact_sha256};
 x.route=route;
 const known=c.internal_dispatch.routes.some(b=>b.thread_id===route.thread_id)||Object.entries(state.operations.email).some(([other,e])=>other!==id&&(e.thread?.thread_id===route.thread_id||state.actions[other]?.delivery?.thread_id===route.thread_id))||Object.entries(state.operations.requests).some(([logical,r])=>logical!==id+'-intent'&&r.provider_thread_id===route.thread_id);
 let registered;try{registered=routes(state,c);}catch{x.status='Held';x.hold={code:'SCOPE_CONFLICT',at,tick_id:null};return;}
 if(hash(registered)!==hash(n.routes)){
  x.scope_change={at,before:structuredClone(n),after_binding:hash({g:c.google_incoming_mail,registered}),after_routes_sha256:hash(registered)};
  if(n.phase==='bootstrap')n.bootstrap_routes=n.routes.map(b=>b.thread_id);else n.index=registered.length;
  n.routes=registered;n.binding=x.scope_change.after_binding;
 }
 if(known||!active){x.status='Held';x.hold={code:known?'COLLISION':'AUTHORITY_CHANGED',at,tick_id:null};return;}
 x.status='Bootstrap';x.progress={phase:'bootstrap',cursor:x.anchor.history_id,page:null,pages:[],pending:null,checked_at:null,read_before:null,hold:null};
}
export function pdfIncomingTarget(state,c,now){
 const entry=pdfIncomingRequest(state,c),x=entry?.request.incoming_pdf;
 if(!entry||entry.request.status!=='Verified'||+now<entry.request.read_deadline||!['Bootstrap','CatchUp'].includes(x.status))return {kind:'registered'};
 const last=Object.values(state.operations.internal_dispatch.ticks).map(t=>t.phases.incoming).filter(p=>p?.disposition?.status==='Applied').at(-1);
 return last?.target?.kind==='pdf'&&last.target.action_id===entry.action_id?{kind:'registered'}:{kind:'pdf',action_id:entry.action_id};
}
export const pdfIncomingCodes=Object.freeze(['PRE_SEND_HELD','UNRESOLVED_SENT','COLLISION','THREAD_INCOMPLETE','KNOWN_SOURCE_MISSING','HISTORY_GAP','BOUNDS','AUTHORITY_CHANGED','SCOPE_CONFLICT']);
export function validatePDFObservation(o,c,t,at){
 const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(','),'Closed incoming observation fields required'),sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 exact(o,'name,args,at,grant,'+(Object.hasOwn(o??{},'error')?'error':'value'));
 check(['incomingProfile','incomingHistory','incomingThread'].includes(o.name)&&Array.isArray(o.args)&&typeof o.at==='string'&&Number.isFinite(Date.parse(o.at))&&new Date(o.at).toISOString()===o.at&&Date.parse(o.at)>=Date.parse(t.claimed_at)&&Date.parse(o.at)<=Date.parse(at)&&Date.parse(o.at)<Date.parse(t.deadline),'Bounded dated incoming operation required');
 if(Object.hasOwn(o,'error')){exact(o.error,'code,status,bytes,body_sha256');check(['NETWORK','HTTP','INVALID_JSON','OVERSIZE','DEADLINE'].includes(o.error.code)&&(o.error.status===null||Number.isInteger(o.error.status)&&o.error.status>=100&&o.error.status<=599)&&Number.isSafeInteger(o.error.bytes)&&o.error.bytes>=0&&(o.error.body_sha256===null||sha(o.error.body_sha256)),'Closed nonsecret incoming error required');if(o.grant)validateIncomingGrant(o.grant,c,o.at);}
 else{validateIncomingGrant(o.grant,c,o.at);mailObservationJSON(o.value);check(o.value&&typeof o.value==='object'&&!Array.isArray(o.value)&&Buffer.byteLength(JSON.stringify(o.value))<=(o.name==='incomingThread'?2000000:o.name==='incomingHistory'?250000:120000),'Bounded complete incoming success required');}
}
export function validatePDFIncomingEvidence(state,c,a,q){
 const x=q.incoming_pdf,exact=(v,keys)=>check(v&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(','),'Incomplete PDF incoming evidence'),sha=v=>/^[a-f0-9]{64}$/.test(v??''),utc=v=>typeof v==='string'&&new Date(v).toISOString()===v;
 exact(x,'schema_version,permission_sha256,authorization_event,authorization_sha256,policy_sha256,source_binding_sha256,reserved_cursor,status,anchor,route,scope_change,progress,coverage,hold');
 const auth=pdfAuthorization(state,c,a.payload.package,{approval:state.events[a.payload.approval_event]});
 check(x.schema_version===1&&x.permission_sha256===hash(c.internal_dispatch.incoming_pdf)&&x.authorization_event===auth.id&&x.authorization_sha256===hash(auth)&&x.policy_sha256===hash(c.internal_dispatch)&&x.source_binding_sha256===hash(a.payload.source_evidence.binding)&&historyId(x.reserved_cursor)&&['Reserved','Unresolved','Bootstrap','CatchUp','Ready','Held'].includes(x.status),'Original PDF permission/source/reservation differs');
 if(x.anchor){exact(x.anchor,'history_id,observation_sha256');const profile=q.observations.filter(b=>b.type==='dispatch').flatMap(b=>b.requests).find(o=>o.path==='profile');check(historyId(x.anchor.history_id)&&BigInt(x.anchor.history_id)>=BigInt(x.reserved_cursor)&&profile?.value.historyId===x.anchor.history_id&&hash(profile)===x.anchor.observation_sha256&&q.dispatch_claim,'Original pre-send profile anchor differs');}else check(!q.dispatch_claim,'Missing pre-send history anchor');
 if(x.route){exact(x.route,'project_id,thread_id,original_id,from,to,subject,rfc_message_id,contact_sha256');check(q.status==='Verified'&&x.route.project_id===a.prospect_id&&x.route.thread_id===q.receipt.thread_id&&x.route.original_id===q.receipt.message_id&&x.route.rfc_message_id===q.receipt.rfc_message_id&&x.route.from===a.payload.package.from&&x.route.to===a.payload.package.to&&x.route.subject===a.payload.package.subject&&x.route.contact_sha256===a.payload.package.contact_sha256,'Actual raw-verified PDF route differs');}else check(!q.receipt&&!x.progress&&!x.scope_change&&!x.coverage,'Unproved PDF route cannot have coverage');
 if(x.scope_change){const v=x.scope_change;exact(v,'at,before,after_binding,after_routes_sha256');check(utc(v.at)&&v.at===q.verified_at&&sha(v.after_binding)&&sha(v.after_routes_sha256)&&v.after_binding===hash({g:c.google_incoming_mail,registered:authorizedRoutes(state,c)})&&v.after_routes_sha256===hash(authorizedRoutes(state,c)),'Original complete scope transition differs');
  validateIncomingObject(v.before,c,c.internal_dispatch.routes,null);
 }
 if(x.progress){const p=x.progress;exact(p,'phase,cursor,page,pages,pending,checked_at,read_before,hold');check(['bootstrap','history','ready','held'].includes(p.phase)&&historyId(p.cursor)&&BigInt(p.cursor)>=BigInt(x.anchor.history_id)&&Array.isArray(p.pages)&&p.pages.length<=20&&p.pages.every(v=>typeof v==='string'&&v.length>0&&v.length<=500)&&new Set(p.pages).size===p.pages.length&&(p.page===null?p.pages.length===0:p.page===p.pages.at(-1))&&(p.checked_at===null||utc(p.checked_at))&&(p.read_before===null||historyId(p.read_before))&&(p.hold===null||pdfIncomingCodes.includes(p.hold)),'Malformed PDF bounded progress');
  if(p.pending){exact(p.pending,'messages,historyId,nextPageToken');check(Array.isArray(p.pending.messages)&&p.pending.messages.length>0&&p.pending.messages.length<=100&&new Set(p.pending.messages.map(m=>m.id)).size===p.pending.messages.length&&p.pending.messages.every(m=>Object.keys(m).sort().join(',')==='id,threadId'&&key(m.id)&&m.threadId===x.route.thread_id)&&historyId(p.pending.historyId)&&BigInt(p.pending.historyId)>=BigInt(p.cursor)&&(p.pending.nextPageToken===null||typeof p.pending.nextPageToken==='string'&&p.pending.nextPageToken.length>0&&p.pending.nextPageToken.length<=500&&!p.pages.includes(p.pending.nextPageToken)&&p.pages.length<20),'Malformed retained PDF pending page');}
 }
 if(x.coverage){exact(x.coverage,'history_id,at,tick_id');check(historyId(x.coverage.history_id)&&utc(x.coverage.at)&&key(x.coverage.tick_id)&&BigInt(x.coverage.history_id)<=BigInt(x.progress.cursor),'Incomplete PDF coverage');}
 if(x.status==='Ready')check(x.progress?.phase==='ready'&&x.coverage&&!x.progress.pending&&!x.progress.page,'Ready requires complete drained anchored history');
 if(x.hold){exact(x.hold,'code,at,tick_id');check(x.status==='Held'&&pdfIncomingCodes.includes(x.hold.code)&&utc(x.hold.at)&&(x.hold.tick_id===null||key(x.hold.tick_id)),'Closed PDF coverage hold required');}else check(x.status!=='Held','Held PDF evidence is missing');
 if(!q.dispatch_claim)check(['Reserved','Held'].includes(x.status)&&x.anchor===null&&x.route===null&&x.scope_change===null&&x.progress===null&&x.coverage===null&&(!x.hold||x.hold.code==='PRE_SEND_HELD'),'Unstarted PDF permission has no incoming coverage');
 else if(!q.receipt)check(x.status==='Unresolved'&&x.route===null&&x.scope_change===null&&x.progress===null&&x.coverage===null&&x.hold===null,'Unknown Sent outcome cannot identify an incoming route');
 else check(['Bootstrap','CatchUp','Ready','Held'].includes(x.status),'Verified PDF must expose its actual coverage disposition');
}
export async function validatePDFIncomingHistory(state,c,a,q){
 const x=q.incoming_pdf;if(!x.progress)return;
 check(x.scope_change&&q.receipt,'PDF progress needs its complete sender scope');
 const d=[state.operations.internal_dispatch,...(state.operations.internal_dispatch_history??[])].find(d=>hash(d.policy)===x.policy_sha256);check(d,'Original finite incoming policy/ticks must remain');
 const scratch=structuredClone(state),base=structuredClone(x),n=structuredClone(x.scope_change.before),registered=authorizedRoutes(state,c);
 n.routes=registered;n.binding=x.scope_change.after_binding;if(n.phase==='bootstrap')n.bootstrap_routes=x.scope_change.before.routes.map(b=>b.thread_id);else n.index=registered.length;
 base.status='Bootstrap';base.progress={phase:'bootstrap',cursor:x.anchor.history_id,page:null,pages:[],pending:null,checked_at:null,read_before:null,hold:null};base.coverage=null;base.hold=null;
 scratch.operations.gmail_incoming=n;scratch.operations.requests[a.id+'-intent'].incoming_pdf=base;scratch.operations.internal_dispatch={...structuredClone(d),ticks:{}};
 for(const [id,e]of Object.entries(scratch.events))if(e.type==='reply_received'&&!n.seen[hash({project:e.prospect_id,message:e.data.source_id})])delete scratch.events[id];
 scratch.prospects[a.prospect_id].reply=structuredClone(a.payload.package.reply_source);
 let began=false,pdfSteps=0;
 for(const [id,t]of Object.entries(d.ticks)){
  const phase=t.phases.incoming;scratch.operations.internal_dispatch.ticks[id]={...structuredClone(t),phases:{}};if(!phase?.target)continue;
  const current=scratch.operations.requests[a.id+'-intent'];
  if(phase.prior_request_sha256!==hash(current)){check(!began,'Retained incoming request chain is incomplete');scratch.operations.internal_dispatch.ticks[id].phases.incoming=structuredClone(phase);continue;}
  began=true;check(phase.prior_incoming_sha256===hash(scratch.operations.gmail_incoming)&&phase.sha256===hash(phase.observations)&&Date.parse(phase.at)>=Date.parse(q.verified_at),'Retained incoming whole-state chain differs');
  check(hash(phase.target)===hash(pdfIncomingTarget(scratch,c,new Date(phase.at))),'Retained incoming target selection differs');
  check(Object.keys(phase).sort().join(',')==='at,disposition,observations,prior_incoming_sha256,prior_request_sha256,sha256,target'&&Object.keys(phase.disposition).sort().join(',')==='code,status'&&Array.isArray(phase.observations)&&phase.observations.length>0&&phase.observations.length<=2&&Buffer.byteLength(JSON.stringify(phase.observations))<=c.internal_dispatch.limits.bytes_tick,'Closed retained incoming phase required');
  const observations=structuredClone(phase.observations);for(const o of observations)validatePDFObservation(o,c,t,phase.at);
  const transport=Object.fromEntries(['incomingProfile','incomingHistory','incomingThread'].map(name=>[name,async(...args)=>{const o=observations.shift();check(o?.name===name&&hash(o.args)===hash(args),'Retained incoming raw operation differs');if(o.error){const error=Error('Retained unavailable incoming operation');error.status=o.error.status;throw error;}return structuredClone(o.value);} ])),app={config:c,store:{dispatchBinding:true},now:()=>new Date(phase.at),loadConfig:async()=>c,snapshot:async()=>structuredClone(scratch),change:async fn=>fn(scratch)};
  let disposition;if(phase.target.kind==='pdf'){pdfSteps++;check(Date.parse(phase.at)>=q.read_deadline,'Original sender deadline fence precedes PDF progress');disposition=await syncPDFIncoming(app,{target:phase.target,tick_id:id,transport});}
  else disposition=registeredIncomingDisposition(await syncIncomingMail(app,{actor:'service:internal-dispatch',env:{EVZ_INTERNAL_DISPATCH_RUNTIME:c.shared_capability},transport}));
  check(!observations.length&&hash(disposition)===hash(phase.disposition),'Retained incoming disposition/raw coverage differs');scratch.operations.internal_dispatch.ticks[id].phases.incoming=structuredClone(phase);
 }
 check((pdfSteps>0||x.status==='Bootstrap')&&hash(scratch.operations.requests[a.id+'-intent'].incoming_pdf)===hash(x),'Complete PDF progress must be reconstructed from original bounded raw ticks');
 if(hash(state.operations.internal_dispatch?.policy)===x.policy_sha256)check(hash(scratch.operations.gmail_incoming)===hash(state.operations.gmail_incoming),'Current incoming progress differs from retained raw ticks');
}
// Import keeps current sync progress exactly, or holds the whole installation before writes.
export function validateIncomingImport(state,c){
 const registered=routes(state,c),p=c.internal_dispatch,g=c.google_incoming_mail;
 check(isDispatchCapability(c.shared_capability)&&hash(registered)===hash(authorizedRoutes(state,c)),'Incoming routes must exactly match the reviewed immutable dispatch policy and source permission');
 check(g?.enabled===true&&g.capability==='shared-registered-incoming-v1'&&g.run_id===c.run_id&&key(g.grant_id)&&g.grant_id===p.grant_id&&typeof g.account_email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.account_email)&&g.account_email===p.account_email&&g.account_email===c.sender.account_email&&c.sender.email===p.from&&p.from==='hello@evzdigital.studio','Exact incoming account/grant scope required');
 if(!Object.hasOwn(state.operations??{},'gmail_incoming'))return;
 validateIncomingObject(state.operations.gmail_incoming,c,registered,pdfIncomingRequest(state,c)?.request.incoming_pdf.scope_change?.before.routes.map(b=>b.thread_id));
}
function validateIncomingObject(n,c,registered,bootstrapOrder){
 const g=c.google_incoming_mail,sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),token=v=>typeof v==='string'&&v.length>0&&v.length<=500;
 check(record(n)&&Object.keys(n).every(k=>['binding','routes','seen','phase','index','status','checked_at','cursor','start','pending','page','pages','hold','resync_hold','unrouted_additions',...(c.shared_capability===operationsPDFMailCapability?['bootstrap_routes']:[])].includes(k)),'Unsupported saved incoming scope; preserve and review the original state');
 check(sha(n.binding)&&n.binding===hash({g,registered})&&Array.isArray(n.routes)&&hash(n.routes)===hash(registered),'Saved incoming account/grant/contact/routes scope differs; preserve the original cursor');
 check(record(n.seen)&&Object.keys(n.seen).length<=1000&&Object.entries(n.seen).every(([id,source])=>sha(id)&&sha(source)),'Malformed saved incoming dedup scope');
 if(n.bootstrap_routes){const original=bootstrapOrder;check(n.phase==='bootstrap'&&Array.isArray(n.bootstrap_routes)&&hash(n.bootstrap_routes)===hash(original),'Preserve the original bootstrap route order');}
 check(['bootstrap','history'].includes(n.phase)&&Number.isSafeInteger(n.index)&&(n.phase==='bootstrap'?n.index>=0&&n.index<(n.bootstrap_routes?.length??registered.length):n.index===registered.length),'Malformed saved incoming phase/index');
 check(['Initial registered-thread sync','Registered threads read; history catch-up required','Expired history; bounded registered-thread resync','Held','History page retained; registered thread read required','History page saved; more pages required','Caught up','Caught up; expired-history review remains required'].includes(n.status)&&typeof n.checked_at==='string'&&Number.isFinite(Date.parse(n.checked_at))&&new Date(n.checked_at).toISOString()===n.checked_at,'Malformed saved incoming status/check time');
 if(Object.hasOwn(n,'cursor'))check(historyId(n.cursor),'Malformed saved incoming cursor');
 if(n.phase==='history')check(historyId(n.cursor)&&!Object.hasOwn(n,'start'),'Saved incoming history needs its original cursor');
 else check((historyId(n.start)||!Object.hasOwn(n,'start')&&n.index===0&&!Object.hasOwn(n,'cursor'))&&!Object.hasOwn(n,'pending')&&!n.page&&(Object.hasOwn(n,'cursor')===Object.hasOwn(n,'resync_hold')),'Saved incoming bootstrap needs its original start scope');
 const pages=n.pages??[];check((!Object.hasOwn(n,'pages')||Array.isArray(n.pages))&&pages.length<=20&&pages.every(token)&&new Set(pages).size===pages.length&&(n.page==null?pages.length===0:token(n.page)&&n.page===pages.at(-1)),'Malformed saved incoming history pages');
 if(Object.hasOwn(n,'pending')){
  const q=n.pending;check(n.phase==='history'&&record(q)&&Object.keys(q).sort().join(',')==='historyId,index,messages,nextPageToken,threads'&&Array.isArray(q.threads)&&q.threads.length>0&&q.threads.length<=registered.length&&new Set(q.threads).size===q.threads.length&&hash(q.threads)===hash(registered.filter(b=>q.threads.includes(b.thread_id)).map(b=>b.thread_id))&&Number.isSafeInteger(q.index)&&q.index>=0&&q.index<q.threads.length,'Malformed saved incoming pending threads');
  check(Array.isArray(q.messages)&&q.messages.length>0&&q.messages.length<=100&&q.messages.every(m=>record(m)&&Object.keys(m).sort().join(',')==='id,threadId'&&key(m.id)&&q.threads.includes(m.threadId))&&q.threads.every(id=>q.messages.some(m=>m.threadId===id))&&historyId(q.historyId)&&BigInt(q.historyId)>=BigInt(n.cursor)&&(q.nextPageToken===null||token(q.nextPageToken)&&!pages.includes(q.nextPageToken)&&pages.length<20),'Malformed saved incoming pending page');
 }
 for(const field of ['hold','resync_hold'])if(Object.hasOwn(n,field))check(typeof n[field]==='string'&&n[field].length>0&&n[field].length<=24_000,'Malformed saved incoming hold');
 if(Object.hasOwn(n,'unrouted_additions'))check(Number.isSafeInteger(n.unrouted_additions)&&n.unrouted_additions>=0,'Malformed saved incoming unrouted count');
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
const conversationCoverage='Sent and received messages from the registered original through this capture; unsent drafts excluded. Earlier mailbox history and quoted text are not independently established.';
function conversationRoute(b){return Object.fromEntries(['project_id','thread_id','original_id','from','to','subject','rfc_message_id','sent_after','sent_before','contact_sha256'].map(k=>[k,b[k]??null]));}
function ownedConversationSent(state,b,id,content){
 const owned=Object.values(state.actions).filter(a=>{const q=state.operations?.requests?.[a.id+'-intent'];return a.payload?.exact_mail&&!a.payload.internal_notification&&([a.delivery?.message_id,q?.provider_message_id,q?.receipt?.message_id].includes(id)||q?.rfc_message_id===content.message_header_id);});
 if(!owned.length)return {kind:'mailbox-sent',label:'Mailbox sent record; desk approval/delivery not established',registered_original:id===b.original_id};
 check(owned.length===1,'Conversation outgoing message has conflicting owned intents');const a=owned[0],q=state.operations.requests[a.id+'-intent'],p=a.payload.package,approval=state.events[a.payload.approval_event],{sha256:packageHash,...packageBody}=p??{};
 check(a.prospect_id===b.project_id&&a.status==='Verified'&&q?.status==='Verified'&&q.receipt&&a.delivery&&p&&packageHash===hash(packageBody)&&a.payload.package_sha256===packageHash&&q.package_sha256===packageHash&&approval?.type==='exact_mail_approved'&&['owner','friend'].includes(approval.actor)&&approval.prospect_id===b.project_id&&approval.data.action_id===a.id&&approval.data.package_sha256===packageHash,'Conversation outgoing text has an unsettled or mismatched owned approval/receipt');
 check(typeof q.raw_base64url==='string'&&q.mime_sha256===byteHash(Buffer.from(q.raw_base64url,'base64url'))&&q.receipt.mime_sha256===q.mime_sha256&&['message_id','thread_id','rfc_message_id','mime_sha256'].every(k=>a.delivery[k]===q.receipt[k]),'Conversation owned MIME/receipt evidence differs');
 const receipt=verifySentRaw({id,threadId:b.thread_id,labelIds:['SENT'],raw:q.raw_base64url},{raw:Buffer.from(q.raw_base64url,'base64url'),message_id:q.rfc_message_id,thread_id:b.thread_id});check(hash(receipt)===hash(q.receipt)&&content.message_header_id===receipt.rfc_message_id&&content.from===p.from&&content.to===p.to&&content.subject===p.subject&&content.text===p.body.replace(/\r\n?/g,'\n').trim()&&(content.in_reply_to||null)===(p.in_reply_to||null)&&(content.references??'').split(/\s+/).filter(Boolean).join(' ')===(p.references??[]).join(' '),'Conversation owned outgoing body/routing differs from its exact package');
 return {kind:'verified-owned-exact-send',label:'Exact desk-approved message; sender receipt verified, recipient delivery not established',action_id:a.id,package_sha256:packageHash,approval_event:approval.id,approval_sha256:hash(approval),receipt_sha256:hash(q.receipt),mime_sha256:q.mime_sha256};
}
function knownConversationIds(state,b){
 const known=[...(state.prospects[b.project_id].reply_history??[]),state.prospects[b.project_id].reply].filter(r=>r?.thread_id===b.thread_id).map(r=>r.source_id);known.push(...(state.prospects[b.project_id].conversation_histories?.[b.thread_id]?.messages??[]).map(m=>m.message_id));
 for(const a of Object.values(state.actions)){const q=state.operations?.requests?.[a.id+'-intent'];if(a.prospect_id===b.project_id&&a.payload?.exact_mail&&!a.payload.internal_notification&&a.delivery?.thread_id===b.thread_id)known.push(a.delivery.message_id);if(a.prospect_id===b.project_id&&q?.receipt?.thread_id===b.thread_id)known.push(q.receipt.message_id);}
 return [...new Set(known)];
}
function unsettledConversationSent(state,b){return Object.values(state.actions).some(a=>{const q=state.operations?.requests?.[a.id+'-intent'];return a.prospect_id===b.project_id&&a.payload?.exact_mail&&!a.payload.internal_notification&&q?.dispatch_started_at&&q.status!=='Verified'&&(q.provider_message_id||q.rfc_message_id)&&(a.payload.package?.thread_id===b.thread_id||q.provider_thread_id===b.thread_id);});}
export function conversationHasUnsettledSend(state,c,project){const thread=state.prospects[project]?.reply?.thread_id;return routes(state,c).some(b=>b.project_id===project&&b.thread_id===thread&&unsettledConversationSent(state,b));}
function conversationSnapshot(state,c,b,thread,events,now){
 check(Buffer.byteLength(JSON.stringify(thread))<=2000000,'Conversation source exceeds the bounded thread read');const messages=thread.messages.filter(m=>!m.labelIds.includes('DRAFT')||m.labelIds.includes('SENT')).sort((a,b)=>Number(a.internalDate)-Number(b.internalDate)||a.id.localeCompare(b.id)),root=messages.find(m=>m.id===b.original_id),previous=state.prospects[b.project_id].conversation_histories?.[b.thread_id];
 check(messages[0]?.id===root?.id,'Conversation contains sent/received messages before its registered original; coverage requires review');
 check(knownConversationIds(state,b).every(id=>messages.some(m=>m.id===id)),'A known retained conversation message disappeared; source coverage is incomplete');
 const previousBodies=new Map();for(const old of state.prospects[b.project_id].reply_history??[])if(old.thread_id===b.thread_id&&old.content?.status==='Complete')previousBodies.set(old.source_id,{source_sha256:old.content.source_sha256,at:old.at});for(const old of previous?.messages??[])previousBodies.set(old.message_id,{source_sha256:old.content.source_sha256,at:old.at});
 for(const [id,old] of previousBodies)if(id!==state.prospects[b.project_id].reply?.source_id){const current=messages.find(m=>m.id===id),content=replyContent(current,b.thread_id);check(content.source_sha256===old.source_sha256&&Number(current.internalDate)===Date.parse(old.at),'Previously retained conversation source/body changed; review its provenance before replacing history');}
 const entries=[],priorSent=[];let textBytes=0;
 for(const m of messages){
  check(!m.labelIds.includes('DRAFT'),'Ambiguous sent/private draft message cannot establish conversation history');const content=replyContent(m,b.thread_id);check(content.status==='Complete','Conversation body is incomplete or unsupported');check(!header(m,'sender')||address(header(m,'sender'))===content.from,'Conversation sender/routing is ambiguous');const sent=m.labelIds.includes('SENT');let provenance;
  if(sent){check(content.from===b.from&&content.to===b.to,'Conversation outgoing sender/contact differs from the registered route');provenance=ownedConversationSent(state,b,m.id,content);priorSent.push(content.message_header_id);}
  else{const event=events.find(e=>e.data.source_id===m.id);check(event&&['reply','out_of_office','bounce'].includes(event.data.kind),'Conversation incoming disposition is unsupported');const refs=[content.in_reply_to,...(content.references??'').split(/\s+/)];check(refs.some(id=>priorSent.includes(id)),'Conversation client reply refers only to a later or unknown outgoing message');provenance=event.data.kind==='reply'?{kind:'authenticated-client-message',label:'Aligned authenticated client message; its text and quotes are untrusted evidence'}:{kind:'authenticated-automatic-message',label:'Authenticated automatic/bounce record; not human intent or approved facts'};}
  textBytes+=Buffer.byteLength(content.text);check(textBytes<=96000,'Aggregate conversation text exceeds 96 KB; no truncation is permitted');entries.push({citation_id:'message:'+m.id,message_id:m.id,thread_id:b.thread_id,role:sent?'evz':provenance.kind==='authenticated-automatic-message'?'automatic':'client',at:new Date(Number(m.internalDate)).toISOString(),content,provider_source_sha256:hash({id:m.id,thread_id:m.threadId,date:m.internalDate,payload:m.payload}),provenance});
 }
 const latest=events.at(-1),source={schema_version:1,coverage:conversationCoverage,route:conversationRoute(b),binding_sha256:hash({g:c.google_incoming_mail,route:b}),account_email:c.google_incoming_mail.account_email,messages:entries,latest_reply_sha256:latest?hash({...latest.data,at:latest.at}):null};return {...source,sha256:hash(source),checked_at:now.toISOString()};
}
export function retainedConversationContext(state,c,project){
 const r=state?.prospects?.[project];if(!r?.conversation_histories)return {status:'Current reply only',coverage:'No retained conversation snapshot; earlier messages have not been supplied by this task.',messages:[]};
 const inventory_sha256=hash(r.conversation_histories);try{
  check(!state.operations?.gmail_incoming?.hold&&!state.operations?.gmail_incoming?.resync_hold,'Registered incoming synchronization has a hold or history gap');const thread=r.reply?.thread_id,snapshot=r.conversation_histories[thread];check(snapshot,'The current conversation has no retained source snapshot');const n=state.operations?.gmail_incoming;check(n?.phase==='history'&&!n.page&&!n.pending?.nextPageToken&&!n.pending?.threads?.slice(n.pending.index).includes(thread)&&n.status!=='Registered threads read; history catch-up required','Conversation history catch-up or a detected message change is pending');
  const b=routes(state,c).find(b=>b.project_id===project&&b.thread_id===thread);check(b&&snapshot.account_email===c.sender.account_email&&snapshot.account_email===c.google_incoming_mail?.account_email&&snapshot.binding_sha256===hash({g:c.google_incoming_mail,route:b})&&hash(snapshot.route)===hash(conversationRoute(b)),'Retained conversation account/contact/route changed');const {sha256,checked_at,...body}=snapshot;check(sha256===hash(body)&&snapshot.latest_reply_sha256===hash(r.reply)&&knownConversationIds(state,b).every(id=>snapshot.messages.some(m=>m.message_id===id)),'Retained conversation source, known messages or latest client reply changed');
  for(const m of snapshot.messages)if(m.role==='evz')check(hash(ownedConversationSent(state,b,m.message_id,m.content))===hash(m.provenance),'Retained outgoing approval/receipt provenance changed');
  return {status:'Current',coverage:snapshot.coverage,snapshot_sha256:sha256,account_email:snapshot.account_email,route:snapshot.route,messages:snapshot.messages};
 }catch(error){return {status:'Held',coverage:conversationCoverage,hold:error.message,inventory_sha256,messages:[]};}
}
export function incomingMailView(state){const s=state.operations?.gmail_incoming;return s?{status:s.status,cursor:s.cursor??null,phase:s.phase,checked_at:s.checked_at,hold:s.hold??null,resync_hold:s.resync_hold??null,registered_threads:s.routes.length,processed_sources:Object.keys(s.seen).length,page_pending:Boolean(s.page||s.pending),unrouted_additions:s.unrouted_additions??0,read_only:true}:{status:'Not started',read_only:true};}
export function registeredIncomingDisposition(view){return view.hold||view.resync_hold?{status:'Held',code:view.resync_hold?'HISTORY_GAP':'BOUNDS'}:{status:'Applied',code:null};}

// One invocation reads one registered thread or one history page. No HTTP runs inside CAS.
export async function syncIncomingMail(app,{actor,env=process.env,getAccessToken,fetcher,transport}={}){
 check(['owner','friend'].includes(actor)||actor==='service:internal-dispatch'&&app.store?.dispatchBinding,'Incoming sync requires a signed operator');
 const c=await app.loadConfig(),g=capability(app,c,env),state=await app.snapshot(),saved=state.operations?.gmail_incoming,revision=state.revision;
 let registered;try{registered=routes(state,c);}catch(error){if(!saved)throw error;return registrationHold(app,revision,error.message);}
 const binding=hash({g,registered});
 if(saved&&saved.binding!==binding)return registrationHold(app,revision,'Incoming account/grant/contact/route registration changed; review the previous cursor before reinitialization');
 const provider=transport??googleHostedTransport({getAccessToken,fetcher,account:g.account_email,grantId:g.grant_id});
 const pdf=pdfIncomingRequest(state,c)?.request.incoming_pdf,processing=pdf?.route&&pdf.status!=='Ready'?registered.filter(b=>b.thread_id!==pdf.route.thread_id||c.internal_dispatch.routes.some(old=>old.thread_id===b.thread_id)):registered;
 async function readThread(b,expected=[]){
  const thread=await provider.incomingThread(b.thread_id),known=state.prospects[b.project_id].reply;
  const ids=[...expected,...(known?.thread_id===b.thread_id?[known.source_id]:[])];
  check(ids.every(id=>thread.messages?.some(m=>m.id===id)),'A known incoming message disappeared from its registered thread; source review required');
  const events=eventsForThread(thread,{...b,account_email:g.account_email},app.now());if(!app.store)snapshots.push({project:b.project_id,thread:b.thread_id,value:conversationSnapshot(state,c,b,thread,events,app.now())});return events;
 }
 let next=structuredClone(saved??{binding,routes:registered,seen:{},phase:'bootstrap',index:0,status:'Initial registered-thread sync'}),events=[],snapshots=[],failure=null;
 try{
  const profile=await provider.incomingProfile();check(profile.emailAddress===g.account_email&&historyId(profile.historyId),'Incoming business mailbox/history identity differs');
  if(next.phase==='bootstrap'&&!next.start)next.start=profile.historyId;
  if(next.phase==='bootstrap'){
   const order=next.bootstrap_routes??processing.map(b=>b.thread_id);events=await readThread(registered.find(b=>b.thread_id===order[next.index]));
   next.index++;if(next.index===order.length){next.phase='history';next.index=registered.length;next.cursor=next.start;delete next.start;delete next.bootstrap_routes;next.status='Registered threads read; history catch-up required';}
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
    check(!deleted.some(a=>registered.some(b=>b.thread_id===a.message.threadId&&(state.prospects[b.project_id].reply?.source_id===a.message.id||next.seen[hash({project:b.project_id,message:a.message.id})]||!app.store&&state.prospects[b.project_id].conversation_histories?.[b.thread_id]?.messages.some(m=>m.message_id===a.message.id)))),'Known incoming source was deleted; review retained provenance and the original mailbox before cursor recovery');
    if(page.nextPageToken)check(typeof page.nextPageToken==='string'&&page.nextPageToken.length<=500&&!next.pages?.includes(page.nextPageToken)&&(next.pages?.length??0)<20,'Looping or excessive history pagination; review before continuing');
    const visibleAdded=app.store?added:added.filter(a=>!a.message.labelIds?.includes('DRAFT')||a.message.labelIds.includes('SENT'));
    const touched=new Set(visibleAdded.map(a=>a.message.threadId)),pending={threads:processing.filter(b=>touched.has(b.thread_id)).map(b=>b.thread_id),messages:visibleAdded.filter(a=>processing.some(b=>b.thread_id===a.message.threadId)).map(a=>({id:a.message.id,threadId:a.message.threadId})),index:0,historyId:page.historyId,nextPageToken:page.nextPageToken??null};
    next.unrouted_additions=(next.unrouted_additions??0)+added.filter(a=>!registered.some(b=>b.thread_id===a.message.threadId)).length;
    if(pending.threads.length){next.pending=pending;next.status='History page retained; registered thread read required';}else finishPage(next,pending);
   }
  }
 }catch(error){failure=error.message;next=structuredClone(saved??next);events=[];snapshots=[];next.status='Held';}
 const newSources=new Set(events.map(e=>hash({project:e.prospect_id,message:e.data.source_id})).filter(id=>!Object.hasOwn(next.seen,id)));
 if(Object.keys(next.seen).length+newSources.size>1000){next=structuredClone(saved??next);events=[];snapshots=[];next.status='Held';failure='Incoming dedup history is full; review retention without advancing cursor';}
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
  if(!app.store)for(const snapshot of snapshots){s.prospects[snapshot.project].conversation_histories??={};s.prospects[snapshot.project].conversation_histories[snapshot.thread]=snapshot.value;}
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
function mainFrontier(state){
 const n=state.operations.gmail_incoming,ids=[n.cursor,n.pending?.historyId];
 for(const t of Object.values(state.operations.internal_dispatch.ticks))for(const o of t.phases.incoming?.target?.kind==='registered'?t.phases.incoming.observations:[])if(o.name==='incomingHistory'&&o.value)ids.push(o.value.historyId);
 return ids.filter(historyId).reduce((a,b)=>BigInt(b)>BigInt(a)?b:a,'1');
}
// One anchored continuation lives on the original send request and shares the standing phase/dedup.
export async function syncPDFIncoming(app,{target,tick_id,transport}={}){
 const state=await app.snapshot(),c=await app.loadConfig(),entry=pdfIncomingRequest(state,c),q=entry?.request,x=q?.incoming_pdf,now=app.now(),at=now.toISOString();
 check(hash(target)===hash(pdfIncomingTarget(state,c,now))&&target.kind==='pdf'&&target.action_id===entry.action_id,'Exact current PDF incoming target required');validateIncomingImport(state,c);validatePDFIncomingEvidence(state,c,entry.action,q);
 const next=structuredClone(x),b={...x.route,account_email:c.internal_dispatch.account_email};let events=[],failure=null;
 const fail=(code)=>{const e=Error(code);e.pdfCode=code;throw e;};
 function finish(page){
  const p=next.progress;if(page.nextPageToken){p.page=page.nextPageToken;p.pages.push(page.nextPageToken);return;}
  p.cursor=page.historyId;p.page=null;p.pages=[];p.pending=null;next.coverage={history_id:page.historyId,at,tick_id};
  if(state.operations.gmail_incoming.phase==='history'&&BigInt(page.historyId)>=BigInt(mainFrontier(state))){p.phase='ready';next.status='Ready';}
 }
 async function full(expected,profile){
  const thread=await transport.incomingThread(b.thread_id),messages=thread?.messages??[],root=messages.find(m=>m.id===b.original_id),known=[b.original_id,...Object.values(state.events).filter(e=>e.type==='reply_received'&&e.prospect_id===b.project_id&&e.data.thread_id===b.thread_id).map(e=>e.data.source_id),...expected];
  if(!known.every(id=>messages.some(m=>m.id===id)))fail('KNOWN_SOURCE_MISSING');
  if(!root||messages.some(m=>m.id!==root.id&&Number(m.internalDate)<=Number(root.internalDate)))fail('COLLISION');
  if(messages.some(m=>m.id!==root.id&&m.labelIds?.includes('SENT')&&!Object.values(state.actions).some(a=>a.delivery?.message_id===m.id&&a.delivery?.thread_id===b.thread_id)))fail('COLLISION');
  let result;try{result=eventsForThread(thread,b,now);}catch{fail('THREAD_INCOMPLETE');}
  if(result.some(e=>{const current=state.prospects[b.project_id].reply;return current&&current.source_id!==e.data.source_id&&current.thread_id!==b.thread_id&&Date.parse(current.at)===Date.parse(e.at);}))fail('THREAD_INCOMPLETE');
  next.progress.read_before=profile.historyId;return result;
 }
 try{
  const profile=await transport.incomingProfile();check(profile.emailAddress===c.internal_dispatch.account_email&&historyId(profile.historyId)&&BigInt(profile.historyId)>=BigInt(next.progress.cursor),'Invalid bounded PDF profile');
  const p=next.progress;
  if(p.phase==='bootstrap'){events=await full([],profile);p.phase='history';next.status='CatchUp';}
  else if(p.pending){const page=structuredClone(p.pending);events=await full(page.messages.map(m=>m.id),profile);p.pending=null;finish(page);}
  else{
   let page;try{page=await transport.incomingHistory(p.cursor,p.page);}catch(e){if(e.status===404)fail('HISTORY_GAP');throw e;}
   check(Buffer.byteLength(JSON.stringify(page))<=250000&&historyId(page.historyId)&&BigInt(page.historyId)>=BigInt(p.cursor)&&Array.isArray(page.history??[])&&(page.history??[]).length<=50,'Invalid bounded PDF history');
   let previous=BigInt(p.cursor);const added=[],deleted=[];
   for(const h of page.history??[]){check(historyId(h.id)&&BigInt(h.id)>previous&&BigInt(h.id)<=BigInt(page.historyId)&&Array.isArray(h.messagesAdded??[])&&Array.isArray(h.messagesDeleted??[]),'Invalid PDF history chronology');previous=BigInt(h.id);added.push(...h.messagesAdded??[]);deleted.push(...h.messagesDeleted??[]);}
   check(added.length<=100&&deleted.length<=100&&[...added,...deleted].every(m=>key(m.message?.id)&&key(m.message.threadId)),'Invalid PDF history membership');
   if(deleted.some(m=>m.message.threadId===b.thread_id))fail('HISTORY_GAP');
   if(page.nextPageToken)check(typeof page.nextPageToken==='string'&&page.nextPageToken.length>0&&page.nextPageToken.length<=500&&!p.pages.includes(page.nextPageToken)&&p.pages.length<20,'Looping or excessive PDF history pages');
   const messages=added.filter(m=>m.message.threadId===b.thread_id).map(m=>({id:m.message.id,threadId:m.message.threadId}));check(new Set(messages.map(m=>m.id)).size===messages.length,'Duplicate PDF history additions');
   const pending={messages,historyId:page.historyId,nextPageToken:page.nextPageToken??null};if(messages.length)p.pending=pending;else finish(pending);
  }
 }catch(error){failure=error.pdfCode??(error.status===404?'HISTORY_GAP':'BOUNDS');Object.assign(next,structuredClone(x));next.status='Held';next.hold={code:failure,at,tick_id};next.progress.phase='held';next.progress.hold=failure;events=[];}
 next.progress.checked_at=at;
 const n=structuredClone(state.operations.gmail_incoming),seen=n.seen,unique=new Set(events.map(e=>hash({project:e.prospect_id,message:e.data.source_id})).filter(id=>!Object.hasOwn(seen,id)));
 if(Object.keys(seen).length+unique.size>1000){next.status='Held';next.hold={code:'BOUNDS',at,tick_id};next.progress=structuredClone(x.progress);next.progress.phase='held';next.progress.hold='BOUNDS';next.progress.checked_at=at;events=[];failure='BOUNDS';}
 await app.change(async s=>{
  check(hash(s.operations.gmail_incoming)===hash(state.operations.gmail_incoming)&&hash(s.operations.requests[entry.action_id+'-intent'])===hash(q),'PDF incoming scope/request changed during bounded read');
  const reducer=new StudioLifecycle(null,()=>now);reducer.store={config:async()=>c,change:async fn=>fn(s)};
  for(const e of events){const id=hash({project:e.prospect_id,message:e.data.source_id}),source=hash(e.data);if(seen[id]===source)continue;await reducer.apply(e,{actor:'provider'});seen[id]=source;}
  s.operations.gmail_incoming=n;s.operations.requests[entry.action_id+'-intent'].incoming_pdf=next;prepareNotificationsInState(s,now,{origin:'gmail-incoming',includeDigest:false});s.revision++;s.updated_at=at;
 });
 return {status:failure?'Held':'Applied',code:failure};
}
async function registrationHold(app,revision,reason){return app.change(s=>{
 check(s.revision===revision,'Incoming workspace changed; no registration hold committed');
 const n=s.operations.gmail_incoming;n.status='Held';n.hold=reason;n.checked_at=app.now().toISOString();s.operations.holds??={};s.operations.holds.gmail_incoming=reason;
 for(const b of n.routes)if(s.prospects[b.project_id])pauseCold(s,s.prospects[b.project_id],'incoming-registration-hold','Incoming registration needs review');
 prepareNotificationsInState(s,app.now(),{origin:'gmail-incoming',includeDigest:false});s.revision++;s.updated_at=app.now().toISOString();return incomingMailView(s);
});}
