import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,symlink,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {serveLifecycle} from './lifecycle-server.mjs';
import {createOperatorAuth} from './operators.mjs';
import {StudioLifecycle} from './lifecycle.mjs';
import {projectContext,resolveProject} from './project-work.mjs';
import {archiveProjectAsset,readProjectAsset,recoverDriveAsset,downloadOriginal} from './project-assets.mjs';
const at='2026-10-24T12:00:00.000Z',bytes=Buffer.from('%PDF-1.7\noriginal test bytes\n%%EOF'),sha=createHash('sha256').update(bytes).digest('hex');
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'evz-project-assets-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)});
 await app.apply({id:'project',prospect_id:'p',type:'workspace_project_created',at,data:{name:'STUDIO TEST Existing Company',purpose:'Recover originals',controlled:true}},{actor:'owner'});
 await app.apply({id:'asset',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:'mockup',scope:'project',project_id:'p',name:'Mockups',kind:'mockup',version_id:'r3',version_label:'Revision 3',reference:'drive:original-file-123456'}},{actor:'owner'});
 return app;
}
const input=app=>({project_id:'p',asset_id:'mockup',version_id:'r3',expected_sha256:sha,context_sha256:projectContext(app,'p').context_sha256});
const source={reference:'drive:original-file-123456',name:'original.pdf',mime_type:'application/pdf',modified_time:at,account:'business@example.invalid'};
test('exact normalized resolution never guesses, creates a duplicate or silently selects an ambiguous company',async t=>{
 const app=await setup(t),state=await app.snapshot();assert.equal(resolveProject(state,'  studio test   EXISTING Company ').project_id,'p');
 assert.throws(()=>resolveProject(state,'Existing Company'),/No exact/);assert.throws(()=>resolveProject(state,''),/company name/);
 state.prospects.other={...state.prospects.p,id:'other'};assert.throws(()=>resolveProject(state,'STUDIO TEST Existing Company'),/Ambiguous/);
 assert.equal((await app.snapshot()).revision,2);
});
test('verified original read checks scope, hash and stale context and never approves its draft',async t=>{
 const app=await setup(t),state=await app.snapshot(),request=input(state);
 const receipt=await archiveProjectAsset(app,request,bytes,source,'owner');assert.equal(receipt.sha256,sha);
 const state2=await app.snapshot(),context=projectContext(state2,'p');assert.equal(context.source.approved_assets.length,0);assert.equal(context.source.assets[0].versions[0].verified_original.sha256,sha);
 assert.equal(state2.asset_index.mockup.baseline_version,null);assert.deepEqual((await readProjectAsset(app,'p','mockup','r3')).bytes,bytes);
 const changed=Buffer.from('%PDF-1.7\nchanged original\n%%EOF');await assert.rejects(archiveProjectAsset(app,{...input(state2),expected_sha256:createHash('sha256').update(changed).digest('hex')},changed,source,'owner'),/different original bytes/);
 assert.equal((await app.snapshot()).asset_index.mockup.versions.r3.verified_original.sha256,sha);
 await assert.rejects(archiveProjectAsset(app,request,bytes,source,'owner'),/context changed/);
 await assert.rejects(readProjectAsset(app,'other','mockup','r3'),/project/);
 await assert.rejects(readProjectAsset(app,'p','mockup','../r3'),/version/);
  await unlink(join(app.directory,'project-originals',sha+'.pdf'));await assert.rejects(readProjectAsset(app,'p','mockup','r3'),{code:'ENOENT'});
 await writeFile(join(app.directory,'project-originals',sha+'.pdf'),'corrupt');await assert.rejects(readProjectAsset(app,'p','mockup','r3'),/hash|integrity/);
});
test('missing, wrong source, corrupt original and unsafe archive paths fail before context registration',async t=>{
 const app=await setup(t),request=input(await app.snapshot());
 await assert.rejects(readProjectAsset(app,'p','mockup','r3'),/not archived/);
 await assert.rejects(archiveProjectAsset(app,request,Buffer.from('wrong'),source,'owner'),/hash/);
 await assert.rejects(archiveProjectAsset(app,request,bytes,{...source,reference:'drive:other-file-123456'},'owner'),/source/);
  await assert.rejects(archiveProjectAsset(app,request,bytes,{...source,mime_type:'text/html'},'owner'),/source/);
 await assert.rejects(archiveProjectAsset(app,request,bytes,source,'unknown'),/signed operator/);
 await writeFile(join(app.directory,'project-originals'),'not a directory');await assert.rejects(archiveProjectAsset(app,request,bytes,source,'owner'));
 assert.equal((await app.snapshot()).revision,2);
});
test('Drive recovery binds business profile, file id, size, source and expected bytes without a model',async t=>{
 const app=await setup(t),request=input(await app.snapshot()),calls=[];
 const connector={accountLinks:{google_drive:'link_business'},async call(name,args){calls.push([name,args]);return {structuredContent:name.endsWith('get_profile')?{email:'business@example.invalid'}:name.endsWith('get_file_metadata')?{id:'original-file-123456',title:'original.pdf',mime_type:'application/pdf',size:String(bytes.length),modified_time:at}:{id:'original-file-123456',file_size_bytes:bytes.length,file_uri:{download_url:'https://files.oaiusercontent.com/raw?redacted'}}};}};
 await recoverDriveAsset(app,request,{connector,email:'business@example.invalid',download:async()=>bytes});
 assert.equal(calls.length,3);assert.equal(calls[2][1].include_base64,false);assert.deepEqual((await readProjectAsset(app,'p','mockup','r3')).bytes,bytes);
 const other=await setup(t);await assert.rejects(recoverDriveAsset(other,input(await other.snapshot()),{connector,email:'personal@example.invalid',download:async()=>bytes}),/business account/);
});
test('stream download rejects arbitrary protocols, hosts, redirects, MIME and oversized bytes',async()=>{
 for(const url of ['file:///C:/secret','http://files.oaiusercontent.com/raw','https://files.oaiusercontent.com.evil.invalid/raw','https://user:pass@files.oaiusercontent.com/raw'])await assert.rejects(downloadOriginal(url,3,{fetcher:async()=>{throw Error('Must not fetch');}}),/stream/);
 await assert.rejects(downloadOriginal('https://files.oaiusercontent.com/raw',3,{fetcher:async()=>new Response('abc',{status:302,headers:{location:'https://evil.invalid'}})}),/download/);
 await assert.rejects(downloadOriginal('https://files.oaiusercontent.com/raw',3,{fetcher:async()=>new Response('abcd')}),/size/);
 assert.deepEqual(await downloadOriginal('https://files.oaiusercontent.com/raw',3,{fetcher:async()=>new Response('abc')}),Buffer.from('abc'));
});
test('archive rejects a symlink directory and a replaced original before reading outside storage',async t=>{
 const app=await setup(t),outside=await mkdtemp(join(tmpdir(),'evz-asset-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));
 await symlink(outside,join(app.directory,'project-originals'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(archiveProjectAsset(app,input(await app.snapshot()),bytes,source,'owner'),/Unsafe/);
 assert.equal((await app.snapshot()).revision,2);
});
test('signed HTTP client resolves by name, verifies original bytes and writes exact scoped notes/feedback with stale protection',async t=>{
 const app=await setup(t);await archiveProjectAsset(app,input(await app.snapshot()),bytes,source,'owner');
 const credentials={EVZ_OPERATIONS_OWNER_KEY:randomBytes(32).toString('base64url'),EVZ_OPERATIONS_FRIEND_KEY:randomBytes(32).toString('base64url'),EVZ_OPERATIONS_SESSION_SECRET:randomBytes(32).toString('base64url')},server=await serveLifecycle(app,{port:0,quiet:true,operatorAuth:createOperatorAuth(credentials)});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`,landing=await fetch(base),session=landing.headers.get('set-cookie').split(';')[0],bootstrap=await fetch(base+'/api/bootstrap',{headers:{cookie:session}}),{csrf}=await bootstrap.json();
 const route='/api/project-resolve?name='+encodeURIComponent('STUDIO TEST Existing Company');assert.equal((await fetch(base+route,{headers:{cookie:session}})).status,401);
 const login=await fetch(base+'/api/login',{method:'POST',headers:{cookie:session,'x-studio-token':csrf,'content-type':'application/json'},body:JSON.stringify({key:credentials.EVZ_OPERATIONS_FRIEND_KEY})}),cookie=session+'; '+login.headers.get('set-cookie').split(';')[0],headers={cookie,'x-studio-token':csrf,'content-type':'application/json'};
 const packet=await(await fetch(base+route,{headers})).json();assert.equal(packet.project_id,'p');assert.equal(packet.context.source.approved_assets.length,0);
 const asset=await fetch(base+'/api/project-asset/p/mockup/r3',{headers});assert.equal(asset.status,200);assert.equal(asset.headers.get('x-content-sha256'),sha);assert.equal(createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex'),sha);
 const event={id:'api-note',prospect_id:'p',type:'note_added',at,data:{note:'Exact internal recovery note.'}},saved=await fetch(base+'/api/event',{method:'POST',headers,body:JSON.stringify({revision:packet.revision,event})});assert.equal(saved.status,200);
 const stale=await fetch(base+'/api/event',{method:'POST',headers,body:JSON.stringify({revision:packet.revision,event:{...event,id:'stale-note'}})});assert.equal(stale.status,400);
 const current=await(await fetch(base+route,{headers})).json();assert.equal(current.context.source.project_note,event.data.note);
 const feedback={id:'api-feedback',prospect_id:'studio-assets',type:'asset_feedback_added',at,data:{asset_id:'mockup',version_id:'r3',scope:'project',project_id:'p',feedback:'Recovery readback only; no design approval.'}};
 assert.equal((await fetch(base+'/api/event',{method:'POST',headers,body:JSON.stringify({revision:current.revision,event:feedback})})).status,200);
 const ordinary=await(await fetch(base+route,{headers})).json();assert.deepEqual(ordinary.context.source.preferences,[]);const reread=await(await fetch(base+route+'&preferences=1',{headers})).json();assert.equal(reread.context.source.preferences[0].feedback,feedback.data.feedback);assert.equal(reread.context.source.preferences[0].actor,'friend');assert.equal(reread.context.source.approved_assets.length,0);
 assert.notEqual((await fetch(base+'/api/project-asset/p/mockup/not-registered',{headers})).status,200);
});
