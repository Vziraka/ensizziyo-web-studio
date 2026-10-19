import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runJob } from './engine.mjs';
import { subscriptionEnvironment, workerFailure } from './workers.mjs';
import { GoogleQueue } from './google.mjs';
import { collectPublicSources } from './sources.mjs';

const job = { id: 'fixture-1', business_name: 'Example Cleaning', website: 'https://example.com/', seed_urls: ['https://example.com/', 'https://example.com/services'], as_of: '2026-10-13', purpose: 'controlled proof' };
const pageText = 'Example Cleaning offers residential and recurring cleaning. Contact the office through the request form. Move-out cleaning is available. The office discusses scope, availability and price before accepting a booking. Response time is unknown.';
const pageHash = createHash('sha256').update(pageText).digest('hex');
const checkpoint = { schema_version: 1, job_id: job.id, business_name: job.business_name, sources: [
  { url: 'https://example.com/', checked_at: job.as_of, content_sha256: pageHash, facts: ['Offers residential cleaning.', 'Has a request form.'] },
  { url: 'https://example.com/services', checked_at: job.as_of, content_sha256: pageHash, facts: ['Offers recurring cleaning.', 'Lists move-out cleaning.'] }
], unknowns: ['Response time is unknown.'] };
const report = { ...checkpoint, checkpoint_reused: true, observations: checkpoint.sources.flatMap(s => s.facts.map(fact => ({ fact, source_urls: [s.url] }))), opportunities: [{ observed_basis: 'Has a request form.', possible_effect: 'Response delays could affect inquiries; unconfirmed.', proposed_solution: 'Discuss inquiry tracking if the owner confirms a gap.', service_area: 'systems', confidence: 'hypothesis', owner_question: 'How do you track and respond to requests?' }], public_contact_routes: ['https://example.com/'], recommendation: 'Needs review' };

test('only terminal provider quota envelopes enable handoff; research text and transient events do not', () => {
  for (const event of [{ type: 'turn.failed', error: { code: 'usage_limit_reached', message: 'Limit reached' } }, { type: 'result', is_error: true, result: "You've hit your limit" }, { type: 'error', message: 'Monthly usage limit exceeded' }]) assert.equal(workerFailure(JSON.stringify(event)).code, 'WORKER_QUOTA');
  assert.equal(workerFailure(JSON.stringify({ type: 'result', result: JSON.stringify({ fact: "You've hit your limit" }) })), undefined);
  assert.equal(workerFailure(JSON.stringify({ type: 'system', subtype: 'api_retry', error: 'rate_limit' })), undefined);
  assert.equal(workerFailure(JSON.stringify({ type: 'error', message: 'Authentication failed' })).code, 'WORKER_FAILED');
});

test('the observed model-capacity rejection is distinct from subscription quota and research text',()=>{
  const message='Selected model is at capacity. Please try a different model.';
  assert.equal(workerFailure(JSON.stringify({type:'turn.failed',error:{message}})).code,'WORKER_CAPACITY');
  assert.equal(workerFailure(JSON.stringify({type:'turn.failed',error:{code:'usage_limit_reached',message}})).code,'WORKER_QUOTA');
  assert.equal(workerFailure(JSON.stringify({type:'result',result:message})),undefined);
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'studio-proof-test-'));
  await writeFile(join(directory, 'job.json'), JSON.stringify(job));
  await writeFile(join(directory, 'sources.json'), JSON.stringify({ sources: checkpoint.sources.map(s => ({ ...s, fetched_at: `${job.as_of}T12:00:00Z`, text: pageText })), failures: [] }));
  return directory;
}

