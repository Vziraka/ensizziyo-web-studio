import { lstat, readFile } from 'node:fs/promises';
import { privateStateDirectory } from './engine.mjs';
import { validateSnapshots } from './sources.mjs';

export async function readReviewedSources(path, job) {
  if (![2, 3].includes(job.research_version)) throw Error('Reviewed external captures require an explicit version-2 or version-3 job');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 400_000) throw Error('Reviewed captures must be a bounded private regular file');
  path = await privateStateDirectory(path);
  const bytes = await readFile(path, 'utf8');
  if (Buffer.byteLength(bytes) > 400_000) throw Error('Reviewed captures exceed size bound');
  let captures;
  try { captures = JSON.parse(bytes); } catch { throw Error('Reviewed captures are not valid JSON'); }
  if (typeof captures.reviewed_by !== 'string' || captures.reviewed_by.trim().length < 3) throw Error('Reviewed captures need an identified operator');
  return validateSnapshots(captures, job);
}
