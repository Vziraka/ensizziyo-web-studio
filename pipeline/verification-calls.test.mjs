import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle, hash } from './lifecycle.mjs';
import { productionConfig, importVerification, approveCallRelease, callReleaseFingerprint, operationsFor } from './production.mjs';
import { sourceContentHash } from './sources.mjs';
import { saveJson } from './engine.mjs';
import { operationsTick } from './operations-service.mjs';

const at = '2026-10-19T14:00:00.000Z';
function packet() {
  const text = 'SYNTHETIC Bakery. Fairfax, VA. Custom cakes. Call (202) 555-0100.';
  const source = { url: 'https://example.com/contact', fetched_at: at, checked_at: at.slice(0, 10), text, kind: 'business', capture_method: 'http', coverage: 'full', identity_note: 'Synthetic first-party fixture, never a real business.' };
  source.content_sha256 = sourceContentHash(source);
  return { schema_version: 1, id: 'verification-fixture', business_name: 'SYNTHETIC Bakery', category: 'Food / bakery', area: 'Fairfax, VA', phone: '(202) 555-0100',
    topic: 'Ask how custom cake enquiries work and whether the owner wants a useful digital improvement.', unknowns: ['Current activity and owner goals are unconfirmed.'],
    reviewed_by: 'fixture:operator', first_party_note: 'Fixture represents a business-controlled contact page.', sources: [source],
    identity: { url: source.url, excerpt: 'SYNTHETIC Bakery' }, location: { url: source.url, excerpt: 'Fairfax, VA' }, offering: { url: source.url, excerpt: 'Custom cakes' }, public_phone: { url: source.url, excerpt: 'Call (202) 555-0100.' } };
}
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'evz-verification-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const c = structuredClone(productionConfig); c.apollo.user_id = 'owned-user';
  c.call_readiness = { queue_verified: 'fixture:identity/phone/card verification', outcomes_verified: 'fixture:call-only stop/review proof', supervision_verified: 'fixture:durable owner workflow' };
  let now = new Date(at); const app = await StudioLifecycle.initialize({ directory, config: c, now: () => now });
  const imported = await importVerification(app, packet());
  return { app, id: imported.prospect_id, directory, advance(days = 5) { now = new Date(+now + days * 86400000); } };
}
const event = (id, outcome, stamp = at) => ({ id: `call-${outcome}-${stamp.replace(/\D/g, '')}`, prospect_id: id, type: 'call_logged', at: stamp, data: { call_id: `call-${outcome}-${stamp.replace(/\D/g, '')}`, outcome, performed_at: stamp, simulated: false } });

test('verification import retains first-party checks without becoming an accepted detailed assessment; owner cannot forge imports', async t => {
  const s = await setup(t), state = await s.app.snapshot(), r = state.prospects[s.id];
  assert.equal(r.stage, 'Ready to verify'); assert.equal(r.call_lane, 'verification');
  assert.equal(r.qualification.verdict, 'Verification call only'); assert.equal(r.contact.email, null);
  assert.equal(r.contact.verified, false); assert.equal(r.contact.phone_verified, true);
  assert.equal((await s.app.dashboard()).daily.prepared.verification, 1);
  assert.equal((await importVerification(s.app, packet())).duplicate_of, s.id);
  s.app.config.operations.allowlist = []; await saveJson(join(s.directory, 'lifecycle-config.json'), s.app.config);
  await importVerification(s.app, packet()); assert.ok(s.app.config.operations.allowlist.includes(s.id), 'Retry reconciles a prospect saved before its config staging write');
  const alternatePhone = packet(); alternatePhone.id = 'same-business-second-phone'; alternatePhone.phone = '(202) 555-0109'; alternatePhone.sources[0].text = alternatePhone.sources[0].text.replace('0100', '0109'); alternatePhone.sources[0].content_sha256 = sourceContentHash(alternatePhone.sources[0]); alternatePhone.public_phone.excerpt = alternatePhone.public_phone.excerpt.replace('0100', '0109');
  assert.equal((await importVerification(s.app, alternatePhone)).duplicate_of, s.id);
  await assert.rejects(s.app.apply({ id: 'forged', prospect_id: 'other', type: 'verification_imported', at, data: { ...r, company_id: 'other' } }), /retained verification/);
  const broken = packet(); broken.sources[0].text += ' changed';
  await assert.rejects(importVerification(s.app, broken), /integrity/);
  const wrong = packet(); wrong.public_phone.excerpt = '(202) 555-0199';
  await assert.rejects(importVerification(s.app, wrong), /exact retained/);
});

