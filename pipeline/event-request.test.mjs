import test from 'node:test';
import assert from 'node:assert/strict';
import {createEventRequest} from './lifecycle-ui/event-request.js';
import {createHostedDesk} from './hosted-desk.mjs';

test('hosted UI retains one exact approval across lost HTTP responses, reload and explicit retry', async () => {
  const origin = 'https://event-proof.example.invalid', env = {CONTEXT:'deploy-preview', EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview', EVZ_OPERATIONS_ORIGIN:origin, EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-event-client', EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43), EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43), EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
  let data, version = 0, lose = false, beforeCommit = false, postCount = 0;
  const raw = {async getWithMetadata() {return data && {data:structuredClone(data),etag:String(version)};}, async setJSON(key,next,options) {if(options.onlyIfNew&&data||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(version)) return {modified:false}; data=structuredClone(next); return {modified:true,etag:String(++version)};}};
  const handler = createHostedDesk({env,storeFactory:()=>raw}), get = path => new Request(origin+'/desk'+path);
  const boot=await handler(get('/api/bootstrap')), csrf=(await boot.json()).csrf, baseCookie=boot.headers.get('set-cookie').split(';')[0];
  const login=await handler(new Request(origin+'/desk/api/login',{method:'POST',headers:{cookie:baseCookie,origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env.EVZ_OPERATIONS_OWNER_KEY})})), cookie=baseCookie+'; '+login.headers.get('set-cookie').split(';')[0];
  const storageMap=new Map(), storage={getItem:key=>storageMap.get(key),setItem:(key,value)=>storageMap.set(key,value),removeItem:key=>storageMap.delete(key)};
  const fetch = async (path, options={}) => {
    if(options.method==='POST') {postCount++; if(beforeCommit) throw Error('Request lost before arrival');}
    const response=await handler(new Request(origin+path,{...options,headers:{...options.headers,cookie,origin}}));
    if(options.method==='POST'&&lose) throw Error('Response lost after commit');
    return response;
  };
  let client=createEventRequest({fetch,storage,csrf:()=>csrf,actor:()=> 'owner'});
  const read=async()=> (await fetch('/desk/api/state')).json(), input=id=>({revision:data.state.revision,event:{id,prospect_id:'shared-proof',type:'note_added',at:new Date().toISOString(),data:{note:'Fictional reviewed note'}}});
  await read(); lose=true;
  assert.equal((await client.send(input('committed-response-loss'))).reconciled,true); assert.equal(client.pending,null); assert.equal(postCount,1);
  lose=false; beforeCommit=true; const retained=input('uncommitted-response-loss');
  await assert.rejects(client.send(retained),/uncertain/); assert.equal(client.pending.id,retained.event.id);
  client=createEventRequest({fetch,storage,csrf:()=>csrf,actor:()=> 'friend'}); assert.equal(client.pending.actor,'owner'); await assert.rejects(client.retry(),/original|operator who approved/); assert.equal(client.pending.id,retained.event.id);
  client=createEventRequest({fetch,storage,csrf:()=>csrf,actor:()=> 'owner'}); assert.equal(await client.recover(),false);
  await assert.rejects(client.send(input('must-not-be-new')),/unresolved/); assert.equal(postCount,2);
  beforeCommit=false; await client.retry(); assert.equal(client.pending,null); assert.equal(postCount,3);
  const state=await read(); assert.equal(state.events['must-not-be-new'],undefined); assert.equal(state.events[retained.event.id].actor,'owner'); assert.equal(storageMap.size,0);
});
