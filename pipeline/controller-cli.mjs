import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { privateStateDirectory } from './engine.mjs';
import { readPrivateJson } from './prospects.mjs';
import { controllerStatus, runController, validateControllerConfig } from './controller.mjs';
import { GoogleQueue } from './google.mjs';

try {
  const [command, ...args] = process.argv.slice(2);
  if (!['init', 'status', 'run'].includes(command) || args.some(a => a !== '--once') || (args.length && (command !== 'run' || args.length !== 1))) throw Error('Use controller-cli.mjs init|status|run [--once]');
  const directory = await privateStateDirectory(process.env.STUDIO_STATE_DIR);
  if (command === 'init') {
    await mkdir(directory, { recursive: true });
    for (const [source, target] of [['controller.example.json', 'controller-config.json'], ['research-control.example.json', 'research-control.json']]) {
      await writeFile(join(directory, target), await readFile(new URL(source, import.meta.url)), { flag: 'wx', mode: 0o600 });
    }
    console.log('Private controller files created. Research is disabled; no accounts, jobs or schedules were touched.');
  } else {
    const config = validateControllerConfig(await readPrivateJson(join(directory, 'controller-config.json')));
    const status = await controllerStatus(directory, config);
    if (command === 'status' || status.status !== 'Ready' || !config.job_ids.length) console.log(JSON.stringify(status, null, 2));
    else {
      const google = await readPrivateJson(join(directory, 'google-config.json'));
      const stopped = new AbortController(), stop = () => stopped.abort(new DOMException('Controller stopped by operator', 'AbortError'));
      process.on('SIGINT', stop); process.on('SIGTERM', stop);
      try {
        const result = await runController({ directory, config, queue: new GoogleQueue({ ...google, minRequestIntervalMs: 1250 }), signal: stopped.signal, once: args.includes('--once') });
        console.log(JSON.stringify(result, null, 2));
      } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
    }
  }
} catch (error) {
  console.error(`Controller stopped (${error.code ?? error.name}); inspect the private configuration and state. No blind retry.`);
  process.exitCode = 1;
}
