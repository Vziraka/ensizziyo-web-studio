import { check } from './lifecycle.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const usd = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function renderProposal(record) {
  const q = record.quote; check(q && record.discovery, 'An owner-approved quote is required');
  const sections = [['Goal', record.discovery.goal], ['Scope', q.scope], ['Deliverables', q.deliverables], ['Exclusions and external costs', q.exclusions],
    ['Timeline and dependencies', q.timeline], ['Acceptance criteria', q.acceptance], ['Included revisions', `${q.revision_rounds} agreed revision round(s). Extra scope follows the written change process.`],
    ['Ownership and licenses', q.ownership], ['Support boundaries', q.support_terms], ['Changes', q.change_terms], ['Cancellation', q.cancellation_terms]];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EVZ Digital · ${escape(record.name)} proposal</title><link rel="stylesheet" href="/app.css"></head><body><main class="preview-wrap">
    ${record.controlled ? '<p class="test-banner"><strong>CONTROLLED TEST</strong> · Fictional quote, simulated approvals and no commercial commitment.</p>' : ''}
    <article class="preview-card"><p class="eyebrow">EVZ Digital · Project proposal</p><h1>${escape(record.name)}</h1><p>Prepared for ${escape(record.discovery.decision_maker)} · ${escape(q.approved_at.slice(0, 10))}</p>
    <div class="notice"><strong>Fixed project price: ${usd(q.price_cents)}</strong><br>Initial payment: ${usd(q.initial_payment_cents)} · Remaining balance: ${usd(q.price_cents - q.initial_payment_cents)}</div>
    ${sections.map(([label, value]) => `<hr class="divider"><h2>${escape(label)}</h2><p>${escape(value).replaceAll('\n', '<br>')}</p>`).join('')}
    <hr class="divider"><p class="muted">Signed acceptance, invoice and settled payment evidence are recorded separately. A positive reply does not establish an agreement or payment.</p><a href="/">Return to the private workspace</a></article></main></body></html>`;
}

export function validateBookingSlot(slot, busy, config, checkedAt, now = new Date()) {
  check(slot?.timezone === 'America/New_York' && Number.isFinite(Date.parse(slot.start)) && Number.isFinite(Date.parse(slot.end)) && /Z$|[+-]\d\d:\d\d$/.test(slot.start) && /Z$|[+-]\d\d:\d\d$/.test(slot.end), 'Booking requires explicit dated times and the agreed timezone');
  check(Number.isFinite(Date.parse(checkedAt)) && +now - Date.parse(checkedAt) >= 0 && +now - Date.parse(checkedAt) <= 120_000, 'Recheck calendar availability immediately before booking');
  const start = Date.parse(slot.start), end = Date.parse(slot.end), buffer = config.buffer_minutes * 60_000;
  const local = new Intl.DateTimeFormat('en-US', { timeZone: slot.timezone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  const parts = Object.fromEntries(local.formatToParts(new Date(start)).map(p => [p.type, p.value]));
  const endParts = Object.fromEntries(local.formatToParts(new Date(end)).map(p => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  check(start > +now && end - start === config.duration_minutes * 60_000 && config.weekdays.includes(weekday) &&
    parts.weekday === endParts.weekday && Number(parts.hour) >= config.start_hour && Number(parts.hour) < config.end_hour && Number(endParts.hour) * 60 + Number(endParts.minute) <= config.end_hour * 60, 'Slot is outside the configured duration/hours');
  check(Array.isArray(busy) && busy.every(b => Number.isFinite(Date.parse(b.start)) && Number.isFinite(Date.parse(b.end))) &&
    !busy.some(b => Date.parse(b.start) < end + buffer && Date.parse(b.end) > start - buffer), 'Slot overlaps a busy window or buffer');
  return slot;
}
export function checkCalendarReceipt(packet, config, now = new Date()) {
  check(!packet.profile?.isError && !packet.availability?.isError && packet.profile?.structuredContent?.email === config.owner_email, 'Verify the intended calendar owner');
  const calendars = packet.availability.structuredContent?.calendars;
  check(calendars?.length === 1 && calendars[0].calendar_id === config.calendar_id && !calendars[0].errors, 'Availability failed or belongs to another calendar');
  const input = packet.input, buffer = config.buffer_minutes * 60_000;
  check(input?.calendar_ids?.length === 1 && input.calendar_ids[0] === config.calendar_id &&
    Date.parse(input.time_min) <= Date.parse(packet.slot.start) - buffer && Date.parse(input.time_max) >= Date.parse(packet.slot.end) + buffer, 'Availability must cover the entire slot and buffer');
  validateBookingSlot(packet.slot, calendars[0].busy, config, packet.checked_at, now);
  return { available: true, slot: packet.slot, checked_at: packet.checked_at, invitation: 'not created' };
}
