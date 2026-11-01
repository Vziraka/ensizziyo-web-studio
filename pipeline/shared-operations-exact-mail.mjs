import {check,hash,initialConfig,StudioLifecycle} from './lifecycle.mjs';
import {incomingRoutes,validateIncomingImport} from './google-incoming-mail.mjs';
import {validateDispatchBinding,validateDispatchPolicy} from './shared-internal-dispatch.mjs';
import {packageInState,currentExactMail,applyMailApproval,applyMailStep,retainedAction,expectedFor} from './exact-mail.mjs';
import {composeExactMail,byteHash,mailMessageId,mailPreflight,mailFreshSource,mailSendBody,mailSendResponse,mailSentReadback,mailObservationJSON} from './google-hosted-transport.mjs';
import {blobProjectOriginalStore} from './shared-project-originals.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {validReplySource,replyDraftContent} from './reply-content.mjs';
import {validateRefinementPolicy} from './refinement-generation.mjs';
import {validateCalendarPolicy} from './shared-operations-calendar.mjs';
import {nodePDFResources} from './project-authoring-node.mjs';

export const operationsMailCapability='shared-operations-exact-mail-v1';
export const operationsMailProfile='operations-exact-mail-gmail-v1';
export const operationsMailScopes=Object.freeze(['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send']);
export const mailRecordEvents=Object.freeze(['reply_reviewed','reply_draft_saved','reply_draft_approved']);
export const mailTransitionSchema=Object.freeze({version:1,mail_events:mailRecordEvents,transitions:['approve','reserve','materialize','dispatch','sent','read','verified','hold'],grant_profile:operationsMailProfile,incoming_mode:'declared-existing-thread-only-new-thread-held',recovery:'retained-mime-exact-sent-read-only-no-resend'});
export const newThreadMailHold='New PDF conversation is not registered; sending and automatic incoming monitoring are held. Review and original retrieval remain available.';
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===(names?names.split(','):[]).sort().join(','),'Unknown or missing exact mail fields');
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const roles=['owner','friend'],readStages=['sent','read','verified','hold'];
export const hasOperationsMail=app=>app.config?.shared_capability===operationsMailCapability&&app.store?.dispatchBinding?.scope.capability===operationsMailCapability;
export const mailObservationCount=q=>(q?.observations??[]).reduce((n,b)=>n+b.requests.length,0);
export const mailOwnedState=s=>hash({request:s.q??null,action:retainedAction(s.a),email:s.email??null});
export function assertSharedMailAction(state,id){
 const a=state.actions[id];
 const pdf=a?.payload?.package?.kind==='project'||Object.values(state.prospects).some(r=>(r.project_email_drafts??[]).some(d=>id==='exact-'+hash({run:state.run_id,project:r.id,kind:'project',draft:d.id}).slice(0,32)));
 check(!pdf,newThreadMailHold);check(a?.payload?.exact_mail===true&&a.payload.internal_notification!==true,'Choose the existing separate exact prospect-mail action');
}
export function validateMailPolicy(p,c){
 exact(p,'version,status,run_id,account_email,from,grant_id,grant_profile,approval_mode,kinds,operations,incoming_mode,daily_limit,execution_ms,request_ms,observation_limit');
 check(p.version===operationsMailCapability&&p.status==='UNAPPROVED'&&key(p.run_id)&&p.account_email==='ensizziyo@evzdigital.studio'&&p.from==='hello@evzdigital.studio'&&key(p.grant_id)&&p.grant_profile===operationsMailProfile&&p.approval_mode==='exact-signed-message-only'&&hash(p.kinds)===hash(['reply','project'])&&hash(p.operations)===hash(['package','approve','dispatch-once','exact-sent-reconcile'])&&p.incoming_mode===mailTransitionSchema.incoming_mode&&Number.isInteger(p.daily_limit)&&p.daily_limit>=1&&p.daily_limit<=20&&p.execution_ms===40000&&p.request_ms===25000&&p.observation_limit===64,'Exact separate unapproved mail policy required');
 if(c)check(p.run_id===c.run_id&&p.account_email===c.sender.account_email&&p.from===c.sender.email&&[c.internal_dispatch?.grant_id,c.google_drive_originals?.grant_id,c.google_calendar?.grant_id,c.google_team_notifications?.grant_id].every(id=>id!==p.grant_id),'Exact mail workspace/sender and independent prebound grant required');return p;
}
// Historical settings are inert. Accept the complete recognized policy config or hold; never carve out its hash.
export function validateMailConfig(c){
 const allowed=[...Object.keys(initialConfig),'shared_capability','calls_enabled','runtime','operations','release','call_release','internal_dispatch','refinement_generation','refinement_generation_runtimes','google_drive_originals','google_calendar','google_incoming_mail','google_exact_mail'];
 check(c&&Object.keys(c).every(k=>allowed.includes(k)),'Unknown original mail configuration; whole source held');
 const walk=v=>{if(!v||typeof v!=='object')return;for(const [k,value]of Object.entries(v)){check(!/^(?:__proto__|constructor|prototype|.*(?:token|secret|password|credential|private_key|api_key|authorization_header).*)$/i.test(k)||['maximum_input_tokens','maximum_output_tokens'].includes(k),'Secret-bearing or unsupported original mail configuration');walk(value);}};walk(c);
 exact(c.sender,'operator_names,email,account_email');exact(c.sender.operator_names,'owner,friend');exact(c.follow_up,'enabled,sender_verified,demo_verified,booking_url');exact(c.runtime,'enabled');exact(c.release,'approved');exact(c.call_release,'approved');
 exact(c.operations,'enabled,allowlist,bookings,emails,threads');check(!Object.keys(c.operations.bookings).length&&!Object.keys(c.operations.emails).length,'Executable legacy connection settings cannot become original source evidence');
 exact(c.transcript_ai,Object.keys(initialConfig.transcript_ai).join(','));exact(c.readiness,Object.keys(initialConfig.readiness).join(','));
 validateRefinementPolicy(c.refinement_generation);validateCalendarPolicy(c.google_calendar);
 check(c.refinement_generation_runtimes&&Object.keys(c.refinement_generation_runtimes).every(id=>c.refinement_generation.jobs.some(j=>j.job_id===id)),'Unknown original refinement runtime');
 for(const [id,runtime]of Object.entries(c.refinement_generation_runtimes)){const job=c.refinement_generation.jobs.find(j=>j.job_id===id);check(hash(runtime)===job.runtime_sha256,'Original registered runtime changed');nodePDFResources(runtime,job.project_id);}
 exact(c.google_drive_originals,'account,grant_id,sources');check(c.google_drive_originals.account==='ensizziyo@evzdigital.studio'&&key(c.google_drive_originals.grant_id)&&Array.isArray(c.google_drive_originals.sources)&&c.google_drive_originals.sources.length>0&&c.google_drive_originals.sources.length<=64,'Original independent Drive policy missing');
 for(const source of c.google_drive_originals.sources)exact(source,'project_id,asset_id,version_id,reference,name,mime_type,modified_time,drive_version,bytes,sha256'+(source.etag===undefined?'':',etag'));
 exact(c.google_incoming_mail,'enabled,capability,run_id,grant_id,account_email');
 for(const route of Object.values(c.operations.threads))check(Object.keys(route).every(k=>['thread_id','original_id','from','to','subject','rfc_message_id','sent_after','sent_before'].includes(k)),'Unknown original declared thread configuration');
 validateMailPolicy(c.google_exact_mail,c);validateDispatchPolicy(c.internal_dispatch);check(c.shared_capability===operationsMailCapability&&c.internal_dispatch.capability===operationsMailCapability&&c.mode==='production','Exact original shared mail capability required');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(c[flag]===false,'General execution must remain disabled');
 check(c.runtime.enabled===false&&c.operations.enabled===false&&c.transcript_ai.enabled===false&&c.release.approved===false&&c.call_release.approved===false,'General release must remain revoked');return c;
}
export function validateMailSourceEvidence(e){
 exact(e,'schema_version,config,dispatch_source,binding');exact(e.binding,'scope,manifest_sha256');validateDispatchBinding(e.binding.scope);const c=validateMailConfig(e.config),m=e.dispatch_source,p=c.internal_dispatch;
 exact(m,'schema_version,kind,binding,source_state_sha256,source_config_sha256,config_sha256,dependencies,reconciliation,unsupported,allowed_events,human_events,authoring,generation,originals,calendar,mail,mail_events,original_source_state_sha256');
 check(e.schema_version===1&&m.schema_version===1&&m.kind==='shared-operations-exact-mail-source-v1'&&e.binding.scope.capability===operationsMailCapability&&e.binding.scope.run_id===c.run_id&&hash(c)===m.config_sha256&&hash(m)===e.binding.manifest_sha256&&hash(m.binding)===hash(e.binding.scope)&&hash(p)===e.binding.scope.policy_sha256&&hash(p.binding)===hash(Object.fromEntries(['workspace_id','run_id','site_id','deploy_id','origin','namespace'].map(k=>[k,e.binding.scope[k]])))&&hash(m.human_events)===hash(p.human_events)&&hash(m.authoring)===hash(p.authoring)&&hash(m.allowed_events)===hash([...p.human_events.manual,...p.human_events.project,...mailRecordEvents])&&hash(p.mail)===hash(m.mail)&&hash(p.mail.schema)===hash(mailTransitionSchema)&&hash(p.mail_events)===hash(mailRecordEvents)&&hash(m.mail_events)===hash(mailRecordEvents)&&p.mail.source_policy_sha256===hash(c.google_exact_mail)&&sha(m.source_state_sha256)&&sha(m.source_config_sha256)&&sha(m.original_source_state_sha256),'Original complete source/config/manifest/binding evidence differs');
 for(const [field,configField,hashField]of [['generation','refinement_generation','policy_sha256'],['originals','google_drive_originals','source_policy_sha256'],['calendar','google_calendar','source_policy_sha256']])check(hash(m[field])===hash(p[field])&&p[field][hashField]===hash(c[configField]),'Original independent source policy changed');return e;
}
export function mailSourceEvidence(data,binding){return validateMailSourceEvidence({schema_version:1,config:structuredClone(data.config),dispatch_source:structuredClone(data.dispatch_source),binding:structuredClone(binding)});}
export function sharedMailBoundary(app,c,env,{runtime=true}={}){
 check(hasOperationsMail({...app,config:c})&&!app.store.projectBinding&&app.store.key==='workspace','Exact actual shared mail dispatch authority required');const binding=app.store.dispatchBinding,b=binding.scope;
 validateMailConfig(c);check(env?.CONTEXT==='production'&&env.EVZ_OPERATIONS_DESK_ENABLED===operationsMailCapability&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&hash(JSON.parse(env.EVZ_INTERNAL_DISPATCH_BINDING??'null'))===hash(binding),'Exact mail deployment binding changed');
 check(!runtime||env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL===operationsMailCapability,'Hosted exact email is disabled');return c.google_exact_mail;
}
export function declaredMailRoute(state,c,p){
 check(p.kind==='reply'&&key(p.thread_id),newThreadMailHold);validateIncomingImport(state,c);
 check(!state.operations?.holds?.gmail_incoming&&!state.operations?.gmail_incoming?.hold&&!state.operations?.gmail_incoming?.resync_hold,'Incoming hold or expired-history gap prevents a new send');
 const route=incomingRoutes(state,c).find(r=>r.thread_id===p.thread_id);check(route&&route.project_id===p.project_id&&route.from===p.from&&route.to===p.to&&route.contact_sha256===p.contact_sha256&&hash(incomingRoutes(state,c))===hash(c.internal_dispatch.routes),'Current reply route/contact is not declared in the immutable incoming policy');return route;
}
export function mailStatus(state,c,runtime=false){
 let hold=null;try{validateIncomingImport(state,c);}catch{hold='Current declared routes or retained incoming scope differs; sending is held without changing history';}
 if(!hold&&(state.operations?.holds?.gmail_incoming||state.operations?.gmail_incoming?.hold||state.operations?.gmail_incoming?.resync_hold))hold='Incoming hold or expired-history gap prevents new sending';
 return {status:hold?'Held':runtime?'Declared-thread replies only':'Runtime disabled',execution_hold:hold,pdf_hold:newThreadMailHold};
}
export function currentMailAuthority(state,c,a,binding,{source=true,actor=a?.assigned_to}={}){
 check(a?.payload?.exact_mail===true&&a.payload.internal_notification!==true&&roles.includes(a.assigned_to),'Original separate signed prospect mail action required');
 const e=validateMailSourceEvidence(a.payload.source_evidence),approval=state.events[a.payload.approval_event];
 check(hash(e.binding)===hash(binding)&&hash(e.config)===hash(c)&&approval?.data?.source_evidence_sha256===hash(e)&&approval.type==='exact_mail_approved'&&approval.id===a.payload.approval_event&&approval.actor===actor&&(!source||a.assigned_to===actor)&&approval.prospect_id===a.prospect_id&&approval.data.action_id===a.id&&approval.data.package_sha256===a.payload.package_sha256,'Original exact mail source/grant/approval differs; old intents remain held');
 if(source){const p=currentExactMail(state,c,a);declaredMailRoute(state,c,p);return p;}return a.payload.package;
}
export function applyMailRecord(state,c,record,now){
 exact(record,'event,actor,revision,at');const {event,actor,revision}=record;exact(event,'id,prospect_id,type,at,data');
 check(c.shared_capability===operationsMailCapability&&mailRecordEvents.includes(event.type)&&roles.includes(actor)&&key(event.id)&&key(event.prospect_id)&&utc(event.at)&&Date.parse(event.at)<=+now+60000&&record.at===now.toISOString()&&Number.isSafeInteger(revision),'Exact signed current reply event required');
 const fields={reply_reviewed:['source_id','reply_sha256','outcome','focus','note'],reply_draft_saved:['source_id','reply_sha256','source_sha256','body'],reply_draft_approved:['sha256','approved','facts_checked']}[event.type];
 check(event.data&&typeof event.data==='object'&&!Array.isArray(event.data)&&Object.keys(event.data).every(k=>fields.includes(k)),'Unsupported reply event data');
 const r=state.prospects[event.prospect_id];check(r,'Choose the existing conversation');if(!state.events[event.id])check(!r.follow_up_owner||r.follow_up_owner===actor,'Claim or hand off this conversation first');
 const reducer=new StudioLifecycle(null,()=>new Date(now));reducer.config=c;return reducer.reduceEvent(state,event,{actor,expectedRevision:revision});
}
export function mailRawCeiling(q){check(typeof q?.raw_base64url==='string','Exact retained MIME required before provider work');const bytes=Buffer.from(q.raw_base64url,'base64url').length;return Math.min(38000000,4*Math.ceil((bytes+16000)/3)+120000);}
export function mailStorageAllowance(data,q,{read=false,at=data.state.updated_at}={}){
 const raw=mailRawCeiling(q),allowance=2*((read?5*120000:2000000+8*120000)+raw)+64000;
 check(Buffer.byteLength(JSON.stringify(data))+allowance<=20000000,'Projected exact MIME/raw observation envelope exceeds 20 MB; no token or send');
 const body=JSON.stringify(data.state),files=(data.dispatch_source?.dependencies??[]).map(({path,bytes,sha256})=>({path,bytes,sha256})),shell={schema_version:2,created_at:at,sha256:hash(body),body,files,files_sha256:hash(files)};
 check(Buffer.byteLength(JSON.stringify(shell))+allowance<=25000000,'Projected complete G1 exceeds 25 MB; no token or send');return raw;
}
function validateGrant(g,c,at,live=true){
 exact(g,'profile,account,grant_id,scopes,expires_at');check(g.profile===operationsMailProfile&&g.account===c.google_exact_mail.account_email&&g.grant_id===c.google_exact_mail.grant_id&&Array.isArray(g.scopes)&&g.scopes.length===4&&hash([...g.scopes].sort())===hash([...operationsMailScopes].sort())&&Number.isSafeInteger(g.expires_at)&&g.expires_at>0&&(!live||g.expires_at>Date.parse(at)+10000),'Exact independent mail grant required');return g;
}
function observation(o,c,p,q,at,deadline,held=false){
 exact(o,'path,method,body_sha256,at,grant,'+(Object.hasOwn(o??{},'error')?'error':'value'));check(utc(o.at)&&Date.parse(o.at)<=Date.parse(at)&&Date.parse(o.at)>=deadline-40000&&sha(o.body_sha256),'Exact dated bounded raw mail observation required');
 const raw=/^messages\/([A-Za-z0-9_-]{1,100})\?format=raw$/.test(o.path),thread=o.path==='threads/'+encodeURIComponent(p.reply_source?.content?.thread_id)+'?format=full';
 const query=o.path.startsWith('messages?')?new URLSearchParams(o.path.slice(9)):null;
 check(['profile','settings/sendAs','messages/send'].includes(o.path)||thread||raw||query&&query.get('maxResults')==='10'&&query.get('q')==='in:sent rfc822msgid:'+q.rfc_message_id&&[...query.keys()].every(k=>['q','maxResults','pageToken'].includes(k))&&[...query.keys()].length===new Set(query.keys()).size,'Unapproved exact mail observation path');
 check(o.method===(o.path==='messages/send'?'POST':'GET')&&o.body_sha256===hash(o.method==='GET'?null:mailSendBody(expectedFor({payload:{package:p}},q))),'Exact observed method/body differs from retained MIME');
 if(o.error){exact(o.error,'code,status,bytes,body_sha256');check(held&&['NETWORK','HTTP','INVALID_JSON','OVERSIZE','DEADLINE'].includes(o.error.code)&&(o.error.status===null||Number.isInteger(o.error.status)&&o.error.status>=100&&o.error.status<=599)&&Number.isSafeInteger(o.error.bytes)&&o.error.bytes>=0&&(o.error.body_sha256===null||sha(o.error.body_sha256)),'Closed unavailable mail response required');if(o.grant)validateGrant(o.grant,c,o.at,false);}
 else{validateGrant(o.grant,c,o.at,!held);mailObservationJSON(o.value);check(o.value&&typeof o.value==='object'&&!Array.isArray(o.value)&&Buffer.byteLength(JSON.stringify(o.value))<=(thread?2000000:raw?mailRawCeiling(q):120000),'Bounded complete parsed Gmail JSON required');if(raw){const {raw:wire,...meta}=o.value;check(typeof wire==='string'&&Buffer.byteLength(JSON.stringify(meta))<=120000,'Bounded full raw readback metadata required');}}
}
async function replayObservations(type,requests,grant,c,p,q,at,deadline,{held=false}={}){
 check(Array.isArray(requests)&&requests.length<=10,'Bounded raw mail request observations required');for(const o of requests)observation(o,c,p,q,at,deadline,held);
 let index=0;const consume=async(path,options={})=>{const o=requests[index++];check(o&&o.path===path&&o.method===(options.method??'GET')&&o.body_sha256===hash(options.body??null),'Exact provider request/order/arguments differ');if(o.error)throw Error('Retained unavailable provider observation');check(hash(o.grant)===hash(grant),'Observed independent grant changed');return structuredClone(o.value);};
 let derived={};try{
  if(type==='dispatch'){await mailPreflight(consume,c.google_exact_mail.account_email);derived.fresh_source=await mailFreshSource(consume,p);}
  else if(type==='sent'){const expected=expectedFor({payload:{package:p}},q);derived.sent=mailSendResponse(await consume('messages/send',{method:'POST',body:mailSendBody(expected)}),expected);}
  else if(type==='verified'){await mailPreflight(consume,c.google_exact_mail.account_email);derived.receipt=await mailSentReadback(consume,expectedFor({payload:{package:p}},q),q.provider_message_id??null,mailRawCeiling(q));}
  else check(!requests.length&&grant===null,'No provider observation belongs to this mail step');
 }catch(error){if(!held)throw error;check(index>=requests.length,'Unconsumed held raw mail observations');}
 check(index===requests.length||held&&index===requests.length+1,'Unconsumed exact raw mail observations');return derived;
}
export function mailWitness(app,data,actor,budget,type,details,provider,historyStart=0){
 const input=type==='approve'?details.input:null,a=data.state.actions[input?('exact-'+hash({run:data.state.run_id,project:input.project_id,kind:input.kind,draft:packageInState(data.state,data.config,input,actor).draft_id}).slice(0,32)):details.action_id],id=a?.id??('exact-'+hash({run:data.state.run_id,project:input.project_id,kind:input.kind,draft:packageInState(data.state,data.config,input,actor).draft_id}).slice(0,32)),q=data.state.operations?.requests?.[id+'-intent']??null,email=data.state.operations?.email?.[id]??null,selector=input?{project_id:input.project_id,kind:input.kind,...(input.draft_id?{draft_id:input.draft_id}:{})}:a.payload.selector;
 const source=input?mailSourceEvidence(data,app.store.dispatchBinding):a.payload.source_evidence,{action_id,...typed}=details,observations=provider?provider.observations.slice(Math.max(0,mailObservationCount(q)-historyStart)):[];
 return {type,actor,action_id:id,selector:structuredClone(selector),binding_sha256:hash(app.store.dispatchBinding),config_sha256:hash(data.config),source_policy_sha256:hash(data.config.google_exact_mail),source_evidence_sha256:hash(source),package_sha256:input?input.package_sha256:a.payload.package_sha256,approval_event_id:input?input.event_id:a.payload.approval_event,prior_request_sha256:hash(q),prior_action_sha256:hash(readStages.includes(type)?retainedAction(a):a??null),prior_email_sha256:hash(email),request_claim:q?.request_claim??null,dispatch_claim:q?.dispatch_claim??null,read_claim:q?.read_claim??null,at:app.now().toISOString(),deadline:budget.deadline,details:structuredClone(typed),observations:structuredClone(observations),grant:provider?.grant()??null};
}
export async function replayMailTransition(before,expected,w,raw,{binding,env,now,mailGrant}={}){
 exact(w,'type,actor,action_id,selector,binding_sha256,config_sha256,source_policy_sha256,source_evidence_sha256,package_sha256,approval_event_id,prior_request_sha256,prior_action_sha256,prior_email_sha256,request_claim,dispatch_claim,read_claim,at,deadline,details,observations,grant');
 const c=before.config,s=before.state,app={config:c,store:{dispatchBinding:binding,projectBinding:null,key:'workspace'},now:()=>new Date(w.at)},a=s.actions[w.action_id]??null,q=s.operations?.requests?.[w.action_id+'-intent']??null,email=s.operations?.email?.[w.action_id]??null;
 check(mailTransitionSchema.transitions.includes(w.type)&&roles.includes(w.actor)&&key(w.action_id)&&key(w.approval_event_id)&&utc(w.at)&&Date.parse(w.at)<=+now()&&Number.isSafeInteger(w.deadline)&&w.deadline>Date.parse(w.at)&&w.deadline<=Date.parse(w.at)+40000&&w.binding_sha256===hash(binding)&&w.config_sha256===hash(c)&&w.source_policy_sha256===hash(c.google_exact_mail)&&w.prior_request_sha256===hash(q)&&w.prior_action_sha256===hash(readStages.includes(w.type)?retainedAction(a):a)&&w.prior_email_sha256===hash(email)&&w.request_claim===(q?.request_claim??null)&&w.dispatch_claim===(q?.dispatch_claim??null)&&w.read_claim===(q?.read_claim??null),'Exact mail source/claim/witness ownership changed');
 sharedMailBoundary(app,c,env,{runtime:!['approve','hold'].includes(w.type)});await validateMailEvidence(s,{strict:true});
 if(w.type==='approve'){
  exact(w.details,'input');check(!w.observations.length&&w.grant===null&&!q,'Approval cannot replace a retained intent');const p=packageInState(s,c,w.details.input,w.actor);declaredMailRoute(s,c,p);const evidence=mailSourceEvidence(before,binding);
  check(hash(w.selector)===hash({project_id:w.details.input.project_id,kind:w.details.input.kind,...(w.details.input.draft_id?{draft_id:w.details.input.draft_id}:{})})&&w.source_evidence_sha256===hash(evidence)&&w.package_sha256===p.sha256&&w.approval_event_id===w.details.input.event_id,'Exact signed approval source differs');const result=applyMailApproval(expected,c,w.details.input,w.actor,w.at,evidence);check(result.action_id===w.action_id,'Deterministic original exact action changed');
 }else{
  check(a&&hash(w.selector)===hash(a.payload.selector)&&w.package_sha256===a.payload.package_sha256&&w.approval_event_id===a.payload.approval_event&&w.source_evidence_sha256===hash(a.payload.source_evidence),'Exact original signed assignee/package required');
  const source=['reserve','materialize','dispatch'].includes(w.type),p=currentMailAuthority(s,c,a,binding,{source,actor:w.actor});
  const fields={reserve:'request_claim',materialize:'mime_sha256,raw_base64url',dispatch:'dispatch_claim',sent:'',read:'read_claim',verified:'',hold:'phase,reason_code,owned_state_sha256'};exact(w.details,fields[w.type]);
  if(w.type==='reserve')check(uuid(w.details.request_claim)&&!q&&!email,'Only one original reservation is allowed');else check(q&&q.source_config_sha256===hash(c)&&q.binding_sha256===hash(c.google_exact_mail)&&q.request_claim&&q.status!=='Verified'&&!q.receipt,'Exact unsettled current original intent required');
  if(['materialize','dispatch','sent'].includes(w.type))check(w.deadline===q.dispatch_deadline,'Original dispatch deadline cannot be extended');if(w.type==='verified')check(w.deadline===q.read_deadline,'Exact current read deadline required');
  if(['dispatch','read'].includes(w.type))check(uuid(w.details[w.type==='dispatch'?'dispatch_claim':'read_claim'])&&(w.type!=='read'||w.details.read_claim!==q.read_claim),'Fresh exact mail claim required');
  if(w.type==='materialize'){
   const bytes=[];for(const part of p.attachments)bytes.push((await readProjectAsset({config:c,snapshot:async()=>structuredClone(s),originalStore:blobProjectOriginalStore(raw),store:{store:raw}},p.project_id,part.asset_id,part.version_id)).bytes);
   const composed=composeExactMail(p,a.id,q.prepared_at,bytes);check(w.details.mime_sha256===byteHash(composed.raw)&&w.details.raw_base64url===composed.raw.toString('base64url'),'Exact original MIME/body/attachments differ');
  }
  if(['dispatch','sent','verified'].includes(w.type)){validateGrant(w.grant,c,w.at);check(typeof mailGrant==='function','Independent exact mail grant authority required');check(hash(validateGrant(await mailGrant(w.grant),c,w.at))===hash(w.grant),'Independent exact mail grant changed during replay');}
  if(w.type==='dispatch')check(mailObservationCount(q)+10<=64,'Finite raw observation allowance exhausted before token work');if(w.type==='read')check(mailObservationCount(q)+6<=64,'Finite raw observation allowance exhausted before read IO');
  if(w.type==='hold')check(['materialize','dispatch','sent','verified','read'].includes(w.details.phase)&&['CHECK_FAILED','DEADLINE','PROVIDER_UNAVAILABLE'].includes(w.details.reason_code)&&w.details.owned_state_sha256===mailOwnedState({q,a,email}),'Catch no longer owns the original request/action/email');
  const derived=await replayObservations(w.type==='hold'?w.details.phase:w.type,w.observations,w.grant,c,p,q,w.at,w.deadline,{held:w.type==='hold'});
  applyMailStep(expected,c,w,derived);
  if(['materialize','dispatch','read'].includes(w.type))mailStorageAllowance({...before,state:expected},expected.operations.requests[a.id+'-intent'],{read:w.type==='read',at:w.at});
 }
 check(+now()<w.deadline,'Exact mail deadline expired during independent replay');if(w.grant&&w.type!=='hold')check(hash(validateGrant(await mailGrant(w.grant),c,w.at))===hash(w.grant),'Independent exact mail grant changed before publication');sharedMailBoundary(app,c,env,{runtime:!['approve','hold'].includes(w.type)});check(+now()<w.deadline,'Exact mail deadline expired during independent grant validation');
}
export async function validateMailEvidence(state,{strict=false}={}){
 for(const [id,a]of Object.entries(state.actions??{})){
  if(a.payload?.exact_mail!==true||a.payload.internal_notification===true)continue;
  if(!a.payload.source_evidence){check(!strict,'Legacy exact mail lacks original signed full source evidence; whole installation held');continue;}
  const evidence=validateMailSourceEvidence(a.payload.source_evidence),c=evidence.config,p=a.payload.package,e=state.events[a.payload.approval_event],q=state.operations?.requests?.[id+'-intent'];
  exact(a,'id,prospect_id,type,status,assigned_to,created_at,payload'+(Object.hasOwn(a,'hold')?',hold':'')+(Object.hasOwn(a,'delivery')?',delivery':''));
  exact(p,'schema_version,project_id,kind,draft_id,from,to,subject,body,attachments,thread_id,in_reply_to,references,reply_source,owner,contact_sha256,quote_sha256,signature_sha256,operator_names_sha256,source,sha256');exact(p.source,'draft_sha256,approval_event,reply_sha256');exact(a.payload.selector,'project_id,kind');
  exact(a.payload,'exact_mail,package_sha256,selector,approval_event,package,source_evidence');exact(e,'id,type,prospect_id,actor,at,data');exact(e.data,'package_sha256,action_id,source_evidence_sha256');
  const {sha256,...body}=p;check(key(id)&&a.id===id&&a.type==='email'&&roles.includes(a.assigned_to)&&roles.includes(e.actor)&&e.type==='exact_mail_approved'&&e.prospect_id===a.prospect_id&&e.data.action_id===id&&e.data.package_sha256===sha256&&e.data.source_evidence_sha256===hash(evidence)&&utc(e.at)&&a.created_at===e.at&&sha256===hash(body)&&sha256===a.payload.package_sha256&&p.kind==='reply'&&p.project_id===a.prospect_id&&p.from===c.sender.email&&p.attachments.length===0&&validReplySource(p.reply_source)&&p.thread_id===p.reply_source.content.thread_id&&p.signature_sha256===hash(p.body)&&p.operator_names_sha256===hash(c.sender.operator_names)&&id==='exact-'+hash({run:state.run_id,project:p.project_id,kind:p.kind,draft:p.draft_id}).slice(0,32),'Incomplete original exact approval/package/source');
  const content=state.events[p.source.approval_event];check(content?.type==='reply_draft_approved'&&content.prospect_id===a.prospect_id&&content.actor===e.actor&&content.data?.sha256===p.source.draft_sha256&&content.data.approved===true&&content.data.facts_checked===true,'Original separate content/facts approval is missing');
  const record=state.prospects[a.prospect_id],draft=[record?.reply_draft,...(record?.reply_draft_history??[]),...(record?.reply_drafts??[])].find(d=>d?.sha256===p.source.draft_sha256&&d.approval_event===p.source.approval_event);
  check(draft&&hash(draft.content)===draft.sha256&&hash(draft.content)===hash(replyDraftContent({reply:p.reply_source},draft.body,e.actor,c))&&p.body===draft.content.body+'\n\n'+draft.content.signature&&p.to===draft.content.to&&p.subject===draft.content.subject&&p.in_reply_to===draft.content.in_reply_to&&p.source.reply_sha256===hash(p.reply_source)&&p.owner===draft.owner&&a.payload.selector.project_id===p.project_id&&a.payload.selector.kind==='reply','Complete original content, signature and facts draft proof differs');
  let assigned=e.actor;const order=Object.keys(state.events),position=order.indexOf(e.id);
  for(const h of record.follow_up_handoffs??[])if(order.indexOf(h.event_id)>position){exact(h,'from,to,at,event_id');const saved=state.events[h.event_id];exact(saved,'id,prospect_id,type,at,data,fingerprint,actor');exact(saved.data,'to');const {fingerprint,actor,...event}=saved;check(h.from===assigned&&roles.includes(h.to)&&h.to!==assigned&&saved.type==='follow_up_handed_off'&&saved.prospect_id===a.prospect_id&&actor===h.from&&saved.data.to===h.to&&saved.at===h.at&&fingerprint===hash({event,actor}),'Retain the exact signed handoff chain after original approval');assigned=h.to;}
  check(a.assigned_to===assigned,'Current action assignee has no preserved signed handoff from its original approver');
  const route=c.internal_dispatch.routes.find(r=>r.thread_id===p.thread_id),references=[...(p.reply_source.content.references??'').split(/\s+/).filter(Boolean),p.reply_source.content.message_header_id];
  check(p.schema_version===1&&route?.project_id===p.project_id&&route.contact_sha256===p.contact_sha256&&route.to===p.to&&route.from===p.from&&hash(p.references)===hash(references),'Original approved declared reply route or headers differ');
  if(!q){check(!state.operations?.email?.[id],'Email reservation lost its original request');continue;}
  exact(state.operations.email[id],'prospect_id,status,package_sha256'+(state.operations.email[id]?.receipt?',receipt':''));
  const allowed=['logical','operation','transport','status','prepared_at','request_claim','dispatch_deadline','package_sha256','binding_sha256','source_config_sha256','observations','rfc_message_id','mime_sha256','raw_base64url','dispatch_started_at','dispatch_claim','fresh_source','provider_message_id','provider_thread_id','read_claim','read_deadline','receipt','verified_at','hold'];
  check(Object.keys(q).every(k=>allowed.includes(k))&&q.logical===id+'-intent'&&q.operation==='intent'&&q.transport==='google-exact-mail-v1'&&['Reserved','Held','Uncertain','Verified'].includes(q.status)&&utc(q.prepared_at)&&Date.parse(q.prepared_at)>=Date.parse(e.at)&&uuid(q.request_claim)&&Number.isSafeInteger(q.dispatch_deadline)&&q.dispatch_deadline>Date.parse(q.prepared_at)&&q.dispatch_deadline<=Date.parse(q.prepared_at)+40000&&q.package_sha256===p.sha256&&q.binding_sha256===hash(c.google_exact_mail)&&q.source_config_sha256===hash(c)&&q.rfc_message_id===mailMessageId(id)&&Array.isArray(q.observations)&&mailObservationCount(q)<=64&&state.operations.email[id]?.package_sha256===p.sha256,'Incomplete original mail intent/claim/history');
  if(q.raw_base64url){const composed=composeExactMail(p,id,q.prepared_at,[]);check(q.raw_base64url===composed.raw.toString('base64url')&&q.mime_sha256===byteHash(composed.raw),'Original complete MIME differs');}
  else check(!q.mime_sha256&&!q.dispatch_claim&&!q.read_claim&&!q.receipt,'Original MIME proof is missing');
  check((q.dispatch_claim===undefined)===(q.dispatch_started_at===undefined)&&(!q.dispatch_claim||uuid(q.dispatch_claim)&&utc(q.dispatch_started_at)&&Date.parse(q.dispatch_started_at)>=Date.parse(q.prepared_at)&&Date.parse(q.dispatch_started_at)<q.dispatch_deadline)&&(!q.read_claim||uuid(q.read_claim)&&Number.isSafeInteger(q.read_deadline)),'Original exact claims/deadlines changed');
  let verified=false;for(const b of q.observations){exact(b,'type,at,deadline,claim,grant,requests');exact(b.claim,'request_claim,dispatch_claim,read_claim');check(mailTransitionSchema.transitions.includes(b.type)&&b.type!=='approve'&&utc(b.at)&&Number.isSafeInteger(b.deadline)&&b.deadline>Date.parse(b.at)&&b.deadline<=Date.parse(b.at)+40000&&b.claim.request_claim===q.request_claim&&(b.claim.dispatch_claim===null||b.claim.dispatch_claim===q.dispatch_claim&&uuid(b.claim.dispatch_claim))&&(b.claim.read_claim===null||uuid(b.claim.read_claim)),'Original mail raw claim chronology differs');
   if(['dispatch','sent','verified'].includes(b.type)){const result=await replayObservations(b.type,b.requests,b.grant,c,p,q,b.at,b.deadline);if(b.type==='dispatch')check(hash(result.fresh_source)===hash(q.fresh_source),'Retain original raw fresh source');if(b.type==='sent')check(result.sent.id===q.provider_message_id&&result.sent.thread_id===q.provider_thread_id,'Retain original raw send identity');if(b.type==='verified'){check(hash(result.receipt)===hash(q.receipt)&&b.claim.read_claim===q.read_claim,'Retain exact complete raw Sent receipt');verified=true;}}
   else if(b.type==='hold')await replayObservations(b.claim.read_claim?'verified':b.claim.dispatch_claim?'sent':'dispatch',b.requests,b.grant,c,p,q,b.at,b.deadline,{held:true});
   else check(b.requests.length===0&&b.grant===null,'Unexpected raw observations in original stage');
  }
  check(!q.receipt||verified,'Original receipt lacks complete raw proof');if(q.status==='Verified')check(q.receipt&&verified&&a.status==='Verified'&&hash(a.delivery)===hash({...q.receipt,at:q.verified_at})&&hash(state.operations.email[id].receipt)===hash(q.receipt),'Original Verified effect/receipt differs');
 }
 if(strict){for(const [id,q]of Object.entries(state.operations?.requests??{})){
  check(['apollo_profile','mailboxes','contact','draft','send','delivery','sequence','stop','task_create','task_search','task_read','task_skip','gmail_profile','gmail_search','thread','calendar_profile','busy','booking_create','booking_search','booking_read','contact_create','personalize','fields','lists','intent'].includes(q.operation)&&[undefined,'google-exact-mail-v1','google-calendar-v1'].includes(q.transport)&&q.logical===id&&utc(q.prepared_at)&&['Pending','Reserved','Held','Uncertain','Verified','Cancelled','Done','Failed','Deferred'].includes(q.status),'Unsupported or incomplete historical liability; whole installation held');
  if(q.transport==='google-exact-mail-v1'&&q.internal_notification!==true)check(state.actions[id.slice(0,-7)]?.payload?.source_evidence&&id===q.logical,'Orphaned exact intent; whole installation held');
 }
 for(const [id,email]of Object.entries(state.operations?.email??{}))check(state.actions[id]?.type==='email'&&state.prospects[state.actions[id].prospect_id]||state.actions[id]?.payload?.internal_notification===true,'Unsupported orphan email liability; whole installation held');
 for(const r of Object.values(state.prospects))if(r.information_draft?.approved_at)check(utc(r.information_draft.approved_at)&&['Approved','Sending','Uncertain','Sent','Verified'].includes(r.information_draft.status),'Unsupported information-mail liability; whole installation held');
 }
}
