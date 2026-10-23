import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle } from './lifecycle.mjs';
import { fixtureProspect } from './lifecycle-fixtures.mjs';

const at = '2026-10-19T15:00:00.000Z';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'evz-asset-index-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = await StudioLifecycle.initialize({ directory, now: () => new Date(at) });
  await app.apply(fixtureProspect('juniper', at));
  return app;
}

function assetEvent(app, id, type, data, actor = 'owner') {
  return app.apply({ id, prospect_id: 'studio-assets', type, at, data }, { actor });
}

test('private asset index spans studio and project scope and switches baseline only on operator consensus', async t => {
  const app = await setup(t);
  await assetEvent(app, 'studio-brand', 'asset_registered', {
    asset_id: 'studio-brand', scope: 'studio', name: 'EVZ logo', kind: 'brand',
    version_id: 'logo-v1', version_label: 'v1', reference: 'private-path:studio/brand/logo-v1.svg'
  });
  await assetEvent(app, 'project-brand', 'asset_registered', {
    asset_id: 'project-brand', scope: 'project', project_id: 'juniper', name: 'Project brand kit', kind: 'brand',
    version_id: 'brand-v1', version_label: 'v1', reference: 'drive:synthetic-brand-file-0001'
  }, 'friend');
  let state = await app.snapshot();
  assert.equal(state.prospects.juniper.stage, 'Ready to contact');
  assert.equal(state.asset_index['studio-brand'].scope, 'studio');
  assert.equal(state.asset_index['project-brand'].scope, 'project');
  assert.equal(state.asset_index['project-brand'].versions['brand-v1'].registered_by, 'friend');

  await assetEvent(app, 'owner-v1', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v1' }, 'owner');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, null);
  await assetEvent(app, 'friend-v1', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v1' }, 'friend');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v1');

  await assetEvent(app, 'brand-v2-added', 'asset_version_registered', {
    asset_id: 'project-brand', version_id: 'brand-v2', version_label: 'v2', reference: 'drive:synthetic-brand-file-0002'
  });
  await assetEvent(app, 'owner-v2', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v2' }, 'owner');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v1');
  assert.notEqual(state.asset_index['project-brand'].choices.owner.version_id, state.asset_index['project-brand'].choices.friend.version_id);
  await assetEvent(app, 'friend-v2', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v2' }, 'friend');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v2');
  assert.deepEqual(state.asset_index['project-brand'].baseline_agreement_events, ['owner-v2', 'friend-v2']);
  assert.equal(state.prospects.juniper.stage, 'Ready to contact');
});

test('asset references reject credentials, copied content, path traversal and unknown projects', async t => {
  const app = await setup(t);
  await assert.rejects(assetEvent(app, 'bad-token', 'asset_registered', {
    asset_id: 'bad-token', scope: 'studio', name: 'Bad reference', kind: 'source',
    version_id: 'v1', version_label: 'v1', reference: 'drive:synthetic-file-0001?token=secret'
  }), /Google Drive file ID/);
  await assert.rejects(assetEvent(app, 'bad-path', 'asset_registered', {
    asset_id: 'bad-path', scope: 'studio', name: 'Bad path', kind: 'source',
    version_id: 'v1', version_label: 'v1', reference: 'private-path:../outside/private.pdf'
  }), /relative path/);
  await assert.rejects(assetEvent(app, 'bad-project', 'asset_registered', {
    asset_id: 'bad-project', scope: 'project', project_id: 'unknown', name: 'Unknown project', kind: 'source',
    version_id: 'v1', version_label: 'v1', reference: 'drive:synthetic-file-0002'
  }), /existing project record/);
  await assert.rejects(assetEvent(app, 'prototype-project', 'asset_registered', {
    asset_id: 'prototype-project', scope: 'project', project_id: 'constructor', name: 'Invalid project key', kind: 'source',
    version_id: 'v1', version_label: 'v1', reference: 'drive:synthetic-file-0004'
  }), /existing project record/);
  await assert.rejects(assetEvent(app, 'prototype-version', 'asset_registered', {
    asset_id: 'prototype-version', scope: 'studio', name: 'Invalid version key', kind: 'source',
    version_id: '__proto__', version_label: 'v1', reference: 'drive:synthetic-file-0005'
  }), /stable ID and label/);
  await assert.rejects(assetEvent(app, 'bad-actor', 'asset_registered', {
    asset_id: 'bad-actor', scope: 'studio', name: 'Invalid actor', kind: 'source',
    version_id: 'v1', version_label: 'v1', reference: 'drive:synthetic-file-0003'
  }, 'controlled-fixture'), /two signed operators/);
  assert.deepEqual((await app.snapshot()).asset_index, {});
});
