import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {projectContext} from './project-work.mjs';
import {applyDesignPreferences} from './design-preferences.mjs';
import {main as studioContext} from '../scripts/studio-context.mjs';
const at='2026-10-24T15:00:00.000Z';
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'evz-preferences-'));t.after(()=>rm(directory,{recursive:true,force:true}));const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)});for(const project of ['project','other']){await app.apply(fixtureProspect(project,at));await app.apply({id:'asset-'+project,prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:project,scope:'project',project_id:project,name:project,kind:'mockup',version_id:'v1',version_label:'v1',reference:`private-path:${project}/v1.pdf`}});}return app;}
const feedback=(app,id,feedback,actor='owner',extra={})=>app.apply({id,prospect_id:'studio-assets',type:'asset_feedback_added',at,data:{asset_id:'project',version_id:'v1',feedback,...extra}},{actor});
const context=async(app,project='project')=>projectContext(await app.snapshot(),project,{includePreferences:true}).source;

test('Always/Never wording alone does not broaden a client preference to other clients',async t=>{
 const app=await setup(t);await feedback(app,'private-standard','Always use "Syne" for heading font.');
 assert.equal((await context(app)).preferences[0].scope,'project');
 assert.equal((await context(app,'other')).preferences.length,0);
 const saved=(await app.snapshot()).asset_index.project.feedback[0];
 await app.change(state=>Object.assign(state.asset_index.project.feedback[0],{scope:'studio',scope_selection:'auto',source_project_id:'project'}));
 assert.equal((await context(app,'other')).preferences.length,0,'historical auto-broadened rules cannot leak');
 assert.equal((await context(app)).preferences[0].scope,'project');
 assert.equal((await app.snapshot()).asset_index.project.feedback[0].scope,'studio','projection preserves original history');
 assert.equal(saved.scope,'project');
});

test('requested CLI recall resolves the exact existing company and leaves all client records unchanged',async t=>{
 const app=await setup(t);await app.change(state=>{state.prospects.project.name='Exact Bakery';state.prospects.other.name='Other Bakery';});
 await feedback(app,'client-like','Likes warm colors and quiet transitions.');
 const before=await app.snapshot(),result=await studioContext(['preferences',app.directory,'Exact Bakery']);
 assert.equal(result.project_id,'project');assert.equal(result.preferences[0].feedback,'Likes warm colors and quiet transitions.');
 assert.equal(result.preferences[0].scope,'project');assert.equal(result.company,undefined);assert.equal(result.conversations,undefined);
 const ordinary=projectContext(before,'project');assert.deepEqual(ordinary.source.preferences,[]);assert.equal(JSON.stringify(ordinary.source).includes('Likes warm colors and quiet transitions.'),false,'ordinary packets withhold optional history');assert.equal(ordinary.source.design_preferences.active.length,0);
 assert.deepEqual(await app.snapshot(),before);
 await assert.rejects(studioContext(['preferences',app.directory,'Bakery']),/No exact company/);
 await app.change(state=>{state.prospects.other.name='Exact Bakery';});
 await assert.rejects(studioContext(['preferences',app.directory,'Exact Bakery']),/Ambiguous company/);
});

