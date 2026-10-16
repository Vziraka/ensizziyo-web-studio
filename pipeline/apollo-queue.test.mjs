import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { callOutcomeRoute, dailyCallQueue, ApolloCallQueue } from './apollo-queue.mjs';

test('verified no-answer releases only an unsent email handoff; skipped or missing evidence holds', () => {
  assert.equal(callOutcomeRoute({ outcome: 'no_answer', verified: true }).action, 'email');
  assert.equal(callOutcomeRoute({ outcome: 'no_answer', verified: false }).action, 'hold');
  assert.equal(callOutcomeRoute({ outcome: 'skipped', verified: true }).action, 'hold');
  assert.equal(callOutcomeRoute(null).action, 'hold');
  assert.equal(callOutcomeRoute({ outcome: 'decline', verified: true }).action, 'stop');
});

const config = { schema_version: 1, mode: 'controlled-test', enabled: false,
  run_id: 'studio-outreach-test-20261016-aabbccdd', user_id: '111111111111111111111111', recipients: [], time_zone: 'America/New_York',
  daily_queue: { enabled: true, cases: [{ id: 'no-answer', outcome: 'no_answer' }, { id: 'callback', outcome: 'callback', callback_at: '2026-10-19T15:00:00Z' }, { id: 'decline', outcome: 'decline' }] } };
const now = () => new Date('2026-10-16T15:00:00Z');
let ids = 200000000;
const nextId = () => String(++ids).padStart(24, '0');
async function fixture(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'apollo-queue-'));
  const connection = await ApolloCallQueue.open({ directory, config: { ...config, ...overrides }, now, session: 'queue-session-123' });
  await connection.prepare('owner', 'profile');
  await connection.settle('owner', { id: config.user_id });
  return { directory, connection };
}
async function contact(connection, caseId = 'no-answer') {
  await connection.prepare('lookup-' + caseId, 'contact_search', caseId);
  await connection.settle('lookup-' + caseId, { contacts: [] });
  const company = await connection.prepare('company-' + caseId, 'account_create', caseId);
  await connection.settle(company.key, { account: { ...company.input, id: nextId() } });
  const person = await connection.prepare('contact-' + caseId, 'contact_create', caseId);
  await connection.settle(person.key, { contact: { ...person.input, first_name: 'Studio Test', id: nextId() } });
}

test('daily tasks stay fictional and cannot create email messages, dial calls or activate sequences', async () => {
  const { connection } = await fixture();
  await contact(connection);
  await connection.prepare('empty-call', 'task_search', 'no-answer', 'call');
  await connection.settle('empty-call', { tasks: [] });
  const request = await connection.prepare('call', 'task_create', 'no-answer', 'call');
  assert.equal(request.input.type, 'call');
  assert.match(request.input.note, /DO NOT DIAL/);
  assert.equal(request.input.status, 'scheduled');
  await connection.settle(request.key, { task: { ...request.input, id: nextId() } });
  await assert.rejects(connection.prepare('email', 'send', 'no-answer'), /Unsupported/);
  await assert.rejects(connection.prepare('enroll', 'sequence_enroll', 'no-answer'), /Unsupported/);
  await assert.rejects(connection.prepare('handoff', 'task_create', 'no-answer', 'handoff'), /verified|outcome/i);
});

async function task(connection, caseId, kind, key = `${caseId}-${kind}`) {
  await connection.prepare(key + '-empty', 'task_search', caseId, kind);
  await connection.settle(key + '-empty', { tasks: [] });
  const request = await connection.prepare(key, 'task_create', caseId, kind);
  const saved = { ...request.input, id: nextId(), ...(request.input.type === 'outreach_manual_email' ? { emailer_message: { status: 'drafted' }, pending_send: false } : {}) };
  await connection.settle(key, { task: saved });
  await connection.prepare(key + '-read', 'task_show', caseId, kind);
  await connection.settle(key + '-read', { task: saved });
  return saved;
}
async function outcome(connection, caseId) {
  await contact(connection, caseId);
  const original = await task(connection, caseId, 'fixture');
  await connection.performFixture(caseId);
  const complete = await connection.prepare(caseId + '-complete', 'fixture_complete', caseId, 'fixture');
  const completed = { ...original, note: complete.input.note, status: 'completed', completed_at: now().toISOString() };
  await connection.settle(complete.key, { task: completed });
  // Completion submission alone must not release an email.
  assert.equal((await connection.queueStatus()).records.find(r => r.case_id === caseId).verified_outcomes, 0);
  await connection.prepare(caseId + '-verified', 'task_show', caseId, 'fixture');
  await connection.settle(caseId + '-verified', { task: completed });
  return completed;
}

