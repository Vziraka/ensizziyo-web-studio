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
import {mailboxClockCapability,mailboxClockTickId,applyMailboxClockTransition} from './mailbox-clock.mjs';
import {mailboxClockCommand,createMailboxClock,mailboxClockEntry} from './mailbox-clock-host.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';

const at='2026-11-02T14:00:00.000Z';
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'evz-clock-'));t.after(()=>rm(directory,{recursive:true,force:true}));let time=Date.parse(at);const now=()=>new Date(time);
 const local=await StudioLifecycle.initialize({directory:join(directory,'local'),now});await local.apply(fixtureProspect('retained',at));const state=await local.snapshot();state.mode='production';state.run_id='clock-proof';delete state.prospects.retained.controlled;
 const mailbox={schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'clock-grant',after:'2026-11-01T00:00:00.000Z'};
 state.mailbox_sync={policy_sha256:hash(mailbox),after:mailbox.after,phase:'history',cursor:'100',next_cursor:null,page:null,pages:[],pending:[],held_sources:{},checked_at:at,last_read_at:at,hold:null};
 const backup=join(directory,'backup.json');await writeLifecycleBackup(local.directory,state,backup,at);
 const scope={schema_version:1,capability:mailboxClockCapability,workspace_id:'clock-workspace',run_id:state.run_id,mode:'production',state_schema:1,site_id:'clock-site',deploy_id:'clock-deploy',origin:'https://clock.example.invalid',namespace:'evz-manual-shared-clock-test'};
 const mailboxWork={schema_version:1,worker_id:'worker',gateway_site_id:'gateway-site',gateway_deploy_id:'gateway-deploy',gateway_origin:'https://gateway.example.invalid',recovery_generation:'worker-one',credential_sha256:hash('ab'.repeat(32)),max_tasks:3,max_claims_per_day:3,lease_minutes:20,expires_at:'2026-11-03T00:00:00.000Z'};
 const mailboxClock={schema_version:1,site_id:scope.site_id,deploy_id:scope.deploy_id,origin:scope.origin,recovery_generation:'clock-one',interval_minutes:5,max_steps_per_tick:3,max_steps_per_day:6,deadline_ms:25000,expires_at:'2026-11-03T00:00:00.000Z'};
 const packet=await prepareManualWorkspace({backup,sourceConfig:{...structuredClone(initialConfig),mode:'production',run_id:state.run_id},scope,mailbox,mailboxWork,mailboxClock});let saved=null,version=0,lose=false,reads=0,readAction=async()=>{};const raw={async getWithMetadata(){reads++;const result=saved?structuredClone(saved):null;await readAction(reads);return result;},async setJSON(k,data,o){if(o.onlyIfNew&&saved||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==saved?.etag)return {modified:false};saved={data:structuredClone(data),etag:String(++version)};if(lose){lose=false;throw Error('Lost acknowledgement');}return {modified:true,etag:saved.etag};}};
 const store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now});await installManualWorkspace(store,packet,{commit:true});const app=await StudioLifecycle.fromStore({store,now});
 const env={CONTEXT:'production',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_ORIGIN:scope.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_OPERATIONS_DESK_ENABLED:mailboxClockCapability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(packet.binding),EVZ_MAILBOX_CLOCK_RUNTIME:mailboxClockCapability,EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES:'5'};
 const context={site:{id:scope.site_id},deploy:{id:scope.deploy_id,context:'production',published:true}},token={access_token:'synthetic-token',profile:mailboxProfile,account:mailbox.account,grant_id:mailbox.grant_id,scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse('2026-11-03T00:00:00.000Z')};
 let calls=0,fetchAction=async()=>Response.json({historyId:'101',history:[]});const handler=overrides=>createMailboxClock({env,now,storeFactory:async()=>raw,googleIncomingOptions:{getAccessToken:Object.assign(async()=>token,{assertCurrent:async value=>assert.equal(value.account,token.account),assertGrant:async value=>assert.equal(value.grant_id,token.grant_id)}),fetcher:async(url,options)=>{assert.equal(options.method,'GET');assert.match(url,/\/history\?/);calls++;return fetchAction(url,options);}},...overrides});
 const invoke=async(overrides)=>handler(overrides)(new Request(scope.origin+'/.netlify/functions/mailbox-clock',{method:'POST',body:JSON.stringify({next_run:new Date(+now()+300000).toISOString()})}),context);
 const resume=async()=>{await mailboxClockCommand(app,'allowance',{revision:(await store.snapshot()).revision,allowance:{id:'included-proof',evidence_ref:'synthetic-account-observation',observed_at:now().toISOString(),expires_at:'2026-11-02T16:00:00.000Z',included_only:true,max_steps:5}},'owner');await mailboxClockCommand(app,'pause',{revision:(await store.snapshot()).revision,paused:false,reason:'Finite fictional proof'},'friend');};
 return {packet,app,store,raw,env,context,now,invoke,resume,get calls(){return calls;},get reads(){return reads;},get writes(){return version;},readAction:fn=>{readAction=fn;},advance:ms=>{time+=ms;},lose:()=>{lose=true;},fetchAction:fn=>{fetchAction=fn;}};
}
test('published clock uses real transport and canonical CAS once; duplicate tick performs no second read',async t=>{
 const f=await fixture(t),before=await f.store.snapshot();await f.resume();const response=await f.invoke();assert.equal(response.status,200);assert.equal((await response.json()).read_steps,1);assert.equal(f.calls,1);
 const after=await f.store.snapshot();assert.equal(after.mailbox_sync.cursor,'101');assert.equal(after.mailbox_clock.tick.status,'Completed');assert.equal(after.mailbox_clock.allowances['included-proof'].used_steps,1);assert.deepEqual(after.prospects,before.prospects);assert.deepEqual(after.actions,before.actions);
 assert.equal((await (await f.invoke()).json()).duplicate,true);assert.equal(f.calls,1);
});
test('disabled and preview invocations cannot open storage or Gmail',async t=>{
 const f=await fixture(t),before=f.reads;for(const env of [{...f.env,EVZ_MAILBOX_CLOCK_RUNTIME:'disabled'},{...f.env,EVZ_OPERATIONS_DESK_ENABLED:'shared-mailbox-work-v1'}])assert.equal((await f.invoke({env})).status,503);
 assert.equal((await createMailboxClock({env:f.env,storeFactory:()=>{throw Error('Must not read');}})(new Request(f.packet.binding.scope.origin,{method:'POST'}),{...f.context,deploy:{...f.context.deploy,context:'deploy-preview',published:false}})).status,503);assert.equal(f.reads,before);assert.equal(f.calls,0);
 assert.doesNotMatch(mailboxClockEntry({}),/schedule:/);assert.doesNotMatch(mailboxClockEntry({CONTEXT:'deploy-preview',EVZ_MAILBOX_CLOCK_BUILD:mailboxClockCapability}),/schedule:/);assert.match(mailboxClockEntry({CONTEXT:'production',EVZ_MAILBOX_CLOCK_BUILD:mailboxClockCapability,EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES:'15'}),/\*\/15/);
});
test('operator pause during provider read rejects late evidence and keeps charged pending step',async t=>{
 const f=await fixture(t);await f.resume();f.fetchAction(async()=>{await mailboxClockCommand(f.app,'pause',{revision:(await f.store.snapshot()).revision,paused:true,reason:'Pause during read'},'friend');return Response.json({historyId:'101',history:[]});});assert.equal((await f.invoke()).status,503);
 const s=await f.store.snapshot();assert.equal(s.mailbox_sync.cursor,'100');assert.equal(s.mailbox_clock.tick.status,'Held');assert.equal(s.mailbox_clock.tick.pending_step,1);assert.equal(s.mailbox_clock.allowances['included-proof'].used_steps,1);assert.equal(f.calls,1);
});
test('late provider result cannot advance cursor after deadline; next slot retains failed liability',async t=>{
 const f=await fixture(t);await f.resume();f.fetchAction(async()=>{f.advance(26000);return Response.json({historyId:'101',history:[]});});assert.equal((await f.invoke()).status,503);let s=await f.store.snapshot();assert.equal(s.mailbox_sync.cursor,'100');assert.equal(s.mailbox_clock.allowances['included-proof'].used_steps,1);
 f.advance(274000);f.fetchAction(async()=>Response.json({historyId:'102',history:[]}));assert.equal((await f.invoke()).status,200);s=await f.store.snapshot();assert.equal(s.mailbox_sync.cursor,'102');assert.equal(s.mailbox_clock.allowances['included-proof'].used_steps,2);
});
test('lost clock reservation acknowledgement reconciles exact saved envelope',async t=>{
 const f=await fixture(t);await f.resume();f.lose();assert.equal((await f.invoke()).status,200);assert.equal(f.calls,1);assert.equal((await f.store.snapshot()).mailbox_clock.allowances['included-proof'].used_steps,1);
});
test('typed store rejects clock settlement without exact provider observation',async t=>{
 const f=await fixture(t);await f.resume();const at=f.now().toISOString();const tr=(type,input)=>{const mailboxClock={type,actor:'clock',at,input};return f.app.change((s,c)=>applyMailboxClockTransition(s,c,mailboxClock),{mailboxClock});};
 await tr('claim',{tick_id:mailboxClockTickId(at),scheduled_at:at,revision:(await f.store.snapshot()).revision});await tr('step',{tick_id:mailboxClockTickId(at),fence:1,step:1});
 await assert.rejects(tr('settle',{tick_id:mailboxClockTickId(at),fence:1,step:1,outcome:'Caught up'}),/provider evidence/);assert.equal((await f.store.snapshot()).mailbox_clock.tick.pending_step,1);
});

