import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApolloTestConnection, applyTestEvent, emailGate, unwrapApollo } from './apollo.mjs';

const run = 'studio-outreach-test-20261016-1234abcd';
const config = { schema_version: 1, mode: 'controlled-test', enabled: true, run_id: run,
  user_id: '111111111111111111111111', recipients: ['owner@example.com'], time_zone: 'America/New_York' };
const flow = () => ({ events: [], status: 'Awaiting call', calls: [], emails: [] });
const noAnswer = (id = 'call-1', at = '2026-10-16T14:00:00Z') => ({ id, type: 'simulated_call', outcome: 'no_answer', at });
const now = () => new Date('2026-10-16T15:00:00Z');

async function fixture(overrides = {}, clock = now) {
  const directory = await mkdtemp(join(tmpdir(), 'apollo-controlled-'));
  const connection = await ApolloTestConnection.open({ directory, config: { ...config, ...overrides }, now: clock });
  await connection.prepare('owner', 'profile');
  await connection.settle('owner', { id: config.user_id });
  return { directory, connection };
}

async function ownedContact(connection) {
  const account = await connection.prepare('company', 'account_create');
  await connection.settle('company', { account: { ...account.input, id: '222222222222222222222222' } });
  await connection.prepare('lookup', 'contact_search');
  await connection.settle('lookup', { contacts: [] });
  const person = await connection.prepare('person', 'contact_create');
  // Apollo title-cases contact names but retains the exact test email, account and organization.
  await connection.settle('person', { contact: { ...person.input, first_name: 'Studio Test', id: '333333333333333333333333' } });
}
const approvedMessage = { to: 'owner@example.com', from: 'sender@example.com', mailbox_id: '444444444444444444444444',
  subject: '[STUDIO TEST] Call-first workflow check', body_html: '<p>CONTROLLED TEST — no actual call placed.</p>', confirmed: true };
async function mailbox(connection) {
  await connection.prepare('mailbox', 'mailboxes');
  await connection.settle('mailbox', { email_accounts: [{ id: approvedMessage.mailbox_id, email: approvedMessage.from }] });
}

test('production, malformed scope and private state inside Git are rejected', async () => {
  await assert.rejects(fixture({ mode: 'production' }), /controlled/i);
  await assert.rejects(fixture({ run_id: 'real-business' }), /run/i);
  await assert.rejects(ApolloTestConnection.open({ directory: process.cwd(), config, now }), /Git/i);
});

test('disabled mutations are inert and read operations remain bounded', async () => {
  const { connection } = await fixture({ enabled: false });
  await assert.rejects(connection.prepare('company', 'account_create'), /disabled/i);
  const request = await connection.prepare('lookup', 'contact_search');
  assert.equal(request.input.q_keywords, `${run}@example.invalid`);
  assert.equal(request.input.per_page, 10);
});

test('account/contact construction cannot accept real businesses or arbitrary fields', async () => {
  const { connection } = await fixture();
  await assert.rejects(connection.prepare('company', 'account_create', { domain: 'real.example' }), /arguments/i);
  const request = await connection.prepare('company', 'account_create');
  assert.equal(request.input.domain, `${run}.invalid`);
  assert.match(request.input.name, /^STUDIO TEST /);
  await connection.settle('company', { account: { id: '222222222222222222222222', ...request.input } });
  await assert.rejects(connection.prepare('person', 'contact_create'), /empty contact search/i);
  await connection.prepare('lookup', 'contact_search');
  await connection.settle('lookup', { contacts: [] });
  const person = await connection.prepare('person', 'contact_create');
  assert.equal(person.input.email, `${run}@example.invalid`);
  assert.equal(person.input.account_id, '222222222222222222222222');
  assert.equal(person.input.direct_phone, undefined);
});

test('create receipt survives restart; pending or uncertain creates never replay', async () => {
  const { directory, connection } = await fixture();
  await connection.prepare('company', 'account_create');
  const resumed = await ApolloTestConnection.open({ directory, config, now });
  await assert.rejects(resumed.prepare('company', 'account_create'), /pending|uncertain|reconcile/i);
  await resumed.prepare('owner-resume', 'profile');
  await resumed.settle('owner-resume', { id: config.user_id });
  await assert.rejects(resumed.prepare('company-retry', 'account_create'), /pending|uncertain|reconcile/i);
  await resumed.settle('company', { account: { id: '222222222222222222222222', name: `STUDIO TEST ${run}`, domain: `${run}.invalid` } });
  assert.equal((await resumed.prepare('company', 'account_create')).already_done, true);
});

