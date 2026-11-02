import test from 'node:test';
import assert from 'node:assert/strict';
import {hash,initialConfig,StudioLifecycle} from './lifecycle.mjs';
import {fixtureReply} from './lifecycle-fixtures.mjs';
import {applyMailboxObservation,mailboxProfile} from './mailbox-intake.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';
import {applyLocalInquiry} from './local-inquiry-intake.mjs';
import {applyConversationRecord} from './conversation-records.mjs';
import {mailboxWorkCapability,validateMailboxWorkPolicy,validateMailboxWorkState,applyMailboxWorkTransition,mailboxWorkContext,mailboxWorkReceipt,mailboxWorkAdoption,assertMailboxWorkReplySource} from './mailbox-work.mjs';

const at='2026-11-02T14:00:00.000Z',secret='ab'.repeat(32),lease={worker_id:'worker-one',token:secret};
function fixture(){
 const c={...structuredClone(initialConfig),mode:'production',outreach_enabled:false,shared_capability:mailboxWorkCapability,mailbox:{schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'fixture-grant',after:'2026-11-01T00:00:00.000Z'},mailbox_work:{schema_version:1,worker_id:lease.worker_id,gateway_site_id:'gateway',gateway_deploy_id:'deploy',gateway_origin:'https://gateway.example.invalid',recovery_generation:'recovery-one',credential_sha256:hash('fixture-stable-credential'),max_tasks:100,max_claims_per_day:2,lease_minutes:20,expires_at:'2026-11-03T00:00:00.000Z'}};
 const s={schema_version:1,mode:'production',run_id:c.run_id,revision:0,updated_at:at,prospects:{p:{id:'p',name:'Fixture business',controlled:false,stage:'Reply review',follow_up_owner:'owner',contact:{email:'customer@example.org',verified:true},reply:fixtureReply('reply','thread','customer@example.org')}},events:{},actions:{},mailbox_sync:{policy_sha256:hash(c.mailbox),phase:'history',checked_at:at,pending:[],page:null,next_cursor:null,hold:null,held_sources:{}},email_draft_tasks:{legacy:{id:'legacy',status:'Review',result:{body:'Retain this historical result'}}}};
 const transition=(type,input,actor='worker',time=at)=>applyMailboxWorkTransition(s,c,{type,input,actor,at:time});
 const create=(id='draft',replace=null)=>transition('create',{id,project_id:'p',revision:s.revision,replace_task_id:replace,studio_asset_ids:[]},'owner');
 const claim=(id='draft',request='claim-one',token=secret)=>transition('claim',{id,request_id:request,worker_id:lease.worker_id,lease_sha256:hash(token)});
 return {s,c,transition,create,claim};
}
const result={body:'Thanks for asking. Which customer journey should we focus on?',source_ids:['reply:reply'],uncertainties:['Scope is unconfirmed.'],execution:{provider:'synthetic Work',model:'fixture',duration_ms:100,input_tokens:null,output_tokens:null}};
const submit=f=>f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:f.s.email_draft_tasks.draft.context_sha256,result});

