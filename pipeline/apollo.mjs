import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { privateStateDirectory, readJson, saveJson, acquireLock } from './engine.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const apolloHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
const email = value => typeof value === 'string' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
const check = (condition, message) => { if (!condition) throw Error(message); };

export function unwrapApollo(result) {
  check(!result?.isError, 'Apollo operation failed; inspect the private receipt');
  if (result?.structuredContent) return result.structuredContent;
  if (!result?.content) return result;
  try { return JSON.parse(result.content.filter(c => c.type === 'text').map(c => c.text).join('')); }
  catch { throw Error('Apollo returned no valid JSON; reconcile privately'); }
}

function time(value) {
  const date = new Date(value);
  check(typeof value === 'string' && /Z$|[+-]\d\d:\d\d$/.test(value) && Number.isFinite(+date), 'Event requires a valid dated time');
  return date;
}
function localDate(date, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = key => parts.find(p => p.type === key).value;
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
}
function businessDay(start, now, zone) {
  let date = localDate(time(start), zone), finish = localDate(now, zone), days = 1;
  while (+date < +finish && days <= 10) { date.setUTCDate(date.getUTCDate() + 1); if (![0, 6].includes(date.getUTCDay())) days++; }
  return days;
}

export function emailGate(flow, now = new Date(), zone = 'America/New_York') {
  if (['Stopped', 'Reply review', 'Discovery', 'Callback', 'Route held'].includes(flow.status)) return { allowed: false, reason: flow.status };
  if (!flow.calls.some(c => c.outcome === 'no_answer')) return { allowed: false, reason: 'Missing logged no-answer call' };
  if (flow.status !== 'Email eligible') return { allowed: false, reason: 'Unrecognized or inconsistent email eligibility' };
  if (flow.emails.length >= 2) return { allowed: false, reason: 'Two-email cap' };
  if (flow.emails.length >= flow.calls.filter(c => c.outcome === 'no_answer').length) return { allowed: false, reason: 'A new no-answer attempt is required for another email' };
  const first = flow.calls.reduce((a, b) => +time(a.at) < +time(b.at) ? a : b);
  if (businessDay(first.at, now, zone) > 10) return { allowed: false, reason: 'Ten-business-day expiry' };
  return { allowed: true, reason: 'Controlled no-answer fixture permits owner-only test email' };
}

export function applyTestEvent(flow, event, now = new Date()) {
  check(event && /^[a-zA-Z0-9:_-]{1,120}$/.test(event.id ?? ''), 'Invalid event ID');
  check(['simulated_call', 'skipped_call', 'test_email_sent', 'reply', 'decline', 'bounce', 'email_failure'].includes(event.type), 'Only controlled simulated call/test event types are supported');
  check(+time(event.at) <= +now, 'Event time is in the future');
  const previous = flow.events.find(e => e.id === event.id);
  if (previous) { check(apolloHash(previous) === apolloHash(event), 'Conflicting duplicate event'); return structuredClone(flow); }
  const next = structuredClone(flow);
  if (event.type === 'simulated_call') {
    check(['no_answer', 'interested', 'callback', 'decline', 'bad_number'].includes(event.outcome), 'Unknown call outcome');
    check(next.calls.length < 2, 'Two-call cap reached'); next.calls.push(event);
    if (event.outcome === 'decline') next.status = 'Stopped';
    else if (!['Stopped', 'Reply review', 'Discovery', 'Callback', 'Route held'].includes(next.status)) {
      next.status = ({ no_answer: 'Email eligible', interested: 'Discovery', callback: 'Callback', bad_number: 'Route held' })[event.outcome];
    }
  } else if (event.type === 'test_email_sent') {
    check(next.emails.length < 2, 'Two-email cap reached'); next.emails.push(event);
  } else if (event.type === 'decline') next.status = 'Stopped';
  else if (event.type === 'reply' && next.status !== 'Stopped') next.status = 'Reply review';
  else if (['bounce', 'email_failure'].includes(event.type) && next.status !== 'Stopped') next.status = 'Route held';
  next.events.push(event);
  // Test fixtures never contribute to the real 50-business/day metric.
  next.actual_outreach_count = 0;
  return next;
}

