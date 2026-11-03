import test from 'node:test';
import assert from 'node:assert/strict';
import {productionMailboxClockEntry,validateProductionMailboxClock,createProductionMailboxClock} from './production-mailbox-clock.mjs';
import {createCipheriv} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {clockHistoryFixture} from './fixtures/mailbox-clock-history.mjs';
import {hash} from './lifecycle.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {googleOAuthScopes} from './google-oauth.mjs';

async function fixture(t,{refresh=false}={}){
 const f=await clockHistoryFixture(t,{lane:'current'}),b=f.b,binding=f.packet.binding;
 const oauth={capability:b.capability,workspace_id:b.workspace_id,run_id:b.run_id,namespace:b.namespace,manual_binding_sha256:hash(binding),source_policy_sha256:hash(f.app.config.mailbox),tenant_id:'fictional-business',site_id:b.site_id,deploy_id:b.deploy_id,origin:b.origin,redirect_uri:b.origin+'/desk/api/google-oauth/callback',client_id:'fictional-production.apps.googleusercontent.com',account:'ensizziyo@evzdigital.studio',audience:'internal'};
 const input={binding,oauth,credentialNamespace:'evz-mailbox-credentials-clock-test',clockPolicy:f.app.config.mailbox_clock,starts_at:f.now().toISOString(),expires_at:new Date(+f.now()+600000).toISOString()},env={EVZ_PRODUCTION_MAILBOX_CLOCK:'finite-intake-v1',EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY_ID:'clock-key',EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY:Buffer.alloc(32,7).toString('base64url'),EVZ_PRODUCTION_GOOGLE_CLIENT_SECRET:'fictional-client-secret'};
 const data={grant_id:f.app.config.mailbox.grant_id,status:'Active',scopes:googleOAuthScopes,access_token:'fictional-clock-access',refresh_token:'fictional-clock-refresh',expires_at:+f.now()+(refresh?30000:3600000),at:+f.now()},bound={profile:mailboxProfile,...oauth},iv=Buffer.alloc(12,3),cipher=createCipheriv('aes-256-gcm',Buffer.from(env.EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY,'base64url'),iv);
 cipher.setAAD(Buffer.from(JSON.stringify({v:1,namespace:input.credentialNamespace,key_id:env.EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY_ID,binding:bound,grant_id:data.grant_id})));
 let encrypted={v:1,key_id:env.EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY_ID,grant_id:data.grant_id,iv:iv.toString('base64url'),ciphertext:Buffer.concat([cipher.update(Buffer.from(JSON.stringify(data))),cipher.final()]).toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};
 let credentialReads=0,gets=0,version=0;const credentials={getWithMetadata:async()=>{credentialReads++;return {data:encrypted,etag:'credential-'+version};},setJSON:async(key,value,options)=>{assert.equal(key,'credential');assert.equal(options.onlyIfMatch,'credential-'+version);assert(!JSON.stringify(value).includes('fictional-clock-refresh'));encrypted=value;return {modified:true,etag:'credential-'+(++version)};}};
 const fetcher=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(new URL(url).origin,'https://gmail.googleapis.com');assert.equal(options.headers.Authorization,'Bearer fictional-clock-access');gets++;return Response.json({historyId:'101',history:[]});};
 const request=(origin=b.origin)=>new Request(origin+'/.netlify/functions/mailbox-clock',{method:'POST',body:JSON.stringify({next_run:new Date(+f.now()+300000).toISOString()})});
 const ready=async()=>{await f.command('allowance',{revision:await f.revision(),allowance:{id:'production-proof',evidence_ref:'Fictional included usage',observed_at:f.now().toISOString(),expires_at:input.expires_at,included_only:true,max_steps:1}});await f.command('pause',{revision:await f.revision(),paused:false,reason:'Finite fictional proof'});};
 const handler=(options={})=>createProductionMailboxClock({input,env,now:f.now,storeFactory:()=>f.raw,googleOAuthOptions:{storeFactory:n=>{assert.equal(n,input.credentialNamespace);return credentials;}},googleIncomingOptions:{fetcher},...options});
 return {...f,input,env,credentials,fetcher,request,ready,handler,get credentialReads(){return credentialReads;},get gets(){return gets;}};
}

