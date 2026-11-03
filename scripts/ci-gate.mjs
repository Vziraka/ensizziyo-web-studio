import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function scopeForPaths(paths) {
  const pipeline = paths.some(path => path.startsWith('pipeline/') || path.startsWith('netlify/')
    || path.startsWith('scripts/studio-context') || path.startsWith('scripts/build-desk-assets')
    || path.startsWith('scripts/prepare-protected-staging')
    || path.startsWith('scripts/ci-gate') || path.startsWith('.github/workflows/')
    || path === 'docs/design-references.json' || path === 'netlify.toml');
  const windows = pipeline || paths.some(path => path.startsWith('scripts/context-')
    || path === 'scripts/fixtures/verify-fixture-temp.mjs' || path === '.codex/hooks.json');
  return { pipeline, windows };
}

export function scopeFromRevisions(base, head, cwd = process.cwd()) {
  // Missing history or an initial push cannot safely narrow the checks.
  if (![base, head].every(value => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value) && !/^0+$/.test(value))) {
    return { pipeline: true, windows: true };
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
  const diff = spawnSync('git', ['diff', '--name-only', '-z', '--no-renames', base, head, '--'],
    { cwd, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (diff.error || diff.status !== 0) return { pipeline: true, windows: true };
  return scopeForPaths(diff.stdout.split('\0').filter(Boolean));
}

export function gatePassed({ scope, site, pipelineRequired, pipeline, windowsRequired, windows }) {
  const expected = (required, result) => (required === 'true' && result === 'success')
    || (required === 'false' && result === 'skipped');
  return scope === 'success' && site === 'success'
    && expected(pipelineRequired, pipeline) && expected(windowsRequired, windows);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv[2] === 'scope') {
    const scope = scopeFromRevisions(process.env.CI_BASE_REVISION, process.env.CI_HEAD_REVISION);
    process.stdout.write(`pipeline=${scope.pipeline}\nwindows=${scope.windows}\n`);
  } else if (process.argv[2] === 'verify') {
    const env = process.env;
    const passed = gatePassed({ scope: env.SCOPE_RESULT, site: env.SITE_RESULT,
      pipelineRequired: env.PIPELINE_REQUIRED, pipeline: env.PIPELINE_RESULT,
      windowsRequired: env.WINDOWS_REQUIRED, windows: env.WINDOWS_RESULT });
    process.stdout.write(passed ? 'All applicable checks passed.\n' : 'An applicable check failed, was cancelled, or did not run.\n');
    if (!passed) process.exitCode = 1;
  } else {
    process.stderr.write('Expected scope or verify.\n');
    process.exitCode = 1;
  }
}
