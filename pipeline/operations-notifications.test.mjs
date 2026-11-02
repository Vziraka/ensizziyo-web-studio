import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from './lifecycle.mjs';
import {prepareOperationsNotifications,operationsDailySummary,operationsNotificationView,applyOperationsNotificationTransition} from './operations-notifications.mjs';
const config={shared_capability:'shared-operations-desk-v1',mailbox:{account:'fixture@example.invalid'},cloud_discovery:{expires_at:'2026-12-01T00:00:00.000Z'}};
const initial=()=>({revision:1,updated_at:'2026-01-01T00:00:00.000Z',prospects:{},actions:{},events:{}});
const at='2026-11-01T23:00:00.000Z';
const intent=(id,kind='reply',when=at)=>({id,status:'Verified',claimed_at:when,package:{kind:kind==='reply'?'reply':'outreach',owner:'owner',project_id:id,source:{kind,company_id:'company-'+id,timezone:'America/New_York',draft_sha256:'draft-'+id}},receipt:{message_id:'sent-'+id,sent_at:when}});

test('18 Eastern is seven days including both DST offsets, immutable per day and role, and reports lateness',()=>{
 for(const [before,due]of [['2026-03-08T21:59:59.000Z','2026-03-08T22:00:00.000Z'],['2026-11-01T22:59:59.000Z','2026-11-01T23:00:00.000Z']]){
  const s=initial();assert.equal(prepareOperationsNotifications(s,config,before),false);assert.equal(prepareOperationsNotifications(s,config,due),true);assert.equal(Object.keys(s.team_notifications.messages).length,2);assert.ok(Object.values(s.team_notifications.messages).every(m=>m.due_at===due&&m.late_minutes===0));const saved=structuredClone(s);assert.equal(prepareOperationsNotifications(s,config,new Date(Date.parse(due)+60000)),false);assert.deepEqual(s,saved);
 }
 const s=initial();prepareOperationsNotifications(s,config,'2026-11-01T23:17:00.000Z');assert.equal(s.team_notifications.messages['ops-digest-2026-11-01-owner'].late_minutes,17);
});

test('source receipts count all verified sends once, companies separately, actual calls and incoming source IDs',()=>{
 const s=initial(),new1=intent('n','new-business'),new2=intent('n2','new-business');new2.package.source.company_id=new1.package.source.company_id;
 s.mailbox_delivery={intents:{new1,new2,follow:intent('f','follow-up'),reply:intent('r'),duplicate:{...intent('r'),id:'duplicate'},uncertain:{...intent('u'),status:'Uncertain',receipt:null},held:{...intent('h'),status:'Held',receipt:null},old:intent('old','reply','2026-10-31T23:00:00.000Z')}};
 s.prospects.p={id:'p',calls:{one:{performed_at:at},undo:{performed_at:at,undone:true},sim:{performed_at:at,simulated:true}},reply:{kind:'reply',source_id:'second',at},reply_history:[{kind:'reply',source_id:'first',at},{kind:'reply',source_id:'second',at}]};
 s.events.e={type:'reply_received',at,data:{kind:'reply',source_id:'first'}};s.inquiry_intake={sources:{third:{classification:'inquiry',source:{kind:'reply',source_id:'third',received_at:at}},auto:{classification:'automatic_reply',source:{kind:'reply',source_id:'auto',received_at:at}}}};
 const result=operationsDailySummary(s,config,at);assert.equal(result.sender_verified,4);assert.equal(result.new_businesses,1);assert.equal(result.follow_ups,1);assert.equal(result.reply_sends,1);assert.equal(result.uncertain,2);assert.equal(result.calls,1);assert.equal(result.incoming_replies,3);assert.deepEqual(result.incoming_reply_source_ids,['first','second','third']);assert.equal(result.shortfall,99);
});