test('default emitted production clock remains disabled without a schedule',async()=>{
 const source=productionMailboxClockEntry();
 const module=await import('data:text/javascript,'+encodeURIComponent(source));
 assert.equal(module.config,undefined);
 assert.equal((await module.default(new Request('https://example.invalid'),{})).status,503);
 assert.throws(()=>validateProductionMailboxClock({}));
});

test('closed immutable policy/OAuth packaging rejects drift and leaves existing inputs untouched',async t=>{
 const f=await fixture(t);validateProductionMailboxClock(f.input);
 for(const mutate of [i=>i.extra=true,i=>i.clockPolicy.schema_version=1,i=>i.clockPolicy.deploy_id='other',i=>i.oauth.manual_binding_sha256='0'.repeat(64),i=>i.oauth.namespace='other',i=>i.oauth.account='other@example.invalid',i=>i.oauth.redirect_uri+='x',i=>i.oauth.extra=true,i=>i.credentialNamespace=i.binding.scope.namespace,i=>i.expires_at=i.starts_at,i=>i.expires_at='2099-01-01T00:00:00.000Z']){const i=structuredClone(f.input);mutate(i);assert.throws(()=>validateProductionMailboxClock(i));}
 const source=productionMailboxClockEntry(f.input);assert.doesNotMatch(source,/\.\.\.process\.env|CLIENT_SECRET|CREDENTIAL_KEY/);assert.match(source,/\*\/5 \* \* \* \*/);
});

test('disabled, wrong context/method, early/expired window and bad secrets deny before storage',async t=>{
 const f=await fixture(t);let stores=0;const handler=options=>f.handler({storeFactory:()=>{stores++;throw Error('must not access storage');},...options});
 for(const context of [{}, {...f.context,site:{id:'other'}},{...f.context,deploy:{...f.context.deploy,id:'other'}},{...f.context,deploy:{...f.context.deploy,published:false}},{...f.context,deploy:{...f.context.deploy,context:'deploy-preview'}}])assert.equal((await handler()(f.request(),context)).status,503);
 assert.equal((await handler()(new Request(f.b.origin,{method:'GET'}),f.context)).status,503);
 for(const env of [{},{...f.env,EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY:'bad'}])assert.equal((await handler({env})(f.request(),f.context)).status,503);
 for(const at of [Date.parse(f.input.starts_at)-1,Date.parse(f.input.expires_at)])assert.equal((await handler({now:()=>new Date(at)})(f.request(),f.context)).status,503);
 assert.equal(stores,0);
});

test('real clock and encrypted production OAuth grant settle one GET; ambient legacy credentials are ignored',async t=>{
 const f=await fixture(t);await f.ready();const before=await f.store.snapshot();const env=new Proxy({...f.env,EVZ_GOOGLE_CLIENT_SECRET:'wrong-legacy-secret'},{get(target,name){assert(['EVZ_PRODUCTION_MAILBOX_CLOCK','EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY_ID','EVZ_PRODUCTION_GOOGLE_CREDENTIAL_KEY','EVZ_PRODUCTION_GOOGLE_CLIENT_SECRET'].includes(name));return target[name];}});
 const response=await f.handler({env})(f.request(),f.context);assert.equal(response.status,200,await response.text());const state=await f.store.snapshot();assert.equal(f.gets,1);assert(f.credentialReads>0);assert.equal(state.mailbox_sync.cursor,'101');assert.equal(state.mailbox_clock.allowances['production-proof'].used_steps,1);assert.deepEqual(state.prospects,before.prospects);
 assert.equal((await f.handler()(f.request(),f.context)).status,200);assert.equal(f.gets,1);
});

