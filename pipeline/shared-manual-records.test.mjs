import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {getStore} from '@netlify/blobs';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';import {writeLifecycleBackup,readLifecycleBackup} from './lifecycle-backup.mjs';
import {prepareManualWorkspace,installManualWorkspace,exportManualBackup} from './shared-manual-records.mjs';
import {originalDigest} from './shared-project-originals.mjs';import {readProjectAsset} from './project-assets.mjs';
import {createHostedDesk} from './hosted-desk.mjs';import {readDeskSnapshot} from './lifecycle-ui/snapshot-read.js';

const at='2026-10-24T20:00:00.000Z',origin='https://inert.example.invalid';
const scope={schema_version:1,capability:'shared-manual-records-v1',workspace_id:'synthetic-studio',run_id:'synthetic-production',mode:'production',state_schema:1,site_id:'synthetic-site',deploy_id:'synthetic-deploy',origin,namespace:'evz-manual-shared-synthetic-20261024'};
function sdkMemory(){
 const objects=new Map();let revision=0;const control={reads:0,writes:0,requests:[]};
 control.raw=getStore({name:scope.namespace,siteID:scope.site_id,token:'synthetic-only',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  const method=options.method.toUpperCase(),headers=new Headers(options.headers),key=new URL(url).pathname,entry=objects.get(key);control.requests.push({method,url:String(url),match:headers.get('if-match')});
  if(method==='GET'){control.reads++;return entry?new Response(entry.bytes,{headers:{etag:entry.etag}}):new Response(null,{status:404});}
  assert.equal(method,'PUT');assert.ok(headers.get('if-match')||headers.get('if-none-match')==='*');
  if(headers.get('if-none-match')==='*'&&entry||headers.has('if-match')&&headers.get('if-match')!==entry?.etag)return new Response(null,{status:412});
  const etag=`"${++revision}"`;objects.set(key,{bytes:options.body,etag});control.writes++;
  return new Response(null,{headers:{etag}});
 }});return control;
}
async function fixture(t,capability=scope.capability){
 const directory=await mkdtemp(join(tmpdir(),'evz-inert-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const app=await StudioLifecycle.initialize({directory:join(directory,'source'),config:structuredClone(initialConfig),now:()=>new Date(at)});await app.apply(fixtureProspect('synthetic-project',at));
 const state=await app.snapshot();state.mode='production';state.run_id=scope.run_id;delete state.prospects['synthetic-project'].controlled;
 if(capability==='shared-outreach-review-v1')Object.assign(state.prospects['synthetic-project'],{follow_up_owner:'owner',qualification:{verdict:'Research-qualified',independent_review:'Accepted'},call_prep:{observations:[{fact:'Synthetic verified research'}]}});
 const pdf=Buffer.from('%PDF-1.4\n% new synthetic original\n'+('new fictional original bytes\n'.repeat(45000))+'%%EOF\n'),digest=originalDigest(pdf),path=`project-originals/${digest}.pdf`;
 await mkdir(join(app.directory,'project-originals'));await writeFile(join(app.directory,path),pdf);
 state.asset_index={design:{id:'design',name:'Synthetic approved original',scope:'project',project_id:'synthetic-project',baseline_version:'v1',choices:{owner:'v1',friend:'v1'},versions:{v1:{id:'v1',reference:'private-path:synthetic-original.pdf',verified_original:{reference:'private-path:synthetic-original.pdf',sha256:digest,bytes:pdf.length,mime_type:'application/pdf',name:'synthetic.pdf'},registered_by:'owner',registered_at:at}}}};
 state.actions={historical:{id:'historical',type:'email',prospect_id:'synthetic-project',payload:{call_id:'old'},status:'Pending'},local:{id:'local',type:'call_task',prospect_id:'synthetic-project',payload:{due_at:at},status:'Queued'}};
 state.prospects['synthetic-project'].apollo={sequence_id:'synthetic-historical-sequence'};
 state.operations={lease:{owner:'old-host',expires_at:'2099-01-01T00:00:00Z'},requests:{external:{operation:'send',status:'Pending',id:'external'}},budget:{reserved_microcredits:123456,consumed_microcredits:80000,paused:true}};
 state.runtime={status:'Running',transport:'historical-host'};state.ai_attempts={immutable:{status:'Uncertain',reserved_microcredits:1900,receipt:'retained original attempt'}};
 const backup=join(directory,'source.backup.json');await writeLifecycleBackup(app.directory,state,backup,at);
 const sourceConfig={...structuredClone(initialConfig),mode:'production',run_id:scope.run_id,calls_enabled:true,outreach_enabled:true,connector_writes_enabled:true,transcript_ai:{...initialConfig.transcript_ai,enabled:true,daily_calls:100},runtime:{enabled:true},release:{approved:true,fingerprint:'old'},call_release:{approved:true},sender:{operator_names:{owner:'Synthetic Owner',friend:'Synthetic Friend'},secret:'NEVER_COPY'}};
 const packet=await prepareManualWorkspace({backup,sourceConfig,scope:{...scope,capability},...(capability==='shared-mailbox-review-v1'?{mailbox:{schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'synthetic-mailbox',after:'2026-10-24T00:00:00.000Z'}}:{})}),sdk=sdkMemory(),store=new ConditionalLifecycleStore(sdk.raw,{manualBinding:packet.binding});
 return {directory,local:app.directory,state,pdf,path,packet,sdk,store,sourceConfig};
}
const note=id=>({id,prospect_id:'synthetic-project',type:'note_added',at,data:{note:`Private note ${id}`}});
const cookie=r=>r.headers.get('set-cookie')?.split(';',1)[0];
async function client(f,actor,overrides={},options={}){
 const env={CONTEXT:'deploy-preview',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:f.packet.binding.scope.capability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43),...overrides};
 const request=(path,{method='GET',headers={},body}={})=>new Request(origin+'/desk'+path,{method,headers,body:body?JSON.stringify(body):undefined});
 const handler=createHostedDesk({...options,env,storeFactory:namespace=>{assert.equal(namespace,scope.namespace);return f.sdk.raw;},now:()=>new Date(at)});
 const boot=await handler(request('/api/bootstrap'));if(boot.status!==200)return {handler,request,boot};const csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:initial,'content-type':'application/json','x-studio-token':csrf,origin},body:{key:env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']}}));assert.equal(login.status,200);
 const headers={cookie:initial+'; '+cookie(login),'content-type':'application/json','x-studio-token':csrf,origin};
 return {handler,request,headers,call:(path,body)=>handler(request(path,{headers,...(body?{method:'POST',body}:{})})),read:async()=>readDeskSnapshot(await handler(request('/api/state',{headers})),{path:'/api/state',fetch:path=>handler(request(path,{headers}))})};
}
const call=(id,outcome='no_answer',more={})=>({id,prospect_id:'synthetic-project',type:'call_logged',at,data:{call_id:id,outcome,performed_at:at,desk:true,focus:'website',manual_attested:true,...more}});
async function installed(t){const f=await fixture(t);await installManualWorkspace(f.store,f.packet,{commit:true});return {...f,app:await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)})};}
async function apply(f,event,actor='owner'){return f.app.apply(event,{actor,expectedRevision:(await f.app.snapshot()).revision});}

