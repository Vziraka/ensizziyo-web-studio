import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Install before project imports: fictional boundaries must never fall back to a service.
const denied=[];
const deny=name=>(...args)=>{denied.push(name);throw Error('Unexpected IO: '+name);};
globalThis.fetch=deny('fetch');
const http=await import('node:http'),https=await import('node:https'),net=await import('node:net'),tls=await import('node:tls'),dgram=await import('node:dgram');
for(const mod of [http.default,https.default]){mod.request=deny('HTTP');mod.get=deny('HTTP GET');}
net.default.connect=net.default.createConnection=net.default.Socket.prototype.connect=deny('socket');tls.default.connect=deny('TLS');dgram.default.createSocket=deny('UDP');
(await import('node:module')).syncBuiltinESMExports();
const {createHostedDesk}=await import('./hosted-desk.mjs'),{StudioLifecycle,hash}=await import('./lifecycle.mjs'),{ConditionalLifecycleStore}=await import('./lifecycle-store.mjs');
const {projectContext}=await import('./project-work.mjs'),{connectSharedOriginals,sharedDeskSession}=await import('./shared-originals-client.mjs'),{downloadHostedBackup}=await import('./hosted-authoring-client.mjs');
const {originalDigest,originalManifest,blobProjectOriginalStore}=await import('./shared-project-originals.mjs'),{driveOAuthProfile,driveOAuthScopes}=await import('./google-oauth.mjs');
const {readLifecycleBackup,hasProjectDependencies,validateBackupDependencies,writePortableLifecycleBackup}=await import('./lifecycle-backup.mjs');