test('foreign provider record is held rather than adopted', async () => {
  const { connection } = await fixture();
  await connection.prepare('company', 'account_create');
  await assert.rejects(connection.settle('company', { account: { id: '222222222222222222222222', name: 'Unrelated', domain: 'business.example' } }), /owned|match|scope/i);
  await assert.rejects(connection.prepare('company', 'account_create'), /reconcile|uncertain|pending/i);
});

test('missing/skipped call cannot release email and simulation is explicitly test-only', () => {
  assert.equal(emailGate(flow(), now()).allowed, false);
  const skipped = applyTestEvent(flow(), { id: 'skip', type: 'skipped_call', at: now().toISOString() }, now());
  assert.equal(emailGate(skipped, now()).allowed, false);
  const called = applyTestEvent(flow(), noAnswer(), now());
  assert.equal(emailGate(called, now()).allowed, true);
  assert.equal(called.actual_outreach_count ?? 0, 0);
  assert.throws(() => applyTestEvent(flow(), { ...noAnswer(), type: 'actual_call' }, now()), /simulated|type/i);
});

test('two-call/two-email caps survive duplicate events; conflicting duplicates fail', () => {
  let state = applyTestEvent(flow(), noAnswer(), now());
  state = applyTestEvent(state, noAnswer(), now());
  assert.equal(state.calls.length, 1);
  assert.throws(() => applyTestEvent(state, { ...noAnswer(), outcome: 'decline' }, now()), /conflict/i);
  state = applyTestEvent(state, noAnswer('call-2'), now());
  assert.throws(() => applyTestEvent(state, noAnswer('call-3'), now()), /call.*cap/i);
  state = applyTestEvent(state, { id: 'email-1', type: 'test_email_sent', at: now().toISOString() }, now());
  state = applyTestEvent(state, { id: 'email-2', type: 'test_email_sent', at: now().toISOString() }, now());
  assert.equal(emailGate(state, now()).allowed, false);
  assert.throws(() => applyTestEvent(state, { id: 'email-3', type: 'test_email_sent', at: now().toISOString() }, now()), /email.*cap/i);
});

test('reply pauses and decline wins over old positive events after restart', () => {
  let state = applyTestEvent(flow(), noAnswer(), now());
  state = applyTestEvent(state, { id: 'reply', type: 'reply', at: now().toISOString() }, now());
  assert.equal(emailGate(state, now()).allowed, false);
  state = applyTestEvent(state, { id: 'stop', type: 'decline', at: now().toISOString() }, now());
  state = JSON.parse(JSON.stringify(state));
  state = applyTestEvent(state, { id: 'old-call', type: 'simulated_call', outcome: 'interested', at: '2026-10-16T13:00:00Z' }, now());
  assert.equal(state.status, 'Stopped');
  assert.equal(emailGate(state, now()).allowed, false);
});

test('ten-business-day window uses first attempt, handles weekend and rejects future/invalid events', () => {
  const state = applyTestEvent(flow(), noAnswer(), now());
  assert.equal(emailGate(state, new Date('2026-10-19T15:00:00Z')).allowed, true);
  assert.equal(emailGate(state, new Date('2026-10-30T15:00:00Z')).allowed, false);
  assert.throws(() => applyTestEvent(flow(), { ...noAnswer(), at: 'not-a-date' }, now()), /date|time/i);
  assert.throws(() => applyTestEvent(flow(), noAnswer('future', '2027-01-01T00:00:00Z'), now()), /future/i);
});

test('draft requires no-answer gate, exact confirmed sender/message/recipient and known mailbox', async () => {
  const { connection } = await fixture();
  await assert.rejects(connection.prepare('draft-1', 'draft_create'), /mailbox|confirm|call/i);
  const { connection: called } = await fixture();
  await called.event(noAnswer());
  await assert.rejects(called.prepare('draft-1', 'draft_create'), /mailbox|confirm/i);
});

