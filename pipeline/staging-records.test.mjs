import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,hash} from './lifecycle.mjs';
import {fixtureReply,fixtureQuote} from './lifecycle-fixtures.mjs';
import {buildBasis} from './local-delivery-gates.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {createStagingBoundary} from './staging-boundary.mjs';
import {StagingRecordStore,stagingRecordApp} from './staging-records.mjs';
const at='2026-10-28T15:00:00.000Z',now=()=>new Date(at);
const inquiry=id=>({id,prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:'STUDIO TEST '+id,classification:'inquiry',reply:fixtureReply('source-'+id,'thread-'+id,id+'@example.invalid','Website inquiry')}});
async function fixture(http=false){
 let data,version=0;const raw={lose:false,beforeRead:null,async getWithMetadata(){await this.beforeRead?.();return data?{data:structuredClone(data),etag:String(version)}:null;},async setJSON(key,next,options){if(options.onlyIfNew&&data||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(version))return {modified:false};data=structuredClone(next);version++;if(this.lose){this.lose=false;throw Error('Lost ack');}return {modified:true,etag:String(version)};}};
 const config={...structuredClone(initialConfig),staging_recording:'fictional-records-v1'};
 const store=new StagingRecordStore(raw,{now});await store.initialize(config,{schema_version:1,run_id:config.run_id,mode:'controlled',revision:0,updated_at:at,prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]});
 const app=await stagingRecordApp(raw,now);
 if(http){
  const binding={site_id:'d7840f1d-c0e6-4f87-a41f-e34f53c81625',deploy_id:'httpjourney',origin:'https://httpjourney--evz-hybrid-fictional-20261027.netlify.app',namespace:'evz-redesign-proof-staging-1234567890abcdef',recording:true};
  const env={EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
  const ctx={site:{id:binding.site_id},deploy:{id:binding.deploy_id,context:'deploy-preview'}};
  const handle=createStagingBoundary({env,binding,handlerFactory:projected=>createHostedDesk({env:projected,storeFactory:()=>raw,now})});
  const call=(path,options={})=>handle(new Request(binding.origin+'/desk'+path,options),ctx),sessions={};
  for(const actor of ['owner','friend']){
   const boot=await call('/api/bootstrap'),csrf=(await boot.json()).csrf,headers={cookie:boot.headers.get('set-cookie').split(';')[0],origin:binding.origin,'content-type':'application/json','x-studio-token':csrf};
   const login=await call('/api/login',{method:'POST',headers,body:JSON.stringify({key:env['EVZ_OPERATIONS_'+actor.toUpperCase()+'_KEY']})});assert.equal(login.status,200);headers.cookie+='; '+login.headers.get('set-cookie').split(';')[0];sessions[actor]=headers;
  }
  app.apply=async(event,{actor,expectedRevision})=>{const r=await call('/api/event',{method:'POST',headers:sessions[actor],body:JSON.stringify({event,revision:expectedRevision})}),body=await r.json();if(r.status!==200)throw Error(body.error);return body;};
 }
 return {raw,store,app};
}
test('shared fictional inquiry uses CAS, exact replay, two-role rotation and restart readback',async()=>{
 const {raw,store,app}=await fixture(),other=await stagingRecordApp(raw,now);
 const results=await Promise.allSettled([app.apply(inquiry('pine'),{actor:'owner',expectedRevision:0}),other.apply(inquiry('elm'),{actor:'friend',expectedRevision:0})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const winner=results[0].status==='fulfilled'?'pine':'elm',loser=winner==='pine'?'elm':'pine',winActor=winner==='pine'?'owner':'friend';
 const first=await store.snapshot();assert.equal(Object.keys(first.inquiry_intake.sources).length,1);
 raw.lose=true;await other.apply(inquiry(loser),{actor:winActor==='owner'?'friend':'owner',expectedRevision:first.revision});
 const fresh=await stagingRecordApp(raw,now),state=await fresh.snapshot();
 assert.equal(Object.keys(state.prospects).length,2);assert.equal(state.inquiry_intake.next_owner,'owner');
 assert.equal((await fresh.apply(inquiry(winner),{actor:winActor,expectedRevision:0})).duplicate,true);
 const changed=inquiry(winner);changed.data.company_name='STUDIO TEST Changed';await assert.rejects(fresh.apply(changed,{actor:winActor,expectedRevision:state.revision}));
 assert.deepEqual(await fresh.snapshot(),state);
});
test('shared staging rejects missing revision, forged role and untyped or widened writes atomically',async()=>{
 const {store,app}=await fixture(),before=await store.snapshot(),event=inquiry('pine');
 await assert.rejects(app.apply(event));await assert.rejects(app.apply(event,{actor:'controlled-fixture',expectedRevision:0}));
 await assert.rejects(store.change(s=>{s.revision++;}));
 await assert.rejects(store.change((state,config)=>{config.outreach_enabled=true;state.revision++;},{stagingRecord:{event,actor:'owner',revision:0}}));
 await assert.rejects(app.apply({...event,type:'email_delivered'},{actor:'owner',expectedRevision:0}));
 assert.deepEqual(await store.snapshot(),before);
});
test('both roles complete exact fictional intake, invoice, build, approval and simulated publication in shared storage',async()=>{
 for(const [actor,http] of [['owner',false],['friend',false],['owner',true],['friend',true]]){
  const {app,raw}=await fixture(http);let n=0;
  const intake=await app.apply(inquiry('journey'),{actor,expectedRevision:0}),id=intake.receipt.project_id;
  const record=async()=>(await app.snapshot()).prospects[id];
  const send=async(type,data)=>app.apply({id:'journey-'+(++n),prospect_id:id,type,at,data},{actor,expectedRevision:(await app.snapshot()).revision});
  let r=await record();await send('reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'discovery',focus:'website'});
  await send('discovery_confirmed',{goal:'Fictional website',decision_maker:'Fictional owner',serious_interest:true,paid_fit_discussed:true,service:'website',main_flow:'Request information',preview_screens:1});
  await send('preview_recorded',{reference:'fixture:preview',brief:'Fictional website direction',reviewed_with_owner:true});
  await send('proposal_approved',fixtureQuote);await send('agreement_recorded',{reference:'fixture:agreement',signed_verified:true,quote_sha256:hash((await record()).quote)});
  await send('invoice_recorded',{invoice_id:'invoice',amount_cents:120000,currency:'USD',reference:'fixture:invoice'});
  await send('payment_recorded',{invoice_id:'invoice',payment_id:'payment',amount_cents:120000,currency:'USD',settled_verified:true,simulated:true,reference:'fixture:payment'});
  await send('onboarding_completed',{materials:'Fictional brand',access_plan:'No live access',kickoff:'Fictional kickoff'});
  assert.equal((await record()).tasks.length,0);
  await send('build_started',{basis_sha256:buildBasis(await record()),authorized:true,reference:'fixture:start'});
  for(const task of (await record()).tasks)await send('delivery_task_updated',{task_id:task.id,status:'Complete',evidence:'fixture:simulated check'});
  const exact={version:'v1',content_sha256:hash('fictional artifact')};
  await send('delivery_submitted',{...exact,reference:'fixture:preview-v1',internal_checks:true});
  await send('client_approver_registered',{approver_id:'client',name:'Fictional client',authority_confirmed:true,reference:'fixture:authority'});
  await assert.rejects(send('acceptance_recorded',{...exact,version:'stale',approver_id:'client',client_approval_verified:true,reference:'fixture:approval'}));
  await send('acceptance_recorded',{...exact,approver_id:'client',client_approval_verified:true,reference:'fixture:approval'});
  const release={...exact,target:'fixture:preview',intent_id:'release',receipt_id:'receipt',simulated:true,authorized:true,reference:'fixture:release'};
  for(const type of ['publication_authorized','publication_intent_prepared','publication_dispatched','publication_receipt_recorded'])await send(type,release);
  await send('handover_completed',{ownership:'fixture:ownership',training:'fixture:guide',backup:'fixture:restore',support:'fixture:separate agreement'});
  const reopened=await stagingRecordApp(raw,now);assert.equal((await reopened.snapshot()).prospects[id].stage,'Support');
  if(http)continue; // Moving-clock storage test below uses its injected authority.
  await send('maintenance_agreement_approved',{agreement_id:'care',period_start:at,period_end:'2026-10-28T15:00:01.000Z',categories:['content'],allowance_minutes:30,price_cents:1000,currency:'USD',approver_id:'client',client_accepted:true,operator_approved:true,reference:'fixture:care'});
  const before=await app.snapshot();let authority=new Date(at);app.store.now=()=>authority;
  raw.beforeRead=()=>{authority=new Date('2026-10-28T15:00:02.000Z');};
  await assert.rejects(app.apply({id:'expired-reservation',prospect_id:id,type:'maintenance_work_reserved',at,data:{work_id:'work',agreement_id:'care',scope:'Fictional update',category:'content',minutes:10,reference:'fixture:work'}},{actor,expectedRevision:before.revision}),/Current approved period/);
  raw.beforeRead=null;assert.deepEqual(await app.snapshot(),before);
 }
});
