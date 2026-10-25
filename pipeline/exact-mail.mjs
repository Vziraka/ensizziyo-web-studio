import {check,hash,businessDate} from './lifecycle.mjs';
import {replyDraftCurrent,validReplySource} from './reply-content.mjs';
import {projectWorkContext} from './project-work.mjs';
import {readProjectAsset,projectAssetVersion} from './project-assets.mjs';
import {composeExactMail,googleHostedTransport,mailLimits,byteHash,mailMessageId} from './google-hosted-transport.mjs';
import {teamNotificationBoundary,notificationPolicy,currentNotificationPolicy,notificationPackageInState,notificationBudget} from './exact-team-notifications.mjs';
import {randomUUID} from 'node:crypto';

const actorCheck=actor=>check(['owner','friend'].includes(actor),'Exact email needs a signed operator');
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const bump=(s,app)=>{s.revision++;s.updated_at=app.now().toISOString();};
function capability(app,config,env,internal=false){
 if(internal){teamNotificationBoundary(app,config);check(env.EVZ_OPERATIONS_GOOGLE_TEAM_NOTIFICATIONS==='fictional-exact-team-v1','Exact internal notification delivery is disabled');return notificationPolicy(config);}
 check(!app.store?.inertBinding&&config.shared_capability!=='inert-shared-v1','D2 notes-only authority rejects email execution');
 const c=config.google_exact_mail;
 check(env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL==='fictional-exact-mail-v1'&&c?.enabled===true&&c.capability==='fictional-exact-mail-v1'&&config.mode==='controlled','Hosted exact email is disabled; production source capability remains unavailable');
 check(c.run_id===config.run_id&&key(c.grant_id)&&c.account_email===config.sender.account_email&&c.from==='hello@evzdigital.studio'&&c.from===config.sender.email&&Number.isInteger(c.daily_limit)&&c.daily_limit>0&&c.daily_limit<=20,'Exact workspace, business owner, sender and bounded allowance binding required');
 return c;
}
function packageInState(state,config,input,actor,now){
 if(input.kind==='notification')return notificationPackageInState(state,config,input,actor,now);
 actorCheck(actor);check(key(input.project_id)&&['reply','project'].includes(input.kind),'Choose a current held reply or project email');
 const r=state.prospects[input.project_id];check(r&&!r.restriction&&!['Stopped','Hold','Closed'].includes(r.stage)&&r.contact?.verified===true,'Current verified active contact required');
 check(!r.follow_up_owner||r.follow_up_owner===actor,'Claim or hand off this conversation first');
 check(!r.information_draft||!['Sending','Uncertain'].includes(r.information_draft.status),'Reconcile the existing information sender first');
 let draft,mail,attachments=[],context;
 if(input.kind==='reply'){
  draft=r.reply_draft;const approval=state.events[draft?.approval_event];
  check(draft?.status==='Approved; sending held'&&replyDraftCurrent(r,draft)&&approval?.id===draft.approval_event&&approval.type==='reply_draft_approved'&&approval.prospect_id===r.id&&approval.actor===draft.approved_by&&approval.data?.sha256===draft.sha256&&approval.data.approved===true&&approval.data.facts_checked===true,'Approve the exact current reply content and facts first');
  mail={from:draft.content.from,to:draft.content.to,subject:draft.content.subject,body:draft.content.body+'\n\n'+draft.content.signature};
  context={draft_sha256:draft.sha256,approval_event:draft.approval_event,reply_sha256:draft.reply_sha256};
 }else{
  check(key(input.draft_id),'Choose the exact held PDF companion draft');draft=r.project_email_drafts?.find(d=>d.id===input.draft_id);
  check(draft?.status==='Held for human review'&&draft.send_authorized===false,'Choose an existing held PDF companion package');
  const {sha256,...original}=draft;check(sha256===hash(original),'Held PDF companion package changed');
  const work=Object.values(r.project_work??{}).find(w=>w.execution?.id===draft.id);
  check(work?.status==='Review'&&work.execution.companion_draft_id===draft.id&&work.result?.asset_id===draft.attachment.asset_id&&work.result.version_id===draft.attachment.version_id,'Current reviewed authored output required');
  check(!work.assigned_to||work.assigned_to===actor,'Hand off the assigned project work first');
  // The export added itself to the index after its source packet was signed; exclude only that new version.
  const sourceState=structuredClone(state),output=sourceState.asset_index[draft.attachment.asset_id];
  check(output.baseline_version!==draft.attachment.version_id,'Output baseline changed after preparation; reload and review');
  delete output.versions[draft.attachment.version_id];if(!Object.keys(output.versions).length)delete sourceState.asset_index[draft.attachment.asset_id];
  const packet=projectWorkContext(sourceState,r.id,work.id);check(packet.context_sha256===draft.context_sha256,'Project, current reply, quote or approved baseline changed; reload and review');
  check((draft.quote_sha256??null)===(packet.source.quote_sha256??null),'Exact approved quote changed');
  const a=draft.attachment,v=projectAssetVersion(state,r.id,a.asset_id,a.version_id);
  check(!state.asset_index[a.asset_id].dispute&&v.reference===a.reference&&v.verified_original?.sha256===a.sha256&&v.verified_original.bytes===a.bytes,'Exact current PDF original/version required');
  check(a.bytes<=mailLimits.attachments,'Attachment exceeds 20,000,000-byte adapter ceiling; separately approve a Drive-link route');
  attachments=[{...a,filename:a.sha256+'.pdf',mime:'application/pdf'}];mail={from:draft.from,to:draft.to,subject:draft.subject,body:draft.body};
  context={draft_sha256:draft.sha256,context_sha256:draft.context_sha256,quote_sha256:draft.quote_sha256??null};
 }
 check(mail.to.toLowerCase()===r.contact.email.toLowerCase()&&mail.from===config.sender.email&&(!r.controlled||mail.to.endsWith('@example.invalid')),'Exact recipient or sender differs from the verified conversation');
 const reply=r.reply??null;if(reply)check(reply.kind==='reply'&&validReplySource(reply),'Complete current reply source required');
 const c=reply?.content,refs=c?[...(c.references??'').split(/\s+/).filter(Boolean),c.message_header_id]:[];
 const p={schema_version:1,project_id:r.id,kind:input.kind,draft_id:draft.id??draft.approval_event,...mail,attachments,...(c&&input.kind==='reply'?{thread_id:c.thread_id,in_reply_to:c.message_header_id,references:refs}:{}),reply_source:reply,owner:r.follow_up_owner??null,contact_sha256:hash(r.contact),quote_sha256:r.quote?hash(r.quote):null,signature_sha256:hash(mail.body),operator_names_sha256:hash(config.sender.operator_names),source:context};
 return {...p,sha256:hash(p)};
}
async function mailEnvelope(app){
 if(app.store){check(typeof app.store.envelope==='function','Exact mail rejects a store without its actual conditional workspace');return (await app.store.envelope()).data;}
 const config=await app.loadConfig(),state=await app.snapshot();check(hash(await app.loadConfig())===hash(config),'Exact mail configuration changed during the local read');return {config,state};
}
export async function exactMailPackage(app,input,actor){check(['reply','project'].includes(input.kind),'Use the separate internal notification review caller');const {state,config}=await mailEnvelope(app);return packageInState(state,config,input,actor);}
export async function approveExactMail(app,input,actor){
 check(['reply','project'].includes(input.kind),'Use the separate internal notification approval caller');
 const config=await app.loadConfig();check(!app.store?.inertBinding,'D2 notes-only authority rejects email approvals');
 return app.change(s=>{
  check(input.revision===s.revision&&key(input.event_id)&&input.approved===true&&input.facts_checked===true,'Review and explicitly approve the exact recipient, complete body/signature and PDF bytes');
  const p=packageInState(s,config,input,actor);check(input.package_sha256===p.sha256,'Exact package changed; review it again');
  const id='exact-'+hash({run:s.run_id,project:p.project_id,kind:p.kind,draft:p.draft_id}).slice(0,32),existing=s.actions[id];
  check(!existing||existing.payload.package_sha256===p.sha256&&!s.operations?.requests?.[id+'-intent'],'Existing exact intent or changed package must be reconciled; no replacement send');
  const event={id:input.event_id,type:'exact_mail_approved',prospect_id:p.project_id,actor,at:app.now().toISOString(),data:{package_sha256:p.sha256,action_id:id}};
  check(!s.events[event.id],'Approval event already exists; read the saved action');
  s.events[event.id]=event;s.actions[id]={id,prospect_id:p.project_id,type:'email',status:'Queued',assigned_to:actor,created_at:event.at,payload:{exact_mail:true,package_sha256:p.sha256,selector:{project_id:input.project_id,kind:input.kind,...(input.draft_id?{draft_id:input.draft_id}:{})},approval_event:event.id,package:p}};
  bump(s,app);return {action_id:id,package_sha256:p.sha256,status:'Approved; transport disabled until separately bound'};
 },{configFingerprint:hash(config)});
}
function current(s,c,a,now){
 check(a?.type==='email'&&a.payload?.exact_mail===true,'Choose an existing approved exact-email action');
 check(['Queued','Pending'].includes(a.status),'Exact action was cancelled, stopped or already settled; reconcile only');
 const approval=s.events[a.payload.approval_event];check(approval?.id===a.payload.approval_event&&approval.actor===a.assigned_to&&approval.data?.action_id===a.id&&approval.data.package_sha256===a.payload.package_sha256&&approval.type===(a.payload.internal_notification?'exact_team_notification_approved':'exact_mail_approved')&&(a.payload.internal_notification||approval.prospect_id===a.prospect_id),'Exact signed send approval missing');
 const p=packageInState(s,c,a.payload.selector,a.assigned_to,now);check(p.sha256===a.payload.package_sha256&&hash(a.payload.package)===hash(p),'Source, stop, assignment, content or attachment changed since exact send approval');
 check(a.payload.internal_notification||!Object.values(s.actions).some(other=>other.id!==a.id&&other.prospect_id===a.prospect_id&&other.type==='email'&&['Queued','Pending','Uncertain'].includes(other.status)),'Another email authority is pending for this conversation; reconcile first');return p;
}
function expectedFor(a,q){check(typeof q.raw_base64url==='string','Reserved MIME was not materialized; held without resend');const raw=Buffer.from(q.raw_base64url,'base64url');check(byteHash(raw)===q.mime_sha256,'Reserved exact MIME integrity changed');return {raw,message_id:q.rfc_message_id,thread_id:a.payload.package.thread_id??q.provider_thread_id??null};}
// One mail invocation includes storage, assets, token/refresh and response bodies.
function mailBudget(app,signal){
 const controller=new AbortController(),deadline=+app.now()+40_000,timer=setTimeout(()=>controller.abort(),40_000);
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const checkTime=()=>check(!combined.aborted&&+app.now()<deadline,'Exact mail operation deadline expired; retain the original intent');
 return {signal:combined,deadline,check:checkTime,close(){clearTimeout(timer);controller.abort();},async run(start){checkTime();let abort;const expired=new Promise((_,reject)=>{abort=()=>reject(Error('Exact mail operation deadline expired; retain the original intent'));combined.addEventListener('abort',abort,{once:true});});try{const result=await Promise.race([start(),expired]);checkTime();return result;}finally{combined.removeEventListener('abort',abort);}}};
}
// Status/hold can change on a signed stop; the original action and complete request still own readback.
function retainedAction(a){if(!a)return null;const {status,hold,...identity}=a;return identity;}
function mailFence(app,config,action,actor,env,budget,request=null,email=null){
 const id=action.id,logical=id+'-intent',internal=action.payload.internal_notification===true;
 let expected=structuredClone(request),identity=hash(retainedAction(action)),prior;email=structuredClone(email);
 const same=(s,q=expected,e=email,a=identity)=>hash(s.operations?.requests?.[logical]??null)===hash(q)&&hash(retainedAction(s.actions[id]))===a&&hash(s.operations?.email?.[id]??null)===hash(e);
 function validate(s,actual,source){
  budget.check();check(hash(actual)===hash(config),'Google execution configuration changed');capability(app,actual,env,internal);
  check(same(s),'Exact email request, attempt or action ownership changed; reconcile the retained intent');
  if(source){check(s.actions[id].assigned_to===actor,'Only the signed approved assignee may dispatch this message');current(s,actual,s.actions[id],app.now());if(expected)check(businessDate(expected.prepared_at)===businessDate(app.now()),'Sender reservation date changed; held without dispatch');}
  return s;
 }
 return {get expected(){return expected;},same,
  async read(source=false){const data=await budget.run(()=>mailEnvelope(app));return validate(data.state,data.config,source);},
  async change(fn,source=false,holding=false){if(!holding)prior={request:structuredClone(expected),email:structuredClone(email),identity};return budget.run(()=>app.change((s,actual)=>{if(holding){budget.check();check(same(s)||prior&&same(s,prior.request,prior.email,prior.identity),'Exact email ownership changed; preserve the successor');}else validate(s,actual??config,source);const result=fn(s,s.operations?.requests?.[logical]);expected=structuredClone(s.operations?.requests?.[logical]??null);email=structuredClone(s.operations?.email?.[id]??null);identity=hash(retainedAction(s.actions[id]));return result;},holding?undefined:{configFingerprint:hash(config)}));}
 };
}
async function mailResult(app,id,fence,budget,error){
 try{const {state}=await budget.run(()=>mailEnvelope(app));check(fence.same(state),'Exact email ownership changed; read the saved intent');const q=state.operations?.requests?.[id+'-intent'];return {action_id:id,status:q?.status??'Uncertain',...(q?.status==='Verified'?{receipt:q.receipt}:{}),reason:error.message};}catch{return {action_id:id,status:'Uncertain',reason:error.message};}
}
async function holdMail(app,id,internal,fence,budget,error){
 try{await fence.change((s,q)=>{if(!q||q.status==='Verified'||q.receipt)return;q.status=q.dispatch_started_at?'Uncertain':'Held';q.hold='Provider/source check or response failed; no automatic resend. Reconcile the reserved intent.';s.actions[id].status='Uncertain';s.operations.email[id].status=q.status;if(internal){s.actions[id].hold=q.hold;s.team_notifications.messages[s.actions[id].payload.package.notification_id].delivery={status:q.status+'; no resend permission',action_id:id};}bump(s,app);},false,true);}catch{}
 return mailResult(app,id,fence,budget,error);
}
async function readExactMail(app,action,internal,provider,fence,budget){
 const id=action.id;
 await fence.change((s,q)=>{check(q&&!q.receipt&&q.status!=='Verified','Exact intent already settled');q.read_claim=randomUUID();q.read_deadline=budget.deadline;bump(s,app);});
 await fence.read();const options={guard:()=>fence.read(),signal:budget.signal};
 await budget.run(()=>provider.preflight(options));await fence.read();
 const q=fence.expected,receipt=await budget.run(()=>provider.reconcileSent(expectedFor(action,q),q.provider_message_id??null,options));
 await fence.read();
 const result=await fence.change((s,saved)=>{saved.status='Verified';saved.receipt=receipt;saved.verified_at=app.now().toISOString();s.actions[id].status='Verified';s.actions[id].delivery={...receipt,at:saved.verified_at};s.operations.email[id]={...s.operations.email[id],status:'Verified',receipt};if(internal){delete saved.hold;delete s.actions[id].hold;s.team_notifications.messages[action.payload.package.notification_id].delivery={status:'Sender verified; inbox delivery unverified',action_id:id,receipt};}bump(s,app);return {action_id:id,status:'Verified',receipt};});
 // A late successful ACK cannot publish over a newer request/receipt.
 await fence.read();return result;
}
export async function dispatchExactMail(app,input,{actor,env=process.env,transport=null,getAccessToken,fetcher,signal}={}){
 actorCheck(actor);check(key(input.action_id),'Choose exact saved send action');check(!app.store?.inertBinding,'D2 notes-only authority rejects email execution');
 const budget=mailBudget(app,signal);
 try{
  const {config,state:s}=await budget.run(()=>mailEnvelope(app)),a=s.actions[input.action_id],internal=a?.payload?.internal_notification===true,c=capability(app,config,env,internal);
  check(a?.assigned_to===actor,'Only the signed approved assignee may dispatch this message');
  const logical=a.id+'-intent',prior=s.operations?.requests?.[logical];if(prior)return {action_id:a.id,status:prior.status,reason:'Intent already reserved; reconcile only, never dispatch again'};
  check(!s.operations?.email?.[a.id],'Existing email authority must be reconciled; no replacement intent');
  const p=current(s,config,a,app.now()),fence=mailFence(app,config,a,actor,env,budget);let at=app.now().toISOString(),sending=true;
  await fence.change(state=>{
   const reservationNow=app.now();if(internal)at=reservationNow.toISOString();
   const today=businessDate(reservationNow),requests=Object.values(state.operations?.requests??{}),legacy=Object.values(state.prospects).filter(r=>r.information_draft?.approved_at&&businessDate(r.information_draft.approved_at)===today).length;
   if(internal)notificationBudget(state,currentNotificationPolicy(state,config,reservationNow),reservationNow);
   check(legacy+requests.filter(q=>['intent','send'].includes(q.operation)&&q.prepared_at&&businessDate(q.prepared_at)===today).length<(internal?c.sender_daily_limit:c.daily_limit),'Daily combined sender reservation exhausted');
   const o=state.operations??={};o.requests??={};o.email??={};
   o.requests[logical]={logical,operation:'intent',transport:'google-exact-mail-v1',status:'Reserved',prepared_at:at,request_claim:randomUUID(),dispatch_deadline:budget.deadline,package_sha256:p.sha256,binding_sha256:hash(c),rfc_message_id:mailMessageId(a.id),...(internal?{internal_notification:true,policy_id:c.policy_id}:{})};
   o.email[a.id]={prospect_id:a.prospect_id,status:'Reserved',package_sha256:p.sha256};state.actions[a.id].status='Pending';bump(state,app);
   if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Reserved; delivery held',action_id:a.id};
  },true);
  const provider=transport??googleHostedTransport({getAccessToken,fetcher,account:c.account_email,grantId:c.grant_id});
  try{
   await fence.read(true);const bytes=[];
   for(const part of p.attachments){bytes.push((await budget.run(()=>readProjectAsset(app,p.project_id,part.asset_id,part.version_id))).bytes);await fence.read(true);}
   const composed=composeExactMail(p,a.id,at,bytes);budget.check();
   await fence.change((state,q)=>{check(q.status==='Reserved'&&!q.raw_base64url,'MIME already materialized; never retry');q.mime_sha256=byteHash(composed.raw);q.raw_base64url=composed.raw.toString('base64url');bump(state,app);},true);
   await fence.read(true);const options={guard:()=>fence.read(sending),signal:budget.signal,onPost:()=>{budget.check();sending=false;}};
   await budget.run(()=>provider.preflight(options));await fence.read(true);
   const fresh=internal?{notification_source_sha256:p.source_sha256}:await budget.run(()=>provider.freshSource(p,options));await fence.read(true);
   await fence.change((state,q)=>{const dispatchNow=app.now();check(q.status==='Reserved'&&!q.dispatch_claim&&!q.read_claim,'Dispatch already claimed; never retry');q.status='Uncertain';q.dispatch_started_at=dispatchNow.toISOString();q.dispatch_claim=randomUUID();q.fresh_source=fresh;state.operations.email[a.id].status='Uncertain';if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Uncertain; dispatch claimed, no resend permission',action_id:a.id};bump(state,app);},true);
   await fence.read(true);
   const sent=await budget.run(()=>provider.send(composed,options));sending=false;await fence.read();
   await fence.change((state,q)=>{q.provider_message_id=sent.id;q.provider_thread_id=sent.thread_id;bump(state,app);});await fence.read();
   return await readExactMail(app,a,internal,provider,fence,budget);
  }catch(error){return await holdMail(app,a.id,internal,fence,budget,error);}
 }finally{budget.close();}
}
export async function reconcileExactMail(app,input,{actor,env=process.env,transport=null,getAccessToken,fetcher,signal}={}){
 check(!app.store?.inertBinding,'D2 notes-only authority rejects email execution');actorCheck(actor);check(key(input.action_id),'Choose exact saved send action');const budget=mailBudget(app,signal);
 try{
  const {config,state}=await budget.run(()=>mailEnvelope(app)),a=state.actions[input.action_id],internal=a?.payload?.internal_notification===true,c=capability(app,config,env,internal),q=state.operations?.requests?.[input.action_id+'-intent'];
  check(a?.payload?.exact_mail&&q?.transport==='google-exact-mail-v1'&&q.logical===input.action_id+'-intent'&&q.package_sha256===a.payload.package_sha256&&q.rfc_message_id===mailMessageId(a.id),'Existing exact intent required');check(a.assigned_to===actor,'Signed approved assignee required');
  if(q.status==='Verified')return {action_id:a.id,status:q.status,receipt:q.receipt};
  check(q.binding_sha256===hash(c),'Reconcile under the same owner grant/workspace binding');
  const fence=mailFence(app,config,a,actor,env,budget,q,state.operations?.email?.[a.id]??null),provider=transport??googleHostedTransport({getAccessToken,fetcher,account:c.account_email,grantId:c.grant_id});
  try{return await readExactMail(app,a,internal,provider,fence,budget);}catch(error){return await holdMail(app,a.id,internal,fence,budget,error);}
 }finally{budget.close();}
}
