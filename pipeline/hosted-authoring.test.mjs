import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {fixture,env,origin,at,event,runtime,source,review,substitutedPNG} from './fixtures/hosted-authoring.mjs';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {authoringManifest,blobAuthoringStore,attachHostedAuthoring} from './hosted-authoring.mjs';
import {connectSharedAuthoring} from './hosted-authoring-client.mjs';
import {sharedDeskSession} from './shared-originals-client.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {beginContinuation,renderContinuation} from './project-continuation.mjs';

const name='STUDIO TEST Shared project';
test('reconciled interrupted upload and retained Held export permit complete backup after successful revision',async t=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts'),p=`/api/project-author/${job.id}/file/input.json`,s=source(job.context);s.limitations='Fictional interrupted source. '.repeat(50000);
 const bytes=Buffer.from(JSON.stringify(s,null,2)),m=authoringManifest(bytes);await f.session.json(p+'/reserve',{method:'POST',body:{manifest:m}});await f.session.json(p+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(m)},body:bytes.subarray(0,1_000_000)});
 await assert.rejects(client.backup('unused.json'),/unfinished authoring/);
 const observed=await client.recovery(job.id);assert.equal(observed.status,'Claimed');
 const closed=await client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Interrupted fictional upload; retain exact available evidence.',disposition:'close-publication'});assert.equal(closed.status,'Reconciled');assert.equal(closed.recovery.files.find(v=>v.name==='input.json').candidate.disposition,'partial');
 await client.revise(job.id,'Prepare corrected source from fresh context.');const next=await client.begin(name,'website-concepts');let changed=false;
 f.storage.hook=async key=>{if(!changed&&key.endsWith('/output.pdf/manifest')){changed=true;await f.app.apply(event('recovery-note','note_added',{note:'Stale context during fictional render.'}),{actor:'friend'});}};
 await assert.rejects(client.render(next.id,source(next.context),await runtime()),/Context, reply/);f.storage.hook=null;assert.equal((await client.inspect(next.id)).status,'Held');
 await client.revise(next.id,'Retain failed context attempt and correct it.');const done=await completed(f);await assert.rejects(client.backup('unused.json'),/unfinished authoring/);
 const old=await (await f.connect('friend')).recovery(next.id);await assert.rejects((await f.connect('friend')).reconcile(next.id,{snapshot:old.snapshot,reason:'Wrong actor',disposition:'close-publication'}),/operator/);
 await client.reconcile(next.id,{snapshot:old.snapshot,reason:'Retain stale export as unusable evidence.',disposition:'close-publication'});
 const directory=await mkdtemp(join(tmpdir(),'evz-reconciled-'));t.after(()=>rm(directory,{recursive:true,force:true}));const backup=join(directory,'portable.json');await (await f.connect('friend')).backup(backup);const restored=join(directory,'restored');await StudioLifecycle.restore({input:backup,destination:restored});const state=JSON.parse(await readFile(join(restored,'lifecycle-state.json'))),history=state.prospects['shared-proof'].project_work[done.job.work_id].authoring_history;
 assert.equal(history.length,2);assert.ok(history.every(j=>j.status==='Reconciled'));assert.equal(state.prospects['shared-proof'].project_email_drafts.length,1);assert.equal(state.prospects['shared-proof'].project_email_drafts[0].attachment.sha256,done.receipt.pdf.sha256);
 const entry=history[0].recovery.files.find(v=>v.name==='input.json').candidate.chunks[0];assert.deepEqual(await readFile(join(restored,'project-authored',job.id,entry.evidence)),bytes.subarray(0,1_000_000));
 assert.deepEqual(await (await f.connect('friend')).download(job.id,entry.evidence),bytes.subarray(0,1_000_000));await assert.rejects(done.client.recovery(done.job.id),/Published authoring/);
 const store=blobAuthoringStore(f.storage.raw),published=await store.manifest(done.job.id,'output.pdf'),key=`authoring-chunks/${published.sha256}/0-${published.chunks[0]}`,prior=f.storage.entries.get(key);f.storage.entries.delete(key);await assert.rejects(client.backup(join(directory,'missing-published.json')),/Missing authoring chunk/);f.storage.entries.set(key,prior);prior.bytes[0]^=1;await assert.rejects(client.backup(join(directory,'corrupt-published.json')),/integrity/);prior.bytes[0]^=1;
 const evidence=await store.manifest(job.id,entry.evidence),evidenceKey=`authoring-chunks/${evidence.sha256}/0-${evidence.chunks[0]}`;f.storage.entries.get(evidenceKey).bytes[0]^=1;await assert.rejects(client.backup(join(directory,'corrupt-recovery.json')),/integrity/);
});
test('active renderer is never declared stopped; reconciliation fences late publication and resume cannot manufacture a stopped Held state',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts');let entered,release;
 const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);let paused=false;
 f.storage.hook=async key=>{if(!paused&&key.endsWith('/renderer-evidence.json/manifest')){paused=true;entered();await blocked;}};
 const rendering=client.render(job.id,source(job.context),await runtime()).then(value=>({value}),error=>({error}));await waiting;
 try{
  assert.equal((await client.inspect(job.id)).status,'Rendering');await assert.rejects(client.revise(job.id,'Pretend it stopped.'),/Rendering/);
  await assert.rejects(client.resume(job.id),/unavailable/);assert.equal((await client.inspect(job.id)).status,'Rendering');
  const observation=await client.recovery(job.id);await assert.rejects(client.reconcile(job.id,{snapshot:observation.snapshot,reason:'Declare stopped',disposition:'stopped'}),/stop cannot be attested/);
  const closed=await client.reconcile(job.id,{snapshot:observation.snapshot,reason:'Fence uncertain renderer publication; do not attest process exit.',disposition:'close-publication'});assert.equal(closed.recovery.prior_status,'Rendering');assert.equal(closed.recovery.execution,'not-attested-stopped');assert.equal(closed.recovery.export_usable,false);
 }finally{release();}
 const result=await rendering;assert.match(result.error.message,/Context, reply/);assert.equal((await client.inspect(job.id)).status,'Reconciled');assert.equal((await f.app.snapshot()).asset_index[job.id],undefined);assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_email_drafts,undefined);
 await client.revise(job.id,'Use a new explicit claim.');const next=await client.begin(name,'website-concepts');assert.notEqual(next.id,job.id);
});

