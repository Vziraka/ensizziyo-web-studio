import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {PDFDocument,PDFName} from 'pdf-lib';
import {renderNodePDF} from './project-authoring-node.mjs';
import {nodePDFSourceSHA256,nodePDFLockSHA256} from './project-authoring-node-version.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {retainAuthoringRasters} from './project-authoring.mjs';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect,fixtureQuote} from './lifecycle-fixtures.mjs';
import {projectContext,projectWorkContext} from './project-work.mjs';
import {archiveProjectAsset,readProjectAsset} from './project-assets.mjs';
import {beginContinuation,renderContinuation,completeContinuation,readContinuation} from './project-continuation.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex'),at='2026-10-24T15:00:00.000Z';
const event=(id,type,data={},prospect_id='project')=>({id,type,data,prospect_id,at});
async function runtime(){
 const resources={};for(const face of ['regular','bold']){const bytes=await readFile(new URL(`./fixtures/pdf-fonts/manrope-${face}.ttf`,import.meta.url));resources[face]={name:'Manrope-'+face,media_type:'font/ttf',sha256:sha(bytes),bytes_base64:bytes.toString('base64'),provenance:'Bundled OFL test face; same static Manrope as reviewed EVZ template.'};}
 return {renderer:'node-pdf-v1',resources,fonts:{Manrope:'regular',ManropeBold:'bold'},images:{}};
}
function source(context,kind='website-concepts'){
 return {schema_version:1,kind,context_sha256:context.context_sha256,author:'Fictional test author',requirements_review:'Five complete fixture directions through existing caller.',visual_premise:'Portable deterministic layout proof.',limitations:'Fictional integration fixture; no semantic or aesthetic quality inference.',questions:[],directions:Array.from({length:5},(_,i)=>({id:'d'+i,name:'Direction '+i,premise:'Independent fixture direction',tradeoff:'Fixture tradeoff',sections:['Services','Contact']})),pages:Array.from({length:kind==='website-concepts'?5:1},(_,i)=>({title:'Direction '+i,direction:'d'+i,width:1200,height:1600,background:'#FFFFFF',commands:[{op:'text',x:60,y:60,text:'Café — résumé / £ / €',font:'ManropeBold',size:36,role:'heading'},{op:'paragraph',x:60,y:180,w:500,text:'Readable body copy.\nA second line with café.',size:24,role:'body'},{op:'rect',x:60,y:350,w:400,h:80,color:'#202020'},{op:'line',x:60,y:500,x2:1100,y2:500},{op:'ellipse',x:800,y:700,w:200,h:200,color:'#F0E9DF'}]}))};
}
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'evz-node-pdf-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at),config:{...structuredClone(initialConfig),sender:{operator_names:{owner:'Test Owner',friend:'Test Friend'}}}});
 await app.apply(fixtureProspect('project',at));await app.apply(event('interest','call_logged',{call_id:'call',outcome:'connected',desk:true,intent:'discovery',focus:'website',performed_at:at,simulated:true,note:'Fictional website interest.'}));
 const doc=await PDFDocument.create();doc.addPage();const pdf=Buffer.from(await doc.save());
 await app.apply(event('template','asset_registered',{asset_id:'template',scope:'studio',kind:'template',name:'Fictional renderer contract template',version_id:'v1',version_label:'v1',reference:'private-path:fixture/template.pdf'},'studio-assets'));
 await archiveProjectAsset(app,{project_id:'project',asset_id:'template',version_id:'v1',context_sha256:projectContext(await app.snapshot(),'project').context_sha256,expected_sha256:sha(pdf)},pdf,{reference:'private-path:fixture/template.pdf',name:'template.pdf',mime_type:'application/pdf',modified_time:at},'owner');
 return {app,pdf};
}
const review=receipt=>({export_sha256:hash(receipt),pages:receipt.pages,requirements:true,visual_design:true,export:true,notes:'Automated fixture review only. Real PDF raster/visual QA is separate private evidence.'});
async function reviewed(app,job,receipt,actor='owner'){const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');return {...review(receipt),raster_review:await retainAuthoringRasters(app,{project_id:'project',work_id:job.work_id,job_id:job.id},{pdf_sha256:receipt.pdf.sha256,rasterizer:'Substituted one-pixel raster boundary for unit tests only; private proof uses real Poppler exports.',pages:receipt.pages.map(()=>png)},actor)};}
test('real portable Node composition is byte deterministic with embedded Unicode fonts, exact page geometry and canonical evidence',async()=>{
 const fingerprint=async path=>sha((await readFile(new URL(path,import.meta.url),'utf8')).replaceAll('\r\n','\n'));
 assert.equal(await fingerprint('./project-authoring-node.mjs'),nodePDFSourceSHA256);
 assert.equal(await fingerprint('./package-lock.json'),nodePDFLockSHA256);
 const context={project_id:'project',context_sha256:'a'.repeat(64),source:{company:{name:'Fictional café'}}},s=source(context),r=await runtime();
 const a=await renderNodePDF(s,context,r,{source_sha256:hash(s)}),b=await renderNodePDF(s,context,r,{source_sha256:hash(s)});
 assert.deepEqual(a.files,b.files);const parsed=await PDFDocument.load(a.files.get('output.pdf'));assert.equal(parsed.getPageCount(),5);assert.deepEqual(parsed.getPages().map(p=>p.getSize()),Array(5).fill({width:1200,height:1600}));
 assert.equal(a.receipt.validation.rasterizer,null);const p=JSON.parse(a.files.get('page-1.json'));assert.equal(p.commands[0].text,'Café — résumé / £ / €');assert.equal(p.commands[0].font_resource,'bold');assert.equal(p.commands[0].baseline,96);
 assert.equal(a.receipt.resources[0].sha256,r.resources.regular.sha256);assert.equal(a.files.has('page-1.png'),false);
 assert.ok(parsed.catalog.get(PDFName.of('Outlines')));
});
test('existing conditional store plus injected immutable sidecars/originals completes the actual caller without local paths; D2 stays closed',async t=>{
 const seed=await setup(t),original=(await readProjectAsset(seed.app,'project','template','v1')).bytes;let envelope,etag=0;
 const raw={async getWithMetadata(){return {data:structuredClone(envelope),etag:String(etag)};},async setJSON(key,data,options){if(envelope&&options.onlyIfNew||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(etag))return {modified:false};envelope=structuredClone(data);return {modified:true,etag:String(++etag)};}};
 const store=new ConditionalLifecycleStore(raw);await store.initialize(seed.app.config,await seed.app.snapshot());const app=await StudioLifecycle.fromStore({store,now:()=>new Date(at)}),files=new Map(),originals=new Map([[sha(original),original]]);
 app.authoringStore={async get(id,name){return files.get(id+'/'+name);},async put(id,name,bytes){const k=id+'/'+name;if(files.has(k)){const e=Error('Immutable sidecar exists');e.code='EEXIST';throw e;}files.set(k,Buffer.from(bytes));}};
 app.originalStore={async get(value){return originals.get(value.sha256);},async put(bytes){originals.set(sha(bytes),Buffer.from(bytes));}};
 const job=await beginContinuation(app,{name:(await app.snapshot()).prospects.project.name,kind:'website-concepts'});assert.equal(job.directory,null);assert.equal(app.directory,null);await renderContinuation(app,job.id,source(job.context),await runtime());
 const receipt=JSON.parse(files.get(job.id+'/export.json'));await assert.rejects(completeContinuation(app,job.id,review(receipt)),/Canonical layout is not visual review/);await completeContinuation(app,job.id,await reviewed(app,job,receipt));
 const fresh=await StudioLifecycle.fromStore({store,now:app.now});fresh.authoringStore=app.authoringStore;fresh.originalStore=app.originalStore;const saved=await readContinuation(fresh,job.id);assert.equal(saved.readback.original.sha256,receipt.pdf.sha256);assert.equal(saved.readback.companion_draft.send_authorized,false);assert.equal(saved.readback.path,undefined);assert.equal(originals.size,2);
 const {reviewAuthoring}=await import('./project-authoring.mjs');await assert.rejects(reviewAuthoring(fresh,{project_id:'project',work_id:'website-concepts',job_id:job.id,review:{...review(receipt),notes:'Changed retry'}}),/retry differs/);
 fresh.store.inertBinding={};await assert.rejects(beginContinuation(fresh,{name:'STUDIO TEST Juniper Bakery',kind:'website-concepts'}),/authorized local or injected/);
});
test('resource drift, unknown code/path, foreign images, glyph gaps, malformed fonts/images, layout overflow and schema caps fail closed',async()=>{
 const context={project_id:'project',context_sha256:'a'.repeat(64),source:{company:{name:'Fixture'}}},s=source(context),r=await runtime(),call=(a=s,b=r)=>renderNodePDF(a,context,b,{source_sha256:hash(a)});
 for(const mutate of [v=>v.resources.regular.sha256='0'.repeat(64),v=>v.python='execute',v=>v.resources.regular.path='/private/font',v=>v.resources.regular.bytes_base64='!',v=>v.fonts.Manrope='absent']){const copy=structuredClone(r);mutate(copy);await assert.rejects(call(s,copy));}
 const broken=structuredClone(r);broken.resources.regular.bytes_base64=Buffer.from('not font').toString('base64');broken.resources.regular.sha256=sha(Buffer.from('not font'));await assert.rejects(call(s,broken),/TrueType/);
 for(const command of [{op:'text',x:60,y:60,text:'𓀀',size:24},{op:'text',x:1190,y:60,text:'overflow',size:24},{op:'paragraph',x:60,y:1590,w:100,text:'overflow',size:24},{op:'html',x:0,y:0,text:'<script>bad()</script>'},{op:'image',x:0,y:0,w:10,h:10,image_id:'missing'}]){const copy=structuredClone(s);copy.pages[0].commands[0]=command;await assert.rejects(call(copy));}
 const bad=structuredClone(s);bad.pages[0].width=Infinity;await assert.rejects(call(bad),/bounds/);bad.pages=Array(13).fill(s.pages[0]);await assert.rejects(call(bad),/1-12/);
 const image=Buffer.from('bad png'),rr=structuredClone(r);rr.resources.photo={name:'photo',media_type:'image/png',sha256:sha(image),bytes_base64:image.toString('base64'),project_id:'other',provenance:'Fixture'};rr.images.photo='photo';await assert.rejects(call(s,rr),/another project/);rr.resources.photo.project_id='project';await assert.rejects(call(s,rr),/PNG/);
});
test('an approved original PNG is embedded proportionally at its exact canonical location; glyph descenders cannot clip the page',async()=>{
 const context={project_id:'project',context_sha256:'a'.repeat(64),source:{company:{name:'Fixture'}}},s=source(context),r=await runtime(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 r.resources.photo={name:'photo',sha256:sha(bytes),bytes_base64:bytes.toString('base64'),project_id:'project',media_type:'image/png',provenance:'Fictional exact bitmap'};r.images.photo='photo';s.pages[0].commands.push({op:'image',x:100,y:600,w:400,h:200,image_id:'photo'});
 const out=await renderNodePDF(s,context,r,{source_sha256:hash(s)});assert.deepEqual(JSON.parse(out.files.get('page-1.json')).commands.at(-1),{op:'image',resource:'photo',x:200,y:600,w:200,h:200});const pdf=await PDFDocument.load(out.files.get('output.pdf'));assert.ok(pdf.getPage(0).node.Resources().get(PDFName.of('XObject')));
 s.pages[0].commands[0]={op:'text',text:'gyp',x:60,y:1576,size:24};await assert.rejects(renderNodePDF(s,context,r,{source_sha256:hash(s)}),/Glyph ink exceeds/);
});
test('friend preparation uses the same actual Node caller and changed context/runtime/canonical/raster bytes block publication',async t=>{
 for(const change of ['none','context','runtime','canonical','raster']){
  const {app}=await setup(t);await app.change(s=>{s.prospects.project.follow_up_owner='friend';s.prospects.project.project_work['website-concepts'].assigned_to='friend';});const job=await beginContinuation(app,{name:(await app.snapshot()).prospects.project.name,kind:'website-concepts'},'friend'),ctx=JSON.parse(await readFile(job.context_file)),file=join(app.directory,'source.json');await writeFile(file,JSON.stringify(source(ctx)));await renderContinuation(app,job.id,file,await runtime(),'friend');const receipt=JSON.parse(await readFile(join(job.directory,'export.json'))),reviewedPages=await reviewed(app,job,receipt,'friend');
  if(change==='context')await app.apply(event('new-context','note_added',{note:'Different saved project brief'}),{actor:'friend'});
  if(change==='runtime')await writeFile(join(job.directory,'runtime.json'),'{}');if(change==='canonical')await writeFile(join(job.directory,'page-1.json'),'{}');if(change==='raster')await writeFile(join(job.directory,'review-page-1.png'),'broken');
  if(change==='none'){const saved=await completeContinuation(app,job.id,reviewedPages,'friend');assert.equal(saved.reviewed_by,'friend');assert.equal(saved.readback.companion_draft.send_authorized,false);}
  else{await assert.rejects(completeContinuation(app,job.id,reviewedPages,'friend'));assert.equal((await app.snapshot()).prospects.project.project_email_drafts,undefined);assert.equal(Object.keys((await app.snapshot()).asset_index).length,1);}
 }
});
test('actual CLI retains exact raster review without executing a rasterizer and rejects unbounded/relative raster manifests',async t=>{
 const {app}=await setup(t),job=await beginContinuation(app,{name:(await app.snapshot()).prospects.project.name,kind:'website-concepts'}),ctx=JSON.parse(await readFile(job.context_file)),file=join(app.directory,'source.json');await writeFile(file,JSON.stringify(source(ctx)));await renderContinuation(app,job.id,file,await runtime());const receipt=JSON.parse(await readFile(join(job.directory,'export.json'))),png=join(app.directory,'fixture.png'),manifest=join(app.directory,'rasters.json');await writeFile(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
 const cli=()=>promisify(execFile)(process.execPath,[fileURLToPath(new URL('./lifecycle-cli.mjs',import.meta.url)),'project-continue','rasters',job.id,manifest],{env:{PATH:'',SystemRoot:process.env.SystemRoot??'',STUDIO_LIFECYCLE_STATE_DIR:app.directory},windowsHide:true});
 for(const pages of [[],['relative.png']]){await writeFile(manifest,JSON.stringify({pdf_sha256:receipt.pdf.sha256,rasterizer:'Substituted CLI raster boundary only',pages}));await assert.rejects(cli());}
 await writeFile(manifest,JSON.stringify({pdf_sha256:receipt.pdf.sha256,rasterizer:'Substituted CLI raster boundary only',pages:receipt.pages.map(()=>png)}));const raster_review=JSON.parse((await cli()).stdout);assert.equal(raster_review.pages.length,5);assert.equal(raster_review.pdf_sha256,receipt.pdf.sha256);await completeContinuation(app,job.id,{...review(receipt),raster_review});assert.equal((await readContinuation(app,job.id)).readback.companion_draft.send_authorized,false);
});
test('existing continuation renders five directions, protects selected refinement, indexes held exact attachment and restores portable output',async t=>{
 const {app}=await setup(t),r=await runtime(),job=await beginContinuation(app,{name:(await app.snapshot()).prospects.project.name,kind:'website-concepts'});
 const context=JSON.parse(await readFile(job.context_file)),s=source(context),path=join(app.directory,'concept-source.json');await writeFile(path,JSON.stringify(s));
 const result=await renderContinuation(app,job.id,path,r);assert.equal(result.status,'Rendered');const receipt=JSON.parse(await readFile(join(job.directory,'export.json')));const complete=await completeContinuation(app,job.id,await reviewed(app,job,receipt));
 assert.equal(complete.readback.companion_draft.send_authorized,false);assert.equal(complete.readback.original.sha256,receipt.pdf.sha256);assert.equal((await app.snapshot()).asset_index[job.id].baseline_version,null);
 await app.apply(event('approve','asset_version_selected',{asset_id:job.id,version_id:job.id},'studio-assets'));
 const feedback='Use "#EFE7DB" for page background.';await app.apply(event('background','asset_feedback_added',{asset_id:job.id,version_id:job.id,project_id:'project',feedback},'studio-assets'));
 await app.apply(event('refine','concept_refinement_requested',{asset_id:job.id,version_id:job.id,selected_direction:'Direction 2',feedback}));
 const next=await beginContinuation(app,{name:(await app.snapshot()).prospects.project.name,kind:'website-refinement'}),ctx=JSON.parse(await readFile(next.context_file)),ref={...source(ctx,'website-refinement'),selected_direction:'Direction 2',previous_asset_id:job.id,previous_version_id:job.id,feedback,preserves_direction:true,pages:[s.pages[2]]},refPath=join(app.directory,'refinement.json');
 const wrong=structuredClone(ref);wrong.pages[0].commands[0].text='Unapproved rewrite';await writeFile(refPath,JSON.stringify(wrong));await assert.rejects(renderContinuation(app,next.id,refPath,r),/composition or wording/);
 await writeFile(refPath,JSON.stringify(ref));await renderContinuation(app,next.id,refPath,r);const refReceipt=JSON.parse(await readFile(join(next.directory,'export.json')));await completeContinuation(app,next.id,await reviewed(app,next,refReceipt));
 const actual=JSON.parse(await readFile(join(next.directory,'page-1.json'))),prior=JSON.parse(await readFile(join(job.directory,'page-3.json')));assert.deepEqual({...actual,background:prior.background},prior);assert.equal(actual.background,'#EFE7DB');
 const backup=join(app.directory,'package.json');await app.backup(backup);const restored=join(app.directory,'restored');await StudioLifecycle.restore({input:backup,destination:restored});const fresh=await StudioLifecycle.open({directory:restored});const back=await readContinuation(fresh,next.id);assert.equal(back.readback.original.sha256,refReceipt.pdf.sha256);assert.equal((await fresh.snapshot()).asset_index[job.id].baseline_version,job.id);await assert.rejects(access(join(restored,'project-authored',next.id,'renderer.mjs')));
});
test('proposal uses only approved quote, exact cents, real pagination and project-owned images; failed rendering publishes no output',async t=>{
 const {app,pdf}=await setup(t);await app.apply(event('discovery','discovery_confirmed',{goal:'Fictional pickup site',decision_maker:'Fictional Owner',serious_interest:true,paid_fit_discussed:true,service:'website',main_flow:'Choose and request pickup',preview_screens:3}));await app.apply(event('preview','preview_recorded',{reference:'fixture:preview',reviewed_with_owner:true}));await app.apply(event('quote','proposal_approved',{...fixtureQuote,deliverables:'A lengthy approved deliverable.\n'.repeat(60)}),{actor:'friend'});
 const r=await runtime(),logo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
 r.resources.template={name:'template',media_type:'application/pdf',sha256:sha(pdf),bytes_base64:pdf.toString('base64'),provenance:'Exact archived fictional test template'};r.proposal_template='template';r.resources.logo={name:'logo',media_type:'image/png',sha256:sha(logo),bytes_base64:logo.toString('base64'),project_id:'studio',provenance:'Fictional one-pixel fixture; private real proof uses exact EVZ wordmark'};r.wordmark='logo';
 const job=await beginContinuation(app,{name:(await app.snapshot()).prospects.project.name,kind:'client-proposal'}),context=JSON.parse(await readFile(job.context_file)),s={...source(context,'client-proposal'),quote_sha256:context.source.quote_sha256,price_cents:1},path=join(app.directory,'proposal.json');await writeFile(path,JSON.stringify(s));
 await renderContinuation(app,job.id,path,r);const receipt=JSON.parse(await readFile(join(job.directory,'export.json')));assert.ok(receipt.pages.length>5);const text=(await Promise.all(receipt.pages.map(p=>readFile(join(job.directory,p.name),'utf8')))).join('');assert.ok(text.includes('$'+(fixtureQuote.price_cents/100).toLocaleString('en-US',{minimumFractionDigits:2})));assert.ok(text.includes('lengthy approved'));await completeContinuation(app,job.id,await reviewed(app,job,receipt));assert.equal((await readContinuation(app,job.id)).readback.provenance.quote_sha256,context.source.quote_sha256);
 const other=await setup(t),j=await beginContinuation(other.app,{name:(await other.app.snapshot()).prospects.project.name,kind:'website-concepts'}),c=JSON.parse(await readFile(j.context_file)),bad=source(c);bad.pages[4].commands[0].text='𓀀';const file=join(other.app.directory,'bad.json');await writeFile(file,JSON.stringify(bad));await assert.rejects(renderContinuation(other.app,j.id,file,await runtime()),/glyph/);await assert.rejects(access(join(j.directory,'output.pdf')));assert.equal((await readContinuation(other.app,j.id)).status,'Held');assert.equal((await other.app.snapshot()).prospects.project.project_email_drafts,undefined);
});
