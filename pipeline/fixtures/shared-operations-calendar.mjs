import assert from 'node:assert/strict';
import {fixture as originalFixture} from './shared-operations-originals.mjs';
import {calendarOAuthProfile,calendarOAuthScopes} from '../google-oauth.mjs';
export async function fixture(t,options={}){
 const f=await originalFixture(t,{...options,calendar:true}),calls=[],wire={event:null,mode:'',busy:[],hook:null,bodyHook:null,tokenHook:null,grantHook:null,grantActive:true,grantReads:0};
 f.env.EVZ_OPERATIONS_GOOGLE_CALENDAR=f.env.EVZ_OPERATIONS_DESK_ENABLED;
 const token={profile:calendarOAuthProfile,account:f.google_calendar.account,grant_id:f.google_calendar.grant_id,scopes:[...calendarOAuthScopes],access_token:'fictional-independent-calendar-token',expires_at:+f.now()+3600000};
 f.googleCalendarOptions.getAccessToken=async()=>{await wire.tokenHook?.();return token;};
 const grant=async(expected,phase)=>{wire.grantReads++;await wire.grantHook?.(phase);assert.equal(wire.grantActive,true,'Fictional Calendar grant disconnected');const current=Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,structuredClone(token[k])]));if(expected)assert.deepEqual(current,expected);return current;};
 f.googleCalendarOptions.getAccessToken.assertGrant=expected=>grant(expected,'replay');
 f.googleCalendarOptions.getAccessToken.assertCurrent=async value=>{assert.equal(value.access_token,token.access_token);return grant(Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,value[k]])),'transport');};
 f.googleCalendarOptions.fetcher=async(url,init)=>{
  const u=new URL(url),body=init.body?JSON.parse(init.body):null,kind=u.pathname.endsWith('/primary')?'metadata':u.pathname.endsWith('/freeBusy')?'busy':init.method==='POST'?'insert':'event';
  assert.equal(u.origin,'https://www.googleapis.com');assert.equal(init.headers.Authorization,'Bearer '+token.access_token);assert.equal(init.redirect,'error');calls.push({kind,path:u.pathname,method:init.method,body,query:u.search});
  const override=await wire.hook?.(kind,body,init);if(override)return override;let data,status=200;
  if(kind==='metadata')data={kind:'calendar#calendar',id:token.account,timeZone:'America/New_York',conferenceProperties:{allowedConferenceSolutionTypes:['hangoutsMeet']}};
  else if(kind==='busy')data={kind:'calendar#freeBusy',timeMin:body.timeMin,timeMax:body.timeMax,calendars:{[token.account]:{busy:wire.busy}}};
  else if(kind==='insert'){
   assert.equal(u.search,'?sendUpdates=all&conferenceDataVersion=1');wire.event={...body,kind:'calendar#event',status:'confirmed',htmlLink:'https://www.google.com/calendar/event?eid=fictional',organizer:{email:token.account,self:true},attendees:body.attendees.map(a=>({...a,responseStatus:'needsAction'})),...(body.conferenceData?{conferenceData:{createRequest:{requestId:body.id,status:{statusCode:'success'}},conferenceSolution:{key:{type:'hangoutsMeet'}},entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'}]}}:{})};
   if(wire.mode==='lost')throw Error('Fictional lost insert response');if(wire.mode==='409')status=409;data=wire.event;
  }else{status=wire.mode==='missing'||!wire.event?404:200;data=structuredClone(wire.event??{});if(wire.mode==='accepted')data.attendees[0].responseStatus='accepted';if(wire.mode==='changed')data.description='Changed';if(wire.mode==='pending')data.conferenceData.createRequest.status.statusCode='pending';}
  const bytes=Buffer.from(JSON.stringify(data));let sent=false;
  return new Response(new ReadableStream({async pull(controller){if(sent){controller.close();return;}sent=true;await wire.bodyHook?.(kind);controller.enqueue(bytes);controller.close();}},{highWaterMark:0}),{status});
 };
 const input=async()=>({revision:(await f.app.snapshot()).revision,prospect_id:'shared-proof',attendee_email:'shared-proof@example.invalid',recipient_confirmed:true,slot_agreed:true,start:'2026-10-26T14:00:00.000Z',end:'2026-10-26T14:20:00.000Z',timezone:'America/New_York',title:'EVZ Digital fictional confirmed discovery',description:'CONTROLLED TEST. Exact literal invitation agreed in the fictional conversation.',location:'',mode:'video'});
 const call=async(operation,data,actor=f.actor)=>(await f.session(actor)).json('/api/calendar/'+operation,{method:operation==='availability'?'GET':'POST',...(operation==='availability'?{}:{body:data})});
 return {...f,calendarWire:wire,calendarCalls:calls,calendarToken:token,input,call};
}
export async function fictionalCalendarOAuth(f){
 const {fictionalBlobs}=await import('./hosted-authoring.mjs'),{hash}=await import('../lifecycle.mjs'),{calendarOAuthPath}=await import('../google-oauth.mjs'),{generateKeyPairSync,sign}=await import('node:crypto'),storage=fictionalBlobs(),{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),wire={nonce:null,tokens:0,credentialReads:0};
 f.setNow(new Date().toISOString());
 const b={capability:f.env.EVZ_OPERATIONS_DESK_ENABLED,workspace_id:f.store.dispatchBinding.scope.workspace_id,run_id:f.app.config.run_id,namespace:f.env.EVZ_OPERATIONS_BLOB_NAMESPACE,dispatch_binding_sha256:hash(f.store.dispatchBinding),source_policy_sha256:hash(f.google_calendar),site_id:f.env.SITE_ID,deploy_id:f.env.DEPLOY_ID,origin:f.env.EVZ_OPERATIONS_ORIGIN,redirect_uri:f.env.EVZ_OPERATIONS_ORIGIN+calendarOAuthPath+'/callback',tenant_id:'fictional-business',account:f.google_calendar.account,client_id:'fictional-shared-calendar.apps.googleusercontent.com',audience:'internal'};
 Object.assign(f.env,{EVZ_OPERATIONS_GOOGLE_CALENDAR_OAUTH:'owner-shared-calendar-code-v1',EVZ_OPERATIONS_CALENDAR_OAUTH_BINDING:JSON.stringify(b),EVZ_OPERATIONS_CALENDAR_CREDENTIAL_NAMESPACE:'evz-operations-calendar-credentials-fictional',EVZ_OPERATIONS_CALENDAR_CREDENTIAL_KEY_ID:'fictional-calendar',EVZ_OPERATIONS_CALENDAR_CREDENTIAL_KEY:Buffer.alloc(32,23).toString('base64url'),EVZ_OPERATIONS_CALENDAR_CLIENT_SECRET:'fictional-independent-calendar-secret'});
 f.googleOAuthOptions.storeFactory=namespace=>{wire.credentialReads++;assert.equal(namespace,f.env.EVZ_OPERATIONS_CALENDAR_CREDENTIAL_NAMESPACE);return storage.raw;};
 f.googleOAuthOptions.certificates=async()=>({'fictional-rsa':publicKey.export({type:'spki',format:'pem'})});
 f.googleOAuthOptions.fetcher=async(url,init)=>{
  wire.tokens++;assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(new URLSearchParams(init.body).get('client_secret'),f.env.EVZ_OPERATIONS_CALENDAR_CLIENT_SECRET);
  const seconds=Math.floor(+f.now()/1000),payload={iss:'https://accounts.google.com',aud:b.client_id,iat:seconds,exp:seconds+3600,sub:'fictional-business-owner',email:b.account,email_verified:true,hd:'evzdigital.studio',nonce:wire.nonce},body=[{alg:'RS256',kid:'fictional-rsa'},payload].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.'),id_token=body+'.'+sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
  return Response.json({access_token:'fictional-owner-calendar-access',refresh_token:'fictional-owner-calendar-refresh',token_type:'Bearer',expires_in:3600,scope:calendarOAuthScopes.join(' '),id_token});
 };
 return {binding:b,storage,wire,async connect(){const owner=await f.session('owner'),start=await owner.json('/api/google-calendar-oauth/start',{method:'POST',body:{}}),url=new URL(start.authorization_url);wire.nonce=url.searchParams.get('nonce');assert.deepEqual(url.searchParams.get('scope').split(' '),['openid','email',...calendarOAuthScopes.slice(2)]);const result=await owner.json('/api/google-calendar-oauth/callback',{method:'POST',body:{state:url.searchParams.get('state'),code:'fictional-code'}});delete f.googleCalendarOptions.getAccessToken;f.calendarToken.access_token='fictional-owner-calendar-access';return result;}};
}
