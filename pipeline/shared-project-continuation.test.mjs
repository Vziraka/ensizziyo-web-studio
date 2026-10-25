import test from 'node:test';import assert from 'node:assert/strict';
import {join} from 'node:path';import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fixture,name,event,origin,scope} from './fixtures/shared-project-continuation.mjs';
import {runtime,source,review,substitutedPNG} from './fixtures/hosted-authoring.mjs';
import {hash,StudioLifecycle} from './lifecycle.mjs';
import {projectContext,projectWorkContext} from './project-work.mjs';
import {prepareProjectWorkspace,installProjectWorkspace} from './shared-project-continuation.mjs';
import {readLifecycleBackup,writeLifecycleBackup} from './lifecycle-backup.mjs';
import {blobAuthoringStore,attachHostedAuthoring} from './hosted-authoring.mjs';
import {prepareDispatchWorkspace} from './shared-internal-dispatch.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {fictionalBlobs} from './fixtures/hosted-authoring.mjs';
async function apply(f,e,who='owner',revision){const client=await f.session(who);return client.json('/api/event',{method:'POST',body:{event:e,revision:revision??(await f.app.snapshot()).revision}});}
async function completed(f,who='owner'){
 const client=await f.connect(who),job=await client.begin(name,'website-concepts');await client.render(job.id,source(job.context),await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json')),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Test-only substituted PNG; private proof uses actual PDF rasters',pages:receipt.pages.map(()=>substitutedPNG)});const exact=review(receipt,rasters);const done=await client.complete(job.id,exact);return {client,job,receipt,exact,done};
}
const assetEvent=(id,type,data)=>event(id,type,data,'studio-assets');