test('production reply, one fenced lease and exact unapproved result retain legacy and protected state',()=>{
 const f=fixture(),legacy=structuredClone(f.s.email_draft_tasks.legacy),prospect=structuredClone(f.s.prospects.p);f.create();const claim=f.claim();assert.equal(claim.lease.fence,1);assert.equal(claim.lease.secret_sha256,undefined);
 const context=mailboxWorkContext(f.s,f.c,'draft',lease,at);assert.deepEqual(context.source_ids,['reply:reply']);assert.equal(context.context.project_id,'p');assert.doesNotMatch(JSON.stringify(context),new RegExp(secret));
 const revision=f.s.revision;assert.equal(f.claim().duplicate,true);assert.equal(f.s.revision,revision);assert.equal(submit(f).status,'Review');const saved=f.s.revision;assert.equal(submit(f).duplicate,true);assert.equal(f.s.revision,saved);
 assert.deepEqual(f.s.email_draft_tasks.legacy,legacy);assert.deepEqual(f.s.prospects.p,{...prospect,email_draft_task_id:'draft'});assert.deepEqual(f.s.events,{});assert.deepEqual(f.s.actions,{});
 assert.equal(mailboxWorkReceipt(f.s,f.c,'draft',lease,'2026-11-04T00:00:00.000Z').result.body,result.body);
});
test('all source and authority changes reject writes without partial mutation',()=>{
 const changes={owner:f=>f.s.prospects.p.follow_up_owner='friend',reply:f=>f.s.prospects.p.reply=fixtureReply('new','thread','customer@example.org'),stop:f=>f.s.prospects.p.restriction='stopped',draft:f=>f.s.prospects.p.reply_draft={sha256:hash('edited')},quote:f=>f.s.prospects.p.quote={scope:'Changed'},pending:f=>f.s.mailbox_sync.pending.push({id:'new'}),page:f=>f.s.mailbox_sync.page='page',failure:f=>f.s.mailbox_failure={reason:'Unavailable'},held:f=>f.s.mailbox_sync.held_sources.x={thread_id:'thread'},recovery:f=>f.c.mailbox_work.recovery_generation='recovery-two',credential:f=>f.c.mailbox_work.credential_sha256=hash('rotated'),worker:f=>f.c.mailbox_work.worker_id='other'};
 for(const [name,change]of Object.entries(changes)){const f=fixture();f.create();f.claim();change(f);const before=structuredClone(f.s);assert.throws(()=>submit(f),undefined,name);assert.deepEqual(f.s,before,name);}
});
test('ownership, mailbox catch-up and exact policy are required before creation',()=>{
 for(const change of [f=>f.s.prospects.p.follow_up_owner=null,f=>f.s.prospects.p.contact.verified=false,f=>f.s.mailbox_sync.checked_at=null,f=>f.s.mailbox_sync.phase='bootstrap',f=>f.s.mailbox_sync.next_cursor='200',f=>f.s.mailbox_sync.policy_sha256=hash('wrong'),f=>f.c.shared_capability='shared-mailbox-review-v1']){const f=fixture();change(f);const before=structuredClone(f.s);assert.throws(()=>f.create());assert.deepEqual(f.s,before);}
 const f=fixture();assert.throws(()=>f.transition('create',{id:'draft',project_id:'p',revision:0,replace_task_id:null,studio_asset_ids:[]},'friend'));assert.throws(()=>validateMailboxWorkPolicy({...f.c.mailbox_work,lease_minutes:31}));assert.throws(()=>validateMailboxWorkPolicy({...f.c.mailbox_work,max_tasks:101}));
});
test('expired leases never reclaim or write; durable receipt survives while revocation denies it',()=>{
 const f=fixture();f.create();f.claim();const later='2026-11-02T14:21:00.000Z',before=structuredClone(f.s);
 assert.throws(()=>mailboxWorkContext(f.s,f.c,'draft',lease,later),/expired/);
 assert.throws(()=>f.transition('claim',{id:'draft',request_id:'claim-two',worker_id:lease.worker_id,lease_sha256:hash('cd'.repeat(32))},'worker',later));
 assert.throws(()=>f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:f.s.email_draft_tasks.draft.context_sha256,result},'worker',later),/expired/);
 assert.deepEqual(f.s,before);assert.equal(mailboxWorkReceipt(f.s,f.c,'draft',lease,later).status,'Claimed');f.c.mailbox_work.recovery_generation='changed';assert.throws(()=>mailboxWorkReceipt(f.s,f.c,'draft',lease,later));
});
test('request reuse, duplicate tokens, budget and replacement preserve fencing and all attempts',()=>{
 const f=fixture();f.create();f.claim();f.create('next','draft');assert.throws(()=>f.claim('next','claim-one','cd'.repeat(32)),/Duplicate/);assert.throws(()=>f.claim('next','claim-two',secret),/Duplicate/);assert.equal(f.claim('next','claim-two','cd'.repeat(32)).lease.fence,2);
 f.create('third','next');const before=structuredClone(f.s);assert.throws(()=>f.claim('third','claim-three','ef'.repeat(32)),/budget/);assert.deepEqual(f.s,before);assert.equal(f.s.email_draft_tasks.draft.status,'Superseded');assert.throws(()=>submit(f));
});
test('malformed or conflicting results, foreign PDFs and secrets cannot change state',()=>{
 const bad=[{...result,approved:true},{...result,source_ids:['reply:foreign']},{...result,body:secret},{...result,attachments:[{asset_id:'foreign',version_id:'v1',sha256:hash('x')}]},{...result,execution:{...result.execution,duration_ms:-1}}];
 const f=fixture();f.create();f.claim();for(const r of bad){const before=structuredClone(f.s);assert.throws(()=>f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:f.s.email_draft_tasks.draft.context_sha256,result:r}));assert.deepEqual(f.s,before);}
 submit(f);const before=structuredClone(f.s);assert.throws(()=>f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:f.s.email_draft_tasks.draft.context_sha256,result:{...result,body:'Different second result'}}),/Conflicting/);assert.deepEqual(f.s,before);
});
test('failure and cancellation close task, never refund claim capacity or touch approvals',()=>{
 const f=fixture();f.create();f.claim();f.transition('failure',{id:'draft',worker_id:lease.worker_id,lease:secret,reason:'Source unavailable'});assert.equal(mailboxWorkReceipt(f.s,f.c,'draft',lease,at).status,'Failed');assert.throws(()=>submit(f));
 const input={id:'draft',revision:f.s.revision,reason:'Operator closes failed task'};f.transition('cancel',input,'owner');assert.equal(f.transition('cancel',input,'owner').duplicate,true);assert.equal(f.s.email_draft_tasks.draft.lease.request_id,'claim-one');assert.deepEqual(f.s.actions,{});
});
test('unrelated note updates preserve context and unknown task kinds remain unsupported',()=>{
 const f=fixture();f.create();f.claim();f.s.prospects.p.note='Private operator note';assert.doesNotMatch(JSON.stringify(mailboxWorkContext(f.s,f.c,'draft',lease,at)),/Private operator/);const before=structuredClone(f.s);assert.throws(()=>f.transition('public_discovery',{id:'draft',worker_id:lease.worker_id}));assert.deepEqual(f.s,before);
});
test('exact offered PDFs retain the existing two-file combined 20MB limit',()=>{
 function pdf(f,id,bytes){const event='approval-'+id;f.s.events[event]={id:event,actor:'owner',type:'asset_version_selected',prospect_id:'studio-assets',data:{asset_id:id,version_id:'v1'}};f.s.asset_index??={};f.s.asset_index[id]={id,name:id+'.pdf',scope:'project',project_id:'p',baseline_version:'v1',baseline_approval_event:event,versions:{v1:{id:'v1',label:'Approved version',reference:'fixture:'+id,verified_original:{reference:'fixture:'+id,mime_type:'application/pdf',sha256:hash(id),bytes}}}};return {asset_id:id,version_id:'v1',sha256:hash(id)};}
 const f=fixture(),one=pdf(f,'one',10000000),two=pdf(f,'two',10000000);f.create();f.claim();const context=mailboxWorkContext(f.s,f.c,'draft',lease,at);assert.equal(context.attachment_catalogue.items.length,2);f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:context.task.context_sha256,result:{...result,attachments:[one,two]}});assert.equal(f.s.email_draft_tasks.draft.result.attachments.length,2);
 const g=fixture(),a=pdf(g,'a',10000001),b=pdf(g,'b',10000000);g.create();g.claim();const before=structuredClone(g.s);assert.throws(()=>g.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:g.s.email_draft_tasks.draft.context_sha256,result:{...result,attachments:[a,b]}}),/20,000,000/);assert.deepEqual(g.s,before);
});
test('unsettled historical delivery fences drafting without legacy incoming route configuration',()=>{
 const f=fixture();f.s.outreach_delivery={intents:{out:{project_id:'p',status:'Uncertain'}}};assert.throws(()=>f.create(),/outgoing intent/);f.s.outreach_delivery.intents.out.status='Verified';f.create();f.claim();f.s.actions.old={id:'old',prospect_id:'p',payload:{exact_mail:true}};f.s.operations={requests:{'old-intent':{dispatch_started_at:at,status:'Uncertain'}}};assert.throws(()=>submit(f),/outgoing intent/);
});
test('retained corruption rejects context, receipt and transitions without exposing result bytes',()=>{
 const changes=[t=>t.schema_version=3,t=>delete t.schema_version,t=>t.id='wrong',t=>t.kind='public_discovery',t=>t.status='Sending',t=>t.lease.fence=0,t=>t.lease.secret_sha256='bad',t=>t.lease.expires_at='2026-11-02T15:00:00.000Z',t=>t.result.body='Tampered',t=>{t.result.body='x'.repeat(3001);t.result_sha256=hash(t.result);},t=>{t.result.attachments=[{asset_id:'a',version_id:'v',sha256:'bad'}];t.result_sha256=hash(t.result);},t=>delete t.result,t=>t.attempts=[{status:'Approved'}],t=>t.adopted_by='owner'];
 for(const change of changes){const f=fixture();f.create();f.claim();submit(f);change(f.s.email_draft_tasks.draft);const before=structuredClone(f.s);assert.throws(()=>validateMailboxWorkState(f.s,f.c));assert.throws(()=>mailboxWorkReceipt(f.s,f.c,'draft',lease,at));assert.throws(()=>mailboxWorkContext(f.s,f.c,'draft',lease,at));assert.throws(()=>submit(f));assert.deepEqual(f.s,before);}
});
test('historical generations remain inert and claim collisions cannot hide in retained tasks',()=>{
 const f=fixture();f.create();f.claim();submit(f);const legacy=structuredClone(f.s.email_draft_tasks.legacy),old=structuredClone(f.s.email_draft_tasks.draft);f.c.mailbox_work.recovery_generation='next-generation';f.c.mailbox_work.worker_id='new-worker';f.c.mailbox_work.lease_minutes=1;assert.doesNotThrow(()=>validateMailboxWorkState(f.s,f.c));assert.deepEqual(f.s.email_draft_tasks.draft,old);assert.deepEqual(f.s.email_draft_tasks.legacy,legacy);assert.throws(()=>mailboxWorkReceipt(f.s,f.c,'draft',lease,at));
 f.s.email_draft_tasks.copy={...structuredClone(old),id:'copy'};assert.throws(()=>validateMailboxWorkState(f.s,f.c),/Reused/);
});
test('signed adoption validation survives lease expiry but rejects changed material and owner',()=>{
 const f=fixture();f.create();f.claim();submit(f);const input={id:'draft',revision:f.s.revision,result_sha256:hash(result)},before=structuredClone(f.s),later='2026-11-04T00:00:00.000Z';
 const packet=mailboxWorkAdoption(f.s,f.c,input,'owner',later);assert.equal(packet.task.result.body,result.body);assert.equal(packet.context.project_id,'p');assert.deepEqual(f.s,before);assert.throws(()=>mailboxWorkAdoption(f.s,f.c,input,'friend',later),/Assigned/);f.s.prospects.p.quote={scope:'New scope'};assert.throws(()=>mailboxWorkAdoption(f.s,f.c,input,'owner',later),/changed/);
});
test('drained mailbox with a relevant unclassified source holds creation, claimed context, result and adoption',()=>{
 const now='2026-11-02T14:01:00.000Z';
 function ingest(f,{from='customer@example.org',thread='thread',newsletter=false,received=now}={}){
  Object.assign(f.s.mailbox_sync,{cursor:'100',pages:[],after:f.c.mailbox.after});
  const grant={profile:mailboxProfile,account:f.c.mailbox.account,grant_id:f.c.mailbox.grant_id,scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse(now)+3600000};
  const apply=(operation,input,value)=>applyMailboxObservation(f.s,f.c,{operation,input,value,grant,at:now,before_sha256:hash(f.s.mailbox_sync),policy_sha256:hash(f.c.mailbox)});
  apply('history',{cursor:'100',page:null},{historyId:'110',history:[{id:'110',messagesAdded:[{message:{id:'new-mail',threadId:thread}}]}]});
  apply('message',{id:'new-mail',threadId:thread},{id:'new-mail',threadId:thread,internalDate:String(Date.parse(received)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:from},{name:'To',value:f.c.mailbox.account},{name:'Subject',value:'New request'},{name:'Message-ID',value:'<new-mail@example.org>'},...(newsletter?[{name:'List-ID',value:'fixture.list'}]:[])],body:{data:Buffer.from('A newer message requiring classification.').toString('base64url')}}});
 }
 for(const scope of [{from:'customer@example.org',thread:'different-thread'},{from:'different@example.org',thread:'thread'}]){
  for(const phase of ['create','claimed','review']){const f=fixture();f.s.prospects.p.reply.at=at;if(phase!=='create'){f.create();f.claim();}if(phase==='review')submit(f);ingest(f,scope);const source=f.s.inquiry_intake.sources['new-mail'];assert.equal(source.classification,'uncertain');assert.equal(source.status,'Identity review');assert.deepEqual(source.paused_projects,['p']);assert.equal(f.s.prospects.p.reply.source_id,'reply');assert.deepEqual(f.s.mailbox_sync.pending,[]);assert.equal(f.s.mailbox_sync.checked_at,now);
   const before=structuredClone(f.s);
   if(phase==='create')assert.throws(()=>f.transition('create',{id:'draft',project_id:'p',revision:f.s.revision,replace_task_id:null,studio_asset_ids:[]},'owner',now),/unresolved|newer/);
   if(phase==='claimed'){assert.throws(()=>mailboxWorkContext(f.s,f.c,'draft',lease,now),/unresolved|newer/);assert.throws(()=>f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:f.s.email_draft_tasks.draft.context_sha256,result},'worker',now),/unresolved|newer/);}
   if(phase==='review')assert.throws(()=>mailboxWorkAdoption(f.s,f.c,{id:'draft',revision:f.s.revision,result_sha256:hash(result)},'owner',now),/unresolved|newer/);assert.deepEqual(f.s,before);
  }
 }
 for(const options of [{newsletter:true,received:'2026-11-01T15:00:00.000Z'},{from:'unrelated@example.org',thread:'unrelated-thread'}]){const f=fixture();f.s.prospects.p.reply.at=at;f.create();f.claim();ingest(f,options);assert.equal(mailboxWorkContext(f.s,f.c,'draft',lease,now).context.reply.source_id,'reply');}
});
test('signed claim resolves current-source ownership even when intake retains Ownership review',()=>{
 const f=fixture();f.s.prospects.p.follow_up_owner=null;const app=new StudioLifecycle(null,()=>new Date(at));app.config=f.c;
 const reply={...fixtureReply('owned-source','thread','customer@example.org'),received_at:at};
 applyLocalInquiry(app,f.s,{id:'record-unowned',prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:'Fixture business',classification:'uncertain',reply}},'provider',f.s.revision,{shared:true});
 applyLocalInquiry(app,f.s,{id:'review-unowned',prospect_id:'inquiry-intake',type:'inquiry_classification_reviewed',at,data:{source_id:'owned-source',classification:'inquiry',reason:'Reviewed ordinary client inquiry'}},'owner',f.s.revision,{shared:true});
 assert.equal(f.s.inquiry_intake.sources['owned-source'].status,'Ownership review');assert.equal(f.s.prospects.p.reply.source_id,'owned-source');assert.throws(()=>f.create(),/assigned/);
 applyConversationRecord(f.s,{id:'claim-unowned',prospect_id:'p',type:'conversation_claimed',at,data:{reason:'I will handle this inquiry'}},'owner',f.s.revision,new Date(at),{manualRecording:true});
 assert.equal(f.s.prospects.p.follow_up_owner,'owner');assert.equal(f.s.inquiry_intake.sources['owned-source'].status,'Ownership review');f.create();f.claim();assert.equal(mailboxWorkContext(f.s,f.c,'draft',lease,at).context.owner,'owner');
 const draft={...result,source_ids:['reply:owned-source']};f.transition('result',{id:'draft',worker_id:lease.worker_id,lease:secret,context_sha256:f.s.email_draft_tasks.draft.context_sha256,result:draft});assert.equal(mailboxWorkAdoption(f.s,f.c,{id:'draft',revision:f.s.revision,result_sha256:hash(draft)},'owner',at).task.status,'Review');
 f.s.inquiry_intake.sources['owned-source'].status='Identity review';assert.throws(()=>mailboxWorkAdoption(f.s,f.c,{id:'draft',revision:f.s.revision,result_sha256:hash(draft)},'owner',at),/unresolved/);
});

