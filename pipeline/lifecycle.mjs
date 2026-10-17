import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { acquireLock, privateStateDirectory, readJson, saveJson } from './engine.mjs';
import { dailyCallQueue } from './apollo-queue.mjs';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const check = (condition, message) => { if (!condition) throw Error(message); };
const text = (value, max = 3000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const date = value => typeof value === 'string' && /Z$|[+-]\d\d:\d\d$/.test(value) && Number.isFinite(Date.parse(value));
const money = value => Number.isSafeInteger(value) && value > 0 && value <= 100_000_000;
const services = ['website', 'systems', 'ai', 'marketing'];
const coldOutcomes = ['no_answer', 'busy', 'voicemail'];
const connectedOutcomes = ['discovery', 'requested_info', 'callback', 'not_interested', 'do_not_contact', 'wrong_contact', 'uncertain'];
export const initialConfig = {
  schema_version: 1, mode: 'controlled', run_id: 'studio-lifecycle-controlled',
  research_enabled: false, outreach_enabled: false, connector_writes_enabled: false,
  priority: 'website', timezone: 'America/New_York', daily_target: 50,
  transcript_ai: { enabled: false, daily_calls: 4, reserve_percent: 30,
    author_model: 'gpt-5.6-luna', reviewer_model: 'gpt-5.6-sol', effort: 'high' },
  calendar: { duration_minutes: 20, buffer_minutes: 15, start_hour: 9, end_hour: 17, weekdays: [1, 2, 3, 4, 5] },
  readiness: { owner_design_approved: false, business_sender_verified: false, native_automation_verified: false,
    delivery_and_stop_verified: false, website_inquiry_verified: false, prospect_supply_verified: false, capacity_verified: false }
};

export function businessDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function businessDaysBetween(start, end) {
  let day = new Date(`${businessDate(start)}T12:00:00Z`), count = 0;
  const finish = businessDate(end);
  while (day.toISOString().slice(0, 10) < finish && count <= 11) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (![0, 6].includes(day.getUTCDay())) count++;
  }
  return count;
}
function request(state, record, type, payload, eventId) {
  const id = `${eventId}-${type}`;
  state.actions[id] ??= { id, prospect_id: record.id, type, payload, status: 'Queued', created_at: state.updated_at };
}
function pauseCold(state, record, eventId, reason) {
  record.cold_paused = true;
  for (const action of Object.values(state.actions)) if (action.prospect_id === record.id && ['email', 'call_task', 'callback_task'].includes(action.type)) {
    if (action.status === 'Queued') action.status = 'Cancelled';
    if (action.status === 'Pending') { action.status = 'Uncertain'; action.hold = 'Stop arrived after dispatch; reconcile provider before continuing'; }
    if (action.status === 'Verified' && action.provider_task && ['call_task', 'callback_task'].includes(action.type)) action.cancel_requested = true;
  }
  if (record.apollo?.sequence_id) {
    record.suppression = 'Pending';
    if (!Object.values(state.actions).some(a => a.prospect_id === record.id && a.type === 'sequence_stop' && ['Queued', 'Pending', 'Uncertain', 'Verified'].includes(a.status)))
      request(state, record, 'sequence_stop', { reason }, eventId);
  } else record.suppression = 'Local only';
}
function contactable(record, at) {
  check(record.stage !== 'Stopped' && !record.restriction && !record.cold_paused, 'Cold contact is paused or restricted');
  check(record.qualification?.verdict === 'Research-qualified' && record.qualification.independent_review === 'Accepted', 'Reviewed qualification required');
  check(date(record.qualification.checked_at) && Date.parse(at) >= Date.parse(record.qualification.checked_at) &&
    Date.parse(at) - Date.parse(record.qualification.checked_at) <= 30 * 86_400_000, 'Research/contact check is stale or from the future');
  const first = record.attempts[0]?.at;
  check(!first || businessDaysBetween(first, at) < 10, 'Ten-business-day cold campaign has ended');
}
function safeReference(value) {
  check(text(value, 1500), 'An evidence/document reference is required');
  check(!/^(?:javascript|data|file):/i.test(value), 'Unsafe document reference');
  return value;
}
function owner(actor) { check(actor === 'owner' || actor === 'controlled-fixture', 'This decision requires owner review'); }

