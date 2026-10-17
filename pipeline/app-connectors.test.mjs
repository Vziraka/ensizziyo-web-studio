import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { AppConnectors, connectorName } from './app-connectors.mjs';

function transport({ approval = false, silent = false } = {}) {
  const requests = []; let launches = 0, killed = 0, launchArgs;
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const reply = value => setImmediate(() => child.stdout.write(`${JSON.stringify(value)}\n`));
  child.stdin = new Writable({ write(data, encoding, callback) {
    const r = JSON.parse(data.toString()); requests.push(r);
    if (silent || !r.method || r.method === 'initialized') { callback(); return; }
    const results = {
      initialize: {}, 'account/read': { account: { type: 'chatgpt' } }, 'thread/start': { thread: { id: 'ephemeral-session' } },
      'mcpServerStatus/list': { data: [{ name: 'codex_apps', authStatus: 'bearerToken', tools: {
        'gmail.get_profile': { name: 'gmail.get_profile', inputSchema: { properties: {}, required: [] }, annotations: { readOnlyHint: true } },
        'apollo_io.apollo_users_api_profile': { name: 'apollo_io.apollo_users_api_profile', inputSchema: { properties: { include_credit_usage: {}, _conversation_ref: {}, _rationale: {} } } }
      } }] }
    };
    if (r.method === 'mcpServer/tool/call') {
      if (approval) reply({ id: 'approval-id', method: 'tool/requestUserInput', params: { questions: [] } });
      reply({ id: r.id, result: { content: [{ type: 'text', text: 'Original provider receipt' }], structuredContent: { email: 'owner@example.com' }, isError: false } });
    } else reply({ id: r.id, result: results[r.method] });
    callback();
  } });
  child.kill = () => { if (!killed++) setImmediate(() => { child.stdout.end(); child.emit('close', 0); }); };
  const launch = (command, args, options) => { launches++; launchArgs = { command, args, options }; return child; };
  return { launch, requests, get killed() { return killed; }, get launches() { return launches; }, get args() { return launchArgs; } };
}
test('supported connector mapping rejects arbitrary tools and namespace lookalikes', () => {
  assert.equal(connectorName('mcp__codex_apps__gmail_get_profile'), 'gmail.get_profile');
  assert.equal(connectorName('mcp__codex_apps__apollo_io_apollo_tasks_show'), 'apollo_io.apollo_tasks_show');
  assert.throws(() => connectorName('mcp__codex_apps__gmail_send_email'), /allowlist/);
  assert.throws(() => connectorName('mcp__other__gmail_get_profile'), /allowlist/);
});
test('direct account read uses existing authentication and an ephemeral session without any model turn', async () => {
  const p = transport(), c = new AppConnectors({ launch: p.launch, cwd: '/private/studio' });
  try {
    await c.connect(); const raw = await c.call('mcp__codex_apps__gmail_get_profile', {});
    assert.deepEqual(raw.structuredContent, { email: 'owner@example.com' }); assert.equal(raw.content[0].text, 'Original provider receipt');
    assert.equal(p.requests.find(r => r.method === 'thread/start').params.ephemeral, true);
    assert.equal(p.requests.some(r => r.method?.startsWith('turn/')), false);
    assert.equal(Object.keys(p.args.options.env).some(k => /API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k)), false);
    assert.equal(p.args.options.windowsHide, true);
  } finally { await c.close(); }
  assert.equal(p.killed, 1);
});
test('Apollo receives a generic rationale and stable reference; unknown fields dispatch nothing', async () => {
  const p = transport(), c = new AppConnectors({ launch: p.launch });
  try {
    await c.connect(); await c.call('mcp__codex_apps__apollo_io_apollo_users_api_profile', { include_credit_usage: false });
    const r = p.requests.find(r => r.method === 'mcpServer/tool/call');
    assert.equal(r.params.arguments._conversation_ref, 'm8q2r7v4p9'); assert.match(r.params.arguments._rationale, /authorized studio/);
    await assert.rejects(c.call('mcp__codex_apps__gmail_get_profile', { injected: 'value' }), /fields differ/);
    assert.equal(p.requests.filter(r => r.method === 'mcpServer/tool/call').length, 1);
  } finally { await c.close(); }
});
test('a provider approval request is refused and surfaced, never automatically accepted', async () => {
  const p = transport({ approval: true }), c = new AppConnectors({ launch: p.launch });
  try {
    await c.connect(); await assert.rejects(c.call('mcp__codex_apps__gmail_get_profile', {}), /owner approval/);
    const answer = p.requests.find(r => r.id === 'approval-id'); assert.equal(answer.error.code, -32001); assert.equal(answer.result, undefined);
  } finally { await c.close(); }
});
test('a protocol timeout stops only the owned connector process without a tool or model turn', async () => {
  const p = transport({ silent: true }), c = new AppConnectors({ launch: p.launch, timeoutMs: 15 });
  await assert.rejects(c.connect(), /timeout/); await c.close();
  assert.equal(p.killed, 1); assert.equal(p.requests.length, 1); assert.equal(p.requests[0].method, 'initialize');
});