test('MCP wrapper errors and malformed content fail without exposing provider payload', () => {
  assert.deepEqual(unwrapApollo({ content: [{ type: 'text', text: '{"email_accounts":[]}' }] }), { email_accounts: [] });
  assert.throws(() => unwrapApollo({ isError: true, content: [{ type: 'text', text: 'secret' }] }), /Apollo operation failed/);
  assert.throws(() => unwrapApollo({ content: [{ type: 'text', text: 'not JSON' }] }), /JSON/i);
});

test('a changed or unverified login blocks every mutation, including after reopening', async () => {
  const { directory, connection } = await fixture();
  const resumed = await ApolloTestConnection.open({ directory, config, now });
  await assert.rejects(resumed.prepare('company', 'account_create'), /verify.*account|account.*session/i);
  await connection.prepare('owner-check', 'profile');
  await assert.rejects(connection.settle('owner-check', { id: '999999999999999999999999' }), /owner changed/i);
  await assert.rejects(connection.prepare('company', 'account_create'), /verify.*account|account.*session/i);
});

test('replies, callbacks and route failures cannot be undone by late no-answer outcomes', () => {
  for (const event of [{ id: 'reply', type: 'reply', at: now().toISOString() },
    { id: 'bounce', type: 'bounce', at: now().toISOString() },
    { id: 'callback', type: 'simulated_call', outcome: 'callback', at: now().toISOString() }]) {
    let state = applyTestEvent(flow(), event, now());
    const paused = state.status;
    state = applyTestEvent(state, noAnswer('old-no-answer'), now());
    assert.equal(state.status, paused);
    assert.equal(emailGate(state, now()).allowed, false);
  }
  let state = applyTestEvent(flow(), { id: 'connected', type: 'simulated_call', outcome: 'interested', at: now().toISOString() }, now());
  state = applyTestEvent(state, { ...noAnswer(), outcome: 'decline' }, now());
  assert.equal(state.status, 'Stopped');
});

test('an older attempt arriving late cannot extend the ten-business-day window', () => {
  const later = () => new Date('2026-10-30T15:00:00Z');
  let state = applyTestEvent(flow(), noAnswer('new', '2026-10-29T15:00:00Z'), later());
  state = applyTestEvent(state, noAnswer('old'), later());
  assert.equal(emailGate(state, later()).reason, 'Ten-business-day expiry');
});

test('lost task-create response reconciles by exact owned task search without replay', async () => {
  const { directory, connection } = await fixture(); await ownedContact(connection);
  const request = await connection.prepare('call-create', 'task_create');
  // External creation succeeded; the process lost its receipt before settling it.
  const resumed = await ApolloTestConnection.open({ directory, config, now });
  await resumed.prepare('owner-resume', 'profile'); await resumed.settle('owner-resume', { id: config.user_id });
  await assert.rejects(resumed.prepare('call-retry', 'task_create'), /pending|uncertain/i);
  await resumed.prepare('recover', 'task_search');
  await resumed.settle('recover', { tasks: [{ id: '555555555555555555555555', type: 'call', title: request.input.title,
    status: 'scheduled', contact: { id: request.input.contact_id } }], pagination: { total_pages: 1 } });
  assert.equal((await resumed.prepare('call-create', 'task_create')).already_done, true);
  assert.equal((await resumed.prepare('another-call', 'task_create')).already_done, true);
  assert.equal((await resumed.state()).actions['call-create'].reconciled_by, 'recover');
});

test('a phone task is never completed to represent a simulated call', async () => {
  const { connection } = await fixture(); await ownedContact(connection);
  const task = await connection.prepare('fixture-task', 'task_create', { kind: 'fixture' });
  assert.equal(task.input.due_at, now().toISOString());
  await connection.settle('fixture-task', { task: { ...task.input, id: '666666666666666666666666', status: 'scheduled' } });
  await connection.prepare('read-fixture', 'task_show', { kind: 'fixture' });
  await connection.settle('read-fixture', { task: { ...task.input, id: '666666666666666666666666', status: 'scheduled' } });
  await assert.rejects(connection.prepare('complete', 'fixture_complete'), /execute.*fixture/i);
  await connection.event(noAnswer());
  const completion = await connection.prepare('complete', 'fixture_complete');
  assert.equal(completion.input.id, '666666666666666666666666');
  assert.match(completion.input.note, /No phone call placed/);
  await assert.rejects(connection.prepare('complete-phone', 'tasks_complete'), /Unsupported/i);
});

