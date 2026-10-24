import {readFile,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {check,hash} from './lifecycle.mjs';
import {resolveProject,projectWorkContext,projectContext} from './project-work.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {claimAuthoring,renderAuthoring,reviewAuthoring,inspectAuthoring,readAuthoringFile,retainAuthoringRasters} from './project-authoring.mjs';

const kinds=['website-concepts','website-refinement','client-proposal'];
function local(app,actor){check((app.directory&&!app.store||app.authoringStore&&app.store&&!app.store.inertBinding&&!app.store.manualBinding&&(app.config.mode==='controlled'||app.store.projectBinding&&app.config.shared_capability==='shared-project-continuation-v1'))&&['owner','friend'].includes(actor),'Continuation needs an authorized local or injected fictional/exact shared project workspace/operator');}
function locate(state,id){
 const matches=Object.values(state.prospects).flatMap(r=>Object.values(r.project_work??{}).filter(w=>w.execution?.id===id).map(w=>({project_id:r.id,work_id:w.id,job_id:id})));
 check(matches.length===1,'Unknown or ambiguous continuation job; begin from the company name');return matches[0];
}
async function editableSource(app,version){
 const provenance=version.provenance;if(!provenance?.source_reference)return null;
 const match=/^private-path:project-authored\/(author-[a-f0-9]{32})\/authored\.json$/.exec(provenance.source_reference);
 if(!match)return {status:'Reference only; recover and review editable source before changing an approved design',reference:provenance.source_reference};
 if(app.authoringStore){const bytes=await readAuthoringFile(app,match[1],'authored.json'),source=JSON.parse(bytes);check(hash(source)===provenance.source_sha256,'Editable source hash changed; preserve the approved baseline');return {reference:provenance.source_reference,source,sha256:provenance.source_sha256,status:'Hash-verified declarative source; inspect alongside original PDF'};}
 const path=join(app.directory,'project-authored',match[1],'authored.json'),root=await realpath(app.directory);
 check(await realpath(path)===join(root,'project-authored',match[1],'authored.json'),'Unsafe editable source path');
 const stat=await lstat(path);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=4_000_000,'Unsafe editable source');
 const source=JSON.parse(await readFile(path,'utf8'));check(hash(source)===provenance.source_sha256,'Editable source hash changed; preserve the approved baseline');
 return {path,sha256:provenance.source_sha256,status:'Hash-verified declarative source; inspect alongside original PDF'};
}
export async function beginContinuation(app,{name,kind},actor='owner'){
 local(app,actor);check(kinds.includes(kind),'Choose website-concepts, website-refinement or client-proposal using the requested task');
 const state=await app.snapshot(),resolved=resolveProject(state,name),project=resolved.project_id;
 const matches=Object.values(state.prospects[project].project_work??{}).filter(w=>w.kind===kind&&w.status==='Ready');
 check(matches.length===1,matches.length?'More than one unfinished task matches; clarify the existing work item':'No Ready task matches; clarify or request the work through the existing project lifecycle');
 const work=matches[0],packet=projectWorkContext(state,project,work.id);
 check(!packet.source.restriction&&work.assigned_to===actor&&!work.context_hold,'Project stopped, held or assigned to another operator; resolve through the existing lifecycle');
 const required=[...packet.source.approved_assets.map(a=>({asset_id:a.asset_id,version_id:a.version_id})),...(kind==='website-refinement'?[{asset_id:work.request.asset_id,version_id:work.request.version_id}]:[])];
 const refs=packet.source.assets.flatMap(a=>a.versions.filter(v=>v.verified_original||required.some(r=>r.asset_id===a.asset_id&&r.version_id===v.id)).map(v=>({asset_id:a.asset_id,version_id:v.id,version:v})));
 check(refs.length>0&&refs.length<=12,'Recover exact originals first; continuation supports at most twelve relevant versions and never picks the newest file');
 const originals=[];
 for(const ref of refs){const file=await readProjectAsset(app,project,ref.asset_id,ref.version_id);originals.push({asset_id:ref.asset_id,version_id:ref.version_id,path:file.path,original:file.original,editable_source:await editableSource(app,ref.version)});}
 const job=await claimAuthoring(app,{project_id:project,work_id:work.id,context_sha256:packet.context_sha256,references:refs.map(({asset_id,version_id})=>({asset_id,version_id}))},actor);
 return {...job,name:resolved.name,loaded_revision:state.revision,skill:packet.workflow.skill,...(job.directory?{context_file:join(job.directory,'context.json')}:{context:packet}),originals,contract:'pipeline/PROJECT-AUTHORING.md',next:'Read the named existing skill, context and original PDFs; author private source, render, visually inspect every page, then complete with its exact review. This command does not invoke an AI.'};
}
export async function renderContinuation(app,id,source_file,runtime,actor='owner'){
 local(app,actor);const input=locate(await app.snapshot(),id);return renderAuthoring(app,{...input,...(app.authoringStore?{source:source_file}:{source_file})},runtime,actor);
}
export async function retainContinuationRasters(app,id,rasters,actor='owner'){
 local(app,actor);return retainAuthoringRasters(app,locate(await app.snapshot(),id),rasters,actor);
}
export async function readContinuation(app,id,actor='owner'){
 local(app,actor);const state=await app.snapshot(),input=locate(state,id),job=await inspectAuthoring(app,input,actor);
 if(job.status!=='Review')return job;
 const fresh=await app.snapshot(),work=fresh.prospects[input.project_id].project_work[input.work_id],result=work.result;
 check(work.execution.id===id&&work.status==='Review'&&result,'Continuation result changed; inspect the current project');
 const file=await readProjectAsset(app,input.project_id,result.asset_id,result.version_id),version=fresh.asset_index[result.asset_id].versions[result.version_id],draft=job.companion_draft;
 check(file.original.sha256===result.pdf_sha256&&draft?.attachment.sha256===file.original.sha256&&draft.attachment.version_id===result.version_id&&draft.attachment.asset_id===result.asset_id&&!draft.send_authorized,'Saved output and held attachment differ; hold this result');
 return {...job,readback:{revision:fresh.revision,project_id:input.project_id,work_id:input.work_id,name:fresh.prospects[input.project_id].name,result,path:file.path,original:file.original,provenance:version.provenance,context:projectContext(fresh,input.project_id),companion_draft:draft}};
}
export async function completeContinuation(app,id,review,actor='owner'){
 local(app,actor);const input=locate(await app.snapshot(),id);await reviewAuthoring(app,{...input,review},actor);return readContinuation(app,id,actor);
}
