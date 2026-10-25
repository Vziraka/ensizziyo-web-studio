import test from 'node:test';import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fixture,at,event} from './fixtures/refinement-generation.mjs';
import {hash,StudioLifecycle} from './lifecycle.mjs';
import {review,substitutedPNG,fictionalBlobs} from './fixtures/hosted-authoring.mjs';
import {readLifecycleBackup} from './lifecycle-backup.mjs';
import {prepareProjectWorkspace,installProjectWorkspace,sharedProjectDashboard} from './shared-project-continuation.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {attachHostedAuthoring} from './hosted-authoring.mjs';
import {sharedDeskSession} from './shared-originals-client.mjs';
import {refinementStatus,refinementRequest,verifyRefinementDispatch} from './refinement-generation.mjs';
import {fixtureReply} from './lifecycle-fixtures.mjs';

async function signedEvent(f,e,actor='friend'){
 const session=await f.signed(actor);return session.json('/api/event',{method:'POST',body:{event:e,revision:(await f.app.snapshot()).revision}});
}
async function trustedEvents(f,events){
 // This standalone profile has no manual/incoming/registration caller; substitute its external authority at the existing CAS boundary.
 const entry=await f.storage.raw.getWithMetadata('workspace',{type:'json',consistency:'strong'}),state=entry.data.state;
 for(const [event,actor] of events)f.app.reduceEvent(state,event,{actor,expectedRevision:state.revision,manualRecording:true});
 await f.storage.raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});
 for(const [event] of events)assert.ok((await f.app.snapshot()).events[event.id]);
}
async function duringSourceRead(t,phase,change,options={}){
 let armed=false,observed=false,mutationError;const f=await fixture(t,{...options,afterPhase:name=>{if(name===phase)armed=true;}});
 f.storage.readHook=async key=>{if(!armed||key!==(options.readKey?.(f)??`project-authored/${f.seed.id}/authored.json/manifest`))return;armed=false;try{await change(f);observed=true;}catch(error){mutationError=error;throw error;}};
 await f.authorize();const result=await f.generate();if(mutationError)throw mutationError;assert.ok(observed,'Mutation committed during deferred dependency read');return {f,result};
}

for(const actor of ['owner','friend'])for(const phase of ['count-claim','generation-claim'])test(`deferred source read: signed ${actor} recovery fences ${phase} and preserves the complete Reconciled attempt`,async t=>{
 let closed,counts;const {f,result}=await duringSourceRead(t,phase,async f=>{
  const observation=await f.caller.recovery(f.job.id);await f.caller.reconcile(f.job.id,{snapshot:observation.snapshot,reason:'Fictional signed closure during pending source read; process exit not attested',disposition:'close-publication'});
  closed=(await f.caller.generationStatus(f.job.id)).attempt;counts={...f.counts};assert.equal(closed.status,'Reconciled');
 },{actor});
 assert.deepEqual({counts:f.counts,attempt:result.attempt},{counts,attempt:closed},'No provider call or attempt mutation after signed closure');assert.equal(result.authoring.status,'Reconciled');assert.equal(result.attempt.reserved_microcredits,3_000_000);assert.equal((await f.app.snapshot()).asset_index[f.seed.id].versions[f.job.id],undefined);
});
for(const phase of ['count-claim','generation-claim'])test(`deferred source read: signed note fences ${phase}`,async t=>{
 const {f,result}=await duringSourceRead(t,phase,f=>signedEvent(f,event('during-pending-read','note_added',{note:'New fictional context while source read waits.'})));
 assert.equal(phase==='count-claim'?f.counts.count:f.counts.generation,0,'No provider call after current context changed');assert.equal(result.attempt.status,'Uncertain');assert.equal(result.attempt.raw,undefined);assert.equal(result.attempt.reserved_microcredits,3_000_000);assert.equal((await f.app.snapshot()).asset_index[f.seed.id].versions[f.job.id],undefined);
});

