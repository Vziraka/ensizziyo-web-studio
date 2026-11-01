import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {writeLifecycleBackup} from './lifecycle-backup.mjs';
import {prepareManualWorkspace,installManualWorkspace} from './shared-manual-records.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {applyOutreachReview} from './outreach-review.mjs';
import {mailboxDeliveryCapability} from './mailbox-delivery.mjs';
import {mailboxDeliveryCommand} from './mailbox-delivery-service.mjs';
import {createMailboxDeliveryClock,mailboxDeliveryClockEntry} from './mailbox-delivery-host.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';

const at='2026-11-02T14:00:00.000Z',expiry='2026-11-03T00:00:00.000Z';
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'evz-delivery-clock-'));t.after(()=>rm(directory,{recursive:true,force:true}));let time=Date.parse(at);const now=()=>new Date(time);
 const local=await StudioLifecycle.initialize({directory:join(directory,'local'),now});await local.apply(fixtureProspect('project',at));const state=await local.snapshot(),r=state.prospects.project;
 state.mode='production';state.run_id='delivery-clock';Object.assign(r,{stage:'Ready to contact',follow_up_owner:'owner',qualification:{verdict:'Research-qualified',independent_review:'Accepted'},call_prep:{observations:[{fact:'Fictional reviewed source'}]},calls:{},attempts:[],cold_paused:false});
 const sourceConfig={...structuredClone(initialConfig),mode:'production',run_id:state.run_id};sourceConfig.sender.email='hello@evzdigital.studio';sourceConfig.sender.postal_address='FICTIONAL reviewed address';
 const reviewApp={config:{...sourceConfig,mode:'controlled'},now};
 applyOutreachReview(reviewApp,state,{id:'draft',prospect_id:'project',type:'outreach_draft_saved',data:{lane:'email-first',timezone:'America/New_York',subject:'Fictional question',body:'Does this reviewed idea help?'}},'owner',state.revision);
 applyOutreachReview(reviewApp,state,{id:'batch',prospect_id:'outreach-batches',type:'outreach_batch_approved',data:{items:[{project_id:'project',sha256:state.outreach_review.drafts.project.sha256}],facts_checked:true}},'owner',state.revision);delete r.controlled;
 const mailbox={schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'delivery-clock-grant',after:'2026-11-01T00:00:00.000Z'};
 state.mailbox_sync={policy_sha256:hash(mailbox),after:mailbox.after,phase:'history',cursor:'100',next_cursor:null,page:null,pages:[],pending:[],held_sources:{},checked_at:at,last_read_at:at,hold:null};
 const backup=join(directory,'backup.json');await writeLifecycleBackup(local.directory,state,backup,at);
 const scope={schema_version:1,capability:mailboxDeliveryCapability,workspace_id:'delivery-clock',run_id:state.run_id,mode:'production',state_schema:1,site_id:'delivery-site',deploy_id:'delivery-deploy',origin:'https://delivery.example.invalid',namespace:'evz-manual-shared-delivery-clock-test'};
 const mailboxWork={schema_version:1,worker_id:'worker',gateway_site_id:'gateway',gateway_deploy_id:'gateway-deploy',gateway_origin:'https://gateway.example.invalid',recovery_generation:'work-one',credential_sha256:hash('ab'.repeat(32)),max_tasks:1,max_claims_per_day:1,lease_minutes:20,expires_at:expiry};
 const mailboxClock={schema_version:1,site_id:scope.site_id,deploy_id:scope.deploy_id,origin:scope.origin,recovery_generation:'clock-one',interval_minutes:5,max_steps_per_tick:1,max_steps_per_day:1,deadline_ms:25000,expires_at:expiry};
 const mailboxDelivery={schema_version:1,site_id:scope.site_id,deploy_id:scope.deploy_id,origin:scope.origin,account:mailbox.account,grant_id:mailbox.grant_id,from:sourceConfig.sender.email,recovery_generation:'delivery-one',expires_at:expiry,max_intents:10,max_per_day:10,kinds:['reply','outreach'],sender_ready:true,postal_address_verified:true};
 const packet=await prepareManualWorkspace({backup,sourceConfig,scope,mailbox,mailboxWork,mailboxClock,mailboxDelivery}),objects=new Map();let version=0,reads=0;
 const raw={async getWithMetadata(k,o){reads++;const e=objects.get(k);return e?{data:o.type==='json'?JSON.parse(e.bytes):Uint8Array.from(e.bytes).buffer,etag:e.etag}:null;},async set(k,b,o){const old=objects.get(k);if(o.onlyIfNew&&old||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==old?.etag)return {modified:false};const e={bytes:Buffer.from(b),etag:String(++version)};objects.set(k,e);return {modified:true,etag:e.etag};},async setJSON(k,v,o){return this.set(k,Buffer.from(JSON.stringify(v)),o);}};
 const store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now});await installManualWorkspace(store,packet,{commit:true});const app=await StudioLifecycle.fromStore({store,now});
 const env={CONTEXT:'production',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:mailboxDeliveryCapability,EVZ_MAILBOX_DELIVERY_RUNTIME:mailboxDeliveryCapability,EVZ_MAILBOX_DELIVERY_CLOCK_RUNTIME:mailboxDeliveryCapability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(packet.binding),EVZ_OPERATIONS_ORIGIN:scope.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace},context={site:{id:scope.site_id},deploy:{id:scope.deploy_id,context:'production',published:true}};
 const token={profile:mailboxProfile,account:mailbox.account,grant_id:mailbox.grant_id,access_token:'synthetic-access-token',scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse(expiry)};
 const sent=[],paths=[],control={lose:false,onFetch:null};
 const getAccessToken=Object.assign(async()=>token,{assertCurrent:async()=>{},assertGrant:async()=>token});
 const fetcher=async(url,o)=>{const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);assert.equal(u.origin,'https://gmail.googleapis.com');paths.push(path);if(control.onFetch)await control.onFetch(path);
  if(path==='profile')return Response.json({emailAddress:mailbox.account});
  if(path==='settings/sendAs')return Response.json({sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]});
  if(path==='messages/send'){const data=JSON.parse(o.body),m={id:'sent-'+(sent.length+1),threadId:'new-thread',labelIds:['SENT'],raw:data.raw,internalDate:String(+now())};sent.push(m);if(control.lose)throw Error('Lost send response');return Response.json({id:m.id,threadId:m.threadId});}
  if(path==='messages'){return Response.json({messages:u.searchParams.get('q').startsWith('in:sent rfc822msgid:')?sent.map(m=>({id:m.id})):[]});}
  if(path.startsWith('messages/sent-'))return Response.json(sent.find(m=>'messages/'+m.id===path));
  assert.fail('Unexpected provider operation '+path);
 };
 const invoke=({environment=env,trusted=context,body={next_run:new Date(+now()+60000).toISOString()}}={})=>createMailboxDeliveryClock({env:environment,now,storeFactory:()=>raw,googleMailOptions:{getAccessToken,fetcher}})(new Request(scope.origin+'/.netlify/functions/mailbox-delivery-clock',{method:'POST',body:JSON.stringify(body)}),trusted);
 async function ready(){await mailboxDeliveryCommand(app,'allowance',{revision:(await store.snapshot()).revision,allowance:{id:'included',evidence_ref:'Fictional included-budget evidence',observed_at:at,expires_at:expiry,included_only:true,max_intents:2}},'owner');await mailboxDeliveryCommand(app,'pause',{revision:(await store.snapshot()).revision,paused:false,reason:'Finite fictional schedule'},'friend');const p=await mailboxDeliveryCommand(app,'package',{kind:'outreach',project_id:'project'},'owner');return mailboxDeliveryCommand(app,'approve',{revision:(await store.snapshot()).revision,kind:'outreach',project_id:'project',package_sha256:p.sha256},'owner');}
 return {app,store,env,context,invoke,ready,sent,paths,control,now,advance:ms=>time+=ms,get reads(){return reads;}};
}

