import {createHash} from 'node:crypto';
import {open, readFile, realpath, writeFile} from 'node:fs/promises';
import {isAbsolute, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cases, candidateChecklist} from './context-handoff-fixtures.mjs';
import {checkpointPrompt, extractPolicy, followupVersion, runCodex} from './context-handoff-pilot.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const [which, repetition] = process.argv.slice(2);
if (!['original', 'holdout'].includes(which) || !['1', '2'].includes(repetition)) throw new Error('Usage: node scripts/context-handoff-followup.mjs <original|holdout> <1|2>');
if (!process.env.EVZ_HANDOFF_TRACE_DIR) throw new Error('Set EVZ_HANDOFF_TRACE_DIR to the owner-private evidence directory');
const dir = await realpath(process.env.EVZ_HANDOFF_TRACE_DIR);
const repo = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const fromRepo = relative(repo, dir);
if (!fromRepo || (fromRepo !== '..' && !fromRepo.startsWith(`..${sep}`) && !isAbsolute(fromRepo))) throw new Error('Private traces must be stored outside the repository');
const prior = [];
for (const name of ['followup-original-1.json', 'followup-original-2.json', 'followup-holdout-1.json', 'followup-holdout-2.json']) {
  try {
    const record = JSON.parse(await readFile(join(dir, name), 'utf8'));
    if (!record?.result?.valid) throw new Error(`Prior follow-up attempt requires review: ${name}`);
    prior.push(record);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const doc = await readFile(new URL('../docs/context-handoff-pilot.md', import.meta.url), 'utf8');
const addon = doc.split(/\r?\n/).find(line => line.startsWith('> Record non-sensitive exact approval parameters'))?.slice(2);
if (!addon) throw new Error('Frozen approval-scope addendum not found');
const workflow = await readFile(new URL('../WORKFLOW.md', import.meta.url), 'utf8');
const workspace = await readFile(new URL('../WORKSPACE.md', import.meta.url), 'utf8');
const policy = extractPolicy(workflow, workspace);
const raw = await readFile(join(dir, 'holdout-input.json'), 'utf8');
if (hash(raw) !== '78a01312172116bc5ab833b668f7ac51f03a89be33b47d19c93b42b1499528d8') throw new Error('Held-out input does not match the preregistered hash');
const input = JSON.parse(raw);
if (typeof input.history !== 'string' || typeof input.task !== 'string') throw new Error('Held-out input is malformed');
const original = cases.find(item => item.id === 'drift_and_receipt');
const fixture = which === 'holdout' ? {history: `${input.history}\n\nUser task: ${input.task}`} : original;
const runnerHash = hash(await readFile(new URL('./context-handoff-pilot.mjs', import.meta.url), 'utf8'));
const scriptHash = hash(await readFile(import.meta.url, 'utf8'));
const version = followupVersion({addon, policy, original: original.history, holdoutHash: hash(raw), runnerHash, scriptHash, checklist: candidateChecklist});
if (prior.some(record => record.version !== version)) throw new Error('Follow-up inputs or runner changed; do not mix results');
const prompt = checkpointPrompt(fixture, policy, true).replace(candidateChecklist, `${candidateChecklist}\n${addon}`);
const outputPath = join(dir, `followup-${which}-${repetition}.json`);
const reservation = await open(outputPath, 'wx', 0o600);
await reservation.close();
const result = await runCodex(prompt, dir);
const record = {which, repetition: Number(repetition), version, promptHash: hash(prompt), addonHash: hash(addon), result};
await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
if (!result.valid) throw new Error('Invalid follow-up run; inspect its private trace before continuing');
process.stdout.write(`${which} repetition ${repetition}: completed\n`);
