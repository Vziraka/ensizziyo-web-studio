import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedDesk} from './hosted-desk.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {StudioLifecycle} from './lifecycle.mjs';
import {fixtureReply} from './lifecycle-fixtures.mjs';
const origin='https://calendar.example.invalid',at='2026-10-24T15:00:00.000Z',account='ensizziyo@evzdigital.studio';
const baseEnv={CONTEXT:'deploy-preview',SITE_ID:'fictional-site',DEPLOY_ID:'fictional-deploy',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-calendar-fictional',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43),EVZ_OPERATIONS_GOOGLE_CALENDAR:'fictional-calendar-v1'};
export async function calendarFixture(){
 const env={...baseEnv};
 let version=0,entry=null,clock=Date.parse(at),event=null,mode='',busy=[],onRequest=null;const calls=[];
 const raw={conflict:false,lose:false,async getWithMetadata(){return entry?structuredClone(entry):null;},async setJSON(key,data,options){if(this.conflict){this.conflict=false;return {modified:false};}if(options.onlyIfNew&&entry||options.onlyIfMatch&&options.onlyIfMatch!==entry?.etag)return {modified:false};entry={data:structuredClone(data),etag:'"'+(++version)+'"'};if(this.lose){this.lose=false;throw Error('fictional-lost-write');}return {modified:true,etag:entry.etag};}};
 const scopes=['openid','https://www.googleapis.com/auth/userinfo.email',...['calendar.freebusy','calendar.events.owned','calendar.calendars.readonly'].map(s=>'https://www.googleapis.com/auth/'+s)];
 const token={profile:'calendar-booking-v1',account,grant_id:'fictional-calendar-grant',access_token:'fictional-calendar-access',scopes,expires_at:clock+3600000};
 const provider=async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,'https://www.googleapis.com');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fictional-calendar-access');calls.push({path:u.pathname,method:options.method,body:options.body?JSON.parse(options.body):null,query:u.search});await onRequest?.(u,options);
  if(u.pathname==='/calendar/v3/calendars/primary')return Response.json({kind:'calendar#calendar',id:mode==='calendar'?'foreign@example.invalid':account,timeZone:'America/New_York',conferenceProperties:{allowedConferenceSolutionTypes:['hangoutsMeet']}});
  if(u.pathname==='/calendar/v3/freeBusy'){const q=JSON.parse(options.body);return Response.json({kind:'calendar#freeBusy',timeMin:q.timeMin,timeMax:q.timeMax,calendars:{[account]:mode==='partial'?{errors:[{reason:'internalError'}]}:{busy}}});}
  if(options.method==='POST'){event={...JSON.parse(options.body),kind:'calendar#event',status:'confirmed',htmlLink:'https://www.google.com/calendar/event?eid=fictional',organizer:{email:account,self:true},attendees:[{email:'shared-proof@example.invalid',responseStatus:'needsAction'}],...(JSON.parse(options.body).conferenceData?{conferenceData:{createRequest:{requestId:JSON.parse(options.body).conferenceData.createRequest.requestId,status:{statusCode:'success'}},conferenceSolution:{key:{type:'hangoutsMeet'}},entryPoints:[{entryPointType:'video',uri:'https://meet.google.com/abc-defg-hij'}]}}:{})};if(mode==='lost')throw Error('secret fictional-calendar-access');if(mode==='409')return Response.json({}, {status:409});return Response.json(event);}
  if(mode==='missing'||!event)return Response.json({}, {status:404});
  const result=structuredClone(event);if(mode==='organizer')result.organizer.email='foreign@example.invalid';if(mode==='pending')result.conferenceData.createRequest.status.statusCode='pending';if(mode==='accepted')result.attendees[0].responseStatus='accepted';if(mode==='attendees')result.attendeesOmitted=true;if(mode==='content')result.description='changed';return Response.json(result);
 };
 const options={env,storeFactory:()=>raw,now:()=>new Date(clock),googleCalendarOptions:{getAccessToken:async()=>token,fetcher:(...args)=>provider(...args)}};
 let handler=createHostedDesk(options);
 async function signed(actor){const boot=await handler(new Request(origin+'/desk/api/bootstrap')),csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0],login=await handler(new Request(origin+'/desk/api/login',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[actor==='friend'?'EVZ_OPERATIONS_FRIEND_KEY':'EVZ_OPERATIONS_OWNER_KEY']})}));return {cookie:cookie+'; '+login.headers.get('set-cookie').split(';')[0],origin,'content-type':'application/json','x-studio-token':csrf};}
 const headers=await signed('owner');await handler(new Request(origin+'/desk/api/state',{headers}));
 const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{maxBytes:2000000}),now:()=>new Date(clock)});
 await app.apply({id:'interested',prospect_id:'shared-proof',type:'reply_received',at,data:fixtureReply('reply','thread','shared-proof@example.invalid')},{actor:'provider'});
 await app.apply({id:'interest-review',prospect_id:'shared-proof',type:'reply_reviewed',at,data:{source_id:'reply',reply_sha256:(await import('./lifecycle.mjs')).hash((await app.snapshot()).prospects['shared-proof'].reply),outcome:'discovery',focus:'website'}},{actor:'owner'});
 entry.data.config.calendar={...entry.data.config.calendar,calendar_id:'primary',owner_email:account};entry.data.config.operations={enabled:false,bookings:{},allowlist:['shared-proof']};entry.data.config.google_calendar={enabled:true,capability:'fictional-calendar-v1',run_id:entry.data.config.run_id,account,calendar_id:account,grant_id:token.grant_id};version++;entry.etag='"'+version+'"';
 const input=async()=>({revision:(await app.snapshot()).revision,prospect_id:'shared-proof',attendee_email:'shared-proof@example.invalid',recipient_confirmed:true,slot_agreed:true,start:'2026-10-26T14:00:00.000Z',end:'2026-10-26T14:20:00.000Z',timezone:'America/New_York',title:'EVZ Digital fictional discovery',description:'CONTROLLED TEST agreed fictional goal.',location:'',mode:'video'});
 // The OAuth proof advances this clock; booking calls need a current session/CSRF too.
 const request=async(path,data,actor='owner')=>handler(new Request(origin+'/desk/api/calendar/'+path,{method:'POST',headers:await signed(actor),body:JSON.stringify(data)}));
 const call=async(path,data,actor='owner')=>{const r=await request(path,data,actor),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 return {app,raw,env:options.env,options,calls,token,input,request,call,provider,mode:v=>mode=v,busy:v=>busy=v,onRequest:v=>onRequest=v,advance:ms=>clock+=ms,restart:()=>handler=createHostedDesk(options),config:fn=>fn(entry.data.config),state:fn=>fn(entry.data.state),event:()=>event};
}
test('signed booking uses current availability and existing confirmation/intent/meeting authority',async()=>{
 const f=await calendarFixture(),queued=await f.call('queue',await f.input());assert.equal(queued.queued,true);assert.equal(queued.booked,false);
 const result=await f.call('dispatch',{booking_id:queued.booking_id});assert.equal(result.status,'Verified');assert.equal(result.receipt.guest_response,'needsAction');assert.equal(result.receipt.invitation_delivery,'Unverified');
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,1);assert.equal((await f.app.snapshot()).prospects['shared-proof'].meeting.current_status,'Verified');
});
for(const actor of ['owner','friend'])test(actor+' ordinary booking is attributable and refresh reads attendee status without another invitation',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input(),actor);assert.equal((await f.app.loadConfig()).operations.bookings[q.booking_id].approved_by,actor);assert.equal((await f.call('dispatch',q,actor)).status,'Verified');
 f.mode('accepted');assert.equal((await f.call('reconcile',q,actor)).receipt.guest_response,'accepted');assert.equal((await f.app.snapshot()).prospects['shared-proof'].meeting.guest_response,'accepted');
 assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,1);assert.equal(Object.values((await f.app.snapshot()).events).filter(e=>e.type==='meeting_verified').length,1);
});
for(const mode of ['lost','409'])test(mode+' creation is held across restart and exact ID reconciliation never creates again',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input());f.mode(mode);assert.equal((await f.call('dispatch',q)).status,'Uncertain');f.restart();f.mode('');assert.equal((await f.call('dispatch',q)).status,'Uncertain');assert.equal((await f.call('reconcile',q)).status,'Verified');assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,1);
});
for(const mode of ['missing','organizer','pending','attendees','content'])test(mode+' exact event readback stays held without duplicate insert or false guest acceptance',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input());f.mode('lost');await f.call('dispatch',q);f.mode(mode);assert.equal((await f.call('reconcile',q)).status,'Uncertain');assert.equal((await f.app.snapshot()).prospects['shared-proof'].meeting,undefined);assert.equal((await f.call('dispatch',q)).status,'Uncertain');assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,1);
});
for(const mode of ['calendar','partial'])test(mode+' identity or partial availability fails before a booking reservation',async()=>{
 const f=await calendarFixture();f.mode(mode);assert.equal((await f.request('queue',await f.input())).status,400);assert.deepEqual((await f.app.loadConfig()).operations.bookings,{});assert.equal(f.calls.filter(c=>c.path.endsWith('/events')).length,0);
});
test('buffer overlap and past dates are not reservable; Eastern DST keeps local weekday hours',async()=>{
 const f=await calendarFixture(),input=await f.input();f.busy([{start:'2026-10-26T13:46:00Z',end:'2026-10-26T13:50:00Z'}]);assert.equal((await f.request('queue',input)).status,400);f.busy([]);
 assert.equal((await f.request('queue',{...input,start:'2026-10-23T14:00:00Z',end:'2026-10-23T14:20:00Z'})).status,400);
 assert.equal((await f.request('queue',{...input,start:'2026-11-02T13:00:00Z',end:'2026-11-02T13:20:00Z'})).status,400);
 const q=await f.call('queue',{...input,start:'2026-11-02T14:00:00Z',end:'2026-11-02T14:20:00Z'});assert.equal(q.queued,true);
});
for(const change of ['source','contact','owner','grant','calendar','confirmation'])test('stale '+change+' cannot insert under an earlier guest confirmation',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input());
 if(change==='source')f.state(s=>s.prospects['shared-proof'].reply.content.text='changed');
 if(change==='contact')f.state(s=>s.prospects['shared-proof'].contact.email='other@example.invalid');
 if(change==='owner')f.state(s=>s.prospects['shared-proof'].follow_up_owner='friend');
 if(change==='grant')f.config(c=>c.google_calendar.grant_id='other-grant');
 if(change==='calendar')f.config(c=>c.calendar.buffer_minutes=10);
 if(change==='confirmation')f.state(s=>delete s.events[q.booking_id+'-confirmed']);
 assert.equal((await f.request('dispatch',q)).status,400);assert.equal(f.calls.filter(c=>c.path.endsWith('/events')).length,0);
});
test('guest confirmation, current revision and exact fields are required; same reservation cannot be silently replaced',async()=>{
 const f=await calendarFixture(),input=await f.input();for(const overrides of [{slot_agreed:false},{revision:-1},{attendee_email:'real@example.org'},{timezone:'UTC'},{attendees:['extra@example.invalid']}])assert.equal((await f.request('queue',{...input,...overrides})).status,400);
 const q=await f.call('queue',input);assert.equal((await f.call('queue',await f.input())).booking_id,q.booking_id);assert.equal((await f.request('queue',{...await f.input(),description:'changed'})).status,400);
});
test('availability drift after durable intent cannot insert; reservation survives as uncertainty',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input());let queries=0;f.onRequest((u)=>{if(u.pathname.endsWith('/freeBusy')&&++queries===2)f.busy([{start:'2026-10-26T14:00:00Z',end:'2026-10-26T14:30:00Z'}]);});assert.equal((await f.call('dispatch',q)).status,'Uncertain');assert.equal(f.calls.filter(c=>c.path.endsWith('/events')).length,0);assert.ok(Object.keys((await f.app.snapshot()).operations.requests).length);
});
test('concurrent dispatches, failed CAS and lost durable intent acknowledgements never double insert',async()=>{
 for(const mode of ['conflict','lose','concurrent']){const f=await calendarFixture(),q=await f.call('queue',await f.input());if(mode!=='concurrent')f.raw[mode]=true;const results=await Promise.all([f.request('dispatch',q),...(mode==='concurrent'?[f.request('dispatch',q)]:[])]);assert.ok(results.every(r=>[200,409,503].includes(r.status)));f.restart();await f.request('dispatch',q);assert.ok(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length<=1);}
});
test('disabled flags and broader or wrong grants cannot reach Calendar; ordinary simulation stays inert',async()=>{
 const f=await calendarFixture();delete f.env.EVZ_OPERATIONS_GOOGLE_CALENDAR;assert.equal((await f.request('queue',await f.input())).status,400);assert.equal(f.calls.length,0);
 for(const change of [t=>t.account='personal@example.invalid',t=>t.grant_id='foreign',t=>t.profile='drive-originals-readonly-v1',t=>t.scopes=[...t.scopes,'https://www.googleapis.com/auth/calendar']]){const g=await calendarFixture();change(g.token);assert.equal((await g.request('queue',await g.input())).status,400);assert.equal(g.calls.length,0);}
});
import {generateKeyPairSync,sign} from 'node:crypto';
import {calendarOAuthProfile,calendarOAuthPath,calendarOAuthScopes,googleOAuthScopes,driveOAuthScopes,createGoogleOAuth,normalizedGoogleScopes} from './google-oauth.mjs';

