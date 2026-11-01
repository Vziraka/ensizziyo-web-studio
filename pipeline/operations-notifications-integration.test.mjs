import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {hash} from './lifecycle.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {cloudDiscoveryFixture} from './cloud-discovery-fixtures.mjs';
import {cloudDiscoveryCommand} from './cloud-discovery-service.mjs';
import {syncMailboxStep,applyMailboxFailure} from './mailbox-intake.mjs';
import {applyOperationsNotificationTransition,operationsNotificationView} from './operations-notifications.mjs';
import {observeOperationsNotificationHealth} from './operations-notifications-service.mjs';
import {hostedManualBackupInventory,writePortableLifecycleBackup,restoreLifecycleBackup} from './lifecycle-backup.mjs';

const messages=s=>Object.values(s.team_notifications?.messages??{}).filter(m=>m.id.startsWith('ops-'));
const failedTransport={async incomingProfile(){throw Error('Fictional unavailable transport');}};
const fail=f=>syncMailboxStep(f.app,{transport:failedTransport});
async function prepare(f){const tr={type:'prepare',actor:'owner',at:f.now().toISOString(),input:{revision:(await f.store.snapshot()).revision}};return f.app.change((s,c)=>applyOperationsNotificationTransition(s,c,tr),{operationsNotifications:tr,operationsNotificationsDeadline:+f.now()+25000});}

test('signed HTTP reload reads saved notification history from canonical state before dashboard sanitization',async t=>{
 const f=await cloudDiscoveryFixture(t);await fail(f);f.advance(10*60*60000);await prepare(f);const saved=messages(await f.store.snapshot()),b=f.packet.binding.scope;
 const env={CONTEXT:'production',SITE_ID:b.site_id,DEPLOY_ID:b.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:b.capability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:b.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:b.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)},context={site:{id:b.site_id},deploy:{id:b.deploy_id,context:'production',published:true}},handler=createHostedDesk({env,storeFactory:()=>f.raw,now:f.now}),request=(path,opts)=>new Request(b.origin+'/desk'+path,opts),cookie=r=>r.headers.get('set-cookie').split(';')[0];
 const boot=await handler(request('/api/bootstrap'),context),csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:initial,origin:b.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env.EVZ_OPERATIONS_FRIEND_KEY})}),context);assert.equal(login.status,200);
 const headers={cookie:initial+'; '+cookie(login)};for(let i=0;i<2;i++){const response=await handler(request('/api/state',{headers}),context);assert.equal(response.status,200);const view=await response.json();assert.deepEqual(view.operations_notifications.messages.map(m=>m.id).sort(),saved.map(m=>m.id).sort());assert.equal(view.operations_notifications.unsaved_alerts,0);assert.deepEqual(view.notification_preparation,view.operations_notifications);assert.equal(view.team_notifications,undefined);}
});

test('actual mailbox failure and both operator alerts commit together; lost acknowledgement creates no duplicate ledger',async t=>{
 const f=await cloudDiscoveryFixture(t);let writes=0;f.control.beforeWrite=async key=>{if(key==='workspace')writes++;};f.control.lose=key=>key==='workspace';
 const result=await fail(f),state=await f.store.snapshot();assert.equal(result.held,true);assert.equal(result.reconciled,true);assert.equal(writes,1);assert.equal(state.mailbox_failure.reason,'Source unavailable');assert.deepEqual(messages(state).map(m=>m.recipient_role).sort(),['friend','owner']);assert.ok(messages(state).every(m=>!m.delivery&&m.status==='Prepared; delivery held'));
 await fail(f);const repeated=await f.store.snapshot();assert.deepEqual(repeated.team_notifications,state.team_notifications);assert.equal(messages(repeated).length,2);
 await cloudDiscoveryCommand(f.app,'pause',{revision:repeated.revision,paused:true,reason:'Operator pause'},'friend');const paused=await f.store.snapshot();assert.equal(paused.cloud_discovery.paused,true);assert.deepEqual(paused.team_notifications,repeated.team_notifications);assert.deepEqual(paused.mailbox_failure,repeated.mailbox_failure);
});

