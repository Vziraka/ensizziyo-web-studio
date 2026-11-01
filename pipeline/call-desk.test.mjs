import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle } from './lifecycle.mjs';
import { fixtureProspect } from './lifecycle-fixtures.mjs';
import { callSupply, meetingSlots, sessionSummary } from './call-desk.mjs';
import {saveJson} from './engine.mjs';
const at = '2026-10-19T15:00:00Z';
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'call-desk-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = await StudioLifecycle.initialize({ directory, now: () => new Date(at) });
  await app.apply(fixtureProspect('bakery', at));
  const apply = (id, type, data) => app.apply({ id, type, prospect_id: 'bakery', at, data });
  const call = (id, outcome, extra = {}) => apply(id, 'call_logged', { call_id: id, outcome, performed_at: at, simulated: true, desk: true, ...extra });
  return { app, apply, call };
}
test('quick no-answer saves once, queues only a later call, and undo survives restart', async t => {
  const {app, call, apply} = await setup(t);
  await call('call1', 'no_answer', {note: 'No answer today'});
  await call('call1', 'no_answer', {note: 'No answer today'});
  let s = await app.snapshot(); assert.equal(s.prospects.bakery.attempts.length, 1);
  assert.equal(Object.values(s.actions).filter(a => a.type === 'email').length, 0);
  assert.equal(callSupply(s, new Date(at)).ready, 0);
  const reopened = await StudioLifecycle.open({directory: app.directory, now: app.now});
  await reopened.apply({id:'undo1',type:'call_undone',prospect_id:'bakery',at,data:{call_id:'call1'}});
  s = await app.snapshot(); assert.equal(s.prospects.bakery.attempts.length, 0); assert.equal(callSupply(s, new Date(at)).ready, 1);
  assert.ok(s.events.call1); assert.ok(s.events.undo1);
  await assert.rejects(apply('undo2','call_undone',{call_id:'call1'}));
});
test('interested owner notes progress without recording; email and booking remain explicit', async t => {
  const {app, call} = await setup(t);
  await call('interest', 'connected', { intent:'discovery', note:'Asked to discuss the preorder idea.' });
  const s=await app.snapshot(); assert.equal(s.prospects.bakery.stage,'Discovery');
  assert.equal(s.prospects.bakery.calls.interest.note,'Asked to discuss the preorder idea.');
  assert.equal(Object.values(s.actions).filter(a=>a.type==='email').length,0);
  assert.equal(sessionSummary(s,'2026-10-19T14:00:00Z').interested,1);
});
test('unspecified callback creates an internal reminder and stops cannot be undone into outreach', async t => {
  const {app,call,apply}=await setup(t);
  await assert.rejects(call('bad','callback',{callback_at:at}),/after the call/);
  await call('callback','callback');
  const state=await app.snapshot();
  assert.equal(state.prospects.bakery.callback_at,null);
  assert.equal(state.prospects.bakery.callback_due_at,'2026-10-20T13:00:00.000Z');
  assert.equal(Object.values(state.actions).some(action=>action.type==='email'),false);
  await call('stop','do_not_contact');
  await assert.rejects(apply('undo-stop','call_undone',{call_id:'stop'}),/Restriction/);
  assert.equal(callSupply(await app.snapshot(),new Date(at)).ready,0);
});
test('call correction is blocked after a provider reservation or another prospect event', async t => {
  const {app,call,apply}=await setup(t); await call('call1','no_answer');
  await app.change(s=>{s.operations={requests:{write:{operation:'task_create',status:'Pending'}}};});
  await assert.rejects(apply('undo','call_undone',{call_id:'call1'}),/provider/);
});
test('slots use Eastern weekday hours, exact duration and buffers across DST', () => {
  const now=new Date('2026-10-30T20:45:00Z');
  const slots=meetingSlots(now,[{start:'2026-11-02T14:30:00Z',end:'2026-11-02T15:00:00Z'}]);
  assert.ok(slots.length); assert.equal(slots[0].start,'2026-11-02T15:15:00.000Z');
  assert.equal(Date.parse(slots[0].end)-Date.parse(slots[0].start),1200000);
  assert.ok(!slots.some(s=>Date.parse(s.start)<Date.parse('2026-11-02T15:15:00Z')&&Date.parse(s.end)>Date.parse('2026-11-02T14:15:00Z')));
});
test('research target and new-call buffer exclude callbacks without capping the due queue',async t=>{
 const {app}=await setup(t),state=await app.snapshot(),base=state.prospects.bakery;
 state.prospects={};state.actions={};
 for(let i=0;i<90;i++){
  const id=`supply-${i}`,callback=i<60;
  state.prospects[id]={...structuredClone(base),id,company_id:id,stage:callback?'Callback':'Ready to contact',cold_paused:callback};
  state.actions[id]={id,prospect_id:id,type:callback?'callback_task':'call_task',status:'Queued',payload:{kind:callback?'callback':'new',due_at:at}};
 }
 const supply=callSupply(state,new Date(at));assert.equal(supply.ready,90);assert.equal(supply.callback_ready,60);assert.equal(supply.new_ready,30);assert.equal(supply.target,50);assert.equal(supply.new_daily_target,25);assert.equal(supply.low,false);assert.equal(supply.full,false);assert.equal(supply.pitch_full,false);assert.equal(supply.queue[0].kind,'callback');
 const view=await app.dashboard();assert.equal(view.daily.research_target,25);assert.equal(view.daily.new_researched,1);assert.equal(view.daily.research_shortfall,24);assert.equal(view.daily.minimum,undefined);assert.equal(view.daily.unique_businesses,0);
});
test('legacy50 configuration reopens with25-new semantics; callback purpose is derived and simulated calls count zero actual contacts',async t=>{
 const {app,call}=await setup(t);const legacy={...app.config,daily_target:50};delete legacy.daily_new_research_target;await saveJson(join(app.directory,'lifecycle-config.json'),legacy);
 const reopened=await StudioLifecycle.open({directory:app.directory,now:app.now});assert.equal((await reopened.dashboard()).daily.research_target,25);
 await call('request-callback','callback',{purpose:'callback'});await call('performed-callback','no_answer',{purpose:'new'});
 const state=await app.snapshot();assert.equal(state.prospects.bakery.calls['request-callback'].purpose,'new');assert.equal(state.prospects.bakery.calls['performed-callback'].purpose,'callback');
 const view=await app.dashboard();assert.equal(view.daily.callback_attempts,0);assert.equal(view.daily.unique_businesses,0);assert.equal(view.daily.new_researched,1);
});
