import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSupplementalReviewLedger, ownerSupplementalFiles } from './supplemental-reviews.mjs';
import { privateStateDirectory } from './engine.mjs';

const args = process.argv.slice(2);
const [stateDirectory, artifactDirectory, action] = args;
if (args.length !== 3 || !stateDirectory || !artifactDirectory || !['--dry-run', '--write-sidecar'].includes(action))
  throw Error('Usage: node supplemental-reviews-cli.mjs STATE_DIRECTORY ARTIFACT_DIRECTORY --dry-run|--write-sidecar');
const privateDirectory = await privateStateDirectory(stateDirectory);
const state = JSON.parse(await readFile(join(privateDirectory, 'lifecycle-state.json'), 'utf8'));
const config = JSON.parse(await readFile(join(privateDirectory, 'lifecycle-config.json'), 'utf8'));
const files = await Promise.all(ownerSupplementalFiles.map(async expected => ({
  name: expected.name, libraryFileId: expected.libraryFileId,
  bytes: await readFile(join(artifactDirectory, expected.name))
})));
const output = join(privateDirectory, 'supplemental-reviews.json');
let existing = null;
try { existing = JSON.parse(await readFile(output, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const { ledger, receipt, duplicate } = buildSupplementalReviewLedger(files, state, config, existing);
if (action === '--write-sidecar' && !duplicate)
  await writeFile(output, JSON.stringify(ledger, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ status: action === '--dry-run' ? 'Validated without writing' : duplicate ? 'Already imported' : 'Sidecar written',
  output, duplicate, import_sha256: ledger.import_sha256, records: receipt.records,
  advisory_recommendations: receipt.advisory_recommendations,
  qualification_changed: false, contact_released: false }));
