import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as dispatchFixture,at} from './fixtures/internal-dispatch.mjs';
import {fixture as mailFixture} from './fixtures/shared-operations-exact-mail.mjs';
import {conversationSchema,conversationEvents,applyConversationRecord} from './conversation-records.mjs';
import {applyDispatchProjectRecord,validateDispatchEnvelope,prepareDispatchWorkspace} from './shared-internal-dispatch.mjs';
import {hash} from './lifecycle.mjs';
import {writeLifecycleBackup,readLifecycleBackup} from './lifecycle-backup.mjs';
import {join} from 'node:path';

const event=(id,type,data,prospect_id='shared-proof')=>({id,type,data,prospect_id,at});
const style=(actor,id='style-'+actor,preferences='Use short paragraphs and one direct question.',expected_style_sha256=null)=>event(id,'operator_writing_style_saved',{role:actor,preferences,examples:['Thanks for the update. Which option works for your team?'],reason:'Operator explicitly selected personal phrasing.',expected_style_sha256},'operator-'+actor);
const enabled=p=>{p.conversation_records=structuredClone(conversationSchema);};
const fixture=(t,options={})=>dispatchFixture(t,{records:true,authorize:false,importChange:s=>{s.prospects['shared-proof'].stage='Discovery';},policyChange:enabled,...options});
async function send(f,e,actor='owner',revision){return (await f.session(actor)).json('/api/event',{method:'POST',body:{event:e,revision:revision??(await f.app.snapshot()).revision}});}

