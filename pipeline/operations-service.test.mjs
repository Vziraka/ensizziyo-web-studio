import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle, initialConfig } from './lifecycle.mjs';
import { ControlledOperations } from './lifecycle-operations.mjs';
import { operationsTick, runOperationsService } from './operations-service.mjs';
import { saveJson, acquireLock } from './engine.mjs';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-service-')); t.after(() => rm(directory, { recursive: true, force: true }));
  let now = new Date('2026-10-19T13:00:00Z');
  const config = { ...initialConfig, readiness: { ...initialConfig.readiness, owner_design_approved: true }, runtime: { enabled: true },
    apollo: { user_id: 'owner', bindings: {} }, calendar: { ...initialConfig.calendar, owner_email: 'owner@example.com', calendar_id: 'primary' },
    operations: { enabled: true, interval_minutes: 5, allowlist: [], recipients: ['owner@example.com'], emails: {}, threads: {}, bookings: {} } };
  const app = await StudioLifecycle.initialize({ directory, config, now: () => now });
  return { app, config, directory, advance: ms => { now = new Date(+now + ms); } };
}
function provider(onConnect = async () => {}) {
  const calls = []; let closed = 0;
  return { calls, get closed() { return closed; }, connect: () => ({ connect: onConnect, close: async () => { closed++; },
    call: async (tool, input) => { calls.push({ tool, input }); return { structuredContent: tool.includes('apollo') ? { id: 'owner' } : { email: 'owner@example.com' }, content: [] }; } }) };
}
test('one bounded service cycle invokes native connectors, retains receipts and flushes maintenance', async t => {
  const s = await setup(t), p = provider();
  s.config.sender = { link_id: 'link_businessmail' };s.config.calendar.link_id='link_businesscalendar';await saveJson(join(s.directory,'lifecycle-config.json'),s.config);
  const result = await operationsTick(s.app, { connect: options => {assert.deepEqual(options.accountLinks,{gmail:'link_businessmail',google_calendar:'link_businesscalendar'});return p.connect();}, paceMs: 0 });
  assert.equal(result.status, 'Complete'); assert.equal(result.calls, 3); assert.equal(result.maintenance.synchronized, true);
  assert.equal(p.closed, 1); assert.equal((await readdir(join(s.directory, 'receipts'))).length, 3);
  assert.equal((await s.app.snapshot()).operations.cycle.completed_cycles, 1);
});

test('changing the selected Calendar account during a cycle holds before its next dispatch', async t => {
  const s=await setup(t),p=provider(async()=>{s.config.calendar.link_id='link_changedcalendar';await saveJson(join(s.directory,'lifecycle-config.json'),s.config);});
  await assert.rejects(operationsTick(s.app,{connect:p.connect,paceMs:0}),/Calendar account changed/);
  assert.equal(p.calls.some(c=>c.tool.includes('google_calendar')),false);assert.equal(p.closed,1);
});
test('an owner pause while the connector connects blocks the prepared call before dispatch', async t => {
  const s = await setup(t), p = provider(async () => { s.config.operations.enabled = false; await saveJson(join(s.directory, 'lifecycle-config.json'), s.config); });
  await assert.rejects(operationsTick(s.app, { connect: p.connect, paceMs: 0 }), /paused connector/);
  assert.equal(p.calls.length, 0); assert.equal(p.closed, 1);
  assert.equal(Object.values((await s.app.snapshot()).operations.requests)[0].status, 'Pending');
});
test('a crash after receipt persistence settles the exact saved receipt before continuing', async t => {
  const s = await setup(t), prior = new ControlledOperations(s.app, 'before-crash'), prepared = await prior.next();
  await mkdir(join(s.directory, 'receipts')); await writeFile(join(s.directory, 'receipts', `${prepared.key}.json`), JSON.stringify({ structuredContent: { id: 'owner' }, content: [] }));
  s.advance(91_000); const p = provider(); await operationsTick(s.app, { connect: p.connect, paceMs: 0 });
  const saved = Object.values((await s.app.snapshot()).operations.requests).find(r => r.key === prepared.key);
  assert.equal(saved.status, 'Done'); assert.equal(saved.session, 'before-crash');
});
test('a short service tick yields without reserving an unexecuted extra call or retaining its lease', async t => {
  const s = await setup(t), p = provider(); const r = await operationsTick(s.app, { connect: p.connect, maxOperations: 1, paceMs: 0 });
  assert.equal(r.status, 'Yielded'); assert.equal(p.calls.length, 1);
  const state = await s.app.snapshot(); assert.equal(state.operations.lease, undefined);
  assert.equal(Object.values(state.operations.requests).filter(r => r.status === 'Pending').length, 0);
});
test('a service preserves an existing process lock and shuts down its own lock cleanly', async t => {
  const s = await setup(t), lock = join(s.directory, 'operations-service.lock'); await writeFile(lock, 'existing owner');
  await assert.rejects(runOperationsService(s.app), /unreconciled service lock/); assert.equal(await readFile(lock, 'utf8'), 'existing owner');
  await rm(lock); const abort = new AbortController();
  await runOperationsService(s.app, { signal: abort.signal, tick: async () => { abort.abort(); return { status: 'Complete', calls: 0 }; }, intervalMs: 1000 });
  assert.equal((await s.app.snapshot()).runtime.status, 'Stopped'); await assert.rejects(readFile(lock), { code: 'ENOENT' });
});
test('an approved invitation wakes the existing service before its ordinary polling deadline', async t => {
  const s=await setup(t),abort=new AbortController();let ticks=0;
  await s.app.change(state=>{state.runtime={next_at:'2026-10-19T13:05:00Z',wake_requested:true};});
  await runOperationsService(s.app,{signal:abort.signal,intervalMs:1000,tick:async()=>{ticks++;abort.abort();return {status:'Complete',calls:0};}});
  assert.equal(ticks,1);assert.equal((await s.app.snapshot()).runtime.wake_requested,false);
});

test('a brief external backup lock cannot tear down service settlement',async t=>{
  const s=await setup(t),stop=new AbortController();
  await runOperationsService(s.app,{signal:stop.signal,intervalMs:1000,tick:async()=>{
    const release=await acquireLock(s.directory);setTimeout(()=>{void release();},60);stop.abort();return {status:'Complete',calls:0};
  }});
  const state=await s.app.snapshot();assert.equal(state.runtime.status,'Stopped');assert.equal(state.runtime.last_error,null);
});