test('old profiles cannot prepare new notifications and forged nested ledger changes fail before trusted projection',async t=>{
 const old=await cloudDiscoveryFixture(t,{capability:'shared-mailbox-delivery-v1'});await assert.rejects(prepare(old));assert.equal((await old.store.snapshot()).team_notifications,undefined);
 const f=await cloudDiscoveryFixture(t);await fail(f);const before=await f.store.snapshot(),failure={...before.mailbox_failure,at:f.now().toISOString()};
 await assert.rejects(f.app.change((s,c)=>{applyMailboxFailure(s,c,failure);s.team_notifications.messages[messages(s)[0].id].delivery={status:'Verified',provider_id:'forged'};},{mailboxFailure:failure}),/unrelated|notification|replay/i);assert.deepEqual(await f.store.snapshot(),before);
});

test('portable backup recovery preserves notification history without creating external delivery receipts',async t=>{
 const f=await cloudDiscoveryFixture(t);await fail(f);f.advance(10*60*60000);await prepare(f);const before=await f.store.snapshot();assert.equal(messages(before).filter(m=>m.kind==='digest').length,2);
 const inventory=await hostedManualBackupInventory(f.app,join(f.directory,'local')),backup=join(f.directory,'notifications.json');await writePortableLifecycleBackup(inventory.state,inventory.files,backup,f.now().toISOString());const restored=join(f.directory,'restored');await restoreLifecycleBackup(backup,restored);const after=JSON.parse(await readFile(join(restored,'lifecycle-state.json')));assert.deepEqual(after.team_notifications,before.team_notifications);assert.ok(messages(after).every(m=>!m.delivery));assert.equal(operationsNotificationView(after,f.app.config,f.now().toISOString()).delivery_enabled,false);
});

test('near-limit canonical state retains a critical mailbox capacity failure without requiring ledger growth',async t=>{
 const f=await cloudDiscoveryFixture(t),entry=f.objects.get('workspace'),data=JSON.parse(entry.bytes);data.state.actions.fixture={id:'fixture',type:'fixture',status:'Verified',payload:{retained:'x'}};
 const target=19_999_000,size=Buffer.byteLength(JSON.stringify(data));data.state.actions.fixture.payload.retained='x'.repeat(target-size+1);entry.bytes=Buffer.from(JSON.stringify(data));await f.store.snapshot();
 const beforeHash=hash(data.state.actions);const result=await fail(f),state=await f.store.snapshot();assert.equal(result.held,true);assert.equal(state.mailbox_failure.reason,'Capacity reached');assert.equal(hash(state.actions),beforeHash);assert.ok(f.objects.get('workspace').bytes.length<=20_000_000);assert.equal(messages(state).length,0);assert.match(state.team_notifications?.operations_hold??operationsNotificationView(state,f.app.config,f.now().toISOString()).hold,/capacity|fit|visible/i);assert.equal(operationsNotificationView(state,f.app.config,f.now().toISOString()).active_incidents,2);
});

test('near-limit typed health retains disconnect metadata while keeping original notification history',async t=>{
 const f=await cloudDiscoveryFixture(t),entry=f.objects.get('workspace'),data=JSON.parse(entry.bytes);data.state.updated_at=f.now().toISOString();data.state.team_notifications={messages:{legacy:{id:'legacy',subject:'Retained original',status:'Prepared; delivery held'}},active:{}};data.state.actions.fixture={id:'fixture',type:'fixture',status:'Verified',payload:{retained:'x'}};
 const original=structuredClone(data.state.team_notifications.messages),size=Buffer.byteLength(JSON.stringify(data));data.state.actions.fixture.payload.retained='x'.repeat(19_999_000-size+1);entry.bytes=Buffer.from(JSON.stringify(data));await f.store.snapshot();
 await observeOperationsNotificationHealth(f.app,{readHealth:async()=>({status:'Disconnected',account:f.app.config.mailbox.account})});const state=await f.store.snapshot(),view=operationsNotificationView(state,f.app.config,f.now().toISOString());assert.equal(state.operations_notification_health.status,'Disconnected');assert.deepEqual(state.team_notifications.messages,original);assert.equal(view.active_incidents,2);assert.equal(view.unsaved_alerts,2);assert.deepEqual(view.active_sources.map(s=>s.recipient_role).sort(),['friend','owner']);assert.ok(f.objects.get('workspace').bytes.length<=20_000_000);
});