test('calls-only approval is exact and never grants email, booking or an unapproved real call', async t => {
  const s = await setup(t);
  await assert.rejects(s.app.apply(event(s.id, 'no_answer')), /paused/);
  await approveCallRelease(s.app, callReleaseFingerprint(s.app.config), 'fixture:final owner call-only approval');
  assert.equal(s.app.config.outreach_enabled, false); assert.equal(s.app.config.native_email.enabled, false);
  assert.equal(s.app.config.transcript_ai.enabled, true); assert.equal(s.app.config.runtime.enabled, true);
  await s.app.apply(event(s.id, 'no_answer'));
  const state = await s.app.snapshot();
  assert.equal(state.prospects[s.id].stage, 'Verifying');
  assert.equal(Object.values(state.actions).filter(a => a.type === 'email').length, 0);
  const follow = Object.values(state.actions).filter(a => a.type === 'call_task' && a.status === 'Queued');
  assert.equal(follow.length, 1); assert.equal(follow[0].payload.due_at, '2026-10-26T14:00:00.000Z');
  const reopened = await StudioLifecycle.open({ directory: s.directory, now: () => new Date(at) });
  await reopened.apply(event(s.id, 'no_answer'));
  assert.equal(Object.values((await reopened.snapshot()).actions).filter(a => a.type === 'call_task' && a.status === 'Queued').length, 1);
  s.advance(7); const stamp = s.app.now().toISOString(); await s.app.apply(event(s.id, 'voicemail', stamp));
  assert.equal((await s.app.snapshot()).prospects[s.id].stage, 'Hold');
  assert.equal(Object.values((await s.app.snapshot()).actions).some(a => a.type === 'email'), false);
});

test('a stop wins over verification and stale identity checks never become callable', async t => {
  const s = await setup(t); await approveCallRelease(s.app, callReleaseFingerprint(s.app.config), 'fixture:final owner call-only approval');
  await s.app.apply({ id: 'stop', prospect_id: s.id, type: 'contact_stopped', at, data: { reason: 'do_not_contact' } });
  await assert.rejects(s.app.apply(event(s.id, 'connected')), /Restriction/);
  assert.equal((await s.app.dashboard()).daily.due.length, 0);
  const other = await setup(t); await approveCallRelease(other.app, callReleaseFingerprint(other.app.config), 'fixture:final owner call-only approval'); other.advance(15);
  await assert.rejects(other.app.apply(event(other.id, 'no_answer', other.app.now().toISOString())), /stale/);
});

