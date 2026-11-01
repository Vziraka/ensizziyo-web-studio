import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';
import {writeLifecycleBackup} from './lifecycle-backup.mjs';
import {prepareManualWorkspace,installManualWorkspace} from './shared-manual-records.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {mailboxDeliveryCapability} from './mailbox-delivery.mjs';
import {mailboxDeliveryCommand,dispatchMailboxDelivery,reconcileMailboxDelivery} from './mailbox-delivery-service.mjs';
import {mailboxWorkCommand,createMailboxWorker} from './mailbox-work-service.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {googleHostedTransport,gmailScopes} from './google-hosted-transport.mjs';
import {applyMailboxObservation,mailboxProfile} from './mailbox-intake.mjs';
import {originalDigest} from './shared-project-originals.mjs';

const at='2026-11-02T14:00:00.000Z',expiry='2026-11-03T00:00:00.000Z';
async function fixture(t,{pdf=false,capability=mailboxDeliveryCapability}={}){
 const directory=await mkdtemp(join(tmpdir(),'evz-delivery-service-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let time=Date.parse(at);const now=()=>new Date(time),control={lostWrite:null,onToken:null,onFetch:null,sendLoss:false,readbackLoss:false,tamper:false},objects=new Map();let version=0;
 const local=await StudioLifecycle.initialize({directory:join(directory,'local'),now});await local.apply(fixtureProspect('project',at));
 const state=await local.snapshot();state.mode='production';state.run_id='delivery-service';const r=state.prospects.project;delete r.controlled;r.stage='Reply review';r.follow_up_owner='owner';r.reply={...fixtureReply('latest','thread',r.contact.email),at};
 const c=r.reply.content,h=(name,value)=>({name,value});
 const incoming={id:'latest',threadId:'thread',internalDate:String(time),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[h('From',c.from),h('To',c.to),h('Subject',c.subject),h('Message-ID',c.message_header_id),h('In-Reply-To',c.in_reply_to)],body:{content:c.text}}};
 const mailbox={schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'delivery-grant',after:'2026-11-01T00:00:00.000Z'};
 state.mailbox_sync={policy_sha256:hash(mailbox),after:mailbox.after,phase:'history',cursor:'100',next_cursor:null,page:null,pages:[],pending:[],held_sources:{},checked_at:at,last_read_at:at,hold:null};
 const bytes=Buffer.from('%PDF-1.4\n'+'Independent large PDF test material.\n'.repeat(35000)+'%%EOF'),digest=originalDigest(bytes);
 if(pdf){await mkdir(join(local.directory,'project-originals'));await writeFile(join(local.directory,'project-originals',digest+'.pdf'),bytes);state.asset_index={asset:{id:'asset',name:'Synthetic approved PDF',scope:'project',project_id:'project',baseline_version:'v1',baseline_approval_event:'asset-approved',choices:{owner:'v1',friend:'v1'},versions:{v1:{id:'v1',label:'Original',reference:'private-path:test.pdf',verified_original:{reference:'private-path:test.pdf',sha256:digest,bytes:bytes.length,mime_type:'application/pdf',name:'test.pdf'},registered_by:'owner',registered_at:at}}}};state.events['asset-approved']={id:'asset-approved',type:'asset_version_selected',prospect_id:'studio-assets',actor:'owner',at,data:{asset_id:'asset',version_id:'v1'}};}
 const backup=join(directory,'backup.json');await writeLifecycleBackup(local.directory,state,backup,at);
 const scope={schema_version:1,capability,workspace_id:'delivery-workspace',run_id:state.run_id,mode:'production',state_schema:1,site_id:'delivery-site',deploy_id:'delivery-deploy',origin:'https://delivery.example.invalid',namespace:'evz-manual-shared-delivery-test'};
 const mailboxWork={schema_version:1,worker_id:'worker',gateway_site_id:'gateway',gateway_deploy_id:'gateway-deploy',gateway_origin:'https://gateway.example.invalid',recovery_generation:'work-one',credential_sha256:hash('ab'.repeat(32)),max_tasks:5,max_claims_per_day:5,lease_minutes:20,expires_at:expiry};
 const mailboxClock={schema_version:1,site_id:scope.site_id,deploy_id:scope.deploy_id,origin:scope.origin,recovery_generation:'clock-one',interval_minutes:5,max_steps_per_tick:3,max_steps_per_day:6,deadline_ms:25000,expires_at:expiry};
 const mailboxDelivery={schema_version:1,site_id:scope.site_id,deploy_id:scope.deploy_id,origin:scope.origin,account:mailbox.account,grant_id:mailbox.grant_id,from:'hello@evzdigital.studio',recovery_generation:'delivery-one',expires_at:expiry,max_intents:10,max_per_day:10,kinds:['reply','outreach'],sender_ready:true,postal_address_verified:false};
 const sourceConfig={...structuredClone(initialConfig),mode:'production',run_id:state.run_id};sourceConfig.sender.email='hello@evzdigital.studio';sourceConfig.sender.postal_address='';
 const packet=await prepareManualWorkspace({backup,sourceConfig,scope,mailbox,mailboxWork,...(capability===mailboxDeliveryCapability?{mailboxClock,mailboxDelivery}:{})});
 const raw={async getWithMetadata(k,o){const e=objects.get(k);return e?{data:o.type==='json'?JSON.parse(e.bytes.toString()):Uint8Array.from(e.bytes).buffer,etag:e.etag}:null;},async set(k,b,o){const old=objects.get(k);if(o.onlyIfNew&&old||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==old?.etag)return {modified:false};const e={bytes:Buffer.from(b),etag:String(++version)};objects.set(k,e);if(k==='workspace'&&control.lostWrite?.(JSON.parse(e.bytes))){control.lostWrite=null;throw Error('Committed write acknowledgement lost');}return {modified:true,etag:e.etag};},async setJSON(k,v,o){return this.set(k,Buffer.from(JSON.stringify(v)),o);}};
 const store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now});await installManualWorkspace(store,packet,{commit:true});const app=()=>StudioLifecycle.fromStore({store,now});
 const token={profile:mailboxProfile,account:mailbox.account,grant_id:mailbox.grant_id,access_token:'synthetic-access-token',scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse(expiry)};
 const getAccessToken=Object.assign(async()=>{if(control.onToken)await control.onToken();return token;},{assertCurrent:async()=>{},assertGrant:async()=>token});
 const sent=[],paths=[];
 const fetcher=async(url,o)=>{const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);assert.equal(u.origin,'https://gmail.googleapis.com');paths.push({path,method:o.method});if(control.onFetch)await control.onFetch(path,o);
  if(path==='profile')return Response.json({emailAddress:mailbox.account});
  if(path==='settings/sendAs')return Response.json({sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]});
  if(path==='threads/thread')return Response.json({id:'thread',messages:[incoming]});
  if(path==='messages/send'){const body=JSON.parse(o.body),m={id:'sent-'+(sent.length+1),threadId:body.threadId??'new-thread',labelIds:['SENT'],raw:body.raw,internalDate:String(+now())};sent.push(m);if(control.sendLoss)throw Error('Send committed but response lost');return Response.json({id:m.id,threadId:m.threadId});}
  if(path==='messages'){assert.match(u.searchParams.get('q'),/^in:sent rfc822msgid:/);return Response.json({messages:sent.map(m=>({id:m.id}))});}
  if(path.startsWith('messages/sent-')){if(control.readbackLoss)throw Error('Readback unavailable');const m=sent.find(m=>'messages/'+m.id===path);assert.ok(m);return Response.json(control.tamper?{...m,raw:Buffer.from(Buffer.from(m.raw,'base64url').toString().replace('To: '+r.contact.email,'To: stranger@example.invalid')).toString('base64url')}:m);}
  assert.fail('Unexpected provider request '+path);
 };
 const transport=()=>googleHostedTransport({getAccessToken,fetcher,account:mailbox.account,grantId:mailbox.grant_id,requiredProfile:mailboxProfile,rawResponseMax:38_000_000,now});
 const env={CONTEXT:capability===mailboxDeliveryCapability?'production':'deploy-preview',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:capability,EVZ_MAILBOX_DELIVERY_RUNTIME:mailboxDeliveryCapability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(packet.binding),EVZ_OPERATIONS_ORIGIN:scope.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
 const handler=()=>{const handle=createHostedDesk({env,storeFactory:()=>raw,now,googleIncomingOptions:{getAccessToken,fetcher}});return request=>handle(request,{site:{id:scope.site_id},deploy:{id:scope.deploy_id,context:env.CONTEXT,published:true}})},request=(path,o)=>new Request(scope.origin+'/desk'+path,o),cookie=res=>res.headers.get('set-cookie')?.split(';')[0];
 async function signed(role){const boot=await handler()(request('/api/bootstrap')),csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler()(request('/api/login',{method:'POST',headers:{cookie:initial,origin:scope.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}));assert.equal(login.status,200);return (path,input,extra={})=>handler()(request(path,{method:'POST',headers:{cookie:initial+'; '+cookie(login),origin:scope.origin,'content-type':'application/json','x-studio-token':csrf,...extra},body:JSON.stringify(input)}));}
 const owner=await signed('owner'),friend=await signed('friend');
 async function okay(response){const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;}
 async function event(type,data,id=type){return okay(await owner('/api/event',{revision:(await store.snapshot()).revision,event:{id,type,prospect_id:'project',at:now().toISOString(),data}}));}
 async function draft(){if(!pdf){const reply=(await store.snapshot()).prospects.project.reply;await event('reply_draft_saved',{source_id:reply.source_id,reply_sha256:hash(reply),source_sha256:reply.content.source_sha256,body:'Thanks for asking. Which examples would help?'});return;}
  await mailboxWorkCommand(await app(),'create',{id:'task',project_id:'project',revision:(await store.snapshot()).revision,replace_task_id:null,studio_asset_ids:[]},'owner');const worker=createMailboxWorker(await app(),{credential:'ab'.repeat(32),leaseSecret:'cd'.repeat(32),context:{site:{id:'gateway'},deploy:{id:'gateway-deploy',context:'deploy-preview'}},origin:'https://gateway.example.invalid'}),claim=await worker.claim({request_id:'request'}),context=await worker.context('task',claim.lease),result={body:'Thanks for asking. The reviewed document is attached.',source_ids:context.source_ids,uncertainties:[],attachments:[{asset_id:'asset',version_id:'v1',sha256:digest}],execution:{provider:'fixture',model:'fixture',duration_ms:1,input_tokens:null,output_tokens:null}};await worker.submit({id:'task',lease:claim.lease,context_sha256:context.task.context_sha256,result});await mailboxWorkCommand(await app(),'adopt',{id:'task',revision:(await store.snapshot()).revision,result_sha256:hash(result)},'owner');}
 async function contentApproval(){await event('reply_draft_approved',{sha256:(await store.snapshot()).prospects.project.reply_draft.sha256,approved:true,facts_checked:true});}
 async function command(type,input){return okay(await owner('/api/mailbox-delivery/'+type,input));}
 async function ready(){await draft();await contentApproval();await command('allowance',{revision:(await store.snapshot()).revision,allowance:{id:'included',evidence_ref:'fictional included allowance observation',observed_at:at,expires_at:expiry,included_only:true,max_intents:5}});await command('pause',{revision:(await store.snapshot()).revision,paused:false,reason:'Finite fictional test'});const p=await command('package',{kind:'reply',project_id:'project'});return command('approve',{revision:(await store.snapshot()).revision,kind:'reply',project_id:'project',package_sha256:p.sha256});}
 return {store,app,raw,objects,packet,control,now,advance:ms=>time+=ms,transport,sent,paths,owner,friend,okay,event,draft,contentApproval,command,ready,pdf:bytes,digest,incoming};
}

test('signed delivery requires separate content/send approvals and exact sender Sent readback',async t=>{
 const f=await fixture(t);await f.draft();assert.equal((await f.owner('/api/mailbox-delivery/package',{kind:'reply',project_id:'project'})).status,400);await f.contentApproval();assert.equal(f.sent.length,0);
 assert.equal((await f.friend('/api/mailbox-delivery/package',{kind:'reply',project_id:'project'})).status,400);
 assert.equal((await f.owner('/api/mailbox-delivery/package',{kind:'reply',project_id:'project'},{'x-studio-token':'wrong'})).status,403);
 await f.command('allowance',{revision:(await f.store.snapshot()).revision,allowance:{id:'included',evidence_ref:'fictional evidence',observed_at:at,expires_at:expiry,included_only:true,max_intents:2}});await f.command('pause',{revision:(await f.store.snapshot()).revision,paused:false,reason:'Finite test'});
 const p=await f.command('package',{kind:'reply',project_id:'project'}),a=await f.command('approve',{revision:(await f.store.snapshot()).revision,kind:'reply',project_id:'project',package_sha256:p.sha256});assert.equal(f.sent.length,0);
 assert.equal((await f.friend('/api/mailbox-delivery/dispatch',{approval_id:a.approval_id})).status,400);
 const delivered=await f.okay(await f.owner('/api/mailbox-delivery/dispatch',{approval_id:a.approval_id}));assert.equal(delivered.status,'Verified');assert.equal(f.sent.length,1);assert.equal(delivered.receipt.sent_at,at);assert.equal(delivered.receipt.message_id,'sent-1');
 const raw=Buffer.from(f.sent[0].raw,'base64url').toString();assert.match(raw,/From: hello@evzdigital\.studio/);assert.ok(f.paths.some(p=>p.path==='messages/sent-1'));
 const repeated=await f.okay(await f.owner('/api/mailbox-delivery/dispatch',{approval_id:a.approval_id}));assert.equal(repeated.status,'Verified');assert.equal(f.sent.length,1);
});

test('concurrent canonical dispatches make at most one provider POST and charge one intent',async t=>{
 const f=await fixture(t),a=await f.ready();const outcomes=await Promise.allSettled([1,2].map(async()=>dispatchMailboxDelivery(await f.app(),a.approval_id,{transport:f.transport(),actor:'owner'})));
 assert.equal(f.sent.length,1,JSON.stringify(outcomes));const s=await f.store.snapshot();assert.equal(Object.keys(s.mailbox_delivery.intents).length,1);assert.equal(s.mailbox_delivery.allowances.included.used_intents,1);
});

test('lost reservation, claim, acknowledgement and verification writes reconcile without resending',async t=>{
 for(const stage of ['reserve','claim','ack','verify']){const f=await fixture(t),a=await f.ready();f.control.lostWrite=s=>{const i=Object.values(s.state.mailbox_delivery?.intents??{})[0];return stage==='reserve'?i?.status==='Reserved':stage==='claim'?i?.claimed_at&&!i.provider_message_id:stage==='ack'?i?.provider_message_id&&i.status!=='Verified':i?.status==='Verified';};const result=await dispatchMailboxDelivery(await f.app(),a.approval_id,{transport:f.transport(),actor:'owner'});assert.equal(f.control.lostWrite,null,stage+' injection must fire');assert.equal(result.status,'Verified',stage);assert.equal(f.sent.length,1,stage);assert.equal((await f.store.snapshot()).mailbox_delivery.allowances.included.used_intents,1);}
});

test('lost send response and unavailable readback retain original intent for read-only recovery',async t=>{
 for(const failure of ['sendLoss','readbackLoss']){const f=await fixture(t),a=await f.ready();f.control[failure]=true;const result=await dispatchMailboxDelivery(await f.app(),a.approval_id,{transport:f.transport(),actor:'owner'});assert.equal(result.status,'Uncertain');assert.equal(f.sent.length,1);await dispatchMailboxDelivery(await f.app(),a.approval_id,{transport:f.transport(),actor:'owner'});assert.equal(f.sent.length,1);f.control[failure]=false;const receipt=await reconcileMailboxDelivery(await f.app(),result.id,{transport:f.transport(),actor:'owner'});assert.equal(receipt.status,'Verified');assert.equal(f.sent.length,1);}
});

test('pause, newer reply and expiry during preflight or after permanent claim prevent POST',async t=>{
 for(const phase of ['preflight','claimed'])for(const reason of ['pause','reply','deadline']){const f=await fixture(t),a=await f.ready();let changed=false;f.control.onToken=async()=>{if(changed||phase==='claimed'&&!Object.values((await f.store.snapshot()).mailbox_delivery.intents).some(i=>i.claimed_at))return;changed=true;if(reason==='deadline'){f.advance(26000);return;}if(reason==='pause'){await mailboxDeliveryCommand(await f.app(),'pause',{revision:(await f.store.snapshot()).revision,paused:true,reason:'Pause during credentials'},'friend');return;}async function observe(operation,input,value){const app=await f.app(),state=await app.snapshot(),config=await app.loadConfig(),grant={profile:mailboxProfile,account:config.mailbox.account,grant_id:config.mailbox.grant_id,scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse(expiry)},observation={operation,input,value,grant,at,before_sha256:hash(state.mailbox_sync),policy_sha256:hash(config.mailbox)};await app.change((s,c)=>applyMailboxObservation(s,c,observation),{mailboxObservation:observation});}
 await observe('history',{cursor:'100',page:null},{historyId:'110',history:[{id:'110',messagesAdded:[{message:{id:'newer',threadId:'thread'}}]}]});await observe('message',{id:'newer',threadId:'thread'},{...f.incoming,id:'newer',payload:{...f.incoming.payload,headers:f.incoming.payload.headers.map(h=>h.name==='Message-ID'?{...h,value:'<newer@example.invalid>'}:h)}});assert.ok((await f.store.snapshot()).inquiry_intake.sources.newer);
};const attempt=dispatchMailboxDelivery(await f.app(),a.approval_id,{transport:f.transport(),actor:'owner'});if(phase==='preflight')await assert.rejects(attempt);else assert.equal((await attempt).status,'Uncertain');assert.equal(changed,true,phase+' '+reason);if(reason==='reply')assert.ok((await f.store.snapshot()).inquiry_intake.sources.newer);assert.equal(f.sent.length,0,reason);}
});

test('large PDF uses complete original bytes and tampered original or Sent recipient cannot verify',async t=>{
 const f=await fixture(t,{pdf:true}),a=await f.ready();assert.ok(f.pdf.length>1_000_000);const sent=await dispatchMailboxDelivery(await f.app(),a.approval_id,{transport:f.transport(),actor:'owner'});assert.equal(sent.status,'Verified');const mime=Buffer.from(f.sent[0].raw,'base64url').toString();assert.ok(mime.replaceAll('\r\n','').includes(f.pdf.toString('base64')));
 const corrupt=await fixture(t,{pdf:true}),approval=await corrupt.ready(),chunk=[...corrupt.objects.keys()].find(k=>k.startsWith('project-originals/'+corrupt.digest+'/0-'));assert.ok(chunk);corrupt.objects.get(chunk).bytes[30]^=1;await assert.rejects(dispatchMailboxDelivery(await corrupt.app(),approval.approval_id,{transport:corrupt.transport(),actor:'owner'}));assert.equal(corrupt.sent.length,0);
 const wrong=await fixture(t),approved=await wrong.ready();wrong.control.tamper=true;const uncertain=await dispatchMailboxDelivery(await wrong.app(),approved.approval_id,{transport:wrong.transport(),actor:'owner'});assert.equal(uncertain.status,'Uncertain');assert.notEqual(Object.values((await wrong.store.snapshot()).mailbox_delivery.intents)[0].status,'Verified');assert.equal(wrong.sent.length,1);
});

test('old profile denies delivery routes and absent mailing address denies commercial package',async t=>{
 const old=await fixture(t,{capability:'shared-mailbox-work-v1'});assert.equal((await old.owner('/api/mailbox-delivery/package',{kind:'reply',project_id:'project'})).status,409);assert.equal(old.paths.length,0);
 const f=await fixture(t);await assert.rejects(mailboxDeliveryCommand(await f.app(),'package',{kind:'outreach',project_id:'project'},'owner'),/mailing address/);assert.equal(f.sent.length,0);
});
