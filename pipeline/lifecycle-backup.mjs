import {blobProjectOriginalStore} from './shared-project-originals.mjs';
import {validateMailEvidence} from './shared-operations-exact-mail.mjs';
import {validateResearchEvidence} from './known-identity-research.mjs';
import {validateCalendarImport} from './shared-operations-calendar.mjs';
import {supportsProjectAuthoring} from './shared-project-continuation.mjs';
import {lstat,realpath,open,mkdir,writeFile,link,unlink,rm} from 'node:fs/promises';
import {join,dirname,resolve,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {check,hash,initialConfig} from './lifecycle.mjs';
import {privateStateDirectory} from './engine.mjs';
import {audioArchiveFiles} from './call-audio.mjs';
import {nodePDFResources} from './project-authoring-node.mjs';
import {validateAuthoringRecovery} from './authoring-recovery.mjs';
import {originalEvidencePattern,validateOriginalDependencies} from './original-recovery.mjs';
import {mailboxMimeStore,validateMailboxMimeReference} from './mailbox-mime-store.mjs';
import {cloudDiscoveryArtifactStore,validateCloudDiscoveryArtifactReference} from './cloud-discovery-artifacts.mjs';

const digest=b=>createHash('sha256').update(b).digest('hex'),sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const jobID=v=>typeof v==='string'&&/^author-[a-f0-9]{32}$/.test(v);
const fileLimit=64_000_000,totalLimit=512_000_000,countLimit=6000,jsonLimit=4_000_000;
const mimePath=/^mailbox-mime\/[a-f0-9]{64}\/(manifest|(?:0|[1-9]|1[0-9]|2[0-7])-[a-f0-9]{64})$/;
const discoveryPath=/^cloud-discovery\/[a-f0-9]{64}\/(manifest|[01]-[a-f0-9]{64})$/;
const authorPath=/^project-authored\/(author-[a-f0-9]{32})\/(context\.json|input\.json|authored\.json|runtime\.json|renderer-evidence\.json|export\.json|output\.pdf|(review-)?page-[1-9][0-9]?\.(png|json)|image-[a-zA-Z0-9_-]{1,100}\.(png|jpg|jpeg|webp)|recovery-[a-f0-9]{64}\.bin)$/;
function allowed(path){return typeof path==='string'&&(/^(project-originals\/[a-f0-9]{64}\.pdf|call-audio\/[a-zA-Z0-9_-]{1,80})$/.test(path)||originalEvidencePattern.test(path)||authorPath.test(path)||mimePath.test(path)||discoveryPath.test(path));}
function discoveryReferences(state){
 const tasks=state.cloud_discovery?.tasks??{};check(tasks&&typeof tasks==='object'&&!Array.isArray(tasks)&&Object.keys(tasks).length<=1000,'Bounded discovery tasks required');
 const refs=new Map(),add=ref=>{validateCloudDiscoveryArtifactReference(ref);check(!refs.has(ref.sha256)||refs.get(ref.sha256).bytes===ref.bytes,'Conflicting discovery dependency sizes');refs.set(ref.sha256,ref);};
 for(const task of Object.values(tasks))for(const field of ['submission','review'])if(task[field])add(task[field].artifact);
 for(const prospect of Object.values(state.prospects??{}))if(prospect.cloud_discovery_source)for(const field of ['submission','review'])add(prospect.cloud_discovery_source[field]);
 return [...refs.values()];
}
function discoveryReader(read){return cloudDiscoveryArtifactStore({async getWithMetadata(path){check(discoveryPath.test(path),'Unsafe discovery dependency path');const bytes=await read(path,path.endsWith('/manifest')?5000:1000000);return bytes?{data:bytes}:null;}});}
function mimeReferences(state){
 const intents=state.mailbox_delivery?.intents??{};check(intents&&typeof intents==='object'&&!Array.isArray(intents)&&Object.keys(intents).length<=10000,'Bounded delivery intents required');
 const refs=new Map();for(const i of Object.values(intents)){
  const m=i?.mime;check(m&&m.reference==='mailbox-mime/'+m.sha256,'Missing exact delivery MIME dependency');const ref=validateMailboxMimeReference({sha256:m.sha256,bytes:m.bytes});
  check(!refs.has(ref.sha256)||refs.get(ref.sha256).bytes===ref.bytes,'Conflicting MIME dependency sizes');refs.set(ref.sha256,ref);
 }return [...refs.values()];
}
function mimeReader(read){return mailboxMimeStore({async getWithMetadata(path){check(mimePath.test(path),'Unsafe MIME dependency path');const bytes=await read(path,path.endsWith('/manifest')?5000:1000000);return bytes?{data:bytes}:null;}});}

// Every ancestor is checked: a regular leaf alone does not prevent junction escapes.
export async function boundedBackupRead(root,path,max=fileLimit,optional=false){
 check(allowed(path),'Unsafe backup dependency path');const base=await realpath(root);let current=base;
 try{
  for(const [i,part] of path.split('/').entries()){
   current=join(current,part);const stat=await lstat(current);
   check(!stat.isSymbolicLink()&&await realpath(current)===current,'Unsafe backup dependency path');
   check(i===path.split('/').length-1?stat.isFile()&&stat.size>0&&stat.size<=max:stat.isDirectory(),'Unsafe or oversized backup dependency');
  }
  const file=await open(current,'r');try{const stat=await file.stat();check(stat.isFile()&&stat.size>0&&stat.size<=max,'Unsafe or oversized backup dependency');
   const buffer=Buffer.alloc(stat.size+1);let length=0;for(;;){const {bytesRead}=await file.read(buffer,length,buffer.length-length);length+=bytesRead;check(length<=stat.size,'Backup dependency changed while reading');if(!bytesRead)break;}check(length===stat.size,'Backup dependency changed while reading');return buffer.subarray(0,length);
  }finally{await file.close();}
 }catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
function workHistory(state){const pending=Object.values(state.prospects??{}).flatMap(r=>Object.values(r.project_work??{})),result=[];while(pending.length){check(result.length+pending.length<=6000,'Authoring history exceeds its verified bounds');const work=pending.pop();result.push(work);pending.push(...(work.history??[]));}return result;}
export function hasProjectDependencies(state){return discoveryReferences(state).length>0||mimeReferences(state).length>0||Object.keys(state.drive_original_reads??{}).length>0||Object.values(state.asset_index??{}).some(a=>Object.values(a.versions??{}).some(v=>v.original_transfer||v.verified_original||v.provenance?.source_reference))||workHistory(state).some(w=>w.execution||w.authoring_history?.length)||Object.values(state.prospects??{}).some(r=>r.project_email_drafts?.some(d=>d.attachment));}

// Resolve a closed allowlist from records, never recurse through the workspace.
async function inventory(state,read,{restoring=false}={}){
 await validateMailEvidence(state,{read});
 if(Object.values(state.operations?.bookings??{}).some(b=>b.confirmation))validateCalendarImport(state,{operations:{bookings:{}}});
 const dispatch=state.operations?.internal_dispatch;check(!Object.values(dispatch?.ticks??{}).some(t=>['Reserved','Claimed'].includes(t.status)),'Complete G1 held: reconcile incomplete dispatch against its exact observed hash; never replay');
 if(dispatch?.authorization)check(hash(dispatch.policy)===dispatch.authorization.data?.policy_sha256&&hash(state.events[dispatch.authorization.id])===hash(dispatch.authorization),'Standing policy/authorization bytes are incomplete');
 validateResearchEvidence(state,{complete:true});
 const files=new Map(),jobs=new Map();let total=0;
 const add=async(path,{max=fileLimit,optional=false,expected,size}={})=>{
  check(allowed(path),'Unsafe backup dependency path');let bytes=files.get(path);
  if(!bytes){bytes=await read(path,max,optional);if(!bytes){check(optional,'Missing backup dependency');return null;}check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=max,'Oversized backup dependency');total+=bytes.length;check(total<=totalLimit&&files.size<countLimit,'Project backup exceeds its verified bounds');files.set(path,bytes);}
  check((!expected||digest(bytes)===expected)&&(size===undefined||bytes.length===size),'Backup dependency checksum or size mismatch');return bytes;
 };
 const json=async(path,options={})=>{const bytes=await add(path,{max:jsonLimit,...options});return bytes?JSON.parse(bytes):null;};
 const mime=mimeReader((path,max)=>add(path,{max}));for(const ref of mimeReferences(state))await mime.get(ref);
 const discovery=discoveryReader((path,max)=>add(path,{max}));for(const ref of discoveryReferences(state))await discovery.get(ref);
 await validateOriginalDependencies(state,(path,expected,size)=>add(path,{max:originalEvidencePattern.test(path)?1_000_000:fileLimit,expected,size}));
 function job(value){check(jobID(value.id)&&sha(value.context_sha256),'Unsafe authoring dependency declaration');const prior=jobs.get(value.id)??{};for(const k of ['context_sha256','source_sha256','runtime_sha256','renderer_sha256','renderer_lock_sha256','export_sha256'])check(!prior[k]||!value[k]||prior[k]===value[k],'Conflicting authoring dependency declarations');jobs.set(value.id,{...prior,...value});}
 for(const work of workHistory(state))for(const value of [...(work.authoring_history??[]),...(work.execution?[work.execution]:[])])job(value);
 for(const r of Object.values(state.prospects??{})){
  for(const draft of r.project_email_drafts??[]){const a=draft.attachment;if(!a)continue;const version=state.asset_index?.[a.asset_id]?.versions?.[a.version_id];check(version?.verified_original?.sha256===a.sha256&&version.verified_original.bytes===a.bytes&&version.reference===a.reference,'Held attachment has no matching verified original');}
 }
 for(const asset of Object.values(state.asset_index??{}))for(const version of Object.values(asset.versions??{})){
  const original=version.verified_original;
  if(original){check(sha(original.sha256)&&Number.isSafeInteger(original.bytes)&&original.reference===version.reference,'Invalid verified original dependency');const bytes=await add(`project-originals/${original.sha256}.pdf`,{expected:original.sha256,size:original.bytes});check(bytes.subarray(0,5).toString()==='%PDF-','Invalid archived PDF');}
  const p=version.provenance;if(!p?.source_reference)continue;
  const match=/^private-path:project-authored\/(author-[a-f0-9]{32})\/authored\.json$/.exec(p.source_reference);check(match&&p.job_id===match[1]&&version.reference===`private-path:project-authored/${match[1]}/output.pdf`&&original&&[p.context_sha256,p.source_sha256,p.renderer_sha256,p.export_sha256].every(sha)&&p.review,'Unsupported authored dependency reference');
  job({...p,id:match[1],pdf:{name:'output.pdf',sha256:original.sha256,bytes:original.bytes},pages:p.review?.pages,status:'Review'});
 }
 for(const j of jobs.values()){
  if(j.recovery){
   check(j.status==='Reconciled','Published authoring cannot use incomplete recovery evidence');
   for(const ref of j.references??[]){const original=state.asset_index?.[ref.asset_id]?.versions?.[ref.version_id]?.verified_original;check(original&&original.sha256===ref.sha256&&original.bytes===ref.bytes&&original.reference===ref.reference,'Authoring reference has no matching verified original');}
   await validateAuthoringRecovery(j,(name,expected,size)=>add(`project-authored/${j.id}/${name}`,{max:1_000_000,expected,size}));continue;
  }
  const prefix=`project-authored/${j.id}/`,context=await json(prefix+'context.json');check(context.context_sha256===j.context_sha256&&hash(context.source)===j.context_sha256,'Authoring context checksum mismatch');
  for(const ref of j.references??[]){const original=state.asset_index?.[ref.asset_id]?.versions?.[ref.version_id]?.verified_original;check(original&&original.sha256===ref.sha256&&original.bytes===ref.bytes&&original.reference===ref.reference,'Authoring reference has no matching verified original');}
  const input=await json(prefix+'input.json',{optional:!j.source_sha256});if(input)check(input.context_sha256===j.context_sha256,'Submitted authoring context changed');
  const source=await json(prefix+'authored.json',{optional:!j.source_sha256});if(source){check(!j.source_sha256||hash(source)===j.source_sha256,'Authored source checksum mismatch');check(source.context_sha256===j.context_sha256,'Authored context changed');}
  const runtime=await json(prefix+'runtime.json',{optional:!j.runtime_sha256,max:36_000_000});if(runtime){check(!j.runtime_sha256||hash(runtime)===j.runtime_sha256,'Runtime evidence checksum mismatch');
   if(runtime.renderer==='node-pdf-v1')nodePDFResources(runtime,context.project_id);
   else{
   // Declarations are evidence only. Unknown fields might hide credentials.
   check(Object.keys(runtime).every(k=>['python','pdftoppm','proposal_assets','images','fonts'].includes(k)),'Unsupported runtime evidence fields; exclude credentials before backup');
   for(const [id,image] of Object.entries(runtime.images??{})){
    check(/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&image.project_id===context.project_id&&sha(image.sha256)&&typeof image.path==='string'&&Object.keys(image).every(k=>['project_id','path','sha256','provenance'].includes(k)),'Unsafe original image declaration');
    const ext=/\.(png|jpe?g|webp)$/i.exec(image.path)?.[1]?.toLowerCase();check(ext,'Unsupported original image dependency');const path=prefix+`image-${id}.${ext}`;
    let bytes=await add(path,{optional:!restoring,expected:image.sha256});
    if(!bytes){check(!restoring,'Missing original image dependency');bytes=await read.external(image.path,fileLimit);check(digest(bytes)===image.sha256,'Original image checksum mismatch');total+=bytes.length;check(total<=totalLimit&&files.size<countLimit,'Project backup exceeds its verified bounds');files.set(path,bytes);}
    check(ext==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):ext==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':bytes[0]===255&&bytes[1]===216&&bytes[2]===255,'Original image container mismatch');
   }
   for(const entry of Object.values(runtime.fonts??{}))check(entry&&Object.keys(entry).every(k=>['path','sha256'].includes(k)),'Unsupported font declaration');
   }
  }
  if(j.renderer_sha256){check(sha(j.renderer_sha256),'Invalid renderer evidence');const path=prefix+'renderer-evidence.json';let evidence=await json(path,{optional:!restoring});
   if(!evidence){const bytes=await read.renderer(prefix+(j.renderer==='node-pdf-v1'?'renderer.mjs':'renderer.py'));check(digest(bytes)===j.renderer_sha256,'Renderer checksum mismatch');evidence={schema_version:1,renderer_sha256:j.renderer_sha256,execution:'disabled',requires_trusted_runtime_rebinding:true};const data=Buffer.from(JSON.stringify(evidence));files.set(path,data);total+=data.length;}
   check(evidence.schema_version===1&&evidence.renderer_sha256===j.renderer_sha256&&evidence.execution==='disabled'&&evidence.requires_trusted_runtime_rebinding===true,'Invalid renderer evidence');
   check(Object.keys(evidence).every(k=>['schema_version','renderer_sha256','lock_sha256','execution','requires_trusted_runtime_rebinding'].includes(k)),'Unsupported renderer evidence fields');
   if(j.renderer==='node-pdf-v1')check(sha(j.renderer_lock_sha256)&&evidence.lock_sha256===j.renderer_lock_sha256,'Pinned renderer dependency evidence changed');
  }
  const receipt=await json(prefix+'export.json',{optional:!j.export_sha256&&!j.pdf});
  if(receipt){check(receipt.schema_version===1&&receipt.context_sha256===j.context_sha256&&receipt.source_sha256===j.source_sha256&&(!j.export_sha256||hash(receipt)===j.export_sha256),'Export receipt checksum mismatch');check(receipt.pdf?.name==='output.pdf'&&sha(receipt.pdf.sha256)&&Array.isArray(receipt.pages)&&receipt.pages.length>0&&receipt.pages.length<=16,'Incomplete authored export');
   const pdf=await add(prefix+'output.pdf',{expected:receipt.pdf.sha256,size:receipt.pdf.bytes});check(pdf.subarray(0,5).toString()==='%PDF-'&&(!j.pdf||j.pdf.name===receipt.pdf.name&&j.pdf.sha256===receipt.pdf.sha256&&j.pdf.bytes===receipt.pdf.bytes),'Authored PDF mismatch');
   const pagePattern=j.renderer==='node-pdf-v1'?/^page-[1-9][0-9]?\.json$/:/^page-[1-9][0-9]?\.png$/;
   check(new Set(receipt.pages.map(p=>p.name)).size===receipt.pages.length,'Duplicate authored pages');for(const [i,p] of receipt.pages.entries()){check(p.page===i+1&&pagePattern.test(p.name)&&sha(p.sha256),'Invalid authored page');await add(prefix+p.name,{max:16_000_000,expected:p.sha256});}
   check(!j.pages||hash(j.pages)===hash(receipt.pages),'Reviewed pages changed');
   if(j.review)check(j.review.export_sha256===hash(receipt)&&hash(j.review.pages)===hash(receipt.pages)&&(!j.review_sha256||hash(j.review)===j.review_sha256),'Authoring review evidence changed');
   const raster=j.review?.raster_review;if(j.renderer==='node-pdf-v1'&&j.review)check(raster?.pdf_sha256===receipt.pdf.sha256&&raster.pages?.length===receipt.pages.length,'Missing actual PDF raster review');
   if(raster){check(raster.pdf_sha256===receipt.pdf.sha256&&raster.pages?.length===receipt.pages.length,'Raster review differs from PDF');for(const [i,p] of raster.pages.entries()){check(p.page===i+1&&p.name===`review-page-${i+1}.png`&&sha(p.sha256),'Invalid raster review dependency');const bytes=await add(prefix+p.name,{max:16_000_000,expected:p.sha256});check(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid raster review PNG');}}
  }
 }
 const audio=await audioArchiveFiles(state,{get:id=>add('call-audio/'+id,{max:4_000_000})});
 check(total<=totalLimit&&files.size<=countLimit,'Project backup exceeds its verified bounds');return {files,audio_clips:audio.length};
}
function localBackupReader(directory){
 const read=(path,max,optional)=>boundedBackupRead(directory,path,max,optional);
 read.renderer=async path=>{check(/^project-authored\/author-[a-f0-9]{32}\/renderer\.(py|mjs)$/.test(path),'Unsafe renderer evidence path');return readRegularExternal(join(directory,...path.split('/')),jsonLimit,directory);};
 read.external=readRegularExternal;return read;
}
async function localInventory(directory,state){return inventory(state,localBackupReader(directory));}
// Shared manual exports read canonical MIME blobs; other retained dependencies keep the existing local path.
export async function hostedManualBackupInventory(app,localDependencies){
 check(app.store?.manualBinding,'Exact manual workspace required');const {data}=await app.store.envelope(),state=data.state;
 check(!state.mailbox_delivery||['shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(app.store.manualBinding.scope.capability),'Delivery recovery requires its own capability');
 check(!state.cloud_discovery&&!discoveryReferences(state).length||app.store.manualBinding.scope.capability==='shared-operations-desk-v1','Discovery recovery requires its own capability');
 const originals=data.config.operations_pdf?new Map(Object.values(state.asset_index??{}).flatMap(a=>Object.values(a.versions??{}).filter(v=>v.verified_original).map(v=>[v.verified_original.sha256,v.verified_original]))):null;
 const localRead=localBackupReader(localDependencies),read=async(path,max,optional)=>{
  const original=/^project-originals\/([a-f0-9]{64})\.pdf$/.exec(path);
  if(originals&&original){const metadata=originals.get(original[1]);check(metadata,'Choose an exact verified original backup dependency');const bytes=await blobProjectOriginalStore(app.store.store).get(metadata);check(bytes.length<=max,'Oversized original backup dependency');return bytes;}
  if(!mimePath.test(path)&&!discoveryPath.test(path))return localRead(path,max,optional);
  const entry=await app.store.store.getWithMetadata(path,{type:'arrayBuffer',consistency:'strong'});check(entry?.data,'Missing required MIME backup dependency');const bytes=Buffer.from(entry.data);check(bytes.length<=max,'Oversized MIME backup dependency');return bytes;
 };
 read.renderer=localRead.renderer;read.external=localRead.external;
 const result=await inventory(state,read);
 const after=await app.store.envelope();check(hash(after.data)===hash(data),'Workspace changed during backup; repeat from a fresh manifest');return {state,...result};
}
// Validation is complete before the first write. Content-addressed put reconciles exact existing bytes only.
export async function installMailboxMimeDependencies(state,files,rawStore){
 await validateBackupDependencies(state,files);const source=mimeReader(async path=>files.get(path)),destination=mailboxMimeStore(rawStore);
 for(const ref of mimeReferences(state)){const bytes=await source.get(ref),saved=await destination.put(bytes);check(hash(saved)===hash(ref),'Imported MIME differs');}
}
export async function installCloudDiscoveryDependencies(state,files,rawStore){
 await validateBackupDependencies(state,files);const source=discoveryReader(async path=>files.get(path)),destination=cloudDiscoveryArtifactStore(rawStore);
 for(const ref of discoveryReferences(state)){const payload=await source.get(ref),saved=await destination.put(payload);check(hash(saved)===hash(ref),'Imported discovery artifact differs');}
}
export async function hostedBackupInventory(app,audioStore){
 check(app.authoringStore&&app.originalStore&&app.store&&!app.store.inertBinding&&!app.store.manualBinding&&(app.config.mode==='controlled'||supportsProjectAuthoring(app)||app.store.dispatchBinding||app.store.projectBinding?.scope.capability==='shared-known-identity-research-v1'),'Hosted project backup requires fictional controlled work or an exact shared project binding');
 const dispatch=(await app.snapshot()).operations?.internal_dispatch;check(!Object.values(dispatch?.ticks??{}).some(t=>['Reserved','Claimed'].includes(t.status)),'Hosted backup held: reconcile incomplete dispatch tick against its exact observed hash');
 const state=await app.snapshot();
 // Incomplete transfers/attempts require reconciliation before claiming a complete hosted package.
 for(const work of workHistory(state))for(const job of [...(work.authoring_history??[]),...(work.execution?[work.execution]:[])])check(job.status==='Review'||job.status==='Reconciled'&&job.recovery,'Hosted backup held: reconcile unfinished authoring attempts before exporting complete dependencies');
 const originals=new Map(Object.values(state.asset_index??{}).flatMap(a=>Object.values(a.versions??{}).filter(v=>v.verified_original).map(v=>[v.verified_original.sha256,v.verified_original])));
 const read=async(path,max,optional)=>{
  check(allowed(path),'Unsafe hosted backup path');let bytes;
  const match=authorPath.exec(path);
  if(match)bytes=await app.authoringStore.get(match[1],match[2]);
  else if(originalEvidencePattern.test(path))bytes=await app.originalStore.getEvidence(path);
  else if(path.startsWith('project-originals/')){const original=originals.get(path.slice(18,-4));check(original,'Missing registered original dependency');bytes=await app.originalStore.get(original);}
  else bytes=await audioStore.get(path.slice('call-audio/'.length));
  check(bytes||optional,'Missing required hosted backup dependency');check(!bytes||bytes.length<=max,'Oversized hosted backup dependency');return bytes??null;
 };
 const result=await inventory(state,read,{restoring:true});check(hash(await app.snapshot())===hash(state),'Workspace changed during backup; repeat the read from a fresh manifest');return {state,...result};
}
async function readRegularExternal(path,max=fileLimit,inside){
 check(isAbsolute(path),'Use an absolute resource path');const absolute=resolve(path);let current=dirname(absolute);for(;;){check(!(await lstat(current)).isSymbolicLink(),'Unsafe resource ancestor');if(dirname(current)===current)break;current=dirname(current);}
 if(inside)check(await realpath(dirname(absolute))===join(await realpath(inside),'project-authored',absolute.split(/[\\/]/).at(-2)),'Unsafe renderer evidence directory');
 const stat=await lstat(absolute);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'Unsafe or oversized resource dependency');const file=await open(absolute,'r');try{const data=Buffer.alloc(stat.size+1);let length=0;for(;;){const {bytesRead}=await file.read(data,length,data.length-length);length+=bytesRead;check(length<=stat.size,'Resource dependency changed');if(!bytesRead)break;}check(length===stat.size,'Resource dependency changed');return data.subarray(0,length);}finally{await file.close();}
}
async function removeOwned(path,identity){const stat=await lstat(path);check(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.dev===identity.dev&&stat.ino===identity.ino&&await realpath(path)===path,'Refusing cleanup of a changed directory');await rm(path,{recursive:true});}
export async function writeLifecycleBackup(directory,state,output,created_at){
 const {files,audio_clips}=await localInventory(directory,state);return writeBackupFiles(state,files,audio_clips,output,created_at);
}
export async function writePortableLifecycleBackup(state,files,output,created_at){
 const result=await validateBackupDependencies(state,files);return writeBackupFiles(state,result.files,result.audio_clips,output,created_at);
}
async function writeBackupFiles(state,files,audio_clips,output,created_at){
 const body=JSON.stringify(state),manifest=[...files].map(([path,bytes])=>({path,bytes:bytes.length,sha256:digest(bytes)}));
 const bundle={schema_version:2,created_at,sha256:hash(body),body,files:manifest,files_sha256:hash(manifest)};const encoded=JSON.stringify(bundle);check(Buffer.byteLength(encoded)<=25_000_000,'Backup exceeds the verified restore limit; archive closed records first');
 output=await privateStateDirectory(output);const sidecar=output+'.files';await mkdir(sidecar,{mode:0o700});const identity=await lstat(sidecar),temporary=join(sidecar,`bundle-${randomUUID()}.pending`);let published=false;
 try{for(const entry of manifest){const path=join(sidecar,entry.sha256);try{await writeFile(path,files.get(entry.path),{flag:'wx',mode:0o600,flush:true});}catch(error){if(error.code!=='EEXIST')throw error;}}
  await writeFile(temporary,encoded,{flag:'wx',mode:0o600,flush:true});await link(temporary,output);published=true;await unlink(temporary);
 }catch(error){if(!published)await removeOwned(sidecar,identity);throw error;}
 return {sha256:bundle.sha256,prospects:Object.keys(state.prospects).length,audio_clips,project_files:manifest.length-audio_clips,package_schema:2};
}
export async function validateBackupDependencies(state,files){
 const result=await inventory(state,async(path,max,optional)=>{const bytes=files.get(path);check(bytes||optional,'Missing required backup dependency');check(!bytes||bytes.length<=max,'Oversized backup dependency');return bytes??null;},{restoring:true});check(result.files.size===files.size,'Backup contains undeclared dependencies');return result;
}
export async function readLifecycleBackup(input){
 const stat=await lstat(input);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=25_000_000,'Invalid bounded backup file');
 const bundle=JSON.parse(await readRegularExternal(resolve(input),25_000_000));check([1,2].includes(bundle.schema_version)&&typeof bundle.body==='string'&&hash(bundle.body)===bundle.sha256,'Backup checksum mismatch');
 const state=JSON.parse(bundle.body);check(state.schema_version===1&&/^[a-zA-Z0-9_-]{1,100}$/.test(state.run_id)&&['controlled','production'].includes(state.mode),'Invalid backup state');check(!Object.values(state.ai_attempts).some(a=>a.status==='Running'),'Cannot restore running worker state');
 if(bundle.schema_version===1){check(!hasProjectDependencies(state),'Incomplete legacy backup: verified originals or authoring dependencies are absent; create a complete backup from the source workspace');const files=new Map(),audio=await audioArchiveFiles(state,{get:async id=>{const path=join(resolve(input)+'.audio',id);const bytes=await readRegularExternal(path,4_000_000);files.set('call-audio/'+id,bytes);return bytes;}});return {state,files,audio_clips:audio.length};}
 check(Array.isArray(bundle.files)&&bundle.files.length<=countLimit&&hash(bundle.files)===bundle.files_sha256,'Backup manifest checksum mismatch');let total=0;const files=new Map(),paths=new Set();
 for(const entry of bundle.files){check(entry&&allowed(entry.path)&&!paths.has(entry.path)&&sha(entry.sha256)&&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=fileLimit,'Invalid bounded backup manifest');paths.add(entry.path);total+=entry.bytes;check(total<=totalLimit,'Backup exceeds its verified bounds');}
 for(const entry of bundle.files){const bytes=await readRegularExternal(join(resolve(input)+'.files',entry.sha256),entry.bytes);check(bytes.length===entry.bytes&&digest(bytes)===entry.sha256,'Backup dependency checksum or size mismatch');files.set(entry.path,bytes);}
 const result=await validateBackupDependencies(state,files);return {state,...result};
}
export async function restoreLifecycleBackup(input,destination){
 const {state,files,audio_clips}=await readLifecycleBackup(input);
 if(state.cloud_discovery)check(Number.isSafeInteger(state.cloud_discovery.epoch)&&state.cloud_discovery.epoch>=0&&state.cloud_discovery.epoch<Number.MAX_SAFE_INTEGER,'Invalid discovery recovery epoch');
 destination=await privateStateDirectory(destination);await mkdir(destination,{mode:0o700});const identity=await lstat(destination);let published=false;
 try{
  for(const [path,bytes] of files){const target=join(destination,...path.split('/'));await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,bytes,{flag:'wx',mode:0o600,flush:true});}
  for(const a of Object.values(state.actions))if(a.status==='Pending'){a.status='Uncertain';a.hold='Restored pending mutation; read back provider, never resend';}
  for(const r of Object.values(state.operations?.requests??{}))if(r.status==='Pending'&&['draft','send','stop','booking_create','task_create','task_skip','contact_create','personalize','intent'].includes(r.operation))r.status='Uncertain';
  if(state.operations)delete state.operations.lease;delete state.runtime;
  for(const r of Object.values(state.prospects??{})){const v=r.requested_information;if(v?.draft?.status==='Approved'){if(v.history.length<100)v.history.push(structuredClone(v.draft));v.draft={...v.draft,status:'Draft'};delete v.draft.approval_event;delete v.draft.approved_by;delete v.draft.approved_at;}}
  if(state.cloud_discovery){
   state.cloud_discovery.paused=true;state.cloud_discovery.epoch++;
  }
  if(state.native_notifications){const n=state.native_notifications;check(Number.isSafeInteger(n.epoch)&&n.epoch<Number.MAX_SAFE_INTEGER,'Invalid native notification recovery epoch');n.epoch++;n.paused=true;n.allowance=null;for(const sub of Object.values(n.subscriptions??{})){check(Number.isSafeInteger(sub.revision)&&sub.revision<Number.MAX_SAFE_INTEGER,'Invalid native subscription recovery revision');sub.active=false;sub.revision++;}for(const a of Object.values(n.attempts??{}))if(a.status==='Claimed'){a.status='Uncertain';a.next_at=null;}}
  // Retain permanent dispatch claims and exact MIME for readback, never carry pre-restore send approval.
  if(state.mailbox_delivery){
   state.mailbox_delivery.paused=true;
   check(Number.isSafeInteger(state.mailbox_delivery.epoch)&&state.mailbox_delivery.epoch<Number.MAX_SAFE_INTEGER,'Invalid delivery recovery epoch');state.mailbox_delivery.epoch++;
   if(state.mailbox_delivery.schema_version===2)state.mailbox_delivery.allowance_id=null;
   for(const intent of Object.values(state.mailbox_delivery.intents??{}))if(intent.status==='Reserved'){intent.status='Held';intent.hold='Backup restored; original reservation cannot dispatch';}
  }
  // Retained charges and leases remain evidence; a restored allowance can never resume them.
  if(state.mailbox_work){const n=state.mailbox_work;check(n.schema_version===2&&Number.isSafeInteger(n.epoch)&&n.epoch<Number.MAX_SAFE_INTEGER,'Invalid worker recovery epoch');n.paused=true;n.epoch++;n.allowance_id=null;}
  for(const task of Object.values(state.email_draft_tasks??{}))if(task.status==='Ready'||task.status==='Review'&&!state.mailbox_work){task.status='Superseded';if(task.schema_version===2){task.reason='Backup restored; prepare a new task after reviewing current sources';task.closed_at=new Date().toISOString();}else task.closure_reason='Backup restored; prepare a new task after reviewing current sources';}
  await writeFile(join(destination,'lifecycle-config.json'),JSON.stringify({...initialConfig,run_id:state.run_id,mode:state.mode}),{flag:'wx',mode:0o600,flush:true});
  // Publish state last: interrupted directories cannot be opened as a workspace.
  const temporary=join(destination,'.state.pending');await writeFile(temporary,JSON.stringify(state),{flag:'wx',mode:0o600,flush:true});await link(temporary,join(destination,'lifecycle-state.json'));published=true;await unlink(temporary);
 }catch(error){if(!published)await removeOwned(destination,identity);throw error;}
 return {execution:'disabled',prospects:Object.keys(state.prospects).length,audio_clips,project_files:files.size-audio_clips,trusted_runtime:'Rebind the installed trusted renderer before new rendering. Local Python needs Python/Poppler/assets; Node uses retained hash-verified portable resources and pinned dependencies.'};
}