test('full controlled email branch verifies the envelope, counts only delivery and never resends', async () => {
  let instant = now();
  const { connection } = await fixture({ approved_message: approvedMessage }, () => instant);
  await ownedContact(connection); await mailbox(connection);
  await assert.rejects(connection.prepare('before-call', 'draft_create'), /no-answer/i);
  await connection.event({ id: 'skip', type: 'skipped_call', at: instant.toISOString() });
  await assert.rejects(connection.prepare('after-skip', 'draft_create'), /no-answer/i);
  await connection.event(noAnswer());
  const draft = await connection.prepare('draft', 'draft_create');
  assert.deepEqual(draft.input.recipients, [{ email: approvedMessage.to, recipient_type_cd: 'to' }]);
  const message = { ...draft.input, id: '777777777777777777777777', status: 'drafted' };
  await connection.settle('draft', { emailer_message: message });
  const send = await connection.prepare('send', 'send');
  assert.deepEqual(send.input.send_from, { email: approvedMessage.from, email_account_id: approvedMessage.mailbox_id });
  await connection.settle('send', { emailer_message: { id: message.id, status: 'scheduled' } });
  assert.equal((await connection.state()).flow.emails.length, 0);
  await assert.rejects(connection.prepare('send-again', 'send'), /reserved|resend/i);
  for (const [key, status] of [['delivered', 'completed'], ['read-again', 'completed'], ['reply', 'replied']]) {
    instant = new Date(+instant + 1000);
    await connection.prepare(key, 'message_status');
    await connection.settle(key, { id: message.id, status });
  }
  const state = await connection.state();
  assert.equal(state.flow.emails.length, 1);
  assert.equal(state.flow.actual_outreach_count, 0);
  assert.equal(state.flow.status, 'Reply review');
  assert.equal(emailGate(state.flow, instant).allowed, false);
});

test('unknown eligibility fails closed and one no-answer cannot unlock repeated emails', () => {
  let state = applyTestEvent(flow(), noAnswer(), now());
  assert.equal(emailGate({ ...state, status: 'Unrecognized' }, now()).allowed, false);
  state = applyTestEvent(state, { id: 'first-email', type: 'test_email_sent', at: now().toISOString() }, now());
  assert.equal(emailGate(state, now()).allowed, false);
  state = applyTestEvent(state, noAnswer('second-call'), now());
  assert.equal(emailGate(state, now()).allowed, true);
});

test('unexpected recipient or unresolved personalization holds the message before sending', async () => {
  await assert.rejects(fixture({ approved_message: { ...approvedMessage, body_html: 'CONTROLLED TEST {{business_name}}' } }), /placeholder/i);
  const { connection } = await fixture({ approved_message: approvedMessage }); await ownedContact(connection); await mailbox(connection); await connection.event(noAnswer());
  const draft = await connection.prepare('draft', 'draft_create');
  await assert.rejects(connection.settle('draft', { emailer_message: { ...draft.input, id: '777777777777777777777777',
    recipients: [{ email: 'unapproved@example.com', recipient_type_cd: 'to' }] } }), /confirmed owner-only/i);
  await assert.rejects(connection.prepare('send', 'send'), /draft required/i);
  await assert.rejects(connection.prepare('duplicate-draft', 'draft_create'), /pending|uncertain/i);
});

test('Apollo can wrap the unchanged body in an empty HTML document without weakening message checks', async () => {
  const { connection } = await fixture({ approved_message: approvedMessage });
  await ownedContact(connection); await mailbox(connection); await connection.event(noAnswer());
  const draft = await connection.prepare('wrapped-draft', 'draft_create');
  const message = { ...draft.input, id: '777777777777777777777777', status: 'drafted',
    body_html: `<html><head></head><body>${approvedMessage.body_html}</body></html>` };
  const state = await connection.state();
  assert.throws(() => connection.verifyDraft({ ...message, body_html: message.body_html.replace('<head>', '<head><script>changed()</script>') }, state), /confirmed owner-only/i);
  assert.throws(() => connection.verifyDraft({ ...message, body_html: message.body_html.replace('no actual call', 'actual call') }, state), /confirmed owner-only/i);
  assert.throws(() => connection.verifyDraft({ ...message, from_email: 'other@example.com' }, state), /confirmed owner-only/i);
  assert.throws(() => connection.verifyDraft({ ...message, bcc_emails: ['other@example.com'] }, state), /confirmed owner-only/i);
  await connection.settle('wrapped-draft', { emailer_message: message });
  assert.equal((await connection.prepare('wrapped-send', 'send')).input.id, message.id);
});

