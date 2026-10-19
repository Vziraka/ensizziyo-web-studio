import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildSupplementalReviewLedger, inspectSupplementalReviews, verifySupplementalReviewLedger } from './supplemental-reviews.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const config = { mode: 'production', run_id: 'synthetic-run', research_enabled: false, calls_enabled: false,
    outreach_enabled: false, connector_writes_enabled: false, operations: { enabled: false }, runtime: { enabled: false },
    transcript_ai: { enabled: false }, call_release: { approved: false }, release: { approved: false } };
  const state = { mode: 'production', run_id: 'synthetic-run', prospects: {}, events: { original: {} },
    actions: { original: {} }, ai_attempts: { original: {} } };
  for (let i = 0; i < 18; i++) state.prospects[`research-${i}`] = {
    id: `research-${i}`, name: `SYNTHETIC Accepted ${i}`,
    qualification: { verdict: 'Research-qualified', independent_review: 'Accepted' } };
  const records = Array.from({ length: 32 }, (_, i) => {
    const id = `verify-${String(i + 1).padStart(2, '0')}`, business = `SYNTHETIC Bakery ${i + 1}`;
    state.prospects[id] = { id, name: business, call_lane: 'verification', stage: 'Ready to verify',
      qualification: { verdict: 'Verification call only' }, note: 'Original note' };
    const recommendation = i < 4 ? 'Research-qualified' : 'Hold';
    return { prospect_id: id, business, assessment_status: 'Source reviewed', recommendation,
      contacts: { phone: { value: '555-0100' }, email: null }, substantive_source_count: 1,
      sources: [{ id: `source-${i}`, text: 'Synthetic source only' }],
      observations: [{ id: `observation-${i}` }], journey_checks: [{ area: 'Synthetic' }],
      draft_sha256: 'a'.repeat(64), independent_review: { business, reviewer: 'SYNTHETIC reviewer',
        decision: recommendation, operational_write: false } };
  });
  const csv = ['prospect_id,business,assessment_status,recommendation,phone,email,substantive_sources,source_urls,next_checks,owner_questions',
    ...records.map(r => [r.prospect_id, r.business, r.assessment_status, r.recommendation,
      '555-0100', '', '1', '', '', ''].join(','))].join('\n') + '\n';
  const names = ['research-review.txt', 'verification-32.csv', 'assessments-1.json', 'assessments-2.json',
    'assessments-3.json', 'assessments-4.json'];
  const contents = ['SYNTHETIC report\n', csv, ...Array.from({ length: 4 }, (_, i) =>
    JSON.stringify({ summary: { assessment_count: 32,
      recommendation_counts: { Hold: 28, 'Research-qualified': 4 } }, records: records.slice(i * 8, (i + 1) * 8) }) + '\n')];
  const files = names.map((name, i) => ({ name, libraryFileId: `libfile_synthetic${i}`, bytes: Buffer.from(contents[i]) }));
  const expected = files.map(f => ({ name: f.name, libraryFileId: f.libraryFileId, size: f.bytes.length,
    sha256: digest(f.bytes) }));
  return { files, expected, state, config };
}

test('a supplemental ledger binds six files and preserves all 50 operational cards', () => {
  const input = fixture(), before = structuredClone({ state: input.state, config: input.config });
  const receipt = inspectSupplementalReviews(input.files, input.state, input.config, input.expected);
  assert.equal(receipt.records, 32);
  assert.deepEqual(receipt.advisory_recommendations, { Hold: 28, 'Research-qualified': 4 });
  const first = buildSupplementalReviewLedger(input.files, input.state, input.config, null, input.expected);
  assert.equal(first.duplicate, false);
  assert.equal(Object.keys(first.ledger.records).length, 32);
  assert.equal(first.ledger.qualification_changed, false);
  assert.equal(first.ledger.contact_released, false);
  assert.deepEqual({ state: input.state, config: input.config }, before);
  const second = buildSupplementalReviewLedger(input.files, input.state, input.config, first.ledger, input.expected);
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.ledger, first.ledger);
});

