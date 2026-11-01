import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {cloudDiscoveryFixture} from './cloud-discovery-fixtures.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {projectContext} from './project-work.mjs';
import {originalManifest,blobProjectOriginalStore} from './shared-project-originals.mjs';
import {operationsPdfRecord,operationsPdfReserve,operationsPdfUploadChunk,operationsPdfComplete} from './operations-pdf-service.mjs';
import {applyOperationsPdfRecord} from './operations-pdf.mjs';
import {prepareManualWorkspace,installManualWorkspace,exportManualBackup,validateManualEnvelope} from './shared-manual-records.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {readLifecycleBackup} from './lifecycle-backup.mjs';
import {replyAttachmentCatalogue} from './reply-attachments.mjs';
const policy={schema_version:1,mode:'registered-existing-pdfs',max_assets:64,max_versions_per_asset:16};
const ids={project_id:'p',asset_id:'a',version_id:'v'};
async function fixture(t,options={}){
 const f=await cloudDiscoveryFixture(t,{operationsPdf:policy,...options}),b=f.packet.binding.scope;
 const env={CONTEXT:'production',SITE_ID:b.site_id,DEPLOY_ID:b.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:b.capability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:b.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:b.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)},context={site:{id:b.site_id},deploy:{id:b.deploy_id,context:'production',published:true}};
 const handler=createHostedDesk({env,storeFactory:()=>f.raw,now:f.now}),request=(path,opts)=>new Request(b.origin+'/desk'+path,opts),cookie=r=>r.headers.get('set-cookie').split(';')[0];
 async function session(actor){const boot=await handler(request('/api/bootstrap'),context),csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:initial,origin:b.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}),context);assert.equal(login.status,200);
 const headers={cookie:initial+'; '+cookie(login),origin:b.origin,'content-type':'application/json','x-studio-token':csrf};
 return {headers,raw:(path,options={})=>handler(request(path,{...options,headers:{...headers,...options.headers}}),context),async call(path,input){const r=await this.raw(path,input===undefined?{}:{method:'POST',body:JSON.stringify(input)}),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;}};
 }
 const doc=await PDFDocument.create();doc.addPage([200,200]).drawText('SYNTHETIC existing PDF',{x:10,y:150,size:10});const bytes=Buffer.concat([Buffer.from(await doc.save()),Buffer.alloc(1_100_000,32)]),manifest=originalManifest(bytes),source={reference:'drive:synthetic-existing-123',name:'Synthetic.pdf',mime_type:'application/pdf',modified_time:f.now().toISOString(),account:null};
 const input=async()=>{const s=await f.store.snapshot();return {revision:s.revision,context_sha256:projectContext(s,'p').context_sha256};};
 const record=async(type,data,extra={})=>({revision:(await f.store.snapshot()).revision,event:{id:'event-'+(await f.store.snapshot()).revision,type,prospect_id:type==='workspace_project_created'?'p':'studio-assets',at:f.now().toISOString(),data},...extra});
 const register=async()=>{await operationsPdfRecord(f.app,await record('workspace_project_created',{name:'SYNTHETIC Existing company',purpose:'Retained PDF inspection',controlled:false}),'owner');return operationsPdfRecord(f.app,await record('asset_registered',{asset_id:'a',scope:'project',project_id:'p',name:'Retained source',kind:'source',version_id:'v',version_label:'Original',reference:source.reference},{source:{...source,sha256:manifest.sha256,bytes:manifest.bytes}}),'owner');};
 return {...f,env,context,handler,request,session,bytes,manifest,source,input,record,register};
}

