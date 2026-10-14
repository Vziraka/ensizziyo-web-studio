import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateJob, validateSnapshots } from './sources.mjs';
import { validateEvidence, validate, schemasFor } from './schemas.mjs';
import { researchPrompt } from './workers.mjs';
import { readReviewedSources } from './captures.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoogleQueue } from './google.mjs';
import { watchJob } from './runner.mjs';
import { backupJob, restoreBackup } from './backup.mjs';
import { runJob } from './engine.mjs';

const job = { research_version: 2, id: 'quality-fixture', business_name: 'Example Bakery', website: '', as_of: '2026-10-14', seed_urls: ['https://www.instagram.com/examplebakery/', 'https://directory.example/bakery'], purpose: 'Pause quota restore proof' };
const text = 'Example Bakery in Fairfax. Fresh bread and custom cakes. DM to order. Menu and prices in Highlights. Email orders@example.com. No standalone website has been verified by this capture.';
const content_sha256 = createHash('sha256').update(text).digest('hex');
const snapshots = { sources: [{ url: job.seed_urls[0], checked_at: job.as_of, fetched_at: `${job.as_of}T12:00:00Z`, content_sha256, text, kind: 'social', capture_method: 'reviewed_page', coverage: 'partial', identity_note: 'Business name and Fairfax location checked against its public listing.' }], failures: [] };
const checkpoint = { schema_version: 2, job_id: job.id, business_name: job.business_name, sources: [{ url: job.seed_urls[0], checked_at: job.as_of, content_sha256, facts: ['The public bio directs customers to DM orders.'] }], unknowns: ['No standalone website has been verified.'] };
const report = { ...checkpoint, checkpoint_reused: true, observations: [{ fact: 'The public bio directs customers to DM orders.', source_urls: [job.seed_urls[0]], evidence: [{ url: job.seed_urls[0], excerpt: 'DM to order' }] }], opportunities: [], public_contact_routes: [job.seed_urls[0]], recommendation: 'Insufficient evidence' };

test('version 2 accepts a blank website and explicitly reviewed partial social evidence', () => {
  validateJob(job); validateSnapshots(snapshots, job);
  validateEvidence(checkpoint, job, false, snapshots);
  assert.equal(validateEvidence(report, job, true, snapshots).recommendation, 'Insufficient evidence');
  assert.throws(() => validateJob({ ...job, website: 'https://www.facebook.com/examplebakery/' }), /standalone website/i);
});

test('invented evidence excerpts and uncaptured contact routes cannot pass the quality contract', () => {
  const invented = structuredClone(report); invented.observations[0].evidence[0].excerpt = 'We lose orders every day';
  assert.throws(() => validateEvidence(invented, job, true, snapshots), /excerpt/i);
  assert.throws(() => validateEvidence({ ...report, public_contact_routes: ['https://unknown.example/contact'] }, job, true, snapshots), /contact/i);
});

test('partial or directory-only evidence cannot qualify a business or create an opportunity', () => {
  assert.throws(() => validateEvidence({ ...report, recommendation: 'Suitable to discuss' }, job, true, snapshots), /evidence|opportunit/i);
  const directory = { sources: snapshots.sources.map(s => ({ ...s, kind: 'directory', coverage: 'full' })), failures: [] };
  assert.throws(() => validateEvidence({ ...report, recommendation: 'No strong public case' }, job, true, directory), /limited|evidence/i);
});

test('external evidence without an identity check and login-wall text are refused', () => {
  const missing = structuredClone(snapshots); delete missing.sources[0].identity_note;
  assert.throws(() => validateSnapshots(missing, job), /identity/i);
  const blocked = structuredClone(snapshots); blocked.sources[0].text = 'Log in to Facebook to see more. '.repeat(10); blocked.sources[0].content_sha256 = createHash('sha256').update(blocked.sources[0].text).digest('hex');
  assert.throws(() => validateSnapshots(blocked, job), /blocked|login/i);
});

