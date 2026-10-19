import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveJson } from './engine.mjs';
import { runController } from './controller.mjs';
import { GoogleQueue } from './google.mjs';
import { reviewTemplate, prospectPurpose } from './prospects.mjs';
import { sourceContentHash } from './sources.mjs';
import { journeyAreas } from './schemas.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { acquireLock } from './engine.mjs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { watchJob } from './runner.mjs';

const now = () => new Date('2026-10-15T12:00:00Z');
const config = {
  schema_version: 1, campaign: 'fictional-controller', job_ids: ['controller-fixture'],
  max_run_minutes: 1, poll_seconds: 1, max_calls_per_job: 7, max_repairs: 1, max_recoveries: 1,
  fallback_order: ['codex', 'claude', 'cursor'], review_order: ['claude', 'codex', 'cursor'],
  providers: Object.fromEntries(['codex', 'claude', 'cursor'].map(worker => [worker, {
    enabled: true, daily_calls: 10, model: 'fixture-model', review_model: 'fixture-review-model',
    effort: 'low', review_effort: 'medium', included_usage_only_confirmed: true,
    usage_source: worker === 'codex' ? 'codex' : 'call-cap', reserve_percent: 30
  }]))
};
const usage = async () => ({ authenticated_subscription: true, checked_at: now().toISOString(), buckets: [{ id: 'codex/weekly', remaining_percent: 80, resets_at: 1792400000 }] });

test('disabled controller is inert: no Google request or provider invocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'controller-disabled-'));
  await saveJson(join(directory, 'research-control.json'), { schema_version: 1, enabled: false, priority: 'website', quota_resumes: {} });
  const result = await runController({ directory, config, now, readUsage: usage,
    queue: new Proxy({}, { get() { throw Error('Google must not be accessed'); } }),
    invoke: () => { throw Error('No provider call permitted'); } });
  assert.equal(result.status, 'Paused');
  assert.equal(result.calls_reserved, 0);
});

test('invalid campaign scope is rejected before any queue access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'controller-scope-'));
  await assert.rejects(runController({ directory, config: { ...config, job_ids: ['../old-sample'] } }), /job|scope/i);
});

const headers = ['Prospect ID', 'Business', 'Route', 'Website / source', 'Area / service', 'Observed opportunity', 'Contact / channel', 'Stage', 'Last contact', 'Next action', 'Next action date', 'Do not contact', 'Draft / proposal link', 'Quoted amount (USD)', 'Cash received (USD)', 'Notes'];
const control = { schema_version: 1, enabled: true, priority: 'research', quota_resumes: {} };

async function fixture(ids = config.job_ids) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-controller-fixture-'));
  await saveJson(join(directory, 'research-control.json'), control);
  const tables = { 'Research proof': [[]], 'Discovery intake': [[]], Prospects: [headers] }, requests = [];
  const queue = new GoogleQueue({ spreadsheetId: 'fictional-sheet', request: async request => {
    const range = decodeURIComponent(request.url.split('/values/')[1]?.split('?')[0] ?? '');
    requests.push({ method: request.method, range });
    const match = range.match(/^'([^']+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    assert.ok(match, `Unexpected fixture request ${range}`);
    const [, name, from, row, to, end] = match;
    const column = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
    const table = tables[name], start = Number(row) - 1, offset = column(from);
    if (request.method === 'PUT') request.data.values.forEach((values, n) => { table[start + n] ??= []; values.forEach((value, i) => { table[start + n][offset + i] = value; }); });
    return { data: { values: table.slice(start, Number(end)).map(values => values.slice(offset, column(to) + 1)) } };
  } });
  for (const id of ids) {
    const url = `https://www.instagram.com/${id.replaceAll('-', '')}/`;
    const source = { url, checked_at: '2026-10-15', fetched_at: now().toISOString(), text: 'DM to order\nFriday pickup', kind: 'social', capture_method: 'reviewed_page', coverage: 'partial', coverage_reason: 'Public bio and one dated pickup caption only.', identity_note: 'Fictional business and Fairfax location match.', reviewed_context: { reviewed_by: 'Fictional source reviewer', inspected_at: now().toISOString(), scope: 'Bio and October 14 pickup caption; no private messages or archive.', facts: [{ id: 'orders', statement: 'The inspected bio invites direct-message orders.', excerpt: 'DM to order', published_at: null }, { id: 'pickup', statement: 'The October 14 caption offers Friday pickup.', excerpt: 'Friday pickup', published_at: '2026-10-14' }] } };
    source.content_sha256 = sourceContentHash(source);
    const job = { id, business_name: `Fictional Cakes ${id}`, website: '', seed_urls: [url], as_of: '2026-10-15', research_version: 3, purpose: prospectPurpose };
    const packet = { schema_version: 1, job, worker: 'codex', discovery: { channel: 'Instagram', query: 'Fictional Fairfax bakery', category: 'Bakery', area: 'Fairfax', source_url: url, website_check: { status: 'No verified site found', searches: ['Fictional business and public bio links checked'], note: 'No verified site in these bounded checks; absence is unknown.' } }, captures: { reviewed_by: 'Fictional source reviewer', sources: [source], failures: [] } };
    tables['Discovery intake'].push([id, job.business_name, 'Bakery', 'Fairfax', 'Instagram', 'codex', 'Ready', JSON.stringify(packet)]);
  }
  return { directory, queue, tables, requests, config: structuredClone({ ...config, job_ids: ids }) };
}

