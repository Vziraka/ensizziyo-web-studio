import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle} from './lifecycle.mjs';
import {fixtureProspect,fixtureReply} from './lifecycle-fixtures.mjs';
const at='2026-10-27T15:00:00.000Z';
const inquiry=(id,name='Pine Roofing',email='pine@example.invalid',classification='inquiry')=>({id,prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:'STUDIO TEST '+name,classification,reply:fixtureReply('source-'+id,'thread-'+id,email,'Please send website directions.')}});
async function fixture(){const directory=await mkdtemp(join(tmpdir(),'evz-local-intake-'));return StudioLifecycle.initialize({directory,now:()=>new Date(at)});}

test('integrated local intake matches existing ownership before duplicate-safe alternating new assignment',async()=>{
 const app=await fixture();await app.apply(fixtureProspect('cedar',at,'STUDIO TEST Cedar Plumbing'));await app.apply({id:'claim',prospect_id:'cedar',type:'call_claimed',at,data:{}},{actor:'friend'});
 const matched=await app.apply(inquiry('existing','Cedar Plumbing','cedar@example.invalid'));
 assert.equal(matched.receipt.project_id,'cedar');assert.equal(matched.receipt.assigned_to,'friend');
 const second=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)}),a=inquiry('a'),b=inquiry('b','Elm Electrical','elm@example.invalid');
 const [first,duplicate,next]=await Promise.all([app.apply(a),second.apply({...a,id:'redelivery'}),second.apply(b)]);
 assert.equal([first,duplicate].filter(r=>r.duplicate).length,1);assert.equal(first.receipt.assigned_to,duplicate.receipt.assigned_to);assert.deepEqual(new Set([first.receipt.assigned_to,next.receipt.assigned_to]),new Set(['owner','friend']));
 let state=await app.snapshot();assert.equal(Object.keys(state.prospects).length,3);assert.equal(state.inquiry_intake.next_owner,'owner');assert.equal(state.prospects[first.receipt.project_id].stage,'Reply review');assert.equal(state.prospects[first.receipt.project_id].cold_paused,true);
 assert.equal(Object.values(state.actions).filter(a=>a.prospect_id===first.receipt.project_id).length,0,'Inbound does not create an outbound call task');
 await app.dashboard();const reopened=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)});assert.equal((await reopened.apply({...a,id:'restart-replay'})).duplicate,true);
 await assert.rejects(reopened.apply({...a,id:'changed-source',data:{...a.data,company_name:'STUDIO TEST Other'}}),/different content/);
 assert.equal((await reopened.snapshot()).inquiry_intake.next_owner,'owner');
 for(const [sender,body] of [['changed@example.invalid','Changed sender'],['pine@example.invalid','Changed body']]){
  const reply=fixtureReply(a.data.reply.source_id,a.data.reply.thread_id,sender,body);
  await assert.rejects(reopened.apply({...a,id:'collision-'+sender.split('@')[0],data:{...a.data,reply}}),/different content/);
 }
 assert.equal((await reopened.snapshot()).inquiry_intake.next_owner,'owner');
});

test('uncertain classification stays held until an attributable review, then identity can be resolved without rotation',async()=>{
 const app=await fixture();for(const id of ['one','two']){const p=fixtureProspect(id,at,'STUDIO TEST '+id);p.data.contact.email='shared@example.invalid';await app.apply(p);}
 const source=inquiry('uncertain','Unknown','shared@example.invalid','uncertain');await app.apply(source);
 const resolve={id:'premature-resolution',prospect_id:'inquiry-intake',type:'inquiry_identity_resolved',at,data:{source_id:'source-uncertain',project_id:'one'}};
 await assert.rejects(app.apply(resolve),/uncertain classification remains held/);
 assert.equal((await app.snapshot()).inquiry_intake.next_owner,'owner');
 await app.apply({id:'review-classification',prospect_id:'inquiry-intake',type:'inquiry_classification_reviewed',at,data:{source_id:'source-uncertain',classification:'inquiry',reason:'Read the fictional source; this is a website enquiry.'}},{actor:'friend'});
 let s=await app.snapshot();assert.equal(s.inquiry_intake.sources['source-uncertain'].status,'Identity review');assert.equal(s.inquiry_intake.sources['source-uncertain'].classification_review.by,'friend');
 await app.apply({...resolve,id:'resolved-after-review'},{actor:'owner'});s=await app.snapshot();assert.equal(s.inquiry_intake.sources['source-uncertain'].project_id,'one');assert.equal(s.inquiry_intake.next_owner,'owner');assert.equal(Object.keys(s.prospects).length,2);
 assert.equal((await app.apply({...source,id:'original-replayed'})).duplicate,true);
});

