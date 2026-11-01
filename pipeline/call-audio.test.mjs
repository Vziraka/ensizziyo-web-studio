import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {StudioLifecycle} from './lifecycle.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';import {saveCallAudio,readCallAudio,localAudioStore,blobAudioStore,audioRequest} from './call-audio.mjs';import {serveLifecycle} from './lifecycle-server.mjs';
const at='2026-10-24T05:00:00.000Z',started='2026-10-24T04:59:00.000Z';
const bytes=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(20)]); // Container fixture only; no speech or acoustic proof.
const input=(id,kind='call')=>({id,prospect_id:'audio-proof',call_id:'audio-call',kind,started_at:started,ended_at:at,permission_confirmed:true,recorded_by:'owner',mime:'audio/webm'});
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'evz-audio-proof-'));t.after(()=>rm(directory,{recursive:true,force:true}));const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)});await app.apply(fixtureProspect('audio-proof',at));await app.apply({id:'claim-audio',prospect_id:'audio-proof',type:'call_claimed',at,data:{}},{actor:'owner'});return app;}
test('audio is private, immutable and tied to the exact operator/call before and after its outcome',async t=>{
 const app=await setup(t),store=localAudioStore(app.directory),[saved]=await Promise.all([saveCallAudio(app,store,input('first-clip'),bytes,'owner'),saveCallAudio(app,store,input('first-clip'),bytes,'owner')]);assert.equal(saved.status,'Stored');assert.equal(saved.recorded_by,'owner');
 assert.equal((await app.snapshot()).prospects['audio-proof'].calls['audio-call'],undefined);
 assert.deepEqual((await readCallAudio(app,store,'audio-proof','first-clip')).bytes,bytes);
 const reopened=await StudioLifecycle.open({directory:app.directory,now:app.now});await saveCallAudio(reopened,store,input('first-clip'),bytes,'owner');
 assert.equal(Object.keys((await app.snapshot()).prospects['audio-proof'].call_audio).length,1);
 await assert.rejects(saveCallAudio(app,store,input('first-clip'),Buffer.concat([bytes,Buffer.from([1])]),'owner'),/conflicts/);
 await app.apply({id:'audio-call',prospect_id:'audio-proof',type:'call_logged',at,data:{call_id:'audio-call',outcome:'connected',intent:'requested_info',performed_at:at,simulated:true,desk:true,focus:'website'}},{actor:'owner'});
 await saveCallAudio(app,store,{...input('own-note','operator_note'),recorded_by:'friend'},bytes,'friend');
 const transcript={id:'audio-transcript',prospect_id:'audio-proof',type:'transcript_added',at,data:{call_id:'audio-call',text:'A fictional manually reviewed customer transcript.',permission_confirmed:true,audio_ids:['own-note']}};
 await assert.rejects(app.apply(transcript),/exact saved call/);transcript.data.audio_ids=['first-clip'];await app.apply(transcript);
 const record=(await app.snapshot()).prospects['audio-proof'];assert.deepEqual(record.transcripts['audio-call'].audio_ids,['first-clip']);assert.match(record.transcripts['audio-call'].source,/Operator-supplied/);assert.equal(record.calls['audio-call'].note,undefined);
 const backup=join(app.directory,'audio-backup.json'),destination=join(app.directory,'restored-audio');assert.equal((await app.backup(backup)).audio_clips,2);
 assert.equal((await StudioLifecycle.restore({input:backup,destination})).audio_clips,2);const restored=await StudioLifecycle.open({directory:destination,now:app.now});assert.deepEqual((await readCallAudio(restored,localAudioStore(destination),'audio-proof','first-clip')).bytes,bytes);assert.equal(restored.config.outreach_enabled,false);
 await rm(backup+'.files',{recursive:true});await assert.rejects(StudioLifecycle.restore({input:backup,destination:join(app.directory,'must-not-restore')}));
});
test('artifact reservation prevents quota bypass and forgery; a lost blob acknowledgement reconciles bytes without overwriting',async t=>{
 const app=await setup(t),objects=new Map();let writes=0;
 const raw={async set(key,value,options){assert.equal(options.onlyIfNew,true);if(objects.has(key))return {modified:false};objects.set(key,Buffer.from(value));writes++;throw Error('Lost successful response');},async getWithMetadata(key,options){assert.equal(options.consistency,'strong');return objects.has(key)?{data:objects.get(key)}:null;}};
 await saveCallAudio(app,blobAudioStore(raw),input('blob-clip'),bytes,'owner');assert.equal(writes,1);
 assert.equal((await readCallAudio(app,blobAudioStore(raw),'audio-proof','blob-clip')).audio.status,'Stored');
 await assert.rejects(app.apply({id:'forged-reservation',prospect_id:'audio-proof',type:'call_audio_reserved',at,data:{...input('fake'),recorded_by:'owner'}}),/authenticated private storage/);
 await app.change(state=>{state.prospects['audio-proof'].call_audio.quota={bytes:200_000_000,ended_at:at};});
 await assert.rejects(saveCallAudio(app,blobAudioStore(raw),input('over-quota'),bytes,'owner'),/allowance is full/);assert.equal(writes,1);
});
test('actual private HTTP upload/download enforces session, source metadata and exact binary integrity',async t=>{
 const app=await setup(t),server=await serveLifecycle(app,{port:0,quiet:true});t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
 const page=await fetch(base),cookie=page.headers.get('set-cookie').split(';')[0],bootstrap=await(await fetch(base+'/api/bootstrap',{headers:{cookie}})).json();
 const upload={method:'POST',headers:{cookie,'x-studio-token':bootstrap.csrf,'content-type':'audio/webm','x-studio-audio':JSON.stringify(input('http-clip'))},body:bytes};
 const missing=await fetch(base+'/api/call-audio',{...upload,headers:{...upload.headers,'x-studio-token':''}});assert.equal(missing.status,400);
 const saved=await fetch(base+'/api/call-audio',upload);assert.equal(saved.status,200);assert.equal((await saved.json()).status,'Stored');
 const download=await fetch(base+'/call-audio/audio-proof/http-clip',{headers:{cookie}});assert.equal(download.status,200);assert.equal(download.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 assert.notEqual((await fetch(base+'/call-audio/audio-proof/http-clip')).status,200);
 await assert.rejects(audioRequest(new Request(base+'/api/call-audio',{method:'POST',headers:{'x-studio-audio':'{}'},body:Buffer.alloc(4_000_001)})),/4 MB/);
});
test('a private file committed before metadata interruption is verified later without recording or uploading again',async t=>{
 const app=await setup(t),apply=app.apply.bind(app);let interrupt=true;
 app.apply=async(event,options)=>{if(event.type==='call_audio_stored'&&interrupt){interrupt=false;throw Error('Simulated metadata interruption');}return apply(event,options);};
 const server=await serveLifecycle(app,{port:0,quiet:true});t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
 const page=await fetch(base),cookie=page.headers.get('set-cookie').split(';')[0],csrf=(await(await fetch(base+'/api/bootstrap',{headers:{cookie}})).json()).csrf;
 const failed=await fetch(base+'/api/call-audio',{method:'POST',headers:{cookie,'x-studio-token':csrf,'content-type':'audio/webm','x-studio-audio':JSON.stringify(input('interrupted-audio'))},body:bytes});assert.equal(failed.status,400);assert.equal((await app.snapshot()).prospects['audio-proof'].call_audio['interrupted-audio'].status,'Reserved');
 const verified=await fetch(base+'/api/call-audio-check',{method:'POST',headers:{cookie,'x-studio-token':csrf,'content-type':'application/json'},body:JSON.stringify({prospect_id:'audio-proof',id:'interrupted-audio'})});assert.equal(verified.status,200);assert.equal((await verified.json()).status,'Stored');
 const state=await app.snapshot();assert.equal(Object.keys(state.prospects['audio-proof'].call_audio).length,1);assert.equal(Object.values(state.events).filter(e=>e.type==='call_audio_stored').length,1);
});
