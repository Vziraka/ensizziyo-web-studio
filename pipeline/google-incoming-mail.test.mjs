import test from 'node:test';
import assert from 'node:assert/strict';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {syncIncomingMail} from './google-incoming-mail.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';
import {createHostedDesk} from './hosted-desk.mjs';

const at='2026-10-24T18:00:00.000Z',account='business@example.invalid',env={EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL:'fictional-incoming-v1'};
const h=(name,value)=>({name,value}),body=text=>({size:Buffer.byteLength(text),data:Buffer.from(text).toString('base64url')});
function thread(text='Could you share website examples?\n\nOn Monday wrote:\n> Old price and instructions.'){
 const sent={id:'original',threadId:'thread',labelIds:['SENT'],internalDate:String(Date.parse(at)-10000),payload:{mimeType:'text/plain',headers:[h('From','hello@evzdigital.studio'),h('To','project@example.invalid'),h('Subject','Website question'),h('Message-ID','<original@evzdigital.studio>')],body:body('Original exact business message')}};
 const reply={id:'incoming',threadId:'thread',historyId:'103',labelIds:['INBOX','UNREAD'],internalDate:String(Date.parse(at)-1000),payload:{mimeType:'multipart/mixed',headers:[h('From','"Fictional Operator" <project@example.invalid>'),h('To','hello@evzdigital.studio'),h('Subject','Re: Website question'),h('Message-ID','<incoming@example.invalid>'),h('In-Reply-To','<original@evzdigital.studio>'),h('References','<original@evzdigital.studio>'),h('Date','Sat, 24 Oct 2026 17:59:59 +0000'),h('Authentication-Results','mx.google.com; dkim=pass header.i=@example.invalid; dmarc=pass header.from=example.invalid')],parts:[{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',headers:[h('Content-Type','text/plain; charset="UTF-8"'),h('Content-Transfer-Encoding','quoted-printable')],body:body(text)},{mimeType:'text/html',body:body('<p>'+text+'</p>')}]},{mimeType:'application/pdf',filename:'untrusted.pdf',body:{attachmentId:'never-fetch',size:9000}}]}};
 return {id:'thread',messages:[sent,reply]};
}
function rawStore(){let data,version=0;return {lose:false,conflict:false,async getWithMetadata(){return data?{data:structuredClone(data),etag:String(version)}:null;},async setJSON(_key,next,o){if(o.onlyIfNew&&data||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==String(version)||this.conflict){this.conflict=false;return {modified:false};}data=structuredClone(next);version++;if(this.lose){this.lose=false;throw Error('Lost committed response');}return {modified:true,etag:String(version)};},configure(fn){fn(data.config);version++;}};}
async function setup(){
 const raw=rawStore(),config=structuredClone(initialConfig);config.sender={email:'hello@evzdigital.studio',account_email:account};config.google_incoming_mail={enabled:true,capability:'fictional-incoming-v1',run_id:config.run_id,account_email:account,grant_id:'fictional-grant'};config.operations={threads:{project:{thread_id:'thread',original_id:'original',from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Website question',sent_after:new Date(Date.parse(at)-20000).toISOString(),sent_before:at}}};
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