test('concurrent owner and friend intake commits two unique clients and one rotation per source',async()=>{
 const app=await fixture(),other=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)}),a=inquiry('owner-source'),b=inquiry('friend-source','Oak Electrical','oak@example.invalid');
 const results=await Promise.all([app.apply(a,{actor:'owner'}),other.apply(b,{actor:'friend'}),other.apply({...a,id:'friend-redelivery'},{actor:'friend'})]);
 const s=await app.snapshot();assert.equal(Object.keys(s.prospects).length,2);assert.equal(Object.keys(s.inquiry_intake.sources).length,2);assert.equal(s.inquiry_intake.next_owner,'owner');assert.equal([results[0],results[2]].filter(r=>r.duplicate).length,1);assert.equal(results[0].receipt.project_id,results[2].receipt.project_id);assert.deepEqual(new Set(Object.values(s.prospects).map(r=>r.follow_up_owner)),new Set(['owner','friend']));
});

test('ambiguous, excluded and uncertain sources retain provisional evidence without consuming rotation',async()=>{
 const app=await fixture();for(const id of ['one','two']){const p=fixtureProspect(id,at,'STUDIO TEST '+id);p.data.contact.email='shared@example.invalid';await app.apply(p);}
 const ambiguous=await app.apply(inquiry('ambiguous','Unknown','shared@example.invalid'));assert.equal(ambiguous.receipt.status,'Identity review');assert.equal(ambiguous.receipt.project_id,null);
 for(const classification of ['newsletter','spam','automatic_reply','uncertain'])await app.apply(inquiry(classification,'Bulletin',classification+'@example.invalid',classification));
 let s=await app.snapshot();assert.equal(s.inquiry_intake.next_owner,'owner');assert.equal(Object.keys(s.prospects).length,2);assert.equal(Object.keys(s.inquiry_intake.sources).length,5);
 await app.apply({id:'resolve',prospect_id:'inquiry-intake',type:'inquiry_identity_resolved',at,data:{source_id:'source-ambiguous',project_id:'two'}},{actor:'friend',expectedRevision:s.revision});
 s=await app.snapshot();assert.equal(s.inquiry_intake.sources['source-ambiguous'].project_id,'two');assert.equal(s.inquiry_intake.sources['source-ambiguous'].resolved_by,'friend');assert.equal(s.inquiry_intake.next_owner,'owner');assert.equal(s.prospects.two.stage,'Reply review');
});

test('new source invalidates old reply while preserving restrictions, and production intake is denied',async()=>{
 const app=await fixture(),first=await app.apply(inquiry('first')),id=first.receipt.project_id;
 await app.apply({id:'stop',prospect_id:id,type:'contact_stopped',at,data:{reason:'do_not_contact'}});
 const stopped=await app.apply(inquiry('second'));assert.equal(stopped.receipt.status,'Restricted');const s=await app.snapshot();assert.equal(s.prospects[id].restriction,'do_not_contact');assert.equal(s.inquiry_intake.next_owner,'friend');
 const before=structuredClone(s);app.config={...app.config,mode:'production'};
 assert.throws(()=>app.reduceEvent(s,inquiry('production'),{actor:'owner'}),/local fictional/);assert.deepEqual(s,before);
 app.config={...app.config,mode:'controlled'};app.store={};assert.throws(()=>app.reduceEvent(s,inquiry('hosted'),{actor:'owner'}),/local fictional/);assert.deepEqual(s,before);
});