test('a connected verification call needs independently reviewed transcript and explicit owner confirmation before discovery', async t => {
  const s = await setup(t); await approveCallRelease(s.app, callReleaseFingerprint(s.app.config), 'fixture:final owner call-only approval');
  const call = event(s.id, 'connected'); await s.app.apply(call);
  const callId = call.data.call_id, transcript = 'I own SYNTHETIC Bakery. We are taking cake orders this week. I want customers to choose pickup times more easily. Please email me at owner@example.net.';
  const apply = (id, type, data, actor = 'owner') => s.app.apply({ id, prospect_id: s.id, type, at, data }, { actor });
  await apply('transcript', 'transcript_added', { call_id: callId, text: transcript, permission_confirmed: true });
  const proposal = { schema_version: 1, transcript_sha256: hash(transcript), outcome: 'discovery', callback_at: null, summary: 'The synthetic owner confirms cake orders and a pickup goal.', claims: [{ claim: 'The speaker says they own the bakery.', quote: 'I own SYNTHETIC Bakery.' }], unknowns: ['Budget and existing tools'] };
  await apply('assessed', 'transcript_assessed', { call_id: callId, proposal, review: { verdict: 'Accepted', proposal_sha256: hash(proposal), independent: true } }, 'worker');
  await apply('reviewed', 'call_reviewed', { call_id: callId, outcome: 'discovery', proposal_sha256: hash(proposal) });
  assert.equal((await s.app.snapshot()).prospects[s.id].stage, 'Verification review');
  await assert.rejects(apply('incomplete', 'verification_confirmed', { call_id: callId, identity_confirmed: true, active_confirmed: true, decision_maker: 'Owner', goal: 'Pickup choice' }), /exact transcript quotes/);
  const confirmation = { call_id: callId, identity_confirmed: true, active_confirmed: true, decision_maker: 'Owner', goal: 'Pickup choice', identity_quote: 'I own SYNTHETIC Bakery.', activity_quote: 'We are taking cake orders this week.', decision_maker_quote: 'I own SYNTHETIC Bakery.', goal_quote: 'I want customers to choose pickup times more easily.' };
  await assert.rejects(apply('unverified-email', 'verification_confirmed', { ...confirmation, email: 'other@example.net', email_quote: 'other@example.net', email_permission_confirmed: true }), /exact transcript quote/);
  await apply('confirmed', 'verification_confirmed', { ...confirmation, email: 'owner@example.net', email_quote: 'Please email me at owner@example.net.', email_permission_confirmed: true });
  const r = (await s.app.snapshot()).prospects[s.id];
  assert.equal(r.stage, 'Discovery'); assert.equal(r.cold_paused, true);
  assert.equal(r.qualification.verdict, 'Verification call only');
  assert.equal(r.verification.conversation.transcript_sha256, hash(transcript));
  assert.equal(r.contact.email, 'owner@example.net'); assert.equal(r.contact.email_evidence.source, `call:${callId}`);
  assert.equal(Object.values((await s.app.snapshot()).actions).some(a => a.type === 'email'), false);
});

function nativeProvider(c, lostCreate = false, noAccount = false) {
  let person, lost = false; const calls = [], tasks = {};
  const respond = (operation, input) => {
    calls.push({ operation, input });
    if (operation === 'apollo_profile') return { id: c.apollo.user_id };
    if (operation === 'contact') return { contacts: person ? [person] : [], pagination: { total_pages: 1 } };
    if (operation === 'contact_create') {
      person = { ...input, id: 'owned-contact', account_id: 'owned-account', owner_id: c.apollo.user_id, email: null, phone_numbers: [{ raw_number: input.corporate_phone }], contact_campaign_statuses: [] };
      if (noAccount) delete person.account_id;
      if (lostCreate && !lost) { lost = true; throw Error('Synthetic lost contact receipt'); }
      return { contact: person };
    }
    if (operation === 'task_create') { const task = { ...input, id: `owned-task-${Object.keys(tasks).length}` }; tasks[task.id] = task; return { task }; }
    if (operation === 'task_read') return { task: tasks[input.id] };
    if (operation === 'task_skip') { tasks[input.id].status = 'skipped'; return { task: tasks[input.id] }; }
    throw Error(`Unexpected verification operation: ${operation}`);
  };
  return { calls, tasks, respond, person: () => person };
}
async function drive(app, p, session = 'verification-session') {
  const ops = operationsFor(app, session);
  for (let n = 0; n < 35; n++) {
    const r = await ops.next(); if (!r.operation) return r;
    await ops.settle(r.key, { structuredContent: p.respond(r.operation, r.input) });
  }
  throw Error('Synthetic verification cycle exceeded bound');
}
test('phone-only native tasks survive a lost contact receipt, preserve exact ownership, and cancel after a stop without email tools', async t => {
  const s = await setup(t); s.app.config.operations.enabled = true; await saveJson(join(s.directory, 'lifecycle-config.json'), s.app.config);
  await approveCallRelease(s.app, callReleaseFingerprint(s.app.config), 'fixture:final owner call-only approval');
  const p = nativeProvider(s.app.config, true), ops = operationsFor(s.app, 'before-contact-loss');
  for (;;) { const r = await ops.next(); if (r.operation === 'contact_create') { assert.throws(() => p.respond(r.operation, r.input), /lost contact/); break; } await ops.settle(r.key, { structuredContent: p.respond(r.operation, r.input) }); }
  s.advance(1); await drive(s.app, p, 'after-contact-loss');
  assert.equal(p.calls.filter(c => c.operation === 'contact_create').length, 1);
  assert.equal(p.calls.some(c => ['gmail_profile', 'calendar_profile', 'mailboxes', 'intent', 'personalize', 'send', 'draft', 'booking_create'].includes(c.operation)), false);
  assert.equal(p.calls.find(c => c.operation === 'contact_create').input.email, undefined);
  assert.equal(Object.keys(p.tasks).length, 1);
  assert.match(Object.values(p.tasks)[0].note, /NO AUTOMATIC EMAIL/);
  const state = await s.app.snapshot(); assert.ok(Object.values(state.operations.requests).find(r => r.operation === 'contact_create').reconciliation);
  await s.app.apply({ id: 'owner-stop', prospect_id: s.id, type: 'contact_stopped', at: s.app.now().toISOString(), data: { reason: 'do_not_contact' } });
  s.advance(1); await drive(s.app, p, 'cancel'); s.advance(1); await drive(s.app, p, 'readback');
  assert.equal(Object.values(p.tasks)[0].status, 'skipped');
  assert.equal(p.calls.filter(c => c.operation === 'task_skip').length, 1);
  assert.equal(Object.values((await s.app.snapshot()).actions).filter(a => a.provider_task)[0].status, 'Cancelled');
});

