import {operationsMailCapability,operationsMailProfile,mailTransitionSchema,mailRecordEvents,validateMailPolicy,validateMailConfig,validateMailEvidence,applyMailRecord,replayMailTransition} from './shared-operations-exact-mail.mjs';
export {operationsMailCapability} from './shared-operations-exact-mail.mjs';
import {operationsCalendarCapability,calendarTransitionSchema,calendarSlotPolicy,validateCalendarPolicy,validateCalendarImport,replayCalendarTransition} from './shared-operations-calendar.mjs';
export {operationsCalendarCapability} from './shared-operations-calendar.mjs';
import {check,hash,businessDate} from './lifecycle.mjs';
import {prepareProjectWorkspace,applySharedProjectEvent,replayProjectAuthoring,validateSharedProjectDependencies} from './shared-project-continuation.mjs';
import {sharedProjectEvents} from './shared-project-events.mjs';
import {validateBackupDependencies,hostedBackupInventory} from './lifecycle-backup.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';
import {rejectPartialOriginalImport,originalEvidencePattern} from './original-recovery.mjs';
import {operationsOriginalsCapability,originalTransitionSchema,validateDriveOriginalPolicy,replayOriginalTransition} from './shared-operations-originals.mjs';
export {operationsOriginalsCapability} from './shared-operations-originals.mjs';
import {blobAuthoringStore,attachHostedAuthoring} from './hosted-authoring.mjs';
import {blobAudioStore} from './call-audio.mjs';
import {notificationEnvelope} from './exact-team-notifications.mjs';
import {prepareNotificationsInState,digestTime,notificationTemplates,notificationView} from './team-notifications.mjs';
import {syncIncomingMail,incomingRoutes,validateIncomingImport} from './google-incoming-mail.mjs';
import {composeExactMail,byteHash,mailMessageId,verifySentRaw} from './google-hosted-transport.mjs';
import {applyManualRecord,manualRecordEvents} from './shared-manual-records.mjs';
import {operationsRefinementCapability,generationTransitionSchema,validateRefinementPolicy,validatePreparedRefinement,validateGenerationTransition,applyGenerationTransition} from './refinement-generation.mjs';
export {operationsRefinementCapability} from './refinement-generation.mjs';

