import {check,hash} from './lifecycle.mjs';
import {sharedDeskSession,boundedSharedResponse} from './shared-originals-client.mjs';
import {authoringManifest} from './hosted-authoring.mjs';
import {originalDigest,originalChunkSize} from './shared-project-originals.mjs';
import {writePortableLifecycleBackup} from './lifecycle-backup.mjs';

// Interactive signed caller only: no model, rasterizer, background worker or automatic effect retry.
export async function connectSharedAuthoring(options={}){
 const session=await sharedDeskSession(options),{operator,request}=session,base='/api/project-author/';
 const json=(path,options)=>session.json(path,options,4_500_000);
 const idOK=id=>check(typeof id==='string'&&/^author-[a-f0-9]{32}$/.test(id),'Choose an exact current authoring job');
 const path=(id,name)=>{idOK(id);check(/^[a-z0-9.-]{1,90}$/.test(name),'Choose a retained sidecar name');return base+id+'/file/'+name;};
 const command=(operation,input)=>json(base+operation,{method:'POST',body:input});
 async function upload(id,name,bytes){
  const p=path(id,name),manifest=authoringManifest(bytes),reserved=await json(p+'/reserve',{method:'POST',body:{manifest}});check(hash(reserved)===hash(manifest),'Reserved authoring transfer differs');
  for(let i=0;i<manifest.chunks.length;i++)await json(p+'/chunk/'+i,{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes.subarray(i*originalChunkSize,(i+1)*originalChunkSize)});
  const saved=await json(p+'/complete',{method:'POST',body:{transfer_id:hash(manifest)}});check(hash(saved)===hash(manifest),'Authoring transfer completion differs');return saved;
 }
 return {
  operator,
  begin:(name,kind)=>command('begin',{name,kind}),
  inspect:job_id=>command('inspect',{job_id}),
  resume:job_id=>command('resume',{job_id}),
  revise:(job_id,reason)=>command('revise',{job_id,reason}),
  recovery:job_id=>command('recovery',{job_id}),
  reconcile:(job_id,input)=>command('reconcile',{job_id,...input}),
  async render(job_id,source,runtime){
   await upload(job_id,'input.json',Buffer.from(JSON.stringify(source,null,2)));await upload(job_id,'runtime.json',Buffer.from(JSON.stringify(runtime,null,2)));return command('render',{job_id});
  },
  async download(job_id,name){
   const p=path(job_id,name),m=await json(p);check(m?.format==='authoring-chunks-v1'&&m.chunk_size===originalChunkSize&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=64_000_000&&Array.isArray(m.chunks)&&m.chunks.length===Math.ceil(m.bytes/originalChunkSize)&&m.chunks.every(s=>/^[a-f0-9]{64}$/.test(s)),'Invalid authoring file manifest');
   const chunks=[];for(let i=0;i<m.chunks.length;i++){const response=await request(p+'/chunk/'+i),bytes=await boundedSharedResponse(response,originalChunkSize);check(bytes.length===Math.min(originalChunkSize,m.bytes-i*originalChunkSize)&&originalDigest(bytes)===m.chunks[i]&&response.headers.get('x-content-sha256')===m.chunks[i],'Authoring download chunk changed');chunks.push(bytes);}
   const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256,'Authoring file changed');return bytes;
  },
  async rasters(job_id,{pdf_sha256,rasterizer,pages}){check(Array.isArray(pages)&&pages.length>0&&pages.length<=16,'Supply every actual reviewed PDF raster');for(const [i,bytes] of pages.entries())await upload(job_id,`review-page-${i+1}.png`,bytes);return command('rasters',{job_id,pdf_sha256,rasterizer});},
  complete:(job_id,review)=>command('complete',{job_id,review}),
  async backup(output){
   const wire=await json(base+'backup'),bundle={...wire};
   if(wire.body_manifest){const m=wire.body_manifest;check(m.format==='authoring-chunks-v1'&&m.bytes>0&&m.bytes<=20_000_000&&m.chunk_size===originalChunkSize&&m.chunks.length===Math.ceil(m.bytes/originalChunkSize),'Invalid state backup manifest');const chunks=[];for(let chunk=0;chunk<m.chunks.length;chunk++){const response=await request(base+`backup/state-chunk?snapshot=${hash(wire)}&chunk=${chunk}`),bytes=await boundedSharedResponse(response,originalChunkSize);check(bytes.length===Math.min(originalChunkSize,m.bytes-chunk*originalChunkSize)&&originalDigest(bytes)===m.chunks[chunk]&&response.headers.get('x-content-sha256')===m.chunks[chunk],'State backup chunk changed');chunks.push(bytes);}const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===m.sha256,'State backup changed');bundle.body=bytes.toString('utf8');}
   check(bundle.schema_version===2&&typeof bundle.body==='string'&&hash(bundle.body)===bundle.sha256&&Array.isArray(bundle.files)&&bundle.files.length<=6000&&hash(bundle.files)===bundle.files_sha256,'Invalid hosted backup manifest');
   const files=new Map();let total=0;
   for(const [index,entry] of bundle.files.entries()){
    check(typeof entry.path==='string'&&!files.has(entry.path)&&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&entry.bytes<=64_000_000&&/^[a-f0-9]{64}$/.test(entry.sha256),'Invalid bounded backup dependency');total+=entry.bytes;check(total<=512_000_000,'Backup exceeds the existing package limit');
    const chunks=[];for(let chunk=0;chunk<Math.ceil(entry.bytes/originalChunkSize);chunk++){const response=await request(base+`backup/chunk?snapshot=${hash(wire)}&file=${index}&chunk=${chunk}`),bytes=await boundedSharedResponse(response,originalChunkSize);check(bytes.length===Math.min(originalChunkSize,entry.bytes-chunk*originalChunkSize)&&originalDigest(bytes)===response.headers.get('x-content-sha256'),'Backup chunk changed');chunks.push(bytes);}
    const bytes=Buffer.concat(chunks);check(originalDigest(bytes)===entry.sha256,'Backup dependency changed');files.set(entry.path,bytes);
   }
   return writePortableLifecycleBackup(JSON.parse(bundle.body),files,output,bundle.created_at);
  }
 };
}
