import test from 'node:test';
import assert from 'node:assert/strict';
import { researchCallPrep } from './call-prep.mjs';

test('call preparation selects reviewed facts, preserves unknowns and never infers a missing customer route', () => {
  const f = { job: { business_name: 'FICTIONAL Café' }, snapshots: { sources: [{ url: 'https://example.invalid/menu', fetched_at: '2026-10-17T10:00:00Z' }] }, report: {
    observations: [{ fact: 'Unsupported claim', evidence: [] }, { fact: 'Weekly pickup menu', evidence: [{ url: 'https://example.invalid/menu', excerpt: 'Friday pickup' }] }],
    unknowns: ['Budget is unknown'], opportunities: [{ observed_basis: 'Weekly pickup menu', proposed_solution: 'Explore an optional pickup page.', possible_effect: 'Might clarify requests; validate with the owner.', owner_question: 'Would a pickup page fit your current tools?', existing_alternatives: [], validation_needed: 'Ask about current tools.' }] } };
  const prep = researchCallPrep(f, { opportunity_index: 0, observations: [{ index: 0, supported: false }, { index: 1, supported: true }] }, '2026-10-17T10:01:00Z');
  assert.deepEqual(prep.observations, [{ fact: 'Weekly pickup menu', sources: [{ url: 'https://example.invalid/menu', checked_at: '2026-10-17T10:00:00Z', excerpt: 'Friday pickup' }] }]);
  assert.equal(prep.current_route, null);
  assert.deepEqual(prep.unknowns, ['Budget is unknown', 'Ask about current tools.']);
  assert.equal(prep.questions[0], f.report.opportunities[0].owner_question);
  assert.match(prep.opening, /Friday pickup/);
  assert.match(prep.opening, /Would a pickup page fit your current tools\?/);
  assert.doesNotMatch(prep.opening, /AI, business systems, a website or marketing/);
  f.report.observations = [];
  assert.throws(() => researchCallPrep(f, { opportunity_index: 0, observations: [] }, ''), /exact retained excerpt/);
});
