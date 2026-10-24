import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {getStore} from '@netlify/blobs';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';import {writeLifecycleBackup,readLifecycleBackup} from './lifecycle-backup.mjs';
import {prepareInertWorkspace,installInertWorkspace,exportInertBackup} from './inert-shared-workspace.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';import {readProjectAsset} from './project-assets.mjs';
import {createHostedDesk} from './hosted-desk.mjs';import {readDeskSnapshot} from './lifecycle-ui/snapshot-read.js';

const at='2026-10-24T20:00:00.000Z',origin='https://inert.example.invalid';
const scope={schema_version:1,capability:'inert-shared-v1',workspace_id:'synthetic-studio',run_id:'synthetic-production',mode:'production',state_schema:1,site_id:'synthetic-site',deploy_id:'synthetic-deploy',origin,namespace:'evz-inert-shared-synthetic-20261024'};
function sdkMemory(){
 const objects=new Map();let revision=0;const control={reads:0,writes:0,requests:[]};
 control.raw=getStore({name:scope.namespace,siteID:scope.site_id,token:'synthetic-only',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  const method=options.method.toUpperCase(),headers=new Headers(options.headers),key=new URL(url).pathname,entry=objects.get(key);control.requests.push({method,url:String(url),match:headers.get('if-match')});
  if(method==='GET'){control.reads++;return entry?new Response(entry.bytes,{headers:{etag:entry.etag}}):new Response(null,{status:404});}
  assert.equal(method,'PUT');assert.ok(headers.get('if-match')||headers.get('if-none-match')==='*');
  if(headers.get('if-none-match')==='*'&&entry||headers.has('if-match')&&headers.get('if-match')!==entry?.etag)return new Response(null,{status:412});
  const etag=`"${++revision}"`;objects.set(key,{bytes:options.body,etag});control.writes++;
  return new Response(null,{headers:{etag}});
 }});return control;
}
async function fixture(t,{volume=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'evz-inert-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const app=await StudioLifecycle.initialize({directory:join(directory,'source'),config:structuredClone(initialConfig),now:()=>new Date(at)});await app.apply(fixtureProspect('synthetic-project',at));
 const state=await app.snapshot();state.mode='production';state.run_id=scope.run_id;delete state.prospects['synthetic-project'].controlled;
 const pdf=Buffer.from('%PDF-1.4\n% new synthetic original\n'+('new fictional original bytes\n'.repeat(45000))+'%%EOF\n'),digest=originalDigest(pdf),path=`project-originals/${digest}.pdf`;
 await mkdir(join(app.directory,'project-originals'));await writeFile(join(app.directory,path),pdf);
 state.asset_index={design:{id:'design',name:'Synthetic approved original',scope:'project',project_id:'synthetic-project',baseline_version:'v1',choices:{owner:'v1',friend:'v1'},versions:{v1:{id:'v1',reference:'private-path:synthetic-original.pdf',verified_original:{reference:'private-path:synthetic-original.pdf',sha256:digest,bytes:pdf.length,mime_type:'application/pdf',name:'synthetic.pdf'},registered_by:'owner',registered_at:at}}}};
 state.actions={historical:{id:'historical',type:'email',prospect_id:'synthetic-project',status:'Pending'}};
 state.operations={lease:{owner:'old-host',expires_at:'2099-01-01T00:00:00Z'},requests:{external:{operation:'send',status:'Pending',id:'external'}},budget:{reserved_microcredits:123456,consumed_microcredits:80000,paused:true}};
 state.runtime={status:'Running',transport:'historical-host'};state.ai_attempts={immutable:{status:'Uncertain',reserved_microcredits:1900,receipt:'retained original attempt'}};
 if(volume){const r=state.prospects['synthetic-project'];for(let i=0;i<271;i++){const id=`synthetic-${i}`;state.prospects[id]={...structuredClone(r),id,name:`STUDIO TEST Inert ${i}`,retained_evidence:{text:`New fictional evidence ${i}. `.repeat(600)}};}state.synthetic_receipts='x'.repeat(Math.max(0,11_340_000-Buffer.byteLength(JSON.stringify(state))));}
 const backup=join(directory,'source.backup.json');await writeLifecycleBackup(app.directory,state,backup,at);
 const sourceConfig={...structuredClone(initialConfig),mode:'production',run_id:scope.run_id,calls_enabled:true,outreach_enabled:true,connector_writes_enabled:true,transcript_ai:{...initialConfig.transcript_ai,enabled:true,daily_calls:100},runtime:{enabled:true},release:{approved:true,fingerprint:'old'},call_release:{approved:true},sender:{operator_names:{owner:'Synthetic Owner',friend:'Synthetic Friend'},secret:'NEVER_COPY'}};
 const packet=await prepareInertWorkspace({backup,sourceConfig,scope}),sdk=sdkMemory(),store=new ConditionalLifecycleStore(sdk.raw,{inertBinding:packet.binding});
 return {directory,local:app.directory,state,pdf,path,packet,sdk,store,sourceConfig};
}
const note=id=>({id,prospect_id:'synthetic-project',type:'note_added',at,data:{note:`Private note ${id}`}});
const cookie=r=>r.headers.get('set-cookie')?.split(';',1)[0];
async function client(f,actor,overrides={}){
 const env={CONTEXT:'deploy-preview',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:'inert-shared-v1',EVZ_OPERATIONS_INERT_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43),...overrides};
 const request=(path,{method='GET',headers={},body}={})=>new Request(origin+'/desk'+path,{method,headers,body:body?JSON.stringify(body):undefined});
 const handler=createHostedDesk({env,storeFactory:namespace=>{assert.equal(namespace,scope.namespace);return f.sdk.raw;},now:()=>new Date(at)});
 const boot=await handler(request('/api/bootstrap'));if(boot.status!==200)return {handler,request,boot};const csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:initial,'content-type':'application/json','x-studio-token':csrf,origin},body:{key:env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']}}));assert.equal(login.status,200);
 const headers={cookie:initial+'; '+cookie(login),'content-type':'application/json','x-studio-token':csrf,origin};
 return {handler,request,headers,call:(path,body)=>handler(request(path,{headers,...(body?{method:'POST',body}:{})})),read:async()=>readDeskSnapshot(await handler(request('/api/state',{headers})),{path:'/api/state',fetch:path=>handler(request(path,{headers}))})};
}
test('11 MB production identity with original dependencies opens for both signed operators, permits notes and preserves all execution evidence',async t=>{
 const f=await fixture(t,{volume:true});assert.ok(Buffer.byteLength(JSON.stringify(f.packet.envelope))>11_338_010);
 assert.equal((await installInertWorkspace(null,f.packet)).dry_run,true);assert.equal(f.sdk.reads+f.sdk.writes,0);
 await installInertWorkspace(f.store,f.packet,{commit:true});assert.deepEqual(await f.store.snapshot(),f.state);
 assert.equal(f.packet.envelope.config.mode,'production');assert.equal(f.packet.envelope.config.sender.secret,undefined);assert.equal(f.packet.envelope.config.transcript_ai.daily_calls,100);assert.equal(f.packet.envelope.config.release.approved,false);
 const owner=await client(f,'owner'),friend=await client(f,'friend'),a=await owner.read(),b=await friend.read();assert.equal(a.current_operator,'owner');assert.equal(b.current_operator,'friend');assert.equal(a.prospects['synthetic-project'].controlled,undefined);assert.equal(a.shared_workspace.reconciliation.prior_lease,true);assert.equal(a.controls.runtime_enabled,false);
 const context=await(await friend.call('/api/project-context/synthetic-project')).json();assert.equal(context.source.company.id,'synthetic-project');assert.equal((await owner.call('/api/event',{revision:a.revision,event:note('owner-edit')})).status,200);assert.equal((await friend.read()).prospects['synthetic-project'].note,'Private note owner-edit');
 const after=await f.store.snapshot();for(const key of ['asset_index','operations','runtime','ai_attempts','actions'])assert.deepEqual(after[key],f.state[key]);
 const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)});app.originalStore=blobProjectOriginalStore(f.sdk.raw);assert.deepEqual((await readProjectAsset(app,'synthetic-project','design','v1')).bytes,f.pdf);
 const manifest=await friend.call('/api/project-original/synthetic-project/design/v1');assert.equal(manifest.status,200);const m=(await manifest.json()).manifest;assert.equal(m.sha256,originalDigest(f.pdf));const chunks=[];for(let i=0;i<m.chunks.length;i++)chunks.push(Buffer.from(await(await friend.call(`/api/project-original/synthetic-project/design/v1/chunk/${i}`)).arrayBuffer()));assert.deepEqual(Buffer.concat(chunks),f.pdf);
 const exported=join(f.directory,'export.backup.json');await exportInertBackup(app,f.local,exported);assert.deepEqual((await readLifecycleBackup(exported)).state,after);
 const destination=join(f.directory,'restored');await StudioLifecycle.restore({input:exported,destination});const restored=await StudioLifecycle.open({directory:destination,now:()=>new Date(at)});assert.deepEqual((await readProjectAsset(restored,'synthetic-project','design','v1')).bytes,f.pdf);const restoredState=await restored.snapshot();assert.equal(restoredState.actions.historical.status,'Uncertain');assert.equal(restoredState.operations.requests.external.status,'Uncertain');assert.equal(restoredState.operations.lease,undefined);assert.deepEqual(restoredState.operations.budget,f.state.operations.budget);assert.deepEqual(restoredState.asset_index,f.state.asset_index);assert.equal(restored.config.outreach_enabled,false);
 assert.ok(f.sdk.requests.filter(r=>r.method==='GET').every(r=>r.url.startsWith('https://strong.example.invalid/')));
});
test('CAS conflicts and both uncertain write outcomes preserve exact event IDs, history and budgets without rerunning execution',async t=>{
 const f=await fixture(t);await installInertWorkspace(f.store,f.packet,{commit:true});const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)}),other=await StudioLifecycle.fromStore({store:f.store,now:app.now}),revision=f.state.revision;
 const results=await Promise.allSettled([app.apply(note('owner-race'),{actor:'owner',expectedRevision:revision}),other.apply(note('friend-race'),{actor:'friend',expectedRevision:revision})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'STATE_CONFLICT');
 const set=f.sdk.raw.setJSON.bind(f.sdk.raw);f.sdk.raw.setJSON=async(...args)=>{await set(...args);throw Error('Committed SDK response loss');};const current=(await app.snapshot()).revision;assert.equal((await app.apply(note('lost'),{actor:'friend',expectedRevision:current})).reconciled,true);assert.equal((await other.apply(note('lost'),{actor:'friend',expectedRevision:current})).duplicate,true);
 f.sdk.raw.setJSON=async()=>{throw Error('Uncommitted SDK response loss');};const before=await app.snapshot();await assert.rejects(app.apply(note('uncommitted'),{actor:'owner',expectedRevision:before.revision}),e=>e.code==='STATE_UNCERTAIN');assert.deepEqual(await app.snapshot(),before);f.sdk.raw.setJSON=set;assert.equal((await app.apply(note('uncommitted'),{actor:'owner',expectedRevision:before.revision})).execution,'disabled');assert.deepEqual((await app.snapshot()).operations,f.state.operations);
 await assert.rejects(app.change(state=>{state.operations.budget.consumed_microcredits=0;}),/rejects worker/);
 await assert.rejects(app.change(state=>{state.operations.budget.consumed_microcredits=0;},{inertNote:{event:note('forged'),actor:'owner',revision:(before.revision+1)}}),/protected records/);
 await assert.rejects(app.apply({...note('inherited'),prospect_id:'constructor'},{actor:'owner',expectedRevision:before.revision+1}),/existing record/);
 await assert.rejects(app.apply({...note('call'),type:'call_logged'},{actor:'owner',expectedRevision:before.revision+1}),/private notes only/);
 await assert.rejects(app.apply(note('fixture'),{actor:'controlled-fixture',expectedRevision:before.revision+1}),/signed/);
 await app.apply({...note('actor-spoof'),actor:'friend',fingerprint:'forged'},{actor:'owner',expectedRevision:before.revision+1});const signed=(await app.snapshot()).events['actor-spoof'];assert.equal(signed.actor,'owner');assert.equal(signed.fingerprint,hash({event:{...note('actor-spoof'),actor:'friend',fingerprint:'forged'},actor:'owner'}));
});
test('inert routes deny execution and unsupported files before store access; old namespace, changed binding and config cannot widen authority',async t=>{
 const f=await fixture(t);await installInertWorkspace(f.store,f.packet,{commit:true});const owner=await client(f,'owner',{EVZ_OPERATIONS_SHARED_ORIGINALS:'fictional-chunks-v1',EVZ_FULL_CALL_TRANSCRIPTION_ENABLED:'fictional-background-v1'}),writes=f.sdk.writes,reads=f.sdk.reads;
 for(const route of ['/api/gateway-proof/run','/api/team-notifications/prepare','/api/call-audio','/api/project-original/synthetic-project/design/v1/reserve','/api/backup','/api/project-authoring/claim','/api/research-priority','/api/full-call-transcription/approve','/api/information-draft','/api/pause'])assert.equal((await owner.call(route,{})).status,409,route);
 for(const route of ['/api/gateway-proof','/api/call-transcription','/call-audio/synthetic-project/old','/api/backup'])assert.equal((await owner.call(route)).status,409,route);
 assert.equal(f.sdk.writes,writes);assert.equal(f.sdk.reads,reads);
 const foreign=await owner.handler(new Request('https://foreign.example.invalid/desk/api/state',{headers:owner.headers}));assert.equal(foreign.status,403);
 assert.equal((await owner.handler(owner.request('/api/state'))).status,401);assert.equal((await owner.handler(owner.request('/api/event',{method:'POST',headers:{...owner.headers,'x-studio-token':'wrong'},body:{event:note('csrf')}}))).status,403);
 for(const override of [{CONTEXT:'production'},{SITE_ID:'another'},{DEPLOY_ID:'another'},{EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-synthetic-123'},{EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview'}])assert.equal((await client(f,'owner',override)).boot.status,503);
 await assert.rejects(new ConditionalLifecycleStore(f.sdk.raw).snapshot(),/fictional/);await assert.rejects(installInertWorkspace(f.store,f.packet,{commit:true}),/already exists/);
 const entry=await f.store.envelope(),changed=structuredClone(entry.data);changed.config.sender.operator_names.owner='Changed name';await f.sdk.raw.setJSON('workspace',changed,{onlyIfMatch:entry.etag});assert.equal((await owner.call('/api/state')).status,503);await assert.rejects(f.store.config(),/configuration changed/);
});
test('empty destinations never auto-seed; changed source or dependencies fail before publication; import response loss reads back exact source',async t=>{
 const f=await fixture(t),owner=await client(f,'owner');assert.equal((await owner.call('/api/state')).status,503);assert.equal(f.sdk.writes,0);
 const changed=structuredClone(f.packet.envelope);changed.state.operations.budget.reserved_microcredits=0;await assert.rejects(installInertWorkspace(f.store,{...f.packet,envelope:changed},{commit:true}),/records changed/);assert.equal(f.sdk.writes,0);
 const badFiles=new Map(f.packet.files);badFiles.set(f.path,Buffer.from('%PDF-broken'));await assert.rejects(installInertWorkspace(f.store,{...f.packet,files:badFiles},{commit:true}),/checksum/);assert.equal(f.sdk.writes,0);
 await writeFile(join(f.local,f.path),Buffer.from('%PDF-corrupt local original'));const app=await StudioLifecycle.fromStore({store:await(async()=>{await installInertWorkspace(f.store,f.packet,{commit:true});return f.store;})(),now:()=>new Date(at)});await assert.rejects(exportInertBackup(app,f.local,join(f.directory,'bad.backup.json')),/checksum/);
 const second=sdkMemory(),store=new ConditionalLifecycleStore(second.raw,{inertBinding:f.packet.binding});const set=second.raw.setJSON.bind(second.raw);second.raw.setJSON=async(...args)=>{await set(...args);throw Error('Lost import response');};assert.equal((await installInertWorkspace(store,f.packet,{commit:true})).reconciled,true);
 assert.deepEqual(await store.snapshot(),f.state);assert.equal(hash(f.packet.envelope.inert_source),f.packet.binding.manifest_sha256);
});
