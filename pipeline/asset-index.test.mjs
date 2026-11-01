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

test('version feedback retains exact operator directions and scope without changing the approved baseline',async t=>{
  const app=await setup(t);
  await assetEvent(app,'feedback-asset','asset_registered',{asset_id:'project-design',scope:'project',project_id:'juniper',name:'Mockup directions',kind:'mockup',version_id:'v1',version_label:'v1',reference:'drive:synthetic-mockup-file-0001'});
  await assetEvent(app,'feedback-baseline','asset_version_selected',{asset_id:'project-design',version_id:'v1'});
  const event={id:'feedback-one',prospect_id:'studio-assets',type:'asset_feedback_added',at,data:{asset_id:'project-design',version_id:'v1',feedback:'Keep this typography. Make the enquiry link clearer.'}};
  await app.apply(event,{actor:'friend'});
  let state=await app.snapshot(),asset=state.asset_index['project-design'];
  assert.equal(asset.baseline_version,'v1');assert.deepEqual(asset.feedback,[{id:'feedback-one',version_id:'v1',feedback:event.data.feedback,scope:'project',scope_selection:'auto',scope_reason:'Current-project default; studio-wide scope requires explicit confirmation',project_id:'juniper',source_project_id:'juniper',actor:'friend',at,baseline_at_feedback:'v1',approval_at_feedback:'feedback-baseline'}]);
  assert.equal((await app.apply(event,{actor:'friend'})).duplicate,true);
  await assetEvent(app,'studio-feedback','asset_feedback_added',{asset_id:'project-design',version_id:'v1',feedback:'Always explore distinctive typography.',scope:'studio'},'owner');
  state=await app.snapshot();assert.equal(state.asset_index['project-design'].feedback[1].scope,'studio');assert.equal(state.asset_index['project-design'].feedback[1].actor,'owner');assert.equal(state.asset_index['project-design'].baseline_version,'v1');
  await assert.rejects(assetEvent(app,'unknown-feedback-version','asset_feedback_added',{asset_id:'project-design',version_id:'v2',feedback:'Wrong source.'}),/registered asset version/);
  await assert.rejects(assetEvent(app,'unknown-feedback-project','asset_feedback_added',{asset_id:'project-design',version_id:'v1',feedback:'Wrong project.',project_id:'unknown'}),/existing project/);
  await assert.rejects(assetEvent(app,'ambiguous-studio-feedback','asset_feedback_added',{asset_id:'project-design',version_id:'v1',feedback:'Ambiguous scope.',scope:'studio',project_id:'juniper'}),/cannot name a project/);
  await assert.rejects(assetEvent(app,'empty-feedback','asset_feedback_added',{asset_id:'project-design',version_id:'v1',feedback:''}),/within 2000/);
  await assert.rejects(app.apply({...event,id:'stale-feedback'},{actor:'friend',expectedRevision:state.revision-1}),/Record changed/);
  const restarted=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)});assert.deepEqual((await restarted.snapshot()).asset_index['project-design'].feedback,state.asset_index['project-design'].feedback);
});

test('either operator can approve an uncontested baseline and prior choices do not become objections', async t => {
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
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v1');
  assert.equal(state.asset_index['project-brand'].baseline_approved_by, 'owner');
  await assetEvent(app, 'friend-v1', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v1' }, 'friend');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v1');
  assert.deepEqual(state.asset_index['project-brand'].baseline_agreement_events, ['owner-v1', 'friend-v1']);

  await assetEvent(app, 'brand-v2-added', 'asset_version_registered', {
    asset_id: 'project-brand', version_id: 'brand-v2', version_label: 'v2', reference: 'drive:synthetic-brand-file-0002'
  });
  await assetEvent(app, 'owner-v2', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v2' }, 'owner');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v2');
  assert.deepEqual(Object.keys(state.asset_index['project-brand'].choices), ['owner']);
  assert.equal(state.asset_index['project-brand'].dispute, null);
  assert.ok(state.events['friend-v1'], 'the old approval remains in append-only evidence');
  await assetEvent(app, 'friend-v2', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v2' }, 'friend');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v2');
  assert.deepEqual(state.asset_index['project-brand'].baseline_agreement_events, ['owner-v2', 'friend-v2']);

  await assetEvent(app, 'brand-v3-added', 'asset_version_registered', {
    asset_id: 'project-brand', version_id: 'brand-v3', version_label: 'v3', reference: 'drive:synthetic-brand-file-0003'
  });
  await assetEvent(app, 'friend-v3', 'asset_version_selected', { asset_id: 'project-brand', version_id: 'brand-v3' }, 'friend');
  state = await app.snapshot();
  assert.equal(state.asset_index['project-brand'].baseline_version, 'brand-v3');
  assert.equal(state.asset_index['project-brand'].baseline_approved_by, 'friend');
  assert.deepEqual(Object.keys(state.asset_index['project-brand'].choices), ['friend']);
  assert.equal(state.prospects.juniper.stage, 'Ready to contact');
});

