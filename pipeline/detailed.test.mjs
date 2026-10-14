import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateJob, validateSnapshots, sourceContentHash } from './sources.mjs';
import { validateEvidence, schemasFor } from './schemas.mjs';
import { intakeCandidate, reviewTemplate, reviewCandidate, validateDecision } from './prospects.mjs';
import { GoogleQueue } from './google.mjs';
import { watchJob } from './runner.mjs';
import { backupJob, restoreBackup } from './backup.mjs';
import { runJob } from './engine.mjs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const job = { id: 'detailed-fixture', business_name: 'Fictional Cakes', website: '', seed_urls: ['https://www.instagram.com/fictionalcakes/'], as_of: '2026-10-14', research_version: 3, purpose: 'Prospect discovery; review required; no outreach.' };
const source = { url: job.seed_urls[0], checked_at: job.as_of, fetched_at: `${job.as_of}T12:00:00Z`, text: 'DM to order\nFriday pickup', kind: 'social', capture_method: 'reviewed_page', coverage: 'partial', coverage_reason: 'Public bio and one dated ordering post; archive and private messages not inspected.', identity_note: 'Fictional test identity and location match the public business bio.', reviewed_context: { reviewed_by: 'Source reviewer', inspected_at: `${job.as_of}T12:00:00Z`, scope: 'Public bio and October 12 ordering caption only; no submission or private content.', facts: [{ id: 'orders', statement: 'The inspected bio invites orders by direct message; the inspected caption offers Friday pickup.', excerpt: 'DM to order', published_at: null }, { id: 'pickup', statement: 'The October 12 caption names Friday pickup, without establishing availability for other days.', excerpt: 'Friday pickup', published_at: '2026-10-12' }] } };
source.content_sha256 = createHash('sha256').update(JSON.stringify({ text: source.text, reviewed_context: source.reviewed_context })).digest('hex');
const snapshots = { reviewed_by: 'Source reviewer', sources: [source], failures: [] };
const checkpoint = { schema_version: 3, job_id: job.id, business_name: job.business_name, sources: [{ url: source.url, checked_at: job.as_of, content_sha256: source.content_sha256, facts: [source.reviewed_context.facts[0].statement] }], unknowns: ['Current order volume and owner priorities are unverified.'] };
const report = { ...checkpoint, checkpoint_reused: true, observations: [{ fact: source.reviewed_context.facts[0].statement, source_urls: [source.url], evidence: [{ url: source.url, excerpt: 'DM to order', context_id: 'orders' }] }], journey_checks: ['discovery', 'offer', 'enquiry_or_ordering', 'trust_and_activity', 'follow_up'].map(area => ({ area, status: area === 'enquiry_or_ordering' ? 'Observed' : 'Unknown', finding: area === 'enquiry_or_ordering' ? 'The inspected public bio invites direct-message orders; other routes were not checked.' : 'This capture does not establish the current customer experience in this area.', observation_indexes: area === 'enquiry_or_ordering' ? [0] : [], owner_question: 'Which part of this workflow would you like to improve, if any?' })), opportunities: [], public_contact_routes: [source.url], recommendation: 'No strong public case' };

test('version 3 binds scoped reviewed context to evidence without relabeling partial captures full', () => {
  validateJob(job);
  validateSnapshots(snapshots, job);
  const changed = structuredClone(snapshots);
  changed.sources[0].reviewed_context.facts[0].statement = 'Orders are routinely lost.';
  assert.throws(() => validateSnapshots(changed, job), /integrity|hash/i);
  const falselyFull = structuredClone(snapshots); falselyFull.sources[0].coverage = 'full';
  assert.throws(() => validateSnapshots(falselyFull, job), /partial|context/i);
  assert.throws(() => validateSnapshots(snapshots, { ...job, research_version: 2 }), /version|context/i);
});

const packet = { schema_version: 1, job, worker: 'codex', discovery: { channel: 'Instagram', query: 'Fictional local bakery', category: 'Bakery', area: 'Fairfax', source_url: source.url, website_check: { status: 'No verified site found', searches: ['Exact name and public bio checked'], note: 'No standalone website verified in the bounded checks; absence is not established.' } }, captures: snapshots };
test('detailed intake preserves context and rejects changed evidence on replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-detailed-intake-'));
  const queue = { intakeJob: async actual => { assert.equal(actual.research_version, 3); return { queue: 'verified' }; } };
  await intakeCandidate({ directory, queue, packet, now: () => new Date(`${job.as_of}T13:00:00Z`) });
  const saved = JSON.parse(await readFile(join(directory, job.id, 'sources.json'), 'utf8'));
  assert.deepEqual(saved.sources[0].reviewed_context, source.reviewed_context);
  const altered = structuredClone(packet); altered.captures.sources[0].reviewed_context.scope += ' Unchecked archive.';
  await assert.rejects(intakeCandidate({ directory, queue, packet: altered, now: () => new Date(`${job.as_of}T13:00:00Z`) }), /hash|changed|checksum/i);
});