function assessment(options) {
  const { job, snapshots } = options, source = snapshots.sources[0], basis = source.reviewed_context.facts[0].statement;
  const checkpoint = { schema_version: 3, job_id: job.id, business_name: job.business_name, sources: [{ url: source.url, checked_at: source.checked_at, content_sha256: source.content_sha256, facts: [basis] }], unknowns: ['Owner priorities and order volume remain unverified.'] };
  return options.phase === 'collect' ? checkpoint : { ...checkpoint, checkpoint_reused: true,
    observations: [{ fact: basis, source_urls: [source.url], evidence: [{ url: source.url, excerpt: 'DM to order', context_id: 'orders' }] }],
    journey_checks: journeyAreas.map(area => ({ area, status: area === 'enquiry_or_ordering' ? 'Observed' : 'Unknown', finding: area === 'enquiry_or_ordering' ? basis : 'The limited bio/caption capture does not establish this part of the customer journey.', observation_indexes: area === 'enquiry_or_ordering' ? [0] : [], owner_question: 'What would you like to improve in this part of your customer journey?' })),
    opportunities: [{ observed_basis: basis, possible_effect: 'An optional menu/request page might help customers prepare; the owner would need to confirm.', proposed_solution: 'Enhancement: discuss an optional menu/request page alongside existing DMs.', service_area: 'websites', confidence: 'hypothesis', owner_question: 'Would this complement your existing ordering tools?', existing_alternatives: ['Existing DM ordering'], validation_needed: 'Confirm existing tools and owner goals; no failure or buying interest is established.' }],
    public_contact_routes: [source.url], recommendation: 'Suitable to discuss'
  };
}

async function acceptedReview(options) {
  const decision = await reviewTemplate({ directory: join(options.directory, '..'), jobId: options.job.id });
  Object.assign(decision, { reviewed_by: options.outputSchema.properties.decision.properties.reviewed_by.const,
    decision: 'Research-qualified', identity_note: 'Fictional business identity and Fairfax location match.', operating_status: 'Active',
    operating_evidence: { url: options.snapshots.sources[0].url, excerpt: 'Friday pickup', context_id: 'pickup' }, opportunity_index: 0,
    contact: { url: options.snapshots.sources[0].url, email: '' }, rationale: 'A specific complementary enhancement follows from the observed offering; demand is unknown.', next_action: 'Ask whether a menu/request page complements the existing DM route.',
    observations: decision.observations.map(c => ({ ...c, supported: true, note: 'The retained scoped context supports this whole claim.' })),
    journey_checks: decision.journey_checks.map(c => ({ ...c, supported: true, note: 'The observation or honest coverage limit supports the finding.' })),
    opportunity_checks: [{ index: 0, supported: true, note: 'The proposal complements existing DMs, acknowledges alternatives and asks about goals.' }],
    other_claims_supported: true, other_claims_note: 'Extracted facts, uncertainty, contact and recommendation stay within the sources.' });
  return { verdict: 'Accepted', corrections: [], decision };
}

function worker(callback = async options => options.phase === 'review' ? acceptedReview(options) : assessment(options)) {
  return async options => {
    await options.onEvent({ event: 'worker_started', phase: options.phase, pid: 2147483647 });
    try { return await callback(options); }
    finally { await options.onEvent({ event: 'worker_stopped', phase: options.phase, exit_code: 0 }); }
  };
}
const run = (f, extra = {}) => runController({ ...f, now, readUsage: usage, invoke: worker(), ...extra });
const saved = (f, name = 'controller-state.json') => readFile(join(f.directory, name), 'utf8').then(JSON.parse);

async function longAnchorFixture() {
  const f = await fixture();
  const row = f.tables['Discovery intake'][1], packet = JSON.parse(row[7]);
  const captured = packet.captures.sources[0];
  const anchor = 'DM to order; include pickup date and your preferred cake size.';
  captured.text = `${anchor}\nFriday pickup`;
  captured.reviewed_context.scope = 'The public ordering line and Friday pickup caption only; other routes are unverified.';
  captured.reviewed_context.facts[0].statement = 'The inspected ordering line invites direct messages with cake and pickup details.';
  captured.reviewed_context.facts[0].excerpt = anchor;
  captured.content_sha256 = sourceContentHash(captured);
  row[7] = JSON.stringify(packet);
  return { ...f, anchor };
}

