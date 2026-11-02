import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 12000;
const fields = ['objective', 'acceptance', 'decisions', 'work', 'checks', 'holds', 'nextAction'];
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fail = message => { throw Object.assign(new Error(message), { safe: true }); };
const hash = value => createHash('sha256').update(value).digest('hex');

function keysMatch(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => own(value, key));
}

function shortText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1500;
}

export function validateCheckpoint(value) {
  if (!keysMatch(value, fields)) fail('Checkpoint fields are missing or unexpected');
  if (!fields.filter(key => key !== 'decisions').every(key => shortText(value[key]))) {
    fail('Checkpoint text is empty or too long');
  }
  if (!Array.isArray(value.decisions) || value.decisions.length > 10
      || !value.decisions.every(decision => keysMatch(decision, ['decision', 'reason', 'source'])
        && Object.values(decision).every(shortText))) {
    fail('Checkpoint decisions require a decision, reason and source');
  }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) fail('Checkpoint is too large');
  return value;
}

const windowsAcl = `
$ErrorActionPreference = 'Stop'
$path = $env:EVZ_CHECKPOINT_DIRECTORY
$owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if ($env:EVZ_CHECKPOINT_ACL_ACTION -eq 'create') {
  $acl = [System.Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($owner)
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  foreach ($identity in @($owner, $system)) {
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', $inherit, 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  [System.IO.Directory]::SetAccessControl($path, $acl)
}
$isFile = $env:EVZ_CHECKPOINT_ACL_ACTION -eq 'file'
$acl = if ($isFile) { [System.IO.File]::GetAccessControl($path) } else { [System.IO.Directory]::GetAccessControl($path) }
$rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
if ((-not $isFile -and -not $acl.AreAccessRulesProtected) -or $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $owner.Value) { exit 1 }
foreach ($rule in $rules) {
  if ($rule.IdentityReference.Value -notin @($owner.Value, $system.Value) -or $rule.AccessControlType -ne 'Allow') { exit 1 }
}
foreach ($identity in @($owner.Value, $system.Value)) {
  if (-not @($rules | Where-Object { $_.IdentityReference.Value -eq $identity -and ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl }).Count) { exit 1 }
  if (-not $isFile -and -not @($rules | Where-Object { $_.IdentityReference.Value -eq $identity -and ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl -and ($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ContainerInherit) -and ($_.InheritanceFlags -band [System.Security.AccessControl.InheritanceFlags]::ObjectInherit) }).Count) { exit 1 }
}
`;

function checkWindowsAcl(directory, action) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', windowsAcl], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, EVZ_CHECKPOINT_DIRECTORY: directory, EVZ_CHECKPOINT_ACL_ACTION: action },
  });
  if (result.error || result.status !== 0) fail('Checkpoint directory permissions could not be verified');
}

function stateDirectory() {
  const configured = process.env.EVZ_CONTEXT_DIR;
  const directory = configured || (process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA || fail('Local application data directory is unavailable'), 'EVZ-Codex-Checkpoints')
    : join(homedir(), '.codex', 'evz-checkpoints'));
  if (!isAbsolute(directory)) fail('Checkpoint directory must be absolute');
  return resolve(directory);
}

async function outsideGit(directory) {
  for (let current = directory; ; current = dirname(current)) {
    try { await lstat(join(current, '.git')); fail('Checkpoint directory must be outside a Git checkout'); }
    catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    if (dirname(current) === current) return;
  }
}

async function privateDirectory(create) {
  const requested = stateDirectory();
  let created = false;
  try { await lstat(requested); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return null;
    await outsideGit(await realpath(dirname(requested)));
    try { await mkdir(requested, { mode: 0o700 }); created = true; }
    catch (mkdirError) { if (mkdirError.code !== 'EEXIST') throw mkdirError; }
  }
  const info = await lstat(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) fail('Checkpoint directory is not a safe directory');
  const directory = await realpath(requested);
  await outsideGit(directory);
  if (process.platform === 'win32') {
    checkWindowsAcl(directory, created ? 'create' : 'check');
  } else if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
    fail('Checkpoint directory is not private to its owner');
  }
  return directory;
}