test('composed signed shared records claim an existing conversation and retain self-scoped style through lost writes and replay',async t=>{
 const f=await fixture(t),before=await f.app.snapshot(),claim=event('claim-owner','conversation_claimed',{reason:'Take the next client review.'});
 const results=await Promise.allSettled(['owner','friend'].map(actor=>send(f,{...claim,id:'claim-'+actor},actor,before.revision)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const claimed=await f.app.snapshot(),lead=claimed.prospects['shared-proof'].follow_up_owner;assert.ok(['owner','friend'].includes(lead));assert.equal(claimed.prospects['shared-proof'].stage,'Discovery');assert.deepEqual(claimed.operations,before.operations);await assert.rejects(send(f,event('takeover','conversation_claimed',{reason:'No automatic takeover.'}),lead==='owner'?'friend':'owner'),/already has a lead/);
 const e=style(lead),put=f.storage.raw.setJSON.bind(f.storage.raw);f.storage.raw.setJSON=async(...args)=>{const receipt=await put(...args);if(args[0]==='workspace')throw Error('Injected committed write response loss');return receipt;};await send(f,e,lead);f.storage.raw.setJSON=put;
 const saved=await f.app.snapshot();assert.equal(saved.operator_writing_styles[lead].version,1);assert.equal(saved.events[e.id].actor,lead);await send(f,e,lead,before.revision);assert.deepEqual(await f.app.snapshot(),saved);assert.equal(saved.prospects['shared-proof'].follow_up_owner,lead);assert.equal(f.wire.calls.length,0);
 const client=await f.session(lead),dashboard=await client.json('/api/state');for(const type of conversationEvents)assert.ok(dashboard.shared_workspace.allowed_edits.includes(type));
 const other=lead==='owner'?'friend':'owner';await assert.rejects(send(f,style(other,'forged-other'),lead),/own writing style/);assert.deepEqual(await f.app.snapshot(),saved);
});

test('historical profiles deny new effects and explicit schema/manifest corruption cannot grant them',async t=>{
 for(const options of [{records:true},{manual:true},{records:true,policyChange:p=>{p.conversation_records={version:9,events:conversationEvents};}}]){
  if(options.policyChange){await assert.rejects(dispatchFixture(t,{authorize:false,...options}),/does not authorize/);continue;}
  const f=await dispatchFixture(t,{authorize:false,...options}),before=await f.app.snapshot();for(const e of [event('old-claim','conversation_claimed',{reason:'No new old-binding authority.'}),style('owner')])await assert.rejects(send(f,e),/does not authorize|permits|Exact/);assert.deepEqual(await f.app.snapshot(),before);
 }
 const f=await fixture(t),envelope=structuredClone((await f.store.envelope()).data);delete envelope.dispatch_source.conversation_records;assert.throws(()=>validateDispatchEnvelope(envelope,f.store.dispatchBinding),/manifest/);const changed=structuredClone((await f.store.envelope()).data);delete changed.config.internal_dispatch.conversation_records;assert.throws(()=>validateDispatchEnvelope(changed,f.store.dispatchBinding),/configuration|policy/);
});

test('shared typed replay rejects unrelated changes, stopped/workspace claims, extra fields and stale style versions',async t=>{
 const f=await fixture(t),s=await f.app.snapshot(),e=style('owner'),record={event:e,actor:'owner',revision:s.revision,at},options={eventId:e.id,eventFingerprint:hash({event:e,actor:'owner'}),configFingerprint:hash(f.app.config),projectRecord:record};
 await assert.rejects(f.app.change(state=>{applyDispatchProjectRecord(state,f.app.config,record,new Date(at));state.prospects['shared-proof'].note='Unrelated proposed after-state';},options),/protected records/);assert.deepEqual(await f.app.snapshot(),s);
 await send(f,e);await assert.rejects(send(f,style('owner','stale-profile','Different phrasing.')),/style changed/);await assert.rejects(send(f,{...style('friend'),data:{...style('friend').data,approved:true}},'friend'),/exact conversation/);
 for(const kind of ['stopped','workspace']){const sandbox=structuredClone(s);if(kind==='stopped')sandbox.prospects['shared-proof'].restriction='do_not_contact';else sandbox.prospects['shared-proof'].origin='workspace';const before=structuredClone(sandbox);assert.throws(()=>applyConversationRecord(sandbox,event('invalid-'+kind,'conversation_claimed',{reason:'No permission promotion.'}),'owner',sandbox.revision,new Date(at)),/active existing conversation/);assert.deepEqual(sandbox,before);}
});

test('current composed mail authority imports retained personal styles under explicit schema and preserves original mail events',async t=>{
 const f=await mailFixture(t,{authorize:false,policyChange:enabled}),before=await f.app.snapshot();await send(f,style('friend'),'friend');const s=await f.app.snapshot();assert.deepEqual(s.actions,before.actions);assert.deepEqual(f.app.config.internal_dispatch.mail_events,['reply_reviewed','reply_draft_saved','reply_draft_approved']);assert.equal(f.mailWire.sent.length,0);
 const records=await fixture(t);await send(records,style('owner'));const snapshot=await records.app.snapshot(),backup=join(records.base.directory,'style-records-import.json');await writeLifecycleBackup(records.base.sourceApp.directory,snapshot,backup,at);assert.deepEqual((await readLifecycleBackup(backup)).state.operator_writing_styles,snapshot.operator_writing_styles);const policy=structuredClone(records.app.config.internal_dispatch);policy.policy_id='styles-rebound-policy';policy.binding.namespace='evz-project-shared-styles-rebound-fictional';policy.binding.deploy_id='styles-rebound-deploy';const scope={...records.packet.binding.scope,...policy.binding,policy_sha256:hash(policy)};const prepared=await prepareDispatchWorkspace({...records.preparation,backup,scope,dispatchPolicy:policy,rebindObservation:hash(snapshot.operations.internal_dispatch)});validateDispatchEnvelope(prepared.envelope,prepared.binding);assert.deepEqual(prepared.envelope.state.operator_writing_styles,snapshot.operator_writing_styles);
});

test('a shared claim reroutes prepared attention and clears cached cycle work while a style update leaves both alone',async t=>{
 const f=await fixture(t,{importChange:s=>{s.prospects['shared-proof'].stage='Reply review';s.operations.cycle={completed_records:['shared-proof','other'],completed_bookings:['old-booking']};}}),before=await f.app.snapshot();
 await send(f,event('claim-friend-review','conversation_claimed',{reason:'Friend takes the existing reply review.'}),'friend');const claimed=await f.app.snapshot();assert.deepEqual(claimed.operations.cycle.completed_records,['other']);assert.deepEqual(claimed.operations.cycle.completed_bookings,[]);const active=Object.values(claimed.team_notifications.messages).filter(m=>Object.values(claimed.team_notifications.active).includes(m.id)&&m.project_id==='shared-proof');assert.ok(active.length);assert.ok(active.every(m=>m.recipient_role==='friend'));assert.equal(claimed.prospects['shared-proof'].reply.source_id,before.prospects['shared-proof'].reply.source_id);await send(f,style('friend'),'friend');const styled=await f.app.snapshot();assert.deepEqual(styled.team_notifications,claimed.team_notifications);assert.deepEqual(styled.operations.cycle,claimed.operations.cycle);
});

test('shared profile validation rejects rollback, omitted history and duplicate history after two signed versions',async t=>{
 const f=await fixture(t);await send(f,style('owner','90'));let saved=await f.app.snapshot();await send(f,style('friend','1'),'friend');await send(f,style('owner','3','Use one clear question.',saved.operator_writing_styles.owner.sha256));const envelope=(await f.store.envelope()).data;validateDispatchEnvelope(envelope,f.store.dispatchBinding);assert.ok(Object.keys(envelope.state.events).indexOf('3')<Object.keys(envelope.state.events).indexOf('90'));
 for(const corrupt of [s=>{s.operator_writing_styles.owner=structuredClone(s.operator_writing_style_history[0]);},s=>{s.operator_writing_style_history=[];},s=>{s.operator_writing_style_history.push(structuredClone(s.operator_writing_style_history[0]));},s=>{s.events['moved-owner']=s.events['90'];delete s.events['90'];}]){const changed=structuredClone(envelope);corrupt(changed.state);assert.throws(()=>validateDispatchEnvelope(changed,f.store.dispatchBinding),/writing profile|style chain/);}
});
