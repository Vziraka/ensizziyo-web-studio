import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { check, hash, initialConfig, businessDate, businessDaysBetween } from './lifecycle.mjs';
import { readJson, saveJson, privateStateDirectory } from './engine.mjs';
import { reviewFiles, readPrivateJson, validateDecision } from './prospects.mjs';
import { validateEvidenceReview } from './evidence-review.mjs';
import { ControlledOperations, controlledThread, verifiedContact } from './lifecycle-operations.mjs';
import { researchCallPrep } from './call-prep.mjs';

const email = value => typeof value === 'string' && /^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/.test(value) && !value.endsWith('.invalid');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const phone = value => String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export const productionConfig = {
  ...structuredClone(initialConfig), mode: 'production', run_id: 'evz-food-beverage',
  runtime: { enabled: false }, operations: { enabled: false, interval_minutes: 5, allowlist: [], bookings: {}, emails: {} },
  apollo: { user_id: '', bindings: {} },
  sender: { email: '', mailbox_id: '', postal_address: '', website: 'https://evzdigital.studio/studio/', daily_email_limit: 20 },
  campaign: { category: 'food-and-beverage', area: 'Fairfax / DMV', max_calls: 2, max_emails: 2, business_days: 10 },
  native_email: { enabled: false, rounds: [] }, research: { auto_import: false, source_directory: '' }, release: { approved: false }, readiness_evidence: {}
};
export function releaseFingerprint(c) {
  return hash({ run_id: c.run_id, campaign: c.campaign, sender: c.sender, calendar: c.calendar, apollo_owner: c.apollo?.user_id, research_source: c.research?.source_directory ?? '', readiness_evidence: c.readiness_evidence,
    native_email: c.native_email, google: c.google ? { spreadsheet_id: c.google.spreadsheet_id, sheet_id: c.google.sheet_id, sheet_title: c.google.sheet_title } : null });
}
export function productionGates(c) {
  return Object.keys(initialConfig.readiness).map(key => ({ key, passed: c.readiness?.[key] === true && typeof c.readiness_evidence?.[key] === 'string' && c.readiness_evidence[key].length > 5, note: c.readiness_notes?.[key] ?? '' }));
}
export function requireProductionRelease(c) {
  check(c.mode === 'production' && c.outreach_enabled && c.connector_writes_enabled, 'Production contact remains paused for the final review');
  check(c.release?.approved === true && c.release.fingerprint === releaseFingerprint(c) && c.release.approval_ref?.length > 5, 'Final owner approval must match the current production connections and rules');
  check(productionGates(c).every(g => g.passed), 'Launch evidence is incomplete; preserve the production hold');
  check(c.campaign?.category === 'food-and-beverage' && c.campaign.max_calls === 2 && c.campaign.max_emails === 2 && c.campaign.business_days === 10, 'Campaign bounds changed');
  check(email(c.sender?.email) && c.sender.email === c.calendar.owner_email && id(c.sender.mailbox_id) && c.sender.postal_address?.trim().length > 10, 'Verified business sender, calendar and postal address required');
  check(!/@(?:gmail|googlemail)\.com$/i.test(c.sender.email), 'Production uses the verified business-domain mailbox');
  check(Number.isInteger(c.sender.daily_email_limit) && c.sender.daily_email_limit > 0 && c.sender.daily_email_limit <= 100, 'Use a measured daily mailbox allowance including follow-ups');
  check(c.native_email?.enabled && c.native_email.rounds?.length === 2 && c.native_email.rounds.every((r, i) => r.round === i + 1 && id(r.list_id) && r.list_name?.startsWith('EVZ ') && id(r.sequence_id) && r.sequence_name?.startsWith('EVZ ') && id(r.subject_field_id) && id(r.body_field_id) && r.verified === true), 'Two verified single-email native routes required');
  check(new Set(c.native_email.rounds.flatMap(r => [r.list_id, r.sequence_id, r.subject_field_id, r.body_field_id])).size === 8, 'Email rounds need separate immutable queues, sequences and fields');
}
export async function approveProductionRelease(app, fingerprint, approvalRef) {
  return app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    check(fingerprint === releaseFingerprint(c), 'Review the current production fingerprint first');
    c.release = { approved: true, fingerprint, approval_ref: approvalRef, approved_at: app.now().toISOString() };
    c.outreach_enabled = true; c.connector_writes_enabled = true;
    requireProductionRelease(c); await saveJson(path, c); app.config = c;
    return { released: true, research_enabled: false, fingerprint };
  });
}
export function contactKeys(r) {
  return [r.company_id && `company:${r.company_id}`, r.contact?.email && `email:${r.contact.email.toLowerCase()}`,
    phone(r.contact?.phone).length >= 10 && `phone:${phone(r.contact.phone)}`].filter(Boolean);
}