test('future Calendar OAuth remains independent with exact scopes and owner-only management, and actually feeds both signed booking callers',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),certificates=async()=>({'fictional-key':publicKey.export({type:'spki',format:'pem'})});
 for(const actor of ['owner','friend']){
  const f=await calendarFixture(),records=new Map();let v=0,nonce;const time=Date.now();f.advance(time-Date.parse(at));const input=await f.input();const now=new Date(time),date=new Date(now);do{date.setUTCDate(date.getUTCDate()+1);}while([0,6].includes(date.getUTCDay()));date.setUTCHours(15,0,0,0);input.start=date.toISOString();input.end=new Date(+date+1200000).toISOString();
  const binding={tenant_id:'fictional-tenant',site_id:f.env.SITE_ID,deploy_id:f.env.DEPLOY_ID,origin,redirect_uri:origin+calendarOAuthPath+'/callback',client_id:'fictional-calendar-client.apps.googleusercontent.com',account,audience:'external-testing'};
  Object.assign(f.env,{EVZ_OPERATIONS_GOOGLE_CALENDAR_OAUTH:'owner-calendar-code-v1',EVZ_CALENDAR_OAUTH_BINDING:JSON.stringify(binding),EVZ_CALENDAR_CREDENTIAL_NAMESPACE:'evz-calendar-credentials-fictional-test',EVZ_CALENDAR_CREDENTIAL_KEY_ID:'fictional-calendar-key',EVZ_CALENDAR_CREDENTIAL_KEY:Buffer.alloc(32,19).toString('base64url'),EVZ_CALENDAR_CLIENT_SECRET:'fictional-calendar-client-secret'});
  const credentials={async getWithMetadata(key){return structuredClone(records.get(key)??null);},async setJSON(key,data,options){const prior=records.get(key);if(options.onlyIfNew&&prior||options.onlyIfMatch&&options.onlyIfMatch!==prior?.etag)return {modified:false};const etag='"'+(++v)+'"';records.set(key,{data:structuredClone(data),etag});return {modified:true,etag};}};
  f.options.googleOAuthOptions={storeFactory:namespace=>{assert.equal(namespace,f.env.EVZ_CALENDAR_CREDENTIAL_NAMESPACE);return credentials;},certificates,fetcher:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');const body=new URLSearchParams(options.body);assert.equal(body.get('client_id'),binding.client_id);assert.equal(body.get('redirect_uri'),binding.redirect_uri);const seconds=Math.floor(time/1000),claims={iss:'https://accounts.google.com',aud:binding.client_id,iat:seconds,exp:seconds+3600,sub:'fictional-owner',email:account,email_verified:true,hd:'evzdigital.studio',nonce},bytes=[{alg:'RS256',kid:'fictional-key'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.'),id_token=bytes+'.'+sign('RSA-SHA256',Buffer.from(bytes),privateKey).toString('base64url');return Response.json({access_token:'fictional-calendar-access',refresh_token:'fictional-calendar-refresh',id_token,token_type:'Bearer',expires_in:3600,scope:calendarOAuthScopes.join(' ')});}};
  delete f.options.googleCalendarOptions.getAccessToken;f.restart();
  const login=async who=>{const h=createHostedDesk(f.options),boot=await h(new Request(origin+'/desk/api/bootstrap')),csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0],signed=await h(new Request(origin+'/desk/api/login',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:f.env[who==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}));return {cookie:cookie+'; '+signed.headers.get('set-cookie').split(';')[0],origin,'content-type':'application/json','x-studio-token':csrf};};
  const owner=await login('owner'),friend=await login('friend'),post=async(path,body,headers=owner)=>createHostedDesk(f.options)(new Request(origin+calendarOAuthPath+'/'+path,{method:'POST',headers,body:JSON.stringify(body)}));
  assert.equal((await post('start',{},friend)).status,400);assert.equal(records.size,0);
  const started=await (await post('start',{})).json(),url=new URL(started.authorization_url);nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('scope'),['openid','email',...calendarOAuthScopes.slice(2)].join(' '));
  const connected=await (await post('callback',{state:url.searchParams.get('state'),code:'fictional-code'})).json();assert.equal(connected.status,'Connected');f.config(c=>c.google_calendar.grant_id=connected.grant_id);
  const queued=await f.call('queue',input,actor),verified=await f.call('dispatch',queued,actor);assert.equal(verified.status,'Verified');
  assert.doesNotMatch(JSON.stringify(await f.app.snapshot()),/fictional-calendar-access|fictional-calendar-refresh|client-secret|code_verifier/);assert.doesNotMatch(JSON.stringify([...records]),/fictional-calendar-access|fictional-calendar-refresh|ensizziyo/);
  for(const scopes of [googleOAuthScopes,driveOAuthScopes,[...calendarOAuthScopes,'https://www.googleapis.com/auth/calendar']])assert.throws(()=>normalizedGoogleScopes(scopes.join(' '),calendarOAuthProfile));
  assert.throws(()=>createGoogleOAuth({env:{},profile:calendarOAuthProfile}),/disabled/);
  for(const change of [{EVZ_CALENDAR_CREDENTIAL_NAMESPACE:'evz-google-credentials-fictional-test'},{EVZ_GOOGLE_CREDENTIAL_KEY:f.env.EVZ_CALENDAR_CREDENTIAL_KEY},{EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(binding)}])assert.throws(()=>createGoogleOAuth({env:{...f.env,...change},profile:calendarOAuthProfile}));
 }
});

