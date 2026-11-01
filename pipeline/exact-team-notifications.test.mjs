import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
import {getStore} from '@netlify/blobs';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';import {prepareTeamNotifications,notificationView} from './team-notifications.mjs';
import {authorizeNotificationPolicy,exactNotificationPackage,approveExactNotification} from './exact-team-notifications.mjs';
import {approveExactMail,dispatchExactMail,reconcileExactMail} from './exact-mail.mjs';import {googleHostedTransport,gmailScopes} from './google-hosted-transport.mjs';
import {createHostedDesk} from './hosted-desk.mjs';import {writePortableLifecycleBackup,readLifecycleBackup,restoreLifecycleBackup} from './lifecycle-backup.mjs';

const at='2026-10-26T13:07:00.000Z',account='business@example.invalid',env={EVZ_OPERATIONS_GOOGLE_TEAM_NOTIFICATIONS:'fictional-exact-team-v1'},origin='https://preview.example.invalid';
const policy=()=>({enabled:true,capability:'fictional-exact-team-v1',run_id:initialConfig.run_id,revision:'review-1',policy_id:'trial-1',grant_id:'fictional-grant',account_email:account,from:'hello@evzdigital.studio',approval_mode:'each-message',kinds:['attention','digest'],recipients:{owner:'owner@example.invalid',friend:'friend@example.invalid'},signature:'EVZ Digital team · Internal operations notification',starts_at:'2026-10-26T13:00:00Z',expires_at:'2026-10-27T13:00:00Z',daily_limit:5,sender_daily_limit:20,max_messages:8});
async function fixture(t,{authorize=true,reply=true}={}){
 let clock=Date.parse(at),etag=0,bytes=null,lose=false;const requests=[];
 const config={...structuredClone(initialConfig),preview_seeded_at:at,sender:{email:'hello@evzdigital.studio',account_email:account,operator_names:{owner:'Test Owner',friend:'Test Friend'}},google_team_notifications:policy()};
 const raw=getStore({name:'evz-redesign-proof-team-20261026',siteID:'fictional-site',token:'synthetic-store-token',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  await delay(1);const headers=new Headers(options.headers),method=options.method.toUpperCase();requests.push({method,match:headers.get('if-match')});
  if(method==='GET')return bytes?new Response(bytes,{headers:{etag:String(etag)}}):new Response(null,{status:404});
  assert.equal(method,'PUT');assert.ok(headers.has('if-match')||headers.get('if-none-match')==='*');
  if(headers.get('if-none-match')==='*'&&bytes||headers.has('if-match')&&headers.get('if-match')!==String(etag))return new Response(null,{status:412});
  bytes=options.body;etag++;return new Response(null,{headers:{etag:String(etag)}});
 }});
 const set=raw.setJSON.bind(raw);raw.setJSON=async(...args)=>{const result=await set(...args);if(lose){lose=false;throw Error('Lost committed CAS response');}return result;};
 const store=new ConditionalLifecycleStore(raw,{maxBytes:2_000_000});await store.initialize(config,{schema_version:1,run_id:config.run_id,mode:'controlled',revision:0,updated_at:at,prospects:{},actions:{},events:{},exceptions:[],asset_index:{},ai_attempts:{}});
 const app=await StudioLifecycle.fromStore({store,now:()=>new Date(clock++)});await app.apply(fixtureProspect('shared-proof',at));
 if(reply)await app.apply({id:'reply',prospect_id:'shared-proof',type:'reply_received',at,data:{source_id:'verified-reply',kind:'reply',body:'PRIVATE PROSPECT EMAIL',note:'PRIVATE CALL NOTE'}},{actor:'provider'});
 await prepareTeamNotifications(app);
 const f={app,raw,requests,config,now:value=>{clock=Date.parse(value);},lose:()=>{lose=true;},async configChange(fn){const entry=await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});fn(entry.data.config);await raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});},async authorize(actor='owner',extra={}){const c=await app.loadConfig();return authorizeNotificationPolicy(app,{revision:(await app.snapshot()).revision,event_id:'policy-'+(await app.snapshot()).revision,policy_sha256:hash(c.google_team_notifications),authorized:true,...extra},actor);}};
 if(authorize)await f.authorize();return f;
}
async function approved(f,role='owner',kind='attention'){
 const s=await f.app.snapshot(),m=Object.values(s.team_notifications.messages).find(m=>m.recipient_role===role&&m.kind===kind&&m.status==='Prepared; delivery held');assert.ok(m);
 const p=await exactNotificationPackage(f.app,{notification_id:m.id},role),a=await approveExactNotification(f.app,{notification_id:m.id,revision:(await f.app.snapshot()).revision,event_id:'approve-'+m.id,package_sha256:p.sha256,approved:true,facts_checked:true},role);return {...a,p};
}
function wire(f,{lost=false,search='complete',hook=null,alias=true,scope=gmailScopes,mutate=null,status=null}={}){
 const calls=[],sent=[];let committed;
 const getAccessToken=async()=>({access_token:'synthetic-google-access',expires_at:Date.now()+3600_000,account,grant_id:'fictional-grant',scopes:scope});
 const fetcher=async(url,o)=>{
  const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);assert.equal(u.origin,'https://gmail.googleapis.com');calls.push({path,method:o.method});
  assert.ok(Object.values((await f.app.snapshot()).operations.requests).some(q=>q.internal_notification&&q.raw_base64url),'Durable exact reservation must precede any Google HTTP');await delay(2);
  if(status)return Response.json({error:'PRIVATE provider response synthetic-google-access'},{status});
  if(path==='profile'){await hook?.();return Response.json({emailAddress:account});}
  if(path==='settings/sendAs')return Response.json({sendAs:alias?[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]:[]});
  if(path==='messages/send'){
   assert.equal(o.method,'POST');const q=Object.values((await f.app.snapshot()).operations.requests).find(q=>q.internal_notification&&q.status==='Uncertain');assert.ok(q,'Durable uncertainty precedes POST');
   const payload=JSON.parse(o.body);assert.equal(payload.threadId,undefined);sent.push(payload);committed={id:'sent-internal',threadId:'internal-thread',labelIds:['SENT'],raw:payload.raw};
   if(lost)throw Error('Lost committed response');return Response.json({id:committed.id,threadId:committed.threadId});
  }
  if(path==='messages'){assert.match(u.searchParams.get('q'),/^in:sent rfc822msgid:<evz\./);return Response.json({messages:search==='empty'?[]:search==='ambiguous'?[{id:'one'},{id:'two'}]:[{id:'sent-internal'}]});}
  if(path==='messages/sent-internal'){assert.equal(u.searchParams.get('format'),'raw');return Response.json(mutate?mutate(structuredClone(committed)):committed);}
  throw Error('Unexpected Gmail route '+path);
 };
 return {calls,sent,getAccessToken,fetcher,provider:googleHostedTransport({getAccessToken,fetcher,account,grantId:'fictional-grant'})};
}
const dispatch=(f,a,w,actor=a.p.recipient_role)=>dispatchExactMail(f.app,a,{actor,env,transport:w.provider});