test('detailed assessments cite scoped facts and distinguish five observed or unknown journey checks', () => {
  validateEvidence(checkpoint, job, false, snapshots);
  validateEvidence(report, job, true, snapshots);
  assert.equal(schemasFor(job, snapshots).report.properties.observations.maxItems, 10);
  const invented = structuredClone(report); invented.observations[0].evidence[0].context_id = 'nonexistent';
  assert.throws(() => validateEvidence(invented, job, true, snapshots), /context/i);
  const unreviewable = structuredClone(report); unreviewable.journey_checks[1].status = 'Observed';
  assert.throws(() => validateEvidence(unreviewable, job, true, snapshots), /journey|observation/i);
  const directory = structuredClone(snapshots); directory.sources[0].kind = 'directory';
  assert.throws(() => validateEvidence(report, job, true, directory), /limited|evidence/i);
});

test('detailed intake collects approved website pages once and blocks cross-host collection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-detailed-http-'));
  const p = structuredClone(packet);
  p.job = { ...job, website: 'https://cakes.example/', seed_urls: ['https://cakes.example/'] };
  p.discovery.source_url = p.job.website; p.discovery.website_check.status = 'Verified site';
  p.captures = { reviewed_by: 'Source reviewer', sources: [], http_urls: p.job.seed_urls, failures: [] };
  const body = 'Fictional Cakes publishes pickup details and an existing order form. '.repeat(8);
  let calls = 0;
  const collectSources = async actual => { calls++; assert.deepEqual(actual.seed_urls, p.captures.http_urls); return { sources: [{ ...source, url: actual.seed_urls[0], text: body, reviewed_context: undefined, capture_method: 'http', coverage: 'full', kind: 'business', content_sha256: createHash('sha256').update(body).digest('hex') }], failures: [] }; };
  const options = { directory, queue: { intakeJob: async () => ({ queue: 'verified' }) }, packet: p, now: () => new Date(`${job.as_of}T13:00:00Z`), collectSources };
  await intakeCandidate(options); await intakeCandidate(options);
  assert.equal(calls, 1, 'Replay must reuse immutable saved website evidence, not fetch it again');
  const unsafe = structuredClone(p); unsafe.job.id = 'detailed-cross-host'; unsafe.job.seed_urls.push(source.url); unsafe.captures.http_urls = [source.url];
  await assert.rejects(intakeCandidate({ ...options, packet: unsafe }), /host|website|scope/i);
  assert.equal(calls, 1);
});

function sheet() {
  const rows = [], inbox = [], writes = [];
  const queue = new GoogleQueue({ spreadsheetId: 'fixture', request: async ({ method, url, data }) => {
    const range = decodeURIComponent(url.split('/values/')[1]?.split('?')[0] ?? '');
    const target = range.startsWith("'Discovery intake'") ? inbox : rows;
    if (/!A2:[PKM]1000$/.test(range)) return { data: { values: target } };
    const [, col, n, end] = range.match(/!([AHIL])(\d+):([PKM])/);
    const index = Number(n) - 2, offset = { A: 0, H: 7, I: 8, L: 11 }[col];
    if (method === 'PUT') { writes.push(range); target[index] ??= []; data.values[0].forEach((v, i) => { target[index][offset + i] = v; }); return { data: {} }; }
    return { data: { values: target[index] ? [target[index].slice(offset, { P: 16, K: 11, M: 13 }[end])] : [] } };
  } });
  return { queue, rows, inbox, writes };
}

