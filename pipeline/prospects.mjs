import { lstat, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { acquireLock, privateStateDirectory, readJson, saveJson } from './engine.mjs';
import { validateJob, validateSnapshots, sourceContentHash, collectPublicSources } from './sources.mjs';
import { validateEvidence, primarySupport } from './schemas.mjs';

export const prospectPurpose = 'Prospect discovery; review required; no outreach.';
export const digest = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = (value, name, max = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw Error(`A bounded ${name} is required`);
  return value;
};

export async function readPrivateJson(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 400_000) throw Error('Input must be a bounded private regular file');
  path = await privateStateDirectory(path);
  const bytes = await readFile(path, 'utf8');
  if (Buffer.byteLength(bytes) > 400_000) throw Error('Input exceeds size bound');
  try { return JSON.parse(bytes); } catch { throw Error('Private input is not valid JSON'); }
}

export function validateIntakeRecord(record, job, snapshots) {
  if (record?.schema_version !== 1 || !same(record.job, job) || ![2, 3].includes(job.research_version) || job.purpose !== prospectPurpose || !['cursor', 'claude', 'codex'].includes(record.worker)) throw Error('Invalid discovery intake identity');
  if (job.research_version === 3 && (!/^[a-f0-9]{64}$/.test(record.packet_sha256 ?? '') || (record.recheck_of !== undefined && (!/^[a-z0-9-]{1,60}$/.test(record.recheck_of) || record.recheck_of === job.id)))) throw Error('Detailed intake needs a packet hash and a valid distinct recheck ID when supplied');
  validateJob(job);
  const d = record.discovery;
  if (!['Google Search', 'Google Maps', 'Instagram', 'Facebook', 'Local directory', 'Referral'].includes(d?.channel)) throw Error('Unknown discovery channel');
  for (const key of ['query', 'category', 'area']) text(d[key], `discovery ${key}`, 300);
  validateJob({ ...job, seed_urls: [d.source_url] });
  const check = d.website_check;
  if (!['Verified site', 'No verified site found'].includes(check?.status) || Boolean(job.website) !== (check.status === 'Verified site')) throw Error('Website check must distinguish verified presence from unconfirmed absence');
  if (!Array.isArray(check.searches) || check.searches.length < 1 || check.searches.length > 5) throw Error('Record the bounded website searches/checks');
  check.searches.forEach(s => text(s, 'website search', 300)); text(check.note, 'website-check note');
  if (!/^[a-f0-9]{64}$/.test(record.sources_sha256)) throw Error('Intake evidence hash is required');
  if (snapshots && digest(JSON.stringify(validateSnapshots(snapshots, job))) !== record.sources_sha256) throw Error('Intake evidence changed; use a new job ID');
  return record;
}

async function writeOnce(path, value) {
  try { await writeFile(path, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!same(await readJson(path), value)) throw Error('Saved discovery inputs changed; use a new job ID');
  }
}