const methods = {
  profile: 'users_api_profile', mailboxes: 'email_accounts_index', contact_search: 'contacts_search',
  account_create: 'accounts_create', contact_create: 'contacts_create', task_create: 'tasks_create',
  task_search: 'tasks_search', task_show: 'tasks_show', fixture_complete: 'tasks_complete', call_task_skip: 'tasks_skip',
  draft_create: 'emailer_messages_create', send: 'emailer_messages_send_now', message_status: 'emailer_messages_email_send_status'
};
const readOnly = new Set(['profile', 'mailboxes', 'contact_search', 'task_search', 'task_show', 'message_status']);

function validateConfig(config) {
  check(config?.schema_version === 1 && config.mode === 'controlled-test', 'Only controlled-test mode is implemented; production is blocked');
  check(typeof config.enabled === 'boolean', 'Explicit enabled control required');
  check(/^studio-outreach-test-\d{8}-[a-f0-9]{8}$/.test(config.run_id ?? ''), 'Invalid controlled run ID');
  check(id(config.user_id), 'An observed Apollo owner user ID is required');
  check(Array.isArray(config.recipients) && config.recipients.length <= 2 && config.recipients.every(email), 'At most two explicitly approved test recipients are permitted');
  check(new Set(config.recipients.map(e => e.toLowerCase())).size === config.recipients.length, 'Duplicate test recipients');
  check(config.time_zone === 'America/New_York', 'Use the confirmed operating timezone');
  if (config.approved_message) {
    const m = config.approved_message;
    check(email(m.to) && config.recipients.includes(m.to) && email(m.from) && id(m.mailbox_id), 'Confirmed owner-only message envelope required');
    check(typeof m.subject === 'string' && m.subject.startsWith('[STUDIO TEST]') && m.subject.length <= 100, 'Clearly marked test subject required');
    check(typeof m.body_html === 'string' && m.body_html.includes('CONTROLLED TEST') && m.body_html.length <= 4000, 'Clearly marked bounded test body required');
    check(!/{{|}}|\[\[|\]\]/.test(m.subject + m.body_html), 'Unresolved message placeholders are blocked');
    check(m.confirmed === true, 'The Apollo connector requires concrete message confirmation');
  }
  return config;
}