test('signed production-shaped manual calls are attributable attestations with first-caller ownership, explicit handoff and held follow-up',async t=>{
 const f=await installed(t),owner=await client(f,'owner'),friend=await client(f,'friend'),first=await owner.read();
 assert.equal(first.shared_workspace.capability,'shared-manual-records-v1');assert.equal(first.controls.calls_paused,true);
 const record=await owner.call('/api/event',{revision:first.revision,event:call('first')});assert.equal(record.status,200,await record.text());
 let state=await f.store.snapshot(),r=state.prospects['synthetic-project'];assert.equal(r.follow_up_owner,'owner');assert.equal(r.calls.first.actor,'owner');assert.equal(r.calls.first.performed_at,at);assert.equal(r.calls.first.purpose,'new');assert.deepEqual(r.calls.first.attestation,{kind:'operator-reported-completed-call',provider_verified:false,execution:'disabled'});
 assert.equal(r.follow_ups.first.status,'Held');assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);
 assert.deepEqual(state.operations,f.state.operations);assert.deepEqual(state.ai_attempts,f.state.ai_attempts);assert.deepEqual(state.runtime,f.state.runtime);
 assert.equal((await friend.call('/api/event',{revision:state.revision,event:call('wrong-owner')})).status,400);
 assert.equal((await owner.call('/api/event',{revision:state.revision,event:{id:'handoff',prospect_id:r.id,type:'follow_up_handed_off',at,data:{to:'friend'}}})).status,200);
 state=await f.store.snapshot();assert.equal(state.prospects[r.id].follow_up_owner,'friend');assert.equal(state.actions.historical.assigned_to,'friend');
 assert.equal((await friend.call('/api/event',{revision:state.revision,event:call('second','voicemail')})).status,200);
 state=await f.store.snapshot();r=state.prospects[r.id];assert.equal(r.calls.second.purpose,'follow-up');assert.equal(r.calls.second.actor,'friend');assert.equal(r.follow_ups.second.send_after,'2026-10-28T20:00:00.000Z');assert.equal(r.follow_ups.second.status,'Held');
 await assert.rejects(apply(f,call('third'),'friend'),/contact stage|cap/);assert.equal(r.attempts.length,2);
 const exported=join(f.directory,'updated.backup.json');await exportManualBackup(f.app,f.local,exported);const backup=await readLifecycleBackup(exported);assert.deepEqual(backup.state,state);assert.deepEqual(backup.files.get(f.path),f.pdf);
 const destination=join(f.directory,'restored');await StudioLifecycle.restore({input:exported,destination});const restored=await StudioLifecycle.open({directory:destination,now:()=>new Date(at)});assert.deepEqual((await readProjectAsset(restored,r.id,'design','v1')).bytes,f.pdf);const recovered=await restored.snapshot();assert.deepEqual(recovered.prospects[r.id].calls,r.calls);assert.deepEqual(recovered.prospects[r.id].follow_up_handoffs,r.follow_up_handoffs);assert.notEqual(restored.config.calls_enabled,true);assert.deepEqual(recovered.operations.budget,state.operations.budget);await assert.rejects(restored.apply(call('local-still-released'),{actor:'friend',expectedRevision:recovered.revision}),/release|enabled|paused/i);
});

