import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { StudioLifecycle, initialConfig, check } from './lifecycle.mjs';
import { readJson, saveJson } from './engine.mjs';
import { seedLifecycle } from './lifecycle-fixtures.mjs';
import { assessTranscript } from './lifecycle-ai.mjs';
import { LifecycleBridge } from './lifecycle-bridge.mjs';

async function main() {
  const [command, key, operation, actionId, prospectId] = process.argv.slice(2), directory = process.env.STUDIO_LIFECYCLE_STATE_DIR;
  if (command === 'restore') return StudioLifecycle.restore({ input: key, destination: directory });
  if (command === 'init') return { directory: (await StudioLifecycle.initialize({ directory, config: { ...initialConfig, run_id: `lifecycle-${randomUUID()}` } })).directory };
  const app = await StudioLifecycle.open({ directory });
  if (command === 'seed') return seedLifecycle(app);
  if (command === 'status') return app.dashboard();
  if (command === 'event') return app.apply(await readJson(key), { actor: app.config.mode === 'controlled' ? 'controlled-fixture' : 'owner' });
  if (command === 'assess') return assessTranscript(app, key, operation);
  if (command === 'publish') { const { publishLifecycle } = await import('./lifecycle-sync.mjs'); return publishLifecycle(app); }
  if (command === 'booking-check') { const { checkCalendarReceipt } = await import('./lifecycle-documents.mjs'); return checkCalendarReceipt(await readJson(key), app.config.calendar, app.now()); }
  if (command === 'serve') { const { serveLifecycle } = await import('./lifecycle-server.mjs'); const server = await serveLifecycle(app, { port: Number(process.env.STUDIO_LIFECYCLE_PORT ?? 8807) }); process.once('SIGINT', () => server.close()); process.once('SIGTERM', () => server.close()); return; }
  if (command === 'backup') { await mkdir(join(app.directory, 'backups'), { recursive: true }); return app.backup(key ?? join(app.directory, 'backups', `lifecycle-${Date.now()}.json`)); }
  if (command === 'pause') { const config = await readJson(join(app.directory, 'lifecycle-config.json')); config.outreach_enabled = false; config.research_enabled = false; config.connector_writes_enabled = false; config.transcript_ai.enabled = false; await saveJson(join(app.directory, 'lifecycle-config.json'), config); return { execution: 'paused' }; }
  const bridge = new LifecycleBridge(app, process.env.STUDIO_LIFECYCLE_SESSION);
  if (command === 'prepare') return bridge.prepare(key, operation, actionId, prospectId);
  if (command === 'settle') { check(/^[a-zA-Z0-9_-]{1,100}$/.test(key ?? ''), 'Invalid receipt key'); return bridge.settle(key, await readJson(join(app.directory, 'receipts', `${key}.json`))); }
  throw Error('Use init, seed, status, event, assess, serve, prepare, settle, pause, backup or restore');
}
try { const result = await main(); if (result !== undefined) console.log(JSON.stringify(result)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
