import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getStore} from '@netlify/blobs';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {capacityCandidate,verifyCapacityCandidate,rehearseCapacity} from './lifecycle-capacity.mjs';
import {sourceContentHash} from './sources.mjs';
import {projectDashboard} from './hosted-desk.mjs';
import {deskSnapshotPage} from './desk-snapshot.mjs';
import {readDeskSnapshot} from './lifecycle-ui/snapshot-read.js';

const at='2026-10-24T16:00:00.000Z';
function sdkMemory(){
 let data,version=0;const requests=[];
 const store=getStore({name:'capacity-local-only',siteID:'synthetic-site',token:'synthetic-token',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  const h=new Headers(options.headers),method=options.method.toUpperCase();requests.push({url:String(url),method,match:h.get('if-match'),bytes:options.body?.length??0});
  if(method==='GET')return data?new Response(data,{headers:{etag:`"${version}"`}}):new Response(null,{status:404});
  assert.equal(method,'PUT');assert.ok(h.get('if-match')||h.get('if-none-match')==='*');
  if(h.get('if-none-match')==='*'&&data||h.get('if-match')&&h.get('if-match')!==`"${version}"`)return new Response(null,{status:412});
  data=options.body;version++;return new Response(null,{headers:{etag:`"${version}"`}});
 }});
 return {store,requests};
}
async function volumeFixture(){
 const {store}=sdkMemory(),adapter=new ConditionalLifecycleStore(store),config=structuredClone(initialConfig);
 await adapter.initialize(config,{schema_version:1,mode:config.mode,run_id:config.run_id,revision:0,prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]});
 const app=await StudioLifecycle.fromStore({store:adapter,now:()=>new Date(at)});await app.apply(fixtureProspect('capacity-0',at));
 const state=await app.snapshot(),template=state.prospects['capacity-0'];state.prospects={};
 for(let i=0;i<272;i++){
  const id=`capacity-${i}`,r=structuredClone(template),source={url:`https://example.invalid/${i}`,text:`Fictional business evidence ${i}. `.repeat(400),capture_method:'http',fetched_at:at};source.content_sha256=sourceContentHash(source);
  Object.assign(r,{id,name:`STUDIO TEST Capacity ${i}`,controlled:false,follow_up_owner:i%2?'friend':'owner',retained_capacity:{source},note:`Fictional private context ${i}. `.repeat(400)});state.prospects[id]=r;
 }
 state.mode='production';state.operations={email:{},budget:{reserved_microcredits:123456,consumed_microcredits:80000,paused:true}};
 state.ai_attempts={'retained-attempt':{status:'Uncertain',source_sha256:hash('synthetic immutable source'),reserved_microcredits:1900}};
 state.asset_index={approved:{id:'approved',baseline_version:'rev4',baseline_approved_by:'friend',baseline_approval_event:'exact-approval',versions:{rev3:{reference:'private-path:rejected.pdf'},rev4:{reference:'private-path:approved.pdf',sha256:hash('approved version')}}}};
 state.actions={'original-action':{id:'original-action',status:'Pending',type:'email',prospect_id:'capacity-0'}};
 state.retained_receipts={text:'Fictional exact receipt bytes. '.repeat(150000)};
 assert.ok(Buffer.byteLength(JSON.stringify(state))>=11_338_010);return state;
}