test('a linked recheck runs detailed research, reviews every journey finding and restores without changing the original', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-detailed-flow-')), fake = sheet();
  const original = ['original-fixture', job.business_name, '', job.seed_urls.join('\n'), 'claude', 'Ready', job.purpose, 'Complete', 'claude', 'original-attempt', 'Evidence saved', 1, 'Insufficient evidence', '{}', '', 'Accepted / Hold'];
  fake.rows.push(structuredClone(original));
  const p = { ...packet, recheck_of: original[0] };
  fake.inbox.push([job.id, job.business_name, p.discovery.category, p.discovery.area, p.discovery.channel, p.worker, 'Ready', JSON.stringify(p)]);
  const now = () => new Date(`${job.as_of}T13:00:00Z`), phases = [];
  await watchJob({ directory, queue: fake.queue, jobId: job.id, intakeResearch: true, now, invoke: async ({ phase, job: actual }) => {
    assert.equal(actual.research_version, 3); phases.push(phase); return phase === 'collect' ? checkpoint : report;
  } });
  assert.deepEqual(phases, ['collect', 'assess']);
  const decision = await reviewTemplate({ directory, jobId: job.id });
  assert.equal(decision.journey_checks.length, 5, 'Journey claims must be part of the recorded review');
  Object.assign(decision, { reviewed_by: 'Source reviewer', identity_note: 'The public test identity and location match the approved capture.', rationale: 'Known ordering route, no demonstrated friction or owner need.', next_action: 'Ask about existing workflow before proposing changes.' });
  decision.observations.forEach(o => Object.assign(o, { supported: true, note: 'The scoped context and anchor support this finding.' }));
  decision.journey_checks.forEach(c => Object.assign(c, { supported: true, note: 'The finding either cites the observed route or explicitly states an unverified area.' }));
  const incomplete = structuredClone(decision); incomplete.journey_checks.pop();
  await assert.rejects(reviewCandidate({ directory, queue: fake.queue, jobId: job.id, decision: incomplete, now }), /journey/i);
  await reviewCandidate({ directory, queue: fake.queue, jobId: job.id, decision, now });
  assert.deepEqual(fake.rows[0], original);
  assert.equal(fake.rows[1][7], 'Complete'); assert.equal(fake.inbox[0][11], 'Hold');
  const output = join(directory, 'backup.json'), destination = join(directory, 'restored');
  await backupJob({ directory, jobId: job.id, output }); await restoreBackup({ input: output, destination });
  assert.deepEqual((await reviewTemplate({ directory: destination, jobId: job.id })).journey_checks.map(c => c.area), report.journey_checks.map(c => c.area));
  await runJob({ directory: join(destination, job.id), worker: 'claude', invoke: async () => assert.fail('A restored detailed completion must remain cached') });
  const duplicate = { ...job, id: 'unlinked-recheck' };
  await assert.rejects(fake.queue.intakeJob(duplicate, 'codex'), /duplicate|reconcile/i);
});

test('a specific primary-context problem can support discussion, with separate operating and complete journey review', () => {
  const s = structuredClone(source);
  s.text += '\nSome weekend orders get missed';
  Object.assign(s.reviewed_context.facts[0], { statement: 'The inspected October 12 public post says some weekend orders get missed.', excerpt: 'Some weekend orders get missed', published_at: '2026-10-12' });
  s.content_sha256 = createHash('sha256').update(JSON.stringify({ text: s.text, reviewed_context: s.reviewed_context })).digest('hex');
  const captures = { ...snapshots, sources: [s] }, candidate = structuredClone(report);
  candidate.sources[0].content_sha256 = s.content_sha256;
  candidate.observations[0].fact = s.reviewed_context.facts[0].statement;
  candidate.observations[0].evidence[0].excerpt = s.reviewed_context.facts[0].excerpt;
  candidate.journey_checks[2].finding = 'A specific public post reports missed weekend orders; causes and current frequency remain unknown.';
  candidate.recommendation = 'Suitable to discuss';
  candidate.opportunities = [{ observed_basis: candidate.observations[0].fact, possible_effect: 'A clearer cutoff or shared inbox could help if the owner confirms the cause.', proposed_solution: 'Discuss the current intake and whether a cutoff or shared inbox is useful.', service_area: 'systems', confidence: 'hypothesis', owner_question: 'What causes these missed orders and is that still a priority?', existing_alternatives: ['Existing DM ordering and Friday pickup'], validation_needed: 'Confirm the current issue, cause and preferred workflow before proposing a build.' }];
  validateSnapshots(captures, job); validateEvidence(candidate, job, true, captures);
  const f = { job, snapshots: captures, report: candidate, state: { attempt_id: 'attempt' }, report_sha256: 'a'.repeat(64), sources_sha256: 'b'.repeat(64) };
  const d = { schema_version: 1, job_id: job.id, attempt_id: 'attempt', report_sha256: f.report_sha256, sources_sha256: f.sources_sha256, reviewed_by: 'Source reviewer', decision: 'Research-qualified', identity_note: 'The approved fictional identity and public location agree.', operating_status: 'Active', operating_evidence: { url: s.url, excerpt: 'Friday pickup', context_id: 'pickup' }, opportunity_index: 0, contact: { url: s.url, email: '' }, rationale: 'Specific public issue supports a question; urgency and suitability remain unconfirmed.', next_action: 'Prepare a discovery question when launch prerequisites are met.', observations: [{ index: 0, supported: true, note: 'The specifically dated statement supports only this scoped claim.' }], journey_checks: candidate.journey_checks.map((c, index) => ({ index, area: c.area, supported: true, note: 'Observed claim or explicitly unknown area reviewed.' })) };
  validateDecision(d, f, () => new Date(`${job.as_of}T13:00:00Z`));
  const missingCitation = structuredClone(d); delete missingCitation.operating_evidence.context_id;
  assert.throws(() => validateDecision(missingCitation, f, () => new Date(`${job.as_of}T13:00:00Z`)), /primary|context/i);
  const unsupported = structuredClone(d); unsupported.journey_checks[1].supported = false;
  assert.throws(() => validateDecision(unsupported, f, () => new Date(`${job.as_of}T13:00:00Z`)), /supported|journey/i);
});