test('separate exact binding keeps production identity, historical budgets and equal signed project authority; default/manual/inert stay separate',async t=>{
 for(const who of ['owner','friend']){const f=await fixture(t,{actor:who}),c=await completed(f,who),s=await f.app.snapshot();assert.equal(s.mode,'production');assert.equal(s.prospects['shared-proof'].controlled,false);assert.equal(s.prospects['shared-proof'].project_work['website-concepts'].prepared_by,who);assert.deepEqual(s.operations,f.state.operations);assert.deepEqual(s.ai_attempts,f.state.ai_attempts);assert.deepEqual(s.actions,f.state.actions);const session=await f.session(who),original=await session.json('/api/project-original/shared-proof/template/v1'),response=await session.request('/api/project-original/shared-proof/template/v1/chunk/0'),bytes=Buffer.from(await response.arrayBuffer());assert.equal((await import('./shared-project-originals.mjs')).originalDigest(bytes),original.original.sha256);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(c.done.companion_draft.send_authorized,false);assert.equal(c.done.companion_draft.attachment.sha256,c.receipt.pdf.sha256);assert.equal((await (await f.connect(who==='owner'?'friend':'owner')).inspect(c.job.id)).status,'Review');
 await assert.rejects((await f.connect()).download('author-'+'0'.repeat(32),'context.json'),/Unknown registered/);
 for(const change of [{EVZ_OPERATIONS_PROJECT_AUTHORING:undefined},{DEPLOY_ID:'other'},{EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview'},{EVZ_OPERATIONS_DESK_ENABLED:'shared-manual-records-v1'}]){const handler=f.make(change);assert.notEqual((await handler(new Request(origin+'/desk/api/project-author/inspect',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))).status,200);}
 }
});

test('signed feedback and protected refinement preserve composition/baseline, inspect exact held output and restore every dependency for fresh continuation',async t=>{
 const f=await fixture(t),c=await completed(f);await apply(f,assetEvent('approve','asset_version_selected',{asset_id:c.job.id,version_id:c.job.id}),'friend');
 await apply(f,assetEvent('background','asset_feedback_added',{asset_id:c.job.id,version_id:c.job.id,feedback:'Use "#EDF1E8" for page background.',scope:'project',project_id:'shared-proof'}),'friend');
 await apply(f,assetEvent('heading','asset_feedback_added',{asset_id:c.job.id,version_id:c.job.id,feedback:'Use "Manrope" for heading font.',scope:'project',project_id:'shared-proof'}));
 await apply(f,event('refinement','concept_refinement_requested',{asset_id:c.job.id,version_id:c.job.id,selected_direction:'d0',feedback:'Keep composition and wording; apply the supported background and heading rules.'}));
 const client=await f.connect(),job=await client.begin(name,'website-refinement');assert.equal(job.context.source.approved_assets[0].version_id,c.job.id);assert.ok(job.originals.some(o=>o.editable_source?.sha256));
 const baseline=JSON.parse(await client.download(c.job.id,'authored.json'));const s={...source(job.context),kind:'website-refinement',selected_direction:'d0',previous_asset_id:c.job.id,previous_version_id:c.job.id,feedback:job.context.source.request.feedback,preserves_direction:true,pages:[baseline.pages[0]]};delete s.directions;
 await client.render(job.id,s,await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json')),r=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit substitute only',pages:[substitutedPNG]}),done=await client.complete(job.id,review(receipt,r));assert.equal(done.readback.context.source.approved_assets[0].version_id,c.job.id);const authored=JSON.parse(await client.download(job.id,'authored.json'));assert.equal(authored.pages[0].background,'#EDF1E8');assert.equal(authored.pages[0].commands[1].font,'Manrope');assert.deepEqual(authored.pages[0].commands.filter(v=>v.role!=='heading'),baseline.pages[0].commands.filter(v=>v.role!=='heading'));
 const out=join(f.directory,'complete.json');await client.backup(out);const backup=await readLifecycleBackup(out);assert.deepEqual(backup.state,await f.app.snapshot());assert.ok([...backup.files.keys()].some(p=>p.endsWith('runtime.json')));assert.ok([...backup.files.keys()].some(p=>p.endsWith('review-page-1.png')));
 const packet=await prepareProjectWorkspace({backup:out,sourceConfig:f.app.config,scope:{...scope,deploy_id:'fresh-deploy',namespace:'evz-project-shared-fresh-20261024'}}),other=fictionalBlobs(),store=new ConditionalLifecycleStore(other.raw,{projectBinding:packet.binding});await installProjectWorkspace(store,packet,{commit:true});const restored=attachHostedAuthoring(await StudioLifecycle.fromStore({store,now:f.app.now}),other.raw);assert.deepEqual(await restored.snapshot(),backup.state);const inventory=await import('./lifecycle-backup.mjs');assert.equal((await inventory.hostedBackupInventory(restored,(await import('./call-audio.mjs')).blobAudioStore(other.raw))).files.size,backup.files.size);
 const manifest=await blobAuthoringStore(f.storage.raw).manifest(job.id,'runtime.json'),key=`authoring-chunks/${manifest.sha256}/0-${manifest.chunks[0]}`,saved=f.storage.entries.get(key);f.storage.entries.delete(key);await assert.rejects(client.backup(join(f.directory,'missing.json')),/Missing authoring chunk/);f.storage.entries.set(key,saved);
});

test('feedback conflicts retain baseline; stale contexts, CAS, cross-operator claims, field injection and untyped writes cannot publish',async t=>{
 const f=await fixture(t),c=await completed(f);await apply(f,assetEvent('baseline','asset_version_selected',{asset_id:c.job.id,version_id:c.job.id}));
 const revision=(await f.app.snapshot()).revision;await apply(f,assetEvent('first','asset_feedback_added',{asset_id:c.job.id,version_id:c.job.id,feedback:'Use "#112233" for page background.',scope:'project',project_id:'shared-proof'}));await assert.rejects(apply(f,assetEvent('stale','asset_feedback_added',{asset_id:c.job.id,version_id:c.job.id,feedback:'Keep it',scope:'project',project_id:'shared-proof'}),'friend',revision),/refresh/);
 await apply(f,assetEvent('conflict','asset_feedback_added',{asset_id:c.job.id,version_id:c.job.id,feedback:'Use "#445566" for page background.',scope:'project',project_id:'shared-proof'}),'friend');assert.ok(projectContext(await f.app.snapshot(),'shared-proof').source.design_preferences.conflicts.length);assert.equal((await f.app.snapshot()).asset_index[c.job.id].baseline_version,c.job.id);
 await apply(f,event('refine','concept_refinement_requested',{asset_id:c.job.id,version_id:c.job.id,selected_direction:'d0',feedback:'Preserve the approved conflicting property.'}));const owner=await f.connect(),job=await owner.begin(name,'website-refinement');await assert.rejects((await f.connect('friend')).begin(name,'website-refinement'),/assigned/);
 const before=await f.app.snapshot();await assert.rejects(f.app.change(s=>{s.operations.budget.consumed_microcredits=0;}),/untyped/);await assert.rejects(f.app.change(s=>{s.operations.budget.consumed_microcredits=0;},{projectRecord:{event:event('legit','note_added',{note:'fake wrapper'}),actor:'owner',revision:before.revision}}),/protected/);assert.deepEqual(await f.app.snapshot(),before);
 await apply(f,event('fresh-note','note_added',{note:'A new private fact changes the authoring context.'}),'friend');await assert.rejects(owner.render(job.id,source(job.context),await runtime()),/context or operator/);
 await assert.rejects(apply(f,{...event('spoof','note_added',{note:'x'}),actor:'friend'}),/fields/);await assert.rejects(apply(f,event('unknown','proposal_approved',{})),/shared state|supported design/);
});

test('provider, OAuth, send, original writes, audio and worker routes are blocked before any external effect; uncertain responses are reconciled exactly',async t=>{
 const f=await fixture(t),session=await f.session('friend'),before=await f.app.snapshot();
 for(const p of ['/api/google-oauth/start','/api/google-drive-oauth/status','/api/google-calendar-oauth/start','/api/exact-mail/send','/api/incoming-mail/sync','/api/team-notifications/prepare','/api/call-audio','/api/gateway-proof/run','/api/full-call-transcription/run','/api/project-original/shared-proof/template/v1/reserve'])await assert.rejects(session.json(p,{method:'POST',body:{}}),/Shared|shared|disabled|configured/);
 assert.deepEqual(await f.app.snapshot(),before);const e=event('lost','note_added',{note:'Exact once signed event.'});f.loseResponse('event');await assert.rejects(apply(f,e,'friend'),/response lost/);assert.equal((await apply(f,e,'friend',before.revision)).duplicate,true);await assert.rejects(apply(f,{...e,data:{note:'different'}},'friend'),/conflicts/);
 const c=await completed(f),state=await f.app.snapshot();assert.equal(state.prospects['shared-proof'].project_email_drafts.length,1);await (await f.connect()).complete(c.job.id,c.exact);assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_email_drafts.length,1);await assert.rejects((await f.connect('friend')).complete(c.job.id,c.exact),/retry differs/);
});


test('large production snapshots retain bounded backup state chunks; stale state reads cannot publish a mixed package',async t=>{
 const f=await fixture(t,{large:true}),client=await f.connect(),session=await f.session('owner'),wire=await session.json('/api/project-author/backup');assert.ok(wire.body_manifest.bytes>4_500_000);assert.equal(wire.body,undefined);assert.ok(Buffer.byteLength(JSON.stringify(wire))<120_000);
 const output=join(f.directory,'large.json');await client.backup(output);assert.deepEqual((await readLifecycleBackup(output)).state,await f.app.snapshot());assert.ok(f.requests.filter(r=>r.path.includes('state-chunk')).length>4);
 await apply(f,event('large-fresh','note_added',{note:'Changed after backup manifest.'}));await assert.rejects(session.json('/api/project-author/backup/state-chunk?snapshot='+hash(wire)+'&chunk=0'),/Backup changed/);
});

test('typed authoring witnesses cannot authorize arbitrary jobs, status changes or unrelated records; incomplete attempts reconcile and restore honestly',async t=>{
 const f=await fixture(t),client=await f.connect(),job=await client.begin(name,'website-concepts'),state=await f.app.snapshot(),input={project_id:'shared-proof',work_id:'website-concepts',job_id:job.id},saved=state.prospects['shared-proof'].project_work['website-concepts'].execution;
 for(const command of [{type:'renderer',input,actor:'friend',details:{job:saved,nodeRuntime:true,renderer_sha256:'0'.repeat(64),renderer_lock_sha256:'0'.repeat(64)}},{type:'rendered',input,actor:'owner',details:{job:saved,receipt:{}}},{type:'claim',input:{...input,context_sha256:job.context_sha256,references:job.references},actor:'owner',details:{job:{...saved,id:'author-'+'f'.repeat(32)},refs:job.references}}])await assert.rejects(f.app.change(s=>{s.operations.budget.consumed_microcredits=0;},{projectAuthoring:command}));
 assert.deepEqual(await f.app.snapshot(),state);await assert.rejects(client.backup(join(f.directory,'unfinished.json')),/unfinished authoring/);
 const observation=await client.recovery(job.id);await assert.rejects((await f.connect('friend')).reconcile(job.id,{snapshot:observation.snapshot,reason:'Foreign closure',disposition:'close-publication'}),/preparing operator/);
 await client.reconcile(job.id,{snapshot:observation.snapshot,reason:'Explicit synthetic abandoned source attempt; no process stop attested',disposition:'close-publication'});await client.backup(join(f.directory,'reconciled.json'));const packageData=await readLifecycleBackup(join(f.directory,'reconciled.json'));assert.equal(packageData.state.prospects['shared-proof'].project_work['website-concepts'].execution.recovery.execution,'not-attested-stopped');
 await client.revise(job.id,'Retain the reconciled incomplete attempt before a new one');const replacement=await client.begin(name,'website-concepts');assert.notEqual(replacement.id,job.id);await assert.rejects(client.download('author-'+'e'.repeat(32),'context.json'),/Unknown registered/);
});

test('concurrent exact edits and lost render/complete responses never duplicate held output or discard historical uncertainty',async t=>{
 const f=await fixture(t),revision=(await f.app.snapshot()).revision;
 const raced=await Promise.allSettled(['owner','friend'].map(who=>apply(f,event('race-'+who,'note_added',{note:who+' source fact'}),who,revision)));assert.equal(raced.filter(v=>v.status==='fulfilled').length,1);
 const client=await f.connect(),job=await client.begin(name,'website-concepts');f.loseResponse('render');await assert.rejects(client.render(job.id,source(job.context),await runtime()),/response lost/);const fresh=await f.connect();assert.equal((await fresh.inspect(job.id)).status,'Rendered');
 const receipt=JSON.parse(await fresh.download(job.id,'export.json')),raster=await fresh.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit substitute',pages:receipt.pages.map(()=>substitutedPNG)}),exact=review(receipt,raster);f.loseResponse('complete');await assert.rejects(fresh.complete(job.id,exact),/response lost/);await (await f.connect()).complete(job.id,exact);const state=await f.app.snapshot();assert.equal(state.prospects['shared-proof'].project_email_drafts.length,1);assert.deepEqual(state.operations,f.state.operations);assert.deepEqual(state.ai_attempts,f.state.ai_attempts);assert.equal(state.actions.historic.status,'Pending');
});


test('conflicting supported preferences render the exact approved property and require both signed selections to advance the baseline',async t=>{
 const f=await fixture(t),c=await completed(f);await apply(f,assetEvent('approved','asset_version_selected',{asset_id:c.job.id,version_id:c.job.id}));
 for(const [actor,color]of [['owner','#112233'],['friend','#445566']])await apply(f,assetEvent('color-'+actor,'asset_feedback_added',{asset_id:c.job.id,version_id:c.job.id,feedback:`Use "${color}" for page background.`,scope:'project',project_id:'shared-proof'}),actor);
 await apply(f,event('conflict-refinement','concept_refinement_requested',{asset_id:c.job.id,version_id:c.job.id,selected_direction:'d0',feedback:'Preserve the disputed approved property.'}));const client=await f.connect(),job=await client.begin(name,'website-refinement'),baseline=JSON.parse(await client.download(c.job.id,'authored.json')),s={...source(job.context),kind:'website-refinement',selected_direction:'d0',previous_asset_id:c.job.id,previous_version_id:c.job.id,feedback:job.context.source.request.feedback,preserves_direction:true,pages:[baseline.pages[0]]};delete s.directions;await client.render(job.id,s,await runtime());const authored=JSON.parse(await client.download(job.id,'authored.json'));assert.deepEqual(authored.pages, [baseline.pages[0]]);assert.equal(authored.preference_application.preserved_conflicts.length,1);
 const receipt=JSON.parse(await client.download(job.id,'export.json')),raster=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit substitute',pages:[substitutedPNG]});await client.complete(job.id,review(receipt,raster));await apply(f,assetEvent('owner-choice','asset_version_selected',{asset_id:c.job.id,version_id:job.id}));let asset=(await f.app.snapshot()).asset_index[c.job.id];assert.equal(asset.baseline_version,c.job.id);assert.ok(asset.dispute);
 const output=join(f.directory,'conflict.json');await client.backup(output);const packageData=await readLifecycleBackup(output);assert.deepEqual(packageData.state.asset_index[c.job.id].dispute,asset.dispute);await apply(f,assetEvent('friend-choice','asset_version_selected',{asset_id:c.job.id,version_id:job.id}),'friend');asset=(await f.app.snapshot()).asset_index[c.job.id];assert.equal(asset.baseline_version,job.id);assert.equal(asset.dispute,null);assert.deepEqual(asset.baseline_agreement_events,['owner-choice','friend-choice']);
});

test('production-shaped proposals retain exact operator scope/price and registered template gates without send authority',async t=>{
 const empty=await fixture(t);await assert.rejects((await empty.connect()).begin(name,'client-proposal'),/No Ready task/);
 const f=await fixture(t,{actor:'friend',approvedQuote:true}),client=await f.connect('owner'),job=await client.begin(name,'client-proposal'),state=await f.app.snapshot();assert.equal(job.context.source.quote_sha256,hash(state.prospects['shared-proof'].quote));assert.equal(job.context.source.approved_quote.approved_by,'owner');assert.equal(state.prospects['shared-proof'].agreement,undefined);
 await assert.rejects(client.render(job.id,{...source(job.context),kind:'client-proposal',quote_sha256:hash('wrong quote')},await runtime()),/exact approved scope/);assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_email_drafts,undefined);
});