test('callback promised time and next-business 9am Eastern reminder remain task-only; callbacks do not consume new-business count',async t=>{
 for(const exact of [null,'2026-10-26T15:00:00.000Z']){
  const f=await installed(t);await apply(f,call('callback','callback',exact?{callback_at:exact}:{}),'friend');const state=await f.store.snapshot(),r=state.prospects['synthetic-project'];assert.equal(r.callback_at,exact);assert.equal(r.callback_due_at,exact??'2026-10-26T13:00:00.000Z');assert.equal(r.follow_ups?.callback,undefined);assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);assert.equal(state.actions['callback-callback_task'].payload.exact_time,Boolean(exact));
  await apply(f,call('callback-completed','callback',{callback_at:'2026-10-27T15:00:00.000Z'}),'friend');const after=await f.store.snapshot();assert.equal(after.prospects[r.id].calls['callback-completed'].purpose,'callback');assert.equal((await f.app.dashboard()).daily.new_researched,1);assert.equal(after.prospects[r.id].follow_up_owner,'friend');
 }
 const busy=await installed(t);await apply(busy,call('busy','busy'));const state=await busy.store.snapshot();assert.equal(state.prospects['synthetic-project'].follow_ups?.busy,undefined);assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);assert.equal(state.actions['busy-call_task'].payload.due_at,'2026-10-26T20:00:00.000Z');
});

test('stop interrupts future local work and preserves uncertain historical effects and budgets with external suppression unverified',async t=>{
 const f=await installed(t);await apply(f,call('callback','callback'));await apply(f,{id:'stop',prospect_id:'synthetic-project',type:'contact_stopped',at,data:{reason:'do_not_contact'}},'friend');
 const state=await f.store.snapshot(),r=state.prospects['synthetic-project'];assert.equal(r.stage,'Stopped');assert.equal(r.restriction,'do_not_contact');assert.equal(r.cold_paused,true);assert.equal(r.suppression,'Pending');assert.equal(state.actions['callback-callback_task'].status,'Cancelled');assert.equal(state.actions.historical.status,'Uncertain');assert.deepEqual(state.operations,f.state.operations);assert.deepEqual(state.ai_attempts,f.state.ai_attempts);assert.equal(state.actions['callback-sequence_stop'].execution_hold,'Manual record only; provider execution disabled');assert.equal((await f.app.dashboard()).shared_workspace.external_suppression,'unverified');
 await assert.rejects(apply(f,call('after-stop')),/Restriction/);await assert.rejects(apply(f,{...note('unstop'),type:'call_claimed',data:{}}),/Restriction/);
});

