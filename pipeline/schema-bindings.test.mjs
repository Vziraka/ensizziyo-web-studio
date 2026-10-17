import test from 'node:test';
import assert from 'node:assert/strict';
import { schemasFor, validate } from './schemas.mjs';

const job = { id: 'source-binding', business_name: 'Fictional Bakery', research_version: 3 };
const snapshots = { sources: [
  { url: 'https://bakery.example/menu', checked_at: '2026-10-17', content_sha256: 'a'.repeat(64), kind: 'business', capture_method: 'http', coverage: 'full' },
  { url: 'https://bakery.example/contact', checked_at: '2026-10-17', content_sha256: 'b'.repeat(64), kind: 'business', capture_method: 'http', coverage: 'full' }
] };
const checkpoint = () => ({ schema_version: 3, job_id: job.id, business_name: job.business_name,
  sources: snapshots.sources.map(({ url, checked_at, content_sha256 }) => ({ url, checked_at, content_sha256, facts: ['Fictional captured fact.'] })), unknowns: [] });

test('worker output schema binds each source to its retained URL, date and exact checksum', () => {
  const schema = schemasFor(job, snapshots).checkpoint;
  validate(checkpoint(), schema);
  for (const change of [
    value => { value.sources[0].content_sha256 = 'a'.repeat(63); },
    value => { value.sources[0].content_sha256 = 'b'.repeat(64); },
    value => { value.sources[0].checked_at = '2026-10-16'; },
    value => { value.sources[0].url = 'https://unrelated.example/'; },
    value => { value.job_id = 'other-job'; },
    value => { value.business_name = 'Other business'; }
  ]) {
    const value = checkpoint(); change(value);
    assert.throws(() => validate(value, schema));
  }
});

test('bound report source schema rejects a checksum copied from another captured page', () => {
  const schema = schemasFor(job, snapshots).report.properties.sources;
  validate(checkpoint().sources, schema);
  const value = checkpoint().sources; value[1].content_sha256 = value[0].content_sha256;
  assert.throws(() => validate(value, schema));
});
