import { GoogleAuth } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { readJson } from './engine.mjs';
import { validateJob } from './sources.mjs';

export class GoogleQueue {
  constructor({ spreadsheetId, keyFile, request }) {
    if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId ?? '')) throw Error('Invalid spreadsheet ID');
    this.base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    this.keyFile = keyFile;
    this.requestOverride = request;
  }
  async request(method, suffix, data) {
    try {
      if (!this.client && !this.requestOverride) {
        if ((await readJson(this.keyFile)).type !== 'service_account') throw Error('A dedicated service-account credential is required');
        this.client = await new GoogleAuth({ keyFile: this.keyFile, scopes: ['https://www.googleapis.com/auth/spreadsheets'] }).getClient();
      }
      const result = await (this.requestOverride ?? this.client.request.bind(this.client))({ method, url: this.base + suffix, data, timeout: 20_000, retry: false });
      return result.data;
    } catch (error) {
      // Auth-library errors can contain request credentials; never propagate their full payload.
      throw Error(`Google request failed (${error.response?.status ?? error.code ?? 'configuration/network'}); inspect access and API setup without printing credentials`);
    }
  }
  async values(range, render = 'FORMATTED_VALUE') { return (await this.request('GET', `/values/${encodeURIComponent(range)}?valueRenderOption=${render}`)).values ?? []; }
  async write(range, values) { return this.request('PUT', `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { range, values }); }
  async writeVerified(range, output) {
    let reconciled = false;
    try { await this.write(range, [output]); } catch { reconciled = true; }
    let receipt;
    try { receipt = (await this.values(range))[0] ?? []; } catch { throw Object.assign(Error('Uncertain Google write: reconcile this job before retrying'), { code: 'RECONCILIATION_REQUIRED' }); }
    if (output.some((v, i) => String(receipt[i] ?? '') !== String(v))) throw Object.assign(Error('Uncertain Google write: reconcile this job before retrying'), { code: 'RECONCILIATION_REQUIRED' });
    return { reconciled };
  }
  async pendingIntake(jobId) {
    if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid intake ID');
    const matches = (await this.values("'Discovery intake'!A2:K1000")).filter(r => r[0] === jobId);
    if (matches.length > 1) throw Error('Duplicate discovery intake IDs');
    if (!matches.length || matches[0][6] !== 'Ready') return null;
    const row = matches[0];
    if (row[8] === 'Queued') return null;
    if (row[8]) throw Error('Intake already has an unresolved handoff');
    if (typeof row[7] !== 'string' || row[7].length > 48_000) throw Error('Discovery packet exceeds bounded Sheet cell');
    let packet;
    try { packet = JSON.parse(row[7]); } catch { throw Error('Discovery packet is not valid JSON'); }
    if (packet.job?.id !== row[0] || packet.job?.business_name !== row[1] || packet.discovery?.category !== row[2] || packet.discovery?.area !== row[3] || packet.discovery?.channel !== row[4] || packet.worker !== row[5]) throw Error('Discovery packet differs from visible intake fields');
    return { packet, inputs: row.slice(0, 8) };
  }
  async acknowledgeIntake(jobId, inputs) {
    const rows = await this.values("'Discovery intake'!A2:K1000");
    const matches = rows.map((r, i) => ({ r, row: i + 2 })).filter(v => v.r[0] === jobId);
    if (matches.length !== 1 || inputs.some((v, i) => matches[0].r[i] !== v)) throw Error('Intake changed during handoff; reconcile before execution');
    return this.writeVerified(`'Discovery intake'!I${matches[0].row}:K${matches[0].row}`, ['Queued', new Date().toISOString(), jobId]);
  }
  async publishIntakeReview(jobId, decision, nextAction) {
    const rows = await this.values("'Discovery intake'!A2:M1000");
    const matches = rows.map((r, i) => ({ r, row: i + 2 })).filter(v => v.r[0] === jobId);
    if (!matches.length) return; // Operator-file intake has no inbox row.
    if (matches.length !== 1 || matches[0].r[8] !== 'Queued' || matches[0].r[10] !== jobId) throw Error('Intake review requires its verified handoff');
    const output = [decision, nextAction], current = matches[0].r.slice(11, 13);
    if (output.every((v, i) => current[i] === v)) return;
    if (current.some(v => v)) throw Error('Existing intake review changed; reconcile before replacing it');
    await this.writeVerified(`'Discovery intake'!L${matches[0].row}:M${matches[0].row}`, output);
  }
  async intakeJob(job, worker) {
    validateJob(job);
    if (!['cursor', 'claude', 'codex'].includes(worker)) throw Error('Unknown requested research worker');
    const rows = await this.values("'Research proof'!A2:P1000");
    const existing = rows.filter(r => r[0] === job.id);
    const inputs = [job.id, job.business_name, job.website, job.seed_urls.join('\n'), worker, 'Ready', job.purpose];
    if (existing.length) {
      if (existing.length !== 1 || inputs.some((v, i) => String(existing[0][i] ?? '') !== v)) throw Error('Queue discovery inputs changed or duplicated; reconcile using a new job ID');
      return { queue: 'already present' };
    }
    if (rows.some(r => r[6] === job.purpose && (r[1]?.trim().toLowerCase() === job.business_name.trim().toLowerCase() || (r[3] ?? '').split('\n').some(url => job.seed_urls.includes(url))))) throw Error('Possible duplicate discovered business; reconcile before adding another job');
    const last = rows.findLastIndex(r => r.some(v => v !== ''));
    const row = last + 3;
    if (row > 1000) throw Error('Controlled research queue is full');
    const range = `'Research proof'!A${row}:P${row}`;
    if ((await this.values(range, 'FORMULA')).some(r => r.some(v => v !== ''))) throw Error('Selected queue row is no longer empty');
    const receipt = await this.writeVerified(range, [...inputs, '', '', '', '', '', '', '', '', 'Prospect research. Qualification pending; no sending.']);
    return { queue: 'verified', row, ...receipt };
  }
  async addProspect(output) {
    const headers = ['Prospect ID', 'Business', 'Route', 'Website / source', 'Area / service', 'Observed opportunity', 'Contact / channel', 'Stage', 'Last contact', 'Next action', 'Next action date', 'Do not contact', 'Draft / proposal link', 'Quoted amount (USD)', 'Cash received (USD)', 'Notes'];
    const rows = await this.values("'Prospects'!A1:P101", 'FORMULA');
    if (headers.some((h, i) => rows[0]?.[i] !== h) || output.length !== 16 || output[2] !== 'Business owner' || output[7] !== 'Research' || [8, 10, 12, 13, 14].some(i => output[i] !== '') || output[11] !== 'No') throw Error('Prospect schema changed or attempted a commercial state mutation');
    const matches = rows.slice(1).filter(r => r[0] === output[0]);
    if (matches.length) {
      if (matches.length !== 1 || output.some((v, i) => String(matches[0][i] ?? '') !== String(v))) throw Error('Existing prospect changed; refusing to overwrite user or commercial data');
      return { record: 'already present' };
    }
    if (rows.slice(1).some(r => r[1]?.trim().toLowerCase() === output[1].trim().toLowerCase() || r[3] === output[3])) throw Error('Possible duplicate prospect; reconcile before promotion');
    const row = rows.findLastIndex(r => r.some(v => v !== '')) + 2;
    if (row > 101) throw Error('Prospect table capacity reached; expand its native table before adding records');
    const range = `'Prospects'!A${row}:P${row}`;
    if ((await this.values(range, 'FORMULA')).some(r => r.some(v => v !== ''))) throw Error('Selected prospect row is no longer empty');
    return { record: 'verified', row, ...await this.writeVerified(range, output) };
  }
  async probe() {
    const metadata = await this.request('GET', '?fields=spreadsheetId,sheets(properties(sheetId,title))');
    if (!metadata.sheets.some(s => s.properties.title === 'Research proof')) throw Error('Controlled proof tab is missing');
    const receipt = `controlled-proof:${randomUUID()}`;
    await this.write("'Research proof'!P7", [[receipt]]);
    if ((await this.values("'Research proof'!P7"))[0]?.[0] !== receipt) throw Error('Google write/read receipt did not match');
    return { read: true, write: true, readback: true, receipt };
  }
  async matches(jobId) {
    if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid job ID');
    // shortcut: controlled proof has one writer and no row sorting/deletion during a run; add robust row addressing before unattended rollout.
    return (await this.values("'Research proof'!A2:P1000")).map((values, i) => ({ values, row: i + 2 })).filter(item => item.values[0] === jobId);
  }
  async row(jobId) {
    const matches = await this.matches(jobId);
    if (matches.length !== 1) throw Error('Expected exactly one queue row for this job');
    return matches[0];
  }
  async pendingJob(jobId, asOf, qualityResearch = false) {
    const matches = await this.matches(jobId);
    if (matches.length > 1) throw Error('Duplicate queue IDs; reconcile before dispatch');
    if (!matches.length) return null;
    const { values } = matches[0];
    if (values[5] !== 'Ready' || values[7] === 'Complete') return null;
    if (values[9] || (values[7] && values[7] !== 'Ready')) throw Error('Existing queue reservation/status requires manual reconciliation');
    const worker = values[4];
    if (!['cursor', 'claude', 'codex'].includes(worker)) throw Error('Unknown requested research worker');
    const job = { id: jobId, business_name: values[1], website: values[2] ?? '', seed_urls: (values[3] ?? '').split(/\r?\n/).filter(Boolean), purpose: values[6], as_of: asOf, ...(qualityResearch ? { research_version: 2 } : {}) };
    validateJob(job);
    if (typeof job.purpose !== 'string' || !job.purpose.trim() || job.purpose.length > 500) throw Error('A bounded job purpose is required');
    return { job, worker };
  }
  async checkInputs(job, requestedWorker) {
    const { values } = await this.row(job.id);
    if (values[5] !== 'Ready') throw Error('Queue request is paused or not ready');
    if (values[1] !== job.business_name || (values[2] ?? '') !== job.website || JSON.stringify((values[3] ?? '').split(/\r?\n/).filter(Boolean)) !== JSON.stringify(job.seed_urls)) throw Error('Queue inputs differ from saved job; use a new job ID for changed scope');
    if (requestedWorker && (values[4] !== requestedWorker || values[6] !== job.purpose)) throw Error('Queue worker/purpose changed before reservation');
    if (requestedWorker && (values[9] || (values[7] && values[7] !== 'Ready'))) throw Error('Existing queue reservation/status requires manual reconciliation');
  }
  async checkActive(job, attemptId, requestedWorker) {
    const { values } = await this.row(job.id);
    if (values[5] === 'Pause') throw Object.assign(Error('Queue job paused by owner'), { code: 'QUEUE_PAUSED' });
    if (values[5] !== 'Ready' || values[7] !== 'Running' || values[9] !== attemptId) throw Object.assign(Error('Queue control/reservation changed; execution blocked'), { code: 'QUEUE_BLOCKED' });
    if (values[1] !== job.business_name || (values[2] ?? '') !== job.website || JSON.stringify((values[3] ?? '').split(/\r?\n/).filter(Boolean)) !== JSON.stringify(job.seed_urls) || (requestedWorker && (values[4] !== requestedWorker || values[6] !== job.purpose))) throw Object.assign(Error('Queue scope changed; execution blocked'), { code: 'QUEUE_BLOCKED' });
  }
  async checkRecovery(job, previousAttempt, requestedWorker) {
    await this.checkInputs(job);
    const { values } = await this.row(job.id);
    if (values[7] !== 'Quota' || values[9] !== previousAttempt || (requestedWorker && (values[4] !== requestedWorker || values[6] !== job.purpose))) throw Error('Quota handoff requires the verified previous reservation and unchanged scope');
  }
  async publish(jobId, state, checkpoint, report, review, prospecting = false) {
    const { row, values } = await this.row(jobId);
    if (values[9] && values[9] !== state.attempt_id && !state.attempts.some(a => a.id === values[9] && a.ended_at)) throw Error('Queue belongs to a different attempt; refusing a stale update');
    const encoded = report ? JSON.stringify(report) : '';
    if (encoded.length > 48_000) throw Error('Report exceeds bounded proof cell size');
    const quality = review?.attempt_id === state.attempt_id ? `${review.verdict}: ${review.notes.join(' ')}` : 'Source-quality review pending.';
    const range = `'Research proof'!H${row}:P${row}`;
    const prefix = prospecting ? 'Prospect research. No sending authorized.' : 'CONTROLLED PROOF. Excluded from C2 and outreach.';
    const output = [state.status, state.worker ?? '', state.attempt_id ?? '', checkpoint ? 'Evidence saved' : '', checkpoint?.sources.length ?? 0, report?.recommendation ?? '', encoded, new Date().toISOString(), `${prefix} ${quality}`];
    return this.writeVerified(range, output);
  }
}