export function validateTranscriptProposal(proposal, transcript) {
  check(proposal?.schema_version === 1 && proposal.transcript_sha256 === transcript.sha256 && connectedOutcomes.includes(proposal.outcome), 'Transcript proposal does not match the saved call');
  check(text(proposal.summary) && Array.isArray(proposal.claims) && proposal.claims.length > 0 && proposal.claims.length <= 16, 'A supported transcript summary is required');
  for (const claim of proposal.claims) check(text(claim.claim, 1200) && text(claim.quote, 1500) && transcript.text.includes(claim.quote), 'Every claim needs an exact transcript quote');
  check(Array.isArray(proposal.unknowns) && proposal.unknowns.every(x => text(x, 1000)), 'Unknowns must be explicit');
  check(proposal.callback_at === null || date(proposal.callback_at), 'Invalid proposed callback time');
  check(proposal.outcome !== 'callback' || date(proposal.callback_at), 'Callback requires an exact time for owner review');
  return proposal;
}

export class StudioLifecycle {
  constructor(directory, now = () => new Date()) { this.directory = directory; this.now = now; }
  static async open({ directory, now }) {
    directory = await privateStateDirectory(directory);
    const app = new StudioLifecycle(directory, now);
    const config = await readJson(join(directory, 'lifecycle-config.json'));
    check(config.schema_version === 1 && ['controlled', 'production'].includes(config.mode) && key(config.run_id), 'Invalid lifecycle configuration');
    check(config.timezone === 'America/New_York' && config.daily_target === 50, 'Use the agreed campaign timezone and minimum');
    check(config.research_enabled === false, 'Real research remains paused in this build');
    if (config.mode === 'controlled') check(config.outreach_enabled === false, 'Production activation requires the separate final readiness review');
    else if (config.outreach_enabled || config.connector_writes_enabled) { const { requireProductionRelease } = await import('./production.mjs'); requireProductionRelease(config); }
    app.config = config;
    await app.change(state => { check(state.run_id === config.run_id && state.mode === config.mode, 'State belongs to a different run or mode'); });
    return app;
  }
  static async initialize({ directory, config = initialConfig, now }) {
    directory = await privateStateDirectory(directory); await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'lifecycle-config.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
    await writeFile(join(directory, 'lifecycle-state.json'), JSON.stringify({ schema_version: 1, run_id: config.run_id, mode: config.mode,
      revision: 0, updated_at: new Date().toISOString(), prospects: {}, events: {}, actions: {}, ai_attempts: {}, exceptions: [] }, null, 2), { flag: 'wx', mode: 0o600 });
    return StudioLifecycle.open({ directory, now });
  }
  async change(fn) {
    const release = await acquireLock(this.directory);
    try {
      const state = await readJson(join(this.directory, 'lifecycle-state.json'));
      check(state.schema_version === 1, 'Unknown state version');
      const result = await fn(state);
      check(Buffer.byteLength(JSON.stringify(state)) <= 20_000_000, 'State size limit reached; archive closed records before proceeding');
      await saveJson(join(this.directory, 'lifecycle-state.json'), state);
      return result;
    } finally { await release(); }
  }
  async snapshot() { return readJson(join(this.directory, 'lifecycle-state.json')); }
  async apply(event, { actor = 'owner', expectedRevision } = {}) {
    this.config = await readJson(join(this.directory, 'lifecycle-config.json'));
    check(key(event?.id) && key(event.prospect_id) && text(event.type, 80) && date(event.at), 'Event needs stable IDs and an explicit timestamp');
    check(Date.parse(event.at) <= +this.now() + 60_000, 'An event cannot claim a future action');
    return this.change(state => {
      const fingerprint = hash({ event, actor });
      if (state.events[event.id]) { check(state.events[event.id].fingerprint === fingerprint, 'Event ID conflicts with saved evidence'); return { duplicate: true, revision: state.revision }; }
      check(expectedRevision === undefined || expectedRevision === state.revision, 'Record changed; refresh before approving');
      check(Object.keys(state.events).length < 20_000, 'Event limit reached; archive closed records');
      const data = event.data ?? {}, eid = event.id;
      let r = state.prospects[event.prospect_id];
      state.updated_at = this.now().toISOString();
      if (event.type === 'prospect_imported') {
        if (this.config.mode === 'production') check(actor === 'research-import', 'Production prospects must enter through the retained independent research review'); else owner(actor);
        check(!r && !Object.values(state.prospects).some(x => x.company_id === data.company_id), 'Prospect/company already exists');
        check(key(data.company_id) && text(data.name, 250) && text(data.idea, 1600) && text(data.category, 150), 'Identity, category and tailored idea required');
        check(typeof data.controlled === 'boolean' && data.controlled === (this.config.mode === 'controlled'), 'Controlled mode accepts fictional records only; production records need a separate workspace');
        check(!data.controlled || data.contact?.email?.endsWith('@example.invalid') && !data.contact?.phone, 'Fictional records must use .invalid email and no dialable phone');
        check(data.qualification?.verdict === 'Research-qualified' && data.qualification.independent_review === 'Accepted' &&
          date(data.qualification.checked_at) && /^[a-f0-9]{64}$/.test(data.qualification.report_sha256 ?? '') &&
          /^[a-f0-9]{64}$/.test(data.qualification.review_sha256 ?? '') && text(data.qualification.evidence_ref), 'Accepted source-backed research and review references required');
        check(data.controlled || /food|beverage|bakery|café|cafe/i.test(data.category), 'First campaign is food and beverages');
        check(data.controlled || data.contact?.verified === true && date(data.contact.checked_at) && text(data.contact.source), 'Public contact ownership must be verified');
        if (!data.controlled) check(!Object.values(state.prospects).some(x => x.contact?.email?.toLowerCase() === data.contact.email?.toLowerCase() || x.contact?.phone && x.contact.phone.replace(/\D/g, '') === data.contact.phone?.replace(/\D/g, '')), 'Duplicate contact identity already exists; preserve its restrictions');
        r = state.prospects[event.prospect_id] = { ...data, id: event.prospect_id, stage: 'Ready to contact', cold_paused: false,
          attempts: [], calls: {}, transcripts: {}, proposals: {}, approved_calls: {}, payments: [], invoices: [], materials: [], tasks: [], revisions: [], tickets: [] };
        request(state, r, 'call_task', { due_at: event.at, kind: 'new' }, eid);
      } else {
        check(r, 'Unknown prospect');
        if (r.restriction) check(['support_opened', 'support_closed', 'note_added', 'reply_received', 'email_delivered', 'meeting_verified'].includes(event.type), 'Restriction cannot be cleared by a later event');
        switch (event.type) {
          case 'call_logged': {
            owner(actor); check(key(data.call_id) && !r.calls[data.call_id] && [...coldOutcomes, 'connected', 'callback', 'declined', 'do_not_contact', 'wrong_contact', 'skipped'].includes(data.outcome), 'Explicit unique call outcome required');
            check(r.controlled || this.config.outreach_enabled === true && this.config.release?.approved === true, 'Real calling remains paused pending final release');
            check(data.simulated === r.controlled, 'Simulated and actual calls cannot be mixed');
            check(date(data.performed_at) && Date.parse(data.performed_at) <= Date.parse(event.at) && (!r.attempts.length || Date.parse(data.performed_at) >= Date.parse(r.attempts.at(-1).at)), 'Call time must be performed, ordered and dated');
            if (data.outcome !== 'skipped') {
              check(r.stage === 'Ready to contact' || r.stage === 'Contacting' || r.stage === 'Callback', 'Call is outside the contact stage');
              check(r.stage === 'Callback' || r.attempts.filter(x => x.channel === 'call').length < 2, 'Two-call campaign cap reached');
              if (r.stage !== 'Callback') contactable(r, data.performed_at);
              r.attempts.push({ id: data.call_id, channel: 'call', at: data.performed_at, simulated: data.simulated, connected: ![...coldOutcomes, 'wrong_contact'].includes(data.outcome) });
            }
            r.calls[data.call_id] = { ...data, event_id: eid };
            for (const a of Object.values(state.actions)) if (a.prospect_id === r.id && ['call_task', 'callback_task'].includes(a.type)) {
              if (a.status === 'Queued') a.status = 'Cancelled';
              else if (a.provider_task) a.cancel_requested = true;
            }
            if (['declined', 'do_not_contact'].includes(data.outcome)) { r.restriction = data.outcome; r.stage = 'Stopped'; pauseCold(state, r, eid, data.outcome); }
            else if (data.outcome === 'connected') { r.stage = 'Connected review'; pauseCold(state, r, eid, 'Connected call awaiting transcript/owner review'); }
            else if (data.outcome === 'callback') {
              check(date(data.callback_at) && Date.parse(data.callback_at) > Date.parse(data.performed_at), 'Callback needs an exact time after the performed call');
              r.stage = 'Callback'; r.callback_at = data.callback_at; pauseCold(state, r, eid, 'Requested callback'); request(state, r, 'callback_task', { due_at: data.callback_at, kind: 'callback' }, eid);
            } else if (coldOutcomes.includes(data.outcome)) {
              r.stage = 'Contacting';
              if (!r.contact?.verified || r.cold_paused) { r.stage = 'Hold'; r.next_check = r.cold_paused ? 'Requested callback was unanswered; owner chooses the conversational next step' : 'Verify the public email before handoff'; }
              else if (r.attempts.filter(x => x.channel === 'email').length < 2 && !Object.values(state.actions).some(a => a.prospect_id === r.id && a.type === 'email' && ['Queued', 'Pending', 'Uncertain', 'Awaiting readback'].includes(a.status))) request(state, r, 'email', { call_id: data.call_id, idea: r.idea, email: r.contact.email }, eid);
            } else { r.stage = 'Hold'; r.next_check = data.outcome === 'wrong_contact' ? 'Verify the public phone/contact ownership' : 'Record an actual outcome; skipped tasks do not release email'; pauseCold(state, r, eid, r.next_check); }
            break;
          }
          case 'contact_stopped':
            owner(actor); check(['decline', 'do_not_contact'].includes(data.reason), 'Record the explicit stop reason');
            r.restriction = data.reason; r.stage = 'Stopped'; pauseCold(state, r, eid, data.reason); break;
          case 'transcript_added':
            owner(actor); check(r.stage === 'Connected review' && r.calls[data.call_id]?.outcome === 'connected', 'Transcript must match a connected call');
            check(!r.transcripts[data.call_id] && text(data.text, 60_000) && data.permission_confirmed === true, 'Supply one permitted transcript; recording consent is separate');
            check(!/-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}|\b(?:password|api[_ -]?key|authorization)\s*[:=]\s*\S+/i.test(data.text), 'Redact credentials before saving or analyzing a transcript');
            r.transcripts[data.call_id] = { text: data.text, sha256: hash(data.text), added_at: event.at, call_id: data.call_id };
            request(state, r, 'transcript_review', { call_id: data.call_id }, eid); break;
          case 'transcript_assessed': {
            check(actor === 'worker' || actor === 'controlled-fixture', 'Assessment must come from the restricted worker boundary');
            const transcript = r.transcripts[data.call_id]; check(transcript && r.stage === 'Connected review' && !r.approved_calls[data.call_id], 'Call is no longer awaiting analysis');
            validateTranscriptProposal(data.proposal, transcript);
            check(data.review?.verdict === 'Accepted' && data.review.proposal_sha256 === hash(data.proposal) && data.review.independent === true, 'Independent review must accept the exact proposal');
            r.proposals[data.call_id] = { ...data.proposal, sha256: hash(data.proposal), review: data.review };
            state.exceptions = state.exceptions.filter(x => x.id !== `transcript-${hash(`${r.id}:${data.call_id}`).slice(0, 24)}`);
            for (const a of Object.values(state.actions)) if (a.type === 'transcript_review' && a.prospect_id === r.id && a.payload.call_id === data.call_id) a.status = 'Verified';
            break;
          }
          case 'call_reviewed': {
            owner(actor); const proposal = r.proposals[data.call_id];
            check(r.stage === 'Connected review' && proposal?.sha256 === data.proposal_sha256 && !r.approved_calls[data.call_id], 'Approve the exact current transcript proposal');
            check(connectedOutcomes.includes(data.outcome), 'Unsupported reviewed outcome');
            r.approved_calls[data.call_id] = { outcome: data.outcome, at: event.at, actor, proposal_sha256: proposal.sha256, note: data.note ?? '' };
            if (['not_interested', 'do_not_contact'].includes(data.outcome)) { r.restriction = data.outcome; r.stage = 'Stopped'; pauseCold(state, r, eid, data.outcome); }
            else if (data.outcome === 'callback') { check(date(data.callback_at) && Date.parse(data.callback_at) > Date.parse(r.calls[data.call_id].performed_at), 'Confirm an exact callback after the call; overdue promises stay due'); r.stage = 'Callback'; r.callback_at = data.callback_at; request(state, r, 'callback_task', { due_at: data.callback_at, kind: 'callback' }, eid); }
            else if (data.outcome === 'discovery') r.stage = 'Discovery';
            else if (data.outcome === 'requested_info') { r.stage = 'Information requested'; request(state, r, 'information_task', { summary: proposal.summary }, eid); }
            else { r.stage = 'Hold'; r.next_check = 'Owner clarification of the connected call'; }
            break;
          }
          case 'reply_received':
            check(actor === 'provider' || actor === 'controlled-fixture', 'Reply must be verified at the provider boundary');
            check(key(data.source_id) && ['reply', 'decline', 'do_not_contact', 'bounce', 'out_of_office'].includes(data.kind), 'A verified reply/event ID and kind are required');
            r.reply = { ...data, at: event.at }; pauseCold(state, r, eid, data.kind);
            if (r.restriction) { r.stage = 'Stopped'; break; }
            if (['decline', 'do_not_contact'].includes(data.kind)) { r.restriction = data.kind; r.stage = 'Stopped'; }
            else { r.stage = data.kind === 'reply' ? 'Reply review' : 'Hold'; r.next_check = data.kind === 'reply' ? 'Owner reviews reply and next action' : 'Verify contact/return date; never auto-resume from a bounce or auto-reply'; } break;
          case 'email_delivered': {
            check(actor === 'provider' && data.simulated === r.controlled && key(data.message_id), 'Verified provider email identity required');
            const action = state.actions[data.action_id];
            check(action?.prospect_id === r.id && action.type === 'email' && r.calls[action.payload.call_id]?.outcome === 'no_answer', 'Delivery must match the explicit call/email handoff');
            check(r.attempts.filter(a => a.channel === 'email').length < 2, 'Two-email campaign cap reached');
            r.attempts.push({ id: data.message_id, channel: 'email', at: event.at, simulated: data.simulated });
            action.status = 'Verified'; action.delivery = { message_id: data.message_id, at: event.at };
            if (!r.cold_paused && !r.restriction && r.attempts.filter(a => a.channel === 'call').length < 2) {
              const due = new Date(r.attempts.find(a => a.channel === 'call').at); let days = 0;
              while (days < 5) { due.setUTCDate(due.getUTCDate() + 1); if (![0, 6].includes(new Date(`${businessDate(due)}T12:00:00Z`).getUTCDay())) days++; }
              request(state, r, 'call_task', { due_at: due.toISOString(), kind: 'follow-up' }, eid);
            }
            break;
          }
          case 'reply_reviewed':
            owner(actor); check(r.stage === 'Reply review' && data.source_id === r.reply?.source_id, 'Review the exact current reply');
            check(['discovery', 'requested_info', 'hold', 'decline', 'do_not_contact'].includes(data.outcome), 'Unsupported reply disposition');
            check(data.note === undefined || typeof data.note === 'string' && data.note.length <= 3000, 'Bound the reply review note');
            r.reply_review = { ...data, at: event.at, actor };
            if (['decline', 'do_not_contact'].includes(data.outcome)) { r.restriction = data.outcome; r.stage = 'Stopped'; }
            else { r.stage = { discovery: 'Discovery', requested_info: 'Information requested', hold: 'Hold' }[data.outcome]; if (data.outcome === 'hold') r.next_check = data.note || 'Owner chooses the next conversational action'; if (data.outcome === 'requested_info') request(state, r, 'information_task', { summary: data.note }, eid); } break;
          case 'discovery_confirmed':
            owner(actor); check(['Discovery', 'Information requested'].includes(r.stage), 'Discovery follows reviewed interest');
            check(text(data.goal) && text(data.decision_maker, 200) && data.serious_interest === true && data.paid_fit_discussed === true, 'Goal, decision-maker, serious interest and paid fit are required');
            check(services.includes(data.service) && text(data.main_flow) && Number.isInteger(data.preview_screens) && data.preview_screens >= 1 && data.preview_screens <= 5, 'Bound one service, main flow and a few preview screens');
            r.discovery = { ...data, confirmed_at: event.at }; r.stage = 'Preview'; break;
          case 'meeting_recorded':
            owner(actor); check(['Discovery', 'Information requested'].includes(r.stage) && key(data.event_id) && data.owner_verified === true && date(data.start) && date(data.end) &&
              Date.parse(data.end) > Date.parse(data.start) && data.timezone === 'America/New_York', 'Record an exact owner-verified calendar event for this conversation');
            r.meeting = { ...data, reference: safeReference(data.reference), verified_at: event.at }; break;
          case 'meeting_verified':
            check(actor === 'provider' && key(data.event_id) && date(data.start) && date(data.end) && Date.parse(data.end) > Date.parse(data.start) && data.timezone === 'America/New_York', 'Exact provider booking evidence required');
            check(Object.values(state.operations?.bookings ?? {}).some(b => b.id === data.event_id && b.verified && b.start === data.start && b.end === data.end), 'Booking must pass the controller readback boundary');
            r.meeting = { ...data, reference: safeReference(data.reference), verified_at: event.at, current_status: 'Verified' }; break;
          case 'preview_recorded':
            owner(actor); check(r.stage === 'Preview', 'Preview requires qualified discovery');
            r.preview = { reference: safeReference(data.reference), approved_brief: text(data.brief) ? data.brief : r.discovery.main_flow, reviewed_with_owner: data.reviewed_with_owner === true };
            check(r.preview.reviewed_with_owner, 'Review the small preview with the decision-maker before quoting'); r.stage = 'Proposal'; break;
          case 'proposal_approved':
            owner(actor); check(r.stage === 'Proposal' && money(data.price_cents) && data.currency === 'USD', 'Owner-approved fixed USD project price required');
            check(money(data.initial_payment_cents) && data.initial_payment_cents <= data.price_cents && Number.isInteger(data.revision_rounds) && data.revision_rounds >= 0 && data.revision_rounds <= 10, 'Define payment and revision boundaries');
            for (const name of ['scope', 'deliverables', 'exclusions', 'timeline', 'acceptance', 'ownership', 'support_terms', 'change_terms', 'cancellation_terms']) check(text(data[name]), `Proposal requires ${name}`);
            r.quote = { ...data, approved_at: event.at, approved_by: actor, reference: safeReference(data.reference) }; r.stage = 'Agreement'; break;
          case 'agreement_recorded':
            owner(actor); check(r.stage === 'Agreement' && data.signed_verified === true && data.quote_sha256 === hash(r.quote), 'Verify signed acceptance of the exact approved quote');
            r.agreement = { reference: safeReference(data.reference), verified_at: event.at }; break;
          case 'invoice_recorded':
            owner(actor); check(r.agreement && key(data.invoice_id) && !r.invoices.some(x => x.invoice_id === data.invoice_id), 'A signed agreement and unique invoice are required');
            check(money(data.amount_cents) && data.currency === r.quote.currency && r.invoices.reduce((n, x) => n + x.amount_cents, 0) + data.amount_cents <= r.quote.price_cents, 'Invoice exceeds the fixed approved price');
            r.invoices.push({ ...data, reference: safeReference(data.reference), at: event.at }); break;
          case 'payment_recorded':
            owner(actor); const invoice = r.invoices.find(x => x.invoice_id === data.invoice_id);
            check(invoice && key(data.payment_id) && !r.payments.some(x => x.payment_id === data.payment_id) && data.settled_verified === true && data.simulated === r.controlled, 'Authoritative unique settled payment evidence required');
            check(money(data.amount_cents) && data.currency === r.quote.currency && r.payments.filter(x => x.invoice_id === data.invoice_id).reduce((n, x) => n + x.amount_cents, 0) + data.amount_cents <= invoice.amount_cents, 'Payment amount exceeds invoice or currency differs');
            r.payments.push({ ...data, reference: safeReference(data.reference), at: event.at });
            if (r.stage === 'Agreement' && r.payments.reduce((n, x) => n + x.amount_cents, 0) >= r.quote.initial_payment_cents) r.stage = 'Onboarding'; break;
          case 'onboarding_completed':
            owner(actor); check(r.stage === 'Onboarding' && text(data.materials) && text(data.access_plan) && text(data.kickoff), 'Paid onboarding requires materials, least-privilege access plan and kickoff');
            check(!/password\s*[:=]|-----BEGIN .*PRIVATE KEY/i.test(JSON.stringify(data)), 'Store credential references, never passwords or keys');
            r.onboarding = { ...data, at: event.at }; r.stage = 'Delivery';
            r.tasks = ({ website: ['Confirm content and customer flow', 'Build responsive implementation', 'Check accessibility, inquiry and errors', 'Prepare hosting and edit handover'],
              systems: ['Map workflow and data ownership', 'Implement bounded integration', 'Test recovery and permissions', 'Prepare operating instructions'],
              ai: ['Define allowed tasks and human review', 'Implement with usage limits', 'Evaluate errors and escalation', 'Document pause and upkeep'],
              marketing: ['Confirm offer, audience and channel', 'Prepare approved creative and tracking', 'Check links, claims and consent', 'Document campaign limits and reporting'] })[r.discovery.service].map((title, i) => ({ id: `task-${i + 1}`, title, status: 'Open' })); break;
          case 'delivery_task_updated':
            owner(actor); check(r.stage === 'Delivery' && ['Open', 'Complete'].includes(data.status), 'Tasks can be updated during delivery');
            const task = r.tasks.find(x => x.id === data.task_id); check(task, 'Unknown delivery task'); task.status = data.status; task.evidence = safeReference(data.evidence); break;
          case 'delivery_submitted':
            owner(actor); check(r.stage === 'Delivery' && r.tasks.length > 0 && r.tasks.every(x => x.status === 'Complete'), 'Complete all scoped checks before client review');
            r.delivery = { reference: safeReference(data.reference), at: event.at }; r.stage = 'Client review'; break;
          case 'revision_requested':
            owner(actor); check(r.stage === 'Client review' && text(data.feedback) && r.revisions.length < r.quote.revision_rounds, 'Revision limit reached; agree a separate change before more work');
            r.revisions.push({ feedback: data.feedback, reference: safeReference(data.reference), at: event.at }); r.stage = 'Delivery';
            r.tasks.push({ id: `revision-${r.revisions.length}`, title: data.feedback, status: 'Open' }); break;
          case 'acceptance_recorded':
            owner(actor); check(r.stage === 'Client review' && data.client_approval_verified === true, 'Verify client acceptance of the delivery');
            r.acceptance = { reference: safeReference(data.reference), at: event.at }; r.stage = 'Handover'; break;
          case 'handover_completed':
            owner(actor); check(r.stage === 'Handover' && r.payments.reduce((n, x) => n + x.amount_cents, 0) === r.quote.price_cents, 'Approved delivery and settled project balance required for final handover');
            for (const name of ['ownership', 'training', 'backup', 'support']) safeReference(data[name]);
            r.handover = { ...data, at: event.at }; r.stage = 'Support'; break;
          case 'support_opened':
            owner(actor); check(r.handover && key(data.ticket_id) && !r.tickets.some(x => x.id === data.ticket_id) && text(data.description), 'Support needs a handed-over project and unique request');
            check(['routine', 'urgent'].includes(data.priority) && date(data.review_at), 'Define support priority and owner review date; no invented SLA');
            r.tickets.push({ id: data.ticket_id, description: data.description, priority: data.priority, review_at: data.review_at, status: 'Open', opened_at: event.at });
            if (!r.restriction) r.stage = 'Support'; break;
          case 'support_closed':
            owner(actor); const ticket = r.tickets.find(x => x.id === data.ticket_id); check(ticket?.status === 'Open' && text(data.resolution) && data.client_notified_verified === true, 'Resolve and verify notification before closing support');
            Object.assign(ticket, { status: 'Closed', resolution: data.resolution, reference: safeReference(data.reference), closed_at: event.at }); break;
          case 'project_closed':
            owner(actor); check(r.stage === 'Support' && r.handover && r.tickets.every(x => x.status === 'Closed'), 'Finish handover and open support requests before closure'); r.stage = 'Closed'; break;
          case 'note_added': owner(actor); check(text(data.note), 'Note required'); r.note = data.note; break;
          default: throw Error('Unsupported lifecycle event');
        }
      }
      const cycle = state.operations?.cycle;
      if (cycle && !cycle.completed_at) {
        cycle.completed_records = (cycle.completed_records ?? []).filter(id => id !== r.id);
        cycle.completed_bookings = [];
      }
      r.updated_at = event.at; state.events[eid] = { fingerprint, actor, ...event }; state.revision++;
      return { prospect_id: r.id, stage: r.stage, revision: state.revision };
    });
  }
  async dashboard() {
    this.config = await readJson(join(this.directory, 'lifecycle-config.json'));
    const state = await this.snapshot(), today = businessDate(this.now());
    let researchPaused = !this.config.research_enabled, researchHold;
    if (this.config.research?.source_directory) {
      try { const control = await readJson(join(this.config.research.source_directory, 'research-control.json')); check(control.schema_version === 1 && typeof control.enabled === 'boolean', 'Unknown control'); researchPaused = !control.enabled || control.priority !== 'research'; }
      catch { researchPaused = true; researchHold = 'Configured research control is unavailable; verify its pause/priority before running workers.'; }
    }
    const real = Object.values(state.prospects).filter(r => !r.controlled);
    const contacted = real.filter(r => r.attempts.some(a => !a.simulated && businessDate(a.at) === today));
    const first = contacted.filter(r => businessDate(r.attempts.find(a => !a.simulated).at) === today).length;
    const candidates = Object.values(state.actions).filter(a => ['call_task', 'callback_task'].includes(a.type) && ['Queued', 'Verified'].includes(a.status))
      .map(a => ({ ...a, company_id: state.prospects[a.prospect_id].company_id, kind: a.payload.kind, due_at: a.payload.due_at,
        status: 'scheduled', stopped: state.prospects[a.prospect_id].restriction || !['Ready to contact', 'Contacting', 'Callback'].includes(state.prospects[a.prospect_id].stage) }));
    const queue = dailyCallQueue(candidates, this.now());
    return { ...state, prospects: Object.fromEntries(Object.entries(state.prospects).map(([id, r]) => [id, { ...r, quote_sha256: r.quote ? hash(r.quote) : null }])), controls: { mode: this.config.mode, research_paused: researchPaused, outreach_paused: !this.config.outreach_enabled, priority: this.config.priority,
      runtime_enabled: this.config.runtime?.enabled === true, final_review: this.config.mode === 'production' ? { fingerprint: (await import('./production.mjs')).releaseFingerprint(this.config), gates: (await import('./production.mjs')).productionGates(this.config), approved: this.config.release?.approved === true, verified: this.config.verified_summary ?? [] } : null,
      ai_enabled: this.config.transcript_ai.enabled, connector_writes_enabled: this.config.connector_writes_enabled, readiness: this.config.readiness },
      daily: { date: today, unique_businesses: contacted.length, new_businesses: first, repeat_businesses: contacted.length - first,
        actual_call_attempts: real.flatMap(r => r.attempts).filter(a => a.channel === 'call' && businessDate(a.at) === today && !a.simulated).length,
        actual_emails: real.flatMap(r => r.attempts).filter(a => a.channel === 'email' && businessDate(a.at) === today && !a.simulated).length,
        minimum: 50, shortfall: Math.max(0, 50 - contacted.length), due: queue },
      exceptions: [...state.exceptions, ...(researchHold ? [{ id: 'research-control', reason: researchHold }] : []), ...(state.runtime?.last_error ? [{ id: 'runtime', reason: state.runtime.last_error }] : []), ...Object.entries(state.operations?.holds ?? {}).map(([id, reason]) => ({ id: `operations-${id}`, reason })), ...Object.values(state.actions).filter(a => ['Uncertain', 'Held'].includes(a.status)).map(a => ({ id: a.id, reason: a.hold })),
        ...Object.values(state.prospects).filter(r => r.stage === 'Hold').map(r => ({ id: r.id, reason: r.next_check }))] };
  }
  async backup(output) {
    output = await privateStateDirectory(output);
    const release = await acquireLock(this.directory);
    try {
      const state = await this.snapshot();
      check(!Object.values(state.ai_attempts).some(a => a.status === 'Running'), 'Stop workers before backup');
      const body = JSON.stringify(state), bundle = { schema_version: 1, created_at: this.now().toISOString(), sha256: hash(body), body };
      check(Buffer.byteLength(JSON.stringify(bundle)) <= 25_000_000, 'Backup exceeds the verified restore limit; archive closed records first');
      await writeFile(output, JSON.stringify(bundle), { flag: 'wx', mode: 0o600 });
      return { sha256: bundle.sha256, prospects: Object.keys(state.prospects).length };
    } finally { await release(); }
  }
  static async restore({ input, destination }) {
    const stat = await lstat(input); check(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 25_000_000, 'Invalid bounded backup file');
    const bundle = JSON.parse(await readFile(input, 'utf8'));
    check(bundle.schema_version === 1 && hash(bundle.body) === bundle.sha256, 'Backup checksum mismatch');
    const state = JSON.parse(bundle.body); check(state.schema_version === 1 && key(state.run_id) && ['controlled', 'production'].includes(state.mode), 'Invalid backup state');
    check(!Object.values(state.ai_attempts).some(a => a.status === 'Running'), 'Cannot restore running worker state');
    destination = await privateStateDirectory(destination); await mkdir(destination, { mode: 0o700 });
    for (const a of Object.values(state.actions)) if (a.status === 'Pending') { a.status = 'Uncertain'; a.hold = 'Restored pending mutation; read back provider, never resend'; }
    for (const r of Object.values(state.operations?.requests ?? {})) if (r.status === 'Pending' && ['draft', 'send', 'stop', 'booking_create', 'task_create', 'task_skip', 'contact_create', 'personalize', 'intent'].includes(r.operation)) r.status = 'Uncertain';
    if (state.operations) delete state.operations.lease;
    delete state.runtime;
    await writeFile(join(destination, 'lifecycle-config.json'), JSON.stringify({ ...initialConfig, run_id: state.run_id, mode: state.mode }), { flag: 'wx', mode: 0o600 });
    await writeFile(join(destination, 'lifecycle-state.json'), JSON.stringify(state), { flag: 'wx', mode: 0o600 });
    return { execution: 'disabled', prospects: Object.keys(state.prospects).length };
  }
}
