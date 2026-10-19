import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle } from './lifecycle.mjs';
import { productionConfig } from './production.mjs';
import { saveJson } from './engine.mjs';
import { researchTick, runResearchService, setResearchPriority, researchHandoff, updateFailureGuard } from './research-service.mjs';

test('repeated new technical failures stop spending; old holds and commercial holds do not reset or trip the guard',()=>{
  const job=(job_id,reason='WORKER_OUTPUT_INVALID')=>({job_id,reason,status:'Held'});
  let g=updateFailureGuard(null,{jobs:[job('old')]},'release1');
  g=updateFailureGuard(g,{jobs:[job('old'),job('new1'),job('commercial','No supported opportunity')]},'release1');
  assert.equal(g.blocked,null);g=updateFailureGuard(g,{jobs:[job('new1')]},'release1');assert.equal(g.counts.WORKER_OUTPUT_INVALID,1);
  g=updateFailureGuard(g,{jobs:[job('new2')]},'release1');assert.equal(g.blocked,'WORKER_OUTPUT_INVALID');
  assert.equal(updateFailureGuard(g,{jobs:[job('new2')]},'release1').blocked,'WORKER_OUTPUT_INVALID');
  assert.deepEqual(updateFailureGuard(g,{jobs:[job('old'),job('new1'),job('new2')]},'reviewed-release2').counts,{});
});
import { operationsTick } from './operations-service.mjs';

const now = () => new Date('2026-10-17T15:00:00Z');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'studio-research-service-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, 'research'); await mkdir(directory);
  const config = JSON.parse(await readFile(new URL('./controller.example.json', import.meta.url)));
  Object.assign(config, { campaign: 'fictional-service', job_ids: ['fictional-service'] });
  Object.assign(config.providers.codex, { enabled: true, included_usage_only_confirmed: true });
  const control = { schema_version: 1, enabled: true, priority: 'research', quota_resumes: {} };
  await saveJson(join(directory, 'controller-config.json'), config);
  await saveJson(join(directory, 'research-control.json'), control);
  await saveJson(join(directory, 'google-config.json'), { spreadsheetId: 'fictional-only', keyFile: 'never-read-in-this-test' });
  const app = await StudioLifecycle.initialize({ directory: join(root, 'operations'), now,
    config: { ...structuredClone(productionConfig), research: { supervised: true, auto_import: false, approval_ref: 'fixture-owner-scope', source_directory: directory } } });
  return { app, directory, config, control };
}
const forbidden = { queueFactory: () => { throw Error('No Google construction expected'); }, run: () => { throw Error('No controller dispatch expected'); } };

test('disabled supervision and website priority start no queue or worker', async t => {
  const f = await fixture(t), path = join(f.app.directory, 'lifecycle-config.json'), c = JSON.parse(await readFile(path));
  c.research.supervised = false; await saveJson(path, c);
  assert.equal((await researchTick(f.app, forbidden)).status, 'Disabled');
  c.research.supervised = true; await saveJson(path, c);
  await saveJson(join(f.directory, 'research-control.json'), { ...f.control, priority: 'website' });
  assert.equal((await researchTick(f.app, forbidden)).status, 'Paused');
});

test('empty scopes, completed jobs and spent local allowance are inert', async t => {
  const f = await fixture(t), path = join(f.directory, 'controller-config.json');
  await saveJson(path, { ...f.config, job_ids: [] });
  assert.equal((await researchTick(f.app, forbidden)).status, 'Waiting');
  await saveJson(path, f.config);
  await saveJson(join(f.directory, 'controller-state.json'), { calls: [], jobs: { 'fictional-service': { stage: 'done', status: 'Complete' } }, provider_blocks: {} });
  assert.equal((await researchTick(f.app, forbidden)).status, 'Complete');
  await saveJson(join(f.directory, 'controller-state.json'), { calls: Array.from({ length: 6 }, (_, i) => ({ id: `charged-${i}`, worker: 'codex', day: '2026-10-17' })), jobs: {}, provider_blocks: {} });
  assert.equal((await researchTick(f.app, forbidden)).status, 'Deferred');
});