test('one fictional intake completes independent source review and idempotent Research-only publication', async () => {
  const f = await fixture(), phases = [];
  const result = await run(f, { invoke: worker(async options => { phases.push([options.worker, options.phase, options.model]); return options.phase === 'review' ? acceptedReview(options) : assessment(options); }) });
  assert.equal(result.jobs[0].status, 'Complete');
  assert.deepEqual(phases, [['codex', 'collect', 'fixture-model'], ['codex', 'assess', 'fixture-model'], ['claude', 'review', 'fixture-review-model']]);
  assert.equal(f.tables.Prospects.length, 2); assert.equal(f.tables.Prospects[1][7], 'Research');
  assert.equal(f.tables.Prospects[1][8], ''); assert.equal(f.tables.Prospects[1][14], '');
  await run(f, { invoke: () => { throw Error('Completed job must not run again'); } });
  assert.equal((await saved(f)).calls.length, 3); assert.equal(f.tables.Prospects.length, 2);
});

test('the dispatched review schema requires every contact key while retained reviews without phone remain readable', async () => {
  const f = await fixture(); let reviewed = false;
  const result = await run(f, { invoke: worker(async options => {
    if (options.phase !== 'review') return assessment(options);
    reviewed = true;
    assert.deepEqual(options.outputSchema.properties.decision.properties.contact.required, ['url', 'email', 'phone']);
    const legacy = await acceptedReview(options); // Existing receipt has no phone; still valid for historical readback.
    assert.equal(legacy.decision.contact.phone, undefined);
    return legacy;
  }) });
  assert.equal(reviewed, true);
  assert.equal(result.jobs[0].status, 'Complete');
});

test('daily budgets persist across restarts and resume from a checkpoint without another collection', async () => {
  const f = await fixture(); f.config.providers.codex.daily_calls = 1;
  f.config.fallback_order = ['codex'];
  const first = await run(f);
  assert.equal(first.jobs[0].status, 'Deferred'); assert.equal(first.calls_reserved, 1);
  assert.equal((await saved(f, 'controller-fixture/state.json')).status, 'Failed');
  const before = await readFile(join(f.directory, 'controller-fixture/checkpoint.json'));
  await run(f); assert.equal((await saved(f)).calls.length, 1);
  const tomorrow = () => new Date('2026-10-16T12:00:00Z');
  const phases = [];
  const result = await run(f, { now: tomorrow, readUsage: async () => ({ ...(await usage()), checked_at: tomorrow().toISOString() }), invoke: worker(async o => { phases.push(o.phase); return o.phase === 'review' ? acceptedReview(o) : assessment(o); }) });
  assert.equal(result.jobs[0].status, 'Complete'); assert.deepEqual(phases, ['assess', 'review']);
  assert.deepEqual(await readFile(join(f.directory, 'controller-fixture/checkpoint.json')), before);
});

test('a captured packet can wait across UTC midnight before its first pickup without refreshing evidence dates', async () => {
  const f = await fixture();
  const tomorrow = () => new Date('2026-10-16T12:00:00Z');
  const result = await run(f, { now: tomorrow, readUsage: async () => ({ ...(await usage()), checked_at: tomorrow().toISOString() }) });
  assert.equal(result.jobs[0].status, 'Complete');
  assert.equal(result.jobs[0].decision, 'Research-qualified');
  assert.equal(result.calls_reserved, 3);
  const job = await saved(f, 'controller-fixture/job.json');
  const snapshots = await saved(f, 'controller-fixture/sources.json');
  assert.equal(job.as_of, '2026-10-15');
  assert.equal(snapshots.sources[0].checked_at, '2026-10-15');
  assert.equal(snapshots.sources[0].fetched_at, now().toISOString());
  assert.equal(snapshots.sources[0].reviewed_context.inspected_at, now().toISOString());
});

test('the named intake listener preserves the captured date when its first pickup is next day', async () => {
  const f = await fixture();
  await watchJob({ directory: f.directory, queue: f.queue, jobId: f.config.job_ids[0], intakeResearch: true,
    now: () => new Date('2026-10-16T12:00:00Z'), invoke: worker(assessment) });
  assert.equal((await saved(f, 'controller-fixture/job.json')).as_of, '2026-10-15');
  assert.equal((await saved(f, 'controller-fixture/state.json')).status, 'Complete');
});

test('website priority interrupts active assessment; a later run resumes without charging a recovery', async () => {
  const f = await fixture(); let stopped = false;
  const result = await run(f, { controlPollMs: 2, invoke: worker(async o => {
    if (o.phase === 'collect') return assessment(o);
    await saveJson(join(f.directory, 'research-control.json'), { ...control, priority: 'website' });
    try { await new Promise((resolve, reject) => { o.signal.addEventListener('abort', () => reject(o.signal.reason), { once: true }); }); }
    finally { stopped = true; }
  }) });
  assert.ok(stopped); assert.equal(result.status, 'Paused'); assert.equal(result.jobs[0].status, 'Deferred');
  assert.equal((await saved(f)).jobs['controller-fixture'].recoveries, 0);
  await saveJson(join(f.directory, 'research-control.json'), control);
  const phases = []; const resumed = await run(f, { invoke: worker(async o => { phases.push(o.phase); return o.phase === 'review' ? acceptedReview(o) : assessment(o); }) });
  assert.equal(resumed.jobs[0].status, 'Complete'); assert.deepEqual(phases, ['assess', 'review']);
  assert.equal((await saved(f)).jobs['controller-fixture'].recoveries, 0);
});

