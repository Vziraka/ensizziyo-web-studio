import {runNotificationPreparation} from './team-notifications.mjs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { rename, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { StudioLifecycle, check, hash } from './lifecycle.mjs';
import { readJson, privateStateDirectory, alive } from './engine.mjs';
import { serveLifecycle } from './lifecycle-server.mjs';
import { runOperationsService } from './operations-service.mjs';
import { runResearchService } from './research-service.mjs';
import { runContactQueueService } from './contact-queue.mjs';
import {runDiscoveryService} from './discovery-batches.mjs';

// Windows releases the named pipe on process death. Only its exclusive owner may recover dead local locks.
export async function acquireServiceHost(directory) {
  directory = await privateStateDirectory(directory);
  check(process.platform === 'win32', 'This supervised host is tested on Windows only; use the manual service on other systems');
  const guard = createServer(socket => socket.destroy()), pipe = `\\\\.\\pipe\\evz-studio-${hash(directory.toLowerCase()).slice(0, 32)}`;
  await new Promise((resolve, reject) => { guard.once('error', reject); guard.listen(pipe, resolve); });
  try {
    for (const name of ['operations-service.lock', '.runner.lock']) {
      let value;
      try { value = await readJson(join(directory, name)); } catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      check(Number.isInteger(value.pid) && value.pid > 0 && !alive(value.pid), 'A recorded process is active or its identity is unknown; preserve its lock');
      const archive = join(directory, 'recovery'); await mkdir(archive, { recursive: true, mode: 0o700 });
      await rename(join(directory, name), join(archive, `${name.replace(/^\./, '')}-${randomUUID()}.json`));
    }
    return async () => { await new Promise(resolve => guard.close(resolve)); };
  } catch (error) { guard.close(); throw error; }
}
export async function startStudioService(directory) {
  const releaseHost = await acquireServiceHost(directory), stop = new AbortController();
  let server;
  const shutdown = () => { stop.abort(); server?.close(); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  try {
    const app = await StudioLifecycle.open({ directory });
    server = await serveLifecycle(app, { port: app.config.runtime?.port ?? 8807 });
    const runners = [runNotificationPreparation(app,{signal:stop.signal}),runOperationsService(app, { signal: stop.signal }), runResearchService(app, { signal: stop.signal }), runContactQueueService(app, { signal: stop.signal }),runDiscoveryService(app,{signal:stop.signal})];
    try { await Promise.all(runners); }
    finally { shutdown(); await Promise.allSettled(runners); }
  } finally { shutdown(); process.removeListener('SIGINT', shutdown); process.removeListener('SIGTERM', shutdown); await releaseHost(); }
}
