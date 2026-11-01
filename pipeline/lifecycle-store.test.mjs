import test from 'node:test';import assert from 'node:assert/strict';
import {getStore} from '@netlify/blobs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';import {StudioLifecycle,initialConfig} from './lifecycle.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';
const at='2026-10-23T15:00:00.000Z';
function memoryStore(){let value,etag=0;return {writes:0,loseNext:false,async getWithMetadata(key,options){assert.equal(options.consistency,'strong');return value?{data:structuredClone(value),etag:String(etag)}:null;},async setJSON(key,data,options){assert.ok(options.onlyIfNew||options.onlyIfMatch);if(options.onlyIfNew&&value||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(etag))return {modified:false};value=structuredClone(data);etag++;this.writes++;if(this.loseNext){this.loseNext=false;throw Error('Simulated lost response after commit');}return {modified:true,etag:String(etag)};}};}
async function setup(){const raw=memoryStore(),config=structuredClone(initialConfig);config.follow_up.enabled=true;const store=new ConditionalLifecycleStore(raw),state={schema_version:1,run_id:config.run_id,mode:config.mode,revision:0,updated_at:at,prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]};await store.initialize(config,state);const app=await StudioLifecycle.fromStore({store,now:()=>new Date(at)});await app.apply(fixtureProspect('shared',at));return {raw,store,app};}
const event=id=>({id,prospect_id:'shared',type:'call_logged',at,data:{call_id:'shared-call',outcome:'connected',intent:'requested_info',focus:'website',performed_at:at,simulated:true,desk:true}});
test('two independent lifecycle instances reject a competing shared update without rerunning or losing the winner',async()=>{
 const {app,store}=await setup(),friend=await StudioLifecycle.fromStore({store,now:app.now}),revision=(await app.snapshot()).revision;
 const note=id=>({id,prospect_id:'shared',type:'note_added',at,data:{note:id}});
 const results=await Promise.allSettled([app.apply(note('owner-note'),{actor:'owner',expectedRevision:revision}),friend.apply(note('friend-note'),{actor:'friend',expectedRevision:revision})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'STATE_CONFLICT');
 const state=await app.snapshot();assert.equal(state.revision,revision+1);assert.equal(['owner-note','friend-note'].filter(id=>state.events[id]).length,1);
});
test('lost shared write responses reconcile the exact event and replay creates no duplicate call or email action',async()=>{
 const {app,store,raw}=await setup();raw.loseNext=true;const saved=await app.apply(event('same-event'));assert.equal(saved.reconciled,true);
 const reopened=await StudioLifecycle.fromStore({store,now:app.now});assert.equal((await reopened.apply(event('same-event'))).duplicate,true);
 const state=await reopened.snapshot();assert.equal(Object.keys(state.prospects.shared.calls).length,1);assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);
});
test('simultaneous retries of one exact event converge on one saved action',async()=>{
 const {app,store}=await setup(),other=await StudioLifecycle.fromStore({store,now:app.now});await Promise.all([app.apply(event('same-event')),other.apply(event('same-event'))]);
 const state=await app.snapshot();assert.equal(Object.keys(state.prospects.shared.calls).length,1);assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);
});
test('an unknown uncommitted write stays uncertain and never reruns its transaction callback',async()=>{
 const {app,raw}=await setup(),before=await app.snapshot();let attempts=0;
 raw.setJSON=async()=>{attempts++;throw Error('Transport failed before response');};
 await assert.rejects(app.apply(event('uncommitted-event')),error=>error.code==='STATE_UNCERTAIN');
 assert.equal(attempts,1);assert.deepEqual(await app.snapshot(),before);
});
test('pinned Netlify SDK preserves quoted ETags, conditional writes and strong read routing at its HTTP boundary',async()=>{
 let data,version=0;const requests=[];
 const sdk=getStore({name:'sdk-proof',siteID:'synthetic-site',token:'synthetic-token',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  const h=new Headers(options.headers),method=options.method.toUpperCase();requests.push({method,url:String(url),match:h.get('if-match'),fresh:h.get('if-none-match')});
  if(method==='GET')return data?new Response(JSON.stringify(data),{headers:{etag:`"${version}"`}}):new Response(null,{status:404});
  if(h.get('if-none-match')==='*'&&data||h.get('if-match')&&h.get('if-match')!==`"${version}"`)return new Response(null,{status:412});
  data=JSON.parse(options.body);version++;return new Response(null,{headers:{etag:`"${version}"`}});
 }});
 assert.deepEqual(await sdk.setJSON('workspace',{value:1},{onlyIfNew:true}),{modified:true,etag:'"1"'});
 const saved=await sdk.getWithMetadata('workspace',{type:'json',consistency:'strong'});assert.equal(saved.etag,'"1"');assert.deepEqual(saved.data,{value:1});
 assert.equal((await sdk.setJSON('workspace',{value:2},{onlyIfMatch:saved.etag})).modified,true);
 assert.equal((await sdk.setJSON('workspace',{value:3},{onlyIfMatch:saved.etag})).modified,false);
 assert.equal(requests[0].fresh,'*');assert.equal(requests[2].match,'"1"');assert.match(requests[1].url,/strong\.example\.invalid/);
});
