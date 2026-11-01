import test from 'node:test';import assert from 'node:assert/strict';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {hash} from './lifecycle.mjs';
import {cloudDiscoveryFixture,cloudDiscoveryCandidate,cloudDiscoveryDecision} from './cloud-discovery-fixtures.mjs';
import {cloudDiscoveryCommand,createCloudDiscoveryWorker} from './cloud-discovery-service.mjs';
import {sourceContentHash} from './sources.mjs';
import {cloudDiscoveryCapability} from './cloud-discovery.mjs';
import {openCloudDiscoveryWorker} from './cloud-discovery-gateway.mjs';
import {createCloudDiscoveryMcp} from './cloud-discovery-mcp.mjs';
import {createCloudDiscoveryClock,cloudDiscoveryClockEntry} from './cloud-discovery-host.mjs';
import {createHostedDesk} from './hosted-desk.mjs';

function gateway(f){const credential='ab'.repeat(32),reviewCredential='cd'.repeat(32),origin='https://research.example.invalid',context={site:{id:'research-site'},deploy:{id:'research-deploy',context:'deploy-preview'}};
 const policy={site_id:context.site.id,deploy_id:context.deploy.id,origin,policy_sha256:hash(f.app.config.cloud_discovery),research_context:'research-context',review_context:'review-context',research_credential_sha256:hash(credential),review_credential_sha256:hash(reviewCredential)};
 const env={EVZ_DISCOVERY_GATEWAY:'bounded-public-research-v1',EVZ_DISCOVERY_GATEWAY_POLICY:JSON.stringify(policy),EVZ_DISCOVERY_SOURCE_BINDING:JSON.stringify(f.packet.binding),EVZ_DISCOVERY_SOURCE_BLOBS_TOKEN:'fictional-source-token-no-live-access'};
 const open=options=>openCloudDiscoveryWorker({env,now:f.now,storeFactory:()=>f.raw,...options});return {credential,reviewCredential,origin,context,policy,env,open};}
function host(f){const b=f.packet.binding.scope,env={CONTEXT:'production',SITE_ID:b.site_id,DEPLOY_ID:b.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:b.capability,EVZ_DISCOVERY_CLOCK_RUNTIME:cloudDiscoveryCapability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:b.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:b.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)},context={site:{id:b.site_id},deploy:{id:b.deploy_id,context:'production',published:true}};return {env,context,origin:b.origin};}
async function queue(f,id='one'){return cloudDiscoveryCommand(f.app,'create',{revision:(await f.store.snapshot()).revision,id,lane:'call-first',count:1,assigned_to:'owner',area:f.app.config.cloud_discovery.areas[0],subtypes:['HVAC']},'owner');}

