import assert from 'node:assert/strict';
import {fixture as calendarFixture} from './shared-operations-calendar.mjs';
import {hash} from '../lifecycle.mjs';
import {replyContent} from '../reply-content.mjs';
import {operationsMailProfile,operationsMailScopes} from '../shared-operations-exact-mail.mjs';
export function currentReplyMessage(){const text='Could you share examples?',h=(name,value)=>({name,value});return {id:'new-incoming',threadId:'thread',historyId:'103',labelIds:['INBOX'],internalDate:String(Date.parse('2026-10-26T13:06:00Z')),payload:{mimeType:'text/plain',headers:[h('From','shared-proof@example.invalid'),h('To','hello@evzdigital.studio'),h('Subject','Re: Website question'),h('Message-ID','<new-incoming@example.invalid>'),h('In-Reply-To','<original@example.invalid>'),h('Authentication-Results','mx.google.com; dmarc=pass header.from=example.invalid')],body:{size:Buffer.byteLength(text),data:Buffer.from(text).toString('base64url')}}};}
export async function signed(f,type,data={},actor=f.actor,id='signed-'+type,project='shared-proof'){return (await f.session(actor)).json('/api/event',{method:'POST',body:{revision:(await f.app.snapshot()).revision,event:{id,type,data,prospect_id:type.startsWith('asset_')?'studio-assets':project,at:f.now().toISOString()}}});}
export async function fixture(t,{actor='owner',reply=true,stableProjectReply=false,importChange,...options}={}){
 const message=currentReplyMessage();if(stableProjectReply)message.internalDate=String(Date.parse('2026-10-24T21:00:00Z'));const f=await calendarFixture(t,{...options,mail:true,actor,...(stableProjectReply?{replyData:{kind:'reply',source_id:message.id,thread_id:message.threadId,content:replyContent(message,message.threadId)}}:{}),importChange(s){
  // Trusted fictional import setup, separate from the signed operator events below. No provider effect occurred.
  s.actions.historic.status='Verified';s.actions.historic.delivery={message_id:'fictional-historical-native',at:'2026-10-24T13:00:00.000Z'};
  s.operations.requests.old={logical:'old',operation:'send',status:'Verified',action_id:'historic',prepared_at:'2026-10-24T13:00:00.000Z',receipt:structuredClone(s.actions.historic.delivery)};
  if(reply&&!stableProjectReply){const r=s.prospects['shared-proof'];r.reply_history??=[];r.reply_history.push(r.reply);r.reply_review_history??=[];r.reply_review_history.push(r.reply_review);delete r.reply_review;r.reply={kind:'reply',source_id:message.id,thread_id:message.threadId,at:new Date(Number(message.internalDate)).toISOString(),content:replyContent(message,message.threadId)};r.stage='Reply review';r.cold_paused=true;}
  importChange?.(s);
 }}),wire={sent:[],calls:[],tokenCalls:0,grantReads:0,active:true,hook:null,bodyHook:null,tokenHook:null,grantHook:null,lost:false,rawChange:null,search:null};
 if(stableProjectReply)f.wire.thread={id:'thread',messages:[f.wire.thread.messages[0],structuredClone(message)]};
 f.env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL='shared-operations-exact-mail-v1';
 const token={profile:operationsMailProfile,account:f.google_exact_mail.account_email,grant_id:f.google_exact_mail.grant_id,scopes:[...operationsMailScopes],access_token:'fictional-independent-exact-mail-token',expires_at:+f.now()+3600000};
 f.googleMailOptions.getAccessToken=async()=>{wire.tokenCalls++;await wire.tokenHook?.();return structuredClone(token);};
 const grant=async(expected,phase)=>{wire.grantReads++;await wire.grantHook?.(phase);assert.equal(wire.active,true,'Fictional exact mail grant disconnected');const value=Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,structuredClone(token[k])]));if(expected)assert.deepEqual(value,expected);return value;};
 f.googleMailOptions.getAccessToken.assertGrant=expected=>grant(expected,'grant');
 f.googleMailOptions.getAccessToken.assertCurrent=async value=>{assert.equal(value.access_token,token.access_token);return grant(Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,value[k]])),'current');};
 f.googleMailOptions.fetcher=async(url,init)=>{
  const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length)+u.search,body=init.body?JSON.parse(init.body):null;
  assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(init.headers.Authorization,'Bearer '+token.access_token);assert.equal(init.redirect,'error');wire.calls.push({path,method:init.method,body_sha256:hash(body)});
  const override=await wire.hook?.(path,body,init);if(override)return override;let data;
  if(path==='profile')data={emailAddress:token.account,historyId:'103',messagesTotal:3,threadsTotal:1};
  else if(path==='settings/sendAs')data={sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted',displayName:'EVZ Digital team'}]};
  else if(path==='threads/thread?format=full')data=structuredClone(f.wire.thread);
  else if(path==='messages/send'){
   const s=await f.app.snapshot(),q=Object.values(s.operations.requests).find(q=>q.raw_base64url===body.raw);assert.equal(q.status,'Uncertain');assert.ok(q.dispatch_claim);assert.equal(body.threadId,'thread');assert.equal(wire.sent.length,0,'Only one original POST');
   data={id:'fictional-exact-sent',threadId:'thread',labelIds:['SENT'],raw:body.raw,historyId:'104',sizeEstimate:Buffer.from(body.raw,'base64url').length};wire.sent.push(structuredClone(data));if(wire.lost)throw Error('Injected fictional lost send response');
  }else if(u.pathname.endsWith('/messages'))data=wire.search??{messages:wire.sent.map(({id,threadId})=>({id,threadId}))};
  else if(path==='messages/fictional-exact-sent?format=raw')data=wire.rawChange?wire.rawChange(structuredClone(wire.sent[0])):structuredClone(wire.sent[0]);
  else throw Error('Unexpected fictional exact mail path '+path);
  const bytes=Buffer.from(JSON.stringify(data));let sent=false;return new Response(new ReadableStream({async pull(controller){if(sent){controller.close();return;}sent=true;await wire.bodyHook?.(path);controller.enqueue(bytes);controller.close();}},{highWaterMark:0}));
 };
 const call=async(operation,data,who=actor)=>(await f.session(who)).json('/api/exact-mail/'+operation,{method:'POST',body:data}),selector={project_id:'shared-proof',kind:'reply'};
 const review=async()=>{const state=await f.app.snapshot(),r=state.prospects['shared-proof'];if(!stableProjectReply)await signed(f,'reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'discovery',focus:'website'},actor);await signed(f,'reply_draft_saved',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),source_sha256:r.reply.content.source_sha256,body:'Thanks for your reply. We can discuss the website flow and share examples.'},actor);const current=(await f.app.snapshot()).prospects['shared-proof'];await signed(f,'reply_draft_approved',{sha256:current.reply_draft.sha256,approved:true,facts_checked:true},actor);return call('package',selector);};
 const approve=async()=>{const pkg=await review();return call('approve',{...selector,revision:(await f.app.snapshot()).revision,event_id:'signed-exact-send',package_sha256:pkg.sha256,approved:true,facts_checked:true});};
 return {...f,actor,mailWire:wire,mailToken:token,call,selector,approve,review,fixture_mutations:['Trusted historical native receipt fixture before source preparation; no send','Trusted complete current incoming reply fixture before source preparation; no mailbox IO']};
}
export async function fictionalMailOAuth(f){
 const {fictionalBlobs}=await import('./hosted-authoring.mjs'),{operationsMailOAuthPath}=await import('../google-oauth.mjs'),{generateKeyPairSync,sign}=await import('node:crypto'),storage=fictionalBlobs({namespace:'evz-operations-exact-mail-credentials-fictional'}),{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),wire={nonce:null,tokens:0,credentialReads:0,hook:null,claims:null,scope:null};
 f.setNow(new Date().toISOString());f.mailToken.expires_at=+f.now()+3600000;
 const b={capability:f.env.EVZ_OPERATIONS_DESK_ENABLED,workspace_id:f.store.dispatchBinding.scope.workspace_id,run_id:f.app.config.run_id,namespace:f.env.EVZ_OPERATIONS_BLOB_NAMESPACE,dispatch_binding_sha256:hash(f.store.dispatchBinding),source_policy_sha256:hash(f.google_exact_mail),site_id:f.env.SITE_ID,deploy_id:f.env.DEPLOY_ID,origin:f.env.EVZ_OPERATIONS_ORIGIN,redirect_uri:f.env.EVZ_OPERATIONS_ORIGIN+operationsMailOAuthPath+'/callback',tenant_id:'fictional-business',account:f.google_exact_mail.account_email,client_id:'fictional-shared-exact-mail.apps.googleusercontent.com',audience:'internal'};
 Object.assign(f.env,{EVZ_OPERATIONS_GOOGLE_EXACT_MAIL_OAUTH:'owner-shared-exact-mail-code-v1',EVZ_OPERATIONS_EXACT_MAIL_OAUTH_BINDING:JSON.stringify(b),EVZ_OPERATIONS_EXACT_MAIL_CREDENTIAL_NAMESPACE:'evz-operations-exact-mail-credentials-fictional',EVZ_OPERATIONS_EXACT_MAIL_CREDENTIAL_KEY_ID:'fictional-exact-mail',EVZ_OPERATIONS_EXACT_MAIL_CREDENTIAL_KEY:Buffer.alloc(32,37).toString('base64url'),EVZ_OPERATIONS_EXACT_MAIL_CLIENT_SECRET:'fictional-independent-exact-mail-secret'});
 f.googleOAuthOptions.storeFactory=namespace=>{wire.credentialReads++;assert.equal(namespace,f.env.EVZ_OPERATIONS_EXACT_MAIL_CREDENTIAL_NAMESPACE);return storage.raw;};
 f.googleOAuthOptions.certificates=async()=>({'fictional-rsa':publicKey.export({type:'spki',format:'pem'})});
 f.googleOAuthOptions.fetcher=async(url,init)=>{
  wire.tokens++;assert.equal(url,'https://oauth2.googleapis.com/token');const form=new URLSearchParams(init.body);assert.equal(form.get('client_secret'),f.env.EVZ_OPERATIONS_EXACT_MAIL_CLIENT_SECRET);await wire.hook?.(form);
  const seconds=Math.floor(+f.now()/1000),payload={iss:'https://accounts.google.com',aud:b.client_id,iat:seconds,exp:seconds+3600,sub:'fictional-exact-business-owner',email:b.account,email_verified:true,hd:'evzdigital.studio',nonce:wire.nonce,...wire.claims},body=[{alg:'RS256',kid:'fictional-rsa'},payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.'),id_token=body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
  return Response.json({access_token:'fictional-owner-exact-mail-access',refresh_token:'fictional-owner-exact-mail-refresh',token_type:'Bearer',expires_in:3600,scope:wire.scope??operationsMailScopes.join(' '),id_token});
 };
 const start=async()=>{const owner=await f.session('owner'),result=await owner.json('/api/operations-exact-mail-oauth/start',{method:'POST',body:{}}),url=new URL(result.authorization_url);wire.nonce=url.searchParams.get('nonce');assert.deepEqual(url.searchParams.get('scope').split(' '),operationsMailScopes);assert.equal(url.searchParams.get('code_challenge_method'),'S256');return {owner,url};};
 return {binding:b,storage,wire,start,async connect(){const {owner,url}=await start(),result=await owner.json('/api/operations-exact-mail-oauth/callback',{method:'POST',body:{state:url.searchParams.get('state'),code:'fictional-mail-code'}});delete f.googleMailOptions.getAccessToken;f.mailToken.access_token='fictional-owner-exact-mail-access';return result;}};
}