// Reads retained source/review files, never an editable Sheet verdict or an owner HTTP event.
export async function importResearch(app, directory, jobId, contactProof) {
  check(app.config.mode === 'production', 'Research imports belong in the production workspace');
  const f = await reviewFiles(directory, jobId), d = await readPrivateJson(join(f.target, 'qualification.json'));
  validateDecision(d, f, app.now); check(d.decision === 'Research-qualified', 'Only research-qualified businesses enter calls');
  const controller = await readPrivateJson(join(directory, 'controller-state.json')), record = controller.jobs[jobId];
  check(record?.status === 'Complete' && record.stage === 'done' && /^[a-z0-9.-]+\.json$/.test(record.review_file ?? ''), 'An independently completed controller review is required');
  const raw = await readFile(join(f.target, record.review_file)), receipt = JSON.parse(raw);
  validateEvidenceReview(receipt.result, f, receipt.reviewer, app.now);
  check(Number.isFinite(Date.parse(receipt.reviewed_at)) && Date.parse(receipt.reviewed_at) <= +app.now() && +app.now() - Date.parse(receipt.reviewed_at) <= 14 * 86400000, 'Independent review is stale or from the future');
  check(receipt.result.verdict === 'Accepted' && hash(receipt.result.decision) === hash(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'reviewed_at'))), 'Qualification differs from the independently accepted decision');
  const source = f.snapshots.sources.find(s => s.url === d.contact.url), p = contactProof ?? { ...d.contact, source: d.contact.url, checked_at: source?.fetched_at };
  check(email(d.contact.email) && p?.email === d.contact.email && p.source === d.contact.url && p.checked_at && Date.parse(p.checked_at) <= +app.now() && +app.now() - Date.parse(p.checked_at) <= 14 * 86400000, 'Fresh first-party contact proof is required');
  check(Date.parse(p.checked_at) <= Date.parse(source?.fetched_at) + 60000, 'A later review cannot refresh the retained contact inspection date');
  check(phone(p.phone).length >= 10 && source?.text.includes(p.phone) && !/search_snippet/.test(source.capture_method), 'Public business phone must appear exactly in the retained first-party contact source');
  check(/food|beverage|baker|café|cafe|cake|cater|restaurant|coffee|matcha|dessert|drink|pastr|juice|tea vendor/i.test(f.intake.discovery.category), 'The reviewed category is outside the food/beverage campaign');
  const opportunity = f.report.opportunities[d.opportunity_index], companyId = p.company_id ?? `company-${hash(d.contact.email.toLowerCase()).slice(0, 24)}`;
  const data = { company_id: companyId, name: f.job.business_name, category: `Food / beverage: ${f.intake.discovery.category}`, area: f.intake.discovery.area, controlled: false,
    idea: `${opportunity.observed_basis} Possible improvement: ${opportunity.proposed_solution}`,
    call_prep: researchCallPrep(f, d, receipt.reviewed_at),
    contact: { email: d.contact.email, phone: p.phone, verified: true, checked_at: p.checked_at, source: p.source },
    qualification: { verdict: d.decision, independent_review: 'Accepted', checked_at: `${f.job.as_of}T00:00:00.000Z`, reviewed_at: receipt.reviewed_at, report_sha256: f.report_sha256, review_sha256: hash(raw), evidence_ref: `research:${jobId}` } };
  const keys = contactKeys(data), state = await app.snapshot();
  const existing = Object.values(state.prospects).find(r => contactKeys(r).some(k => keys.includes(k)));
  if (existing) { await stageProspect(app, existing.id); return { imported: false, duplicate_of: existing.id, restricted: Boolean(existing.restriction) }; }
  const prospectId = `prospect-${hash(companyId).slice(0, 24)}`;
  await app.apply({ id: `import-${hash(jobId).slice(0, 24)}`, prospect_id: prospectId, type: 'prospect_imported', at: app.now().toISOString(), data }, { actor: 'research-import' });
  await stageProspect(app, prospectId);
  return { imported: true, prospect_id: prospectId, outreach: 'paused until release' };
}
async function stageProspect(app, prospectId) {
  await app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    if (!c.operations.allowlist.includes(prospectId)) { check(c.operations.allowlist.length < 500, 'Archive completed campaign records before importing more'); c.operations.allowlist.push(prospectId); await saveJson(path, c); }
    app.config = c;
  });
}
export async function queueMeeting(app, input) {
  const path = join(app.directory, 'lifecycle-config.json');
  return app.change(async state => {
    const c = await readJson(path); requireProductionRelease(c);
    const r = state.prospects[input.prospect_id];
    check(r && !r.restriction && ['Discovery', 'Information requested'].includes(r.stage), 'Review the owner conversation before scheduling');
    check(input.slot_agreed === true && email(input.attendee_email) && input.attendee_email === r.contact.email, 'Confirm the exact guest agreed to this invitation');
    check(input.title?.startsWith('EVZ Digital') && input.title.length <= 200 && typeof input.description === 'string' && input.description.length < 1500 && Number.isFinite(Date.parse(input.start)) && Number.isFinite(Date.parse(input.end)), 'Bound the exact meeting title, description and times');
    const key = `meeting-${hash({ prospect_id: r.id, start: input.start, end: input.end, attendee: input.attendee_email }).slice(0, 32)}`;
    const booking = { prospect_id: r.id, attendee_email: input.attendee_email, start: input.start, end: input.end, title: input.title, description: input.description,
      approved: true, approval_ref: `owner-console:${key}` };
    check(!c.operations.bookings[key] || hash(c.operations.bookings[key]) === hash(booking), 'An existing slot changed; preserve its reservation');
    c.operations.bookings[key] ??= booking;
    await saveJson(path, c); app.config = c;
    if (state.operations?.cycle) state.operations.cycle.completed_bookings = state.operations.cycle.completed_bookings.filter(id => id !== key);
    return { queued: true, booking_id: key, booked: false };
  });
}
export async function pauseStudio(app) {
  const c = await app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    c.transcript_ai.enabled = false; c.connector_writes_enabled = false; c.outreach_enabled = false; c.research_enabled = false;
    if (c.operations) c.operations.enabled = false;
    await saveJson(path, c); app.config = c; return c;
  });
  if (c.research?.source_directory) {
    try {
      const directory = await privateStateDirectory(c.research.source_directory), controlPath = join(directory, 'research-control.json');
      const control = await readJson(controlPath); check(control.schema_version === 1 && typeof control.enabled === 'boolean', 'Unknown research control');
      control.enabled = false; await saveJson(controlPath, control);
      check((await readJson(controlPath)).enabled === false, 'Research pause readback failed');
      await app.change(state => { state.exceptions = state.exceptions.filter(e => e.id !== 'research-pause'); });
    } catch {
      const reason = 'Connector work and transcript AI paused; configured research-controller pause is unverified. Check its private control before assuming its worker stopped.';
      await app.change(state => { state.exceptions = state.exceptions.filter(e => e.id !== 'research-pause'); state.exceptions.push({ id: 'research-pause', reason }); });
      throw Error(reason);
    }
  }
  return { paused: true };
}
export async function syncResearchImports(app) {
  const c = await readJson(join(app.directory, 'lifecycle-config.json'));
  if (c.mode !== 'production' || !c.research?.auto_import) return { status: 'Paused' };
  const controller = await readPrivateJson(join(c.research.source_directory, 'controller-state.json'));
  const jobs = Object.entries(controller.jobs).filter(([, r]) => r.status === 'Complete' && r.stage === 'done' && r.decision === 'Research-qualified');
  check(jobs.length <= 200, 'Research import scope exceeds the bounded controller campaign');
  let count = 0;
  for (const [jobId, record] of jobs) {
    const prior = (await app.snapshot()).research_imports?.[jobId];
    if (prior?.review_file === record.review_file) continue;
    if (count++ === 10) break;
    try {
      const result = await importResearch(app, c.research.source_directory, jobId);
      await app.change(state => {
        (state.research_imports ??= {})[jobId] = { status: 'Verified', review_file: record.review_file, ...result, checked_at: app.now().toISOString() };
        state.exceptions = state.exceptions.filter(e => e.id !== `import-${jobId}`);
      });
    } catch (error) {
      await app.change(state => {
        (state.research_imports ??= {})[jobId] = { status: 'Hold', review_file: record.review_file, checked_at: app.now().toISOString() };
        state.exceptions = state.exceptions.filter(e => e.id !== `import-${jobId}`);
        state.exceptions.push({ id: `import-${jobId}`, reason: `Research import ${jobId}: ${String(error.message).slice(0, 300)}. Verify the retained contact/evidence or create a fresh reviewed job.` });
      });
    }
  }
  return { status: 'Checked', examined: Math.min(count, 10) };
}
export function nativeMessage(record, round, c) {
  const subject = `${round === 1 ? 'An idea' : 'Following up on an idea'} for ${record.name}`.replace(/["\r\n]/g, ' ').slice(0, 119);
  const body = `Hi,\n\nI tried calling ${record.name} and wanted to share one idea: ${record.idea}\n\nWould an improvement like this fit what you want to do next? I build websites, practical business systems, AI tools and marketing projects, scoped around the owner's goal.\n\nEVZ Digital\n${c.sender.website}\n${c.sender.postal_address}\n\nThis is a business introduction and advertisement. Reply "stop" to opt out of all further marketing from EVZ Digital.`;
  check(body.length <= 4000 && !/{{|}}|[<>]/.test(subject + body), 'Tailored email exceeds the native field bounds or contains markup/template instructions');
  return { subject, body };
}

export class ProductionOperations extends ControlledOperations {
  writeReady(c) { if (c.outreach_enabled && c.connector_writes_enabled) { requireProductionRelease(c); return true; } return false; }
  composeMessage(record, round, c) { return nativeMessage(record, round, c); }
  async settings() {
    const c = await readJson(join(this.app.directory, 'lifecycle-config.json'));
    check(c.mode === 'production' && c.research_enabled === false, 'Use the separate research controller and production workspace');
    check(c.operations?.interval_minutes === 5 && Array.isArray(c.operations.allowlist) && c.operations.allowlist.length <= 500 && new Set(c.operations.allowlist).size === c.operations.allowlist.length, 'Bounded production scope required');
    check(!Object.keys(c.operations.emails ?? {}).length, 'Production email uses reviewed native automation, never test draft approvals');
    for (const [key, b] of Object.entries(c.operations.bookings ?? {})) {
      check(id(key) && c.operations.allowlist.includes(b.prospect_id) && b.approved === true && b.approval_ref?.length > 5 && email(b.attendee_email) && b.title?.startsWith('EVZ Digital') && b.title.length < 200 && b.description?.length < 1500, 'Production invitations require a bounded owner-approved booking');
      check((await this.app.snapshot()).prospects[b.prospect_id]?.contact.email === b.attendee_email, 'Meeting guest must match the reviewed conversation contact');
    }
    if (c.outreach_enabled || c.connector_writes_enabled) requireProductionRelease(c);
    return c;
  }
  validateScope(state, c) { check(c.operations.allowlist.every(id => state.prospects[id]?.controlled === false), 'Production cannot include fictional or missing records'); }
  *plan(state, c) {
    const o = state.operations, now = this.app.now(), request = (logical, operation, input) => ({ logical, operation, input });
    const retain = logical => { const r = o.requests[`${o.cycle.read_epoch}-${this.session}-${logical}`]; if (r) r.retain = true; };
    const ap = yield request('apollo-owner', 'apollo_profile', { include_credit_usage: false });
    check(!ap.failed && ap.id === c.apollo.user_id, 'Apollo owner unavailable or changed');
    const gp = yield request('gmail-owner', 'gmail_profile', {}), cp = yield request('calendar-owner', 'calendar_profile', {});
    check(!gp.failed && !cp.failed && gp.email === c.calendar.owner_email && cp.email === c.calendar.owner_email, 'Business Gmail/Calendar connection is not the configured owner');
    const writeReady = this.writeReady(c);
    o.bindings ??= {};
    for (const prospectId of c.operations.allowlist.filter(id => !o.cycle.completed_records.includes(id))) {
      const r = state.prospects[prospectId];
      try {
        if (!r.restriction && r.attempts.length && businessDaysBetween(r.attempts[0].at, now) >= 10) { r.cold_paused = true; if (['Ready to contact', 'Contacting'].includes(r.stage)) { r.stage = 'Hold'; r.next_check = 'Ten-business-day cold campaign ended; review before any new campaign.'; } }
        for (const e of Object.values(o.email).filter(e => e.prospect_id === prospectId && e.thread)) {
          const raw = yield request(`${prospectId}-${e.thread.thread_id}-thread`, 'thread', { thread_id: e.thread.thread_id, max_messages: 20 });
          check(!raw.failed, 'Reply monitoring unavailable; hold contact');
          for (const reply of controlledThread(raw, e.thread, now)) {
            const effectId = `reply-${hash(`${prospectId}:${reply.id}`).slice(0, 32)}`;
            o.effects[effectId] ??= { event: { id: effectId, prospect_id: prospectId, type: 'reply_received', at: reply.at, data: { source_id: reply.id, kind: reply.kind, thread_id: e.thread.thread_id } } };
            if (!o.replies.includes(reply.id)) { o.replies.push(reply.id); retain(`${prospectId}-${e.thread.thread_id}-thread`); }
            r.cold_paused = true;
          }
        }
        let binding = o.bindings[prospectId];
        if (!binding && writeReady && !r.restriction && (!r.cold_paused || r.stage === 'Callback')) {
          let found = yield request(`${prospectId}-find-contact`, 'contact', { q_keywords: r.contact.email, per_page: 10, page: 1 });
          check(!found.failed && Array.isArray(found.contacts) && !found.pagination?.next_page && (!found.pagination || found.pagination.total_pages <= 1), 'Contact discovery failed or is truncated');
          let person = found.contacts.find(p => p.email?.toLowerCase() === r.contact.email.toLowerCase());
          check(found.contacts.length <= 1, 'Ambiguous contact match requires owner resolution');
          check(!found.contacts.length || person, 'Contact search returned a different address; verify before creating or updating');
          const create = `${prospectId}-contact-create`;
          if (!person) {
            check(!o.requests[create], 'Uncertain contact creation requires exact contact readback; never recreate');
            const created = yield request(create, 'contact_create', { email: r.contact.email, first_name: 'Business', last_name: 'Owner', organization_name: r.name, corporate_phone: r.contact.phone });
            check(!created.failed, 'Contact creation failed; reconcile before continuing');
            found = yield request(`${prospectId}-created-contact`, 'contact', { q_keywords: r.contact.email, per_page: 10, page: 1 }); person = found.contacts?.[0];
          }
          check(person?.email === r.contact.email && person.owner_id === c.apollo.user_id && id(person.id) && id(person.account_id), 'Existing contact ownership/organization needs review');
          binding = o.bindings[prospectId] = { contact_id: person.id, account_id: person.account_id, email: person.email, phone: r.contact.phone };
        }
        if (binding) {
          if (r.cold_paused || r.restriction) yield* this.suppressNative(state, c, r, binding, request, retain);
          if (writeReady || r.restriction || r.cold_paused) yield* this.tasks(state, c, prospectId, binding, r, request, retain);
          yield* this.nativeEmails(state, c, r, binding, request, retain, writeReady);
        }
        delete o.holds[prospectId];
      } catch (error) { o.holds[prospectId] = error.message; }
      o.cycle.completed_records.push(prospectId);
    }
    if (writeReady) yield* this.bookings(state, c, request, retain);
  }
  *suppressNative(state, c, r, binding, request, retain) {
    const o = state.operations;
    for (const e of Object.values(o.email).filter(e => e.prospect_id === r.id && e.route)) {
      const found = yield request(`${r.id}-${e.route.round}-stop-contact`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
      const person = verifiedContact(found, binding, c.apollo.user_id, true), status = person.contact_campaign_statuses?.find(s => s.emailer_campaign_id === e.route.sequence_id);
      if (!status) continue;
      const seq = yield request(`${r.id}-${e.route.round}-stop-sequence`, 'sequence', { q_name: e.route.sequence_name, per_page: '10', page: '1' });
      check(!seq.failed && seq.emailer_campaigns?.length === 1 && seq.emailer_campaigns[0].id === e.route.sequence_id && seq.emailer_campaigns[0].user_id === c.apollo.user_id, 'Native suppression sequence ownership changed');
      if (status.status === 'finished') { (o.suppression ??= {})[r.id] = 'Verified'; r.suppression = 'Verified'; retain(`${r.id}-${e.route.round}-stop-contact`); continue; }
      check(['active', 'paused'].includes(status.status), 'Unknown native sequence state requires readback');
      const logical = `${r.id}-${e.route.round}-native-stop`;
      if (!o.requests[logical]) yield request(logical, 'stop', { contact_ids: [person.id], emailer_campaign_ids: [e.route.sequence_id], mode: 'stop', stop_reason: 'Verified reply or owner stop; cancel future EVZ outreach' });
      throw Error('Native suppression awaits finished readback; never repeat the stop');
    }
  }
  *nativeEmails(state, c, r, binding, request, retain, writeReady) {
    const o = state.operations, now = this.app.now();
    for (const a of Object.values(state.actions).filter(a => a.prospect_id === r.id && a.type === 'email' && a.status !== 'Cancelled')) {
      const e = o.email[a.id] ??= { prospect_id: r.id, status: 'Awaiting native release' }, intentKey = `${a.id}-intent`;
      if (e.thread) continue;
      if (!o.requests[intentKey]) {
        if (!writeReady || r.cold_paused || r.restriction) continue;
        const calls = r.attempts.filter(x => x.channel === 'call'), sent = r.attempts.filter(x => x.channel === 'email');
        check(r.calls[a.payload.call_id]?.outcome === 'no_answer' && calls.length <= 2 && sent.length < 2 && businessDaysBetween(calls[0].at, now) < 10, 'A saved no-answer within campaign bounds is required');
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
        check(r.controlled || !['Sat', 'Sun'].includes(parts.weekday) && Number(parts.hour) >= 9 && Number(parts.hour) < 17, 'Email release waits for weekday business hours');
        check(+now - Date.parse(r.qualification.checked_at) <= 30 * 86400000, 'Research is stale; hold email');
        const today = businessDate(now), reservedToday = Object.entries(o.email).filter(([key]) => o.requests[`${key}-intent`] && businessDate(o.requests[`${key}-intent`].prepared_at) === today).length;
        check(reservedToday < c.sender.daily_email_limit, 'Daily sending allowance reached, including pending sends and follow-ups');
        const route = c.native_email.rounds[sent.length]; check(route, 'No approved native route for this email round');
        const fields = yield request(`${a.id}-fields`, 'fields', { modality: 'contact', source: 'custom', limit: 100 });
        check(!fields.failed && fields.fields?.some(f => f.id === route.subject_field_id && f.modality === 'contact' && f.type === 'string') && fields.fields.some(f => f.id === route.body_field_id && f.modality === 'contact' && f.type === 'textarea'), 'Native personalized fields changed');
        const lists = yield request(`${a.id}-lists`, 'lists', {});
        check(!lists.failed && lists.labels?.some(l => l.id === route.list_id && l.name === route.list_name && l.modality === 'contacts'), 'Intent queue identity changed');
        const sequences = yield request(`${a.id}-sequence`, 'sequence', { q_name: route.sequence_name, per_page: '10', page: '1' });
        const sequence = sequences.emailer_campaigns?.[0];
        check(!sequences.failed && sequences.emailer_campaigns?.length === 1 && sequence.id === route.sequence_id && sequence.user_id === c.apollo.user_id && sequence.active === true && sequence.num_steps === 1 && sequence.emailer_steps?.length === 1 && sequence.emailer_steps[0].type === 'auto_email' && sequence.emailer_steps[0].wait_time === 0 && sequence.mark_finished_if_reply === true && sequence.mark_paused_if_ooo === true, 'Native route must remain one immediate automatic email with reply and automatic-reply stops');
        const found = yield request(`${a.id}-native-contact`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
        const person = verifiedContact(found, binding, c.apollo.user_id, true);
        check(!person.contact_campaign_statuses?.some(s => ['active', 'paused'].includes(s.status)), 'Existing native sequence could duplicate outreach');
        check(!person.label_ids?.includes(route.list_id), 'Intent was already published outside this action; reconcile without reenrollment');
        const boxes = yield request(`${a.id}-mailbox`, 'mailboxes', {});
        check(!boxes.failed && boxes.email_accounts?.some(b => b.id === c.sender.mailbox_id && b.email === c.sender.email && b.user_id === c.apollo.user_id && b.active === true), 'Business sender unavailable');
        e.content ??= this.composeMessage(r, route.round, c); e.route ??= route; e.content_sha256 ??= hash(e.content);
        check(hash(e.content) === e.content_sha256 && hash(e.route) === hash(route), 'Native message changed after reservation');
        const personalized = { [route.subject_field_id]: e.content.subject, [route.body_field_id]: e.content.body };
        if (!o.requests[`${a.id}-personalize`]) yield request(`${a.id}-personalize`, 'personalize', { id: binding.contact_id, typed_custom_fields: personalized });
        const read = yield request(`${a.id}-personalized-read`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
        const current = verifiedContact(read, binding, c.apollo.user_id, true);
        check(Object.entries(personalized).every(([key, value]) => current.typed_custom_fields?.[key] === value), 'Personalization awaits exact readback; never publish unverified content');
        yield request(intentKey, 'intent', { modality: 'contacts', entity_ids: [current.id], label_names: [route.list_name] });
        e.status = 'Released to native sequence';
      }
      const membershipRead = `${a.id}-intent-readback`, membership = yield request(membershipRead, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
      const member = verifiedContact(membership, binding, c.apollo.user_id, true);
      check(member.label_ids?.includes(e.route.list_id) && member.contact_campaign_statuses?.some(s => s.emailer_campaign_id === e.route.sequence_id), 'Native intent/enrollment awaits exact readback; never publish again');
      const before = o.requests[intentKey].prepared_at, query = `in:sent from:${c.sender.email} to:${binding.email} subject:"${e.content.subject}" after:${Math.floor(Date.parse(before) / 1000) - 1}`;
      const found = yield request(`${a.id}-native-sent`, 'gmail_search', { query, max_results: 10 });
      check(!found.failed && !found.next_page_token && found.message_ids?.length <= 1, 'Native send readback is unavailable or ambiguous');
      if (!found.message_ids.length) { e.status = 'Awaiting native send readback'; throw Error('Native email is queued or unsent; inspect Apollo, never publish another intent'); }
      const raw = yield request(`${a.id}-native-thread`, 'thread', { message_id: found.message_ids[0], max_messages: 20 });
      check(!raw.failed, 'Native sent-thread readback failed');
      const bound = { thread_id: raw.id, original_id: found.message_ids[0], from: c.sender.email, to: binding.email, subject: e.content.subject, sent_after: new Date(Date.parse(before) - 1000).toISOString(), sent_before: new Date(Date.parse(before) + 86400000).toISOString() };
      controlledThread(raw, bound, now); e.thread = bound; e.message_id = bound.original_id; e.status = 'Sent — Gmail verified'; retain(`${a.id}-native-thread`);
      if (o.requests[intentKey].status !== 'Done') { o.requests[intentKey].original_status = o.requests[intentKey].status; o.requests[intentKey].status = 'Done'; o.requests[intentKey].reconciliation = { contact_read: membershipRead, sent_message: bound.original_id, verified_at: now.toISOString() }; }
      const effectId = `email-${hash(a.id).slice(0, 32)}`;
      const sentAt = new Date(Number(raw.messages.find(m => m.id === bound.original_id).internal_date)).toISOString();
      o.effects[effectId] ??= { event: { id: effectId, prospect_id: r.id, type: 'email_delivered', at: sentAt, data: { action_id: a.id, message_id: e.message_id, simulated: r.controlled } } };
    }
  }
}
export class NativeProofOperations extends ProductionOperations {
  async settings() {
    const c = await readJson(join(this.app.directory, 'lifecycle-config.json')), o = c.operations, p = o?.native_proof, m = p?.message;
    check(c.mode === 'controlled' && !c.research_enabled && !c.outreach_enabled && !c.connector_writes_enabled, 'Native proof cannot enable research or production contact');
    check(c.readiness.owner_design_approved && o?.interval_minutes === 5 && o.allowlist?.length === 1 && !Object.keys(o.emails ?? {}).length && !Object.keys(o.bookings ?? {}).length, 'One isolated fictional native proof required');
    check(p && typeof p.enabled === 'boolean' && typeof m?.approved === 'boolean' && m.from === c.calendar.owner_email && m.from === c.sender?.email && email(m.to) && m.from !== m.to && o.recipients?.includes(m.to) && o.recipients.includes(m.from) && o.recipients.length <= 2, 'Exact owner-controlled test inboxes required');
    check(m.subject?.startsWith('[STUDIO TEST]') && m.subject.length < 120 && !/["\r\n]/.test(m.subject) && m.body_text?.startsWith('CONTROLLED TEST') && m.body_text.length < 4000 && !/{{|}}|[<>]/.test(m.body_text), 'Literal controlled email content required');
    check(!m.approved || m.approval_ref?.length > 5, 'Concrete owner approval must bind the single test email');
    const binding = c.apollo?.bindings?.[o.allowlist[0]], route = c.native_email?.rounds?.[0];
    check(id(c.apollo?.user_id) && id(binding?.contact_id) && id(binding.account_id) && binding.email === m.to && binding.require_no_phone === true && binding.controlled_name?.toLowerCase().includes('studio test'), 'Dedicated owned no-phone fictional recipient required');
    check(c.calendar.calendar_id === 'primary' && c.sender.mailbox_id === m.mailbox_id && id(m.mailbox_id) && c.sender.daily_email_limit === 1, 'One controlled mailbox/send allowance required');
    check(c.native_email.enabled && c.native_email.rounds.length === 1 && route.round === 1 && route.list_name?.startsWith('STUDIO TEST ') && route.sequence_name?.startsWith('STUDIO TEST ') && [route.list_id, route.sequence_id, route.subject_field_id, route.body_field_id].every(id), 'Dedicated test list and one-email sequence required');
    return c;
  }
  validateScope(state, c) { check(c.operations.allowlist.every(id => state.prospects[id]?.controlled === true && state.prospects[id].contact.email.endsWith('@example.invalid') && !state.prospects[id].contact.phone), 'Native proof accepts one fictional lifecycle record only'); }
  writeReady(c) { return c.operations.native_proof.enabled && c.operations.native_proof.message.approved; }
  composeMessage(record, round, c) { const m = c.operations.native_proof.message; return { subject: m.subject, body: m.body_text }; }
  *plan(state, c) {
    const id = c.operations.allowlist[0], binding = c.apollo.bindings[id];
    for (const e of Object.values(state.operations.email)) if (e.content) check(hash(e.content) === hash(this.composeMessage(null, 1, c)) && hash(e.route) === hash(c.native_email.rounds[0]), 'Approved native proof message or route changed after reservation');
    state.operations.bindings ??= {};
    check(!state.operations.bindings[id] || hash(state.operations.bindings[id]) === hash(binding), 'Native test contact changed; reconcile the existing proof');
    state.operations.bindings[id] ??= binding;
    yield* super.plan(state, c);
  }
}
export function operationsFor(app, session) { return app.config.mode === 'production' ? new ProductionOperations(app, session) : app.config.operations?.native_proof ? new NativeProofOperations(app, session) : new ControlledOperations(app, session); }
