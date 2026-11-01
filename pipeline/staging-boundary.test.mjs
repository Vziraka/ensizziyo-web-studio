import test from 'node:test';
import assert from 'node:assert/strict';
import {stagingEnvironment,createStagingBoundary} from './staging-boundary.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {fixtureReply} from './lifecycle-fixtures.mjs';
import {createOperatorAuth} from './operators.mjs';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const binding={site_id:'d7840f1d-c0e6-4f87-a41f-e34f53c81625',deploy_id:'abc123',origin:'https://abc123--evz-hybrid-fictional-20261027.netlify.app',namespace:'evz-redesign-proof-staging-1234567890abcdef'};
const context={site:{id:binding.site_id},deploy:{id:binding.deploy_id,context:'deploy-preview',published:false}};
const env={EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43),EVZ_OPERATIONS_DESK_ENABLED:'shared-operations-pdf-mail-v1',EVZ_INTERNAL_DISPATCH_BINDING:'poison',OPENAI_API_KEY:'not-forwarded'};
test('packaged Google connection binds actual build metadata without embedding runtime secrets',async()=>{
 const root=mkdtempSync(join(tmpdir(),'evz-staging-')),output=join(root,'source');
 try{
  execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/prepare-protected-staging.mjs',import.meta.url)),output,'--google-connection','--google-client-id=fictional-client.apps.googleusercontent.com']);
  execFileSync(process.execPath,['staging-build.mjs'],{cwd:output,env:{...process.env,SITE_ID:binding.site_id,DEPLOY_ID:binding.deploy_id,DEPLOY_URL:binding.origin,CONTEXT:'deploy-preview'}});
  const generated=(await import(pathToFileURL(join(output,'pipeline/staging.generated.mjs')))).default;
  const projected=stagingEnvironment({...env,EVZ_GOOGLE_OAUTH_BINDING:'stale-deploy',EVZ_GOOGLE_CLIENT_SECRET:'runtime-only-secret'},context,generated);
  const oauth=JSON.parse(projected.EVZ_GOOGLE_OAUTH_BINDING);
  assert.equal(oauth.deploy_id,binding.deploy_id);assert.equal(oauth.redirect_uri,binding.origin+'/desk/api/google-oauth/callback');
  assert.equal(oauth.client_id,'fictional-client.apps.googleusercontent.com');assert.equal(oauth.account,'ensizziyo@evzdigital.studio');assert.equal(oauth.audience,'internal');
  assert.equal(projected.EVZ_GOOGLE_CLIENT_SECRET,'runtime-only-secret');
  assert.doesNotMatch(readFileSync(join(output,'pipeline/staging.generated.mjs'),'utf8'),/runtime-only-secret/);
  assert.throws(()=>stagingEnvironment(env,{...context,deploy:{...context.deploy,id:'other'}},generated));
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('owner connection opt-in forwards only its credential configuration and closed routes',async()=>{
 const supplied={...env,EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-code-v1',EVZ_GOOGLE_OAUTH_BINDING:'bound-by-existing-oauth-validator',EVZ_GOOGLE_CREDENTIAL_NAMESPACE:'separate-namespace',EVZ_GOOGLE_CREDENTIAL_KEY_ID:'key-id',EVZ_GOOGLE_CREDENTIAL_KEY:'test-key',EVZ_GOOGLE_CLIENT_SECRET:'test-secret',EVZ_OPERATIONS_GOOGLE_EXACT_MAIL:'shared-operations-exact-mail-v1',EVZ_OPERATIONS_GOOGLE_INCOMING:'enabled'};
 const ordinary=stagingEnvironment(supplied,context,binding);
 assert.equal(ordinary.EVZ_OPERATIONS_GOOGLE_OAUTH,undefined);
 assert.equal(ordinary.EVZ_GOOGLE_CLIENT_SECRET,undefined);
 const opted={...binding,google_connection:true},projected=stagingEnvironment(supplied,context,opted);
 assert.equal(projected.EVZ_OPERATIONS_GOOGLE_OAUTH,'owner-code-v1');
 assert.equal(projected.EVZ_GOOGLE_CLIENT_SECRET,'test-secret');
 assert.equal(projected.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL,undefined);
 assert.equal(projected.EVZ_OPERATIONS_GOOGLE_INCOMING,undefined);
 let calls=0;const handle=createStagingBoundary({env:supplied,binding:opted,handlerFactory:()=>{calls++;return ()=>new Response('delegated');}});
 for(const [method,path] of [['GET','/desk/api/google-oauth/status'],['GET','/desk/api/google-oauth/callback'],['GET','/desk/google-oauth-callback.js'],['POST','/desk/api/google-oauth/start'],['POST','/desk/api/google-oauth/callback'],['POST','/desk/api/google-oauth/disconnect']])assert.equal((await handle(new Request(binding.origin+path,{method}),context)).status,200,path);
 assert.equal(calls,6);
 for(const [method,path] of [['GET','/desk/api/google-oauth/start'],['POST','/desk/api/google-oauth/status'],['POST','/desk/api/google-oauth/start/'],['POST','/desk/api/google-drive-oauth/start'],['POST','/desk/api/exact-mail/dispatch'],['POST','/desk/api/incoming-mail/sync'],['POST','/desk/api/internal-dispatch-background']])assert.equal((await handle(new Request(binding.origin+path,{method}),context)).status,403,path);
 assert.equal(calls,6);
});
test('staging sessions are revoked by operator-key rotation and deployment replacement',()=>{
 const original=createOperatorAuth(stagingEnvironment(env,context,binding));
 const cookie='evz_operator_session='+original.issue('owner');assert.equal(original.actorFromCookie(cookie),'owner');
 const rotated=createOperatorAuth(stagingEnvironment({...env,EVZ_OPERATIONS_FRIEND_KEY:'r'.repeat(43)},context,binding));assert.equal(rotated.actorFromCookie(cookie),null);
 const replacement={...binding,deploy_id:'replacement',origin:'https://replacement--evz-hybrid-fictional-20261027.netlify.app'};
 const next=createOperatorAuth(stagingEnvironment(env,{...context,deploy:{...context.deploy,id:'replacement'}},replacement));assert.equal(next.actorFromCookie(cookie),null);
});
test('opted staging preserves signed owner-only OAuth and never opens business records',async()=>{
 const oauthBinding={site_id:binding.site_id,deploy_id:binding.deploy_id,origin:binding.origin,redirect_uri:binding.origin+'/desk/api/google-oauth/callback',tenant_id:'fictional-business',client_id:'fictional-client.apps.googleusercontent.com',account:'ensizziyo@evzdigital.studio',audience:'internal'};
 const settings={...env,EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-code-v1',EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(oauthBinding),EVZ_GOOGLE_CREDENTIAL_NAMESPACE:'evz-google-credentials-staging-fictional',EVZ_GOOGLE_CREDENTIAL_KEY_ID:'fictional-key',EVZ_GOOGLE_CREDENTIAL_KEY:Buffer.alloc(32,7).toString('base64url'),EVZ_GOOGLE_CLIENT_SECRET:'fictional-client-secret'};
 let saved=null,version=0;
 const raw={async getWithMetadata(){return saved?{data:structuredClone(saved),etag:String(version)}:null;},async setJSON(key,data,options){assert.equal(key,'credential');if(options.onlyIfNew&&saved||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(version))return {modified:false};saved=structuredClone(data);return {modified:true,etag:String(++version)};}};
 const handle=createStagingBoundary({env:settings,binding:{...binding,google_connection:true},handlerFactory:projected=>createHostedDesk({env:projected,storeFactory:()=>{throw Error('Business records must stay unopened');},googleOAuthOptions:{storeFactory:namespace=>{assert.equal(namespace,settings.EVZ_GOOGLE_CREDENTIAL_NAMESPACE);return raw;},fetcher:()=>{throw Error('No Google requests before owner consent');}}})});
 const call=(path,options={})=>handle(new Request(binding.origin+'/desk'+path,options),context);
 assert.equal((await call('/api/google-oauth/status')).status,401);
 const sessions={};
 for(const role of ['OWNER','FRIEND']){
  const boot=await call('/api/bootstrap'),csrf=(await boot.json()).csrf,headers={cookie:boot.headers.get('set-cookie').split(';')[0],origin:binding.origin,'content-type':'application/json','x-studio-token':csrf};
  const login=await call('/api/login',{method:'POST',headers,body:JSON.stringify({key:settings['EVZ_OPERATIONS_'+role+'_KEY']})});assert.equal(login.status,200);headers.cookie+='; '+login.headers.get('set-cookie').split(';')[0];sessions[role]=headers;
 }
 assert.equal((await call('/api/google-oauth/start',{method:'POST',headers:sessions.FRIEND,body:'{}'})).status,400);
 assert.equal((await call('/api/google-oauth/start',{method:'POST',headers:{...sessions.OWNER,'x-studio-token':'wrong'},body:'{}'})).status,403);
 assert.equal(saved,null);
 const started=await call('/api/google-oauth/start',{method:'POST',headers:sessions.OWNER,body:'{}'});assert.equal(started.status,200);
 const url=new URL((await started.json()).authorization_url);assert.equal(url.searchParams.get('redirect_uri'),oauthBinding.redirect_uri);assert.equal(url.searchParams.get('login_hint'),oauthBinding.account);
 const status=await(await call('/api/google-oauth/status',{headers:sessions.FRIEND})).json();assert.equal(status.status,'Awaiting owner authorization');assert.doesNotMatch(JSON.stringify(status),/fictional-client-secret|verifier|nonce/);
 const landing=await call('/api/google-oauth/callback?code=fictional-code&state=fictional-state');assert.equal(landing.status,200);assert.doesNotMatch(await landing.text(),/fictional-code|fictional-state/);
 assert.equal((await call('/api/exact-mail/dispatch',{method:'POST',headers:sessions.OWNER,body:'{}'})).status,403);
 assert.equal((await call('/api/google-oauth/disconnect',{method:'POST',headers:sessions.OWNER,body:'{}'})).status,200);
 assert.equal((await(await call('/api/google-oauth/status',{headers:sessions.FRIEND})).json()).status,'Disconnected');
});
test('staging uses exact isolated deployment and excludes inherited provider capabilities',()=>{
 const projected=stagingEnvironment(env,context,binding);
 assert.equal(projected.EVZ_OPERATIONS_DESK_ENABLED,'fictional-preview');
 assert.equal(projected.OPENAI_API_KEY,undefined);assert.equal(projected.EVZ_INTERNAL_DISPATCH_BINDING,undefined);
 for(const bad of [{...context,site:{id:'public-site'}},{...context,deploy:{...context.deploy,context:'production'}},{...context,deploy:{...context.deploy,published:true}},{...context,deploy:{...context.deploy,id:'other'}}])assert.throws(()=>stagingEnvironment(env,bad,binding));
 for(const change of [{namespace:'old-proof'},{origin:'https://other.invalid'},{site_id:'public-site'}])assert.throws(()=>stagingEnvironment(env,context,{...binding,...change}));
 assert.throws(()=>stagingEnvironment({},context,binding));
});
test('blocked routes never construct a handler or access storage, including GET side effects',async()=>{
 let calls=0;const handle=createStagingBoundary({env,binding,handlerFactory:()=>{calls++;return ()=>new Response('delegated');},assetPaths:['/desk/app.css']});
 for(const [method,path] of [['POST','/desk/api/event'],['POST','/desk/api/login/'],['GET','/desk/api/project-author/generate-execute'],['POST','/desk/api/exact-mail/send'],['POST','/desk/api/internal-dispatch-background'],['GET','/desk/api/google/oauth/callback'],['GET','/desk/api/state/'],['DELETE','/desk/api/state']])assert.equal((await handle(new Request(binding.origin+path,{method}),context)).status,403);
 assert.equal(calls,0);
 assert.equal((await handle(new Request('https://wrong.invalid/desk/api/state'),context)).status,403);
 assert.equal((await handle(new Request(binding.origin+'/desk/api/state'),{})).status,503);
 for(const [method,path] of [['GET','/desk/api/state'],['GET','/desk/app.css'],['POST','/desk/api/login'],['POST','/desk/api/logout']])assert.equal((await handle(new Request(binding.origin+path,{method}),context)).status,200);
 assert.equal(calls,4);
});
test('both real operator session flows retain authenticated fictional readback; edits stay blocked',async()=>{
 let data,version=0;
 const raw={async getWithMetadata(){return data?{data:structuredClone(data),etag:String(version)}:null;},async setJSON(key,next,options){if(options.onlyIfNew&&data||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(version))return {modified:false};data=structuredClone(next);return {modified:true,etag:String(++version)};}};
 const handle=createStagingBoundary({env,binding,handlerFactory:projected=>createHostedDesk({env:projected,storeFactory:()=>raw})});
 const call=(path,options={})=>handle(new Request(binding.origin+'/desk'+path,options),context);
 assert.equal((await call('/api/state')).status,401);
 for(const role of ['OWNER','FRIEND']){
  const boot=await call('/api/bootstrap'),csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0];
  const headers={cookie,origin:binding.origin,'content-type':'application/json','x-studio-token':csrf};
  const login=await call('/api/login',{method:'POST',headers,body:JSON.stringify({key:env['EVZ_OPERATIONS_'+role+'_KEY']})});assert.equal(login.status,200);
  headers.cookie+='; '+login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/state',{headers})).status,200);
  const before=JSON.stringify(data);
  assert.equal((await call('/api/event',{method:'POST',headers,body:'{}'})).status,403);
  assert.equal(JSON.stringify(data),before);
 }
 assert.equal(data.config.connector_writes_enabled,false);
 assert.equal(data.config.outreach_enabled,false);
 assert.ok(Object.values(data.state.prospects).every(r=>r.controlled));
});
test('explicit staging recording uses signed HTTP, exact revision, and held inquiry readback',async()=>{
 let data,version=0;const raw={async getWithMetadata(){return data?{data:structuredClone(data),etag:String(version)}:null;},async setJSON(key,next,options){if(options.onlyIfNew&&data||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(version))return {modified:false};data=structuredClone(next);return {modified:true,etag:String(++version)};}};
 const b={...binding,recording:true},handle=createStagingBoundary({env,binding:b,handlerFactory:projected=>createHostedDesk({env:projected,storeFactory:()=>raw})});
 const call=(path,options={})=>handle(new Request(binding.origin+'/desk'+path,options),context);
 for(const role of ['OWNER','FRIEND']){
  const boot=await call('/api/bootstrap'),csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0];
  const headers={cookie,origin:binding.origin,'content-type':'application/json','x-studio-token':csrf};
  const login=await call('/api/login',{method:'POST',headers,body:JSON.stringify({key:env['EVZ_OPERATIONS_'+role+'_KEY']})});assert.equal(login.status,200);headers.cookie+='; '+login.headers.get('set-cookie').split(';')[0];
  const response=await call('/api/state',{headers});assert.equal(response.status,200,await response.clone().text());const view=await response.json();
  assert.equal(view.shared_workspace.capability,'fictional-staging-records-v1');
  const event={id:'intake-'+role,prospect_id:'inquiry-intake',type:'inquiry_recorded',at:new Date().toISOString(),data:{company_name:'STUDIO TEST '+role,classification:'uncertain',reply:fixtureReply('source-'+role,'thread-'+role,role.toLowerCase()+'@example.invalid','Unclear request')}};
  const body=JSON.stringify({revision:view.revision,event});
  assert.equal((await call('/api/event',{method:'POST',headers:{...headers,'x-studio-token':'bad'},body})).status,403);
  const saved=await call('/api/event',{method:'POST',headers,body});assert.equal(saved.status,200,await saved.clone().text());
  assert.equal(data.state.events[event.id].actor,role.toLowerCase());
  assert.equal(data.state.inquiry_intake.next_owner,'owner');
  assert.equal((await call('/api/incoming-mail/sync',{method:'POST',headers,body:'{}'})).status,403);
 }
});
