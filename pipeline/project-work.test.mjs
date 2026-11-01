import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {fixtureProspect,fixtureQuote} from './lifecycle-fixtures.mjs';
import {projectContext,projectWorkContext} from './project-work.mjs';
import {serveLifecycle} from './lifecycle-server.mjs';
const at='2026-10-24T15:00:00.000Z';
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'evz-project-work-'));t.after(()=>rm(directory,{recursive:true,force:true}));const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)});await app.apply(fixtureProspect('project',at));return app;}
const event=(id,type,data={},prospect_id='project')=>({id,prospect_id,type,at,data});
const apply=(app,id,type,data={},actor='owner')=>app.apply(event(id,type,data),{actor});
const asset=(app,id,project='project',kind='mockup')=>app.apply(event(`asset-${id}`,'asset_registered',{asset_id:id,scope:'project',project_id:project,kind,name:id,version_id:'v1',version_label:'v1',reference:`private-path:${project}/${id}-v1.pdf`},'studio-assets'),{actor:'friend'});
const interest=app=>apply(app,'interest','call_logged',{call_id:'call',outcome:'connected',desk:true,intent:'discovery',focus:'website',performed_at:at,simulated:true,note:'Owner requested a simpler booking route.'});
const reply=async(app,id='reply',data={})=>apply(app,`received-${id}`,'reply_received',{source_id:id,thread_id:'thread',kind:'reply',...data},'provider');
const review=async(app,id='review',data={},actor='friend')=>{const r=(await app.snapshot()).prospects.project;return apply(app,id,'reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),focus:'website',outcome:'discovery',...data},actor);};
async function record(app,work='website-concepts',id='concepts',extra={}){const packet=projectWorkContext(await app.snapshot(),'project',work);return apply(app,`output-${work}`,'project_work_recorded',{work_id:work,context_sha256:packet.context_sha256,asset_id:id,version_id:'v1',direction_count:5,export_reviewed:true,...extra},'friend');}

test('no-answer website call then exact signed website reply interest queues one concepts handoff',async t=>{
 const app=await setup(t);await apply(app,'no-answer','call_logged',{call_id:'no-answer',outcome:'no_answer',desk:true,focus:'website',performed_at:at,simulated:true});await reply(app);
 const before=await app.snapshot();assert.equal(before.prospects.project.project_work,undefined);
 await review(app);const state=await app.snapshot(),r=state.prospects.project,work=r.project_work?.['website-concepts'];assert.ok(work,'website reply interest must create concepts without another discovery event');assert.equal(work.status,'Ready');assert.equal(work.requested_by,'friend');assert.equal(work.request.reply_sha256,hash(r.reply));assert.equal(work.request.review_event,'review');assert.equal(r.reply_review.actor,'friend');assert.equal(r.reply_review.review_event,'review');assert.deepEqual(state.actions,before.actions);
 const packet=projectWorkContext(state,'project','website-concepts');assert.equal(packet.source.reply_source.sha256,hash(r.reply));assert.equal(packet.source.reply_source.thread_id,'thread');assert.equal(packet.source.reply_review.focus,'website');
 await review(app);await apply(app,'prepare-again','project_preparation_requested');assert.equal(Object.keys((await app.snapshot()).prospects.project.project_work).length,1);
});

test('reply approval requires current identity, source hash, focus and signed actor; legacy review cannot infer interest',async t=>{
 const app=await setup(t);await reply(app);const before=await app.snapshot();
 for(const data of [{source_id:'other'}, {reply_sha256:hash('old reply')}, {reply_sha256:undefined}, {focus:undefined}, {focus:'website,systems'}])await assert.rejects(review(app,`invalid-${Object.keys(data)[0]}-${String(Object.values(data)[0]).replaceAll(',','-')}`,data),/exact current reply|Choose the service/);
 await assert.rejects(review(app,'unsigned',{},'worker'),/requires owner review/);assert.deepEqual(await app.snapshot(),before);
 await app.change(s=>{const r=s.prospects.project;r.stage='Discovery';r.reply_review={source_id:'reply',outcome:'discovery',actor:'owner',at};});
 await assert.rejects(apply(app,'legacy-prepare','project_preparation_requested'),/Confirm a website focus/);assert.equal((await app.snapshot()).prospects.project.project_work,undefined);
 await review(app,'legacy-explicit-review');const current=(await app.snapshot()).prospects.project;assert.equal(current.project_work['website-concepts'].status,'Ready');assert.deepEqual(current.reply_review_history[0],{source_id:'reply',outcome:'discovery',actor:'owner',at,superseded_by:'legacy-explicit-review'});
});

test('unconfirmed/nonwebsite focus, busy callback, declined, DNC and wrong-contact replies never create concepts',async t=>{
 for(const [index,data] of [{focus:'unspecified'}, {focus:'systems'}, {focus:'ai'}, {focus:'marketing'}, {outcome:'hold',note:'Busy; callback requested.'}, {outcome:'decline'}, {outcome:'do_not_contact'}, {outcome:'hold',note:'Wrong contact.'}].entries()){
  const app=await setup(t);await reply(app);await review(app,`negative-${index}`,data);const r=(await app.snapshot()).prospects.project;assert.equal(r.project_work,undefined);if(data.focus==='unspecified')assert.match(r.next_check,/which service/);
 }
});

test('unconfirmed focus can be clarified against the same reply or the existing qualified discovery route',async t=>{
 const app=await setup(t);await reply(app);await review(app,'unknown',{focus:'unspecified'});await review(app,'clarified',{},'owner');assert.equal((await app.snapshot()).prospects.project.project_work['website-concepts'].status,'Ready');
 const legacy=await setup(t);await reply(legacy);await review(legacy,'unknown',{focus:'unspecified'});await apply(legacy,'qualified','discovery_confirmed',{goal:'Simpler enquiries',decision_maker:'Owner',serious_interest:true,paid_fit_discussed:true,service:'website',main_flow:'Request details',preview_screens:2});assert.equal((await legacy.snapshot()).prospects.project.project_work['website-concepts'].status,'Ready');
});

test('changed replies hold stale preparation and source approval; fresh review reuses one item without changing approved assets',async t=>{
 const app=await setup(t);await reply(app);await review(app);await asset(app,'concepts');await app.apply(event('baseline','asset_version_selected',{asset_id:'concepts',version_id:'v1'},'studio-assets'),{actor:'owner'});await record(app);
 const old=await app.snapshot(),oldReview=event('review','reply_reviewed',structuredClone(old.events.review.data)),oldPacket=projectWorkContext(old,'project','website-concepts');
 await reply(app,'reply-revised',{source_id:'reply',thread_id:'changed-thread'});let state=await app.snapshot(),r=state.prospects.project;assert.equal(r.reply_review,undefined);assert.equal(r.reply_review_history[0].review_event,'review');assert.equal(r.project_work['website-concepts'].status,'Held');assert.ok(r.project_work['website-concepts'].result);assert.deepEqual(state.asset_index,old.asset_index);
 await assert.rejects(apply(app,'old-hash','reply_reviewed',oldReview.data),/exact current reply/);assert.equal((await app.apply(oldReview,{actor:'friend'})).duplicate,true);assert.equal((await app.snapshot()).prospects.project.reply_review,undefined);
 await assert.rejects(apply(app,'old-output','project_work_recorded',{work_id:'website-concepts',context_sha256:oldPacket.context_sha256}),/unfinished preparation/);
 await review(app,'review-systems',{focus:'systems'});assert.equal((await app.snapshot()).prospects.project.project_work['website-concepts'].status,'Held');
 await assert.rejects(apply(app,'stale-refinement','concept_refinement_requested',{asset_id:'concepts',version_id:'v1',selected_direction:'3',feedback:'Keep this direction.'}),/exact prepared/);
 await reply(app,'website-again');await review(app,'review-again',{},'owner');r=(await app.snapshot()).prospects.project;assert.equal(Object.keys(r.project_work).length,1);assert.equal(r.project_work['website-concepts'].status,'Ready');assert.equal(r.project_work['website-concepts'].result,undefined);assert.equal(r.project_work['website-concepts'].history[0].result.asset_id,'concepts');assert.equal(r.project_work['website-concepts'].request.review_event,'review-again');assert.deepEqual((await app.snapshot()).asset_index,old.asset_index);
 await apply(app,'systems-discovery','discovery_confirmed',{goal:'Simplify internal work',decision_maker:'Owner',serious_interest:true,paid_fit_discussed:true,service:'systems',main_flow:'Internal request',preview_screens:1});await apply(app,'reprepare','project_preparation_requested');assert.equal((await app.snapshot()).prospects.project.project_work['website-concepts'].status,'Held');
});

test('concurrent exact reply reviews and preparation retries retain a single concepts item',async t=>{
 const app=await setup(t);await reply(app);const revision=(await app.snapshot()).revision,r=(await app.snapshot()).prospects.project,data={source_id:r.reply.source_id,reply_sha256:hash(r.reply),focus:'website',outcome:'requested_info'};
 const results=await Promise.allSettled(['owner','friend'].map(actor=>app.apply(event(`concurrent-${actor}`,'reply_reviewed',data),{actor,expectedRevision:revision})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/changed/);
 await Promise.all(['a','b'].map(id=>apply(app,`prepare-${id}`,'project_preparation_requested')));assert.equal(Object.keys((await app.snapshot()).prospects.project.project_work).length,1);
});

test('a reply-invalidated unfinished refinement stays history without blocking a new explicitly authorized round',async t=>{
 const app=await setup(t);await reply(app);await review(app);await asset(app,'concepts');await record(app);await apply(app,'refine-before-reply','concept_refinement_requested',{selected_direction:'Direction 3',asset_id:'concepts',version_id:'v1',feedback:'Simplify its hero.'});
 await reply(app,'new-reply');await review(app,'new-review');assert.equal((await app.snapshot()).prospects.project.project_work['website-refinement-1'].status,'Held');await asset(app,'new-concepts');const packet=projectWorkContext(await app.snapshot(),'project','website-concepts');await apply(app,'new-concepts-output','project_work_recorded',{work_id:'website-concepts',context_sha256:packet.context_sha256,asset_id:'new-concepts',version_id:'v1',direction_count:5,export_reviewed:true});
 await apply(app,'authorize-new-round','unpaid_refinement_exception',{approved:true,extra_rounds:1,reason:'The reply changed the interest; explicitly authorize one more focused round.'});await apply(app,'refine-after-reply','concept_refinement_requested',{selected_direction:'Direction 3',asset_id:'new-concepts',version_id:'v1',feedback:'Refine the current approved interest.',exception_id:'authorize-new-round'});const work=(await app.snapshot()).prospects.project.project_work;assert.equal(work['website-refinement-1'].status,'Held');assert.equal(work['website-refinement-2'].status,'Ready');
});
test('confirmed website interest queues one attributed handoff; undo removes it and unrelated outcomes do not queue',async t=>{
 const app=await setup(t);await interest(app);let state=await app.snapshot();assert.equal(state.prospects.project.project_work['website-concepts'].assigned_to,'owner');assert.equal(state.prospects.project.project_work['website-concepts'].status,'Ready');
 assert.equal((await interest(app)).duplicate,true);assert.equal(Object.keys((await app.snapshot()).prospects.project.project_work).length,1);
 await apply(app,'undo','call_undone',{call_id:'call'});assert.equal((await app.snapshot()).prospects.project.project_work,undefined);
 await apply(app,'unanswered','call_logged',{call_id:'unanswered',outcome:'no_answer',desk:true,performed_at:at,simulated:true,focus:'website'});assert.equal((await app.snapshot()).prospects.project.project_work,undefined);
});
test('existing reviewed projects opt into the same handoff without a migration or duplicate task',async t=>{
 const app=await setup(t);await interest(app);await app.change(s=>{delete s.prospects.project.project_work;});await apply(app,'recover-project','project_preparation_requested');assert.equal((await app.snapshot()).prospects.project.project_work['website-concepts'].requested_by,'owner');
 await apply(app,'recover-again','project_preparation_requested');assert.equal(Object.keys((await app.snapshot()).prospects.project.project_work).length,1);
});
test('private context carries only approved baselines and exact scoped feedback; stale output fails without mutation',async t=>{
 const app=await setup(t);await interest(app);await app.apply(fixtureProspect('other',at));await asset(app,'concepts');await asset(app,'other-design','other');
 await app.apply(event('baseline','asset_version_selected',{asset_id:'concepts',version_id:'v1'},'studio-assets'),{actor:'friend'});
 await app.apply(event('new-draft','asset_version_registered',{asset_id:'concepts',version_id:'v2',version_label:'v2',reference:'private-path:project/concepts-v2.pdf'},'studio-assets'),{actor:'owner'});
 const feedback=(id,asset_id,scope,project_id)=>app.apply(event(id,'asset_feedback_added',{asset_id,version_id:asset_id==='concepts'?'v2':'v1',feedback:id,scope,...(project_id?{project_id}:{})},'studio-assets'),{actor:'friend'});
 await feedback('local-feedback','concepts','project','project');await feedback('unrelated-feedback','other-design','project','other');await feedback('explicit-studio','other-design','studio');
 let packet=projectWorkContext(await app.snapshot(),'project','website-concepts');assert.deepEqual(packet.source.approved_assets.map(a=>a.version_id),['v1']);assert.deepEqual(packet.source.preferences,[]);const recalled=projectContext(await app.snapshot(),'project',{includePreferences:true});assert.deepEqual(recalled.source.preferences.map(f=>f.id),['local-feedback','explicit-studio']);assert.equal(recalled.source.preferences[0].source_version_is_baseline,false);assert.match(packet.execution.private_notes,/Internal/);
 const stale=packet.context_sha256;await apply(app,'updated-note','call_note_updated',{call_id:'call',note:'Owner clarified their booking goal.'});const before=await app.snapshot();
 await assert.rejects(apply(app,'stale-output','project_work_recorded',{work_id:'website-concepts',context_sha256:stale,asset_id:'concepts',version_id:'v1',direction_count:5,export_reviewed:true}),/context changed/);assert.deepEqual(await app.snapshot(),before);
 await record(app);const saved=(await app.snapshot()).prospects.project.project_work['website-concepts'];assert.equal(saved.prepared_by,'friend');assert.equal(saved.status,'Review');assert.equal((await app.snapshot()).asset_index.concepts.baseline_version,'v1');assert.equal((await app.snapshot()).prospects.project.stage,'Discovery');
});
test('asset feedback and approval changes invalidate output; foreign outputs never approve or mutate email intents',async t=>{
 const app=await setup(t);await interest(app);await asset(app,'concepts');await app.apply(fixtureProspect('other',at));await asset(app,'foreign','other');
 const get=async()=>projectWorkContext(await app.snapshot(),'project','website-concepts');let packet=await get();
 await app.apply(event('fresh-feedback','asset_feedback_added',{asset_id:'concepts',version_id:'v1',feedback:'Keep the true company logo.',scope:'project',project_id:'project'},'studio-assets'),{actor:'friend'});
 await assert.rejects(apply(app,'stale-feedback-output','project_work_recorded',{work_id:'website-concepts',context_sha256:packet.context_sha256,asset_id:'concepts',version_id:'v1',direction_count:5,export_reviewed:true}),/context changed/);
 packet=await get();await app.apply(event('fresh-approval','asset_version_selected',{asset_id:'concepts',version_id:'v1'},'studio-assets'),{actor:'owner'});
 await assert.rejects(apply(app,'stale-approval-output','project_work_recorded',{work_id:'website-concepts',context_sha256:packet.context_sha256,asset_id:'concepts',version_id:'v1',direction_count:5,export_reviewed:true}),/context changed/);
 await assert.rejects(record(app,'website-concepts','foreign'),/this project output/);
 const before=await app.snapshot();await record(app);const after=await app.snapshot();assert.deepEqual(after.actions,before.actions);assert.deepEqual(after.operations,before.operations);assert.equal(after.asset_index.concepts.baseline_version,'v1');
});
test('one unpaid refinement; later round needs one explicit unused exception and quoted revisions stay separate',async t=>{
 const app=await setup(t);await interest(app);await asset(app,'concepts');await record(app);
 await apply(app,'refine-1','concept_refinement_requested',{selected_direction:'Direction 3 - contemporary',asset_id:'concepts',version_id:'v1',feedback:'Keep the direction; simplify its hero.'});assert.equal((await app.snapshot()).prospects.project.project_work['website-refinement-1'].request.reference,'private-path:project/concepts-v1.pdf');await assert.rejects(apply(app,'parallel','concept_refinement_requested',{selected_direction:'Direction 3 - contemporary',asset_id:'concepts',version_id:'v1',feedback:'Another request.'}),/Finish the current/);
 await assert.rejects(record(app,'website-refinement-1','concepts'),/new immutable version/);await asset(app,'refined');await record(app,'website-refinement-1','refined');const before=await app.snapshot();
 await assert.rejects(apply(app,'refine-without-exception','concept_refinement_requested',{selected_direction:'Direction 3 - contemporary',asset_id:'refined',version_id:'v1',feedback:'Second focused refinement.'}),/One unpaid refinement is used/);assert.deepEqual(await app.snapshot(),before);
 await apply(app,'extra-round','unpaid_refinement_exception',{approved:true,extra_rounds:1,reason:'Operator explicitly grants one extra test round.'},'friend');await assert.rejects(apply(app,'changed-direction','concept_refinement_requested',{selected_direction:'Different direction',asset_id:'refined',version_id:'v1',feedback:'Change the direction.',exception_id:'extra-round'}),/Keep the selected direction/);await apply(app,'refine-2','concept_refinement_requested',{selected_direction:'Direction 3 - contemporary',asset_id:'refined',version_id:'v1',feedback:'Second focused refinement.',exception_id:'extra-round'});
 assert.equal((await app.snapshot()).prospects.project.unpaid_refinement_exceptions[0].used_by,'refine-2');await asset(app,'refined-again');await record(app,'website-refinement-2','refined-again');
 await assert.rejects(apply(app,'reuse-exception','concept_refinement_requested',{selected_direction:'Direction 3 - contemporary',asset_id:'refined-again',version_id:'v1',feedback:'Third round.',exception_id:'extra-round'}),/One unpaid refinement/);
 await app.change(s=>{s.prospects.project.quote={...fixtureQuote};});await assert.rejects(apply(app,'after-quote','concept_refinement_requested',{selected_direction:'Direction 3 - contemporary',asset_id:'refined-again',version_id:'v1',feedback:'Another round.'}),/separate from quoted/);
 const restarted=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)});assert.equal((await restarted.snapshot()).prospects.project.pre_sale_refinements.length,2);
});
test('exact quote approval routes proposal only after internal review stage; wrong quote/project/actor and stops hold',async t=>{
 const app=await setup(t);await interest(app);await apply(app,'discovery','discovery_confirmed',{goal:'Make requests easier',decision_maker:'Fictional owner',serious_interest:true,paid_fit_discussed:true,service:'website',main_flow:'Request a booking',preview_screens:3});await apply(app,'preview','preview_recorded',{reference:'/preview/',brief:'Booking flow',reviewed_with_owner:true});
 let state=await app.snapshot();assert.ok(state.prospects.project.project_work['internal-scope']);assert.equal(state.prospects.project.project_work['client-proposal'],undefined);
 await assert.rejects(record(app,'internal-scope','', {internal_review:'Internal review',internal_only:false}),/internal/);
 await record(app,'internal-scope','',{internal_review:'Internal scope and exact price remain for operator approval.',internal_only:true});await apply(app,'approve-price','proposal_approved',fixtureQuote,'friend');await asset(app,'proposal','project','proposal');
 state=await app.snapshot();assert.equal(state.prospects.project.quote.approved_by,'friend');assert.ok(state.prospects.project.project_work['client-proposal']);
 await assert.rejects(record(app,'client-proposal','proposal',{quote_sha256:hash('wrong quote')}),/exact operator-approved/);await record(app,'client-proposal','proposal',{quote_sha256:hash(state.prospects.project.quote)});assert.equal((await app.snapshot()).prospects.project.agreement,undefined);
 await assert.rejects(apply(app,'untrusted','unpaid_refinement_exception',{approved:true,extra_rounds:1,reason:'Test'},'worker'),/signed operator/);
 await apply(app,'stop','contact_stopped',{reason:'do_not_contact'});await assert.rejects(apply(app,'stopped-work','project_work_recorded',{work_id:'website-concepts'}),/Restriction/);
});
test('oversized or credential-bearing context holds handoff without losing the recorded conversation',async t=>{
 const app=await setup(t);await app.change(s=>{s.prospects.project.note='api_key=synthetic-credential-value';});await interest(app);let s=await app.snapshot();assert.equal(s.prospects.project.stage,'Discovery');assert.match(s.prospects.project.project_work['website-concepts'].context_hold,/credentials/);assert.throws(()=>projectContext(s,'project'),/credentials/);
 await app.change(s=>{s.prospects.project.note='x'.repeat(121000);});
 s=await app.snapshot();assert.throws(()=>projectContext(s,'project'),/bounded handoff/);assert.throws(()=>projectContext(s,'constructor'),/Unknown project/);
});
test('real authenticated HTTP reads current project packet and writes reviewed output through the event route',async t=>{
 const app=await setup(t);await interest(app);await asset(app,'concepts');const server=await serveLifecycle(app,{port:0,quiet:true,operatorAuth:null});t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`,page=await fetch(base),cookie=page.headers.get('set-cookie').split(';')[0],csrf=(await(await fetch(base+'/api/bootstrap',{headers:{cookie}})).json()).csrf;
 assert.notEqual((await fetch(base+'/api/project-context/project/website-concepts')).status,200);const response=await fetch(base+'/api/project-context/project/website-concepts',{headers:{cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const packet=await response.json();assert.equal(packet.workflow.skill,'company-design-concepts');
 const saved=await fetch(base+'/api/event',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({revision:(await app.snapshot()).revision,event:event('http-output','project_work_recorded',{work_id:'website-concepts',context_sha256:packet.context_sha256,asset_id:'concepts',version_id:'v1',direction_count:5,export_reviewed:true})})});assert.equal(saved.status,200);assert.equal((await app.snapshot()).prospects.project.project_work['website-concepts'].status,'Review');
 await app.apply(event('http-preference','asset_feedback_added',{asset_id:'concepts',version_id:'v1',feedback:'Likes warm colors.'},'studio-assets'),{actor:'owner'});
 const ordinary=await(await fetch(base+'/api/project-context/project',{headers:{cookie}})).json();assert.deepEqual(ordinary.source.preferences,[]);assert.equal(JSON.stringify(ordinary).includes('Likes warm colors.'),false);
 const recalled=await(await fetch(base+'/api/project-context/project?preferences=1',{headers:{cookie}})).json();assert.equal(recalled.source.preferences[0].feedback,'Likes warm colors.');assert.notEqual((await fetch(base+'/api/project-context/project?preferences=1')).status,200);
});
