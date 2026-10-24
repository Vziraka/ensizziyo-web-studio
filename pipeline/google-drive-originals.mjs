import {randomUUID} from 'node:crypto';
import {check,hash} from './lifecycle.mjs';
import {projectAssetVersion,projectOriginalLimit} from './project-assets.mjs';
import {projectContext} from './project-work.mjs';
import {originalChunkSize,originalBaseContext,reserveSharedOriginal,completeSharedOriginal} from './shared-project-originals.mjs';
import {driveOAuthProfile,driveOAuthScopes} from './google-oauth.mjs';

const safe=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(value);
const hold=message=>{const error=Error(message);error.driveHold=true;return error;};
function sourceFor(app,state,ids,env){
 check(env.EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS==='fictional-drive-read-v1'&&env.EVZ_OPERATIONS_SHARED_ORIGINALS==='fictional-chunks-v1'&&env.CONTEXT==='deploy-preview'&&env.EVZ_OPERATIONS_DESK_ENABLED==='fictional-preview','Hosted Drive original read is disabled');
 const config=app.config.google_drive_originals,version=projectAssetVersion(state,ids.project_id,ids.asset_id,ids.version_id);
 check(config?.account==='ensizziyo@evzdigital.studio'&&safe(config.grant_id)&&Array.isArray(config.sources)&&config.sources.length>0&&config.sources.length<=64,'Exact business Drive read policy is unavailable');
 const matches=config.sources.filter(s=>s?.project_id===ids.project_id&&s.asset_id===ids.asset_id&&s.version_id===ids.version_id);
 check(matches.length===1,'Choose an exact allowed registered Drive original');const s=matches[0];
 check(Object.keys(s).every(k=>['project_id','asset_id','version_id','reference','name','mime_type','modified_time','drive_version','bytes','sha256','etag'].includes(k)),'Drive source policy accepts exact metadata only; keep keys and credentials in environment configuration');
 check(/^drive:[A-Za-z0-9_-]{10,256}$/.test(s.reference??'')&&version.reference===s.reference&&s.mime_type==='application/pdf'&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=200&&!/[\x00-\x1f\x7f]/.test(s.name)&&typeof s.modified_time==='string'&&s.modified_time.length<=50&&Number.isFinite(Date.parse(s.modified_time))&&/^[1-9][0-9]{0,24}$/.test(s.drive_version??'')&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=projectOriginalLimit&&/^[a-f0-9]{64}$/.test(s.sha256??'')&&(s.etag===undefined||typeof s.etag==='string'&&/^"[^"\x00-\x20\x7f]{1,200}"$/.test(s.etag))&&s.resource_key===undefined,'Exact registered PDF source/hash/size/version metadata is required');
 if(version.verified_original)check(version.verified_original.sha256===s.sha256&&version.verified_original.bytes===s.bytes,'Retain the registered original hash and size');
 if(version.original_transfer)check(version.original_transfer.manifest.sha256===s.sha256&&version.original_transfer.manifest.bytes===s.bytes,'A different original is already reserved');
 // Keys and resource keys never become caller-selected URLs or shared record fields.
 let keys={};try{keys=JSON.parse(env.EVZ_DRIVE_RESOURCE_KEYS??'{}');}catch{throw Error('Server Drive resource-key configuration is invalid');}
 check(keys&&typeof keys==='object'&&!Array.isArray(keys)&&Object.keys(keys).length<=64&&Object.entries(keys).every(([id,key])=>safe(id)&&safe(key)),'Server Drive resource-key configuration is invalid');
 const resourceKey=Object.hasOwn(keys,s.reference.slice(6))?keys[s.reference.slice(6)]:null;
 return {config,s,resourceKey,version,policy:hash({resourceKey,account:config.account,grant_id:config.grant_id,source:s,namespace:env.EVZ_OPERATIONS_BLOB_NAMESPACE,site:env.SITE_ID??null,deploy:env.DEPLOY_ID??null,origin:env.EVZ_OPERATIONS_ORIGIN})};
}
async function bounded(response,max){
 check(response.body,'Drive response is empty');const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw hold('Drive response exceeds the exact read bound; original remains incomplete');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}return Buffer.concat(chunks);
}
async function progress(app,key){
 const data=(await app.snapshot()).drive_original_reads?.[key];
 if(data)check(data.schema===1&&Array.isArray(data.chunks)&&data.chunks.length<=64&&data.chunks.every(s=>/^[a-f0-9]{64}$/.test(s)),'Drive transfer receipt is corrupt');
 return data?{data,etag:hash(data)}:null;
}
async function save(app,key,data,etag){
 try{await app.change(state=>{
  const receipts=state.drive_original_reads??={},prior=Object.hasOwn(receipts,key)?receipts[key]:null;
  check(etag?prior&&hash(prior)===etag:!prior,'Drive transfer changed; refresh its exact receipt');
  if(prior?.status==='Reading'&&['Ready','Verified'].includes(data.status))check(prior.lease_until>+app.now(),'Drive read claim expired; resume exact transfer');
  check(prior||Object.keys(receipts).length<64,'Drive transfer receipt limit reached; review incomplete originals');
  receipts[key]=data;state.revision++;state.updated_at=app.now().toISOString();
 });return {data,etag:hash(data)};}catch{throw Error('Drive transfer write is uncertain or changed; resume this exact original');}
}
const view=d=>({transfer_id:d.id,status:d.status,chunks_verified:d.chunks.length,chunks_total:Math.ceil(d.bytes/originalChunkSize),...(d.hold?{hold:d.hold}:{}),...(d.status==='Reading'?{resume_after:d.lease_until}:{}),...(d.status==='Verified'?{sha256:d.sha256,bytes:d.bytes}:{})});