test('mixed local Python history retains complete opaque G1 dependencies and blocks the whole shared installation before publication',async t=>{
 const f=await fixture(t),app=f.sourceApp,prior=await app.snapshot(),packet=projectWorkContext(prior,'shared-proof','website-concepts'),id='author-'+'d'.repeat(32),folder=join(app.directory,'project-authored',id);await mkdir(folder,{recursive:true});const image=join(app.directory,'opaque-legacy.png');await writeFile(image,substitutedPNG);const runtime={python:'C:/fictional-never-executed/python.exe',pdftoppm:'C:/fictional-never-executed/pdftoppm.exe',proposal_assets:'C:/fictional-never-executed/assets',fonts:{},images:{legacy:{project_id:'shared-proof',path:image,sha256:(await import('./shared-project-originals.mjs')).originalDigest(substitutedPNG),provenance:'Synthetic opaque historical image; never executed'}}};
 await writeFile(join(folder,'context.json'),JSON.stringify(packet));await writeFile(join(folder,'runtime.json'),JSON.stringify(runtime));await app.change(s=>{s.prospects['shared-proof'].project_work['website-concepts'].execution={id,project_id:'shared-proof',work_id:'website-concepts',actor:'owner',status:'Held',context_sha256:packet.context_sha256,runtime_sha256:hash(runtime),references:[]};});
 const output=join(f.directory,'mixed-history.json');await writeLifecycleBackup(app.directory,await app.snapshot(),output,f.app.now().toISOString());const complete=await readLifecycleBackup(output);assert.deepEqual(complete.files.get(`project-authored/${id}/image-legacy.png`),substitutedPNG);const bytes=await readFile(output),sharedBefore=await f.app.snapshot(),writes=f.storage.requests.filter(r=>r.method==='PUT').length;
 await assert.rejects(prepareProjectWorkspace({backup:output,sourceConfig:app.config,scope}),e=>{assert.match(e.message,/preserve the complete original G1 package/);assert.ok(e.message.includes(`project-authored/${id}/runtime.json`));assert.ok(e.message.includes(`project-authored/${id}/image-legacy.png`));return true;});
 for(const example of ['shared-operations-authoring','shared-operations-refinement']){const policy=JSON.parse(await readFile(new URL('./'+example+'.example.json',import.meta.url)));policy.binding=Object.fromEntries(['workspace_id','run_id','site_id','deploy_id','origin','namespace'].map(k=>[k,scope[k]]));await assert.rejects(prepareDispatchWorkspace({backup:output,sourceConfig:app.config,scope:{...scope,capability:policy.capability,policy_sha256:hash(policy)},dispatchPolicy:policy}),/preserve the complete original G1 package/);}
 assert.deepEqual(await readFile(output),bytes);assert.deepEqual(await f.app.snapshot(),sharedBefore);assert.equal(f.storage.requests.filter(r=>r.method==='PUT').length,writes);
 const restored=join(f.directory,'opaque-restored');await StudioLifecycle.restore({input:output,destination:restored});assert.deepEqual(await readFile(join(restored,'project-authored',id,'image-legacy.png')),substitutedPNG);assert.deepEqual(JSON.parse(await readFile(join(restored,'project-authored',id,'runtime.json'))),runtime);
});