test('exact revision, call-time order, attestations, signed authority and event/data boundaries fail without mutation',async t=>{
 const f=await installed(t),before=await f.store.snapshot();
 for(const e of [call('unattested','no_answer',{manual_attested:false}),call('future','no_answer',{performed_at:'2026-10-25T20:00:00.000Z'}),call('simulation','no_answer',{simulated:true}),call('missing-desk','no_answer',{desk:false}),call('skipped','skipped'),call('extra','no_answer',{provider_task:'forged'}),{...call('spoof'),actor:'friend'},{...note('unknown'),type:'reply_received'}, {...note('prototype'),prospect_id:'constructor'}]){await assert.rejects(apply(f,e));assert.deepEqual(await f.store.snapshot(),before);}
 await assert.rejects(f.app.apply(call('missing-revision'),{actor:'owner'}),/exact current revision/);await assert.rejects(f.app.apply(call('fake'),{actor:'controlled-fixture',expectedRevision:before.revision}),/signed/);
 await apply(f,call('ordered'));await assert.rejects(apply(f,call('old','voicemail',{performed_at:'2026-10-24T19:59:59.000Z'})),/ordered/);await assert.rejects(f.app.apply(note('stale'),{actor:'friend',expectedRevision:before.revision}),/refresh/);
 const saved=await f.store.snapshot();assert.equal((await f.app.apply(call('ordered'),{actor:'owner',expectedRevision:before.revision})).duplicate,true);await assert.rejects(f.app.apply(call('ordered','busy'),{actor:'owner',expectedRevision:saved.revision}),/conflicts/);assert.deepEqual(await f.store.snapshot(),saved);
});

