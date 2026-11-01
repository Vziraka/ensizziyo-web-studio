import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {projectContext} from './project-work.mjs';
import {originalManifest,blobProjectOriginalStore,reserveSharedOriginal,completeSharedOriginal} from './shared-project-originals.mjs';
import {replyAttachmentCatalogue,selectReplyAttachments} from './reply-attachments.mjs';
import {applyOperationsPdfRecord,replayOperationsPdfTransition,validateOperationsPdfPolicy,validateOperationsPdfState,operationsPdfView} from './operations-pdf.mjs';
const at='2026-11-01T14:00:00.000Z',now=()=>new Date(at);
async function pdf(size=0){const doc=await PDFDocument.create();doc.addPage([200,200]);const bytes=Buffer.from(await doc.save());return size?Buffer.concat([bytes,Buffer.alloc(size-bytes.length,32)]):bytes;}
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'operations-pdf-'));t.after(()=>rm(dir,{recursive:true,force:true}));const app=await StudioLifecycle.initialize({directory:dir,now});
 await app.apply({id:'project',type:'workspace_project_created',prospect_id:'p',at,data:{name:'STUDIO TEST Existing business',purpose:'Retained originals',controlled:true}},{actor:'owner'});
 const state=await app.snapshot(),config={...app.config,shared_capability:'shared-operations-desk-v1',operations_pdf:{schema_version:1,mode:'registered-existing-pdfs',max_assets:64,max_versions_per_asset:16}};
 const objects=new Map();let writes=0;const raw={getWithMetadata:async k=>objects.has(k)?{data:Uint8Array.from(objects.get(k)).buffer}:null,set:async(k,b,o)=>{writes++;if(o.onlyIfNew&&objects.has(k))return {modified:false};objects.set(k,Buffer.from(b));return {modified:true};}};
 const store=blobProjectOriginalStore(raw),env=s=>({config,state:structuredClone(s)}),ids={project_id:'p',asset_id:'asset',version_id:'v1'};
 const source=bytes=>({reference:'drive:fictional-original-123',name:'Original.pdf',mime_type:'application/pdf',modified_time:at,account:'business@example.invalid',sha256:originalManifest(bytes).sha256,bytes:bytes.length});
 function record(type,data,extra,actor='owner'){return {schema_version:1,type:'record',actor,at,input:{revision:state.revision,event:{id:'event-'+state.revision,type,prospect_id:'studio-assets',at,data},...extra}};}
 function register(bytes,overrides={}){const s={...source(bytes),...overrides},tr=record('asset_registered',{asset_id:'asset',scope:'project',project_id:'p',name:'Existing PDF',kind:'proposal',version_id:'v1',version_label:'Original',reference:s.reference},{source:s});const before=env(state);applyOperationsPdfRecord(state,config,tr);return {before,after:env(state),tr,source:s};}
 async function upload(bytes){
  const d=state.asset_index.asset.versions[ids.version_id].operations_pdf_source,{sha256,bytes:ignored,...provenance}=d;const manifest=originalManifest(bytes);
  const tr={schema_version:1,type:'reserve',actor:'friend',at,input:{ids,revision:state.revision,context_sha256:projectContext(state,'p').context_sha256,manifest,source:provenance}},before=env(state);
  const local=new StudioLifecycle(null,now);local.config=config;local.snapshot=async()=>structuredClone(state);local.change=async fn=>fn(state);
  const transfer=await reserveSharedOriginal(local,{...ids,...tr.input},'friend');await replayOperationsPdfTransition(before,env(state),tr,{originalStore:store,now});
  for(let i=0;i<manifest.chunks.length;i++)await store.putChunk(manifest,i,bytes.subarray(i*1_000_000,(i+1)*1_000_000));
  const complete={schema_version:1,type:'complete',actor:'friend',at,input:{ids,revision:state.revision,context_sha256:projectContext(state,'p').context_sha256,transfer_id:transfer.id}},prior=env(state);
  await completeSharedOriginal(local,store,{...ids,transfer_id:transfer.id},'friend');const count=writes;await replayOperationsPdfTransition(prior,env(state),complete,{originalStore:store,now});assert.equal(writes,count,'Replay must not write originals');return {before:prior,after:env(state),tr:complete,manifest};
 }
 function approve(actor='owner'){const o=state.asset_index.asset.versions.v1.verified_original,tr=record('asset_version_selected',{asset_id:'asset',version_id:'v1'},{inspected_original:{sha256:o.sha256,bytes:o.bytes}},actor),before=env(state);applyOperationsPdfRecord(state,config,tr);return {before,after:env(state),tr};}
 return {state,config,store,objects,env,ids,record,register,upload,approve};
}
test('explicit source registration, real immutable upload and separate inspected approval produce a 13MB attachment',async t=>{
 const f=await fixture(t),bytes=await pdf(13_075_423),registered=f.register(bytes);await replayOperationsPdfTransition(registered.before,registered.after,registered.tr,{now});
 assert.equal(f.state.asset_index.asset.baseline_version,null);assert.equal(replyAttachmentCatalogue(f.state,'p').items.length,0);
 await f.upload(bytes);assert.equal(replyAttachmentCatalogue(f.state,'p').items.length,0,'Uploading is not baseline approval');
 const approved=f.approve('friend');await replayOperationsPdfTransition(approved.before,approved.after,approved.tr,{originalStore:f.store,now});
 const [item]=replyAttachmentCatalogue(f.state,'p').items;assert.equal(item.bytes,bytes.length);assert.equal(item.sha256,originalManifest(bytes).sha256);assert.equal(f.state.events[approved.tr.input.event.id].actor,'friend');assert.deepEqual(await f.store.get(f.state.asset_index.asset.versions.v1.verified_original),bytes);
 assert.equal(operationsPdfView(f.state,f.config,'p').items[0].attachable,true);assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);
});
test('30.6MB original remains inspectable but cannot be an email attachment',async t=>{
 const f=await fixture(t),bytes=await pdf(30_591_178);f.register(bytes);await f.upload(bytes);f.approve();const view=operationsPdfView(f.state,f.config,'p').items[0];assert.equal(view.hosted_original_declared,true);assert.equal(view.attachment_size_allowed,false);assert.equal(view.attachable,false);assert.equal(replyAttachmentCatalogue(f.state,'p').items.length,0);assert.throws(()=>selectReplyAttachments(f.state,'p',[{asset_id:'asset',version_id:'v1',sha256:originalManifest(bytes).sha256}]),/bounded original/);
});
test('79.2MB reference is retained without claiming hosted readability or approval',async t=>{
 const f=await fixture(t),bytes=await pdf();f.register(bytes,{bytes:79_200_000});const view=operationsPdfView(f.state,f.config,'p').items[0];assert.equal(view.original_status,'External reference only');assert.equal(view.hosted_original_declared,false);assert.equal(view.attachable,false);assert.equal(view.reference,'drive:fictional-original-123');await assert.rejects(f.upload(bytes),/64,000,000|registered original|differs/);assert.throws(()=>f.approve());
});
test('old capability, missing opt-in, unknown fields and worker actor cannot mutate assets',async t=>{
 const f=await fixture(t),bytes=await pdf(),r=f.register(bytes);for(const config of [{...f.config,shared_capability:'shared-mailbox-delivery-v1'},{...f.config,operations_pdf:undefined}])assert.throws(()=>applyOperationsPdfRecord(structuredClone(r.before.state),config,r.tr));
 assert.throws(()=>validateOperationsPdfPolicy({...f.config.operations_pdf,enabled:true}),/fields/);assert.throws(()=>applyOperationsPdfRecord(structuredClone(r.before.state),f.config,{...r.tr,actor:'worker'}),/Signed/);assert.throws(()=>applyOperationsPdfRecord(structuredClone(r.before.state),f.config,{...r.tr,grant:true}),/fields/);
 const tr=structuredClone(r.tr);tr.input.event.data.approved=true;assert.throws(()=>applyOperationsPdfRecord(structuredClone(r.before.state),f.config,tr),/fields/);
});
test('typed replay rejects unrelated changes, forged verified authority and configuration changes',async t=>{
 const f=await fixture(t),bytes=await pdf(),r=f.register(bytes);const tamper=structuredClone(r.after);tamper.state.prospects.p.note='Injected';await assert.rejects(replayOperationsPdfTransition(r.before,tamper,r.tr,{now}),/replay/);
 const forged=structuredClone(r.after);forged.state.asset_index.asset.versions.v1.verified_original={...r.source,verified_by:'owner',verified_at:at};await assert.rejects(replayOperationsPdfTransition(r.before,forged,r.tr,{now}),/replay/);
 const config=structuredClone(r.after);config.config.calls_enabled=true;await assert.rejects(replayOperationsPdfTransition(r.before,config,r.tr,{now}),/configuration/);
});
test('missing chunks, stale context/version and expired completion cannot pass typed original replay',async t=>{
 const f=await fixture(t),bytes=await pdf();f.register(bytes);const r=await f.upload(bytes),chunk=[...f.objects.keys()].find(k=>/\/0-/.test(k)),saved=f.objects.get(chunk);f.objects.delete(chunk);await assert.rejects(replayOperationsPdfTransition(r.before,r.after,r.tr,{originalStore:f.store,now}),/missing/);f.objects.set(chunk,saved);
 const stale=structuredClone(r.tr);stale.input.context_sha256='a'.repeat(64);await assert.rejects(replayOperationsPdfTransition(r.before,r.after,stale,{originalStore:f.store,now}),/context/);
 stale.input.ids.version_id='different';await assert.rejects(replayOperationsPdfTransition(r.before,r.after,stale,{originalStore:f.store,now}),/registered/);
 await assert.rejects(replayOperationsPdfTransition(r.before,r.after,r.tr,{originalStore:f.store,now:()=>new Date(Date.parse(at)+25000)}),/expired/);
});
test('both signed operators retain asset review independently of reply ownership, and approval binds inspected bytes',async t=>{
 const f=await fixture(t),bytes=await pdf();f.state.prospects.p.follow_up_owner='owner';f.register(bytes);await f.upload(bytes);const r=f.approve('friend');await replayOperationsPdfTransition(r.before,r.after,r.tr,{originalStore:f.store,now});
 const bad=structuredClone(r.tr);bad.input.inspected_original.sha256='0'.repeat(64);assert.throws(()=>applyOperationsPdfRecord(structuredClone(r.before.state),f.config,bad),/Inspect/);
 const impersonated=structuredClone(r.tr);impersonated.input.event.actor='owner';assert.throws(()=>applyOperationsPdfRecord(structuredClone(r.before.state),f.config,impersonated),/fields/);
 const state=structuredClone(f.state);state.asset_index.asset.versions.v1.operations_pdf_source.bytes++;assert.throws(()=>validateOperationsPdfState(state,f.config),/differs/);
});
test('new registered version preserves approved history; dispute resolves only after both current choices agree',async t=>{
 const f=await fixture(t),bytes=await pdf();f.register(bytes);await f.upload(bytes);f.approve();const first=f.state.asset_index.asset.baseline_approval_event;
 const original=f.state.asset_index.asset.versions.v1.operations_pdf_source,registered=f.record('asset_version_registered',{asset_id:'asset',version_id:'v2',version_label:'Second retained original',reference:'drive:second-original-123'},{source:{...original,reference:'drive:second-original-123'}});
 applyOperationsPdfRecord(f.state,f.config,registered);assert.equal(f.state.asset_index.asset.baseline_version,'v1');f.ids.version_id='v2';await f.upload(bytes);
 const reviewed={inspected_original:{sha256:original.sha256,bytes:original.bytes}},dispute=f.record('asset_version_disputed',{asset_id:'asset',version_id:'v2'},reviewed,'friend');applyOperationsPdfRecord(f.state,f.config,dispute);
 assert.equal(f.state.asset_index.asset.baseline_version,'v1');assert.equal(replyAttachmentCatalogue(f.state,'p').items.length,0,'Dispute blocks attachment eligibility');
 const choose=f.record('asset_version_selected',{asset_id:'asset',version_id:'v2'},reviewed,'owner'),before=f.env(f.state);applyOperationsPdfRecord(f.state,f.config,choose);await replayOperationsPdfTransition(before,f.env(f.state),choose,{originalStore:f.store,now});
 assert.equal(f.state.asset_index.asset.baseline_version,'v2');assert.equal(f.state.asset_index.asset.dispute,null);assert.equal(f.state.asset_index.asset.baseline_agreement_events.length,2);assert(f.state.events[first]);assert(f.state.asset_index.asset.versions.v1.verified_original);
});
