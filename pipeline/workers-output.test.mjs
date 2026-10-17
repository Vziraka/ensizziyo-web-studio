import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkerOutput } from './workers.mjs';

test('direct independent-review JSON is parsed without requiring a top-level research version', () => {
  for (const verdict of ['Accepted', 'Revise']) {
    const result = { verdict, corrections: verdict === 'Accepted' ? [] : ['Check the source.'], decision: { schema_version: 1, decision: 'Hold' } };
    assert.deepEqual(parseWorkerOutput(JSON.stringify(result)), result);
  }
});

test('provider errors and incomplete objects cannot masquerade as direct review results', () => {
  assert.throws(() => parseWorkerOutput(JSON.stringify({ is_error: true, verdict: 'Accepted', decision: {} })));
  assert.throws(() => parseWorkerOutput(JSON.stringify({ verdict: 'Accepted' })));
  assert.throws(() => parseWorkerOutput(JSON.stringify({ verdict: 'Accepted', decision: null })));
});