test('a retained live or dead research lock is preserved for explicit reconciliation', async t => {
  const f = await fixture(t); await mkdir(join(f.directory, '.controller'));
  const path = join(f.directory, '.controller', '.runner.lock');
  for (const pid of [process.pid, 2147483647]) {
    const raw = JSON.stringify({ pid, token: 'retained' }); await writeFile(path, raw);
    assert.equal((await researchTick(f.app, forbidden)).status, 'Held');
    assert.equal(await readFile(path, 'utf8'), raw);
  }
});

test('a held controller result appears in consolidated exceptions without a thrown service error', async t => {
  const f = await fixture(t), stop = new AbortController();
  await saveJson(join(f.directory, 'controller-state.json'), { calls: [], jobs: { 'fictional-service': {
    stage: 'held', status: 'Held', reason: 'WORKER_FAILED', next_action: 'Verify subscription authentication; preserve the reservation.'
  } }, provider_blocks: {} });
  await runResearchService(f.app, { signal: stop.signal, handoff: async () => ({ status: 'Disabled' }), wait: async () => stop.abort() });
  const state = await f.app.snapshot();
  assert.equal(state.exceptions.filter(e => e.id === 'research-service').length, 1);
  assert.match(state.exceptions.find(e => e.id === 'research-service').reason, /fictional-service.*WORKER_FAILED.*Verify subscription/);
});

test('one eligible tick passes the exact configured directory, queue and abort signal to the existing bounded controller', async t => {
  const f = await fixture(t), queue = { fictional: true }; let count = 0;
  const result = await researchTick(f.app, { queueFactory: c => { assert.equal(c.spreadsheetId, 'fictional-only'); assert.equal(c.minRequestIntervalMs, 1250); return queue; },
    run: async options => { count++; assert.equal(options.directory, f.directory); assert.deepEqual(options.config.job_ids, ['fictional-service']); assert.equal(options.queue, queue); assert.equal(options.once, true); assert.ok(options.signal instanceof AbortSignal); return { status: 'Complete', counts: { Complete: 1 }, calls_reserved: 3 }; } });
  assert.equal(count, 1); assert.equal(result.status, 'Complete');
});

test('changing the supervision binding aborts and awaits the owned controller', async t => {
  const f = await fixture(t); let stopped = false;
  const result = await researchTick(f.app, { monitorMs: 5, queueFactory: () => ({}), run: async ({ signal }) => {
    const path = join(f.app.directory, 'lifecycle-config.json'), c = JSON.parse(await readFile(path)); c.research.supervised = false; await saveJson(path, c);
    try { await new Promise((resolve, reject) => { signal.addEventListener('abort', () => { assert.equal(signal.reason.code, 'CONTROLLER_PAUSED'); reject(signal.reason); }, { once: true }); }); }
    finally { stopped = true; }
  } });
  assert.equal(stopped, true); assert.equal(result.status, 'Paused');
});

test('host shutdown reaches the owned controller before the service exits', async t => {
  const f = await fixture(t), stop = new AbortController(); let stopped = false;
  const result = researchTick(f.app, { signal: stop.signal, queueFactory: () => ({}), run: async ({ signal }) => {
    const pending = new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    stop.abort(); try { await pending; } finally { stopped = true; }
  } });
  await assert.rejects(result, /abort/i); assert.equal(stopped, true);
});

