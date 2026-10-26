import {operationsPDFMailCapability,operationsMailCapability,operationsMailProfile,operationsMailScopes,hasOperationsMail} from './shared-operations-exact-mail.mjs';
import {isDispatchCapability,dispatchHasManual,validateDispatchEnvelope} from './shared-internal-dispatch.mjs';
import {operationsCalendarCapability,hasOperationsCalendar} from './shared-operations-calendar.mjs';
import {operationsOriginalsCapability,hasOperationsOriginals} from './shared-operations-originals.mjs';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {check,hash} from './lifecycle.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';

export const operationsMailOAuthPath='/desk/api/operations-exact-mail-oauth';
export const googleOAuthPath='/desk/api/google-oauth';
export const dispatchOAuthProfile='internal-dispatch-gmail-v1';
export const dispatchOAuthPath='/desk/api/internal-google-oauth';
export const driveOAuthProfile='drive-originals-readonly-v1';
export const driveOAuthPath='/desk/api/google-drive-oauth';
export const driveOAuthScopes=['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/drive.readonly'];
export const calendarOAuthProfile='calendar-booking-v1';
export const calendarOAuthPath='/desk/api/google-calendar-oauth';
export const calendarOAuthScopes=['openid','https://www.googleapis.com/auth/userinfo.email',...['calendar.freebusy','calendar.events.owned','calendar.calendars.readonly'].map(s=>'https://www.googleapis.com/auth/'+s)];
const scopesFor=profile=>profile===operationsMailProfile?operationsMailScopes:profile===driveOAuthProfile?driveOAuthScopes:profile===calendarOAuthProfile?calendarOAuthScopes:googleOAuthScopes;
export const googleOAuthScopes=['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes];
const digest=value=>createHash('sha256').update(value).digest('base64url');
const opaque=()=>randomBytes(32).toString('base64url');
const safeToken=value=>typeof value==='string'&&/^[\x21-\x7e]{10,8192}$/.test(value);
const short=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const unavailable=()=>Error('Google connection unavailable; owner reauthorization required');
export function normalizedGoogleScopes(value,profile){
 const expected=scopesFor(profile);
 check(typeof value==='string'&&value.length<2048,'Exact Google scopes required');
 if(profile===operationsMailProfile)check(!value.trim().split(/\s+/).includes('email'),'Exact mail requires canonical userinfo.email scope');
 const scopes=[...new Set(value.trim().split(/\s+/).map(s=>s==='email'?'https://www.googleapis.com/auth/userinfo.email':s))];
 check(scopes.length===expected.length&&expected.every(s=>scopes.includes(s)),profile===driveOAuthProfile?'Exact Google identity and Drive read-only scopes required':profile===calendarOAuthProfile?'Exact Google identity and Calendar scopes required':'Exact Google identity and Gmail scopes required');
 return [...expected];
}
function configuration(env,profile,dispatchApp){
 check(profile===undefined||profile===driveOAuthProfile||profile===calendarOAuthProfile||profile===dispatchOAuthProfile||profile===operationsMailProfile,'Unsupported Google grant profile');
 const mail=profile===operationsMailProfile,drive=profile===driveOAuthProfile,calendar=profile===calendarOAuthProfile,dispatch=profile===dispatchOAuthProfile,sharedMail=mail,sharedIncoming=dispatch&&env.EVZ_OPERATIONS_DESK_ENABLED===operationsPDFMailCapability,sharedDrive=drive&&[operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability,operationsPDFMailCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED),sharedCalendar=calendar&&[operationsCalendarCapability,operationsMailCapability,operationsPDFMailCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED);
 const originalEnv=env;
 if(drive||calendar||dispatch||mail){
  check(mail?env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL_OAUTH==='owner-shared-exact-mail-code-v1':dispatch?env.EVZ_INTERNAL_GOOGLE_OAUTH==='owner-internal-gmail-code-v1':calendar?env.EVZ_OPERATIONS_GOOGLE_CALENDAR_OAUTH===(sharedCalendar?'owner-shared-calendar-code-v1':'owner-calendar-code-v1'):env.EVZ_OPERATIONS_GOOGLE_DRIVE_OAUTH===(sharedDrive?'owner-shared-drive-code-v1':'owner-drive-code-v1'),'Exact separate owner connection is disabled');
  env={...env,EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-code-v1',...Object.fromEntries(['OAUTH_BINDING','CREDENTIAL_NAMESPACE','CREDENTIAL_KEY_ID','CREDENTIAL_KEY','CLIENT_SECRET'].map(k=>['EVZ_GOOGLE_'+k,env[(mail?'EVZ_OPERATIONS_EXACT_MAIL_':dispatch?'EVZ_INTERNAL_GOOGLE_':calendar?(sharedCalendar?'EVZ_OPERATIONS_CALENDAR_':'EVZ_CALENDAR_'):sharedDrive?'EVZ_OPERATIONS_DRIVE_':'EVZ_DRIVE_')+k]]))};
 }
 check(env.EVZ_OPERATIONS_GOOGLE_OAUTH==='owner-code-v1','Google owner connection is disabled');
 let binding;try{binding=JSON.parse(env.EVZ_GOOGLE_OAUTH_BINDING);}catch{throw unavailable();}
 const origin=new URL(binding.origin);
 check((sharedMail||sharedIncoming?env.CONTEXT==='production'&&hasOperationsMail(dispatchApp??{}):sharedCalendar?env.CONTEXT==='production'&&hasOperationsCalendar(dispatchApp??{}):sharedDrive?env.CONTEXT==='production'&&hasOperationsOriginals(dispatchApp??{}):dispatch?env.CONTEXT==='production'&&isDispatchCapability(env.EVZ_OPERATIONS_DESK_ENABLED):env.CONTEXT==='deploy-preview'&&env.EVZ_OPERATIONS_DESK_ENABLED==='fictional-preview')&&origin.protocol==='https:'&&origin.origin===binding.origin&&origin.origin===env.EVZ_OPERATIONS_ORIGIN&&binding.site_id===env.SITE_ID&&binding.deploy_id===env.DEPLOY_ID&&short(binding.site_id)&&short(binding.deploy_id)&&short(binding.tenant_id),'Exact Google deployment binding required');
 let sharedBinding={};
 if(sharedDrive||sharedCalendar||sharedMail||sharedIncoming){const actual=dispatchApp.store.dispatchBinding,b=actual.scope;sharedBinding={capability:dispatchApp.config.shared_capability,workspace_id:b.workspace_id,run_id:b.run_id,namespace:b.namespace,dispatch_binding_sha256:hash(actual),source_policy_sha256:hash(sharedIncoming?dispatchApp.config.internal_dispatch:sharedMail?dispatchApp.config.google_exact_mail:sharedCalendar?dispatchApp.config.google_calendar:dispatchApp.config.google_drive_originals)};check(Object.keys(binding).sort().join(',')===[...Object.keys(sharedBinding),'tenant_id','site_id','deploy_id','origin','redirect_uri','client_id','account','audience'].sort().join(',')&&b.capability===originalEnv.EVZ_OPERATIONS_DESK_ENABLED&&dispatchApp.config.shared_capability===b.capability&&dispatchApp.store.key==='workspace'&&!dispatchApp.store.projectBinding&&Object.entries(sharedBinding).every(([k,v])=>binding[k]===v)&&hash(JSON.parse(env.EVZ_INTERNAL_DISPATCH_BINDING??'null'))===hash(actual)&&b.site_id===binding.site_id&&b.deploy_id===binding.deploy_id&&b.origin===binding.origin&&b.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE,'Exact live shared Drive workspace binding required');}
 if(dispatch)check(dispatchHasManual(env.EVZ_OPERATIONS_DESK_ENABLED)?binding.capability===env.EVZ_OPERATIONS_DESK_ENABLED:binding.capability===undefined||binding.capability===env.EVZ_OPERATIONS_DESK_ENABLED,'Exact internal Google capability binding required; never transplant prior grant authority');
 check(binding.redirect_uri===origin.origin+(mail?operationsMailOAuthPath:dispatch?dispatchOAuthPath:drive?driveOAuthPath:calendar?calendarOAuthPath:googleOAuthPath)+'/callback'&&binding.account==='ensizziyo@evzdigital.studio'&&/^[A-Za-z0-9_-]{6,180}\.apps\.googleusercontent\.com$/.test(binding.client_id)&&['external-testing','internal'].includes(binding.audience),'Exact business Google client/account/redirect required');
 const namespace=env.EVZ_GOOGLE_CREDENTIAL_NAMESPACE,keyId=env.EVZ_GOOGLE_CREDENTIAL_KEY_ID,encoded=env.EVZ_GOOGLE_CREDENTIAL_KEY;
 check((sharedMail?/^evz-operations-exact-mail-credentials-[a-z0-9-]{8,40}$/:sharedCalendar?/^evz-operations-calendar-credentials-[a-z0-9-]{8,40}$/:sharedDrive?/^evz-operations-drive-credentials-[a-z0-9-]{8,40}$/:dispatch?/^evz-internal-google-credentials-[a-z0-9-]{8,40}$/:drive?/^evz-drive-credentials-[a-z0-9-]{8,40}$/:calendar?/^evz-calendar-credentials-[a-z0-9-]{8,40}$/:/^evz-google-credentials-[a-z0-9-]{8,40}$/).test(namespace??'')&&namespace!==env.EVZ_OPERATIONS_BLOB_NAMESPACE&&short(keyId)&&typeof encoded==='string'&&/^[A-Za-z0-9_-]{43}$/.test(encoded),'Separate Google credential storage and key required');
 const key=Buffer.from(encoded,'base64url');check(key.length===32&&key.toString('base64url')===encoded&&![env.EVZ_OPERATIONS_OWNER_KEY,env.EVZ_OPERATIONS_FRIEND_KEY,env.EVZ_OPERATIONS_SESSION_SECRET].includes(encoded)&&safeToken(env.EVZ_GOOGLE_CLIENT_SECRET),'Google secret configuration is unavailable');
 if(drive)check(namespace!==originalEnv.EVZ_GOOGLE_CREDENTIAL_NAMESPACE&&encoded!==originalEnv.EVZ_GOOGLE_CREDENTIAL_KEY,'Drive credentials must be independent of Gmail');
 if(sharedDrive||sharedCalendar||sharedMail)check(['EVZ_OPERATIONS_OWNER_KEY','EVZ_OPERATIONS_FRIEND_KEY','EVZ_OPERATIONS_SESSION_SECRET','EVZ_INTERNAL_DISPATCH_SECRET','EVZ_REFINEMENT_DISPATCH_SECRET'].every(name=>encoded!==originalEnv[name]&&env.EVZ_GOOGLE_CLIENT_SECRET!==originalEnv[name])&&['EVZ_GOOGLE_','EVZ_DRIVE_','EVZ_CALENDAR_','EVZ_INTERNAL_GOOGLE_',...(sharedMail?['EVZ_OPERATIONS_DRIVE_','EVZ_OPERATIONS_CALENDAR_']:[sharedCalendar?'EVZ_OPERATIONS_DRIVE_':'EVZ_OPERATIONS_CALENDAR_']),...(!sharedMail?['EVZ_OPERATIONS_EXACT_MAIL_']:[])].every(prefix=>namespace!==originalEnv[prefix+'CREDENTIAL_NAMESPACE']&&(!sharedMail||keyId!==originalEnv[prefix+'CREDENTIAL_KEY_ID'])&&encoded!==originalEnv[prefix+'CREDENTIAL_KEY']&&env.EVZ_GOOGLE_CLIENT_SECRET!==originalEnv[prefix+'CLIENT_SECRET']&&(!originalEnv[prefix+'OAUTH_BINDING']||JSON.parse(originalEnv[prefix+'OAUTH_BINDING']).client_id!==binding.client_id)),'Shared Google profile needs independent namespace, AES key, secret and client');
 if(calendar)check([originalEnv.EVZ_GOOGLE_CREDENTIAL_NAMESPACE,originalEnv.EVZ_DRIVE_CREDENTIAL_NAMESPACE].every(v=>v!==namespace)&&[originalEnv.EVZ_GOOGLE_CREDENTIAL_KEY,originalEnv.EVZ_DRIVE_CREDENTIAL_KEY].every(v=>v!==encoded)&&[originalEnv.EVZ_GOOGLE_CLIENT_SECRET,originalEnv.EVZ_DRIVE_CLIENT_SECRET].every(v=>v!==env.EVZ_GOOGLE_CLIENT_SECRET)&&[originalEnv.EVZ_GOOGLE_OAUTH_BINDING,originalEnv.EVZ_DRIVE_OAUTH_BINDING].every(v=>!v||JSON.parse(v).client_id!==binding.client_id),'Calendar credentials and client must be independent of Gmail and Drive');
 if(sharedIncoming)check(['EVZ_GOOGLE_','EVZ_DRIVE_','EVZ_CALENDAR_','EVZ_OPERATIONS_DRIVE_','EVZ_OPERATIONS_CALENDAR_','EVZ_OPERATIONS_EXACT_MAIL_'].every(prefix=>keyId!==originalEnv[prefix+'CREDENTIAL_KEY_ID']),'Incoming credential key identity must remain independent');
 if(dispatch)check(['EVZ_GOOGLE_','EVZ_DRIVE_','EVZ_CALENDAR_',...([operationsOriginalsCapability,operationsCalendarCapability,operationsMailCapability,operationsPDFMailCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED)?['EVZ_OPERATIONS_DRIVE_',...([operationsCalendarCapability,operationsMailCapability,operationsPDFMailCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED)?['EVZ_OPERATIONS_CALENDAR_']:[]),...([operationsMailCapability,operationsPDFMailCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED)?['EVZ_OPERATIONS_EXACT_MAIL_']:[])]:[])].every(prefix=>namespace!==originalEnv[prefix+'CREDENTIAL_NAMESPACE']&&encoded!==originalEnv[prefix+'CREDENTIAL_KEY']&&env.EVZ_GOOGLE_CLIENT_SECRET!==originalEnv[prefix+'CLIENT_SECRET']&&(!originalEnv[prefix+'OAUTH_BINDING']||JSON.parse(originalEnv[prefix+'OAUTH_BINDING']).client_id!==binding.client_id)),'Standing internal OAuth needs its own namespace, key, secret and client; no silent grant reuse');
 return {binding:{...(drive||calendar||dispatch||mail?{profile}:{}),...sharedBinding,...(dispatch&&dispatchHasManual(env.EVZ_OPERATIONS_DESK_ENABLED)?{capability:env.EVZ_OPERATIONS_DESK_ENABLED}:{}),tenant_id:binding.tenant_id,site_id:binding.site_id,deploy_id:binding.deploy_id,origin:binding.origin,redirect_uri:binding.redirect_uri,client_id:binding.client_id,account:binding.account,audience:binding.audience},namespace,keyId,key,secret:env.EVZ_GOOGLE_CLIENT_SECRET,sharedDrive,sharedCalendar,sharedMail,sharedIncoming};
}
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}

// A single bounded envelope is the grant authority. A claim is never retried or reclaimed.
export function createGoogleOAuth({env=process.env,storeFactory=defaultStore,fetcher=fetch,now=()=>Date.now(),certificates,grantId,profile,dispatchApp}={}){
 const c=configuration(env,profile,dispatchApp),b=c.binding,scopes=scopesFor(profile),expectedGrant=c.sharedIncoming?dispatchApp.config.internal_dispatch.grant_id:c.sharedMail?dispatchApp.config.google_exact_mail.grant_id:grantId;
 check(!c.sharedMail||grantId===undefined||grantId===expectedGrant,'Exact prebound mail grant required');
 async function assertWorkspace(){if(!c.sharedDrive&&!c.sharedCalendar&&!c.sharedMail&&!c.sharedIncoming)return;const {data}=await dispatchApp.store.envelope();validateDispatchEnvelope(data,dispatchApp.store.dispatchBinding);check((c.sharedMail||c.sharedIncoming?hasOperationsMail(dispatchApp):c.sharedCalendar?hasOperationsCalendar(dispatchApp):hasOperationsOriginals(dispatchApp))&&hash(data.config)===hash(dispatchApp.config)&&hash(dispatchApp.store.dispatchBinding)===b.dispatch_binding_sha256&&hash(c.sharedIncoming?data.config.internal_dispatch:c.sharedMail?data.config.google_exact_mail:c.sharedCalendar?data.config.google_calendar:data.config.google_drive_originals)===b.source_policy_sha256&&hash(configuration(env,profile,dispatchApp).binding)===hash(b),'Live shared Drive source/configuration changed');}
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
 async function read(){try{await assertWorkspace();const raw=await storeFactory(c.namespace);await assertWorkspace();const entry=await raw.getWithMetadata('credential',{type:'json',consistency:'strong'});await assertWorkspace();if(!entry)return {raw,data:null,etag:null};check(typeof entry.etag==='string'&&entry.etag,'Google credential version missing');return {raw,data:decrypt(entry.data),etag:entry.etag};}catch{throw unavailable();}}
 async function write(entry,data){
  try{await assertWorkspace();const result=await entry.raw.setJSON('credential',encrypt(data),entry.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true});await assertWorkspace();check(result?.modified===true&&typeof result.etag==='string'&&result.etag,'Google credential claim unavailable');return {...entry,data,etag:result.etag};}catch{throw unavailable();}
 }
 async function halt(entry){try{await write(entry,{grant_id:entry.data.grant_id,status:'Reauthorization required',at:now()});}catch{} }
 async function json(url,options={},max=100000){
  await assertWorkspace();let response;try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});await assertWorkspace();}catch{throw unavailable();}
  if(!response.ok){await response.body?.cancel();throw unavailable();}
  try{check(response.body,'Google response missing');const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();await assertWorkspace();if(done)break;size+=value.length;check(size<=max,'Google response too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));check(data&&typeof data==='object'&&!Array.isArray(data),'Google response invalid');return data;
  }catch{throw unavailable();}
 }
 const exchange=params=>json('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:b.client_id,client_secret:c.secret,...params}).toString()});
 async function identity(token,nonce){
  check(safeToken(token),'Google identity token missing');
  const header=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));check(header.alg==='RS256'&&short(header.kid),'Google identity signing algorithm differs');
  await assertWorkspace();const certs=certificates?await certificates():await json('https://www.googleapis.com/oauth2/v1/certs',{},200000);
  await assertWorkspace();check(Object.keys(certs).length>0&&Object.keys(certs).length<=10&&Object.entries(certs).every(([kid,pem])=>short(kid)&&typeof pem==='string'&&pem.length<12000),'Google signing keys invalid');
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
  let entry=await read(),d=entry.data;check(d?.status==='Active'&&(expectedGrant===undefined||d.grant_id===expectedGrant),'Google grant unavailable; owner reauthorization required');
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
 async function assertGrant(expected,token){
  const {data}=await read();check(data?.status==='Active'&&(expectedGrant===undefined||data.grant_id===expectedGrant)&&(!data.refresh_expires_at||data.refresh_expires_at>now())&&data.expires_at>now()+10000,'Independent Google grant is no longer current');
  const current={profile,account:b.account,grant_id:data.grant_id,scopes:data.scopes,expires_at:data.expires_at};
  check((!expected||hash(current)===hash(expected))&&(!token||token.access_token===data.access_token),'Independent Google grant changed during the request');return current;
 }
 getAccessToken.assertGrant=expected=>assertGrant(expected);
 getAccessToken.assertCurrent=token=>assertGrant(Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,token[k]])),token);
 // The Gmail adapter can invalidate only the exact token that received a 401.
 getAccessToken.invalidate=async token=>{const entry=await read();if(entry.data?.status==='Active'&&entry.data.grant_id===token.grant_id&&entry.data.access_token===token.access_token)await halt(entry);};
 return {
  getAccessToken,
  async status(){try{return metadata((await read()).data);}catch{return {enabled:true,status:'Reauthorization required',account:b.account,scopes:[]};}},
  async start(actor,session){
   check(actor==='owner'&&typeof session==='string'&&session.length>50,'Only the signed owner can connect Google');
   const state=opaque(),nonce=opaque(),verifier=opaque(),grant_id=c.sharedMail?dispatchApp.config.google_exact_mail.grant_id:c.sharedCalendar?dispatchApp.config.google_calendar.grant_id:c.sharedDrive?dispatchApp.config.google_drive_originals.grant_id:opaque(),expires_at=now()+600000;
   await write(await read(),{grant_id,status:'Authorizing',at:now(),pending:{state_sha256:digest(state),session_sha256:digest(session),nonce,verifier,expires_at}});
   const query=new URLSearchParams({client_id:b.client_id,redirect_uri:b.redirect_uri,response_type:'code',scope:(c.sharedMail?scopes:['openid','email',...scopes.slice(2)]).join(' '),state,nonce,code_challenge:digest(verifier),code_challenge_method:'S256',access_type:'offline',prompt:'consent',include_granted_scopes:'false',login_hint:b.account,hd:'evzdigital.studio'});
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

export const calendarOAuthCallbackHTML=googleOAuthCallbackHTML.replaceAll('google-oauth-callback.js','google-calendar-oauth-callback.js');
export const calendarOAuthCallbackJS=googleOAuthCallbackJS.replaceAll('/google-oauth/','/google-calendar-oauth/').replace('Sending still requires its separate exact approval and transport policy.','Calendar invitations require their separate exact guest confirmation and transport policy.');
export const dispatchOAuthCallbackHTML=googleOAuthCallbackHTML.replaceAll('google-oauth-callback.js','internal-google-oauth-callback.js');
export const dispatchOAuthCallbackJS=googleOAuthCallbackJS.replaceAll('/google-oauth/','/internal-google-oauth/').replace('Sending still requires its separate exact approval and transport policy.','Internal dispatch still requires the separate exact finite standing owner policy.');

export const operationsMailOAuthCallbackHTML=googleOAuthCallbackHTML.replaceAll('google-oauth-callback.js','operations-exact-mail-oauth-callback.js');
export const operationsMailOAuthCallbackJS=googleOAuthCallbackJS.replaceAll('/google-oauth/','/operations-exact-mail-oauth/').replace('Sending still requires its separate exact approval and transport policy.','Declared-thread replies still require separate exact signed approval. New PDF conversations remain held.');