test('policy configuration and preparation never approve or send; owner policy and each recipient-role envelope are separate',async t=>{
 const f=await fixture(t,{authorize:false}),s=await f.app.snapshot(),id=Object.values(s.team_notifications.messages)[0].id;
 await assert.rejects(exactNotificationPackage(f.app,{notification_id:id},'owner'),/policy authorization/);
 await assert.rejects(f.authorize('friend'),/signed owner/);await assert.rejects(f.authorize('owner',{authorized:false}),/explicitly authorize/);await f.authorize();
 const m=Object.values((await f.app.snapshot()).team_notifications.messages).find(m=>m.kind==='attention');
 await assert.rejects(exactNotificationPackage(f.app,{notification_id:m.id},'friend'),/recipient role/);
 const p=await exactNotificationPackage(f.app,{notification_id:m.id},'owner');
 await assert.rejects(approveExactNotification(f.app,{notification_id:m.id,package_sha256:p.sha256,approved:true},'owner'),/Explicitly approve/);
 await assert.rejects(approveExactMail(f.app,{kind:'notification',notification_id:m.id},'owner'),/separate internal/);
 assert.equal(Object.values((await f.app.snapshot()).actions).some(a=>a.type==='email'),false);assert.equal(notificationView(await f.app.snapshot()).delivery_enabled,false);
});
test('source attention and both due weekday digests use signed exact packages, MIME readback and one existing intent each',async t=>{
 const f=await fixture(t);const outputs=[];
 for(const [role,kind] of [['owner','attention'],['owner','digest'],['friend','digest']]){
  const a=await approved(f,role,kind),w=wire(f),result=await dispatch(f,a,w);assert.equal(result.status,'Verified',result.reason);assert.equal(w.sent.length,1);
  const raw=Buffer.from(w.sent[0].raw,'base64url').toString();assert.match(raw,new RegExp('To: '+role+'@example.invalid'));assert.match(raw,/From: hello@evzdigital.studio/);
  const body=Buffer.from(raw.split('\r\n\r\n')[1].replaceAll('\r\n',''),'base64').toString();assert.equal(body,a.p.body);assert.doesNotMatch(body,/PRIVATE|shared-proof@example.invalid/);assert.match(body,/EVZ Digital team · Internal operations notification$/);
  if(kind==='digest'){assert.match(body,/25 shared target/);assert.equal((await f.app.snapshot()).team_notifications.messages[a.p.notification_id].late_minutes,7);}
  assert.match(result.receipt.verification,/recipient delivery not established/);outputs.push({package:a.p,raw,receipt:result.receipt});
  assert.equal((await dispatch(f,a,w)).status,'Verified');assert.equal(w.sent.length,1);
 }
 const saved=await f.app.snapshot();assert.equal(Object.keys(saved.operations.requests).length,3);assert.equal(notificationView(saved).pending,0);assert.ok(f.requests.some(r=>r.match));
 if(process.env.EVZ_TEAM_EVIDENCE_DIRECTORY){await writeFile(join(process.env.EVZ_TEAM_EVIDENCE_DIRECTORY,'signed-mime-proof.json'),JSON.stringify({outputs,state:saved},null,2));}
});
test('missing, changed and external recipient policies hold before HTTP and never accept arbitrary browser content',async t=>{
 for(const change of [c=>delete c.recipients.friend,c=>c.recipients.owner='outside@external.invalid',c=>c.recipients.owner='changed@example.invalid',c=>c.revision='review-2']){
  const f=await fixture(t),a=await approved(f),w=wire(f);await f.configChange(c=>change(c.google_team_notifications));await assert.rejects(dispatch(f,a,w));assert.equal(w.calls.length,0);
 }
 const f=await fixture(t),a=await approved(f),w=wire(f);await dispatch(f,{...a,to:'arbitrary@external.invalid',body:'Injected private body'},w);assert.equal(w.sent.length,1);assert.equal(Buffer.from(w.sent[0].raw,'base64url').toString().includes('arbitrary@'),false);
});
test('resolved, reassigned and changed sources hold even without a preparation refresh; fresh provider preflight rechecks before POST',async t=>{
 for(const change of [s=>s.prospects['shared-proof'].stage='Discovery',s=>s.prospects['shared-proof'].follow_up_owner='friend',s=>s.prospects['shared-proof'].reply.source_id='changed']){
  const f=await fixture(t),a=await approved(f),w=wire(f);await f.app.change(change);await assert.rejects(dispatch(f,a,w),/source resolved|changed|reassigned/);assert.equal(w.calls.length,0);
 }
 const f=await fixture(t),a=await approved(f),w=wire(f,{hook:()=>f.app.change(s=>{s.prospects['shared-proof'].follow_up_owner='friend';})});assert.equal((await dispatch(f,a,w)).status,'Held');assert.equal(w.sent.length,0);
 await prepareTeamNotifications(f.app);const friend=await approved(f,'friend'),other=wire(f);assert.equal((await dispatch(f,friend,other)).status,'Verified');
});
test('stale and nonbusiness-day digests hold; immutable daily IDs coalesce while moving clock and real storage latency advance',async t=>{
 const f=await fixture(t,{reply:false}),a=await approved(f,'friend','digest'),w=wire(f);await prepareTeamNotifications(f.app);assert.equal(Object.keys((await f.app.snapshot()).team_notifications.messages).length,2);
 f.now('2026-10-27T13:07:00Z');await assert.rejects(dispatch(f,a,w),/not current|stale/);assert.equal(w.calls.length,0);
 const other=await fixture(t,{reply:false}),b=await approved(other,'owner','digest');other.now('2026-10-26T12:59:00Z');await assert.rejects(dispatch(other,b,wire(other)),/not current|not due/);
});
test('policy/config changes and an Eastern day rollover during awaited preflight hold before releasing the reserved effect',async t=>{
 for(const [change,expected] of [[f=>f.now('2026-10-27T13:00:01Z'),'Uncertain'],[f=>f.configChange(c=>{c.google_team_notifications.revision='changed-during-fetch';}),'Held']]){
  const f=await fixture(t),a=await approved(f),w=wire(f,{hook:()=>change(f)}),result=await dispatch(f,a,w);assert.equal(result.status,expected);assert.equal(w.sent.length,0);
  if(expected==='Uncertain'){assert.match(result.reason,/deadline/);assert.equal((await f.app.snapshot()).operations.requests[a.action_id+'-intent'].status,'Reserved');}
 }
 const f=await fixture(t),a=await approved(f);f.now('2026-10-27T03:59:59.900Z');const w=wire(f,{hook:()=>f.now('2026-10-27T04:00:00.001Z')});const result=await dispatch(f,a,w);assert.equal(result.status,'Held');assert.match(result.reason,/reservation date/);assert.equal(w.sent.length,0);
});
test('existing problem/meeting sources stay role-bound and uncertain internal delivery never creates a recursive alert',async t=>{
 const f=await fixture(t,{reply:false});await f.app.change(s=>{const r=s.prospects['shared-proof'];r.follow_up_owner='friend';r.meeting={current_status:'Needs review'};r.tickets=[{id:'urgent',status:'Open',priority:'urgent',body:'PRIVATE SUPPORT NOTES'}];});await prepareTeamNotifications(f.app);
 let notices=Object.values((await f.app.snapshot()).team_notifications.messages).filter(m=>m.kind==='attention');assert.equal(notices.length,2);assert.ok(notices.every(m=>m.recipient_role==='friend'));assert.doesNotMatch(JSON.stringify(notices),/PRIVATE SUPPORT/);
 const a=await approved(f,'friend'),w=wire(f,{lost:true});await dispatch(f,a,w);await prepareTeamNotifications(f.app);notices=Object.values((await f.app.snapshot()).team_notifications.messages).filter(m=>m.kind==='attention');assert.equal(notices.length,2);
});
test('concurrent signed authority invocations and lost committed reservation allow at most one dispatch',async t=>{
 const f=await fixture(t),a=await approved(f),w=wire(f);await Promise.allSettled([dispatch(f,a,w),dispatch(f,a,w)]);assert.equal(w.sent.length,1);assert.equal(Object.keys((await f.app.snapshot()).operations.requests).length,1);
 const g=await fixture(t),b=await approved(g),v=wire(g);g.lose();await assert.rejects(dispatch(g,b,v),/uncertain/);assert.equal(v.calls.length,0);assert.equal((await dispatch(g,b,v)).status,'Reserved');assert.equal(v.calls.length,0);
});
test('response loss reconciles complete MIME only; empty, ambiguous, mismatched headers/body and missing SENT remain Uncertain without resending',async t=>{
 for(const search of ['complete','empty','ambiguous']){
  const f=await fixture(t),a=await approved(f),w=wire(f,{lost:true,search});assert.equal((await dispatch(f,a,w)).status,'Uncertain');
  const r=await reconcileExactMail(f.app,a,{actor:'owner',env,transport:w.provider});assert.equal(r.status,search==='complete'?'Verified':'Uncertain',r.reason);await dispatch(f,a,w);assert.equal(w.sent.length,1);
 }
 for(const mutate of [m=>({...m,labelIds:['INBOX']}),m=>({...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().replace('To: owner@example.invalid','To: attacker@example.invalid')).toString('base64url')}),m=>({...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().replace('MIME-Version: 1.0','Bcc: other@example.invalid\r\nMIME-Version: 1.0')).toString('base64url')}),m=>({...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().split('\r\n\r\n')[0]+'\r\n\r\n'+Buffer.from('Different body').toString('base64')).toString('base64url')})]){
  const f=await fixture(t),a=await approved(f),w=wire(f,{mutate});assert.equal((await dispatch(f,a,w)).status,'Uncertain');await dispatch(f,a,w);assert.equal(w.sent.length,1);
 }
});
test('auth, alias and budget failures cannot POST and provider secrets stay outside the authority',async t=>{
 for(const options of [{alias:false},{scope:[]},{status:401},{status:403},{status:429}]){const f=await fixture(t),a=await approved(f),w=wire(f,options);const r=await dispatch(f,a,w);assert.equal(r.status,'Held');assert.equal(w.sent.length,0);assert.doesNotMatch(JSON.stringify(await f.app.snapshot())+JSON.stringify(r),/synthetic-google-access|PRIVATE provider/);}
 for(const kind of ['combined','internal','total']){
  const f=await fixture(t),a=await approved(f),w=wire(f);await f.app.change(s=>{s.operations={requests:Object.fromEntries(Array.from({length:kind==='combined'?20:kind==='internal'?5:8},(_,i)=>['prior-'+i,{operation:'intent',prepared_at:kind==='total'?'2026-10-25T13:00:00Z':at,internal_notification:kind!=='combined',policy_id:'trial-1',status:'Uncertain'}]))};});await assert.rejects(dispatch(f,a,w),/budget exhausted|reservation exhausted/);assert.equal(w.calls.length,0);
 }
});
test('simultaneous distinct notifications share the finite internal reservation budget without increasing the combined allowance',async t=>{
 const f=await fixture(t,{reply:false,authorize:false});await f.configChange(c=>{c.google_team_notifications.daily_limit=1;});await f.authorize();const owner=await approved(f,'owner','digest'),friend=await approved(f,'friend','digest'),w=wire(f);
 await Promise.allSettled([dispatch(f,owner,w),dispatch(f,friend,w)]);assert.equal(w.sent.length,1);assert.equal(Object.keys((await f.app.snapshot()).operations.requests).length,1);
});
test('backup/restore preserves immutable intent, complete MIME and uncertainty while disabling configuration and excluding credentials',async t=>{
 const f=await fixture(t),a=await approved(f),w=wire(f,{lost:true});await dispatch(f,a,w);const state=await f.app.snapshot(),directory=await mkdtemp(join(tmpdir(),'evz-team-backup-'));t.after(()=>rm(directory,{recursive:true,force:true}));const path=join(directory,'backup.json');
 await writePortableLifecycleBackup(state,new Map(),path,at);const saved=await readLifecycleBackup(path);assert.deepEqual(saved.state.operations,state.operations);assert.doesNotMatch(await readFile(path,'utf8'),/synthetic-google-access|synthetic-store-token/);
 if(process.env.EVZ_TEAM_EVIDENCE_DIRECTORY)await writeFile(join(process.env.EVZ_TEAM_EVIDENCE_DIRECTORY,'uncertain-proof.json'),JSON.stringify({state},null,2));
 await restoreLifecycleBackup(path,join(directory,'restore'));const restored=await StudioLifecycle.open({directory:join(directory,'restore')});assert.equal((await restored.snapshot()).operations.requests[a.action_id+'-intent'].status,'Uncertain');assert.equal((await restored.loadConfig()).google_team_notifications,undefined);await assert.rejects(dispatchExactMail(restored,a,{actor:'owner',env,transport:w.provider}));assert.equal(w.sent.length,1);
});
test('all original shared bindings and default flags remain closed before notification approval/dispatch',async t=>{
 const f=await fixture(t),a=await approved(f),w=wire(f);await assert.rejects(dispatchExactMail(f.app,a,{actor:'owner',env:{},transport:w.provider}),/disabled/);await assert.rejects(dispatch(f,a,w,'friend'),/assignee/);
 for(const binding of ['inertBinding','manualBinding','projectBinding']){const store=f.app.store;f.app.store={...store,[binding]:{},config:()=>Promise.resolve(f.config),snapshot:()=>store.snapshot(),change:(...args)=>store.change(...args)};await assert.rejects(exactNotificationPackage(f.app,{notification_id:a.p.notification_id},'owner'),/Shared record/);await assert.rejects(dispatch(f,a,w),/rejects|Shared record/);f.app.store=store;}assert.equal(w.calls.length,0);
});
test('signed owner/friend hosted routes enforce CSRF, exact policy, each-message approval and disabled default without arbitrary external routing',async t=>{
 const f=await fixture(t,{authorize:false}),hostEnv={...env,CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-team-20261026',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)},w=wire(f);
 let handler=createHostedDesk({env:hostEnv,storeFactory:()=>f.raw,now:f.app.now,googleMailOptions:{getAccessToken:w.getAccessToken,fetcher:w.fetcher}});
 async function client(role){const request=(path,body,headers={})=>new Request(origin+'/desk'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})}),cookie=r=>r.headers.get('set-cookie')?.split(';',1)[0],b=await handler(request('/api/bootstrap')),csrf=(await b.json()).csrf,initial=cookie(b),login=await handler(request('/api/login',{key:hostEnv[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']},{cookie:initial,'content-type':'application/json','x-studio-token':csrf,origin})),headers={cookie:initial+'; '+cookie(login),'content-type':'application/json','x-studio-token':csrf,origin};return {request,headers,async call(op,input={}){const r=await handler(request('/api/exact-team-notifications/'+op,input,headers)),v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;}};}
 const owner=await client('owner'),friend=await client('friend'),review=await owner.call('policy');assert.equal(review.sha256,hash(policy()));
 assert.equal((await handler(owner.request('/api/exact-team-notifications/authorize-policy',{},{...owner.headers,'x-studio-token':'bad'}))).status,403);
 assert.equal((await handler(friend.request('/api/exact-team-notifications/authorize-policy',{revision:(await f.app.snapshot()).revision,event_id:'unauthorized',policy_sha256:review.sha256,authorized:true},friend.headers))).status,400);
 await owner.call('authorize-policy',{revision:(await f.app.snapshot()).revision,event_id:'signed-policy',policy_sha256:review.sha256,authorized:true});
 for(const [role,c] of [['owner',owner],['friend',friend]]){
  const notification_id='digest-2026-10-26-'+role,p=await c.call('package',{notification_id,to:'outside@external.invalid',body:'Injected'});assert.equal(p.to,role+'@example.invalid');
  const a=await c.call('approve',{notification_id,revision:(await f.app.snapshot()).revision,event_id:'signed-'+role,package_sha256:p.sha256,approved:true,facts_checked:true});assert.equal(w.sent.length,role==='owner'?0:1);
  assert.equal((await c.call('dispatch',a)).status,'Verified');
 }
 assert.equal(w.sent.length,2);handler=createHostedDesk({env:{...hostEnv,EVZ_OPERATIONS_GOOGLE_TEAM_NOTIFICATIONS:undefined},storeFactory:()=>f.raw,now:f.app.now});assert.equal((await handler(owner.request('/api/exact-team-notifications/policy',{},owner.headers))).status,400);
});
