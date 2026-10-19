import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { check, hash, businessDaysBetween } from './lifecycle.mjs';
import { unwrapApollo } from './apollo.mjs';
import { readJson } from './engine.mjs';
import { validateBookingSlot } from './lifecycle-documents.mjs';
import { controlledTaskIdentity } from './lifecycle-bridge.mjs';

export const operationNames = {
  apollo_profile: 'apollo_io_apollo_users_api_profile', mailboxes: 'apollo_io_apollo_email_accounts_index', contact: 'apollo_io_apollo_contacts_search',
  draft: 'apollo_io_apollo_emailer_messages_create', send: 'apollo_io_apollo_emailer_messages_send_now', delivery: 'apollo_io_apollo_emailer_messages_email_send_status',
  sequence: 'apollo_io_apollo_emailer_campaigns_search', stop: 'apollo_io_apollo_emailer_campaigns_remove_or_stop_contact_ids',
  task_create: 'apollo_io_apollo_tasks_create', task_search: 'apollo_io_apollo_tasks_search', task_read: 'apollo_io_apollo_tasks_show', task_skip: 'apollo_io_apollo_tasks_skip',
  gmail_profile: 'gmail_get_profile', gmail_search: 'gmail_search_email_ids', thread: 'gmail_read_email_thread',
  calendar_profile: 'google_calendar_get_profile', busy: 'google_calendar_get_availability', booking_create: 'google_calendar_create_event',
  booking_search: 'google_calendar_search_events', booking_read: 'google_calendar_read_event',
  contact_create: 'apollo_io_apollo_contacts_create', personalize: 'apollo_io_apollo_contacts_update',
  fields: 'apollo_io_apollo_fields_index', lists: 'apollo_io_apollo_labels_index', intent: 'apollo_io_apollo_labels_add_entity_ids_to_label_names'
};
export const mutations = new Set(['draft', 'send', 'stop', 'booking_create', 'task_create', 'task_skip', 'contact_create', 'personalize', 'intent']);
const names = operationNames;
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const explicitDate = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const header = (message, name) => {
  const values = (message.payload?.headers ?? []).filter(h => h.name?.toLowerCase() === name.toLowerCase());
  check(values.length <= 1 && values.every(h => typeof h.value === 'string' && !/[\r\n]/.test(h.value)), 'Ambiguous message headers');
  return values[0]?.value ?? '';
};
const address = value => { const values = value.match(/[^\s<>\",;]+@[^\s<>\",;]+\.[^\s<>\",;]+/g) ?? []; return values.length === 1 ? values[0].toLowerCase() : ''; };
const message = data => data.emailer_message ?? data;
const eventData = data => data.event ?? data;
function notification(o, now, actions) {
  const stable = { replies: [...new Set(o.replies)].sort(), holds: o.holds,
    bookings: Object.fromEntries(Object.entries(o.bookings).map(([id, b]) => [id, { id: b.id, start: b.start, end: b.end, verified: b.verified }])), suppression: o.suppression ?? {},
    task_cancellations: Object.fromEntries(Object.values(actions).filter(a => a.provider_task && ['call_task', 'callback_task'].includes(a.type) && (a.cancel_requested || a.cancellation))
      .map(a => [a.id, { task_id: a.provider_task.id, requested: a.cancel_requested === true, verified: a.cancellation === 'Verified skipped at Apollo' }])),
    deliveries: Object.fromEntries(Object.entries(o.email).map(([id, e]) => [id, e.status])) };
  const fingerprint = hash(stable), changed = fingerprint !== o.notification?.last_notified;
  o.notification = { ...o.notification, fingerprint, changed, checked_at: now.toISOString() };
  return { changed, fingerprint, holds: o.holds };
}

export function controlledThread(thread, expected, now) {
  check(thread?.id === expected.thread_id && Array.isArray(thread.messages) && thread.messages.length < 20, 'Missing, changed or truncated controlled thread');
  const original = thread.messages.find(m => m.id === expected.original_id && m.thread_id === thread.id && m.label_ids?.includes('SENT') &&
    address(header(m, 'From')) === expected.from.toLowerCase() && address(header(m, 'To')) === expected.to.toLowerCase() && header(m, 'Subject') === expected.subject);
  check(original && header(original, 'Message-ID') && Number(original.internal_date) >= Date.parse(expected.sent_after) &&
    Number(original.internal_date) <= Date.parse(expected.sent_before), 'Original email differs from the bound owner-only test');
  const sentIds = thread.messages.filter(m => m.label_ids?.includes('SENT') && address(header(m, 'From')) === expected.from.toLowerCase() && address(header(m, 'To')) === expected.to.toLowerCase()).map(m => header(m, 'Message-ID')).filter(Boolean);
  const replies = thread.messages.filter(m => m.id !== original.id && m.thread_id === thread.id &&
    address(header(m, 'From')) === expected.to.toLowerCase() && address(header(m, 'To')) === expected.from.toLowerCase() &&
    (sentIds.includes(header(m, 'In-Reply-To')) || header(m, 'References').includes(header(original, 'Message-ID'))));
  const uncertainIncoming = thread.messages.filter(m => m.id !== original.id && m.thread_id === thread.id && !m.label_ids?.includes('SENT') &&
    Number(m.internal_date) >= Number(original.internal_date) && address(header(m, 'From')) !== expected.from.toLowerCase() && !replies.includes(m));
  check(!uncertainIncoming.length, 'Unverified incoming message in the bound thread; hold this route for review');
  for (const reply of replies) check(identifier(reply.id) && Number(reply.internal_date) >= Number(original.internal_date) && Number(reply.internal_date) <= +now, 'Invalid reply chronology');
  // Bodies and quoted instructions never select tools or authorize actions. Every matching reply pauses cold contact.
  return replies.map(m => ({ id: m.id, kind: header(m, 'Auto-Submitted') && header(m, 'Auto-Submitted').toLowerCase() !== 'no' ? 'out_of_office' : 'reply', at: new Date(Number(m.internal_date)).toISOString() }));
}

export function verifiedContact(data, binding, owner, real = false) {
  check(data.contacts?.length === 1 && !data.pagination?.next_page && (!data.pagination || data.pagination.total_pages <= 1), 'Controlled contact search is missing or ambiguous');
  const c = data.contacts[0];
  const scoped = real ? binding.verification === true ? c.organization_name === binding.business_name : typeof c.email === 'string' && !c.email.endsWith('.invalid') : c.email?.endsWith('@example.invalid') && Array.isArray(c.phone_numbers) && c.phone_numbers.length === 0;
  check(c.id === binding.contact_id && (c.account_id ?? null) === (binding.account_id ?? null) && c.owner_id === owner && (c.email ?? null) === (binding.email ?? null) &&
    scoped, 'Contact ownership or scope changed');
  if (real && binding.phone) {
    const digits = value => String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    check([c.corporate_phone, c.direct_phone, ...(c.phone_numbers ?? []).map(p => p.raw_number ?? p.sanitized_number ?? p.number)].some(p => digits(p) === digits(binding.phone)), 'Apollo phone differs from the verified public business phone');
  }
  if (binding.require_no_phone) check(Array.isArray(c.phone_numbers) && c.phone_numbers.length === 0 && (c.name ?? [c.first_name, c.last_name].filter(Boolean).join(' ')) === binding.controlled_name, 'Native proof must remain an exact named no-phone fictional contact');
  return c;
}
const contact = verifiedContact;
export function bookingIdentity(data, expected, owner) {
  const e = eventData(data), start = typeof e.start === 'string' ? e.start : e.start?.dateTime ?? e.start_time, end = typeof e.end === 'string' ? e.end : e.end?.dateTime ?? e.end_time;
  const normalized = text => typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  check(identifier(e.id) && (e.summary ?? e.title) === expected.title && normalized(e.description) === normalized(expected.description) &&
    Date.parse(start) === Date.parse(expected.start) && Date.parse(end) === Date.parse(expected.end) && e.status === 'confirmed' &&
    e.visibility === 'private' && e.transparency === 'opaque' && e.reminders?.use_default === false && !e.reminders.overrides?.length &&
    (expected.attendee_email ? e.attendees?.filter(a => a.email !== owner).length === 1 && e.attendees.some(a => a.email === expected.attendee_email) : !e.attendees || e.attendees.length <= 1 && e.attendees.every(a => a.email === owner && a.is_self === true)) && e.organizer?.email === owner && e.organizer.is_self !== false && !e.recurrence?.length,
  'Calendar event differs from the exact private, owner-only booking');
  const meetingLink=e.hangoutLink??e.hangout_link??e.conference_data?.entry_points?.find(p=>p.entry_point_type==='video')?.uri??e.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri;
  check(expected.mode!=='video'||typeof meetingLink==='string'&&/^https:\/\/meet\.google\.com\//.test(meetingLink),'Video meeting link is missing; review the existing event, never create a duplicate');
  return { id: e.id, start: expected.start, end: expected.end, timezone: 'America/New_York', reference: e.htmlLink ?? e.url ?? `calendar:${e.id}`, status: e.status };
}

export class ControlledOperations {
  constructor(app, session) { check(identifier(session), 'Fresh operations session required'); this.app = app; this.session = session; }
  validateScope(state, c) { check(c.operations.allowlist.every(id => state.prospects[id]?.controlled === true), 'Allowlist contains a missing or real business'); }
  async settings() {
    const c = await readJson(join(this.app.directory, 'lifecycle-config.json')), o = c.operations;
    check(!o?.native_proof, 'Use the explicitly scoped native proof controller');
    check(c.mode === 'controlled' && c.research_enabled === false && c.outreach_enabled === false, 'Only controlled operations are allowed; research and real outreach stay paused');
    check(c.readiness.owner_design_approved === true, 'Owner design approval is required');
    check(o && typeof o.enabled === 'boolean' && o.interval_minutes === 5 && Array.isArray(o.allowlist) && o.allowlist.length <= 12 && new Set(o.allowlist).size === o.allowlist.length, 'Explicit bounded controlled scope required');
    check(c.calendar.owner_email && c.calendar.calendar_id === 'primary' && c.apollo.user_id, 'Existing owned connections must be explicitly bound');
    check(Array.isArray(o.recipients) && o.recipients.length <= 2 && o.recipients.includes(c.calendar.owner_email) && o.recipients.every(e => /^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/.test(e)), 'Owner-only recipient allowlist required');
    for (const m of Object.values(o.emails ?? {})) {
      check(m.from === c.calendar.owner_email && o.recipients.includes(m.to) && identifier(m.mailbox_id) && typeof m.approved === 'boolean', 'Message envelope is outside the controlled scope');
      check(m.subject?.startsWith('[STUDIO TEST]') && m.subject.length < 120 && !/["\r\n]/.test(m.subject) && m.body_html?.includes('CONTROLLED TEST') && m.body_html.length < 4000 && !/{{|}}|\[\[|\]\]/.test(m.subject + m.body_html), 'Exact bounded test content required');
      check(!m.approved || typeof m.approval_ref === 'string' && m.approval_ref.length > 5, 'Concrete message approval reference required');
    }
    for (const b of Object.values(o.bookings ?? {})) check(o.allowlist.includes(b.prospect_id) && b.title?.startsWith('STUDIO TEST ') &&
      b.description?.startsWith('CONTROLLED TEST ') && b.description.length < 1000 && explicitDate(b.start) && explicitDate(b.end), 'Bounded fictional booking required');
    for (const b of Object.values(o.bookings ?? {})) if (b.attendee_email) check(o.recipients.includes(b.attendee_email) && b.guest_invitation_approved === true && b.approval_ref?.length > 5, 'A controlled guest invitation needs exact owner-inbox approval');
    return c;
  }
  async next() {
    const c = await this.settings(); if (!c.operations.enabled) return { status: 'Disabled' };
    await this.effects();
    return this.app.change(state => {
      const now = this.app.now(), o = state.operations ??= { requests: {}, effects: {}, bookings: {}, email: {}, holds: {}, replies: [] };
      this.validateScope(state, c);
      if (o.lease && o.lease.session !== this.session && Date.parse(o.lease.until) > +now) return { status: 'Busy', next_at: o.lease.until };
      o.lease = { session: this.session, until: new Date(+now + 90_000).toISOString() };
      if (o.cycle?.completed_at && +now < Date.parse(o.cycle.started_at) + 300_000) { delete o.lease; return { status: 'Waiting', next_at: new Date(Date.parse(o.cycle.started_at) + 300_000).toISOString() }; }
      if (!o.cycle || o.cycle.completed_at) {
        o.cycle = { id: randomUUID(), started_at: now.toISOString(), completed_cycles: o.cycle?.completed_cycles ?? 0, completed_records: [], completed_bookings: [] };
      }
      o.cycle.completed_records ??= []; o.cycle.completed_bookings ??= [];
      if (!o.cycle.read_epoch || +now - Date.parse(o.cycle.read_started_at) > 120_000) {
        o.cycle.read_epoch = randomUUID(); o.cycle.read_started_at = now.toISOString();
        // Retain mutations and durable effects; successful old polls have raw private receipts and need no operating copy.
        for (const [key, r] of Object.entries(o.requests)) if (!mutations.has(r.operation) && ['Done', 'Failed'].includes(r.status) && !r.retain) {
          (o.prune_receipts ??= []).push(r.key); delete o.requests[key];
        }
      }
      const planner = this.plan(state, c), cycle = o.cycle; let value;
      for (let n = 0; n < 150; n++) {
        let step;
        try { step = planner.next(value); } catch (error) { o.holds.connection = error.message; delete o.lease; return { status: 'Held', reason: error.message }; }
        delete o.holds.connection; value = undefined;
        if (step.done) {
          cycle.completed_at = now.toISOString(); cycle.completed_cycles++; delete o.lease;
          return { status: 'Complete', completed_cycles: cycle.completed_cycles, ...notification(o, now, state.actions), research: 'paused', real_outreach: Object.values(state.prospects).filter(r => !r.controlled).reduce((n, r) => n + r.attempts.length, 0) };
        }
        const request = step.value, logical = mutations.has(request.operation) ? request.logical : `${cycle.read_epoch}-${this.session}-${request.logical}`;
        const saved = o.requests[logical];
        if (saved) {
          check(saved.operation === request.operation && saved.input_sha256 === hash(request.input), 'Saved operation scope changed; reconcile before continuing');
          if (saved.status === 'Done') { value = saved.result; continue; }
          if (saved.status === 'Failed') { value = { failed: saved.error }; continue; }
          check(!mutations.has(request.operation), 'Uncertain mutation cannot be replayed');
          saved.read_reissues = (saved.read_reissues ?? 0) + 1;
          if (saved.read_reissues > 2) { saved.status = 'Failed'; saved.error = 'Read receipt missing after bounded retries'; value = { failed: saved.error }; continue; }
          saved.session = this.session; return this.output(saved);
        }
        const key = `ops-${randomUUID()}`;
        if (request.operation === 'send') { const a = state.actions[request.logical.slice(0, -'-send'.length)]; a.status = 'Pending'; }
        if (request.operation === 'task_create') { const a = state.actions[request.logical.slice(0, -'-task-create'.length)]; a.status = 'Pending'; }
        o.requests[logical] = { ...request, key, status: 'Pending', session: this.session, input_sha256: hash(request.input), prepared_at: now.toISOString() };
        return this.output(o.requests[logical]);
      }
      throw Error('Controlled plan exceeded bounded internal work');
    });
  }
  output(r) { return { key: r.key, operation: r.operation, tool: `mcp__codex_apps__${names[r.operation]}`, input: r.input }; }
  *plan(state, c) {
    const o = state.operations, now = this.app.now(), request = (logical, operation, input) => ({ logical, operation, input });
    const retain = logical => { const r = o.requests[`${o.cycle.read_epoch}-${this.session}-${logical}`]; if (r) r.retain = true; };
    const verified = (data, expected, name) => check(!data.failed && data.email === expected, `${name} account unavailable or changed`);
    const ap = yield request('apollo-owner', 'apollo_profile', { include_credit_usage: false });
    check(!ap.failed && ap.id === c.apollo.user_id, 'Apollo account unavailable or changed');
    verified(yield request('gmail-owner', 'gmail_profile', {}), c.calendar.owner_email, 'Gmail');
    verified(yield request('calendar-owner', 'calendar_profile', {}), c.calendar.owner_email, 'Calendar');
    for (const id of c.operations.allowlist.filter(id => !o.cycle.completed_records.includes(id))) {
      try {
        const record = state.prospects[id], binding = c.apollo.bindings[id];
        const bounds = [c.operations.threads?.[id], ...Object.entries(o.email).filter(([a]) => state.actions[a]?.prospect_id === id).map(([, e]) => e.thread)].filter(Boolean);
        for (const bound of bounds.filter((b, i) => bounds.findIndex(x => x.thread_id === b.thread_id) === i)) {
          check(bound.from === c.calendar.owner_email && c.operations.recipients.includes(bound.to), 'Monitored thread is outside the owner-only scope');
          const raw = yield request(`${id}-${bound.thread_id}-thread`, 'thread', { thread_id: bound.thread_id, max_messages: 20 }); check(!raw.failed, 'Controlled thread read failed');
          for (const reply of controlledThread(raw, bound, now)) {
            const effectId = `reply-${hash(`${id}:${reply.id}`).slice(0, 32)}`;
            if (!o.effects[effectId]) retain(`${id}-${bound.thread_id}-thread`);
            o.effects[effectId] ??= { event: { id: effectId, prospect_id: id, type: 'reply_received', at: reply.at, data: { source_id: reply.id, kind: reply.kind, thread_id: bound.thread_id } } };
            if (!o.replies.includes(reply.id)) o.replies.push(reply.id);
          }
          if (Object.values(o.effects).some(e => e.event.prospect_id === id && e.event.type === 'reply_received')) {
            for (const a of Object.values(state.actions)) if (a.prospect_id === id && a.status === 'Queued' && ['email', 'call_task', 'callback_task'].includes(a.type)) a.status = 'Cancelled';
            record.cold_paused = true;
          }
        }
        if ((record.cold_paused || record.restriction) && binding?.sequence_id) {
          const found = yield request(`${id}-contact-stop`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
          const person = contact(found, binding, c.apollo.user_id);
          const seq = yield request(`${id}-sequence`, 'sequence', { q_name: binding.sequence_name, per_page: '10', page: '1' });
          check(!seq.failed && seq.emailer_campaigns?.length === 1 && (!seq.pagination || seq.pagination.total_pages <= 1) && seq.emailer_campaigns[0].id === binding.sequence_id && seq.emailer_campaigns[0].name === binding.sequence_name && seq.emailer_campaigns[0].active === false, 'Only the owned inactive fictional sequence may be stopped');
          const status = person.contact_campaign_statuses?.find(s => s.emailer_campaign_id === binding.sequence_id);
          if (status?.status === 'finished') {
            if (o.suppression?.[id] !== 'Verified') { retain(`${id}-contact-stop`); retain(`${id}-sequence`); }
            record.suppression = 'Verified';
            (o.suppression ??= {})[id] = 'Verified';
            for (const a of Object.values(state.actions)) if (a.prospect_id === id && a.type === 'sequence_stop') a.status = 'Verified';
          }
          else {
            check(status?.status === 'paused', 'Fictional enrollment is not paused or finished');
            const logical = `${id}-sequence-stop`, prior = o.requests[logical];
            if (prior) throw Error('Sequence stop awaits authoritative readback; never replay it');
            yield request(logical, 'stop', { contact_ids: [person.id], emailer_campaign_ids: [binding.sequence_id], mode: 'stop', stop_reason: 'Controlled reply/stop; cancel future fictional steps' });
            throw Error('Sequence stop requested; verify at the next bounded cycle');
          }
        }
        yield* this.tasks(state, c, id, binding, record, request, retain);
        for (const [actionId, m] of Object.entries(c.operations.emails ?? {})) {
          const a = state.actions[actionId]; if (a?.prospect_id !== id) continue;
          const e = o.email[actionId] ??= { status: 'Awaiting approval' };
          check(!e.message_sha256 || e.message_sha256 === hash(m), 'Confirmed email changed after reservation');
          if ((e.status === 'Delivered' && e.thread) || e.status === 'Failed') continue;
          if ((record.cold_paused || record.restriction || a.status === 'Cancelled') && !o.requests[`${actionId}-send`]) { e.status = 'Cancelled'; a.status = 'Cancelled'; continue; }
          check(m.approved, 'Exact controlled email approval is still required');
          const calls = record.attempts.filter(x => x.channel === 'call'), emails = record.attempts.filter(x => x.channel === 'email');
          check(o.requests[`${actionId}-send`] || a.type === 'email' && ['Queued', 'Verified'].includes(a.status) && calls.some(x => x.id === a.payload.call_id) &&
            record.calls[a.payload.call_id]?.outcome === 'no_answer' && emails.length < 2 && businessDaysBetween(calls[0].at, now) < 10, 'Email requires a saved no-answer outcome within campaign limits');
          const freshContact = yield request(`${id}-contact-email`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 }); contact(freshContact, binding, c.apollo.user_id);
          check(!freshContact.contacts[0].contact_campaign_statuses?.some(s => ['active', 'paused'].includes(s.status)), 'An existing provider sequence could duplicate the controlled email');
          const boxes = yield request(`${id}-mailboxes`, 'mailboxes', {});
          check(!boxes.failed && boxes.email_accounts?.some(b => b.id === m.mailbox_id && b.email === m.from && b.user_id === c.apollo.user_id && b.active === true), 'Confirmed sender mailbox is unavailable');
          e.message_sha256 = hash(m);
          const draftLogical = `${actionId}-draft`, sendLogical = `${actionId}-send`;
          const draftPrior = o.requests[draftLogical];
          if (draftPrior && draftPrior.status !== 'Done') throw Error('Uncertain draft creation; manually reconcile the exact draft, never recreate');
          const draft = yield request(draftLogical, 'draft', { contact_id: binding.contact_id, recipients: [{ email: m.to, recipient_type_cd: 'to' }], subject: m.subject, body_html: m.body_html });
          check(!draft.failed, 'Controlled draft creation failed; no replay'); const d = message(draft);
          const html = d.body_html?.replace(/^<html><head><\/head><body>([\s\S]*)<\/body><\/html>$/, '$1');
          check(identifier(d.id) && d.contact_id === binding.contact_id && d.subject === m.subject && html === m.body_html &&
            d.recipients?.length === 1 && d.recipients[0].email === m.to && d.recipients[0].recipient_type_cd === 'to' && !d.cc_emails?.length && !d.bcc_emails?.length &&
            (!d.from_email || d.from_email === m.from) && (!d.send_from?.email || d.send_from.email === m.from) && (!d.email_account_id || d.email_account_id === m.mailbox_id), 'Draft differs from the exact confirmed message');
          e.message_id = d.id;
          // A missing send receipt is reconciled only with status. It never reserves another send.
          if (!o.requests[sendLogical]) yield request(sendLogical, 'send', { id: d.id, send_from: { email: m.from, email_account_id: m.mailbox_id } });
          const status = yield request(`${actionId}-delivery`, 'delivery', { id: d.id }); check(!status.failed && message(status).id === d.id, 'Delivery status unavailable or changed');
          const delivery = message(status).status ?? message(status).email_status;
          if (['completed', 'delivered', 'replied'].includes(delivery)) {
            if (e.status !== 'Delivered') retain(`${actionId}-delivery`);
            e.status = 'Delivered'; e.delivered_at ??= now.toISOString();
            const effectId = `email-${hash(actionId).slice(0, 32)}`;
            o.effects[effectId] ??= { event: { id: effectId, prospect_id: id, type: 'email_delivered', at: now.toISOString(), data: { action_id: actionId, message_id: d.id, simulated: true } } };
            const found = yield request(`${actionId}-find-thread`, 'gmail_search', { query: `in:sent from:${m.from} to:${m.to} subject:"${m.subject}" after:${Math.floor(Date.parse(o.requests[sendLogical].prepared_at) / 1000) - 1}`, max_results: 10 });
            check(!found.failed && found.message_ids?.length === 1 && !found.next_page_token, 'Delivered email thread is missing or ambiguous; reconcile without resending');
            const thread = yield request(`${actionId}-read-thread`, 'thread', { message_id: found.message_ids[0], max_messages: 20 });
            e.thread = { thread_id: thread.id, original_id: found.message_ids[0], from: m.from, to: m.to, subject: m.subject,
              sent_after: new Date(Date.parse(o.requests[sendLogical].prepared_at) - 1000).toISOString(), sent_before: new Date(Date.parse(o.requests[sendLogical].prepared_at) + 24 * 3600_000).toISOString() };
            controlledThread(thread, e.thread, now); retain(`${actionId}-read-thread`);
          } else if (['failed', 'bounced'].includes(delivery)) { e.status = 'Failed'; throw Error('Controlled email failed/bounced; hold this route'); }
          else { e.status = 'Queued at Apollo'; throw Error('Apollo email is queued; inspect status at the next cycle, never resend'); }
        }
        delete o.holds[id];
      } catch (error) { o.holds[id] = error.message; }
      o.cycle.completed_records.push(id);
    }
    yield* this.bookings(state, c, request, retain);
  }
  *tasks(state, c, id, binding, record, request, retain) {
    const o = state.operations, now = this.app.now();
        for (const a of Object.values(state.actions).filter(a => a.prospect_id === id && ['call_task', 'callback_task'].includes(a.type) &&
          (a.status !== 'Cancelled' || a.provider_task && a.cancel_requested))) {
          if (!binding || !['Queued', 'Pending', 'Uncertain', 'Verified'].includes(a.status)) continue;
          const createLogical = `${a.id}-task-create`, prior = o.requests[createLogical];
          const coldHold = record.cold_paused && (a.type !== 'callback_task' || record.stage !== 'Callback');
          if (!a.provider_task && !prior && (coldHold || record.restriction)) { a.status = 'Cancelled'; continue; }
          const found = yield request(`${a.id}-contact`, 'contact', { q_keywords: binding.email || binding.business_name, per_page: 10, page: 1 }); verifiedContact(found, binding, c.apollo.user_id, !record.controlled || Boolean(c.operations.native_proof));
          a.request ??= { contact_id: binding.contact_id, ...(binding.account_id ? { account_id: binding.account_id } : {}), user_id: c.apollo.user_id, type: 'call', status: 'scheduled', priority: a.type === 'callback_task' ? 'high' : 'low',
            due_at: new Date(Math.floor(Date.parse(a.payload.due_at) / 1000) * 1000).toISOString(), title: `${record.controlled ? 'STUDIO TEST' : 'EVZ'} ${c.run_id} ${a.id}`,
            note: record.controlled ? 'CONTROLLED TEST — fictional follow-up task. No actual call; do not dial. A reply/stop cancels this task.' :
              `Owner call${record.call_lane === 'verification' ? ' — VERIFY IDENTITY, CURRENT ACTIVITY AND GOALS; NO AUTOMATIC EMAIL' : ''}. Record the actual outcome in Studio Operations; task completion alone never sends email. Topic: ${record.idea}` };
          if (!a.provider_task && prior && prior.status !== 'Done') {
            const candidates = yield request(`${a.id}-task-search`, 'task_search', { contact_id: binding.contact_id, user_id: c.apollo.user_id, q_keywords: a.request.title, per_page: 10, page: 1, task_status: 'scheduled' });
            check(!candidates.failed && candidates.tasks?.length === 1 && (!candidates.pagination || candidates.pagination.total_pages <= 1), 'Uncertain call task is not uniquely reconciled; never recreate');
            const candidate = candidates.tasks[0]; check((candidate.contact_id ?? candidate.contact?.id) === binding.contact_id, 'Call task candidate belongs to another contact');
            a.provider_task = { id: candidate.id, user_id: c.apollo.user_id, account_id: binding.account_id };
          }
          if (!a.provider_task) {
            const created = yield request(createLogical, 'task_create', a.request); check(!created.failed, 'Call task creation failed; reconcile without replay');
            a.provider_task = controlledTaskIdentity(created.task ?? created, a.request);
          }
          let detail = yield request(`${a.id}-task-read`, 'task_read', { id: a.provider_task.id }); check(!detail.failed, 'Controlled call task readback failed'); detail = detail.task ?? detail;
          check(detail.id === a.provider_task.id && (detail.contact_id ?? detail.contact?.id) === binding.contact_id &&
            (!Object.hasOwn(detail, 'user_id') || detail.user_id === c.apollo.user_id) && !detail.emailer_campaign_id && !detail.sequence_id, 'Controlled call task association changed');
          if (detail.status === 'skipped' && a.cancel_requested) { retain(`${a.id}-task-read`); a.status = 'Cancelled'; a.cancellation = 'Verified skipped at Apollo'; a.cancel_requested = false; continue; }
          a.provider_task = controlledTaskIdentity(detail, a.request, a.provider_task, true); a.status = 'Verified';
          if (!a.verified_at) { retain(`${a.id}-task-read`); a.verified_at = now.toISOString(); }
          if (a.cancel_requested || coldHold || record.restriction) {
            a.cancel_requested = true;
            const skipKey = `${a.id}-task-skip`;
            if (!o.requests[skipKey]) yield request(skipKey, 'task_skip', { id: detail.id, note: record.controlled ? 'Controlled reply/outcome verified; cancel this fictional call task. No actual call placed.' : 'Saved owner outcome or reply cancels this future task. Task skipping is not evidence of a call.' });
            throw Error('Controlled call cancellation awaits skipped readback; never replay the skip');
          }
        }
  }
  *bookings(state, c, request, retain) {
    const o = state.operations, now = this.app.now();
    for (const [bookingId, b] of Object.entries(c.operations.bookings ?? {}).filter(([id]) => !o.cycle.completed_bookings.includes(id))) {
      try {
        const r = state.prospects[b.prospect_id], createKey = `${bookingId}-create`, prior = o.requests[createKey]; let eventId = o.bookings[bookingId]?.id;
        check(eventId || prior || ['Discovery', 'Information requested'].includes(r.stage) && !r.restriction, 'Booking requires reviewed interest');
        check(!o.bookings[bookingId]?.scope_sha256 || o.bookings[bookingId].scope_sha256 === hash(b), 'Booking changed after reservation');
        if (!eventId && prior) {
          if (prior.status === 'Done') eventId = eventData(prior.result).id;
          else {
            const search = yield request(`${bookingId}-reconcile`, 'booking_search', { calendar_id: c.calendar.calendar_id, query: b.title, time_min: b.start, time_max: b.end, timezone_str: 'America/New_York', max_results: 10 });
            check(!search.failed && search.events?.length === 1 && !search.next_page_token, 'Uncertain booking creation not uniquely reconciled; never recreate'); eventId = search.events[0].id;
          }
        }
        if (!eventId) {
          const buffer = c.calendar.buffer_minutes * 60_000;
          const busy = yield request(`${bookingId}-busy`, 'busy', { calendar_ids: [c.calendar.calendar_id], time_min: new Date(Date.parse(b.start) - buffer).toISOString(), time_max: new Date(Date.parse(b.end) + buffer).toISOString(), response_timezone_str: 'America/New_York' });
          check(!busy.failed && busy.calendars?.length === 1 && busy.calendars[0].calendar_id === c.calendar.calendar_id && !busy.calendars[0].errors, 'Calendar availability failed or changed');
          validateBookingSlot({ start: b.start, end: b.end, timezone: 'America/New_York' }, busy.calendars[0].busy, c.calendar, now.toISOString(), now);
          const created = yield request(createKey, 'booking_create', { calendar_id: c.calendar.calendar_id, title: b.title, description: b.description, start_time: b.start, end_time: b.end,
            timezone_str: 'America/New_York', attendees: b.attendee_email ? [b.attendee_email] : [], add_google_meet: b.mode==='video', visibility: 'private', transparency: 'opaque', reminders: { use_default: false, overrides: [] } });
          check(!created.failed, 'Calendar create failed; reconcile without replay'); eventId = eventData(created).id;
        }
        check(identifier(eventId), 'Booking returned no event ID');
        const read = yield request(`${bookingId}-read`, 'booking_read', { calendar_id: c.calendar.calendar_id, event_id: eventId }); check(!read.failed, 'Calendar booking readback failed');
        const verified = bookingIdentity(read, b, c.calendar.owner_email); check(verified.id === eventId, 'Calendar booking identity changed');
        if (!o.bookings[bookingId]) retain(`${bookingId}-read`);
        o.bookings[bookingId] = { ...verified, scope_sha256: hash(b), verified: true };
        if (r.meeting?.event_id === verified.id) r.meeting.current_status = 'Verified';
        const effectId = `booking-${hash(bookingId).slice(0, 32)}`;
        o.effects[effectId] ??= { event: { id: effectId, prospect_id: b.prospect_id, type: 'meeting_verified', at: now.toISOString(), data: { ...verified, event_id: verified.id } } };
        delete o.holds[bookingId];
      } catch (error) {
        o.holds[bookingId] = error.message;
        if (o.bookings[bookingId]) o.bookings[bookingId].verified = false;
        if (state.prospects[b.prospect_id].meeting) state.prospects[b.prospect_id].meeting.current_status = 'Needs review';
      }
      o.cycle.completed_bookings.push(bookingId);
    }

  }

  async settle(key, raw) {
    await this.settings();
    return this.app.change(state => {
      const r = Object.values(state.operations?.requests ?? {}).find(r => r.key === key);
      check(r?.status === 'Pending' && r.session === this.session && names[r.operation], 'Unknown, stale or settled operations receipt');
      try {
        let data = unwrapApollo(raw); check(data && typeof data === 'object' && !Array.isArray(data), 'Malformed provider receipt');
        if (r.operation === 'lists' && 'success' in data) {
          check(data.success === true && Array.isArray(data.data), 'Malformed contact-list receipt');
          data = { labels: data.data };
        }
        // Gmail bodies are unnecessary for matching replies; keep only protocol headers in operating state.
        r.result = r.operation === 'thread' ? { id: data.id, messages: data.messages?.map(m => ({ id: m.id, thread_id: m.thread_id, internal_date: m.internal_date, label_ids: m.label_ids, payload: { headers: m.payload?.headers } })) } : data;
        r.status = 'Done'; r.receipt_sha256 = hash(raw); r.finished_at = this.app.now().toISOString();
        if (['apollo_profile', 'gmail_profile', 'calendar_profile'].includes(r.operation)) {
          state.operations.owner_evidence ??= {};
          if (!state.operations.owner_evidence[r.operation]) { r.retain = true; state.operations.owner_evidence[r.operation] = r.key; }
        }
      } catch { r.status = 'Failed'; r.error = 'Provider operation returned an error or malformed receipt'; r.receipt_sha256 = hash(raw); }
      return { key, status: r.status };
    });
  }
  async effects() {
    for (const [id, effect] of Object.entries((await this.app.snapshot()).operations?.effects ?? {})) {
      if (effect.applied) continue;
      const record = (await this.app.snapshot()).prospects[effect.event.prospect_id];
      // A stronger stop wins over a delayed positive/provider event.
      if (!record.restriction || ['reply_received', 'email_delivered', 'meeting_verified'].includes(effect.event.type)) await this.app.apply(effect.event, { actor: effect.actor ?? 'provider' });
      await this.app.change(state => { state.operations.effects[id].applied = true; });
    }
  }
  async report() { return this.app.change(state => notification(state.operations, this.app.now(), state.actions)); }
}
