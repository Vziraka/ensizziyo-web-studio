import {check,hash,businessDate} from './lifecycle.mjs';
import {replyDraftCurrent,validReplySource} from './reply-content.mjs';
import {projectWorkContext} from './project-work.mjs';
import {readProjectAsset,projectAssetVersion} from './project-assets.mjs';
import {composeExactMail,googleHostedTransport,mailLimits,byteHash,mailMessageId} from './google-hosted-transport.mjs';
import {teamNotificationBoundary,notificationPolicy,currentNotificationPolicy,notificationPackageInState,notificationBudget} from './exact-team-notifications.mjs';

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
  draft=r.reply_draft;check(draft?.status==='Approved; sending held'&&replyDraftCurrent(r,draft)&&state.events[draft.approval_event]?.actor===draft.approved_by,'Approve the exact current reply content and facts first');
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
export async function exactMailPackage(app,input,actor){check(['reply','project'].includes(input.kind),'Use the separate internal notification review caller');return packageInState(await app.snapshot(),await app.loadConfig(),input,actor);}
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
 });
}
function current(s,c,a,now){
 check(a?.type==='email'&&a.payload?.exact_mail===true,'Choose an existing approved exact-email action');
 check(['Queued','Pending'].includes(a.status),'Exact action was cancelled, stopped or already settled; reconcile only');
 const approval=s.events[a.payload.approval_event];check(approval?.actor===a.assigned_to&&approval.data.package_sha256===a.payload.package_sha256,'Exact signed send approval missing');
 check(!a.payload.internal_notification||approval.type==='exact_team_notification_approved','Exact signed internal message approval required');
 const p=packageInState(s,c,a.payload.selector,a.assigned_to,now);check(p.sha256===a.payload.package_sha256,'Source, stop, assignment, content or attachment changed since exact send approval');
 check(a.payload.internal_notification||!Object.values(s.actions).some(other=>other.id!==a.id&&other.prospect_id===a.prospect_id&&other.type==='email'&&['Queued','Pending','Uncertain'].includes(other.status)),'Another email authority is pending for this conversation; reconcile first');return p;
}
function expectedFor(a,q){check(typeof q.raw_base64url==='string','Reserved MIME was not materialized; held without resend');const raw=Buffer.from(q.raw_base64url,'base64url');check(byteHash(raw)===q.mime_sha256,'Reserved exact MIME integrity changed');return {raw,message_id:q.rfc_message_id,thread_id:a.payload.package.thread_id??q.provider_thread_id??null};}
export async function dispatchExactMail(app,input,{actor,env=process.env,transport=null,getAccessToken,fetcher}={}){
 actorCheck(actor);check(key(input.action_id),'Choose exact saved send action');
 check(!app.store?.inertBinding,'D2 notes-only authority rejects email execution');
 const config=await app.loadConfig(),s=await app.snapshot(),a=s.actions[input.action_id],internal=a?.payload?.internal_notification===true,c=capability(app,config,env,internal);
 check(a?.assigned_to===actor,'Only the signed approved assignee may dispatch this message');
 const prior=s.operations?.requests?.[a.id+'-intent'];if(prior)return {action_id:a.id,status:prior.status,reason:'Intent already reserved; reconcile only, never dispatch again'};
 const p=current(s,config,a,app.now()),logical=a.id+'-intent';let at=app.now().toISOString();
 await app.change(state=>{
  const reservationNow=app.now();if(internal)at=reservationNow.toISOString();
  check(!state.operations?.requests?.[logical],'Intent already reserved; reconciliation only');current(state,config,state.actions[a.id],reservationNow);
  const today=businessDate(reservationNow),requests=Object.values(state.operations?.requests??{}),legacy=Object.values(state.prospects).filter(r=>r.information_draft?.approved_at&&businessDate(r.information_draft.approved_at)===today).length;
  if(internal)notificationBudget(state,currentNotificationPolicy(state,config,reservationNow),reservationNow);
  check(legacy+requests.filter(q=>['intent','send'].includes(q.operation)&&q.prepared_at&&businessDate(q.prepared_at)===today).length<(internal?c.sender_daily_limit:c.daily_limit),'Daily combined sender reservation exhausted');
  const o=state.operations??={};o.requests??={};o.email??={};
  // One durable intent is the authority across dispatch, response loss and background redelivery.
  o.requests[logical]={logical,operation:'intent',transport:'google-exact-mail-v1',status:'Reserved',prepared_at:at,package_sha256:p.sha256,binding_sha256:hash(c),rfc_message_id:mailMessageId(a.id),...(internal?{internal_notification:true,policy_id:c.policy_id}:{} )};
  o.email[a.id]={prospect_id:a.prospect_id,status:'Reserved',package_sha256:p.sha256};state.actions[a.id].status='Pending';bump(state,app);
  if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Reserved; delivery held',action_id:a.id};
 },internal?{configFingerprint:hash(config)}:undefined);
 const provider=transport??googleHostedTransport({getAccessToken,fetcher,account:c.account_email,grantId:c.grant_id});
 try{
  const bytes=[];for(const part of p.attachments)bytes.push((await readProjectAsset(app,p.project_id,part.asset_id,part.version_id)).bytes);
  const composed=composeExactMail(p,a.id,at,bytes);
  await app.change(state=>{current(state,config,state.actions[a.id],app.now());const q=state.operations.requests[logical];check(q.status==='Reserved'&&!q.raw_base64url,'MIME already materialized; never retry');q.mime_sha256=byteHash(composed.raw);q.raw_base64url=composed.raw.toString('base64url');bump(state,app);},internal?{configFingerprint:hash(config)}:undefined);
  await provider.preflight();const fresh=internal?{notification_source_sha256:p.source_sha256}:await provider.freshSource(p);const latest=await app.loadConfig();const latestBinding=capability(app,latest,env,internal);check(hash(latestBinding)===hash(c),'Google execution binding changed');
  await app.change(state=>{const dispatchNow=app.now();current(state,latest,state.actions[a.id],dispatchNow);const q=state.operations.requests[logical];check(q.status==='Reserved','Dispatch already claimed; never retry');check(!internal||businessDate(q.prepared_at)===businessDate(dispatchNow),'Sender reservation date changed; held without dispatch');q.status='Uncertain';q.dispatch_started_at=dispatchNow.toISOString();q.fresh_source=fresh;state.operations.email[a.id].status='Uncertain';if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Uncertain; dispatch claimed, no resend permission',action_id:a.id};bump(state,app);},internal?{configFingerprint:hash(latest)}:undefined);
  const sent=await provider.send(composed);
  await app.change(state=>{const q=state.operations.requests[logical];q.provider_message_id=sent.id;q.provider_thread_id=sent.thread_id;bump(state,app);});
  return await reconcileExactMail(app,{action_id:a.id},{actor,env,transport:provider});
 }catch(error){
  await app.change(state=>{const q=state.operations.requests[logical];if(q.status!=='Verified'){q.status=q.dispatch_started_at?'Uncertain':'Held';q.hold='Provider/source check or response failed; no automatic resend. Reconcile the reserved intent.';state.actions[a.id].status='Uncertain';state.operations.email[a.id].status=q.status;if(internal){state.actions[a.id].hold=q.hold;state.team_notifications.messages[p.notification_id].delivery={status:q.status+'; no resend permission',action_id:a.id};}bump(state,app);}});
  return {action_id:a.id,status:(await app.snapshot()).operations.requests[logical].status,reason:error.message};
 }
}
export async function reconcileExactMail(app,input,{actor,env=process.env,transport=null,getAccessToken,fetcher}={}){
 check(!app.store?.inertBinding,'D2 notes-only authority rejects email execution');
 actorCheck(actor);const config=await app.loadConfig(),state=await app.snapshot(),a=state.actions[input.action_id],internal=a?.payload?.internal_notification===true,c=capability(app,config,env,internal),q=state.operations?.requests?.[input.action_id+'-intent'];
 check(a?.payload?.exact_mail&&q?.transport==='google-exact-mail-v1','Existing exact intent required');check(a.assigned_to===actor,'Signed approved assignee required');
 if(q.status==='Verified')return {action_id:a.id,status:q.status,receipt:q.receipt};
 check(q.binding_sha256===hash(c),'Reconcile under the same owner grant/workspace binding');
 const provider=transport??googleHostedTransport({getAccessToken,fetcher,account:c.account_email,grantId:c.grant_id});
 try{await provider.preflight();const receipt=await provider.reconcileSent(expectedFor(a,q),q.provider_message_id??null);
  return await app.change(s=>{const saved=s.operations.requests[a.id+'-intent'];check(saved.package_sha256===q.package_sha256&&saved.raw_base64url===q.raw_base64url,'Reserved exact MIME changed');saved.status='Verified';saved.receipt=receipt;saved.verified_at=app.now().toISOString();s.actions[a.id].status='Verified';s.actions[a.id].delivery={...receipt,at:saved.verified_at};s.operations.email[a.id]={...s.operations.email[a.id],status:'Verified',receipt};if(internal){delete saved.hold;delete s.actions[a.id].hold;const m=s.team_notifications.messages[a.payload.package.notification_id];m.delivery={status:'Sender verified; inbox delivery unverified',action_id:a.id,receipt};}bump(s,app);return {action_id:a.id,status:'Verified',receipt};});
 }catch(error){await app.change(s=>{const saved=s.operations.requests[a.id+'-intent'];if(saved.status!=='Verified'){saved.status='Uncertain';saved.hold='No unique complete exact Sent readback; no resend permission';s.operations.email[a.id].status='Uncertain';if(internal){s.actions[a.id].hold=saved.hold;s.team_notifications.messages[a.payload.package.notification_id].delivery={status:'Uncertain; no resend permission',action_id:a.id};}bump(s,app);}});return {action_id:a.id,status:'Uncertain',reason:error.message};}
}
