import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runJob, readJson } from './engine.mjs';
import { validateEvidence } from './schemas.mjs';
import { validateJob, validateSnapshots } from './sources.mjs';

export async function publishJob(directory, queue, id) {
  if (!queue) return;
  const jobDirectory = join(directory, id);
  const job = await readJson(join(jobDirectory, 'job.json'));
  validateJob(job);
  const state = await readJson(join(jobDirectory, 'state.json'));
  let checkpoint, report, review;
  for (const name of ['checkpoint', 'report', 'review']) {
    try {
      const value = await readJson(join(jobDirectory, `${name}.json`));
      if (name === 'checkpoint') checkpoint = value; else if (name === 'report') report = value; else review = value;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (checkpoint || report) {
    const snapshots = validateSnapshots(await readJson(join(jobDirectory, 'sources.json')), job);
    if (checkpoint) validateEvidence(checkpoint, job, false, snapshots);
    if (report) validateEvidence(report, job, true, snapshots);
  }
  await queue.publish(id, state, checkpoint, state.status === 'Complete' ? report : undefined, review);
}

async function executeAttempt({ directory, queue, jobId, worker, requestedWorker, previousAttempt, invoke, signal: parentSignal, revisionNotes, collectSources, onEvent = () => {}, controlPollMs = 5000 }) {
  if (!Number.isFinite(controlPollMs) || controlPollMs < 1 || controlPollMs > 60_000) throw Error('Control checks must be bounded');
  const controller = new AbortController(), monitorStop = new AbortController();
  const signal = AbortSignal.any([controller.signal, parentSignal].filter(Boolean));
  let job, attemptId, monitor;
  const guard = async () => {
    if (!queue) return;
    try { await queue.checkActive(job, attemptId, requestedWorker); }
    catch (error) {
      const reason = error.code === 'QUEUE_PAUSED' ? error : Object.assign(Error('Queue control unavailable or changed; execution blocked'), { code: 'QUEUE_BLOCKED' });
      controller.abort(reason); throw reason;
    }
  };
  let started = false, publicationFailed = false, completedPublished = false;
  const stopMonitor = async () => { monitorStop.abort(); await monitor; };
  const publish = async () => {
    try { await publishJob(directory, queue, jobId); }
    catch (error) { publicationFailed = true; throw error; }
  };
  try {
    const result = await runJob({ directory: join(directory, jobId), lockDirectory: directory, worker, invoke, signal, revisionNotes, collectSources,
      beforeStart: async value => { job = value; if (previousAttempt) await queue?.checkRecovery(job, previousAttempt, requestedWorker); else await queue?.checkInputs(job, requestedWorker); },
      beforeComplete: async () => { await stopMonitor(); await guard(); },
      beforeFailure: stopMonitor,
      onEvent: async event => {
        if (event.event === 'reserved') { started = true; attemptId = event.attempt_id; }
        await onEvent(event);
        if (started && !['reserved', 'complete', 'worker_stopped'].includes(event.event)) { signal.throwIfAborted(); await guard(); }
        if (['reserved', 'sources_saved', 'collect_started', 'checkpoint_saved', 'checkpoint_reused', 'assess_started', 'complete'].includes(event.event)) await publish();
        if (event.event === 'reserved' && queue) monitor = (async () => {
          try { while (!monitorStop.signal.aborted && !signal.aborted) { await delay(controlPollMs, undefined, { signal: monitorStop.signal }); if (!monitorStop.signal.aborted && !signal.aborted) await guard(); } }
          catch (error) { if (!monitorStop.signal.aborted && !signal.aborted) controller.abort(Object.assign(Error('Queue control unavailable; execution blocked'), { code: 'QUEUE_BLOCKED' })); }
        })();
        if (event.event === 'complete') completedPublished = true;
      }
    });
    if (!completedPublished) await publish(); // Cached results still need an explicit readback.
    return result;
  } catch (error) {
    if (started && !publicationFailed) {
      try { await publish(); } catch { /* Retain local evidence; reconciliation is explicit. */ }
    }
    if (publicationFailed) {
      await onEvent({ job_id: jobId, event: 'reconciliation_required' });
      throw Object.assign(Error('Uncertain Google write: reconcile this job before retrying'), { code: 'RECONCILIATION_REQUIRED' });
    }
    throw signal.aborted && signal.reason?.code ? signal.reason : error;
  } finally { await stopMonitor(); }
}

export async function executeJob(options) {
  const fallbacks = options.fallbackWorkers ?? [];
  if (!Array.isArray(fallbacks) || new Set(fallbacks).size !== fallbacks.length || fallbacks.some(w => !['cursor', 'claude', 'codex'].includes(w) || w === options.worker)) throw Error('Fallbacks must name each other subscription worker at most once');
  let previousAttempt;
  for (const worker of [options.worker, ...fallbacks]) {
    try { return await executeAttempt({ ...options, worker, previousAttempt }); }
    catch (error) {
      if (error.code !== 'WORKER_QUOTA' || worker === [options.worker, ...fallbacks].at(-1)) throw error;
      const state = await readJson(join(options.directory, options.jobId, 'state.json'));
      if (state.status !== 'Quota' || state.child_pid) throw Error('Quota handoff requires a stopped previous worker');
      previousAttempt = state.attempt_id;
      await options.onEvent?.({ job_id: options.jobId, event: 'quota_handoff', previous_worker: worker });
    }
  }
}

async function snapshotJob(directory, job) {
  const jobDirectory = join(directory, job.id), path = join(jobDirectory, 'job.json');
  await mkdir(jobDirectory, { recursive: true });
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(job, null, 2));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = await readJson(path);
    if (JSON.stringify(existing) !== JSON.stringify(job)) throw Error('Queue inputs differ from saved job; use a new job ID for changed scope/date');
  } finally { await handle?.close(); }
}

export async function watchJob({ directory, queue, jobId, invoke, signal, collectSources, fallbackWorkers, controlPollMs, onEvent = () => {}, timeoutMs = 900_000, pollMs = 5000, wait = delay, clock = () => performance.now(), now = () => new Date() }) {
  if (!queue) throw Error('Automatic pickup requires the dedicated Google connection');
  if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid job ID');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000 || !Number.isFinite(pollMs) || pollMs < 1 || pollMs > 60_000) throw Error('Queue wait must be bounded');
  const deadline = clock() + timeoutMs;
  await onEvent({ job_id: jobId, event: 'listener_started', max_jobs: 1, timeout_ms: timeoutMs });
  while (clock() < deadline) {
    signal?.throwIfAborted();
    const pending = await queue.pendingJob(jobId, now().toISOString().slice(0, 10));
    if (pending) {
      await snapshotJob(directory, pending.job);
      await onEvent({ job_id: jobId, event: 'queue_selected', worker: pending.worker });
      // The engine takes the existing exclusive lock, rechecks inputs, then publishes
      // and verifies its reservation before fetching pages or starting a worker.
      return executeJob({ directory, queue, jobId, worker: pending.worker, requestedWorker: pending.worker, invoke, signal, collectSources, fallbackWorkers, controlPollMs, onEvent });
    }
    await wait(Math.min(pollMs, Math.max(1, deadline - clock())), undefined, { signal });
  }
  throw Error('Timed out waiting for the exact fresh Ready queue job; no automatic retry');
}
