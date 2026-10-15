import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { subscriptionEnvironment } from './workers.mjs';

export function codexUsage(account, response, now = () => new Date()) {
  if (account?.account?.type !== 'chatgpt') throw Error('Codex controller requires ChatGPT subscription authentication');
  const limits = response.rateLimitsByLimitId ?? (response.rateLimits ? { codex: response.rateLimits } : {});
  const buckets = [];
  for (const [id, limit] of Object.entries(limits)) {
    if (limit.rateLimitReachedType) throw Error('Codex account reports a reached usage limit');
    let found = false;
    for (const window of ['primary', 'secondary']) {
      const value = limit[window];
      if (value == null) continue;
      if (!Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100 || !Number.isInteger(value.resetsAt) || value.resetsAt * 1000 <= now().getTime()) throw Error('Codex allowance metadata is invalid or stale');
      buckets.push({ id: `${id}/${window}`, remaining_percent: 100 - value.usedPercent, resets_at: value.resetsAt });
      found = true;
    }
    if (!found) throw Error('Codex allowance windows are unavailable');
  }
  if (!buckets.length) throw Error('Codex allowance metadata is unavailable');
  return { authenticated_subscription: true, checked_at: now().toISOString(), buckets };
}

// Metadata only: this connection never starts a thread/turn, purchases credits or consumes a reset.
export async function readCodexUsage({ signal, launch = spawn, now = () => new Date(), timeoutMs = 15_000 } = {}) {
  signal?.throwIfAborted();
  const child = launch(process.platform === 'win32' ? 'codex.exe' : 'codex', ['app-server', '--stdio', '--disable', 'apps', '--disable', 'plugins', '--disable', 'hooks', '--disable', 'shell_tool', '-c', 'web_search="disabled"'], {
    env: subscriptionEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
  });
  const pending = new Map(); let sequence = 0, bytes = 0, failed;
  const fail = () => { failed = Error('Codex allowance reader unavailable; no model dispatched'); for (const p of pending.values()) p.reject(failed); pending.clear(); child.kill(); };
  const closed = new Promise(resolve => { child.once('error', fail); child.once('close', () => { fail(); resolve(); }); });
  child.stdin.on('error', fail);
  child.stderr.on('data', data => { bytes += data.length; if (bytes > 1_000_000) fail(); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    bytes += Buffer.byteLength(line); if (bytes > 1_000_000) return fail();
    let message; try { message = JSON.parse(line); } catch { return fail(); }
    // Refuse server requests; no external token or other credential exchange is supported.
    if (message.method && message.id !== undefined) return fail();
    const request = pending.get(message.id); if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(Error('Codex allowance RPC rejected; no model dispatched')); else request.resolve(message.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    if (failed) return reject(failed);
    const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(`${JSON.stringify({ id, method, ...(params ? { params } : {}) })}\n`);
  });
  const timer = setTimeout(fail, timeoutMs); signal?.addEventListener('abort', fail, { once: true });
  try {
    await request('initialize', { clientInfo: { name: 'studio_research_controller', version: '0.1.0' } });
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    const account = await request('account/read', { refreshToken: false });
    const limits = await request('account/rateLimits/read');
    signal?.throwIfAborted();
    return codexUsage(account, limits, now);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', fail); lines.close(); child.kill(); await closed;
  }
}