test('another worker resumes an interrupted job without recollecting or changing its evidence', async () => {
  const directory = await fixture();
  await assert.rejects(runJob({ directory, worker: 'cursor', invoke: async ({ phase }) => {
    if (phase === 'collect') return checkpoint;
    throw new DOMException('Controlled interruption', 'AbortError');
  } }), { name: 'AbortError' });
  const savedEvidence = await readFile(join(directory, 'checkpoint.json'), 'utf8');
  const calls = [];
  await runJob({ directory, worker: 'claude', invoke: async ({ phase, checkpoint: evidence }) => {
    calls.push(phase);
    assert.deepEqual(evidence, checkpoint);
    return report;
  } });
  assert.deepEqual(calls, ['assess']);
  assert.equal(await readFile(join(directory, 'checkpoint.json'), 'utf8'), savedEvidence);
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  assert.equal(state.status, 'Complete');
  assert.equal(state.worker, 'claude');
  assert.equal(state.attempts.length, 2);
  assert.equal(state.attempts[0].status, 'Interrupted');
  assert.equal(state.attempts[1].status, 'Complete');
});

test('research subprocesses receive neither paid API keys nor parent app connector access', () => {
  const clean = subscriptionEnvironment({ PATH: 'bin', USERPROFILE: 'profile', CODEX_HOME: 'auth-home', OPENAI_API_KEY: 'fixture-secret', ANTHROPIC_API_KEY: 'fixture-secret', GOOGLE_APPLICATION_CREDENTIALS: 'fixture-path', STUDIO_STATE_DIR: 'private-records', CODEX_APP_TOOLS_PIPE_PATH: 'parent-connector', CODEX_THREAD_ID: 'parent-chat' });
  assert.deepEqual(clean, { PATH: 'bin', USERPROFILE: 'profile', CODEX_HOME: 'auth-home' });
});

test('completed work is returned without a second research call', async () => {
  const directory = await fixture();
  await runJob({ directory, worker: 'codex', invoke: async ({ phase }) => phase === 'collect' ? checkpoint : report });
  const result = await runJob({ directory, worker: 'claude', invoke: async () => { assert.fail('Completed work must not be billed again'); } });
  assert.equal(result.state.worker, 'codex');
  assert.equal(result.state.attempts.length, 1);
});

test('a requested quality revision reuses evidence and carries feedback to the replacement assessment', async () => {
  const directory = await fixture();
  await runJob({ directory, worker: 'claude', invoke: async ({ phase }) => phase === 'collect' ? checkpoint : report });
  const savedEvidence = await readFile(join(directory, 'checkpoint.json'), 'utf8');
  const calls = [];
  await runJob({ directory, worker: 'claude', revisionNotes: ['Remove unsupported claims about booking.'], invoke: async ({ phase, feedback }) => {
    calls.push(phase);
    assert.deepEqual(feedback, ['Remove unsupported claims about booking.']);
    return report;
  } });
  assert.deepEqual(calls, ['assess']);
  assert.equal(await readFile(join(directory, 'checkpoint.json'), 'utf8'), savedEvidence);
});

test('corrupted saved page text blocks reuse before a model is invoked', async () => {
  const directory = await fixture();
  const saved = JSON.parse(await readFile(join(directory, 'sources.json'), 'utf8'));
  saved.sources[0].text += 'Changed after retrieval.';
  await writeFile(join(directory, 'sources.json'), JSON.stringify(saved));
  await assert.rejects(runJob({ directory, worker: 'codex', invoke: async () => assert.fail('Corrupted evidence must not reach a worker') }), /integrity check/);
});

test('private state is refused inside a different Git checkout', async () => {
  const checkout = await mkdtemp(join(tmpdir(), 'studio-other-checkout-'));
  await mkdir(join(checkout, '.git'));
  const stateDirectory = join(checkout, 'private-state');
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./proof.mjs', import.meta.url)), 'prepare'], { env: { ...subscriptionEnvironment(), STUDIO_STATE_DIR: stateDirectory } }), error => /outside every Git checkout/.test(error.stderr));
  await assert.rejects(readFile(join(stateDirectory, 'job.json')), { code: 'ENOENT' });
});

