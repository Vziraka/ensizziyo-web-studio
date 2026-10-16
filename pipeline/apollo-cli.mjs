import { join } from 'node:path';
import { ApolloTestConnection, emailGate } from './apollo.mjs';
import { privateStateDirectory, readJson } from './engine.mjs';

// Transport stays in the authenticated Codex app. This CLI never reads browser cookies or API keys.
async function main() {
  const [command, key, operation, kind] = process.argv.slice(2);
  const directory = await privateStateDirectory(process.env.STUDIO_APOLLO_STATE_DIR);
  const session = process.env.STUDIO_APOLLO_SESSION;
  if (!session) throw Error('STUDIO_APOLLO_SESSION must identify this verified app session');
  const connection = await ApolloTestConnection.open({ directory, config: await readJson(join(directory, 'config.json')), session });
  if (command === 'prepare') return connection.prepare(key, operation, kind ? { kind } : {});
  if (command === 'settle' || command === 'event') {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key ?? '')) throw Error('Invalid private receipt key');
    const receipt = await readJson(join(directory, 'receipts', `${key}.json`));
    if (command === 'settle') return connection.settle(key, receipt);
    const flow = await connection.event(receipt);
    return { status: flow.status, simulated_calls: flow.calls.length, real_outreach: 0 };
  }
  if (command === 'status') return { projection: await connection.projection(), real_outreach: 0,
    email_gate: emailGate((await connection.state()).flow, new Date(), connection.config.time_zone) };
  throw Error('Use prepare, settle, event or status; production is not implemented');
}

try { console.log(JSON.stringify(await main())); }
catch (error) { console.error(error.message); process.exitCode = 1; }