test('actual signed HTTP owner registration/upload and separate friend inspection retain exact bytes and separate approval',async t=>{
 const f=await fixture(t,{seed:async({state,local,at})=>{await local.apply(fixtureProspect('client',at));const s=await local.snapshot();Object.assign(state,{prospects:s.prospects,events:s.events,actions:s.actions,revision:s.revision});state.prospects.client.controlled=false;state.prospects.client.follow_up_owner='owner';}}),owner=await f.session('owner'),friend=await f.session('friend');
 await owner.call('/api/operations-pdf/record',await f.record('workspace_project_created',{name:'SYNTHETIC Existing company',purpose:'Retained PDF inspection',controlled:false}));
 await owner.call('/api/operations-pdf/record',await f.record('asset_registered',{asset_id:'a',scope:'project',project_id:'client',name:'Retained source',kind:'source',version_id:'v',version_label:'Original',reference:f.source.reference},{source:{...f.source,sha256:f.manifest.sha256,bytes:f.manifest.bytes}}));
 const current=async()=>{const s=await f.store.snapshot();return {revision:s.revision,context_sha256:projectContext(s,'client').context_sha256};};
 const path='/api/project-original/client/a/v';assert.equal((await friend.raw(path)).status,400);assert.equal(replyAttachmentCatalogue(await f.store.snapshot(),'client').items.length,0);
 const transfer=await owner.call(path+'/reserve',{...await current(),manifest:f.manifest,source:f.source});
 for(let i=0;i<f.manifest.chunks.length;i++){const part=f.bytes.subarray(i*1_000_000,(i+1)*1_000_000),r=await owner.raw(path+'/chunk/'+i,{method:'POST',headers:{'content-type':'application/octet-stream','x-studio-transfer':transfer.id},body:part});assert.equal(r.status,200,await r.text());}
 f.control.lose=k=>k==='workspace';await owner.call(path+'/complete',{...await current(),transfer_id:transfer.id});
 const packet=await friend.call(path),chunks=[];for(let i=0;i<packet.manifest.chunks.length;i++){const r=await friend.raw(path+'/chunk/'+i);assert.equal(r.status,200);chunks.push(Buffer.from(await r.arrayBuffer()));}assert.deepEqual(Buffer.concat(chunks),f.bytes);assert.equal((await PDFDocument.load(Buffer.concat(chunks))).getPageCount(),1);
 assert.equal(replyAttachmentCatalogue(await f.store.snapshot(),'client').items.length,0,'Upload does not approve');
 await friend.call('/api/operations-pdf/record',await f.record('asset_version_selected',{asset_id:'a',version_id:'v'},{inspected_original:{sha256:f.manifest.sha256,bytes:f.manifest.bytes}}));assert.equal(replyAttachmentCatalogue(await f.store.snapshot(),'client').items[0].sha256,f.manifest.sha256);
 await f.app.apply({id:'handoff',prospect_id:'client',type:'follow_up_handed_off',at:f.now().toISOString(),data:{to:'friend'}},{actor:'owner',expectedRevision:(await f.store.snapshot()).revision});await f.app.apply({id:'stop',prospect_id:'client',type:'contact_stopped',at:f.now().toISOString(),data:{reason:'do_not_contact'}},{actor:'owner',expectedRevision:(await f.store.snapshot()).revision});assert.equal((await friend.raw(path)).status,200);
 assert.equal((await friend.raw('/api/project-author/begin',{method:'POST',body:'{}'})).status,409);
});

test('policy/binding, exclusive whole-state replay, canonical races and wrong bytes fail closed',async t=>{
 const f=await fixture(t);await f.register();const base=await f.store.envelope(),at=f.now().toISOString(),input=await f.record('asset_version_registered',{asset_id:'a',version_id:'v2',version_label:'Second',reference:'drive:synthetic-second-123'},{source:{...f.source,reference:'drive:synthetic-second-123',sha256:f.manifest.sha256,bytes:f.bytes.length}}),tr={schema_version:1,type:'record',actor:'owner',at,input};
 for(const opts of [{operationsPdf:tr,manualRecord:{}},{operationsPdf:tr,operationsPdfDeadline:+f.now()+25000}])await assert.rejects(f.store.change(s=>{applyOperationsPdfRecord(s,base.data.config,tr);s.prospects.p.note='forged';},opts),/Exclusive|replay/);
 const bad=structuredClone(base.data);delete bad.manual_source.operations_pdf;assert.throws(()=>validateManualEnvelope(bad,f.packet.binding));
 const transfer=await operationsPdfReserve(f.app,ids,{...await f.input(),manifest:f.manifest,source:f.source},'owner');
 await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,Buffer.from('wrong'),transfer.id,'owner'),/chunk/);
 await assert.rejects(operationsPdfComplete(f.app,ids,{...await f.input(),transfer_id:transfer.id},'owner'),/missing/);
 f.control.beforeWrite=async k=>{if(k!=='workspace'){f.control.beforeWrite=null;await f.app.apply({id:'race',prospect_id:'p',type:'note_added',at,data:{note:'Concurrent unrelated mailbox/context state'}},{actor:'friend',expectedRevision:(await f.store.snapshot()).revision});}};
 await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,f.bytes.subarray(0,1_000_000),transfer.id,'owner'),/changed/);assert.equal((await f.store.snapshot()).asset_index.a.versions.v.verified_original,undefined);
});

