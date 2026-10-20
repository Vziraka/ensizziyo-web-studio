import { readFile, writeFile, rename, open, unlink, lstat, realpath } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateEvidence } from './schemas.mjs';
import { validateJob, validateSnapshots, collectPublicSources } from './sources.mjs';

export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function privateStateDirectory(value) {
  if (!value) throw Error('STUDIO_STATE_DIR must name a private directory outside every Git checkout');
  const requested = resolve(value);
  let existing = requested;
  while (true) {
    try { await lstat(existing); break; }
    catch (error) { if (error.code !== 'ENOENT' || dirname(existing) === existing) throw error; existing = dirname(existing); }
  }
  const target = resolve(await realpath(existing), relative(existing, requested));
  for (let ancestor = target; ; ancestor = dirname(ancestor)) {
    try { await lstat(join(ancestor, '.git')); throw Error('STUDIO_STATE_DIR must stay outside every Git checkout'); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    if (dirname(ancestor) === ancestor) break;
  }
  return target;
}
export async function saveJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  // Windows can briefly deny replacement while a control monitor has the file open.
  try {
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) { if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 9) throw error; await delay(Math.min(20 * 2 ** attempt,250)); }
    }
  } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}
export async function assertControllerOwner(directory) {
  try {
    const controller = await readJson(join(directory, '.controller', '.runner.lock'));
    if (controller.pid !== process.pid) throw Error('The controller owns this state directory; stop or reconcile it before using another runner');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export async function acquireLock(directory) {
  await assertControllerOwner(directory);
  const path = join(directory, '.runner.lock');
  const token = randomUUID();
  try {
    const handle = await open(path, 'wx', 0o600);
    await handle.writeFile(JSON.stringify({ pid: process.pid, token }));
    await handle.close();
    return async () => { if ((await readJson(path)).token === token) await unlink(path); };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await readJson(path);
    if (!Number.isInteger(owner.pid) || owner.pid <= 0 || alive(owner.pid)) throw Object.assign(Error('Another runner is active; refusing overlapping execution'), Number.isInteger(owner.pid) && owner.pid > 0 ? { code: 'RUNNER_BUSY' } : {});
    // shortcut: hard-crash lock recovery is manual during this controlled proof; never race to remove a competing lock.
    throw Error('Stale runner lock: confirm all recorded processes stopped before manual recovery');
  }
}

export async function runJob({ directory, worker, invoke, signal, revisionNotes, collectSources = collectPublicSources, onEvent = () => {}, beforeStart = () => {}, beforeComplete = () => {}, beforeFailure = () => {}, lockDirectory = directory }) {
  if (!['cursor', 'claude', 'codex'].includes(worker)) throw Error('Unknown research worker');
  const release = await acquireLock(lockDirectory);
  const statePath = join(directory, 'state.json');
  let state, ownsAttempt = false;
  try {
    const job = await readJson(join(directory, 'job.json'));
    validateJob(job);
    try { state = await readJson(statePath); } catch (error) { if (error.code !== 'ENOENT') throw error; state = { job_id: job.id, status: 'Ready', attempts: [] }; }
    if (state.job_id !== job.id) throw Error('State does not match job');
    if (state.child_pid && alive(state.child_pid)) throw Error('Previous worker is still alive; recovery requires its confirmed exit');
    signal?.throwIfAborted();
    await beforeStart(job);
    let snapshots;
    try { snapshots = await readJson(join(directory, 'sources.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (snapshots) validateSnapshots(snapshots, job);
    if (state.status === 'Complete' && !revisionNotes) {
      if (!snapshots) throw Error('Completed job is missing its retrieved source evidence');
      return { state, report: validateEvidence(await readJson(join(directory, 'report.json')), job, true, snapshots) };
    }
    if (state.attempts.at(-1)?.status === 'Running') { state.attempts.at(-1).status = 'Interrupted'; state.attempts.at(-1).ended_at = new Date().toISOString(); }
    const attempt = { id: randomUUID(), worker, status: 'Running', started_at: new Date().toISOString() };
    state = { ...state, status: 'Running', worker, attempt_id: attempt.id, child_pid: null, attempts: [...state.attempts, attempt] };
    delete state.error;
    ownsAttempt = true;
    await saveJson(statePath, state);
    const persist = async event => {
      if (event.pid) state.child_pid = event.pid;
      if (event.event === 'worker_stopped') state.child_pid = null;
      state.updated_at = new Date().toISOString();
      await saveJson(statePath, state);
      await onEvent({ job_id: job.id, attempt_id: attempt.id, ...event });
    };
    await persist({ event: 'reserved' });
    if (!snapshots) {
      await persist({ event: 'sources_started' });
      snapshots = validateSnapshots(await collectSources(job, { signal }), job);
      signal?.throwIfAborted();
      await saveJson(join(directory, 'sources.json'), snapshots);
      await persist({ event: 'sources_saved', source_count: snapshots.sources.length });
    }
    let checkpoint;
    try { checkpoint = validateEvidence(await readJson(join(directory, 'checkpoint.json')), job, false, snapshots); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!checkpoint) {
      await persist({ event: 'collect_started' });
      checkpoint = validateEvidence(await invoke({ worker, phase: 'collect', job, snapshots, directory, attempt_id: attempt.id, signal, onEvent: persist }), job, false, snapshots);
      signal?.throwIfAborted();
      await saveJson(join(directory, 'checkpoint.json'), checkpoint);
      state.child_pid = null;
      await persist({ event: 'checkpoint_saved', source_count: checkpoint.sources.length });
    } else await persist({ event: 'checkpoint_reused', source_count: checkpoint.sources.length });
    signal?.throwIfAborted();
    await persist({ event: 'assess_started' });
    const report = validateEvidence(await invoke({ worker, phase: 'assess', job, checkpoint, snapshots, feedback: revisionNotes, directory, attempt_id: attempt.id, signal, onEvent: persist }), job, true, snapshots);
    signal?.throwIfAborted();
    await beforeComplete();
    signal?.throwIfAborted();
    const resultUrls = new Set(report.sources.map(s => s.url));
    if (checkpoint.sources.some(s => !resultUrls.has(s.url))) throw Error('Completed report dropped saved evidence');
    await saveJson(join(directory, 'report.json'), report);
    state.status = 'Complete';
    state.child_pid = null;
    state.attempts.at(-1).status = 'Complete';
    state.attempts.at(-1).ended_at = new Date().toISOString();
    await persist({ event: 'complete', source_count: report.sources.length });
    return { state, report };
  } catch (error) {
    if (ownsAttempt && state?.status === 'Running') {
      await beforeFailure();
      const reason = signal?.reason?.code ?? error.code;
      state.status = reason === 'QUEUE_PAUSED' ? 'Paused' : reason === 'QUEUE_BLOCKED' ? 'Blocked' : reason === 'WORKER_QUOTA' ? 'Quota' : error.name === 'AbortError' ? 'Interrupted' : 'Failed';
      state.attempts.at(-1).status = state.status;
      state.attempts.at(-1).ended_at = new Date().toISOString();
      state.error = reason ?? error.name;
      // Preserve a live PID so a new invocation cannot start over an orphaned worker.
      if (!state.child_pid || !alive(state.child_pid)) state.child_pid = null;
      await saveJson(statePath, state);
    }
    throw error;
  } finally { await release(); }
}
