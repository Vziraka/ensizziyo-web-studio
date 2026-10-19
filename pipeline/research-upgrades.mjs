import { join } from 'node:path';
import { check, hash } from './lifecycle.mjs';
import { readJson } from './engine.mjs';
import { phoneDigits, verificationLane } from './verification-calls.mjs';

const key = s => typeof s === 'string' && /^[a-z0-9-]{1,60}$/.test(s);
const name = s => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
export function upgradeBatch(config, state, controller) {
  const b = config.research?.upgrade_batch;
  if (!b) return null;
  check(b.schema_version === 1 && key(b.id) && typeof b.approval_ref === 'string' && b.approval_ref.length > 5 && Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 10, 'A reviewed batch of at most ten existing leads is required');
  check(new Set(b.items.map(i => i.job_id)).size === b.items.length && new Set(b.items.map(i => i.prospect_id)).size === b.items.length, 'Upgrade jobs and existing cards must be distinct');
  for (const i of b.items) {
    const r = state.prospects[i.prospect_id];
    check(key(i.job_id) && (!controller || controller.job_ids.includes(i.job_id)) && config.operations.allowlist.includes(i.prospect_id), 'Upgrade must stay within the named research and released call scope');
    check(r && r.company_id === i.company_id && r.verification?.packet_sha256 === i.verification_sha256 && hash(r.verification.packet) === i.verification_sha256 && phoneDigits(r.contact.phone) === i.phone_digits, 'Upgrade identity or retained verification evidence changed');
    check(verificationLane(r) || r.research_upgrade?.job_id === i.job_id, 'Previously accepted research is outside the verification upgrade batch');
  }
  return b;
}

// Called only after importResearch validates the complete report, sources and independent decision.
export async function upgradeResearch(app, jobId, data) {
  return app.change(async state => {
    const c = await readJson(join(app.directory, 'lifecycle-config.json')), b = upgradeBatch(c, state);
    const i = b?.items.find(i => i.job_id === jobId);
    if (!i) return null;
    const r = state.prospects[i.prospect_id];
    if (r.research_upgrade?.job_id === jobId) {
      check(r.qualification.report_sha256 === data.qualification.report_sha256 && r.qualification.review_sha256 === data.qualification.review_sha256, 'Accepted upgrade changed; reconcile the exact retained review');
      return { imported: false, upgraded: true, prospect_id: r.id, duplicate_of: r.id, restricted: Boolean(r.restriction) };
    }
    check(!r.restriction && !r.cold_paused && ['Ready to verify','Verifying','Callback'].includes(r.stage), 'Preserve stops, active conversations and campaign holds; upgrade needs reconciliation');
    check(name(r.name) === name(data.name) && phoneDigits(data.contact.phone) === i.phone_digits && (!r.contact.email || r.contact.email.toLowerCase() === data.contact.email.toLowerCase()), 'Independent research must match the exact existing business and public phone');
    check(!Object.values(state.prospects).some(p => p.id !== r.id && p.contact.email?.toLowerCase() === data.contact.email.toLowerCase()), 'Reviewed email belongs to another card; reconcile identity');
    const at = app.now().toISOString(), id = `upgrade-${hash(jobId).slice(0, 24)}`;
    r.research_upgrade = { batch_id: b.id, job_id: jobId, at, approval_ref: b.approval_ref, previous: { call_lane:r.call_lane, qualification:r.qualification, contact:r.contact, idea:r.idea } };
    Object.assign(r, { call_lane:'research', qualification:data.qualification, call_prep:data.call_prep, idea:data.idea, research_contact:data.contact, updated_at:at });
    // Keep the provider-bound contact identity; a discovered email is evidence, not permission to edit Apollo.
    r.contact = { ...r.contact, verified:true, checked_at:data.contact.checked_at, source:data.contact.source };
    if (r.stage === 'Ready to verify') r.stage = 'Ready to contact';
    if (r.stage === 'Verifying') r.stage = 'Contacting';
    state.events[id] = { id, type:'research_upgraded', prospect_id:r.id, at, actor:'research-import', data:{job_id:jobId,batch_id:b.id,report_sha256:data.qualification.report_sha256,review_sha256:data.qualification.review_sha256} };
    state.revision++; state.updated_at = at;
    return { imported:false, upgraded:true, prospect_id:r.id, scope_preserved:true };
  });
}
