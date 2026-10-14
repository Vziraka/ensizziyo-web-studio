import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleQueue } from './google.mjs';
import { intakeCandidate, reviewTemplate, reviewCandidate, validateDecision } from './prospects.mjs';
import { watchJob, executeJob } from './runner.mjs';
import { backupJob, restoreBackup } from './backup.mjs';

function sheet() {
  const rows = [], inbox = [], prospects = [['Prospect ID', 'Business', 'Route', 'Website / source', 'Area / service', 'Observed opportunity', 'Contact / channel', 'Stage', 'Last contact', 'Next action', 'Next action date', 'Do not contact', 'Draft / proposal link', 'Quoted amount (USD)', 'Cash received (USD)', 'Notes']], writes = [];
  const queue = new GoogleQueue({ spreadsheetId: 'fixture', request: async ({ method, url, data }) => {
    const range = decodeURIComponent(url.split('/values/')[1]?.split('?')[0] ?? '');
    const target = range.startsWith("'Prospects'") ? prospects : range.startsWith("'Discovery intake'") ? inbox : rows;
    if (method === 'PUT') {
      writes.push(range);
      const [, column, number] = range.match(/!([AHIL])(\d+)/);
      const index = Number(number) - (target === prospects ? 1 : 2);
      if (column === 'A') target[index] = data.values[0];
      else { for (let i = 0; i < data.values[0].length; i++) target[index][i + ({ H: 7, I: 8, L: 11 }[column])] = data.values[0][i]; }
      return { data: {} };
    }
    if (range.endsWith('A2:P1000')) return { data: { values: rows } };
    if (range.endsWith('A2:K1000')) return { data: { values: inbox } };
    if (range.endsWith('A2:M1000')) return { data: { values: inbox } };
    if (range === "'Prospects'!A1:P101") return { data: { values: prospects } };
    const [, column, number] = range.match(/!([AHIL])(\d+)/);
    const index = Number(number) - (target === prospects ? 1 : 2);
    return { data: { values: [column === 'H' ? target[index].slice(7, 16) : column === 'I' ? target[index].slice(8, 11) : column === 'L' ? target[index].slice(11, 13) : target[index] ?? []] } };
  } });
  return { queue, rows, prospects, inbox, writes };
}
const now = () => new Date('2026-10-14T14:00:00Z');
const packet = {
  schema_version: 1,
  job: { id: 'discovery-fixture', business_name: 'Example Cakes', website: '', seed_urls: ['https://www.instagram.com/examplecakes/'], as_of: '2026-10-14', research_version: 2 },
  worker: 'codex',
  discovery: { channel: 'Instagram', query: 'Fairfax custom cakes', category: 'Custom cakes', area: 'Fairfax, VA', source_url: 'https://www.instagram.com/examplecakes/', website_check: { status: 'No verified site found', searches: ['Example Cakes Fairfax website', 'Example Cakes public bio links'], note: 'Bounded search and public bio checked; absence remains unconfirmed.' } },
  captures: { reviewed_by: 'Source reviewer', sources: [{ url: 'https://www.instagram.com/examplecakes/', checked_at: '2026-10-14', fetched_at: '2026-10-14T13:00:00Z', text: 'Example Cakes serves Fairfax. Now accepting November orders. Send date, servings and inspiration by email to orders@example.com. Custom quotes are discussed before confirmation.', kind: 'social', capture_method: 'reviewed_page', coverage: 'full', identity_note: 'Business name and Fairfax service area matched to the public business listing.' }], failures: [] }
};

test('discovery intake saves reviewed evidence once and publishes one verified Ready job', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-intake-')), fake = sheet();
  const result = await intakeCandidate({ directory, queue: fake.queue, packet, now });
  assert.equal(result.job_id, packet.job.id);
  assert.equal(fake.rows[0][5], 'Ready');
  assert.equal(fake.rows[0][2], '');
  assert.equal((JSON.parse(await readFile(join(directory, packet.job.id, 'sources.json')))).sources[0].content_sha256.length, 64);
  await intakeCandidate({ directory, queue: fake.queue, packet, now });
  assert.equal(fake.writes.length, 1, 'An identical replay must not append or rewrite');
  const changed = structuredClone(packet); changed.captures.sources[0].text += ' Changed scope.';
  await assert.rejects(intakeCandidate({ directory, queue: fake.queue, packet: changed, now }), /new job ID|changed/i);
  assert.equal(fake.writes.length, 1);
});

