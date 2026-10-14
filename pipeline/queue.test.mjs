import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleQueue } from './google.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const inputs = ['fixture-auto', 'Example Cleaning', 'https://example.com/', 'https://example.com/\nhttps://example.com/services', 'codex', 'Ready', 'controlled proof'];
const queueFor = rows => new GoogleQueue({ spreadsheetId: 'fixture', request: async options => {
  assert.equal(options.method, 'GET');
  return { data: { values: rows } };
} });

test('automatic pickup waits for its exact fresh Ready ID and ignores completed or paused rows', async () => {
  assert.equal(await queueFor([['previous', '', '', '', '', 'Ready', '', 'Complete'], [], ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'health receipt']]).pendingJob('fixture-auto', '2026-10-13'), null);
  assert.equal(await queueFor([[...inputs.slice(0, 5), 'Pause', inputs[6]]]).pendingJob('fixture-auto', '2026-10-13'), null);
  assert.equal(await queueFor([[...inputs, 'Complete', 'codex', 'old-attempt']]).pendingJob('fixture-auto', '2026-10-13'), null);
  assert.deepEqual(await queueFor([inputs]).pendingJob('fixture-auto', '2026-10-13'), {
    job: { id: inputs[0], business_name: inputs[1], website: inputs[2], seed_urls: inputs[3].split('\n'), purpose: inputs[6], as_of: '2026-10-13' }, worker: 'codex'
  });
});

test('duplicate IDs, unsupported workers and existing reservations cannot be dispatched', async () => {
  await assert.rejects(queueFor([inputs, inputs]).pendingJob('fixture-auto', '2026-10-13'), /Duplicate/);
  await assert.rejects(queueFor([[...inputs.slice(0, 4), 'other', ...inputs.slice(5)]]).pendingJob('fixture-auto', '2026-10-13'), /worker/);
  await assert.rejects(queueFor([[...inputs, '', '', 'foreign-attempt']]).pendingJob('fixture-auto', '2026-10-13'), /reservation/);
});

function sheetFixture(initialRows = []) {
  const rows = structuredClone(initialRows), writes = [];
  const queue = new GoogleQueue({ spreadsheetId: 'fixture', request: async ({ method, url, data }) => {
    const range = decodeURIComponent(url.split('/values/')[1]?.split('?')[0] ?? '');
    if (method === 'PUT') {
      writes.push(range);
      const row = Number(range.match(/!H(\d+)/)[1]) - 2;
      for (let i = 0; i < 9; i++) rows[row][i + 7] = data.values[0][i];
      return { data: {} };
    }
    if (range.endsWith('A2:P1000')) return { data: { values: rows } };
    const row = Number(range.match(/!H(\d+)/)[1]) - 2;
    return { data: { values: [rows[row].slice(7, range.endsWith(`J${row + 2}`) ? 10 : 16)] } };
  } });
  return { queue, rows, writes };
}

function evidenceFor(job) {
  const text = 'Example Cleaning lists residential cleaning, recurring visits, move-out work and a contact form. The office discusses scope and availability before confirming service. Response times and internal systems are unknown.';
  const content_sha256 = createHash('sha256').update(text).digest('hex');
  const sources = job.seed_urls.map(url => ({ url, checked_at: job.as_of, content_sha256, facts: ['Lists residential cleaning.', 'Has a contact form.'] }));
  const checkpoint = { schema_version: 1, job_id: job.id, business_name: job.business_name, sources, unknowns: ['Internal systems are unknown.'] };
  return {
    snapshots: { sources: sources.map(s => ({ ...s, fetched_at: `${job.as_of}T12:00:00Z`, text })), failures: [] }, checkpoint,
    report: { ...checkpoint, checkpoint_reused: true, observations: sources.flatMap(s => s.facts.map(fact => ({ fact, source_urls: [s.url] }))), opportunities: [{ observed_basis: 'Has a contact form.', possible_effect: 'Unconfirmed response delays may affect inquiries.', proposed_solution: 'Discuss inquiry tracking.', service_area: 'systems', confidence: 'hypothesis', owner_question: 'How are inquiries tracked?' }], public_contact_routes: [job.website], recommendation: 'Needs review' }
  };
}