test('delivery scheduler builds disabled by default and rejects preview/old profiles before storage',async t=>{
 assert.doesNotMatch(mailboxDeliveryClockEntry({}),/schedule:/);assert.doesNotMatch(mailboxDeliveryClockEntry({CONTEXT:'deploy-preview',EVZ_MAILBOX_DELIVERY_CLOCK_BUILD:mailboxDeliveryCapability}),/schedule:/);assert.match(mailboxDeliveryClockEntry({CONTEXT:'production',EVZ_MAILBOX_DELIVERY_CLOCK_BUILD:mailboxDeliveryCapability}),/schedule:'\* \* \* \* \*'/);
 const f=await fixture(t),reads=f.reads;for(const environment of [{...f.env,EVZ_MAILBOX_DELIVERY_CLOCK_RUNTIME:''},{...f.env,EVZ_MAILBOX_DELIVERY_RUNTIME:''},{...f.env,EVZ_OPERATIONS_DESK_ENABLED:'shared-mailbox-clock-v1'}])assert.equal((await f.invoke({environment})).status,503);
 assert.equal((await f.invoke({trusted:{...f.context,deploy:{...f.context.deploy,context:'deploy-preview'}}})).status,503);assert.equal(f.reads,reads);assert.equal(f.paths.length,0);
});
test('deployment/binding mismatch and malformed scheduled envelopes cannot open canonical storage',async t=>{
 const f=await fixture(t),reads=f.reads;for(const environment of [{...f.env,DEPLOY_ID:'different'},{...f.env,EVZ_OPERATIONS_ORIGIN:'https://other.invalid'},{...f.env,EVZ_OPERATIONS_BLOB_NAMESPACE:'other'}])assert.equal((await f.invoke({environment})).status,400);
 assert.equal((await f.invoke({body:{next_run:at,approval_id:'injected'}})).status,400);assert.equal(f.reads,reads);assert.equal(f.sent.length,0);
});
test('only a due separately approved outreach reaches actual transport; repeated tick never resends',async t=>{
 const f=await fixture(t);await f.ready();const result=await f.invoke();assert.equal(result.status,200);assert.equal((await result.json()).status,'Verified');assert.equal(f.sent.length,1);assert.equal((await f.invoke()).status,200);assert.equal(f.sent.length,1);
 assert.ok(!f.paths.some(p=>p.startsWith('history')||p.startsWith('threads')),'Scheduler must not run mailbox intake');assert.equal((await f.store.snapshot()).mailbox_sync.cursor,'100');
});
test('early and missed approval slots perform no provider calls',async t=>{
 for(const offset of [-1000,60000]){const f=await fixture(t);await f.ready();f.advance(offset);const result=await f.invoke();assert.equal(result.status,200);assert.equal((await result.json()).attempted,0);assert.equal(f.paths.length,0);}
});
test('simultaneous scheduled invocations and lost POST response cannot duplicate a send',async t=>{
 const f=await fixture(t);await f.ready();await Promise.all([f.invoke(),f.invoke()]);assert.equal(f.sent.length,1);assert.equal(Object.keys((await f.store.snapshot()).mailbox_delivery.intents).length,1);
 const g=await fixture(t);await g.ready();g.control.lose=true;const uncertain=await g.invoke();assert.equal((await uncertain.json()).status,'Uncertain');await g.invoke();assert.equal(g.sent.length,1);assert.equal(Object.values((await g.store.snapshot()).mailbox_delivery.intents)[0].status,'Held');
});
test('signed pause or deadline during provider preflight prevents a POST',async t=>{
 for(const mode of ['pause','expiry']){const f=await fixture(t);await f.ready();let once=false;f.control.onFetch=async()=>{if(once)return;once=true;if(mode==='expiry')f.advance(26000);else await mailboxDeliveryCommand(f.app,'pause',{revision:(await f.store.snapshot()).revision,paused:true,reason:'Stop during preflight'},'friend');};await f.invoke();assert.equal(f.sent.length,0);}
});