test('11MB+ / 272-record canonical candidate roundtrips original evidence, approved versions, owners, actions and budgets through pinned SDK CAS',async()=>{
 const original=await volumeFixture(),input=Buffer.from(JSON.stringify(original,null,2)),{candidate,manifest}=capacityCandidate(input),{store,requests}=sdkMemory(),adapter=new ConditionalLifecycleStore(store);
 assert.equal(manifest.prospects,272);assert.equal(manifest.evidence.count,272);assert.ok(manifest.candidate_bytes>11_338_010&&manifest.candidate_bytes<20_000_000);
 await adapter.initialize(candidate.config,candidate.state);const reopened=await adapter.envelope();assert.deepEqual(verifyCapacityCandidate(reopened.data,manifest),original);
 const app=await StudioLifecycle.fromStore({store:adapter,now:()=>new Date(at)}),friend=await StudioLifecycle.fromStore({store:adapter,now:app.now}),revision=(await app.snapshot()).revision;
 const note=id=>({id,prospect_id:'capacity-0',type:'note_added',at,data:{note:id}}),results=await Promise.allSettled([app.apply(note('owner-note'),{actor:'owner',expectedRevision:revision}),friend.apply(note('friend-note'),{actor:'friend',expectedRevision:revision})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'STATE_CONFLICT');
 const winner=results[0].status==='fulfilled'?'owner-note':'friend-note',actor=winner==='owner-note'?'owner':'friend';assert.equal((await app.apply(note(winner),{actor})).duplicate,true);
 const after=await app.snapshot();for(const key of ['asset_index','actions','ai_attempts','operations'])assert.deepEqual(after[key],candidate.state[key]);
 const beforeInterrupt=await adapter.snapshot(),set=store.setJSON.bind(store);store.setJSON=async()=>{throw Error('Interrupted before publication');};
 await assert.rejects(app.apply(note('interrupted'),{actor:'owner'}),e=>e.code==='STATE_UNCERTAIN');assert.deepEqual(await adapter.snapshot(),beforeInterrupt);
 store.setJSON=async(...args)=>{await set(...args);throw Error('Lost response after publication');};assert.equal((await app.apply(note('lost-response'),{actor:'friend'})).reconciled,true);store.setJSON=set;
 assert.equal((await app.apply(note('lost-response'),{actor:'friend'})).duplicate,true);
 assert.ok(requests.some(r=>r.method==='PUT'&&r.bytes>11_338_010&&r.match));assert.ok(requests.filter(r=>r.method==='GET').every(r=>r.url.startsWith('https://strong.example.invalid/')));
 const restoredStore=new ConditionalLifecycleStore(sdkMemory().store);await restoredStore.initialize(candidate.config,candidate.state);assert.deepEqual(verifyCapacityCandidate((await restoredStore.envelope()).data,manifest),original);
 const dashboard=projectDashboard(await app.dashboard()),first=deskSnapshotPage(dashboard);assert.equal(first.transport,'desk-snapshot-v1');
 const pages=[];const loaded=await readDeskSnapshot(new Response(JSON.stringify(first)),{path:'/desk/api/state',fetch:async path=>{const page=deskSnapshotPage(dashboard,new URL(path,'https://preview.example.invalid').searchParams);pages.push(Buffer.byteLength(JSON.stringify(page)));return new Response(JSON.stringify(page));}});
 assert.deepEqual(loaded,JSON.parse(JSON.stringify(dashboard)));assert.ok(pages.length>1&&pages.every(n=>n<=3_100_000));
});

test('candidate fails closed for changed/removed evidence or approvals and exceeding the unchanged 20MB store limit',async()=>{
 const original=await volumeFixture(),{candidate,manifest}=capacityCandidate(Buffer.from(JSON.stringify(original)));
 for(const change of [s=>{s.prospects['capacity-0'].retained_capacity.source.text='Changed bytes';},s=>{delete s.prospects['capacity-0'].retained_capacity;},s=>{s.asset_index.approved.baseline_version='rev3';},s=>{s.operations.budget.consumed_microcredits=0;}]){const broken=structuredClone(candidate);change(broken.state);assert.throws(()=>verifyCapacityCandidate(broken,manifest),/integrity/);}
 const broken=structuredClone(original);delete broken.prospects['capacity-0'].retained_capacity.source.text;assert.throws(()=>capacityCandidate(Buffer.from(JSON.stringify(broken))),/missing or corrupt/);
 candidate.state.extra='x'.repeat(20_000_000);assert.throws(()=>new ConditionalLifecycleStore(null).validate(candidate),/size limit/);
});

test('private rehearsal publishes new-only candidate plus manifest; original hashes remain unchanged and partial publication cannot be reused',async()=>{
 const root=await mkdtemp(join(tmpdir(),'evz-capacity-'));try{
  const source=join(root,'source');await mkdir(source);const original=await volumeFixture(),input=JSON.stringify(original);await writeFile(join(source,'lifecycle-state.json'),input);await writeFile(join(source,'lifecycle-config.json'),'PRIVATE CONFIG NEVER COPIED');
  const destination=join(root,'candidate'),result=await rehearseCapacity(source,destination);assert.equal(result.source_unchanged,true);assert.equal(await readFile(join(source,'lifecycle-state.json'),'utf8'),input);
  const manifest=JSON.parse(await readFile(join(destination,'manifest.json'),'utf8')),candidate=JSON.parse(await readFile(join(destination,'candidate.json'),'utf8'));assert.deepEqual(verifyCapacityCandidate(candidate,manifest),original);assert.equal(manifest.external_files[0].copied,false);assert.ok(!JSON.stringify(candidate).includes('PRIVATE CONFIG'));
  await assert.rejects(rehearseCapacity(source,destination),{code:'EEXIST'});
  const partial=join(root,'partial');await mkdir(partial);await writeFile(join(partial,'candidate.json'),'Interrupted');await assert.rejects(rehearseCapacity(source,partial),{code:'EEXIST'});assert.equal(await readFile(join(partial,'candidate.json'),'utf8'),'Interrupted');
 }finally{await rm(root,{recursive:true,force:true});}
});
