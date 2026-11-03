import {manualRenewalFixture as fixture} from './fixtures/manual-mailbox-renewal.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudDiscoveryFixture} from './cloud-discovery-fixtures.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {createMailboxWorker,mailboxWorkCommand} from './mailbox-work-service.mjs';
import {getStore} from '@netlify/blobs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {nativeGuardedFetch} from './native-notification-transport.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {exportManualBackup,prepareManualWorkspace,installManualWorkspace} from './shared-manual-records.mjs';
import {readLifecycleBackup,restoreLifecycleBackup} from './lifecycle-backup.mjs';
import {applyMailboxDeliveryTransition,mailboxDeliveryIntentId,mailboxDeliveryPackage} from './mailbox-delivery.mjs';
import {replyDraftContent} from './reply-content.mjs';
import {emailDraftReviewBinding} from './email-draft-policy.mjs';
import {mailboxDeliveryCommand,dispatchMailboxDelivery,reconcileMailboxDelivery} from './mailbox-delivery-service.mjs';
import {mailboxMimeStore} from './mailbox-mime-store.mjs';
import {composeExactMail,googleHostedTransport} from './google-hosted-transport.mjs';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';

const credential='ab'.repeat(32),leaseSecret='cd'.repeat(32),gateway={site:{id:'gateway'},deploy:{id:'gateway-deploy',context:'deploy-preview'}};

function memory(){const objects=new Map();let version=0;return {objects,async getWithMetadata(k,o){const e=objects.get(k);return e?{data:o.type==='json'?JSON.parse(e.bytes):Uint8Array.from(e.bytes).buffer,etag:e.etag}:null;},async set(k,bytes,o){const prior=objects.get(k);if(o.onlyIfNew&&prior||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==prior?.etag)return {modified:false};const etag=String(++version);objects.set(k,{bytes:Buffer.from(bytes),etag});return {modified:true,etag};},async setJSON(k,value,o){return this.set(k,Buffer.from(JSON.stringify(value)),o);}};}

async function approve(f,project){const r=(await f.store.snapshot()).prospects[project];await f.okay(await f.owner('/api/event',{revision:await f.revision(),event:{id:'draft-'+project,type:'reply_draft_saved',prospect_id:project,at:f.now().toISOString(),data:{source_id:r.reply.source_id,reply_sha256:hash(r.reply),source_sha256:r.reply.content.source_sha256,body:'Thanks for this controlled inquiry.'}}}));const draft=(await f.store.snapshot()).prospects[project].reply_draft;await f.okay(await f.owner('/api/event',{revision:await f.revision(),event:{id:'content-'+project,type:'reply_draft_approved',prospect_id:project,at:f.now().toISOString(),data:{sha256:draft.sha256,approved:true,facts_checked:true}}}));const p=await f.command('mailbox-delivery','package',{kind:'reply',project_id:project});return f.command('mailbox-delivery','approve',{revision:await f.revision(),kind:'reply',project_id:project,package_sha256:p.sha256});}

async function reserveUnclaimed(f){
 await f.grant('mailbox-delivery','one-send');await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:false,reason:'Fictional delivery proof'});
 const approval=await approve(f,'one'),state=await f.store.snapshot(),a=state.mailbox_delivery.approvals[approval.approval_id],id=mailboxDeliveryIntentId(state,a),wire=composeExactMail(a.package,id,f.now().toISOString()),mime=await mailboxMimeStore(f.raw).put(wire.raw);
 const tr={type:'reserve',actor:'delivery',at:f.now().toISOString(),input:{revision:state.revision,approval_id:a.id,mime:{reference:'mailbox-mime/'+mime.sha256,...mime,message_id:wire.message_id}}};
 await f.app.change((s,c)=>applyMailboxDeliveryTransition(s,c,tr),{mailboxDelivery:tr,configFingerprint:hash(f.app.config),mailboxDeliveryDeadline:+f.now()+25000});
 return {approval,id};
}