test('paused and expired clocks need one validated workspace read and no writes or provider calls',async t=>{
 const f=await fixture(t);let reads=f.reads,writes=f.writes;
 assert.equal((await f.invoke()).status,503);assert.equal(f.reads-reads,1);assert.equal(f.writes,writes);assert.equal(f.calls,0);
 await f.resume();f.advance(86400000);reads=f.reads;writes=f.writes;
 assert.equal((await f.invoke()).status,503);assert.equal(f.reads-reads,1);assert.equal(f.writes,writes);assert.equal(f.calls,0);
 assert.deepEqual(Object.keys(f.packet.binding).sort(),['manifest_sha256','scope']);assert.equal(f.packet.binding.scope.expires_at,undefined);
});

test('one caught-up read and duplicate tick avoid redundant whole-workspace loads',async t=>{
 const f=await fixture(t);await f.resume();let reads=f.reads,writes=f.writes;
 assert.equal((await f.invoke()).status,200);assert.equal(f.reads-reads,13);assert.equal(f.writes-writes,3);assert.equal(f.calls,1);
 reads=f.reads;writes=f.writes;assert.equal((await (await f.invoke()).json()).duplicate,true);assert.equal(f.reads-reads,4);assert.equal(f.writes,writes);assert.equal(f.calls,1);
});