async function assessed() {
  const directory = await mkdtemp(join(tmpdir(), 'studio-prospect-')), fake = sheet();
  await intakeCandidate({ directory, queue: fake.queue, packet, now });
  const saved = JSON.parse(await readFile(join(directory, packet.job.id, 'sources.json')));
  const basis = 'The business requests date, servings and inspiration by email for a custom quote.';
  const source = saved.sources[0];
  const checkpoint = { schema_version: 2, job_id: packet.job.id, business_name: packet.job.business_name, sources: [{ url: source.url, checked_at: source.checked_at, content_sha256: source.content_sha256, facts: [basis] }], unknowns: ['Budget, urgency and internal workflow are unconfirmed.'] };
  const report = { ...checkpoint, checkpoint_reused: true, observations: [{ fact: basis, source_urls: [source.url], evidence: [{ url: source.url, excerpt: 'Send date, servings and inspiration by email' }] }], opportunities: [{ observed_basis: basis, possible_effect: 'A structured intake might reduce clarification; owner confirmation is needed.', proposed_solution: 'Discuss a short quote-request form using the existing email workflow.', service_area: 'systems', confidence: 'hypothesis', owner_question: 'Do you spend time asking for missing order details?', existing_alternatives: ['Existing email ordering'], validation_needed: 'Confirm whether missing details cause work and whether a form is wanted.' }], public_contact_routes: [source.url], recommendation: 'Suitable to discuss' };
  await watchJob({ directory, queue: fake.queue, jobId: packet.job.id, qualityResearch: true, now, invoke: async ({ phase }) => phase === 'collect' ? checkpoint : report });
  const decision = await reviewTemplate({ directory, jobId: packet.job.id });
  Object.assign(decision, { reviewed_by: 'Independent source reviewer', decision: 'Research-qualified', identity_note: 'Name and Fairfax service area match the captured business profile.', operating_status: 'Active', operating_evidence: { url: source.url, excerpt: 'Now accepting November orders' }, opportunity_index: 0, contact: { url: source.url, email: 'orders@example.com' }, rationale: 'The explicit intake workflow supports a discovery question, with benefit unconfirmed.', next_action: 'Prepare a discovery draft after the launch prerequisites are met.' });
  decision.observations[0] = { index: 0, supported: true, note: 'The source explicitly lists the three details requested by email; no loss or workload is asserted.' };
  return { directory, fake, decision };
}

test('a hash-bound accepted review adds one research record with no sending or payment state', async () => {
  const { directory, fake, decision } = await assessed();
  const result = await reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision, now });
  assert.equal(result.decision, 'Research-qualified');
  assert.equal(fake.prospects[1][7], 'Research');
  assert.equal(fake.prospects[1][6], 'orders@example.com');
  assert.deepEqual(fake.prospects[1].slice(12, 15), ['', '', '']);
  assert.ok(fake.prospects[1][15].includes('No sending authorized'));
  const count = fake.writes.length;
  await reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision, now });
  assert.equal(fake.writes.length, count, 'A decision replay should not rewrite either record');
});

test('stale, unsupported and guessed-contact decisions cannot create a prospect', async () => {
  const { directory, fake, decision } = await assessed();
  for (const mutate of [d => { d.report_sha256 = '0'.repeat(64); }, d => { d.attempt_id = 'old-attempt'; }, d => { d.observations[0].supported = false; }, d => { d.contact.email = 'guessed@example.com'; }, d => { d.operating_status = 'Unverified'; }]) {
    const invalid = structuredClone(decision); mutate(invalid);
    await assert.rejects(reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision: invalid, now }));
    assert.equal(fake.prospects.length, 1);
  }
  const reportPath = join(directory, packet.job.id, 'report.json');
  const report = JSON.parse(await readFile(reportPath)); report.unknowns.push('Later edit'); await writeFile(reportPath, JSON.stringify(report));
  await assert.rejects(reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision, now }), /hash|changed/i);
});

test('a shared discovery packet is acknowledged before automatic subscription assessment', async () => {
  const { directory: existing, decision } = await assessed();
  const checkpoint = JSON.parse(await readFile(join(existing, packet.job.id, 'checkpoint.json')));
  const report = JSON.parse(await readFile(join(existing, packet.job.id, 'report.json')));
  const directory = await mkdtemp(join(tmpdir(), 'studio-shared-intake-')), fake = sheet();
  fake.inbox.push([packet.job.id, packet.job.business_name, packet.discovery.category, packet.discovery.area, packet.discovery.channel, packet.worker, 'Ready', JSON.stringify(packet)]);
  const phases = [];
  await watchJob({ directory, queue: fake.queue, jobId: packet.job.id, intakeResearch: true, now, invoke: async ({ phase }) => {
    assert.equal(fake.inbox[0][8], 'Queued'); phases.push(phase); return phase === 'collect' ? checkpoint : report;
  } });
  assert.deepEqual(phases, ['collect', 'assess']);
  assert.equal(fake.rows[0][7], 'Complete');
  assert.ok(!fake.rows[0][15].includes('CONTROLLED PROOF'));
  await reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision: { ...decision, attempt_id: (await reviewTemplate({ directory, jobId: packet.job.id })).attempt_id }, now });
});

test('mismatched shared fields or an uncertain handoff stop before a model call', async () => {
  for (const mismatch of [true, false]) {
    const directory = await mkdtemp(join(tmpdir(), 'studio-invalid-intake-')), fake = sheet();
    fake.inbox.push([packet.job.id, mismatch ? 'Wrong business' : packet.job.business_name, packet.discovery.category, packet.discovery.area, packet.discovery.channel, packet.worker, 'Ready', JSON.stringify(packet)]);
    if (!mismatch) {
      const original = fake.queue.values.bind(fake.queue);
      fake.queue.values = async range => range.includes('!I2:K2') ? [['Uncertain']] : original(range);
    }
    await assert.rejects(watchJob({ directory, queue: fake.queue, jobId: packet.job.id, intakeResearch: true, now, invoke: async () => assert.fail('Unverified handoff cannot invoke a worker') }), /differs|Uncertain/i);
  }
});