test('another exact-bound workspace cannot inspect or mutate this workspace job, even with valid signed operator sessions',async t=>{
 const f=await fixture(t),first=await (await f.connect()).begin(name,'website-concepts'),scope2={...scope,workspace_id:'other-fictional-workspace',deploy_id:'other-deploy',namespace:'evz-project-shared-other-20261024'},packet=await prepareProjectWorkspace({backup:join(f.directory,'source-backup.json'),sourceConfig:f.sourceApp.config,scope:scope2}),raw=fictionalBlobs(),store=new ConditionalLifecycleStore(raw.raw,{projectBinding:packet.binding});await installProjectWorkspace(store,packet,{commit:true});
 const handler=(await import('./hosted-desk.mjs')).createHostedDesk({env:{...f.env,DEPLOY_ID:scope2.deploy_id,EVZ_OPERATIONS_BLOB_NAMESPACE:scope2.namespace,EVZ_OPERATIONS_PROJECT_BINDING:JSON.stringify(packet.binding)},storeFactory:()=>raw.raw,now:f.app.now}),fetcher=(url,options)=>handler(new Request(url,options));
 for(const actor of ['owner','friend']){const client=await (await import('./hosted-authoring-client.mjs')).connectSharedAuthoring({origin,key:f.env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher});await assert.rejects(client.inspect(first.id),/Unknown current/);await assert.rejects(client.download(first.id,'context.json'),/Unknown registered/);await assert.rejects(client.complete(first.id,{}),/Unknown current/);}
 assert.equal((await f.app.snapshot()).prospects['shared-proof'].project_work['website-concepts'].execution.id,first.id);assert.equal((await store.snapshot()).prospects['shared-proof'].project_work['website-concepts'].execution,undefined);
});


