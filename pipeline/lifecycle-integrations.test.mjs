import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle, initialConfig, hash } from './lifecycle.mjs';
import { fixtureProspect, fixtureTranscript, fixtureProposal } from './lifecycle-fixtures.mjs';
import { assessTranscript } from './lifecycle-ai.mjs';
import { LifecycleBridge } from './lifecycle-bridge.mjs';
import { serveLifecycle } from './lifecycle-server.mjs';
import { saveJson } from './engine.mjs';
import { publishLifecycle } from './lifecycle-sync.mjs';
import { renderProposal, validateBookingSlot, checkCalendarReceipt } from './lifecycle-documents.mjs';
import { fixtureQuote } from './lifecycle-fixtures.mjs';
import { centsFromDollars } from './lifecycle-ui/money.js';

const at = '2026-10-19T15:00:00Z', id = 'fictional';
test('USD entry preserves cents exactly and refuses negative, ambiguous or over-precise values', () => {
  assert.equal(centsFromDollars('1200.01'), 120001); assert.equal(centsFromDollars('0.29'), 29); assert.equal(centsFromDollars('600'), 60000);
  for (const invalid of ['-1', '1e3', '1,200', '1.005', 'NaN', 'Infinity']) assert.throws(() => centsFromDollars(invalid), /USD dollars/);
});
const aiConfig = { ...initialConfig, priority: 'idle', transcript_ai: { ...initialConfig.transcript_ai, enabled: true } };
async function setup(t, config = aiConfig, connected = true) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-life-integration-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const app = await StudioLifecycle.initialize({ directory, config, now: () => new Date(at) });
  await app.apply(fixtureProspect(id, at));
  await app.apply({ id: 'call', prospect_id: id, type: 'call_logged', at, data: { call_id: 'call-1', outcome: connected ? 'connected' : 'no_answer', performed_at: at, simulated: true } });
  if (connected) await app.apply({ id: 'transcript', prospect_id: id, type: 'transcript_added', at, data: { call_id: 'call-1', text: fixtureTranscript, permission_confirmed: true } });
  return { app, directory };
}
const allowance = async () => ({ authenticated_subscription: true, checked_at: at, buckets: [{ remaining_percent: 80 }] });
const review = proposal => ({ schema_version: 1, proposal_sha256: hash(proposal), verdict: 'Accepted', summary_supported: true, outcome_supported: true, callback_supported: true,
  checks: proposal.claims.map((c, i) => ({ claim_index: i, supported: true, reason: 'Full claim supported by the exact transcript' })) });