test('the local loop consolidates a failure, clears it after recovery and stops without any chat notification', async t => {
  const f = await fixture(t), stop = new AbortController(); let ticks = 0, waits = 0;
  await runResearchService(f.app, { signal: stop.signal, intervalMs: 1000, tick: async () => {
    ticks++; if (ticks === 1) throw Error('Fictional queue unavailable'); return { status: 'Complete', counts: { Complete: 1 }, calls_reserved: 3 };
  }, wait: async () => { if (++waits === 1) assert.equal((await f.app.snapshot()).exceptions.filter(e => e.id === 'research-service').length, 1); else stop.abort(); } });
  const state = await f.app.snapshot(); assert.equal(ticks, 2); assert.equal(state.research_runtime.status, 'Stopped');
  assert.equal(state.research_runtime.counts.Complete, 1); assert.equal(state.exceptions.some(e => e.id === 'research-service'), false);
});

test('owner priority controls preserve scope, quota and outbound gates while changing the shared research control', async t => {
  const f = await fixture(t);
  await saveJson(join(f.directory, 'research-control.json'), { ...f.control, quota_resumes: { claude: '2026-10-16T12:00:00Z' } });
  for (const priority of ['website', 'client', 'research']) {
    await setResearchPriority(f.app, priority);
    const c = JSON.parse(await readFile(join(f.app.directory, 'lifecycle-config.json'))), r = JSON.parse(await readFile(join(f.directory, 'research-control.json')));
    assert.equal(r.priority, priority); assert.equal(r.enabled, true);
    assert.equal(c.priority, priority === 'research' ? 'idle' : priority);
    assert.equal(r.quota_resumes.claude, '2026-10-16T12:00:00Z');
    assert.equal(c.outreach_enabled, false); assert.equal(c.connector_writes_enabled, false); assert.equal(c.release.approved, false);
    assert.deepEqual(JSON.parse(await readFile(join(f.directory, 'controller-config.json'))).job_ids, ['fictional-service']);
  }
  await assert.rejects(setResearchPriority(f.app, '../arbitrary'), /priority/);
});

test('unapproved research cannot be enabled through owner priority controls', async t => {
  const f = await fixture(t), path = join(f.app.directory, 'lifecycle-config.json'), c = JSON.parse(await readFile(path));
  delete c.research.approval_ref; await saveJson(path, c);
  await assert.rejects(setResearchPriority(f.app, 'research'), /owner-approved/);
  assert.equal(JSON.parse(await readFile(join(f.directory, 'research-control.json'))).priority, 'research');
});

test('connector ticks leave supervised research import to its single owner', async t => {
  const f = await fixture(t), path = join(f.app.directory, 'lifecycle-config.json'), c = JSON.parse(await readFile(path));
  c.research.auto_import = true; await saveJson(path, c);
  const result = await operationsTick(f.app, { connect: () => { throw Error('Disabled connector must not connect'); } });
  assert.equal(result.status, 'Disabled');
  assert.equal((await f.app.snapshot()).exceptions.some(e => e.id === 'research-import-system'), false);
});

test('reviewed-result handoff retries uncertain projection without repeating import and becomes inert after pause', async t => {
  const f = await fixture(t), path = join(f.app.directory, 'lifecycle-config.json'), c = JSON.parse(await readFile(path));
  c.research.auto_import = true; c.google = { fixture: 'unused' }; await saveJson(path, c);
  let checks = 0, publications = 0;
  const options = { importResults: async () => ({ status: 'Checked', examined: ++checks === 1 ? 1 : 0 }), publish: async () => { if (++publications === 1) throw Error('Uncertain controlled projection'); } };
  await assert.rejects(researchHandoff(f.app, options), /Uncertain/);
  assert.equal((await f.app.snapshot()).research_projection_due, true);
  await researchHandoff(f.app, options); assert.equal(publications, 2); assert.equal((await f.app.snapshot()).research_projection_due, false);
  await researchHandoff(f.app, options); assert.equal(publications, 2);
  await saveJson(join(f.directory, 'research-control.json'), { ...f.control, enabled: false });
  const before = checks; assert.equal((await researchHandoff(f.app, options)).status, 'Disabled'); assert.equal(checks, before);
});