export async function intakeCandidate({ directory, queue, packet, now = () => new Date(), collectSources = collectPublicSources, signal, beforePublish }) {
  if (!queue) throw Error('Discovery intake requires the dedicated Google connection');
  if (packet?.schema_version !== 1) throw Error('Unknown discovery packet version');
  const p = packet.job;
  const job = { id: p?.id, business_name: p?.business_name, website: p?.website, seed_urls: p?.seed_urls, purpose: prospectPurpose, as_of: p?.as_of, research_version: p?.research_version };
  validateJob(job);
  if (job.as_of !== now().toISOString().slice(0, 10)) throw Error('Discovery date is stale; prepare a new dated job');
  const captures = packet.captures;
  text(captures?.reviewed_by, 'capture reviewer', 200);
  if (!Array.isArray(captures.sources)) throw Error('Reviewed captures are required');
  const sources = captures.sources.map(s => {
    text(s.text, 'captured text', 20_000);
    const hash = sourceContentHash(s);
    if (s.content_sha256 && s.content_sha256 !== hash) throw Error('Provided source checksum does not match captured text/context');
    return { ...s, content_sha256: hash };
  });
  const httpUrls = captures.http_urls ?? [];
  const host = url => new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  if (!Array.isArray(httpUrls) || new Set(httpUrls).size !== httpUrls.length || httpUrls.length > 4 || httpUrls.some(url => job.research_version !== 3 || !job.website || !job.seed_urls.includes(url) || host(url) !== host(job.website) || sources.some(s => s.url === url))) throw Error('HTTP collection requires distinct approved website-host URLs without overlapping supplied captures');
  if (sources.length) validateSnapshots({ sources, failures: captures.failures ?? [] }, job);
  directory = await privateStateDirectory(directory);
  await mkdir(directory, { recursive: true });
  const release = await acquireLock(directory);
  try {
    const target = join(directory, job.id);
    await mkdir(target, { recursive: true });
    if ((await lstat(target)).isSymbolicLink()) throw Error('Discovery job directory cannot be a symlink');
    let snapshots, record;
    if (job.research_version === 3) {
      try {
        record = await readPrivateJson(join(target, 'intake.json'));
        snapshots = await readPrivateJson(join(target, 'sources.json'));
        validateIntakeRecord(record, job, snapshots);
        if (record.packet_sha256 !== digest(JSON.stringify(packet))) throw Error('Saved detailed packet changed; use a new job ID');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (record) throw Error('Partial detailed intake requires reconciliation before retry');
        try { await lstat(join(target, 'sources.json')); throw Error('Partial detailed intake requires reconciliation before retry'); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; }
      }
    }
    if (!snapshots) {
      signal?.throwIfAborted();
      const fetched = httpUrls.length ? await collectSources({ ...job, seed_urls: httpUrls }, { now, signal }) : { sources: [], failures: [] };
      snapshots = validateSnapshots({ reviewed_by: captures.reviewed_by, sources: [...sources, ...fetched.sources], failures: [...(captures.failures ?? []), ...fetched.failures] }, job);
      record = validateIntakeRecord({ schema_version: 1, job, worker: packet.worker, discovery: packet.discovery, sources_sha256: digest(JSON.stringify(snapshots)), ...(job.research_version === 3 ? { packet_sha256: digest(JSON.stringify(packet)), ...(packet.recheck_of !== undefined ? { recheck_of: packet.recheck_of } : {}) } : {}) }, job, snapshots);
    }
    await writeOnce(join(target, 'job.json'), job);
    await writeOnce(join(target, 'sources.json'), snapshots);
    await writeOnce(join(target, 'intake.json'), record);
    signal?.throwIfAborted();
    await beforePublish?.();
    const receipt = await queue.intakeJob(job, packet.worker, record.recheck_of);
    return { job_id: job.id, research_version: job.research_version, ...receipt, evidence_sources: snapshots.sources.length, execution: 'not started' };
  } finally { await release(); }
}

async function reviewFiles(directory, jobId) {
  if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid job ID');
  directory = await privateStateDirectory(directory);
  const target = join(directory, jobId);
  if ((await lstat(target)).isSymbolicLink()) throw Error('Review job directory cannot be a symlink');
  const job = await readPrivateJson(join(target, 'job.json'));
  const snapshots = await readPrivateJson(join(target, 'sources.json'));
  const intake = validateIntakeRecord(await readPrivateJson(join(target, 'intake.json')), job, snapshots);
  const state = await readPrivateJson(join(target, 'state.json'));
  if (state.job_id !== jobId || job.id !== jobId || state.status !== 'Complete' || state.child_pid) throw Error('Qualification requires a stopped completed research job');
  const report = validateEvidence(await readPrivateJson(join(target, 'report.json')), job, true, snapshots);
  return { target, job, intake, snapshots, state, report,
    report_sha256: digest(await readFile(join(target, 'report.json'))), sources_sha256: digest(await readFile(join(target, 'sources.json'))) };
}