test('signed requests require session/CSRF, closed metadata and opt-in; old bindings keep denials',async t=>{
 for(const options of [{operationsPdf:undefined},{capability:'shared-mailbox-delivery-v1',operationsPdf:undefined}]){const f=await fixture(t,options),owner=await f.session('owner');assert.ok((await owner.raw('/api/operations-pdf/record',{method:'POST',body:'{}'})).status>=400);assert.ok((await owner.raw('/api/project-original/p/a/v/reserve',{method:'POST',body:'{}'})).status>=400);}
 const f=await fixture(t),owner=await f.session('owner');
 const boot=await f.handler(f.request('/api/bootstrap'),f.context),token=(await boot.json()).csrf;assert.equal((await f.handler(f.request('/api/operations-pdf/record',{method:'POST',headers:{cookie:boot.headers.get('set-cookie').split(';')[0],origin:f.env.EVZ_OPERATIONS_ORIGIN,'content-type':'application/json','x-studio-token':token},body:'{}'}),f.context)).status,401);
 assert.equal((await f.handler(f.request('/api/operations-pdf/record',{method:'POST',headers:{origin:f.env.EVZ_OPERATIONS_ORIGIN,'content-type':'application/json'},body:'{}'}),f.context)).status,403);
 assert.equal((await owner.raw('/api/operations-pdf/record',{method:'POST',headers:{'x-studio-token':'bad'},body:'{}'})).status,403);
 await f.register();const bad={...await f.input(),manifest:f.manifest,source:{...f.source,token:'forged'}};assert.equal((await owner.raw('/api/project-original/p/a/v/reserve',{method:'POST',body:JSON.stringify(bad)})).status,400);
});

test('complete G1 export/restore retains exact originals and source metadata while incomplete transfers retain a hold',async t=>{
 const f=await fixture(t);await f.register();let transfer=await operationsPdfReserve(f.app,ids,{...await f.input(),manifest:f.manifest,source:f.source},'owner');
 await assert.rejects(exportManualBackup(f.app,join(f.directory,'local'),join(f.directory,'partial.json')),/held|incomplete|partial/i);
 for(let i=0;i<f.manifest.chunks.length;i++)await operationsPdfUploadChunk(f.app,ids,i,f.bytes.subarray(i*1_000_000,(i+1)*1_000_000),transfer.id,'owner');await operationsPdfComplete(f.app,ids,{...await f.input(),transfer_id:transfer.id},'owner');
 const output=join(f.directory,'complete.json');await exportManualBackup(f.app,join(f.directory,'local'),output);const backup=await readLifecycleBackup(output);assert.deepEqual(backup.files.get('project-originals/'+f.manifest.sha256+'.pdf'),f.bytes);
 const c=f.app.config,scope={...f.packet.binding.scope,namespace:'evz-manual-shared-pdf-restore-test',deploy_id:'pdf-restore'},mailboxClock={...c.mailbox_clock,deploy_id:scope.deploy_id},mailboxDelivery={...c.mailbox_delivery,deploy_id:scope.deploy_id},cloudDiscovery={...c.cloud_discovery,deploy_id:scope.deploy_id};
 const packet=await prepareManualWorkspace({backup:output,sourceConfig:c,scope,mailbox:c.mailbox,mailboxWork:c.mailbox_work,mailboxClock,mailboxDelivery,cloudDiscovery,operationsPdf:policy}),rawMap=new Map();let etag=0;
 const raw={async getWithMetadata(k,o){const e=rawMap.get(k);return e?{data:o.type==='json'?JSON.parse(e.bytes):Uint8Array.from(e.bytes).buffer,etag:e.etag}:null;},async set(k,b,o){if(o.onlyIfNew&&rawMap.has(k))return {modified:false};const e={bytes:Buffer.from(b),etag:String(++etag)};rawMap.set(k,e);return {modified:true,etag:e.etag};},async setJSON(k,d,o){return this.set(k,Buffer.from(JSON.stringify(d)),o);}},store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now:f.now});
 await installManualWorkspace(store,packet,{commit:true});const restored=(await store.snapshot()).asset_index.a.versions.v;assert.deepEqual(restored.operations_pdf_source,(await f.store.snapshot()).asset_index.a.versions.v.operations_pdf_source);assert.deepEqual(await blobProjectOriginalStore(raw).get(restored.verified_original),f.bytes);assert.equal((await store.config()).operations.enabled,false);
});