test('gateway binds different credentials, contexts, deployment and exact source policy before exposing workers',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();await queue(f);const g=gateway(f),options={credential:g.credential,context:g.context,origin:g.origin};
 for(const patch of [{credential:'00'.repeat(32)},{context:{...g.context,deploy:{id:'other'}}},{origin:'https://other.example.invalid'},{env:{...g.env,EVZ_DISCOVERY_GATEWAY:''}},{env:{...g.env,EVZ_DISCOVERY_GATEWAY_POLICY:JSON.stringify({...g.policy,review_credential_sha256:g.policy.research_credential_sha256})}},{env:{...g.env,EVZ_DISCOVERY_GATEWAY_POLICY:JSON.stringify({...g.policy,policy_sha256:'0'.repeat(64)})}}])await assert.rejects(g.open({...options,...patch}));
 const worker=await g.open(options);assert.equal((await worker.list()).tasks[0].id,'one');const c=await worker.claim({id:'one',claim_id:'author'});assert.equal(c.claim.context_id,'research-context');assert.equal(c.claim.actor,'researcher');
 const reviewer=await g.open({...options,credential:g.reviewCredential});await assert.rejects(reviewer.context({id:'one',claim_id:'author'}));assert.equal('import' in worker,false);assert.equal('approve' in worker,false);
});
test('real MCP SDK retains an exact empty result, independent review and durable receipt without messages',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();await queue(f);const g=gateway(f),handler=createCloudDiscoveryMcp({openWorker:g.open});
 async function connect(credential){const client=new Client({name:'fixture',version:'1'}),transport=new StreamableHTTPClientTransport(new URL(g.origin+'/desk-discovery/mcp'),{requestInit:{headers:{Authorization:'Bearer '+credential}},fetch:(url,options)=>handler(new Request(url,options),g.context)});await client.connect(transport);t.after(()=>client.close());return client;}
 const researcher=await connect(g.credential),reviewer=await connect(g.reviewCredential),names=(await researcher.listTools()).tools.map(t=>t.name);assert.deepEqual(names,['evz_discovery_tasks','evz_discovery_claim','evz_discovery_context','evz_discovery_submit','evz_discovery_receipt']);
 const call=async(client,name,args)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent;};
 await call(researcher,'evz_discovery_claim',{id:'one',claim_id:'author'});const source={schema_version:1,task_id:'one',claim_id:'author',context_id:'research-context',queries:[{query:'Fictional empty public search',checked_at:f.now().toISOString(),urls:[]}],candidates:[]};
 await call(researcher,'evz_discovery_submit',{id:'one',claim_id:'author',payload:source});await call(reviewer,'evz_discovery_claim',{id:'one',claim_id:'review'});
 const context=await call(reviewer,'evz_discovery_context',{id:'one',claim_id:'review'});assert.deepEqual(context.submission,source);
 await call(reviewer,'evz_discovery_submit',{id:'one',claim_id:'review',payload:{schema_version:1,task_id:'one',claim_id:'review',context_id:'review-context',submission_sha256:hash(source),decisions:[]}});
 assert.equal((await call(researcher,'evz_discovery_receipt',{id:'one',claim_id:'author'})).status,'Reviewed');
 await cloudDiscoveryCommand(f.app,'import',{id:'one',revision:(await f.store.snapshot()).revision},'owner');assert.equal((await f.store.snapshot()).cloud_discovery.tasks.one.status,'Imported');assert.equal(Object.keys((await f.store.snapshot()).prospects).length,0);
 assert.equal((await handler(new Request(g.origin+'/desk-discovery/mcp'),g.context)).status,401);
 assert.equal((await handler(new Request(g.origin+'/desk-discovery/mcp',{headers:{authorization:'Bearer '+g.credential,origin:'https://foreign.invalid'}}),g.context)).status,403);
});
test('clock remains disabled by default, rejects preview and low reserve, derives one finite task under published authority',async t=>{
 assert.doesNotMatch(cloudDiscoveryClockEntry({}),/schedule:/);assert.doesNotMatch(cloudDiscoveryClockEntry({CONTEXT:'deploy-preview',EVZ_DISCOVERY_CLOCK_BUILD:cloudDiscoveryCapability}),/schedule:/);assert.match(cloudDiscoveryClockEntry({CONTEXT:'production',EVZ_DISCOVERY_CLOCK_BUILD:cloudDiscoveryCapability}),/schedule:/);
 const f=await cloudDiscoveryFixture(t),h=host(f),invoke=(context=h.context)=>createCloudDiscoveryClock({env:h.env,storeFactory:()=>f.raw,now:f.now})(new Request(h.origin+'/clock',{method:'POST',body:JSON.stringify({next_run:new Date(+f.now()+300000).toISOString()})}),context);
 assert.equal((await invoke({...h.context,deploy:{...h.context.deploy,context:'deploy-preview'}})).status,503);await f.ready(17);assert.equal((await invoke()).status,503);await f.ready();assert.equal((await invoke()).status,200);
 const tasks=Object.values((await f.store.snapshot()).cloud_discovery.tasks);assert.equal(tasks.length,1);assert.equal(tasks[0].count,25);assert.equal(tasks[0].lane,'email-qualified');assert.equal(tasks[0].created_by,'discovery');
});
test('signed HTTP exposes discovery status and role controls; old profile and forged coordinator route remain denied',async t=>{
 for(const capability of [cloudDiscoveryCapability,'shared-mailbox-delivery-v1']){const f=await cloudDiscoveryFixture(t,{capability}),h=host(f),handler=createHostedDesk({env:h.env,storeFactory:()=>f.raw,now:f.now}),request=(path,opts)=>new Request(h.origin+'/desk'+path,opts),cookie=r=>r.headers.get('set-cookie').split(';')[0];
 const boot=await handler(request('/api/bootstrap'),h.context);assert.equal(boot.status,200);const csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:initial,origin:h.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:h.env.EVZ_OPERATIONS_FRIEND_KEY})}),h.context);assert.equal(login.status,200);
 const headers={cookie:initial+'; '+cookie(login),origin:h.origin,'content-type':'application/json','x-studio-token':csrf},state=await handler(request('/api/state',{headers}),h.context);assert.equal(state.status,200);const view=await state.json();assert.equal(Boolean(view.cloud_discovery_status),capability===cloudDiscoveryCapability);
 const pause=await handler(request('/api/cloud-discovery/pause',{method:'POST',headers,body:JSON.stringify({revision:(await f.store.snapshot()).revision,paused:true,reason:'Teammate pause'})}),h.context);assert.equal(pause.status,capability===cloudDiscoveryCapability?200:409);
 assert.equal((await handler(request('/api/cloud-discovery/queue-daily',{method:'POST',headers,body:'{}'}),h.context)).status,409);
 }
});