export async function reviewTemplate({ directory, jobId }) {
  const f = await reviewFiles(directory, jobId);
  return { schema_version: 1, job_id: jobId, attempt_id: f.state.attempt_id, report_sha256: f.report_sha256, sources_sha256: f.sources_sha256,
    reviewed_by: '', decision: 'Hold', observations: f.report.observations.map((_, index) => ({ index, supported: false, note: '' })), identity_note: '', operating_status: 'Unverified', operating_evidence: null,
    opportunity_index: null, contact: { url: '', email: '' }, rationale: '', next_action: '',
    ...(f.job.research_version === 3 ? { journey_checks: f.report.journey_checks.map((c, index) => ({ index, area: c.area, supported: false, note: '' })) } : {}) };
}

export function validateDecision(d, f, now = () => new Date()) {
  if (d?.schema_version !== 1 || d.job_id !== f.job.id || d.attempt_id !== f.state.attempt_id || d.report_sha256 !== f.report_sha256 || d.sources_sha256 !== f.sources_sha256) throw Error('Review identity/hash changed; create a fresh review template');
  text(d.reviewed_by, 'reviewer', 200); text(d.identity_note, 'business identity review'); text(d.rationale, 'decision rationale'); text(d.next_action, 'next action');
  if (!['Research-qualified', 'Hold', 'Pass'].includes(d.decision) || !['Active', 'Unverified', 'Paused or closed'].includes(d.operating_status)) throw Error('Invalid qualification or operating decision');
  if (!Array.isArray(d.observations) || d.observations.length !== f.report.observations.length || d.observations.some((o, i) => o.index !== i || typeof o.supported !== 'boolean')) throw Error('Review every observation once in report order');
  d.observations.forEach(o => text(o.note, 'observation review note'));
  if (f.job.research_version === 3) {
    if (!Array.isArray(d.journey_checks) || d.journey_checks.length !== f.report.journey_checks.length || d.journey_checks.some((c, i) => c.index !== i || c.area !== f.report.journey_checks[i].area || typeof c.supported !== 'boolean')) throw Error('Review every detailed journey finding once in report order');
    d.journey_checks.forEach(c => text(c.note, 'journey review note'));
  }
  if (d.opportunity_index != null && (!Number.isInteger(d.opportunity_index) || !f.report.opportunities[d.opportunity_index])) throw Error('Choose an existing supported opportunity');
  if (d.decision !== 'Research-qualified') return d;
  if (f.report.recommendation !== 'Suitable to discuss' || d.observations.some(o => !o.supported) || d.journey_checks?.some(c => !c.supported) || d.operating_status !== 'Active') throw Error('Qualification requires supported observations/journey findings, an active business and a discussion recommendation');
  const age = now() - new Date(`${f.job.as_of}T00:00:00Z`);
  if (age < 0 || age > 14 * 86_400_000) throw Error('Qualification evidence is stale; research a new dated job');
  const e = d.operating_evidence, normalize = value => value.replace(/\s+/g, ' ').trim();
  text(e?.excerpt, 'current-operation evidence', 160);
  if (!f.snapshots.sources.some(s => s.url === e.url && primarySupport(s, f.job, e.context_id) && normalize(s.text).includes(normalize(e.excerpt)) && (!s.reviewed_context || s.reviewed_context.facts.some(c => c.id === e.context_id && normalize(c.excerpt) === normalize(e.excerpt))))) throw Error('Current operation needs captured primary evidence and a specific context citation when used');
  if (!Number.isInteger(d.opportunity_index) || !f.report.opportunities[d.opportunity_index]) throw Error('Choose an existing supported opportunity');
  const contactSource = f.snapshots.sources.find(s => s.url === d.contact?.url);
  if (!f.report.public_contact_routes.includes(d.contact?.url) || !contactSource || !['business', 'social'].includes(contactSource.kind) || contactSource.capture_method === 'search_snippet') throw Error('Choose a captured first-party public business contact route');
  if (typeof d.contact.email !== 'string' || d.contact.email.length > 254 || (d.contact.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contact.email) || !contactSource.text.includes(d.contact.email)))) throw Error('Email must appear exactly in the chosen captured business source');
  return d;
}

