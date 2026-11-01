import {deskPath} from './paths.js';
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const requireThat=(value,message)=>{if(!value)throw Error(message);};
let busy=false;
const urls=new Set();
const pathFor=ids=>'/api/project-original/'+[ids.project_id,ids.asset_id,ids.version_id].map(encodeURIComponent).join('/');
// Browser equivalent of the retained-original client: no provider fetch or local path leaves this tab.
export const operationsPdfBusy=()=>busy;
export function renderOperationsPdfs({state,el,button,panel,inputField,api,csrf,refresh,tell,clearDirty}){
 for(const url of urls)URL.revokeObjectURL(url);urls.clear();
 const node=panel('Existing PDF originals');node.classList.add('operations-pdfs');
 node.append(el('p','Register an existing Drive PDF, upload its exact retained bytes, inspect it, then explicitly review the baseline. Source metadata is operator-provided; this desk does not check the current Drive version.','notice'),el('p','Both operators can inspect and review. Reply approval and sending remain assigned separately. Originals above 64,000,000 bytes stay external references; email attachments allow two PDFs and 20,000,000 combined bytes.','muted'));
 const projects=Object.values(state.prospects).sort((a,b)=>a.name.localeCompare(b.name));
 async function read(path){const r=await fetch(deskPath(path),{redirect:'error'});const value=await r.json();requireThat(r.ok,value.error??'Private read unavailable');return value;}
 async function fresh(project){const r=await read('/api/project-resolve?name='+encodeURIComponent(state.prospects[project]?.name??''));requireThat(r.project_id===project,'Choose the exact existing company');return {revision:r.revision,context_sha256:r.context.context_sha256};}
 async function record(type,data,extra={},project='studio-assets'){
  return api('/api/operations-pdf/record',{revision:state.revision,event:{id:crypto.randomUUID(),type,prospect_id:project,at:new Date().toISOString(),data},...extra});
 }
 function action(label,run){const b=button(label,async()=>{if(busy)return;busy=true;node.inert=true;try{await run();}catch(error){tell(error.message,true);}finally{busy=false;node.inert=false;}});return b;}
 const context=el('section');context.append(el('h3','Choose existing company context'));
 const project=inputField(context,'Company / project','pdf_project','', 'text',[{value:'',label:'Choose an existing company'},...projects.map(r=>({value:r.id,label:r.name}))]);
 const details=el('details');details.append(el('summary','Company missing? Create private context'));
 const company=el('form'),name=inputField(company,'Existing company name','pdf_company_name'),purpose=inputField(company,'Private context purpose','pdf_company_purpose');
 company.append(el('p','Check the company list first. This adds private context only, without contact routes, research qualification or outreach.','muted'),action('Create private company context',async()=>{await record('workspace_project_created',{name:name.value,purpose:purpose.value,controlled:false},{},crypto.randomUUID());clearDirty();await refresh();tell('Private company context saved; no contact or approval created.');}));company.onsubmit=e=>e.preventDefault();details.append(company);context.append(details);node.append(context);
 function registration(asset=null){
  const wrap=el('details');wrap.append(el('summary',asset?'Register another existing version':'Register an existing PDF source'));
  const form=el('form');form.onsubmit=e=>e.preventDefault();
  if(!asset)form.append(el('p','Select its existing company above. Studio-wide sources are retained separately and need explicit permission in each reply task.','muted'));
  const scope=!asset?inputField(form,'Source scope','pdf_scope','project','text',[{value:'project',label:'Selected company'},{value:'studio',label:'Studio-wide'}]):null;
  const title=!asset?inputField(form,'Asset name','pdf_asset_name'):null;
  const label=inputField(form,'Version label','pdf_version_label','Original'),drive=inputField(form,'Exact Drive file ID','pdf_drive_id'),filename=inputField(form,'Original filename','pdf_filename'),modified=inputField(form,'Source modified time (ISO UTC)','pdf_modified'),account=inputField(form,'Source account (optional)','pdf_account','');
  const file=inputField(form,'Retained PDF file (optional metadata helper)','pdf_register_file','','file');file.accept='application/pdf,.pdf';
  const sha=inputField(form,'Exact SHA-256','pdf_sha256'),size=inputField(form,'Original bytes','pdf_bytes','','number');
  file.onchange=async()=>{const selected=file.files[0];if(!selected)return;try{requireThat(selected.size>0&&selected.size<=64_000_000,'For sources above 64,000,000 bytes, enter metadata only; hosted upload is unavailable.');const hash=await digest(await selected.arrayBuffer());if(file.files[0]!==selected)return;sha.value=hash;size.value=String(selected.size);filename.value=selected.name;tell('File hash and size computed locally. Confirm the exact source metadata before registration.');}catch(error){tell(error.message,true);}};
  form.append(action(asset?'Register source version':'Register source reference',async()=>{
   const source={reference:'drive:'+drive.value.trim(),name:filename.value,mime_type:'application/pdf',modified_time:modified.value,account:account.value.trim()||null,sha256:sha.value.trim(),bytes:Number(size.value)};
   const data=asset?{asset_id:asset.id,version_id:crypto.randomUUID(),version_label:label.value,reference:source.reference}:{asset_id:crypto.randomUUID(),scope:scope.value,...(scope.value==='project'?{project_id:project.value}:{}),name:title.value,kind:'source',version_id:crypto.randomUUID(),version_label:label.value,reference:source.reference};
   await record(asset?'asset_version_registered':'asset_registered',data,{source});clearDirty();await refresh();tell('Existing source registered. Upload and inspect the retained original before baseline review.');
  }));wrap.append(form);return wrap;
 }
 node.append(registration());
 const cards=[];
 for(const asset of Object.values(state.asset_index??{})){
  const card=panel(asset.name);cards.push({asset,card});card.append(el('p',asset.scope==='studio'?'Studio-wide source':state.prospects[asset.project_id]?.name??asset.project_id,'muted'),el('p',asset.dispute?'Disagreement open: the last approved baseline remains recorded; both operators must choose the same version.':`Approved baseline: ${asset.versions[asset.baseline_version]?.label??'Not selected'}`,'notice'));
  if(asset.dispute)for(const actor of ['owner','friend'])card.append(el('p',`${actor}: ${asset.versions[asset.dispute.choices?.[actor]?.version_id]?.label??'current choice needed'}`,'muted'));
  else if(asset.baseline_version)card.append(el('p',asset.baseline_agreement_events?.length?'Both operators confirmed this baseline.':`Baseline selected by ${asset.baseline_approved_by??'recorded operator'} at ${asset.baseline_approved_at??'retained event time'}.`,'muted'));
  for(const version of Object.values(asset.versions)){
   const row=el('section',undefined,'asset-version'),source=version.operations_pdf_source??version.verified_original,o=version.verified_original;
   row.append(el('h4',version.label),el('p',version.reference,'muted'),el('p',source?`${source.name} Â· ${source.bytes.toLocaleString()} bytes Â· ${source.mime_type}\nSHA-256 ${source.sha256}\nSource modified ${source.modified_time} Â· account ${source.account??'not recorded'}`:'No exact registered source metadata; upload is unavailable.','pdf-metadata'));
   const large=source?.bytes>64_000_000,transfer=version.original_transfer;
   row.append(el('p',large?'External reference only: original exceeds hosted storage limit.':o?'Verified original recorded; inspect to confirm current byte availability.':transfer?'Incomplete transfer retained. Select the same original to retry/resume. Complete backup remains held.':'Original not uploaded. Reference alone is unavailable for inspection or attachment.','notice'));
   row.append(el('p',o&&asset.baseline_version===version.id&&!asset.dispute&&o.bytes<=20_000_000?'Approved size-eligible baseline. Exact project/studio permission and reply freshness are checked when selecting attachments.':'Not currently an attachable baseline; inspection, baseline approval and attachment size are separate.','muted'));
   const target=()=>({project_id:asset.project_id??project.value,asset_id:asset.id,version_id:version.id});
   if(source&&!large&&version.operations_pdf_source){
    const file=inputField(row,o?'Retained original (exact retry only)':'Retained original to upload / resume','pdf_upload_'+version.id,'','file');file.accept='application/pdf,.pdf';
    row.append(action(o?'Restore exact retained bytes':'Upload / resume exact original',async()=>{
     const selected=file.files[0];requireThat(selected&&selected.size===source.bytes&&selected.size<=64_000_000,'Choose the exact registered PDF and byte size.');const bytes=new Uint8Array(await selected.arrayBuffer());requireThat(await digest(bytes)===source.sha256&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-','Selected bytes differ from the registered original.');
     const chunks=[];for(let offset=0;offset<bytes.length;offset+=1_000_000)chunks.push(await digest(bytes.subarray(offset,offset+1_000_000)));
     const ids=target(),path=pathFor(ids),manifest={format:'project-original-chunks-v1',sha256:source.sha256,bytes:bytes.length,chunk_size:1_000_000,chunks},provenance=Object.fromEntries(['reference','name','mime_type','modified_time','account'].map(k=>[k,source[k]]));
     const reserved=await api(path+'/reserve',{...await fresh(ids.project_id),manifest,source:provenance});
     for(let i=0;i<chunks.length;i++){tell(`Uploading retained original: chunk ${i+1} of ${chunks.length}`);const r=await fetch(deskPath(path+'/chunk/'+i),{method:'POST',headers:{'content-type':'application/octet-stream','x-studio-token':csrf(),'x-studio-transfer':reserved.id},body:bytes.subarray(i*1_000_000,(i+1)*1_000_000)}),receipt=await r.json();requireThat(r.ok&&receipt.sha256===chunks[i],receipt.error??'Chunk receipt differs; retain and resume this exact transfer.');}
     const saved=await api(path+'/complete',{...await fresh(ids.project_id),transfer_id:reserved.id});requireThat(saved.sha256===source.sha256&&saved.bytes===source.bytes,'Original completion differs; refresh exact state.');clearDirty();await refresh();tell('Exact original saved. Inspect the PDF before explicit baseline review.');
    }));
   }
   if(o){
    const inspection=el('div');inspection.dataset.pdfInspection='true';row.append(inspection);
    row.append(action('Inspect verified original',async()=>{
     const ids=target(),path=pathFor(ids),packet=await read(path),m=packet.manifest;
     requireThat(m?.format==='project-original-chunks-v1'&&m.chunk_size===1_000_000&&m.bytes===o.bytes&&m.sha256===o.sha256&&m.bytes>0&&m.bytes<=64_000_000&&m.chunks?.length===Math.ceil(m.bytes/1_000_000),'Original manifest changed.');
     const chunks=[];for(let i=0;i<m.chunks.length;i++){const r=await fetch(deskPath(path+'/chunk/'+i),{redirect:'error'});requireThat(r.ok,'Original chunk unavailable; inspection is held.');const bytes=new Uint8Array(await r.arrayBuffer());requireThat(bytes.length===Math.min(1_000_000,m.bytes-i*1_000_000)&&await digest(bytes)===m.chunks[i]&&r.headers.get('x-content-sha256')===m.chunks[i],'Original chunk changed.');chunks.push(bytes);}
     const blob=new Blob(chunks,{type:'application/pdf'}),bytes=new Uint8Array(await blob.arrayBuffer());requireThat(await digest(bytes)===o.sha256&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-','Whole original verification failed.');
     for(const url of urls)URL.revokeObjectURL(url);urls.clear();for(const prior of node.querySelectorAll('[data-pdf-inspection]'))prior.replaceChildren();
     const url=URL.createObjectURL(blob);urls.add(url);inspection.replaceChildren();const frame=el('iframe');frame.title=`Existing PDF: ${asset.name} ${version.label}`;frame.src=url;frame.className='pdf-preview';const download=el('a','Open verified PDF in a new tab');download.href=url;download.target='_blank';download.rel='noreferrer';inspection.append(download,frame);
     const checked=inputField(inspection,'I visually inspected this exact retained PDF','pdf_inspected_'+version.id,false,'checkbox');
     for(const [label,type] of [['Approve / choose baseline','asset_version_selected'],...(asset.baseline_version&&asset.baseline_version!==version.id&&!asset.dispute?[['Flag disagreement','asset_version_disputed']]:[])])inspection.append(action(label,async()=>{requireThat(checked.checked,'Visually inspect the PDF and confirm before baseline review.');await record(type,{asset_id:asset.id,version_id:version.id},{inspected_original:{sha256:o.sha256,bytes:o.bytes}});clearDirty();await refresh();tell('Attributed baseline review saved. Reply content and send approval remain separate.');}));
     tell('Original chunks and whole SHA-256 verified. Review the displayed PDF before confirming inspection.');
    }));
   }
   card.append(row);
  }
  card.append(registration(asset));node.append(card);
 }
 project.onchange=()=>{for(const {asset,card}of cards)card.hidden=Boolean(project.value&&asset.scope==='project'&&asset.project_id!==project.value);};
 if(!cards.length)node.append(el('p','No PDF sources registered. Choose the existing company and register its retained source.','empty'));
 return node;
}