async function deliveredOwnerEmail() {
  const result = await fixture({ approved_message: approvedMessage }); const connection = result.connection;
  await ownedContact(connection); await mailbox(connection); await connection.event(noAnswer());
  const draft = await connection.prepare('draft', 'draft_create');
  await connection.settle('draft', { emailer_message: { ...draft.input, id: '777777777777777777777777' } });
  await connection.prepare('send', 'send'); await connection.settle('send', { id: '777777777777777777777777', status: 'scheduled' });
  await connection.prepare('delivered', 'message_status'); await connection.settle('delivered', { id: '777777777777777777777777', status: 'completed' });
  return result;
}
function gmailReplyReceipt() {
  const headers = values => Object.entries(values).map(([name, value]) => ({ name, value }));
  return { gmail_profile: { structuredContent: { email: approvedMessage.from } }, gmail_thread: { structuredContent: {
    id: 'aaaaaaaaaaaaaaaa', messages: [
      { id: 'aaaaaaaaaaaaaaaa', thread_id: 'aaaaaaaaaaaaaaaa', label_ids: ['SENT'], internal_date: String(+now()),
        payload: { headers: headers({ From: approvedMessage.from, To: `Owner <${approvedMessage.to}>`, Subject: approvedMessage.subject, 'Message-ID': '<controlled@example.com>' }) } },
      { id: 'bbbbbbbbbbbbbbbb', thread_id: 'aaaaaaaaaaaaaaaa', label_ids: ['INBOX'], internal_date: String(+now()),
        payload: { headers: headers({ From: `Owner <${approvedMessage.to}>`, To: approvedMessage.from, Subject: `Re: ${approvedMessage.subject}`, 'In-Reply-To': '<controlled@example.com>' }) } }
    ] } } };
}

test('verified Gmail reply pauses the actual test state and remains idempotent after restart', async () => {
  const { directory, connection } = await deliveredOwnerEmail();
  await connection.receiveReply(gmailReplyReceipt());
  const resumed = await ApolloTestConnection.open({ directory, config: { ...config, approved_message: approvedMessage }, now });
  await resumed.receiveReply(gmailReplyReceipt());
  const state = await resumed.state();
  assert.equal(state.flow.status, 'Reply review');
  assert.equal(state.flow.events.filter(e => e.source === 'gmail_readback').length, 1);
  assert.equal(state.flow.emails.length, 1);
  assert.equal(state.flow.actual_outreach_count, 0);
  assert.equal(emailGate(state.flow, now()).allowed, false);
});

test('wrong Gmail owner, unrelated reply and forged header lists cannot be adopted', async () => {
  const { connection } = await deliveredOwnerEmail();
  const wrongOwner = gmailReplyReceipt(); wrongOwner.gmail_profile.structuredContent.email = 'foreign@example.com';
  await assert.rejects(connection.receiveReply(wrongOwner), /Gmail owner/i);
  for (const [replacement, expected] of [['<another@example.com>', /matching reply/i], ['<controlled@example.com>\r\nextra', /header/i]]) {
    const unrelated = gmailReplyReceipt(); unrelated.gmail_thread.structuredContent.messages[1].payload.headers.find(h => h.name === 'In-Reply-To').value = replacement;
    await assert.rejects(connection.receiveReply(unrelated), expected);
  }
  const spoof = gmailReplyReceipt(); spoof.gmail_thread.structuredContent.messages[1].payload.headers.push({ name: 'From', value: 'foreign@example.com' });
  await assert.rejects(connection.receiveReply(spoof), /header/i);
  assert.equal((await connection.state()).flow.status, 'Email eligible');
});

const monitorConfig = { enabled: true, thread_id: 'aaaaaaaaaaaaaaaa', interval_minutes: 5,
  sequence_create_confirmed: true, enrollment_confirmed: true };