test('an unclaimed permanent reservation reports that no claim is recorded and remains unresolved',async t=>{
 const f=await fixture(t),{approval,id}=await reserveUnclaimed(f),result=await dispatchMailboxDelivery(f.app,approval.approval_id,{actor:'owner'});
 assert.equal(result.id,id);assert.equal(result.status,'Reserved');assert.equal(result.unclaimed,true);assert.equal(result.unresolved,true);assert.equal(result.readback_required,false);assert.equal(result.retry_permitted,false);
 await assert.rejects(reconcileMailboxDelivery(f.app,id,{actor:'owner'}),/claimed intent/);
 const state=await f.store.snapshot();assert.equal(state.mailbox_delivery.intents[id].claimed_at,null);assert.equal(state.mailbox_delivery.allowances['one-send'].used_intents,1);assert.equal(f.sent.length,0);
});

test('renewable delivery records a post-claim hold when its provider response is lost before the deadline',async t=>{
 const f=await fixture(t);await f.grant('mailbox-delivery','one-send');await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:false,reason:'Fictional delivery proof'});const approval=await approve(f,'one');
 f.control.sendLoss=true;const result=await f.command('mailbox-delivery','dispatch',{approval_id:approval.approval_id});assert.equal(result.status,'Uncertain');assert.equal(result.readback_required,true);
 let state=await f.store.snapshot(),intent=state.mailbox_delivery.intents[result.id];assert.equal(intent.status,'Held');assert(intent.claimed_at);assert.equal(state.mailbox_delivery.allowances['one-send'].used_intents,1);assert.equal(f.sent.length,1);
 const prior=await dispatchMailboxDelivery(f.app,approval.approval_id,{actor:'owner'});assert.equal(prior.unclaimed,false);assert.equal(prior.unresolved,true);assert.equal(prior.readback_required,true);assert.equal(prior.retry_permitted,false);assert.equal(f.sent.length,1);
 f.control.sendLoss=false;assert.equal((await f.command('mailbox-delivery','reconcile',{id:result.id})).status,'Verified');state=await f.store.snapshot();assert.equal(state.mailbox_delivery.intents[result.id].status,'Verified');assert.equal(f.sent.length,1);
 const verified=await dispatchMailboxDelivery(f.app,approval.approval_id,{actor:'owner'});assert.equal(verified.unresolved,false);assert.equal(verified.readback_required,false);assert.equal(verified.retry_permitted,false);
});