test('hold decisions stay out of Prospects, and existing commercial edits are never overwritten', async () => {
  const held = await assessed();
  const decision = { ...held.decision, decision: 'Hold', operating_status: 'Unverified', operating_evidence: null, opportunity_index: null, contact: { url: '', email: '' }, rationale: 'Verify current operation before qualification.' };
  await reviewCandidate({ directory: held.directory, queue: held.fake.queue, jobId: packet.job.id, decision, now });
  assert.equal(held.fake.prospects.length, 1);
  assert.ok(held.fake.rows[0][15].includes('Hold.'));
  const accepted = await assessed();
  await reviewCandidate({ directory: accepted.directory, queue: accepted.fake.queue, jobId: packet.job.id, decision: accepted.decision, now });
  accepted.fake.prospects[1][11] = 'Yes'; accepted.fake.prospects[1][7] = 'Paused'; accepted.fake.prospects[1][15] = 'Owner declined.';
  await assert.rejects(reviewCandidate({ directory: accepted.directory, queue: accepted.fake.queue, jobId: packet.job.id, decision: accepted.decision, now }), /overwrite|changed/i);
  assert.equal(accepted.fake.prospects[1][11], 'Yes'); assert.equal(accepted.fake.prospects[1][15], 'Owner declined.');
});

test('private restore retains discovery and qualification without a new worker or prospect write', async () => {
  const { directory, fake, decision } = await assessed();
  await reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision, now });
  const output = join(directory, 'backup.json'), destination = join(directory, 'restored');
  assert.equal((await backupJob({ directory, jobId: packet.job.id, output })).files, 8);
  await restoreBackup({ input: output, destination });
  const restored = await reviewTemplate({ directory: destination, jobId: packet.job.id });
  assert.equal(restored.sources_sha256, decision.sources_sha256);
  assert.equal(JSON.parse(await readFile(join(destination, packet.job.id, 'qualification.json'))).decision, 'Research-qualified');
});

test('a failed assessment can be explicitly corrected and its feedback retained before qualification', async () => {
  const example = await assessed();
  const checkpoint = JSON.parse(await readFile(join(example.directory, packet.job.id, 'checkpoint.json')));
  const report = JSON.parse(await readFile(join(example.directory, packet.job.id, 'report.json')));
  const directory = await mkdtemp(join(tmpdir(), 'studio-review-recovery-')), fake = sheet();
  await intakeCandidate({ directory, queue: fake.queue, packet, now });
  await assert.rejects(watchJob({ directory, queue: fake.queue, jobId: packet.job.id, qualityResearch: true, now, invoke: async ({ phase }) => { if (phase === 'assess') throw Error('Evidence contract failed'); return checkpoint; } }), /contract/);
  const state = JSON.parse(await readFile(join(directory, packet.job.id, 'state.json')));
  await writeFile(join(directory, packet.job.id, 'review.json'), JSON.stringify({ attempt_id: state.attempt_id, verdict: 'Needs review', notes: ['Shorten the evidence excerpts without changing the observations.'] }));
  await executeJob({ directory, queue: fake.queue, jobId: packet.job.id, worker: 'codex', revisionNotes: ['Shorten excerpts.'], invoke: async ({ phase }) => { assert.equal(phase, 'assess'); return report; } });
  const decision = { ...example.decision, attempt_id: (await reviewTemplate({ directory, jobId: packet.job.id })).attempt_id };
  await reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision, now });
  assert.equal(fake.prospects.length, 2);
});

test('prospect writes reconcile a lost response once and refuse stale directory contact details', async () => {
  const { directory, fake, decision } = await assessed();
  const original = fake.queue.write.bind(fake.queue);
  let committed = 0;
  fake.queue.write = async (range, values) => { const r = await original(range, values); if (range.startsWith("'Prospects'")) { committed++; throw Error('Response lost after commit'); } return r; };
  const result = await reviewCandidate({ directory, queue: fake.queue, jobId: packet.job.id, decision, now });
  assert.equal(result.prospect.reconciled, true); assert.equal(committed, 1); assert.equal(fake.prospects.length, 2);
  const target = join(directory, packet.job.id);
  const f = { job: JSON.parse(await readFile(join(target, 'job.json'))), state: JSON.parse(await readFile(join(target, 'state.json'))), report: JSON.parse(await readFile(join(target, 'report.json'))), snapshots: JSON.parse(await readFile(join(target, 'sources.json'))), report_sha256: decision.report_sha256, sources_sha256: decision.sources_sha256 };
  const url = 'https://directory.example/bakery';
  f.snapshots.sources.push({ ...f.snapshots.sources[0], url, kind: 'directory' }); f.report.public_contact_routes.push(url);
  assert.throws(() => validateDecision({ ...decision, contact: { url, email: decision.contact.email } }, f, now), /first-party/);
});
