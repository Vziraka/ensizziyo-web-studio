import {mkdir,lstat,realpath,readFile,writeFile,readdir} from 'node:fs/promises';
import {join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {check,hash} from './lifecycle.mjs';
import {projectWorkContext} from './project-work.mjs';
import {readProjectAsset,storeProjectPDF} from './project-assets.mjs';
import {operatorDisplayName,evzIdentity} from './follow-up-template.mjs';
import {applyDesignPreferences} from './design-preferences.mjs';

const exec=promisify(execFile),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const text=(v,max=3000)=>typeof v==='string'&&v.trim()&&v.length<=max;
const kinds=['website-concepts','website-refinement','client-proposal'];
async function safeFile(path,max=4_000_000){const s=await lstat(path);check(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max,'Unsafe or oversized authoring file');return readFile(path);}
async function folder(app,id){
 if(app.authoringStore){check(app.store&&!app.store.inertBinding&&app.config.mode==='controlled'&&key(id),'Injected authoring storage supports only the fictional controlled workspace; inert/production stay closed');return null;}
 check(app.directory&&!app.store&&key(id),'Authoring needs the private local workspace');
 const root=join(app.directory,'project-authored');await mkdir(root,{recursive:true,mode:0o700});
 check(!(await lstat(root)).isSymbolicLink()&&await realpath(root)===join(await realpath(app.directory),'project-authored'),'Unsafe authoring root');
 const path=join(root,id);await mkdir(path,{recursive:true,mode:0o700});check(!(await lstat(path)).isSymbolicLink()&&await realpath(path)===join(await realpath(root),id),'Unsafe authoring directory');return path;
}
const sidecarName=/^(context|input|authored|runtime|export|renderer-evidence)\.json$|^renderer\.(py|mjs)$|^output\.pdf$|^(review-)?page-[1-9][0-9]?\.(json|png)$/;
export async function readAuthoringFile(app,id,name,max=4_000_000){
 check(key(id)&&sidecarName.test(name),'Unsafe authoring sidecar identity');
 const path=await folder(app,id);if(path)return safeFile(join(path,name),max);
 const bytes=await app.authoringStore.get(id,name);if(!bytes){const e=Error('Missing authoring sidecar');e.code='ENOENT';throw e;}
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=max,'Unsafe or oversized authoring sidecar');return bytes;
}
async function writeAuthoringFile(app,id,name,bytes){
 check(key(id)&&sidecarName.test(name)&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=64_000_000,'Unsafe authoring sidecar write');
 const path=await folder(app,id);if(path)return writeFile(join(path,name),bytes,{flag:'wx',mode:0o600});
 await app.authoringStore.put(id,name,bytes);
 check(sha(await readAuthoringFile(app,id,name,64_000_000))===sha(bytes),'Immutable authoring sidecar write differs; inspect the existing job');
}
function target(state,input,actor){
 check(['owner','friend'].includes(actor)&&[input.project_id,input.work_id].every(key),'Use an existing project/work item and local operator identity');
 const packet=projectWorkContext(state,input.project_id,input.work_id),work=packet.work,r=state.prospects[input.project_id];
 check(!r.restriction&&work.status==='Ready'&&kinds.includes(work.kind),'Choose a Ready supported authoring item');
 check(work.assigned_to===actor&&(!r.follow_up_owner||r.follow_up_owner===actor),'Claim or hand off this project to the preparing operator first');
 check(!work.context_hold,'Correct the saved context hold first');
 if(work.kind==='client-proposal')check(r.quote&&['owner','friend'].includes(r.quote.approved_by),'Exact operator scope and price approval is required');
 return {packet,work,r};
}
function current(state,input,actor,job){const result=target(state,input,actor);check(result.work.execution?.id===job.id&&result.packet.context_sha256===job.context_sha256&&result.work.request_event===job.request_event,'Context, reply, assignment, stop or baseline changed; hold this output and reload');return result;}
async function references(app,project,refs){
 check(Array.isArray(refs)&&refs.length>0&&refs.length<=12,'Select exact retrieved original references (at most 12)');
 const result=[];for(const ref of refs){check(key(ref.asset_id)&&key(ref.version_id),'Use exact reference version IDs');const {original}=await readProjectAsset(app,project,ref.asset_id,ref.version_id);result.push({asset_id:ref.asset_id,version_id:ref.version_id,sha256:original.sha256,bytes:original.bytes,reference:original.reference});}return result;
}
function bump(state,app){state.revision++;state.updated_at=app.now().toISOString();}
export async function claimAuthoring(app,input,actor='owner'){
 const state=await app.snapshot(),{packet,work}=target(state,input,actor);
 check(input.context_sha256===packet.context_sha256,'Load the exact current work context before claiming');
 const required=[...packet.source.approved_assets.map(a=>({asset_id:a.asset_id,version_id:a.version_id})),...(work.kind==='website-refinement'?[{asset_id:work.request.asset_id,version_id:work.request.version_id}]:[])];
 check(required.every(ref=>input.references?.some(r=>r.asset_id===ref.asset_id&&r.version_id===ref.version_id)),'Retrieve every approved baseline and the exact selected refinement source before authoring');
 const refs=await references(app,input.project_id,input.references),id='author-'+hash({project:input.project_id,work:work.id,event:work.request_event,context:packet.context_sha256,attempt:work.authoring_attempt??0}).slice(0,32);
 const job={id,project_id:input.project_id,work_id:work.id,kind:work.kind,request_event:work.request_event,context_sha256:packet.context_sha256,references:refs,actor,status:'Claimed',claimed_at:app.now().toISOString()};
 const saved=await app.change(s=>{const found=target(s,input,actor);check(found.packet.context_sha256===job.context_sha256,'Context changed before claim');if(found.work.execution){check(found.work.execution.id===id&&hash(found.work.execution.references)===hash(refs),'An authoring claim already exists; inspect it before creating another');return found.work.execution;}found.work.execution=job;bump(s,app);return job;});
 const path=await folder(app,id);await immutableJSON(app,id,'context.json',{...packet,work:{...packet.work,execution:undefined}});return {...saved,directory:path,authoring:'Author the existing named skill against context.json and retrieved originals; no unattended model is enabled.'};
}
async function immutableJSON(app,id,name,value){const bytes=Buffer.from(JSON.stringify(value,null,2));try{await writeAuthoringFile(app,id,name,bytes);}catch(e){if(e.code!=='EEXIST')throw e;check(sha(await readAuthoringFile(app,id,name,36_000_000))===sha(bytes),'Immutable authoring file differs; inspect the existing job');}}
function getJob(state,input){check([input.project_id,input.work_id].every(key),'Choose the exact authoring job');const job=state.prospects[input.project_id]?.project_work?.[input.work_id]?.execution;check(job&&job.id===input.job_id,'Load the exact claimed authoring job');return job;}
function validateAuthored(source,packet,job){
 check(source?.schema_version===1&&source.context_sha256===job.context_sha256&&source.kind===job.kind,'Authored source must bind the exact context and workflow');
 check(text(source.author,100)&&text(source.requirements_review,3000)&&text(source.visual_premise,3000)&&text(source.limitations,3000),'Retain author, requirements, design premise and material limitations');
 check(Array.isArray(source.questions)&&source.questions.length<=3&&source.questions.every(q=>text(q,300))&&(source.questions.length===0||source.judgment_option===true),'Ask at most three essential questions with a use-your-judgment option');
 check(source.questions.length===0,'Essential questions remain unanswered; hold authoring');
 if(job.kind==='website-concepts')check(source.directions?.length===5&&new Set(source.directions.map(d=>d.id)).size===5&&source.directions.every(d=>key(d.id)&&text(d.name,100)&&text(d.tradeoff,800)&&text(d.premise,800)&&d.sections?.length>=2&&d.sections.length<=3)&&source.pages?.length>=5,'Author five desktop directions with two or three supporting sections each');
 if(job.kind==='website-refinement')check(source.selected_direction===packet.source.request.selected_direction&&source.previous_asset_id===packet.source.request.asset_id&&source.previous_version_id===packet.source.request.version_id&&source.feedback===packet.source.request.feedback&&source.preserves_direction===true,'Refine the exact selected direction, previous version and consolidated feedback');
 if(job.kind==='client-proposal')check(source.quote_sha256===packet.source.quote_sha256,'Proposal source must bind exact approved scope and price');
}
async function designSource(app,source,packet){
 let baseline=null;
 if(source.kind==='website-refinement'){
  const approved=packet.source.approved_assets.find(a=>a.asset_id===packet.source.request.asset_id);
  if(approved){
   check(approved.version_id===packet.source.request.version_id,'Refine the current approved version; the selected source is stale against its baseline');
   const provenance=approved.provenance,match=/^private-path:project-authored\/(author-[a-f0-9]{32})\/authored\.json$/.exec(provenance?.source_reference??'');
   check(match,'Approved refinement has no verified declarative source; preserve it and recover/review its source before changing it');
   const prior=JSON.parse(await readAuthoringFile(app,match[1],'authored.json'));
   check(hash(prior)===provenance.source_sha256,'Approved declarative source changed; preserve the baseline');
   const direction=prior.directions?.find(d=>d.id===source.selected_direction||d.name===source.selected_direction)?.id??source.selected_direction;
   const pages=prior.kind==='website-concepts'?prior.pages?.filter(p=>p.direction===direction):prior.pages;
   check(pages?.length,'Selected direction is absent from the approved declarative source');
   baseline={asset_id:approved.asset_id,version_id:approved.version_id,source_sha256:provenance.source_sha256,pages,dispute:approved.dispute};
  }
 }
 return applyDesignPreferences(source,packet,baseline);
}
async function hold(app,input,job,error){await app.change(s=>{const work=s.prospects[input.project_id]?.project_work?.[input.work_id];if(work?.execution?.id===job.id&&work.execution.status!=='Review'){Object.assign(work.execution,{status:'Held',hold:error.message,held_at:app.now().toISOString()});bump(s,app);}});}
export async function renderAuthoring(app,input,runtime,actor='owner'){
 const state=await app.snapshot(),job=getJob(state,input);if(job.status!=='Claimed')return inspectAuthoring(app,input,actor);
 const {packet}=current(state,input,actor,job),inputSource=app.authoringStore?structuredClone(input.source):JSON.parse(await safeFile(input.source_file));
 check(Buffer.byteLength(JSON.stringify(inputSource)??'')<=4_000_000,'Authored source exceeds bounds');validateAuthored(inputSource,packet,job);
 const source=await designSource(app,inputSource,packet);
 const nodeRuntime=runtime?.renderer==='node-pdf-v1';
 check(!app.authoringStore||nodeRuntime,'Injected authoring storage requires the Node renderer');
 if(nodeRuntime){const {nodePDFResources}=await import('./project-authoring-node.mjs');const resources=nodePDFResources(runtime,job.project_id);if(job.kind==='client-proposal')check(job.references.some(r=>r.sha256===resources.get(runtime.proposal_template)?.sha256),'Retrieve the exact registered approved EVZ template before proposal rendering');}
 else{
  check(runtime&&!runtime.renderer&&isAbsolute(runtime.python)&&isAbsolute(runtime.pdftoppm)&&isAbsolute(runtime.proposal_assets),'Configure trusted local Python, Poppler and installed proposal assets separately from authored content');
  for(const [id,image] of Object.entries(runtime.images??{}))check(key(id)&&image.project_id===job.project_id&&isAbsolute(image.path)&&/^[a-f0-9]{64}$/.test(image.sha256??'')&&text(image.provenance,1200),'Original images need exact project ownership, hash, private path and provenance in trusted runtime configuration');
  if(job.kind==='client-proposal'){const master=sha(await readFile(join(runtime.proposal_assets,'EVZ-Digital-Master-Proposal-Review.pdf')));check(job.references.some(r=>r.sha256===master),'Retrieve the exact installed approved EVZ template before proposal rendering');}
 }
 const path=await folder(app,job.id);await immutableJSON(app,job.id,'input.json',inputSource);await immutableJSON(app,job.id,'authored.json',source);await immutableJSON(app,job.id,'runtime.json',runtime);
 await app.change(s=>{const {work}=current(s,input,actor,job);check(work.execution.status==='Claimed','This export is already reserved; inspect its receipt');Object.assign(work.execution,{status:'Rendering',source_sha256:hash(source),runtime_sha256:hash(runtime),renderer_sha256:null,...(nodeRuntime?{renderer:'node-pdf-v1'}:{})});bump(s,app);});
 try{
  check(hash(await references(app,job.project_id,job.references))===hash(job.references),'Original references changed');
  let renderer_sha256,renderer_lock_sha256,script;
  if(nodeRuntime){
   const {nodePDFSourceSHA256,nodePDFLockSHA256}=await import('./project-authoring-node-version.mjs');renderer_sha256=nodePDFSourceSHA256;renderer_lock_sha256=nodePDFLockSHA256;
   await immutableJSON(app,job.id,'renderer-evidence.json',{schema_version:1,renderer_sha256,lock_sha256:nodePDFLockSHA256,execution:'disabled',requires_trusted_runtime_rebinding:true});
  }else{
   const renderer=await readFile(fileURLToPath(new URL('./project-authoring-render.py',import.meta.url)));renderer_sha256=sha(renderer);script=join(path,'renderer.py');await writeAuthoringFile(app,job.id,'renderer.py',renderer);
  }
  await app.change(s=>{const {work}=current(s,input,actor,job);work.execution.renderer_sha256=renderer_sha256;if(nodeRuntime)work.execution.renderer_lock_sha256=renderer_lock_sha256;bump(s,app);});
  if(nodeRuntime){
   const {renderNodePDF}=await import('./project-authoring-node.mjs');
   const {files}=await renderNodePDF(source,packet,runtime,{source_sha256:hash(source)});
   // Validate completely in memory, then publish the receipt last. Partial writes never index an asset.
   for(const [name,bytes] of files)await writeAuthoringFile(app,job.id,name,bytes);
  }else await exec(runtime.python,[script,path,hash(source)],{timeout:120_000,maxBuffer:100_000,windowsHide:true});
  return await resumeAuthoring(app,input,actor);
 }catch(error){await hold(app,input,job,error);throw error;}
}
async function verifyExport(app,job){
 const path=await folder(app,job.id),receipt=JSON.parse(await readAuthoringFile(app,job.id,'export.json')),source=JSON.parse(await readAuthoringFile(app,job.id,'authored.json'));
 let renderer;
 try{renderer=sha(await readAuthoringFile(app,job.id,job.renderer==='node-pdf-v1'?'renderer.mjs':'renderer.py'));}catch(error){
  if(error.code!=='ENOENT')throw error;
  const evidence=JSON.parse(await readAuthoringFile(app,job.id,'renderer-evidence.json'));
  check(evidence.schema_version===1&&evidence.execution==='disabled'&&evidence.requires_trusted_runtime_rebinding===true,'Invalid restored renderer evidence');renderer=evidence.renderer_sha256;
  if(job.renderer==='node-pdf-v1')check(evidence.lock_sha256===job.renderer_lock_sha256,'Pinned renderer dependency evidence changed');
 }
 check(renderer===job.renderer_sha256&&hash(JSON.parse(await readAuthoringFile(app,job.id,'runtime.json',36_000_000)))===job.runtime_sha256,'Retained renderer or trusted runtime changed');
 check(receipt.schema_version===1&&receipt.source_sha256===hash(source)&&receipt.context_sha256===job.context_sha256&&receipt.source_sha256===job.source_sha256,'Partial or mismatched export; preserve it for inspection');
 check(receipt.pdf?.name==='output.pdf'&&Array.isArray(receipt.pages)&&receipt.pages.length>0&&receipt.pages.length<=16,'Incomplete export receipt');
 const pdf=await readAuthoringFile(app,job.id,'output.pdf',64_000_000);check(pdf.subarray(0,5).toString()==='%PDF-'&&sha(pdf)===receipt.pdf.sha256&&pdf.length===receipt.pdf.bytes,'PDF hash or size changed');
 check(new Set(receipt.pages.map(p=>p.name)).size===receipt.pages.length,'Duplicate rendered pages');
 const pagePattern=job.renderer==='node-pdf-v1'?/^page-\d+\.json$/:/^page-\d+\.png$/;
 check(job.renderer!=='node-pdf-v1'||receipt.validation?.renderer==='node-pdf-v1','Renderer receipt differs');
 for(const [i,p] of receipt.pages.entries()){check(p.page===i+1&&pagePattern.test(p.name),'Invalid page render identity');check(sha(await readAuthoringFile(app,job.id,p.name,16_000_000))===p.sha256,'Rendered page changed; review the exact export');}
 if(path){const names=(await readdir(path)).filter(n=>pagePattern.test(n));check(names.length===receipt.pages.length,'Rendered page count changed');}
 return {path,receipt,source,pdf};
}
export async function inspectAuthoring(app,input,actor='owner'){
 check(['owner','friend'].includes(actor),'Local operator required');const state=await app.snapshot(),job=getJob(state,input);return {...job,directory:await folder(app,job.id),companion_draft:state.prospects[input.project_id].project_email_drafts?.find(d=>d.id===job.companion_draft_id)??null,unattended_authoring:'Unavailable: no approved autonomous model transport/allowance; this command never invokes one.'};
}
export async function reviseAuthoring(app,input,actor='owner'){
 return app.change(s=>{check(['owner','friend'].includes(actor),'Local operator required');const job=getJob(s,input),work=s.prospects[input.project_id].project_work[input.work_id];
  check(work.assigned_to===actor&&work.status==='Ready'&&job.actor===actor&&['Claimed','Rendered','Held'].includes(job.status)&&text(input.reason,1600),'Explicitly retain a non-published attempt and its reason; reconcile a Rendering job before revising');
  work.authoring_history??=[];check(work.authoring_history.length<10,'Review repeated authoring failures before creating more attempts');work.authoring_history.push({...job,retained_by:actor,retained_at:app.now().toISOString(),reason:input.reason});work.authoring_attempt=(work.authoring_attempt??0)+1;delete work.execution;bump(s,app);return {status:'Previous attempt retained',next:'Reload current context and claim a new authored attempt. No file or baseline was overwritten.'};});
}
export async function resumeAuthoring(app,input,actor='owner'){
 const job=getJob(await app.snapshot(),input);if(job.status==='Review')return inspectAuthoring(app,input,actor);
 check(['Rendering','Rendered'].includes(job.status),'Resume only a reserved export; a held or partial job needs inspection');
 try{const {receipt}=await verifyExport(app,job);await references(app,job.project_id,job.references);await app.change(s=>{const {work}=current(s,input,actor,job);Object.assign(work.execution,{status:'Rendered',pdf:receipt.pdf,pages:receipt.pages,export_sha256:hash(receipt)});bump(s,app);});return inspectAuthoring(app,input,actor);}catch(error){await hold(app,input,job,error);throw error;}
}
function rasterPNG(bytes){check(Buffer.isBuffer(bytes)&&bytes.length>=33&&bytes.length<=16_000_000&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR','Retain actual bounded PNG raster pages');const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);check(w>0&&h>0&&w*h<=40_000_000,'Excessive raster dimensions');}
// The trusted reviewer supplies real PDF raster exports; this does not execute a rasterizer or approve them.
export async function retainAuthoringRasters(app,input,rasters,actor='owner'){
 const state=await app.snapshot(),job=getJob(state,input);current(state,input,actor,job);check(job.status==='Rendered'&&job.renderer==='node-pdf-v1','Retain raster review only for an unreviewed Node export');
 const {receipt}=await verifyExport(app,job);check(rasters?.pdf_sha256===receipt.pdf.sha256&&text(rasters.rasterizer,200)&&rasters.pages?.length===receipt.pages.length,'Raster review must bind the exact PDF and every page');
 const pages=[];for(const [i,bytes] of rasters.pages.entries()){rasterPNG(bytes);const name=`review-page-${i+1}.png`;try{await writeAuthoringFile(app,job.id,name,bytes);}catch(e){if(e.code!=='EEXIST')throw e;check(sha(await readAuthoringFile(app,job.id,name,16_000_000))===sha(bytes),'Raster review differs; retain this attempt before replacing it');}pages.push({page:i+1,name,sha256:sha(bytes)});}
 return {pdf_sha256:receipt.pdf.sha256,rasterizer:rasters.rasterizer,pages};
}
export async function reviewAuthoring(app,input,actor='owner'){
 let state=await app.snapshot(),job=getJob(state,input);
 if(job.status==='Review'){check(hash(input.review)===job.review_sha256&&actor===job.reviewed_by,'Review retry differs from the saved exact review');return inspectAuthoring(app,input,actor);}
 check(job.status==='Rendered','Render and inspect every page first');const {packet:reviewPacket}=current(state,input,actor,job);
 const {receipt,source,pdf}=await verifyExport(app,job);
 check(hash(await designSource(app,source,reviewPacket))===hash(source),'Saved output no longer matches current preference/baseline checks');
 check(input.review?.export_sha256===hash(receipt)&&hash(input.review.pages)===hash(receipt.pages)&&input.review.requirements===true&&input.review.visual_design===true&&input.review.export===true&&text(input.review.notes,3000),'Review requirements, visual design and every exact rendered page separately');
 if(job.renderer==='node-pdf-v1'){
  const raster=input.review.raster_review;check(raster?.pdf_sha256===receipt.pdf.sha256&&text(raster.rasterizer,200)&&raster.pages?.length===receipt.pages.length,'Canonical layout is not visual review; retain and inspect every actual PDF raster page first');
  for(const [i,page] of raster.pages.entries()){check(page.page===i+1&&page.name===`review-page-${i+1}.png`,'Invalid raster review page');const bytes=await readAuthoringFile(app,job.id,page.name,16_000_000);rasterPNG(bytes);check(sha(bytes)===page.sha256,'Raster review page changed');}
 }
 await references(app,job.project_id,job.references);const original=await storeProjectPDF(app,pdf);
 await app.change(s=>{
  const {work,r,packet}=current(s,input,actor,job);check(work.execution.status==='Rendered','This output was already recorded');
  validateAuthored(source,packet,job);check(hash(receipt)===work.execution.export_sha256,'Export receipt changed');
  check(text(app.config.sender?.operator_names?.[actor],80),'Configure the preparing operator display name before drafting');
  check(typeof r.contact?.email==='string'&&/^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/.test(r.contact.email)&&(!r.controlled||r.contact.email.endsWith('@example.invalid')),'A confirmed project business email is needed for the held companion draft');
  const assetId=job.kind==='website-refinement'?work.request.asset_id:job.id,versionId=job.id,reference=`private-path:project-authored/${job.id}/output.pdf`;
  const index=s.asset_index??={},asset=index[assetId]??{id:assetId,name:`${r.name} - ${job.kind}`,kind:job.kind==='client-proposal'?'proposal':'mockup',scope:'project',project_id:r.id,baseline_version:null,choices:{},dispute:null,versions:{}};
  check(asset.project_id===r.id&&asset.scope==='project'&&!Object.hasOwn(asset.versions,versionId),'Output ownership/version conflicts');
  const provenance={job_id:job.id,context_sha256:job.context_sha256,source_sha256:job.source_sha256,source_reference:`private-path:project-authored/${job.id}/authored.json`,renderer_sha256:job.renderer_sha256,...(job.renderer?{renderer:job.renderer,renderer_lock_sha256:job.renderer_lock_sha256,runtime_sha256:job.runtime_sha256,validation:receipt.validation}:{}),export_sha256:hash(receipt),resources:receipt.resources??[],references:job.references,author:source.author,limitations:source.limitations,preference_application:source.preference_application??null,review:input.review,reviewed_by:actor,quote_sha256:packet.source.quote_sha256??null,request:work.request};
  asset.versions[versionId]={id:versionId,label:job.id,reference,registered_by:actor,registered_at:app.now().toISOString(),provenance,verified_original:{...original,reference,name:'output.pdf',mime_type:'application/pdf',modified_time:app.now().toISOString(),verified_at:app.now().toISOString(),verified_by:actor}};index[assetId]=asset;s.asset_index=index;
  work.result={asset_id:assetId,version_id:versionId,reference,export_reviewed:true,pdf_sha256:original.sha256,...(job.kind==='website-concepts'?{direction_count:5}:{}),...(job.kind==='client-proposal'?{quote_sha256:packet.source.quote_sha256}:{})};
  Object.assign(work,{status:'Review',prepared_by:actor,prepared_at:app.now().toISOString(),prepared_context_sha256:job.context_sha256});
  const title=job.kind==='client-proposal'?'Project proposal':job.kind==='website-refinement'?'Selected website direction - focused refinement':'Five website design directions';
  const body=`Hi,\n\n${job.kind==='client-proposal'?'Here is the project proposal for your review. Please review the scope, investment, and next steps.':job.kind==='website-refinement'?`Here is the focused refinement of ${work.request.selected_direction}, based on your consolidated feedback.`:'Here are five desktop website directions for your review. Please choose the direction you would like to develop; we can then discuss one focused refinement before scope and price.'}\n\nBest,\n${operatorDisplayName(actor,app.config)}\n${evzIdentity.email}`;
  const draft={id:job.id,status:'Held for human review',to:r.contact.email,from:evzIdentity.email,subject:`${r.name}: ${title}`,body,attachment:{asset_id:assetId,version_id:versionId,reference,sha256:original.sha256,bytes:original.bytes},prepared_by:actor,context_sha256:job.context_sha256,reply_source:packet.source.reply_source,quote_sha256:packet.source.quote_sha256??null,send_authorized:false,client_acceptance:'Not established',hold:'Review exact content, recipient and attachment; use a separately authorized supported attachment send. No send intent exists.'};
  draft.sha256=hash(draft);r.project_email_drafts??=[];r.project_email_drafts.push(draft);
  Object.assign(work.execution,{status:'Review',review_sha256:hash(input.review),reviewed_by:actor,companion_draft_id:draft.id});
  check(Object.keys(s.events).length<20_000,'Event limit reached; archive closed records before authoring review');const id=job.id+'-review';s.events[id]={id,type:'project_authoring_reviewed',prospect_id:r.id,actor,at:app.now().toISOString(),data:{result:work.result,provenance,companion_sha256:draft.sha256}};bump(s,app);
 });return inspectAuthoring(app,input,actor);
}