test('a working sales route can support a complementary enhancement without confirmed pain or buying interest', () => {
  const candidate = structuredClone(report);
  candidate.recommendation = 'Suitable to discuss';
  candidate.opportunities = [{ observed_basis: candidate.observations[0].fact, possible_effect: 'An optional menu/request page could give customers another place to review the Friday pickup offering.', proposed_solution: 'Enhancement: discuss a small branded menu/request page alongside the existing DM route.', service_area: 'websites', confidence: 'hypothesis', owner_question: 'Would a separate place for menus and pickup requests support your goals, or do your existing tools already cover this?', existing_alternatives: ['Existing DM ordering and Friday pickup'], validation_needed: 'Confirm existing links/tools and owner goals; no failed ordering process, missing website or buying interest is established.' }];
  validateEvidence(candidate, job, true, snapshots);
  const f = { job, snapshots, report: candidate, state: { attempt_id: 'enhancement-attempt' }, report_sha256: 'a'.repeat(64), sources_sha256: 'b'.repeat(64) };
  const decision = { schema_version: 1, job_id: job.id, attempt_id: f.state.attempt_id, report_sha256: f.report_sha256, sources_sha256: f.sources_sha256, reviewed_by: 'Source reviewer', decision: 'Research-qualified', identity_note: 'The fictional identity and location match the approved test evidence.', operating_status: 'Active', operating_evidence: { url: source.url, excerpt: 'Friday pickup', context_id: 'pickup' }, opportunity_index: 0, contact: { url: source.url, email: '' }, rationale: 'A tailored addition supports a discovery conversation; goals, budget and interest remain unknown.', next_action: 'Prepare one enhancement idea and a short goals question when launch prerequisites are ready.', observations: [{ index: 0, supported: true, note: 'The observed DM/pickup context supports the basis without an allegation of failure.' }], journey_checks: candidate.journey_checks.map((c, index) => ({ index, area: c.area, supported: true, note: 'The finding is either scoped to the captured route or explicitly unknown.' })) };
  validateDecision(decision, f, () => new Date(`${job.as_of}T13:00:00Z`));
  assert.throws(() => validateDecision({ ...decision, operating_status: 'Unverified' }, f, () => new Date(`${job.as_of}T13:00:00Z`)), /active/i);
  assert.throws(() => validateDecision({ ...decision, contact: { url: 'https://uncaptured.example/', email: '' } }, f, () => new Date(`${job.as_of}T13:00:00Z`)), /contact/i);
});

test('a paused or changed inbox during website collection cannot dispatch a worker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-detailed-pause-')), fake = sheet();
  const p = structuredClone(packet);
  p.job = { ...job, website: 'https://cakes.example/', seed_urls: ['https://cakes.example/'] };
  p.discovery.source_url = p.job.website; p.discovery.website_check.status = 'Verified site';
  p.captures = { reviewed_by: 'Source reviewer', sources: [], http_urls: p.job.seed_urls, failures: [] };
  fake.inbox.push([job.id, job.business_name, p.discovery.category, p.discovery.area, p.discovery.channel, p.worker, 'Ready', JSON.stringify(p)]);
  await assert.rejects(watchJob({ directory, queue: fake.queue, jobId: job.id, intakeResearch: true, now: () => new Date(`${job.as_of}T13:00:00Z`), collectSources: async () => {
    fake.inbox[0][6] = 'Pause';
    const body = 'Existing public enquiry form and pickup details. '.repeat(10);
    return { sources: [{ ...source, url: p.job.website, text: body, reviewed_context: undefined, kind: 'business', capture_method: 'http', coverage: 'full', content_sha256: createHash('sha256').update(body).digest('hex') }], failures: [] };
  }, invoke: async () => assert.fail('A changed intake must not invoke a worker') }), /changed|dispatch/i);
  assert.equal(fake.rows.length, 0); assert.equal(fake.writes.length, 0);
});