test('subscription author and independent reviewer bind exact evidence; restart reuses accepted checkpoints without another call', async t => {
  const { app, directory } = await setup(t); const models = [];
  const invoke = async options => { models.push([options.model, options.effort]); assert.equal(options.phase, 'review'); return options.model === 'gpt-6-luna' ? fixtureProposal : review(fixtureProposal); };
  await assessTranscript(app, id, 'call-1', { invoke, usage: allowance });
  assert.deepEqual(models, [['gpt-6-luna', 'high'], ['gpt-6.1-sol', 'high']]);
  assert.equal((await app.snapshot()).prospects[id].stage, 'Connected review');
  const restart = await StudioLifecycle.open({ directory, now: () => new Date('2026-10-19T16:00:00Z') });
  await assessTranscript(restart, id, 'call-1', { invoke: async () => { throw Error('Must not dispatch'); }, usage: allowance });
  assert.equal(Object.keys((await restart.snapshot()).ai_attempts).length, 2);
});
test('low or unknown allowance and website priority hold inference without consuming a call', async t => {
  const { app, directory } = await setup(t); let calls = 0;
  const invoke = async () => { calls++; throw Error('Forbidden inference'); };
  await assert.rejects(assessTranscript(app, id, 'call-1', { invoke, usage: async () => ({ authenticated_subscription: true, buckets: [{ remaining_percent: 20 }] }) }), /reserve/);
  assert.equal(Object.keys((await app.snapshot()).ai_attempts).length, 0);
  await saveJson(join(directory, 'lifecycle-config.json'), { ...aiConfig, priority: 'website' });
  await assert.rejects(assessTranscript(app, id, 'call-1', { invoke, usage: allowance }), /priority/);
  assert.equal(calls, 0); assert.equal((await app.snapshot()).exceptions.length, 1);
});
test('one automatic evidence repair is bounded; failed review never produces an owner-approved outcome', async t => {
  const { app } = await setup(t); let calls = 0;
  await assert.rejects(assessTranscript(app, id, 'call-1', { usage: allowance, invoke: async options => {
    calls++; if (options.model === 'gpt-6-luna') return fixtureProposal;
    return { ...review(fixtureProposal), verdict: 'Needs repair', outcome_supported: false };
  } }), /bounded retry/);
  assert.equal(calls, 4); const state = await app.snapshot();
  assert.equal(state.prospects[id].proposals['call-1'], undefined); assert.equal(state.prospects[id].stage, 'Connected review');
  await assert.rejects(assessTranscript(app, id, 'call-1', { usage: allowance, invoke: async () => { throw Error('No more calls'); } }), /allowance reached/);
});
test('interrupted independent review resumes from the saved author result instead of regenerating the transcript assessment', async t => {
  const { app, directory } = await setup(t); let authors = 0;
  await assert.rejects(assessTranscript(app, id, 'call-1', { usage: allowance, invoke: async options => { if (options.model === 'gpt-6-luna') { authors++; return fixtureProposal; } throw new DOMException('Interrupted', 'AbortError'); } }), /Interrupted/);
  const restart = await StudioLifecycle.open({ directory, now: () => new Date(at) });
  await assessTranscript(restart, id, 'call-1', { usage: allowance, invoke: async options => { assert.equal(options.model, 'gpt-6.1-sol'); return review(fixtureProposal); } });
  assert.equal(authors, 1); assert.equal((await restart.snapshot()).exceptions.length, 0);
});
const apollo = { user_id: 'owned-user', bindings: { fictional: { contact_id: 'owned-contact', account_id: 'owned-account', email: 'fixture@example.invalid' } } };
async function bridgeSetup(t) {
  const s = await setup(t, { ...initialConfig, connector_writes_enabled: true, apollo }, false), bridge = new LifecycleBridge(s.app, 'session-1');
  await bridge.prepare('profile', 'profile'); await bridge.settle('profile', { structuredContent: { id: apollo.user_id } });
  await bridge.prepare('contact', 'contact', undefined, id); await bridge.settle('contact', { structuredContent: { contacts: [{ id: 'owned-contact', account_id: 'owned-account', owner_id: 'owned-user', email: 'fixture@example.invalid', phone_numbers: [] }] } });
  return { ...s, bridge, action: 'call-email' };
}
test('native handoff remains an unsent standalone task and becomes verified only after exact readback', async t => {
  const { app, bridge, action } = await bridgeSetup(t), prepared = await bridge.prepare('create', 'create_task', action, id);
  assert.equal(prepared.input.type, 'outreach_manual_email'); assert.ok(prepared.input.standalone_outreach_task_message.body_text.includes('Do not send'));
  const task = { ...prepared.input, id: 'provider-task', emailer_message: { status: 'drafted' } };
  await bridge.settle('create', { structuredContent: { task } }); assert.equal((await app.snapshot()).actions[action].status, 'Awaiting readback');
  await bridge.prepare('read', 'read_task', action, id); const { user_id, account_id, contact_id, ...compact } = task; compact.contact = { id: 'owned-contact' };
  await bridge.settle('read', { structuredContent: compact }); assert.equal((await app.snapshot()).actions[action].status, 'Verified');
  assert.equal((await app.dashboard()).daily.actual_emails, 0);
});
test('lost task-create responses cannot be replayed and are reconciled through an exact owned search', async t => {
  const { app, bridge, action } = await bridgeSetup(t), request = await bridge.prepare('create', 'create_task', action, id);
  await assert.rejects(bridge.prepare('create-again', 'create_task', action, id), /already dispatched/);
  await bridge.prepare('reconcile', 'search_task', action, id);
  await bridge.settle('reconcile', { structuredContent: { tasks: [{ ...request.input, id: 'provider-task', emailer_message: { status: 'drafted' } }] } });
  assert.equal((await app.snapshot()).bridge.operations.create.status, 'Done');
  assert.equal((await app.snapshot()).actions[action].status, 'Awaiting readback');
});
test('provider errors/changed identities hold the action and cannot be reported as success', async t => {
  const { app, bridge, action } = await bridgeSetup(t); await bridge.prepare('create', 'create_task', action, id);
  await assert.rejects(bridge.settle('create', { isError: true, content: [{ type: 'text', text: 'Provider error' }] }));
  assert.equal((await app.snapshot()).actions[action].status, 'Uncertain');
});
test('a failed fresh owner read revokes the previous session verification before any subsequent mutation', async t => {
  const { bridge, action } = await bridgeSetup(t);
  await bridge.prepare('owner-changed', 'profile');
  await assert.rejects(bridge.settle('owner-changed', { structuredContent: { id: 'foreign-owner' } }), /differs from the owner/);
  await assert.rejects(bridge.prepare('blocked-create', 'create_task', action, id), /Verify owner/);
  await bridge.prepare('fresh-profile', 'profile'); await bridge.settle('fresh-profile', { structuredContent: { id: apollo.user_id } });
  await bridge.prepare('contact-changed', 'contact', undefined, id);
  await assert.rejects(bridge.settle('contact-changed', { structuredContent: { contacts: [{ id: 'owned-contact', account_id: 'owned-account', owner_id: 'foreign-owner', email: 'fixture@example.invalid', phone_numbers: [] }] } }), /owned no-phone/);
  await assert.rejects(bridge.prepare('blocked-contact-create', 'create_task', action, id), /Verify owner/);
});
test('Apollo second-precision timestamps and compact filtered searches reconcile without adopting a changed owner or draft', async t => {
  const { app, bridge, action } = await bridgeSetup(t), request = await bridge.prepare('create', 'create_task', action, id);
  await bridge.prepare('search', 'search_task', action, id);
  const task = { id: 'provider-task', title: request.input.title, type: 'outreach_manual_email', status: 'scheduled', due_at: request.input.due_at.replace('.000Z', '.000+00:00'), contact: { id: 'owned-contact' } };
  await bridge.settle('search', { structuredContent: { tasks: [task] } });
  await bridge.prepare('read', 'read_task', action, id);
  await assert.rejects(bridge.settle('read', { structuredContent: { ...task, note: request.input.note, user_id: null, emailer_message: { status: 'drafted' }, standalone_outreach_task_message: request.input.standalone_outreach_task_message } }), /owned standalone/);
  assert.equal((await app.snapshot()).actions[action].status, 'Uncertain');
  await bridge.prepare('read-correct', 'read_task', action, id);
  await bridge.settle('read-correct', { structuredContent: { ...task, note: request.input.note, emailer_message: { status: 'drafted' }, standalone_outreach_task_message: request.input.standalone_outreach_task_message } });
  assert.equal((await app.snapshot()).actions[action].status, 'Verified');
});
test('loopback console rejects unauthenticated, cross-origin, forged-worker and stale owner actions; serves safe local assets', async t => {
  const { app } = await setup(t, initialConfig), server = await serveLifecycle(app, { port: 0, quiet: true });
  t.after(() => new Promise(resolve => server.close(resolve))); const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/state`)).status, 400);
  const page = await fetch(base), cookie = page.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 200);
  assert.ok(page.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  const state = await (await fetch(`${base}/api/state`, { headers: { cookie } })).json();
  const post = (input, origin = base) => fetch(`${base}/api/event`, { method: 'POST', headers: { cookie, origin, 'Content-Type': 'application/json', 'X-Studio-Token': state.csrf }, body: JSON.stringify(input) });
  const event = { id: 'owner-note', prospect_id: id, type: 'note_added', at, data: { note: '<script>Never execute this</script>' } };
  assert.equal((await post({ event, revision: state.revision }, 'https://untrusted.example')).status, 400);
  assert.equal((await post({ event: { ...event, type: 'transcript_assessed' }, revision: state.revision })).status, 400);
  assert.equal((await post({ event, revision: 0 })).status, 400);
  assert.equal((await post({ event, revision: state.revision })).status, 200);
  assert.equal((await app.snapshot()).prospects[id].note, '<script>Never execute this</script>');
  assert.equal((await fetch(`${base}/lifecycle-state.json`, { headers: { cookie } })).status, 400);
  assert.equal((await fetch(`${base}/preview/`)).status, 200);
});
test('lost Google write response reconciles once, preserves owner edits and never replays a restarted pending publication', async t => {
  const google = { spreadsheet_id: 'owned-sheet', sheet_id: 123, sheet_title: 'Lifecycle proof' };
  const { app } = await setup(t, { ...initialConfig, google }, false); let cells = [], writes = 0;
  const queue = { values: async () => structuredClone(cells), request: async (method, suffix, data) => {
    if (method === 'GET') return { spreadsheetId: 'owned-sheet', sheets: [{ properties: { sheetId: 123, title: 'Lifecycle proof' } }] };
    assert.equal(method, 'PUT'); writes++; cells = data.values; throw Error('Committed write lost its response');
  } };
  assert.equal((await publishLifecycle(app, queue)).verified, true); assert.equal(writes, 1);
  assert.equal((await publishLifecycle(app, queue)).unchanged, true); assert.equal(writes, 1);
  cells[1][2] = 'Owner edit'; await assert.rejects(publishLifecycle(app, queue), /preserve owner edits/); assert.equal(writes, 1);
  await app.change(state => { state.sheet_projection.status = 'Pending'; });
  await assert.rejects(publishLifecycle(app, queue), /Uncertain Sheet write/); assert.equal(writes, 1);
});
test('Google projection can add a new fictional row without overwriting previous records or unrelated tabs', async t => {
  const google = { spreadsheet_id: 'owned-sheet', sheet_id: 123, sheet_title: 'Lifecycle proof' };
  const { app } = await setup(t, { ...initialConfig, google }, false); let cells = [], writes = 0;
  const queue = { values: async () => structuredClone(cells), request: async (method, suffix, data) => {
    if (method === 'GET') return { spreadsheetId: 'owned-sheet', sheets: [{ properties: { sheetId: 123, title: 'Lifecycle proof' } }] };
    assert.ok(data.range.startsWith("'Lifecycle proof'!")); cells = data.values; writes++; return {};
  } };
  await publishLifecycle(app, queue); await app.apply(fixtureProspect('another-fictional', at)); await publishLifecycle(app, queue);
  assert.equal(cells.length, 3); assert.equal(cells[1][0], 'fictional'); assert.equal(cells[2][0], 'another-fictional'); assert.equal(writes, 2);
});
test('proposal includes approved terms and escapes untrusted text; calendar slots require fresh availability and buffer', () => {
  const html = renderProposal({ name: '<script>untrusted</script>', controlled: true, quote: { ...fixtureQuote, approved_at: at }, discovery: { goal: 'A clear request flow', decision_maker: 'Fictional owner' } });
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('$1,200.00'));
  for (const title of ['Acceptance criteria', 'Ownership and licenses', 'Support boundaries', 'Cancellation']) assert.ok(html.includes(title));
  const slot = { start: '2026-10-19T16:00:00Z', end: '2026-10-19T16:20:00Z', timezone: 'America/New_York' }, now = new Date(at);
  assert.equal(validateBookingSlot(slot, [], initialConfig.calendar, at, now), slot);
  assert.throws(() => validateBookingSlot(slot, [{ start: '2026-10-19T16:30:00Z', end: '2026-10-19T17:00:00Z' }], initialConfig.calendar, at, now), /buffer/);
  assert.throws(() => validateBookingSlot(slot, [], initialConfig.calendar, '2026-10-19T14:00:00Z', now), /Recheck/);
  const config = { ...initialConfig.calendar, owner_email: 'owner@example.invalid', calendar_id: 'primary' };
  const packet = { profile: { structuredContent: { email: config.owner_email } }, availability: { structuredContent: { calendars: [{ calendar_id: 'primary', busy: [], errors: null }] } },
    slot, checked_at: at, input: { calendar_ids: ['primary'], time_min: '2026-10-19T15:45:00Z', time_max: '2026-10-19T16:35:00Z' } };
  assert.equal(checkCalendarReceipt(packet, config, now).invitation, 'not created');
  assert.throws(() => checkCalendarReceipt(packet, { ...config, owner_email: 'another@example.invalid' }, now), /intended calendar owner/);
});
