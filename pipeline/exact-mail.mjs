import {dispatchReplyBundlePolicy} from './email-draft-policy.mjs';
import {operationsPDFMailCapability,isOperationsMail,pdfAuthorization,reservePDFIncoming,assertPDFIncomingGrant,pdfCoverageActive,operationsMailCapability,operationsMailProfile,hasOperationsMail,sharedMailBoundary,declaredMailRoute,newThreadMailHold,mailSourceEvidence,mailWitness,currentMailAuthority,mailObservationCount,mailStorageAllowance,mailRawCeiling,mailOwnedState,assertSharedMailAction} from './shared-operations-exact-mail.mjs';
import {check,hash,businessDate} from './lifecycle.mjs';
import {replyDraftCurrent,validReplySource} from './reply-content.mjs';
import {currentReplyAttachments} from './reply-attachments.mjs';
import {projectWorkContext} from './project-work.mjs';
import {readProjectAsset,projectAssetVersion} from './project-assets.mjs';
import {composeExactMail,googleHostedTransport,mailLimits,byteHash,mailMessageId} from './google-hosted-transport.mjs';
import {teamNotificationBoundary,notificationPolicy,currentNotificationPolicy,notificationPackageInState,notificationBudget} from './exact-team-notifications.mjs';
import {publishPDFRoute} from './google-incoming-mail.mjs';
import {randomUUID} from 'node:crypto';