test('a same-key hold and a stale claim cannot both win their conditional writes',async t=>{
 for(const first of ['hold','claim']){
  const f=await fixture(t),{id}=await reserveUnclaimed(f),delayedType=first==='hold'?'claim':'hold',original=f.raw.setJSON.bind(f.raw);let release,arrive;
  const waiting=new Promise(resolve=>{arrive=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  f.raw.setJSON=async(key,value,options)=>{const intent=value.state?.mailbox_delivery?.intents[id],isDelayed=key==='workspace'&&(delayedType==='claim'?Boolean(intent?.claimed_at):intent?.status==='Held');if(isDelayed){arrive();await gate;}return original(key,value,options);};
  const change=async(type)=>{const tr={type,actor:'delivery',at:f.now().toISOString(),input:type==='claim'?{id}:{id,reason:'Fictional hold'}};return f.app.change((s,c)=>applyMailboxDeliveryTransition(s,c,tr),{mailboxDelivery:tr,configFingerprint:hash(f.app.config),mailboxDeliveryDeadline:+f.now()+25000});};
  const delayed=change(delayedType);await waiting;if(first==='hold')f.advance(26000);await change(first);release();await assert.rejects(delayed,error=>error.code==='STATE_CONFLICT');
  const state=await f.store.snapshot(),intent=state.mailbox_delivery.intents[id];assert.equal(intent.status,first==='hold'?'Held':'Uncertain');assert.equal(Boolean(intent.claimed_at),first==='claim');assert.equal(state.mailbox_delivery.allowances['one-send'].used_intents,1);assert.equal(f.sent.length,0);
 }
});

test('a forked namespace can still claim an original that a different namespace held',async t=>{
 const f=await fixture(t),{id}=await reserveUnclaimed(f),before=await f.store.snapshot(),config=structuredClone(f.app.config),backup=join(f.directory,'forked-before-retirement.json');
 await exportManualBackup(f.app,f.directory,backup);
 const scope={...f.b,deploy_id:'forked-production',namespace:'evz-manual-shared-forked-proof'},mailboxDelivery={...config.mailbox_delivery,deploy_id:scope.deploy_id,recovery_generation:'forked'},mailboxClock={...config.mailbox_clock,deploy_id:scope.deploy_id},cloudDiscovery={...config.cloud_discovery,deploy_id:scope.deploy_id};
 const packet=await prepareManualWorkspace({backup,sourceConfig:config,scope,mailbox:config.mailbox,mailboxWork:config.mailbox_work,mailboxDelivery,mailboxClock,cloudDiscovery});
 assert.deepEqual(packet.envelope.state,before);const raw=memory(),store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now:f.now});await installManualWorkspace(store,packet,{commit:true});const next=await StudioLifecycle.fromStore({store,now:f.now});
 const change=async(app,type,input)=>{const tr={type,actor:'delivery',at:f.now().toISOString(),input};return app.change((s,c)=>applyMailboxDeliveryTransition(s,c,tr),{mailboxDelivery:tr,configFingerprint:hash(app.config),mailboxDeliveryDeadline:+f.now()+25000});};
 await change(next,'hold',{id,reason:'Fictional hold in a separate namespace'});await change(f.app,'claim',{id});
 const old=await f.store.snapshot(),fork=await store.snapshot();assert(old.mailbox_delivery.intents[id].claimed_at);assert.equal(fork.mailbox_delivery.intents[id].claimed_at,null);assert.equal(fork.mailbox_delivery.intents[id].status,'Held');
 const r=fork.prospects.one;r.reply={...fixtureReply('source-new','thread-new',r.contact.email),at:f.now().toISOString()};const content=replyDraftContent(r,'A separately reviewed reply.','owner',next.config,true);content.review_binding_sha256=emailDraftReviewBinding(next.config);
 r.reply_draft={source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:content.body,content,sha256:hash(content),owner:'owner',actor:'owner',status:'Approved; sending held',approved_by:'owner',approval_event:'content-new'};fork.events['content-new']={id:'content-new',type:'reply_draft_approved',prospect_id:r.id,actor:'owner',data:{sha256:r.reply_draft.sha256,approved:true,facts_checked:true}};
 assert.throws(()=>mailboxDeliveryPackage(fork,next.config,{kind:'reply',project_id:'one'},'owner',f.now().toISOString()),/Reconcile the original unsettled delivery/);
 assert.equal(old.mailbox_delivery.allowances['one-send'].used_intents,1);assert.equal(fork.mailbox_delivery.allowances['one-send'].used_intents,1);assert.equal(f.sent.length,0);
});

test('a restored reservation warns only about the restored copy and preserves the old writer and charge',async t=>{
 const f=await fixture(t),{id}=await reserveUnclaimed(f),backup=join(f.directory,'unclaimed-before-restore.json');await exportManualBackup(f.app,f.directory,backup);
 const destination=join(f.directory,'unclaimed-restored');await restoreLifecycleBackup(backup,destination);const restored=JSON.parse(await readFile(join(destination,'lifecycle-state.json'),'utf8')),copy=restored.mailbox_delivery.intents[id];
 assert.equal(copy.status,'Held');assert.equal(copy.claimed_at,null);assert.match(copy.hold,/this copy cannot dispatch/i);assert.match(copy.hold,/other writers/i);assert.equal(restored.mailbox_delivery.allowances['one-send'].used_intents,1);
 const tr={type:'claim',actor:'delivery',at:f.now().toISOString(),input:{id}};await f.app.change((s,c)=>applyMailboxDeliveryTransition(s,c,tr),{mailboxDelivery:tr,configFingerprint:hash(f.app.config),mailboxDeliveryDeadline:+f.now()+25000});
 const original=await f.store.snapshot();assert(original.mailbox_delivery.intents[id].claimed_at);assert.equal(original.mailbox_delivery.allowances['one-send'].used_intents,1);assert.equal(f.sent.length,0);
});

