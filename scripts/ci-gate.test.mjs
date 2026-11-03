import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scopeForPaths, scopeFromRevisions, gatePassed } from './ci-gate.mjs';

const script = fileURLToPath(new URL('./ci-gate.mjs', import.meta.url));
const gitIn = (dir, ...args) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
  const run = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trim();
};

test('unrelated documentation needs only the site checks', () => {
  assert.deepEqual(scopeForPaths(['WORKFLOW.md', 'docs/notes.md']), { pipeline: false, windows: false });
});

test('desk, bundle, dependency, deployment and workflow changes select the desk checks', () => {
  for (const path of ['pipeline/engine.mjs', 'scripts/build-desk-assets.mjs', 'scripts/studio-context.test.mjs',
    'scripts/prepare-protected-staging.mjs', 'docs/design-references.json', 'netlify/functions/desk.mjs', 'netlify.toml', '.github/workflows/site-check.yml',
    'scripts/ci-gate.mjs']) {
    assert.deepEqual(scopeForPaths([path]), { pipeline: true, windows: true }, path);
  }
  assert.deepEqual(scopeForPaths(['scripts/context-checkpoint.mjs']), { pipeline: false, windows: true });
  assert.deepEqual(scopeForPaths(['.codex/hooks.json']), { pipeline: false, windows: true });
});

test('revision detection includes removed and renamed files and falls back safely', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'evz-ci-scope-'));
  const git = (...args) => gitIn(dir, ...args);
  try {
    git('init', '-q');
    await writeFile(join(dir, 'netlify.toml'), 'old');
    git('add', 'netlify.toml');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    git('mv', 'netlify.toml', 'renamed.txt');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'rename');
    const head = git('rev-parse', 'HEAD');
    assert.deepEqual(scopeFromRevisions(base, head, dir), { pipeline: true, windows: true });
    const cli = spawnSync(process.execPath, [script, 'scope'], { cwd: dir, encoding: 'utf8',
      env: { ...process.env, CI_BASE_REVISION: base, CI_HEAD_REVISION: head } });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout, 'pipeline=true\nwindows=true\n');
    assert.deepEqual(scopeFromRevisions('0'.repeat(40), head, dir), { pipeline: true, windows: true });
    assert.deepEqual(scopeFromRevisions('f'.repeat(40), head, dir), { pipeline: true, windows: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a PR merge excludes unrelated changes already added to the base', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'evz-ci-merge-'));
  const git = (...args) => gitIn(dir, ...args);
  const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false'];
  try {
    git('init', '-q');
    await writeFile(join(dir, 'README.md'), 'initial');
    git('add', 'README.md');
    git(...identity, 'commit', '-qm', 'initial');
    const baseBranch = git('branch', '--show-current');
    git('checkout', '-qb', 'task');
    await writeFile(join(dir, 'README.md'), 'documentation update');
    git('add', 'README.md');
    git(...identity, 'commit', '-qm', 'docs');
    const topic = git('rev-parse', 'HEAD');
    git('checkout', '-q', baseBranch);
    await writeFile(join(dir, 'netlify.toml'), 'unrelated base change');
    git('add', 'netlify.toml');
    git(...identity, 'commit', '-qm', 'base update');
    const base = git('rev-parse', 'HEAD');
    git(...identity, 'merge', '--no-ff', '--no-edit', 'task');
    const merge = git('rev-parse', 'HEAD');
    assert.deepEqual(scopeFromRevisions(base, topic, dir), { pipeline: true, windows: true });
    assert.deepEqual(scopeFromRevisions(base, merge, dir), { pipeline: false, windows: false });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('required gate fails for errors, cancellations and unexpected skips', () => {
  const base = { scope: 'success', site: 'success', pipelineRequired: 'true', pipeline: 'success',
    windowsRequired: 'true', windows: 'success' };
  assert.equal(gatePassed(base), true);
  for (const field of ['scope', 'site', 'pipeline', 'windows']) {
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
      assert.equal(gatePassed({ ...base, [field]: result }), false, `${field}: ${result}`);
    }
  }
  assert.equal(gatePassed({ ...base, pipelineRequired: 'false', pipeline: 'skipped', windowsRequired: 'false', windows: 'skipped' }), true);
  assert.equal(gatePassed({ ...base, pipelineRequired: 'false', pipeline: 'skipped' }), true);
  assert.equal(gatePassed({ ...base, pipelineRequired: 'false', pipeline: 'failure' }), false);
  assert.equal(gatePassed({ ...base, windowsRequired: '', windows: 'skipped' }), false);
});

test('the required-check command propagates job failures through its exit code', () => {
  const env = { ...process.env, SCOPE_RESULT: 'success', SITE_RESULT: 'success', PIPELINE_REQUIRED: 'true',
    PIPELINE_RESULT: 'success', WINDOWS_REQUIRED: 'false', WINDOWS_RESULT: 'skipped' };
  assert.equal(spawnSync(process.execPath, [script, 'verify'], { env }).status, 0);
  assert.notEqual(spawnSync(process.execPath, [script, 'verify'], { env: { ...env, PIPELINE_RESULT: 'failure' } }).status, 0);
});
