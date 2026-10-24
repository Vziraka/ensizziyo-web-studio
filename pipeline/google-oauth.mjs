import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {check} from './lifecycle.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';

export const googleOAuthPath='/desk/api/google-oauth';
export const driveOAuthProfile='drive-originals-readonly-v1';
export const driveOAuthPath='/desk/api/google-drive-oauth';
export const driveOAuthScopes=['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/drive.readonly'];
export const googleOAuthScopes=['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes];
const digest=value=>createHash('sha256').update(value).digest('base64url');
const opaque=()=>randomBytes(32).toString('base64url');
const safeToken=value=>typeof value==='string'&&/^[\x21-\x7e]{10,8192}$/.test(value);
const short=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const unavailable=()=>Error('Google connection unavailable; owner reauthorization required');
export function normalizedGoogleScopes(value,profile){
 const expected=profile===driveOAuthProfile?driveOAuthScopes:googleOAuthScopes;
 check(typeof value==='string'&&value.length<2048,'Exact Google scopes required');
 const scopes=[...new Set(value.trim().split(/\s+/).map(s=>s==='email'?'https://www.googleapis.com/auth/userinfo.email':s))];
 check(scopes.length===expected.length&&expected.every(s=>scopes.includes(s)),profile===driveOAuthProfile?'Exact Google identity and Drive read-only scopes required':'Exact Google identity and Gmail scopes required');
 return [...expected];
}
function configuration(env,profile){
 check(profile===undefined||profile===driveOAuthProfile,'Unsupported Google grant profile');
 const drive=profile===driveOAuthProfile;
 const originalEnv=env;
 if(drive){
  check(env.EVZ_OPERATIONS_GOOGLE_DRIVE_OAUTH==='owner-drive-code-v1','Drive owner connection is disabled');
  env={...env,EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-code-v1',...Object.fromEntries(['OAUTH_BINDING','CREDENTIAL_NAMESPACE','CREDENTIAL_KEY_ID','CREDENTIAL_KEY','CLIENT_SECRET'].map(k=>['EVZ_GOOGLE_'+k,env['EVZ_DRIVE_'+k]]))};
 }
 check(env.EVZ_OPERATIONS_GOOGLE_OAUTH==='owner-code-v1','Google owner connection is disabled');
 let binding;try{binding=JSON.parse(env.EVZ_GOOGLE_OAUTH_BINDING);}catch{throw unavailable();}
 const origin=new URL(binding.origin);
 check(env.CONTEXT==='deploy-preview'&&env.EVZ_OPERATIONS_DESK_ENABLED==='fictional-preview'&&origin.protocol==='https:'&&origin.origin===binding.origin&&origin.origin===env.EVZ_OPERATIONS_ORIGIN&&binding.site_id===env.SITE_ID&&binding.deploy_id===env.DEPLOY_ID&&short(binding.site_id)&&short(binding.deploy_id)&&short(binding.tenant_id),'Exact Google deployment binding required');
 check(binding.redirect_uri===origin.origin+(drive?driveOAuthPath:googleOAuthPath)+'/callback'&&binding.account==='ensizziyo@evzdigital.studio'&&/^[A-Za-z0-9_-]{6,180}\.apps\.googleusercontent\.com$/.test(binding.client_id)&&['external-testing','internal'].includes(binding.audience),'Exact business Google client/account/redirect required');
 const namespace=env.EVZ_GOOGLE_CREDENTIAL_NAMESPACE,keyId=env.EVZ_GOOGLE_CREDENTIAL_KEY_ID,encoded=env.EVZ_GOOGLE_CREDENTIAL_KEY;
 check((drive?/^evz-drive-credentials-[a-z0-9-]{8,40}$/:/^evz-google-credentials-[a-z0-9-]{8,40}$/).test(namespace??'')&&namespace!==env.EVZ_OPERATIONS_BLOB_NAMESPACE&&short(keyId)&&typeof encoded==='string'&&/^[A-Za-z0-9_-]{43}$/.test(encoded),'Separate Google credential storage and key required');
 const key=Buffer.from(encoded,'base64url');check(key.length===32&&key.toString('base64url')===encoded&&![env.EVZ_OPERATIONS_OWNER_KEY,env.EVZ_OPERATIONS_FRIEND_KEY,env.EVZ_OPERATIONS_SESSION_SECRET].includes(encoded)&&safeToken(env.EVZ_GOOGLE_CLIENT_SECRET),'Google secret configuration is unavailable');
 if(drive)check(namespace!==originalEnv.EVZ_GOOGLE_CREDENTIAL_NAMESPACE&&encoded!==originalEnv.EVZ_GOOGLE_CREDENTIAL_KEY,'Drive credentials must be independent of Gmail');
 return {binding:{...(drive?{profile}:{}),tenant_id:binding.tenant_id,site_id:binding.site_id,deploy_id:binding.deploy_id,origin:binding.origin,redirect_uri:binding.redirect_uri,client_id:binding.client_id,account:binding.account,audience:binding.audience},namespace,keyId,key,secret:env.EVZ_GOOGLE_CLIENT_SECRET};
}
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}

// A single bounded envelope is the grant authority. A claim is never retried or reclaimed.
export function createGoogleOAuth({env=process.env,storeFactory=defaultStore,fetcher=fetch,now=()=>Date.now(),certificates,grantId,profile}={}){
 const c=configuration(env,profile),b=c.binding,scopes=profile===driveOAuthProfile?driveOAuthScopes:googleOAuthScopes;
 const aad=grant=>Buffer.from(JSON.stringify({v:1,namespace:c.namespace,key_id:c.keyId,binding:b,grant_id:grant}));
 function encrypt(data){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',c.key,iv,{authTagLength:16});cipher.setAAD(aad(data.grant_id));
  const bytes=Buffer.from(JSON.stringify(data));check(bytes.length<32000,'Google credential envelope exceeds bounds');
  const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]).toString('base64url');
  return {v:1,key_id:c.keyId,grant_id:data.grant_id,iv:iv.toString('base64url'),ciphertext,tag:cipher.getAuthTag().toString('base64url')};
 }
 function decrypt(envelope){
  check(envelope?.v===1&&envelope.key_id===c.keyId&&short(envelope.grant_id)&&/^[A-Za-z0-9_-]{16}$/.test(envelope.iv)&&/^[A-Za-z0-9_-]{22}$/.test(envelope.tag)&&typeof envelope.ciphertext==='string'&&envelope.ciphertext.length<44000&&/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext),'Google credential key or envelope differs');
  const decipher=createDecipheriv('aes-256-gcm',c.key,Buffer.from(envelope.iv,'base64url'),{authTagLength:16});decipher.setAAD(aad(envelope.grant_id));decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'));
  const data=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]).toString('utf8'));
  check(data.grant_id===envelope.grant_id,'Google grant identity differs');return data;
 }
 async function read(){try{const raw=await storeFactory(c.namespace),entry=await raw.getWithMetadata('credential',{type:'json',consistency:'strong'});if(!entry)return {raw,data:null,etag:null};check(typeof entry.etag==='string'&&entry.etag,'Google credential version missing');return {raw,data:decrypt(entry.data),etag:entry.etag};}catch{throw unavailable();}}
 async function write(entry,data){
  try{const result=await entry.raw.setJSON('credential',encrypt(data),entry.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true});check(result?.modified===true&&typeof result.etag==='string'&&result.etag,'Google credential claim unavailable');return {...entry,data,etag:result.etag};}catch{throw unavailable();}
 }
 async function halt(entry){try{await write(entry,{grant_id:entry.data.grant_id,status:'Reauthorization required',at:now()});}catch{} }
 async function json(url,options={},max=100000){
  let response;try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw unavailable();}
  if(!response.ok){await response.body?.cancel();throw unavailable();}
  try{check(response.body,'Google response missing');const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;check(size<=max,'Google response too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));check(data&&typeof data==='object'&&!Array.isArray(data),'Google response invalid');return data;
  }catch{throw unavailable();}
 }
 const exchange=params=>json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:b.client_id,client_secret:c.secret,...params}).toString()});
 async function identity(token,nonce){
  check(safeToken(token),'Google identity token missing');
  const header=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));check(header.alg==='RS256'&&short(header.kid),'Google identity signing algorithm differs');
  const certs=certificates?await certificates():await json('https://www.googleapis.com/oauth2/v1/certs',{},200000);
  check(Object.keys(certs).length>0&&Object.keys(certs).length<=10&&Object.entries(certs).every(([kid,pem])=>short(kid)&&typeof pem==='string'&&pem.length<12000),'Google signing keys invalid');
  const ticket=await new OAuth2Client().verifySignedJwtWithCertsAsync(token,certs,b.client_id,['accounts.google.com','https://accounts.google.com'],7200),p=ticket.getPayload();
  check(p?.aud===b.client_id&&(!p.azp||p.azp===b.client_id)&&['accounts.google.com','https://accounts.google.com'].includes(p.iss)&&Number.isInteger(p.exp)&&p.exp*1000>now()&&Number.isInteger(p.iat)&&p.iat*1000<=now()+60000&&p.iat*1000>=now()-600000&&p.nonce===nonce&&p.email_verified===true&&p.email===b.account&&p.hd==='evzdigital.studio'&&typeof p.sub==='string'&&/^[A-Za-z0-9_-]{1,255}$/.test(p.sub),'Google business identity verification failed');
  return p.sub;
 }
 function access(tokens){check(tokens.token_type==='Bearer'&&safeToken(tokens.access_token)&&Number.isInteger(tokens.expires_in)&&tokens.expires_in>60&&tokens.expires_in<=7200,'Google access grant invalid');return {access_token:tokens.access_token,expires_at:now()+tokens.expires_in*1000};}
 function metadata(data){
  const expired=data?.refresh_expires_at&&data.refresh_expires_at<=now();
  const status=!data?'Not connected':expired?'Reauthorization required':data.status==='Active'?'Connected':data.status==='Authorizing'&&data.pending.expires_at>now()?'Awaiting owner authorization':['Exchanging','Refreshing'].includes(data.status)&&data.at+30000>now()?'Connection in progress':data.status==='Disconnected'?'Disconnected':'Reauthorization required';
  return {enabled:true,status,account:b.account,scopes:data?.status==='Active'&&!expired?data.scopes:[],grant_id:data?.grant_id??null,access_expires_at:data?.status==='Active'?data.expires_at:null,refresh_expires_at:data?.refresh_expires_at??null,audience:b.audience};
 }
 const getAccessToken=async()=>{
  let entry=await read(),d=entry.data;check(d?.status==='Active'&&(grantId===undefined||d.grant_id===grantId),'Google grant unavailable; owner reauthorization required');
  if(d.refresh_expires_at&&d.refresh_expires_at<=now()){await halt(entry);throw unavailable();}
  if(d.expires_at>now()+60000)return {...(profile?{profile}:{}),account:b.account,grant_id:d.grant_id,scopes:d.scopes,access_token:d.access_token,expires_at:d.expires_at};
  entry=await write(entry,{...d,status:'Refreshing',at:now()});
  try{
   const tokens=await exchange({grant_type:'refresh_token',refresh_token:d.refresh_token}),next={...d,...access(tokens),status:'Active',at:now()};
   if(tokens.scope!==undefined)normalizedGoogleScopes(tokens.scope,profile);
   if(tokens.refresh_token!==undefined){check(safeToken(tokens.refresh_token),'Google rotated refresh grant invalid');next.refresh_token=tokens.refresh_token;}
   // A rotated token never extends the original consent's known expiry.
   if(tokens.refresh_token_expires_in!==undefined){check(Number.isSafeInteger(tokens.refresh_token_expires_in)&&tokens.refresh_token_expires_in>0&&Number.isSafeInteger(now()+tokens.refresh_token_expires_in*1000),'Google refresh expiry invalid');next.refresh_expires_at=Math.min(next.refresh_expires_at??Infinity,now()+tokens.refresh_token_expires_in*1000);}
   entry=await write(entry,next);return {...(profile?{profile}:{}),account:b.account,grant_id:next.grant_id,scopes:next.scopes,access_token:next.access_token,expires_at:next.expires_at};
  }catch{await halt(entry);throw unavailable();}
 };
 // The Gmail adapter can invalidate only the exact token that received a 401.
 getAccessToken.invalidate=async token=>{const entry=await read();if(entry.data?.status==='Active'&&entry.data.grant_id===token.grant_id&&entry.data.access_token===token.access_token)await halt(entry);};
 return {
  getAccessToken,
  async status(){try{return metadata((await read()).data);}catch{return {enabled:true,status:'Reauthorization required',account:b.account,scopes:[]};}},
  async start(actor,session){
   check(actor==='owner'&&typeof session==='string'&&session.length>50,'Only the signed owner can connect Google');
   const state=opaque(),nonce=opaque(),verifier=opaque(),grant_id=opaque(),expires_at=now()+600000;
   await write(await read(),{grant_id,status:'Authorizing',at:now(),pending:{state_sha256:digest(state),session_sha256:digest(session),nonce,verifier,expires_at}});
   const query=new URLSearchParams({client_id:b.client_id,redirect_uri:b.redirect_uri,response_type:'code',scope:['openid','email',...scopes.slice(2)].join(' '),state,nonce,code_challenge:digest(verifier),code_challenge_method:'S256',access_type:'offline',prompt:'consent',include_granted_scopes:'false',login_hint:b.account,hd:'evzdigital.studio'});
   return {authorization_url:'https://accounts.google.com/o/oauth2/v2/auth?'+query,expires_at};
  },
  async callback(actor,session,input){
   check(actor==='owner'&&typeof session==='string','Only the signed owner can complete Google authorization');
   check(typeof input.state==='string'&&/^[A-Za-z0-9_-]{43}$/.test(input.state),'Google authorization state invalid');
   let entry=await read();const d=entry.data,p=d?.pending;
   check(d?.status==='Authorizing'&&p.expires_at>now()&&p.session_sha256===digest(session)&&p.state_sha256===digest(input.state),'Google authorization expired, consumed or belongs to another session');
   entry=await write(entry,{grant_id:d.grant_id,status:'Exchanging',at:now()});
   try{
    check(!input.error&&typeof input.code==='string'&&input.code.length>0&&input.code.length<=4096&&!/[\x00-\x20\x7f]/.test(input.code),'Google consent was not completed');
    const tokens=await exchange({grant_type:'authorization_code',code:input.code,redirect_uri:b.redirect_uri,code_verifier:p.verifier});
    const scopes=normalizedGoogleScopes(tokens.scope,profile),subject=await identity(tokens.id_token,p.nonce);
    check(safeToken(tokens.refresh_token),'Google offline refresh grant missing; owner must reconnect');
    let refresh_expires_at=b.audience==='external-testing'?entry.data.at+7*86400000:null;
    if(tokens.refresh_token_expires_in!==undefined){check(Number.isSafeInteger(tokens.refresh_token_expires_in)&&tokens.refresh_token_expires_in>0&&Number.isSafeInteger(entry.data.at+tokens.refresh_token_expires_in*1000),'Google refresh expiry invalid');refresh_expires_at=Math.min(refresh_expires_at??Infinity,entry.data.at+tokens.refresh_token_expires_in*1000);}
    entry=await write(entry,{grant_id:d.grant_id,status:'Active',at:now(),subject,scopes,refresh_token:tokens.refresh_token,refresh_expires_at,...access(tokens)});
    return metadata(entry.data);
   }catch{await halt(entry);throw unavailable();}
  },
  async disconnect(actor){check(actor==='owner','Only the signed owner can disconnect Google');const entry=await read();await write(entry,{grant_id:entry.data?.grant_id??opaque(),status:'Disconnected',at:now()});return {status:'Disconnected',provider_revocation:'Not requested; remove this app separately in the business Google account to revoke the provider grant'};}
 };
}