function git(cwd, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, env });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function identity(session, cwd) {
  if (typeof session !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(session)) fail('Invalid checkpoint session');
  const root = git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) fail('Checkpoint requires a Git worktree');
  const canonicalRoot = await realpath(root);
  const within = relative(canonicalRoot, await realpath(cwd));
  if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    fail('Checkpoint worktree does not contain the current directory');
  }
  const project = hash(canonicalRoot);
  return {
    session,
    project,
    id: hash(`${project}\0${session}`),
    branch: git(root, ['branch', '--show-current']),
    head: git(root, ['rev-parse', '--verify', 'HEAD']),
  };
}

async function regularFile(path) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES + 3000) fail('Checkpoint file is invalid');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const after = await handle.stat();
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || after.size > MAX_BYTES + 3000) {
      fail('Checkpoint file changed while opening');
    }
    checkFilePrivacy(path, after);
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

function checkFilePrivacy(path, info) {
  if (process.platform === 'win32') checkWindowsAcl(path, 'file');
  else if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) fail('Checkpoint file is not private to its owner');
}

function parseRecord(raw, current) {
  let record;
  try { record = JSON.parse(raw); } catch { fail('Checkpoint is malformed'); }
  if (!keysMatch(record, ['version', 'session', 'project', 'branch', 'head', 'savedAt', 'checkpoint'])
      || record.version !== 1 || record.session !== current.session || record.project !== current.project
      || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))
      || ![null, 'string'].includes(record.branch === null ? null : typeof record.branch)
      || ![null, 'string'].includes(record.head === null ? null : typeof record.head)) fail('Checkpoint identity is invalid');
  validateCheckpoint(record.checkpoint);
  return record;
}

export async function saveCheckpoint(session, value, cwd = process.cwd()) {
  validateCheckpoint(value);
  const current = await identity(session, cwd);
  const directory = await privateDirectory(true);
  const destination = join(directory, `${current.id}.json`);
  const lockPath = join(directory, `${current.id}.lock`);
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('Checkpoint is locked; inspect the existing lock before recovery'); throw error; }
  const lockIdentity = await lock.stat();
  const temporary = join(directory, `${current.id}.${randomUUID()}.tmp`);
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
    try {
      const target = await lstat(destination);
      if (!target.isFile() || target.isSymbolicLink()) fail('Checkpoint destination is invalid');
      parseRecord(await regularFile(destination), current);
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const record = { version: 1, session: current.session, project: current.project, branch: current.branch,
      head: current.head, savedAt: new Date().toISOString(), checkpoint: value };
    const handle = await open(temporary, 'wx', 0o600);
    try {
      checkFilePrivacy(temporary, await handle.stat());
      await handle.writeFile(`${JSON.stringify(record)}\n`);
      await handle.sync();
    }
    finally { await handle.close(); }
    await rename(temporary, destination);
    return { status: 'saved', checkpointId: current.id };
  } finally {
    await unlink(temporary).catch(() => {});
    await lock.close();
    try {
      const currentLock = await lstat(lockPath);
      if (!currentLock.isFile() || currentLock.isSymbolicLink() || currentLock.dev !== lockIdentity.dev || currentLock.ino !== lockIdentity.ino) {
        fail('Checkpoint lock changed; inspect it before recovery');
      }
      await unlink(lockPath);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

export async function readCheckpoint(session, cwd = process.cwd()) {
  const current = await identity(session, cwd);
  const directory = await privateDirectory(false);
  if (!directory) return { status: 'missing' };
  let raw;
  try { raw = await regularFile(join(directory, `${current.id}.json`)); }
  catch (error) { if (error.code === 'ENOENT') return { status: 'missing' }; throw error; }
  const record = parseRecord(raw, current);
  return { status: 'available', savedAt: record.savedAt,
    recorded: { branch: record.branch, head: record.head }, current: { branch: current.branch, head: current.head },
    revisionChanged: record.branch !== current.branch || record.head !== current.head,
    worktreeChanges: 'not checked', checkpoint: record.checkpoint };
}

async function main() {
  const [command, session, ...extra] = process.argv.slice(2);
  if (extra.length || !['save', 'read'].includes(command)) fail('Use save or read with one session ID');
  if (command === 'read') return readCheckpoint(session);
  process.stdin.setEncoding('utf8');
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_BYTES) fail('Checkpoint is too large');
  }
  let value;
  try { value = JSON.parse(input); } catch { fail('Checkpoint input is not valid JSON'); }
  return saveCheckpoint(session, value);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`Checkpoint unavailable: ${error.safe ? error.message : 'storage or system error'}\n`); process.exitCode = 1; });
}