test('malformed, oversized, unexpected paging and truncated FreeBusy data fail closed',async()=>{
 for(const mode of ['malformed','oversized','paging','negative','wrong-calendar']){const f=await calendarFixture();f.options.googleCalendarOptions.fetcher=async(url,o)=>{if(url.endsWith('/freeBusy')){if(mode==='malformed')return new Response('{');if(mode==='oversized')return new Response(' '.repeat(100001));const q=JSON.parse(o.body);return Response.json({kind:'calendar#freeBusy',timeMin:q.timeMin,timeMax:q.timeMax,...(mode==='paging'?{nextPageToken:'unexpected'}:{}),calendars:{[mode==='wrong-calendar'?'foreign@example.invalid':account]:{busy:mode==='negative'?[{start:q.timeMax,end:q.timeMin}]:[]}}});}return f.provider(url,o);};f.restart();assert.equal((await f.request('queue',await f.input())).status,400);assert.deepEqual((await f.app.loadConfig()).operations.bookings,{});}
});
test('signed route rejects missing login, CSRF and foreign origin before provider work; phone creates no conference',async()=>{
 const f=await calendarFixture(),handler=createHostedDesk(f.options);assert.equal((await handler(new Request(origin+'/desk/api/calendar/queue',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(await f.input())}))).status,403);assert.equal((await handler(new Request(origin+'/desk/api/calendar/availability'))).status,401);assert.equal((await handler(new Request(origin+'/desk/api/calendar/availability',{headers:{origin:'https://foreign.invalid'}}))).status,403);assert.equal(f.calls.length,0);
 const q=await f.call('queue',{...await f.input(),mode:'phone',location:'Agreed fictional phone conversation'});assert.equal((await f.call('dispatch',q)).receipt.conference_status,'Not requested');assert.equal(f.event().conferenceData,undefined);
});
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
test('actual local fictional HTTP carries signed owner/friend caller through direct Calendar JSON without real Google traffic',async t=>{
 const evidence=[];
 for(const actor of ['owner','friend']){
  const f=await calendarFixture(),wire=[];
  const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();wire.push({method:req.method,path:req.url});const result=await f.provider('https://www.googleapis.com'+req.url,{method:req.method,headers:{Authorization:req.headers.authorization},redirect:'error',...(body?{body}:{})});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end('{}');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const port=server.address().port;
  f.options.googleCalendarOptions.fetcher=(url,options)=>fetch('http://127.0.0.1:'+port+new URL(url).pathname+new URL(url).search,options);f.restart();
  const q=await f.call('queue',await f.input(),actor);f.mode('lost');assert.equal((await f.call('dispatch',q,actor)).status,'Uncertain');f.mode('accepted');f.restart();const result=await f.call('reconcile',q,actor);assert.equal(result.status,'Verified');assert.equal(result.receipt.guest_response,'accepted');await f.call('dispatch',q,actor);
  assert.equal(wire.filter(r=>r.method==='POST'&&r.path.includes('/events?')).length,1);const state=await f.app.snapshot(),intent=state.operations.requests[q.booking_id+'-create'];assert.match(intent.event_id,/^[0-9a-v]{5,1024}$/);assert.equal(Object.values(state.events).filter(e=>e.type==='meeting_verified').length,1);
  evidence.push({actor,status:result.status,booking_id:q.booking_id,event_id:intent.event_id,wire,invitation_delivery:result.receipt.invitation_delivery,guest_response:result.receipt.guest_response,meeting_events:1,provider:'loopback HTTP with fictional Google-compatible JSON; zero real provider traffic'});
 }
 if(process.env.EVZ_CALENDAR_PROOF_FILE)await writeFile(process.env.EVZ_CALENDAR_PROOF_FILE,JSON.stringify({schema:1,at:new Date().toISOString(),evidence},null,2));
});
test('provider 401 invalidates only the exact Calendar token and redacts error bodies; redirects are not followed',async()=>{
 for(const status of [401,403,302]){const f=await calendarFixture();let invalidated=false;f.options.googleCalendarOptions.getAccessToken.invalidate=async token=>{assert.equal(token,f.token);invalidated=true;};f.options.googleCalendarOptions.fetcher=async()=>new Response('fictional-calendar-access PRIVATE provider body',{status,headers:{location:'https://foreign.invalid'}});f.restart();const response=await f.request('queue',await f.input());assert.equal(response.status,400);assert.doesNotMatch(await response.text(),/fictional-calendar-access|PRIVATE/);assert.equal(invalidated,status===401);assert.deepEqual((await f.app.loadConfig()).operations.bookings,{});}
});
test('context and configuration changes during provider reads cannot reserve, insert or publish stale meeting evidence',async()=>{
 for(const point of ['queue','intent','insert','read']){const f=await calendarFixture();let q;if(point!=='queue')q=await f.call('queue',await f.input());if(point==='read'){f.mode('lost');await f.call('dispatch',q);f.mode('');}let freebusy=0;f.onRequest((u,o)=>{if(point==='queue'&&u.pathname.endsWith('/freeBusy')||point==='intent'&&u.pathname.endsWith('/freeBusy')||point==='insert'&&u.pathname.endsWith('/freeBusy')&&++freebusy===2||point==='read'&&o.method==='GET'&&u.pathname.includes('/events/'))f.state(s=>s.prospects['shared-proof'].contact.email='changed@example.invalid');});
  const response=await f.request(point==='queue'?'queue':point==='read'?'reconcile':'dispatch',q??await f.input());assert.ok([200,400].includes(response.status));assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,point==='read'?1:0);assert.equal((await f.app.snapshot()).prospects['shared-proof'].meeting,undefined);
 }
 const f=await calendarFixture(),q=await f.call('queue',await f.input());let count=0;f.onRequest(u=>{if(u.pathname.endsWith('/freeBusy')&&++count===2)f.config(c=>c.google_calendar.grant_id='changed-grant');});assert.equal((await f.call('dispatch',q)).status,'Uncertain');assert.equal(f.calls.filter(c=>c.path.endsWith('/events')).length,0);
});
test('queue CAS atomically retains one signed confirmation and source config; lost acknowledgement does not duplicate approval',async()=>{
 for(const mode of ['conflict','lose']){const f=await calendarFixture(),input=await f.input();f.raw[mode]=true;assert.ok([409,503].includes((await f.request('queue',input)).status));const c=await f.app.loadConfig(),s=await f.app.snapshot();assert.equal(Object.keys(c.operations.bookings).length,mode==='lose'?1:0);assert.equal(Object.values(s.events).filter(e=>e.type==='meeting_queued').length,mode==='lose'?1:0);const q=await f.call('queue',await f.input());assert.equal(Object.keys((await f.app.loadConfig()).operations.bookings).length,1);assert.equal(Object.values((await f.app.snapshot()).events).filter(e=>e.type==='meeting_queued').length,1);assert.equal((await f.call('dispatch',q)).status,'Verified');}
});
for(const [name,change] of Object.entries({id:e=>e.id='other',intent:e=>e.extendedProperties.private.evzIntent='other',organizer_self:e=>e.organizer.self=false,organizer_email:e=>e.organizer.email='other@example.invalid',time:e=>e.start.dateTime='2026-10-26T14:01:00Z',timezone:e=>e.end.timeZone='UTC',location:e=>e.location='other',reminders:e=>e.reminders.useDefault=true,guest:e=>e.attendees.push({email:'other@example.invalid',responseStatus:'accepted'}),status:e=>e.status='cancelled',recurrence:e=>e.recurrence=['RRULE:FREQ=DAILY'],visibility:e=>e.visibility='public',conference:e=>e.conferenceData.createRequest.status.statusCode='failure'}))test('exact '+name+' event mismatch cannot publish meeting verification',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input());f.mode('lost');await f.call('dispatch',q);f.mode('');f.options.googleCalendarOptions.fetcher=async(url,o)=>{const response=await f.provider(url,o);if(o.method==='GET'&&new URL(url).pathname.includes('/events/')){const e=await response.json();change(e);return Response.json(e);}return response;};f.restart();assert.equal((await f.call('reconcile',q)).status,'Uncertain');assert.equal((await f.app.snapshot()).prospects['shared-proof'].meeting,undefined);
});
test('lost verified write or effect acknowledgement and reconciliation CAS conflict retain exact identity without another insert',async()=>{
 for(const mode of ['conflict','lose','effect']){const f=await calendarFixture(),q=await f.call('queue',await f.input());f.mode('lost');await f.call('dispatch',q);f.mode('');let once=true;f.onRequest((u,o)=>{if(once&&o.method==='GET'&&u.pathname.includes('/events/')){once=false;if(mode==='effect'){const set=f.raw.setJSON.bind(f.raw);let writes=0;f.raw.setJSON=async(...args)=>{if(++writes===2)f.raw.lose=true;return set(...args);};}else f.raw[mode]=true;}});await f.call('reconcile',q);f.onRequest(null);assert.equal((await f.call('reconcile',q)).status,'Verified');assert.equal(f.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,1);assert.equal(Object.values((await f.app.snapshot()).events).filter(e=>e.type==='meeting_verified').length,1);}
});
test('an older reconciliation cannot overwrite a newer accepted readback after its claim is superseded',async()=>{
 const f=await calendarFixture(),q=await f.call('queue',await f.input());f.mode('lost');await f.call('dispatch',q);f.mode('');let release,started;const begun=new Promise(r=>started=r),wait=new Promise(r=>release=r);let first=true;
 f.options.googleCalendarOptions.fetcher=async(url,o)=>{const response=await f.provider(url,o);if(first&&o.method==='GET'&&new URL(url).pathname.includes('/events/')){first=false;started();await wait;}return response;};f.restart();const old=f.call('reconcile',q);await begun;f.mode('accepted');assert.equal((await f.call('reconcile',q)).receipt.guest_response,'accepted');release();assert.equal((await old).status,'Uncertain');const state=await f.app.snapshot();assert.equal(state.operations.requests[q.booking_id+'-create'].status,'Verified');assert.equal(state.prospects['shared-proof'].meeting.guest_response,'accepted');assert.equal(Object.values(state.events).filter(e=>e.type==='meeting_verified').length,1);
});