test('concurrent operators and committed/uncommitted response loss retain exact-once records and state CAS',async t=>{
 const f=await installed(t),other=await StudioLifecycle.fromStore({store:f.store,now:f.app.now}),revision=(await f.app.snapshot()).revision;
 const results=await Promise.allSettled([f.app.apply(call('race-owner'),{actor:'owner',expectedRevision:revision}),other.apply(call('race-friend'),{actor:'friend',expectedRevision:revision})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'STATE_CONFLICT');assert.equal(Object.keys((await f.store.snapshot()).prospects['synthetic-project'].calls).length,1);
 const set=f.sdk.raw.setJSON.bind(f.sdk.raw);f.sdk.raw.setJSON=async(...args)=>{await set(...args);throw Error('Committed SDK response loss');};const current=(await f.app.snapshot()).revision;assert.equal((await f.app.apply(note('lost'),{actor:'friend',expectedRevision:current})).reconciled,true);assert.equal((await other.apply(note('lost'),{actor:'friend',expectedRevision:current})).duplicate,true);
 f.sdk.raw.setJSON=async()=>{throw Error('Uncommitted SDK response loss');};const before=await f.app.snapshot();await assert.rejects(apply(f,note('uncommitted')),e=>e.code==='STATE_UNCERTAIN');assert.deepEqual(await f.app.snapshot(),before);f.sdk.raw.setJSON=set;await apply(f,note('uncommitted'));assert.deepEqual((await f.store.snapshot()).operations,f.state.operations);
});

test('manual store replays only the reviewed event: protected records, budgets, config, provider routes and old modes cannot widen authority',async t=>{
 const f=await installed(t),owner=await client(f,'owner',{EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-code-v1',EVZ_OPERATIONS_SHARED_ORIGINALS:'fictional-chunks-v1'}),reads=f.sdk.reads,writes=f.sdk.writes;
 for(const route of ['/api/call-audio','/api/calling-session','/api/gateway-proof/run','/api/information-draft','/api/team-notifications/prepare','/api/backup','/api/project-author/claim','/api/calendar/dispatch','/api/google-oauth/start','/api/google-drive-oauth/start','/api/google-calendar-oauth/start','/api/research-priority','/api/pause'])assert.equal((await owner.call(route,{})).status,409,route);
 for(const route of ['/api/google-oauth/status','/api/google-drive-oauth/status','/api/google-calendar-oauth/status','/api/google-oauth/callback','/google-oauth-callback.js','/api/calendar/availability','/api/call-transcription','/api/project-author/backup'])assert.equal((await owner.call(route)).status,409,route);
 assert.equal(f.sdk.reads,reads);assert.equal(f.sdk.writes,writes);
 for(const mutation of [s=>s.operations.budget.consumed_microcredits=0,s=>s.runtime.status='Stopped',s=>s.prospects['synthetic-project'].contact.phone='forged',s=>s.actions.historical.status='Verified'])await assert.rejects(f.app.change(s=>{mutation(s);}),/rejects worker/);
 const revision=(await f.store.snapshot()).revision;await assert.rejects(f.app.change(s=>{s.operations.budget.consumed_microcredits=0;},{manualRecord:{event:note('forged'),actor:'owner',revision}}),/protected records/);
 await assert.rejects(f.app.change(s=>{s.events={};},{manualRecord:{event:note('forged-history'),actor:'owner',revision}}),/protected records/);
 await assert.rejects(f.app.change((s,c)=>{c.calls_enabled=true;},{manualRecord:{event:note('forged'),actor:'owner',revision}}),/configuration changed/);
 for(const override of [{CONTEXT:'production'},{SITE_ID:'another'},{DEPLOY_ID:'another'},{EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-inert-shared-synthetic-20261024'},{EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview'},{EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify({...f.packet.binding,scope:{...scope,workspace_id:'other'}})}]){const c=await client(f,'owner',override);if(c.call)assert.equal((await c.call('/api/state')).status,503);else assert.equal(c.boot.status,503);}
 await assert.rejects(new ConditionalLifecycleStore(f.sdk.raw).snapshot(),/fictional/);assert.equal((await installManualWorkspace(null,f.packet)).dry_run,true);
});

test('manual setup remains validation-only by default, never seeds missing records and requires unchanged reviewed manifest and dependencies',async t=>{
 const f=await fixture(t);assert.equal((await installManualWorkspace(null,f.packet)).dry_run,true);assert.equal(f.sdk.reads+f.sdk.writes,0);const c=await client(f,'friend');assert.equal((await c.call('/api/state')).status,503);assert.equal(f.sdk.writes,0);
 const wrong={...f.packet,binding:{...f.packet.binding,manifest_sha256:'0'.repeat(64)}};await assert.rejects(installManualWorkspace(f.store,wrong,{commit:true}),/manifest/);
 const changed=structuredClone(f.packet.envelope);changed.state.prospects['synthetic-project'].note='unreviewed';await assert.rejects(installManualWorkspace(f.store,{...f.packet,envelope:changed},{commit:true}),/records changed/);
 const files=new Map(f.packet.files);files.delete(f.path);await assert.rejects(installManualWorkspace(f.store,{...f.packet,files},{commit:true}),/missing|Missing|dependency|Dependency/);
 assert.equal(f.sdk.writes,0);
 await installManualWorkspace(f.store,f.packet,{commit:true});await assert.rejects(installManualWorkspace(f.store,f.packet,{commit:true}),/already exists/);
 const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)});await writeFile(join(f.local,f.path),Buffer.from('%PDF-corrupt'));await assert.rejects(exportManualBackup(app,f.local,join(f.directory,'corrupt.backup.json')),/checksum/);
});

