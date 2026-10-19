import { mkdir, lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { privateStateDirectory, acquireLock, readJson, saveJson, alive } from './engine.mjs';
import { intakeSharedCandidate, reviewFiles, reviewCandidate, digest, readPrivateJson } from './prospects.mjs';
import { executeJob } from './runner.mjs';
import { validateEvidence } from './schemas.mjs';
import { invokeCLI, modelArguments } from './workers.mjs';
import { evidenceReviewSchema, evidenceReviewPrompt, validateEvidenceReview } from './evidence-review.mjs';
import { readCodexUsage } from './usage.mjs';

const workers = ['codex', 'claude', 'cursor'];
const recoverable = new Set(['WORKER_QUOTA', 'WORKER_TIMEOUT', 'WORKER_OUTPUT_INVALID', 'WORKER_CAPACITY']);
const deferred = new Set(['RESEARCH_BUDGET', 'CONTROLLER_PAUSED', 'CONTROL_TIME_LIMIT', 'QUEUE_PAUSED', 'USAGE_UNAVAILABLE']);
const problem = (code, message) => Object.assign(Error(message), { code });
const contextAnchorError = 'Observation must cite the specific reviewed context fact and its exact anchor';
const contextAnchorFeedback = 'The previous report shortened or split a reviewed context anchor. For each nonempty context_id, copy the complete saved reviewed_context.facts[].excerpt into evidence.excerpt. Do not shorten, split or paraphrase it; select fewer distinct facts if the per-source quote budget requires it.';
const optionalJson = async path => { try { return await readJson(path); } catch (e) { if (e.code !== 'ENOENT') throw e; } };
const exists = async path => { try { await lstat(path); return true; } catch (e) { if (e.code !== 'ENOENT') throw e; return false; } };
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;

export function validateControllerConfig(c) {
  if (c?.schema_version !== 1 || !/^[a-z0-9-]{1,60}$/.test(c.campaign ?? '')) throw Error('Invalid controller campaign');
  if (!Array.isArray(c.job_ids) || c.job_ids.length > 200 || new Set(c.job_ids).size !== c.job_ids.length || c.job_ids.some(id => !/^[a-z0-9-]{1,60}$/.test(id))) throw Error('Controller scope must name up to 200 distinct exact job IDs');
  if (!integer(c.max_run_minutes, 1, 60) || !integer(c.poll_seconds, 1, 60) || !integer(c.max_calls_per_job, 3, 12) || !integer(c.max_repairs, 0, 1) || !integer(c.max_recoveries, 0, 1)) throw Error('Controller execution/recovery limits must be bounded');
  for (const order of [c.fallback_order, c.review_order]) if (!Array.isArray(order) || !order.length || new Set(order).size !== order.length || order.some(w => !workers.includes(w))) throw Error('Invalid controller worker order');
  if (!c.providers || Object.keys(c.providers).some(w => !workers.includes(w))) throw Error('Only installed subscription providers are supported');
  for (const worker of workers) {
    const p = c.providers[worker];
    if (!p || typeof p.enabled !== 'boolean' || !integer(p.daily_calls, 0, 100) || typeof p.included_usage_only_confirmed !== 'boolean' || !integer(p.reserve_percent, 0, 99) || p.usage_source !== (worker === 'codex' ? 'codex' : 'call-cap')) throw Error('Invalid subscription policy');
    modelArguments(worker, { model: p.model, effort: p.effort }); modelArguments(worker, { model: p.review_model, effort: p.review_effort });
    if (!p.model || !p.review_model || (p.enabled && (!p.daily_calls || !p.included_usage_only_confirmed))) throw Error('Enabled providers require explicit models, a call budget and verified included-only billing');
  }
  return c;
}

async function controls(directory) {
  let c;
  try { c = await readJson(join(directory, 'research-control.json')); } catch { throw problem('CONTROL_UNAVAILABLE', 'Research control is missing or unreadable; execution blocked'); }
  if (c.schema_version !== 1 || typeof c.enabled !== 'boolean' || !['research', 'website', 'client'].includes(c.priority) || !c.quota_resumes || typeof c.quota_resumes !== 'object' || Array.isArray(c.quota_resumes) || Object.entries(c.quota_resumes).some(([w, t]) => !workers.includes(w) || typeof t !== 'string' || !Number.isFinite(Date.parse(t)))) throw problem('CONTROL_UNAVAILABLE', 'Invalid research control; execution blocked');
  return c;
}

export async function controllerStatus(directory, config, state, now = () => new Date()) {
  config = validateControllerConfig(config);
  state ??= await optionalJson(join(directory, 'controller-state.json')) ?? { calls: [], jobs: {}, provider_blocks: {} };
  let c;
  try { c = await controls(directory); } catch { c = { enabled: false, priority: 'unknown' }; }
  const jobs = config.job_ids.map(id => ({ job_id: id, ...(state.jobs[id] ? { status: state.jobs[id].status, stage: state.jobs[id].stage, decision: state.jobs[id].decision, reason: state.jobs[id].reason, next_action: state.jobs[id].next_action } : { status: 'Not claimed' }) }));
  return {
    status: c.priority === 'unknown' ? 'Blocked' : c.enabled && c.priority === 'research' ? 'Ready' : 'Paused', priority: c.priority, campaign: config.campaign,
    calls_reserved: state.calls.length, provider_blocks: state.provider_blocks,
    counts: Object.fromEntries(['Complete', 'Held', 'Deferred', 'Waiting', 'Not claimed'].map(s => [s, jobs.filter(j => j.status === s).length])),
    jobs,
    usage_policy: Object.fromEntries(workers.map(w => [w, { enabled: config.providers[w].enabled, daily_calls: config.providers[w].daily_calls, calls_today: state.calls.filter(c => c.worker === w && c.day === now().toISOString().slice(0, 10)).length, source: config.providers[w].usage_source }])),
    sending: 'none'
  };
}

// One dispatcher and one job at a time. Every state mutation is under this controller lock;
// existing runner locks still guard intake, model execution and qualification separately.
export async function runController({ directory, config, queue, invoke = invokeCLI, readUsage = ({ signal }) => readCodexUsage({ signal }), now = () => new Date(), signal: parentSignal, once = true, controlPollMs = 1000 }) {
  validateControllerConfig(config);
  if (!integer(controlPollMs, 1, 5000)) throw Error('Priority monitor must check within five seconds');
  directory = await privateStateDirectory(directory);
  await mkdir(directory, { recursive: true });
  const lockDirectory = join(directory, '.controller'); await mkdir(lockDirectory, { recursive: true });
  const release = await acquireLock(lockDirectory), path = join(directory, 'controller-state.json');
  const deadline = new AbortController();
  const signal = AbortSignal.any([deadline.signal, parentSignal].filter(Boolean));
  const timer = setTimeout(() => deadline.abort(problem('CONTROL_TIME_LIMIT', 'Bounded controller window ended')), config.max_run_minutes * 60_000);
  let state;
  try {
    state = await optionalJson(path) ?? { schema_version: 1, calls: [], jobs: {}, provider_blocks: {} };
    if (state.schema_version !== 1 || !Array.isArray(state.calls) || state.calls.length > 100_000 || !state.jobs || Array.isArray(state.jobs) || !state.provider_blocks || state.calls.some(c => !workers.includes(c.worker) || !/^[a-z0-9-]{1,60}$/.test(c.job_id ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(c.day ?? '') || !c.id) || new Set(state.calls.map(c => c.id)).size !== state.calls.length || Object.entries(state.provider_blocks).some(([w, t]) => !workers.includes(w) || !Number.isFinite(Date.parse(t)))) throw Error('Invalid controller ledger; reconcile rather than resetting budgets');
    const save = async () => { state.updated_at = now().toISOString(); await saveJson(path, state); };
    const guard = async () => {
      signal.throwIfAborted();
      const c = await controls(directory);
      if (!c.enabled || c.priority !== 'research') throw problem('CONTROLLER_PAUSED', 'Research yielded to the owner priority control');
      return c;
    };
    const available = async worker => {
      const c = await guard(), p = config.providers[worker], blockedAt = state.provider_blocks[worker];
      if (!p.enabled || !p.included_usage_only_confirmed || (blockedAt && !(Date.parse(c.quota_resumes[worker]) > Date.parse(blockedAt) && Date.parse(c.quota_resumes[worker]) <= now().getTime()))) return false;
      return state.calls.filter(call => call.worker === worker && call.day === now().toISOString().slice(0, 10)).length < p.daily_calls;
    };
    const choose = async order => {
      for (const worker of order) if (await available(worker)) return worker;
      throw problem('RESEARCH_BUDGET', 'No eligible subscription budget; wait for reset or verified quota resume');
    };

    for (const record of Object.values(state.jobs)) if (record.child_pid && alive(record.child_pid)) throw problem('ORPHANED_WORKER', 'A recorded child is still alive; confirm exit before controller recovery');

    const operate = async (record, fn) => {
      const interrupted = new AbortController(), monitorStop = new AbortController();
      const jobSignal = AbortSignal.any([signal, interrupted.signal]);
      let queueCheck;
      const monitor = (async () => {
        try { while (!monitorStop.signal.aborted) {
          await delay(controlPollMs, undefined, { signal: monitorStop.signal }); await guard();
          // A slow Sheets read must not delay the local priority/pause monitor.
          if (!queueCheck && record.activeGuard) queueCheck = record.activeGuard().catch(e => interrupted.abort(e)).finally(() => { queueCheck = undefined; });
        } }
        catch (e) { if (!monitorStop.signal.aborted) interrupted.abort(e); }
      })();
      try { return await fn(jobSignal); }
      catch (e) { throw jobSignal.aborted ? jobSignal.reason : e; }
      finally { monitorStop.abort(); await monitor; await queueCheck; delete record.activeGuard; }
    };

    const modelCall = async (record, options) => {
      await guard(); options.signal?.throwIfAborted();
      const worker = options.worker, p = config.providers[worker];
      if (!(await available(worker))) throw problem('RESEARCH_BUDGET', 'Provider research call budget is unavailable');
      if (state.calls.filter(c => c.job_id === record.job_id).length >= config.max_calls_per_job) throw problem('JOB_CALL_LIMIT', 'Per-job call ceiling reached; manual evidence decision needed');
      if (p.usage_source === 'codex') {
        let usage;
        try { usage = await readUsage({ signal: options.signal }); }
        catch { throw problem('USAGE_UNAVAILABLE', 'Codex subscription allowance unavailable; no model dispatched'); }
        if (!usage?.authenticated_subscription || !Array.isArray(usage.buckets) || !usage.buckets.length || !Number.isFinite(Date.parse(usage.checked_at)) || Math.abs(now() - new Date(usage.checked_at)) > 60_000 || usage.buckets.some(b => !Number.isFinite(b.remaining_percent) || b.remaining_percent < p.reserve_percent || b.remaining_percent > 100 || !Number.isInteger(b.resets_at) || b.resets_at * 1000 <= now().getTime())) throw problem('USAGE_UNAVAILABLE', 'Codex allowance is unknown, stale or below the research reserve');
        state.last_codex_usage = usage;
      }
      await guard(); options.signal?.throwIfAborted();
      const stronger = options.phase === 'review' || record.stage === 'repair' || record.use_review_model === true;
      const model = stronger ? p.review_model : p.model, effort = worker === 'codex' ? (stronger ? p.review_effort : p.effort) : undefined;
      const call = { id: randomUUID(), job_id: record.job_id, day: now().toISOString().slice(0, 10), reserved_at: now().toISOString(), worker, model, effort: effort ?? null, phase: options.phase, status: 'Reserved' };
      if (record.recovery_armed) { record.recoveries++; delete record.recovery_armed; }
      state.calls.push(call); record.status = 'Running'; await save(); // Never refund an uncertain/failed call.
      try {
        const result = await invoke({ ...options, model, effort });
        if (options.phase !== 'review') {
          try { validateEvidence(result, options.job, options.phase === 'assess', options.snapshots); }
          catch (error) { throw problem('WORKER_OUTPUT_INVALID', error.message === contextAnchorError ? contextAnchorError : 'Worker output failed the saved-evidence contract'); }
        }
        call.status = 'Returned'; await save(); return result;
      } catch (e) {
        call.status = e.code ?? e.name; if (e.code === 'WORKER_QUOTA') state.provider_blocks[worker] = now().toISOString();
        await save(); throw e;
      }
    };

    const processJob = async (record, jobSignal) => {
      const target = join(directory, record.job_id);
      if (await exists(target) && (await lstat(target)).isSymbolicLink()) throw problem('RECONCILIATION_REQUIRED', 'Controller job directory cannot be a symlink');
      const event = async e => {
        if (e.event === 'reserved') record.attempt_id = e.attempt_id;
        if (e.event === 'worker_started') record.child_pid = e.pid;
        if (e.event === 'worker_stopped') record.child_pid = null;
        await save();
      };
      if (record.stage === 'intake') {
        const intake = await intakeSharedCandidate({ directory, queue, jobId: record.job_id, now, signal: jobSignal });
        if (!intake && !(await exists(join(target, 'job.json')))) { record.status = 'Waiting'; return; }
        const pending = await queue.pendingJob(record.job_id, now().toISOString().slice(0, 10), 3);
        if (!pending || pending.job.research_version !== 3) throw problem('RECONCILIATION_REQUIRED', 'Fresh detailed intake has no matching unreserved Ready job');
        record.requested_worker = pending.worker; record.worker = pending.worker;
        record.job_sha256 = digest(await readFile(join(target, 'job.json')));
        record.sources_sha256 = digest(await readFile(join(target, 'sources.json')));
        record.stage = 'research'; await save();
      }
      if (digest(await readFile(join(target, 'job.json'))) !== record.job_sha256 || digest(await readFile(join(target, 'sources.json'))) !== record.sources_sha256) throw problem('RECONCILIATION_REQUIRED', 'Owned job inputs/evidence changed; use a new job ID');
      while (!['done', 'held'].includes(record.stage)) {
        await guard(); jobSignal.throwIfAborted();
        if (record.stage === 'research' || record.stage === 'repair') {
          const prior = await optionalJson(join(target, 'state.json'));
          if (prior && (prior.child_pid || prior.attempt_id !== record.attempt_id || prior.status === 'Running' || prior.status === 'Blocked')) throw problem('RECONCILIATION_REQUIRED', 'Prior process/reservation needs reconciliation');
          if (record.needs_handoff) {
            if (record.recoveries >= config.max_recoveries) throw problem('RECOVERY_EXHAUSTED', 'Bounded subscription handoff exhausted');
            const alternatives = config.fallback_order.filter(w => w !== record.worker);
            let alternate;
            for (const worker of alternatives) if (await available(worker)) { alternate = worker; break; }
            const failed = state.calls.findLast(c => c.job_id === record.job_id), policy = config.providers[record.worker];
            if (alternate) record.worker = alternate;
            else if (failed?.worker === record.worker && ['WORKER_OUTPUT_INVALID', 'WORKER_TIMEOUT', 'WORKER_CAPACITY'].includes(failed.status) && (failed.status !== 'WORKER_CAPACITY' || failed.model !== policy.review_model) && policy.model !== policy.review_model && await available(record.worker)) record.use_review_model = true;
            else if (failed?.status === 'WORKER_CAPACITY') throw problem('WORKER_CAPACITY','No distinct configured model is available; preserve the capacity hold');
            else record.worker = await choose(alternatives);
            record.recovery_armed = true; delete record.needs_handoff; await save();
          }
          if (!prior || prior.status !== 'Complete' || record.stage === 'repair') {
            if (!(await available(record.worker))) { record.worker = await choose(config.fallback_order); await save(); }
            const feedback = [...(record.revision_notes ?? []), ...(record.validation_feedback ?? [])];
            try {
              await executeJob({ directory, queue, jobId: record.job_id, worker: record.worker, requestedWorker: record.requested_worker,
                resume: prior ? { attempt_id: prior.attempt_id, status: prior.status } : undefined,
                revisionNotes: feedback.length ? feedback : undefined, signal: jobSignal,
                invoke: options => modelCall(record, options), onEvent: event });
            } catch (e) {
              const stopped = await optionalJson(join(target, 'state.json'));
              if (recoverable.has(e.code) && stopped?.attempt_id === record.attempt_id && !stopped.child_pid && record.recoveries < config.max_recoveries) {
                if (e.code === 'WORKER_OUTPUT_INVALID' && e.message === contextAnchorError) record.validation_feedback = [contextAnchorFeedback];
                else delete record.validation_feedback;
                record.needs_handoff = true; await save(); continue;
              }
              throw e;
            }
          }
          record.stage = 'review'; delete record.revision_notes; delete record.validation_feedback; delete record.review_file; await save();
        }
        if (record.stage === 'review') {
          let f = await reviewFiles(directory, record.job_id);
          if (f.state.attempt_id !== record.attempt_id) throw problem('RECONCILIATION_REQUIRED', 'Review attempt changed outside the controller');
          let lastReservationCheck = -Infinity;
          const checkReviewReservation = async (force = true) => {
            if (!force && performance.now() - lastReservationCheck < 5000) return;
            lastReservationCheck = performance.now();
            await guard();
            const { values: row } = await queue.row(record.job_id);
            if (row[5] === 'Pause') throw problem('QUEUE_PAUSED', 'Owner paused review for this job');
            if (row[5] !== 'Ready' || row[1] !== f.job.business_name || (row[2] ?? '') !== f.job.website || JSON.stringify((row[3] ?? '').split(/\r?\n/).filter(Boolean)) !== JSON.stringify(f.job.seed_urls) || row[4] !== record.requested_worker || row[6] !== f.job.purpose || row[7] !== 'Complete' || row[9] !== f.state.attempt_id || row[13] !== JSON.stringify(f.report)) throw problem('RECONCILIATION_REQUIRED', 'Reviewed Sheet report/reservation changed');
          };
          await checkReviewReservation(); record.activeGuard = () => checkReviewReservation(false);
          let receipt;
          if (record.review_file) {
            if (!/^[a-z0-9.-]+\.json$/.test(record.review_file)) throw Error('Unsafe saved review path');
            receipt = await readPrivateJson(join(target, record.review_file));
            validateEvidenceReview(receipt.result, f, receipt.reviewer, now);
          } else {
            while (!receipt) {
              const excluded = record.review_failed_worker;
              const order = config.review_order.filter(w => w !== excluded);
              const worker = await choose([...order.filter(w => w !== record.worker), ...order.filter(w => w === record.worker)]);
              const reviewer = `${worker}/${config.providers[worker].review_model} independent review`;
              const unlock = await acquireLock(directory);
              try {
                f = await reviewFiles(directory, record.job_id); await checkReviewReservation();
                const result = await modelCall(record, { worker, phase: 'review', job: f.job, snapshots: f.snapshots, directory: target, attempt_id: randomUUID(), signal: jobSignal, onEvent: event,
                  outputSchema: evidenceReviewSchema(f, reviewer), promptText: evidenceReviewPrompt(f, reviewer) });
                try { validateEvidenceReview(result, f, reviewer, now); } catch { throw problem('WORKER_OUTPUT_INVALID', 'Independent review failed its complete claim-check contract'); }
                receipt = { schema_version: 1, reviewer, reviewed_at: now().toISOString(), result };
                const filename = `auto-review-${f.state.attempt_id}-${randomUUID()}.json`;
                await saveJson(join(target, filename), receipt); record.review_file = filename; delete record.review_failed_worker; await save();
              } catch (e) {
                if (recoverable.has(e.code) && !record.child_pid && record.recoveries < config.max_recoveries) {
                  record.review_failed_worker = worker; record.recovery_armed = true; await save(); continue;
                }
                throw e;
              } finally { await unlock(); }
            }
          }
          await checkReviewReservation(); jobSignal.throwIfAborted(); delete record.activeGuard;
          if (receipt.result.verdict === 'Revise' && record.repairs < config.max_repairs) {
            // Retain exact report bytes and attempt before the engine writes a corrected result.
            const archive = join(target, `original-${f.state.attempt_id}-${f.report_sha256}.json`);
            if (await exists(archive)) {
              if (digest(await readFile(archive)) !== f.report_sha256) throw problem('RECONCILIATION_REQUIRED', 'Original report archive is incomplete or changed; preserve the intact report before repair');
            } else await writeFile(archive, await readFile(join(target, 'report.json')), { flag: 'wx', mode: 0o600 });
            record.repairs++; record.stage = 'repair'; record.revision_notes = receipt.result.corrections;
            delete record.review_file; await save(); continue;
          }
          await reviewCandidate({ directory, queue, jobId: record.job_id, decision: receipt.result.decision, now });
          record.stage = receipt.result.verdict === 'Accepted' ? 'done' : 'held';
          record.status = receipt.result.verdict === 'Accepted' ? 'Complete' : 'Held';
          record.decision = receipt.result.decision.decision; record.next_action = receipt.result.decision.next_action;
          record.reason = receipt.result.verdict === 'Accepted' ? null : 'EVIDENCE_REPAIR_EXHAUSTED'; await save();
        }
      }
    };

    let overall = 'Complete';
    do {
      try { await guard(); } catch (e) { overall = e.code === 'CONTROLLER_PAUSED' ? 'Paused' : 'Blocked'; break; }
      for (const id of config.job_ids) {
        try { await guard(); } catch (e) { overall = e.code === 'CONTROLLER_PAUSED' ? 'Paused' : 'Blocked'; break; }
        let record = state.jobs[id];
        if (record && record.campaign !== config.campaign) throw Error('A prior campaign owns this job ID; use a new ID');
        if (record && ['done', 'held'].includes(record.stage)) continue;
        if (!record) {
          record = state.jobs[id] = { job_id: id, campaign: config.campaign, stage: 'intake', status: 'Waiting', recoveries: 0, repairs: 0 };
          if (await exists(join(directory, id))) { record.stage = 'held'; record.status = 'Held'; record.reason = 'UNOWNED_JOB'; record.next_action = 'Use a new unique job ID; existing proof/sample directories are never adopted automatically.'; }
          await save(); if (record.stage === 'held') continue;
        }
        try { await operate(record, jobSignal => processJob(record, jobSignal)); }
        catch (e) {
          record.reason = e.code ?? e.name;
          record.error_detail = e.message.slice(0, 500);
          record.status = deferred.has(e.code) || e.name === 'AbortError' ? 'Deferred' : 'Held';
          if (record.status === 'Held') record.stage = 'held';
          record.next_action = record.status === 'Deferred' ? 'Restore Ready/research priority or verified subscription allowance, then resume this controller; saved evidence and call charges are retained.' : 'Inspect private attempts, evidence and the exact Sheet reservation; reconcile before a new named job. No blind retry.';
          await save();
          if (record.child_pid && alive(record.child_pid)) { overall = 'Blocked'; break; }
        }
        const progress = await controllerStatus(directory, config, state, now);
        await saveJson(join(directory, 'controller-summary.json'), progress);
        if (progress.status !== 'Ready') { overall = progress.status; break; }
        if (signal.aborted) break;
      }
      if (once || signal.aborted || overall !== 'Complete' || config.job_ids.every(id => ['done', 'held'].includes(state.jobs[id]?.stage))) break;
      try { await delay(config.poll_seconds * 1000, undefined, { signal }); } catch { break; }
    } while (!signal.aborted);
    const summary = await controllerStatus(directory, config, state, now);
    summary.status = summary.status === 'Paused' ? 'Paused' : signal.aborted ? 'Stopped' : overall === 'Blocked' ? 'Blocked' : summary.jobs.some(j => j.status === 'Held') ? 'Needs attention' : summary.jobs.some(j => j.status === 'Deferred' || j.status === 'Waiting') ? 'Waiting' : 'Complete';
    await save(); await saveJson(join(directory, 'controller-summary.json'), summary); return summary;
  } finally { clearTimeout(timer); await release(); }
}
