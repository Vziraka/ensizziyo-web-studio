import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from './lifecycle.mjs';
import {sourceContentHash} from './sources.mjs';
import {cloudDiscoveryFixture,cloudDiscoveryCandidate,cloudDiscoveryDecision} from './cloud-discovery-fixtures.mjs';
import {cloudDiscoveryCommand,cloudDiscoveryCoordinator,createCloudDiscoveryWorker} from './cloud-discovery-service.mjs';
import {applyCloudDiscoveryTransition} from './cloud-discovery.mjs';
import {validateManualEnvelope,prepareManualWorkspace} from './shared-manual-records.mjs';
const actor='researcher',context_id='research-context';
async function create(f,id='task',lane='call-first'){
 return cloudDiscoveryCommand(f.app,'create',{revision:(await f.store.snapshot()).revision,id,lane,count:1,assigned_to:'owner',area:f.app.config.cloud_discovery.areas[0],subtypes:['HVAC']},'owner');
}
async function submit(f,{id='task',lane='call-first',candidate=cloudDiscoveryCandidate(0,lane)}={}){
 await create(f,id,lane);const worker=createCloudDiscoveryWorker(f.app,{actor,context_id}),claim_id=id+'-claim';await worker.claim({id,claim_id});const payload={schema_version:1,task_id:id,claim_id,context_id,queries:[{query:'Public HVAC business Fairfax',checked_at:f.now().toISOString(),urls:[candidate.identity.website]}],candidates:[candidate]};await worker.submit({id,claim_id,payload});return {worker,payload,candidate,claim_id,id,lane};
}
async function review(f,options){const r=await submit(f,options),worker=createCloudDiscoveryWorker(f.app,{actor:'reviewer',context_id:'independent-review'}),claim_id=r.id+'-review';await worker.claim({id:r.id,claim_id});const payload={schema_version:1,task_id:r.id,claim_id,context_id:'independent-review',submission_sha256:hash(r.payload),decisions:[cloudDiscoveryDecision(r.candidate,r.lane,r.claim_id)]};await worker.submit({id:r.id,claim_id,payload});return {...r,reviewer:worker,review:payload};}