test('one newly submitted job is reserved and read back before collection, then saved without manual dispatch', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-queue-test-'));
  const sheet = sheetFixture();
  const phases = [], events = [];
  let clock = 0, evidence;
  const result = await watchJob({ directory, queue: sheet.queue, jobId: inputs[0], timeoutMs: 50, pollMs: 1, clock: () => clock, now: () => new Date('2026-10-13T12:00:00Z'), wait: async () => { clock++; sheet.rows.push([...inputs], ['another-ready', ...inputs.slice(1)]); }, onEvent: event => events.push(event.event), collectSources: async job => {
    assert.equal(sheet.rows[0][7], 'Running');
    assert.ok(sheet.rows[0][9], 'A verified attempt reservation must exist before fetching');
    evidence = evidenceFor(job); return evidence.snapshots;
  }, invoke: async ({ phase, worker }) => {
    assert.equal(worker, 'codex'); phases.push(phase);
    return phase === 'collect' ? evidence.checkpoint : evidence.report;
  } });
  assert.equal(result.state.status, 'Complete');
  assert.equal(result.state.attempts.length, 1);
  assert.deepEqual(phases, ['collect', 'assess']);
  assert.equal(sheet.rows[0][7], 'Complete');
  assert.equal(sheet.rows[0][9], result.state.attempt_id);
  assert.equal(JSON.parse(sheet.rows[0][13]).job_id, inputs[0]);
  assert.equal(JSON.parse(await readFile(join(directory, inputs[0], 'job.json'))).purpose, inputs[6]);
  assert.equal(events.filter(e => e === 'complete').length, 1);
  assert.equal(sheet.rows[1].length, 7, 'A second Ready job must remain untouched');
});

test('an uncertain reservation receipt stops before page retrieval or any subscription invocation', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-queue-test-'));
  const sheet = sheetFixture([inputs]);
  const originalValues = sheet.queue.values.bind(sheet.queue);
  sheet.queue.values = async range => range.endsWith('H2:P2') ? [['Running', 'codex', 'different-attempt']] : originalValues(range);
  await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], collectSources: async () => assert.fail('No fetching before reservation'), invoke: async () => assert.fail('No model before reservation') }), /Uncertain Google write/);
  assert.equal(sheet.writes.length, 1, 'Do not retry an uncertain write automatically');
  assert.equal(JSON.parse(await readFile(join(directory, inputs[0], 'state.json'))).status, 'Failed');
});

test('completed rows time out without another model call and release the execution lock', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-queue-test-'));
  const sheet = sheetFixture([[...inputs, 'Complete', 'codex', 'previous']]);
  let clock = 0;
  await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], timeoutMs: 3, pollMs: 1, clock: () => clock, wait: async () => { clock++; }, invoke: async () => assert.fail('Never repeat completed work') }), /Timed out/);
  assert.equal(sheet.writes.length, 0);
  await assert.rejects(readFile(join(directory, '.runner.lock')), { code: 'ENOENT' });
});

test('pausing or changing a selected worker before reservation blocks all execution', async () => {
  const { watchJob } = await import('./runner.mjs');
  for (const [column, value, expected] of [[5, 'Pause', /paused/], [4, 'claude', /worker\/purpose changed/], [2, 'https://other.example/', /inputs differ/]]) {
    const directory = await mkdtemp(join(tmpdir(), 'studio-queue-test-'));
    const sheet = sheetFixture([inputs]);
    await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], onEvent: event => { if (event.event === 'queue_selected') sheet.rows[0][column] = value; }, collectSources: async () => assert.fail('Changed input cannot be fetched'), invoke: async () => assert.fail('Changed input cannot be assessed') }), expected);
    assert.equal(sheet.writes.length, 0);
    await assert.rejects(readFile(join(directory, inputs[0], 'state.json')), { code: 'ENOENT' });
    assert.equal(JSON.parse(await readFile(join(directory, inputs[0], 'job.json'))).website, inputs[2], 'Keep the original snapshot immutable');
  }
});

test('a worker failure is saved once and stops the listener without retry or fallback', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-queue-test-'));
  const sheet = sheetFixture([inputs]);
  let calls = 0;
  await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], fallbackWorkers: ['claude'], collectSources: async job => evidenceFor(job).snapshots, invoke: async () => { calls++; throw Error('Subscription unavailable'); } }), /Subscription unavailable/);
  assert.equal(calls, 1);
  assert.equal(sheet.rows[0][7], 'Failed');
  assert.equal(JSON.parse(await readFile(join(directory, inputs[0], 'state.json'))).attempts.length, 1);
  await assert.rejects(readFile(join(directory, '.runner.lock')), { code: 'ENOENT' });
});

