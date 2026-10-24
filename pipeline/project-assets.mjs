import {mkdir,lstat,realpath,open} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {check} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';

const maxBytes=64_000_000,sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const key=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)&&value!=='__proto__';
function versionFor(state,project,assetId,versionId){
 check([project,assetId,versionId].every(key)&&Object.hasOwn(state.prospects,project),'Choose an existing project and version');
 const asset=Object.hasOwn(state.asset_index??{},assetId)?state.asset_index[assetId]:null;
 check(asset&&(asset.scope==='studio'||asset.scope==='project'&&asset.project_id===project),'Asset is outside this project scope');
 check(Object.hasOwn(asset.versions,versionId),'Choose a registered asset version');return asset.versions[versionId];
}
async function archivePath(app,sha,{create=false}={}){
 check(typeof app.directory==='string'&&/^[a-f0-9]{64}$/.test(sha),'Local original archive is unavailable');
 const root=join(app.directory,'project-originals');if(create)await mkdir(root,{mode:0o700});
 const stat=await lstat(root);check(stat.isDirectory()&&!stat.isSymbolicLink()&&await realpath(root)===join(await realpath(app.directory),'project-originals'),'Unsafe original archive path');
 return join(root,sha+'.pdf');
}
async function readOriginal(path,size,sha){
 const stat=await lstat(path);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size===size&&size>0&&size<=maxBytes,'Original integrity or size changed');
 const file=await open(path,'r');try{
  const actual=await file.stat();check(actual.isFile()&&actual.size===size,'Original size changed');
  const buffer=Buffer.alloc(size+1);let length=0;
  for(;;){const {bytesRead}=await file.read(buffer,length,buffer.length-length);length+=bytesRead;check(length<=size,'Original size changed');if(!bytesRead)break;}
  const bytes=buffer.subarray(0,length);check(length===size&&sha256(bytes)===sha,'Original hash changed; recover the exact original again');return bytes;
 }finally{await file.close();}
}
export async function readProjectAsset(app,project,assetId,versionId){
 const version=versionFor(await app.snapshot(),project,assetId,versionId),original=version.verified_original;
 check(original&&original.reference===version.reference,'Original is not archived; recover this exact version first');
 const path=await archivePath(app,original.sha256);return {bytes:await readOriginal(path,original.bytes,original.sha256),path,filename:original.sha256+'.pdf',original};
}
export async function archiveProjectAsset(app,input,bytes,source,actor){
 check(['owner','friend'].includes(actor),'Original recovery needs a signed operator');
 const state=await app.snapshot(),version=versionFor(state,input.project_id,input.asset_id,input.version_id);
 check(projectContext(state,input.project_id).context_sha256===input.context_sha256,'Project context changed; reload before recovering');
 check(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=maxBytes,'Original size exceeds the 64MB archive limit');
 check(sha256(bytes)===input.expected_sha256,'Original hash does not match the exact expected source');
 check(source.reference===version.reference&&typeof source.name==='string'&&source.name.length<=200&&source.mime_type==='application/pdf'&&bytes.subarray(0,5).toString()==='%PDF-','Original source or PDF type does not match this version');
 check(typeof source.modified_time==='string'&&Number.isFinite(Date.parse(source.modified_time))&&(!source.account||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(source.account)),'Original source metadata is incomplete');
 const sha=input.expected_sha256,path=await archivePath(app,sha,{create:true}).catch(async error=>{if(error.code==='EEXIST')return archivePath(app,sha);throw error;});
 let file;try{file=await open(path,'wx',0o600);await file.writeFile(bytes);}catch(error){if(error.code!=='EEXIST')throw error;}finally{await file?.close();}
 await readOriginal(path,bytes.length,sha);
 const original={reference:version.reference,source_id:version.reference.split(':').slice(1).join(':'),name:source.name,mime_type:'application/pdf',modified_time:source.modified_time,account:source.account??null,sha256:sha,bytes:bytes.length,verified_at:app.now().toISOString(),verified_by:actor};
 await app.change(current=>{
  check(projectContext(current,input.project_id).context_sha256===input.context_sha256,'Project context changed; reload before recovering');
  const target=versionFor(current,input.project_id,input.asset_id,input.version_id);
  check(!target.verified_original||target.verified_original.sha256===sha,'This version already has different original bytes; register a new version');
  check(Object.keys(current.events).length<20_000,'Event limit reached; archive closed records before recovery');
  target.verified_original=original;
  const id='asset-original-'+sha.slice(0,20)+'-'+current.revision;
  current.events[id]={id,type:'asset_original_archived',prospect_id:input.project_id,actor,at:original.verified_at,data:{asset_id:input.asset_id,version_id:input.version_id,original}};
  current.revision++;current.updated_at=original.verified_at;
  return original;
 });return original;
}
function payload(result){check(result&&!result.isError&&result.structuredContent,'Drive read failed; check the selected business account');return result.structuredContent;}
export async function downloadOriginal(value,size,{fetcher=fetch}={}){
 let url;try{url=new URL(value);}catch{throw Error('Invalid authenticated original stream');}
 check(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.hostname.endsWith('.oaiusercontent.com'),'Unsupported authenticated original stream');
 check(Number.isSafeInteger(size)&&size>0&&size<=maxBytes,'Original size exceeds the archive limit');
 let response;try{response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(120_000)});}catch{throw Error('Original download failed; fetch a fresh authenticated reference');}
 check(response.ok&&response.body,'Original download failed');
 const chunks=[];let total=0;const reader=response.body.getReader();
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;check(total<=size,'Original stream size changed');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 check(total===size,'Original stream size changed');return Buffer.concat(chunks);
}
export async function recoverDriveAsset(app,input,{connector,email,actor='owner',download=downloadOriginal}={}){
 check(connector?.accountLinks?.google_drive&&typeof email==='string'&&email.includes('@'),'Select the authorized business account explicitly');
 const state=await app.snapshot(),version=versionFor(state,input.project_id,input.asset_id,input.version_id);
 check(/^[a-f0-9]{64}$/.test(input.expected_sha256??''),'Use the retained original SHA-256 before a Drive read');
 check(projectContext(state,input.project_id).context_sha256===input.context_sha256,'Project context changed; reload before recovering');
 check(/^drive:[a-zA-Z0-9_-]{10,256}$/.test(version.reference),'This version needs an exact Drive file reference');
 const profile=payload(await connector.call('mcp__codex_apps__google_drive_get_profile',{}));
 check(profile.email?.toLowerCase()===email.toLowerCase(),'Drive business account does not match; no file read');
 const id=version.reference.slice(6),metadata=payload(await connector.call('mcp__codex_apps__google_drive_get_file_metadata',{fileId:id}));
 check(metadata.id===id&&metadata.mime_type==='application/pdf','Expected Drive PDF is unavailable');
 check(Number.isSafeInteger(Number(metadata.size))&&Number(metadata.size)>0&&Number(metadata.size)<=maxBytes,'Original size exceeds the 64MB archive limit');
 const raw=payload(await connector.call('mcp__codex_apps__google_drive_fetch',{url:`https://drive.google.com/file/d/${id}/view`,download_raw_file:true,include_base64:false}));
 check(raw.id===id&&Number(raw.file_size_bytes)===Number(metadata.size),'Drive original size or identity changed');
 const bytes=await download(raw.file_uri?.download_url,Number(metadata.size));
 return archiveProjectAsset(app,input,bytes,{reference:version.reference,name:metadata.title,mime_type:metadata.mime_type,modified_time:metadata.modified_time,account:email},actor);
}