test('missing public evidence fails without creating a reusable checkpoint', async () => {
  const directory = await fixture();
  await assert.rejects(runJob({ directory, worker: 'cursor', invoke: async () => ({ ...checkpoint, sources: [] }) }), /insufficient items/);
  await assert.rejects(readFile(join(directory, 'checkpoint.json')), { code: 'ENOENT' });
  assert.equal(JSON.parse(await readFile(join(directory, 'state.json'))).status, 'Failed');
});

test('a rejected fetch cannot masquerade as business evidence', async () => {
  const directory = await fixture();
  const rejected = { ...checkpoint, sources: checkpoint.sources.map(s => ({ ...s, facts: ['Web fetch rejected before any page text was returned.'] })) };
  await assert.rejects(runJob({ directory, worker: 'cursor', invoke: async ({ phase }) => phase === 'collect' ? rejected : report }), /Failed page access is not evidence/);
  await assert.rejects(readFile(join(directory, 'checkpoint.json')), { code: 'ENOENT' });
});

test('an existing lock is never removed speculatively by a competing runner', async () => {
  const directory = await fixture();
  await writeFile(join(directory, '.runner.lock'), JSON.stringify({ pid: 2147483646, token: 'stale-fixture' }));
  await assert.rejects(runJob({ directory, worker: 'cursor', invoke: async ({ phase }) => phase === 'collect' ? checkpoint : report }), /Stale runner lock/);
  assert.equal(JSON.parse(await readFile(join(directory, '.runner.lock'))).token, 'stale-fixture');
});

test('a prior worker still running prevents reassignment', async () => {
  const directory = await fixture();
  const original = JSON.stringify({ job_id: job.id, status: 'Running', child_pid: process.pid, attempts: [{ id: 'previous', status: 'Running' }] });
  await writeFile(join(directory, 'state.json'), original);
  await assert.rejects(runJob({ directory, worker: 'claude', invoke: async () => assert.fail('Prior worker has not stopped') }), /Previous worker is still alive/);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), original, 'A rejected reassignment must not change the active attempt');
});

test('a foreign Google attempt cannot be overwritten', async () => {
  const queue = new GoogleQueue({ spreadsheetId: 'fixture', request: async options => {
    assert.equal(options.method, 'GET', 'A rejected attempt must not write');
    return { data: { values: [[job.id, job.business_name, job.website, job.seed_urls.join('\n'), 'cursor', 'Ready', 'proof', 'Running', 'cursor', 'foreign-attempt']] } };
  } });
  await assert.rejects(queue.publish(job.id, { status: 'Complete', attempt_id: 'new-attempt', attempts: [] }, checkpoint, report), /different attempt/);
});

test('Google write verification rejects a mismatched receipt', async () => {
  const queue = new GoogleQueue({ spreadsheetId: 'fixture', request: async options => {
    if (options.method === 'PUT') return { data: {} };
    if (options.url.includes('?fields=')) return { data: { sheets: [{ properties: { title: 'Research proof' } }] } };
    return { data: { values: [['wrong-receipt']] } };
  } });
  await assert.rejects(queue.probe(), /did not match/);
});

test('public source collector rejects internal addresses, cross-host redirects and failed reads', async () => {
  const fixedTime = () => new Date('2026-10-13T12:00:00Z');
  await assert.rejects(collectPublicSources(job, { now: fixedTime, resolveHost: async () => [{ address: '127.0.0.1' }], request: () => assert.fail('Private destination must not be fetched') }), /Fewer than two/);
  const resolveHost = async () => [{ address: '93.184.216.34' }];
  const fetched = [];
  await assert.rejects(collectPublicSources(job, { now: fixedTime, resolveHost, request: async url => {
    fetched.push(url); return new Response(null, { status: 302, headers: { location: 'https://unapproved.example/secret' } });
  } }), /Fewer than two/);
  assert.deepEqual(fetched, job.seed_urls);
  await assert.rejects(collectPublicSources(job, { now: fixedTime, resolveHost, request: async () => new Response('Forbidden', { status: 403 }) }), /Fewer than two/);
});