test('window expiry after storage await denies credentials/provider; package policy drift denies claim',async t=>{
 for(const fault of ['expiry','policy','mailbox']){const f=await fixture(t);await f.ready();const before=await f.store.snapshot(),input=structuredClone(f.input);if(fault==='policy')input.clockPolicy.interval_minutes=15;if(fault==='mailbox')input.oauth.source_policy_sha256='0'.repeat(64);if(fault==='expiry')f.control.beforeRead=()=>f.advance(600001);
  assert.equal((await f.handler({input})(f.request(),f.context)).status,503);f.control.beforeRead=null;assert.equal(f.gets,0);assert.equal(f.credentialReads,0);assert.deepEqual(await f.store.snapshot(),before);
 }
});

test('window ending during credential read preserves reserved charge and blocks Gmail',async t=>{
 const f=await fixture(t);await f.ready();const before=await f.store.snapshot();const response=await f.handler({googleOAuthOptions:{storeFactory:()=>({getWithMetadata:async()=>{f.advance(600001);return f.credentials.getWithMetadata();}})}})(f.request(),f.context);
 assert.equal(response.status,503);assert.equal(f.gets,0);const state=await f.store.snapshot();assert.equal(state.mailbox_clock.allowances['production-proof'].used_steps,1);assert.equal(state.mailbox_clock.tick.pending_step,1);assert.deepEqual(state.mailbox_sync,before.mailbox_sync);
});

test('invocation deadline is clipped to the immutable window and late Gmail evidence cannot settle',async t=>{
 const f=await fixture(t);await f.ready();const before=await f.store.snapshot(),input={...f.input,expires_at:new Date(+f.now()+1000).toISOString()};let calls=0;
 const response=await f.handler({input,googleIncomingOptions:{fetcher:async()=>{calls++;f.advance(1001);return Response.json({historyId:'999',history:[]});}}})(f.request(),f.context);
 assert.equal(response.status,503);assert.equal(calls,1);const state=await f.store.snapshot();assert.equal(state.mailbox_clock.tick.pending_step,1);assert.equal(state.mailbox_clock.allowances['production-proof'].used_steps,1);assert.deepEqual(state.mailbox_sync,before.mailbox_sync);
});

test('execute emitted bytes with actual default SDK and production OAuth; no ambient flag can activate default output',async t=>{
 const f=await fixture(t);await f.ready();const originalFetch=globalThis.fetch,OriginalDate=globalThis.Date,originalEnv=process.env,blobContext=globalThis.netlifyBlobsContext;
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.Date=OriginalDate;process.env=originalEnv;if(blobContext===undefined)delete globalThis.netlifyBlobsContext;else globalThis.netlifyBlobsContext=blobContext;});
 // f.now closes over Date: retain a fixed numeric instant to avoid recursive construction.
 const time=OriginalDate.parse(f.input.starts_at);globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}};
 process.env={...f.env,EVZ_MAILBOX_CLOCK_RUNTIME:'malicious-ambient',EVZ_GOOGLE_CLIENT_SECRET:'wrong'};
 globalThis.netlifyBlobsContext=Buffer.from(JSON.stringify({siteID:f.b.site_id,token:'fictional-only-netlify-token'})).toString('base64');
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),method=String(options.method??'GET').toUpperCase();
  if(u.origin==='https://gmail.googleapis.com')return f.fetcher(url,options);
  if(u.origin==='https://api.netlify.com'){assert(u.pathname.includes('/site:'+f.b.namespace+'/workspace')||u.pathname.includes('/site:'+f.input.credentialNamespace+'/credential'));return Response.json({url:'https://clock-storage.example.invalid/'+encodeURIComponent(u.pathname)});}
  assert.equal(u.origin,'https://clock-storage.example.invalid');const credential=decodeURIComponent(u.pathname).endsWith('/credential'),raw=credential?f.credentials:f.raw,key=credential?'credential':'workspace';
  if(method==='GET'){const v=await raw.getWithMetadata(key,{type:'json',consistency:'strong'});return new Response(JSON.stringify(v.data),{headers:{etag:v.etag}});}
  assert.equal(method,'PUT');assert(!credential);const v=await raw.setJSON(key,JSON.parse(options.body),{onlyIfMatch:new Headers(options.headers).get('if-match')});return new Response(null,{status:v.modified?200:412,headers:v.etag?{etag:v.etag}:{}});
 };
 const file=new URL('./netlify-functions/production-clock-test-'+process.pid+'.mjs',import.meta.url);await writeFile(file,productionMailboxClockEntry(f.input));t.after(()=>unlink(file));const generated=await import(file.href+'?generated');assert.deepEqual(generated.config,{schedule:'*/5 * * * *'});const response=await generated.default(f.request('https://11111111-2222-4333-8444-555555555555.netlify.app'),f.context);assert.equal(response.status,200,await response.text());assert.equal(f.gets,1);assert.equal((await f.store.snapshot()).mailbox_clock.tick.status,'Completed');
 const disabled=await import('data:text/javascript,'+encodeURIComponent(productionMailboxClockEntry()));assert.equal(disabled.config,undefined);assert.equal((await disabled.default(f.request(),f.context)).status,503);assert.equal(f.gets,1);
});