test('recognized assessment timeout hands off only after stop and reuses immutable evidence', async () => {
  const f = await fixture(), phases = []; let stopped = false;
  const invoke = worker(async o => {
    phases.push(`${o.worker}/${o.phase}`);
    if (o.worker === 'codex' && o.phase === 'assess') throw Object.assign(Error('Synthetic timeout'), { code: 'WORKER_TIMEOUT' });
    if (o.worker === 'claude' && o.phase === 'assess') assert.ok(stopped, 'Old child must be confirmed stopped first');
    return o.phase === 'review' ? acceptedReview(o) : assessment(o);
  });
  const result = await run(f, { invoke: async o => { try { return await invoke(o); } finally { if (o.worker === 'codex' && o.phase === 'assess') stopped = true; } } });
  assert.equal(result.jobs[0].status, 'Complete'); assert.deepEqual(phases.slice(0, 3), ['codex/collect', 'codex/assess', 'claude/assess']);
  const state = await saved(f); assert.equal(state.jobs['controller-fixture'].recoveries, 1); assert.equal(state.calls.length, 4);
});

test('a single subscription recovers invalid author output with its configured review model and retained checkpoint', async () => {
  const f = await fixture(), phases = []; let checkpoint, sources;
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  f.config.max_calls_per_job = 6;
  const result = await run(f, { invoke: worker(async o => {
    phases.push(`${o.model}/${o.phase}`);
    if (o.phase === 'assess' && o.model === 'fixture-model') {
      checkpoint = await readFile(join(o.directory, 'checkpoint.json')); sources = await readFile(join(o.directory, 'sources.json'));
      return { invalid: true };
    }
    if (o.phase === 'assess') {
      assert.equal(o.model, 'fixture-review-model'); assert.equal(o.effort, 'medium');
      assert.deepEqual(await readFile(join(o.directory, 'checkpoint.json')), checkpoint);
      assert.deepEqual(await readFile(join(o.directory, 'sources.json')), sources);
    }
    return o.phase === 'review' ? acceptedReview(o) : assessment(o);
  }) });
  assert.equal(result.jobs[0].status, 'Complete'); assert.equal(result.jobs[0].decision, 'Research-qualified');
  assert.deepEqual(phases, ['fixture-model/collect', 'fixture-model/assess', 'fixture-review-model/assess', 'fixture-review-model/review']);
  const state = await saved(f); assert.equal(state.jobs['controller-fixture'].recoveries, 1);
  assert.equal(state.calls.length, 4); assert.equal(state.calls.filter(c => c.status === 'WORKER_OUTPUT_INVALID').length, 1);
});

test('model capacity uses the one configured-model recovery, retains charges and still requires fresh review',async()=>{
  const f=await fixture(),phases=[];for(const w of ['claude','cursor'])f.config.providers[w].enabled=false;
  let checkpoint;
  const result=await run(f,{invoke:worker(async o=>{
    phases.push(`${o.model}/${o.phase}`);
    if(o.phase==='assess'&&o.model==='fixture-model'){checkpoint=await readFile(join(o.directory,'checkpoint.json'));throw Object.assign(Error('Observed provider model capacity'),{code:'WORKER_CAPACITY'});}
    if(o.phase==='assess')assert.deepEqual(await readFile(join(o.directory,'checkpoint.json')),checkpoint);
    return o.phase==='review'?acceptedReview(o):assessment(o);
  })});
  assert.equal(result.jobs[0].status,'Complete');assert.deepEqual(phases,['fixture-model/collect','fixture-model/assess','fixture-review-model/assess','fixture-review-model/review']);
  const state=await saved(f);assert.equal(state.calls.length,4);assert.equal(state.calls.filter(c=>c.status==='WORKER_CAPACITY').length,1);assert.equal(state.jobs['controller-fixture'].recoveries,1);
});

test('capacity with no distinct alternative holds without repeating the same model or charging on restart',async()=>{
  const f=await fixture();for(const w of ['claude','cursor'])f.config.providers[w].enabled=false;
  f.config.providers.codex.model=f.config.providers.codex.review_model;
  const result=await run(f,{invoke:worker(async()=>{throw Object.assign(Error('Synthetic model capacity'),{code:'WORKER_CAPACITY'});})});
  assert.equal(result.jobs[0].status,'Held');assert.equal(result.jobs[0].reason,'WORKER_CAPACITY');assert.equal(result.calls_reserved,1);
  assert.equal((await run(f,{invoke:()=>assert.fail('Held capacity must not retry')})).calls_reserved,1);
});

