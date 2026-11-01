import {StudioLifecycle,check,hash,initialConfig} from './lifecycle.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {localInquiryEvents} from './local-inquiry-intake.mjs';
import {localDeliveryEvents} from './local-delivery-gates.mjs';

export const stagingInquiryExample=at=>({id:'staging-example-inquiry',prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:'STUDIO TEST Pine Roofing',classification:'inquiry',reply:fixtureReply('staging-inquiry-source','staging-inquiry-thread','pine@example.invalid','Fictional staging exercise: please discuss a website using our blue brand colors. No real message was received.')}});

export const stagingRecordEvents=Object.freeze([...localInquiryEvents,...localDeliveryEvents,
 'note_added','call_claimed','follow_up_handed_off','contact_stopped','reply_reviewed',
 'discovery_confirmed','preview_recorded','proposal_approved','agreement_recorded','invoice_recorded','payment_recorded',
 'onboarding_completed','delivery_task_updated','delivery_submitted','revision_requested','acceptance_recorded','handover_completed','support_opened','support_closed']);

function replay(state,config,transition,at){
 const {event,actor,revision}=transition;
 check(['owner','friend'].includes(actor)&&stagingRecordEvents.includes(event?.type),'Signed fictional staging recording only');
 check(Number.isSafeInteger(revision),'Staging requires an exact revision');
 check(/^[a-zA-Z0-9_-]{1,100}$/.test(event.id??'')&&/^[a-zA-Z0-9_-]{1,100}$/.test(event.prospect_id??''),'Stable staging event IDs required');
 check(!['__proto__','constructor','prototype'].includes(event.id)&&!['__proto__','constructor','prototype'].includes(event.prospect_id),'Unsafe staging identifier');
 check(Object.keys(event).every(k=>['id','prospect_id','type','at','data'].includes(k)),'Unsupported event fields');
 check(typeof event.at==='string'&&/Z$|[+-]\d\d:\d\d$/.test(event.at)&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=+at+60000,'Explicit nonfuture occurrence timestamp required');
 const local=new StudioLifecycle(null,()=>new Date(at));local.config=config;
 // Reuse the local-only fictional reducer in memory. No local files, provider
 // caller or hosted authority is attached to it; the store publishes via CAS.
 return local.reduceEvent(state,event,{actor,expectedRevision:revision});
}

export class StagingRecordStore extends ConditionalLifecycleStore {
 validate(data){
  super.validate(data);
  check(data.config.staging_recording==='fictional-records-v1','Explicit staging record configuration required');
  check(data.config.runtime?.enabled!==true&&data.config.operations?.enabled!==true&&data.config.calls_enabled!==true,'Staging execution remains disabled');
  for(const r of Object.values(data.state.prospects))check(/^STUDIO TEST\s/.test(r.name??'')&&(!r.contact?.email||r.contact.email.endsWith('@example.invalid')),'Staging accepts labelled fictional contacts only');
 }
 async change(fn,options={}){
  check(options.stagingRecord,'Staging rejects untyped changes');
  const transition=structuredClone(options.stagingRecord);
  return super.change(async(state,config)=>{
   const at=this.now(),before=structuredClone(state);
   const expected=structuredClone(state),frozenConfig=structuredClone(config);
   replay(expected,frozenConfig,transition,at);
   const result=await fn(state,config,at);
   check(hash(state)===hash(expected)&&hash(config)===hash(frozenConfig),'Staging changed protected records or configuration');
   // Validate current authority again after any awaited callback, before CAS.
   // Occurrence timestamps remain evidence, never the allowance clock.
   replay(before,structuredClone(frozenConfig),transition,this.now());
   return result;
  },{eventId:transition.event.id,eventFingerprint:hash({event:transition.event,actor:transition.actor})});
 }
 async record(event,actor,revision){
  const transition=structuredClone({event,actor,revision});
  return this.change((state,config,at)=>replay(state,config,transition,at),{stagingRecord:transition});
 }
}

export async function stagingRecordApp(raw,now){
 const store=new StagingRecordStore(raw,{maxBytes:2_000_000,now});
 const app=await StudioLifecycle.fromStore({store,now});
 app.apply=(event,{actor='owner',expectedRevision}={})=>store.record(event,actor,expectedRevision);
 return app;
}

export async function openStagingRecords(raw,now){
 const store=new StagingRecordStore(raw,{maxBytes:2_000_000,now});
 if(!await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'})){
  const config={...structuredClone(initialConfig),staging_recording:'fictional-records-v1',run_id:'staging-fictional-records'};
  const state={schema_version:1,run_id:config.run_id,mode:'controlled',revision:0,updated_at:now().toISOString(),prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]};
  const local=new StudioLifecycle(null,now);local.config=config;
  local.reduceEvent(state,fixtureProspect('staging-example',state.updated_at,'STUDIO TEST Staging example'),{actor:'controlled-fixture'});
  await store.initialize(config,state);
 }
 return stagingRecordApp(raw,now);
}