const origin='https://fictional-g1.example.invalid',ids={project_id:'shared-proof',asset_id:'pdf',version_id:'v1'},file='fictionalG1Original123',at='2026-10-25T08:00:00.000Z';
function validPDF(padding=1_500_000){
 const contents='BT /F1 18 Tf 40 760 Td (FICTIONAL partial Drive G1 reproduction) Tj ET\n%'+ ' '.repeat(padding)+'\n';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(contents)} >>\nstream\n${contents}endstream`];
 let text='%PDF-1.7\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(text);text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(text);
}
function memoryBlobs(){const entries=new Map();let version=0;return {entries,onRead:null,onWrite:null,async getWithMetadata(key,{type,consistency}){assert.equal(consistency,'strong');if(this.onRead)await this.onRead(key);const e=entries.get(key);return e?{data:type==='json'?JSON.parse(e.bytes):Buffer.from(e.bytes),etag:e.etag}:null;},async set(key,value,options={}){if(this.onWrite)await this.onWrite(key,value,options);const p=entries.get(key);if(options.onlyIfNew&&p||options.onlyIfMatch&&p?.etag!==options.onlyIfMatch)return {modified:false};const etag='"'+(++version)+'"';entries.set(key,{bytes:Buffer.from(value),etag});if(this.lose===key){this.lose=null;throw Error('Fictional lost acknowledgement');}return {modified:true,etag};},async setJSON(key,value,options){return this.set(key,JSON.stringify(value),options);}};}
async function fixture(t,{bytes=validPDF(),manual=false,sdk=false,incoming=false,reference}={}){
 const directory=await mkdtemp(join(tmpdir(),'evz-original-recovery-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const storage=sdk?(await import('./fixtures/hosted-authoring.mjs')).fictionalBlobs():null,raw=storage?.raw??memoryBlobs(),ranges=[],env={CONTEXT:'deploy-preview',SITE_ID:'fictional-site',DEPLOY_ID:'fictional-deploy',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_SHARED_ORIGINALS:'fictional-chunks-v1',EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS:'fictional-drive-read-v1',EVZ_OPERATIONS_PROJECT_AUTHORING:'fictional-node-v1',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-partial-g1-fictional',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43),...(incoming?{EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL:'fictional-incoming-v1'}:{})};
 if(storage)raw.entries=storage.entries;
 let clock=Date.parse(at),httpHook=null,tokenHook=null;
 const source={...ids,reference:reference??(manual?'private-path:fictional/partial.pdf':'drive:'+file),name:'Fictional partial G1.pdf',mime_type:'application/pdf',modified_time:at,drive_version:'42',bytes:bytes.length,sha256:originalDigest(bytes),etag:'"fictional-etag"'};
 const token={profile:driveOAuthProfile,account:'ensizziyo@evzdigital.studio',grant_id:'fictional-drive-grant',scopes:driveOAuthScopes,access_token:'fictional-only-access-token',expires_at:clock+3_600_000};
 async function provider(url,options){
  const u=new URL(url);assert.equal(u.origin,'https://www.googleapis.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fictional-only-access-token');if(httpHook){const substituted=await httpHook(u,options);if(substituted)return substituted;}
  if(u.pathname==='/drive/v3/about')return Response.json({user:{emailAddress:token.account}});
  assert.equal(u.pathname,'/drive/v3/files/'+file);
  if(u.searchParams.get('alt')!=='media')return Response.json({id:file,name:source.name,mimeType:'application/pdf',size:String(bytes.length),modifiedTime:at,version:'42',sha256Checksum:source.sha256,trashed:false,capabilities:{canDownload:true}},{headers:{etag:source.etag}});
  const m=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);assert.ok(m);const start=+m[1],end=+m[2],chunk=bytes.subarray(start,end+1);ranges.push({start,end});return new Response(chunk,{status:206,headers:{'content-type':'application/pdf','content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(chunk.length),etag:source.etag}});
 }
 const incomingOptions={getAccessToken:async()=>({access_token:'fictional-incoming-token',expires_at:clock+3600000,account:'fictional@example.invalid',grant_id:'fictional-incoming-grant',scopes:(await import('./google-hosted-transport.mjs')).gmailScopes}),fetcher:async(url,options)=>{assert.equal(new URL(url).origin,'https://gmail.googleapis.com');assert.equal(options.method,'GET');if(new URL(url).pathname.endsWith('/profile'))return Response.json({emailAddress:'fictional@example.invalid',historyId:'100'});assert.ok(new URL(url).pathname.endsWith('/threads/thread'));return Response.json({id:'thread',messages:[{id:'original',threadId:'thread',labelIds:['SENT'],internalDate:String(clock-1000),payload:{mimeType:'text/plain',headers:[{name:'From',value:'hello@evzdigital.studio'},{name:'To',value:'shared-proof@example.invalid'},{name:'Subject',value:'Fictional original'},{name:'Message-ID',value:'<original@evzdigital.studio>'}],body:{size:8,data:Buffer.from('Original').toString('base64url')}}}]});}};
 const handler=createHostedDesk({env,storeFactory:async()=>raw,now:()=>new Date(clock),googleDriveOptions:{getAccessToken:async()=>{if(tokenHook)await tokenHook();return token;},fetcher:provider},googleIncomingOptions:incoming?incomingOptions:{getAccessToken:deny('incoming token'),fetcher:deny('incoming HTTP')},googleOAuthOptions:{storeFactory:deny('credential store'),fetcher:deny('OAuth'),certificates:deny('certificates')},refinementOptions:{catalogRequest:deny('catalogue'),fetcher:deny('generation HTTP'),clientFactory:deny('inference')},internalDispatchOptions:{fetcher:deny('internal HTTP'),getAccessToken:deny('internal token')}}),fetcher=(url,options)=>handler(new Request(url,options));
 const owner=await connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_OWNER_KEY,fetcher});await owner.context(ids.project_id);
 const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw),now:()=>new Date(clock)});
 await app.apply({id:'fictional-registered-drive-pdf',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:ids.asset_id,scope:'project',project_id:ids.project_id,kind:'mockup',name:source.name,version_id:ids.version_id,version_label:'v1',reference:source.reference}},{actor:'owner'});
 const e=await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});if(!manual)e.data.config.google_drive_originals={account:token.account,grant_id:token.grant_id,sources:[source]};if(incoming){e.data.config.sender={...e.data.config.sender,email:'hello@evzdigital.studio',account_email:'fictional@example.invalid'};e.data.config.google_incoming_mail={enabled:true,capability:'fictional-incoming-v1',run_id:e.data.config.run_id,account_email:'fictional@example.invalid',grant_id:'fictional-incoming-grant'};e.data.config.operations={threads:{'shared-proof':{thread_id:'thread',original_id:'original',from:'hello@evzdigital.studio',to:'shared-proof@example.invalid',subject:'Fictional original'}}};}await raw.setJSON('workspace',e.data,{onlyIfMatch:e.etag});app.config=e.data.config;
 const session=await sharedDeskSession({origin,key:env.EVZ_OPERATIONS_FRIEND_KEY,fetcher}),friend=await connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_FRIEND_KEY,fetcher}),ownerSession=await sharedDeskSession({origin,key:env.EVZ_OPERATIONS_OWNER_KEY,fetcher});
 t.after(()=>assert.deepEqual(denied,[]));
 return {directory,raw,storage,app,owner,friend,session,ownerSession,source,bytes,ranges,env,handler,fetcher,store:blobProjectOriginalStore(raw),advance(ms){clock+=ms;},http(fn){httpHook=fn;},token(fn){tokenHook=fn;},async event(type,data={},actor='friend'){const state=await app.snapshot();return (actor==='owner'?ownerSession:session).json('/api/event',{method:'POST',body:{revision:state.revision,event:{id:'fictional-'+type+'-'+state.revision,type,prospect_id:type.startsWith('asset_')?'studio-assets':ids.project_id,at:new Date(clock).toISOString(),data}}});},async trusted(fn){const e=await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});await fn(e.data);await raw.setJSON('workspace',e.data,{onlyIfMatch:e.etag});},async reserve(){const context=await owner.context(ids.project_id);return ownerSession.json('/api/project-original/shared-proof/pdf/v1/reserve',{method:'POST',body:{context_sha256:context.context_sha256,manifest:originalManifest(bytes),source:{reference:source.reference,name:source.name,mime_type:source.mime_type,modified_time:source.modified_time,account:null}}});}};
}

test('signed 1,500,625-byte Drive partial cannot produce a complete-looking zero-dependency G1',async t=>{
 const f=await fixture(t);assert.equal(f.bytes.length,1_500_625);const ready=await f.owner.readDriveOriginal(ids);assert.equal(ready.chunks_verified,1);assert.equal(ready.chunks_total,2);
 const before=await f.app.snapshot(),chunk=[...f.raw.entries].find(([key])=>key.startsWith('project-originals/')),backup=join(f.directory,'unreconciled.json');assert.equal(chunk[1].bytes.length,1_000_000);
 await assert.rejects(downloadHostedBackup(f.session,backup),/reconcile.*original/i);
 await assert.rejects(access(backup),{code:'ENOENT'});await assert.rejects(access(backup+'.files'),{code:'ENOENT'});
 assert.equal(hasProjectDependencies(before),true);assert.equal(hash(await f.app.snapshot()),hash(before));assert.equal(originalDigest(f.raw.entries.get(chunk[0]).bytes),originalDigest(chunk[1].bytes));
 await assert.rejects(validateBackupDependencies(before,new Map()),/reconcile.*original/i);
});

const closure=(observation,reason='Retain incomplete fictional original and close its publication.')=>({kind:observation.kind,transfer_id:observation.transfer_id,context_sha256:observation.context_sha256,snapshot:observation.snapshot,observed_at:observation.observed_at,reason,disposition:'close-publication'});
test('fresh signed friend closes owner Ready receipt on pinned Blobs SDK and G1 restores exact inert evidence without original authority',async t=>{
 const f=await fixture(t,{sdk:true}),ready=await f.owner.readDriveOriginal(ids),before=await f.app.snapshot(),chunk=[...f.raw.entries].find(([key])=>key.startsWith('project-originals/'));
 const observation=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});assert.equal(observation.chunks[0].disposition,'available');assert.equal(observation.unobserved.length,1);assert.equal(observation.unobserved[0].disposition,'uncertain-unobserved');
 const result=await f.friend.reconcile(ids,closure(observation));assert.equal(result.actor,'friend');assert.equal(result.prior_status,'Ready');assert.equal(result.export_usable,false);assert.equal(result.execution,'not-attested-stopped');assert.deepEqual(result.prior,before.drive_original_reads[ready.transfer_id]);
 const after=await f.app.snapshot();assert.equal(after.drive_original_reads[ready.transfer_id].status,'Reconciled');assert.deepEqual(f.raw.entries.get(chunk[0]).bytes,chunk[1].bytes);
 const backup=join(f.directory,'closed.json');await downloadHostedBackup(f.session,backup);const read=await readLifecycleBackup(backup);assert.equal(read.files.size,1);assert.deepEqual(read.files.get(observation.chunks[0].evidence),chunk[1].bytes);
 const restoredPath=join(f.directory,'inert');await StudioLifecycle.restore({input:backup,destination:restoredPath});const local=await StudioLifecycle.open({directory:restoredPath}),state=await local.snapshot();assert.deepEqual(state.drive_original_reads,after.drive_original_reads);assert.equal(state.asset_index.pdf.versions.v1.verified_original,undefined);
 const config=JSON.parse(await readFile(join(restoredPath,'lifecycle-config.json')));assert.equal(config.google_drive_originals,undefined);assert.equal(config.outreach_enabled,false);assert.equal(config.research_enabled,false);assert.equal(config.connector_writes_enabled,false);
 await assert.rejects(f.owner.download(ids),/not verified/);const ranges=f.ranges.length;await assert.rejects(f.owner.readDriveOriginal(ids),/closed/);assert.equal(f.ranges.length,ranges);
 const revision=state.revision;assert.deepEqual(await f.owner.reconcile(ids,closure(observation)),result);assert.equal((await f.app.snapshot()).revision,revision);
});

test('Held and context-obsolete Ready Drive receipts preserve earlier named chunks, hold and exact policy',async t=>{
 for(const held of [false,true]){const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids);
  if(held){f.http(u=>u.pathname.includes('/files/')?Response.json({id:file,name:'changed fictional metadata'}):undefined);await assert.rejects(f.owner.readDriveOriginal(ids),/metadata/);}
  await f.event('note_added',{note:'Fresh context after the original read.'});const before=await f.app.snapshot(),prior=before.drive_original_reads[ready.transfer_id];assert.equal(prior.status,held?'Held':'Ready');
  const o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});assert.notEqual(o.context_sha256,prior.context);const r=await f.friend.reconcile(ids,closure(o));assert.deepEqual(r.prior,prior);assert.equal(r.prior.hold,prior.hold);assert.equal(r.prior.policy,prior.policy);
  const backup=join(f.directory,'held.json');await downloadHostedBackup(f.session,backup);assert.equal((await readLifecycleBackup(backup)).files.size,1);
 }
});

for(const mutation of ['note','call','handoff','stop','feedback','selection','dispute','incoming','receipt','lease','clock','config','chunk'])test('signed original observation rejects changed '+mutation+' before closure and preserves source chunks',async t=>{
 const f=await fixture(t,{incoming:mutation==='incoming'});if(mutation==='handoff')await f.event('call_claimed',{},'owner');
 if(mutation==='dispute'){await f.event('asset_version_registered',{asset_id:'pdf',version_id:'v2',version_label:'v2',reference:'private-path:fictional/other.pdf'},'owner');await f.event('asset_version_selected',{asset_id:'pdf',version_id:'v1'},'owner');}
 const ready=await f.owner.readDriveOriginal(ids);
 const o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id}),key=[...f.raw.entries.keys()].find(k=>k.startsWith('project-originals/'));
 if(mutation==='note')await f.event('note_added',{note:'A signed note changes the observation.'});
 if(mutation==='call')await f.event('call_logged',{call_id:'fictional-call',outcome:'no_answer',desk:true,simulated:true,performed_at:at,note:'Fictional completed-call fixture.'},'owner');
 if(mutation==='handoff')await f.event('follow_up_handed_off',{to:'friend'},'owner');
 if(mutation==='stop')await f.event('contact_stopped',{reason:'do_not_contact'});
 if(mutation==='feedback')await f.event('asset_feedback_added',{asset_id:'pdf',version_id:'v1',feedback:'Use a calm white background.',scope:'project',project_id:'shared-proof'});
 if(mutation==='selection')await f.event('asset_version_selected',{asset_id:'pdf',version_id:'v1'},'owner');
 if(mutation==='dispute')await f.event('asset_version_disputed',{asset_id:'pdf',version_id:'v2'});
 if(mutation==='incoming')await f.session.json('/api/incoming-mail/sync',{method:'POST',body:{}});
 // Trusted corruption/configuration fixtures; these fields have no operator edit route.
 if(mutation==='receipt')await f.trusted(e=>e.state.drive_original_reads[ready.transfer_id].metadata='1'.repeat(64));
 if(mutation==='lease')await f.trusted(e=>e.state.drive_original_reads[ready.transfer_id].lease_until++);
 if(mutation==='config')await f.trusted(e=>e.config.google_drive_originals.grant_id='different-fictional-grant');
 if(mutation==='clock')f.advance(45_000);
 if(mutation==='chunk')f.raw.entries.get(key).bytes[0]^=1;
 const retained=Buffer.from(f.raw.entries.get(key).bytes),before=await f.app.snapshot();await assert.rejects(f.friend.reconcile(ids,closure(o)),/changed|expired|context/);assert.equal(hash(await f.app.snapshot()),hash(before));assert.deepEqual(f.raw.entries.get(key).bytes,retained);assert.equal((await f.app.snapshot()).drive_original_reads[ready.transfer_id].recovery,undefined);
 if(mutation==='stop'){const fresh=await f.owner.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});await f.friend.reconcile(ids,closure(fresh));assert.equal((await f.app.snapshot()).drive_original_reads[ready.transfer_id].recovery.actor,'friend');}
});

function deferred(){let release,entered;const gate=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);return {gate,waiting,release,entered};}
for(const phase of ['before-media','body','chunk','final-manifest','archive','error'])test('Reading recovery fences late '+phase+' callback without attesting process exit',async t=>{
 const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids),d=deferred();t.after(d.release);let hit=false;
 if(['final-manifest','archive'].includes(phase))await f.owner.readDriveOriginal(ids);
 if(['before-media','body','error'].includes(phase))f.http(async u=>{
  if(hit)return;if(phase==='before-media'&&u.pathname.endsWith('/about')||phase!=='before-media'&&u.searchParams.get('alt')==='media'){hit=true;if(phase==='body'){const chunk=f.bytes.subarray(1_000_000);return new Response(new ReadableStream({async start(controller){d.entered();await d.gate;controller.enqueue(chunk);controller.close();}}),{status:206,headers:{'content-type':'application/pdf','content-range':`bytes 1000000-${f.bytes.length-1}/${f.bytes.length}`,'content-length':String(chunk.length),etag:f.source.etag}});}d.entered();await d.gate;if(phase==='error')return new Response(null,{status:403});}
 });
 if(['chunk','final-manifest','archive'].includes(phase))f.raw.onWrite=async(key,value)=>{if(hit)return;const archive=key==='workspace'&&JSON.parse(value).state.asset_index.pdf.versions.v1.verified_original;if(phase==='chunk'&&/\/1-[a-f0-9]{64}$/.test(key)||phase==='final-manifest'&&key.endsWith('/manifest')||phase==='archive'&&archive){hit=true;d.entered();await d.gate;}};
 const pending=f.owner.readDriveOriginal(ids);pending.catch(()=>{});await d.waiting;const o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});assert.equal((await f.app.snapshot()).drive_original_reads[ready.transfer_id].status,'Reading');
 const recovery=await f.friend.reconcile(ids,closure(o)),closed=structuredClone((await f.app.snapshot()).drive_original_reads[ready.transfer_id]);assert.equal(recovery.prior_status,'Reading');assert.equal(recovery.execution,'not-attested-stopped');assert.equal(o.chunks.length,['final-manifest','archive'].includes(phase)?2:1);if(o.unobserved.length)assert.equal(o.unobserved[0].index,1);
 d.release();await assert.rejects(pending);const after=await f.app.snapshot();assert.deepEqual(after.drive_original_reads[ready.transfer_id],closed);assert.equal(after.asset_index.pdf.versions.v1.verified_original,undefined);assert.equal(Object.values(after.events).filter(e=>e.type==='asset_original_archived').length,0);
 if(after.asset_index.pdf.versions.v1.original_transfer){const manual=after.asset_index.pdf.versions.v1.original_transfer,observed=await f.owner.recovery(ids,{kind:'manual',transfer_id:manual.id});await f.owner.reconcile(ids,closure(observed));}
 const backup=join(f.directory,'late.json');await downloadHostedBackup(f.session,backup);assert.equal((await readLifecycleBackup(backup)).files.size,o.chunks.length);
});

test('closure while token is deferred performs no later provider GET and cannot reopen Ready',async t=>{
 const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids),d=deferred();t.after(d.release);f.token(async()=>{d.entered();await d.gate;});const count=f.ranges.length,pending=f.owner.readDriveOriginal(ids);pending.catch(()=>{});await d.waiting;
 const o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});await f.friend.reconcile(ids,closure(o));const closed=structuredClone((await f.app.snapshot()).drive_original_reads[ready.transfer_id]);d.release();await assert.rejects(pending,/uncertain|closed|changed/);assert.equal(f.ranges.length,count);assert.deepEqual((await f.app.snapshot()).drive_original_reads[ready.transfer_id],closed);
});

test('lost closure acknowledgement and duplicate readback commit once without second observation or effects',async t=>{
 const f=await fixture(t,{sdk:true}),ready=await f.owner.readDriveOriginal(ids),o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});
 // SDK external HTTP loss is injected only for the already committed workspace CAS.
 f.storage.lose='workspace';await assert.rejects(f.friend.reconcile(ids,closure(o)),/uncertain|changed/);const state=await f.app.snapshot(),saved=state.drive_original_reads[ready.transfer_id].recovery,rangeCount=f.ranges.length;
 f.storage.readHook=key=>{if(key!=='workspace')throw Error('Duplicate closure must not observe chunks again');};f.advance(60_000);
 assert.deepEqual(await f.friend.reconcile(ids,closure(o)),saved);assert.deepEqual(await f.owner.reconcile(ids,closure(o)),saved);assert.equal(f.ranges.length,rangeCount);assert.deepEqual(await f.app.snapshot(),state);assert.equal(Object.values(state.events).filter(e=>e.type==='asset_original_reconciled').length,1);
 await assert.rejects(f.owner.reconcile(ids,closure(o,'Different retry reason.')),/retry differs/);
});

for(const change of ['note','clock','successor'])test('evidence copy '+change+' race leaves no closure, and a stale closure cannot replace current state',async t=>{
 const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids),o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});let hit=false;
 f.raw.onWrite=async key=>{if(hit||!key.includes('/recovery-'))return;hit=true;if(change==='clock')f.advance(45_000);else if(change==='note')await f.event('note_added',{note:'Signed mutation while evidence was copied.'});else await f.trusted(e=>{e.state.drive_original_reads[ready.transfer_id]={...e.state.drive_original_reads[ready.transfer_id],status:'Reading',claim:'fictional-successor',lease_until:Date.parse(at)+90_000};e.state.revision++;});};
 await assert.rejects(f.friend.reconcile(ids,closure(o)),/state or clock changed|workspace changed/i);assert.equal(hit,true);const state=await f.app.snapshot();assert.equal(state.drive_original_reads[ready.transfer_id].recovery,undefined);if(change==='successor')assert.equal(state.drive_original_reads[ready.transfer_id].claim,'fictional-successor');assert.equal(Object.values(state.events).filter(e=>e.type==='asset_original_reconciled').length,0);assert.equal([...f.raw.entries.keys()].filter(k=>k.includes('/recovery-')).length,1);
});

test('concurrent owner/friend closures use one CAS and lost HTTP ACK returns exact immutable outcome',async t=>{
 const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids),o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});const results=await Promise.allSettled([f.friend.reconcile(ids,closure(o)),f.owner.reconcile(ids,closure(o))]),state=await f.app.snapshot(),saved=state.drive_original_reads[ready.transfer_id].recovery;
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(Object.values(state.events).filter(e=>e.type==='asset_original_reconciled').length,1);assert.deepEqual(await f.owner.reconcile(ids,closure(o)),saved);
 // A new signed session reads back after a caller loses the whole response.
 let lose=true;const session=await sharedDeskSession({origin,key:f.env.EVZ_OPERATIONS_FRIEND_KEY,fetcher:async(url,options)=>{const response=await f.fetcher(url,options);if(lose&&new URL(url).pathname.endsWith('/reconcile')&&response.ok){lose=false;throw Error('Fictional HTTP acknowledgement lost');}return response;}});
 await assert.rejects(session.json('/api/project-original/shared-proof/pdf/v1/reconcile',{method:'POST',body:closure(o)}),/acknowledgement lost/);assert.deepEqual(await session.json('/api/project-original/shared-proof/pdf/v1/reconcile',{method:'POST',body:closure(o)}),saved);assert.deepEqual(await f.app.snapshot(),state);
});

test('manual old upload/finalizer callbacks cannot publish after exact recovery closure',async t=>{
 for(const phase of ['upload','finalize']){const f=await fixture(t,{manual:true}),transfer=await f.reserve(),d=deferred();t.after(d.release);
  if(phase==='finalize')for(let i=0;i<2;i++)await f.store.putChunk(transfer.manifest,i,f.bytes.subarray(i*1_000_000,(i+1)*1_000_000));let hit=false;
  f.raw.onWrite=async key=>{if(!hit&&(phase==='upload'&&/\/0-[a-f0-9]{64}$/.test(key)||phase==='finalize'&&key.endsWith('/manifest'))){hit=true;d.entered();await d.gate;}};
  const base='/api/project-original/shared-proof/pdf/v1/',pending=phase==='upload'?f.ownerSession.json(base+'chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':transfer.id},body:f.bytes.subarray(0,1_000_000)}):f.ownerSession.json(base+'complete',{method:'POST',body:{transfer_id:transfer.id}});pending.catch(()=>{});await d.waiting;
  const o=await f.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id});await f.friend.reconcile(ids,closure(o));const closed=structuredClone((await f.app.snapshot()).asset_index);d.release();await pending.catch(()=>{});assert.deepEqual((await f.app.snapshot()).asset_index,closed);assert.equal(closed.pdf.versions.v1.verified_original,undefined);
  await assert.rejects(f.ownerSession.json(base+'complete',{method:'POST',body:{transfer_id:transfer.id}}),/closed/);assert.equal(Object.values((await f.app.snapshot()).events).filter(e=>e.type==='asset_original_archived').length,0);
 }
});

test('lost archive acknowledgement can coexist with Reading recovery and a healthy verified original',async t=>{
 const f=await fixture(t,{bytes:validPDF(10)}),first=await f.owner.readDriveOriginal(ids);let hit=false;
 f.raw.onWrite=(key,value)=>{if(!hit&&key==='workspace'&&JSON.parse(value).state.asset_index.pdf.versions.v1.verified_original){hit=true;f.raw.lose=key;}};
 await assert.rejects(f.owner.readDriveOriginal(ids),/interrupted/);assert.equal(hit,true);f.raw.onWrite=null;
 await f.event('asset_version_selected',{asset_id:'pdf',version_id:'v1'},'owner');const before=await f.app.snapshot();assert.equal(before.drive_original_reads[first.transfer_id].status,'Reading');
 const o=await f.friend.recovery(ids,{kind:'drive',transfer_id:first.transfer_id});await f.friend.reconcile(ids,closure(o));const after=await f.app.snapshot();assert.deepEqual(after.asset_index,before.asset_index);assert.deepEqual((await f.friend.download(ids)).bytes,f.bytes);
 const backup=join(f.directory,'healthy.json');await downloadHostedBackup(f.session,backup);const saved=await readLifecycleBackup(backup);assert.equal(saved.files.size,2);assert.deepEqual(saved.files.get(`project-originals/${f.source.sha256}.pdf`),f.bytes);
 await StudioLifecycle.restore({input:backup,destination:join(f.directory,'healthy')});assert.deepEqual((await (await StudioLifecycle.open({directory:join(f.directory,'healthy')})).snapshot()).asset_index,before.asset_index);assert.equal(Object.values(after.events).filter(e=>e.type==='asset_original_archived').length,1);
});

for(const count of [0,1,2])test(`manual declaration with ${count} actual chunks retains exact observations through G1`,async t=>{
 const f=await fixture(t,{manual:true}),transfer=await f.reserve(),m=transfer.manifest;
 for(let i=0;i<count;i++)await f.store.putChunk(m,i,f.bytes.subarray(i*1_000_000,(i+1)*1_000_000));
 const before=await f.app.snapshot();await assert.rejects(validateBackupDependencies(before,new Map()),/reconcile.*original/);
 const observation=await f.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id});assert.deepEqual(observation.chunks.map(c=>c.disposition),Array.from({length:2},(_,i)=>i<count?'available':'absent-at-observation'));assert.deepEqual(observation.unobserved,[]);
 const recovery=await f.friend.reconcile(ids,closure(observation));assert.deepEqual(recovery.prior,before.asset_index.pdf.versions.v1.original_transfer);
 await assert.rejects(f.ownerSession.json('/api/project-original/shared-proof/pdf/v1/complete',{method:'POST',body:{transfer_id:transfer.id}}),/closed/);
 await assert.rejects(f.reserve(),/closed/);const backup=join(f.directory,'manual.json');await downloadHostedBackup(f.session,backup);const saved=await readLifecycleBackup(backup);assert.equal(saved.files.size,count);assert.equal(saved.state.asset_index.pdf.versions.v1.verified_original,undefined);
 await StudioLifecycle.restore({input:backup,destination:join(f.directory,'restored')});assert.deepEqual((await (await StudioLifecycle.open({directory:join(f.directory,'restored')})).snapshot()).asset_index,saved.state.asset_index);
});
for(const disposition of ['corrupt','wrong-size','unavailable','oversized'])test('manual '+disposition+' source observations never become whole original authority',async t=>{
 const f=await fixture(t,{manual:true}),transfer=await f.reserve(),m=transfer.manifest,key=`project-originals/${m.sha256}/0-${m.chunks[0]}`;
 await f.store.putChunk(m,0,f.bytes.subarray(0,1_000_000));
 // Trusted storage fault injection; no caller route can replace an immutable chunk.
 if(disposition==='corrupt')f.raw.entries.get(key).bytes[0]^=1;
 if(disposition==='wrong-size')f.raw.entries.get(key).bytes=Buffer.from('short observed bytes');
 if(disposition==='oversized')f.raw.entries.get(key).bytes=Buffer.alloc(1_000_001);
 if(disposition==='unavailable')f.raw.onRead=k=>{if(k===key)throw Error('Fictional storage read unavailable');};
 if(disposition==='oversized'){await assert.rejects(f.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id}),/bounded/);await assert.rejects(validateBackupDependencies(await f.app.snapshot(),new Map()),/reconcile.*original/);return;}
 const observation=await f.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id});assert.equal(observation.chunks[0].disposition,disposition==='unavailable'?'read-unavailable/uncertain':'corrupt-at-observation');
 await f.friend.reconcile(ids,closure(observation));f.raw.onRead=null;const backup=join(f.directory,'fault.json');await downloadHostedBackup(f.session,backup);const saved=await readLifecycleBackup(backup);assert.equal(saved.files.size,disposition==='unavailable'?0:1);
 if(saved.files.size){const c=observation.chunks[0],actual=saved.files.get(c.evidence);assert.equal(originalDigest(actual),c.sha256);assert.equal(actual.length,c.bytes);assert.deepEqual(actual,f.raw.entries.get(key).bytes);}
 await assert.rejects(f.owner.download(ids),/not verified/);
});

test('all existing import installers preflight partial original recovery before any destination write, including manual records',async t=>{
 const f=await fixture(t,{manual:true}),transfer=await f.reserve();await f.store.putChunk(transfer.manifest,0,f.bytes.subarray(0,1_000_000));const o=await f.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id});await f.friend.reconcile(ids,closure(o));
 const local=join(f.directory,'local.json');await downloadHostedBackup(f.session,local);const saved=await readLifecycleBackup(local),state=saved.state;
 // Trusted fictional import fixture conversion; this is not a production mutation route.
 state.mode='production';for(const r of Object.values(state.prospects))r.controlled=false;
 const backup=join(f.directory,'production-shaped.json');await writePortableLifecycleBackup(state,saved.files,backup,at);const sourceConfig={...f.app.config,mode:'production'},base={schema_version:1,workspace_id:'fictional-studio',run_id:state.run_id,mode:'production',state_schema:1,site_id:'fictional-site',deploy_id:'fictional-deploy',origin};
 const {prepareInertWorkspace,installInertWorkspace}=await import('./inert-shared-workspace.mjs'),{prepareManualWorkspace,installManualWorkspace}=await import('./shared-manual-records.mjs'),{prepareProjectWorkspace,installProjectWorkspace}=await import('./shared-project-continuation.mjs');
 const scopes=[['inert',prepareInertWorkspace,installInertWorkspace,{...base,capability:'inert-shared-v1',namespace:'evz-inert-shared-fictional-partial'}],['manual',prepareManualWorkspace,installManualWorkspace,{...base,capability:'shared-manual-records-v1',namespace:'evz-manual-shared-fictional-partial'}],['project',prepareProjectWorkspace,installProjectWorkspace,{...base,capability:'shared-project-continuation-v1',namespace:'evz-project-shared-fictional-partial'}]];
 for(const [kind,prepare,install,scope] of scopes){const packet=await prepare({backup,sourceConfig,scope}),raw=memoryBlobs(),store=new ConditionalLifecycleStore(raw,{[kind+'Binding']:packet.binding});
  for(const commit of [false,true]){await assert.rejects(install(store,packet,{commit}),/partial original recovery/);assert.equal(raw.entries.size,0,kind+' wrote before preflight');}
 }
 const {fixture:dispatchFixture}=await import('./fixtures/internal-dispatch.mjs'),df=await dispatchFixture(t,{authorize:false}),{prepareDispatchWorkspace,installDispatchWorkspace}=await import('./shared-internal-dispatch.mjs'),policy=structuredClone(df.app.config.internal_dispatch);
 policy.binding={...policy.binding,run_id:state.run_id,origin};policy.routes=policy.routes.map(route=>({...route,contact_sha256:hash(state.prospects[route.project_id].contact)}));const scope={...base,capability:policy.capability,namespace:policy.binding.namespace,policy_sha256:hash(policy)},packet=await prepareDispatchWorkspace({backup,sourceConfig,scope,dispatchPolicy:policy}),raw=memoryBlobs(),store=new ConditionalLifecycleStore(raw,{dispatchBinding:packet.binding});
 for(const commit of [false,true]){await assert.rejects(installDispatchWorkspace(store,packet,{commit}),/partial original recovery/);assert.equal(raw.entries.size,0);}
});

test('legacy and schema2 partial declarations without recovery refuse before restore destination creation',async t=>{
 for(const manual of [false,true]){const f=await fixture(t,{manual});if(manual)await f.reserve();else await f.owner.readDriveOriginal(ids);const state=await f.app.snapshot();assert.equal(hasProjectDependencies(state),true);
  for(const schema_version of [1,2]){const body=JSON.stringify(state),input=join(f.directory,'old-'+schema_version+'.json'),destination=join(f.directory,'rejected-'+schema_version);await writeFile(input,JSON.stringify({schema_version,body,sha256:hash(body),...(schema_version===2?{files:[],files_sha256:hash([])}:{})}));await assert.rejects(StudioLifecycle.restore({input,destination}),/Incomplete legacy|reconcile.*original/);await assert.rejects(access(destination),{code:'ENOENT'});}
 }
});
test('tampered evidence, dispositions, identities and package bounds reject before any restore writes',async t=>{
 const f=await fixture(t,{manual:true}),transfer=await f.reserve();await f.store.putChunk(transfer.manifest,0,f.bytes.subarray(0,1_000_000));const o=await f.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id});await f.friend.reconcile(ids,closure(o));const input=join(f.directory,'tamper.json');await downloadHostedBackup(f.session,input);const valid=JSON.parse(await readFile(input)),evidencePath=join(input+'.files',valid.files[0].sha256),actual=await readFile(evidencePath);
 const cases=['changed-bytes','missing-bytes','disposition','size','identity','unexpected-unavailable','path','chunks','receipts','count','total'];
 for(const mode of cases){const bundle=structuredClone(valid),state=JSON.parse(bundle.body),t=state.asset_index.pdf.versions.v1.original_transfer,r=t.recovery,c=r.observation.chunks[0];
  if(mode==='changed-bytes'){const changed=Buffer.from(actual);changed[0]^=1;await writeFile(evidencePath,changed);}if(mode==='missing-bytes')await rm(evidencePath);
  if(mode==='disposition')c.disposition='corrupt-at-observation';if(mode==='size')c.bytes=1_000_001;if(mode==='identity')c.expected_sha256='2'.repeat(64);if(mode==='unexpected-unavailable')c.disposition='read-unavailable/uncertain';if(mode==='path')bundle.files[0].path='../escape.bin';
  if(mode==='chunks'){t.manifest.chunks.push(...Array(63).fill('1'.repeat(64)));t.manifest.bytes=65_000_000;}
  if(mode==='receipts')state.drive_original_reads=Object.fromEntries(Array.from({length:65},(_,i)=>[String(i),{}]));
  // Reseal adversarial metadata so byte/disposition checks, not the outer checksum, decide.
  const {snapshot,...body}=r.observation;r.observation.snapshot=hash(body);state.events[r.event_id].data.snapshot=r.observation.snapshot;
  if(mode==='disposition'||mode==='size'||mode==='identity'||mode==='unexpected-unavailable'){const old=r.event_id,next='original-recovery-'+hash({kind:'manual',target:r.observation.target,snapshot:r.observation.snapshot}).slice(0,32);state.events[next]={...state.events[old],id:next};delete state.events[old];r.event_id=next;}
  bundle.body=JSON.stringify(state);bundle.sha256=hash(bundle.body);
  if(mode==='count')bundle.files=Array(6001).fill(bundle.files[0]);if(mode==='total')bundle.files=Array.from({length:9},(_,i)=>({path:`project-originals/${originalDigest(Buffer.from(String(i)))}.pdf`,sha256:'1'.repeat(64),bytes:64_000_000}));bundle.files_sha256=hash(bundle.files);await writeFile(input,JSON.stringify(bundle));
  const destination=join(f.directory,'tampered-'+mode);await assert.rejects(StudioLifecycle.restore({input,destination}));await assert.rejects(access(destination),{code:'ENOENT'});await writeFile(evidencePath,actual);
 }
});

test('legacy Drive target is resolved from exact current policy; obsolete policies without a target stay held',async t=>{
 for(const drift of [false,true]){const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids);await f.trusted(e=>{delete e.state.drive_original_reads[ready.transfer_id].target;if(drift)e.config.google_drive_originals.grant_id='different-fictional-grant';});
  if(drift){await assert.rejects(f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id}),/Legacy Drive receipt policy/);continue;}
  const before=await f.app.snapshot(),o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id}),r=await f.friend.reconcile(ids,closure(o));assert.deepEqual(r.prior,before.drive_original_reads[ready.transfer_id]);const output=join(f.directory,'legacy-observed.json');await downloadHostedBackup(f.session,output);assert.equal((await readLifecycleBackup(output)).files.size,1);
 }
});

test('studio-wide manual transfer observation rejects a different project before any chunk reads',async t=>{
 const f=await fixture(t,{manual:true}),{fixtureProspect}=await import('./lifecycle-fixtures.mjs');
 // Trusted fictional record import; the signed route under test cannot import prospects.
 await f.app.apply(fixtureProspect('other-project',at),{actor:'controlled-fixture'});
 await f.event('asset_registered',{asset_id:'studio-pdf',scope:'studio',kind:'template',name:'Fictional studio PDF',version_id:'v1',version_label:'v1',reference:f.source.reference},'owner');
 const context=await f.owner.context('shared-proof'),transfer=await f.ownerSession.json('/api/project-original/shared-proof/studio-pdf/v1/reserve',{method:'POST',body:{context_sha256:context.context_sha256,manifest:originalManifest(f.bytes),source:{reference:f.source.reference,name:f.source.name,mime_type:'application/pdf',modified_time:at}}});let chunkReads=0;f.raw.onRead=key=>{if(key.startsWith('project-originals/'))chunkReads++;};
 await assert.rejects(f.friend.recovery({project_id:'other-project',asset_id:'studio-pdf',version_id:'v1'},{kind:'manual',transfer_id:transfer.id}),/transfer.*target|target.*transfer/i);assert.equal(chunkReads,0);const proper=await f.friend.recovery({project_id:'shared-proof',asset_id:'studio-pdf',version_id:'v1'},{kind:'manual',transfer_id:transfer.id});assert.equal(proper.target.project_id,'shared-proof');
});

test('healthy completed manual original keeps G1 at the existing 600-character registered reference limit',async t=>{
 const reference='private-path:'+'r'.repeat(600-'private-path:'.length),f=await fixture(t,{manual:true,bytes:validPDF(10),reference});
 await f.owner.upload(ids,f.bytes,{reference,name:f.source.name,mime_type:'application/pdf',modified_time:at});const output=join(f.directory,'long-reference.json');await downloadHostedBackup(f.session,output);const saved=await readLifecycleBackup(output);assert.equal(saved.state.asset_index.pdf.versions.v1.reference.length,600);assert.deepEqual(saved.files.get(`project-originals/${f.source.sha256}.pdf`),f.bytes);
 await StudioLifecycle.restore({input:output,destination:join(f.directory,'long-reference')});assert.deepEqual((await f.friend.download(ids)).bytes,f.bytes);
});

test('completed valid 30,591,178-byte fictional PDF keeps 31 exact ranges, fresh role readback and complete G1',async t=>{
 const bytes=validPDF(30_590_551);assert.equal(bytes.length,30_591_178);const f=await fixture(t,{bytes});
 for(let i=0;i<31;i++){const part=await f.owner.readDriveOriginal(ids);assert.equal(part.chunks_verified,i+1);assert.equal(part.status,'Ready');}
 const friend=await connectSharedOriginals({origin,key:f.env.EVZ_OPERATIONS_FRIEND_KEY,fetcher:f.fetcher}),done=await friend.readDriveOriginal(ids);assert.equal(done.status,'Verified');assert.equal(done.sha256,originalDigest(bytes));assert.deepEqual((await friend.download(ids)).bytes,bytes);
 assert.deepEqual(f.ranges,Array.from({length:31},(_,i)=>({start:i*1_000_000,end:Math.min(bytes.length,(i+1)*1_000_000)-1})));await f.event('asset_version_selected',{asset_id:'pdf',version_id:'v1'},'friend');
 const before=await f.app.snapshot(),output=join(f.directory,'complete.json');await downloadHostedBackup(await sharedDeskSession({origin,key:f.env.EVZ_OPERATIONS_FRIEND_KEY,fetcher:f.fetcher}),output);const complete=await readLifecycleBackup(output);assert.equal(complete.files.size,1);assert.deepEqual(complete.state,before);assert.deepEqual(complete.files.get(`project-originals/${done.sha256}.pdf`),bytes);
 const destination=join(f.directory,'complete');await StudioLifecycle.restore({input:output,destination});const local=await StudioLifecycle.open({directory:destination}),{readProjectAsset}=await import('./project-assets.mjs');assert.deepEqual((await readProjectAsset(local,'shared-proof','pdf','v1')).bytes,bytes);
 const changed=structuredClone(complete.state);changed.asset_index.pdf.versions.v1.original_transfer.manifest.chunks[0]='1'.repeat(64);await assert.rejects(validateBackupDependencies(changed,complete.files),/actual whole bytes/);
});

test('fresh disabled fictional rebind can inspect retained evidence while no manifest or original authority is installed',async t=>{
 const f=await fixture(t),ready=await f.owner.readDriveOriginal(ids),o=await f.friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});await f.friend.reconcile(ids,closure(o));const out=join(f.directory,'portable.json');await downloadHostedBackup(f.session,out);const saved=await readLifecycleBackup(out),raw=memoryBlobs(),store=blobProjectOriginalStore(raw),{initialConfig}=await import('./lifecycle.mjs');
 for(const [path,bytes] of saved.files)await store.putEvidence(path,bytes);await raw.setJSON('workspace',{schema_version:1,config:{...structuredClone(initialConfig),run_id:saved.state.run_id,preview_seeded_at:at},state:saved.state},{onlyIfNew:true});
 const handler=createHostedDesk({env:f.env,storeFactory:()=>raw,now:()=>new Date(at),googleDriveOptions:{getAccessToken:deny('restored Drive token'),fetcher:deny('restored Drive HTTP')},googleOAuthOptions:{storeFactory:deny('restored credential store')},refinementOptions:{catalogRequest:deny('restored catalogue'),clientFactory:deny('restored inference')},internalDispatchOptions:{fetcher:deny('restored internal HTTP')}}),fetcher=(url,options)=>handler(new Request(url,options)),friend=await connectSharedOriginals({origin,key:f.env.EVZ_OPERATIONS_FRIEND_KEY,fetcher});
 const observed=await friend.recovery(ids,{kind:'drive',transfer_id:ready.transfer_id});assert.deepEqual(observed.recovery,saved.state.drive_original_reads[ready.transfer_id].recovery);await assert.rejects(friend.download(ids),/not verified/);await assert.rejects(friend.readDriveOriginal(ids),/policy|unavailable/);assert.ok([...raw.entries.keys()].every(key=>key==='workspace'||key.includes('/recovery-')));assert.equal(raw.entries.has(`project-originals/${f.source.sha256}/manifest`),false);
 const backup=join(f.directory,'fresh-evidence.json');await downloadHostedBackup(await sharedDeskSession({origin,key:f.env.EVZ_OPERATIONS_OWNER_KEY,fetcher}),backup);assert.deepEqual((await readLifecycleBackup(backup)).files,saved.files);
});

test('complete mixed G1 retains partial original, actual authoring resources/rasters, opaque Python history and all liabilities',async t=>{
 const partial=await fixture(t,{manual:true}),transfer=await partial.reserve();await partial.store.putChunk(transfer.manifest,0,partial.bytes.subarray(0,1_000_000));const o=await partial.friend.recovery(ids,{kind:'manual',transfer_id:transfer.id});await partial.friend.reconcile(ids,closure(o));const p=join(partial.directory,'partial.json');await downloadHostedBackup(partial.session,p);const saved=await readLifecycleBackup(p);
 const {fixture:dispatchFixture}=await import('./fixtures/internal-dispatch.mjs'),f=await dispatchFixture(t,{authorize:false,manual:true,completeDependencies:true}),session=await f.session('friend'),base=join(partial.directory,'base.json');await downloadHostedBackup(session,base);const mixed=await readLifecycleBackup(base),state=mixed.state,files=mixed.files;
 // Offline fictional fixture merge, not a shared caller mutation or installation.
 state.asset_index.pdf=saved.state.asset_index.pdf;Object.assign(state.events,saved.state.events);for(const [path,bytes] of saved.files)files.set(path,bytes);
 const id='author-'+'d'.repeat(32),runtime={python:'C:/fictional-never-executed/python.exe',pdftoppm:'C:/fictional-never-executed/pdftoppm.exe',proposal_assets:'C:/fictional-never-executed/assets',fonts:{},images:{}},context=projectContext(state,'shared-proof');
 const job={id,project_id:'shared-proof',work_id:'website-concepts',actor:'owner',status:'Held',context_sha256:context.context_sha256,runtime_sha256:hash(runtime),references:[]};state.prospects['shared-proof'].project_work['website-concepts'].history??=[];state.prospects['shared-proof'].project_work['website-concepts'].history.push({history:[{execution:job}]});files.set(`project-authored/${id}/context.json`,Buffer.from(JSON.stringify(context)));files.set(`project-authored/${id}/runtime.json`,Buffer.from(JSON.stringify(runtime)));
 state.ai_attempts.historic={...state.ai_attempts.historic,request:{contents:[{text:'Retained fictional input'}]},schema:{type:'object'},raw:{text:'Retained fictional output',usage:{promptTokenCount:21,candidatesTokenCount:8}},count:{totalTokens:21},reserved_microcredits:120};state.refinement_generation_policy={policy_sha256:'a'.repeat(64),paused_at:at,approved_by:'owner',history:[{policy_sha256:'b'.repeat(64),paused_at:at}]};state.gateway_proof={revision:14,paused:true,attempts:Array.from({length:4},(_,i)=>({id:'consumed-'+i,status:'Consumed',reserved_microcredits:100}))};
 const before=structuredClone(state),output=join(partial.directory,'mixed.json');await writePortableLifecycleBackup(state,files,output,at);const complete=await readLifecycleBackup(output);assert.deepEqual(complete.state,before);assert.ok([...complete.files.keys()].some(p=>p.endsWith('/review-page-1.png')));assert.ok([...complete.files.keys()].some(p=>p.endsWith('/authored.json')));assert.ok([...complete.files.keys()].some(p=>p.endsWith('/recovery-'+o.chunks[0].sha256+'.bin')));assert.deepEqual(JSON.parse(complete.files.get(`project-authored/${id}/runtime.json`)),runtime);
 const destination=join(partial.directory,'mixed');await StudioLifecycle.restore({input:output,destination});const restored=await (await StudioLifecycle.open({directory:destination})).snapshot();for(const key of ['asset_index','ai_attempts','gateway_proof','refinement_generation_policy'])assert.deepEqual(restored[key],before[key]);assert.deepEqual(restored.prospects,before.prospects);assert.equal(restored.operations.requests.old.status,'Uncertain');assert.equal(before.operations.requests.old.status,'Pending');
 const {prepareProjectWorkspace}=await import('./shared-project-continuation.mjs'),scope={...f.packet.binding.scope,capability:'shared-project-continuation-v1'};delete scope.policy_sha256;await assert.rejects(prepareProjectWorkspace({backup:output,sourceConfig:f.app.config,scope}),e=>/Unsupported retained dependencies/.test(e.message)&&e.message.includes('runtime.json'));assert.deepEqual((await readLifecycleBackup(output)).state,before);
 const {installProjectWorkspace}=await import('./shared-project-continuation.mjs'),{installDispatchWorkspace}=await import('./shared-internal-dispatch.mjs');
 // Adversarial repackaging adds opaque history to genuine fixture packets; neither is installed.
 for(const [kind,original,install] of [['project',f.base.packet,installProjectWorkspace],['dispatch',f.packet,installDispatchWorkspace]]){
  const packet={envelope:structuredClone(original.envelope),binding:structuredClone(original.binding),files:new Map(original.files)},sourceName=kind+'_source';packet.envelope.state.prospects['shared-proof'].project_work['website-concepts'].history??=[];packet.envelope.state.prospects['shared-proof'].project_work['website-concepts'].history.push({execution:job});for(const name of ['context.json','runtime.json'])packet.files.set(`project-authored/${id}/${name}`,files.get(`project-authored/${id}/${name}`));
  const manifest=packet.envelope[sourceName];manifest.source_state_sha256=hash(packet.envelope.state);manifest.dependencies=[...packet.files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:'shared-immutable-dependency'}));packet.binding.manifest_sha256=hash(manifest);const raw=memoryBlobs(),store=new ConditionalLifecycleStore(raw,{[kind+'Binding']:packet.binding});for(const commit of [false,true]){await assert.rejects(install(store,packet,{commit}),/Unsupported retained dependencies/);assert.equal(raw.entries.size,0);}
 }
 const oversized={envelope:structuredClone(f.packet.envelope),binding:structuredClone(f.packet.binding),files:f.packet.files};oversized.envelope.state.ai_attempts.historic.receipt='F'.repeat(20_000_000);oversized.envelope.dispatch_source.source_state_sha256=hash(oversized.envelope.state);oversized.binding.manifest_sha256=hash(oversized.envelope.dispatch_source);const raw=memoryBlobs(),store=new ConditionalLifecycleStore(raw,{dispatchBinding:oversized.binding});for(const commit of [false,true]){await assert.rejects(installDispatchWorkspace(store,oversized,{commit}),/20 MB/);assert.equal(raw.entries.size,0);}
});
