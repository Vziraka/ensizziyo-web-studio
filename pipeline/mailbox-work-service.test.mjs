import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';
import {writeLifecycleBackup} from './lifecycle-backup.mjs';
import {prepareManualWorkspace,installManualWorkspace} from './shared-manual-records.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {mailboxWorkCommand,createMailboxWorker} from './mailbox-work-service.mjs';
import {createMailboxWorkMcp} from './mailbox-work-mcp.mjs';
import {openMailboxWorker} from './mailbox-work-gateway.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {applyMailboxObservation,mailboxProfile} from './mailbox-intake.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';
import {originalDigest} from './shared-project-originals.mjs';

const at='2026-11-02T14:00:00.000Z',credential='ab'.repeat(32),leaseSecret='cd'.repeat(32),origin='https://gateway.example.invalid';
const context={site:{id:'gateway-site'},deploy:{id:'gateway-deploy',context:'deploy-preview'}};
async function fixture(t,clock=()=>new Date(at)){
 const directory=await mkdtemp(join(tmpdir(),'evz-mailbox-work-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const local=await StudioLifecycle.initialize({directory:join(directory,'local'),now:clock});await local.apply(fixtureProspect('project',at));
 const state=await local.snapshot();state.mode='production';state.run_id='synthetic-work';const r=state.prospects.project;delete r.controlled;r.stage='Reply review';r.follow_up_owner='owner';r.reply=fixtureReply('latest','thread',r.contact.email);
 const mailbox={schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'synthetic-grant',after:'2026-11-01T00:00:00.000Z'};
 state.mailbox_sync={policy_sha256:hash(mailbox),after:mailbox.after,phase:'history',cursor:'100',next_cursor:null,page:null,pages:[],pending:[],held_sources:{},checked_at:at,last_read_at:at,hold:null};
 const pdf=Buffer.from('%PDF-1.4\n'+('synthetic document material\n'.repeat(46000))+'%%EOF'),digest=originalDigest(pdf);await mkdir(join(local.directory,'project-originals'));await writeFile(join(local.directory,'project-originals',digest+'.pdf'),pdf);
 state.asset_index={asset:{id:'asset',name:'Synthetic original',scope:'project',project_id:'project',baseline_version:'v1',baseline_approval_event:'approve-asset',choices:{owner:'v1',friend:'v1'},versions:{v1:{id:'v1',label:'Approved original',reference:'private-path:original.pdf',verified_original:{reference:'private-path:original.pdf',sha256:digest,bytes:pdf.length,mime_type:'application/pdf',name:'original.pdf'},registered_by:'owner',registered_at:at}}}};
 state.events['approve-asset']={id:'approve-asset',actor:'owner',type:'asset_version_selected',prospect_id:'studio-assets',at,data:{asset_id:'asset',version_id:'v1'}};
 const backup=join(directory,'backup.json');await writeLifecycleBackup(local.directory,state,backup,at);
 const scope={schema_version:1,capability:'shared-mailbox-work-v1',workspace_id:'synthetic-workspace',run_id:state.run_id,mode:'production',state_schema:1,site_id:'desk-site',deploy_id:'desk-deploy',origin:'https://desk.example.invalid',namespace:'evz-manual-shared-worker-test'};
 const mailboxWork={schema_version:1,worker_id:'worker-one',gateway_site_id:context.site.id,gateway_deploy_id:context.deploy.id,gateway_origin:origin,recovery_generation:'generation-one',credential_sha256:hash(credential),max_tasks:20,max_claims_per_day:3,lease_minutes:20,expires_at:'2026-11-03T00:00:00.000Z'};
 const packet=await prepareManualWorkspace({backup,sourceConfig:{...structuredClone(initialConfig),mode:'production',run_id:state.run_id},scope,mailbox,mailboxWork});
 const objects=new Map();let version=0;const control={loseNext:false};
 const raw={async getWithMetadata(k,o){const e=objects.get(k);return e?{data:o.type==='json'?JSON.parse(e.bytes.toString()):Uint8Array.from(e.bytes).buffer,etag:e.etag}:null;},async set(k,bytes,o){const e=objects.get(k);if(o.onlyIfNew&&e||o.onlyIfMatch!==undefined&&o.onlyIfMatch!==e?.etag)return {modified:false};const etag=String(++version);objects.set(k,{bytes:Buffer.from(bytes),etag});if(k==='workspace'&&control.loseNext){control.loseNext=false;throw Error('lost acknowledgement');}return {modified:true,etag};},async setJSON(k,v,o){return this.set(k,Buffer.from(JSON.stringify(v)),o);}};
 const store=new ConditionalLifecycleStore(raw,{manualBinding:packet.binding,now:clock});await installManualWorkspace(store,packet,{commit:true});
 const app=()=>StudioLifecycle.fromStore({store,now:clock});
 const worker=async()=>createMailboxWorker(await app(),{credential,leaseSecret,context,origin});
 const create=async(actor='owner')=>mailboxWorkCommand(await app(),'create',{id:'task-one',project_id:'project',revision:(await store.snapshot()).revision,replace_task_id:null,studio_asset_ids:[]},actor);
 return {directory,packet,raw,store,app,worker,create,pdf,digest,control};
}
function result(context){return {body:'Thanks for your inquiry. Which customer process should we discuss first?',source_ids:context.source_ids,uncertainties:['Scope needs discussion.'],attachments:[{asset_id:'asset',version_id:'v1',sha256:context.attachment_catalogue.items[0].sha256}],execution:{provider:'synthetic Work',model:'fixture',duration_ms:100,input_tokens:null,output_tokens:null}};}

test('actual SDK worker claims, reconstructs exact PDF, saves proposal and signed adoption remains unapproved',async t=>{
 const f=await fixture(t);await assert.rejects(f.create('friend'),/Assigned/);await f.create();
 const fetcher=async(input,init)=>createMailboxWorkMcp({openWorker:async({credential:given,context:trusted,origin:host})=>createMailboxWorker(await f.app(),{credential:given,leaseSecret,context:trusted,origin:host})})(new Request(input,init),context);
 const client=new Client({name:'synthetic-worker',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/desk-work/mcp'),{fetch:fetcher,requestInit:{headers:{authorization:'Bearer '+credential}}}));t.after(()=>client.close());
 const tools=(await client.listTools()).tools;assert.equal(tools.length,6);assert.ok(tools.every(x=>!/(send|approve|create_task)/.test(x.name)));
 const call=async(name,args)=>{const response=await client.callTool({name,arguments:args});assert.notEqual(response.isError,true,JSON.stringify(response));return response.structuredContent;};
 f.control.loseNext=true;const claim=await call('evz_claim_prepared_task',{request_id:'request-one'}),again=await call('evz_claim_prepared_task',{request_id:'request-one'});assert.equal(claim.lease,again.lease);assert.equal(claim.task.lease.fence,again.task.lease.fence);
 const args={task_id:'task-one',lease:claim.lease},packet=await call('evz_read_work_context',args),pieces=[];assert.equal(packet.attachment_catalogue.items.length,1);let offset=0;
 do{const segment=await call('evz_read_work_pdf_segment',{...args,asset_id:'asset',version_id:'v1',sha256:f.digest,offset});const bytes=Buffer.from(segment.data,'base64');assert.equal(originalDigest(bytes),segment.segment_sha256);assert.ok(bytes.length<=262144);pieces.push(bytes);offset=segment.next_offset;}while(offset!==null);
 assert.deepEqual(Buffer.concat(pieces),f.pdf);
 const proposal=result(packet);await call('evz_submit_work_proposal',{...args,context_sha256:packet.task.context_sha256,result:proposal});assert.equal((await call('evz_read_work_receipt',args)).status,'Review');
 const before=await f.store.snapshot();assert.equal(before.prospects.project.reply_draft,undefined);
 await assert.rejects(mailboxWorkCommand(await f.app(),'adopt',{id:'task-one',revision:before.revision,result_sha256:hash(proposal)},'friend'),/Assigned/);
 await mailboxWorkCommand(await f.app(),'adopt',{id:'task-one',revision:before.revision,result_sha256:hash(proposal)},'owner');
 const saved=await f.store.snapshot(),draft=saved.prospects.project.reply_draft;assert.equal(draft.status,'Draft');assert.equal(saved.email_draft_tasks['task-one'].status,'Adopted');assert.equal(draft.content.attachments[0].sha256,f.digest);assert.equal(draft.content.agent_origin.task_id,'task-one');assert.deepEqual(saved.actions,before.actions);
 assert.equal((await (await f.app()).dashboard()).prospects.project.reply_draft.current,true);
 assert.equal((await mailboxWorkCommand(await f.app(),'adopt',{id:'task-one',revision:before.revision,result_sha256:hash(proposal)},'owner')).duplicate,true);
 assert.doesNotMatch(JSON.stringify((await (await f.app()).dashboard()).email_draft_tasks),new RegExp(claim.lease+'|secret_sha256'));
});

test('gateway authentication rejects before source access and exact source/deployment fences remain enforced',async t=>{
 const f=await fixture(t);let reads=0;const env={EVZ_MAILBOX_WORK_GATEWAY:'scoped-reply-worker-v1',EVZ_MAILBOX_WORK_CREDENTIAL_SHA256:hash(credential),EVZ_MAILBOX_WORK_SOURCE_BINDING:JSON.stringify(f.packet.binding),EVZ_MAILBOX_WORK_SOURCE_BLOBS_TOKEN:'synthetic-source-storage-credential',EVZ_MAILBOX_WORK_LEASE_SECRET:leaseSecret};
 const open=(overrides={})=>openMailboxWorker({env,credential,context,origin,now:()=>new Date(at),storeFactory:async scope=>{reads++;assert.equal(scope.site_id,'desk-site');return f.raw;},...overrides});
 await assert.rejects(open({credential:'ef'.repeat(32)}),/credential/);assert.equal(reads,0);
 await assert.rejects(open({context:{...context,site:{id:'wrong'}}}),/deployment/);
 await assert.rejects(open({origin:'https://wrong.example.invalid'}),/deployment/);
 await (await open()).authenticate();
 const handler=createMailboxWorkMcp({openWorker:()=>{throw Error('must not open');}});
 assert.equal((await handler(new Request(origin+'/desk-work/mcp'),context)).status,401);
 assert.equal((await handler(new Request(origin+'/desk-work/mcp?token=x'),context)).status,404);
});

test('signed desk creates and adopts proposals while worker credentials cannot approve or send',async t=>{
 const f=await fixture(t),s=f.packet.binding.scope,env={CONTEXT:'deploy-preview',SITE_ID:s.site_id,DEPLOY_ID:s.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:s.capability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:s.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:s.namespace,EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
 const handler=()=>createHostedDesk({env,storeFactory:()=>f.raw,now:()=>new Date(at)}),request=(path,options)=>new Request(s.origin+'/desk'+path,options),cookie=r=>r.headers.get('set-cookie')?.split(';')[0];
 async function signed(role){const boot=await handler()(request('/api/bootstrap')),csrf=(await boot.json()).csrf,initial=cookie(boot),login=await handler()(request('/api/login',{method:'POST',headers:{cookie:initial,origin:s.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}));assert.equal(login.status,200);return (path,input,extra={},method='POST')=>handler()(request(path,{method,headers:{cookie:initial+'; '+cookie(login),origin:s.origin,'content-type':'application/json','x-studio-token':csrf,...extra},...(method==='POST'?{body:JSON.stringify(input)}:{})}));}
 const owner=await signed('owner'),friend=await signed('friend'),input={id:'task-one',project_id:'project',revision:(await f.store.snapshot()).revision,replace_task_id:null,studio_asset_ids:[]};
 assert.equal((await friend('/api/mailbox-work/create',input)).status,400);
 assert.equal((await owner('/api/mailbox-work/create',input,{'x-studio-token':'wrong'})).status,403);
 assert.equal((await owner('/api/mailbox-work/create',input)).status,200);
 assert.equal((await owner('/api/mailbox-work/result',{})).status,409);
 assert.equal((await handler()(request('/api/mailbox-work/create',{method:'POST',headers:{authorization:'Bearer '+credential,'content-type':'application/json'},body:JSON.stringify(input)}))).status,403);
 const worker=await f.worker(),claim=await worker.claim({request_id:'http-claim'}),packet=await worker.context('task-one',claim.lease),proposal=result(packet);await worker.submit({id:'task-one',lease:claim.lease,context_sha256:packet.task.context_sha256,result:proposal});
 const adopt={id:'task-one',revision:(await f.store.snapshot()).revision,result_sha256:hash(proposal)};assert.equal((await friend('/api/mailbox-work/adopt',adopt)).status,400);const accepted=await owner('/api/mailbox-work/adopt',adopt);assert.equal(accepted.status,200,JSON.stringify(await accepted.json()));
 const saved=await f.store.snapshot();assert.equal(saved.prospects.project.reply_draft.status,'Draft');
 const pdf=await owner('/api/project-asset/project/asset/v1?preview=1',undefined,{},'GET');assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),f.pdf);
 const approved=await owner('/api/event',{revision:saved.revision,event:{id:'approve-exact',type:'reply_draft_approved',prospect_id:'project',at,data:{sha256:saved.prospects.project.reply_draft.sha256,approved:true,facts_checked:true}}});assert.equal(approved.status,200,JSON.stringify(await approved.json()));
 assert.equal((await f.store.snapshot()).prospects.project.reply_draft.status,'Approved; sending held');assert.equal((await owner('/api/operations-exact-mail/send',{})).status,409);
});

test('original transport rejects corrupt bytes and a cancellation during a segment read',async t=>{
 const f=await fixture(t);await f.create();const worker=await f.worker(),claim=await worker.claim({request_id:'pdf-race'});
 const input={id:'task-one',lease:claim.lease,asset_id:'asset',version_id:'v1',sha256:f.digest,offset:0},read=f.raw.getWithMetadata.bind(f.raw);
 f.raw.getWithMetadata=async(k,o)=>{const saved=await read(k,o);if(k.startsWith('project-originals/')&&!k.endsWith('/manifest'))return {...saved,data:Buffer.alloc(saved.data.byteLength).buffer};return saved;};
 await assert.rejects(worker.pdf(input),/integrity/);
 let cancelled=false;f.raw.getWithMetadata=async(k,o)=>{const saved=await read(k,o);if(!cancelled&&k.startsWith('project-originals/')&&!k.endsWith('/manifest')){cancelled=true;await mailboxWorkCommand(await f.app(),'cancel',{id:'task-one',revision:(await f.store.snapshot()).revision,reason:'Operator withdrew this task'},'owner');}return saved;};
 await assert.rejects(worker.pdf(input));assert.equal(cancelled,true);assert.equal((await f.store.snapshot()).email_draft_tasks['task-one'].status,'Cancelled');
});


test('slow canonical reads cannot commit worker mutations after the live lease expires',async t=>{
 let time=at;const f=await fixture(t,()=>new Date(time));await f.create();const w=await f.worker(),claim=await w.claim({request_id:'slow-result'}),packet=await w.context('task-one',claim.lease);
 time='2026-11-02T14:19:59.000Z';const read=f.raw.getWithMetadata.bind(f.raw);let reads=0;
 f.raw.getWithMetadata=async(k,o)=>{const entry=await read(k,o);if(k==='workspace'&&++reads===2)time='2026-11-02T14:20:01.000Z';return entry;};
 await assert.rejects(w.submit({id:'task-one',lease:claim.lease,context_sha256:packet.task.context_sha256,result:result(packet)}),/expired before CAS/);
 assert.equal((await f.store.snapshot()).email_draft_tasks['task-one'].status,'Claimed');
});

test('new unclassified mail invalidates an adopted reply and prevents exact approval',async t=>{
 let time=at;const f=await fixture(t,()=>new Date(time));await f.create();const w=await f.worker(),claim=await w.claim({request_id:'incoming-race'}),packet=await w.context('task-one',claim.lease),proposal=result(packet);
 await w.submit({id:'task-one',lease:claim.lease,context_sha256:packet.task.context_sha256,result:proposal});await mailboxWorkCommand(await f.app(),'adopt',{id:'task-one',revision:(await f.store.snapshot()).revision,result_sha256:hash(proposal)},'owner');
 assert.equal((await (await f.app()).dashboard()).prospects.project.reply_draft.current,true);
 time='2026-11-02T14:01:00.000Z';
 async function observe(operation,input,value){const app=await f.app(),state=await app.snapshot(),c=await app.loadConfig(),grant={profile:mailboxProfile,account:c.mailbox.account,grant_id:c.mailbox.grant_id,scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse(time)+3600000},observation={operation,input,value,grant,at:time,before_sha256:hash(state.mailbox_sync),policy_sha256:hash(c.mailbox)};await app.change((s,config)=>applyMailboxObservation(s,config,observation),{mailboxObservation:observation});}
 await observe('history',{cursor:'100',page:null},{historyId:'110',history:[{id:'110',messagesAdded:[{message:{id:'new-message',threadId:'thread'}}]}]});
 await observe('message',{id:'new-message',threadId:'thread'},{id:'new-message',threadId:'thread',internalDate:String(Date.parse(time)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:'project@example.invalid'},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Changed request'},{name:'Message-ID',value:'<new-message@example.invalid>'}],body:{data:Buffer.from('Please consider this newer request.').toString('base64url')}}});
 const app=await f.app(),state=await app.snapshot();assert.equal(state.prospects.project.reply.source_id,'latest');assert.equal(state.inquiry_intake.sources['new-message'].status,'Identity review');assert.equal((await app.dashboard()).prospects.project.reply_draft.current,false);
 await assert.rejects(app.apply({id:'stale-approval',type:'reply_draft_approved',prospect_id:'project',at:time,data:{sha256:state.prospects.project.reply_draft.sha256,approved:true,facts_checked:true}},{actor:'owner',expectedRevision:state.revision,manualRecording:true}),/exact current reply/);
 assert.equal((await f.store.snapshot()).prospects.project.reply_draft.status,'Draft');
});