test('shared outreach review saves exact production-shaped drafts and approvals without enabling delivery',async t=>{
 const f=await fixture(t,'shared-outreach-review-v1');await installManualWorkspace(f.store,f.packet,{commit:true});
 const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)}),before=await app.snapshot(),owner=await client(f,'owner'),friend=await client(f,'friend');
 const draft={id:'shared-draft',prospect_id:'synthetic-project',type:'outreach_draft_saved',at,data:{lane:'email-first',timezone:'America/New_York',subject:'Synthetic question',body:'Synthetic complete message.'}};
 await assert.rejects(app.apply(draft,{actor:'friend',expectedRevision:before.revision}),/Assigned/);
 const response=await owner.call('/api/event',{event:draft,revision:before.revision});assert.equal(response.status,200,await response.text());
 assert.equal((await friend.read()).outreach_review.enabled,true);
 const saved=await app.snapshot(),sha256=saved.outreach_review.drafts['synthetic-project'].sha256;
 await app.apply({id:'shared-approve',prospect_id:'outreach-batches',type:'outreach_batch_approved',at,data:{items:[{project_id:'synthetic-project',sha256}],facts_checked:true}},{actor:'owner',expectedRevision:saved.revision});
 const result=await app.dashboard();assert.equal(result.outreach_review.enabled,true);assert.equal(result.outreach_review.items[0].schedule.approved_by,'owner');assert.equal(result.controls.outreach_paused,true);assert.deepEqual(result.actions,before.actions);
 await assert.rejects(f.store.change(s=>{s.outreach_review.drafts['synthetic-project'].body='unreviewed';},{manualRecord:{event:draft,actor:'owner',revision:before.revision}}));
 await assert.rejects(f.store.change((s,c)=>{c.outreach_enabled=true;},{manualRecord:{event:draft,actor:'owner',revision:before.revision}}));
});

test('old manual bindings cannot acquire shared outreach review through an environment flag',async t=>{
 const f=await fixture(t),before=f.sdk.writes;
 const mismatched=await client(f,'owner',{EVZ_OPERATIONS_DESK_ENABLED:'shared-outreach-review-v1'});
 assert.equal(mismatched.boot.status,503);assert.equal(f.sdk.writes,before);
 await installManualWorkspace(f.store,f.packet,{commit:true});const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)});
 await assert.rejects(app.apply({id:'unauthorized-review',prospect_id:'outreach-batches',type:'outreach_batch_paused',at,data:{reason:'Synthetic rejection'}},{actor:'owner',expectedRevision:(await app.snapshot()).revision}),/declared/);
});


test('signed mailbox callers persist actual transport evidence and failure without advancing or widening old profiles',async t=>{
 const f=await fixture(t,'shared-mailbox-review-v1');await installManualWorkspace(f.store,f.packet,{commit:true});
 const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)});
 const token={profile:'shared-mailbox-gmail-v1',account:'ensizziyo@evzdigital.studio',grant_id:'synthetic-mailbox',access_token:'synthetic-access-token',expires_at:Date.parse(at)+3600000,scopes:['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send']};
 const getAccessToken=async()=>token;getAccessToken.assertCurrent=async()=>{};getAccessToken.assertGrant=async()=>{};
 let requests=0;
 const options={googleIncomingOptions:{getAccessToken,fetcher:async(url,o)=>{requests++;assert.equal(o.method,'GET');const u=new URL(url);
  if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:token.account,historyId:'100'});
  if(u.pathname.endsWith('/messages')){assert.match(u.searchParams.get('q'),/after:/);return Response.json({messages:[{id:'synthetic-incoming',threadId:'synthetic-thread'}]});}
  if(u.pathname.endsWith('/messages/synthetic-incoming'))return Response.json({id:'synthetic-incoming',threadId:'synthetic-thread',internalDate:String(Date.parse(at)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:'new@example.org'},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Synthetic inquiry'},{name:'Message-ID',value:'<synthetic@example.org>'}],body:{data:Buffer.from('Synthetic website question').toString('base64url')}}});
  assert.ok(u.pathname.endsWith('/history'));return new Response(null,{status:404});
 }}};
 const owner=await client(f,'owner',{},options),friend=await client(f,'friend',{},options);
 const unauthenticated=await owner.handler(owner.request('/api/mailbox/sync',{method:'POST',headers:{'content-type':'application/json'},body:{}}));assert.equal(unauthenticated.status,403);assert.equal(requests,0);
 assert.equal((await owner.call('/api/mailbox/sync',{cursor:'forged'})).status,400);assert.equal((await owner.call('/api/mailbox/sync',[])).status,400);assert.equal(requests,0);
 for(const c of [owner,friend,owner]){const response=await c.call('/api/mailbox/sync',{});assert.equal(response.status,200,await response.text());}
 let state=await app.snapshot();assert.equal(state.inquiry_intake.sources['synthetic-incoming'].classification,'uncertain');assert.equal(state.mailbox_sync.checked_at,null);
 const event={id:'classify-incoming',prospect_id:'inquiry-intake',type:'inquiry_classification_reviewed',at,data:{source_id:'synthetic-incoming',classification:'inquiry',reason:'Reviewed exact synthetic source'}};
 const review=await friend.call('/api/event',{revision:state.revision,event});assert.equal(review.status,200,await review.text());state=await app.snapshot();const receipt=state.inquiry_intake.sources['synthetic-incoming'];assert.equal(receipt.assigned_to,'owner');assert.equal(state.prospects[receipt.project_id].reply.at,at);
 const r=state.prospects[receipt.project_id];
 const draft=await owner.call('/api/event',{revision:state.revision,event:{id:'incoming-draft',prospect_id:r.id,type:'reply_draft_saved',at,data:{source_id:r.reply.source_id,reply_sha256:hash(r.reply),source_sha256:r.reply.content.source_sha256,body:'Thanks for the synthetic question. Which step needs attention?'}}});assert.equal(draft.status,200,await draft.text());
 state=await app.snapshot();const approval=await owner.call('/api/event',{revision:state.revision,event:{id:'incoming-approval',prospect_id:r.id,type:'reply_draft_approved',at,data:{sha256:state.prospects[r.id].reply_draft.sha256,approved:true,facts_checked:true}}});assert.equal(approval.status,200,await approval.text());assert.equal((await app.snapshot()).prospects[r.id].reply_draft.status,'Approved; sending held');
 const failure=await owner.call('/api/mailbox/sync',{});assert.equal((await failure.json()).held,true);state=await app.snapshot();assert.equal(state.mailbox_sync.cursor,'100');assert.equal(state.mailbox_failure.reason,'History expired; full recovery required');
 await friend.call('/api/mailbox/sync',{});assert.equal(requests,4);assert.equal((await friend.read()).mailbox_failure.reason,state.mailbox_failure.reason);
 const before=await app.snapshot();await assert.rejects(app.change(s=>{s.prospects[receipt.project_id].name='forged';},{mailboxFailure:before.mailbox_failure}),/unrelated/);assert.deepEqual(await app.snapshot(),before);
 const old=await installed(t),oldOwner=await client(old,'owner',{},options);assert.equal((await oldOwner.call('/api/mailbox/sync',{})).status,409);assert.equal(requests,4);
});