test('signed feedback, baseline, dispute, pause and expiry during dependency reads fence both provider phases',async t=>{
 for(const phase of ['count-claim','generation-claim'])for(const change of ['feedback','baseline','dispute','pause','expiry']){
  let time=Date.parse(at);const {f,result}=await duringSourceRead(t,phase,async f=>{
   if(change==='expiry'){time+=16*60000;return;}
   if(change==='pause'){await (await f.connect('friend')).pauseGeneration(hash(f.policy));return;}
   const data={asset_id:f.seed.id,version_id:f.seed.id};if(change==='feedback')Object.assign(data,{feedback:'Use "#FFFFFF" for page background.',scope:'project',project_id:'shared-proof'});
   if(change==='dispute'){await trustedEvents(f,[[event('alternative-version','asset_version_registered',{asset_id:f.seed.id,version_id:'alternate',version_label:'Alternate fictional version',reference:'private-path:fictional/alternate-unverified-source.pdf'},'studio-assets'),'owner']]);data.version_id='alternate';}
   await signedEvent(f,event('pending-'+change,change==='feedback'?'asset_feedback_added':change==='baseline'?'asset_version_selected':'asset_version_disputed',data,'studio-assets'));
  },{clock:()=>new Date(time)});
  assert.equal(phase==='count-claim'?f.counts.count:f.counts.generation,0,phase+' '+change);assert.equal(result.attempt.raw,undefined);assert.equal(result.attempt.reserved_microcredits,3_000_000);assert.equal(result.authoring.status,'Claimed');
 }
});

test('the final guard also fences signed context changes during original and runtime reads in both phases',async t=>{
 for(const phase of ['count-claim','generation-claim'])for(const dependency of ['original','runtime']){
  const {f}=await duringSourceRead(t,phase,f=>signedEvent(f,event('late-dependency-note','note_added',{note:'New fictional context during the later dependency read.'})),{readKey:f=>dependency==='runtime'?`project-authored/${f.job.id}/runtime.json/manifest`:`project-originals/${f.job.references[0].sha256}/manifest`});
  assert.equal(phase==='count-claim'?f.counts.count:f.counts.generation,0,phase+' '+dependency);
 }
});

test('trusted handoff, stop and provider incoming changes during reads fence both phases; signed profile still denies these events',async t=>{
 for(const phase of ['count-claim','generation-claim'])for(const change of ['handoff','stop','incoming']){
  const {f,result}=await duringSourceRead(t,phase,async f=>{
   const e=change==='handoff'?event('pending-handoff','follow_up_handed_off',{to:'friend'}):change==='stop'?event('pending-stop','contact_stopped',{reason:'do_not_contact'}):event('pending-incoming','reply_received',fixtureReply('new-reply'));
   const before=await f.app.snapshot();await assert.rejects(signedEvent(f,e,'owner'),/supported design feedback|Private shared state is unavailable|Provider\/research events require/);assert.deepEqual(await f.app.snapshot(),before);
   if(change==='handoff'){
    const entry=await f.storage.raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});entry.data.state.prospects['shared-proof'].follow_up_owner='owner';await f.storage.raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});
   }
   await trustedEvents(f,[[e,change==='incoming'?'provider':'owner']]);
  });
  assert.equal(phase==='count-claim'?f.counts.count:f.counts.generation,0,phase+' '+change);assert.equal(result.attempt.raw,undefined);assert.equal(result.attempt.reserved_microcredits,3_000_000);assert.equal((await f.app.snapshot()).asset_index[f.seed.id].versions[f.job.id],undefined);
 }
});

test('unrelated signed revision changes and duplicate worker deliveries during both dependency waits allow current work once',async t=>{
 for(const phase of ['count-claim','generation-claim']){
  const {f,result}=await duringSourceRead(t,phase,async f=>{
   const prior=(await f.app.snapshot()).revision;await signedEvent(f,event('unrelated-extra-round','unpaid_refinement_exception',{approved:true,extra_rounds:1,reason:'Separate future round; current source and request stay exact.'}));assert.ok((await f.app.snapshot()).revision>prior);
   assert.equal((await f.execute(f.tokens[0])).status,200);assert.equal(f.counts.generation,0);
  },{actor:'friend'});
  assert.equal(result.attempt.status,'Source ready');assert.equal(result.authoring.status,'Rendered');assert.deepEqual(f.counts,{count:1,generation:1,dispatch:1});
 }
});

