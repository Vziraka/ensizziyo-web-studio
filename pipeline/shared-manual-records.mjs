import {applyOperationsNotificationTransition,validateOperationsNotificationsState} from './operations-notifications.mjs';
import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {prepareInertWorkspace} from './inert-shared-workspace.mjs';
import {validateBackupDependencies,hostedManualBackupInventory,writePortableLifecycleBackup,installMailboxMimeDependencies,installCloudDiscoveryDependencies} from './lifecycle-backup.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';
import {rejectPartialOriginalImport} from './original-recovery.mjs';
import {mailboxWorkCapability,validateMailboxWorkPolicy,validateMailboxWorkState} from './mailbox-work.mjs';
import {applyMailboxWorkChange} from './mailbox-work-service.mjs';
import {mailboxClockCapability,isMailboxClockCapability,validateMailboxClockPolicy,validateMailboxClockState,applyMailboxClockTransition,assertMailboxClockStep} from './mailbox-clock.mjs';
import {mailboxDeliveryCapability,isMailboxDeliveryCapability,validateMailboxDeliveryPolicy,validateMailboxDeliveryState,applyMailboxDeliveryTransition} from './mailbox-delivery.mjs';
import {cloudDiscoveryCapability,validateCloudDiscoveryPolicy,validateCloudDiscoveryState,applyCloudDiscoveryTransition} from './cloud-discovery.mjs';