test('mailbox OAuth uses a separate encrypted grant bound to the exact shared source and rejects transplanted policies',async t=>{
 const {createGoogleOAuth,googleOAuthScopes}=await import('./google-oauth.mjs');const {generateKeyPairSync,sign}=await import('node:crypto');
 const f=await fixture(t,'shared-mailbox-review-v1');await installManualWorkspace(f.store,f.packet,{commit:true});const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)});
 const binding={capability:'shared-mailbox-review-v1',workspace_id:scope.workspace_id,run_id:scope.run_id,namespace:scope.namespace,manual_binding_sha256:hash(f.packet.binding),source_policy_sha256:hash(app.config.mailbox),tenant_id:'synthetic-business',site_id:scope.site_id,deploy_id:scope.deploy_id,origin,redirect_uri:origin+'/desk/api/google-oauth/callback',client_id:'synthetic-mailbox.apps.googleusercontent.com',account:app.config.mailbox.account,audience:'internal'};
 const env={CONTEXT:'deploy-preview',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_OPERATIONS_DESK_ENABLED:binding.capability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-mailbox-code-v1',EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(binding),EVZ_GOOGLE_CREDENTIAL_NAMESPACE:'evz-mailbox-credentials-synthetic-test',EVZ_GOOGLE_CREDENTIAL_KEY_ID:'synthetic-key',EVZ_GOOGLE_CREDENTIAL_KEY:Buffer.alloc(32,7).toString('base64url'),EVZ_GOOGLE_CLIENT_SECRET:'synthetic-client-secret'};
 let saved=null,version=0,nonce;const raw={async getWithMetadata(){return saved?{data:structuredClone(saved),etag:String(version)}:null;},async setJSON(k,v,o){if(o.onlyIfNew&&saved||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==String(version))return {modified:false};saved=structuredClone(v);return {modified:true,etag:String(++version)};}};
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),seconds=Math.floor(Date.now()/1000);
 const make=(override={})=>createGoogleOAuth({env:{...env,...override},dispatchApp:app,profile:'shared-mailbox-gmail-v1',now:()=>seconds*1000,storeFactory:n=>{assert.equal(n,env.EVZ_GOOGLE_CREDENTIAL_NAMESPACE);return raw;},certificates:async()=>({'synthetic-key':publicKey.export({type:'spki',format:'pem'})}),fetcher:async(url,o)=>{assert.equal(url,'https://oauth2.googleapis.com/token');const bytes=[{alg:'RS256',kid:'synthetic-key'},{iss:'https://accounts.google.com',aud:binding.client_id,iat:seconds,exp:seconds+3600,sub:'synthetic-owner',email:binding.account,email_verified:true,hd:'evzdigital.studio',nonce}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return Response.json({access_token:'synthetic-mailbox-access',refresh_token:'synthetic-mailbox-refresh',token_type:'Bearer',expires_in:3600,scope:googleOAuthScopes.join(' '),id_token:bytes+'.'+sign('RSA-SHA256',Buffer.from(bytes),privateKey).toString('base64url')});}});
 const oauth=make(),session='synthetic-owner-session'.repeat(4);await assert.rejects(oauth.start('friend',session),/signed owner/);
 const started=await oauth.start('owner',session),url=new URL(started.authorization_url);nonce=url.searchParams.get('nonce');const connected=await oauth.callback('owner',session,{state:url.searchParams.get('state'),code:'synthetic-code'});assert.equal(connected.status,'Connected');assert.equal(connected.grant_id,'synthetic-mailbox');
 const token=await make().getAccessToken();assert.equal(token.profile,'shared-mailbox-gmail-v1');assert.doesNotMatch(JSON.stringify(saved),/synthetic-mailbox-access|synthetic-mailbox-refresh/);
 assert.throws(()=>make({EVZ_GOOGLE_CREDENTIAL_NAMESPACE:'evz-google-credentials-synthetic-test'}),/Separate/);
 assert.throws(()=>make({EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify({...binding,source_policy_sha256:'0'.repeat(64)})}),/source binding/);
 await oauth.disconnect('owner');await assert.rejects(make().getAccessToken(),/unavailable/);
});