export async function reviewCandidate({ directory, queue, jobId, decision, now = () => new Date() }) {
  if (!queue) throw Error('Qualification requires the dedicated Google connection');
  directory = await privateStateDirectory(directory);
  const release = await acquireLock(directory);
  try {
    const f = await reviewFiles(directory, jobId);
    validateDecision(decision, f, now);
    await queue.checkInputs(f.job);
    const current = (await queue.row(jobId)).values;
    if (current[7] !== 'Complete' || current[9] !== f.state.attempt_id || current[13] !== JSON.stringify(f.report)) throw Error('Sheet report/attempt differs from reviewed local evidence; reconcile first');
    const path = join(f.target, 'qualification.json');
    let saved;
    try { saved = await readPrivateJson(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const record = { ...decision, reviewed_at: saved?.reviewed_at ?? now().toISOString() };
    await writeOnce(path, record);
    const review = { attempt_id: f.state.attempt_id, reviewed_at: record.reviewed_at, reviewed_by: decision.reviewed_by, report_sha256: f.report_sha256, sources_sha256: f.sources_sha256,
      verdict: decision.observations.every(o => o.supported) && (!decision.journey_checks || decision.journey_checks.every(c => c.supported)) ? 'Accepted' : 'Needs review', notes: [`${decision.decision}. ${decision.rationale}`, `Next: ${decision.next_action}`] };
    const reviewPath = join(f.target, 'review.json');
    let priorReview;
    try { priorReview = await readPrivateJson(reviewPath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (priorReview && priorReview.attempt_id !== f.state.attempt_id && priorReview.verdict === 'Needs review') {
      await writeOnce(join(f.target, `feedback-${digest(JSON.stringify(priorReview))}.json`), priorReview);
      await saveJson(reviewPath, review);
    } else await writeOnce(reviewPath, review);
    const publishedReview = `Prospect research. No sending authorized. ${review.verdict}: ${review.notes.join(' ')}`;
    if (current[15] !== publishedReview) await queue.publish(jobId, f.state, await readJson(join(f.target, 'checkpoint.json')), f.report, review, true);
    await queue.publishIntakeReview(jobId, decision.decision, decision.next_action);
    let prospect;
    if (decision.decision === 'Research-qualified') {
      const opportunity = f.report.opportunities[decision.opportunity_index];
      const output = [jobId, f.job.business_name, 'Business owner', f.job.website || decision.contact.url, `${f.intake.discovery.area} / ${f.intake.discovery.category}`, `${opportunity.observed_basis} Possible improvement: ${opportunity.proposed_solution}`, decision.contact.email || decision.contact.url,
        'Research', '', decision.next_action, '', 'No', '', '', '', `Research-qualified only. No sending authorized. Reviewer: ${decision.reviewed_by}; checked ${f.job.as_of}. ${decision.rationale} Owner question: ${opportunity.owner_question} Budget, urgency and owner-confirmed need unknown. Review report SHA-256: ${f.report_sha256}`];
      prospect = await queue.addProspect(output);
    }
    return { job_id: jobId, decision: decision.decision, source_review: review.verdict, prospect: prospect ?? 'not added', sending: 'none' };
  } finally { await release(); }
}

export async function intakeSharedCandidate({ directory, queue, jobId, now, collectSources, signal }) {
  const pending = await queue.pendingIntake(jobId);
  if (!pending) return false;
  const result = await intakeCandidate({ directory, queue, packet: pending.packet, now, collectSources, signal, beforePublish: async () => {
    const current = await queue.pendingIntake(jobId);
    if (!current || !same(current.inputs, pending.inputs)) throw Error('Intake changed during source collection; no research job dispatched');
  } });
  await queue.acknowledgeIntake(jobId, pending.inputs);
  return result;
}
