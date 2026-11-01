import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect,fixtureQuote} from './lifecycle-fixtures.mjs';
import {archiveProjectAsset} from './project-assets.mjs';
import {projectContext,projectWorkContext} from './project-work.mjs';
import {applyDesignPreferences} from './design-preferences.mjs';
import {resumeAuthoring} from './project-authoring.mjs';
import {beginContinuation,completeContinuation,readContinuation,renderContinuation} from './project-continuation.mjs';
const at='2026-10-24T17:00:00.000Z',name='STUDIO TEST Willow Bakery',sha=b=>createHash('sha256').update(b).digest('hex');
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'evz-continue-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at),config:{...structuredClone(initialConfig),sender:{operator_names:{owner:'Test Owner',friend:'Test Friend'}}}});
 await app.apply(fixtureProspect('willow',at,name));
 await app.apply({id:'interest',prospect_id:'willow',type:'call_logged',at,data:{call_id:'call',outcome:'connected',desk:true,intent:'discovery',focus:'website',performed_at:at,simulated:true}});
 await app.apply({id:'original',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:'original',scope:'project',project_id:'willow',kind:'mockup',name:'Fictional original',version_id:'v1',version_label:'Original',reference:'private-path:fixture/original.pdf'}});
 const bytes=Buffer.from('%PDF-1.4\nSubstituted original boundary; real PDF in private integration proof.');
 await archiveProjectAsset(app,{project_id:'willow',asset_id:'original',version_id:'v1',context_sha256:projectContext(await app.snapshot(),'willow').context_sha256,expected_sha256:sha(bytes)},bytes,{reference:'private-path:fixture/original.pdf',name:'original.pdf',mime_type:'application/pdf',modified_time:at},'owner');return {app,bytes};
}
test('name entry reads exact original, routes the real skill and durably claims one same-project task',async t=>{
 const {app,bytes}=await setup(t),job=await beginContinuation(app,{name:'  studio test WILLOW  bakery ',kind:'website-concepts'});
 assert.equal(job.project_id,'willow');assert.equal(job.skill,'company-design-concepts');assert.equal(job.originals[0].original.sha256,sha(bytes));assert.deepEqual(await readFile(job.originals[0].path),bytes);
 const packet=JSON.parse(await readFile(job.context_file));assert.equal(packet.context_sha256,job.context_sha256);assert.equal(packet.source.company.name,name);
 assert.equal((await beginContinuation(await StudioLifecycle.open({directory:app.directory}),{name,kind:'website-concepts'})).id,job.id);
 assert.equal((await app.snapshot()).prospects.willow.project_work['website-concepts'].status,'Ready');
});
test('missing or ambiguous companies/tasks, assignment and corrupt originals hold without duplicate creation',async t=>{
 const {app}=await setup(t),before=await app.snapshot();
 await assert.rejects(beginContinuation(app,{name:'Unknown',kind:'website-concepts'}),/No exact/);
 await assert.rejects(beginContinuation(app,{name,kind:'client-proposal'}),/No Ready/);
 await assert.rejects(beginContinuation(app,{name,kind:'website-concepts'},'friend'),/assigned/);
 await app.apply(fixtureProspect('duplicate',at,name));await assert.rejects(beginContinuation(app,{name,kind:'website-concepts'}),/Ambiguous/);
 await app.change(s=>{delete s.prospects.duplicate;s.prospects.willow.project_work.extra={...s.prospects.willow.project_work['website-concepts'],id:'extra'};});
 await assert.rejects(beginContinuation(app,{name,kind:'website-concepts'}),/More than one/);
 await app.change(s=>{delete s.prospects.willow.project_work.extra;});
 const original=before.asset_index.original.versions.v1.verified_original;await writeFile(join(app.directory,'project-originals',original.sha256+'.pdf'),'corrupt');
 await assert.rejects(beginContinuation(app,{name,kind:'website-concepts'}),/integrity|size|hash/);
 assert.equal(Object.keys((await app.snapshot()).prospects).length,1);assert.equal((await app.snapshot()).prospects.willow.project_work['website-concepts'].execution,undefined);
});
test('an approved reference-only baseline holds instead of silently choosing another archived version',async t=>{
 const {app}=await setup(t);
 await app.change(s=>{const a=s.asset_index.original;a.versions.v2={id:'v2',reference:'private-path:missing.pdf'};a.baseline_version='v2';});
 await assert.rejects(beginContinuation(app,{name,kind:'website-concepts'}),/not archived/);
 assert.equal((await app.snapshot()).prospects.willow.project_work['website-concepts'].execution,undefined);
});
test('proposal entry routes the existing proposal skill only after exact operator approval',async t=>{
 const {app}=await setup(t);
 const event=(id,type,data)=>({id,prospect_id:'willow',type,at,data});
 await app.apply(event('discovery','discovery_confirmed',{goal:'Fictional pickup site',decision_maker:'Fictional Owner',serious_interest:true,paid_fit_discussed:true,service:'website',main_flow:'Choose and request pickup',preview_screens:3}));
 await app.apply(event('preview','preview_recorded',{reference:'fixture:preview',reviewed_with_owner:true}));
 await assert.rejects(beginContinuation(app,{name,kind:'client-proposal'}),/No Ready/);
 await app.apply(event('quote','proposal_approved',fixtureQuote),{actor:'friend'});
 const job=await beginContinuation(app,{name,kind:'client-proposal'}),packet=JSON.parse(await readFile(job.context_file));
 assert.equal(job.skill,'evz-proposals');assert.equal(packet.source.approved_quote.approved_by,'friend');assert.equal(packet.source.quote_sha256,hash((await app.snapshot()).prospects.willow.quote));
 assert.equal((await app.snapshot()).prospects.willow.agreement,undefined);
});
async function rendered(app,job){
 const packet=projectWorkContext(await app.snapshot(),job.project_id,job.work_id),source=applyDesignPreferences({schema_version:1,context_sha256:job.context_sha256,kind:job.kind,author:'Test author',requirements_review:'Test requirements',visual_premise:'Test premise',limitations:'Substituted renderer boundary; actual integration proof is separate.',questions:[],directions:Array.from({length:5},(_,i)=>({id:'d'+i,name:'Direction '+i,premise:'Different layout',tradeoff:'Different sequence',sections:['Services','Contact']})),pages:Array.from({length:5},(_,i)=>({direction:'d'+i}))},packet);
 const pdf=Buffer.from('%PDF-1.4\nSubstituted output boundary.'),png=Buffer.from('Substituted page'),receipt={schema_version:1,context_sha256:job.context_sha256,source_sha256:hash(source),pdf:{name:'output.pdf',sha256:sha(pdf),bytes:pdf.length},pages:[{page:1,name:'page-1.png',sha256:sha(png)}]};
 for(const [name,value] of Object.entries({'renderer.py':'fixed renderer','runtime.json':'{}','authored.json':JSON.stringify(source),'output.pdf':pdf,'page-1.png':png,'export.json':JSON.stringify(receipt)}))await writeFile(join(job.directory,name),value);
 await app.change(s=>Object.assign(s.prospects.willow.project_work[job.work_id].execution,{status:'Rendering',source_sha256:hash(source),renderer_sha256:hash('fixed renderer'),runtime_sha256:hash({})}));
 await resumeAuthoring(app,{project_id:job.project_id,work_id:job.work_id,job_id:job.id});
 return {export_sha256:hash(receipt),pages:receipt.pages,requirements:true,visual_design:true,export:true,notes:'Exact substituted pages inspected in state test; real visual inspection is a separate proof.'};
}
test('completion saves actual output and held attachment to the original company, reads back and survives restart',async t=>{
 const {app}=await setup(t),job=await beginContinuation(app,{name,kind:'website-concepts'}),review=await rendered(app,job);
 const result=await completeContinuation(app,job.id,review),read=result.readback;
 assert.equal(read.project_id,'willow');assert.equal(read.name,name);assert.equal(read.result.version_id,job.id);assert.equal(read.original.sha256,read.companion_draft.attachment.sha256);assert.equal(read.companion_draft.send_authorized,false);assert.equal(read.provenance.context_sha256,job.context_sha256);assert.equal(read.context.source.assets.find(a=>a.asset_id===job.id).baseline_version,null);
 assert.equal((await completeContinuation(await StudioLifecycle.open({directory:app.directory}),job.id,review)).readback.result.version_id,job.id);
 await assert.rejects(completeContinuation(app,job.id,{...review,notes:'Changed review'}),/retry differs/);
 await assert.rejects(readContinuation(app,'unknown'),/Unknown/);
 await writeFile(read.path,'corrupt');await assert.rejects(readContinuation(app,job.id),/integrity|size|hash/);
});
test('changed context after claim blocks publication and creates no companion draft',async t=>{
 const {app}=await setup(t),job=await beginContinuation(app,{name,kind:'website-concepts'}),review=await rendered(app,job);
 await app.apply({id:'new-note',prospect_id:'willow',type:'note_added',at,data:{note:'New requirements after claim'}});
 await assert.rejects(completeContinuation(app,job.id,review),/Context/);
 assert.equal((await app.snapshot()).prospects.willow.project_email_drafts,undefined);
 await assert.rejects(renderContinuation(app,'unknown','no-source',{}),/Unknown/);
});
test('changed editable baseline source holds name entry before a new refinement claim',async t=>{
 const {app}=await setup(t),job=await beginContinuation(app,{name,kind:'website-concepts'}),review=await rendered(app,job);
 await completeContinuation(app,job.id,review);
 await app.apply({id:'approve',prospect_id:'studio-assets',type:'asset_version_selected',at,data:{asset_id:job.id,version_id:job.id}});
 await app.apply({id:'refine',prospect_id:'willow',type:'concept_refinement_requested',at,data:{asset_id:job.id,version_id:job.id,selected_direction:'Direction 0',feedback:'Preserve this exact original.'}});
 const path=join(job.directory,'authored.json'),source=JSON.parse(await readFile(path));source.author='Changed after approval';await writeFile(path,JSON.stringify(source));
 await assert.rejects(beginContinuation(app,{name,kind:'website-refinement'}),/Editable source hash changed/);
 assert.equal((await app.snapshot()).prospects.willow.project_work['website-refinement-1'].execution,undefined);
 assert.equal((await app.snapshot()).asset_index[job.id].baseline_version,job.id);
});
