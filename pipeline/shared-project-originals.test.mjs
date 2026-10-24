import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {StudioLifecycle} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {projectContext} from './project-work.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {originalManifest,blobProjectOriginalStore,reserveSharedOriginal,uploadSharedOriginalChunk,completeSharedOriginal,sharedOriginalManifest,originalChunkRequest} from './shared-project-originals.mjs';
import {connectSharedOriginals} from './shared-originals-client.mjs';
const at='2026-10-24T17:00:00.000Z',origin='https://preview.example.invalid',env={CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_SHARED_ORIGINALS:'fictional-chunks-v1',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-originals-123',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)},ids={project_id:'shared-proof',asset_id:'pdf',version_id:'v1'},source={reference:'private-path:fictional/original.pdf',name:'Fictional original.pdf',mime_type:'application/pdf',modified_time:at,account:null},small=Buffer.from('%PDF-1.7\nFictional original\n%%EOF');
export function memoryBlobs(){const entries=new Map();let serial=0;return {entries,loseNext:false,async getWithMetadata(key,{type,consistency}){assert.equal(consistency,'strong');const value=entries.get(key);if(!value)return null;return {data:type==='json'?JSON.parse(value.bytes):Buffer.from(value.bytes),etag:value.etag};},async set(key,value,{onlyIfNew,onlyIfMatch}={}){const prior=entries.get(key);if(onlyIfNew&&prior||onlyIfMatch&&prior?.etag!==onlyIfMatch)return {modified:false};const etag='"'+(++serial)+'"';entries.set(key,{bytes:Buffer.from(value),etag});if(this.loseNext){this.loseNext=false;throw Error('Lost acknowledgement');}return {modified:true,etag};},async setJSON(key,value,options){return this.set(key,JSON.stringify(value),options);}};}
async function fixture(t,{settings=env}={}){
 const raw=memoryBlobs(),handler=createHostedDesk({env:settings,storeFactory:()=>raw,now:()=>new Date(at)}),fetcher=async(url,options)=>handler(new Request(url,options)),client=await connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_OWNER_KEY,fetcher});
 await client.context('shared-proof');const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{maxBytes:2_000_000}),now:()=>new Date(at)});
 await app.apply({id:'pdf-registered',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:'pdf',scope:'project',project_id:'shared-proof',kind:'mockup',name:'Fictional PDF',version_id:'v1',version_label:'v1',reference:source.reference}},{actor:'owner'});
 const input=async(bytes=small)=>({...ids,manifest:originalManifest(bytes),source,context_sha256:projectContext(await app.snapshot(),ids.project_id).context_sha256});
 return {raw,handler,fetcher,client,app,store:blobProjectOriginalStore(raw),input};
}
test('whole original is unavailable until every immutable chunk and final hash are verified',async t=>{
 const f=await fixture(t),input=await f.input(),transfer=await reserveSharedOriginal(f.app,input,'owner'),exact={...ids,transfer_id:transfer.id};
 await assert.rejects(sharedOriginalManifest(f.app,f.store,ids),/not verified/);await assert.rejects(completeSharedOriginal(f.app,f.store,exact,'owner'),/missing/);
 await assert.rejects(uploadSharedOriginalChunk(f.app,f.store,exact,0,Buffer.from('wrong')),/differs/);
 await assert.rejects(blobProjectOriginalStore({async getWithMetadata(){throw Error('Private upstream detail');}}).manifest({sha256:input.manifest.sha256}),/Shared original storage is unavailable/);
 f.raw.loseNext=true;await uploadSharedOriginalChunk(f.app,f.store,exact,0,small);await uploadSharedOriginalChunk(f.app,f.store,exact,0,small);
 await completeSharedOriginal(f.app,f.store,exact,'friend');const revision=(await f.app.snapshot()).revision;
 await completeSharedOriginal(f.app,f.store,exact,'owner');assert.equal((await f.app.snapshot()).revision,revision);
 assert.deepEqual((await sharedOriginalManifest(f.app,f.store,ids)).manifest,input.manifest);f.app.originalStore=f.store;assert.deepEqual((await readProjectAsset(f.app,ids.project_id,'pdf','v1')).bytes,small);assert.equal((await f.app.snapshot()).asset_index.pdf.baseline_version,null);
 const key=[...f.raw.entries.keys()].find(k=>k.includes('/0-'));f.raw.entries.get(key).bytes[0]^=1;await assert.rejects(readProjectAsset(f.app,ids.project_id,'pdf','v1'),/integrity/);
});
test('reservation binds source, scope, exact hashes and context and retains a held stale transfer',async t=>{
 const f=await fixture(t),input=await f.input();
 await assert.rejects(reserveSharedOriginal(f.app,{...input,source:{...source,reference:'private-path:other'}},'owner'),/source/);
 await assert.rejects(reserveSharedOriginal(f.app,{...input,project_id:'other'},'owner'),/project/);
 await assert.rejects(reserveSharedOriginal(f.app,{...input,manifest:{...input.manifest,bytes:64_000_001}},'owner'),/manifest/);
 await assert.rejects(reserveSharedOriginal(f.app,input,'unsigned'),/signed/);
 const transfer=await reserveSharedOriginal(f.app,input,'owner'),exact={...ids,transfer_id:transfer.id};await uploadSharedOriginalChunk(f.app,f.store,exact,0,small);
 await f.app.apply({id:'context-note',prospect_id:'shared-proof',type:'note_added',at,data:{note:'Fresh context requires a new explicit reservation.'}},{actor:'friend'});
 await assert.rejects(completeSharedOriginal(f.app,f.store,exact,'owner'),/context changed/);await assert.rejects(uploadSharedOriginalChunk(f.app,f.store,exact,0,small),/context changed/);
 await reserveSharedOriginal(f.app,await f.input(),'friend');await completeSharedOriginal(f.app,f.store,exact,'friend');
 assert.equal((await f.app.snapshot()).asset_index.pdf.versions.v1.verified_original.verified_by,'friend');
 await assert.rejects(reserveSharedOriginal(f.app,{...await f.input(),manifest:originalManifest(Buffer.from('%PDF-changed'))},'owner'),/different original/);
});
test('wrong final whole-file hash, missing middle chunk and a competing version never publish verified bytes',async t=>{
 const f=await fixture(t),bytes=Buffer.alloc(2_100_000,32);small.copy(bytes);const input=await f.input(bytes),wrong={...input,manifest:{...input.manifest,sha256:'1'.repeat(64)}},transfer=await reserveSharedOriginal(f.app,wrong,'owner'),exact={...ids,transfer_id:transfer.id};
 for(const index of [0,2])await uploadSharedOriginalChunk(f.app,f.store,exact,index,bytes.subarray(index*1_000_000,(index+1)*1_000_000));
 await assert.rejects(completeSharedOriginal(f.app,f.store,exact,'owner'),/missing/);await uploadSharedOriginalChunk(f.app,f.store,exact,1,bytes.subarray(1_000_000,2_000_000));await assert.rejects(completeSharedOriginal(f.app,f.store,exact,'owner'),/whole-file/);assert.equal((await f.app.snapshot()).asset_index.pdf.versions.v1.verified_original,undefined);
 await assert.rejects(reserveSharedOriginal(f.app,input,'friend'),/different reserved/);
});
test('concurrent operators reserve one exact manifest through CAS and preserve immutable chunks',async t=>{
 const f=await fixture(t),input=await f.input(),other=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(f.raw),now:()=>new Date(at)}),results=await Promise.allSettled([reserveSharedOriginal(f.app,input,'owner'),reserveSharedOriginal(other,input,'friend')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'STATE_CONFLICT');const transfer=await reserveSharedOriginal(other,input,'friend'),exact={...ids,transfer_id:transfer.id};
 await Promise.all([uploadSharedOriginalChunk(f.app,f.store,exact,0,small),uploadSharedOriginalChunk(other,f.store,exact,0,small)]);await completeSharedOriginal(f.app,f.store,exact,'owner');assert.equal((await f.app.snapshot()).revision,4);
});
test('completion rechecks context after storage and reconciles a lost state acknowledgement without a second event',async t=>{
 const f=await fixture(t),transfer=await reserveSharedOriginal(f.app,await f.input(),'owner'),exact={...ids,transfer_id:transfer.id};await uploadSharedOriginalChunk(f.app,f.store,exact,0,small);
 const racing={...f.store,async publish(m){await f.store.publish(m);await f.app.apply({id:'late-note',prospect_id:'shared-proof',type:'note_added',at,data:{note:'A concurrent operator changed the context while bytes were checked.'}},{actor:'friend'});}};
 await assert.rejects(completeSharedOriginal(f.app,racing,exact,'owner'),/context changed/);await assert.rejects(sharedOriginalManifest(f.app,f.store,ids),/not verified/);
 await reserveSharedOriginal(f.app,await f.input(),'owner');f.raw.loseNext=true;await assert.rejects(completeSharedOriginal(f.app,f.store,exact,'owner'),{code:'STATE_UNCERTAIN'});
 await completeSharedOriginal(f.app,f.store,exact,'friend');assert.equal(Object.values((await f.app.snapshot()).events).filter(e=>e.type==='asset_original_archived').length,1);
});
test('HTTP routes keep disabled/production, unauthenticated, CSRF, guessed version and oversized payloads closed',async t=>{
 const f=await fixture(t),route=origin+'/desk/api/project-original/shared-proof/pdf/v1';
 assert.equal((await f.handler(new Request(route))).status,401);
 const bootstrap=await f.handler(new Request(origin+'/desk/api/bootstrap')),cookie=bootstrap.headers.get('set-cookie').split(';')[0];
 assert.equal((await f.handler(new Request(route+'/reserve',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'}))).status,403);
 await assert.rejects(f.client.download({...ids,version_id:'guessed'}),/registered/);
 const bootstrapToken=(await bootstrap.json()).csrf,login=await f.handler(new Request(origin+'/desk/api/login',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':bootstrapToken},body:JSON.stringify({key:env.EVZ_OPERATIONS_OWNER_KEY})})),signedCookie=cookie+'; '+login.headers.get('set-cookie').split(';')[0],headers={cookie:signedCookie,'x-studio-token':bootstrapToken,'content-type':'application/octet-stream',origin};
 assert.equal((await f.handler(new Request(route+'/chunk/0',{method:'POST',headers:{...headers,'x-studio-token':'wrong'},body:small}))).status,403);
 assert.equal((await f.handler(new Request(route,{headers:{...headers,origin:'https://evil.invalid'}}))).status,403);
 let touched=false;const disabledSigned=createHostedDesk({env:{...env,EVZ_OPERATIONS_SHARED_ORIGINALS:''},now:()=>new Date(at),storeFactory:()=>{touched=true;throw Error('Must not touch storage');}});assert.equal((await disabledSigned(new Request(route,{headers}))).status,503);assert.equal(touched,false);
 await f.client.upload(ids,small,source);const key=[...f.raw.entries.keys()].find(k=>k.includes('/0-')),saved=f.raw.entries.get(key);saved.bytes[0]^=1;await assert.rejects(f.client.download(ids),/integrity/);

 for(const settings of [{...env,EVZ_OPERATIONS_SHARED_ORIGINALS:''},{...env,CONTEXT:'production'}]){const disabled=createHostedDesk({env:settings,storeFactory:()=>{throw Error('Must not open');}});assert.ok([400,401,503].includes((await disabled(new Request(route))).status));}
 await assert.rejects(originalChunkRequest(new Request(origin,{method:'POST',headers:{'content-type':'application/octet-stream'},body:Buffer.alloc(1_000_001)})),/exceeds/);
});
test('real local HTTP owner upload and fresh friend download materialize a 30,591,178-byte fictional PDF for the existing reader and backup',async t=>{
 const f=await fixture(t),requests=[],server=createServer(async(req,res)=>{try{const headers={...req.headers};delete headers.host;const response=await f.handler(new Request(origin+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:req,duplex:'half'})}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));requests.push({method:req.method,path:req.url,status:response.status});}catch(error){res.writeHead(500);res.end(error.message);}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const fetcher=(url,options)=>fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname+new URL(url).search,options),owner=await connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_OWNER_KEY,fetcher}),bytes=Buffer.alloc(30_591_178,32);small.copy(bytes);Buffer.from('\n%%EOF\n').copy(bytes,bytes.length-7);
 await owner.upload(ids,bytes,source);const friend=await connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_FRIEND_KEY,fetcher}),resolved=await friend.resolve('STUDIO TEST Shared project');assert.equal(resolved.project_id,'shared-proof');const downloaded=await friend.download(ids);assert.deepEqual(downloaded.bytes,bytes);
 const directory=await mkdtemp(join(tmpdir(),'evz-shared-original-'));t.after(()=>rm(directory,{recursive:true,force:true}));const local=await StudioLifecycle.initialize({directory,config:JSON.parse(f.raw.entries.get('workspace').bytes).config,now:()=>new Date(at)});
 await local.change(state=>Object.assign(state,structuredClone(f.raw.entries.has('workspace')?JSON.parse(f.raw.entries.get('workspace').bytes).state:{})));
 await friend.materialize(local,ids);assert.deepEqual((await readProjectAsset(local,ids.project_id,'pdf','v1')).bytes,bytes);
 const backup=join(directory,'portable.json');await local.backup(backup);await StudioLifecycle.restore({input:backup,destination:join(directory,'restored')});assert.deepEqual((await readProjectAsset(await StudioLifecycle.open({directory:join(directory,'restored')}),ids.project_id,'pdf','v1')).bytes,bytes);
 assert.equal(requests.filter(r=>r.method==='POST'&&r.path.includes('/chunk/')&&r.status===200).length,31);assert.equal((await f.app.snapshot()).asset_index.pdf.baseline_version,null);
});