test('a shortened reviewed anchor reaches the one recovery as fixed feedback with the original checkpoint', async () => {
  const f = await longAnchorFixture(); let checkpoint, sources, assessments = 0;
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase === 'review') return acceptedReview(o);
    const output = assessment(o);
    if (o.phase === 'assess') {
      assessments++;
      if (assessments === 1) {
        checkpoint = await readFile(join(o.directory, 'checkpoint.json'));
        sources = await readFile(join(o.directory, 'sources.json'));
        output.observations[0].evidence[0].excerpt = 'DM to order';
      } else {
        assert.equal(o.model, 'fixture-review-model');
        assert.match(o.feedback?.join(' '), /complete saved reviewed_context.*excerpt/i);
        assert.deepEqual(await readFile(join(o.directory, 'checkpoint.json')), checkpoint);
        assert.deepEqual(await readFile(join(o.directory, 'sources.json')), sources);
        output.observations[0].evidence[0].excerpt = f.anchor;
      }
    }
    return output;
  }) });
  assert.equal(result.jobs[0].status, 'Complete'); assert.equal(assessments, 2);
  const state = await saved(f);
  assert.equal(state.jobs['controller-fixture'].recoveries, 1);
  assert.equal(state.calls.length, 4);
  assert.equal(state.calls.filter(call => call.status === 'WORKER_OUTPUT_INVALID').length, 1);
});

test('a second shortened anchor remains Held after one recovery with no checkpoint rewrite', async () => {
  const f = await longAnchorFixture(); let checkpoint, sources, assessments = 0;
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase === 'review') assert.fail('Invalid reports cannot reach independent review');
    const output = assessment(o);
    if (o.phase === 'assess') {
      assessments++;
      output.observations[0].evidence[0].excerpt = 'DM to order';
      if (assessments === 1) {
        checkpoint = await readFile(join(o.directory, 'checkpoint.json'));
        sources = await readFile(join(o.directory, 'sources.json'));
      } else assert.match(o.feedback?.join(' '), /complete saved reviewed_context.*excerpt/i);
    }
    return output;
  }) });
  assert.equal(result.jobs[0].status, 'Held'); assert.equal(result.jobs[0].reason, 'WORKER_OUTPUT_INVALID');
  assert.equal(assessments, 2);
  assert.deepEqual(await readFile(join(f.directory, 'controller-fixture/checkpoint.json')), checkpoint);
  assert.deepEqual(await readFile(join(f.directory, 'controller-fixture/sources.json')), sources);
  const state = await saved(f); assert.equal(state.jobs['controller-fixture'].recoveries, 1); assert.equal(state.calls.length, 3);
});

test('model-controlled schema keys never become trusted recovery instructions', async () => {
  const f = await fixture(); let assessments = 0;
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase === 'review') return acceptedReview(o);
    const output = assessment(o);
    if (o.phase === 'assess' && ++assessments === 1) output['arbitrary-model-key'] = true;
    else if (o.phase === 'assess') assert.equal(o.feedback, undefined);
    return output;
  }) });
  assert.equal(result.jobs[0].status, 'Complete'); assert.equal(assessments, 2);
  const state = await saved(f); assert.equal(state.jobs['controller-fixture'].recoveries, 1);
});

test('single-subscription recovery preserves its charged calls and checkpoint across a daily-budget restart', async () => {
  const f = await fixture();
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  f.config.providers.codex.daily_calls = 3; f.config.max_calls_per_job = 6;
  const invoke = worker(async o => o.phase === 'assess' && o.model === 'fixture-model' ? { invalid: true } : o.phase === 'review' ? acceptedReview(o) : assessment(o));
  const first = await run(f, { invoke });
  assert.equal(first.jobs[0].status, 'Deferred'); assert.equal(first.calls_reserved, 3);
  const checkpoint = await readFile(join(f.directory, 'controller-fixture/checkpoint.json'));
  const sameDay = await run(f, { invoke }); assert.equal(sameDay.calls_reserved, 3);
  const tomorrow = () => new Date('2026-10-16T12:00:00Z'), phases = [];
  const resumed = await run(f, { now: tomorrow, readUsage: async () => ({ ...(await usage()), checked_at: tomorrow().toISOString() }),
    invoke: worker(async o => { phases.push(o.phase); return o.phase === 'review' ? acceptedReview(o) : assessment(o); }) });
  assert.equal(resumed.jobs[0].status, 'Complete'); assert.deepEqual(phases, ['review']);
  assert.deepEqual(await readFile(join(f.directory, 'controller-fixture/checkpoint.json')), checkpoint);
  const state = await saved(f); assert.equal(state.calls.length, 4); assert.equal(state.jobs['controller-fixture'].recoveries, 1);
  assert.equal(state.calls.filter(c => c.day === '2026-10-15').length, 3);
});