test('reviewed non-inquiry clears only a distinct retained-source blocker, never its own reply or other source holds',()=>{
 const f=fixture(),app=new StudioLifecycle(null,()=>new Date(at));app.config=f.c;const source={id:'internal',prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:'Internal technical test',classification:'uncertain',reply:{...fixtureReply('internal','thread-old','customer@example.org','An internal technical test.'),received_at:at}}};
 applyLocalInquiry(app,f.s,source,'provider',f.s.revision,{shared:true});assert.throws(()=>f.create(),/unresolved|newer/);const before=structuredClone(f.s.prospects.p),review={id:'review-internal',prospect_id:'inquiry-intake',type:'inquiry_classification_reviewed',at,data:{source_id:'internal',classification:'non_inquiry',reason:'Reviewed internal message, not an inquiry.'}};
 applyLocalInquiry(app,f.s,review,'friend',f.s.revision,{shared:true});assert.deepEqual(f.s.prospects.p,before);assert.equal(f.s.prospects.p.cold_paused,true);assert.doesNotThrow(()=>assertMailboxWorkReplySource(f.s,f.c,'p',at));f.create();f.claim();assert.equal(mailboxWorkContext(f.s,f.c,'draft',lease,at).context.reply.source_id,'reply');submit(f);assert.equal(mailboxWorkAdoption(f.s,f.c,{id:'draft',revision:f.s.revision,result_sha256:hash(result)},'owner',at).task.status,'Review');
 const changes={current:s=>s.prospects.p.reply=structuredClone(s.inquiry_intake.sources.internal.source),unresolved:s=>s.inquiry_intake.sources.internal.status='Identity review',held:s=>s.mailbox_sync.held_sources.x={thread_id:'thread'},incomplete:s=>s.mailbox_sync.pending.push({id:'pending'}),restricted:s=>s.prospects.p.restriction='do_not_contact',uncertain:s=>s.outreach_delivery={intents:{old:{project_id:'p',status:'Uncertain'}}},newer:s=>s.inquiry_intake.sources.real={...structuredClone(s.inquiry_intake.sources.internal),source_id:'real',classification:'inquiry',status:'Matched existing client',project_id:'p',source:{...fixtureReply('real','thread','customer@example.org'),received_at:'2026-11-02T14:01:00.000Z'}}};
 for(const [name,change]of Object.entries(changes)){const s=structuredClone(f.s);change(s);assert.throws(()=>assertMailboxWorkReplySource(s,f.c,'p',at),undefined,name);}
});
