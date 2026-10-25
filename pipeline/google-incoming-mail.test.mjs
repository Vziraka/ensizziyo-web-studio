import test from 'node:test';
import assert from 'node:assert/strict';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {syncIncomingMail} from './google-incoming-mail.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {sharedDeskSession} from './shared-originals-client.mjs';
import {fictionalBlobs,fixture as authoringFixture,runtime,source,review,substitutedPNG} from './fixtures/hosted-authoring.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLifecycleBackup} from './lifecycle-backup.mjs';

const at='2026-10-24T18:00:00.000Z',account='business@example.invalid',env={EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL:'fictional-incoming-v1'};
const h=(name,value)=>({name,value}),body=text=>({size:Buffer.byteLength(text),data:Buffer.from(text).toString('base64url')});
function thread(text='Could you share website examples?\n\nOn Monday wrote:\n> Old price and instructions.'){
 const sent={id:'original',threadId:'thread',labelIds:['SENT'],internalDate:String(Date.parse(at)-10000),payload:{mimeType:'text/plain',headers:[h('From','hello@evzdigital.studio'),h('To','project@example.invalid'),h('Subject','Website question'),h('Message-ID','<original@evzdigital.studio>')],body:body('Original exact business message')}};
 const reply={id:'incoming',threadId:'thread',historyId:'103',labelIds:['INBOX','UNREAD'],internalDate:String(Date.parse(at)-1000),payload:{mimeType:'multipart/mixed',headers:[h('From','"Fictional Operator" <project@example.invalid>'),h('To','hello@evzdigital.studio'),h('Subject','Re: Website question'),h('Message-ID','<incoming@example.invalid>'),h('In-Reply-To','<original@evzdigital.studio>'),h('References','<original@evzdigital.studio>'),h('Date','Sat, 24 Oct 2026 17:59:59 +0000'),h('Authentication-Results','mx.google.com; dkim=pass header.i=@example.invalid; dmarc=pass header.from=example.invalid')],parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',headers:[h('Content-Type','text/plain; charset="UTF-8"'),h('Content-Transfer-Encoding','quoted-printable')],body:body(text)},{mimeType:'text/html',body:body('<p>'+text+'</p>')}]},{mimeType:'application/pdf',filename:'untrusted.pdf',body:{attachmentId:'never-fetch',size:9000}}]}};
 return {id:'thread',messages:[sent,reply]};
}
function rawStore(){let data,version=0;return {lose:false,conflict:false,async getWithMetadata(){return data?{data:structuredClone(data),etag:String(version)}:null;},async setJSON(_key,next,o){if(o.onlyIfNew&&data||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==String(version)||this.conflict){this.conflict=false;return {modified:false};}data=structuredClone(next);version++;if(this.lose){this.lose=false;throw Error('Lost committed response');}return {modified:true,etag:String(version)};},configure(fn){fn(data.config);version++;}};}
async function setup(raw=rawStore()){
 const config=structuredClone(initialConfig);config.sender={email:'hello@evzdigital.studio',account_email:account};config.google_incoming_mail={enabled:true,capability:'fictional-incoming-v1',run_id:config.run_id,account_email:account,grant_id:'fictional-grant'};config.operations={threads:{project:{thread_id:'thread',original_id:'original',from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Website question',sent_after:new Date(Date.parse(at)-20000).toISOString(),sent_before:at}}};
 const store=new ConditionalLifecycleStore(raw);await store.initialize(config,{schema_version:1,run_id:config.run_id,mode:'controlled',revision:0,updated_at:at,prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]});
 const app=await StudioLifecycle.fromStore({store,now:()=>new Date(at)});await app.apply(fixtureProspect('project',at));return {app,raw,store};
}
function wire(){
 const w={calls:[],thread:thread(),history:[{historyId:'105'}],profile:{emailAddress:account,historyId:'100'},token:{access_token:'fictional-incoming-token',expires_at:Date.now()+3600000,account,grant_id:'fictional-grant',scopes:gmailScopes}};
 w.getAccessToken=async()=>w.token;
 w.fetcher=async(url,o)=>{const u=new URL(url);assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(o.method,'GET');assert.equal(o.redirect,'error');w.calls.push(u);let value;if(w.onRead)await w.onRead(u);
  if(u.pathname.endsWith('/profile'))value=w.profile;
  else if(u.pathname.endsWith('/threads/thread')){assert.equal(u.searchParams.get('format'),'full');value=w.thread;}
  else if(u.pathname.endsWith('/history')){assert.equal(u.searchParams.get('maxResults'),'50');value=w.history.length>1?w.history.shift():w.history[0];}
  else throw Error('Unexpected endpoint '+u);
  if(value instanceof Error)throw value;
  return new Response(JSON.stringify(value),{status:value?.httpStatus??200});
 };return w;
}
const sync=(app,w,actor='friend',extra={})=>syncIncomingMail(app,{actor,env,...w,...extra});
const count=s=>Object.values(s.events).filter(e=>e.type==='reply_received').length;

// Compose the existing signed callers on the pinned SDK; only Google/storage HTTP is fictional.
async function notificationSetup(base){
 const {app,raw}=base??await setup(fictionalBlobs().raw),now=()=>new Date('2026-10-26T13:07:00Z'),w=wire(),origin='https://preview.example.invalid';app.now=now;
 const configure=async fn=>{const entry=await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});fn(entry.data.config);await raw.setJSON('workspace',entry.data,{onlyIfMatch:entry.etag});};
 await configure(c=>{
  c.preview_seeded_at=at;c.sender={email:'hello@evzdigital.studio',account_email:account,operator_names:{owner:'Test Owner',friend:'Test Friend'}};
  c.google_team_notifications={enabled:true,capability:'fictional-exact-team-v1',run_id:c.run_id,revision:'review-1',policy_id:'trial-1',grant_id:'fictional-grant',account_email:account,from:c.sender.email,approval_mode:'each-message',kinds:['attention','digest'],recipients:{owner:'owner@example.invalid',friend:'friend@example.invalid'},signature:'EVZ Digital team · Internal operations notification',starts_at:'2026-10-24T13:00:00Z',expires_at:'2026-10-28T13:00:00Z',daily_limit:5,sender_daily_limit:20,max_messages:8};
 });
 const mail={sent:[],lost:false},getAccessToken=w.getAccessToken;
 const fetcher=async(url,o)=>{
  const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(o.redirect,'error');
  if(path==='settings/sendAs')return Response.json({sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]});
  if(path==='messages/send'){
   assert.equal(o.method,'POST');const payload=JSON.parse(o.body),state=await app.snapshot(),intent=Object.values(state.operations.requests).find(q=>q.raw_base64url===payload.raw);assert.equal(intent.status,'Uncertain');
   const message={id:'sent-'+mail.sent.length,threadId:payload.threadId??'internal-'+mail.sent.length,labelIds:['SENT'],raw:payload.raw};mail.sent.push(message);
   if(mail.lost){mail.lost=false;throw Error('Fictional committed Google response loss');}return Response.json(message);
  }
  if(path==='messages')return Response.json({messages:mail.sent.filter(m=>Buffer.from(m.raw,'base64url').toString().includes(u.searchParams.get('q').replace('in:sent rfc822msgid:',''))).map(m=>({id:m.id}))});
  if(path.startsWith('messages/')){assert.equal(u.searchParams.get('format'),'raw');return Response.json(mail.sent.find(m=>m.id===path.slice(9)));}
  return w.fetcher(url,o);
 };
 const hostEnv={...env,CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_GOOGLE_TEAM_NOTIFICATIONS:'fictional-exact-team-v1',EVZ_OPERATIONS_GOOGLE_EXACT_MAIL:'fictional-exact-mail-v1',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-incoming-team-123',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
 const make=()=>createHostedDesk({env:hostEnv,storeFactory:()=>raw,now,googleIncomingOptions:{getAccessToken,fetcher},googleMailOptions:{getAccessToken,fetcher}}),session=role=>sharedDeskSession({origin,key:hostEnv[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher:(url,o)=>make()(new Request(url,o))});
 const owner=await session('owner'),friend=await session('friend'),post=(client,path,body={})=>client.json('/api/'+path,{method:'POST',body});
 const policy=await post(owner,'exact-team-notifications/policy');await post(owner,'exact-team-notifications/authorize-policy',{revision:(await app.snapshot()).revision,event_id:'cross-policy',policy_sha256:policy.sha256,authorized:true});
 return {app,raw,w,mail,configure,owner,friend,post,async deliver(role,kind,{lost=false}={}){
  await post(owner,'team-notifications/prepare');const n=Object.values((await app.snapshot()).team_notifications.messages).find(n=>n.recipient_role===role&&n.kind===kind&&n.status==='Prepared; delivery held');assert.ok(n,role+' '+kind);
  const client=role==='owner'?owner:friend,p=await post(client,'exact-team-notifications/package',{notification_id:n.id}),a=await post(client,'exact-team-notifications/approve',{notification_id:n.id,revision:(await app.snapshot()).revision,event_id:'approve-'+n.id,package_sha256:p.sha256,approved:true,facts_checked:true});mail.lost=lost;
  assert.equal((await post(client,'exact-team-notifications/dispatch',a)).status,lost?'Uncertain':'Verified');assert.equal((await post(client,'exact-team-notifications/reconcile',a)).status,'Verified');
  const state=await app.snapshot(),q=state.operations.requests[a.action_id+'-intent'],raw=Buffer.from(q.raw_base64url,'base64url').toString();assert.equal(Buffer.from(raw.split('\r\n\r\n')[1].replaceAll('\r\n',''),'base64').toString(),p.body);assert.match(raw,new RegExp('To: '+role+'@example.invalid'));assert.equal(q.internal_notification,true);assert.equal(q.policy_id,'trial-1');
  return a;
 }};
}

test('signed internal attention/digest receipts never register prospect routes before first sync or with a saved cursor',async t=>{
 for(const [role,kind,savedCursor] of [['owner','attention',false],['friend','attention',true],['owner','digest',true],['friend','digest',false]]){
  await t.test(`${role} ${kind}; ${savedCursor?'saved cursor':'before first sync'}`,async()=>{
  const f=await notificationSetup(),client=f[role];await f.app.change(s=>{s.prospects.project.follow_up_owner=role;});
  if(savedCursor){await f.post(client,'incoming-mail/sync');await f.post(client,'incoming-mail/sync');}
  else if(kind==='attention')await f.app.apply({id:'prior-reply',type:'reply_received',prospect_id:'project',at:new Date(Date.parse(at)-5000).toISOString(),data:{source_id:'prior',kind:'reply',body:'Fictional earlier reply'}},{actor:'provider'});
  const prior=(await f.app.snapshot()).operations?.gmail_incoming,a=await f.deliver(role,kind,{lost:true});
  const receiptOnly=await f.post(client,'incoming-mail/sync');assert.notEqual(receiptOnly.status,'Held');assert.equal(receiptOnly.registered_threads,1);if(!savedCursor)assert.equal(receiptOnly.cursor,'100');
  // Exercise both derivation branches, including retained legacy metadata on an internal action.
  await f.app.change(s=>{s.operations.email[a.action_id].thread={thread_id:'internal-retained',original_id:'internal-original',from:'hello@evzdigital.studio',to:role+'@example.invalid',subject:'Internal only'};});
  const sentState=await f.app.snapshot(),intent=structuredClone(sentState.operations.requests),email=structuredClone(sentState.operations.email),action=structuredClone(sentState.actions[a.action_id]);
  if(savedCursor){const v=await f.post(client,'incoming-mail/sync');assert.equal(v.status,'Caught up');assert.equal(v.cursor,prior.cursor);assert.equal((await f.app.snapshot()).operations.gmail_incoming.binding,prior.binding);}
  else assert.equal((await f.post(client,'incoming-mail/sync')).status,'Caught up');
  f.w.thread.messages.push({...structuredClone(f.w.thread.messages[1]),id:'later-incoming',internalDate:String(Date.parse(at)-500)});f.w.history=[{historyId:'120',history:[{id:'115',messagesAdded:[{message:{id:'later-incoming',threadId:'thread'}},{message:{id:'sent-0',threadId:'internal-0'}}]}]}];
  await f.post(client,'incoming-mail/sync');assert.equal((await f.post(client,'incoming-mail/sync')).cursor,'120');const ingested=await f.app.snapshot();
  assert.equal(ingested.prospects.project.reply.source_id,'later-incoming');assert.equal(ingested.prospects.project.cold_paused,true);assert.equal(ingested.operations.gmail_incoming.routes.length,1);assert.equal(ingested.operations.gmail_incoming.routes[0].project_id,'project');assert.equal(ingested.operations.gmail_incoming.unrouted_additions,1);
  assert.equal(Object.values(ingested.team_notifications.messages).filter(n=>n.kind==='attention'&&n.recipient_role===role&&n.status==='Prepared; delivery held').length,1);
  const events=count(ingested),seen=structuredClone(ingested.operations.gmail_incoming.seen);f.w.history=[{historyId:'121',history:[{id:'121',messagesAdded:[{message:{id:'later-incoming',threadId:'thread'}}]}]}];await f.post(client,'incoming-mail/sync');await f.post(client,'incoming-mail/sync');
  const after=await f.app.snapshot();assert.equal(count(after),events);assert.deepEqual(after.operations.gmail_incoming.seen,seen);assert.deepEqual(after.operations.requests,intent);assert.deepEqual(after.operations.email,email);assert.deepEqual(after.actions[a.action_id],action);assert.equal(f.mail.sent.length,1);assert.ok(f.w.calls.every(u=>!u.pathname.includes('/threads/internal')));
  });
 }
});

test('multiple signed internal receipts preserve atomic incoming CAS through concurrency and committed response loss',async()=>{
 const f=await notificationSetup();await f.post(f.owner,'incoming-mail/sync');await f.post(f.friend,'incoming-mail/sync');await f.deliver('owner','attention');await f.deliver('friend','digest');
 f.w.thread.messages.push({...structuredClone(f.w.thread.messages[1]),id:'concurrent-reply',internalDate:String(Date.parse(at)-500)});f.w.history=[{historyId:'120',history:[{id:'115',messagesAdded:[{message:{id:'concurrent-reply',threadId:'thread'}}]}]}];await f.post(f.owner,'incoming-mail/sync');
 const set=f.raw.setJSON.bind(f.raw);let lose=true;f.raw.setJSON=async(...args)=>{const result=await set(...args);if(lose&&result.modified){lose=false;throw Error('Fictional committed CAS response loss');}return result;};
 await Promise.allSettled([f.post(f.owner,'incoming-mail/sync'),f.post(f.friend,'incoming-mail/sync')]);
 assert.equal(lose,false);const committed=await f.app.snapshot();assert.equal(committed.operations.gmail_incoming.cursor,'120');assert.equal(committed.prospects.project.reply.source_id,'concurrent-reply');assert.equal(count(committed),2);assert.equal(Object.keys(committed.operations.gmail_incoming.seen).length,2);
 f.w.history=[{historyId:'121'}];await f.post(f.friend,'incoming-mail/sync');const after=await f.app.snapshot();assert.equal(count(after),2);assert.equal(after.prospects.project.cold_paused,true);assert.deepEqual(after.operations.requests,committed.operations.requests);assert.equal(Object.keys(after.operations.requests).length,2);assert.equal(f.mail.sent.length,2);assert.equal(Object.values(after.team_notifications.messages).filter(n=>n.kind==='attention'&&n.status==='Prepared; delivery held').length,1);
});

test('only explicit internal markers are excluded; malformed actual prospect receipts and retained routes still hold',async()=>{
 for(const saved of [false,true])for(const change of ['missing-project','missing-contact','wrong-contact','ambiguous-thread','malformed-receipt','retained-route','truthy-internal-marker']){
  const {app}=await setup(),w=wire();if(saved)await sync(app,w);await app.change(s=>{
   const p={from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Website question'};
   s.actions.bad={id:'bad',prospect_id:change==='missing-project'?undefined:'project',status:'Verified',payload:{exact_mail:true,package:p},delivery:{thread_id:'thread',message_id:'original',rfc_message_id:'<original@evzdigital.studio>'}};s.operations??={};s.operations.email={bad:{}};
   if(change==='missing-contact')s.prospects.project.contact.verified=false;
   if(change==='wrong-contact')p.to='wrong@example.invalid';
   if(change==='ambiguous-thread'){s.prospects.other=structuredClone(s.prospects.project);s.prospects.other.id='other';s.actions.bad.prospect_id='other';}
   if(change==='malformed-receipt')s.actions.bad.delivery.thread_id='unsafe/id';
   if(change==='retained-route')s.operations.email.bad.thread={thread_id:'retained',original_id:'original',from:p.from,to:'wrong@example.invalid',subject:p.subject};
   if(change==='truthy-internal-marker'){delete s.actions.bad.prospect_id;s.actions.bad.payload.internal_notification='true';}
  });const calls=w.calls.length;
  if(saved){const v=await sync(app,w);assert.equal(v.status,'Held',change);assert.equal(v.cursor,'100');assert.equal((await app.snapshot()).prospects.project.cold_paused,true);}else await assert.rejects(sync(app,w),/route\/contact differs|Ambiguous/);
  assert.equal(w.calls.length,calls);
 }
});

test('a signed verified prospect reply receipt still registers after internal delivery',async()=>{
 const f=await notificationSetup();await f.post(f.owner,'incoming-mail/sync');await f.deliver('friend','digest');
 let r=(await f.app.snapshot()).prospects.project;const apply=(id,type,data)=>f.app.apply({id,type,prospect_id:'project',at,data},{actor:'owner'});
 await apply('review','reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'discovery',focus:'website'});r=(await f.app.snapshot()).prospects.project;
 await apply('draft','reply_draft_saved',{source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:'Here are the exact reviewed examples.'});await apply('draft-approved','reply_draft_approved',{sha256:(await f.app.snapshot()).prospects.project.reply_draft.sha256,approved:true,facts_checked:true});
 await f.configure(c=>{c.google_exact_mail={enabled:true,capability:'fictional-exact-mail-v1',run_id:c.run_id,grant_id:'fictional-grant',account_email:account,from:c.sender.email,daily_limit:20};});
 const p=await f.post(f.owner,'exact-mail/package',{project_id:'project',kind:'reply'}),a=await f.post(f.owner,'exact-mail/approve',{project_id:'project',kind:'reply',revision:(await f.app.snapshot()).revision,event_id:'external-approved',package_sha256:p.sha256,approved:true,facts_checked:true});assert.equal((await f.post(f.owner,'exact-mail/dispatch',a)).status,'Verified');
 const state=await f.app.snapshot(),receipt=state.actions[a.action_id].delivery;
 // A fresh fictional registration uses the actual approved prospect receipt as its sole route.
 await f.configure(c=>{c.operations.threads={};});await f.app.change(s=>{delete s.operations.gmail_incoming;});
 const original={id:receipt.message_id,threadId:receipt.thread_id,labelIds:['SENT'],internalDate:String(+f.app.now()-10000),payload:{mimeType:'text/plain',headers:[h('From',p.from),h('To',p.to),h('Subject',p.subject),h('Message-ID',receipt.rfc_message_id)],body:body(p.body)}};
 const priorIncoming=structuredClone(f.w.thread.messages[1]),reply=structuredClone(priorIncoming);reply.id='after-exact';reply.internalDate=String(+f.app.now()-1000);for(const name of ['In-Reply-To','References'])reply.payload.headers.find(h=>h.name===name).value=receipt.rfc_message_id;f.w.thread.messages=[priorIncoming,original,reply];
 const v=await f.post(f.friend,'incoming-mail/sync');assert.notEqual(v.status,'Held',v.hold);assert.equal(v.registered_threads,1);const after=await f.app.snapshot();assert.equal(after.operations.gmail_incoming.routes[0].original_id,receipt.message_id);assert.equal(after.prospects.project.reply.source_id,'after-exact');assert.equal(f.mail.sent.length,2);
});

test('complete project G1 retains internal MIME and prospect cursor; disabled restore requires explicit fictional rebind',async t=>{
 const g=await authoringFixture(),client=await g.connect(),job=await client.begin('STUDIO TEST Shared project','website-concepts');await client.render(job.id,source(job.context),await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json')),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Unit boundary substitute',pages:receipt.pages.map(()=>substitutedPNG)});await client.complete(job.id,review(receipt,rasters));
 await g.app.apply(fixtureProspect('project',at));
 const f=await notificationSetup({app:g.app,raw:g.storage.raw});await f.configure(c=>{c.google_incoming_mail={enabled:true,capability:'fictional-incoming-v1',run_id:c.run_id,account_email:account,grant_id:'fictional-grant'};c.operations={threads:{project:{thread_id:'thread',original_id:'original',from:c.sender.email,to:'project@example.invalid',subject:'Website question'}}};});
 await f.post(f.friend,'incoming-mail/sync');await f.post(f.owner,'incoming-mail/sync');const a=await f.deliver('owner','attention',{lost:true});await f.deliver('friend','digest');await f.app.change(s=>{s.operations.email[a.action_id].thread={thread_id:'internal-retained',original_id:'internal-original',from:'hello@evzdigital.studio',to:'owner@example.invalid',subject:'Internal only'};});
 const before=await f.app.snapshot(),config=await f.app.loadConfig(),directory=await mkdtemp(join(tmpdir(),'evz-incoming-team-g1-'));t.after(()=>rm(directory,{recursive:true,force:true}));const backup=join(directory,'complete.json');await client.backup(backup);const bundle=await readLifecycleBackup(backup);
 assert.deepEqual(bundle.state.operations,before.operations);assert.deepEqual(bundle.state.asset_index,before.asset_index);assert.ok([...bundle.files.keys()].some(p=>p.endsWith('/authored.json')));assert.ok([...bundle.files.keys()].some(p=>p.endsWith('/runtime.json')));assert.ok([...bundle.files.keys()].some(p=>p.endsWith('/review-page-1.png')));assert.ok([...bundle.files.keys()].some(p=>p.startsWith('project-originals/')));
 const destination=join(directory,'restored');await StudioLifecycle.restore({input:backup,destination});const restored=await StudioLifecycle.open({directory:destination,now:f.app.now});assert.deepEqual((await restored.snapshot()).operations,before.operations);assert.equal(restored.config.google_incoming_mail,undefined);assert.equal(restored.config.google_team_notifications,undefined);assert.equal(restored.config.outreach_enabled,false);assert.equal(restored.config.connector_writes_enabled,false);await assert.rejects(syncIncomingMail(restored,{actor:'friend',env,...f.w}),/disabled/);
 // This test-only trusted rebind supplies no credentials, send capability or standing authority.
 restored.config={...restored.config,run_id:config.run_id,mode:config.mode,sender:config.sender,google_incoming_mail:config.google_incoming_mail,operations:config.operations};restored.loadConfig=async()=>structuredClone(restored.config);const after=await syncIncomingMail(restored,{actor:'friend',env,...f.w});assert.equal(after.status,'Caught up');const state=await restored.snapshot();assert.deepEqual(state.operations.requests,before.operations.requests);assert.deepEqual(state.operations.email,before.operations.email);assert.equal(state.operations.gmail_incoming.binding,before.operations.gmail_incoming.binding);assert.equal(state.operations.gmail_incoming.cursor,'105');assert.equal(restored.config.google_team_notifications,undefined);assert.equal(f.mail.sent.length,2);
});

test('registered bounded first sync commits current reply, stop, review and held team preparation without treating quoted instructions as intent',async()=>{
 const {app}=await setup(),w=wire();let v=await sync(app,w);assert.equal(v.phase,'history');assert.equal(v.cursor,'100');
 const s=await app.snapshot(),r=s.prospects.project;assert.equal(r.stage,'Reply review');assert.equal(r.cold_paused,true);assert.equal(r.reply.kind,'reply');assert.equal(r.reply.content.status,'Complete');assert.equal(r.reply.source_id,'incoming');assert.equal(r.reply.thread_id,'thread');assert.equal(r.reply.provider_date,'Sat, 24 Oct 2026 17:59:59 +0000');assert.match(r.reply.provider_source_sha256,/^[a-f0-9]{64}$/);assert.equal(r.reply_suggestion.summary.excerpt,'Could you share website examples?');assert.equal(r.reply_review,undefined);assert.equal(r.project_work,undefined);assert.equal(Object.values(s.actions).filter(a=>a.type==='call_task')[0].status,'Cancelled');assert.equal(Object.values(s.team_notifications.messages)[0].status,'Prepared; delivery held');
 v=await sync(app,w);assert.equal(v.status,'Caught up');assert.equal(v.cursor,'105');assert.equal(count(await app.snapshot()),1);assert.equal(w.calls.length,4);
});

test('folded Gmail authentication/references and decoded UTF-8 alternatives preserve current text; injected new header lines hold',async()=>{
 const {app}=await setup(),w=wire();w.thread=thread('¿Podemos revisar el sitio web?');const m=w.thread.messages[1];m.payload.headers.find(h=>h.name==='Authentication-Results').value='mx.google.com;\r\n dkim=pass header.i=@example.invalid;\r\n dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=example.invalid';m.payload.headers.find(h=>h.name==='References').value='<earlier@example.invalid>\r\n <original@evzdigital.studio>';
 await sync(app,w);let r=(await app.snapshot()).prospects.project;assert.equal(r.reply.content.status,'Complete');assert.equal(r.reply.content.text,'¿Podemos revisar el sitio web?');assert.equal(r.reply.content.references,'<earlier@example.invalid> <original@evzdigital.studio>');
 const other=await setup(),bad=wire();bad.thread.messages[1].payload.headers.find(h=>h.name==='From').value='project@example.invalid\r\nBcc: unknown@example.invalid';assert.equal((await sync(other.app,bad)).status,'Held');assert.equal(count(await other.app.snapshot()),0);
});

test('history paging retains page work before cursor, resumes fresh handlers, deduplicates and invalidates exact stale content approvals',async()=>{
 const {app,store}=await setup(),w=wire();await sync(app,w);let r=(await app.snapshot()).prospects.project;
 const event=(id,type,data)=>({id,prospect_id:'project',type,at,data});await app.apply(event('draft','reply_draft_saved',{source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:'Human reviewed question'}),{actor:'friend'});r=(await app.snapshot()).prospects.project;await app.apply(event('approved','reply_draft_approved',{sha256:r.reply_draft.sha256,approved:true,facts_checked:true}),{actor:'friend'});
 w.history=[{historyId:'120',nextPageToken:'page-two',history:[{id:'110',messagesAdded:[{message:{id:'incoming',threadId:'thread'}}]}]},{historyId:'120',history:[{id:'111',messagesAdded:[{message:{id:'incoming',threadId:'thread'}},{message:{id:'unrelated',threadId:'other'}}]}]}];w.thread=thread('Please clarify the contact page.');
 const fresh=()=>StudioLifecycle.fromStore({store,now:()=>new Date(at)});
 await sync(await fresh(),w);assert.equal((await app.snapshot()).operations.gmail_incoming.cursor,'100');assert.equal((await app.snapshot()).prospects.project.reply_draft.status,'Approved; sending held');
 await sync(await fresh(),w);r=(await app.snapshot()).prospects.project;assert.equal(r.reply_draft,undefined);assert.equal(r.reply_draft_history[0].status,'Superseded');assert.equal(r.reply.content.text,'Please clarify the contact page.');assert.equal(count(await app.snapshot()),2);
 await sync(await fresh(),w);await sync(await fresh(),w);assert.equal((await app.snapshot()).operations.gmail_incoming.cursor,'120');assert.equal(count(await app.snapshot()),2);assert.equal(w.calls.some(u=>u.pathname.includes('other')),false);assert.equal(w.calls.filter(u=>u.pathname.endsWith('/history'))[1].searchParams.get('pageToken'),'page-two');
});

test('committed response loss and CAS conflict preserve atomic effects and dedup across restarts',async()=>{
 const {app,raw,store}=await setup(),w=wire();raw.lose=true;await assert.rejects(sync(app,w),/uncertain/);assert.equal(count(await app.snapshot()),1);assert.equal((await app.snapshot()).operations.gmail_incoming.cursor,'100');await sync(await StudioLifecycle.fromStore({store,now:()=>new Date(at)}),w);assert.equal(count(await app.snapshot()),1);
 w.history=[{historyId:'110',history:[{id:'109',messagesAdded:[{message:{id:'incoming',threadId:'thread'}}]}]}];raw.conflict=true;await assert.rejects(sync(app,w),/changed/);assert.equal((await app.snapshot()).operations.gmail_incoming.cursor,'105');
});

test('expired history causes bounded registered-thread resync and a persistent visible hold with notification preparation',async()=>{
 const {app}=await setup(),w=wire();await sync(app,w);w.history=[{httpStatus:404}];let v=await sync(app,w);assert.equal(v.phase,'bootstrap');assert.match(v.resync_hold,/deleted before resync/);w.profile.historyId='200';await sync(app,w);w.history=[{historyId:'210'}];v=await sync(app,w);assert.equal(v.cursor,'210');assert.match(v.status,/review remains/);assert.ok((await app.snapshot()).operations.holds.gmail_incoming);assert.equal(count(await app.snapshot()),1);assert.equal(w.calls.some(u=>u.pathname.endsWith('/messages')),false);
});

test('default, D2, production, account, token and exact scope failures never read an incoming thread',async()=>{
 for(const change of ['disabled','production','D2','token-account','token-grant','scope','profile']){
  const {app,raw}=await setup(),w=wire();let options={};if(change==='disabled')options.env={};if(change==='production')raw.configure(c=>c.mode='production');if(change==='D2')app.store.inertBinding={};if(change==='token-account')w.token.account='other@example.invalid';if(change==='token-grant')w.token.grant_id='other';if(change==='scope')w.token.scopes=[...gmailScopes,'https://www.googleapis.com/auth/gmail.modify'];if(change==='profile')w.profile.emailAddress='other@example.invalid';
  if(['disabled','production','D2'].includes(change))await assert.rejects(sync(app,w,'owner',options));else assert.equal((await sync(app,w)).status,'Held');assert.equal(w.calls.some(u=>u.pathname.includes('/threads/')),false);
 }
});

test('routing spoof, missing RFC binding, truncated thread and oversized or unsupported MIME hold without attributed human intent',async()=>{
 for(const change of ['spoof','from','thread','original','reference','duplicate','charset','oversize','attachment-body']){
  const {app}=await setup(),w=wire(),m=w.thread.messages[1];
  if(change==='spoof')m.payload.headers.find(h=>h.name==='Authentication-Results').value='mx.google.com; dmarc=fail header.from=example.invalid';
  if(change==='from')m.payload.headers.find(h=>h.name==='From').value='unrelated@example.invalid';
  if(change==='thread')m.threadId='other';if(change==='original')w.thread.messages[0].id='wrong';if(change==='reference')m.payload.headers=m.payload.headers.filter(h=>!['In-Reply-To','References'].includes(h.name));if(change==='duplicate')m.payload.headers.push(h('From','project@example.invalid'));
  if(change==='charset')m.payload.parts[0].parts[0].headers[0].value='text/plain; charset=windows-1252';if(change==='oversize')m.payload.parts[0].parts[0].body=body('x'.repeat(24001));if(change==='attachment-body')m.payload.parts[0].parts[0].body={size:100,attachmentId:'external'};
  const v=await sync(app,w),s=await app.snapshot();if(['charset','oversize','attachment-body'].includes(change)){assert.equal(s.prospects.project.reply.content.status,'Held');assert.equal(s.prospects.project.reply_suggestion.status,'Held');}else{assert.equal(v.status,'Held');assert.equal(count(s),0);}assert.equal(s.prospects.project.cold_paused,true);
 }
});

test('automatic replies, bounces and outgoing/self messages cannot become human review or positive interest',async()=>{
 for(const change of ['auto','bounce','outgoing','self','html']){
  const {app}=await setup(),w=wire(),m=w.thread.messages[1];if(change==='auto')m.payload.headers.push(h('Auto-Submitted','auto-replied'));if(change==='bounce')m.payload.headers.push(h('Return-Path','<>'));if(change==='outgoing')m.labelIds.push('SENT');if(change==='self')m.payload.headers.find(h=>h.name==='From').value=account;
  if(change==='html'){m.payload.mimeType='text/html';m.payload.parts=undefined;m.payload.body=body('<p>Could you share website examples?</p><blockquote>Old price</blockquote>');}
  await sync(app,w);const r=(await app.snapshot()).prospects.project;if(['auto','bounce'].includes(change)){assert.equal(r.stage,'Hold');assert.notEqual(r.reply.kind,'reply');assert.equal(r.reply_suggestion.status,'Held');}else if(change==='html'){assert.equal(r.reply.content.format,'text/html projection');assert.equal(r.reply_suggestion.summary.excerpt,'Could you share website examples?');}else assert.equal(r.reply,undefined);assert.equal(r.reply_review,undefined);
 }
});

test('in-flight record changes reject all effects and cursor; looping history holds the original cursor',async()=>{
 const {app}=await setup(),w=wire();w.onRead=async u=>{if(u.pathname.includes('/threads/'))await app.change(s=>s.revision++);};await assert.rejects(sync(app,w),/changed during read/);assert.equal(count(await app.snapshot()),0);assert.equal((await app.snapshot()).operations?.gmail_incoming,undefined);w.onRead=null;await sync(app,w);w.history=[{historyId:'120',nextPageToken:'same'}];await sync(app,w);const v=await sync(app,w);assert.equal(v.status,'Held');assert.equal(v.cursor,'100');
});

test('an in-flight configuration/grant change cannot commit old source coverage',async()=>{
 const {app,raw}=await setup(),w=wire();w.onRead=async u=>{if(u.pathname.includes('/threads/'))raw.configure(c=>c.google_incoming_mail.grant_id='changed-in-flight');};await assert.rejects(sync(app,w),/configuration changed/);assert.equal(count(await app.snapshot()),0);assert.equal((await app.snapshot()).operations?.gmail_incoming,undefined);
});

test('known history additions deleted before full read and retained current replies missing during resync never silently advance',async()=>{
 for(const resync of [false,true]){
  const {app}=await setup(),w=wire();await sync(app,w);
  if(resync){w.history=[{httpStatus:404}];await sync(app,w);}else{w.history=[{historyId:'120',history:[{id:'115',messagesAdded:[{message:{id:'disappeared',threadId:'thread'}}]}]}];await sync(app,w);}
  if(resync)w.thread.messages.pop();const v=await sync(app,w);assert.equal(v.status,'Held');assert.match(v.hold,/disappeared/);assert.equal(v.cursor,'100');assert.equal(count(await app.snapshot()),1);
 }
 const {app}=await setup(),w=wire();await sync(app,w);w.history=[{historyId:'120',history:[{id:'115',messagesDeleted:[{message:{id:'incoming',threadId:'thread'}}]}]}];const v=await sync(app,w);assert.equal(v.status,'Held');assert.match(v.hold,/source was deleted/);assert.equal(v.cursor,'100');
});

test('changed current registration and exhausted dedup retain old coverage and pause without another provider read',async()=>{
 const {app,raw}=await setup(),w=wire();await sync(app,w);raw.configure(c=>c.google_incoming_mail.grant_id='changed-grant');const prior=w.calls.length,v=await sync(app,w);assert.equal(v.status,'Held');assert.match(v.hold,/registration changed/);assert.equal(v.cursor,'100');assert.equal(w.calls.length,prior);
 raw.configure(c=>c.google_incoming_mail.grant_id='fictional-grant');await app.change(s=>{const n=s.operations.gmail_incoming;n.phase='bootstrap';n.index=0;for(let i=0;i<999;i++)n.seen[hash('fake'+i)]='old';});w.thread.messages.push({...structuredClone(w.thread.messages[1]),id:'new-incoming',internalDate:String(Date.parse(at)-500)});const full=await sync(app,w);assert.equal(full.status,'Held');assert.match(full.hold,/dedup history is full/);assert.equal(count(await app.snapshot()),1);assert.equal(full.cursor,'100');
});

test('malformed history, provider failures, limits and ambiguous route associations visibly hold without cursor loss',async()=>{
 for(const change of ['history-order','history-range','history-ids','history-size','thread-size','response-size','json','403','429','lost-read','authentication-comment']){
  const {app}=await setup(),w=wire();await sync(app,w);
  if(change==='history-order')w.history=[{historyId:'120',history:[{id:'115'},{id:'114'}]}];
  if(change==='history-range')w.history=[{historyId:'120',history:[{id:'121'}]}];
  if(change==='history-ids')w.history=[{historyId:'120',history:[{id:'115',messagesAdded:[{message:{id:'unsafe/id',threadId:'thread'}}]}]}];
  if(change==='history-size')w.history=[{historyId:'120',history:Array.from({length:51},(_,i)=>({id:String(101+i)}))}];
  if(['thread-size','authentication-comment'].includes(change)){w.history=[{httpStatus:404}];await sync(app,w);if(change==='thread-size')w.thread.messages=Array.from({length:20},(_,i)=>({...w.thread.messages[0],id:'m'+i}));else w.thread.messages[1].payload.headers.find(h=>h.name==='Authentication-Results').value='mx.google.com; dmarc=fail header.from=example.invalid (dmarc=pass header.from=example.invalid)';}
  if(change==='response-size')w.fetcher=async()=>new Response('x'.repeat(120001));if(change==='json')w.fetcher=async()=>new Response('{invalid');if(['403','429'].includes(change))w.history=[{httpStatus:Number(change)}];if(change==='lost-read')w.history=[Error('Injected lost response')];
  const v=await sync(app,w);assert.equal(v.status,'Held',change);assert.equal(v.cursor,'100');assert.equal(count(await app.snapshot()),1);assert.ok((await app.snapshot()).operations.holds.gmail_incoming);
 }
 const {app,raw}=await setup(),w=wire();raw.configure(c=>c.operations.threads.other={...c.operations.threads.project});await assert.rejects(sync(app,w),/route\/contact differs|Ambiguous/);assert.equal(w.calls.length,0);
});

test('existing verified exact-mail receipt registers its own conversation without another queue',async()=>{
 const {app,raw}=await setup(),w=wire();raw.configure(c=>c.operations.threads={});await app.change(s=>{
  s.actions.sent={id:'sent',prospect_id:'project',type:'email',status:'Verified',delivery:{message_id:'original',thread_id:'thread',rfc_message_id:'<original@evzdigital.studio>'},payload:{exact_mail:true,package:{from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Website question'}}};s.operations={email:{sent:{status:'Verified'}}};
 });await sync(app,w);assert.equal((await app.snapshot()).prospects.project.stage,'Reply review');assert.equal(count(await app.snapshot()),1);
});

test('incoming reader preserves existing restrictions and send intents while stopping queued and uncertain future contact',async()=>{
 const {app}=await setup(),w=wire();await app.change(s=>{
  const r=s.prospects.project;r.restriction='do_not_contact';r.stage='Stopped';
  s.operations={requests:{'handed-intent':{status:'Uncertain',original:'reserved-before-reply'}}};
  for(const [id,status] of [['queued','Queued'],['pending','Pending'],['handed','Queued'],['sent','Verified']])s.actions[id]={id,prospect_id:'project',type:'email',status,payload:{call_id:'call'}};
 });await sync(app,w);const s=await app.snapshot();assert.equal(s.prospects.project.stage,'Stopped');assert.equal(s.prospects.project.restriction,'do_not_contact');assert.equal(s.prospects.project.cold_paused,true);assert.equal(s.actions.queued.status,'Cancelled');assert.equal(s.actions.pending.status,'Uncertain');assert.equal(s.actions.handed.status,'Uncertain');assert.equal(s.actions.sent.status,'Verified');assert.deepEqual(s.operations.requests['handed-intent'],{status:'Uncertain',original:'reserved-before-reply'});assert.equal(s.prospects.project.reply_suggestion.status,'Held');
});

test('both signed hosted operators can call the actual read-only source; CSRF and direct provider event forgery remain closed',async()=>{
 for(const actor of ['owner','friend']){
  const {raw,app}=await setup(),w=wire(),origin='https://preview.example.invalid',hostEnv={...env,CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-synthetic-123',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};raw.configure(c=>c.preview_seeded_at=at);
  const make=()=>createHostedDesk({env:hostEnv,storeFactory:()=>raw,now:()=>new Date(at),googleIncomingOptions:w}),request=(path,options={})=>new Request(origin+'/desk'+path,{...options,...(options.body?{body:JSON.stringify(options.body)}:{})}),cookie=r=>r.headers.get('set-cookie').split(';')[0];
  const boot=await make()(request('/api/bootstrap')),csrf=(await boot.json()).csrf,c=cookie(boot),login=await make()(request('/api/login',{method:'POST',headers:{cookie:c,origin,'content-type':'application/json','x-studio-token':csrf},body:{key:hostEnv[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']}})),headers={cookie:c+'; '+cookie(login),origin,'content-type':'application/json','x-studio-token':csrf};
  assert.equal((await make()(request('/api/incoming-mail/sync',{method:'POST',headers:{...headers,'x-studio-token':'wrong'},body:{}}))).status,403);
  const result=await make()(request('/api/incoming-mail/sync',{method:'POST',headers,body:{}}));assert.equal(result.status,200,await result.clone().text());assert.equal((await app.snapshot()).prospects.project.stage,'Reply review');
  const forged=await make()(request('/api/event',{method:'POST',headers,body:{event:{id:'forged',prospect_id:'project',type:'reply_received',at,data:{source_id:'fake',kind:'reply'}}}}));assert.equal(forged.status,400);
  assert.equal((await make()(request('/api/incoming-mail',{headers}))).status,200);assert.ok(w.calls.every(u=>!u.pathname.includes('/send')));
 }
});