test('recovery snapshots reject changed transfers, changed workspace, CAS races and differing retries',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts'),initial=await client.recovery(job.id),p=`/api/project-author/${job.id}/file/input.json`,bytes=Buffer.from(JSON.stringify(source(job.context),null,2)),manifest=authoringManifest(bytes);
 await f.session.json(p+'/reserve',{method:'POST',body:{manifest}});await assert.rejects(client.reconcile(job.id,{snapshot:initial.snapshot,reason:'Stale transfer snapshot',disposition:'close-publication'}),/snapshot changed/);
 const before=await client.recovery(job.id);await f.app.apply(event('change-recovery','note_added',{note:'Concurrent workspace change.'}),{actor:'friend'});await assert.rejects(client.reconcile(job.id,{snapshot:before.snapshot,reason:'Stale workspace',disposition:'close-publication'}),/snapshot changed/);
 await f.session.json(p+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes}).catch(()=>{});
 const observed=await client.recovery(job.id);let raced=false;
 f.storage.hook=async key=>{if(!raced&&key.includes('/recovery-')&&key.endsWith('/manifest')){raced=true;await f.app.apply(event('recovery-cas-race','note_added',{note:'Race during immutable evidence persistence.'}),{actor:'friend'});}};
 await assert.rejects(client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Race guard',disposition:'close-publication'}),/snapshot changed before closure/);f.storage.hook=null;assert.equal((await client.inspect(job.id)).status,'Claimed');
 const fresh=await client.recovery(job.id),input={snapshot:fresh.snapshot,reason:'Explicit evidence closure.',disposition:'close-publication'};f.loseResponse('reconcile');await assert.rejects(client.reconcile(job.id,input),/response lost/);assert.equal((await client.reconcile(job.id,input)).status,'Reconciled');await assert.rejects(client.reconcile(job.id,{...input,reason:'Changed reason'}),/retry differs/);
});
test('in-flight resume and review readbacks cannot cross a later publication fence; both preparing roles can reconcile',async()=>{
 for(const actor of ['owner','friend'])for(const operation of ['resume','complete']){
  const f=await fixture({actor}),done=await rendered(f),{job,client,receipt}=done,rasters=operation==='complete'?await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit boundary substitute',pages:receipt.pages.map(()=>substitutedPNG)}):null;let entered,release;
  const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);let paused=false;
  f.storage.readHook=async key=>{if(!paused&&key===`project-authored/${job.id}/export.json/manifest`){paused=true;entered();await blocked;}};
  const pending=(operation==='resume'?client.resume(job.id):client.complete(job.id,review(receipt,rasters))).then(value=>({value}),error=>({error}));await waiting;
  try{const observed=await client.recovery(job.id);await client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Fence in-flight readback without attesting process exit.',disposition:'close-publication'});}finally{release();}
  assert.match((await pending).error.message,/Context, reply/);assert.equal((await client.inspect(job.id)).status,'Reconciled');const state=await f.app.snapshot();assert.equal(state.asset_index[job.id],undefined);assert.equal(state.prospects['shared-proof'].project_email_drafts,undefined);await assert.rejects(client.resume(job.id),/Resume only/);await assert.rejects(client.complete(job.id,review(receipt,rasters)),/Render and inspect/);
 }
});
async function rendered(f){const client=await f.connect(),job=await client.begin(name,'website-concepts');await client.render(job.id,source(job.context),await runtime());return {client,job,receipt:JSON.parse(await client.download(job.id,'export.json'))};}
async function completed(f){const {client,job,receipt}=await rendered(f),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Substituted one-pixel unit-test boundary only',pages:receipt.pages.map(()=>substitutedPNG)});const saved=await client.complete(job.id,review(receipt,rasters));return {client,job,receipt,saved};}

test('fresh signed owner and friend callers retain actual Node PDF, exact dependencies, held output and portable G1 restore',async t=>{
 for(const actor of ['owner','friend']){
  const f=await fixture({actor}),client=await f.connect(),job=await client.begin(name,'website-concepts'),r=await runtime({large:true});
  await client.render(job.id,source(job.context),r);const receipt=JSON.parse(await client.download(job.id,'export.json')),pdf=await client.download(job.id,'output.pdf');assert.equal((await PDFDocument.load(pdf)).getPageCount(),5);
  await assert.rejects(client.complete(job.id,review(receipt)),/Canonical layout is not visual review/);
  const rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Substituted unit-test boundary; actual proof is separate',pages:receipt.pages.map(()=>substitutedPNG)}),saved=await client.complete(job.id,review(receipt,rasters));
  assert.equal(saved.readback.companion_draft.send_authorized,false);assert.equal(saved.readback.original.sha256,receipt.pdf.sha256);assert.equal(saved.readback.provenance.runtime_sha256,hash(r));
  const other=await f.connect(actor==='owner'?'friend':'owner');assert.deepEqual(await other.download(job.id,'output.pdf'),pdf);assert.deepEqual(await other.download(job.id,'runtime.json'),Buffer.from(JSON.stringify(r,null,2)));assert.equal((await other.inspect(job.id)).reviewed_by,actor);
  const directory=await mkdtemp(join(tmpdir(),'evz-hosted-authoring-'));t.after(()=>rm(directory,{recursive:true,force:true}));const backup=join(directory,'portable.json');await other.backup(backup);const destination=join(directory,'restored');await StudioLifecycle.restore({input:backup,destination});const restored=await StudioLifecycle.open({directory:destination});
  assert.deepEqual((await readProjectAsset(restored,'shared-proof',saved.readback.result.asset_id,saved.readback.result.version_id)).bytes,pdf);assert.equal((await restored.snapshot()).asset_index[job.id].baseline_version,null);assert.deepEqual(JSON.parse(await readFile(join(destination,'project-authored',job.id,'runtime.json'))),r);
  assert.ok(f.requests.filter(v=>v.path.includes('/chunk/')&&v.method==='POST').length>8);assert.ok(f.requests.every(v=>v.body_bytes<=1_000_000));assert.ok(f.storage.requests.filter(v=>v.method==='GET').every(v=>v.url.startsWith('https://strong.example.invalid/')));assert.ok(f.storage.requests.some(v=>v.fresh==='*'));assert.ok(f.storage.requests.some(v=>v.match));
 }
});

test('interrupted immutable uploads resume exact bytes; partial, foreign, altered, oversized and stale candidates hold',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts'),p=`/api/project-author/${job.id}/file/input.json`,bytes=Buffer.from(JSON.stringify(source(job.context),null,2)),manifest=authoringManifest(bytes),body={manifest};
 await f.session.json(p+'/reserve',{method:'POST',body});await assert.rejects(f.session.json(p+'/complete',{method:'POST',body:{transfer_id:hash(manifest)}}),/Missing authoring chunk/);
 await assert.rejects(client.download(job.id,'input.json'),/incomplete/);await assert.rejects(client.backup('unused.json'),/unfinished authoring/);
 await assert.rejects(f.session.json(p+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:Buffer.from('wrong')}),/differs/);
 await assert.rejects(f.session.json(p+'/reserve',{method:'POST',body:{manifest:{...manifest,bytes:4_000_001}}}),/manifest/);
 await assert.rejects(f.session.json(p+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:Buffer.alloc(1_000_001)}),/exceeds 1 MB/);
 f.storage.lose=`authoring-chunks/${manifest.sha256}/0-${manifest.chunks[0]}`;
 await f.session.json(p+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes});
 await f.session.json(p+'/complete',{method:'POST',body:{transfer_id:hash(manifest)}});assert.deepEqual(await client.download(job.id,'input.json'),bytes);
 await assert.rejects(f.session.json(p+'/reserve',{method:'POST',body:{manifest:authoringManifest(Buffer.from('{}'))}}),/differs or is uncertain/);
 const friend=await sharedDeskSession({origin,key:env.EVZ_OPERATIONS_FRIEND_KEY,fetcher:f.fetcher});await assert.rejects(friend.json(p+'/reserve',{method:'POST',body}),/operator changed/);
 await f.app.apply(event('context-changed','note_added',{note:'Fresh context invalidates pending runtime and output.'}),{actor:'friend'});
 await assert.rejects(client.render(job.id,source(job.context),await runtime()),/context or operator changed/);assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_email_drafts,undefined);
});

