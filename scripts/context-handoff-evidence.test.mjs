import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const results = JSON.parse(await readFile(new URL('../docs/context-handoff-pilot-results.json', import.meta.url), 'utf8'));
const evidence = JSON.parse(await readFile(new URL('../docs/context-handoff-pilot-grades.json', import.meta.url), 'utf8'));
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const parse = text => JSON.parse(text.replace(/^\uFEFF/, ''));

test('retained blind inputs and held-out records match their preregistered hashes', () => {
  for (const [field, file] of [
    ['blindOutputsUtf8', 'blind-outputs.json'],
    ['blindCheckpointsUtf8', 'blind-checkpoints.json'],
    ['blindFollowupUtf8', 'blind-followup.json'],
    ['holdoutInputUtf8', 'holdout-input.json'],
    ['holdoutRubricUtf8', 'holdout-rubric.json'],
  ]) assert.equal(hash(evidence[field]), evidence.hashes[file], file);
});

test('each blinded continuation and checkpoint maps to its retained fictional output', () => {
  const blind = parse(evidence.blindOutputsUtf8);
  assert.equal(blind.length, 24);
  for (const row of blind) {
    const map = evidence.initialMapping.find(item => item.id === row.id);
    const run = map && results.cases[map.case].runs.find(item => item.arm === map.arm && item.round === map.round);
    assert.ok(run, row.id);
    assert.equal(row.response, run.output, row.id);
    assert.deepEqual(row.actions, run.simulation.trace, row.id);
    assert.equal(row.resultingTarget, run.simulation.resultingTarget, row.id);
  }
  const checkpoints = parse(evidence.blindCheckpointsUtf8);
  assert.equal(checkpoints.length, 8);
  for (const row of checkpoints) {
    const map = evidence.checkpointMapping.find(item => item.id === row.id);
    assert.ok(map, row.id);
    assert.equal(row.checkpoint, results.cases[map.case].checkpoints[map.arm].output, row.id);
  }
});

test('the follow-up blind outputs and both reviewers cover the recorded samples', () => {
  const followup = parse(evidence.blindFollowupUtf8);
  assert.equal(followup.outputs.length, 4);
  for (const row of followup.outputs) {
    const map = evidence.followupMapping.find(item => item.id === row.id);
    const run = map && evidence.followupRuns.find(item => item.which === map.which && item.repetition === map.repetition);
    assert.ok(run, row.id);
    assert.equal(row.checkpoint, run.result.output, row.id);
  }
  for (const [rows, grades] of [
    [parse(evidence.blindOutputsUtf8), evidence.initialGrades.grades],
    [parse(evidence.blindCheckpointsUtf8), evidence.initialGrades.checkpointGrades],
    [followup.outputs, evidence.followupGrades.outputs],
  ]) {
    assert.equal(new Set(grades.map(item => item.id)).size, rows.length);
    for (const row of rows) assert.ok(grades.some(item => item.id === row.id), row.id);
  }
});