test('a second invalid output holds after one same-subscription recovery without another collection', async () => {
  const f = await fixture(), phases = [];
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  const result = await run(f, { invoke: worker(async o => { phases.push(o.phase); return o.phase === 'collect' ? assessment(o) : { invalid: true }; }) });
  assert.equal(result.jobs[0].status, 'Held'); assert.equal(result.jobs[0].reason, 'WORKER_OUTPUT_INVALID');
  assert.deepEqual(phases, ['collect', 'assess', 'assess']);
  const state = await saved(f); assert.equal(state.calls.length, 3); assert.equal(state.jobs['controller-fixture'].recoveries, 1);
  assert.equal(state.calls.at(-1).model, 'fixture-review-model');
});

test('an actual single-subscription quota block never retries that provider with another model', async () => {
  const f = await fixture(), phases = [];
  for (const worker of ['claude', 'cursor']) f.config.providers[worker].enabled = false;
  const result = await run(f, { invoke: worker(async o => {
    phases.push(`${o.model}/${o.phase}`);
    if (o.phase === 'assess') throw Object.assign(Error('Synthetic subscription quota'), { code: 'WORKER_QUOTA' });
    return assessment(o);
  }) });
  assert.equal(result.jobs[0].status, 'Deferred'); assert.equal(result.calls_reserved, 2);
  assert.deepEqual(phases, ['fixture-model/collect', 'fixture-model/assess']);
  assert.equal((await saved(f)).provider_blocks.codex, now().toISOString());
  const resumed = await run(f, { invoke: () => assert.fail('A quota block must not retry its provider') });
  assert.equal(resumed.calls_reserved, 2); assert.equal((await saved(f)).provider_blocks.codex, now().toISOString());
});

test('rejected opportunity is repaired once with original bytes retained, then held if review still rejects it', async () => {
  const f = await fixture(); let reviews = 0, repair = false;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase !== 'review') { if (o.feedback) { repair = true; assert.deepEqual(o.feedback, ['Scope the possible effect to a hypothesis and confirm owner goals.']); } return assessment(o); }
    reviews++; const r = await acceptedReview(o); r.verdict = 'Revise'; r.corrections = ['Scope the possible effect to a hypothesis and confirm owner goals.'];
    r.decision.decision = 'Hold'; r.decision.opportunity_checks[0].supported = false; return r;
  }) });
  assert.ok(repair); assert.equal(reviews, 2); assert.equal(result.jobs[0].status, 'Held'); assert.equal(f.tables.Prospects.length, 1);
  const files = await readdir(join(f.directory, 'controller-fixture'));
  assert.equal(files.filter(name => name.startsWith('original-')).length, 1);
  assert.equal(files.filter(name => name.startsWith('auto-review-')).length, 2);
  assert.equal((await saved(f, 'controller-fixture/review.json')).verdict, 'Needs review');
  assert.equal((await saved(f)).calls.length, 5);
});

test('an uncertain publication holds that job without rerunning it and lets another named job complete', async () => {
  const f = await fixture(['controller-first', 'controller-second']);
  const publish = f.queue.publish.bind(f.queue); let injected = false;
  f.queue.publish = async (...args) => { await publish(...args); if (!injected && args[0] === 'controller-first' && args[1].status === 'Complete') { injected = true; throw Object.assign(Error('Synthetic uncertain write'), { code: 'RECONCILIATION_REQUIRED' }); } };
  const result = await run(f);
  assert.equal(result.jobs[0].status, 'Held'); assert.equal(result.jobs[0].reason, 'RECONCILIATION_REQUIRED');
  assert.equal(result.jobs[1].status, 'Complete'); assert.equal((await saved(f)).calls.filter(c => c.job_id === 'controller-first').length, 2);
});

test('Codex unknown allowance fails closed without consuming any model call', async () => {
  const f = await fixture(); const result = await run(f, { readUsage: async () => { throw Error('Synthetic metadata outage'); }, invoke: () => { throw Error('No call allowed'); } });
  assert.equal(result.jobs[0].status, 'Deferred'); assert.equal(result.calls_reserved, 0); assert.equal(f.tables.Prospects.length, 1);
});

test('subscription quota handoff persists its circuit breaker and charges the failed invocation', async () => {
  const f = await fixture();
  const result = await run(f, { invoke: worker(async o => {
    if (o.worker === 'codex' && o.phase === 'assess') throw Object.assign(Error('Synthetic quota'), { code: 'WORKER_QUOTA' });
    return o.phase === 'review' ? acceptedReview(o) : assessment(o);
  }) });
  assert.equal(result.jobs[0].status, 'Complete');
  const ledger = await saved(f); assert.equal(ledger.provider_blocks.codex, now().toISOString());
  assert.equal(ledger.calls.filter(c => c.status === 'WORKER_QUOTA').length, 1);
  assert.equal(ledger.jobs['controller-fixture'].recoveries, 1);
});