test('non-inquiry leaves attention counts without inflating replies or erasing historical reply evidence',()=>{
 const s=initial();s.inquiry_intake={sources:{internal:{classification:'uncertain',status:'Identity review',source:{kind:'reply',source_id:'internal',received_at:at}},other:{classification:'uncertain',status:'Identity review',source:{kind:'reply',source_id:'other',received_at:at}}}};s.prospects.p={id:'p',stage:'Reply review',follow_up_owner:'owner',reply:{kind:'reply',source_id:'real',at},reply_history:[{kind:'decline',source_id:'earlier',at}]};s.events.old={type:'reply_received',at,data:{kind:'reply',source_id:'historical'}};s.mailbox_delivery={intents:{uncertain:{...intent('u'),status:'Uncertain',receipt:null}}};
 const before=operationsDailySummary(s,config,at);assert.equal(before.unclassified_incoming,2);assert.equal(before.incoming_replies,3);s.inquiry_intake.sources.internal.classification='non_inquiry';s.inquiry_intake.sources.internal.status='Excluded';const after=operationsDailySummary(s,config,at);assert.equal(after.unclassified_incoming,1);assert.deepEqual(after.unclassified_source_ids,['other']);assert.equal(after.incoming_replies,3);assert.deepEqual(after.incoming_reply_source_ids,before.incoming_reply_source_ids);assert.equal(after.uncertain,1);assert(operationsNotificationView(s,config,at).active_sources.some(x=>x.source_id.startsWith('reply:p:real:')));assert(operationsNotificationView(s,config,at).active_sources.some(x=>x.source_id==='delivery:u'));
});

test('incidents stay stable across timestamps, resolve and reassign without losing history, and recur with a new ID',()=>{
 const s=initial();s.mailbox_failure={operation:'history',reason:'Provider unavailable',at};const early='2026-11-01T20:00:00.000Z';prepareOperationsNotifications(s,config,early);const id=Object.keys(s.team_notifications.messages)[0];s.mailbox_failure.at=early;assert.equal(prepareOperationsNotifications(s,config,'2026-11-01T20:01:00.000Z'),false);
 delete s.mailbox_failure;prepareOperationsNotifications(s,config,'2026-11-01T20:02:00.000Z');assert.equal(s.team_notifications.messages[id].status,'Resolved or reassigned before delivery');s.mailbox_failure={operation:'history',reason:'Provider unavailable'};prepareOperationsNotifications(s,config,'2026-11-01T20:03:00.000Z');assert.equal(Object.keys(s.team_notifications.messages).length,4);
 s.prospects.p={id:'p',name:'PRIVATE BUSINESS',follow_up_owner:'owner',stage:'Reply review',reply:{kind:'reply',source_id:'r',at}};prepareOperationsNotifications(s,config,'2026-11-01T20:04:00.000Z');const old=Object.values(s.team_notifications.messages).find(m=>m.project_id==='p');s.prospects.p.follow_up_owner='friend';prepareOperationsNotifications(s,config,'2026-11-01T20:05:00.000Z');assert.equal(old.status,'Resolved or reassigned before delivery');assert.ok(Object.values(s.team_notifications.messages).some(m=>m.project_id==='p'&&m.recipient_role==='friend'));assert.ok(Object.values(s.team_notifications.messages).every(m=>!m.body.includes('PRIVATE BUSINESS')));
});

test('old profiles and ordinary paused discovery remain untouched; ledger full holds do not throw or discard legacy history',()=>{
 const s=initial();s.team_notifications={messages:{legacy:{id:'digest-old',body:'Existing 9am record'}},active:{legacy:'digest-old'}};const before=structuredClone(s);assert.equal(prepareOperationsNotifications(s,{...config,shared_capability:'shared-mailbox-delivery-v1'},at),false);assert.deepEqual(s,before);
 const quiet=initial();quiet.cloud_discovery={paused:true,tasks:{},allowances:{},allowance_id:null};assert.equal(prepareOperationsNotifications(quiet,config,'2026-11-01T20:00:00.000Z'),false);
 for(let n=1;n<500;n++)s.team_notifications.messages['legacy'+n]={id:'legacy'+n};s.mailbox_failure={reason:'Failure'};const history=structuredClone(s.team_notifications.messages);prepareOperationsNotifications(s,config,at);assert.deepEqual(s.team_notifications.messages,history);assert.match(s.team_notifications.operations_hold,/capacity/);assert.equal(operationsNotificationView(s,config,at).active_incidents,2);assert.equal(operationsNotificationView(s,config,at).unsaved_alerts,2);assert.equal(operationsNotificationView(s,config,at).active_sources.length,2);assert.deepEqual(s.team_notifications.active,before.team_notifications.active);assert.equal(prepareOperationsNotifications(s,config,at),false);
});