test('a changed same-status phase claim, assignment or selected source provenance during runtime reads stops the next effect',async t=>{
 for(const phase of ['count-claim','generation-claim'])for(const change of ['phase-claim','assignment','source-provenance']){
  const {f}=await duringSourceRead(t,phase,async f=>{
   const entry=await f.storage.raw.getWithMetadata('workspace',{type:'json',consistency:'strong'}),state=entry.data.state;
   if(change==='phase-claim')state.ai_attempts['refine-'+f.job.id].phases[phase==='count-claim'?'count':'generation'].claimed_at=new Date(Date.parse(at)+1).toISOString();
   if(change==='assignment')state.prospects['shared-proof'].project_work[f.job.work_id].assigned_to='friend';
   if(change==='source-provenance')state.asset_index[f.seed.id].versions[f.seed.id].provenance.source_sha256='0'.repeat(64);
   await f.storage.raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});
  },{readKey:f=>`project-authored/${f.job.id}/runtime.json/manifest`});
  assert.equal(phase==='count-claim'?f.counts.count:f.counts.generation,0,phase+' '+change);
 }
});

test('already-started generation retains returned raw after a signed context change and never adopts or retries it; reconciliation stays terminal',async t=>{
 for(const change of ['note','recovery']){
  let f,closed;f=await fixture(t,{editOutput:async response=>{
   assert.equal(f.counts.generation,1,'Provider request already started before mutation');
   if(change==='note')await signedEvent(f,event('in-flight-note','note_added',{note:'New context after the fictional request started.'}));
   else{const observation=await f.caller.recovery(f.job.id);await f.caller.reconcile(f.job.id,{snapshot:observation.snapshot,reason:'Close publication of already-started fictional request; exit not attested',disposition:'close-publication'});closed=(await f.caller.generationStatus(f.job.id)).attempt;}
   return response;
  }});await f.authorize();const result=await f.generate();
  if(change==='note'){assert.equal(result.attempt.status,'Held');assert.ok(result.attempt.raw);assert.equal(result.attempt.phases.generation.status,'Returned');}
  else{assert.deepEqual(result.attempt,closed);assert.equal(result.authoring.status,'Reconciled');}
  assert.equal(result.attempt.reserved_microcredits,3_000_000);assert.equal((await f.app.snapshot()).asset_index[f.seed.id].versions[f.job.id],undefined);await f.generate();await f.execute(f.tokens[0]);assert.equal(f.counts.generation,1);
 }
});