const sequenceName = `STUDIO TEST ${run} reply-stop`;
const sequenceId = '888888888888888888888888';
const membership = status => ({ emailer_campaign_id: sequenceId, status });
async function monitorFixture() {
  const result = await deliveredOwnerEmail();
  result.connection.config.reply_monitor = { ...monitorConfig };
  return result;
}
async function settleMonitor(connection, expected, result) {
  const request = await connection.monitorNext();
  assert.equal(request.operation, expected);
  await connection.settle(request.key, result);
  return request;
}
async function queuePausedSequence(connection) {
  await connection.prepare('sequence-lookup', 'sequence_search'); await connection.settle('sequence-lookup', { emailer_campaigns: [] });
  const create = await connection.prepare('sequence-create', 'sequence_create');
  assert.equal(create.input.active, false);
  assert.equal(create.input.permissions, 'private');
  assert.equal(create.input.emailer_steps.length, 2);
  await connection.settle('sequence-create', { emailer_campaign: { id: sequenceId, ...create.input } });
  const enroll = await connection.prepare('sequence-enroll', 'sequence_enroll');
  assert.equal(enroll.input.status, 'paused');
  assert.equal(enroll.input.auto_unpause_at, undefined);
  await connection.settle('sequence-enroll', { contacts: [{ id: '333333333333333333333333', contact_campaign_statuses: [membership('paused')] }] });
  return create.input;
}
async function monitoredReply(connection) {
  const receipt = gmailReplyReceipt();
  await settleMonitor(connection, 'gmail_profile', receipt.gmail_profile);
  await settleMonitor(connection, 'gmail_thread', receipt.gmail_thread);
  assert.equal((await connection.state()).flow.status, 'Reply review');
}
async function stopPreflight(connection, sequence, status = 'paused') {
  await settleMonitor(connection, 'profile', { id: config.user_id });
  const original = (await connection.state()).records.contact;
  await settleMonitor(connection, 'contact_search', { contacts: [{ ...original, contact_campaign_statuses: [membership(status)] }] });
  await settleMonitor(connection, 'sequence_search', { emailer_campaigns: [{ id: sequenceId, ...sequence }] });
}

test('monitor remains inert when disabled and resumes a pending read without broadening its scope', async () => {
  const { directory, connection } = await monitorFixture();
  connection.config.reply_monitor.enabled = false;
  assert.equal((await connection.monitorNext()).status, 'Disabled');
  connection.config.reply_monitor.enabled = true;
  const request = await connection.monitorNext();
  assert.equal(request.tool, 'mcp__codex_apps__gmail_get_profile');
  const resumed = await ApolloTestConnection.open({ directory, config: connection.config, now });
  assert.deepEqual(await resumed.monitorNext(), request);
  await resumed.settle(request.key, gmailReplyReceipt().gmail_profile);
  const thread = await resumed.monitorNext();
  assert.deepEqual(thread.input, { thread_id: monitorConfig.thread_id, max_messages: 20 });
  assert.equal(thread.tool, 'mcp__codex_apps__gmail_read_email_thread');
});

test('no-reply polling completes quietly, respects the interval and keeps a compact read ledger', async () => {
  let instant = now();
  const { directory, connection } = await monitorFixture(); connection.now = () => instant;
  await mkdir(join(directory, 'receipts'));
  const evidence = join(directory, 'receipts', 'original-proof.json'); await writeFile(evidence, 'keep');
  let firstRead;
  const receipt = gmailReplyReceipt(); receipt.gmail_thread.structuredContent.messages.pop();
  for (let n = 0; n < 3; n++) {
    await settleMonitor(connection, 'gmail_profile', receipt.gmail_profile);
    await settleMonitor(connection, 'gmail_thread', receipt.gmail_thread);
    assert.equal((await connection.monitorNext()).status, 'Complete');
    if (n === 0) {
      firstRead = Object.keys((await connection.state()).actions).find(k => k.startsWith('monitor-'));
      await writeFile(join(directory, 'receipts', firstRead + '.json'), 'old completed read');
      await writeFile(join(directory, firstRead + '.json'), 'outside receipts; keep');
    }
    assert.equal((await connection.monitorNext()).status, 'Waiting');
    instant = new Date(+instant + 300000);
  }
  const state = await connection.state();
  assert.equal(state.flow.status, 'Email eligible');
  assert.equal(Object.values(state.actions).filter(a => a.monitor_read).length, 2);
  assert.equal(state.monitor.completed_cycles, 3);
  assert.equal(await readFile(evidence, 'utf8'), 'keep');
  await assert.rejects(readFile(join(directory, 'receipts', firstRead + '.json')), { code: 'ENOENT' });
  assert.equal(await readFile(join(directory, firstRead + '.json'), 'utf8'), 'outside receipts; keep');
});