test('concurrent reservations and completion CAS loss preserve exact transfers and immutable evidence',async t=>{
 const f=await fixture(t);await f.register();const extra=await f.record('workspace_project_created',{name:'SYNTHETIC Other company',purpose:'Unrelated private context',controlled:false});extra.event.prospect_id='q';await operationsPdfRecord(f.app,extra,'friend');const input={...await f.input(),manifest:f.manifest,source:f.source},outcomes=await Promise.allSettled(['owner','friend'].map(actor=>operationsPdfReserve(f.app,ids,input,actor)));
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);const transfer=(await f.store.snapshot()).asset_index.a.versions.v.original_transfer;
 for(let i=0;i<f.manifest.chunks.length;i++)await operationsPdfUploadChunk(f.app,ids,i,f.bytes.subarray(i*1_000_000,(i+1)*1_000_000),transfer.id,'owner');
 const unchangedContext=projectContext(await f.store.snapshot(),'p').context_sha256;
 // Race at the actual conditional writer, after all replay/current reads completed.
 f.control.beforeWrite=async k=>{if(k==='workspace'){f.control.beforeWrite=null;await f.app.apply({id:'completion-race',prospect_id:'q',type:'note_added',at:f.now().toISOString(),data:{note:'Unrelated state committed before original CAS'}},{actor:'friend',expectedRevision:(await f.store.snapshot()).revision});}};
 await assert.rejects(operationsPdfComplete(f.app,ids,{...await f.input(),transfer_id:transfer.id},'owner'),/changed/);
 assert.equal(projectContext(await f.store.snapshot(),'p').context_sha256,unchangedContext,'Unrelated context does not stale the target context hash; the canonical workspace fence must still reject');assert.equal((await f.store.snapshot()).asset_index.a.versions.v.verified_original,undefined);assert.ok([...f.objects.keys()].some(k=>k.endsWith('/manifest')));
 const refreshed=await operationsPdfReserve(f.app,ids,{...await f.input(),manifest:f.manifest,source:f.source},'friend');assert.equal(refreshed.id,transfer.id);
 await operationsPdfComplete(f.app,ids,{...await f.input(),transfer_id:refreshed.id},'friend');const before=await f.store.snapshot();await operationsPdfComplete(f.app,ids,{...await f.input(),transfer_id:refreshed.id},'owner');assert.deepEqual(await f.store.snapshot(),before,'Identical completion retry is a no-op');
});

test('late chunk writes and expired inspected review cannot grant canonical authority',async t=>{
 const f=await fixture(t);await f.register();const tr=await operationsPdfReserve(f.app,ids,{...await f.input(),manifest:f.manifest,source:f.source},'owner');f.control.beforeWrite=async k=>{if(k!=='workspace'){f.control.beforeWrite=null;f.advance(25000);}};
 await assert.rejects(operationsPdfUploadChunk(f.app,ids,0,f.bytes.subarray(0,1_000_000),tr.id,'owner'),/expired/);assert.equal((await f.store.snapshot()).asset_index.a.versions.v.verified_original,undefined);
 for(let i=0;i<f.manifest.chunks.length;i++)await operationsPdfUploadChunk(f.app,ids,i,f.bytes.subarray(i*1_000_000,(i+1)*1_000_000),tr.id,'owner');await operationsPdfComplete(f.app,ids,{...await f.input(),transfer_id:tr.id},'owner');
 f.control.beforeRead=async k=>{if(k!=='workspace'){f.control.beforeRead=null;f.advance(25000);}};
 await assert.rejects(operationsPdfRecord(f.app,await f.record('asset_version_selected',{asset_id:'a',version_id:'v'},{inspected_original:{sha256:f.manifest.sha256,bytes:f.manifest.bytes}}),'friend'),/expired/);assert.equal((await f.store.snapshot()).asset_index.a.baseline_version,null);
});

test('actual HTTP bounds a stalled initial canonical read and never resumes a late mutation',async t=>{
 const f=await fixture(t),owner=await f.session('owner'),controller=new AbortController();t.mock.method(AbortSignal,'timeout',()=>controller.signal);
 let release,entered;const blocked=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});f.control.beforeRead=async k=>{if(k==='workspace'){entered();await blocked;}};
 const pending=owner.raw('/api/operations-pdf/record',{method:'POST',body:'{}'});await started;controller.abort();const response=await pending;assert.equal(response.status,503);f.control.beforeRead=null;release();assert.equal(Object.keys((await f.store.snapshot()).asset_index??{}).length,0);
});
