import { mkdir, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readJson, saveJson, privateStateDirectory } from './engine.mjs';
import { invokeCLI } from './workers.mjs';
import { GoogleQueue } from './google.mjs';
import { validateJob } from './sources.mjs';
import { publishJob, executeJob, watchJob } from './runner.mjs';

const directory = await privateStateDirectory(process.env.STUDIO_STATE_DIR);
await mkdir(directory, { recursive: true });
const [command, jobId, worker] = process.argv.slice(2);
let queue;
try { queue = new GoogleQueue(await readJson(join(directory, 'google-config.json'))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const publish = id => publishJob(directory, queue, id);
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
} else if (command === 'run' || command === 'watch') {
  if (!/^[a-z0-9-]{1,60}$/.test(jobId ?? '')) throw Error('Invalid job ID');
  const controller = new AbortController();
  const interrupt = () => controller.abort(new DOMException('Controlled interruption', 'AbortError'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  let interruptionTimer;
  try {
    let revisionNotes;
    if (command === 'watch' && (process.argv.includes('--revise') || process.argv.includes('--interrupt-assessment'))) throw Error('Automatic pickup runs one fresh job only');
    if (command === 'run' && process.argv.includes('--revise')) {
      const review = await readJson(join(directory, jobId, 'review.json'));
      const state = await readJson(join(directory, jobId, 'state.json'));
      if (review.attempt_id !== state.attempt_id || review.verdict !== 'Needs review' || !Array.isArray(review.notes) || !review.notes.length) throw Error('Revision requires quality feedback for the current attempt');
      revisionNotes = review.notes;
    }
    console.log(JSON.stringify({ mode: queue ? 'Google queue' : 'local worker proof; Google runner access not configured' }));
    const onEvent = async event => {
      const record = { at: new Date().toISOString(), ...event };
      await appendFile(join(directory, 'events.jsonl'), `${JSON.stringify(record)}\n`, { mode: 0o600 });
      console.log(JSON.stringify(record));
      if (process.argv.includes('--interrupt-assessment') && event.event === 'worker_started' && event.phase === 'assess') interruptionTimer = setTimeout(interrupt, 2000);
    };
    const options = { directory, queue, jobId, worker, revisionNotes, invoke: invokeCLI, signal: controller.signal, onEvent };
    const timeoutIndex = process.argv.indexOf('--timeout-seconds');
    if (timeoutIndex !== -1) {
      const seconds = Number(process.argv[timeoutIndex + 1]);
      if (command !== 'watch' || !Number.isInteger(seconds) || seconds < 30 || seconds > 3600) throw Error('Watch timeout must be 30–3600 seconds');
      options.timeoutMs = seconds * 1000;
    }
    const result = await (command === 'watch' ? watchJob(options) : executeJob(options));
    console.log(JSON.stringify({ job_id: jobId, status: result.state.status, worker: result.state.worker, sources: result.report.sources.length, observations: result.report.observations.length }));
    if (process.argv.includes('--interrupt-assessment')) throw Error('Interruption did not occur; do not count this as a recovery proof');
  } catch (error) {
    console.error(error.message); process.exitCode = error.name === 'AbortError' ? 130 : 1;
  }
  finally { clearTimeout(interruptionTimer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
} else { throw Error('Usage: node proof.mjs prepare | google-probe | sync <job-id> | run <job-id> <cursor|claude|codex> [--interrupt-assessment|--revise] | watch <job-id> [--timeout-seconds 900]'); }
