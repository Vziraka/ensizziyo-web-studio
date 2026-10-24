import {check} from './lifecycle.mjs';
import {originalManifest,originalDigest,originalChunkSize} from './shared-project-originals.mjs';
import {projectAssetVersion,storeProjectPDF,readProjectAsset} from './project-assets.mjs';
const key=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)&&value!=='__proto__';
const pathFor=ids=>{check([ids.project_id,ids.asset_id,ids.version_id].every(key),'Choose exact registered project/asset/version IDs');return '/api/project-original/'+[ids.project_id,ids.asset_id,ids.version_id].join('/');};
export async function boundedSharedResponse(response,limit){
 check(response.body,'Shared original response is empty');const reader=response.body.getReader(),chunks=[];let total=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;check(total<=limit,'Shared original response exceeds its bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}return Buffer.concat(chunks);
}
const bounded=boundedSharedResponse;
export async function sharedDeskSession({origin,key:operatorKey,fetcher=fetch}={}){
 const url=new URL(origin);check(url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password,'Choose the exact HTTPS shared desk origin');
 check(typeof operatorKey==='string'&&/^[A-Za-z0-9_-]{43,}$/.test(operatorKey),'Supply your separately provisioned operator key');
 let cookie='',csrf;
 async function request(path,{method='GET',body,binary=false,headers={}}={}){
  const response=await fetcher(origin+'/desk'+path,{method,redirect:'error',signal:AbortSignal.timeout(60_000),headers:{origin,...(cookie?{cookie}:{}),...(method==='POST'?{'x-studio-token':csrf,'content-type':binary?'application/octet-stream':'application/json'}:{}),...headers},...(body===undefined?{}:{body:binary?body:JSON.stringify(body)})});
  const set=response.headers.get('set-cookie');if(set)cookie=[cookie,set.split(';')[0]].filter(Boolean).join('; ');
  if(!response.ok){let error;try{error=JSON.parse((await bounded(response,120_000)).toString()).error;}catch{}throw Error(error??'Authenticated shared original request failed');}return response;
 }
 const json=async(path,options,limit=120_000)=>JSON.parse((await bounded(await request(path,options),limit)).toString());
 csrf=(await json('/api/bootstrap')).csrf;const session=await json('/api/login',{method:'POST',body:{key:operatorKey}});check(['owner','friend'].includes(session.operator),'Shared operator authentication failed');
 return {operator:session.operator,request,json};
}
export async function connectSharedOriginals(options={}){
 const session=await sharedDeskSession(options),{json,request}=session;
 return {
  operator:session.operator,
  async resolve(name){check(typeof name==='string'&&name.length<=250,'Supply the exact company name');return json('/api/project-resolve?name='+encodeURIComponent(name));},
  async context(project){check(key(project),'Choose an existing project');return json('/api/project-context/'+project);},
  async readDriveOriginal(ids){
   const context=await this.context(ids.project_id);return json(pathFor(ids)+'/drive-read',{method:'POST',body:{context_sha256:context.context_sha256}});
  },
  async upload(ids,bytes,source){
   const path=pathFor(ids),manifest=originalManifest(bytes),context=await this.context(ids.project_id),transfer=await json(path+'/reserve',{method:'POST',body:{manifest,source,context_sha256:context.context_sha256}});
   for(let index=0;index<manifest.chunks.length;index++)await json(path+'/chunk/'+index,{method:'POST',binary:true,headers:{'x-studio-transfer':transfer.id},body:bytes.subarray(index*originalChunkSize,(index+1)*originalChunkSize)});
   const original=await json(path+'/complete',{method:'POST',body:{transfer_id:transfer.id}});check(original.sha256===manifest.sha256&&original.bytes===bytes.length,'Shared original completion differs from the selected bytes');return original;
  },
  async download(ids){
   const path=pathFor(ids),packet=await json(path),m=packet.manifest,original=packet.original;
   check(m?.format==='project-original-chunks-v1'&&m.chunk_size===originalChunkSize&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=64_000_000&&Array.isArray(m.chunks)&&m.chunks.length===Math.ceil(m.bytes/originalChunkSize)&&m.chunks.every(sha=>/^[a-f0-9]{64}$/.test(sha))&&m.sha256===original.sha256&&m.bytes===original.bytes,'Shared original manifest is invalid');
   const chunks=[];for(let index=0;index<m.chunks.length;index++){const response=await request(path+'/chunk/'+index),bytes=await bounded(response,originalChunkSize);check(bytes.length===Math.min(originalChunkSize,m.bytes-index*originalChunkSize)&&originalDigest(bytes)===m.chunks[index]&&response.headers.get('x-content-sha256')===m.chunks[index],'Shared original chunk integrity changed');chunks.push(bytes);}
   const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256&&bytes.subarray(0,5).toString()==='%PDF-','Shared whole-file integrity changed');return {bytes,original};
  },
  async uploadLocal(app,ids){const {bytes,original}=await readProjectAsset(app,ids.project_id,ids.asset_id,ids.version_id);const source=Object.fromEntries(['reference','name','mime_type','modified_time','account'].map(k=>[k,original[k]??null]));return this.upload(ids,bytes,source);},
  async materialize(app,ids){
   const downloaded=await this.download(ids),version=projectAssetVersion(await app.snapshot(),ids.project_id,ids.asset_id,ids.version_id),local=version.verified_original;
   check(local&&version.reference===downloaded.original.reference&&local.reference===version.reference&&local.sha256===downloaded.original.sha256&&local.bytes===downloaded.original.bytes,'Local version must retain the same verified original; recover its project records separately');
   await storeProjectPDF(app,downloaded.bytes);return readProjectAsset(app,ids.project_id,ids.asset_id,ids.version_id);
  }
 };
}