const actorCheck=actor=>check(['owner','friend'].includes(actor),'Exact email needs a signed operator');
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const bump=(s,app)=>{s.revision++;s.updated_at=app.now().toISOString();};
function capability(app,config,env,internal=false){
 if(internal){teamNotificationBoundary(app,config);check(env.EVZ_OPERATIONS_GOOGLE_TEAM_NOTIFICATIONS==='fictional-exact-team-v1','Exact internal notification delivery is disabled');return notificationPolicy(config);}
 check(!app.store?.inertBinding&&config.shared_capability!=='inert-shared-v1','D2 notes-only authority rejects email execution');
 if(isOperationsMail(config.shared_capability))return sharedMailBoundary(app,config,env);
 const c=config.google_exact_mail;
 check(env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL==='fictional-exact-mail-v1'&&c?.enabled===true&&c.capability==='fictional-exact-mail-v1'&&config.mode==='controlled','Hosted exact email is disabled; production source capability remains unavailable');
 check(c.run_id===config.run_id&&key(c.grant_id)&&c.account_email===config.sender.account_email&&c.from==='hello@evzdigital.studio'&&c.from===config.sender.email&&Number.isInteger(c.daily_limit)&&c.daily_limit>0&&c.daily_limit<=20,'Exact workspace, business owner, sender and bounded allowance binding required');
 return c;
}
export function packageInState(state,config,input,actor,now){
 if(input.kind==='notification')return notificationPackageInState(state,config,input,actor,now);
 actorCheck(actor);check(key(input.project_id)&&['reply','project'].includes(input.kind),'Choose a current held reply or project email');
 const r=state.prospects[input.project_id];check(r&&!r.restriction&&!['Stopped','Hold','Closed'].includes(r.stage)&&r.contact?.verified===true,'Current verified active contact required');
 check(!r.follow_up_owner||r.follow_up_owner===actor,'Claim or hand off this conversation first');
 check(!r.information_draft||!['Sending','Uncertain'].includes(r.information_draft.status),'Reconcile the existing information sender first');
 let draft,mail,attachments=[],context;
 if(input.kind==='reply'){
  draft=r.reply_draft;const approval=state.events[draft?.approval_event];
  check(draft?.status==='Approved; sending held'&&replyDraftCurrent(r,draft,config,state)&&approval?.id===draft.approval_event&&approval.type==='reply_draft_approved'&&approval.prospect_id===r.id&&approval.actor===draft.approved_by&&approval.data?.sha256===draft.sha256&&approval.data.approved===true&&approval.data.facts_checked===true,'Approve the exact current reply content and facts first');
  if(draft.content.attachments?.length){const permission=dispatchReplyBundlePolicy(config);check(!config.shared_capability&&!config.email_task_proof||permission&&permission.project_id===r.id&&permission.thread_id===r.reply.thread_id&&draft.content.agent_origin&&draft.content.attachments.length<=2&&draft.content.attachments.every(a=>a.bytes<=512000),'Existing shared profiles do not authorize attached replies');attachments=currentReplyAttachments(state,r.id,draft.content.attachments).map(a=>({...a,filename:a.sha256+'.pdf'}));}
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
function exactSelector(input,approve=false){
 const fields=['project_id','kind',...(input.kind==='project'?['draft_id']:[]),...(approve?['revision','event_id','package_sha256','approved','facts_checked']:[])];check(Object.keys(input).sort().join(',')===fields.sort().join(','),'Use the exact current mail selector/approval fields');
}
export async function exactMailPackage(app,input,actor){
 check(['reply','project'].includes(input.kind),'Use the separate internal notification review caller');const data=await mailEnvelope(app);if(hasOperationsMail({...app,config:data.config}))exactSelector(input);
 const p=packageInState(data.state,data.config,input,actor);return hasOperationsMail({...app,config:data.config})?{...p,execution_hold:p.kind==='project'&&data.config.shared_capability!==operationsPDFMailCapability?newThreadMailHold:null}:p;
}
export function applyMailApproval(s,config,input,actor,at,sourceEvidence=null){
 check(input.revision===s.revision&&key(input.event_id)&&input.approved===true&&input.facts_checked===true,'Review and explicitly approve the exact recipient, complete body/signature and PDF bytes');
 if(sourceEvidence)exactSelector(input,true);const p=packageInState(s,config,input,actor);check(input.package_sha256===p.sha256,'Exact package changed; review it again');
 if(sourceEvidence){declaredMailRoute(s,config,p,new Date(at));check(!Object.values(s.actions).some(other=>other.prospect_id===p.project_id&&other.type==='email'&&(['Queued','Pending','Uncertain'].includes(other.status)||s.operations?.requests?.[other.id+'-intent']&&!['Verified','Cancelled'].includes(s.operations.requests[other.id+'-intent'].status))),'Existing conversation email authority must be reconciled; no replacement action');}
 const id='exact-'+hash({run:s.run_id,project:p.project_id,kind:p.kind,draft:p.draft_id}).slice(0,32),existing=s.actions[id];
 check(!existing||!sourceEvidence&&existing.payload.package_sha256===p.sha256&&!s.operations?.requests?.[id+'-intent'],'Existing exact intent or changed package must be reconciled; no replacement send');
 const incoming=sourceEvidence&&p.kind==='project'?pdfAuthorization(s,config,p,{active:true,now:new Date(at)}):null;
 const event={id:input.event_id,type:'exact_mail_approved',prospect_id:p.project_id,actor,at,data:{package_sha256:p.sha256,action_id:id,...(sourceEvidence?{source_evidence_sha256:hash(sourceEvidence),...(incoming?{incoming_authorization_event:incoming.id,incoming_permission_sha256:hash(config.internal_dispatch.incoming_pdf)}:{})}:{})}};
 check(!s.events[event.id],'Approval event already exists; read the saved action');
 s.events[event.id]=event;s.actions[id]={id,prospect_id:p.project_id,type:'email',status:'Queued',assigned_to:actor,created_at:event.at,payload:{exact_mail:true,package_sha256:p.sha256,selector:{project_id:input.project_id,kind:input.kind,...(input.draft_id?{draft_id:input.draft_id}:{})},approval_event:event.id,package:p,...(sourceEvidence?{source_evidence:structuredClone(sourceEvidence)}:{})}};
 s.revision++;s.updated_at=at;return {action_id:id,package_sha256:p.sha256,status:'Approved; transport disabled until separately bound'};
}
export async function approveExactMail(app,input,actor){
 check(['reply','project'].includes(input.kind),'Use the separate internal notification approval caller');check(!app.store?.inertBinding,'D2 notes-only authority rejects email approvals');const budget=mailBudget(app);
 try{const data=await budget.run(()=>mailEnvelope(app)),config=data.config,shared=hasOperationsMail({...app,config}),w={};
  if(shared){exactSelector(input,true);sharedMailBoundary(app,config,app.store.originalsEnvironment,{runtime:false});declaredMailRoute(data.state,config,packageInState(data.state,config,input,actor));}
  return await budget.run(()=>app.change((s,actual)=>{const before={...data,state:s,config:actual??config};if(shared)Object.assign(w,mailWitness(app,before,actor,budget,'approve',{input}));return applyMailApproval(s,actual??config,input,actor,shared?w.at:app.now().toISOString(),shared?mailSourceEvidence(before,app.store.dispatchBinding):null);},{configFingerprint:hash(config),...(shared?{projectMail:w,mailSignal:budget.signal}:{})}));
 }finally{budget.close();}
}
// The caller and independent store replay share these domain mutations, never a proposed after-state.
export function applyMailStep(state,config,w,derived={}){
 const id=w.action_id,logical=id+'-intent',a=state.actions[id],p=a.payload.package,internal=a.payload.internal_notification===true,shared=isOperationsMail(config.shared_capability);let q=state.operations?.requests?.[logical];
 if(w.type==='reserve'){
  const today=businessDate(w.at),requests=Object.values(state.operations?.requests??{}),legacy=Object.values(state.prospects).filter(r=>r.information_draft?.approved_at&&businessDate(r.information_draft.approved_at)===today).length,c=internal?notificationPolicy(config):config.google_exact_mail;
  if(internal)notificationBudget(state,currentNotificationPolicy(state,config,new Date(w.at)),new Date(w.at));
  check(!q&&!state.operations?.email?.[id]&&legacy+requests.filter(r=>['intent','send'].includes(r.operation)&&r.prepared_at&&businessDate(r.prepared_at)===today).length<(internal?c.sender_daily_limit:c.daily_limit),'Daily combined sender reservation exhausted');
  const o=state.operations??={};o.requests??={};o.email??={};q=o.requests[logical]={logical,operation:'intent',transport:'google-exact-mail-v1',status:'Reserved',prepared_at:w.at,request_claim:w.details.request_claim,dispatch_deadline:w.deadline,package_sha256:p.sha256,binding_sha256:hash(c),rfc_message_id:mailMessageId(id),...(shared?{source_config_sha256:hash(config),observations:[]}:{}) ,...(internal?{internal_notification:true,policy_id:c.policy_id}:{})};
  if(shared&&p.kind==='project')q.incoming_pdf=reservePDFIncoming(state,config,p,a.payload.source_evidence.binding,w.at);
  o.email[id]={prospect_id:a.prospect_id,status:'Reserved',package_sha256:p.sha256};a.status='Pending';if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Reserved; delivery held',action_id:id};
 }else if(w.type==='materialize'){check(q.status==='Reserved'&&!q.raw_base64url,'MIME already materialized; never retry');q.mime_sha256=w.details.mime_sha256;q.raw_base64url=w.details.raw_base64url;
 }else if(w.type==='dispatch'){check(q.status==='Reserved'&&!q.dispatch_claim&&!q.read_claim,'Dispatch already claimed; never retry');q.status='Uncertain';q.dispatch_started_at=w.at;q.dispatch_claim=w.details.dispatch_claim;q.fresh_source=derived.fresh_source;if(shared&&p.kind==='project'){const profile=w.observations.find(o=>o.path==='profile');check(/^[1-9][0-9]{0,29}$/.test(profile?.value?.historyId)&&BigInt(profile.value.historyId)>=BigInt(q.incoming_pdf.reserved_cursor),'Pre-send original history anchor required');q.incoming_pdf.status='Unresolved';q.incoming_pdf.anchor={history_id:profile.value.historyId,observation_sha256:hash(profile)};}state.operations.email[id].status='Uncertain';if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Uncertain; dispatch claimed, no resend permission',action_id:id};
 }else if(w.type==='sent'){check(q.status==='Uncertain'&&q.dispatch_claim&&!q.receipt,'Only the original unsettled dispatch may retain a response');q.provider_message_id=derived.sent.id;q.provider_thread_id=derived.sent.thread_id;
 }else if(w.type==='read'){check(q&&!q.receipt&&q.status!=='Verified'&&q.raw_base64url,'Exact materialized unsettled intent required');q.read_claim=w.details.read_claim;q.read_deadline=w.deadline;
 }else if(w.type==='verified'){const receipt=derived.receipt;check(q.read_claim&&!q.receipt,'Exact original read claim required');q.status='Verified';q.receipt=receipt;q.verified_at=w.at;a.status='Verified';a.delivery={...receipt,at:w.at};state.operations.email[id]={...state.operations.email[id],status:'Verified',receipt};if(shared&&p.kind==='project')publishPDFRoute(state,config,id,w.at,derived.incoming_active===true);if(internal){delete q.hold;delete a.hold;state.team_notifications.messages[p.notification_id].delivery={status:'Sender verified; inbox delivery unverified',action_id:id,receipt};}
 }else if(w.type==='hold'){check(q&&q.status!=='Verified'&&!q.receipt,'Cannot replace a missing or terminal exact intent');q.status=q.dispatch_started_at?'Uncertain':'Held';if(shared&&q.incoming_pdf&&!q.dispatch_started_at){q.incoming_pdf.status='Held';q.incoming_pdf.hold={code:'PRE_SEND_HELD',at:w.at,tick_id:null};}q.hold='Provider/source check or response failed; no automatic resend. Reconcile the reserved intent.';a.status='Uncertain';state.operations.email[id].status=q.status;if(internal){a.hold=q.hold;state.team_notifications.messages[p.notification_id].delivery={status:q.status+'; no resend permission',action_id:id};}
 }else throw Error('Unsupported exact mail step');
 if(shared&&w.type!=='reserve'){q.observations.push({type:w.type,at:w.at,deadline:w.deadline,claim:{request_claim:q.request_claim,dispatch_claim:q.dispatch_claim??null,read_claim:q.read_claim??null},grant:structuredClone(w.grant),requests:structuredClone(w.observations)});check(mailObservationCount(q)<=64,'Finite exact mail observation history exceeded');}
 state.revision++;state.updated_at=w.at;return w.type==='verified'?{action_id:id,status:'Verified',receipt:q.receipt}:undefined;
}
export function currentExactMail(s,c,a,now){
 check(a?.type==='email'&&a.payload?.exact_mail===true,'Choose an existing approved exact-email action');
 check(['Queued','Pending'].includes(a.status),'Exact action was cancelled, stopped or already settled; reconcile only');
 const approval=s.events[a.payload.approval_event];check(approval?.id===a.payload.approval_event&&approval.actor===a.assigned_to&&approval.data?.action_id===a.id&&approval.data.package_sha256===a.payload.package_sha256&&approval.type===(a.payload.internal_notification?'exact_team_notification_approved':'exact_mail_approved')&&(a.payload.internal_notification||approval.prospect_id===a.prospect_id),'Exact signed send approval missing');
 const p=packageInState(s,c,a.payload.selector,a.assigned_to,now);check(p.sha256===a.payload.package_sha256&&hash(a.payload.package)===hash(p),'Source, stop, assignment, content or attachment changed since exact send approval');
 check(a.payload.internal_notification||!Object.values(s.actions).some(other=>other.id!==a.id&&other.prospect_id===a.prospect_id&&other.type==='email'&&['Queued','Pending','Uncertain'].includes(other.status)),'Another email authority is pending for this conversation; reconcile first');return p;
}
export function expectedFor(a,q){check(typeof q.raw_base64url==='string','Reserved MIME was not materialized; held without resend');const raw=Buffer.from(q.raw_base64url,'base64url');check(byteHash(raw)===q.mime_sha256,'Reserved exact MIME integrity changed');return {raw,message_id:q.rfc_message_id,thread_id:a.payload.package.thread_id??q.provider_thread_id??null};}
// One mail invocation includes storage, assets, token/refresh and response bodies.
function mailBudget(app,signal){
 const controller=new AbortController(),deadline=+app.now()+40_000,timer=setTimeout(()=>controller.abort(),40_000);
 const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const checkTime=()=>check(!combined.aborted&&+app.now()<deadline,'Exact mail operation deadline expired; retain the original intent');
 return {signal:combined,deadline,check:checkTime,close(){clearTimeout(timer);controller.abort();},async run(start){checkTime();let abort;const expired=new Promise((_,reject)=>{abort=()=>reject(Error('Exact mail operation deadline expired; retain the original intent'));combined.addEventListener('abort',abort,{once:true});});try{const result=await Promise.race([start(),expired]);checkTime();return result;}finally{combined.removeEventListener('abort',abort);}}};
}
// Status/hold can change on a signed stop; the original action and complete request still own readback.
export function retainedAction(a){if(!a)return null;const {status,hold,...identity}=a;return identity;}
function mailFence(app,config,action,actor,env,budget,request=null,email=null){
 const id=action.id,logical=id+'-intent',internal=action.payload.internal_notification===true;
 const shared=hasOperationsMail(app),historyStart=mailObservationCount(request);let expected=structuredClone(request),identity=hash(retainedAction(action)),prior;email=structuredClone(email);
 const same=(s,q=expected,e=email,a=identity)=>hash(s.operations?.requests?.[logical]??null)===hash(q)&&hash(retainedAction(s.actions[id]))===a&&hash(s.operations?.email?.[id]??null)===hash(e);
 function validate(s,actual,source){
  budget.check();check(hash(actual)===hash(config),'Google execution configuration changed');capability(app,actual,env,internal);
  check(same(s),'Exact email request, attempt or action ownership changed; reconcile the retained intent');
  if(source){check(s.actions[id].assigned_to===actor,'Only the signed approved assignee may dispatch this message');currentExactMail(s,actual,s.actions[id],app.now());if(shared)currentMailAuthority(s,actual,s.actions[id],app.store.dispatchBinding,{now:app.now()});if(expected)check(businessDate(expected.prepared_at)===businessDate(app.now()),'Sender reservation date changed; held without dispatch');}
  if(shared&&expected?.raw_base64url&&expected.status!=='Verified'&&(source||expected.read_claim)){const read=!source;check(mailObservationCount(expected)+(read?6:10)<=64,'Finite raw observation allowance exhausted before provider work');mailStorageAllowance({schema_version:1,config:actual,state:s,dispatch_source:s.actions[id].payload.source_evidence.dispatch_source},expected,{read});}
  return s;
 }
 return {get expected(){return expected;},same,
  async read(source=false){let data=await budget.run(()=>mailEnvelope(app));if(source&&shared&&action.payload.package.kind==='project'){await budget.run(()=>assertPDFIncomingGrant(app,data.config,app.now().toISOString()));data=await budget.run(()=>mailEnvelope(app));}return validate(data.state,data.config,source);},
  async change(fn,source=false,holding=false,stage=null){
   if(!holding)prior={request:structuredClone(expected),email:structuredClone(email),identity};const w={};
   return budget.run(()=>app.change((s,actual)=>{
    if(holding){budget.check();check(same(s)||prior&&same(s,prior.request,prior.email,prior.identity),'Exact email ownership changed; preserve the successor');}else validate(s,actual??config,source);
    if(shared){check(stage,'Exact typed mail step required');const details={action_id:id,...stage.details};if(holding)details.owned_state_sha256=mailOwnedState({q:s.operations?.requests?.[logical]??null,a:s.actions[id],email:s.operations?.email?.[id]??null});Object.assign(w,mailWitness(app,{state:s,config:actual??config},actor,budget,stage.type,details,stage.provider,historyStart));}
    const result=shared?applyMailStep(s,actual??config,w,stage.derived??{}):fn(s,s.operations?.requests?.[logical]);expected=structuredClone(s.operations?.requests?.[logical]??null);email=structuredClone(s.operations?.email?.[id]??null);identity=hash(retainedAction(s.actions[id]));return result;
   },shared?{configFingerprint:hash(config),projectMail:w,mailSignal:budget.signal}:holding?undefined:{configFingerprint:hash(config)}));
  }

 };
}
async function mailResult(app,id,fence,budget,error){
 const failure=hasOperationsMail(app)?{reason_code:budget.signal.aborted||+app.now()>=budget.deadline?'DEADLINE':'CHECK_FAILED',reason:'Exact source/provider check held. Read back the retained intent; no automatic resend permission.'}:{reason:error.message};
 try{const {state}=await budget.run(()=>mailEnvelope(app));check(fence.same(state),'Exact email ownership changed; read the saved intent');const q=state.operations?.requests?.[id+'-intent'];return {action_id:id,status:q?.status??'Uncertain',...(q?.status==='Verified'?{receipt:q.receipt}:{}),...failure};}catch{return {action_id:id,status:'Uncertain',...failure};}
}
async function holdMail(app,id,internal,fence,budget,error,phase='dispatch',provider=null){
 try{await fence.change((s,q)=>{if(!q||q.status==='Verified'||q.receipt)return;q.status=q.dispatch_started_at?'Uncertain':'Held';q.hold='Provider/source check or response failed; no automatic resend. Reconcile the reserved intent.';s.actions[id].status='Uncertain';s.operations.email[id].status=q.status;if(internal){s.actions[id].hold=q.hold;s.team_notifications.messages[s.actions[id].payload.package.notification_id].delivery={status:q.status+'; no resend permission',action_id:id};}bump(s,app);},false,true,{type:'hold',details:{phase,reason_code:budget.signal.aborted?'DEADLINE':'CHECK_FAILED'},provider});}catch{}
 return mailResult(app,id,fence,budget,error);
}
async function readExactMail(app,action,internal,provider,fence,budget){
 const id=action.id,readClaim=randomUUID();
 await fence.change((s,q)=>{check(q&&!q.receipt&&q.status!=='Verified','Exact intent already settled');q.read_claim=readClaim;q.read_deadline=budget.deadline;bump(s,app);},false,false,{type:'read',details:{read_claim:readClaim}});
 await fence.read();const options={guard:()=>fence.read(),signal:budget.signal};
 await budget.run(()=>provider.preflight(options));await fence.read();
 const q=fence.expected,receipt=await budget.run(()=>provider.reconcileSent(expectedFor(action,q),q.provider_message_id??null,options));
 await fence.read();
 const result=await fence.change((s,saved)=>{saved.status='Verified';saved.receipt=receipt;saved.verified_at=app.now().toISOString();s.actions[id].status='Verified';s.actions[id].delivery={...receipt,at:saved.verified_at};s.operations.email[id]={...s.operations.email[id],status:'Verified',receipt};if(internal){delete saved.hold;delete s.actions[id].hold;s.team_notifications.messages[action.payload.package.notification_id].delivery={status:'Sender verified; inbox delivery unverified',action_id:id,receipt};}bump(s,app);return {action_id:id,status:'Verified',receipt};},false,false,{type:'verified',details:{},provider,derived:{receipt,...(hasOperationsMail(app)&&action.payload.package.kind==='project'?{incoming_active:await budget.run(()=>pdfCoverageActive(app,app.config,app.now().toISOString()))}:{})}});
 // A late successful ACK cannot publish over a newer request/receipt.
 await fence.read();return result;
}
export async function dispatchExactMail(app,input,{actor,env=process.env,transport=null,getAccessToken,fetcher,signal}={}){
 actorCheck(actor);check(key(input.action_id),'Choose exact saved send action');check(!app.store?.inertBinding,'D2 notes-only authority rejects email execution');
 const budget=mailBudget(app,signal);
 try{
  const {config,state:s}=await budget.run(()=>mailEnvelope(app)),a=s.actions[input.action_id],internal=a?.payload?.internal_notification===true;if(hasOperationsMail({...app,config})){check(Object.keys(input).join(',')==='action_id','Use the exact action selector');assertSharedMailAction(s,input.action_id,config);}const c=capability(app,config,env,internal);
  check(a?.assigned_to===actor,'Only the signed approved assignee may dispatch this message');
  const logical=a.id+'-intent',prior=s.operations?.requests?.[logical];if(prior)return {action_id:a.id,status:prior.status,reason:'Intent already reserved; reconcile only, never dispatch again'};
  check(!s.operations?.email?.[a.id],'Existing email authority must be reconciled; no replacement intent');
  const p=currentExactMail(s,config,a,app.now()),shared=hasOperationsMail(app);if(shared){currentMailAuthority(s,config,a,app.store.dispatchBinding,{now:app.now()});check(!transport,'Shared exact mail uses its existing raw observed Google transport only');}
  const fence=mailFence(app,config,a,actor,env,budget);let at=app.now().toISOString(),sending=true,phase='materialize';const requestClaim=randomUUID();
  await fence.change(state=>{
   const reservationNow=app.now();if(internal)at=reservationNow.toISOString();
   const today=businessDate(reservationNow),requests=Object.values(state.operations?.requests??{}),legacy=Object.values(state.prospects).filter(r=>r.information_draft?.approved_at&&businessDate(r.information_draft.approved_at)===today).length;
   if(internal)notificationBudget(state,currentNotificationPolicy(state,config,reservationNow),reservationNow);
   check(legacy+requests.filter(q=>['intent','send'].includes(q.operation)&&q.prepared_at&&businessDate(q.prepared_at)===today).length<(internal?c.sender_daily_limit:c.daily_limit),'Daily combined sender reservation exhausted');
   const o=state.operations??={};o.requests??={};o.email??={};
   o.requests[logical]={logical,operation:'intent',transport:'google-exact-mail-v1',status:'Reserved',prepared_at:at,request_claim:requestClaim,dispatch_deadline:budget.deadline,package_sha256:p.sha256,binding_sha256:hash(c),rfc_message_id:mailMessageId(a.id),...(internal?{internal_notification:true,policy_id:c.policy_id}:{})};
   o.email[a.id]={prospect_id:a.prospect_id,status:'Reserved',package_sha256:p.sha256};state.actions[a.id].status='Pending';bump(state,app);
   if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Reserved; delivery held',action_id:a.id};
  },true,false,{type:'reserve',details:{request_claim:requestClaim}});
  const provider=transport??googleHostedTransport({getAccessToken,fetcher,account:c.account_email,grantId:c.grant_id,...(shared?{requiredProfile:operationsMailProfile,observations:[],rawResponseMax:()=>mailRawCeiling(fence.expected),now:app.now}:{})});
  try{
   await fence.read(true);const bytes=[];
   for(const part of p.attachments){bytes.push((await budget.run(()=>readProjectAsset(app,p.project_id,part.asset_id,part.version_id))).bytes);await fence.read(true);}
   at=fence.expected.prepared_at;const composed=composeExactMail(p,a.id,at,bytes);budget.check();
   await fence.change((state,q)=>{check(q.status==='Reserved'&&!q.raw_base64url,'MIME already materialized; never retry');q.mime_sha256=byteHash(composed.raw);q.raw_base64url=composed.raw.toString('base64url');bump(state,app);},true,false,{type:'materialize',details:{mime_sha256:byteHash(composed.raw),raw_base64url:composed.raw.toString('base64url')}});
   phase='dispatch';await fence.read(true);const options={guard:()=>fence.read(sending),signal:budget.signal,onPost:()=>{budget.check();sending=false;}};
   await budget.run(()=>provider.preflight(options));await fence.read(true);
   const fresh=internal?{notification_source_sha256:p.source_sha256}:await budget.run(()=>provider.freshSource(p,options));await fence.read(true);
   const dispatchClaim=randomUUID();await fence.change((state,q)=>{const dispatchNow=app.now();check(q.status==='Reserved'&&!q.dispatch_claim&&!q.read_claim,'Dispatch already claimed; never retry');q.status='Uncertain';q.dispatch_started_at=dispatchNow.toISOString();q.dispatch_claim=dispatchClaim;q.fresh_source=fresh;state.operations.email[a.id].status='Uncertain';if(internal)state.team_notifications.messages[p.notification_id].delivery={status:'Uncertain; dispatch claimed, no resend permission',action_id:a.id};bump(state,app);},true,false,{type:'dispatch',details:{dispatch_claim:dispatchClaim},provider,derived:{fresh_source:fresh}});
   phase='sent';await fence.read(true);
   const sent=await budget.run(()=>provider.send(composed,options));sending=false;await fence.read();
   await fence.change((state,q)=>{q.provider_message_id=sent.id;q.provider_thread_id=sent.thread_id;bump(state,app);},false,false,{type:'sent',details:{},provider,derived:{sent}});await fence.read();
   phase='verified';return await readExactMail(app,a,internal,provider,fence,budget);
  }catch(error){return await holdMail(app,a.id,internal,fence,budget,error,phase,provider);}
 }finally{budget.close();}
}
export async function reconcileExactMail(app,input,{actor,env=process.env,transport=null,getAccessToken,fetcher,signal}={}){
 check(!app.store?.inertBinding,'D2 notes-only authority rejects email execution');actorCheck(actor);check(key(input.action_id),'Choose exact saved send action');const budget=mailBudget(app,signal);
 try{
  const {config,state}=await budget.run(()=>mailEnvelope(app)),a=state.actions[input.action_id],internal=a?.payload?.internal_notification===true,c=capability(app,config,env,internal),q=state.operations?.requests?.[input.action_id+'-intent'];
  check(a?.payload?.exact_mail&&q?.transport==='google-exact-mail-v1'&&q.logical===input.action_id+'-intent'&&q.package_sha256===a.payload.package_sha256&&q.rfc_message_id===mailMessageId(a.id),'Existing exact intent required');const shared=hasOperationsMail(app);check((shared?state.events[a.payload.approval_event]?.actor:a.assigned_to)===actor,'Original signed approved assignee required');
  if(q.status==='Verified')return {action_id:a.id,status:q.status,receipt:q.receipt};
  check(q.binding_sha256===hash(c),'Reconcile under the same owner grant/workspace binding');
  if(shared){currentMailAuthority(state,config,a,app.store.dispatchBinding,{source:false,actor});check(!transport,'Shared exact mail uses its existing raw observed Google transport only');check(mailObservationCount(q)+6<=64,'Finite raw observation allowance exhausted before read IO');mailStorageAllowance({schema_version:1,config,state,dispatch_source:a.payload.source_evidence.dispatch_source},q,{read:true});}
  const fence=mailFence(app,config,a,actor,env,budget,q,state.operations?.email?.[a.id]??null),provider=transport??googleHostedTransport({getAccessToken,fetcher,account:c.account_email,grantId:c.grant_id,...(shared?{requiredProfile:operationsMailProfile,observations:[],rawResponseMax:()=>mailRawCeiling(fence.expected),now:app.now}:{})});
  try{return await readExactMail(app,a,internal,provider,fence,budget);}catch(error){return await holdMail(app,a.id,internal,fence,budget,error,'verified',provider);}
 }finally{budget.close();}
}
