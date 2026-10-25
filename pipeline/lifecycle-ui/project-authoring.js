import {deskPath} from './paths.js';

const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const jsonBytes=value=>new TextEncoder().encode(JSON.stringify(value));
async function download(id,name){
  const path=`/api/project-author/${id}/file/${name}`,response=await fetch(deskPath(path)),m=await response.json();
  if(!response.ok)throw Error(m.error);
  if(m.format!=='authoring-chunks-v1'||m.chunk_size!==1_000_000||!Number.isSafeInteger(m.bytes)||m.bytes<1||m.bytes>64_000_000||!Array.isArray(m.chunks)||m.chunks.length!==Math.ceil(m.bytes/1_000_000))throw Error('Invalid file receipt');
  const bytes=new Uint8Array(m.bytes);for(let i=0;i<m.chunks.length;i++){const r=await fetch(deskPath(path+'/chunk/'+i));if(!r.ok)throw Error('File read unavailable');const chunk=new Uint8Array(await r.arrayBuffer());if(chunk.length!==Math.min(1_000_000,m.bytes-i*1_000_000)||await digest(chunk)!==m.chunks[i])throw Error('File chunk differs');bytes.set(chunk,i*1_000_000);}
  if(await digest(bytes)!==m.sha256)throw Error('File checksum differs');return bytes;
}
async function upload(id,name,bytes,{api,csrf}){
  const path=`/api/project-author/${id}/file/${name}`,chunks=[];for(let i=0;i<bytes.length;i+=1_000_000)chunks.push(await digest(bytes.subarray(i,i+1_000_000)));
  const manifest={format:'authoring-chunks-v1',sha256:await digest(bytes),bytes:bytes.length,chunk_size:1_000_000,chunks},transfer=await digest(jsonBytes(manifest));
  const saved=await api(path+'/reserve',{manifest});if(JSON.stringify(saved)!==JSON.stringify(manifest))throw Error('Reserved transfer differs');
  for(let i=0;i<chunks.length;i++){const response=await fetch(deskPath(path+'/chunk/'+i),{method:'POST',headers:{'X-Studio-Token':csrf(),'X-Studio-Transfer':transfer,'Content-Type':'application/octet-stream'},body:bytes.subarray(i*1_000_000,(i+1)*1_000_000)}),result=await response.json();if(!response.ok)throw Error(result.error);if(result.sha256!==chunks[i])throw Error('Transfer receipt differs');}
  const result=await api(path+'/complete',{transfer_id:transfer});if(JSON.stringify(result)!==JSON.stringify(manifest))throw Error('Completed transfer differs');
}
export function interactiveAuthoringPanel(r,item,state,tools){
  const {el,button,tell,api,refresh}=tools,node=el('form'),actor=state.current_operator,job=item.execution,assigned=!r.restriction&&item.assigned_to===actor&&(!r.follow_up_owner||r.follow_up_owner===actor),key=`evz-authoring:${state.shared_workspace.workspace_id}:${r.id}:${item.id}`,output=el('div');
  node.addEventListener('submit',event=>event.preventDefault());
  node.append(el('h4','Interactive PDF authoring'),el('p',`Assigned to ${item.assigned_to}. ${job?`Preparing actor ${job.actor}; ${job.status}.`:'No authoring claim yet.'} Source, current feedback, baseline and disputes must be reviewed before rendering. Output and email stay held for human review.`,'notice'));
  if(!['website-concepts','website-refinement','client-proposal'].includes(item.kind)){node.append(el('p','This work item uses saved project context. Interactive PDF authoring supports website concepts, focused refinement and approved client proposals.','notice'));return node;}
  if(!state.shared_workspace.authoring.runtime){node.append(el('p','Interactive authoring is disabled. Saved work and evidence remain readable through the signed tool.','notice'));return node;}
  let busy=false;const action=(label,fn)=>button(label,async()=>{if(busy)return;busy=true;try{await fn();}catch(error){tell(error.message+' Inspect the current job before retrying. Immutable input cannot be replaced; retain/reconcile the attempt for a correction.',true);}finally{busy=false;}});
  const show=value=>{const pre=el('pre',JSON.stringify(value,null,2));output.replaceChildren(pre);};
  const pending=()=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
  async function commit(operation,input){
    const prior=pending(),request={operation,input,actor};if(prior&&JSON.stringify(prior)!==JSON.stringify(request))throw Error('Resolve the exact pending authoring request first');
    sessionStorage.setItem(key,JSON.stringify(request));try{const result=await api('/api/project-author/'+operation,input);sessionStorage.removeItem(key);show(result);tools.clearDirty();await refresh();return result;}catch(error){await refresh();throw error;}
  }
  const retained=pending();if(retained){node.append(el('p',`Pending ${retained.operation} by ${retained.actor}. Exact request retained in this tab; read current status before retry.`, 'notice'));
    if(retained.actor===actor)node.append(action('Retry exact authoring request',()=>commit(retained.operation,retained.input)),action('Retain pending request and reload current work',async()=>{sessionStorage.setItem(key+':retained:'+Date.now(),JSON.stringify(retained));sessionStorage.removeItem(key);await refresh();tell('Request retained in this tab. Review current job and evidence; this does not close publication or authorize replay.');}));else node.append(el('p','Sign in as the original preparing actor to retry this request.','notice'));
  }
  if(job)node.append(action('Inspect exact authoring job',async()=>show(await api('/api/project-author/inspect',{job_id:job.id}))));
  if(!job&&assigned&&item.status==='Ready'&&!retained)node.append(action('Begin interactive authoring',()=>commit('begin',{name:r.name,kind:item.kind})));
  if(job?.actor===actor&&assigned&&item.status==='Ready'&&!retained){
    if(job.status==='Claimed'){
      for(const [name,label,max]of [['input.json','Authored source JSON',4_000_000],['runtime.json','Registered Node runtime JSON',36_000_000]]){
        const wrap=el('label',label),input=el('input');input.type='file';input.accept='.json';wrap.append(input);node.append(wrap,action('Upload '+label,async()=>{const file=input.files[0];if(!file||file.size>max)throw Error('Choose a bounded JSON file');const value=JSON.parse(await file.text()),bytes=new TextEncoder().encode(JSON.stringify(value,null,2));await upload(job.id,name,bytes,tools);tell('Exact immutable '+name+' retained.');}));
      }
      node.append(action('Render exact uploaded PDF',()=>commit('render',{job_id:job.id})));
    }
    if(job.status==='Rendered'){
      node.append(action('Download exact PDF for raster review',async()=>{const bytes=await download(job.id,'output.pdf'),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=el('a','Download exact PDF');link.href=url;link.download=job.id+'.pdf';link.onclick=()=>setTimeout(()=>URL.revokeObjectURL(url),60_000);output.replaceChildren(link);}));
      const wrap=el('label','Actual PDF raster PNGs in page order'),files=el('input');files.type='file';files.accept='.png';files.multiple=true;wrap.append(files);
      const rasterLabel=el('label','Rasterizer used'),rasterizer=el('input');rasterizer.value='';rasterLabel.append(rasterizer);
      const notesLabel=el('label','Requirements, visual and export review notes'),notes=el('textarea');notesLabel.append(notes);
      const attest=el('label','I inspected every actual PDF raster and checked requirements, visual design and export','checkbox'),checked=el('input');checked.type='checkbox';attest.prepend(checked);
      node.append(wrap,rasterLabel,notesLabel,attest,el('p','Canonical page JSON and a deterministic renderer do not establish raster review or semantic design quality. Select every PNG in page order.','notice'),action('Retain reviewed output; keep delivery held',async()=>{
        if(!checked.checked||!notes.value.trim()||!rasterizer.value.trim()||files.files.length!==job.pages.length)throw Error('Review all actual pages and complete the review fields');
        const receipt=JSON.parse(new TextDecoder().decode(await download(job.id,'export.json')));
        for(const [i,file]of [...files.files].entries()){if(file.size>16_000_000)throw Error('Raster exceeds the bounded transfer');await upload(job.id,`review-page-${i+1}.png`,new Uint8Array(await file.arrayBuffer()),tools);}
        const raster=await api('/api/project-author/rasters',{job_id:job.id,pdf_sha256:receipt.pdf.sha256,rasterizer:rasterizer.value});
        await commit('complete',{job_id:job.id,review:{export_sha256:await digest(jsonBytes(receipt)),pages:receipt.pages,requirements:true,visual_design:true,export:true,notes:notes.value,raster_review:raster}});
      }));
    }
    if(['Claimed','Rendered','Held','Reconciled'].includes(job.status)){const label=el('label','Reason for retaining this attempt'),reason=el('textarea');label.append(reason);node.append(label,action('Retain attempt for corrected source',async()=>{if(!reason.value.trim())throw Error('Record the correction reason');await commit('revise',{job_id:job.id,reason:reason.value});}));}
  }
  const attempts=[...(item.authoring_history??[]),...(job?[job]:[])].filter(j=>!['Review'].includes(j.status));
  for(const attempt of attempts){const section=el('details');section.append(el('summary',`Recovery evidence: ${attempt.id} · ${attempt.status} · ${attempt.actor}`));
    section.append(action('Observe exact incomplete evidence',async()=>{const observed=await api('/api/project-author/recovery',{job_id:attempt.id});const pre=el('pre',JSON.stringify(observed,null,2));section.append(pre);
      if(attempt.actor!==actor||attempt.status==='Reconciled')return;
      const label=el('label','Reason to close publication'),reason=el('textarea');label.append(reason);section.append(label,el('p','Closure preserves available observed bytes. It cannot assert the process stopped. Missing or late evidence remains uncertain. No replay or allowance reset follows.','notice'),action('Close publication at observed hash',async()=>{if(!reason.value.trim())throw Error('Record an explicit closure reason');await commit('reconcile',{job_id:attempt.id,snapshot:observed.snapshot,reason:reason.value,disposition:'close-publication'});}));
    }));node.append(section);
  }
  if(!assigned)node.append(el('p','Only the assigned preparing operator can render or publish. Use the existing ownership/handoff controls; a handoff does not transfer an existing claim. Its original actor can reconcile retained evidence.','notice'));
  if(item.status==='Review')node.append(el('p','Prepared output awaits human asset review. Companion email is held; no delivery or client acceptance is established.','notice'));
  node.append(output);return node;
}