async function advancingSharedClient(f){
 let time=Date.parse((await f.app.snapshot()).updated_at),lost=false;const now=()=>new Date(++time);
 f.app.now=now;f.storage.hook=async()=>{time+=17;};
 const handler=(await import('./hosted-desk.mjs')).createHostedDesk({env:f.env,storeFactory:()=>f.storage.raw,now});
 const fetcher=async(url,options)=>{const response=await handler(new Request(url,options));if(lost&&new URL(url).pathname.endsWith('/reconcile')&&response.ok){lost=false;throw Error('Advancing-clock reconcile response lost');}return response;};
 const client=await (await import('./hosted-authoring-client.mjs')).connectSharedAuthoring({origin,key:f.env.EVZ_OPERATIONS_OWNER_KEY,fetcher});
 return {client,now,loseResponse:()=>{lost=true;},time:()=>time};
}

test('advancing shared reconciliation keeps one transaction timestamp across evidence persistence and exact lost-response retries',async t=>{
 for(const loseResponse of [false,true]){
 const f=await fixture(t),a=await advancingSharedClient(f),job=await a.client.begin(name,'website-concepts'),observed=await a.client.recovery(job.id);assert.ok(observed.files.some(file=>file.published?.chunks.some(c=>c.disposition==='available')),'Nonempty actual context evidence is retained');
 const input={snapshot:observed.snapshot,reason:'Retain exact evidence under a moving storage clock.',disposition:'close-publication'},before=await f.app.snapshot(),timeBefore=a.time();if(loseResponse){a.loseResponse();await assert.rejects(a.client.reconcile(job.id,input),/response lost/);}else assert.equal((await a.client.reconcile(job.id,input)).status,'Reconciled');
 const saved=await f.app.snapshot(),closed=saved.prospects['shared-proof'].project_work['website-concepts'].execution;assert.equal(closed.status,'Reconciled');assert.equal(closed.recovery.at,saved.updated_at);assert.ok(a.time()>Date.parse(closed.recovery.at));assert.ok(a.time()>timeBefore);assert.equal(saved.revision,before.revision+1);
 assert.deepEqual(await a.client.reconcile(job.id,input),closed);assert.deepEqual(await f.app.snapshot(),saved);await assert.rejects(a.client.reconcile(job.id,{...input,reason:'Changed retry'}),/retry differs/);assert.deepEqual(await f.app.snapshot(),saved);
 }
});