test('the actual dispatch guard allows only reviewed call tasks under a calls-only release', async t => {
  const s = await setup(t); s.app.config.operations.enabled = true; await saveJson(join(s.directory, 'lifecycle-config.json'), s.app.config);
  await approveCallRelease(s.app, callReleaseFingerprint(s.app.config), 'fixture:final owner call-only approval');
  const p = nativeProvider(s.app.config, false, true), operation = tool => ({ apollo_users_api_profile: 'apollo_profile', apollo_contacts_search: 'contact', apollo_contacts_create: 'contact_create', apollo_tasks_create: 'task_create', apollo_tasks_show: 'task_read' })[tool.split('apollo_io_')[1]];
  const result = await operationsTick(s.app, { paceMs: 0, connect: () => ({ async connect() {}, async close() {}, async call(tool, input) { return { structuredContent: p.respond(operation(tool), input) }; } }) });
  assert.equal(result.status, 'Complete'); assert.deepEqual((await s.app.snapshot()).operations.holds, {}); assert.equal(Object.keys(p.tasks).length, 1);
  assert.equal((await s.app.snapshot()).prospects[s.id].attempts.length, 0);
});

test('adding a new call candidate invalidates the calls-only scope while preserving original contacts and history', async t => {
  const s = await setup(t); await approveCallRelease(s.app, callReleaseFingerprint(s.app.config), 'fixture:final owner call-only approval');
  const before = (await s.app.snapshot()).prospects[s.id], next = packet(); next.id = 'verification-second'; next.business_name = 'SYNTHETIC Second Bakery'; next.identity.excerpt = next.business_name; next.phone = '(202) 555-0101'; next.sources[0].text = next.sources[0].text.replace('0100', '0101').replace('SYNTHETIC Bakery', next.business_name); next.sources[0].content_sha256 = sourceContentHash(next.sources[0]); next.public_phone.excerpt = next.public_phone.excerpt.replace('0100', '0101');
  await importVerification(s.app, next);
  assert.equal(s.app.config.calls_enabled, false); assert.equal(s.app.config.connector_writes_enabled, false);
  assert.equal(s.app.config.call_release.approved, false);
  assert.deepEqual((await s.app.snapshot()).prospects[s.id], before);
  await StudioLifecycle.open({ directory: s.directory, now: s.app.now });
});
