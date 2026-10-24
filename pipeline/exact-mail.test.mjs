import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';
import {exactMailPackage,approveExactMail,dispatchExactMail,reconcileExactMail} from './exact-mail.mjs';
import {googleHostedTransport,gmailScopes,composeExactMail,verifySentRaw,byteHash,mailLimits} from './google-hosted-transport.mjs';
import {projectWorkContext} from './project-work.mjs';
import {claimAuthoring,resumeAuthoring,reviewAuthoring} from './project-authoring.mjs';
import {applyDesignPreferences} from './design-preferences.mjs';
import {sendInformation} from './call-desk-actions.mjs';
import {ProductionOperations} from './production.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {archiveProjectAsset} from './project-assets.mjs';
import {projectContext} from './project-work.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
const at='2026-10-24T18:00:00.000Z',env={EVZ_OPERATIONS_GOOGLE_EXACT_MAIL:'fictional-exact-mail-v1'},account='business@example.invalid';
const event=(id,type,data={})=>({id,prospect_id:'project',type,at,data});
async function setup(t,actor='owner'){
 const directory=await mkdtemp(join(tmpdir(),'evz-exact-mail-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const config={...structuredClone(initialConfig),sender:{email:'hello@evzdigital.studio',account_email:account,operator_names:{owner:'Test Owner',friend:'Test Friend'}},google_exact_mail:{enabled:true,capability:'fictional-exact-mail-v1',run_id:initialConfig.run_id,grant_id:'fictional-grant',account_email:account,from:'hello@evzdigital.studio',daily_limit:20}};
 const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at),config});
 await app.apply(fixtureProspect('project',at));await app.apply(event('reply','reply_received',fixtureReply('incoming','thread','project@example.invalid')),{actor:'provider'});
 const s=await app.snapshot(),r=s.prospects.project;
 await app.apply(event('reply-review','reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'discovery',focus:'website'}),{actor});
 const current=(await app.snapshot()).prospects.project;
 await app.apply(event('draft','reply_draft_saved',{source_id:current.reply.source_id,source_sha256:current.reply.content.source_sha256,reply_sha256:hash(current.reply),body:'Hi,\n\nHere is the exact reviewed reply.'}),{actor});
 await app.apply(event('reply-approved','reply_draft_approved',{sha256:(await app.snapshot()).prospects.project.reply_draft.sha256,approved:true,facts_checked:true}),{actor});
 return {app,actor,config};
}
async function approved(app,actor,selector={project_id:'project',kind:'reply'}){
 const p=await exactMailPackage(app,selector,actor),s=await app.snapshot();
 const a=await approveExactMail(app,{...selector,revision:s.revision,event_id:'send-approval-'+s.revision,package_sha256:p.sha256,approved:true,facts_checked:true},actor);return {...a,p};
}
function wire({failure=null,empty=false,ambiguous=false,mutateRaw=null,onPreflight=null,onSource=null,grant=null,alias=true,laterReply=false,paginate=false}={}){
 const calls=[],sent=[];let committed=null;
 const getAccessToken=async()=>grant??{access_token:'fictional-server-token',expires_at:Date.now()+3600_000,account,grant_id:'fictional-grant',scopes:gmailScopes};
 const json=(value,status=200)=>new Response(JSON.stringify(value),{status});
 const fetcher=async(url,options)=>{
  const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);calls.push({path,method:options.method});
  assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(options.redirect,'error');
  if(path==='profile'){await onPreflight?.();return json({emailAddress:account});}
  if(path==='settings/sendAs')return json({sendAs:alias?[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]:[]});
  if(path==='threads/thread'){
   const m={id:'incoming',threadId:'thread',internalDate:String(Date.parse(at)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:'project@example.invalid'},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Re: Website question'},{name:'Message-ID',value:'<incoming@example.invalid>'},{name:'In-Reply-To',value:'<original@example.invalid>'}],body:{data:Buffer.from('Could you share examples of website work?').toString('base64url'),size:41}}};
   // The actual UTF-8 byte count is independent of the application projection.
   m.payload.body.size=Buffer.byteLength('Could you share examples of website work?');await onSource?.();return json({id:'thread',messages:[m,...(laterReply?[{...m,id:'newer'}]:[])]});
  }
  if(path==='messages/send'){
   sent.push(JSON.parse(options.body));committed={id:'sent-id',threadId:sent.at(-1).threadId??'pdf-thread',labelIds:['SENT'],raw:sent.at(-1).raw};
   if(failure==='lost')throw Error('Simulated response lost after committed send');
   if(Number.isInteger(failure))return json({error:{message:'provider-private-error'}},failure);
   return json({id:committed.id,threadId:committed.threadId});
  }
  if(path==='messages'){
   assert.match(u.searchParams.get('q'),/^in:sent rfc822msgid:<evz\./);
   if(paginate&&!u.searchParams.has('pageToken'))return json({nextPageToken:'next'});
   return json({messages:empty?[]:ambiguous?[{id:'sent-id'},{id:'duplicate'}]:committed?[{id:'sent-id'}]:[]});
  }
  if(path==='messages/sent-id'){assert.equal(u.searchParams.get('format'),'raw');return json(mutateRaw?mutateRaw(structuredClone(committed)):committed);}
  throw Error('Unexpected actual Gmail endpoint '+path);
 };
 return {calls,sent,provider:googleHostedTransport({getAccessToken,fetcher,account,grantId:'fictional-grant'})};
}
test('both equal operators approve and dispatch the existing current reply through actual Gmail wire contract and same intent receipt',async t=>{
 for(const actor of ['owner','friend']){
  const {app}=await setup(t,actor),a=await approved(app,actor),w=wire();
  const result=await dispatchExactMail(app,a,{actor,env,transport:w.provider});assert.equal(result.status,'Verified',result.reason);assert.equal(w.sent.length,1);assert.equal(w.sent[0].threadId,'thread');
  const raw=Buffer.from(w.sent[0].raw,'base64url').toString();assert.match(raw,/In-Reply-To: <incoming@example.invalid>/);assert.match(raw,/References: <incoming@example.invalid>/);
  const s=await app.snapshot(),q=s.operations.requests[a.action_id+'-intent'];assert.equal(q.status,'Verified');assert.equal(s.actions[a.action_id].delivery.rfc_message_id,q.rfc_message_id);assert.match(result.receipt.verification,/recipient delivery not established/);
  await dispatchExactMail(await StudioLifecycle.open({directory:app.directory}),a,{actor,env,transport:w.provider});assert.equal(w.sent.length,1);
  const planner=ProductionOperations.prototype.nativeEmails.call({app},s,{follow_up:{enabled:true}},s.prospects.project,{},()=>{throw Error('Native caller must not own exact mail');},()=>{},true);assert.equal(planner.next().done,true);
 }
});
test('default flag, production mode and D2 remain closed before any HTTP call',async t=>{
 const {app,actor}=await setup(t),a=await approved(app,actor),w=wire();await assert.rejects(dispatchExactMail(app,a,{actor,env:{},transport:w.provider}),/disabled/);
 const load=app.loadConfig.bind(app);app.loadConfig=async()=>({...await load(),mode:'production'});await assert.rejects(dispatchExactMail(app,a,{actor,env,transport:w.provider}),/disabled/);app.loadConfig=load;
 app.store={inertBinding:{},config:async()=>app.config,snapshot:async()=>({})};await assert.rejects(dispatchExactMail(app,a,{actor,env,transport:w.provider}),/D2/);assert.equal(w.calls.length,0);
});
test('explicit PDF/reply send approval and exact current ownership are required',async t=>{
 const {app,actor}=await setup(t),p=await exactMailPackage(app,{project_id:'project',kind:'reply'},actor),s=await app.snapshot();
 await assert.rejects(approveExactMail(app,{project_id:'project',kind:'reply',revision:s.revision,event_id:'bad',package_sha256:p.sha256,approved:true},actor),/explicitly approve/);
 const a=await approved(app,actor);await assert.rejects(dispatchExactMail(app,a,{actor:'friend',env,transport:wire().provider}),/assignee/);
 await app.change(s=>s.prospects.project.follow_up_owner='friend');await assert.rejects(dispatchExactMail(app,a,{actor,env,transport:wire().provider}),/hand off/);
});
test('edits to body, signature configuration, recipient, current reply or stop invalidate approval before HTTP',async t=>{
 for(const change of ['body','signature','recipient','reply','stop','cancelled']){
  const {app,actor}=await setup(t),a=await approved(app,actor),w=wire();
  if(change==='signature'){app.config.sender.operator_names.owner='Changed';await writeFile(join(app.directory,'lifecycle-config.json'),JSON.stringify(app.config));}
  else await app.change(s=>{const r=s.prospects.project;if(change==='body'){r.reply_draft.content.body='Changed';r.reply_draft.sha256=hash(r.reply_draft.content);}if(change==='recipient')r.contact.email='changed@example.invalid';if(change==='reply')r.reply.source_id='new-source';if(change==='stop')r.restriction='do_not_contact';if(change==='cancelled')s.actions[a.action_id].status='Cancelled';});
  await assert.rejects(dispatchExactMail(app,a,{actor,env,transport:w.provider}));assert.equal(w.calls.length,0);
 }
});
test('fresh source and local stop are rechecked after reservation and before send',async t=>{
 for(const late of [false,true]){
  const {app,actor}=await setup(t),a=await approved(app,actor),w=wire({laterReply:late,onSource:late?null:()=>app.change(s=>s.prospects.project.restriction='do_not_contact')});
  assert.equal((await dispatchExactMail(app,a,{actor,env,transport:w.provider})).status,'Held');assert.equal(w.sent.length,0);assert.ok((await app.snapshot()).operations.requests[a.action_id+'-intent']);
 }
});
test('committed lost response reconciles only the exact Message-ID and never repeats during background redelivery',async t=>{
 const {app,actor}=await setup(t),a=await approved(app,actor),w=wire({failure:'lost',paginate:true});
 assert.equal((await dispatchExactMail(app,a,{actor,env,transport:w.provider})).status,'Uncertain');
 for(let i=0;i<3;i++)assert.equal((await dispatchExactMail(app,a,{actor,env,transport:w.provider})).status,'Uncertain');
 assert.equal(w.sent.length,1);const result=await reconcileExactMail(app,a,{actor,env,transport:w.provider});assert.equal(result.status,'Verified',result.reason);assert.equal(w.sent.length,1);
});
test('empty or ambiguous Sent search never permits resend; body, thread and headers must match completely',async t=>{
 for(const options of [{empty:true},{ambiguous:true},{mutateRaw:m=>({...m,threadId:'other'})},{mutateRaw:m=>({...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().replace('To: project@example.invalid','To: foreign@example.invalid')).toString('base64url')})},{mutateRaw:m=>({...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().replace(/([A-Za-z0-9+/]{20})\r\n/,'YWJjZGVmZ2hpamtsbW5v\r\n')).toString('base64url')})}]){
  const {app,actor}=await setup(t),a=await approved(app,actor),w=wire({failure:'lost',...options});await dispatchExactMail(app,a,{actor,env,transport:w.provider});
  assert.equal((await reconcileExactMail(app,a,{actor,env,transport:w.provider})).status,'Uncertain');await dispatchExactMail(app,a,{actor,env,transport:w.provider});assert.equal(w.sent.length,1);
 }
});
test('missing exact scopes and accepted alias hold; 401/403/429/500 never automatically retry even after token access',async t=>{
 for(const options of [{alias:false},{grant:{account,grant_id:'fictional-grant',access_token:'fictional-server-token',expires_at:Date.now()+3600000,scopes:[gmailScopes[1]]}},...[401,403,429,500].map(failure=>({failure}))]){
  const {app,actor}=await setup(t),a=await approved(app,actor),w=wire(options),result=await dispatchExactMail(app,a,{actor,env,transport:w.provider});assert.ok(['Held','Uncertain'].includes(result.status));await dispatchExactMail(app,a,{actor,env,transport:w.provider});assert.equal(w.sent.length,options.failure?1:0);assert.equal(JSON.stringify(await app.snapshot()).includes('fictional-server-token'),false);
 }
});
test('raw MIME uses UTF-8/base64 and safe filenames, rejects header injection, excessive attachments and any incomplete readback',()=>{
 const bytes=Buffer.from('%PDF-fictional exact bytes'),a={asset_id:'a',version_id:'v',filename:'file.pdf',mime:'application/pdf',sha256:byteHash(bytes),bytes:bytes.length},p={from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Review: café 🌱',body:'Hello café 🌱\n\nTest signature',attachments:[a]},m=composeExactMail(p,'intent',at,[bytes]);
 assert.match(m.raw.toString(),/Subject: =\?UTF-8\?B\?/);assert.equal(verifySentRaw({id:'sent',threadId:'new',labelIds:['SENT'],raw:m.raw.toString('base64url')},m).message_id,'sent');
 for(const bad of [{subject:'bad\r\nBcc: x@example.invalid'},{to:'a@example.invalid,b@example.invalid'},{attachments:[{...a,filename:'bad".pdf'}]}])assert.throws(()=>composeExactMail({...p,...bad},'intent',at,[bytes]));
 const large=Buffer.alloc(mailLimits.attachments+1);large.write('%PDF-');assert.throws(()=>composeExactMail({...p,attachments:[{...a,sha256:byteHash(large),bytes:large.length}]},'intent',at,[large]),/Drive-link/);
 assert.throws(()=>verifySentRaw({id:'sent',threadId:'new',labelIds:['SENT'],raw:m.raw.subarray(0,m.raw.length-8).toString('base64url')},m));
});
async function pdfDraft(app,actor){
 await app.apply({id:'reference',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:'reference',scope:'studio',kind:'template',name:'Fictional original',version_id:'v1',version_label:'v1',reference:'private-path:fixture/reference.pdf'}},{actor});
 const original=Buffer.from('%PDF-1.4\nFictional original source');await archiveProjectAsset(app,{project_id:'project',asset_id:'reference',version_id:'v1',context_sha256:projectContext(await app.snapshot(),'project').context_sha256,expected_sha256:byteHash(original)},original,{reference:'private-path:fixture/reference.pdf',name:'reference.pdf',mime_type:'application/pdf',modified_time:at},actor);
 const packet=projectWorkContext(await app.snapshot(),'project','website-concepts'),input={project_id:'project',work_id:'website-concepts',context_sha256:packet.context_sha256,references:[{asset_id:'reference',version_id:'v1'}]},job=await claimAuthoring(app,input,actor);
 const source=applyDesignPreferences({schema_version:1,context_sha256:job.context_sha256,kind:job.kind,author:'Fictional author',requirements_review:'Exact fictional criteria',visual_premise:'Five directions',limitations:'Substituted render boundary only',questions:[],directions:Array.from({length:5},(_,i)=>({id:'d'+i,name:'Direction '+i,premise:'Distinct layout',tradeoff:'Different emphasis',sections:['Services','Contact']})),pages:Array.from({length:5},(_,i)=>({direction:'d'+i}))},packet),pdf=Buffer.from('%PDF-1.4\nFictional reviewed export.'),png=Buffer.from('Fictional rendered page'),receipt={schema_version:1,context_sha256:job.context_sha256,source_sha256:hash(source),pdf:{name:'output.pdf',sha256:byteHash(pdf),bytes:pdf.length},pages:[{page:1,name:'page-1.png',sha256:byteHash(png)}]};
 for(const [file,bytes] of Object.entries({'renderer.py':'trusted-renderer','runtime.json':JSON.stringify({fictional:true}),'authored.json':JSON.stringify(source),'output.pdf':pdf,'page-1.png':png,'export.json':JSON.stringify(receipt)}))await writeFile(join(job.directory,file),bytes);
 await app.change(s=>Object.assign(s.prospects.project.project_work['website-concepts'].execution,{status:'Rendering',source_sha256:hash(source),renderer_sha256:hash('trusted-renderer'),runtime_sha256:hash({fictional:true})}));
 const selected={...input,job_id:job.id};await resumeAuthoring(app,selected,actor);await reviewAuthoring(app,{...selected,review:{export_sha256:hash(receipt),pages:receipt.pages,requirements:true,visual_design:true,export:true,notes:'Exact fictional source contract and export reviewed.'}},actor);return {selector:{project_id:'project',kind:'project',draft_id:job.id},pdf};
}
test('actual authored held PDF caller requires separate send approval, binds original version/hash and verifies attachment bytes for both roles',async t=>{
 for(const actor of ['owner','friend']){
  const {app}=await setup(t,actor),{selector,pdf}=await pdfDraft(app,actor),p=await exactMailPackage(app,selector,actor);assert.equal(p.attachments[0].sha256,byteHash(pdf));assert.equal(p.thread_id,undefined);
  const noApproval=wire();await assert.rejects(dispatchExactMail(app,{action_id:'missing'},{actor,env,transport:noApproval.provider}));assert.equal(noApproval.calls.length,0);
  const a=await approved(app,actor,selector),w=wire();const result=await dispatchExactMail(app,a,{actor,env,transport:w.provider});assert.equal(result.status,'Verified',result.reason);assert.equal(w.sent.length,1);assert.match(Buffer.from(w.sent[0].raw,'base64url').toString(),/Content-Disposition: attachment/);
  assert.equal((await app.snapshot()).prospects.project.project_email_drafts[0].send_authorized,false);
 }
});
test('changed project context, quote and attachment version/hash invalidate exact PDF approval',async t=>{
 for(const changed of ['note','quote','attachment']){
  const {app,actor}=await setup(t),{selector}=await pdfDraft(app,actor),a=await approved(app,actor,selector),w=wire();
  await app.change(s=>{const r=s.prospects.project;if(changed==='note')r.note='New brief';if(changed==='quote')r.quote={approved_by:'owner',price_cents:12345};if(changed==='attachment')s.asset_index[selector.draft_id].versions[selector.draft_id].verified_original.sha256='a'.repeat(64);});
  await assert.rejects(dispatchExactMail(app,a,{actor,env,transport:w.provider}));assert.equal(w.sent.length,0);
 }
});
test('old information sender cannot race an approved exact package and daily allowance includes prior authorities',async t=>{
 const {app,actor}=await setup(t),a=await approved(app,actor),w=wire();await app.change(s=>{s.prospects.project.information_draft={fingerprint:'old',status:'Draft'};});
 await assert.rejects(sendInformation(app,{prospect_id:'project',fingerprint:'old',approved:true},{actor,connect:()=>{throw Error('Must not connect');}}),/exact email/);
 await app.change(s=>{s.operations={requests:Object.fromEntries(Array.from({length:20},(_,i)=>['old'+i,{operation:'intent',prepared_at:at,status:'Verified'}]))};});await assert.rejects(dispatchExactMail(app,a,{actor,env,transport:w.provider}),/reservation exhausted/);assert.equal(w.calls.length,0);
});
test('simultaneous public caller invocations and a lost committed CAS reservation cannot issue a second effect',async t=>{
 const {app,actor,config}=await setup(t),a=await approved(app,actor),snapshot=await app.snapshot();let saved={schema_version:1,config,state:snapshot},version=1,lose=false;
 const raw={async getWithMetadata(){return {data:structuredClone(saved),etag:String(version)};},async setJSON(key,data,options){if(options.onlyIfMatch!==String(version))return {modified:false};saved=structuredClone(data);version++;if(lose){lose=false;throw Error('Lost committed reservation');}return {modified:true,etag:String(version)};}};
 const store=new ConditionalLifecycleStore(raw),one=await StudioLifecycle.fromStore({store,now:app.now}),two=await StudioLifecycle.fromStore({store,now:app.now}),w=wire();lose=true;
 await assert.rejects(dispatchExactMail(one,a,{actor,env,transport:w.provider}),/uncertain/);assert.equal(w.calls.length,0);assert.equal((await dispatchExactMail(two,a,{actor,env,transport:w.provider})).status,'Reserved');assert.equal(w.calls.length,0);
});
test('signed hosted caller loads and explicitly approves existing exact reply packages for both roles, disabled by default',async t=>{
 for(const actor of ['owner','friend']){
  const {app,config}=await setup(t,actor),origin='https://preview.example.invalid',hostEnv={...env,CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-exact-123',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
  let data={schema_version:1,config:{...config,preview_seeded_at:at},state:await app.snapshot()},version=1;
  const raw={async getWithMetadata(){return {data:structuredClone(data),etag:String(version)};},async setJSON(key,value,options){if(options.onlyIfMatch!==String(version))return {modified:false};data=structuredClone(value);version++;return {modified:true,etag:String(version)};}},w=wire();
  const handler=createHostedDesk({env:hostEnv,storeFactory:()=>raw,now:app.now,googleMailOptions:{transport:w.provider}}),request=(path,body,headers={})=>new Request(origin+'/desk'+path,{method:body?'POST':'GET',headers,...(body?{body:JSON.stringify(body)}:{})}),cookie=r=>r.headers.get('set-cookie')?.split(';',1)[0];
  const bootstrap=await handler(request('/api/bootstrap')),csrf=(await bootstrap.json()).csrf,initial=cookie(bootstrap),login=await handler(request('/api/login',{key:hostEnv[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']},{cookie:initial,'content-type':'application/json','x-studio-token':csrf,origin})),headers={cookie:initial+'; '+cookie(login),'content-type':'application/json','x-studio-token':csrf,origin};
  const p=await (await handler(request('/api/exact-mail/package',{project_id:'project',kind:'reply'},headers))).json();assert.ok(p.sha256,JSON.stringify(p));
  assert.equal((await handler(request('/api/exact-mail/approve',{project_id:'project',kind:'reply',package_sha256:p.sha256,revision:data.state.revision,event_id:'host-approved',approved:true,facts_checked:true},{...headers,'x-studio-token':'invalid'}))).status,403);
  const approved=await (await handler(request('/api/exact-mail/approve',{project_id:'project',kind:'reply',package_sha256:p.sha256,revision:data.state.revision,event_id:'host-approved',approved:true,facts_checked:true},headers))).json();assert.ok(approved.action_id,JSON.stringify(approved));
  const disabled=createHostedDesk({env:{...hostEnv,EVZ_OPERATIONS_GOOGLE_EXACT_MAIL:undefined},storeFactory:()=>raw,now:app.now,googleMailOptions:{transport:w.provider}});
  assert.equal((await disabled(request('/api/exact-mail/dispatch',approved,headers))).status,400);assert.equal(w.calls.length,0);
  const result=await (await handler(request('/api/exact-mail/dispatch',approved,headers))).json();assert.equal(result.status,'Verified',JSON.stringify(result));assert.equal(w.sent.length,1);
  assert.equal((await(await handler(request('/api/exact-mail/dispatch',approved,headers))).json()).status,'Verified');assert.equal(w.sent.length,1);
 }
});
test('concurrent dispatches reserve once, and exact PDF attachment changes in provider readback remain uncertain',async t=>{
 const {app,actor}=await setup(t),a=await approved(app,actor),w=wire();const outcomes=await Promise.allSettled([dispatchExactMail(app,a,{actor,env,transport:w.provider}),dispatchExactMail(app,a,{actor,env,transport:w.provider})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled'&&r.value.status==='Verified').length,1);assert.equal(w.sent.length,1);
 const next=await setup(t),{selector,pdf}=await pdfDraft(next.app,next.actor),approvedPDF=await approved(next.app,next.actor,selector),other=wire({mutateRaw:m=>({...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().replace(pdf.toString('base64'),Buffer.from('%PDF-1.4\nDifferent reviewed export.').toString('base64'))).toString('base64url')})});
 assert.equal((await dispatchExactMail(next.app,approvedPDF,{actor:next.actor,env,transport:other.provider})).status,'Uncertain');assert.equal(other.sent.length,1);
 const last=await setup(t),selected=await pdfDraft(last.app,last.actor),pdfApproval=await approved(last.app,last.actor,selected.selector),wrongThread=wire({mutateRaw:m=>({...m,threadId:'changed-pdf-thread'})});
 assert.equal((await dispatchExactMail(last.app,pdfApproval,{actor:last.actor,env,transport:wrongThread.provider})).status,'Uncertain');assert.equal(wrongThread.sent.length,1);
});
test('Gmail bounded stream stops oversized raw JSON, pagination never truncates silently and message headers reject duplicate recipients',async()=>{
 const p={from:'hello@evzdigital.studio',to:'project@example.invalid',subject:'Exact subject',body:'Exact body',attachments:[]},expected=composeExactMail(p,'bounded',at);
 const duplicate=Buffer.from(expected.raw.toString().replace('To: project@example.invalid','To: project@example.invalid\r\nTo: other@example.invalid'));
 assert.throws(()=>verifySentRaw({id:'s',threadId:'t',labelIds:['SENT'],raw:duplicate.toString('base64url')},expected),/duplicate/);
 let cancelled=false,calls=0;const getAccessToken=async()=>({account,grant_id:'g',access_token:'fictional-token',expires_at:Date.now()+3600000,scopes:gmailScopes});
 const oversized=googleHostedTransport({account,grantId:'g',getAccessToken,fetcher:async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(120001));},cancel(){cancelled=true;}}))});
 await assert.rejects(oversized.preflight(),/bounded read/);assert.equal(cancelled,true);
 const loop=googleHostedTransport({account,grantId:'g',getAccessToken,fetcher:async()=>{calls++;return new Response(JSON.stringify({nextPageToken:'loop'}));}});await assert.rejects(loop.reconcileSent(expected),/looping/);assert.equal(calls,2);
});