test('concurrent render calls reserve one export; lost render and completion responses require exact inspection and cannot duplicate publication',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts'),s=source(job.context),r=await runtime();
 const results=await Promise.allSettled([client.render(job.id,s,r),client.render(job.id,s,r)]);assert.ok(results.some(v=>v.status==='fulfilled'));const inspected=await (await f.connect()).inspect(job.id);assert.equal(inspected.status,'Rendered');
 const receipt=JSON.parse(await client.download(job.id,'export.json')),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit test substitute',pages:receipt.pages.map(()=>substitutedPNG)}),exact=review(receipt,rasters);f.loseResponse('complete');await assert.rejects(client.complete(job.id,exact),/response lost/);
 const fresh=await f.connect();assert.equal((await fresh.inspect(job.id)).status,'Review');await fresh.complete(job.id,exact);await assert.rejects(fresh.complete(job.id,{...exact,notes:'Different review'}),/retry differs/);
 const state=await f.app.snapshot();assert.equal(state.prospects['shared-proof'].project_email_drafts.length,1);assert.equal(Object.values(state.events).filter(e=>e.type==='project_authoring_reviewed').length,1);
 const g=await fixture(),gc=await g.connect(),gj=await gc.begin(name,'website-concepts');g.loseResponse('render');await assert.rejects(gc.render(gj.id,source(gj.context),await runtime()),/response lost/);assert.equal((await (await g.connect()).inspect(gj.id)).status,'Rendered');
});