import {manualRecordEvents} from './manual-record-events.mjs';
import {outreachReviewEvents,applyOutreachReview} from './outreach-review.mjs';
import {applyLocalInquiry} from './local-inquiry-intake.mjs';
import {mailboxCapability,isMailboxCapability,mailboxReviewEvents,validateMailboxPolicy,applyMailboxObservation,applyMailboxFailure,mailboxCoverageComplete} from './mailbox-intake.mjs';
export {manualRecordEvents} from './manual-record-events.mjs';
export const manualCapabilities=['shared-manual-records-v1','shared-outreach-review-v1','shared-mailbox-review-v1','shared-mailbox-work-v1','shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'];
export const manualAllowedEvents=capability=>isMailboxCapability(capability)?[...manualRecordEvents,...outreachReviewEvents,...mailboxReviewEvents]:capability==='shared-outreach-review-v1'?[...manualRecordEvents,...outreachReviewEvents]:manualRecordEvents;
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateManualBinding(b){
 check(b?.schema_version===1&&manualCapabilities.includes(b.capability)&&b.mode==='production'&&b.state_schema===1&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id].every(key),'Invalid manual-record workspace binding');
 const origin=new URL(b.origin);check(origin.protocol==='https:'&&origin.origin===b.origin&&/^evz-manual-shared-[a-z0-9-]{8,40}$/.test(b.namespace),'Invalid manual-record origin or separate namespace');
 check(Object.keys(b).sort().join(',')==='capability,deploy_id,mode,namespace,origin,run_id,schema_version,site_id,state_schema,workspace_id','Unknown manual-record binding fields');return b;
}
export function validateManualEnvelope(data,binding){
 validateManualBinding(binding.scope);const m=data.manual_source;
 check(!data.inert_source&&data?.schema_version===1&&data.config?.schema_version===1&&data.state?.schema_version===1,'Unknown manual-record format');
 check(sha(binding.manifest_sha256)&&m?.kind==='shared-manual-record-source-v1'&&m.schema_version===1&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(binding.scope),'Manual-record manifest or deployment binding changed');
 check(hash(data.config)===m.config_sha256&&data.config.shared_capability===binding.scope.capability&&data.config.mode==='production'&&data.config.run_id===binding.scope.run_id,'Manual-record configuration changed; prepare a new reviewed binding');
 check(data.state.mode===binding.scope.mode&&data.state.run_id===binding.scope.run_id,'Manual-record identity changed');
 if(isMailboxCapability(binding.scope.capability))validateMailboxPolicy(data.config.mailbox);
 else check(!data.config.mailbox,'Mailbox policy requires its separate capability');
 if([mailboxWorkCapability,'shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(binding.scope.capability)){validateMailboxWorkPolicy(data.config.mailbox_work);validateMailboxWorkState(data.state,data.config);}
 else check(!data.config.mailbox_work,'Worker policy requires its separate capability');
 if(isMailboxClockCapability(binding.scope.capability)){validateMailboxClockPolicy(data.config.mailbox_clock);validateMailboxClockState(data.state,data.config);const p=data.config.mailbox_clock;check(p.site_id===binding.scope.site_id&&p.deploy_id===binding.scope.deploy_id&&p.origin===binding.scope.origin,'Mailbox clock deployment differs');}
 else check(!data.config.mailbox_clock&&!data.state.mailbox_clock,'Clock state and policy require their separate capability');
 if(isMailboxDeliveryCapability(binding.scope.capability)){validateMailboxDeliveryPolicy(data.config.mailbox_delivery);validateMailboxDeliveryState(data.state,data.config);const p=data.config.mailbox_delivery;check(p.site_id===binding.scope.site_id&&p.deploy_id===binding.scope.deploy_id&&p.origin===binding.scope.origin,'Mailbox delivery deployment differs');}
 else check(!data.config.mailbox_delivery&&!data.state.mailbox_delivery,'Delivery state and policy require their separate capability');
 validateOperationsNotificationsState(data.state,data.config);
 if(binding.scope.capability===cloudDiscoveryCapability){validateCloudDiscoveryPolicy(data.config.cloud_discovery);validateCloudDiscoveryState(data.state,data.config);const p=data.config.cloud_discovery;check(p.site_id===binding.scope.site_id&&p.deploy_id===binding.scope.deploy_id&&p.origin===binding.scope.origin,'Discovery policy deployment differs');}
 else check(!data.config.cloud_discovery&&!data.state.cloud_discovery,'Discovery state and policy require their separate capability');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(data.config[flag]===false,'Manual recording cannot enable execution');
 check(data.config.runtime?.enabled===false&&data.config.operations?.enabled===false&&data.config.transcript_ai?.enabled===false&&data.config.release?.approved===false&&data.config.call_release?.approved===false,'Manual recording cannot release execution');
}
// Local preparation only. A new manifest/capability is required; an old inert binding cannot gain write authority.
export async function prepareManualWorkspace({backup,sourceConfig,scope,mailbox,mailboxWork,mailboxClock,mailboxDelivery,cloudDiscovery}){
 validateManualBinding(scope);
 if(isMailboxCapability(scope.capability))validateMailboxPolicy(mailbox);else check(mailbox===undefined,'Mailbox policy requires its separate capability');
 const inertScope={...scope,capability:'inert-shared-v1',namespace:scope.namespace.replace('evz-manual-shared-','evz-inert-shared-')};
 const packet=await prepareInertWorkspace({backup,sourceConfig,scope:inertScope}),config={...packet.envelope.config,shared_capability:scope.capability,follow_up:{...packet.envelope.config.follow_up,enabled:true}};
 if(mailbox)config.mailbox=structuredClone(mailbox);
 if([mailboxWorkCapability,'shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(scope.capability))config.mailbox_work=structuredClone(validateMailboxWorkPolicy(mailboxWork));
 else check(mailboxWork===undefined,'Worker policy requires its separate capability');
 if(isMailboxClockCapability(scope.capability))config.mailbox_clock=structuredClone(validateMailboxClockPolicy(mailboxClock));
 else check(mailboxClock===undefined,'Clock policy requires its separate capability');
 if(isMailboxDeliveryCapability(scope.capability)){
  config.mailbox_delivery=structuredClone(validateMailboxDeliveryPolicy(mailboxDelivery));
  check(sourceConfig.sender?.email===mailboxDelivery.from,'Exact source sender required for delivery preparation');
  config.sender={...config.sender,email:sourceConfig.sender.email,postal_address:sourceConfig.sender.postal_address??''};
 }
 else check(mailboxDelivery===undefined,'Delivery policy requires its separate capability');
 if(scope.capability===cloudDiscoveryCapability)config.cloud_discovery=structuredClone(validateCloudDiscoveryPolicy(cloudDiscovery));
 else check(cloudDiscovery===undefined,'Discovery policy requires its separate capability');
 const manifest={...packet.envelope.inert_source,kind:'shared-manual-record-source-v1',binding:structuredClone(scope),config_sha256:hash(config),allowed_events:[...manualAllowedEvents(scope.capability)],attestation:'Human-reported completed call; no call authorization or independent provider proof'};
 const envelope={schema_version:1,config,state:packet.envelope.state,manual_source:manifest},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)};
 validateManualEnvelope(envelope,binding);return {envelope,binding,files:packet.files};
}
export async function installManualWorkspace(store,packet,{commit=false}={}){
 const {envelope,binding,files}=packet;validateManualEnvelope(envelope,binding);
 check(hash(envelope.state)===envelope.manual_source.source_state_sha256,'Source records changed after preparation');await validateBackupDependencies(envelope.state,files);
 rejectPartialOriginalImport(envelope.state,files);
 check(hash([...files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:path.startsWith('project-originals/')?'shared-original-chunks':'offline-package-only'})))===hash(envelope.manual_source.dependencies),'Source dependencies changed after preparation');
 check(Buffer.byteLength(JSON.stringify(envelope))<=20_000_000,'Manual-record workspace exceeds the existing 20 MB store');
 if(!commit)return {dry_run:true,execution:'disabled',binding,dependencies:envelope.manual_source.dependencies};
 check(hash(store.manualBinding)===hash(binding),'Import store must match the reviewed manual binding');store.validate(envelope);
 check(!await store.store.getWithMetadata(store.key,{type:'json',consistency:'strong'}),'Manual-record destination already exists; never overwrite or reseed');
 const originals=blobProjectOriginalStore(store.store);for(const [path,bytes] of files)if(/^project-originals\/[a-f0-9]{64}\.pdf$/.test(path))await originals.put(bytes);
 await installMailboxMimeDependencies(envelope.state,files,store.store);
 await installCloudDiscoveryDependencies(envelope.state,files,store.store);
 let result;try{result=await store.store.setJSON(store.key,envelope,{onlyIfNew:true});}catch{check(hash((await store.envelope()).data)===hash(envelope),'Manual-record import outcome uncertain; inspect exact manifest');return {execution:'disabled',reconciled:true};}
 check(result?.modified===true,'Manual-record destination changed; inspect before retrying');check(hash((await store.envelope()).data)===hash(envelope),'Manual-record readback changed');return {dry_run:false,execution:'disabled'};
}
export function applyManualRecord(state,event,actor,revision,now,config){
 check(['owner','friend'].includes(actor)&&manualAllowedEvents(config.shared_capability).includes(event.type),'Manual workspace permits only its declared signed records');
 check(key(event?.id)&&key(event.prospect_id)&&typeof event.at==='string'&&/Z$|[+-]\d\d:\d\d$/.test(event.at)&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=+now+60_000,'Manual event needs stable IDs and an explicit nonfuture timestamp');
 check(Object.keys(event).every(k=>['id','prospect_id','type','at','data'].includes(k)),'Manual event contains unknown fields');
 check(Number.isSafeInteger(revision),'Manual recording requires the exact current revision');
 if(['shared-outreach-review-v1',mailboxCapability,'shared-mailbox-work-v1','shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(config.shared_capability)&&outreachReviewEvents.includes(event.type))return applyOutreachReview({config,now:()=>new Date(now)},state,event,actor,revision,{shared:true});
 if(isMailboxCapability(config.shared_capability)&&mailboxReviewEvents.includes(event.type)){
  const app=new StudioLifecycle(null,()=>new Date(now));app.config=config;const oldActions=new Set(Object.keys(state.actions));
  let result;
  if(event.type.startsWith('inquiry_'))result=applyLocalInquiry(app,state,event,actor,revision,{shared:true});
  else{
   check(event.type==='conversation_claimed'||state.prospects[event.prospect_id]?.follow_up_owner===actor,'Assigned operator must review this reply');
   const fields={conversation_claimed:['reason'],reply_reviewed:['source_id','reply_sha256','outcome','focus','note'],reply_draft_saved:['source_id','reply_sha256','source_sha256','body'],reply_draft_approved:['sha256','approved','facts_checked']}[event.type];
   if(['shared-mailbox-work-v1','shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(config.shared_capability)&&event.type==='reply_draft_saved'&&Object.hasOwn(event.data??{},'attachments')){check(Array.isArray(event.data.attachments)&&event.data.attachments.length===0,'Manual edits may only remove the exact attachment bundle');fields.push('attachments');}
   check(event.data&&Object.keys(event.data).every(k=>fields.includes(k)),'Closed shared reply review fields required');
   result=app.reduceEvent(state,event,{actor,expectedRevision:revision,manualRecording:true});
  }
  for(const [id,a] of Object.entries(state.actions))if(!oldActions.has(id))a.execution_hold='Shared review only; provider execution disabled';
  return result;
 }
 check(Object.hasOwn(state.prospects,event.prospect_id),'Choose an existing manual record');
 const fields={note_added:['note'],call_logged:['call_id','outcome','performed_at','simulated','desk','note','focus','intent','callback_at','manual_attested'],call_claimed:[],follow_up_handed_off:['to'],contact_stopped:['reason']}[event.type];
 check(event.data&&typeof event.data==='object'&&!Array.isArray(event.data)&&Object.keys(event.data).every(k=>fields.includes(k)),'Manual event contains unsupported data');
 if(event.type==='call_logged')check(event.data.manual_attested===true&&event.data.desk===true&&event.data.simulated!==true&&event.data.outcome!=='skipped','Attest a completed human call; this is not call authorization or provider proof');
 const app=new StudioLifecycle(null,()=>new Date(now));app.config=config;
 const result=app.reduceEvent(state,event,{actor,expectedRevision:revision,manualRecording:true});
 if(!result.duplicate){
  for(const action of Object.values(state.actions))if(action.created_at===state.updated_at&&action.id.startsWith(event.id+'-'))action.execution_hold='Manual record only; provider execution disabled';
 }
 return {...result,execution:'disabled',external_suppression:'unverified'};
}
export function validateManualChange(before,after,{manualRecord,mailboxObservation,mailboxFailure,mailboxWork,mailboxClock,mailboxClockStep,mailboxDelivery,cloudDiscovery,operationsNotifications}={}){
 if(operationsNotifications){
  check(before.config.shared_capability===cloudDiscoveryCapability&&![manualRecord,mailboxObservation,mailboxFailure,mailboxWork,mailboxClock,mailboxClockStep,mailboxDelivery,cloudDiscovery].some(Boolean),'Exclusive typed notification transition required');
  const expected=structuredClone(before.state);applyOperationsNotificationTransition(expected,before.config,operationsNotifications);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Notification transition changed unrelated records or policy');return;
 }
 if(cloudDiscovery){
  check(before.config.shared_capability===cloudDiscoveryCapability&&![manualRecord,mailboxObservation,mailboxFailure,mailboxWork,mailboxClock,mailboxClockStep,mailboxDelivery].some(Boolean),'Exclusive typed discovery transition required');
  const expected=structuredClone(before.state);applyCloudDiscoveryTransition(expected,before.config,cloudDiscovery);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Discovery transition changed unrelated records or policy');return;
 }
 if(mailboxDelivery){
  check(isMailboxDeliveryCapability(before.config.shared_capability)&&![manualRecord,mailboxObservation,mailboxFailure,mailboxWork,mailboxClock,mailboxClockStep].some(Boolean),'Exclusive typed delivery transition required');
  const expected=structuredClone(before.state);applyMailboxDeliveryTransition(expected,before.config,mailboxDelivery);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Delivery transition changed unrelated records or policy');return;
 }
 if(mailboxClock||mailboxClockStep){
  check(isMailboxClockCapability(before.config.shared_capability)&&!manualRecord&&!mailboxWork,'Exact clock transition required');
  const expected=structuredClone(before.state);
  if(mailboxClockStep){
   check(Boolean(mailboxObservation)!==Boolean(mailboxFailure)&&mailboxClock?.type==='settle','One fenced provider observation or failure required');
   assertMailboxClockStep(expected,before.config,mailboxClockStep,mailboxClock.at);
   check(mailboxClock.input.tick_id===mailboxClockStep.tick_id&&mailboxClock.input.fence===mailboxClockStep.fence&&mailboxClock.input.step===mailboxClockStep.step,'Clock settlement differs from provider step');
   const outcome=mailboxObservation?applyMailboxObservation(expected,before.config,mailboxObservation):applyMailboxFailure(expected,before.config,mailboxFailure);
   check(mailboxClock.input.outcome===(outcome.held?'Held':mailboxCoverageComplete(expected)?'Caught up':'Continue'),'Clock settlement disagrees with mailbox result');
  }else check(!mailboxObservation&&!mailboxFailure&&mailboxClock.type!=='settle','Clock settlement needs provider evidence');
  applyMailboxClockTransition(expected,before.config,mailboxClock);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Clock changed unrelated workspace data');return;
 }
 check([manualRecord,mailboxObservation,mailboxFailure,mailboxWork].filter(Boolean).length===1,'One exclusive manual workspace transition required');
 if(mailboxWork){
  check([mailboxWorkCapability,'shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(before.config.shared_capability),'Worker transitions require their separate capability');
  const expected=structuredClone(before.state);applyMailboxWorkChange(expected,before.config,mailboxWork);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Worker transition changed unrelated records or policy');return;
 }
 if(mailboxFailure){
  check(!manualRecord&&!mailboxObservation,'Exclusive mailbox failure evidence required');const expected=structuredClone(before.state);applyMailboxFailure(expected,before.config,mailboxFailure);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Mailbox failure changed unrelated records');return;
 }
 if(mailboxObservation){
  check(!manualRecord&&isMailboxCapability(before.config.shared_capability),'Mailbox observations require their separate provider boundary');
  const expected=structuredClone(before.state);applyMailboxObservation(expected,before.config,mailboxObservation);
  check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Mailbox edit changed unrelated records or configuration');return;
 }
 check(manualRecord,'Manual storage rejects worker and provider mutations');
 const expected=structuredClone(before.state);applyManualRecord(expected,manualRecord.event,manualRecord.actor,manualRecord.revision,new Date(after.state.updated_at),before.config);
 check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Manual edit changed protected records, history, budgets, configuration or execution evidence');
}
export async function exportManualBackup(app,localDependencies,output){
 check(app.store?.manualBinding,'Use an explicitly bound manual-record workspace');const {state,files}=await hostedManualBackupInventory(app,localDependencies);
 return writePortableLifecycleBackup(state,files,output,app.now().toISOString());
}