test('independent deadline regression: stalled scheduled body cancels without opening storage',async t=>{
 const f=await cloudDiscoveryFixture(t),h=host(f),controller=new AbortController();let cancelled=false,opens=0;
 t.mock.method(AbortSignal,'timeout',()=>controller.signal);
 const body=new ReadableStream({cancel(){cancelled=true;}}),request=new Request(h.origin+'/clock',{method:'POST',body,duplex:'half'});
 const pending=createCloudDiscoveryClock({env:h.env,storeFactory:()=>{opens++;return f.raw;},now:f.now})(request,h.context);
 controller.abort();assert.equal((await pending).status,400);assert.equal(cancelled,true);assert.equal(opens,0);
});

test('independent deadline regression: delayed canonical read cannot queue after invocation expiry',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();const h=host(f),before=await f.store.snapshot();let delayed=false;
 f.control.beforeRead=async key=>{if(key==='workspace'&&!delayed){delayed=true;f.advance(25001);}};
 const response=await createCloudDiscoveryClock({env:h.env,storeFactory:()=>f.raw,now:f.now})(new Request(h.origin+'/clock',{method:'POST',body:JSON.stringify({next_run:new Date(+f.now()+300000).toISOString()})}),h.context);
 assert.equal(response.status,503);assert.deepEqual(await f.store.snapshot(),before);
});

test('independent deadline regression: stalled initial canonical read returns at abort',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();const h=host(f),controller=new AbortController();t.mock.method(AbortSignal,'timeout',()=>controller.signal);
 let release,entered;const enteredRead=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});f.control.beforeRead=async()=>{entered();await blocked;};
 const pending=createCloudDiscoveryClock({env:h.env,storeFactory:()=>f.raw,now:f.now})(new Request(h.origin+'/clock',{method:'POST',body:JSON.stringify({next_run:new Date(+f.now()+300000).toISOString()})}),h.context);
 await enteredRead;controller.abort();
 try{const result=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still waiting'),25))]);assert.notEqual(result,'still waiting','Host must bound the initial store wait too');assert.equal(result.status,503);}
 finally{release();await pending;}
});

