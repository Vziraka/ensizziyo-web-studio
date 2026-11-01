import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {seedLifecycle} from './lifecycle-fixtures.mjs';
import {buildBasis} from './local-delivery-gates.mjs';
const at='2026-10-27T15:00:00.000Z';
async function setup(){
 const app=await StudioLifecycle.initialize({directory:await mkdtemp(join(tmpdir(),'evz-delivery-gates-')),now:()=>new Date(at)});await seedLifecycle(app);
 let n=0;
 const emit=(type,data={},actor='owner',eventId=`gate-${++n}`,revision)=>app.apply({id:eventId,prospect_id:'cedar',type,at,data:{reference:'fixture:local gate evidence',...data}},{actor,expectedRevision:revision});
 const record=async()=>(await app.snapshot()).prospects.cedar;
 return {app,emit,record};
}
test('separate current Start build is atomic, both-role, replay-safe and durable after restart',async()=>{
 for(const actor of ['owner','friend']){
  const s=await setup();await s.app.change(state=>{const r=state.prospects.cedar;r.stage='Onboarding';delete r.build_authorization;r.tasks=[];});
  await s.emit('onboarding_completed',{materials:'Fictional approved brand package',access_plan:'fixture:scoped access',kickoff:'Ready after operator starts'},actor);
  const r=await s.record();assert.equal(r.stage,'Ready to build');assert.equal(r.tasks.length,0);
  const basis=buildBasis(r),revision=(await s.app.snapshot()).revision;
  await assert.rejects(s.emit('build_started',{basis_sha256:basis,authorized:true},actor,'stale-revision',revision-1),/Record changed/);
  for(const field of ['quote','payments','onboarding']){
   const original=structuredClone((await s.record())[field]);
   await s.app.change(state=>{const x=state.prospects.cedar;if(field==='payments')x.payments[0].amount_cents--;else x[field].changed='new';});
   const before=await s.app.snapshot();await assert.rejects(s.emit('build_started',{basis_sha256:basis,authorized:true},actor),/current quote/);assert.deepEqual(await s.app.snapshot(),before);
   await s.app.change(state=>state.prospects.cedar[field]=original);
  }
  const data={basis_sha256:basis,authorized:true};await s.emit('build_started',data,actor,'start');assert.equal((await s.record()).tasks.length,4);
  const reopened=await StudioLifecycle.open({directory:s.app.directory,now:()=>new Date(at)});
  assert.equal((await reopened.apply({id:'start',prospect_id:'cedar',type:'build_started',at,data:{reference:'fixture:local gate evidence',...data}},{actor,expectedRevision:0})).duplicate,true);
  await assert.rejects(s.emit('build_started',data,actor,'second-start'),/Separate Start build/);assert.equal((await s.record()).tasks.length,4);
 }
});
test('exact named client approval holds changed versions, unknown identities, objections and withdrawal',async()=>{
 const s=await setup();await s.app.change(state=>{const r=state.prospects.cedar;r.stage='Client review';r.acceptance=null;});
 const {version,content_sha256}=await s.record().then(r=>r.delivery),data={version,content_sha256,approver_id:'fictional-client',client_approval_verified:true};
 for(const change of [{version:'stale'},{content_sha256:hash('changed')},{approver_id:'unknown'}])await assert.rejects(s.emit('acceptance_recorded',{...data,...change}),/Exact version/);
 await assert.rejects(s.emit('acceptance_recorded',data,'worker'),/authorized operator/);
 await s.emit('client_preview_objected',{...data,reason:'Conflicting instruction'},'friend','objection');
 await assert.rejects(s.emit('acceptance_recorded',data),/unresolved objection/);
 await s.emit('client_preview_objection_resolved',{...data,hold_event_id:'objection',client_agreed:true,resolution:'Client confirms the exact wording'},'owner');
 await s.emit('acceptance_recorded',data,'friend');assert.match((await s.record()).acceptance.attestation,/not verified client authentication/);
 await s.emit('client_preview_withdrawn',{...data,reason:'Please hold'},'owner');assert.equal((await s.app.dashboard()).prospects.cedar.delivery_gates.approval_current,false);
});
test('durable publication intent fences dispatch and reconciles uncertain outcome without resend',async()=>{
 for(const actor of ['owner','friend']){
 const s=await setup();await s.app.change(state=>{const r=state.prospects.cedar;delete r.publication;delete r.publication_authority;r.stage='Handover';});
 const {version,content_sha256}=(await s.record()).delivery;
 const data={version,content_sha256,target:'fixture:website',intent_id:'release',receipt_id:'receipt',simulated:true,authorized:true};
 await assert.rejects(s.emit('publication_dispatched',data,actor),/authority/);
 await s.emit('publication_authorized',data,actor);await s.emit('publication_intent_prepared',data,actor);
 const reopened=await StudioLifecycle.open({directory:s.app.directory,now:()=>new Date(at)});assert.equal((await reopened.snapshot()).prospects.cedar.publication.status,'Prepared');
 await s.emit('publication_dispatched',data,actor);await s.emit('publication_uncertain',data,actor);
 await assert.rejects(s.emit('publication_dispatched',data,actor),/once/);
 await assert.rejects(s.emit('publication_intent_prepared',{...data,intent_id:'retry'},actor),/reconciled/);
 for(const change of [{target:'fixture:wrong'},{version:'wrong'},{intent_id:'wrong'},{content_sha256:hash('wrong')}])await assert.rejects(s.emit('publication_receipt_recorded',{...data,...change},actor),/original dispatched/);
 await s.emit('publication_receipt_recorded',data,actor);
 await s.emit('client_preview_withdrawn',{...data,approver_id:'fictional-client',reason:'Client withdraws after publication'},actor);
 const r=await s.record();assert.equal(r.publication.status,'Published');assert.match(r.publication.urgent_review.action,/no automatic undo/);assert.equal(r.publication.receipt.intent_id,'release');
 }
});
test('predispatch withdrawal and changed checks or payment prevent the simulated effect',async()=>{
 const s=await setup();await s.app.change(state=>{delete state.prospects.cedar.publication;});
 const {version,content_sha256}=(await s.record()).delivery,data={version,content_sha256,target:'fixture:website',intent_id:'new-release',authorized:true};
 await s.emit('publication_authorized',data);await s.emit('publication_intent_prepared',data);
 await s.app.change(state=>state.prospects.cedar.tasks[0].status='Open');await assert.rejects(s.emit('publication_dispatched',data),/internal checks/);
 await s.app.change(state=>state.prospects.cedar.tasks[0].status='Complete');
 await s.emit('client_preview_withdrawn',{...data,approver_id:'fictional-client',reason:'Hold before release'});
 await assert.rejects(s.emit('publication_dispatched',data),/Current exact approval/);assert.equal((await s.record()).publication.status,'Prepared');
});
test('maintenance allowance is period/category bound and concurrent reservations consume once; extras require exact acceptance',async()=>{
 const s=await setup(),agreement={agreement_id:'care-oct',period_start:'2026-10-01T00:00:00Z',period_end:'2026-11-01T00:00:00Z',categories:['content'],allowance_minutes:60,price_cents:15000,currency:'USD',approver_id:'fictional-client',client_accepted:true,operator_approved:true};
 await s.emit('maintenance_agreement_approved',agreement,'friend');
 const work={work_id:'hours',agreement_id:'care-oct',scope:'Update opening hours',category:'content',minutes:40};
 await assert.rejects(s.emit('maintenance_work_reserved',{...work,category:'integration'}),/covered category/);
 const reopened=await StudioLifecycle.open({directory:s.app.directory,now:()=>new Date(at)});
 const event={id:'reserve-a',prospect_id:'cedar',type:'maintenance_work_reserved',at,data:{reference:'fixture:work',...work}};
 const results=await Promise.allSettled([s.app.apply(event,{actor:'owner'}),reopened.apply({...event,id:'reserve-b',data:{...event.data,work_id:'other'}},{actor:'friend'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 const saved=Object.values((await s.record()).maintenance_work)[0];
 await s.emit('maintenance_work_consumed',{work_id:saved.work_id,reservation_event_id:saved.event_id,minutes:40},'friend');
 await s.emit('maintenance_work_consumed',{work_id:saved.work_id,reservation_event_id:saved.event_id,minutes:40},'owner');
 assert.equal((await s.record()).maintenance_agreements['care-oct'].used_minutes,40);
 const extra={extra_id:'extra-1',scope:'Add a service section',category:'content',minutes:90,price_cents:25000,currency:'USD',approver_id:'fictional-client',client_accepted:true,operator_approved:true};
 await assert.rejects(s.emit('maintenance_extra_approved',{...extra,client_accepted:false}),/named client/);
 await s.emit('maintenance_extra_approved',extra,'friend');const scope_sha256=(await s.record()).maintenance_extras['extra-1'].scope_sha256;
 await assert.rejects(s.emit('maintenance_work_reserved',{work_id:'extra-work',extra_id:'extra-1',scope_sha256,scope:'Different scope',category:'content',minutes:90}),/exact unused/);
 await s.emit('maintenance_work_reserved',{work_id:'extra-work',extra_id:'extra-1',scope_sha256,scope:extra.scope,category:'content',minutes:90});
 assert.equal((await reopened.snapshot()).prospects.cedar.maintenance_work['extra-work'].status,'Reserved');
 await assert.rejects(s.emit('maintenance_work_reserved',{...work,work_id:'late'},'owner','stale',0),/Record changed/);
});

test('multiple named objections remain independently held; another approver cannot clear them',async()=>{
 const s=await setup(),{version,content_sha256}=(await s.record()).delivery,exact={version,content_sha256};
 await s.emit('client_approver_registered',{approver_id:'second',name:'Second fictional approver',authority_confirmed:true},'friend');
 await s.emit('client_preview_objected',{...exact,approver_id:'fictional-client',reason:'First concern'},'owner','hold-a');
 await s.emit('client_preview_objected',{...exact,approver_id:'second',reason:'Second concern'},'friend','hold-b');
 await assert.rejects(s.emit('client_preview_objection_resolved',{...exact,approver_id:'second',hold_event_id:'hold-a',resolution:'Wrong person',client_agreed:true}),/exact named approver/);
 await s.emit('client_preview_objection_resolved',{...exact,approver_id:'second',hold_event_id:'hold-b',resolution:'Second agrees',client_agreed:true});
 let r=(await s.app.dashboard()).prospects.cedar;assert.equal(r.delivery_gates.unresolved_holds.length,1);assert.equal(r.delivery_gates.unresolved_holds[0].event_id,'hold-a');
 await assert.rejects(s.emit('acceptance_recorded',{...exact,approver_id:'second',client_approval_verified:true}),/unresolved objection/);
 await assert.rejects(s.emit('publication_authorized',{...exact,target:'fixture:x',authorized:true}),/current approved release/);
 await s.emit('client_preview_objection_resolved',{...exact,approver_id:'fictional-client',hold_event_id:'hold-a',resolution:'First agrees',client_agreed:true});
 await s.emit('acceptance_recorded',{...exact,approver_id:'second',client_approval_verified:true},'friend');
 r=(await s.app.dashboard()).prospects.cedar;assert.equal(r.delivery_gates.unresolved_holds.length,0);assert.equal(r.delivery_holds.length,2);assert.equal(r.delivery_gates.approval_current,true);
});

test('backdated authority cannot spend expired maintenance and dual-source reservations cannot debit any agreement',async()=>{
 const s=await setup(),agreement={agreement_id:'expired',period_start:'2026-09-01T00:00:00Z',period_end:'2026-10-01T00:00:00Z',categories:['content'],allowance_minutes:60,price_cents:15000,currency:'USD',approver_id:'fictional-client',client_accepted:true,operator_approved:true};
 await s.emit('maintenance_agreement_approved',agreement);
 const backdated={id:'backdated',prospect_id:'cedar',type:'maintenance_work_reserved',at:'2026-09-15T00:00:00Z',data:{agreement_id:'expired',work_id:'backdated',scope:'Update text',category:'content',minutes:10,reference:'fixture:backdated'}};
 const before=await s.app.snapshot();await assert.rejects(s.app.apply(backdated,{actor:'friend'}),/Current approved period/);assert.deepEqual(await s.app.snapshot(),before);
 const extra={extra_id:'extra',scope:'Update text',category:'content',minutes:10,price_cents:1000,currency:'USD',approver_id:'fictional-client',client_accepted:true,operator_approved:true};await s.emit('maintenance_extra_approved',extra);
 const scope_sha256=(await s.record()).maintenance_extras.extra.scope_sha256;
 for(const agreement_id of ['expired','missing']){
  const before=await s.app.snapshot();await assert.rejects(s.emit('maintenance_work_reserved',{work_id:'mixed-'+agreement_id,extra_id:'extra',agreement_id,scope_sha256,scope:extra.scope,category:'content',minutes:10}),/exactly one allocation/);assert.deepEqual(await s.app.snapshot(),before);
 }
 assert.equal((await s.record()).maintenance_agreements.expired.used_minutes,0);assert.equal((await s.record()).maintenance_extras.extra.reserved_by,undefined);
});

test('withdrawn undispatched intent can be cancelled and replaced after exact reapproval; dispatched intents cannot',async()=>{
 const s=await setup();await s.app.change(state=>{delete state.prospects.cedar.publication;state.prospects.cedar.stage='Handover';});
 const {version,content_sha256}=(await s.record()).delivery,data={version,content_sha256,target:'fixture:site',intent_id:'first-intent',authorized:true};
 await s.emit('publication_authorized',data);await s.emit('publication_intent_prepared',data);
 await s.emit('client_preview_withdrawn',{...data,approver_id:'fictional-client',reason:'Hold this release'},'friend','hold-before-dispatch');
 await s.emit('publication_intent_cancelled',{intent_id:data.intent_id,reason:'Withdrawn before effect'},'owner');
 await s.emit('client_preview_objection_resolved',{...data,approver_id:'fictional-client',hold_event_id:'hold-before-dispatch',client_agreed:true,resolution:'Client now agrees'},'friend');
 await s.emit('acceptance_recorded',{...data,approver_id:'fictional-client',client_approval_verified:true});await s.emit('publication_authorized',data);
 await assert.rejects(s.emit('publication_intent_prepared',data),/fresh intent/);
 await s.emit('publication_intent_prepared',{...data,intent_id:'second-intent'});await s.emit('publication_dispatched',{intent_id:'second-intent'});
 await assert.rejects(s.emit('publication_intent_cancelled',{intent_id:'second-intent',reason:'Try unsafe resend'}),/undispatched/);
 const r=await s.record();assert.equal(r.publication.status,'Dispatched');assert.ok(r.publication_history.some(p=>p.intent_id==='first-intent'&&p.status==='Cancelled'));
});
