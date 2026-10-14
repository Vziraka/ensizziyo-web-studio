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
  async values(range) { return (await this.request('GET', `/values/${encodeURIComponent(range)}`)).values ?? []; }
  async write(range, values) { return this.request('PUT', `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, { range, values }); }
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
  async publish(jobId, state, checkpoint, report, review) {
    const { row, values } = await this.row(jobId);
    if (values[9] && values[9] !== state.attempt_id && !state.attempts.some(a => a.id === values[9] && a.ended_at)) throw Error('Queue belongs to a different attempt; refusing a stale update');
    const encoded = report ? JSON.stringify(report) : '';
    if (encoded.length > 48_000) throw Error('Report exceeds bounded proof cell size');
    const quality = review?.attempt_id === state.attempt_id ? `${review.verdict}: ${review.notes.join(' ')}` : 'Source-quality review pending.';
    const range = `'Research proof'!H${row}:P${row}`;
    const output = [state.status, state.worker ?? '', state.attempt_id ?? '', checkpoint ? 'Evidence saved' : '', checkpoint?.sources.length ?? 0, report?.recommendation ?? '', encoded, new Date().toISOString(), `CONTROLLED PROOF. Excluded from C2 and outreach. ${quality}`];
    let reconciled = false;
    try { await this.write(range, [output]); } catch { reconciled = true; }
    let receipt;
    try { receipt = (await this.values(range))[0] ?? []; } catch { throw Object.assign(Error('Uncertain Google write: reconcile this job before retrying'), { code: 'RECONCILIATION_REQUIRED' }); }
    if (output.some((v, i) => String(receipt[i] ?? '') !== String(v))) throw Object.assign(Error('Uncertain Google write: reconcile this job before retrying'), { code: 'RECONCILIATION_REQUIRED' });
    return { reconciled };
  }
}