test('file tampering and CSV/assessment disagreement are rejected before import', () => {
  const input = fixture();
  input.files[3].bytes = Buffer.from(input.files[3].bytes.toString('utf8').replace('SYNTHETIC Bakery 9', 'Different Bakery'));
  assert.throws(() => inspectSupplementalReviews(input.files, input.state, input.config, input.expected), /SHA-256 mismatch/);
  input.expected[3] = { ...input.expected[3], size: input.files[3].bytes.length, sha256: digest(input.files[3].bytes) };
  assert.throws(() => inspectSupplementalReviews(input.files, input.state, input.config, input.expected), /CSV, assessment/);
});

test('active gates, changed cards and claimed operational writes hold the import', () => {
  const input = fixture();
  input.config.calls_enabled = true;
  assert.throws(() => buildSupplementalReviewLedger(input.files, input.state, input.config, null, input.expected), /gates must remain off/);
  input.config.calls_enabled = false;
  input.state.prospects['verify-01'].name = 'Different business';
  assert.throws(() => buildSupplementalReviewLedger(input.files, input.state, input.config, null, input.expected), /CSV, assessment/);
  input.state.prospects['verify-01'].name = 'SYNTHETIC Bakery 1';
  const part = JSON.parse(input.files[2].bytes);
  part.records[0].independent_review.operational_write = true;
  input.files[2].bytes = Buffer.from(JSON.stringify(part) + '\n');
  input.expected[2] = { ...input.expected[2], size: input.files[2].bytes.length, sha256: digest(input.files[2].bytes) };
  assert.throws(() => buildSupplementalReviewLedger(input.files, input.state, input.config, null, input.expected), /advisory decision/);
});

test('a changed or corrupted sidecar cannot masquerade as an idempotent retry', () => {
  const input = fixture(), first = buildSupplementalReviewLedger(input.files, input.state, input.config, null, input.expected);
  assert.equal(verifySupplementalReviewLedger(first.ledger, input.state, input.expected, first.ledger.import_sha256).import_sha256,
    first.ledger.import_sha256);
  const changed = structuredClone(first.ledger);
  changed.records['verify-01'].assessment.business = 'Tampered';
  assert.throws(() => buildSupplementalReviewLedger(input.files, input.state, input.config, changed, input.expected), /broken content hash/);
  assert.throws(() => verifySupplementalReviewLedger(changed, input.state, input.expected, first.ledger.import_sha256), /assessment binding changed/);
  const forged = structuredClone(first.ledger);
  forged.records['verify-01'].assessment.independent_review.reviewer = 'Fabricated reviewer';
  forged.records['verify-01'].assessment_sha256 = digest(Buffer.from(JSON.stringify(forged.records['verify-01'].assessment)));
  forged.import_sha256 = digest(Buffer.from(JSON.stringify({ files: forged.files, records: forged.records })));
  assert.throws(() => verifySupplementalReviewLedger(forged, input.state, input.expected, first.ledger.import_sha256),
    /pinned owner import/);
});

test('the CLI rejects Git checkout output and an extra output-directory argument', () => {
  const cli = join(import.meta.dirname, 'supplemental-reviews-cli.mjs');
  const call = args => {
    try { execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: 'pipe' }); return ''; }
    catch (error) { return String(error.stderr); }
  };
  assert.match(call([import.meta.dirname, import.meta.dirname, '--write-sidecar']), /outside every Git checkout/);
  const escaped = `${import.meta.dirname}/../pipeline`;
  assert.match(call([escaped, import.meta.dirname, '--write-sidecar']), /outside every Git checkout/);
  assert.match(call([import.meta.dirname, import.meta.dirname, import.meta.dirname, '--write-sidecar']), /Usage:/);
  assert.equal(existsSync(join(import.meta.dirname, 'supplemental-reviews.json')), false);
});