test('a response arriving after the deadline stays uncertain and can only be reconciled',async t=>{
 const f=await fixture(t);await f.grant('mailbox-delivery','one-send');await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:false,reason:'Fictional delivery proof'});const approval=await approve(f,'one');
 const options={getAccessToken:f.getAccessToken,account:f.token.account,grantId:f.token.grant_id,requiredProfile:mailboxProfile,rawResponseMax:38_000_000,now:f.now};
 const delayed=googleHostedTransport({...options,fetcher:async(url,request)=>{const response=await f.fetcher(url,request);if(new URL(url).pathname.endsWith('/messages/send'))f.advance(26000);return response;}});
 const result=await dispatchMailboxDelivery(f.app,approval.approval_id,{transport:delayed,actor:'owner'}),intent=(await f.store.snapshot()).mailbox_delivery.intents[result.id];
 assert.equal(result.status,'Uncertain');assert(intent.claimed_at);assert.equal(intent.status,'Uncertain');assert.equal(f.sent.length,1);assert.equal((await f.store.snapshot()).mailbox_delivery.allowances['one-send'].used_intents,1);
 const transport=googleHostedTransport({...options,fetcher:f.fetcher});assert.equal((await reconcileMailboxDelivery(f.app,result.id,{transport,actor:'owner'})).status,'Verified');assert.equal(f.sent.length,1);
});

test('signed typed CAS serves two proposals and two exact replies with renewed finite authority on one binding',async t=>{
 const f=await fixture(t),binding=hash(f.packet.binding),config=hash(f.app.config);assert.equal((await f.owner('/api/mailbox-work/allowance',{revision:await f.revision(),allowance:{}},{'x-studio-token':'wrong'})).status,403);
 for(const [index,project]of ['one','two'].entries()){
  await f.grant('mailbox-work','work-'+project);if(!index)await f.command('mailbox-work','pause',{revision:await f.revision(),paused:false,reason:'Controlled proposal proof'});
  await f.command('mailbox-work','create',{id:'task-'+project,project_id:project,revision:await f.revision(),replace_task_id:null,studio_asset_ids:[]});const worker=f.worker(),claim=await worker.claim({request_id:'claim-'+project}),packet=await worker.context('task-'+project,claim.lease),result={body:'Thanks for the controlled inquiry. Which process should we discuss?',source_ids:packet.source_ids,uncertainties:[],execution:{provider:'synthetic',model:'fixture',duration_ms:1,input_tokens:null,output_tokens:null}};
  await worker.submit({id:'task-'+project,lease:claim.lease,context_sha256:packet.task.context_sha256,result});await f.command('mailbox-work','adopt',{id:'task-'+project,revision:await f.revision(),result_sha256:hash(result)});
  const draft=(await f.store.snapshot()).prospects[project].reply_draft;assert.equal(draft.status,'Draft');await f.okay(await f.owner('/api/event',{revision:await f.revision(),event:{id:'content-'+project,type:'reply_draft_approved',prospect_id:project,at:f.now().toISOString(),data:{sha256:draft.sha256,approved:true,facts_checked:true}}}));
  await f.grant('mailbox-delivery','send-'+project);if(!index)await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:false,reason:'Controlled noncommercial reply'});const p=await f.command('mailbox-delivery','package',{kind:'reply',project_id:project}),a=await f.command('mailbox-delivery','approve',{revision:await f.revision(),kind:'reply',project_id:project,package_sha256:p.sha256}),delivered=await f.command('mailbox-delivery','dispatch',{approval_id:a.approval_id});assert.equal(delivered.status,'Verified');
  if(!index)f.advance(1000);
 }
 const s=await f.store.snapshot();assert.equal(hash(f.packet.binding),binding);assert.equal(hash(f.app.config),config);assert.equal(f.sent.length,2);assert.equal(Object.keys(s.mailbox_delivery.intents).length,2);assert.deepEqual(Object.values(s.mailbox_delivery.allowances).map(a=>a.used_intents),[1,1]);assert.deepEqual(Object.values(s.mailbox_work.allowances).map(a=>a.used_claims),[1,1]);assert(Object.values(s.email_draft_tasks).every(t=>t.status==='Adopted'));assert(f.paths.includes('messages/sent-1')&&f.paths.includes('messages/sent-2'));
});