// One explicit signed invocation reads at most one 1 MB range. Safe GETs may be
// reclaimed after the lease; immutable chunks and CAS prevent mixed progress.
export async function readDriveOriginalStep(app,store,ids,input,{env=process.env,actor,getAccessToken,fetcher=fetch,now=()=>Date.now()}={}){
 check(['owner','friend'].includes(actor),'Drive read needs a signed operator');
 check(input&&Object.keys(input).every(k=>k==='context_sha256')&&/^[a-f0-9]{64}$/.test(input.context_sha256??''),'Supply only the current registered project context');
 let state=await app.snapshot();const selected=sourceFor(app,state,ids,env),{config,s,resourceKey,policy}=selected,context=originalBaseContext(state,ids);
 check(projectContext(state,ids.project_id).context_sha256===input.context_sha256,'Project context changed; reload before reading Drive');
 const id=hash({policy,context}),key=id;let entry=await progress(app,key);
 if(entry){check(entry.data.id===id&&entry.data.policy===policy&&entry.data.context===context&&entry.data.sha256===s.sha256&&entry.data.bytes===s.bytes,'Drive receipt binding differs');if(entry.data.status==='Held')return view(entry.data);check(entry.data.status!=='Reading'||entry.data.lease_until<=now(),'Drive original read is already claimed; resume after its lease');}
 let token;try{token=await getAccessToken?.();}catch{throw Error('New business Drive grant unavailable; owner reauthorization required');}
 check(token?.profile===driveOAuthProfile&&token.account===config.account&&token.grant_id===config.grant_id&&Array.isArray(token.scopes)&&token.scopes.length===driveOAuthScopes.length&&new Set(token.scopes).size===token.scopes.length&&driveOAuthScopes.every(s=>token.scopes.includes(s))&&typeof token.access_token==='string'&&/^[\x21-\x7e]{10,8192}$/.test(token.access_token)&&token.expires_at>now()+45_000,'Exact independent Drive read-only grant/account required');
 entry=await save(app,key,{...(entry?.data??{schema:1,id,policy,context,sha256:s.sha256,bytes:s.bytes,chunks:[]}),status:'Reading',claimed_by:actor,claim:randomUUID(),lease_until:now()+45_000},entry?.etag);
 const signal=AbortSignal.timeout(40_000),file=s.reference.slice(6);
 async function request(path,headers={},max=16000){
  let response;try{response=await fetcher('https://www.googleapis.com/drive/v3/'+path,{method:'GET',headers:{Authorization:'Bearer '+token.access_token,...(resourceKey?{'X-Goog-Drive-Resource-Keys':file+'/'+resourceKey}:{}),...headers},redirect:'error',signal});}catch{throw Error('Drive read interrupted; resume this exact original');}
  if(!response.ok){await response.body?.cancel();if(response.status===401){try{await getAccessToken.invalidate?.(token);}catch{}}throw hold(response.status===401?'Drive authorization expired; new owner authorization required':response.status===403?'Drive download is forbidden; do not bypass file restrictions':'Drive source unavailable or changed; retain the exact registered version');}
  return {response,bytes:await bounded(response,max)};
 }
 async function metadata(){
  const {response,bytes}=await request('files/'+file+'?supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,version,sha256Checksum,trashed,capabilities(canDownload),shortcutDetails,resourceKey,downloadRestrictions');
  let m;try{m=JSON.parse(bytes);}catch{throw hold('Drive metadata is invalid; retain the exact registered original');}
  if(!(m&&typeof m==='object'&&!Array.isArray(m)&&m.id===file&&m.name===s.name&&m.mimeType==='application/pdf'&&!m.shortcutDetails&&m.trashed===false&&m.capabilities?.canDownload===true&&m.size===String(s.bytes)&&m.version===s.drive_version&&m.modifiedTime===s.modified_time&&(!m.sha256Checksum||m.sha256Checksum===s.sha256)))throw hold('Drive PDF metadata/version or download permission changed; register and review any new version separately');
  const etag=response.headers.get('etag');if(s.etag&&etag!==s.etag)throw hold('Drive ETag changed; retain the exact registered version');
  // Only selected identity fields are retained; provider URLs/resource keys are ignored.
  return hash({id:m.id,name:m.name,mime:m.mimeType,size:m.size,modified:m.modifiedTime,version:m.version,sha:m.sha256Checksum??null,etag,restrictions:m.downloadRestrictions??null});
 }
 function currentClaim(current){check(!signal.aborted,'Drive read deadline expired; retain exact transfer');const receipt=current.drive_original_reads?.[key];check(receipt?.claim===entry.data.claim&&receipt.status==='Reading'&&receipt.lease_until>now(),'Drive read claim expired or was superseded; retain exact transfer');}
 async function assertClaim(){currentClaim(await app.snapshot());}
 async function stillCurrent(){const current=await app.snapshot(),currentConfig=app.store?await app.store.config():app.config;check(sourceFor({config:currentConfig},current,ids,env).policy===policy&&originalBaseContext(current,ids)===context,'Project or source policy changed; resume with current context');return current;}
 try{
  const about=await request('about?fields=user(emailAddress)');let user;try{user=JSON.parse(about.bytes).user;}catch{}
  if(user?.emailAddress!==config.account)throw hold('Drive business account differs; no original bytes read');
  const before=await metadata();if(entry.data.metadata&&entry.data.metadata!==before)throw hold('Drive metadata or ETag drifted; retain the exact registered version');
  await stillCurrent();const total=Math.ceil(s.bytes/originalChunkSize),index=entry.data.chunks.length;
  if(index<total){
   const start=index*originalChunkSize,end=Math.min(s.bytes,start+originalChunkSize)-1,{response,bytes}=await request('files/'+file+'?alt=media&supportsAllDrives=true',{Range:`bytes=${start}-${end}`,'Accept-Encoding':'identity',...(s.etag?{'If-Match':s.etag}:{})},end-start+1);
   if(response.status!==206||response.headers.get('content-type')?.split(';')[0]!=='application/pdf'||response.headers.get('content-range')!==`bytes ${start}-${end}/${s.bytes}`||response.headers.get('content-length')!==String(end-start+1)||response.headers.get('content-encoding')&&!['identity'].includes(response.headers.get('content-encoding'))||bytes.length!==end-start+1||index===0&&bytes.subarray(0,5).toString()!=='%PDF-'||s.etag&&response.headers.get('etag')!==s.etag)throw hold('Drive exact PDF range/ETag differs; original remains incomplete');
   if(await metadata()!==before)throw hold('Drive version changed during the range read; original remains incomplete');
   await stillCurrent();await assertClaim();const sha=await store.stageChunk(s,index,bytes);
   entry=await save(app,key,{...entry.data,metadata:before,chunks:[...entry.data.chunks,sha],status:'Ready',lease_until:0},entry.etag);
   return view(entry.data);
  }
  // Existing D1 completion verifies every immutable chunk and the whole hash,
  // and alone publishes to the existing registered version/read authority.
  const current=await stillCurrent(),manifest={format:'project-original-chunks-v1',sha256:s.sha256,bytes:s.bytes,chunk_size:originalChunkSize,chunks:entry.data.chunks},source={reference:s.reference,name:s.name,mime_type:s.mime_type,modified_time:s.modified_time,account:config.account};
  const guarded=Object.create(app);guarded.change=(fn,options)=>app.change(current=>{currentClaim(current);return fn(current);},{...options,configFingerprint:hash(app.config)});
  const transfer=await reserveSharedOriginal(guarded,{...ids,context_sha256:projectContext(current,ids.project_id).context_sha256,manifest,source},actor);
  if(await metadata()!==before)throw hold('Drive version changed before publication; original remains incomplete');
  await completeSharedOriginal(guarded,{...store,async publish(manifest){if(await metadata()!==before)throw hold('Drive version changed before publication; original remains incomplete');await stillCurrent();await assertClaim();await store.publish(manifest);}},{...ids,transfer_id:transfer.id},actor);
  entry=await save(app,key,{...entry.data,status:'Verified',lease_until:0},entry.etag);return view(entry.data);
 }catch(error){
  if(/Original chunk is missing|Original chunk integrity changed|Original whole-file hash or PDF type differs/.test(error.message))error=hold('Stored original chunks or whole-file hash differ; keep this exact transfer held for recovery');
  if(error.driveHold){try{entry=await save(app,key,{...entry.data,status:'Held',hold:error.message,lease_until:0},entry.etag);}catch{}throw error;}
  // Interruption/uncertain writes keep a durable claim. A fresh explicit call
  // after expiry may repeat this read, never silently choose another version.
  throw Error('Drive original read interrupted or storage/context changed; refresh and resume the same exact original after its lease');
 }
}
