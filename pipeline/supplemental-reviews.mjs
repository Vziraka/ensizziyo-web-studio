import { createHash } from 'node:crypto';

const check = (condition, message) => { if (!condition) throw Error(message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const normalizedName = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const contactValue = value => String((value && typeof value === 'object' ? value.value : value) ?? '');

// Pinned to the six owner-delivered Library files; no prospect details in Git.
export const ownerSupplementalFiles = Object.freeze([
  { name: 'research-review.txt', libraryFileId: 'libfile_c5e4ba0155d8819184106ac0e4ca2e75', size: 45074,
    sha256: '57c87c000afb612293a92e2f0f13f15606f6a6592ac7496df6c3a199fbc1e278' },
  { name: 'verification-32.csv', libraryFileId: 'libfile_f364415214c08191b5a9902192127a0f', size: 18973,
    sha256: 'b167027527ffbf7e631d4d3b909ebd4e234df9f361431fa712032f96c2389d07' },
  { name: 'assessments-1.json', libraryFileId: 'libfile_bf01fd7cc01081918dcd8b620a34ff46', size: 110352,
    sha256: '9c9ce5895c21c04c81d578314f1c26f4f878b284cf90a6279133587e5c70c815' },
  { name: 'assessments-2.json', libraryFileId: 'libfile_8fced0c3e6c88191a635fbb06669ab42', size: 90126,
    sha256: 'cfa4cae918b0ab5661d06b735d7cca709b8a0951a0665c9d2d1aea35930194e6' },
  { name: 'assessments-3.json', libraryFileId: 'libfile_3d99a923b63481919d92e5180b39dc90', size: 88905,
    sha256: '4f90c2a426dc3e44f5654e42f68c573a556cd0041dc08cfe6e8e6747f26d3271' },
  { name: 'assessments-4.json', libraryFileId: 'libfile_e7e736bea3bc819199f2a4c7bc7115c0', size: 95454,
    sha256: '1590e9fe3554a40df6c09c14756b2ca90a6fca45ac07cd8c5ed942c10d23233e' }
]);
export const ownerSupplementalImportSha256 =
  '38db06b0f51af9eb5af1b2aa97c4f47fe8411100a0caca3ef150649416c807f4';

function parseCsv(bytes) {
  const input = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') { check(field === '', 'Malformed CSV quote'); quoted = true; }
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  check(!quoted, 'Unclosed CSV quote');
  if (row.length || field) { row.push(field); rows.push(row); }
  const header = ['prospect_id', 'business', 'assessment_status', 'recommendation', 'phone', 'email',
    'substantive_sources', 'source_urls', 'next_checks', 'owner_questions'];
  check(JSON.stringify(rows.shift()) === JSON.stringify(header) && rows.length === 32 &&
    rows.every(r => r.length === header.length), 'CSV must contain the exact 32-row review summary');
  return rows.map(row => Object.fromEntries(header.map((key, i) => [key, row[i]])));
}

function validate(files, state, config, expectedFiles) {
  check(config?.mode === 'production' && state?.mode === 'production' && state.run_id === config.run_id,
    'Use the existing production workspace');
  check(config.research_enabled === false && config.calls_enabled === false && config.outreach_enabled === false &&
    config.connector_writes_enabled === false && config.operations?.enabled === false && config.runtime?.enabled === false &&
    config.transcript_ai?.enabled === false && config.call_release?.approved !== true && config.release?.approved !== true,
    'All execution and release gates must remain off during supplemental review');
  check(Array.isArray(expectedFiles) && expectedFiles.length === 6 && Array.isArray(files) && files.length === 6,
    'Use all six owner-delivered files');
  check(Object.keys(state.prospects ?? {}).length === 50, 'The first-50 scope changed');
  const targets = Object.entries(state.prospects).filter(([, record]) => record.call_lane === 'verification');
  check(targets.length === 32 && Object.values(state.prospects).filter(r =>
    r.call_lane !== 'verification' && r.qualification?.verdict === 'Research-qualified' &&
    r.qualification?.independent_review === 'Accepted').length === 18, 'The accepted research/verification lanes changed');
  const byName = new Map(files.map(file => [file.name, file]));
  check(byName.size === 6, 'Duplicate or missing artifact');
  const receipts = expectedFiles.map(expected => {
    const file = byName.get(expected.name);
    check(file?.libraryFileId === expected.libraryFileId && Buffer.isBuffer(file.bytes) &&
      file.bytes.length === expected.size && sha256(file.bytes) === expected.sha256,
    `File identity, size or SHA-256 mismatch: ${expected.name}`);
    return { name: expected.name, library_file_id: expected.libraryFileId, size_bytes: expected.size,
      sha256: expected.sha256 };
  });
  const csv = parseCsv(byName.get('verification-32.csv').bytes);
  const entries = [];
  for (let part = 1; part <= 4; part++) {
    const name = `assessments-${part}.json`, document = JSON.parse(byName.get(name).bytes.toString('utf8'));
    check(document?.summary?.assessment_count === 32 && document.summary.recommendation_counts?.Hold === 28 &&
      document.summary.recommendation_counts?.['Research-qualified'] === 4 &&
      Array.isArray(document.records) && document.records.length === 8, 'Assessment part changed approved scope');
    for (const [index, record] of document.records.entries())
      entries.push({ record, file: receipts[part + 1], index });
  }
  const csvById = new Map(csv.map(row => [row.prospect_id, row]));
  check(csvById.size === 32, 'CSV contains duplicate targets');
  const seen = new Set(), counts = { Hold: 0, 'Research-qualified': 0 };
  for (const { record } of entries) {
    check(typeof record?.prospect_id === 'string' && !seen.has(record.prospect_id), 'Duplicate or missing review target');
    seen.add(record.prospect_id);
    const target = state.prospects[record.prospect_id], row = csvById.get(record.prospect_id);
    check(target?.call_lane === 'verification' && normalizedName(target.name) === normalizedName(record.business) &&
      row?.business === record.business && row.assessment_status === record.assessment_status &&
      row.recommendation === record.recommendation && row.phone === contactValue(record.contacts?.phone) &&
      row.email === contactValue(record.contacts?.email) &&
      Number(row.substantive_sources) === record.substantive_source_count,
    'CSV, assessment and existing verification card do not match');
    check(['Hold', 'Research-qualified'].includes(record.recommendation) &&
      record.independent_review?.decision === record.recommendation &&
      record.independent_review?.operational_write === false &&
      normalizedName(record.independent_review?.business) === normalizedName(record.business) &&
      typeof record.independent_review?.reviewer === 'string' && record.independent_review.reviewer.trim(),
    'Independent source review and advisory decision must match');
    check(Array.isArray(record.sources) && record.sources.length > 0 &&
      Array.isArray(record.observations) && record.observations.length > 0 &&
      Array.isArray(record.journey_checks) && record.journey_checks.length > 0 &&
      /^[a-f0-9]{64}$/i.test(record.draft_sha256 ?? ''), 'Retained assessment structure is incomplete');
    counts[record.recommendation]++;
  }
  check(targets.every(([id]) => seen.has(id)) && counts.Hold === 28 && counts['Research-qualified'] === 4,
    'Assessment recommendation or target coverage changed');
  const receipt = { status: 'Supplemental advisory review', records: 32, existing_verification_cards: 32,
    accepted_research_cards_preserved: 18, advisory_recommendations: counts, files: receipts,
    qualification_changed: false, contact_released: false, source_content_revalidated: false };
  return { receipt, entries };
}

export function inspectSupplementalReviews(files, state, config, expectedFiles = ownerSupplementalFiles) {
  return validate(files, state, config, expectedFiles).receipt;
}

// Build an immutable sidecar. No lifecycle state, prospect, event, action,
// controller reservation or execution gate is changed by this function.
export function buildSupplementalReviewLedger(files, state, config, existing = null,
  expectedFiles = ownerSupplementalFiles) {
  const { receipt, entries } = validate(files, state, config, expectedFiles);
  const records = Object.fromEntries(entries.map(({ record, file, index }) => [record.prospect_id, {
    recommendation: record.recommendation, assessment: record,
    source_file_sha256: file.sha256, library_file_id: file.library_file_id, record_index: index,
    assessment_sha256: sha256(Buffer.from(JSON.stringify(record)))
  }]));
  const binding = { files: receipt.files, records };
  const ledger = { schema_version: 1, kind: 'sosa-supplemental-advisory', run_id: state.run_id,
    base_prospects: 50, base_research_accepted: 18, base_verification: 32,
    advisory_recommendations: receipt.advisory_recommendations, qualification_changed: false,
    contact_released: false, files: receipt.files, records,
    import_sha256: sha256(Buffer.from(JSON.stringify(binding))) };
  if (expectedFiles === ownerSupplementalFiles)
    check(ledger.import_sha256 === ownerSupplementalImportSha256, 'Owner-pinned supplemental import digest changed');
  if (existing) {
    check(existing.schema_version === 1 && existing.kind === ledger.kind &&
      existing.import_sha256 === sha256(Buffer.from(JSON.stringify({ files: existing.files, records: existing.records }))),
    'Existing supplemental ledger is malformed or has a broken content hash');
    check(existing.import_sha256 === ledger.import_sha256 && JSON.stringify(existing) === JSON.stringify(ledger),
      'Existing supplemental ledger conflicts with this import');
    return { ledger: existing, receipt, duplicate: true };
  }
  return { ledger, receipt, duplicate: false };
}

export function verifySupplementalReviewLedger(ledger, state, expectedFiles = ownerSupplementalFiles,
  expectedImportSha256 = ownerSupplementalImportSha256) {
  check(ledger?.schema_version === 1 && ledger.kind === 'sosa-supplemental-advisory' &&
    ledger.run_id === state?.run_id && ledger.base_prospects === 50 &&
    ledger.base_research_accepted === 18 && ledger.base_verification === 32 &&
    ledger.qualification_changed === false && ledger.contact_released === false,
  'Supplemental ledger is not an advisory first-50 import');
  // The sidecar is bound to its 32 original targets below; later cards are unrelated.
  check(Object.keys(state.prospects ?? {}).length >= ledger.base_prospects,
  'Supplemental ledger is stale for the current cards');
  check(Array.isArray(ledger.files) && ledger.files.length === expectedFiles.length &&
    expectedFiles.every((expected, i) => {
      const file = ledger.files[i];
      return file?.name === expected.name && file.library_file_id === expected.libraryFileId &&
        file.size_bytes === expected.size && file.sha256 === expected.sha256;
    }), 'Supplemental ledger file identities changed');
  const pinnedImportSha256 = expectedFiles === ownerSupplementalFiles
    ? ownerSupplementalImportSha256 : expectedImportSha256;
  check(ledger.import_sha256 === pinnedImportSha256,
    'Supplemental ledger differs from the pinned owner import');
  check(ledger.records && Object.keys(ledger.records).length === 32, 'Supplemental ledger target count changed');
  const counts = { Hold: 0, 'Research-qualified': 0 };
  for (const [id, entry] of Object.entries(ledger.records)) {
    const target = state.prospects[id], assessment = entry?.assessment;
    check(target?.call_lane === 'verification' && assessment?.prospect_id === id &&
      normalizedName(target.name) === normalizedName(assessment.business) &&
      entry.recommendation === assessment.recommendation &&
      assessment.independent_review?.decision === assessment.recommendation &&
      assessment.independent_review?.operational_write === false &&
      /^[a-f0-9]{64}$/.test(entry.assessment_sha256 ?? '') &&
      entry.assessment_sha256 === sha256(Buffer.from(JSON.stringify(assessment))),
    'Supplemental ledger assessment binding changed');
    const source = ledger.files.slice(2).find(file =>
      file.library_file_id === entry.library_file_id && file.sha256 === entry.source_file_sha256);
    check(source && Number.isInteger(entry.record_index) && entry.record_index >= 0 && entry.record_index < 8,
      'Supplemental ledger source file binding changed');
    check(Object.hasOwn(counts, entry.recommendation), 'Unsupported supplemental recommendation');
    counts[entry.recommendation]++;
  }
  check(counts.Hold === 28 && counts['Research-qualified'] === 4 &&
    JSON.stringify(counts) === JSON.stringify(ledger.advisory_recommendations) &&
    ledger.import_sha256 === sha256(Buffer.from(JSON.stringify({ files: ledger.files, records: ledger.records }))),
  'Supplemental ledger decision count or content hash changed');
  return ledger;
}
