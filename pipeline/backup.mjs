import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { acquireLock, privateStateDirectory } from './engine.mjs';
import { validateJob, validateSnapshots } from './sources.mjs';
import { validateEvidence } from './schemas.mjs';

const names = ['job.json', 'sources.json', 'checkpoint.json', 'report.json', 'review.json', 'state.json'];
const statuses = ['Ready', 'Complete', 'Paused', 'Blocked', 'Quota', 'Interrupted', 'Failed'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const idValid = id => /^[a-z0-9-]{1,60}$/.test(id ?? '');
const maxBytes = 2_000_000;

async function boundedRead(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw Error('Backup requires bounded regular files');
  const bytes = await readFile(path, 'utf8');
  if (Buffer.byteLength(bytes) > maxBytes) throw Error('Backup exceeds size bound');
  return bytes;
}

function validateBundle(bundle) {
  if (bundle?.schema_version !== 1 || !idValid(bundle.job_id) || !bundle.files || Array.isArray(bundle.files)) throw Error('Invalid backup manifest');
  const values = {};
  for (const [name, file] of Object.entries(bundle.files)) {
    if (!names.includes(name) || typeof file.content !== 'string') throw Error('Unexpected backup file');
    if (hash(file.content) !== file.sha256) throw Error('Backup checksum mismatch');
    values[name] = JSON.parse(file.content);
  }
  const job = values['job.json'], state = values['state.json'];
  validateJob(job);
  if (job.id !== bundle.job_id || state?.job_id !== job.id || !statuses.includes(state.status) || state.child_pid || !Array.isArray(state.attempts) || state.attempts.some(a => !statuses.includes(a.status))) throw Error('Backup requires a stopped, consistent job; Running attempts cannot be restored');
  // Only operational fields belong in these files; configuration and credentials are separate.
  if (Object.keys(job).some(key => !['id', 'business_name', 'website', 'seed_urls', 'as_of', 'purpose', 'research_version'].includes(key)) || Object.keys(state).some(key => !['job_id', 'status', 'attempts', 'worker', 'attempt_id', 'child_pid', 'updated_at', 'error'].includes(key))) throw Error('Unexpected configuration in backup files');
  const snapshots = values['sources.json'];
  if (snapshots) validateSnapshots(snapshots, job);
  for (const name of ['checkpoint.json', 'report.json']) if (values[name]) {
    if (!snapshots) throw Error('Backup is missing retrieved sources');
    validateEvidence(values[name], job, name === 'report.json', snapshots);
  }
  if (state.status === 'Complete' && (!values['report.json'] || !values['checkpoint.json'])) throw Error('Completed backup is missing evidence');
  const review = values['review.json'];
  if (review && (!state.attempts.some(a => a.id === review.attempt_id) || !['Accepted', 'Needs review'].includes(review.verdict) || !Array.isArray(review.notes) || review.notes.some(note => typeof note !== 'string'))) throw Error('Invalid saved quality review');
  return values;
}

export async function backupJob({ directory, jobId, output }) {
  if (!idValid(jobId)) throw Error('Invalid job ID');
  directory = await privateStateDirectory(directory);
  output = await privateStateDirectory(output);
  const jobDirectory = join(directory, jobId);
  if ((await lstat(jobDirectory)).isSymbolicLink()) throw Error('Backup job directory cannot be a symlink');
  const release = await acquireLock(directory);
  try {
    const bundle = { schema_version: 1, job_id: jobId, created_at: new Date().toISOString(), files: {} };
    for (const name of names) {
      try { const content = await boundedRead(join(jobDirectory, name)); bundle.files[name] = { sha256: hash(content), content }; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    validateBundle(bundle);
    const bytes = JSON.stringify(bundle, null, 2);
    if (Buffer.byteLength(bytes) > maxBytes) throw Error('Backup exceeds size bound');
    await writeFile(output, bytes, { flag: 'wx', mode: 0o600 });
    return { job_id: jobId, files: Object.keys(bundle.files).length, sha256: hash(bytes) };
  } finally { await release(); }
}

export async function restoreBackup({ input, destination }) {
  destination = await privateStateDirectory(destination);
  const bundle = JSON.parse(await boundedRead(input));
  validateBundle(bundle); // Verify everything before creating the new destination.
  await mkdir(destination, { mode: 0o700 }); // Never merge into an existing root.
  const jobDirectory = join(destination, bundle.job_id);
  await mkdir(jobDirectory, { mode: 0o700 });
  for (const name of names) if (bundle.files[name]) await writeFile(join(jobDirectory, name), bundle.files[name].content, { flag: 'wx', mode: 0o600 });
  return { job_id: bundle.job_id, files: Object.keys(bundle.files).length, execution: 'none', google_configuration: 'not restored' };
}