test('concurrent signed server render requests admit one Rendering reservation through actual SDK conditional writes',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts'),store=blobAuthoringStore(f.storage.raw);await store.put(job.id,'input.json',Buffer.from(JSON.stringify(source(job.context),null,2)));await store.put(job.id,'runtime.json',Buffer.from(JSON.stringify(await runtime(),null,2)));
 const input={method:'POST',body:{job_id:job.id}},results=await Promise.allSettled([f.session.json('/api/project-author/render',input),f.session.json('/api/project-author/render',input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/changed|reserved/);assert.equal((await client.inspect(job.id)).status,'Rendered');
});

test('context changes during rendering and missing/corrupt dependencies prevent output authority and complete backup',async t=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts');let changed=false;
 f.storage.hook=async key=>{if(!changed&&key.endsWith('/output.pdf/manifest')){changed=true;await f.app.apply(event('mid-render-note','note_added',{note:'Concurrent change while the PDF was being persisted.'}),{actor:'friend'});}};
 await assert.rejects(client.render(job.id,source(job.context),await runtime()),/Context, reply/);assert.equal((await client.inspect(job.id)).status,'Held');assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_email_drafts,undefined);
 const g=await fixture(),done=await completed(g),store=blobAuthoringStore(g.storage.raw),m=await store.manifest(done.job.id,'runtime.json'),chunkKey=`authoring-chunks/${m.sha256}/0-${m.chunks[0]}`,original=g.storage.entries.get(chunkKey);g.storage.entries.delete(chunkKey);
 await assert.rejects(done.client.download(done.job.id,'runtime.json'),/Missing authoring chunk/);await assert.rejects(done.client.backup('unused.json'),/Missing authoring chunk/);g.storage.entries.set(chunkKey,original);original.bytes[0]^=1;await assert.rejects(done.client.backup('unused.json'),/integrity/);original.bytes[0]^=1;
 const raster=await store.manifest(done.job.id,'review-page-1.png'),rasterKey=`authoring-chunks/${raster.sha256}/0-${raster.chunks[0]}`;g.storage.entries.get(rasterKey).bytes[0]^=1;await assert.rejects(done.client.backup('unused.json'),/integrity/);
});