test('stalled request body and store await return at deadline and cannot resume effects',async t=>{
 for(const fault of ['body','store']){
  const f=await fixture(t);await f.ready();let release,stores=0;
  const input={...f.input,expires_at:new Date(+f.now()+40).toISOString()};
  const blocked=new Promise(resolve=>{release=resolve;});
  const request=fault==='body'?new Request(f.b.origin+'/.netlify/functions/mailbox-clock',{method:'POST',body:new ReadableStream({start(){}}),duplex:'half'}):f.request();
  const handler=f.handler({input,storeFactory:async()=>{stores++;if(fault==='store')await blocked;return f.raw;}});
  const response=await handler(request,f.context);assert.equal(response.status,503);release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.credentialReads,0);assert.equal(f.gets,0);assert.equal(stores,fault==='body'?0:1);
 }
});


test('real production OAuth refresh uses only projected client credentials and encrypted CAS',async t=>{
 const f=await fixture(t,{refresh:true});await f.ready();let refreshes=0;
 const response=await f.handler({googleOAuthOptions:{storeFactory:()=>f.credentials,fetcher:async(url,options)=>{
  assert.equal(String(url),'https://oauth2.googleapis.com/token');assert.equal(options.method,'POST');const body=new URLSearchParams(options.body);
  assert.equal(body.get('client_id'),f.input.oauth.client_id);assert.equal(body.get('client_secret'),f.env.EVZ_PRODUCTION_GOOGLE_CLIENT_SECRET);assert.equal(body.get('refresh_token'),'fictional-clock-refresh');refreshes++;
  return Response.json({access_token:'fictional-clock-access',token_type:'Bearer',expires_in:3600,scope:googleOAuthScopes.join(' ')});
 }}})(f.request(),f.context);
 assert.equal(response.status,200,await response.text());assert.equal(refreshes,1);assert.equal(f.gets,1);
});


test('internal scheduler transport origin uses exact trusted deployment and pinned canonical identities',async t=>{
 const f=await fixture(t);await f.ready();const origin='https://11111111-2222-4333-8444-555555555555.netlify.app';
 const response=await f.handler()(f.request(origin),f.context);
 assert.equal(response.status,200,await response.text());assert.equal(f.gets,1);assert.equal((await f.store.snapshot()).mailbox_clock.tick.status,'Completed');
 assert.notEqual(origin,f.input.binding.scope.origin);assert.equal(f.input.oauth.origin,f.input.binding.scope.origin);assert.equal(f.input.clockPolicy.origin,f.input.binding.scope.origin);
});