test('both actual signed roles generate through injected provider only to a real Node PDF, then separate review preserves baseline and exact held attachment',async t=>{
 for(const actor of ['owner','friend']){const f=await fixture(t,{actor});await f.authorize();const before=await f.app.snapshot(),result=await f.generate();assert.equal(result.authoring.status,'Rendered');assert.equal(result.attempt.status,'Source ready');assert.deepEqual(f.counts,{count:1,generation:1,dispatch:1});assert.equal(hash(result.attempt.request),result.attempt.spec.request_sha256);assert.equal(hash(result.attempt.raw),result.attempt.raw_sha256);assert.deepEqual((await f.caller.generationStatus(f.job.id)).attempt,result.attempt);await f.generate();await f.execute(f.tokens[0]);assert.equal(f.counts.generation,1);
 const pdf=await f.caller.download(f.job.id,'output.pdf');assert.equal(pdf.subarray(0,5).toString(),'%PDF-');const receipt=JSON.parse(await f.caller.download(f.job.id,'export.json'));assert.equal(receipt.pages.length,1);await assert.rejects(f.caller.complete(f.job.id,review(receipt)),/actual PDF raster/);
 const rasters=await f.caller.rasters(f.job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Substitute only; private proof inspects real PNGs',pages:[substitutedPNG]}),done=await f.caller.complete(f.job.id,review(receipt,rasters)),after=await f.app.snapshot();assert.equal(done.companion_draft.attachment.sha256,receipt.pdf.sha256);assert.equal(done.companion_draft.send_authorized,false);assert.equal(after.asset_index[f.seed.id].baseline_version,f.seed.id);assert.deepEqual(after.asset_index[f.seed.id].versions[f.seed.id],before.asset_index[f.seed.id].versions[f.seed.id]);assert.deepEqual(after.operations,before.operations);assert.deepEqual(after.ai_attempts.historic,before.ai_attempts.historic);
 const out=join(f.directory,'generation-complete.json');await f.caller.backup(out);const backup=await readLifecycleBackup(out);assert.deepEqual(backup.state,after);assert.equal(backup.state.ai_attempts[result.attempt.id].raw.text,result.attempt.raw.text);
 const prepared=await prepareProjectWorkspace({backup:out,sourceConfig:f.app.config,scope:{...f.prepared.binding.scope,deploy_id:'restored-deploy',namespace:'evz-project-shared-refine-restored'},refinementPolicy:f.policy}),other=fictionalBlobs(),store=new ConditionalLifecycleStore(other.raw,{projectBinding:prepared.binding});await installProjectWorkspace(store,prepared,{commit:true});const restored=attachHostedAuthoring(await StudioLifecycle.fromStore({store,now:()=>new Date(at)}),other.raw);assert.deepEqual(await restored.snapshot(),after);assert.equal((await refinementStatus(restored,{job_id:f.job.id},actor)).authoring.status,'Review');
 }
});

test('old capability, wrong operator, unapproved policy and disabled flags cannot dispatch; owner spending authority remains separate',async t=>{
 const f=await fixture(t,{actor:'friend'}),owner=await f.connect('owner');await assert.rejects(f.generate(),/unapproved/);await assert.rejects(f.caller.authorizeGeneration({policy_sha256:hash(f.policy),remaining_credits:1000,observed_at:at,auto_recharge_disabled:true}),/signed owner/);await f.authorize();await assert.rejects(owner.generate(f.job.id,(await f.app.snapshot()).revision,hash(f.policy)),/assignment/);assert.equal(f.counts.count,0);
 await assert.rejects(f.original.connect().then(c=>c.generate(f.job.id,1,hash(f.policy))),/capabilities reject|disabled/);
 for(const change of [{EVZ_REFINEMENT_GENERATION_ENABLED:undefined},{DEPLOY_ID:'other'},{EVZ_OPERATIONS_DESK_ENABLED:'shared-project-continuation-v1'}]){const session=await f.signed('friend'),r=await f.make(change)(new Request('https://preview.example.invalid/desk/api/project-author/generate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.notEqual(r.status,200);}
 assert.equal(f.counts.generation,0);
});

test('rejected raw outputs are retained without repair, generation replay or asset registration',async t=>{
 for(const kind of ['invalid-json','schema','wording','questions','model','usage','bytes']){const f=await fixture(t,{editOutput:(response,source)=>{if(kind==='invalid-json')response.text='not JSON';if(kind==='schema'){source.unexpected='no';response.text=JSON.stringify(source);}if(kind==='wording'){source.pages[0].commands[1].text='Invented client claim';response.text=JSON.stringify(source);}if(kind==='questions'){source.questions=['Need an unsupported change'];source.judgment_option=true;response.text=JSON.stringify(source);}if(kind==='model')response.modelVersion='wrong-model';if(kind==='usage')response.usageMetadata.promptTokenCount=999;if(kind==='bytes')response.text='x'.repeat(120001);return response;}});await f.authorize();const result=await f.generate();assert.ok(['Held','Uncertain'].includes(result.attempt.status),kind);assert.equal(result.authoring.status,'Claimed');assert.ok(result.attempt.raw,kind);await f.generate();await f.execute(f.tokens[0]);assert.equal(f.counts.generation,1);assert.equal((await f.app.snapshot()).asset_index[f.seed.id].versions[f.job.id],undefined);}
});

test('durable count/generation claims, pause, context changes and dispatch loss never replay or refund; explicit reconciliation permits complete inert backup',async t=>{
 for(const phase of ['count-claim','count-returned','generation-claim','returned']){const f=await fixture(t,{afterPhase:name=>{if(name===phase)throw Error('Injected process interruption');}});await f.authorize();const result=await f.generate();assert.ok(['Held','Uncertain'].includes(result.attempt.status));await f.generate();await f.execute(f.tokens[0]);assert.equal(f.counts.count,phase==='count-claim'?0:1);assert.equal(f.counts.generation,['generation-claim','count-claim','count-returned'].includes(phase)?0:1);const reservation=result.attempt.reserved_microcredits;
 const observation=await f.caller.recovery(f.job.id);await f.caller.reconcile(f.job.id,{snapshot:observation.snapshot,reason:'Explicitly close this interrupted fictional attempt; no phase exit attested',disposition:'close-publication'});const closed=await f.caller.generationStatus(f.job.id);assert.equal(closed.attempt.status,'Reconciled');assert.equal(closed.attempt.reserved_microcredits,reservation);const output=join(f.directory,'reconciled-generation.json');await f.caller.backup(output);assert.deepEqual((await readLifecycleBackup(output)).state,await f.app.snapshot());}
 const f=await fixture(t);await f.authorize();await (await f.connect('friend')).pauseGeneration(hash(f.policy));await assert.rejects(f.generate(),/paused/);assert.equal(f.counts.count,0);
 const changed=await fixture(t);await changed.authorize();const session=await changed.signed('owner');await session.json('/api/event',{method:'POST',body:{event:event('changed','note_added',{note:'New fact invalidates the exact refinement context.'}),revision:(await changed.app.snapshot()).revision}});await assert.rejects(changed.generate(),/context|changed/);assert.equal(changed.counts.count,0);
});

test('simultaneous signed requests, lost reservation/phase writes and failed background delivery cannot repeat uncertain work',async t=>{
 const race=await fixture(t);await race.authorize();await Promise.allSettled([race.generate(),race.generate()]);assert.equal(race.counts.count,1);assert.equal(race.counts.generation,1);
 const lost=await fixture(t);await lost.authorize();lost.storage.lose='workspace';await assert.rejects(lost.generate(),/uncertain|changed/);assert.equal(lost.counts.dispatch,0);assert.equal((await lost.generate()).attempt.status,'Reserved');assert.equal(lost.counts.count,0);
 let f;f=await fixture(t,{afterPhase:phase=>{if(phase==='count-returned')f.storage.lose='workspace';}});await f.authorize();const result=await f.generate();assert.equal(result.attempt.status,'Uncertain');assert.equal(result.attempt.phases.generation.status,'Claimed');assert.equal(f.counts.generation,0);await f.execute(f.tokens[0]);assert.equal(f.counts.generation,0);
 const failed=await fixture(t);await failed.authorize();failed.options.refinementOptions.dispatch=()=>{throw Error('Lost background delivery');};const reserved=await failed.generate();assert.equal(reserved.attempt.status,'Reserved');await failed.generate();assert.equal(failed.counts.count,0);
});

test('moving time, pause during count, catalog/rate changes and immutable dependency loss stop before the next effect',async t=>{
 let time=Date.parse(at),f;f=await fixture(t,{clock:()=>new Date(time),afterPhase:phase=>{if(phase==='count-returned')time+=31000;}});await f.authorize();const timed=await f.generate();assert.equal(timed.attempt.status,'Held');assert.equal(f.counts.generation,0);
 let paused;paused=await fixture(t,{afterPhase:async phase=>{if(phase==='count-returned')await (await paused.connect('friend')).pauseGeneration(hash(paused.policy));}});await paused.authorize();assert.equal((await paused.generate()).attempt.status,'Uncertain');assert.equal(paused.counts.generation,0);
 for(const input of [{providers:{}},{providers:{gemini:{models:{'fictional-refinement-model':{pricing:{input:2,output:2}}}}}}]){const changed=await fixture(t);await changed.authorize();changed.options.refinementOptions.catalogRequest=async()=>new Response(JSON.stringify(input));assert.equal((await changed.generate()).attempt.status,'Held');assert.equal(changed.counts.count,0);}
 const missing=await fixture(t);await missing.authorize();const m=await missing.app.authoringStore.manifest(missing.job.id,'runtime.json');missing.storage.entries.delete(`authoring-chunks/${m.sha256}/0-${m.chunks[0]}`);await assert.rejects(missing.generate(),/Missing authoring chunk/);assert.equal(missing.counts.count,0);
 const unsupported=await fixture(t),packet=structuredClone(unsupported.packet);packet.source.request.feedback='Redesign the layout and add a testimonial.';assert.throws(()=>refinementRequest(packet,unsupported.selected,unsupported.rt),/Unsupported or ambiguous/);
});

test('the host capability is bounded to deployment and attempt; typed replay rejects unrelated changes and arbitrary response fields',async t=>{
 const f=await fixture(t);await f.authorize();await f.generate();const token=f.tokens[0];assert.throws(()=>verifyRefinementDispatch({...f.env,EVZ_REFINEMENT_DISPATCH_SECRET:undefined},f.prepared.binding,token,new Date(at)),/Dedicated/);assert.throws(()=>verifyRefinementDispatch(f.env,{...f.prepared.binding,manifest_sha256:'0'.repeat(64)},token,new Date(at)),/binding/);assert.throws(()=>verifyRefinementDispatch(f.env,f.prepared.binding,token+'x',new Date(at)),/invalid/);assert.throws(()=>verifyRefinementDispatch(f.env,f.prepared.binding,token,new Date(Date.parse(at)+60001)),/expired/);
 const s=await f.app.snapshot();await assert.rejects(f.app.change(state=>{state.operations.budget.consumed_microcredits=0;},{projectGeneration:{type:'pause',input:{policy_sha256:hash(f.policy)},actor:'friend',revision:s.revision,details:{},binding:f.prepared.binding}}),/protected/);assert.deepEqual(await f.app.snapshot(),s);
 const direct=await f.make()(new Request('https://preview.example.invalid/desk/api/project-author/generate-execute',{method:'POST',body:'{}'}));assert.equal(direct.status,409);
});

test('a lost process after validated source can explicitly continue deterministic rendering, never inference or a partial Rendering rerun',async t=>{
 const f=await fixture(t,{afterPhase:phase=>{if(phase==='source')throw Error('Process lost before deterministic render');}});await f.authorize();const result=await f.generate();assert.equal(result.attempt.status,'Source ready');assert.equal(result.authoring.status,'Claimed');await f.generate();assert.equal(f.counts.generation,1);const rendered=await (await f.connect()).continueGeneratedRender(f.job.id);assert.equal(rendered.authoring.status,'Rendered');assert.equal(f.counts.generation,1);await assert.rejects(f.caller.continueGeneratedRender(f.job.id),/status changed/);
 const observation=await f.caller.recovery(f.job.id);await f.caller.reconcile(f.job.id,{snapshot:observation.snapshot,reason:'Retain complete deterministic output as an explicit unreviewed recovery observation',disposition:'close-publication'});const output=join(f.directory,'source-ready-recovery.json');await f.caller.backup(output);const b=await readLifecycleBackup(output);assert.equal(b.state.ai_attempts[result.attempt.id].status,'Reconciled');assert.equal(b.state.ai_attempts[result.attempt.id].raw.text,result.attempt.raw.text);assert.ok([...b.files].some(([p])=>p.endsWith('.bin')));await f.caller.revise(f.job.id,'Retain the reconciled attempt before an explicitly separate future request');assert.equal((await f.caller.generationStatus(f.job.id)).authoring.status,'Reconciled');assert.equal(f.counts.generation,1);
});

test('expired inference allowance does not require new spending to review an already Rendered PDF; pause still fences publication',async t=>{
 let time=Date.parse(at);const f=await fixture(t,{clock:()=>new Date(time)});await f.authorize();await f.generate();time+=16*60000;const receipt=JSON.parse(await f.caller.download(f.job.id,'export.json')),raster=await f.caller.rasters(f.job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit raster boundary only',pages:[substitutedPNG]});const done=await f.caller.complete(f.job.id,review(receipt,raster));assert.equal(done.status,'Review');assert.equal(f.counts.generation,1);
 const paused=await fixture(t);await paused.authorize();await paused.generate();const output=JSON.parse(await paused.caller.download(paused.job.id,'export.json')),png=await paused.caller.rasters(paused.job.id,{pdf_sha256:output.pdf.sha256,rasterizer:'Unit substitute',pages:[substitutedPNG]});await paused.caller.pauseGeneration(hash(paused.policy));await assert.rejects(paused.caller.complete(paused.job.id,review(output,png)),/paused/);
});

test('fresh authority reads reject stop, reassignment, reply, feedback, baseline and editable-source changes before count',async t=>{
 for(const change of ['stop','assignment','reply','feedback','baseline','editable-source']){const f=await fixture(t);await f.authorize();const entry=await f.storage.raw.getWithMetadata('workspace',{type:'json',consistency:'strong'}),r=entry.data.state.prospects['shared-proof'];if(change==='stop')r.restriction={kind:'dnc',source:'Fictional trusted stop change'};if(change==='assignment')r.follow_up_owner='friend';if(change==='reply')r.reply.body='Changed fictional reply';if(change==='feedback')r.project_work[f.job.work_id].request.feedback='Change the complete layout';if(change==='baseline')entry.data.state.asset_index[f.seed.id].baseline_version=null;if(change==='editable-source')delete entry.data.state.asset_index[f.seed.id].versions[f.seed.id].provenance.source_reference;await f.storage.raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});await assert.rejects(f.generate(),/context|assignment|changed/);assert.equal(f.counts.count,0,change);}
});

test('status distinguishes grant and runtime readiness without widening the old project profile or dispatching work',async t=>{
 let time=Date.parse(at);const f=await fixture(t,{clock:()=>new Date(time)}),session=await f.signed('owner');
 const projection=async()=>{const view=await session.json('/api/state');return view.shared_workspace;};
 const unapproved=await projection();assert.deepEqual(unapproved.generation,{policy:'Unapproved',runtime:'Enabled'});assert.match(unapproved.execution,/policy grant: Unapproved/);assert.doesNotMatch(unapproved.execution,/External execution disabled|interactive Node authoring only/);assert.ok(unapproved.unsupported.includes('sending'));assert.ok(!unapproved.unsupported.includes('provider-execution'));
 const landing=await f.make()(new Request('https://preview.example.invalid/desk/'));assert.match(await landing.text(),/bounded refinement requires an exact grant and enabled runtime/);
 await f.authorize();const active=await projection();assert.deepEqual(active.generation,{policy:'Authorized',runtime:'Enabled'});assert.match(active.execution,/Contact and sending remain disabled/);assert.match(active.execution,/actual raster and human semantic\/design review/);
 const disabledHandler=f.make({EVZ_REFINEMENT_GENERATION_ENABLED:undefined}),disabledSession=await sharedDeskSession({origin:'https://preview.example.invalid',key:f.env.EVZ_OPERATIONS_OWNER_KEY,fetcher:(url,options)=>disabledHandler(new Request(url,options))});assert.deepEqual((await disabledSession.json('/api/state')).shared_workspace.generation,{policy:'Authorized',runtime:'Disabled'});
 const local=await f.app.dashboard();assert.deepEqual(local.shared_workspace.generation,{policy:'Authorized',runtime:'Not checked'});
 const old=sharedProjectDashboard(f.original.packet.binding,await f.original.app.snapshot(),new Date(at));assert.equal(old.execution,'External execution disabled; interactive Node authoring only');assert.deepEqual(old.unsupported,['provider-execution','unattended-authoring']);assert.equal(old.generation,undefined);
 time+=16*60000;assert.equal((await projection()).generation.policy,'Expired');assert.equal((await session.json('/api/state?as_of=2026-10-24T21:14:00.000Z')).shared_workspace.generation.policy,'Expired');await f.caller.pauseGeneration(hash(f.policy));assert.equal((await projection()).generation.policy,'Paused');assert.deepEqual(f.counts,{count:0,generation:0,dispatch:0});
});