test('typed health observation binds account/policy, has no worker authority, and recovery resolves status incident',()=>{
 const s=initial(),time='2026-11-01T20:00:00.000Z',tr={type:'health',actor:'notification',at:time,input:{revision:s.revision,status:'Disconnected',account:config.mailbox.account,mailbox_policy_sha256:hash(config.mailbox)}};
 assert.throws(()=>applyOperationsNotificationTransition(s,config,{...tr,actor:'researcher'}));assert.throws(()=>applyOperationsNotificationTransition(s,config,{...tr,input:{...tr.input,account:'other@example.invalid'}}));assert.equal(s.revision,1);
 applyOperationsNotificationTransition(s,config,tr);assert.equal(s.team_notifications,undefined);prepareOperationsNotifications(s,config,time);assert.equal(s.revision,2);assert.equal(Object.keys(s.team_notifications.operations_active).length,2);const old=structuredClone(s.team_notifications.messages);applyOperationsNotificationTransition(s,config,{...tr,at:'2026-11-01T20:01:00.000Z',input:{...tr.input,revision:2}});assert.deepEqual(s.team_notifications.messages,old);
 applyOperationsNotificationTransition(s,config,{...tr,at:'2026-11-01T20:02:00.000Z',input:{...tr.input,revision:3,status:'Connected'}});prepareOperationsNotifications(s,config,'2026-11-01T20:02:00.000Z');assert.equal(Object.keys(s.team_notifications.operations_active).length,0);assert.equal(s.revision,4);
 const unchanged=applyOperationsNotificationTransition(s,config,{type:'prepare',actor:'friend',at:'2026-11-01T20:03:00.000Z',input:{revision:4}});assert.equal(unchanged.changed,false);assert.equal(s.revision,4);
});

test('callbacks and three-weekday cadence remain distinct with an overlapping business counted once',()=>{
 const s=initial();s.prospects.p={id:'p',follow_up_owner:'friend',calls:{},stage:'Callback'};s.actions.callback={id:'callback',type:'callback_task',status:'Queued',prospect_id:'p',payload:{due_at:'2026-11-01T15:00:00.000Z'}};
 const first=intent('p','new-business','2026-10-26T16:00:00.000Z');s.mailbox_delivery={intents:{first}};const summary=operationsDailySummary(s,config,at);assert.equal(summary.due_callbacks,1);assert.equal(summary.cadence_calls,1);assert.equal(summary.due_call_businesses,1);
 prepareOperationsNotifications(s,config,'2026-11-01T20:00:00.000Z');assert.equal(Object.values(s.team_notifications.messages)[0].recipient_role,'friend');
});


test('pure projection changes only the ledger and alerts explicit discovery holds and reserve without granting delivery',()=>{
 const s=initial();s.cloud_discovery={paused:true,allowance_id:'observed',allowances:{observed:{remaining_percent:17,expires_at:'2026-11-02T00:00:00.000Z'}},tasks:{held:{id:'held',status:'Held',assigned_to:'friend'}}};s.mailbox_clock={paused:false,tick:{id:'tick',status:'Held'}};const before=structuredClone(s);prepareOperationsNotifications(s,config,'2026-11-01T20:00:00.000Z');const {team_notifications,...rest}=s;assert.deepEqual(rest,before);assert.equal(Object.keys(team_notifications.messages).length,5);const view=operationsNotificationView(s,config,at);assert.equal(view.delivery_enabled,false);assert.equal(view.unsaved_alerts,0);assert.ok(Object.values(team_notifications.messages).every(m=>!m.delivery));
});

test('human stop/decline replies count once while automatic responses and simulation do not',()=>{
 const s=initial();s.prospects.p={reply_history:[{kind:'decline',source_id:'human',at},{kind:'out_of_office',source_id:'auto',at}],reply:{kind:'do_not_contact',source_id:'stop',at}};const result=operationsDailySummary(s,config,at);assert.equal(result.incoming_replies,2);assert.deepEqual(result.incoming_reply_source_ids,['human','stop']);
});