export class ApolloTestConnection {
  static async open({ directory, config, now = () => new Date(), session = randomUUID() }) {
    check(id(session), 'Invalid connection session');
    validateConfig(config); directory = await privateStateDirectory(directory); await mkdir(directory, { recursive: true });
    const path = join(directory, 'apollo-test-state.json');
    const identity = apolloHash({ run_id: config.run_id, user_id: config.user_id, mode: config.mode });
    try { await writeFile(path, JSON.stringify({ schema_version: 1, identity, actions: {}, records: { tasks: {} }, flow: { events: [], status: 'Awaiting call', calls: [], emails: [] } }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    check((await readJson(path)).identity === identity, 'Private state belongs to another scope; do not adopt it');
    return new ApolloTestConnection(directory, structuredClone(config), now, session);
  }
  constructor(directory, config, now, session) { this.directory = directory; this.config = config; this.now = now; this.session = session; this.path = join(directory, 'apollo-test-state.json'); }
  async state() { return readJson(this.path); }
  async change(fn) {
    const release = await acquireLock(this.directory);
    try { const state = await this.state(); const result = await fn(state); await saveJson(this.path, state); return result; }
    finally { await release(); }
  }
  async event(event) {
    return this.change(state => { state.flow = applyTestEvent(state.flow, { ...event, source: 'fixture' }, this.now()); return state.flow; });
  }
  async receiveReply(receipt) {
    return this.change(state => {
      const approved = this.config.approved_message, profile = receipt?.gmail_profile?.structuredContent, thread = receipt?.gmail_thread?.structuredContent;
      check(!receipt?.gmail_profile?.isError && !receipt?.gmail_thread?.isError && profile && thread, 'Verified structured Gmail readbacks required');
      check(approved && profile.email === approved.from, 'Gmail owner does not match the approved sender');
      const sent = Object.values(state.actions).find(a => a.operation === 'send' && a.status === 'Done');
      check(sent && state.records.message?.message_hash === apolloHash(approved) && state.flow.emails.some(e => e.id === `sent:${state.records.message.id}`), 'Verified original test send required');
      check(id(thread.id) && Array.isArray(thread.messages) && thread.messages.length <= 20, 'Invalid or oversized Gmail thread');
      const header = (message, name) => {
        const found = (message.payload?.headers ?? []).filter(h => h.name?.toLowerCase() === name.toLowerCase());
        check(found.length <= 1 && found.every(h => typeof h.value === 'string' && !/[\r\n]/.test(h.value)), 'Ambiguous or invalid Gmail header');
        return found[0]?.value ?? '';
      };
      const address = value => {
        const found = value.match(/[^\s<>\",;]+@[^\s<>\",;]+\.[^\s<>\",;]+/g) ?? [];
        return found.length === 1 ? found[0].toLowerCase() : '';
      };
      const original = thread.messages.find(m => m.id === thread.id && m.thread_id === thread.id && m.label_ids?.includes('SENT') &&
        address(header(m, 'From')) === approved.from.toLowerCase() && address(header(m, 'To')) === approved.to.toLowerCase() && header(m, 'Subject') === approved.subject);
      check(original && Number.isFinite(Number(original.internal_date)) && Number(original.internal_date) >= +time(sent.prepared_at) &&
        Number(original.internal_date) <= +time(sent.prepared_at) + 300000, 'Original Gmail message does not match the controlled send window');
      const messageId = header(original, 'Message-ID'); check(messageId, 'Original SMTP message ID is missing');
      const replies = thread.messages.filter(m => m.id !== original.id && m.thread_id === thread.id &&
        address(header(m, 'From')) === approved.to.toLowerCase() && address(header(m, 'To')) === approved.from.toLowerCase() &&
        header(m, 'Subject').replace(/^re:\s*/i, '') === approved.subject && header(m, 'In-Reply-To') === messageId);
      check(replies.length, 'No matching reply to the original controlled message');
      for (const reply of replies) {
        check(id(reply.id) && Number.isFinite(Number(reply.internal_date)) && Number(reply.internal_date) >= Number(original.internal_date), 'Invalid reply identity or chronology');
        state.flow = applyTestEvent(state.flow, { id: `gmail_reply:${reply.id}`, type: 'reply', at: new Date(Number(reply.internal_date)).toISOString(),
          source: 'gmail_readback', gmail_thread_id: thread.id, gmail_message_id: reply.id }, this.now());
      }
      return { status: state.flow.status, verified_replies: replies.length, real_outreach: 0 };
    });
  }
  message(state) {
    const m = this.config.approved_message;
    check(m, 'Confirm the test mailbox, recipient, subject and body before drafting');
    check(state.records.mailboxes?.some(a => a.id === m.mailbox_id && a.email === m.from), 'Confirmed sender mailbox is not in the observed Apollo mailbox list');
    check(state.records.contact, 'Owned test contact required');
    const gate = emailGate(state.flow, this.now(), this.config.time_zone); check(gate.allowed, gate.reason);
    return m;
  }
  verifyDraft(message, state) {
    const approved = this.config.approved_message;
    // Apollo adds this exact empty document wrapper; compare the unchanged inner HTML.
    const body = message.body_html?.replace(/^<html><head><\/head><body>([\s\S]*)<\/body><\/html>$/, '$1');
    check(message.contact_id === state.records.contact.id && message.subject === approved.subject && body === approved.body_html &&
      Array.isArray(message.recipients) && message.recipients.length === 1 && message.recipients[0].email === approved.to &&
      message.recipients[0].recipient_type_cd === 'to' && !message.cc_emails?.length && !message.bcc_emails?.length &&
      (!message.from_email || message.from_email === approved.from) && (!message.send_from?.email || message.send_from.email === approved.from) &&
      (!message.email_account_id || message.email_account_id === approved.mailbox_id), 'Draft readback differs from the confirmed owner-only message; sending is held');
  }
  build(state, operation, options) {
    const c = this.config, marker = `STUDIO TEST ${c.run_id}`, address = `${c.run_id}@example.invalid`;
    check(methods[operation], 'Unsupported Apollo operation');
    check(Object.keys(options).every(k => k === 'kind') && (!options.kind || ['call_gate', 'fixture'].includes(options.kind)), 'Arbitrary operation arguments are blocked');
    const kind = options.kind ?? 'call_gate';
    if (operation === 'profile') return { include_credit_usage: true };
    if (operation === 'mailboxes') return {};
    if (operation === 'contact_search') return { q_keywords: address, page: 1, per_page: 10 };
    if (operation === 'account_create') return { name: marker, domain: `${c.run_id}.invalid` };
    if (operation === 'contact_create') {
      check(state.records.account && state.records.contact_search_empty === true, 'Observed account and exact empty contact search required before creation');
      return { first_name: 'STUDIO TEST', last_name: c.run_id, email: address, organization_name: marker, account_id: state.records.account.id };
    }
    if (operation === 'task_search') { check(state.records.contact, 'Owned contact required'); return { contact_id: state.records.contact.id, q_keywords: marker, page: 1, per_page: 10 }; }
    if (operation === 'task_create') {
      check(state.records.contact, 'Owned test contact required');
      return { contact_id: state.records.contact.id, user_id: c.user_id, type: kind === 'call_gate' ? 'call' : 'action_item',
        title: `${marker} ${kind}`, note: kind === 'call_gate' ? 'CONTROLLED TEST. Do not dial. No phone number supplied. Leave pending to verify the missing-call gate.' : 'CONTROLLED TEST. Execute the local simulated no-answer fixture; no actual phone call. Complete this action item only after the fixture runs.', priority: 'low', due_at: this.now().toISOString() };
    }
    if (operation === 'task_show' || operation === 'call_task_skip' || operation === 'fixture_complete') {
      const selected = operation === 'fixture_complete' ? 'fixture' : kind;
      const task = state.records.tasks[selected]; check(task?.id, 'Observed owned task ID required');
      if (operation !== 'task_show') check(task.readback === true, 'Read back the task before completing or skipping it');
      if (operation === 'fixture_complete') check(state.flow.calls.length, 'Execute the simulated fixture before completing its action item');
      if (operation === 'call_task_skip') check(selected === 'call_gate', 'Only the owned pending test call can be skipped');
      return { id: task.id, ...(operation === 'task_show' ? {} : { note: 'CONTROLLED TEST only. No phone call placed; fixture outcomes are not real outreach.' }) };
    }
    if (operation === 'draft_create') {
      const m = this.message(state);
      return { contact_id: state.records.contact.id, recipients: [{ email: m.to, recipient_type_cd: 'to' }], subject: m.subject, body_html: m.body_html };
    }
    if (operation === 'send') {
      const m = this.message(state); check(state.records.message?.id, 'Observed test draft required');
      check(state.records.message.message_hash === apolloHash(m), 'Message confirmation changed after draft creation');
      this.verifyDraft(state.records.message, state);
      return { id: state.records.message.id, send_from: { email: m.from, email_account_id: m.mailbox_id } };
    }
    check(state.records.message?.id, 'Observed test message required'); return { id: state.records.message.id };
  }
  async prepare(key, operation, options = {}) {
    check(/^[a-zA-Z0-9_-]{1,80}$/.test(key ?? ''), 'Invalid action key');
    check(Object.hasOwn(methods, operation), 'Unsupported Apollo operation');
    return this.change(state => {
      const previous = state.actions[key];
      if (previous) { check(previous.operation === operation && apolloHash(previous.options) === apolloHash(options), 'Action key conflicts with earlier operation'); check(previous.status === 'Done', 'Pending/uncertain action requires readback reconciliation; no blind retry'); return { already_done: true, key }; }
      if (!readOnly.has(operation)) {
        check(this.config.enabled, 'Apollo test mutations are disabled');
        check(state.records.verified_session === this.session, 'Read and verify the Apollo account in this session before mutations');
        check(!Object.values(state.actions).some(a => a.operation === operation && a.status !== 'Done' &&
          (operation !== 'task_create' || (a.options.kind ?? 'call_gate') === (options.kind ?? 'call_gate'))),
        'An action of this kind is pending/uncertain; reconcile rather than using a new key');
      }
      if (operation === 'account_create' && state.records.account) return { already_done: true, key };
      if (operation === 'contact_create' && state.records.contact) return { already_done: true, key };
      if (operation === 'task_create' && state.records.tasks[options.kind ?? 'call_gate']) return { already_done: true, key };
      if (operation === 'draft_create' && state.records.message) return { already_done: true, key };
      if (operation === 'send') check(!Object.values(state.actions).some(a => a.operation === 'send'), 'Send already reserved; reconcile status rather than resending');
      const input = this.build(state, operation, options);
      if (operation === 'profile') state.records.verified_session = null;
      state.actions[key] = { operation, options, input, hash: apolloHash(input), status: 'Pending', prepared_at: this.now().toISOString() };
      return { key, tool: `mcp__codex_apps__apollo_io_apollo_${methods[operation]}`, input };
    });
  }
  owned(operation, data, input) {
    const marker = `STUDIO TEST ${this.config.run_id}`;
    if (operation === 'account_create') { const a = data.account; check(id(a?.id) && a.name === marker && a.domain === input.domain, 'Account readback does not match the owned test scope'); return a; }
    if (operation === 'contact_create' || operation === 'contact_search') {
      const a = operation === 'contact_create' ? data.contact : data;
      check(id(a?.id) && a.email === `${this.config.run_id}@example.invalid` && a.first_name?.toLowerCase() === 'studio test' &&
        a.organization_name === marker && (!input.account_id || a.account_id === input.account_id), 'Contact is not an owned test record'); return a;
    }
    const a = data.task ?? data, contactId = a?.contact_id ?? a?.contact?.id;
    check(id(a?.id) && a.title?.startsWith(marker) && contactId === input.contact_id &&
      (!a.contact_id || !a.contact?.id || a.contact_id === a.contact.id) &&
      (!input.title || a.title === input.title) && (!input.type || a.type === input.type) &&
      !a.emailer_campaign_id && !a.sequence_id, 'Task is not an owned standalone test record'); return a;
  }
  async settle(key, raw) {
    return this.change(state => {
      const action = state.actions[key]; check(action?.status === 'Pending', 'Only an exact pending action can be settled');
      const data = unwrapApollo(raw); action.result = data;
      const op = action.operation, kind = action.options.kind ?? 'call_gate';
      if (op === 'profile') { check(data.id === this.config.user_id, 'Apollo account owner changed'); state.records.verified_session = this.session; }
      else if (op === 'mailboxes') { check(Array.isArray(data.email_accounts), 'Malformed mailbox readback'); state.records.mailboxes = data.email_accounts; }
      else if (op === 'account_create') state.records.account = this.owned(op, data, action.input);
      else if (op === 'contact_create') state.records.contact = this.owned(op, data, action.input);
      else if (op === 'contact_search') {
        check(Array.isArray(data.contacts) && data.contacts.length <= 1, 'Ambiguous test contact search; reconcile');
        state.records.contact_search_empty = data.contacts.length === 0;
        if (data.contacts.length) state.records.contact = this.owned(op, data.contacts[0], action.input);
      } else if (op === 'task_create') state.records.tasks[kind] = this.owned(op, data, action.input);
      else if (op === 'task_show') {
        const existing = state.records.tasks[kind], task = this.owned(op, data, { contact_id: state.records.contact.id,
          title: `STUDIO TEST ${this.config.run_id} ${kind}`, type: kind === 'fixture' ? 'action_item' : 'call' });
        check(task.id === existing.id, 'Task identity changed'); state.records.tasks[kind] = { ...task, readback: true };
      } else if (op === 'task_search') {
        check(Array.isArray(data.tasks), 'Malformed task search');
        check(!data.pagination || data.pagination.total_pages <= 1, 'Incomplete task search; reconcile all pages before adopting tasks');
        for (const task of data.tasks) {
          this.owned(op, task, { contact_id: state.records.contact.id });
          const found = ['call_gate', 'fixture'].find(k => task.title === `STUDIO TEST ${this.config.run_id} ${k}`);
          check(found && (!state.records.tasks[found]?.id || state.records.tasks[found].id === task.id), 'Duplicate or unknown owned test tasks');
          check(task.type === (found === 'fixture' ? 'action_item' : 'call'), 'Test task type changed');
          state.records.tasks[found] = task;
          // An exact provider readback may resolve a lost task-create response; never replay the mutation.
          for (const pending of Object.values(state.actions)) if (pending.operation === 'task_create' && pending.status === 'Pending' && (pending.options.kind ?? 'call_gate') === found) {
            pending.status = 'Done'; pending.reconciled_by = key; pending.finished_at = this.now().toISOString();
          }
        }
      } else if (['fixture_complete', 'call_task_skip'].includes(op)) {
        const selected = op === 'fixture_complete' ? 'fixture' : kind, task = data.task ?? data;
        check(task.id === state.records.tasks[selected].id, 'Task mutation returned another task'); state.records.tasks[selected] = { ...task, readback: false };
      } else if (op === 'draft_create') {
        const m = data.emailer_message ?? data; check(id(m?.id), 'Draft returned no stable message ID');
        this.verifyDraft(m, state); state.records.message = { ...m, message_hash: apolloHash(this.config.approved_message) };
      } else if (op === 'send' || op === 'message_status') {
        const m = data.emailer_message ?? data; check(m.id === state.records.message.id, 'Message identity changed');
        state.records.message = { ...state.records.message, ...m };
        const status = m.status ?? m.email_status;
        const append = (type, prefix) => {
          const eventId = `${prefix}:${m.id}`;
          if (!state.flow.events.some(e => e.id === eventId)) state.flow = applyTestEvent(state.flow, { id: eventId, type, at: action.prepared_at, source: 'apollo_status' }, this.now());
        };
        if (op === 'message_status' && ['sent', 'delivered', 'active', 'completed', 'replied'].includes(status)) append('test_email_sent', 'sent');
        if (op === 'message_status' && status === 'replied') append('reply', 'reply');
        if (op === 'message_status' && status === 'bounced') append('bounce', 'bounce');
        if (op === 'message_status' && status === 'failed') append('email_failure', 'failure');
      }
      action.status = 'Done'; action.finished_at = this.now().toISOString(); return { key, operation: op, status: action.status };
    });
  }
  async projection() {
    const state = await this.state(); return [this.config.run_id, `STUDIO TEST ${this.config.run_id}`, state.records.contact?.id ?? '', state.records.tasks.call_gate?.id ?? '', state.flow.calls.length ? `Simulated: ${state.flow.calls.at(-1).outcome}` : 'No actual call', state.flow.status, String(state.flow.emails.length), state.records.message?.status ?? 'No verified send', '0 real outreach', 'Controlled test only; no real business contact'];
  }
}