test('clock holds a nonimportable reviewed head then imports the next task, but never holds storage corruption',async t=>{
 const f=await cloudDiscoveryFixture(t);await f.ready();
 async function reviewed(id,n,oversized=false){await queue(f,id);const c=cloudDiscoveryCandidate(n);if(oversized){c.packet.unknowns=Array.from({length:12},()=> 'Unknown '.repeat(190));const s=c.packet.sources[0];s.text+=' Unknown public details.'.repeat(250);s.content_sha256=sourceContentHash(s);}
 const w=createCloudDiscoveryWorker(f.app,{actor:'researcher',context_id:'r'}),claim_id=id+'-r';await w.claim({id,claim_id});const payload={schema_version:1,task_id:id,claim_id,context_id:'r',queries:[{query:'Public HVAC',checked_at:f.now().toISOString(),urls:[c.identity.website]}],candidates:[c]};await w.submit({id,claim_id,payload});const r=createCloudDiscoveryWorker(f.app,{actor:'reviewer',context_id:'v'});await r.claim({id,claim_id:id+'-v'});await r.submit({id,claim_id:id+'-v',payload:{schema_version:1,task_id:id,claim_id:id+'-v',context_id:'v',submission_sha256:hash(payload),decisions:[cloudDiscoveryDecision(c,'call-first',claim_id)]}});}
 await reviewed('oversized',0,true);await reviewed('valid',1);const before=await f.store.snapshot(),h=host(f),invoke=()=>createCloudDiscoveryClock({env:h.env,storeFactory:()=>f.raw,now:f.now})(new Request(h.origin+'/clock',{method:'POST',body:JSON.stringify({next_run:new Date(+f.now()+300000).toISOString()})}),h.context);
 assert.equal((await invoke()).status,200);const held=await f.store.snapshot();assert.equal(held.cloud_discovery.tasks.oversized.status,'Held');assert.deepEqual(held.cloud_discovery.allowances,before.cloud_discovery.allowances);for(const key of ['research_claim','submission','review_claim','review'])assert.deepEqual(held.cloud_discovery.tasks.oversized[key],before.cloud_discovery.tasks.oversized[key]);assert.equal((await invoke()).status,200);assert.equal((await f.store.snapshot()).cloud_discovery.tasks.valid.status,'Imported');
 await reviewed('corrupt',2);const state=await f.store.snapshot(),ref=state.cloud_discovery.tasks.corrupt.submission.artifact.reference,chunk=[...f.objects.keys()].find(k=>k.startsWith(ref+'/')&&!k.endsWith('/manifest'));f.objects.get(chunk).bytes[0]^=1;assert.equal((await invoke()).status,503);assert.deepEqual(await f.store.snapshot(),state);
 f.objects.get(chunk).bytes[0]^=1;let reads=0;f.control.beforeRead=async key=>{if(key==='workspace'&&++reads===4){f.control.beforeRead=null;await queue(f,'unrelated');}};
 assert.equal((await invoke()).status,503);assert.equal(reads,4);const raced=await f.store.snapshot();assert.deepEqual(raced.cloud_discovery.tasks.corrupt,state.cloud_discovery.tasks.corrupt);assert.equal(raced.cloud_discovery.tasks.unrelated.status,'Queued');assert.equal(raced.revision,state.revision+1);
});

test('actual MCP SDK returns a near-limit context once without doubling the artifact bytes',async t=>{
 const value={submission:{evidence:'x'.repeat(1990000)}},handler=createCloudDiscoveryMcp({openWorker:async()=>({context:async()=>value})}),client=new Client({name:'large-context',version:'1'}),transport=new StreamableHTTPClientTransport(new URL('https://research.example.invalid/desk-discovery/mcp'),{requestInit:{headers:{Authorization:'Bearer '+'ab'.repeat(32)}},fetch:(url,options)=>handler(new Request(url,options),{})});await client.connect(transport);t.after(()=>client.close());const result=await client.callTool({name:'evz_discovery_context',arguments:{id:'task',claim_id:'claim'}});assert.equal(result.isError,undefined);assert.deepEqual(result.structuredContent,value);assert.ok(JSON.stringify(result.content).length<1000);
});