test('an unassigned existing incoming conversation can be claimed without altering historical automation',async t=>{
 const {syncMailboxStep}=await import('./mailbox-intake.mjs');const f=await fixture(t,'shared-mailbox-review-v1');await installManualWorkspace(f.store,f.packet,{commit:true});const app=await StudioLifecycle.fromStore({store:f.store,now:()=>new Date(at)}),initial=await app.snapshot();
 const sender=initial.prospects['synthetic-project'].contact.email,grant={profile:'shared-mailbox-gmail-v1',account:'ensizziyo@evzdigital.studio',grant_id:'synthetic-mailbox',expires_at:Date.parse(at)+3600000,scopes:['openid','https://www.googleapis.com/auth/userinfo.email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send']};
 const transport={grant:()=>grant,incomingProfile:async()=>({emailAddress:grant.account,historyId:'100'}),mailboxList:async()=>({messages:[{id:'existing-incoming',threadId:'existing-thread'}]}),mailboxMessage:async()=>({id:'existing-incoming',threadId:'existing-thread',internalDate:String(Date.parse(at)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:sender},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Synthetic question'},{name:'Message-ID',value:'<existing@example.invalid>'}],body:{data:Buffer.from('Synthetic existing conversation').toString('base64url')}}})};
 for(let n=0;n<3;n++)await syncMailboxStep(app,{transport});
 await app.apply({id:'classify-existing',prospect_id:'inquiry-intake',type:'inquiry_classification_reviewed',at,data:{source_id:'existing-incoming',classification:'inquiry',reason:'Synthetic reviewed question'}},{actor:'owner',expectedRevision:(await app.snapshot()).revision});
 await app.apply({id:'claim-existing',prospect_id:'synthetic-project',type:'conversation_claimed',at,data:{reason:'Taking responsibility for this existing reply.'}},{actor:'friend',expectedRevision:(await app.snapshot()).revision});
 const saved=await app.snapshot();assert.equal(saved.prospects['synthetic-project'].follow_up_owner,'friend');assert.deepEqual(saved.operations,initial.operations);
 await assert.rejects(app.apply({id:'claim-twice',prospect_id:'synthetic-project',type:'conversation_claimed',at,data:{reason:'Must use explicit handoff instead.'}},{actor:'owner',expectedRevision:saved.revision}),/already has a lead/);
});
