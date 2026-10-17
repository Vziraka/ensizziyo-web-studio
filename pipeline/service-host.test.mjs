import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireServiceHost } from './service-host.mjs';

test('Windows host ownership excludes a second service and archives only dead local locks', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'evz-service-host-')); t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'operations-service.lock'), JSON.stringify({ pid: 2147483647, run_id: 'synthetic-test' }));
  const release = await acquireServiceHost(directory);
  try {
    assert.equal((await readdir(join(directory, 'recovery'))).length, 1);
    await assert.rejects(acquireServiceHost(directory), /EADDRINUSE/);
  } finally { await release(); }
  const second = await acquireServiceHost(directory); await second();
});
test('Windows host never clears a live, unknown or malformed process lock', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'evz-service-live-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, '.runner.lock'), contents = JSON.stringify({ pid: process.pid, token: 'existing-owner' }); await writeFile(path, contents);
  await assert.rejects(acquireServiceHost(directory), /active or its identity/);
  assert.equal(await readFile(path, 'utf8'), contents);
  await writeFile(path, '{}'); await assert.rejects(acquireServiceHost(directory), /active or its identity/);
  assert.equal(await readFile(path, 'utf8'), '{}');
});
