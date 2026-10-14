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

export async function executeJob({ directory, queue, jobId, worker, requestedWorker, invoke, signal, revisionNotes, collectSources, onEvent = () => {} }) {
  let started = false, publicationFailed = false, completedPublished = false;
  const publish = async () => {
    try { await publishJob(directory, queue, jobId); }
    catch (error) { publicationFailed = true; throw error; }
  };
  try {
    const result = await runJob({ directory: join(directory, jobId), lockDirectory: directory, worker, invoke, signal, revisionNotes, collectSources,
      beforeStart: job => queue?.checkInputs(job, requestedWorker),
      onEvent: async event => {
        if (event.event === 'reserved') started = true;
        await onEvent(event);
        if (['reserved', 'sources_saved', 'collect_started', 'checkpoint_saved', 'checkpoint_reused', 'assess_started', 'complete'].includes(event.event)) await publish();
        if (event.event === 'complete') completedPublished = true;
      }
    });
    if (!completedPublished) await publish(); // Cached results still need an explicit readback.
    return result;
  } catch (error) {
    if (started && !publicationFailed) {
      try { await publish(); } catch { /* Retain local evidence; reconciliation is explicit. */ }
    }
    if (publicationFailed) await onEvent({ job_id: jobId, event: 'reconciliation_required' });
    throw error;
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

export async function watchJob({ directory, queue, jobId, invoke, signal, collectSources, onEvent = () => {}, timeoutMs = 900_000, pollMs = 5000, wait = delay, clock = () => performance.now(), now = () => new Date() }) {
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
      return executeJob({ directory, queue, jobId, worker: pending.worker, requestedWorker: pending.worker, invoke, signal, collectSources, onEvent });
    }
    await wait(Math.min(pollMs, Math.max(1, deadline - clock())), undefined, { signal });
  }
  throw Error('Timed out waiting for the exact fresh Ready queue job; no automatic retry');
}