test('Pause during assessment stops work, preserves evidence and allows an explicit resume', async () => {
  const { watchJob, executeJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-pause-test-')), sheet = sheetFixture([inputs]);
  let stopped = false, evidence;
  await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], controlPollMs: 5,
    collectSources: async job => { evidence = evidenceFor(job); return evidence.snapshots; },
    invoke: async ({ phase, signal }) => {
      if (phase === 'collect') return evidence.checkpoint;
      sheet.rows[0][5] = 'Pause';
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => { stopped = true; reject(new DOMException('Stopped', 'AbortError')); }, { once: true }));
    }
  }), /[Pp]aus|Stopped/);
  assert.equal(stopped, true);
  assert.equal(sheet.rows[0][7], 'Paused');
  const saved = await readFile(join(directory, inputs[0], 'checkpoint.json'), 'utf8');
  sheet.rows[0][5] = 'Ready';
  const phases = [];
  const result = await executeJob({ directory, queue: sheet.queue, jobId: inputs[0], worker: 'claude', controlPollMs: 5, invoke: async ({ phase }) => { phases.push(phase); return evidence.report; } });
  assert.deepEqual(phases, ['assess']);
  assert.equal(result.state.status, 'Complete');
  assert.equal(await readFile(join(directory, inputs[0], 'checkpoint.json'), 'utf8'), saved);
  assert.equal(result.state.error, undefined, 'The resumed attempt must not retain the old Pause error');
});

test('lost queue control stops the active worker and blocks automatic handoff', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-pause-test-')), sheet = sheetFixture([inputs]);
  let evidence, calls = 0, lostControl = false;
  const checkActive = sheet.queue.checkActive.bind(sheet.queue);
  sheet.queue.checkActive = async (...args) => { if (lostControl) throw Error('Control unavailable'); return checkActive(...args); };
  await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], controlPollMs: 5, fallbackWorkers: ['claude'],
    collectSources: async job => { evidence = evidenceFor(job); return evidence.snapshots; },
    invoke: async ({ phase, signal }) => { calls++; if (phase === 'collect') return evidence.checkpoint; lostControl = true; await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); }
  }), /[Cc]ontrol|[Aa]bort/);
  assert.equal(calls, 2, 'Control is lost during assessment, after both phases started');
  assert.equal(JSON.parse(await readFile(join(directory, inputs[0], 'state.json'))).status, 'Blocked');
});

test('a recognized quota failure hands the saved checkpoint to one named subscription fallback', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-quota-test-')), sheet = sheetFixture([inputs]);
  let evidence; const calls = [];
  const result = await watchJob({ directory, queue: sheet.queue, jobId: inputs[0], fallbackWorkers: ['claude'], controlPollMs: 5,
    collectSources: async job => { evidence = evidenceFor(job); return evidence.snapshots; },
    invoke: async ({ worker, phase }) => {
      calls.push(`${worker}:${phase}`);
      if (phase === 'collect') return evidence.checkpoint;
      if (worker === 'codex') throw Object.assign(Error('Subscription quota reached'), { code: 'WORKER_QUOTA' });
      return evidence.report;
    }
  });
  assert.deepEqual(calls, ['codex:collect', 'codex:assess', 'claude:assess']);
  assert.equal(result.state.attempts[0].status, 'Quota');
  assert.equal(result.state.worker, 'claude');
  assert.equal(result.state.attempts.length, 2);
  assert.equal(sheet.rows[0][7], 'Complete');
});

test('a committed write with a lost response is reconciled without repeating the write', async () => {
  const sheet = sheetFixture([inputs]), request = sheet.queue.requestOverride;
  let puts = 0;
  sheet.queue.requestOverride = async options => {
    const result = await request(options);
    if (options.method === 'PUT' && ++puts === 1) throw Error('Connection dropped after commit');
    return result;
  };
  const result = await sheet.queue.publish(inputs[0], { status: 'Running', worker: 'codex', attempt_id: 'fixture-attempt', attempts: [] });
  assert.equal(puts, 1);
  assert.equal(result.reconciled, true);
  assert.equal(sheet.rows[0][9], 'fixture-attempt');
});

test('an uncertain quota status write blocks fallback and requires explicit reconciliation', async () => {
  const { watchJob } = await import('./runner.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'studio-quota-test-')), sheet = sheetFixture([inputs]);
  const publish = sheet.queue.publish.bind(sheet.queue); const calls = [];
  sheet.queue.publish = async (id, state, ...args) => { if (state.status === 'Quota') throw Error('Receipt unavailable'); return publish(id, state, ...args); };
  await assert.rejects(watchJob({ directory, queue: sheet.queue, jobId: inputs[0], fallbackWorkers: ['claude'], collectSources: async job => evidenceFor(job).snapshots,
    invoke: async ({ worker }) => { calls.push(worker); throw Object.assign(Error('Quota'), { code: 'WORKER_QUOTA' }); }
  }), { code: 'RECONCILIATION_REQUIRED' });
  assert.deepEqual(calls, ['codex']);
});