test('unclassified incoming sources remain visible separately without inventing human classification',()=>{
 const s=initial();s.inquiry_intake={sources:{one:{classification:'uncertain',source:{kind:'reply',source_id:'unknown',received_at:at}},two:{classification:'newsletter',source:{kind:'reply',source_id:'news',received_at:at}},three:{classification:'uncertain',source:{kind:'reply',source_id:'prior',received_at:'2026-10-31T23:00:00.000Z'}}}};
 const summary=operationsDailySummary(s,config,at);assert.equal(summary.incoming_replies,0);assert.equal(summary.unclassified_incoming,1);assert.deepEqual(summary.unclassified_source_ids,['unknown']);prepareOperationsNotifications(s,config,at);assert.match(s.team_notifications.messages['ops-digest-2026-11-01-owner'].body,/unclassified incoming: 1/);
});


test('typed prepare validates authority and revision but leaves ledger growth to the canonical post-validation projection',()=>{
 const s=initial(),before=structuredClone(s);const result=applyOperationsNotificationTransition(s,config,{type:'prepare',actor:'owner',at,input:{revision:1}});assert.equal(result.changed,false);assert.deepEqual(s,before);assert.throws(()=>applyOperationsNotificationTransition(s,config,{type:'prepare',actor:'researcher',at,input:{revision:1}}));assert.throws(()=>applyOperationsNotificationTransition(s,config,{type:'prepare',actor:'owner',at,input:{revision:0}}));
});

test('migration-day legacy receipts survive alongside exact reply sends without double counting',()=>{
 const s=initial();s.outreach_delivery={intents:{old:{id:'old',kind:'new-business',company_id:'old-company',project_id:'old',status:'Verified',receipt:{message_id:'legacy-send',sent_at:at}},unknown:{id:'unknown',kind:'follow-up',status:'Uncertain'}}};const duplicate=intent('copy','new-business');duplicate.receipt.message_id='legacy-send';duplicate.package.source.company_id='old-company';s.mailbox_delivery={intents:{duplicate,reply:intent('reply')}};s.prospects.p={calls:{skip:{outcome:'skipped',performed_at:at},real:{outcome:'no_answer',performed_at:at}}};const result=operationsDailySummary(s,config,at);assert.equal(result.sender_verified,2);assert.equal(result.new_businesses,1);assert.equal(result.reply_sends,1);assert.equal(result.uncertain,1);assert.equal(result.calls,1);
});

test('same-day overdue approvals remain scheduled while stopped or source-changed future drafts do not',()=>{
 const s=initial();const r={id:'p',company_id:'company',name:'Private name',stage:'Ready to contact',follow_up_owner:'owner',contact:{verified:true,email:'private@example.invalid'},qualification:{verdict:'Research-qualified',independent_review:'Accepted'},call_prep:{observations:['saved']},calls:{},attempts:[],cold_paused:false};s.prospects.p=r;
 const evidence={id:r.id,company_id:r.company_id,name:r.name,stage:r.stage,contact:r.contact,qualification:r.qualification,call_prep:r.call_prep,owner:r.follow_up_owner,calls:r.calls,attempts:r.attempts,reply:null,restriction:null,cold_paused:r.cold_paused};s.outreach_review={paused:false,drafts:{p:{project_id:'p',sha256:'draft',source_sha256:hash(evidence),kind:'new-business',lane:'email-first',timezone:'America/New_York',schedule:{day:'2026-11-01',at:'2026-11-01T22:00:00.000Z'}}}};
 assert.equal(operationsDailySummary(s,config,at).still_scheduled,1);s.outreach_review.drafts.p.schedule.at='2026-11-01T23:30:00.000Z';r.restriction='do_not_contact';assert.equal(operationsDailySummary(s,config,at).still_scheduled,0);delete r.restriction;r.call_prep.observations.push('changed');assert.equal(operationsDailySummary(s,config,at).still_scheduled,0);
});


test('legacy global provider holds and runtime failures notify both operators with safe live summaries',()=>{
 const s=initial();s.operations={holds:{provider:'PRIVATE detailed email fixture@example.invalid'}};s.runtime={last_error:'PRIVATE call note'};prepareOperationsNotifications(s,config,'2026-11-01T20:00:00.000Z');const view=operationsNotificationView(s,config,at);assert.equal(view.active_sources.length,4);assert.deepEqual(new Set(view.active_sources.map(i=>i.recipient_role)),new Set(['owner','friend']));assert.ok(view.active_sources.every(i=>i.summary&&!i.summary.includes('PRIVATE')&&!i.summary.includes('@')));
});