test('Apollo readback releases exactly one unsent no-answer email task and remains idempotent after restart', async () => {
  const { connection, directory } = await fixture();
  await outcome(connection, 'no-answer');
  const handoff = await task(connection, 'no-answer', 'handoff');
  assert.equal(handoff.type, 'outreach_manual_email');
  assert.match(handoff.standalone_outreach_task_message.body_text, /No actual call was placed/);
  const reopened = await ApolloCallQueue.open({ directory, config, now, session: 'queue-session-next' });
  await reopened.prepare('new-owner', 'profile');
  await reopened.settle('new-owner', { id: config.user_id });
  const status = await reopened.queueStatus();
  assert.equal(status.records[0].verified_outcomes, 1);
  assert.equal(status.emails_sent, 0);
  assert.equal(status.actual_calls, 0);
  assert.equal(status.real_businesses_contacted, 0);
  await assert.rejects(reopened.prepare('duplicate-handoff', 'task_create', 'no-answer', 'handoff'), /Refresh/);
});

test('verified callback uses the requested time; decline creates no email or callback', async () => {
  const { connection } = await fixture();
  await outcome(connection, 'callback');
  const callback = await task(connection, 'callback', 'handoff');
  assert.equal(callback.type, 'call');
  assert.equal(callback.priority, 'high');
  assert.equal(callback.due_at, '2026-10-19T15:00:00Z');
  await outcome(connection, 'decline');
  await assert.rejects(connection.prepare('decline-email', 'task_create', 'decline', 'handoff'), /verified|outcome/);
  assert.equal((await connection.queueStatus()).records.find(r => r.case_id === 'decline').action, 'stop');
});

test('daily queue prioritizes callbacks then follow-ups and counts one slot per company without a 50 cap', () => {
  const record = (company_id, kind, due_at = '2026-10-16T14:00:00Z') => ({ company_id, kind, due_at, status: 'scheduled' });
  const inputs = [record('a', 'new'), record('b', 'follow_up'), record('c', 'callback'), record('a', 'callback'),
    { ...record('stopped', 'callback'), stopped: true }, record('future', 'callback', '2026-10-19T15:00:00Z'),
    ...Array.from({ length: 51 }, (_, n) => record('new-' + n, 'new'))];
  const queue = dailyCallQueue(inputs, now());
  assert.deepEqual(queue.slice(0, 3).map(r => r.company_id), ['c', 'a', 'b']);
  assert.equal(queue.length, 54);
  assert.equal(new Set(queue.map(r => r.company_id)).size, queue.length);
});

test('foreign, skipped, incomplete or altered fixture readbacks cannot release email', async () => {
  const { connection } = await fixture();
  await contact(connection);
  const saved = await task(connection, 'no-answer', 'fixture');
  await connection.prepare('foreign-read', 'task_show', 'no-answer', 'fixture');
  await assert.rejects(connection.settle('foreign-read', { task: { ...saved, contact_id: nextId() } }), /Foreign/);
  await connection.prepare('valid-read', 'task_show', 'no-answer', 'fixture');
  await connection.settle('valid-read', { task: saved });
  await connection.performFixture('no-answer');
  const complete = await connection.prepare('complete', 'fixture_complete', 'no-answer', 'fixture');
  await connection.settle(complete.key, { task: { ...saved, status: 'completed', note: complete.input.note } });
  await connection.prepare('bad-note', 'task_show', 'no-answer', 'fixture');
  await assert.rejects(connection.settle('bad-note', { task: { ...saved, status: 'completed', completed_at: now().toISOString(), note: 'owner says no answer' } }), /saved simulation/);
  await assert.rejects(connection.prepare('email-bypass', 'task_create', 'no-answer', 'handoff'), /verified|outcome/);
});