test('operational job purpose is absent from the actual model request', () => {
  const prompt = researchPrompt({ phase: 'assess', job, checkpoint, snapshots });
  assert.ok(!prompt.includes(job.purpose));
  assert.ok(prompt.includes(job.business_name));
});

test('reviewed captures reject stale, altered and unidentified evidence before invocation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studio-capture-test-')), path = join(directory, 'captures.json');
  const pack = { reviewed_by: 'Source reviewer', ...snapshots };
  await writeFile(path, JSON.stringify(pack));
  assert.deepEqual(await readReviewedSources(path, job), pack);
  for (const mutate of [p => { delete p.reviewed_by; }, p => { p.sources[0].checked_at = '2020-01-01'; }, p => { p.sources[0].text += 'altered'; }, p => { p.sources[0].fetched_at = `${job.as_of}Tnot-a-date`; }]) {
    const invalid = structuredClone(pack); mutate(invalid); await writeFile(path, JSON.stringify(invalid));
    await assert.rejects(readReviewedSources(path, job), /operator|integrity/i);
  }
});

test('a complete primary page does not promote an opportunity supported only by an unclaimed directory', () => {
  const primary = { ...snapshots.sources[0], url: job.seed_urls[1], kind: 'business', coverage: 'full' };
  const mixed = { sources: [{ ...snapshots.sources[0], kind: 'directory' }, primary], failures: [] };
  const candidate = { ...report, sources: [...report.sources, { ...report.sources[0], url: primary.url }], recommendation: 'Suitable to discuss', opportunities: [{ observed_basis: report.observations[0].fact, possible_effect: 'Possible order friction; unconfirmed.', proposed_solution: 'Discuss ordering needs.', service_area: 'systems', confidence: 'hypothesis', owner_question: 'Does DM ordering meet your needs?', existing_alternatives: ['DM orders'], validation_needed: 'Confirm owner pain first.' }] };
  assert.throws(() => validateEvidence(candidate, job, true, mixed), /primary|opportunit/i);
});

test('quality queue pickup keeps blank website, shared control and reviewable evidence through backup/restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-quality-flow-'));
  const row = [job.id, job.business_name, '', job.seed_urls.join('\n'), 'codex', 'Ready', job.purpose];
  const queue = new GoogleQueue({ spreadsheetId: 'fixture', request: async ({ method, url, data }) => {
    if (method === 'PUT') { for (let i = 0; i < 9; i++) row[i + 7] = data.values[0][i]; return { data: {} }; }
    return { data: { values: [decodeURIComponent(url).includes('A2:P1000') ? row : row.slice(7, 16)] } };
  } });
  const calls = [];
  const result = await watchJob({ directory: root, queue, jobId: job.id, qualityResearch: true, now: () => new Date(`${job.as_of}T12:00:00Z`), collectSources: async actualJob => { assert.equal(actualJob.website, ''); assert.equal(actualJob.research_version, 2); return snapshots; }, invoke: async ({ phase }) => { calls.push(phase); return phase === 'collect' ? checkpoint : report; } });
  assert.deepEqual(calls, ['collect', 'assess']); assert.equal(result.state.status, 'Complete');
  assert.equal(row[12], 'Insufficient evidence'); assert.equal(JSON.parse(row[13]).observations[0].evidence[0].excerpt, 'DM to order');
  const output = join(root, 'backup.json'), destination = join(root, 'restored');
  await backupJob({ directory: root, jobId: job.id, output }); await restoreBackup({ input: output, destination });
  await runJob({ directory: join(destination, job.id), worker: 'claude', invoke: async () => assert.fail('Restored version-2 completion must stay cached') });
});

test('limited evidence also constrains generation to the conservative outcome and zero opportunities', () => {
  const schema = schemasFor(job, snapshots).report;
  validate(report, schema);
  assert.throws(() => validate({ ...report, recommendation: 'No strong public case' }, schema), /wrong version\/flag/);
  assert.equal(schema.properties.opportunities.maxItems, 0);
});
