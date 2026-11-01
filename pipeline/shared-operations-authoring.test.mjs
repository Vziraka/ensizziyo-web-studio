import test from 'node:test';import assert from 'node:assert/strict';
import {fixture as dispatchFixture,at} from './fixtures/internal-dispatch.mjs';
import {connectSharedAuthoring} from './hosted-authoring-client.mjs';
import {runtime,source,review,substitutedPNG} from './fixtures/hosted-authoring.mjs';
import {name} from './fixtures/shared-project-continuation.mjs';
import {hash} from './lifecycle.mjs';
import {authoringManifest,blobAuthoringStore} from './hosted-authoring.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {validateDispatchPolicy,dispatchAuthoringSchema} from './shared-internal-dispatch.mjs';
import {readFile} from 'node:fs/promises';
const fixture=(t,options={})=>dispatchFixture(t,{authoring:true,authorize:false,...options});
const connect=(f,actor='owner')=>connectSharedAuthoring({origin:f.env.EVZ_OPERATIONS_ORIGIN,key:f.env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher:f.fetcher});
async function save(f,type,data={},actor='owner',id=type){const e={id,type,data,prospect_id:type.startsWith('asset_')?'studio-assets':'shared-proof',at:f.now().toISOString()};return (await f.session(actor)).json('/api/event',{method:'POST',body:{event:e,revision:(await f.app.snapshot()).revision}});}
async function rendered(f,actor='owner'){const client=await connect(f,actor),job=await client.begin(name,'website-concepts');await client.render(job.id,source(job.context),await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json'));return {client,job,receipt};}
async function completed(f,actor='owner'){const r=await rendered(f,actor),rasters=await r.client.rasters(r.job.id,{pdf_sha256:r.receipt.pdf.sha256,rasterizer:'Substituted unit PNG only; separate private proof inspects real rasters',pages:r.receipt.pages.map(()=>substitutedPNG)}),exact=review(r.receipt,rasters),done=await r.client.complete(r.job.id,exact);return {...r,exact,done};}
test('signed assigned operators author actual Node PDFs through the sole dispatch authority, with exact held attachment and retry',async t=>{
 for(const actor of ['owner','friend']){const f=await fixture(t);if(actor==='friend'){await save(f,'call_claimed');await save(f,'follow_up_handed_off',{to:actor});}const before=await f.app.snapshot(),r=await completed(f,actor),s=await f.app.snapshot();assert.equal(f.store.projectBinding,null);assert.equal(f.store.dispatchBinding.scope.capability,'shared-operations-authoring-v1');assert.equal(s.prospects['shared-proof'].project_work['website-concepts'].prepared_by,actor);assert.equal(r.done.readback.companion_draft.send_authorized,false);assert.equal(r.done.readback.original.sha256,r.receipt.pdf.sha256);assert.deepEqual(s.operations,before.operations);assert.deepEqual(s.ai_attempts,before.ai_attempts);const other=await connect(f,actor==='owner'?'friend':'owner');assert.deepEqual(await other.download(r.job.id,'output.pdf'),await r.client.download(r.job.id,'output.pdf'));assert.equal((await r.client.complete(r.job.id,r.exact)).readback.original.sha256,r.receipt.pdf.sha256);assert.equal(f.wire.calls.length,0);}
});

test('exact new schema/gate rejects cross-profile authoring, mixed typed commands and provider routes before effects',async t=>{
 const proposed=JSON.parse(await readFile(new URL('./shared-operations-authoring.example.json',import.meta.url)));validateDispatchPolicy(proposed);assert.equal(proposed.status,'UNAPPROVED');assert.deepEqual(proposed.authoring,dispatchAuthoringSchema);assert.throws(()=>validateDispatchPolicy(proposed,{active:true}));
 for(const change of [p=>delete p.authoring,p=>p.authoring.transitions.push('generate'),p=>p.human_events.project.push('note_added')]){const p=structuredClone(proposed);change(p);assert.throws(()=>validateDispatchPolicy(p));}
 const f=await fixture(t),before=await f.app.snapshot(),session=await f.session('owner');
 f.env.EVZ_OPERATIONS_PROJECT_AUTHORING='';await assert.rejects((await connect(f)).begin(name,'website-concepts'),/dispatch only/);f.env.EVZ_OPERATIONS_PROJECT_AUTHORING='shared-operations-node-v1';
 for(const path of ['generate','generation-status','generation-render'])await assert.rejects(session.json('/api/project-author/'+path,{method:'POST',body:{}}),/dispatch only/);
 for(const path of ['/api/call-audio','/api/exact-mail/dispatch','/api/known-research/run','/api/google-drive-oauth/start','/api/google-calendar-oauth/start'])await assert.rejects(session.json(path,{method:'POST',body:{}}));
 const disabled=createHostedDesk({env:{...f.env,EVZ_OPERATIONS_PROJECT_AUTHORING:''},storeFactory:()=>f.storage.raw,now:f.now});const denied=await disabled(new Request(f.env.EVZ_OPERATIONS_ORIGIN+'/desk/project-authoring.js'));assert.equal(denied.status,200);
 for(const options of [{projectAuthoring:{},projectRecord:{}},{projectAuthoring:{type:'generate',input:{},actor:'owner',details:{}}},{projectReconcile:{},projectGeneration:{}},{projectAuthoring:{type:'revise',input:{},actor:'owner',details:{reset_allowance:true}}}])await assert.rejects(f.app.change(s=>s.revision++,options));
 assert.deepEqual(await f.app.snapshot(),before);assert.equal(f.wire.calls.length,0);
 for(const profile of [{},{manual:true},{records:true}]){const old=await dispatchFixture(t,{...profile,authorize:false});await assert.rejects((await connect(old)).begin(name,'website-concepts'),/dispatch only/);await assert.rejects(old.app.change(()=>{},{projectReconcile:{}}));}
});

test('lost render/complete responses and completion CAS conflicts never duplicate output or overwrite concurrent human state',async t=>{
 for(const boundary of ['render','complete','cas','corrupt']){
  const f=await fixture(t);let lost=false;const client=await connectSharedAuthoring({origin:f.env.EVZ_OPERATIONS_ORIGIN,key:f.env.EVZ_OPERATIONS_OWNER_KEY,fetcher:async(url,options)=>{const response=await f.fetcher(url,options);if(!lost&&new URL(url).pathname==='/desk/api/project-author/'+boundary&&response.ok){lost=true;throw Error('Lost '+boundary+' response');}return response;}}),job=await client.begin(name,'website-concepts');
  if(boundary==='render'){await assert.rejects(client.render(job.id,source(job.context),await runtime()),/Lost render/);assert.equal((await client.inspect(job.id)).status,'Rendered');await client.resume(job.id);}else await client.render(job.id,source(job.context),await runtime());
  const receipt=JSON.parse(await client.download(job.id,'export.json')),raster=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit boundary only',pages:receipt.pages.map(()=>substitutedPNG)}),exact=review(receipt,raster);
  if(boundary==='cas'){const original=f.storage.raw.setJSON.bind(f.storage.raw);let once=false;f.storage.raw.setJSON=async(key,data,options)=>{if(key==='workspace'&&!once&&data.state.prospects['shared-proof'].project_work['website-concepts'].status==='Review'){once=true;await save(f,'note_added',{note:'Concurrent completion CAS edit'},'friend','completion-cas');}return original(key,data,options);};await assert.rejects(client.complete(job.id,exact),/changed/);const s=await f.app.snapshot();assert.equal(s.events['completion-cas'].actor,'friend');assert.equal(s.asset_index[job.id],undefined);assert.equal(s.prospects['shared-proof'].project_email_drafts,undefined);continue;}
  if(boundary==='corrupt'){const m=await blobAuthoringStore(f.storage.raw).manifest(job.id,'output.pdf'),key=`authoring-chunks/${m.sha256}/0-${m.chunks[0]}`;f.storage.entries.get(key).bytes[0]^=1;await assert.rejects(client.complete(job.id,exact),/integrity|hash/);assert.equal((await f.app.snapshot()).asset_index[job.id],undefined);continue;}
  if(boundary==='complete')await assert.rejects(client.complete(job.id,exact),/Lost complete/);else await client.complete(job.id,exact);
  const done=await client.complete(job.id,exact),saved=await f.app.snapshot();assert.equal(done.readback.original.sha256,receipt.pdf.sha256);assert.equal(saved.prospects['shared-proof'].project_email_drafts.length,1);assert.equal(Object.values(saved.events).filter(e=>e.type==='project_authoring_reviewed').length,1);assert.equal(f.wire.calls.length,0);
 }
});

test('a concurrent signed sidecar changes the recovery observation even without a state revision',async t=>{
 const f=await fixture(t),client=await connect(f),job=await client.begin(name,'website-concepts'),observed=await client.recovery(job.id),session=await f.session('owner'),bytes=Buffer.from(JSON.stringify(await runtime(),null,2)),manifest=authoringManifest(bytes);let once=false;
 f.storage.hook=async key=>{if(!once&&key.includes('/recovery-')&&key.endsWith('/manifest')){once=true;await session.json(`/api/project-author/${job.id}/file/runtime.json/reserve`,{method:'POST',body:{manifest}});}};
 await assert.rejects(client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Evidence changed during persistence',disposition:'close-publication'}),/observation changed/);f.storage.hook=null;assert.equal(once,true);assert.equal((await client.inspect(job.id)).status,'Claimed');assert.equal((await client.recovery(job.id)).files.find(f=>f.name==='runtime.json').candidate.disposition,'partial');
});

test('signed context changes at immutable transfer, rendering and completion awaits preserve evidence and fence publication',async t=>{
 for(const actor of ['owner','friend'])for(const boundary of ['transfer','renderer','complete']){
  const f=await fixture(t);await save(f,'call_claimed');if(actor==='friend')await save(f,'follow_up_handed_off',{to:actor});
  const client=await connect(f,actor),job=await client.begin(name,'website-concepts');let once=false;
  const mutate=async()=>{if(once)return;once=true;await save(f,'note_added',{note:'Current human context changed at '+boundary},actor==='owner'?'friend':'owner','context-'+boundary);};
  let receipt,rasters;if(boundary==='complete'){await client.render(job.id,source(job.context),await runtime());receipt=JSON.parse(await client.download(job.id,'export.json'));rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit boundary PNG only',pages:receipt.pages.map(()=>substitutedPNG)});f.storage.readHook=async key=>{if(key===`project-authored/${job.id}/export.json/manifest`)await mutate();};}
  else f.storage.hook=async key=>{if(key===`project-authored/${job.id}/${boundary==='transfer'?'input.json':'renderer-evidence.json'}/manifest`)await mutate();};
  await assert.rejects(boundary==='complete'?client.complete(job.id,review(receipt,rasters)):client.render(job.id,source(job.context),await runtime()),/context|Context|operator/);f.storage.hook=null;f.storage.readHook=null;
  const saved=await f.app.snapshot();assert.equal(once,true);assert.equal(saved.events['context-'+boundary].actor,actor==='owner'?'friend':'owner');assert.equal(saved.asset_index[job.id],undefined);assert.equal(saved.prospects['shared-proof'].project_email_drafts,undefined);
  const observed=await client.recovery(job.id);assert.ok(observed.files.some(f=>f.published||f.candidate));const other=await connect(f,actor==='owner'?'friend':'owner');await assert.rejects(other.reconcile(job.id,{snapshot:observed.snapshot,reason:'Foreign closure',disposition:'close-publication'}),/preparing operator/);
  const closed=await client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Retain incomplete exact evidence after context change.',disposition:'close-publication'});assert.equal(closed.actor,actor);assert.equal(closed.recovery.execution,'not-attested-stopped');assert.equal(closed.recovery.export_usable,false);assert.equal(f.wire.calls.length,0);
 }
});

test('handoff, stop, baseline selection and dispute during render hold original claims without transferring preparing authority',async t=>{
 for(const boundary of ['handoff','stop','selection','dispute']){
  const f=await fixture(t,{sourceChange:s=>{const a=s.asset_index.template;a.versions.v2={...structuredClone(a.versions.v1),id:'v2',label:'Alternative template'};}});await save(f,'call_claimed');await save(f,'asset_version_selected',{asset_id:'template',version_id:'v1'},'owner','initial-baseline');const client=await connect(f),job=await client.begin(name,'website-concepts');let once=false;
  f.storage.hook=async key=>{if(once||key!==`project-authored/${job.id}/renderer-evidence.json/manifest`)return;once=true;if(boundary==='handoff')await save(f,'follow_up_handed_off',{to:'friend'});else if(boundary==='stop')await save(f,'contact_stopped',{reason:'do_not_contact'},'friend');else await save(f,boundary==='selection'?'asset_version_selected':'asset_version_disputed',{asset_id:'template',version_id:'v2'},'friend');};
  await assert.rejects(client.render(job.id,source(job.context),await runtime()),/Context|operator|Ready/);f.storage.hook=null;
  const state=await f.app.snapshot(),work=state.prospects['shared-proof'].project_work['website-concepts'];assert.equal(once,true);assert.equal(work.execution.actor,'owner');assert.equal(state.asset_index[job.id],undefined);if(boundary==='handoff'){assert.equal(work.assigned_to,'friend');await assert.rejects((await connect(f,'friend')).resume(job.id),/preparing|actor|Context|Resume only/);}
  const observed=await client.recovery(job.id);await client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Close retained original operator claim.',disposition:'close-publication'});assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_work['website-concepts'].execution.actor,'owner');
 }
});

test('human and incoming writes share CAS during authoring; standing pause/expiry/runtime and original uncertainty never grant or remove interactive authority',async t=>{
 for(const control of ['unapproved','paused','expired','runtime','incoming']){
  const f=await fixture(t,{authorize:control!=='unapproved'});let client=await connect(f);const job=await client.begin(name,'website-concepts'),before=await f.app.snapshot();
  if(control==='paused')await f.control('pause',{reason:'Explicit background pause'},'friend');if(control==='expired'){f.setNow('2026-10-31T13:07:00Z');client=await connect(f);}if(control==='runtime')f.env.EVZ_INTERNAL_DISPATCH_RUNTIME='';
  if(control==='incoming'){await f.clock();await f.run();await assert.rejects(client.render(job.id,source(job.context),await runtime()),/context|Context/);assert.equal((await f.app.snapshot()).prospects['shared-proof'].reply.source_id,'new-incoming');}
  else {await client.render(job.id,source(job.context),await runtime());assert.equal((await client.inspect(job.id)).status,'Rendered');}
  const saved=await f.app.snapshot();assert.deepEqual(saved.ai_attempts,before.ai_attempts);assert.deepEqual(saved.operations.budget,before.operations.budget);if(control==='incoming'){assert.equal(saved.actions.historic.status,'Uncertain');assert.deepEqual(saved.actions.historic.payload,before.actions.historic.payload);}else assert.deepEqual(saved.actions.historic,before.actions.historic);assert.equal(saved.operations.requests.old.status,'Pending');
 }
});

test('active render, advancing recovery, evidence/state races and lost signed responses retain exact actor and publication fence',async t=>{
 for(const actor of ['owner','friend']){
  const f=await fixture(t);await save(f,'call_claimed');if(actor==='friend')await save(f,'follow_up_handed_off',{to:actor});const client=await connect(f,actor),job=await client.begin(name,'website-concepts');let entered,release,once=false;const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
  f.storage.hook=async key=>{if(!once&&key===`project-authored/${job.id}/renderer-evidence.json/manifest`){once=true;entered();await blocked;}};
  const rendering=client.render(job.id,source(job.context),await runtime()).then(value=>({value}),error=>({error}));await waiting;
  try{assert.equal((await client.inspect(job.id)).status,'Rendering');await assert.rejects(client.revise(job.id,'Pretend stopped'),/Rendering/);const observed=await client.recovery(job.id);const original=f.storage.hook;f.storage.hook=async key=>{if(key.includes('/recovery-'))f.advance(7);await original(key);};
   const input={snapshot:observed.snapshot,reason:'Fence publication while process ownership remains uncertain.',disposition:'close-publication'};let lost=false;const uncertain=await connectSharedAuthoring({origin:f.env.EVZ_OPERATIONS_ORIGIN,key:f.env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher:async(url,options)=>{const response=await f.fetcher(url,options);if(!lost&&url.endsWith('/reconcile')&&response.ok){lost=true;throw Error('Lost committed response');}return response;}});
   await assert.rejects(uncertain.reconcile(job.id,input),/Lost committed/);const closed=await client.reconcile(job.id,input);assert.equal(closed.recovery.actor,actor);assert.equal(closed.recovery.execution,'not-attested-stopped');assert.notEqual(closed.recovery.at,f.now().toISOString());await assert.rejects(client.reconcile(job.id,{...input,reason:'Different retry'}),/retry differs/);
  }finally{release();}assert.match((await rendering).error.message,/Context|context/);f.storage.hook=null;const state=await f.app.snapshot();assert.equal(state.asset_index[job.id],undefined);assert.equal(state.prospects['shared-proof'].project_work['website-concepts'].execution.status,'Reconciled');
 }
 const f=await fixture(t),client=await connect(f),job=await client.begin(name,'website-concepts'),bytes=Buffer.from(JSON.stringify(source(job.context),null,2)),manifest=authoringManifest(bytes),session=await f.session('owner'),path=`/api/project-author/${job.id}/file/input.json`;
 const first=await client.recovery(job.id);await session.json(path+'/reserve',{method:'POST',body:{manifest}});await assert.rejects(client.reconcile(job.id,{snapshot:first.snapshot,reason:'Stale observed evidence',disposition:'close-publication'}),/snapshot changed/);
 await session.json(path+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes});let observed=await client.recovery(job.id),raced=false;
 f.storage.hook=async key=>{if(!raced&&key.includes('/recovery-')&&key.endsWith('/manifest')){raced=true;await save(f,'note_added',{note:'Concurrent state during evidence persistence'},'friend','recovery-state');}};
 await assert.rejects(client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Stale state at closure',disposition:'close-publication'}),/snapshot changed before closure/);f.storage.hook=null;observed=await client.recovery(job.id);
 const original=f.storage.raw.setJSON.bind(f.storage.raw);let cas=false;f.storage.raw.setJSON=async(key,data,options)=>{if(key==='workspace'&&!cas){cas=true;await save(f,'note_added',{note:'CAS rival'},'friend','cas-rival');}return original(key,data,options);};
 await assert.rejects(client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Concurrent CAS closure',disposition:'close-publication'}),/changed/);assert.equal((await client.inspect(job.id)).status,'Claimed');assert.equal((await f.app.snapshot()).events['cas-rival'].actor,'friend');
});