test('preflight snapshot never authorizes a claim after a concurrent signed pause',async t=>{
 const f=await fixture(t);await f.resume();const trigger=f.reads+1;
 f.readAction(async count=>{if(count!==trigger)return;f.readAction(async()=>{});await mailboxClockCommand(f.app,'pause',{revision:(await f.store.snapshot()).revision,paused:true,reason:'Concurrent pause after preflight'},'friend');});
 assert.equal((await f.invoke()).status,503);assert.equal(f.calls,0);const s=await f.store.snapshot();assert.equal(s.mailbox_clock.paused,true);assert.equal(s.mailbox_clock.tick,null);assert.equal(s.mailbox_clock.allowances['included-proof'].used_steps,0);
});

test('removing redundant pre-step snapshot preserves a competing pause CAS conflict',async t=>{
 const f=await fixture(t);await f.resume();const trigger=f.reads+5;
 f.readAction(async count=>{if(count!==trigger)return;f.readAction(async()=>{});await mailboxClockCommand(f.app,'pause',{revision:(await f.store.snapshot()).revision,paused:true,reason:'Concurrent pause during step reservation'},'owner');});
 assert.equal((await f.invoke()).status,409);assert.equal(f.calls,0);const s=await f.store.snapshot();assert.equal(s.mailbox_clock.tick.status,'Held');assert.equal(s.mailbox_clock.tick.pending_step,null);assert.equal(s.mailbox_clock.allowances['included-proof'].used_steps,0);
});

test('immutable config is revalidated after preflight and deadline is checked after initialization',async t=>{
 for(const corrupt of [false,true]){
  const f=await fixture(t);await f.resume();const trigger=f.reads+1;
  f.readAction(async count=>{if(count!==trigger)return;f.readAction(async()=>{});if(corrupt){const entry=await f.raw.getWithMetadata('workspace');entry.data.config.mailbox_clock.expires_at='2027-01-01T00:00:00.000Z';await f.raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});}else f.advance(26000);});
  assert.equal((await f.invoke()).status,503);assert.equal(f.calls,0);
 }
});