test('completed report cannot cite a page the runner did not retrieve', async () => {
  const directory = await fixture();
  const invented = { ...report, sources: report.sources.map(s => ({ ...s, content_sha256: 'c'.repeat(64) })) };
  await assert.rejects(runJob({ directory, worker: 'codex', invoke: async ({ phase }) => phase === 'collect' ? checkpoint : invented }), /does not match retrieved evidence/);
  await assert.rejects(readFile(join(directory, 'report.json')), { code: 'ENOENT' });
});

test('private backup restores completed evidence without credentials, logs, overwrite or model calls', async () => {
  const { backupJob, restoreBackup } = await import('./backup.mjs');
  const original = await fixture(), root = await mkdtemp(join(tmpdir(), 'studio-backup-'));
  await runJob({ directory: original, worker: 'codex', invoke: async ({ phase }) => phase === 'collect' ? checkpoint : report });
  await rename(original, join(root, job.id));
  await writeFile(join(root, 'google-config.json'), 'PRIVATE CONFIG');
  await writeFile(join(root, job.id, 'worker.jsonl'), 'PRIVATE RAW OUTPUT');
  const output = join(root, 'backup.json'), destination = join(root, 'restored');
  await backupJob({ directory: root, jobId: job.id, output });
  const bytes = await readFile(output, 'utf8');
  assert.ok(!bytes.includes('PRIVATE'));
  await restoreBackup({ input: output, destination });
  const result = await runJob({ directory: join(destination, job.id), worker: 'claude', invoke: async () => assert.fail('Restoring completed evidence must not invoke a model') });
  assert.equal(result.state.status, 'Complete');
  assert.equal(await readFile(join(destination, job.id, 'sources.json'), 'utf8'), await readFile(join(root, job.id, 'sources.json'), 'utf8'));
  await assert.rejects(restoreBackup({ input: output, destination }), /exist/i);
  await assert.rejects(backupJob({ directory: root, jobId: job.id, output }), /exist/i);
  for (const mutate of [bundle => { bundle.files['sources.json'].content += ' '; }, bundle => { bundle.files['../google-config.json'] = bundle.files['job.json']; }]) {
    const invalid = JSON.parse(bytes); mutate(invalid);
    const bad = join(root, 'bad.json'); await writeFile(bad, JSON.stringify(invalid));
    await assert.rejects(restoreBackup({ input: bad, destination: join(root, 'invalid') }), /checksum|file/i);
    await assert.rejects(readFile(join(root, 'invalid', job.id, 'state.json')), { code: 'ENOENT' });
  }
});

test('backup refuses an executing or unresolved process and restores nothing into Git', async () => {
  const { backupJob, restoreBackup } = await import('./backup.mjs');
  const root = await mkdtemp(join(tmpdir(), 'studio-backup-')), original = await fixture();
  await rename(original, join(root, job.id));
  for (const state of [{ job_id: job.id, status: 'Running', child_pid: null, attempts: [] }, { job_id: job.id, status: 'Paused', child_pid: process.pid, attempts: [] }]) {
    await writeFile(join(root, job.id, 'state.json'), JSON.stringify(state));
    await assert.rejects(backupJob({ directory: root, jobId: job.id, output: join(root, 'backup.json') }), /stopped|Running/i);
  }
  await writeFile(join(root, job.id, 'state.json'), JSON.stringify({ job_id: job.id, status: 'Ready', attempts: [] }));
  const output = join(root, 'backup.json'); await backupJob({ directory: root, jobId: job.id, output });
  const checkout = join(root, 'checkout'); await mkdir(checkout); await mkdir(join(checkout, '.git'));
  await assert.rejects(restoreBackup({ input: output, destination: join(checkout, 'private') }), /outside every Git/);
});
