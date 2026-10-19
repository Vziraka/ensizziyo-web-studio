import test from 'node:test';
import assert from 'node:assert/strict';
import { schemasFor, validate } from './schemas.mjs';
import { upgradeBatch } from './research-upgrades.mjs';
import { hash } from './lifecycle.mjs';

test('the actual worker schema binds each reviewed citation to its entire saved anchor', () => {
  const url = 'https://example.org/menu', anchor = 'Custom orders through the public order form';
  const schema = schemasFor({id:'synthetic',business_name:'SYNTHETIC',research_version:3}, {sources:[{url,checked_at:'2026-10-19',content_sha256:'a'.repeat(64),kind:'business',coverage:'partial',capture_method:'reviewed_page',reviewed_context:{facts:[{id:'orders',excerpt:anchor}]}}]}).report.properties.observations.items.properties.evidence.items;
  validate({url,context_id:'orders',excerpt:anchor},schema);
  assert.throws(() => validate({url,context_id:'orders',excerpt:'Custom orders'},schema));
  assert.throws(() => validate({url,context_id:'other',excerpt:anchor},schema));
  validate({url,context_id:'',excerpt:'Custom orders'},schema);
});

test('upgrade manifests cannot expand released identities, overwrite accepted research or exceed ten leads', () => {
  const packet={id:'retained-proof'}, r={id:'existing',company_id:'company',call_lane:'verification',contact:{phone:'(202) 555-0100'},verification:{packet,packet_sha256:hash(packet)}};
  const item={job_id:'named-upgrade',prospect_id:r.id,company_id:r.company_id,phone_digits:'2025550100',verification_sha256:hash(packet)};
  const c={operations:{allowlist:[r.id]},research:{upgrade_batch:{schema_version:1,id:'batch',approval_ref:'owner-ten-only',items:[item]}}}, s={prospects:{existing:r}};
  assert.equal(upgradeBatch(c,s,{job_ids:[item.job_id]}).items.length,1);
  assert.throws(()=>upgradeBatch(c,s,{job_ids:[]}),/named research/);
  c.operations.allowlist=[];assert.throws(()=>upgradeBatch(c,s),/released call scope/);c.operations.allowlist=[r.id];
  r.call_lane='research';assert.throws(()=>upgradeBatch(c,s),/Previously accepted/);r.call_lane='verification';
  c.research.upgrade_batch.items=Array(11).fill(item);assert.throws(()=>upgradeBatch(c,s),/at most ten/);
});