export const dispatchCapability='shared-internal-dispatch-v1',dispatchPrincipal='service:internal-dispatch';
export const manualDispatchCapability='shared-manual-internal-dispatch-v1';
export const operationsRecordsCapability='shared-operations-records-v1';
export const operationsAuthoringCapability='shared-operations-authoring-v1';
export const dispatchHasGeneration=value=>[operationsRefinementCapability,operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability].includes(value);
export const dispatchHasProjects=value=>[operationsRecordsCapability,operationsAuthoringCapability,operationsRefinementCapability,operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability].includes(value);
export const dispatchHasAuthoring=value=>[operationsAuthoringCapability,operationsRefinementCapability,operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability].includes(value);
export const dispatchAuthoringSchema=Object.freeze({version:1,transitions:['claim','hold','rendering','renderer','revise','rendered','complete'],recovery:'observed-hash-close-publication-v1',transfers:'immutable-authoring-chunks-v1'});
export const isDispatchCapability=value=>[dispatchCapability,manualDispatchCapability,operationsRecordsCapability,operationsAuthoringCapability,operationsRefinementCapability,operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability].includes(value);
export const dispatchHasManual=value=>[manualDispatchCapability,operationsRecordsCapability,operationsAuthoringCapability,operationsRefinementCapability,operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability].includes(value);
export const dispatchHasOriginals=value=>[operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability].includes(value);
export const dispatchHasCalendar=value=>[operationsCalendarCapability,operationsMailCapability].includes(value);
const sourceKind=capability=>capability===operationsMailCapability?'shared-operations-exact-mail-source-v1':dispatchHasCalendar(capability)?'shared-operations-calendar-source-v1':capability===operationsOriginalsCapability?'shared-operations-originals-source-v1':capability===operationsRefinementCapability?'shared-operations-refinement-source-v1':capability===operationsAuthoringCapability?'shared-operations-authoring-source-v1':capability===operationsRecordsCapability?'shared-operations-records-source-v1':capability===manualDispatchCapability?'shared-manual-internal-dispatch-source-v1':'shared-internal-dispatch-source-v1';
export const dispatchManualSchema=Object.freeze({version:1,events:manualRecordEvents});
// Notes have exactly one typed path, including in the composed profile.
export const dispatchProjectEvents=Object.freeze(sharedProjectEvents.filter(type=>type!=='note_added'));
export const dispatchHumanSchema=Object.freeze({version:1,manual:manualRecordEvents,project:dispatchProjectEvents});
export const dispatchRecordEvents=Object.freeze([...manualRecordEvents,...dispatchProjectEvents]);
export const dispatchVersions=Object.freeze({template:'existing-attention-digest-v1',privacy:'no-contact-or-private-notes-v1',signature:'internal-operations-v1'});
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),roles=['owner','friend'];
const address=v=>typeof v==='string'&&/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(v);
const fields=(value,names)=>check(value&&Object.keys(value).sort().join(',')===names.split(',').sort().join(','),'Unknown or missing dispatch fields');
const bump=(s,now)=>{s.revision++;s.updated_at=now.toISOString();};
const control=s=>s.operations?.internal_dispatch;
const policy=c=>c.internal_dispatch;
export function validateDispatchBinding(b){
 fields(b,'schema_version,capability,workspace_id,run_id,mode,state_schema,site_id,deploy_id,origin,namespace,policy_sha256');
 check(b.schema_version===1&&isDispatchCapability(b.capability)&&b.mode==='production'&&b.state_schema===1&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id].every(key)&&sha(b.policy_sha256),'Exact shared dispatch binding required');
 const u=new URL(b.origin);check(u.protocol==='https:'&&u.origin===b.origin&&/^evz-project-shared-[a-z0-9-]{8,40}$/.test(b.namespace),'Exact shared namespace and HTTPS origin required');return b;
}
export function validateDispatchPolicy(p,{active=false}={}){
 fields(p,'schema_version,status,capability,policy_id,revision,binding,grant_id,account_email,from,approval_mode,kinds,recipients,role_mapping,versions,templates,signature,starts_at,expires_at,routes,limits,priority,host_allowance,host_reserve_percent,pause_rule'+(p?.capability===manualDispatchCapability?',manual_events':dispatchHasProjects(p?.capability)?',human_events'+(dispatchHasAuthoring(p.capability)?',authoring':'')+(dispatchHasGeneration(p.capability)?',generation':'')+(dispatchHasOriginals(p.capability)?',originals':'')+(dispatchHasCalendar(p.capability)?',calendar':'')+(p.capability===operationsMailCapability?',mail,mail_events':''):''));
 check(p.schema_version===1&&p.status==='UNAPPROVED'&&isDispatchCapability(p.capability)&&key(p.policy_id)&&key(p.revision)&&p.approval_mode==='standing-internal-only'&&hash(p.kinds)===hash(['attention','digest'])&&hash(p.versions)===hash(dispatchVersions)&&hash(p.templates)===hash(notificationTemplates),'Exact unapproved standing internal policy/template required');
 if(p.capability===manualDispatchCapability)check(hash(p.manual_events)===hash(dispatchManualSchema),'Exact five-event manual schema required');
 if(dispatchHasProjects(p.capability))check(hash(p.human_events)===hash(dispatchHumanSchema),'Exact partitioned human record schema required');
 if(dispatchHasAuthoring(p.capability))check(hash(p.authoring)===hash(dispatchAuthoringSchema),'Exact interactive authoring/recovery schema required');
 if(dispatchHasGeneration(p.capability)){fields(p.generation,'policy_sha256,schema');check(sha(p.generation.policy_sha256)&&hash(p.generation.schema)===hash(generationTransitionSchema),'Exact separate generation policy/schema required');}
 if(dispatchHasOriginals(p.capability)){fields(p.originals,'source_policy_sha256,schema,grant_profile');check(sha(p.originals.source_policy_sha256)&&p.originals.grant_profile==='drive-originals-readonly-v1'&&hash(p.originals.schema)===hash(originalTransitionSchema),'Exact separate original policy/schema required');}
 if(dispatchHasCalendar(p.capability)){fields(p.calendar,'source_policy_sha256,schema,grant_profile');check(sha(p.calendar.source_policy_sha256)&&p.calendar.grant_profile==='calendar-booking-v1'&&hash(p.calendar.schema)===hash(calendarTransitionSchema),'Exact separate Calendar policy/schema required');}
 if(p.capability===operationsMailCapability){fields(p.mail,'source_policy_sha256,schema,grant_profile');check(sha(p.mail.source_policy_sha256)&&p.mail.grant_profile===operationsMailProfile&&hash(p.mail.schema)===hash(mailTransitionSchema)&&hash(p.mail_events)===hash(mailRecordEvents),'Exact separate mail policy/schema and event partition required');}
 fields(p.binding,'workspace_id,run_id,site_id,deploy_id,origin,namespace');
 check(hash(p.priority)===hash(['reconcile','incoming','reply','meeting','problem','digest'])&&p.host_reserve_percent===30&&p.pause_rule==='both-roles-pause-owner-new-policy-no-resume'&&p.signature==='EVZ Digital team · Internal operations notification','Review finite priority, reserve and pause rules');
 fields(p.recipients,'owner,friend');fields(p.role_mapping,'owner,friend');
 fields(p.limits,'ticks_lifetime,ticks_day,poll_seconds,gets_tick,sends_tick,bytes_tick,milliseconds_tick,sends_day,sends_lifetime,attention_role_day,sender_day');
 fields(p.host_allowance,'available_ticks,observed_at,evidence_reference');
 if(!active)return p;
 check(key(p.grant_id)&&address(p.account_email)&&p.from==='hello@evzdigital.studio','Exact business Google grant/account/from required');
 check(roles.every(r=>address(p.recipients[r])&&key(p.role_mapping[r]?.verification_id)&&p.role_mapping[r].role===r&&p.role_mapping[r].address===p.recipients[r]&&p.role_mapping[r].verified===true&&Object.keys(p.role_mapping[r]).sort().join(',')==='address,role,verification_id,verified')&&p.recipients.owner.toLowerCase()!==p.recipients.friend.toLowerCase(),'Distinct verified role/address mapping required');
 const start=Date.parse(p.starts_at),end=Date.parse(p.expires_at);check(typeof p.starts_at==='string'&&p.starts_at.endsWith('Z')&&typeof p.expires_at==='string'&&p.expires_at.endsWith('Z')&&Number.isFinite(start)&&end>start&&end-start<=7*86400_000,'Standing policy needs exact finite UTC window of at most seven days');
 const l=p.limits;check(Object.values(l).every(Number.isSafeInteger)&&l.ticks_lifetime>=1&&l.ticks_lifetime<=1000&&l.ticks_day>=1&&l.ticks_day<=100&&l.poll_seconds>=60&&l.poll_seconds<=3600&&l.gets_tick>=4&&l.gets_tick<=40&&l.sends_tick>=2&&l.sends_tick<=4&&l.bytes_tick>=200_000&&l.bytes_tick<=8_000_000&&l.milliseconds_tick>=1000&&l.milliseconds_tick<=240_000&&l.sends_day>=2&&l.sends_day<=20&&l.sends_lifetime>=2&&l.sends_lifetime<=100&&l.attention_role_day>=1&&l.attention_role_day<=8&&l.sender_day===20,'Finite tick/GET/send/byte/time/day/lifetime ceilings and unchanged combined 20/day sender cap required');
 check(Number.isSafeInteger(p.host_allowance.available_ticks)&&p.host_allowance.available_ticks>0&&l.ticks_lifetime<=Math.floor(p.host_allowance.available_ticks*0.7)&&Number.isFinite(Date.parse(p.host_allowance.observed_at))&&typeof p.host_allowance.evidence_reference==='string'&&p.host_allowance.evidence_reference.length>0&&p.host_allowance.evidence_reference.length<=500,'Review a finite measured host-cycle allowance and retain its 30 percent reserve; configuration is not billing proof');
 check(Array.isArray(p.routes)&&p.routes.length>0&&p.routes.length<=12,'Explicit registered route scope required');return p;
}
export function validateDispatchEnvelope(data,binding){
 const b=validateDispatchBinding(binding.scope),m=data.dispatch_source;
 check(!data.inert_source&&!data.manual_source&&!data.project_source&&m?.kind===sourceKind(b.capability)&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(b),'Exact shared dispatch source manifest required');
 check(hash(data.config)===m.config_sha256&&data.config.shared_capability===b.capability&&data.config.mode==='production'&&data.config.run_id===b.run_id&&data.state.run_id===b.run_id&&data.state.mode==='production','Dispatch configuration/identity changed');
 const p=validateDispatchPolicy(policy(data.config));check(p.capability===b.capability&&hash(p)===b.policy_sha256&&hash(p.binding)===hash(Object.fromEntries(['workspace_id','run_id','site_id','deploy_id','origin','namespace'].map(k=>[k,b[k]]))),'Dispatch policy/deployment binding changed');
 if(b.capability===manualDispatchCapability)check(hash(m.manual_events)===hash(dispatchManualSchema)&&hash(m.allowed_events)===hash(manualRecordEvents)&&data.config.follow_up?.enabled===true,'Exact manual manifest and held preview preparation required');
 if(dispatchHasProjects(b.capability))check(hash(m.human_events)===hash(dispatchHumanSchema)&&hash(m.allowed_events)===hash(b.capability===operationsMailCapability?[...dispatchRecordEvents,...mailRecordEvents]:dispatchRecordEvents)&&data.config.follow_up?.enabled===true,'Exact operations records manifest and held preview preparation required');
 if(dispatchHasAuthoring(b.capability))check(hash(m.authoring)===hash(dispatchAuthoringSchema),'Exact authoring manifest required');
 if(dispatchHasGeneration(b.capability)){validateRefinementPolicy(data.config.refinement_generation);check(hash(data.config.refinement_generation)===p.generation.policy_sha256&&hash(m.generation)===hash(p.generation),'Separate refinement policy/manifest changed');}
 if(dispatchHasOriginals(b.capability)){validateDriveOriginalPolicy(data.config.google_drive_originals,data.state);check(hash(data.config.google_drive_originals)===p.originals.source_policy_sha256&&hash(m.originals)===hash(p.originals),'Separate original policy/manifest changed');}
 if(dispatchHasCalendar(b.capability)){validateCalendarPolicy(data.config.google_calendar);validateCalendarImport(data.state,data.config);check(hash(data.config.google_calendar)===p.calendar.source_policy_sha256&&hash(m.calendar)===hash(p.calendar)&&hash(data.config.calendar)===hash({...calendarSlotPolicy,calendar_id:'primary',owner_email:data.config.google_calendar.account}),'Separate Calendar policy/manifest changed');}
 if(b.capability===operationsMailCapability){validateMailConfig(data.config);check(hash(data.config.google_exact_mail)===p.mail.source_policy_sha256&&hash(m.mail)===hash(p.mail)&&hash(m.mail_events)===hash(mailRecordEvents),'Separate mail policy/manifest changed');}
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(data.config[flag]===false,'General execution remains disabled');
 check(data.config.runtime?.enabled===false&&data.config.operations?.enabled===false&&data.config.transcript_ai?.enabled===false&&data.config.release?.approved===false&&data.config.call_release?.approved===false,'General release remains revoked');
}
export async function prepareDispatchWorkspace({backup,sourceConfig,scope,dispatchPolicy,refinementPolicy,refinementRuntimes,google_drive_originals,google_calendar,google_exact_mail,rebindObservation}){
 validateDispatchBinding(scope);validateDispatchPolicy(dispatchPolicy);check(dispatchPolicy.capability===scope.capability&&hash(dispatchPolicy)===scope.policy_sha256,'Exact dispatch policy required');
 const baseScope={...scope,capability:'shared-project-continuation-v1'};delete baseScope.policy_sha256;
 const packet=await prepareProjectWorkspace({backup,sourceConfig,scope:baseScope}),config={...packet.envelope.config,shared_capability:scope.capability,internal_dispatch:structuredClone(dispatchPolicy)};
 if(dispatchHasGeneration(scope.capability)){validateRefinementPolicy(refinementPolicy);check(hash(refinementPolicy)===dispatchPolicy.generation.policy_sha256,'Prepare exact separate unapproved generation policy');config.refinement_generation=structuredClone(refinementPolicy);config.refinement_generation_runtimes=structuredClone(refinementRuntimes??{});}
 else check(refinementPolicy===undefined&&refinementRuntimes===undefined,'Existing dispatch profiles reject generation preparation');
 if(dispatchHasOriginals(scope.capability)){validateDriveOriginalPolicy(google_drive_originals,packet.envelope.state);check(hash(google_drive_originals)===dispatchPolicy.originals.source_policy_sha256,'Prepare exact separate original policy');config.google_drive_originals=structuredClone(google_drive_originals);}
 else check(google_drive_originals===undefined,'Existing dispatch profiles reject Drive preparation');
 if(dispatchHasCalendar(scope.capability)){validateCalendarPolicy(google_calendar);validateCalendarImport(packet.envelope.state,sourceConfig);check(hash(google_calendar)===dispatchPolicy.calendar.source_policy_sha256,'Prepare exact separate unapproved Calendar policy');config.google_calendar=structuredClone(google_calendar);config.calendar={...structuredClone(calendarSlotPolicy),calendar_id:'primary',owner_email:google_calendar.account};}
 else check(google_calendar===undefined,'Existing dispatch profiles reject Calendar preparation');
 if(scope.capability===operationsMailCapability){validateMailPolicy(google_exact_mail);check(hash(google_exact_mail)===dispatchPolicy.mail.source_policy_sha256,'Prepare exact separate unapproved mail policy');config.google_exact_mail=structuredClone(google_exact_mail);await validateMailEvidence(packet.envelope.state,{strict:true});}
 else check(google_exact_mail===undefined,'Existing dispatch profiles reject mail preparation');
 if(dispatchHasManual(scope.capability))config.follow_up={...config.follow_up,enabled:true};
 config.sender={...config.sender,email:dispatchPolicy.from,account_email:dispatchPolicy.account_email};
 config.operations={...config.operations,threads:structuredClone(Object.fromEntries(dispatchPolicy.routes.map(({project_id,contact_sha256,...route})=>[project_id,route])))};
 config.google_incoming_mail={enabled:true,capability:'shared-registered-incoming-v1',run_id:scope.run_id,grant_id:dispatchPolicy.grant_id,account_email:dispatchPolicy.account_email};
 const manifest={...packet.envelope.project_source,kind:sourceKind(scope.capability),binding:structuredClone(scope),config_sha256:hash(config),allowed_events:scope.capability===operationsMailCapability?[...dispatchRecordEvents,...mailRecordEvents]:dispatchHasProjects(scope.capability)?[...dispatchRecordEvents]:scope.capability===manualDispatchCapability?[...manualRecordEvents]:[],...(scope.capability===manualDispatchCapability?{manual_events:dispatchManualSchema}:dispatchHasProjects(scope.capability)?{human_events:dispatchHumanSchema}:{}),...(dispatchHasAuthoring(scope.capability)?{authoring:dispatchAuthoringSchema}:{}),...(dispatchHasGeneration(scope.capability)?{generation:structuredClone(dispatchPolicy.generation)}:{}),...(dispatchHasOriginals(scope.capability)?{originals:structuredClone(dispatchPolicy.originals)}:{}),...(dispatchHasCalendar(scope.capability)?{calendar:structuredClone(dispatchPolicy.calendar)}:{}),...(scope.capability===operationsMailCapability?{mail:structuredClone(dispatchPolicy.mail),mail_events:[...mailRecordEvents]}:{}),unsupported:['prospect-outreach','research',...(dispatchHasAuthoring(scope.capability)?['unattended-authoring','automatic-design-review']:['authoring']),'audio',...(dispatchHasCalendar(scope.capability)?[]:['calendar']),...(dispatchHasOriginals(scope.capability)?['generic-original-upload']:['drive']),'automatic-migration']};
 const state=structuredClone(packet.envelope.state),prior=control(state);
 if(prior){check(prior.paused&&rebindObservation===hash(prior)&&!Object.values(prior.ticks).some(t=>['Reserved','Claimed'].includes(t.status))&&prior.policy.policy_id!==dispatchPolicy.policy_id,'Imported standing policy needs exact observed-hash recovery and a distinct new policy; never transplant authority');const history=state.operations.internal_dispatch_history??=[];check(history.length<10&&!history.some(d=>d.policy.policy_id===dispatchPolicy.policy_id),'Finite retained policy history; never reset a historical policy allowance');history.push(prior);}
 (state.operations??={}).internal_dispatch={policy:structuredClone(dispatchPolicy),authorization:null,ticks:{},observations:[],paused:true};
 validateIncomingImport(state,config);
 manifest.original_source_state_sha256=manifest.source_state_sha256;manifest.source_state_sha256=hash(state);
 const envelope={schema_version:1,config,state,dispatch_source:manifest},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)};
 validateDispatchEnvelope(envelope,binding);check(Buffer.byteLength(JSON.stringify(envelope))<=20_000_000,'Prepared dispatch exceeds the existing 20 MB store');if(dispatchHasGeneration(scope.capability))await validatePreparedRefinement(envelope,binding,packet.files);return {envelope,binding,files:packet.files};
}
export async function installDispatchWorkspace(store,packet,{commit=false}={}){
 const {envelope,binding,files}=packet;validateDispatchEnvelope(envelope,binding);check(hash(envelope.state)===envelope.dispatch_source.source_state_sha256,'Dispatch source changed');validateIncomingImport(envelope.state,envelope.config);if(binding.scope.capability===operationsMailCapability)await validateMailEvidence(envelope.state,{strict:true});await validateBackupDependencies(envelope.state,files);
 if(!dispatchHasOriginals(binding.scope.capability))rejectPartialOriginalImport(envelope.state,files);
 validateSharedProjectDependencies(files);
 check(Buffer.byteLength(JSON.stringify(envelope))<=20_000_000,'Shared dispatch workspace exceeds the existing 20 MB store');
 check(hash([...files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:'shared-immutable-dependency'})))===hash(envelope.dispatch_source.dependencies),'Dispatch dependencies changed');
 if(dispatchHasGeneration(binding.scope.capability))await validatePreparedRefinement(envelope,binding,files);
 if(!commit)return {dry_run:true,execution:'disabled',binding};
 check(hash(store.dispatchBinding)===hash(binding),'Exact import binding required');store.validate(envelope);check(!await store.store.getWithMetadata(store.key,{type:'json',consistency:'strong'}),'Shared destination exists; never overwrite or reseed');
 const originals=blobProjectOriginalStore(store.store),authored=blobAuthoringStore(store.store),audio=blobAudioStore(store.store);
 for(const [path,bytes] of files){const a=/^project-authored\/(author-[a-f0-9]{32})\/(.+)$/.exec(path);if(a)await authored.put(a[1],a[2],bytes);else if(dispatchHasOriginals(binding.scope.capability)&&originalEvidencePattern.test(path))await originals.putEvidence(path,bytes);else if(/^project-originals\/[a-f0-9]{64}\.pdf$/.test(path))await originals.put(bytes);else{check(path.startsWith('call-audio/'),'Unsupported retained dependency');await audio.put(path.slice(11),bytes);}}
 const probe={store,config:envelope.config,snapshot:async()=>structuredClone(envelope.state)};attachHostedAuthoring(probe,store.store);await hostedBackupInventory(probe,audio);
 try{const result=await store.store.setJSON(store.key,envelope,{onlyIfNew:true});check(result?.modified===true,'Shared destination changed');}catch{check(hash((await store.envelope()).data)===hash(envelope),'Import outcome uncertain; inspect the exact manifest');}
 check(hash((await store.envelope()).data)===hash(envelope),'Import readback changed');return {dry_run:false,execution:'disabled'};
}
export function currentDispatch(state,config,now,{recovery=false}={}){
 const p=validateDispatchPolicy(policy(config),{active:true}),d=control(state),a=d?.authorization;
 check(d&&hash(d.policy)===hash(p)&&a?.actor==='owner'&&a.type==='internal_dispatch_authorized'&&a.data.policy_sha256===hash(p)&&hash(state.events[a.id])===hash(a),'Exact signed owner standing policy required');
 if(!recovery){check(!d.paused,'Standing dispatch is paused');check(+now>=Date.parse(p.starts_at)&&+now<Date.parse(p.expires_at),'Standing policy expired or not started');check(hash(incomingRoutes(state,config))===hash(p.routes),'Current registered routes/contact/stop binding changed');}
 return p;
}
function live(state,config,tick,now){const t=control(state)?.ticks[tick],p=currentDispatch(state,config,now,{recovery:Boolean(t?.reconciliation)});check(t?.status==='Claimed'&&+now<Date.parse(t.deadline)&&t.day===businessDate(now),'Tick is not live; closed/expired/day-changed attempts cannot publish');return {p,t};}
function exactPackage(state,config,id,now){const p=currentDispatch(state,config,now),m=state.team_notifications?.messages?.[id],r=state.prospects[m?.project_id],{sha256,...envelope}=notificationEnvelope(state,m,p,m?.recipient_role,now),guarded={...envelope,record_guard_sha256:r?hash({stage:r.stage,restriction:r.restriction??null,follow_up_owner:r.follow_up_owner??null,contact:r.contact??null}):null};return {...guarded,sha256:hash(guarded)};}
function pendingDigests(state,now){const time=digestTime(now);return time?roles.map(r=>state.team_notifications?.messages?.[`digest-${time.day}-${r}`]).filter(m=>m&&m.status==='Prepared; delivery held'&&!m.delivery):[];}
function combinedToday(state,now){const day=businessDate(now);return Object.values(state.operations?.requests??{}).filter(q=>['intent','send'].includes(q.operation)&&q.prepared_at&&businessDate(q.prepared_at)===day).length+Object.values(state.prospects).filter(r=>r.information_draft?.approved_at&&businessDate(r.information_draft.approved_at)===day).length;}
export function nextStandingMessage(state,config,now){
 const p=currentDispatch(state,config,now),today=businessDate(now),qs=Object.values(state.operations?.requests??{}).filter(q=>q.internal_notification&&q.prepared_at&&businessDate(q.prepared_at)===today),digests=pendingDigests(state,now),tick=Object.values(control(state).ticks).find(t=>t.status==='Claimed'),remaining=Math.min(p.limits.sends_day-qs.length,p.limits.sender_day-combinedToday(state,now),tick?p.limits.sends_tick-qs.filter(q=>q.tick_id===tick.id).length:p.limits.sends_tick);
 if(remaining<=0)return null;
 const messages=Object.values(state.team_notifications?.messages??{}).filter(m=>m.status==='Prepared; delivery held'&&!m.delivery&&Date.parse(m.due_at)<=+now).filter(m=>{try{exactPackage(state,config,m.id,now);return m.kind==='digest'||qs.filter(q=>q.recipient_role===m.recipient_role&&q.notification_kind==='attention').length<p.limits.attention_role_day;}catch{return false;}});
 const rank=m=>m.kind==='digest'?3:m.source_id?.startsWith('reply:')?0:m.source_id?.startsWith('meeting:')?1:2;
 // Reserve both same-day digest slots before consuming the finite daily budget with attention.
 return (remaining<=digests.length?digests:messages.sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id)))[0]??null;
}
function expectedSend(state,id){const a=state.actions[id],q=state.operations?.requests?.[id+'-intent'];check(a?.payload?.standing_internal===true&&q?.internal_notification===true&&typeof q.raw_base64url==='string'&&byteHash(Buffer.from(q.raw_base64url,'base64url'))===q.mime_sha256,'Exact retained standing MIME required');return {a,q,expected:{raw:Buffer.from(q.raw_base64url,'base64url'),message_id:q.rfc_message_id,thread_id:q.provider_thread_id??null}};}
export function assertStandingPost(state,config,tick,id,now){const {p,t}=live(state,config,tick,now),{a,q}=expectedSend(state,id);check(!t.reconciliation&&q.status==='Uncertain'&&q.tick_id===tick&&q.binding_sha256===hash(p)&&businessDate(q.prepared_at)===businessDate(now)&&exactPackage(state,config,a.payload.package.notification_id,now).sha256===q.package_sha256,'Final POST source, stop, assignment, policy, date or claim changed; reconcile only');return q;}
function closeUnclaimed(state,tick,at){for(const q of Object.values(state.operations.requests??{}))if(q.standing_internal&&q.tick_id===tick&&q.status==='Reserved'&&!q.dispatch_started_at){q.status='Cancelled';q.closed_at=at;q.hold='Closed before dispatch; reservation retained without refund or replay';const id=q.logical.slice(0,-7),a=state.actions[id];a.status='Held';a.hold=q.hold;state.operations.email[id].status='Held';state.team_notifications.messages[a.payload.package.notification_id].delivery.status='Held before dispatch; no resend permission';}}
export async function applyDispatchTransition(state,config,tr,now){
 check(tr&&typeof tr.kind==='string'&&tr.at===now.toISOString()&&Number.isFinite(+now),'Exact typed dispatch transition required');const p=policy(config);let d=control(state);
 if(tr.kind==='authorize'){
  validateDispatchPolicy(p,{active:true});check(tr.actor==='owner'&&tr.revision===state.revision&&tr.authorized===true&&tr.policy_sha256===hash(p)&&key(tr.event_id)&&!state.events[tr.event_id]&&!d?.authorization,'Review the exact policy as signed owner; no resume or replacement approval');
  check(hash(incomingRoutes(state,config))===hash(p.routes),'Review exact current registered routes');const a={id:tr.event_id,type:'internal_dispatch_authorized',actor:'owner',at:tr.at,data:{policy_sha256:hash(p),policy:structuredClone(p)}};state.events[a.id]=a;
  (state.operations??={}).internal_dispatch={policy:structuredClone(p),authorization:a,ticks:{},observations:[],paused:false};
 }else if(tr.kind==='pause'){
  check(roles.includes(tr.actor)&&tr.revision===state.revision&&key(tr.event_id)&&!state.events[tr.event_id]&&d,'Both signed roles may pause the exact policy');
  const e={id:tr.event_id,type:'internal_dispatch_paused',actor:tr.actor,at:tr.at,data:{policy_sha256:hash(p),in_flight_may_complete:true}};state.events[e.id]=e;d.paused=true;d.pause=e;
 }else if(tr.kind==='recover'){
  check(roles.includes(tr.actor)&&tr.revision===state.revision&&d&&tr.observed_sha256===hash(d)&&key(tr.event_id)&&!state.events[tr.event_id],'Explicit current observed-hash recovery required');
  const e={id:tr.event_id,type:'internal_dispatch_reconciled',actor:tr.actor,at:tr.at,data:{observed_sha256:tr.observed_sha256,prior:{paused:d.paused,pause:d.pause??null,recovery:d.recovery??null,ticks:Object.fromEntries(Object.values(d.ticks).map(t=>[t.id,{status:t.status,closed_at:t.closed_at??null,recovery_event:t.recovery_event??null}]))},retained:'All policy, authorization, request, phase and incoming observation bytes remain on their original records',process_exit:false,no_replay:true}};state.events[e.id]=e;
  for(const t of Object.values(d.ticks))if(['Reserved','Claimed'].includes(t.status)){closeUnclaimed(state,t.id,tr.at);t.status='Reconciled';t.closed_at=tr.at;t.recovery_event=e.id;}d.paused=true;d.recovery=e.id;
 }else if(tr.kind==='reserve-reconcile'){
  currentDispatch(state,config,now,{recovery:true});check(roles.includes(tr.actor)&&tr.revision===state.revision&&key(tr.event_id)&&!state.events[tr.event_id],'Signed current read-only reconciliation required');const {q}=expectedSend(state,tr.action_id);
  check(q.status==='Uncertain'&&tr.observed_sha256===hash(q)&&!Object.values(d.ticks).some(t=>['Reserved','Claimed'].includes(t.status)),'Observe exact uncertain intent and close previous incomplete attempts before read-only reconciliation');
  const id='tick-'+hash({policy:hash(p),event:tr.event_id,action:tr.action_id,observation:hash(q)}).slice(0,40),ticks=Object.values(d.ticks);check(ticks.length<p.limits.ticks_lifetime&&ticks.filter(t=>t.day===businessDate(now)).length<p.limits.ticks_day,'Finite reconciliation tick allowance exhausted');
  state.events[tr.event_id]={id:tr.event_id,type:'internal_dispatch_readback_authorized',actor:tr.actor,at:tr.at,data:{action_id:tr.action_id,observed_sha256:hash(q),policy_sha256:hash(p),resend:false}};
  d.ticks[id]={id,status:'Reserved',day:businessDate(now),reserved_at:tr.at,deadline:new Date(+now+p.limits.milliseconds_tick).toISOString(),principal:dispatchPrincipal,authorization_event:tr.event_id,policy_sha256:hash(p),reconciliation:tr.action_id,reservations:{gets:p.limits.gets_tick,sends:0,bytes:p.limits.bytes_tick,milliseconds:p.limits.milliseconds_tick},phases:{},requests:[]};
 }else if(tr.kind==='reserve-tick'){
  currentDispatch(state,config,now);const ticks=Object.values(d.ticks),l=p.limits,day=businessDate(now),id='tick-'+hash({policy:hash(p),slot:Math.floor(+now/(l.poll_seconds*1000))}).slice(0,40);
  check(tr.tick_id===id&&!d.ticks[id]&&!ticks.some(t=>['Reserved','Claimed'].includes(t.status)),'Tick already reserved or incomplete; read durable claim/reconcile without replay');
  check(ticks.length<l.ticks_lifetime&&ticks.filter(t=>t.day===day).length<l.ticks_day,'Standing tick lifetime/day reservation exhausted');
  check(Buffer.byteLength(JSON.stringify(state))+2*l.bytes_tick<=14_000_000,'Keep the policy 30 percent shared-state reserve before a bounded cycle');
  check(!ticks.length||+now-Math.max(...ticks.map(t=>Date.parse(t.reserved_at)))>=l.poll_seconds*1000,'Next poll is not due');
  d.ticks[id]={id,status:'Reserved',day,reserved_at:tr.at,deadline:new Date(Math.min(+now+l.milliseconds_tick,Date.parse(p.expires_at))).toISOString(),principal:dispatchPrincipal,authorization_event:d.authorization.id,policy_sha256:hash(p),reservations:{gets:l.gets_tick,sends:l.sends_tick,bytes:l.bytes_tick,milliseconds:l.milliseconds_tick},phases:{},requests:[]};
 }else if(tr.kind==='claim-tick'){
  const t=d.ticks[tr.tick_id];currentDispatch(state,config,now,{recovery:Boolean(t?.reconciliation)});check(t?.status==='Reserved'&&+now<Date.parse(t.deadline)&&t.day===businessDate(now),'Tick already claimed, closed or expired; no background replay');t.status='Claimed';t.claimed_at=tr.at;
 }else if(tr.kind==='io'){
  const {t}=live(state,config,tr.tick_id,now);check(['token','GET','POST'].includes(tr.operation)&&key(tr.request_id)&&!t.requests.some(r=>r.id===tr.request_id),'Exact new bounded IO reservation required');
  check(!t.reconciliation||tr.operation!=='POST','Recovery is read-only; no resend authority');
  if(tr.operation==='POST'){const q=assertStandingPost(state,config,tr.tick_id,tr.action_id,now);check(!q.http_request_id,'Exact POST already reserved; no request retry');q.http_request_id=tr.request_id;q.http_reserved_at=tr.at;}
  check(t.requests.filter(r=>r.operation===tr.operation).length<(tr.operation==='POST'?p.limits.sends_tick:tr.operation==='GET'?p.limits.gets_tick:p.limits.gets_tick+p.limits.sends_tick),'Tick request ceiling exhausted');
  t.requests.push({id:tr.request_id,operation:tr.operation,at:tr.at});
 }else if(tr.kind==='io-result'){
  const t=d?.ticks[tr.tick_id],r=t?.requests.find(r=>r.id===tr.request_id);check(r&&!r.completed_at&&Number.isSafeInteger(tr.bytes)&&tr.bytes>=0&&tr.bytes<=p.limits.bytes_tick,'Exact bounded request readback required');
  check(t.requests.reduce((n,r)=>n+(r.bytes??0),0)+tr.bytes<=p.limits.bytes_tick,'Tick body byte ceiling exhausted');r.bytes=tr.bytes;r.completed_at=tr.at;r.outcome=tr.ok?'Observed':'Unavailable';
 }else if(tr.kind==='prepare'){
  const {t}=live(state,config,tr.tick_id,now);check(!t.reconciliation&&!t.phases.prepared,'Preparation phase already completed or recovery-only');prepareNotificationsInState(state,now,{origin:tr.tick_id});t.phases.prepared=tr.at;
 }else if(tr.kind==='reserve-send'){
  const {t}=live(state,config,tr.tick_id,now);check(!t.reconciliation&&t.phases.prepared&&t.phases.incoming,'Incoming and preparation checks must precede new sends');
  check(!state.operations.holds?.gmail_incoming,'Incoming synchronization hold prevents new sends');
  check(!Object.values(state.operations.requests??{}).some(q=>q.standing_internal&&!['Verified','Cancelled'].includes(q.status)),'Reconcile every retained standing intent before new sends');
  const m=nextStandingMessage(state,config,now);check(m?.id===tr.notification_id,'Current deterministic priority/source/assignment changed');const envelope=exactPackage(state,config,m.id,now),qs=Object.values(state.operations.requests??{}).filter(q=>q.internal_notification),l=p.limits;
  check(qs.filter(q=>q.policy_id===p.policy_id).length<l.sends_lifetime&&qs.filter(q=>q.prepared_at&&businessDate(q.prepared_at)===businessDate(now)).length<l.sends_day&&combinedToday(state,now)<20,'Internal or combined sender cap exhausted');
  check(Object.values(state.operations.requests??{}).filter(q=>q.tick_id===tr.tick_id).length<l.sends_tick,'Tick send reservation exhausted');
  const id='team-'+hash({run:state.run_id,notification:m.id}).slice(0,32),logical=id+'-intent';check(!state.actions[id]&&!state.operations.requests?.[logical],'Existing notification action/intent must never be replaced');
  const raw=composeExactMail(envelope,id,tr.at,[]).raw,a={id,type:'email',status:'Pending',assigned_to:m.recipient_role,created_at:tr.at,payload:{exact_mail:true,internal_notification:true,standing_internal:true,package_sha256:envelope.sha256,selector:{kind:'notification',notification_id:m.id},package:envelope,authorization_event:d.authorization.id,principal:dispatchPrincipal}};
  state.actions[id]=a;(state.operations.requests??={})[logical]={logical,operation:'intent',transport:'google-exact-mail-v1',status:'Reserved',standing_internal:true,internal_notification:true,policy_id:p.policy_id,recipient_role:m.recipient_role,notification_kind:m.kind,prepared_at:tr.at,tick_id:tr.tick_id,package_sha256:envelope.sha256,binding_sha256:hash(p),rfc_message_id:mailMessageId(id),mime_sha256:byteHash(raw),raw_base64url:raw.toString('base64url'),authorization_event:d.authorization.id,principal:dispatchPrincipal};
  (state.operations.email??={})[id]={status:'Reserved',package_sha256:envelope.sha256};m.delivery={status:'Reserved under standing internal policy; delivery held',action_id:id};
 }else if(tr.kind==='claim-send'){
  live(state,config,tr.tick_id,now);const {a,q}=expectedSend(state,tr.action_id);check(q.tick_id===tr.tick_id&&q.status==='Reserved'&&businessDate(q.prepared_at)===businessDate(now)&&exactPackage(state,config,a.payload.package.notification_id,now).sha256===q.package_sha256,'Current source/policy/date/intent changed before POST');
  q.status='Uncertain';q.dispatch_started_at=tr.at;a.status='Uncertain';state.operations.email[a.id].status='Uncertain';state.team_notifications.messages[a.payload.package.notification_id].delivery.status='Uncertain; no resend permission';
 }else if(tr.kind==='sent-observation'){
  const {q}=expectedSend(state,tr.action_id);check(q.status==='Uncertain'&&q.tick_id===tr.tick_id&&key(tr.message_id)&&key(tr.thread_id),'Only an existing claimed send may retain a late response');q.provider_message_id=tr.message_id;q.provider_thread_id=tr.thread_id;q.observed_at=tr.at;
 }else if(tr.kind==='verified'){
  const {a,q,expected}=expectedSend(state,tr.action_id);currentDispatch(state,config,now,{recovery:true});check(q.status==='Uncertain'&&q.binding_sha256===hash(p),'Original exact standing intent required; never resend');
  const t=d.ticks[tr.tick_id];check(t?.status==='Claimed'&&+now<Date.parse(t.deadline)&&(!t.reconciliation||t.reconciliation===tr.action_id)&&(!d.recovery||t.reconciliation===tr.action_id),'Closed attempt cannot publish a late readback; use a new explicit reconciliation');const receipt=verifySentRaw(tr.raw,expected);check(!q.provider_message_id||q.provider_message_id===receipt.message_id,'Provider response identity changed');
  q.status='Verified';q.receipt=receipt;q.verified_at=tr.at;a.status='Verified';a.delivery={...receipt,at:tr.at};state.operations.email[a.id]={...state.operations.email[a.id],status:'Verified',receipt};state.team_notifications.messages[a.payload.package.notification_id].delivery={status:'Sender verified; inbox delivery unverified',action_id:a.id,receipt};
 }else if(tr.kind==='close-tick'){
  const t=d?.ticks[tr.tick_id];check(t?.status==='Claimed','Closed tick cannot publish later phase output');if(!tr.held)live(state,config,tr.tick_id,now);closeUnclaimed(state,t.id,tr.at);t.status=tr.held?'Held':'Complete';t.closed_at=tr.at;t.hold=tr.held?'Bounded worker held; inspect exact phases and intents, never replay':null;t.pending_digests=pendingDigests(state,now).map(m=>m.id);t.limit_hold=t.pending_digests.length?'Due same-day digests remain held under finite source/IO/send limits; no backfill or allowance override':null;
 }else if(tr.kind==='incoming'){
  live(state,config,tr.tick_id,now);const t=d.ticks[tr.tick_id];check(!t.reconciliation&&!t.phases.incoming,'Only one incoming continuation per tick; no polling during recovery');
  const observations=structuredClone(tr.observations),app={config,store:{dispatchBinding:true},now:()=>now,loadConfig:async()=>config,snapshot:async()=>structuredClone(state),change:async fn=>fn(state)};
  const transport=Object.fromEntries(['incomingProfile','incomingHistory','incomingThread'].map(name=>[name,async(...args)=>{const o=observations.shift();check(o?.name===name&&hash(o.args)===hash(args),'Incoming replay request differs');if(o.error){const e=Error('Bounded incoming read unavailable');e.status=o.status;throw e;}return o.value;} ]));
  check(Buffer.byteLength(JSON.stringify(tr.observations))<=p.limits.bytes_tick,'Incoming observation bytes exceed policy');await syncIncomingMail(app,{actor:dispatchPrincipal,env:{EVZ_INTERNAL_DISPATCH_RUNTIME:config.shared_capability},transport});check(!observations.length,'Unexpected incoming observations');t.phases.incoming={at:tr.at,observations:structuredClone(tr.observations),sha256:hash(tr.observations)};
 }else throw Error('Unsupported typed dispatch transition');
 if(tr.kind!=='incoming')bump(state,now);
}
export function applyDispatchManualRecord(state,config,record,now){
 fields(record,'event,actor,revision,at');
 check(dispatchHasManual(config.shared_capability)&&record.at===now.toISOString(),'Exact composed manual transition required');
 const result=applyManualRecord(state,record.event,record.actor,record.revision,now,config);
 if(!result.duplicate)prepareNotificationsInState(state,now,{origin:'signed-manual-record',includeDigest:false});
 return result;
}
export function applyDispatchProjectRecord(state,config,record,now){
 fields(record,'event,actor,revision,at');
 check(dispatchHasProjects(config.shared_capability)&&dispatchProjectEvents.includes(record.event?.type)&&record.at===now.toISOString(),'Exact composed project transition required');
 if(record.event.type==='concept_refinement_requested'&&!state.events[record.event.id]){const asset=state.asset_index?.[record.event.data?.asset_id];check(!asset?.baseline_version||asset.baseline_version===record.event.data.version_id,'Select and agree the current approved baseline before requesting its refinement; no unpaid round was consumed');}
 const result=applySharedProjectEvent(state,record.event,record.actor,record.revision,now,config);
 if(!result.duplicate)prepareNotificationsInState(state,now,{origin:'signed-project-record',includeDigest:false});
 return {...result,execution:dispatchHasAuthoring(config.shared_capability)?'interactive authoring available; delivery held':'held; authoring unavailable'};
}
export function validateDispatchOptions(capability,options){
 const types=dispatchHasAuthoring(capability)?['dispatchTransition','manualRecord','projectRecord','projectAuthoring','projectReconcile',...(dispatchHasGeneration(capability)?['projectGeneration']:[]),...(dispatchHasOriginals(capability)?['projectOriginal']:[]),...(dispatchHasCalendar(capability)?['projectCalendar']:[]),...(capability===operationsMailCapability?['mailRecord','projectMail']:[])]:capability===operationsRecordsCapability?['dispatchTransition','manualRecord','projectRecord']:capability===manualDispatchCapability?['dispatchTransition','manualRecord']:['dispatchTransition'];
 check(types.filter(k=>Object.hasOwn(options,k)).length===1&&Object.keys(options).every(k=>[...types,'configFingerprint',...(options.projectCalendar?['calendarSignal']:[]),...(options.projectMail?['mailSignal']:[]),...(options.manualRecord||options.projectRecord||options.mailRecord?['eventId','eventFingerprint']:[])].includes(k)),'Shared dispatch storage rejects untyped mutations');
}
export async function validateDispatchChange(before,after,options={},raw,originalAuthority){
 const {dispatchTransition,manualRecord,projectRecord,projectAuthoring,projectReconcile,projectGeneration,projectOriginal,projectCalendar,projectMail,mailRecord}=options;validateDispatchOptions(before.config.shared_capability,options);
 check(hash(before.config)===hash(after.config)&&hash(before.dispatch_source)===hash(after.dispatch_source),'Shared dispatch rejects configuration changes');
 if(dispatchHasProjects(before.config.shared_capability)&&(manualRecord||projectRecord||mailRecord)){const record=manualRecord??projectRecord??mailRecord;check(options.eventId===record.event.id&&options.eventFingerprint===hash({event:record.event,actor:record.actor})&&options.configFingerprint===hash(before.config),'Exact human event receipt and configuration fingerprint required');}
 const expected=structuredClone(before.state);
 if(manualRecord)applyDispatchManualRecord(expected,before.config,manualRecord,new Date(manualRecord.at));
 else if(projectRecord)applyDispatchProjectRecord(expected,before.config,projectRecord,new Date(projectRecord.at));
 else if(mailRecord)applyMailRecord(expected,before.config,mailRecord,new Date(mailRecord.at));
 else if(projectMail){check(options.configFingerprint===hash(before.config),'Exact complete mail configuration fingerprint required');await replayMailTransition(before,expected,projectMail,raw,originalAuthority);}
 else if(projectCalendar)await replayCalendarTransition(before,expected,projectCalendar,originalAuthority);
 else if(projectOriginal)await replayOriginalTransition(before,expected,projectOriginal,raw,originalAuthority);
 else if(projectGeneration){const now=new Date(after.state.updated_at),app={store:{dispatchBinding:{scope:before.dispatch_source.binding,manifest_sha256:hash(before.dispatch_source)}},config:before.config,snapshot:async()=>structuredClone(before.state),now:()=>now};attachHostedAuthoring(app,raw);await validateGenerationTransition(app,projectGeneration);applyGenerationTransition(expected,projectGeneration,before.config,now);}
 else if(projectAuthoring||projectReconcile){
  const app={store:{dispatchBinding:{scope:before.dispatch_source.binding,manifest_sha256:hash(before.dispatch_source)}},config:before.config,snapshot:async()=>structuredClone(before.state),now:()=>new Date(after.state.updated_at)};
  if(projectAuthoring){
   fields(projectAuthoring,'type,input,actor,details');
   check(dispatchAuthoringSchema.transitions.includes(projectAuthoring.type)&&Object.keys(projectAuthoring.input).every(k=>['project_id','work_id','job_id','context_sha256','references','reason','review'].includes(k)),'Unsupported authoring transition');
   const allowed={claim:['job','refs'],hold:['job','message'],rendering:['job','source','runtime','nodeRuntime'],renderer:['job','renderer_sha256','renderer_lock_sha256','nodeRuntime'],revise:[],rendered:['job','receipt'],complete:['job','source','receipt','original']}[projectAuthoring.type];
   check(Object.keys(projectAuthoring.details).every(k=>allowed.includes(k)),'Unknown authoring witness');
  }
  if(projectReconcile)fields(projectReconcile,'job,result,snapshot,actor');
  await replayProjectAuthoring(app,expected,options,raw,new Date(after.state.updated_at));
 }
 else await applyDispatchTransition(expected,before.config,dispatchTransition,new Date(after.state.updated_at));
 check(hash(expected)===hash(after.state),'Shared dispatch transition changed protected records, policy, phases, budgets or dependencies');
}
export async function dispatchTransition(app,tr){
 const config=await app.loadConfig(),transition={...tr};check(app.store?.dispatchBinding&&app.store.dispatchBinding.scope.capability===config.shared_capability&&isDispatchCapability(config.shared_capability),'Exact shared dispatch store required');
 return app.change(async state=>{transition.at=app.now().toISOString();await applyDispatchTransition(state,config,transition,new Date(transition.at));return {revision:state.revision,tick_id:transition.tick_id,status:control(state)?.ticks?.[transition.tick_id]?.status};},{configFingerprint:hash(config),dispatchTransition:transition});
}
export function dispatchStatus(state,config,now,runtime=false){
 const p=policy(config),d=control(state),expired=+now>=Date.parse(p.expires_at);let status='Unapproved';if(d?.authorization)status=d.recovery?'Recovery required':d.paused?'Paused':expired?'Expired':+now<Date.parse(p.starts_at)?'Not started':!runtime?'Runtime paused':'Authorized';
 let route_hold=null;try{validateIncomingImport(state,config);}catch{route_hold='Current registered routes or retained incoming scope differs; dispatch is held without changing history';status='Held: incoming scope';}
 const ticks=Object.values(d?.ticks??{}).map(t=>({...t,phases:Object.fromEntries(Object.entries(t.phases).map(([name,value])=>[name,typeof value==='string'?value:{at:value.at,sha256:value.sha256,observation_count:value.observations.length}]))}));
 return {capability:config.shared_capability,status,route_hold,runtime_enabled:runtime,expired,approval_mode:'Standing internal policy; each-message approval remains a separate capability',policy_sha256:hash(p),policy:p,paused_by:d?.pause?.actor??null,authorization_event:d?.authorization?.id??null,principal:dispatchPrincipal,limits:p?.limits,ticks,observed_sha256:d?hash(d):null,inbox_delivery:'Unverified',design_authority:'Owner and friend retain equal design authority and visibility; both may pause'};
}
export function dispatchNotificationView(state,config,now,runtime=false){const standing=dispatchStatus(state,config,now,runtime),view=state.notification_preparation??notificationView(state);return {...view,channel_status:'Standing internal-only policy: '+standing.status,delivery_enabled:standing.status==='Authorized',messages:view.messages.map(m=>m.delivery?m:{...m,delivery_hold:'Prepared source; waiting for a current bounded standing-policy tick. Inbox delivery remains unverified.'})};}
export async function dispatchCommand(app,command,input,actor,{runtime=false}={}){
 check(roles.includes(actor),'Signed owner/friend required');if(command==='policy'||command==='status')return dispatchStatus(await app.snapshot(),await app.loadConfig(),app.now(),runtime);
 const kind={authorize:'authorize',pause:'pause',reconcile:input.action_id?'reserve-reconcile':'recover'}[command];check(kind,'Unsupported standing policy control');await dispatchTransition(app,{...input,actor,kind});return dispatchStatus(await app.snapshot(),await app.loadConfig(),app.now(),runtime);
}
