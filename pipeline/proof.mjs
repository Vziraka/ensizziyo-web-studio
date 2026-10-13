import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runJob, readJson, saveJson, privateStateDirectory } from './engine.mjs';
import { invokeCLI } from './workers.mjs';
import { GoogleQueue } from './google.mjs';
import { validateEvidence } from './schemas.mjs';
import { validateJob, validateSnapshots } from './sources.mjs';

const directory = await privateStateDirectory(process.env.STUDIO_STATE_DIR);
await mkdir(directory, { recursive: true });
const [command, jobId, worker] = process.argv.slice(2);
let queue;
try { queue = new GoogleQueue(await readJson(join(directory, 'google-config.json'))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
async function publish(id) {
  if (!queue) return;
  const jobDirectory = join(directory, id);
  const job = await readJson(join(jobDirectory, 'job.json'));
  validateJob(job);
  const state = await readJson(join(jobDirectory, 'state.json'));
  let checkpoint, report;
  for (const name of ['checkpoint', 'report']) {
    try { const value = await readJson(join(jobDirectory, `${name}.json`)); if (name === 'checkpoint') checkpoint = value; else report = value; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (checkpoint || report) {
    const snapshots = validateSnapshots(await readJson(join(jobDirectory, 'sources.json')), job);
    if (checkpoint) validateEvidence(checkpoint, job, false, snapshots);
    if (report) validateEvidence(report, job, true, snapshots);
  }
  let review;
  try { review = await readJson(join(jobDirectory, 'review.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await queue.publish(id, state, checkpoint, state.status === 'Complete' ? report : undefined, review);
}
if (command === 'prepare') {
  const business = await readJson(join(directory, 'business.json'));
  for (const name of ['cursor', 'claude', 'codex', 'recovery']) {
    const id = `proof-${name}`, jobDirectory = join(directory, id);
    await mkdir(jobDirectory, { recursive: true });
    try { await readFile(join(jobDirectory, 'job.json')); throw Error('Proof job already exists; preparation never overwrites state'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const job = { ...business, id, purpose: name === 'recovery' ? 'interruption proof' : 'worker benchmark' };
    validateJob(job);
    await saveJson(join(jobDirectory, 'job.json'), job);
  }
  console.log('Prepared four controlled jobs outside Git.');
} else if (command === 'google-probe') {
  if (!queue) throw Error('Dedicated Google credential/configuration is not set up');
  console.log(JSON.stringify(await queue.probe()));
} else if (command === 'sync') {
  if (!queue) throw Error('Dedicated Google credential/configuration is not set up');
  if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid job ID');
  await publish(jobId);
  console.log(JSON.stringify({ job_id: jobId, google_receipt: 'verified' }));
} else if (command === 'run') {
  if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid job ID');
  const controller = new AbortController();
  const interrupt = () => controller.abort(new DOMException('Controlled interruption', 'AbortError'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  let interruptionTimer;
  try {
    let revisionNotes;
    if (process.argv.includes('--revise')) {
      const review = await readJson(join(directory, jobId, 'review.json'));
      const state = await readJson(join(directory, jobId, 'state.json'));
      if (review.attempt_id !== state.attempt_id || review.verdict !== 'Needs review' || !Array.isArray(review.notes) || !review.notes.length) throw Error('Revision requires quality feedback for the current attempt');
      revisionNotes = review.notes;
    }
    if (queue) await queue.checkInputs(await readJson(join(directory, jobId, 'job.json')));
    console.log(JSON.stringify({ mode: queue ? 'Google queue' : 'local worker proof; Google runner access not configured' }));
    const result = await runJob({ directory: join(directory, jobId), lockDirectory: directory, worker, revisionNotes, invoke: invokeCLI, signal: controller.signal, onEvent: async event => {
      const record = { at: new Date().toISOString(), ...event };
      await appendFile(join(directory, 'events.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
      console.log(JSON.stringify(record));
      if (process.argv.includes('--interrupt-assessment') && event.event === 'worker_started' && event.phase === 'assess') interruptionTimer = setTimeout(interrupt, 2000);
      if (['collect_started', 'checkpoint_saved', 'checkpoint_reused', 'assess_started', 'complete'].includes(event.event)) await publish(jobId);
    } });
    await publish(jobId);
    console.log(JSON.stringify({ job_id: jobId, status: result.state.status, worker: result.state.worker, sources: result.report.sources.length, observations: result.report.observations.length }));
    if (process.argv.includes('--interrupt-assessment')) throw Error('Interruption did not occur; do not count this as a recovery proof');
  } catch (error) {
    console.error(error.message); process.exitCode = error.name === 'AbortError' ? 130 : 1;
    try { await publish(jobId); } catch { console.error('Google state needs reconciliation; local evidence is retained.'); }
  }
  finally { clearTimeout(interruptionTimer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
} else { throw Error('Usage: node proof.mjs prepare | google-probe | sync <job-id> | run <job-id> <cursor|claude|codex> [--interrupt-assessment|--revise]'); }