test('an explicit disagreement preserves the last baseline until both operators choose the same version', async t => {
  const app = await setup(t);
  await assetEvent(app, 'brand', 'asset_registered', {
    asset_id: 'brand', scope: 'studio', name: 'EVZ logo', kind: 'brand',
    version_id: 'brand-v1', version_label: 'v1', reference: 'private-path:studio/brand/v1.svg'
  });
  await assetEvent(app, 'brand-v2-added', 'asset_version_registered', {
    asset_id: 'brand', version_id: 'brand-v2', version_label: 'v2', reference: 'private-path:studio/brand/v2.svg'
  });
  await assetEvent(app, 'brand-v3-added', 'asset_version_registered', {
    asset_id: 'brand', version_id: 'brand-v3', version_label: 'v3', reference: 'private-path:studio/brand/v3.svg'
  });

  await assetEvent(app, 'owner-v1', 'asset_version_selected', { asset_id: 'brand', version_id: 'brand-v1' }, 'owner');
  await assetEvent(app, 'owner-v2', 'asset_version_selected', { asset_id: 'brand', version_id: 'brand-v2' }, 'owner');
  let state = await app.snapshot();
  assert.equal(state.asset_index.brand.baseline_version, 'brand-v2');

  await assetEvent(app, 'friend-disputes-v3', 'asset_version_disputed', { asset_id: 'brand', version_id: 'brand-v3' }, 'friend');
  state = await app.snapshot();
  assert.equal(state.asset_index.brand.baseline_version, 'brand-v2');
  assert.deepEqual(state.asset_index.brand.dispute.choices, {
    friend: { version_id: 'brand-v3', event_id: 'friend-disputes-v3', at }
  });

  await assetEvent(app, 'owner-reaffirms-v2', 'asset_version_selected', { asset_id: 'brand', version_id: 'brand-v2' }, 'owner');
  state = await app.snapshot();
  assert.equal(state.asset_index.brand.baseline_version, 'brand-v2');
  assert.ok(state.asset_index.brand.dispute, 'different current choices keep the prior baseline');

  await assetEvent(app, 'owner-agrees-v3', 'asset_version_selected', { asset_id: 'brand', version_id: 'brand-v3' }, 'owner');
  state = await app.snapshot();
  assert.equal(state.asset_index.brand.baseline_version, 'brand-v3');
  assert.equal(state.asset_index.brand.dispute, null);
  assert.deepEqual(state.asset_index.brand.baseline_agreement_events, ['owner-agrees-v3', 'friend-disputes-v3']);
  assert.ok(state.events['friend-disputes-v3'] && state.events['owner-reaffirms-v2'] && state.events['owner-agrees-v3']);

  await assert.rejects(app.apply({ id: 'stale-asset-approval', prospect_id: 'studio-assets', type: 'asset_version_selected', at,
    data: { asset_id: 'brand', version_id: 'brand-v1' } }, { actor: 'friend', expectedRevision: state.revision - 1 }), /Record changed; refresh before approving/);
  state = await app.snapshot();
  assert.equal(state.asset_index.brand.baseline_version, 'brand-v3');
  assert.equal(Object.hasOwn(state.events, 'stale-asset-approval'), false);
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
