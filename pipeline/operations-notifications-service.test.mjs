import test from 'node:test';import assert from 'node:assert/strict';
import {cloudDiscoveryFixture as baseFixture} from './cloud-discovery-fixtures.mjs';
import {operationsNotificationCommand,observeOperationsNotificationHealth} from './operations-notifications-service.mjs';

const count=s=>Object.values(s.team_notifications?.messages??{});
test('signed preparation saves one held day summary per role and rejects client health fields and old profiles',async t=>{
 const f=await cloudDiscoveryFixture(t);f.advance(9*3600000);let state=await f.store.snapshot();await operationsNotificationCommand(f.app,{revision:state.revision},'friend');state=await f.store.snapshot();const summaries=count(state).filter(m=>m.kind==='digest');assert.equal(summaries.length,2);assert.ok(summaries.every(m=>m.status==='Prepared; delivery held'));await operationsNotificationCommand(f.app,{revision:state.revision},'owner');assert.deepEqual(count(await f.store.snapshot()),count(state));
 await assert.rejects(operationsNotificationCommand(f.app,{revision:state.revision,status:'Connected'},'owner'),/revision/);await assert.rejects(operationsNotificationCommand(f.app,{revision:state.revision},'worker'),/Signed/);
 const old=await cloudDiscoveryFixture(t,{capability:'shared-mailbox-delivery-v1'});await assert.rejects(operationsNotificationCommand(old.app,{revision:0},'owner'),/workspace/);
});
test('health uses only trusted normalized account/grant metadata; disconnect resolves without retaining secrets',async t=>{
 const f=await cloudDiscoveryFixture(t),mailbox=f.app.config.mailbox,read=status=>async()=>({status,account:mailbox.account,grant_id:mailbox.grant_id,access_token:'must-not-retain',refresh_token:'must-not-retain',scopes:['private-extra']});
 await observeOperationsNotificationHealth(f.app,{readHealth:read('Disconnected')});let state=await f.store.snapshot();assert.equal(state.operations_notification_health.status,'Disconnected');assert.equal(count(state).filter(m=>m.status==='Prepared; delivery held').length,2);
 await observeOperationsNotificationHealth(f.app,{readHealth:read('Connected')});state=await f.store.snapshot();assert.equal(state.operations_notification_health.status,'Connected');assert.ok(count(state).every(m=>m.operations_resolved_at));assert(!JSON.stringify(state).includes('must-not-retain'));
 await observeOperationsNotificationHealth(f.app,{readHealth:async()=>({status:'Connected',account:mailbox.account,grant_id:'wrong'})});assert.equal((await f.store.snapshot()).operations_notification_health.status,'Reauthorization required');
 await observeOperationsNotificationHealth(f.app,{readHealth:async()=>{throw Error('private-provider-detail');}});state=await f.store.snapshot();assert.equal(state.operations_notification_health.status,'Unavailable');assert(!JSON.stringify(state).includes('private-provider-detail'));
});
test('late trusted health read and late canonical read cannot publish after service budget',async t=>{
 const f=await cloudDiscoveryFixture(t),before=await f.store.snapshot();await assert.rejects(observeOperationsNotificationHealth(f.app,{readHealth:async()=>{f.advance(25001);return {status:'Connected',...f.app.config.mailbox};}}),/expired/);assert.deepEqual(await f.store.snapshot(),before);
 let once=false;f.control.beforeRead=async()=>{if(!once){once=true;f.advance(25001);}};await assert.rejects(operationsNotificationCommand(f.app,{revision:before.revision},'owner'),/expired/);f.control.beforeRead=null;assert.deepEqual(await f.store.snapshot(),before);
});
test('a stalled health read returns at abort and its late resolution cannot write',async t=>{
 const f=await cloudDiscoveryFixture(t),before=await f.store.snapshot(),controller=new AbortController();t.mock.method(AbortSignal,'timeout',()=>controller.signal);let release,started;const entered=new Promise(r=>{started=r;}),blocked=new Promise(r=>{release=r;});
 const pending=observeOperationsNotificationHealth(f.app,{readHealth:async()=>{started();await blocked;return {status:'Disconnected',account:f.app.config.mailbox.account};}});await entered;controller.abort();await assert.rejects(pending,/expired/);release();await new Promise(r=>setImmediate(r));assert.deepEqual(await f.store.snapshot(),before);
});

async function cloudDiscoveryFixture(t,options){const f=await baseFixture(t,options);if(!options?.capability||options.capability==='shared-operations-desk-v1')await f.ready();return f;}