test('recheck linkage cannot waive duplicates for a running, different or unknown prior business', async () => {
  for (const kind of ['running', 'different', 'unknown']) {
    const fake = sheet(), prior = ['prior-fixture', job.business_name, '', job.seed_urls.join('\n'), 'claude', 'Ready', job.purpose, kind === 'running' ? 'Running' : 'Complete'];
    fake.rows.push(prior);
    await assert.rejects(fake.queue.intakeJob({ ...job, ...(kind === 'different' ? { business_name: 'Another business' } : {}) }, 'codex', kind === 'unknown' ? 'unknown-prior' : prior[0]), /recheck|completed|duplicate/i);
    assert.equal(fake.writes.length, 0);
  }
});

test('context import rejects uncaptured anchors, excessive copying, undated inspections and invented publication dates', () => {
  for (const mutate of [s => { s.reviewed_context.facts[0].excerpt = 'Guaranteed instant responses'; }, s => { s.text += ' extra'.repeat(26); }, s => { s.reviewed_context.inspected_at = 'unknown'; }, s => { s.reviewed_context.facts[0].published_at = '2030-01-01'; }, s => { s.reviewed_context.scope = ''; }]) {
    const changed = structuredClone(source); mutate(changed); changed.content_sha256 = sourceContentHash(changed);
    assert.throws(() => validateSnapshots({ ...snapshots, sources: [changed] }, job), /context|anchor|date|inspection|scope|quote/i);
  }
});

test('quote budgets count actual words rather than form punctuation or collector link markers', () => {
  const excerpts = ['First Name * Last Name * Email * Phone * Address *', 'We will get back to you as soon as possible.', '$30 OFF YOUR FIRST CLEANING'];
  const body = excerpts.join('\n') + '\n' + 'Existing public customer information. '.repeat(8);
  const raw = { ...source, reviewed_context: undefined, kind: 'business', coverage: 'full', capture_method: 'http', text: body, content_sha256: createHash('sha256').update(body).digest('hex') };
  const r = structuredClone(report); r.sources[0].content_sha256 = raw.content_sha256;
  r.observations = excerpts.map((excerpt, i) => ({ fact: 'Scoped fictional page observation '+i, source_urls: [source.url], evidence: [{ url: source.url, excerpt, context_id: '' }] }));
  validateEvidence(r, job, true, { sources: [raw], failures: [] }); // 22 actual words, 27 whitespace tokens.
  const markers = Array.from({length:16},(_,i)=>`a${i} [/${i}]`).join('\n');
  raw.text = markers+'\n'+body; raw.content_sha256 = createHash('sha256').update(raw.text).digest('hex'); r.sources[0].content_sha256 = raw.content_sha256;
  r.observations = [{ fact: 'Sixteen fictional service areas are listed.', source_urls: [source.url], evidence: [{ url:source.url, excerpt:markers, context_id:'' }] }];
  validateEvidence(r, job, true, {sources:[raw],failures:[]});
  const tooMany=Array.from({length:26},(_,i)=>'w'+i).join(' ');
  raw.text=tooMany+'\n'+body;raw.content_sha256=createHash('sha256').update(raw.text).digest('hex');r.sources[0].content_sha256=raw.content_sha256;
  r.observations[0].evidence[0].excerpt=tooMany;
  assert.throws(()=>validateEvidence(r,job,true,{sources:[raw],failures:[]}),/quote/i);
});

test('literal anchors remain citable beside reviewed context but cannot become a primary opportunity basis', () => {
  const literal = structuredClone(report);
  literal.observations[0] = { fact: 'The captured text includes Friday pickup.', source_urls: [source.url], evidence: [{url:source.url,excerpt:'Friday pickup',context_id:''}] };
  validateEvidence(literal,job,true,snapshots);
  literal.recommendation='Suitable to discuss';
  literal.opportunities=[{observed_basis:literal.observations[0].fact,possible_effect:'Unconfirmed benefit.',proposed_solution:'Discuss pickup needs.',service_area:'systems',confidence:'hypothesis',owner_question:'Does this workflow need improvement?',existing_alternatives:['Existing pickup wording'],validation_needed:'Confirm an actual need before proposing anything.'}];
  assert.throws(()=>validateEvidence(literal,job,true,snapshots),/primary|opportunit/i);
});