test('advancing shared reconciliation still rejects genuine snapshot and evidence races',async t=>{
 for(const race of ['snapshot','evidence']){
  const f=await fixture(t),a=await advancingSharedClient(f),job=await a.client.begin(name,'website-concepts'),observed=await a.client.recovery(job.id),before=await f.app.snapshot();let raced=false;
  const prior=f.storage.hook;f.storage.hook=async(key,bytes)=>{await prior(key,bytes);if(raced||!key.includes('/recovery-')||!key.endsWith('/manifest'))return;raced=true;
   if(race==='snapshot')await f.app.apply(event('moving-clock-race','note_added',{note:'Concurrent legitimate source change.'}),{actor:'friend',expectedRevision:before.revision});
   else await blobAuthoringStore(f.storage.raw).reserve(job.id,'input.json',(await import('./hosted-authoring.mjs')).authoringManifest(Buffer.from('new exact candidate evidence')));
  };
  await assert.rejects(a.client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Reject '+race+' race despite time progression.',disposition:'close-publication'}),race==='snapshot'?/snapshot changed before closure/:/shared state|observation changed/);assert.equal(raced,true);const after=await f.app.snapshot();assert.equal(after.prospects['shared-proof'].project_work['website-concepts'].execution.status,'Claimed');assert.equal(after.revision,before.revision+(race==='snapshot'?1:0));assert.deepEqual(after.operations,before.operations);
 }
});