test('actual SDK signed read delay expires worker allowance before the conditional PUT',async t=>{
 const f=await fixture(t);await f.command('mailbox-work','allowance',{revision:await f.revision(),allowance:{id:'work-one',evidence_ref:'Short finite synthetic allowance',observed_at:f.now().toISOString(),expires_at:new Date(+f.now()+1000).toISOString(),included_only:true,max_claims:1}});await f.command('mailbox-work','pause',{revision:await f.revision(),paused:false,reason:'Finite fixture'});await f.command('mailbox-work','create',{id:'task-one',project_id:'one',revision:await f.revision(),replace_task_id:null,studio_asset_ids:[]});
 let current=(await f.store.envelope()),puts=0,expire=false;const originalFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=originalFetch;});
 globalThis.fetch=async(url,options)=>{const method=(options.method??'GET').toUpperCase(),u=new URL(url);if(u.hostname==='api.netlify.com'){if(expire)f.advance(1001);return Response.json({url:'https://signed-store.example.invalid/workspace'});}assert.equal(u.hostname,'signed-store.example.invalid');if(method==='GET')return new Response(JSON.stringify(current.data),{headers:{etag:current.etag}});assert.equal(method,'PUT');puts++;assert.equal(new Headers(options.headers).get('if-match'),current.etag);current={data:JSON.parse(options.body),etag:'next'};return new Response(null,{headers:{etag:current.etag}});};
 const sdk=getStore({name:f.b.namespace,siteID:f.b.site_id,token:'fictional-storage-token',consistency:'strong',fetch:nativeGuardedFetch}),store=new ConditionalLifecycleStore(sdk,{manualBinding:f.packet.binding,now:f.now}),app=await StudioLifecycle.fromStore({store,now:f.now});
 // The SDK's asynchronous signed-write lookup happens after replay and the initial live check.
 const originalSet=sdk.setJSON.bind(sdk);sdk.setJSON=async(...args)=>{expire=true;return originalSet(...args);};const worker=createMailboxWorker(app,{credential,leaseSecret,context:gateway,origin:'https://gateway.example.invalid'});await assert.rejects(worker.claim({request_id:'expires-during-signed-lookup'}));assert.equal(puts,0);assert.equal(current.data.state.email_draft_tasks['task-one'].status,'Ready');assert.equal(current.data.state.mailbox_work.allowances['work-one'].used_claims,0);
});

test('concurrent renewal and lost claim acknowledgment retain exactly one permanent allowance charge',async t=>{
 const f=await fixture(t);await f.grant('mailbox-work','first');await f.command('mailbox-work','pause',{revision:await f.revision(),paused:false,reason:'Finite test'});await f.command('mailbox-work','create',{id:'task',project_id:'one',revision:await f.revision(),replace_task_id:null,studio_asset_ids:[]});const worker=f.worker();f.control.lose=k=>k==='workspace';const results=await Promise.allSettled([worker.claim({request_id:'once'}),f.grant('mailbox-work','renewed')]);const state=await f.store.snapshot();assert.equal(Object.values(state.mailbox_work.allowances).reduce((sum,a)=>sum+a.used_claims,0),1);assert.equal(state.email_draft_tasks.task.status,'Claimed');assert(results.some(r=>r.status==='fulfilled'));const again=await worker.claim({request_id:'once'});assert.equal(again.task.lease.fence,1);assert.equal((await f.store.snapshot()).mailbox_work.allowances[again.task.lease.allowance_id].used_claims,1);await f.command('mailbox-work','pause',{revision:await f.revision(),paused:true,reason:'Either operator can stop claims'},f.friend);await assert.rejects(worker.context('task',again.lease),/paused/);assert.equal((await f.store.snapshot()).mailbox_work.allowances[again.task.lease.allowance_id].used_claims,1);
 const unauthenticated=await f.handler(new Request(f.b.origin+'/desk/api/mailbox-work/allowance',{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:'{}'}),f.context);assert.equal(unauthenticated.status,403);
});

