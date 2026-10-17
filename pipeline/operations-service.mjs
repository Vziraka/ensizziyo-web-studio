import { readFile, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mutations } from './lifecycle-operations.mjs';
import { operationsFor, requireProductionRelease, requireCallRelease, syncResearchImports } from './production.mjs';
import { maintainOperations } from './lifecycle-maintenance.mjs';
import { AppConnectors } from './app-connectors.mjs';
import { check, hash } from './lifecycle.mjs';
import { readJson } from './engine.mjs';

const writes = mutations;
async function dispatchGuard(app, next, session) {
  const config = await readJson(join(app.directory, 'lifecycle-config.json'));
  check(config.operations.enabled, 'Owner paused connector work before dispatch');
  const state = await app.snapshot(), r = Object.values(state.operations.requests).find(r => r.key === next.key);
  check(r?.session === session && r.status === 'Pending' && r.input_sha256 === hash(next.input), 'Prepared operation identity changed before dispatch');
  if (!writes.has(next.operation) || ['stop', 'task_skip'].includes(next.operation)) return;
  if (config.mode === 'production') {
    if (['contact_create', 'task_create'].includes(next.operation)) requireCallRelease(config);
    else requireProductionRelease(config);
  }
  const suffix = { draft: 'draft', send: 'send', task_create: 'task-create', personalize: 'personalize', intent: 'intent' }[next.operation];
  const action = suffix && Object.values(state.actions).find(a => r.logical === `${a.id}-${suffix}`);
  const booking = next.operation === 'booking_create' && Object.entries(config.operations.bookings ?? {}).find(([id]) => r.logical === `${id}-create`)?.[1];
  const record = state.prospects[action?.prospect_id ?? booking?.prospect_id ?? (next.operation === 'contact_create' ? r.logical.slice(0, -'-contact-create'.length) : '')];
  check(record && !record.restriction, 'Owner stopped this record before dispatch; preserve the reservation');
  if (['draft', 'send', 'intent', 'personalize'].includes(next.operation) || next.operation === 'contact_create' && record.stage !== 'Callback' || next.operation === 'task_create' && action.type !== 'callback_task')
    check(!record.cold_paused, 'Owner/reply paused cold contact before dispatch');
  if (next.operation === 'task_create' && action.type === 'callback_task') check(record.stage === 'Callback', 'Requested callback is no longer the current owner action');
  if (booking) check(['Discovery', 'Information requested'].includes(record.stage), 'Booking interest changed before dispatch');
  if (booking && config.mode === 'production') check(booking.approved === true && next.input.attendees?.length === 1 && next.input.attendees[0] === booking.attendee_email && next.input.start_time === booking.start && next.input.end_time === booking.end && next.input.title === booking.title && next.input.description === booking.description, 'Booking scope or approval changed before dispatch');
}
export async function settleSavedOperations(app) {
  const pending = Object.values((await app.snapshot()).operations?.requests ?? {}).filter(r => r.status === 'Pending');
  for (const r of pending) {
    check(/^ops-[a-f0-9-]{36}$/.test(r.key), 'Invalid saved operation identity');
    let raw;
    try { raw = JSON.parse(await readFile(join(app.directory, 'receipts', `${r.key}.json`), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const result = await operationsFor(app, r.session).settle(r.key, raw);
    check(result.status === 'Done', 'Retained provider receipt failed; preserve the held operation');
  }
}

export async function operationsTick(app, { connect = options => new AppConnectors(options), signal, maxOperations = 20, paceMs = 1250 } = {}) {
  check(Number.isInteger(maxOperations) && maxOperations >= 1 && maxOperations <= 20, 'Bounded connector work required');
  check(Number.isInteger(paceMs) && paceMs >= 0 && paceMs <= 60_000, 'Invalid connector pacing');
  const session = `service-${randomUUID()}`, ops = operationsFor(app, session);
  let client, calls = 0;
  await mkdir(join(app.directory, 'receipts'), { recursive: true, mode: 0o700 });
  try {
    const config = await readJson(join(app.directory, 'lifecycle-config.json'));
    if (config.research?.supervised !== true) {
      try { await syncResearchImports(app); await app.change(s => { s.exceptions = s.exceptions.filter(e => e.id !== 'research-import-system'); }); }
      catch (error) { await app.change(s => { s.exceptions = s.exceptions.filter(e => e.id !== 'research-import-system'); s.exceptions.push({ id: 'research-import-system', reason: `Research import held: ${String(error.message).slice(0, 300)}` }); }); }
    }
    await settleSavedOperations(app);
    for (let count = 0; count < maxOperations; count++) {
      signal?.throwIfAborted();
      const next = await ops.next();
      if (!next.operation) {
        if (next.status === 'Complete') {
          await ops.effects(); next.maintenance = await maintainOperations(app); Object.assign(next, await ops.report());
        }
        return { ...next, calls };
      }
      const path = join(app.directory, 'receipts', `${next.key}.json`);
      let receipt;
      try { receipt = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!receipt) {
        if (!client) { client = connect({ cwd: app.directory, signal }); await client.connect(); }
        if (calls && paceMs) await delay(paceMs, undefined, { signal });
        await dispatchGuard(app, next, session);
        receipt = await client.call(next.tool, next.input); calls++;
        await writeFile(path, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
      }
      const settled = await ops.settle(next.key, receipt);
      check(settled.status === 'Done', 'Provider operation failed; inspect the retained receipt and hold');
    }
    await app.change(state => { if (state.operations?.lease?.session === session) delete state.operations.lease; });
    return { status: 'Yielded', calls };
  } finally { await client?.close(); }
}

export async function runOperationsService(app, { signal, tick = operationsTick, intervalMs = 5000 } = {}) {
  check(Number.isInteger(intervalMs) && intervalMs >= 1000 && intervalMs <= 60_000, 'Invalid service check interval');
  const lockPath = join(app.directory, 'operations-service.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Error('Another service or an unreconciled service lock exists; verify its process before restart'); throw error; }
  await lock.writeFile(JSON.stringify({ pid: process.pid, started_at: app.now().toISOString(), run_id: app.config.run_id }));
  await lock.close();
  try {
    while (!signal?.aborted) {
      const now = app.now();
      try {
        const config = await readJson(join(app.directory, 'lifecycle-config.json'));
        if (!config.runtime?.enabled) {
          await app.change(state => { state.runtime = { ...state.runtime, status: 'Paused', pid: process.pid, transport: 'app-server', checked_at: now.toISOString() }; });
        } else {
          const saved = (await app.snapshot()).runtime;
          if (!saved?.next_at || Date.parse(saved.next_at) <= +now) {
            await app.change(state => { state.runtime = { ...state.runtime, status: 'Checking', pid: process.pid, transport: 'app-server', checked_at: now.toISOString() }; });
            const result = await tick(app, { signal });
            const nextAt = result.next_at ?? new Date(+now + (result.status === 'Complete' ? 300_000 : result.status === 'Held' ? 60_000 : intervalMs)).toISOString();
            await app.change(state => { state.runtime = { status: result.status, pid: process.pid, transport: 'app-server', checked_at: app.now().toISOString(), next_at: nextAt,
              completed_cycles: state.operations?.cycle?.completed_cycles ?? 0, last_error: result.reason ?? null, calls: result.calls }; });
          }
        }
      } catch (error) {
        if (signal?.aborted) break;
        await app.change(state => { state.runtime = { ...state.runtime, status: 'Held', pid: process.pid, transport: 'app-server', checked_at: app.now().toISOString(),
          next_at: new Date(+app.now() + 60_000).toISOString(), last_error: String(error.message).slice(0, 600) }; });
      }
      try { await delay(intervalMs, undefined, { signal }); } catch { if (!signal?.aborted) throw Error('Service wait failed'); }
    }
  } finally {
    await app.change(state => { state.runtime = { ...state.runtime, status: 'Stopped', stopped_at: app.now().toISOString() }; });
    await unlink(lockPath);
  }
}