test('missing opportunity review cannot be accepted, and malformed review recovery is bounded', async () => {
  const f = await fixture(); const result = await run(f, { invoke: worker(async o => {
    if (o.phase !== 'review') return assessment(o);
    const r = await acceptedReview(o); r.decision.opportunity_checks = []; return r;
  }) });
  assert.equal(result.jobs[0].status, 'Held'); assert.equal(result.jobs[0].reason, 'WORKER_OUTPUT_INVALID');
  assert.equal(f.tables.Prospects.length, 1); assert.equal((await saved(f)).calls.length, 4);
});

test('changed reservation during review blocks qualification and never repairs or overwrites the foreign attempt', async () => {
  const f = await fixture(); const result = await run(f, { invoke: worker(async o => {
    if (o.phase !== 'review') return assessment(o);
    const r = await acceptedReview(o); f.tables['Research proof'][1][9] = 'foreign-attempt'; return r;
  }) });
  assert.equal(result.jobs[0].reason, 'RECONCILIATION_REQUIRED'); assert.equal(f.tables.Prospects.length, 1);
  assert.equal((await saved(f)).calls.length, 3); assert.equal(f.tables['Research proof'][1][9], 'foreign-attempt');
});

test('a live unresolved child prevents any worker handoff or subsequent job', async () => {
  const f = await fixture(['controller-orphan', 'controller-next']);
  const result = await run(f, { invoke: async o => {
    if (o.phase === 'collect') return assessment(o);
    await o.onEvent({ event: 'worker_started', pid: process.pid });
    throw Object.assign(Error('Synthetic unresolved child'), { code: 'WORKER_TIMEOUT' });
  } });
  assert.equal(result.status, 'Blocked'); assert.equal(result.jobs[0].status, 'Held');
  assert.equal(result.jobs[1].status, 'Not claimed'); assert.equal((await saved(f)).calls.length, 2);
  await assert.rejects(run(f), /still alive/i);
});

test('low or malformed Codex allowance preserves the website reserve with zero model dispatches', async () => {
  for (const checked_at of [now().toISOString(), 'not-a-time']) {
    const f = await fixture(); const result = await run(f, { readUsage: async () => ({ ...(await usage()), checked_at, buckets: [{ id: 'codex/weekly', remaining_percent: 29, resets_at: 1792400000 }] }) });
    assert.equal(result.jobs[0].reason, 'USAGE_UNAVAILABLE'); assert.equal(result.calls_reserved, 0);
  }
});

test('CLI initialization/status/disabled run use no Google credentials and create no job state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-controller-cli-'));
  const execute = args => promisify(execFile)(process.execPath, [fileURLToPath(new URL('./controller-cli.mjs', import.meta.url)), ...args], { env: { ...process.env, STUDIO_STATE_DIR: directory }, windowsHide: true });
  await execute(['init']); const status = JSON.parse((await execute(['status'])).stdout);
  assert.equal(status.status, 'Paused'); assert.equal(status.calls_reserved, 0);
  assert.equal(JSON.parse((await execute(['run', '--once'])).stdout).status, 'Paused');
  assert.deepEqual((await readdir(directory)).sort(), ['controller-config.json', 'research-control.json']);
});

test('legacy commands cannot take the execution lock while another controller owns the directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-controller-ownership-'));
  await mkdir(join(directory, '.controller'));
  await saveJson(join(directory, '.controller/.runner.lock'), { pid: 2147483647, token: 'synthetic-owner' });
  await assert.rejects(acquireLock(directory), /controller owns/i);
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./proof.mjs', import.meta.url)), 'sync', 'controller-fixture'], { env: { ...process.env, STUDIO_STATE_DIR: directory }, windowsHide: true }), /controller owns/i);
  assert.equal(JSON.parse(await readFile(join(directory, '.controller/.runner.lock'))).token, 'synthetic-owner');
});

test('a supported repair gets a fresh hash-bound review before qualification and preserves the rejected report exactly', async () => {
  const f = await fixture(); let rejectedBytes, firstSources, firstCheckpoint, reviews = 0;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase === 'collect') return assessment(o);
    if (o.phase === 'assess') {
      const r = assessment(o);
      if (!o.feedback) { r.observations[0].fact += ' Orders are routinely lost.'; r.opportunities[0].observed_basis = r.observations[0].fact; }
      else assert.equal(o.model, 'fixture-review-model');
      return r;
    }
    reviews++; const r = await acceptedReview(o);
    if (reviews === 1) {
      rejectedBytes = await readFile(join(o.directory, 'report.json'));
      firstSources = await readFile(join(o.directory, 'sources.json')); firstCheckpoint = await readFile(join(o.directory, 'checkpoint.json'));
      r.verdict = 'Revise'; r.corrections = ['Remove the unsupported claim that orders are routinely lost.']; r.decision.decision = 'Hold';
      r.decision.observations[0].supported = false; r.decision.opportunity_checks[0].supported = false;
    }
    return r;
  }) });
  assert.equal(result.jobs[0].status, 'Complete'); assert.equal(reviews, 2); assert.equal(f.tables.Prospects.length, 2);
  const target = join(f.directory, 'controller-fixture'), files = await readdir(target);
  assert.deepEqual(await readFile(join(target, files.find(name => name.startsWith('original-')))), rejectedBytes);
  assert.deepEqual(await readFile(join(target, 'sources.json')), firstSources); assert.deepEqual(await readFile(join(target, 'checkpoint.json')), firstCheckpoint);
  assert.ok(!JSON.stringify(await saved(f, 'controller-fixture/report.json')).includes('routinely lost'));
  const receipts = await Promise.all(files.filter(name => name.startsWith('auto-review-')).map(name => readFile(join(target, name), 'utf8').then(JSON.parse)));
  assert.equal(new Set(receipts.map(r => r.result.decision.report_sha256)).size, 2);
});