test('a slow provider read does not postpone the next five-minute poll', async () => {
  const start = +now(); let instant = now();
  const { connection } = await monitorFixture(); connection.now = () => instant;
  const receipt = gmailReplyReceipt(); receipt.gmail_thread.structuredContent.messages.pop();
  await settleMonitor(connection, 'gmail_profile', receipt.gmail_profile);
  instant = new Date(start + 15000);
  await settleMonitor(connection, 'gmail_thread', receipt.gmail_thread);
  assert.equal((await connection.monitorNext()).status, 'Complete');
  instant = new Date(start + 300000);
  assert.equal((await connection.monitorNext()).operation, 'gmail_profile');
});

test('verified reply stops only the owned paused sequence and requires independent terminal readback', async () => {
  const { connection } = await monitorFixture();
  const sequence = await queuePausedSequence(connection);
  connection.config.enabled = false;
  await monitoredReply(connection);
  await stopPreflight(connection, sequence);
  const stop = await connection.monitorNext();
  assert.equal(stop.operation, 'sequence_stop');
  assert.deepEqual(stop.input.contact_ids, ['333333333333333333333333']);
  assert.deepEqual(stop.input.emailer_campaign_ids, [sequenceId]);
  assert.equal(stop.input.mode, 'stop');
  await connection.settle(stop.key, { entity_progress_job: { id: '999999999999999999999999' } });
  assert.notEqual((await connection.state()).records.suppression?.status, 'Verified');
  const contact = (await connection.state()).records.contact;
  await settleMonitor(connection, 'contact_search', { contacts: [{ ...contact, contact_campaign_statuses: [membership('finished')] }] });
  await settleMonitor(connection, 'sequence_search', { emailer_campaigns: [{ id: sequenceId, ...sequence }] });
  assert.equal((await connection.monitorNext()).status, 'Complete');
  const state = await connection.state();
  assert.equal(state.records.suppression.status, 'Verified');
  assert.equal(state.flow.actual_outreach_count, 0);
});

test('native already-finished membership is verified without another stop mutation', async () => {
  const { connection } = await monitorFixture(); const sequence = await queuePausedSequence(connection);
  await monitoredReply(connection); await stopPreflight(connection, sequence, 'finished');
  assert.equal((await connection.monitorNext()).status, 'Complete');
  const state = await connection.state();
  assert.equal(state.records.suppression.status, 'Verified');
  assert.equal(Object.values(state.actions).filter(a => a.operation === 'sequence_stop').length, 0);
});

test('lost stop response is reconciled by readback after restart without replaying the mutation', async () => {
  const { directory, connection } = await monitorFixture(); const sequence = await queuePausedSequence(connection);
  await monitoredReply(connection); await stopPreflight(connection, sequence);
  const stop = await connection.monitorNext();
  const resumed = await ApolloTestConnection.open({ directory, config: connection.config, now });
  const reconcile = await resumed.monitorNext();
  assert.equal(reconcile.operation, 'contact_search');
  const contact = (await resumed.state()).records.contact;
  await resumed.settle(reconcile.key, { contacts: [{ ...contact, contact_campaign_statuses: [membership('finished')] }] });
  await settleMonitor(resumed, 'sequence_search', { emailer_campaigns: [{ id: sequenceId, ...sequence }] });
  assert.equal((await resumed.monitorNext()).status, 'Complete');
  const state = await resumed.state();
  assert.equal(state.actions[stop.key].status, 'Done');
  assert.equal(state.actions[stop.key].reconciled_by, reconcile.key);
  assert.equal(Object.values(state.actions).filter(a => a.operation === 'sequence_stop').length, 1);
});