test('nonempty legacy delivery and task histories import exactly, then rebind without reviving old authority',async t=>{
 for(const status of ['Reserved','Uncertain','Held','Lost POST']){
  const f=await fixture(t,{renewable:false});await f.grant('mailbox-delivery','old-one');await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:false,reason:'Finite old proof'});const first=await approve(f,'one');assert.equal((await f.command('mailbox-delivery','dispatch',{approval_id:first.approval_id})).status,'Verified');await f.grant('mailbox-delivery','old-two');const second=await approve(f,'two');
  if(status==='Lost POST'){f.control.sendLoss=true;assert.equal((await f.command('mailbox-delivery','dispatch',{approval_id:second.approval_id})).readback_required,true);}
  else{const s=await f.store.snapshot(),a=s.mailbox_delivery.approvals[second.approval_id],id=mailboxDeliveryIntentId(s,a),wire=composeExactMail(a.package,id,f.now().toISOString()),mime=await mailboxMimeStore(f.raw).put(wire.raw);const apply=async(type,input)=>{const tr={type,actor:'delivery',at:f.now().toISOString(),input};return f.app.change((s,c)=>applyMailboxDeliveryTransition(s,c,tr),{mailboxDelivery:tr,configFingerprint:hash(f.app.config)});};await apply('reserve',{revision:await f.revision(),approval_id:second.approval_id,mime:{reference:'mailbox-mime/'+mime.sha256,...mime,message_id:wire.message_id}});if(status!=='Reserved')await apply('claim',{id});if(status==='Held')await apply('hold',{id,reason:'Retain original uncertain outcome'});}
  await f.command('mailbox-work','create',{id:'old-claim',project_id:'one',revision:await f.revision(),replace_task_id:null,studio_asset_ids:[]});const oldClaim=await f.worker().claim({request_id:'old-request'});f.advance(21*60000);await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:true,reason:'Reviewed source cutover'});const before=await f.store.snapshot(),config=structuredClone(f.app.config),backup=join(f.directory,'history-'+status.replaceAll(' ','-')+'.json');await exportManualBackup(f.app,f.directory,backup);const verified=await readLifecycleBackup(backup);assert.deepEqual(verified.state,before);assert(verified.files.size>0);
  const scope={...f.b,deploy_id:'new-production',namespace:'evz-manual-shared-renewed-history'},mailbox={...config.mailbox,grant_id:'new-reviewed-grant'},mailboxWork={...config.mailbox_work,schema_version:2,max_open_tasks:1,max_retained_tasks:10,max_claims_per_allowance:1,max_allowance_minutes:60},mailboxDelivery={...config.mailbox_delivery,schema_version:2,deploy_id:scope.deploy_id,grant_id:mailbox.grant_id,max_intents_per_allowance:1,max_retained_intents:10,max_allowance_minutes:60};delete mailboxWork.expires_at;delete mailboxWork.max_tasks;delete mailboxDelivery.expires_at;delete mailboxDelivery.max_intents;
  const packet=await prepareManualWorkspace({backup,sourceConfig:config,scope,mailbox,mailboxWork,mailboxDelivery,mailboxClock:{...config.mailbox_clock,deploy_id:scope.deploy_id},cloudDiscovery:{...config.cloud_discovery,deploy_id:scope.deploy_id}});assert.deepEqual(packet.envelope.state,before);const raw=memory(),store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now:f.now});await installManualWorkspace(store,packet,{commit:true});const app=await StudioLifecycle.fromStore({store,now:f.now});
  await assert.rejects(mailboxDeliveryCommand(app,'allowance',{revision:before.revision,allowance:{id:'cannot-implicitly-rebind',evidence_ref:'Reviewed usage',observed_at:f.now().toISOString(),expires_at:new Date(+f.now()+60000).toISOString(),included_only:true,max_intents:1}},'owner'),/policy changed/i);
  await mailboxDeliveryCommand(app,'rebind',{revision:(await store.snapshot()).revision,previous_policy_sha256:before.mailbox_delivery.policy_sha256,authorized:true},'owner');let saved=await store.snapshot();assert.equal(saved.mailbox_delivery.paused,true);assert.equal(saved.mailbox_delivery.allowance_id,null);assert.equal(saved.mailbox_delivery.epoch,before.mailbox_delivery.epoch+1);assert.deepEqual(saved.mailbox_delivery.intents,before.mailbox_delivery.intents);assert.deepEqual(saved.mailbox_delivery.allowances,before.mailbox_delivery.allowances);assert.deepEqual(saved.email_draft_tasks,before.email_draft_tasks);assert.equal(saved.mailbox_delivery.policy_history[0].grant_id,config.mailbox.grant_id);
  const worker=createMailboxWorker(app,{credential,leaseSecret,context:gateway,origin:'https://gateway.example.invalid'});await assert.rejects(worker.context('old-claim',oldClaim.lease),/revoked|unsupported/);await mailboxWorkCommand(app,'cancel',{id:'old-claim',revision:saved.revision,reason:'Explicit review of expired historical claim'},'owner');saved=await store.snapshot();assert.deepEqual(saved.email_draft_tasks['old-claim'].lease,before.email_draft_tasks['old-claim'].lease);assert.equal(saved.email_draft_tasks['old-claim'].status,'Cancelled');assert.deepEqual(saved.email_draft_tasks.legacy,before.email_draft_tasks.legacy);
  const oldIntent=Object.values(before.mailbox_delivery.intents).find(i=>i.package.project_id==='two'),posts=f.sent.length;assert.equal((await dispatchMailboxDelivery(app,second.approval_id,{actor:'owner'})).id,oldIntent.id);assert.equal(f.sent.length,posts);
  if(status==='Lost POST'){f.token.grant_id=mailbox.grant_id;const transport=googleHostedTransport({getAccessToken:f.getAccessToken,fetcher:f.fetcher,account:mailbox.account,grantId:mailbox.grant_id,requiredProfile:mailboxProfile,rawResponseMax:38_000_000,now:f.now});assert.equal((await reconcileMailboxDelivery(app,oldIntent.id,{transport,actor:'owner'})).status,'Verified');assert.equal(f.sent.length,posts);assert.deepEqual((await store.snapshot()).mailbox_delivery.intents[oldIntent.id].mime,oldIntent.mime);}
 }
});

