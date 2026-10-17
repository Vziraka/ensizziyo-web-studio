import { join } from 'node:path';
import { readJson } from './engine.mjs';
import { GoogleQueue } from './google.mjs';
import { check, hash } from './lifecycle.mjs';

const normalize = (rows, count) => Array.from({ length: count }, (_, i) => Array.from({ length: 8 }, (_, j) => String(rows[i]?.[j] ?? '')));
export async function publishLifecycle(app, suppliedQueue) {
  const config = await readJson(join(app.directory, 'lifecycle-config.json')), g = config.google;
  const controlled = config.mode === 'controlled';
  check(g?.sheet_title === (controlled ? 'Lifecycle proof' : 'Studio operations') && Number.isInteger(g.sheet_id), 'Only the explicitly bound isolated operations tab is writable');
  const headers = ['Prospect ID', controlled ? 'Fictional business' : 'Business', 'Current step', 'Next owner action', 'Restriction', controlled ? 'Test quote USD' : 'Quote USD', controlled ? 'Test paid USD' : 'Verified paid USD', 'Saved UTC'];
  const queue = suppliedQueue ?? new GoogleQueue({ spreadsheetId: g.spreadsheet_id, keyFile: g.key_file, minRequestIntervalMs: 350 });
  const metadata = await queue.request('GET', '?fields=spreadsheetId,sheets(properties)');
  check(metadata.spreadsheetId === g.spreadsheet_id && metadata.sheets.some(s => s.properties.sheetId === g.sheet_id && s.properties.title === g.sheet_title), 'Sheet ownership/name changed');
  let pending, fresh = false;
  await app.change(async state => {
    const records = Object.values(state.prospects); check(records.length <= (controlled ? 90 : 500) && records.every(r => r.controlled === controlled), 'Projection size/mode scope exceeded');
    const rows = [headers, ...records.map(r => [r.id, r.name, r.stage, [r.next_check ?? (r.stage === 'Connected review' ? 'Review transcript proposal' : r.stage === 'Support' ? 'Resolve support / close project' : r.stage === 'Contacting' ? 'Owner call/email follow-up' : r.stage),
      ...Object.entries(state.operations?.email ?? {}).filter(([id]) => state.actions[id]?.prospect_id === r.id).map(([, e]) => `Email: ${e.status}`),
      ...(r.meeting ? [`${controlled ? 'Private test booking' : 'Meeting'}: ${r.meeting.start}`] : [])].join(' · '),
      r.restriction ?? 'None', r.quote ? String(r.quote.price_cents / 100) : '', r.payments.length ? String(r.payments.reduce((n, p) => n + p.amount_cents, 0) / 100) : '', r.updated_at])];
    const range = `'${g.sheet_title}'!A1:H${rows.length}`;
    if (state.sheet_projection?.status === 'Pending') { pending = state.sheet_projection; return; }
    const current = normalize(await queue.values(range, 'UNFORMATTED_VALUE'), rows.length);
    const expected = normalize(rows, rows.length);
    if (hash(current) === hash(expected)) { state.sheet_projection = { status: 'Verified', range, rows: expected, sha256: hash(expected), verified_at: app.now().toISOString() }; return; }
    const prior = state.sheet_projection;
    check(current.flat().every(x => !x) || prior && hash(current.slice(0, prior.rows.length)) === prior.sha256 && current.slice(prior.rows.length).flat().every(x => !x), 'Projection differs from the last verified write; preserve owner edits and reconcile');
    pending = state.sheet_projection = { status: 'Pending', range, rows: expected, sha256: hash(expected), reserved_at: app.now().toISOString() };
    // Persist reservation before any external write; a restarted call reads back instead of replaying.
    fresh = true;
  });
  if (!pending) return { verified: true, unchanged: true };
  if (fresh) { try { await queue.request('PUT', `/values/${encodeURIComponent(pending.range)}?valueInputOption=RAW`, { range: pending.range, values: pending.rows }); } catch { /* Exact readback reconciles a lost response. */ } }
  const actual = normalize(await queue.values(pending.range, 'UNFORMATTED_VALUE'), pending.rows.length);
  check(hash(actual) === pending.sha256, 'Uncertain Sheet write; read back the saved projection, never overwrite or resend');
  await app.change(state => { check(state.sheet_projection.sha256 === pending.sha256, 'Projection reservation changed'); state.sheet_projection.status = 'Verified'; state.sheet_projection.verified_at = app.now().toISOString(); });
  return { verified: true, range: pending.range, sha256: pending.sha256, reconciled: !fresh };
}