test('current refinement instructions survive unrelated revisions while optional history is withheld',async t=>{
 const app=await setup(t),state=await app.snapshot(),request={asset_id:'project',version_id:'v1',feedback:'Use "Syne" for heading font.',requested_by:'owner',at};
 const before=projectContext(state,'project',{kind:'website-refinement',request});state.revision+=10;
 const after=projectContext(state,'project',{kind:'website-refinement',request});assert.equal(after.context_sha256,before.context_sha256);assert.equal(after.source.design_preferences.active[0].value,'Syne');assert.deepEqual(after.source.preferences,[]);
});
test('scope selection preserves project intent, quoted client text and saved history while authoring consumes only the applicable rules',async t=>{
 const app=await setup(t);
 await feedback(app,'ordinary','Use "Outfit" for body font.');
 await feedback(app,'local-always','Always use "Syne" for heading font.','friend',{scope:'project'});
 for(const [id,quote] of [['bound','For this project, always use "Arial" for heading font.'],['client','Client said: Always use "Arial" for heading font.'],['quoted','"Never use Arial for heading font."'],['broad','Always make designs less generic.']])await feedback(app,id,quote);
 await feedback(app,'shared','Never use "Arial" for heading font.','friend',{scope:'auto',project_id:'project'});
 await feedback(app,'manual-studio','Use "Syne" for body font.','owner',{scope:'studio'});
 const local=await context(app),other=await context(app,'other');
 assert.equal(local.preferences.find(f=>f.id==='local-always').scope_selection,'project');assert.equal(local.preferences.find(f=>f.id==='local-always').scope,'project');
 assert.deepEqual(other.preferences.map(f=>f.id),['manual-studio']);assert.equal(local.design_preferences.feedback.find(f=>f.id==='broad').status,'tentative');assert.equal(other.design_preferences.suggestions.length,0);
 const applied=applyDesignPreferences({kind:'website-concepts',pages:structuredClone(pages)},{source:other});assert.equal(applied.pages[0].commands[0].font,'Manrope');assert.equal(applied.pages[0].commands[1].font,'Syne');assert.ok(applied.preference_application.applied.every(r=>r.scope==='studio'));
 const before=await app.snapshot();await app.change(state=>{const legacy=state.asset_index.project.feedback.find(f=>f.id==='local-always');delete legacy.scope_selection;delete legacy.scope_reason;delete legacy.source_project_id;});
 const retained=(await app.snapshot()).asset_index.project.feedback,opened=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)});await feedback(opened,'new','Never use "Times-Roman" for heading font.');assert.deepEqual((await opened.snapshot()).asset_index.project.feedback.slice(0,-1),retained);assert.equal((await context(opened,'other')).preferences.some(f=>f.id==='local-always'),false);assert.equal(before.asset_index.project.baseline_version,(await opened.snapshot()).asset_index.project.baseline_version);
 await assert.rejects(feedback(app,'bad-scope','Always use "Syne" for heading font.','owner',{scope:'automatic'}),/scope/);
 await assert.rejects(feedback(app,'bad-source-project','Always use "Syne" for heading font.','owner',{scope:'auto',project_id:'other'}),/existing project/);
});
test('saved explicit directions become scoped rules; ambiguous/repeated feedback only suggests, and quoted attribution survives',async t=>{
 const app=await setup(t);await feedback(app,'font','Always use "Syne" for heading font.','friend');await feedback(app,'maybe-one','Maybe use "Outfit" for body font.');await feedback(app,'maybe-two','Maybe use "Outfit" for body font.','friend');await feedback(app,'vague','Avoid generic designs and boring fonts.');
 const source=await context(app),design=source.design_preferences;assert.equal(design.method,'Bounded rules; semantic interpretation requires author review');assert.deepEqual(design.active.map(r=>[r.target,r.mode,r.value,r.scope]),[['heading_font','use','Syne','project']]);assert.equal(design.suggestions.length,1);assert.equal(design.suggestions[0].promoted,false);assert.equal(design.feedback.find(f=>f.id==='vague').status,'tentative');assert.equal(source.preferences[0].feedback,'Always use "Syne" for heading font.');assert.equal(source.preferences[0].actor,'friend');assert.equal(source.preferences[0].scope_selection,'auto');assert.match(source.preferences[0].scope_reason,/explicit confirmation/);assert.equal(source.preferences[0].source_project_id,'project');assert.equal((await context(app,'other')).design_preferences.active.length,0);
 await feedback(app,'studio-never','Never use "Manrope" for heading font.','owner',{scope:'studio'});assert.equal((await context(app,'other')).design_preferences.active[0].mode,'never');assert.equal((await context(app,'other')).design_preferences.active[0].scope,'studio');
});
test('operator contradiction preserves baseline until both give fresh matching directions; newer baseline makes old feedback stale',async t=>{
 const app=await setup(t);await feedback(app,'owner-use','Use "Syne" for heading font.');await feedback(app,'friend-use','Use "Outfit" for heading font.','friend');let plan=(await context(app)).design_preferences;assert.equal(plan.conflicts.length,1);assert.equal(plan.active.length,0);
 await feedback(app,'friend-agrees','Use "Syne" for heading font.','friend');assert.equal((await context(app)).design_preferences.conflicts.length,1,'one operator cannot unilaterally resolve the conflict');await feedback(app,'owner-confirms','Use "Syne" for heading font.');assert.equal((await context(app)).design_preferences.conflicts.length,0);
 await app.apply({id:'baseline',prospect_id:'studio-assets',type:'asset_version_selected',at,data:{asset_id:'project',version_id:'v1'}});plan=(await context(app)).design_preferences;assert.equal(plan.active.length,0);assert.equal(plan.feedback[0].status,'stale');await feedback(app,'fresh','Use "Syne" for heading font.');assert.equal((await context(app)).design_preferences.active.length,1);
});
const pages=[{title:'Fictional',direction:'d1',width:1200,height:1600,background:'#FFFFFF',commands:[{op:'text',role:'heading',x:50,y:50,text:'Approved words',font:'Manrope',size:70},{op:'text',role:'body',x:50,y:150,text:'Approved body',font:'Manrope',size:24}]}];
test('actual declarative output applies explicit properties, rejects never/unchecked ambiguity and protects approved wording/layout during conflict',async t=>{
 const app=await setup(t);await feedback(app,'use','Use "Syne" for heading font.');await feedback(app,'never','Never use "Arial" for body font.');const packet={source:await context(app)},source={kind:'website-refinement',pages:structuredClone(pages)};
 const baseline={asset_id:'project',version_id:'v1',source_sha256:'approved-source',pages};const applied=applyDesignPreferences(source,packet,baseline);assert.equal(applied.pages[0].commands[0].font,'Syne');assert.equal(source.pages[0].commands[0].font,'Manrope');assert.equal(applied.pages[0].commands[1].text,'Approved body');
 const bad=structuredClone(source);bad.pages[0].commands[1].font='Arial';assert.throws(()=>applyDesignPreferences(bad,packet),/never preference/);bad.pages[0].commands[1].font='Manrope';bad.pages[0].commands[1].text='Unexpected replacement';assert.throws(()=>applyDesignPreferences(bad,packet,baseline),/Approved composition or wording/);
 await feedback(app,'conflict','Use "Outfit" for heading font.','friend');const conflictPacket={source:await context(app)};assert.throws(()=>applyDesignPreferences(source,conflictPacket),/verified declarative approved baseline/);const preserved=applyDesignPreferences(source,conflictPacket,baseline);assert.equal(preserved.pages[0].commands[0].font,'Manrope');assert.equal(preserved.preference_application.preserved_conflicts.length,1);
 await feedback(app,'ambiguous','Make the design less generic.');const ambiguousPacket={source:await context(app)};assert.throws(()=>applyDesignPreferences(source,ambiguousPacket,baseline),/tentative\/stale/);const reviewed=applyDesignPreferences({...source,preference_review:[{feedback_id:'ambiguous',decision:'defer',notes:'Retain the approved identity; discuss new composition only after this focused round.'}]},ambiguousPacket,baseline);assert.equal(reviewed.pages[0].commands[0].text,'Approved words');
});
test('a conflicting instruction cannot be bypassed by one operator approving a newer version',async t=>{
 const app=await setup(t),assetEvent=(id,type,data,actor='owner')=>app.apply({id,prospect_id:'studio-assets',type,at,data:{asset_id:'project',...data}},{actor});
 await assetEvent('approve','asset_version_selected',{version_id:'v1'});await assetEvent('new','asset_version_registered',{version_id:'v2',version_label:'v2',reference:'private-path:project/v2.pdf'});
 await feedback(app,'owner','Use "Syne" for heading font.');await feedback(app,'friend','Use "Outfit" for heading font.','friend');await assetEvent('one-choice','asset_version_selected',{version_id:'v2'});let state=await app.snapshot();assert.equal(state.asset_index.project.baseline_version,'v1');assert.ok(state.asset_index.project.dispute);await assetEvent('both-choice','asset_version_selected',{version_id:'v2'},'friend');state=await app.snapshot();assert.equal(state.asset_index.project.baseline_version,'v2');assert.deepEqual(state.asset_index.project.baseline_agreement_events,['one-choice','both-choice']);assert.equal((await context(app)).design_preferences.active.length,0,'old feedback requires review against the new agreed baseline');
});
test('explicit studio standards survive source-version changes; distinct never constraints remain active',async t=>{
 const app=await setup(t);await feedback(app,'ban-one','Never use "Arial" for heading font.','friend',{scope:'studio'});await feedback(app,'ban-two','Never use "Manrope" for heading font.','friend',{scope:'studio'});await app.apply({id:'source-baseline-changed',prospect_id:'studio-assets',type:'asset_version_selected',at,data:{asset_id:'project',version_id:'v1'}});
 const source=await context(app,'other'),plan=source.design_preferences;assert.deepEqual(plan.active.map(r=>r.value),['Arial','Manrope']);assert.equal(plan.feedback[0].source_baseline_changed,true);const bad=structuredClone(pages);bad[0].commands[0].font='Arial';assert.throws(()=>applyDesignPreferences({kind:'website-concepts',pages:bad},{source}),/never preference/);
});
test('explicit shared standards preserve another project baseline through a conflict until both operators freshly agree',async t=>{
 const app=await setup(t);await feedback(app,'shared-owner','Always use "Syne" for heading font.','owner',{scope:'studio'});const before=projectContext(await app.snapshot(),'other');
 await feedback(app,'shared-friend','Always use "Outfit" for heading font.','friend',{scope:'studio'});let packet={source:await context(app,'other')};assert.notEqual(projectContext(await app.snapshot(),'other').context_sha256,before.context_sha256);assert.equal(packet.source.design_preferences.conflicts[0].scope,'studio');
 const baseline={asset_id:'other',version_id:'v1',source_sha256:'approved-source',pages};const source={kind:'website-refinement',pages:structuredClone(pages)};assert.equal(applyDesignPreferences(source,packet,baseline).pages[0].commands[0].font,'Manrope');
 await feedback(app,'friend-matches','Always use "Syne" for heading font.','friend',{scope:'studio'});assert.equal((await context(app,'other')).design_preferences.conflicts.length,1);await feedback(app,'owner-fresh','Always use "Syne" for heading font.','owner',{scope:'studio'});packet={source:await context(app,'other')};assert.equal(packet.source.design_preferences.conflicts.length,0);assert.equal(applyDesignPreferences(source,packet,baseline).pages[0].commands[0].font,'Syne');
});