test('complete restore retains renewable charges and leases but revokes both active allowance pointers',async t=>{
 for(const claimed of [false,true]){const f=await fixture(t);await f.grant('mailbox-work','work-one');await f.command('mailbox-work','pause',{revision:await f.revision(),paused:false,reason:'Finite test'});await f.command('mailbox-work','create',{id:'restore-task',project_id:'one',revision:await f.revision(),replace_task_id:null,studio_asset_ids:[]});if(claimed)await f.worker().claim({request_id:'restore-request'});await f.grant('mailbox-delivery','send-one');const before=await f.store.snapshot(),backup=join(f.directory,'restore.json');await exportManualBackup(f.app,f.directory,backup);const destination=join(f.directory,'restored');await restoreLifecycleBackup(backup,destination);const restored=JSON.parse(await readFile(join(destination,'lifecycle-state.json'),'utf8'));assert.equal(restored.mailbox_work.paused,true);assert.equal(restored.mailbox_work.allowance_id,null);assert.equal(restored.mailbox_work.epoch,before.mailbox_work.epoch+1);assert.deepEqual(restored.mailbox_work.allowances,before.mailbox_work.allowances);assert.deepEqual(restored.email_draft_tasks['restore-task'].lease,before.email_draft_tasks['restore-task'].lease);assert.equal(restored.mailbox_delivery.allowance_id,null);assert.equal(restored.mailbox_delivery.paused,true);if(!claimed)assert.equal(restored.email_draft_tasks['restore-task'].status,'Superseded');}
});

test('unauthenticated production OAuth callback assets are static and private routes never open storage',async t=>{
 const f=await fixture(t);let opens=0,providers=0;const handler=createHostedDesk({env:f.env,now:f.now,storeFactory:()=>{opens++;throw Error('synthetic-storage-sentinel');},googleOAuthOptions:{fetcher:()=>{providers++;throw Error('must not call provider');}}});
 const request=(path,headers={})=>new Request(f.b.origin+'/desk'+path,{headers});
 for(const [path,headers,type]of [['/api/google-oauth/callback?code=fictional&state=fictional',{'sec-fetch-site':'cross-site','sec-fetch-mode':'navigate','sec-fetch-dest':'document'},'text/html'],['/google-oauth-callback.js',{'sec-fetch-site':'same-origin','sec-fetch-dest':'script'},'text/javascript']]){const response=await handler(request(path,headers),f.context);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),new RegExp(type));assert.doesNotMatch(await response.text(),/synthetic-storage-sentinel/);assert.equal(opens,0);assert.equal(providers,0);}
 for(const path of ['/api/state','/api/google-oauth/status','/api/project-context/one','/api/events/one','/api/project-original/one/asset/version'])assert.equal((await handler(request(path),f.context)).status,401);
 assert.equal((await handler(new Request(f.b.origin+'/desk/api/google-oauth/callback',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),f.context)).status,403);assert.equal(opens,0);assert.equal(providers,0);
});