test('a priority change prevents the next allowlisted job from even being claimed', async () => {
  const f = await fixture(['controller-current', 'controller-later']);
  const result = await run(f, { invoke: worker(async o => {
    await saveJson(join(f.directory, 'research-control.json'), { ...control, priority: 'client' });
    o.signal.throwIfAborted(); return assessment(o);
  }) });
  assert.equal(result.status, 'Paused'); assert.equal(result.jobs[1].status, 'Not claimed');
  assert.equal(f.tables['Research proof'].length, 2); assert.equal(f.tables['Discovery intake'][2][8], undefined);
  assert.equal((await saved(f)).calls.length, 1);
});

test('missing priority control blocks the controller without touching Google or a provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-controller-control-'));
  const result = await runController({ directory, config, queue: new Proxy({}, { get() { throw Error('No Google access'); } }), invoke: () => { throw Error('No model access'); } });
  assert.equal(result.status, 'Blocked'); assert.equal(result.jobs[0].status, 'Not claimed');
});

test('Google requests are serialized and paced even when callers request them together', async () => {
  const starts = []; let active = 0, maximum = 0;
  const queue = new GoogleQueue({ spreadsheetId: 'fictional', minRequestIntervalMs: 15, request: async () => {
    starts.push(performance.now()); maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--; return { data: { values: [] } };
  } });
  await Promise.all([queue.values("'Research proof'!A2:P2"), queue.values("'Research proof'!A3:P3"), queue.values("'Research proof'!A4:P4")]);
  assert.equal(maximum, 1); assert.ok(starts[1] - starts[0] >= 10); assert.ok(starts[2] - starts[1] >= 10);
});

test('the total job ceiling prevents repair calls from escaping the research allowance', async () => {
  const f = await fixture(); f.config.max_calls_per_job = 3;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase !== 'review') return assessment(o);
    const r = await acceptedReview(o); r.verdict = 'Revise'; r.decision.decision = 'Hold';
    r.decision.opportunity_checks[0].supported = false; r.corrections = ['Scope the enhancement benefit to a hypothesis.']; return r;
  }) });
  assert.equal(result.jobs[0].reason, 'JOB_CALL_LIMIT'); assert.equal(result.jobs[0].status, 'Held');
  assert.equal((await saved(f)).calls.length, 3); assert.equal(f.tables.Prospects.length, 1);
});

test('a previous proof/sample directory is never adopted by a new controller campaign', async () => {
  const f = await fixture(); await mkdir(join(f.directory, 'controller-fixture'));
  await writeFile(join(f.directory, 'controller-fixture/original-marker.txt'), 'Existing proof must remain untouched.');
  const result = await run(f, { invoke: () => { throw Error('Old proof cannot run'); } });
  assert.equal(result.jobs[0].reason, 'UNOWNED_JOB'); assert.equal(result.calls_reserved, 0); assert.equal(f.requests.length, 0);
  assert.equal(await readFile(join(f.directory, 'controller-fixture/original-marker.txt'), 'utf8'), 'Existing proof must remain untouched.');
});

test('an incomplete original archive blocks repair before it can replace the only intact report', async () => {
  const f = await fixture(); let reviews = 0, original;
  const result = await run(f, { invoke: worker(async o => {
    if (o.phase !== 'review') return assessment(o);
    reviews++; const r = await acceptedReview(o);
    if (reviews === 1) {
      original = await readFile(join(o.directory, 'report.json'));
      await writeFile(join(o.directory, `original-${r.decision.attempt_id}-${r.decision.report_sha256}.json`), 'incomplete archive');
      r.verdict = 'Revise'; r.decision.decision = 'Hold'; r.decision.opportunity_checks[0].supported = false; r.corrections = ['Scope the benefit to an enhancement hypothesis.'];
    }
    return r;
  }) });
  assert.equal(result.jobs[0].reason, 'RECONCILIATION_REQUIRED'); assert.equal(reviews, 1); assert.equal(result.calls_reserved, 3);
  assert.deepEqual(await readFile(join(f.directory, 'controller-fixture/report.json')), original);
});
