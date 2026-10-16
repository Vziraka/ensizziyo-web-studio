import { join } from 'node:path';
import { ApolloCallQueue } from './apollo-queue.mjs';
import { privateStateDirectory, readJson, saveJson } from './engine.mjs';

async function main() {
  const [command, key, operation, caseId, kind] = process.argv.slice(2);
  const directory = await privateStateDirectory(process.env.STUDIO_APOLLO_STATE_DIR);
  const session = process.env.STUDIO_APOLLO_SESSION;
  if (!session) throw Error('STUDIO_APOLLO_SESSION must identify this verified app session');
  const connection = await ApolloCallQueue.open({ directory, config: await readJson(join(directory, 'config.json')), session });
  if (command === 'prepare') return connection.prepare(key, operation, caseId, kind);
  if (command === 'fixture') return connection.performFixture(key);
  if (command === 'status') return connection.queueStatus();
  if (command === 'pause') return connection.change(async () => {
    const config = await readJson(join(directory, 'config.json'));
    config.daily_queue.enabled = false;
    await saveJson(join(directory, 'config.json'), config);
    return { controlled_queue_enabled: false, outbound_enabled: config.enabled };
  });
  if (command === 'settle') {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key ?? '')) throw Error('Invalid private receipt key');
    return connection.settle(key, await readJson(join(directory, 'receipts', `${key}.json`)));
  }
  throw Error('Use prepare, settle, fixture, status or pause; production sending is not implemented');
}
try { console.log(JSON.stringify(await main())); }
catch (error) { console.error(error.message); process.exitCode = 1; }
