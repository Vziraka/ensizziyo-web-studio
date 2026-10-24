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