test('signed retrieval rejects guessed jobs, executable files, disabled gate, production, foreign origin and missing CSRF; D2 adapter stays closed',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts');
 assert.equal((await f.make()(new Request(origin+'/desk/api/project-author/inspect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({job_id:job.id})}))).status,403);
 assert.equal((await f.make()(new Request(origin+`/desk/api/project-author/${job.id}/file/context.json`))).status,401);
 await assert.rejects(client.download('author-'+'0'.repeat(32),'context.json'),/Unknown registered/);await assert.rejects(client.download(job.id,'renderer.mjs'),/retained authoring file/);
 const disabledFetch=(url,options)=>f.make({...env,EVZ_OPERATIONS_PROJECT_AUTHORING:''})(new Request(url,options)),disabled=await connectSharedAuthoring({origin,key:env.EVZ_OPERATIONS_OWNER_KEY,fetcher:disabledFetch}),before=f.storage.requests.length;await assert.rejects(disabled.inspect(job.id),/disabled/);assert.equal(f.storage.requests.length,before);
 const production=f.make({...env,CONTEXT:'production'});assert.equal((await production(new Request(origin+'/desk/api/state'))).status,503);
 const foreign=await f.session.request('/api/bootstrap',{headers:{origin:'https://foreign.invalid'}}).catch(e=>e);assert.match(foreign.message,/not permitted/);
 const app=await f.fresh();app.store.inertBinding={};assert.throws(()=>attachHostedAuthoring(app,f.storage.raw),/fictional/);
});

test('whole-file manifest forgery and untrusted runtime code fields cannot publish a dependency or render',async()=>{
 const f=await fixture(),client=await f.connect(),job=await client.begin(name,'website-concepts'),p=`/api/project-author/${job.id}/file/input.json`,bytes=Buffer.from(JSON.stringify(source(job.context),null,2)),manifest={...authoringManifest(bytes),sha256:'0'.repeat(64)};
 await f.session.json(p+'/reserve',{method:'POST',body:{manifest}});await f.session.json(p+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes});await assert.rejects(f.session.json(p+'/complete',{method:'POST',body:{transfer_id:hash(manifest)}}),/Incomplete authoring dependency/);await assert.rejects(client.download(job.id,'input.json'),/incomplete/);
 const g=await fixture(),gc=await g.connect(),gj=await gc.begin(name,'website-concepts'),r=await runtime();r.python='/uploaded/executable';await assert.rejects(gc.render(gj.id,source(gj.context),r),/Unsupported renderer\/resource fields/);assert.equal((await gc.inspect(gj.id)).status,'Claimed');assert.equal((await g.app.snapshot()).prospects['shared-proof'].project_email_drafts,undefined);
});

test('changed workspace during backup read rejects the prior snapshot instead of publishing a mixed portable package',async()=>{
 const f=await fixture(),done=await completed(f),bundle=await f.session.json('/api/project-author/backup');await f.app.apply(event('after-backup-note','note_added',{note:'Change after the exact manifest read.'}),{actor:'friend'});
 await assert.rejects(f.session.request('/api/project-author/backup/chunk?snapshot='+hash(bundle)+'&file=0&chunk=0'),/Backup changed/);assert.equal((await done.client.inspect(done.job.id)).readback.companion_draft.send_authorized,false);
});

test('portable restore supports protected continued refinement and preserves approved baseline and prior held exact attachment',async t=>{
 const f=await fixture(),done=await completed(f),job=done.job;
 await f.app.apply(event('approve-baseline','asset_version_selected',{asset_id:job.id,version_id:job.id},'studio-assets'),{actor:'friend'});
 const directory=await mkdtemp(join(tmpdir(),'evz-refine-hosted-'));t.after(()=>rm(directory,{recursive:true,force:true}));const backup=join(directory,'portable.json');await done.client.backup(backup);const restored=join(directory,'restored');await StudioLifecycle.restore({input:backup,destination:restored});const app=await StudioLifecycle.open({directory:restored,now:()=>new Date(at)});
 const feedback='Use "#F3EBDD" for page background.';await app.apply(event('background','asset_feedback_added',{asset_id:job.id,version_id:job.id,feedback},'studio-assets'),{actor:'owner'});await app.apply(event('refine','concept_refinement_requested',{asset_id:job.id,version_id:job.id,selected_direction:'Direction 0',feedback}),{actor:'owner'});
 const next=await beginContinuation(app,{name,kind:'website-refinement'}),prior=JSON.parse(await readFile(join(restored,'project-authored',job.id,'authored.json'))),s={schema_version:1,kind:'website-refinement',context_sha256:next.context_sha256,author:'Fictional continued refinement',requirements_review:'Preserve approved layout and wording.',visual_premise:'Same composition with requested background.',limitations:'Technical continued-refinement fixture only.',questions:[],selected_direction:'Direction 0',previous_asset_id:job.id,previous_version_id:job.id,feedback,preserves_direction:true,pages:[prior.pages[0]]},sourcePath=join(directory,'refinement.json');await writeFile(sourcePath,JSON.stringify(s));
 await renderContinuation(app,next.id,sourcePath,JSON.parse(await readFile(join(restored,'project-authored',job.id,'runtime.json'))));
 const authored=JSON.parse(await readFile(join(next.directory,'authored.json')));assert.equal(authored.pages[0].background,'#F3EBDD');assert.deepEqual(authored.pages[0].commands,prior.pages[0].commands);const state=await app.snapshot();assert.equal(state.asset_index[job.id].baseline_version,job.id);assert.equal(state.prospects['shared-proof'].project_email_drafts[0].attachment.sha256,done.receipt.pdf.sha256);
});