test('pending task create reconciles by owned search and cannot replay under a new key', async () => {
  const { connection } = await fixture();
  await contact(connection);
  await connection.prepare('empty', 'task_search', 'no-answer', 'call');
  await connection.settle('empty', { tasks: [] });
  const lost = await connection.prepare('lost', 'task_create', 'no-answer', 'call');
  await assert.rejects(connection.prepare('retry', 'task_create', 'no-answer', 'call'), /Pending|uncertain/);
  await connection.prepare('reconcile', 'task_search', 'no-answer', 'call');
  await connection.settle('reconcile', { tasks: [{ ...lost.input, id: nextId() }] });
  assert.equal((await connection.prepare('retry-after-read', 'task_create', 'no-answer', 'call')).already_done, true);
  assert.equal((await connection.prepare('lost', 'task_create', 'no-answer', 'call')).already_done, true);
});

test('production, enabled outbound, changed scope and wrong owner stay blocked', async () => {
  await assert.rejects(fixture({ enabled: true }), /disabled/);
  await assert.rejects(fixture({ mode: 'production' }), /controlled/);
  const { connection, directory } = await fixture();
  await assert.rejects(ApolloCallQueue.open({ directory, config: { ...config, daily_queue: { ...config.daily_queue, cases: [{ id: 'other', outcome: 'decline' }] } } }), /scope changed/);
  await connection.prepare('wrong-owner', 'profile');
  await assert.rejects(connection.settle('wrong-owner', { id: nextId() }), /owner changed/);
  await assert.rejects(connection.prepare('company', 'account_create', 'no-answer'), /Verify/);
});

test('Apollo canonicalizes a fictional subdomain without requiring another company create', async () => {
  const { connection } = await fixture();
  await connection.prepare('lookup', 'contact_search', 'no-answer');
  await connection.settle('lookup', { contacts: [] });
  const request = await connection.prepare('canonical-company', 'account_create', 'no-answer');
  await connection.settle(request.key, { account: { id: nextId(), name: request.input.name, domain: config.run_id + '.invalid' } });
  assert.equal((await connection.prepare('no-recreate', 'account_create', 'no-answer')).already_done, true);
});

test('compact Apollo task reads retain the owner binding established by creation', async () => {
  const { connection } = await fixture();
  await contact(connection);
  const saved = await task(connection, 'no-answer', 'call');
  await connection.prepare('compact', 'task_show', 'no-answer', 'call');
  await connection.settle('compact', { task: { id: saved.id, title: saved.title, type: saved.type, status: saved.status,
    due_at: saved.due_at, note: saved.note, contact: { id: saved.contact_id } } });
  const skip = await connection.prepare('skip', 'call_skip', 'no-answer', 'call');
  assert.equal(skip.input.id, saved.id);
  await connection.prepare('null-owner', 'task_show', 'no-answer', 'call');
  await assert.rejects(connection.settle('null-owner', { task: { ...saved, user_id: null } }), /Foreign/);
});

test('changed email content or an externally scheduled send is held', async () => {
  const { connection } = await fixture();
  await outcome(connection, 'no-answer');
  const saved = await task(connection, 'no-answer', 'handoff');
  await connection.prepare('changed-email', 'task_show', 'no-answer', 'handoff');
  await assert.rejects(connection.settle('changed-email', { task: { ...saved, standalone_outreach_task_message: { subject: 'other', body_text: 'other' } } }), /message changed/);
  await connection.prepare('unexpected-send', 'task_show', 'no-answer', 'handoff');
  await assert.rejects(connection.settle('unexpected-send', { task: { ...saved, pending_send: true } }), /unsent draft/);
});

test('lost fixture-completion response reconciles from saved outcome without replaying completion', async () => {
  const { connection } = await fixture();
  await contact(connection);
  const saved = await task(connection, 'no-answer', 'fixture');
  await connection.performFixture('no-answer');
  const lost = await connection.prepare('lost-completion', 'fixture_complete', 'no-answer', 'fixture');
  await assert.rejects(connection.prepare('completion-retry', 'fixture_complete', 'no-answer', 'fixture'), /Pending/);
  await connection.prepare('completion-readback', 'task_show', 'no-answer', 'fixture');
  await connection.settle('completion-readback', { task: { ...saved, note: lost.input.note, status: 'completed' } });
  assert.equal((await connection.prepare('lost-completion', 'fixture_complete', 'no-answer', 'fixture')).already_done, true);
  assert.equal((await connection.queueStatus()).records[0].verified_outcomes, 1);
});