// Google returns a top-level cross-site navigation; existing Strict owner cookies
// return on the subsequent same-origin fetch. No code or token is interpolated.
export const googleOAuthCallbackHTML='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Business Google connection</title><body><h1>Business Google connection</h1><p role="status">Completing the owner connection…</p><a href="/desk/">Return to the operations desk</a><script src="/desk/google-oauth-callback.js" defer></script></body></html>';
export const googleOAuthCallbackJS=`const query=new URLSearchParams(location.search);history.replaceState(null,'','/desk/api/google-oauth/callback');
async function complete(){
 const state=query.get('state'),code=query.get('code'),error=query.has('error');
 if(query.getAll('state').length!==1||query.getAll('code').length>1||!state||state.length!==43||(!code&&!error)||code?.length>4096)throw Error();
 const boot=await fetch('/desk/api/bootstrap',{credentials:'same-origin',cache:'no-store'});if(!boot.ok)throw Error();const {csrf}=await boot.json();
 const response=await fetch('/desk/api/google-oauth/callback',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Studio-Token':csrf},body:JSON.stringify({state,...(error?{error:true}:{code})})});if(!response.ok)throw Error();
 document.querySelector('[role="status"]').textContent='Business Google connected. Sending still requires its separate exact approval and transport policy.';
}
complete().catch(()=>{document.querySelector('[role="status"]').textContent='Connection was not completed. Sign in as the owner and start a new connection from the operations desk.';});`;

export const driveOAuthCallbackHTML=googleOAuthCallbackHTML.replaceAll('google-oauth-callback.js','google-drive-oauth-callback.js');
export const driveOAuthCallbackJS=googleOAuthCallbackJS.replaceAll('/google-oauth/','/google-drive-oauth/').replace('Sending still requires its separate exact approval and transport policy.','Original reads require their separate exact registered-source policy.');
