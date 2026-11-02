import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';
import {blobProjectOriginalStore,originalManifest} from './shared-project-originals.mjs';
import {replayOperationsPdfTransition} from './operations-pdf.mjs';
import {operationsPdfRecord,operationsPdfReserve,operationsPdfUploadChunk,operationsPdfComplete} from './operations-pdf-service.mjs';
const bytes=Buffer.from('%PDF-1.7\nfictional retained original\n%%EOF'),ids={project_id:'p',asset_id:'a',version_id:'v'},at='2026-11-01T14:00:00.000Z';
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'pdf-caller-'));t.after(()=>rm(dir,{recursive:true,force:true}));let time=Date.parse(at);const now=()=>new Date(time),local=await StudioLifecycle.initialize({directory:dir,now});await local.apply({id:'p',type:'workspace_project_created',prospect_id:'p',at,data:{name:'STUDIO TEST Business',purpose:'Existing PDFs',controlled:true}},{actor:'owner'});
 let data={config:{...local.config,shared_capability:'shared-operations-desk-v1',operations_pdf:{schema_version:1,mode:'registered-existing-pdfs',max_assets:64,max_versions_per_asset:16}},state:await local.snapshot()},version=0,commits=0;const controls={beforeWrite:null,beforeCommit:null},objects=new Map();
 const raw={getWithMetadata:async k=>objects.has(k)?{data:Uint8Array.from(objects.get(k)).buffer}:null,set:async(k,b,o)=>{await controls.beforeWrite?.(k);if(o.onlyIfNew&&objects.has(k))return {modified:false};objects.set(k,Buffer.from(b));return {modified:true};}},originals=blobProjectOriginalStore(raw);
 const store={key:'workspace',manualBinding:{scope:{capability:'shared-operations-desk-v1'}},store:raw,envelope:async()=>({data:structuredClone(data),etag:String(version)})};
 const app={store,now,change:async(fn,options)=>{assert(options.operationsPdf);assert(options.operationsPdfDeadline);assert.equal(options.configFingerprint,hash(data.config));const previous=structuredClone(data),candidate=structuredClone(data),revision=version,result=await fn(candidate.state,candidate.config);await controls.beforeCommit?.();assert.equal(revision,version,'CAS conflict');assert(+now()<options.operationsPdfDeadline,'Live deadline expired');await replayOperationsPdfTransition(previous,candidate,options.operationsPdf,{originalStore:originals,now});assert.equal(revision,version,'CAS conflict after replay');data=candidate;version++;commits++;return result;}};
 const manifest=originalManifest(bytes),source={reference:'drive:fixture-original-123',name:'Existing.pdf',mime_type:'application/pdf',modified_time:at,account:null};
 async function register(){return operationsPdfRecord(app,{revision:data.state.revision,event:{id:'asset',type:'asset_registered',prospect_id:'studio-assets',at,data:{asset_id:'a',scope:'project',project_id:'p',name:'Retained',kind:'proposal',version_id:'v',version_label:'Original',reference:source.reference}},source:{...source,sha256:manifest.sha256,bytes:manifest.bytes}},'owner');}
 const input=()=>({revision:data.state.revision,context_sha256:projectContext(data.state,'p').context_sha256});
 async function reserve(){return operationsPdfReserve(app,ids,{...input(),manifest,source},'friend');}
 return {app,store,controls,objects,originals,register,reserve,input,manifest,source,state:()=>structuredClone(data.state),commits:()=>commits,advance:ms=>time+=ms,mutate:fn=>{fn(data);version++;}};
}
test('signed service registers, reserves, chunks, completes and explicitly approves with independently replayed CAS',async t=>{
 const f=await fixture(t);await f.register();const transfer=await f.reserve();await operationsPdfUploadChunk(f.app,ids,0,bytes,transfer.id,'owner');assert.equal(f.state().asset_index.a.versions.v.verified_original,undefined);await operationsPdfComplete(f.app,ids,{...f.input(),transfer_id:transfer.id},'friend');const v=f.state().asset_index.a.versions.v;assert.deepEqual(await f.originals.get(v.verified_original),bytes);assert.equal(f.state().asset_index.a.baseline_version,null);
 await operationsPdfRecord(f.app,{revision:f.state().revision,event:{id:'approve',type:'asset_version_selected',prospect_id:'studio-assets',at,data:{asset_id:'a',version_id:'v'}},inspected_original:{sha256:f.manifest.sha256,bytes:bytes.length}},'owner');assert.equal(f.state().asset_index.a.baseline_version,'v');assert.equal(f.commits(),4);
});
test('delayed immutable write leaves orphan evidence but never grants verified original or success',async t=>{
 const f=await fixture(t);await f.register();const tr=await f.reserve(),count=f.commits();f.controls.beforeWrite=async()=>f.advance(25000);await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,bytes,tr.id,'owner'),/expired/);assert.equal(f.objects.size,1);assert.equal(f.commits(),count);assert.equal(f.state().asset_index.a.versions.v.verified_original,undefined);
});
test('source change during chunk write and canonical race before completion CAS preserve authority',async t=>{
 const f=await fixture(t);await f.register();const tr=await f.reserve();f.controls.beforeWrite=async()=>{f.controls.beforeWrite=null;f.mutate(d=>{d.state.prospects.p.note='Concurrent context';d.state.revision++;});};await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,bytes,tr.id,'friend'),/changed/);assert.equal(f.state().asset_index.a.versions.v.verified_original,undefined);
 // Refreshing the same exact reservation is an explicit new operation after context changes.
 const refreshed=await f.reserve();await operationsPdfUploadChunk(f.app,ids,0,bytes,refreshed.id,'friend');f.controls.beforeCommit=async()=>{f.controls.beforeCommit=null;f.mutate(d=>{d.state.prospects.p.note='New race';d.state.revision++;});};await assert.rejects(operationsPdfComplete(f.app,ids,{...f.input(),transfer_id:refreshed.id},'owner'),/CAS conflict/);assert.equal(f.state().asset_index.a.versions.v.verified_original,undefined);assert([...f.objects.keys()].some(k=>k.endsWith('/manifest')),'Immutable manifest alone grants no canonical authority');
});
test('closed caller inputs, unavailable capability, wrong actor and wrong transfer reject without chunk writes',async t=>{
 const f=await fixture(t);await f.register();const tr=await f.reserve();await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,bytes,'0'.repeat(64),'owner'),/transfer/);await assert.rejects(operationsPdfComplete(f.app,ids,{...f.input(),transfer_id:tr.id,approved:true},'owner'),/fields/);await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,bytes,tr.id,'worker'),/operator/);f.store.manualBinding.scope.capability='shared-mailbox-work-v1';await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,bytes,tr.id,'owner'),/workspace/);assert.equal(f.objects.size,0);
});
