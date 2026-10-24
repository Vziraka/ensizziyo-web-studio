import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createGoogleOAuth,googleOAuthScopes,googleOAuthPath} from './google-oauth.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {googleHostedTransport} from './google-hosted-transport.mjs';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';

const origin='https://preview.example.invalid';
const binding={origin,redirect_uri:origin+googleOAuthPath+'/callback',site_id:'synthetic-site',deploy_id:'synthetic-deploy',tenant_id:'synthetic-business',account:'ensizziyo@evzdigital.studio',client_id:'synthetic-client.apps.googleusercontent.com',audience:'external-testing'};
const env={CONTEXT:'deploy-preview',SITE_ID:binding.site_id,DEPLOY_ID:binding.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-oauth-synthetic',EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-code-v1',EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(binding),EVZ_GOOGLE_CREDENTIAL_NAMESPACE:'evz-google-credentials-oauth-synthetic',EVZ_GOOGLE_CREDENTIAL_KEY_ID:'synthetic-k1',EVZ_GOOGLE_CREDENTIAL_KEY:Buffer.alloc(32,7).toString('base64url'),EVZ_GOOGLE_CLIENT_SECRET:'synthetic-client-secret',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const certs={'synthetic-key':publicKey.export({type:'spki',format:'pem'})};
function jwt(payload,header={alg:'RS256',kid:'synthetic-key'}){const bytes=[header,payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return bytes+'.'+sign('RSA-SHA256',Buffer.from(bytes),privateKey).toString('base64url');}
function rawStore(){const records=new Map();let version=0;return {records,lose:false,writes:0,async getWithMetadata(key,{consistency}){assert.equal(consistency,'strong');return structuredClone(records.get(key)??null);},async setJSON(key,data,options){const prior=records.get(key);if(options.onlyIfNew&&prior||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==prior?.etag)return {modified:false};const etag='"'+(++version)+'"';records.set(key,{data:structuredClone(data),etag});this.writes++;if(this.lose){this.lose=false;throw Error('Lost committed write');}return {modified:true,etag};}};}
function fixture(){
 const raw=rawStore(),calls=[];let time=Date.now(),nonce,overrides={},claims={},wait=null;
 const fetcher=async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');
  if(url==='https://www.googleapis.com/oauth2/v1/certs')return Response.json(certs);
  assert.equal(url,'https://oauth2.googleapis.com/token');const body=new URLSearchParams(options.body);assert.equal(body.get('client_id'),binding.client_id);assert.equal(body.get('client_secret'),env.EVZ_GOOGLE_CLIENT_SECRET);
  if(wait)await wait;
  const seconds=Math.floor(Date.now()/1000),id_token=jwt({iss:'https://accounts.google.com',aud:binding.client_id,iat:seconds,exp:seconds+3600,sub:'synthetic-owner',email:binding.account,email_verified:true,hd:'evzdigital.studio',nonce,...claims});
  return Response.json({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',token_type:'Bearer',expires_in:3600,scope:googleOAuthScopes.join(' '),...(body.get('grant_type')==='authorization_code'?{id_token}:{}),...overrides});
 };
 const make=(extra={})=>createGoogleOAuth({env,storeFactory:namespace=>{assert.equal(namespace,env.EVZ_GOOGLE_CREDENTIAL_NAMESPACE);return raw;},fetcher,now:()=>time,...extra});
 const session='synthetic-owner-session-'.repeat(4);
 const start=async()=>{const result=await make().start('owner',session),url=new URL(result.authorization_url);nonce=url.searchParams.get('nonce');return {state:url.searchParams.get('state'),code:'synthetic-code'};};
 return {raw,calls,make,session,start,get time(){return time;},advance:ms=>time+=ms,claims:value=>claims=value,tokens:value=>overrides=value,wait:value=>wait=value,async connect(){const input=await start();return make().callback('owner',session,input);}};
}

test('Google OAuth is disabled without its independent capability',()=>{
 assert.throws(()=>createGoogleOAuth({env:{}}),/disabled/);
});

test('new owner grant uses exact OAuth URL, PKCE, encrypted separated storage and metadata-only shared status',async()=>{
 const f=fixture(),input=await f.start(),stored=JSON.stringify([...f.raw.records]);
 assert.doesNotMatch(stored,/synthetic-owner-session|verifier|nonce|Authorizing|state_sha256/);
 assert.equal(f.raw.records.size,1);assert.ok(f.raw.records.has('credential'));
 const result=await f.make().callback('owner',f.session,input);assert.equal(result.status,'Connected');assert.equal(result.account,binding.account);assert.deepEqual(result.scopes,googleOAuthScopes);assert.equal(result.refresh_expires_at,f.time+604800000);
 const token=await f.make().getAccessToken();assert.equal(token.access_token,'synthetic-access-token');assert.equal(token.grant_id,result.grant_id);
 assert.doesNotMatch(JSON.stringify(await f.make().status()),/synthetic-access|synthetic-refresh|synthetic-owner|id_token|nonce|verifier/);
 assert.doesNotMatch(JSON.stringify([...f.raw.records]),/synthetic-access|synthetic-refresh|synthetic-owner|gmail|ensizziyo/);
 const body=new URLSearchParams(f.calls[0].options.body);assert.equal(body.get('redirect_uri'),binding.redirect_uri);assert.match(body.get('code_verifier'),/^[A-Za-z0-9_-]{43}$/);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,1);
});

test('start fixes scopes, redirect and consent; fresh starts supersede old state and signed sessions',async()=>{
 const f=fixture(),start=await f.make().start('owner',f.session),url=new URL(start.authorization_url);
 assert.equal(url.origin+url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');assert.equal(url.searchParams.get('redirect_uri'),binding.redirect_uri);assert.equal(url.searchParams.get('scope'),['openid','email',...googleOAuthScopes.slice(2)].join(' '));assert.equal(url.searchParams.get('include_granted_scopes'),'false');assert.equal(url.searchParams.get('prompt'),'consent');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('login_hint'),binding.account);
 const old={state:url.searchParams.get('state'),code:'synthetic-code'};await f.start();
 await assert.rejects(f.make().callback('owner',f.session,old),/expired, consumed/);assert.equal(f.calls.length,0);
 const input=await f.start();await assert.rejects(f.make().callback('owner','other-signed-owner-session',input),/another session/);assert.equal(f.calls.length,0);
 f.advance(600001);await assert.rejects(f.make().callback('owner',f.session,input),/expired/);
});

for(const [name,claims] of Object.entries({personal:{email:'personal@gmail.com',hd:undefined},issuer:{iss:'https://evil.invalid'},audience:{aud:'wrong-client'},nonce:{nonce:'wrong-nonce'},expired:{exp:1},unverified:{email_verified:false},domain:{hd:'other.invalid'},azp:{azp:'other-client'}}))test('callback rejects '+name+' identity and consumes its state',async()=>{
 const f=fixture(),input=await f.start();f.claims(claims);
 await assert.rejects(f.make().callback('owner',f.session,input),/owner reauthorization/);assert.equal((await f.make().status()).status,'Reauthorization required');
 await assert.rejects(f.make().callback('owner',f.session,input),/consumed/);assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,1);await assert.rejects(f.make().getAccessToken());
});

for(const [name,tokens] of Object.entries({missing_refresh:{refresh_token:undefined},missing_scopes:{scope:undefined},missing_identity:{id_token:undefined},broader_mail:{scope:[...googleOAuthScopes,'https://mail.google.com/'].join(' ')},partial_scopes:{scope:googleOAuthScopes.slice(1).join(' ')},token_type:{token_type:'other'},bad_expiry:{expires_in:1}}))test('callback holds '+name+' grant with redacted output',async()=>{
 const f=fixture();f.tokens(tokens);await assert.rejects(f.connect(),error=>{assert.doesNotMatch(String(error),/synthetic-access|synthetic-refresh|synthetic-code|synthetic-client-secret/);return /reauthorization/.test(error.message);});assert.equal((await f.make().status()).status,'Reauthorization required');
});

test('Google email scope spelling and equivalent aliases normalize to one set without admitting profile',async()=>{
 const f=fixture();f.tokens({scope:googleOAuthScopes.map(s=>s.endsWith('/userinfo.email')?'email':s).join(' ')});assert.equal((await f.connect()).status,'Connected');
 const other=fixture();other.tokens({scope:googleOAuthScopes.join(' ')+' email'});assert.equal((await other.connect()).status,'Connected');assert.deepEqual((await other.make().getAccessToken()).scopes,googleOAuthScopes);
 const broader=fixture();broader.tokens({scope:googleOAuthScopes.join(' ')+' https://www.googleapis.com/auth/userinfo.profile'});await assert.rejects(broader.connect());
});

test('certificate signature validation is real and never trusts token-selected signing URLs',async()=>{
 const f=fixture(),input=await f.start();const seconds=Math.floor(Date.now()/1000);
 f.tokens({id_token:jwt({iss:'https://accounts.google.com',aud:binding.client_id,iat:seconds,exp:seconds+3600},{alg:'none',kid:'synthetic-key',jku:'https://evil.invalid'})});await assert.rejects(f.make().callback('owner',f.session,input));assert.ok(f.calls.every(c=>c.url.startsWith('https://oauth2.googleapis.com/')));
 const second=fixture(),other=await second.start();second.tokens({id_token:jwt({iat:seconds,exp:seconds+3600}).slice(0,-20)+'tampered-signature'});await assert.rejects(second.make().callback('owner',second.session,other));assert.equal((await second.make().status()).status,'Reauthorization required');
});

test('concurrent callbacks claim once; replay, owner disconnect and uncertain claims cannot exchange again',async()=>{
 const f=fixture(),input=await f.start();const results=await Promise.allSettled([f.make().callback('owner',f.session,input),f.make().callback('owner',f.session,input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,1);
 await assert.rejects(f.make().callback('owner',f.session,input));await f.make().disconnect('owner');await assert.rejects(f.make().getAccessToken());assert.equal((await f.make().status()).status,'Disconnected');
 const uncertain=fixture(),pending=await uncertain.start();uncertain.raw.lose=true;await assert.rejects(uncertain.make().callback('owner',uncertain.session,pending));await assert.rejects(uncertain.make().callback('owner',uncertain.session,pending));assert.equal(uncertain.calls.length,0);
});

test('disconnect wins against a callback in flight and no provider grant is silently revoked',async()=>{
 const f=fixture(),input=await f.start();let release;f.wait(new Promise(r=>release=r));const attempt=f.make().callback('owner',f.session,input);
 while(!f.calls.length)await new Promise(r=>setImmediate(r));await f.make().disconnect('owner');release();await assert.rejects(attempt);assert.equal((await f.make().status()).status,'Disconnected');await assert.rejects(f.make().getAccessToken());assert.equal(f.calls.length,2);
});

test('credential tamper, key changes and AAD deployment/tenant/client/namespace changes fail closed',async()=>{
 const f=fixture();await f.connect();const saved=structuredClone(f.raw.records.get('credential'));
 for(const field of ['tag','ciphertext','iv']){const entry=structuredClone(saved);entry.data[field]=(entry.data[field][0]==='A'?'B':'A')+entry.data[field].slice(1);f.raw.records.set('credential',entry);assert.equal((await f.make().status()).status,'Reauthorization required');await assert.rejects(f.make().getAccessToken());}
 const truncated=structuredClone(saved);truncated.data.tag=Buffer.from(truncated.data.tag,'base64url').subarray(0,4).toString('base64url');f.raw.records.set('credential',truncated);await assert.rejects(f.make().getAccessToken());
 f.raw.records.set('credential',saved);
 const reordered=Object.fromEntries(Object.entries(binding).reverse());assert.equal((await f.make({env:{...env,EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(reordered)}}).status()).status,'Connected');
 for(const override of [{EVZ_GOOGLE_CREDENTIAL_KEY_ID:'new-key'},{EVZ_GOOGLE_CREDENTIAL_KEY:Buffer.alloc(32,8).toString('base64url')},{EVZ_GOOGLE_CREDENTIAL_NAMESPACE:'evz-google-credentials-other-synthetic'},{DEPLOY_ID:'other-deploy',EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify({...binding,deploy_id:'other-deploy'})},{EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify({...binding,tenant_id:'other-tenant'})},{EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify({...binding,client_id:'other-client.apps.googleusercontent.com'})}]){
  const oauth=f.make({env:{...env,...override},storeFactory:()=>f.raw});assert.equal((await oauth.status()).status,'Reauthorization required');await assert.rejects(oauth.getAccessToken());
 }
});

test('one refresh across fresh instances; an overlapping refresh or lost claim never retries',async()=>{
 const f=fixture();await f.connect();f.advance(3550000);await assert.rejects(f.make({grantId:'different-grant'}).getAccessToken());assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,1);let release;f.wait(new Promise(r=>release=r));const first=f.make().getAccessToken();
 while(f.calls.filter(c=>c.url.endsWith('/token')).length<2)await new Promise(r=>setImmediate(r));await assert.rejects(f.make().getAccessToken());release();assert.equal((await first).access_token,'synthetic-access-token');await f.make().getAccessToken();assert.equal(f.calls.filter(c=>c.url.endsWith('/token')).length,2);
 const uncertain=fixture();await uncertain.connect();uncertain.advance(3550000);uncertain.raw.lose=true;await assert.rejects(uncertain.make().getAccessToken());await assert.rejects(uncertain.make().getAccessToken());assert.equal(uncertain.calls.filter(c=>c.url.endsWith('/token')).length,1);
});

test('refresh invalid_grant, overbroad scopes, response loss and consent expiry disable new token use',async()=>{
 for(const failure of ['invalid_grant','scope','lost','expiry']){
  const f=fixture();await f.connect();f.advance(failure==='expiry'?604800001:3550000);
  const failFetch=async()=>{if(failure==='lost')throw Error('synthetic-refresh-token secret');return failure==='invalid_grant'?Response.json({error:'invalid_grant',refresh_token:'synthetic-refresh-token'},{status:400}):Response.json({access_token:'synthetic-access-token',token_type:'Bearer',expires_in:3600,scope:googleOAuthScopes.join(' ')+' https://www.googleapis.com/auth/drive'});};
  const oauth=f.make({fetcher:failFetch});await assert.rejects(oauth.getAccessToken(),/reauthorization/);await assert.rejects(f.make().getAccessToken());assert.equal((await f.make().status()).status,'Reauthorization required');assert.doesNotMatch(JSON.stringify([...f.raw.records]),/synthetic-refresh-token/);
 }
});

test('disconnect wins against refresh; Gmail 401 invalidates exact grant without retrying POST',async()=>{
 const f=fixture();const connected=await f.connect();const oauth=f.make();let posts=0;
 const transport=googleHostedTransport({getAccessToken:oauth.getAccessToken,account:binding.account,grantId:connected.grant_id,fetcher:async()=>{posts++;return Response.json({error:'expired'},{status:401});}});
 await assert.rejects(transport.send({raw:Buffer.from('synthetic')}),/401/);assert.equal(posts,1);await assert.rejects(oauth.getAccessToken());assert.equal((await oauth.status()).status,'Reauthorization required');
 const other=fixture();await other.connect();other.advance(3550000);let release;other.wait(new Promise(r=>release=r));const refresh=other.make().getAccessToken();while(other.calls.filter(c=>c.url.endsWith('/token')).length<2)await new Promise(r=>setImmediate(r));await other.make().disconnect('owner');release();await assert.rejects(refresh);assert.equal((await other.make().status()).status,'Disconnected');
});

test('OAuth fetches are endpoint-pinned, bounded, no-retry and never expose provider errors',async()=>{
 for(const mode of ['oversize','redirect','bad-json']){const f=fixture(),input=await f.start();let calls=0;const oauth=f.make({fetcher:async(url,options)=>{calls++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(options.redirect,'error');if(mode==='redirect')return new Response('secret',{status:302,headers:{location:'https://evil.invalid'}});return new Response(mode==='oversize'?'x'.repeat(100001):'synthetic-refresh-token');}});await assert.rejects(oauth.callback('owner',f.session,input),error=>{assert.doesNotMatch(String(error),/synthetic|secret|evil/);return true;});assert.equal(calls,1);}
});

test('wrong state does not exchange; denial consumes the matching state without provider effects',async()=>{
 const f=fixture(),input=await f.start();await assert.rejects(f.make().callback('owner',f.session,{...input,state:'x'.repeat(43)}),/another session/);assert.equal(f.calls.length,0);
 await assert.rejects(f.make().callback('owner',f.session,{state:input.state,error:true}));assert.equal(f.calls.length,0);await assert.rejects(f.make().callback('owner',f.session,input),/consumed/);assert.equal((await f.make().status()).status,'Reauthorization required');
});

test('lost exchange response and committed final-write response are never exchanged twice',async()=>{
 const f=fixture(),input=await f.start();let exchanges=0;await assert.rejects(f.make({fetcher:async()=>{exchanges++;throw Error('Committed token exchange response lost synthetic-secret');}}).callback('owner',f.session,input));await assert.rejects(f.make().callback('owner',f.session,input));assert.equal(exchanges,1);await assert.rejects(f.make().getAccessToken());
 const other=fixture(),next=await other.start();
 // Lose the final write response after signature verification, preserving only the verified stored grant.
 const oauth=other.make({certificates:async()=>{other.raw.lose=true;return certs;}});await assert.rejects(oauth.callback('owner',other.session,next));assert.equal((await other.make().status()).status,'Connected');await assert.rejects(other.make().callback('owner',other.session,next));assert.equal(other.calls.filter(c=>c.url.endsWith('/token')).length,1);assert.equal((await other.make().getAccessToken()).access_token,'synthetic-access-token');
});

test('known refresh lifetime is never extended; old rejected token cannot invalidate a new owner grant',async()=>{
 const f=fixture();f.tokens({refresh_token_expires_in:7200});const first=await f.connect();assert.equal(first.refresh_expires_at,f.time+7200000);const old=await f.make().getAccessToken();f.advance(3550000);f.tokens({refresh_token_expires_in:604800,refresh_token:'synthetic-rotated-refresh'});await f.make().getAccessToken();assert.equal((await f.make().status()).refresh_expires_at,first.refresh_expires_at);
 f.advance(-3550000);const second=await f.connect();assert.notEqual(second.grant_id,first.grant_id);await f.make().getAccessToken.invalidate(old);assert.equal((await f.make().status()).status,'Connected');
});

test('missing or reused encryption key and unavailable credential storage fail closed before OAuth',async()=>{
 for(const override of [{EVZ_GOOGLE_CREDENTIAL_KEY:undefined},{EVZ_GOOGLE_CREDENTIAL_KEY_ID:undefined},{EVZ_GOOGLE_CREDENTIAL_KEY:env.EVZ_OPERATIONS_SESSION_SECRET},{EVZ_GOOGLE_CLIENT_SECRET:undefined}])assert.throws(()=>createGoogleOAuth({env:{...env,...override}}));
 const f=fixture(),oauth=f.make({storeFactory:async()=>{throw Error('synthetic-secret');}});assert.equal((await oauth.status()).status,'Reauthorization required');await assert.rejects(oauth.start('owner',f.session),/reauthorization/);assert.equal(f.calls.length,0);
});

const request=(path,{headers={},method='GET',body}={})=>new Request(origin+'/desk'+path,{headers,method,...(body===undefined?{}:{body:JSON.stringify(body)})});
async function login(handler,role){const boot=await handler(request('/api/bootstrap')),csrf=(await boot.json()).csrf,initial=boot.headers.get('set-cookie').split(';')[0],response=await handler(request('/api/login',{method:'POST',headers:{cookie:initial,origin,'content-type':'application/json','x-studio-token':csrf},body:{key:env[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']}}));return {cookie:initial+'; '+response.headers.get('set-cookie').split(';')[0],origin,'content-type':'application/json','x-studio-token':csrf};}

test('actual hosted handlers enforce owner/login/CSRF/origin/session while friend reads redacted status',async()=>{
 const f=fixture(),handler=createHostedDesk({env,storeFactory:()=>{throw Error('Business records must not be opened');},now:()=>new Date(f.time),googleOAuthOptions:{storeFactory:()=>f.raw,fetcher:async()=>{throw Error('No live call');}}}),owner=await login(handler,'owner'),friend=await login(handler,'friend');
 assert.equal((await handler(request('/api/google-oauth/status'))).status,401);
 assert.equal((await handler(request('/api/google-oauth/start',{method:'POST',headers:friend,body:{}}))).status,400);
 assert.equal((await handler(request('/api/google-oauth/disconnect',{method:'POST',headers:friend,body:{}}))).status,400);
 assert.equal((await handler(request('/api/google-oauth/start',{method:'POST',headers:{...owner,'x-studio-token':'wrong'},body:{}}))).status,403);
 assert.equal((await handler(request('/api/google-oauth/start',{method:'POST',headers:{...owner,origin:'https://evil.invalid'},body:{}}))).status,403);
 const started=await handler(request('/api/google-oauth/start',{method:'POST',headers:owner,body:{redirect_uri:'https://evil.invalid'}}));assert.equal(started.status,200);const url=new URL((await started.json()).authorization_url);assert.equal(url.searchParams.get('redirect_uri'),binding.redirect_uri);
 const landing=await handler(request('/api/google-oauth/callback?code=synthetic-code&state='+url.searchParams.get('state'),{headers:{'sec-fetch-mode':'navigate','sec-fetch-dest':'document','sec-fetch-site':'cross-site'}}));assert.equal(landing.status,200);assert.doesNotMatch(await landing.text(),/synthetic-code|synthetic-access|synthetic-refresh/);assert.equal(landing.headers.get('referrer-policy'),'no-referrer');
 const status=await(await handler(request('/api/google-oauth/status',{headers:friend}))).json();assert.equal(status.status,'Awaiting owner authorization');assert.doesNotMatch(JSON.stringify(status),/synthetic-code|verifier|nonce/);
 const input={state:url.searchParams.get('state'),code:'synthetic-code'};assert.equal((await handler(request('/api/google-oauth/callback',{method:'POST',headers:friend,body:input}))).status,400);
 const freshOwner=await login(handler,'owner');assert.equal((await handler(request('/api/google-oauth/callback',{method:'POST',headers:freshOwner,body:input}))).status,400);assert.equal(f.calls.length,0);
 f.advance(8*3600000+1);assert.equal((await handler(request('/api/google-oauth/callback',{method:'POST',headers:owner,body:input}))).status,403);
});

test('disabled, wrong deployment and inert workspace cannot create a hosted grant',async()=>{
 for(const override of [{EVZ_OPERATIONS_GOOGLE_OAUTH:undefined},{EVZ_OPERATIONS_DESK_ENABLED:'inert-shared-v1'},{DEPLOY_ID:'other'},{EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify({...binding,redirect_uri:'https://evil.invalid/callback'})},{EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify({...binding,account:'personal@gmail.com'})},{EVZ_GOOGLE_CREDENTIAL_NAMESPACE:env.EVZ_OPERATIONS_BLOB_NAMESPACE}])assert.throws(()=>createGoogleOAuth({env:{...env,...override}}));
 const disabled=createHostedDesk({env:{...env,EVZ_OPERATIONS_GOOGLE_OAUTH:undefined}}),friend=await login(disabled,'friend');assert.deepEqual(await(await disabled(request('/api/google-oauth/status',{headers:friend}))).json(),{enabled:false,status:'Disabled',scopes:[]});
});

test('actual owner callback connects a shared grant used by both signed exact-mail callers through real transport wiring',async()=>{
 for(const actor of ['owner','friend']){
  const f=fixture(),business=rawStore();let nonce,sent,posts=0;
  const fetcher=async(url,options)=>{
   if(url==='https://oauth2.googleapis.com/token'){
    const seconds=Math.floor(Date.now()/1000);return Response.json({access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',token_type:'Bearer',expires_in:3600,scope:googleOAuthScopes.join(' '),id_token:jwt({iss:'https://accounts.google.com',aud:binding.client_id,iat:seconds,exp:seconds+3600,sub:'synthetic-owner',email:binding.account,email_verified:true,hd:'evzdigital.studio',nonce})});
   }
   if(url==='https://www.googleapis.com/oauth2/v1/certs')return Response.json(certs);
   const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(options.headers.Authorization,'Bearer synthetic-access-token');
   if(path==='profile')return Response.json({emailAddress:binding.account});
   if(path==='settings/sendAs')return Response.json({sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]});
   if(path==='threads/thread'){
    const text='Could you share examples of website work?';return Response.json({id:'thread',messages:[{id:'incoming',threadId:'thread',internalDate:String(f.time),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:'project@example.invalid'},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Re: Website question'},{name:'Message-ID',value:'<incoming@example.invalid>'},{name:'In-Reply-To',value:'<original@example.invalid>'}],body:{data:Buffer.from(text).toString('base64url'),size:Buffer.byteLength(text)}}}]});
   }
   if(path==='messages/send'){posts++;const body=JSON.parse(options.body);sent={id:'synthetic-sent',threadId:body.threadId,labelIds:['SENT'],raw:body.raw};return Response.json({id:sent.id,threadId:sent.threadId});}
   if(path==='messages/synthetic-sent')return Response.json(sent);
   throw Error('Unexpected fixture endpoint');
  };
  const hostEnv={...env,EVZ_OPERATIONS_GOOGLE_EXACT_MAIL:'fictional-exact-mail-v1'},handler=createHostedDesk({env:hostEnv,storeFactory:()=>business,now:()=>new Date(f.time),googleOAuthOptions:{storeFactory:()=>f.raw,fetcher},googleMailOptions:{fetcher}}),owner=await login(handler,'owner'),headers=actor==='owner'?owner:await login(handler,'friend');
  const post=async(path,body,auth=headers)=>{const response=await handler(request(path,{method:'POST',headers:auth,body})),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
  const started=await post('/api/google-oauth/start',{},owner),url=new URL(started.authorization_url);nonce=url.searchParams.get('nonce');const connected=await post('/api/google-oauth/callback',{state:url.searchParams.get('state'),code:'synthetic-code'},owner);assert.equal(connected.status,'Connected');
  await handler(request('/api/state',{headers}));const entry=business.records.get('workspace');entry.data.config.sender={email:'hello@evzdigital.studio',account_email:binding.account,operator_names:{owner:'Synthetic Owner',friend:'Synthetic Friend'}};entry.data.config.google_exact_mail={enabled:true,capability:'fictional-exact-mail-v1',run_id:entry.data.config.run_id,grant_id:connected.grant_id,account_email:binding.account,from:'hello@evzdigital.studio',daily_limit:20};business.records.set('workspace',entry);
  const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(business),now:()=>new Date(f.time)}),at=new Date(f.time).toISOString(),event=(id,type,data)=>({id,type,data,prospect_id:'project',at});
  await app.apply(fixtureProspect('project',at));await app.apply(event('incoming','reply_received',fixtureReply('incoming','thread','project@example.invalid')),{actor:'provider'});let r=(await app.snapshot()).prospects.project;
  await app.apply(event('review','reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'discovery',focus:'website'}),{actor});r=(await app.snapshot()).prospects.project;
  await app.apply(event('draft','reply_draft_saved',{source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:'Hi,\n\nHere is the exact synthetic reviewed reply.'}),{actor});await app.apply(event('approve','reply_draft_approved',{sha256:(await app.snapshot()).prospects.project.reply_draft.sha256,approved:true,facts_checked:true}),{actor});
  const selector={project_id:'project',kind:'reply'},pack=await post('/api/exact-mail/package',selector),approval=await post('/api/exact-mail/approve',{...selector,revision:(await app.snapshot()).revision,event_id:'exact-approved',package_sha256:pack.sha256,approved:true,facts_checked:true}),result=await post('/api/exact-mail/dispatch',approval);
  assert.equal(result.status,'Verified',JSON.stringify(result));assert.equal(posts,1);assert.equal((await post('/api/exact-mail/dispatch',approval)).status,'Verified');assert.equal(posts,1);
  assert.doesNotMatch(JSON.stringify(business.records.get('workspace')),/synthetic-access-token|synthetic-refresh-token|client_secret|code_verifier/);assert.equal(business.records.has('credential'),false);
 }
});

test('new encrypted OAuth grant wires into both signed incoming callers only after separate incoming capability',async()=>{
 for(const actor of ['owner','friend']){
  const f=fixture(),connected=await f.connect(),business=rawStore(),calls=[];
  const fetcher=async(url,o)=>{
   const u=new URL(url);calls.push(u.pathname);assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(o.method,'GET');assert.equal(o.headers.Authorization,'Bearer synthetic-access-token');
   if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:binding.account,historyId:'100'});
   assert.ok(u.pathname.endsWith('/threads/thread'));const text='Could you share website examples?',part=(id,from,to,extra,labels,time)=>({id,threadId:'thread',labelIds:labels,internalDate:String(time),payload:{mimeType:'text/plain',headers:[{name:'From',value:from},{name:'To',value:to},{name:'Subject',value:id==='original'?'Website question':'Re: Website question'},{name:'Message-ID',value:`<${id}@example.invalid>`},...extra],body:{data:Buffer.from(text).toString('base64url'),size:Buffer.byteLength(text)}}});
   return Response.json({id:'thread',messages:[part('original','hello@evzdigital.studio','project@example.invalid',[],['SENT'],f.time-10000),part('incoming','project@example.invalid','hello@evzdigital.studio',[{name:'In-Reply-To',value:'<original@example.invalid>'},{name:'Authentication-Results',value:'mx.google.com; dmarc=pass header.from=example.invalid'}],['INBOX'],f.time-1000)]});
  };
  const make=enabled=>createHostedDesk({env:{...env,...(enabled?{EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL:'fictional-incoming-v1'}:{})},storeFactory:()=>business,now:()=>new Date(f.time),googleOAuthOptions:{storeFactory:()=>f.raw,fetcher:async()=>{throw Error('No refresh needed');}},googleIncomingOptions:{fetcher}}),handler=make(false),headers=await login(handler,actor);
  await handler(request('/api/state',{headers}));const entry=business.records.get('workspace'),c=entry.data.config;c.sender={email:'hello@evzdigital.studio',account_email:binding.account};c.google_incoming_mail={enabled:true,capability:'fictional-incoming-v1',run_id:c.run_id,grant_id:connected.grant_id,account_email:binding.account};c.operations={threads:{project:{thread_id:'thread',original_id:'original',from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Website question'}}};business.records.set('workspace',entry);
  const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(business),now:()=>new Date(f.time)});await app.apply(fixtureProspect('project',new Date(f.time).toISOString()));
  const input={method:'POST',headers,body:{}};assert.equal((await handler(request('/api/incoming-mail/sync',input))).status,400);assert.equal(calls.length,0);
  const result=await make(true)(request('/api/incoming-mail/sync',input));assert.equal(result.status,200,await result.clone().text());assert.equal((await app.snapshot()).prospects.project.stage,'Reply review');assert.equal(calls.length,2);assert.doesNotMatch(JSON.stringify(business.records.get('workspace')),/synthetic-access-token|synthetic-refresh-token|client_secret|code_verifier/);
 }
});
