import {applyRequestedInformationTransition,requestedInformationSource} from './requested-information.mjs';
import {prepareOperationsNotifications} from './operations-notifications.mjs';
import {validateProjectEnvelope,validateProjectChange} from './shared-project-continuation.mjs';
import {validateDispatchEnvelope,validateDispatchChange,validateDispatchOptions,dispatchHasOriginals,operationsCalendarCapability} from './shared-internal-dispatch.mjs';
import {check,hash} from './lifecycle.mjs';
import {validateInertEnvelope,validateInertChange} from './inert-shared-workspace.mjs';
import {validateManualEnvelope,validateManualChange} from './shared-manual-records.mjs';
import {validateEmailTaskEnvelope,validateEmailTaskChange} from './shared-email-draft-tasks.mjs';
import {emailDependencyContract,validateEmailDependencyContract} from './email-dependency-contract.mjs';
import {assertCloudDiscoveryTransitionLive,cloudDiscoveryCapability} from './cloud-discovery.mjs';
import {cloudDiscoveryArtifactStore} from './cloud-discovery-artifacts.mjs';
import {assertMailboxDeliveryTransitionLive} from './mailbox-delivery.mjs';
import {assertMailboxClockStep,isMailboxClockCapability} from './mailbox-clock.mjs';

// Callbacks must reserve local state only: a conflict never reruns a callback or an external effect.
export class ConditionalLifecycleStore {
  constructor(store,{key='workspace',maxBytes=20_000_000,inertBinding=null,manualBinding=null,projectBinding=null,dispatchBinding=null,emailTaskBinding=null,originalsEnvironment=null,now=()=>new Date()}={}){this.store=store;this.key=key;this.maxBytes=maxBytes;this.inertBinding=inertBinding;this.manualBinding=manualBinding;this.projectBinding=projectBinding;this.dispatchBinding=dispatchBinding;this.emailTaskBinding=emailTaskBinding;this.originalsEnvironment=originalsEnvironment;this.now=now;check([inertBinding,manualBinding,projectBinding,dispatchBinding,emailTaskBinding].filter(Boolean).length<=1,'Choose one shared capability');check((!dispatchHasOriginals(dispatchBinding?.scope.capability)&&!emailTaskBinding)||key==='workspace','Shared originals and tasks require the actual workspace authority key');}
  async initialize(config,state){
    const data={schema_version:1,config,state};this.validate(data);
    const result=await this.store.setJSON(this.key,data,{onlyIfNew:true});
    check(typeof result?.modified==='boolean','Conditional creation result is unavailable');
    return this.envelope();
  }
  validate(data){
    check(data?.schema_version===1&&data.config?.schema_version===1&&data.state?.schema_version===1,'Unknown shared workspace format');
    check(data.state.run_id===data.config.run_id&&data.state.mode===data.config.mode,'Shared state belongs to another run or mode');
    if(this.emailTaskBinding)validateEmailTaskEnvelope(data,this.emailTaskBinding);
    else if(this.inertBinding)validateInertEnvelope(data,this.inertBinding);
    else if(this.manualBinding)validateManualEnvelope(data,this.manualBinding);
    else if(this.projectBinding)validateProjectEnvelope(data,this.projectBinding);
    else if(this.dispatchBinding)validateDispatchEnvelope(data,this.dispatchBinding);
    else check(!data.email_task_source&&!data.config.email_task_proof&&!data.dispatch_source&&!data.project_source&&!data.manual_source&&!data.inert_source&&data.config.mode==='controlled'&&data.config.outreach_enabled===false&&data.config.research_enabled===false&&data.config.connector_writes_enabled===false&&data.config.transcript_ai?.enabled===false&&Object.values(data.state.prospects).every(r=>r.controlled===true),'Shared preview accepts execution-disabled fictional records only');
    check(Buffer.byteLength(JSON.stringify(data))<=this.maxBytes,'Shared workspace size limit reached; archive closed records');
  }
  async envelope(){
    let entry;try{entry=await this.store.getWithMetadata(this.key,{type:'json',consistency:'strong'});}catch{const error=Error('Shared storage read is unavailable');error.code='STATE_UNAVAILABLE';throw error;}
    check(entry&&typeof entry.etag==='string'&&entry.etag.length>0,'Shared workspace is unavailable');this.validate(entry.data);
    return {data:structuredClone(entry.data),etag:entry.etag};
  }
  async config(){return (await this.envelope()).data.config;}
  async snapshot(){return (await this.envelope()).data.state;}
  async change(fn,options={}){
    const {eventId,eventFingerprint}=options;
    const {data,etag}=await this.envelope(),before=JSON.stringify(data);
    if(options.configFingerprint)check(hash(data.config)===options.configFingerprint,'Incoming configuration changed during read; no cursor or effects committed');
    if(this.emailTaskBinding)check(options.emailTask,'Fictional task storage requires a typed task transition');
    if(this.inertBinding)check(options.inertNote,'Inert storage rejects worker and provider mutations');
    if(this.manualBinding)check(options.manualRecord||['shared-mailbox-review-v1','shared-mailbox-work-v1','shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(this.manualBinding.scope.capability)&&(options.mailboxObservation||options.mailboxFailure)||['shared-mailbox-work-v1','shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(this.manualBinding.scope.capability)&&options.mailboxWork||isMailboxClockCapability(this.manualBinding.scope.capability)&&options.mailboxClock||['shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(this.manualBinding.scope.capability)&&options.mailboxDelivery||this.manualBinding.scope.capability===cloudDiscoveryCapability&&options.cloudDiscovery||this.manualBinding.scope.capability===cloudDiscoveryCapability&&(options.operationsNotifications||options.requestedInformation),'Manual storage rejects worker and provider mutations');
    if(this.projectBinding)check(options.projectResearch&&this.projectBinding.scope.capability==='shared-known-identity-research-v1'||options.projectRecord||options.projectAuthoring||options.projectReconcile||options.projectGeneration&&this.projectBinding.scope.capability==='shared-refinement-generation-v1','Shared project storage rejects untyped worker and provider mutations');
    if(this.dispatchBinding)validateDispatchOptions(this.dispatchBinding.scope.capability,options);
    const result=await fn(data.state,data.config);this.validate(data);
    // Mail callers finish their witness inside the callback; bind it to the untouched pre-state.
    const dependencyBinding=this.emailTaskBinding??this.dispatchBinding;
    const dependencyBefore=this.emailTaskBinding||this.dispatchBinding&&data.config.internal_dispatch?.email_draft_tasks?JSON.parse(before):null;
    const dependency=dependencyBefore?emailDependencyContract(dependencyBefore,options,dependencyBinding,etag):null;
    if(dependency)validateEmailDependencyContract(dependency,dependencyBefore,data,options,dependencyBinding,etag);
    if(this.emailTaskBinding)await validateEmailTaskChange(JSON.parse(before),data,options,this.emailTaskBinding,this.now,this.store);
    if(this.inertBinding)validateInertChange(JSON.parse(before).state,data.state,options);
    if(this.manualBinding)validateManualChange(JSON.parse(before),data,options);
    if(options.cloudDiscovery){
      const tr=options.cloudDiscovery,task=JSON.parse(before).state.cloud_discovery?.tasks[tr.input.id],artifacts=cloudDiscoveryArtifactStore(this.store);
      const guard=async()=>check(options.cloudDiscoveryDeadline===undefined||+this.now()<options.cloudDiscoveryDeadline,'Discovery invocation expired during artifact verification');
      const verify=async(ref,payload)=>check(hash(await artifacts.get(ref,{guard}))===hash(payload),'Discovery witness differs from stored immutable artifact');
      if(['submit','review'].includes(tr.type))await verify(tr.input.artifact,tr.input.payload);
      if(['review','import'].includes(tr.type))await verify(task.submission.artifact,tr.input.submission);
      if(tr.type==='import')await verify(task.review.artifact,tr.input.review);
    }
    if(this.projectBinding)await validateProjectChange(JSON.parse(before),data,options,this.store);
    if(this.dispatchBinding)await validateDispatchChange(JSON.parse(before),data,options,this.store,{binding:this.dispatchBinding,env:this.originalsEnvironment,now:this.now,calendarGrant:this.calendarGrant,mailGrant:this.mailGrant,incomingGrant:this.incomingGrant});
    if(options.projectOriginal)check(+this.now()<options.projectOriginal.http_deadline,'Original transition deadline expired before CAS');
    if(options.projectCalendar){check(options.calendarSignal instanceof AbortSignal,'Calendar request signal required');if(options.projectCalendar.type!=='hold'){check(!options.calendarSignal.aborted,'Calendar request interrupted before CAS');check(+this.now()<options.projectCalendar.deadline,'Calendar transition deadline expired before CAS');}}
    if(options.projectMail){check(options.mailSignal instanceof AbortSignal&&!options.mailSignal.aborted,'Mail request interrupted before CAS');check(+this.now()<options.projectMail.deadline,'Mail transition deadline expired before CAS');}
    if(this.dispatchBinding?.scope.capability==='shared-operations-pdf-mail-v1'&&options.dispatchTransition?.kind==='incoming'){const t=JSON.parse(before).state.operations.internal_dispatch.ticks[options.dispatchTransition.tick_id];check(options.dispatchSignal instanceof AbortSignal&&!options.dispatchSignal.aborted&&+this.now()<Date.parse(t.deadline),'Incoming transition interrupted or expired before CAS');}
    if(this.manualBinding?.scope.capability===cloudDiscoveryCapability){
      // Trusted projection runs only after validating the caller's complete mutation.
      const prior=data.state.team_notifications===undefined?undefined:structuredClone(data.state.team_notifications),revision=data.state.revision,updated=data.state.updated_at;
      const projectionAt=this.now().toISOString();
      if(prepareOperationsNotifications(data.state,data.config,projectionAt)){
        if(revision===JSON.parse(before).state.revision){data.state.revision++;data.state.updated_at=projectionAt;}
        if(Buffer.byteLength(JSON.stringify(data))>this.maxBytes){
          if(prior===undefined)delete data.state.team_notifications;else data.state.team_notifications=prior;
          data.state.revision=revision;data.state.updated_at=updated;
          // The underlying failure remains canonical even if there is no room for a notification copy.
          const held=structuredClone(prior??{messages:{},active:{}});held.operations_hold='Notification history cannot fit; current incidents remain visible from original operational evidence.';
          data.state.team_notifications=held;
          if(Buffer.byteLength(JSON.stringify(data))>this.maxBytes){if(prior===undefined)delete data.state.team_notifications;else data.state.team_notifications=prior;}
          else if(revision===JSON.parse(before).state.revision){data.state.revision++;data.state.updated_at=projectionAt;}
        }
        this.validate(data);
      }
    }
    if(JSON.stringify(data)===before)return result;
    if(options.mailboxWork?.type==='adopt'){const prior=JSON.parse(before).state,task=prior.email_draft_tasks?.[options.mailboxWork.input.id];if(task?.kind==='requested_information_draft'&&task.status!=='Adopted'){check(+this.now()<options.mailboxWorkDeadline,'Requested-information adoption deadline expired');requestedInformationSource(prior,data.config,task.project_id,this.now().toISOString());}}
    if(options.requestedInformation){check(+this.now()<options.requestedInformationDeadline,'Requested-information deadline expired');applyRequestedInformationTransition(JSON.parse(before).state,data.config,{...options.requestedInformation,at:this.now().toISOString()});}
    if(options.operationsNotifications){const start=Date.parse(options.operationsNotifications.at),live=+this.now();check(start<=live&&live<Math.min(options.operationsNotificationsDeadline??Infinity,start+25000),'Notification invocation expired before CAS');}
    if(options.cloudDiscovery){check(options.cloudDiscoveryDeadline===undefined||+this.now()<options.cloudDiscoveryDeadline,'Discovery invocation expired before CAS');assertCloudDiscoveryTransitionLive(JSON.parse(before).state,data.state,data.config,options.cloudDiscovery,this.now().toISOString());}
    if(options.mailboxDelivery){check(options.mailboxDeliveryDeadline===undefined||+this.now()<options.mailboxDeliveryDeadline,'Delivery invocation expired before CAS');assertMailboxDeliveryTransitionLive(JSON.parse(before).state,data.state,data.config,options.mailboxDelivery,this.now().toISOString());}
    if(options.mailboxClock){
      const live=this.now().toISOString(),transition=options.mailboxClock;
      if(options.mailboxClockStep)assertMailboxClockStep(JSON.parse(before).state,data.config,options.mailboxClockStep,live);
      else if(transition.type==='step')assertMailboxClockStep(data.state,data.config,transition.input,live);
      else if(transition.type==='claim')check(Date.parse(live)<Date.parse(data.config.mailbox_clock.expires_at)&&Date.parse(live)<Date.parse(data.state.mailbox_clock.tick.deadline_at),'Mailbox clock expired before CAS');
    }
    if(options.mailboxWork?.actor==='worker'){
      const live=+this.now(),task=data.state.email_draft_tasks?.[options.mailboxWork.input.id];
      check(Number.isFinite(live)&&live<Date.parse(data.config.mailbox_work.expires_at)&&live<Date.parse(task?.lease?.expires_at),'Worker policy or task lease expired before CAS');
    }
    let modified,uncertain=false;
    try {const written=await this.store.setJSON(this.key,data,{onlyIfMatch:etag});check(typeof written?.modified==='boolean'&&(!written.modified||typeof written.etag==='string'&&written.etag.length>0),'Conditional write result is unavailable');modified=written.modified;}
    catch {uncertain=true;}
    if(modified===true)return result;
    if(this.manualBinding?.scope.capability===cloudDiscoveryCapability||this.emailTaskBinding||options.emailTask&&this.dispatchBinding||options.mailboxWork&&['shared-mailbox-work-v1','shared-mailbox-clock-v1','shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(this.manualBinding?.scope.capability)||options.mailboxClock&&isMailboxClockCapability(this.manualBinding?.scope.capability)||options.mailboxDelivery&&['shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(this.manualBinding?.scope.capability)||options.cloudDiscovery&&this.manualBinding?.scope.capability===cloudDiscoveryCapability||options.operationsNotifications&&this.manualBinding?.scope.capability===cloudDiscoveryCapability){try{const saved=await this.envelope();if(hash(saved.data)===hash(data))return {...result,reconciled:true};}catch{}}
    if(eventId&&eventFingerprint){
      try {const current=await this.snapshot();if(current.events[eventId]?.fingerprint===eventFingerprint)return {...result,reconciled:true};}catch {}
    }
    const error=Error(uncertain?'Shared write outcome is uncertain; retain the event ID and read back before retrying.':'Shared workspace changed; refresh before approving.');
    error.code=uncertain?'STATE_UNCERTAIN':'STATE_CONFLICT';throw error;
  }
}