test('distinct worker artifacts become canonical imports only through signed/coordinator review, for both lanes',async t=>{
 for(const lane of ['call-first','email-qualified']){
  const f=await cloudDiscoveryFixture(t);await f.ready();const r=await review(f,{lane});assert.equal(r.worker.import,undefined);assert.equal(r.reviewer.import,undefined);
  assert.deepEqual((await r.reviewer.context({id:r.id,claim_id:r.id+'-review'})).submission,r.payload);assert.equal(Object.keys((await f.store.snapshot()).prospects).length,0);
  await assert.rejects(cloudDiscoveryCommand(f.app,'import',{id:r.id,revision:(await f.store.snapshot()).revision},'friend'),/Assigned/);
  const result=await cloudDiscoveryCommand(f.app,'import',{id:r.id,revision:(await f.store.snapshot()).revision},'owner');assert.equal(result.imports[0].status,'Imported');const state=await f.store.snapshot(),record=state.prospects[result.imports[0].prospect_id];assert.equal(record.follow_up_owner,'owner');assert.equal(state.cloud_discovery.tasks.task.submission.payload,undefined);assert.ok([...f.objects.keys()].some(k=>k.startsWith('cloud-discovery/')));
  assert.equal(record.qualification?.verdict==='Research-qualified',lane==='email-qualified');assert.equal((await cloudDiscoveryCoordinator(f.app,'import',{id:r.id,revision:0})).duplicate,true);assert.equal(Object.keys((await f.store.snapshot()).prospects).length,1);
 }
});
test('17 percent reserve hold blocks worker claims/list and daily queue without research execution',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready(17);await create(f);const worker=createCloudDiscoveryWorker(f.app,{actor,context_id});await assert.rejects(worker.list(),/held/);await assert.rejects(worker.claim({id:'task',claim_id:'claim'}));await assert.rejects(cloudDiscoveryCoordinator(f.app,'queue-daily',{revision:(await f.store.snapshot()).revision}));assert.equal((await f.store.snapshot()).cloud_discovery.allowances[Object.keys((await f.store.snapshot()).cloud_discovery.allowances)[0]].used_attempts,0);
});
test('lost canonical/artifact acknowledgements and exact result retries do not create another claim or result',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();await create(f);const worker=createCloudDiscoveryWorker(f.app,{actor,context_id}),input={id:'task',claim_id:'claim'};f.control.lose=k=>k==='workspace';const claim=await worker.claim(input);assert.equal(claim.reconciled,true);assert.equal((await worker.claim(input)).duplicate,true);
 const payload={schema_version:1,task_id:'task',claim_id:'claim',context_id,queries:[{query:'No eligible candidates',checked_at:f.now().toISOString(),urls:[]}],candidates:[]};f.control.lose=k=>k.startsWith('cloud-discovery/');await worker.submit({...input,payload});assert.equal((await worker.submit({...input,payload})).duplicate,true);await assert.rejects(worker.submit({...input,payload:{...payload,queries:[{...payload.queries[0],query:'Changed bytes'}]}}),/changed retry/);
 f.advance(11*60000);assert.ok((await worker.receipt(input)).artifact);await assert.rejects(worker.context(input),/claim/);assert.equal((await worker.submit({...input,payload})).duplicate,true);assert.equal((await f.store.snapshot()).cloud_discovery.allowances[Object.keys((await f.store.snapshot()).cloud_discovery.allowances)[0]].used_attempts,1);
});
test('workers cannot cross principal/context scopes or reuse claims, and competing claims have one durable winner',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();await create(f);const worker=createCloudDiscoveryWorker(f.app,{actor,context_id});const results=await Promise.allSettled(['a','b'].map(claim_id=>worker.claim({id:'task',claim_id})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const saved=(await f.store.snapshot()).cloud_discovery.tasks.task.research_claim;
 const other=createCloudDiscoveryWorker(f.app,{actor,context_id:'other'});await assert.rejects(other.receipt({id:'task',claim_id:saved.id}),/receipt/);await assert.rejects(other.context({id:'task',claim_id:saved.id}));assert.throws(()=>createCloudDiscoveryWorker(f.app,{actor:'owner',context_id}),/Authenticated/);
 const reviewer=createCloudDiscoveryWorker(f.app,{actor:'reviewer',context_id});await assert.rejects(reviewer.claim({id:'task',claim_id:'review'}));await create(f,'second');await assert.rejects(worker.claim({id:'second',claim_id:saved.id}),/attempt/);
});
test('immutable policy, typed replay and live CAS deadline reject widened or late writes',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();const state=await f.store.snapshot(),tr={type:'create',actor:'owner',at:f.now().toISOString(),input:{revision:state.revision,id:'forged',lane:'call-first',count:1,assigned_to:'owner',area:f.app.config.cloud_discovery.areas[0],subtypes:['HVAC']}};
 await assert.rejects(f.app.change((s,c)=>{applyCloudDiscoveryTransition(s,c,tr);s.actions.evil={status:'Verified'};},{cloudDiscovery:tr}),/unrelated/);
 await assert.rejects(f.app.change((s,c)=>applyCloudDiscoveryTransition(s,c,tr),{cloudDiscovery:tr,mailboxWork:{}}),/Exclusive/);
 await assert.rejects(f.app.change((s,c)=>{applyCloudDiscoveryTransition(s,c,tr);f.advance(26000);},{cloudDiscovery:tr,cloudDiscoveryDeadline:+f.now()+25000}),/expired before CAS/);assert.equal((await f.store.snapshot()).cloud_discovery.tasks.forged,undefined);
 const changed=structuredClone(f.packet.envelope);changed.config.cloud_discovery.deploy_id='other';assert.throws(()=>validateManualEnvelope(changed,f.packet.binding),/configuration/);
 const old=await cloudDiscoveryFixture(t,{capability:'shared-mailbox-delivery-v1'});await assert.rejects(cloudDiscoveryCommand(old.app,'pause',{revision:0,paused:true,reason:'No capability'},'owner'),/workspace/);
});
test('expired invocation or revoked source during artifact I/O cannot publish a result or import',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();const r=await review(f);let once=false;f.control.beforeRead=async k=>{if(!once&&k.startsWith('cloud-discovery/')){once=true;f.advance(26000);}};await assert.rejects(cloudDiscoveryCommand(f.app,'import',{id:r.id,revision:(await f.store.snapshot()).revision},'owner'),/invocation expired/);assert.equal(Object.keys((await f.store.snapshot()).prospects).length,0);f.control.beforeRead=null;
 const first=[...f.objects.keys()].find(k=>k.startsWith('cloud-discovery/')&&!k.endsWith('/manifest'));f.objects.get(first).bytes[0]^=1;await assert.rejects(cloudDiscoveryCommand(f.app,'import',{id:r.id,revision:(await f.store.snapshot()).revision},'owner'),/integrity/);assert.equal(Object.keys((await f.store.snapshot()).prospects).length,0);
});
test('canonical replay requires durable artifact bytes and honors an outer worker deadline',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();await create(f);const worker=createCloudDiscoveryWorker(f.app,{actor,context_id});await worker.claim({id:'task',claim_id:'claim'});
 const state=await f.store.snapshot(),payload={schema_version:1,task_id:'task',claim_id:'claim',context_id,queries:[{query:'No eligible candidates',checked_at:f.now().toISOString(),urls:[]}],candidates:[]},artifact={sha256:hash(payload),bytes:Buffer.byteLength(JSON.stringify(payload)),reference:'cloud-discovery/'+hash(payload)};
 const tr={type:'submit',actor,at:f.now().toISOString(),input:{revision:state.revision,id:'task',claim_id:'claim',artifact,payload}};
 await assert.rejects(f.app.change((s,c)=>applyCloudDiscoveryTransition(s,c,tr),{cloudDiscovery:tr}),/missing/i);assert.equal((await f.store.snapshot()).cloud_discovery.tasks.task.submission,null);
 const bounded=createCloudDiscoveryWorker(f.app,{actor,context_id,deadline:+f.now()+100});f.advance(101);await assert.rejects(bounded.submit({id:'task',claim_id:'claim',payload}),/invocation expired/);assert.equal([...f.objects.keys()].filter(k=>k.startsWith('cloud-discovery/')).length,0);
});
test('only validated nonimportable reviewed content receives the coordinator hold witness',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();const candidate=cloudDiscoveryCandidate();candidate.packet.unknowns=Array.from({length:12},()=> 'Unknown '.repeat(190));const source=candidate.packet.sources[0];source.text+=' Unknown public details.'.repeat(250);source.content_sha256=sourceContentHash(source);await review(f,{candidate});
 const state=await f.store.snapshot();await assert.rejects(cloudDiscoveryCoordinator(f.app,'import',{id:'task',revision:state.revision}),error=>error.code==='DISCOVERY_IMPORT_INVALID'&&error.task_sha256===hash(state.cloud_discovery.tasks.task));assert.deepEqual(await f.store.snapshot(),state);
 const chunk=[...f.objects.keys()].find(k=>k.startsWith('cloud-discovery/')&&!k.endsWith('/manifest'));f.objects.get(chunk).bytes[0]^=1;await assert.rejects(cloudDiscoveryCoordinator(f.app,'import',{id:'task',revision:state.revision}),error=>error.code!=='DISCOVERY_IMPORT_INVALID');
});