test('foreign thread and unsuccessful stop never become a verified cancellation', async () => {
  let instant = now();
  const { connection } = await monitorFixture(); const sequence = await queuePausedSequence(connection);
  connection.now = () => instant;
  const owner = await connection.monitorNext();
  await assert.rejects(connection.settle(owner.key, { structuredContent: { email: 'foreign@example.com' } }), /Gmail owner/i);
  await connection.settle(owner.key, gmailReplyReceipt().gmail_profile);
  const thread = await connection.monitorNext(), wrong = gmailReplyReceipt().gmail_thread;
  wrong.structuredContent.id = 'cccccccccccccccc';
  await assert.rejects(connection.settle(thread.key, wrong), /thread/i);
  await connection.settle(thread.key, gmailReplyReceipt().gmail_thread);
  await stopPreflight(connection, sequence);
  const stop = await connection.monitorNext();
  await assert.rejects(connection.settle(stop.key, { isError: true }), /failed/i);
  for (let n = 0; n < 4; n++) {
    const read = await connection.monitorNext(); assert.equal(read.operation, 'contact_search');
    const contact = (await connection.state()).records.contact;
    await connection.settle(read.key, { contacts: [{ ...contact, contact_campaign_statuses: [membership('paused')] }] });
    if (n < 3) assert.equal((await connection.monitorNext()).status, 'Deferred');
    instant = new Date(+instant + 20000);
  }
  assert.equal((await connection.monitorNext()).status, 'Held');
  assert.notEqual((await connection.state()).records.suppression?.status, 'Verified');
  await assert.rejects(connection.prepare('stop-again', 'sequence_stop'), /pending|uncertain/i);
});

test('foreign Apollo owner/contact/sequence and empty readbacks block a native stop', async () => {
  const { connection } = await monitorFixture(); const sequence = await queuePausedSequence(connection);
  await monitoredReply(connection);
  const owner = await connection.monitorNext();
  await assert.rejects(connection.settle(owner.key, { id: 'ffffffffffffffffffffffff' }), /owner changed/i);
  await connection.settle(owner.key, { id: config.user_id });
  const contactRead = await connection.monitorNext(), contact = (await connection.state()).records.contact;
  await assert.rejects(connection.settle(contactRead.key, { contacts: [] }), /contact missing/i);
  await assert.rejects(connection.settle(contactRead.key, { contacts: [{ ...contact, id: 'ffffffffffffffffffffffff' }] }), /mapping changed/i);
  await connection.settle(contactRead.key, { contacts: [{ ...contact, contact_campaign_statuses: [membership('paused')] }] });
  const sequenceRead = await connection.monitorNext();
  for (const invalid of [[], [{ ...sequence, id: 'ffffffffffffffffffffffff' }], [{ ...sequence, id: sequenceId, active: true }]]) {
    await assert.rejects(connection.settle(sequenceRead.key, { emailer_campaigns: invalid }), /missing|owned inactive/i);
  }
  assert.equal(Object.values((await connection.state()).actions).filter(a => a.operation === 'sequence_stop').length, 0);
});

test('completed cancellation remains idempotent across later poll cycles and old read receipts are pruned', async () => {
  let instant = now();
  const { connection } = await monitorFixture(); connection.now = () => instant;
  const sequence = await queuePausedSequence(connection);
  await monitoredReply(connection); await stopPreflight(connection, sequence);
  const stop = await connection.monitorNext(); await connection.settle(stop.key, { entity_progress_job: { id: '999999999999999999999999' } });
  const contact = (await connection.state()).records.contact;
  await settleMonitor(connection, 'contact_search', { contacts: [{ ...contact, contact_campaign_statuses: [membership('finished')] }] });
  await settleMonitor(connection, 'sequence_search', { emailer_campaigns: [{ ...sequence, id: sequenceId }] });
  assert.equal((await connection.monitorNext()).status, 'Complete');
  instant = new Date(+instant + 300000);
  await monitoredReply(connection);
  assert.equal((await connection.monitorNext()).status, 'Complete');
  const state = await connection.state();
  assert.equal(state.flow.events.filter(e => e.source === 'gmail_readback').length, 1);
  assert.equal(Object.values(state.actions).filter(a => a.operation === 'sequence_stop').length, 1);
  assert.equal(Object.values(state.actions).filter(a => a.monitor_read).length, 2);
});
