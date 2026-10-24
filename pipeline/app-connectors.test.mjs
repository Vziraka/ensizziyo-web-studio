import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { AppConnectors, connectorName } from './app-connectors.mjs';

function transport({ approval = false, silent = false, linked = false } = {}) {
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
    if (linked) for (const name of ['gmail.get_profile', 'gmail.send_email', 'google_calendar.get_profile', 'google_calendar.get_availability', 'google_calendar.create_event','google_drive.get_profile','google_drive.get_file_metadata','google_drive.fetch']) {
      results['mcpServerStatus/list'].data[0].tools[name] = { name, inputSchema: { properties: { link_id: { type: 'string' } }, required: ['link_id'] } };
      if(name==='google_drive.fetch')Object.assign(results['mcpServerStatus/list'].data[0].tools[name].inputSchema.properties,{url:{},download_raw_file:{},include_base64:{}});
    }
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
  assert.equal(connectorName('mcp__codex_apps__google_drive_fetch'),'google_drive.fetch');
  assert.throws(()=>connectorName('mcp__codex_apps__google_drive_upload_file'),/allowlist/);
  assert.equal(connectorName('mcp__codex_apps__gmail_get_profile'), 'gmail.get_profile');
  assert.equal(connectorName('mcp__codex_apps__apollo_io_apollo_tasks_show'), 'apollo_io.apollo_tasks_show');
  assert.equal(connectorName('mcp__codex_apps__apollo_io_apollo_mixed_people_api_search'), 'apollo_io.apollo_mixed_people_api_search');
  assert.throws(() => connectorName('mcp__codex_apps__apollo_io_apollo_people_match'), /allowlist/);
  assert.equal(connectorName('mcp__codex_apps__gmail_send_email'), 'gmail.send_email');
  assert.throws(() => connectorName('mcp__codex_apps__gmail_delete_email'), /allowlist/);
  assert.throws(() => connectorName('mcp__other__gmail_get_profile'), /allowlist/);
});
test('Drive transport requires the configured account and exact raw-file request without inline bytes',async()=>{
 const p=transport({linked:true}),c=new AppConnectors({launch:p.launch,accountLinks:{google_drive:'link_business'}});try{
  await c.connect();await c.call('mcp__codex_apps__google_drive_get_profile',{});
  for(const input of [{url:'file:///C:/secret',download_raw_file:true,include_base64:false},{url:'https://drive.google.com/file/d/original-file-123456/view',download_raw_file:true,include_base64:true},{url:'https://drive.google.com/file/d/original-file-123456/view',download_raw_file:true,include_base64:false,link_id:'link_personal'}])await assert.rejects(c.call('mcp__codex_apps__google_drive_fetch',input),/raw originals|account/);
  await c.call('mcp__codex_apps__google_drive_fetch',{url:'https://drive.google.com/file/d/original-file-123456/view',download_raw_file:true,include_base64:false});
  const calls=p.requests.filter(r=>r.method==='mcpServer/tool/call');assert.equal(calls.length,2);assert.equal(calls[1].params.arguments.link_id,'link_business');
 }finally{await c.close();}
});

test('Google reads and writes use the configured accounts without changing caller inputs or Apollo', async () => {
  const p = transport({ linked: true }), accountLinks = { gmail: 'link_businessmail', google_calendar: 'link_businesscalendar' };
  const c = new AppConnectors({ launch: p.launch, accountLinks });
  accountLinks.gmail = 'link_personal';
  try {
    await c.connect();
    const input = {};
    for (const name of ['gmail_get_profile', 'gmail_send_email', 'google_calendar_get_profile', 'google_calendar_get_availability', 'google_calendar_create_event'])
      await c.call(`mcp__codex_apps__${name}`, input);
    assert.deepEqual(input, {});
    const calls = p.requests.filter(r => r.method === 'mcpServer/tool/call');
    assert.deepEqual(calls.map(r => r.params.arguments.link_id), ['link_businessmail', 'link_businessmail', 'link_businesscalendar', 'link_businesscalendar', 'link_businesscalendar']);
    await assert.rejects(c.call('mcp__codex_apps__gmail_send_email', { link_id: 'link_personal' }), /account/);
    assert.equal(p.requests.filter(r => r.method === 'mcpServer/tool/call').length, 5);
    await c.call('mcp__codex_apps__apollo_io_apollo_users_api_profile', {});
    assert.equal(p.requests.at(-1).params.arguments.link_id, undefined);
  } finally { await c.close(); }
});

test('missing account selection or a provider without explicit routing cannot fall back to a default', async () => {
  for (const linked of [true, false]) {
    const p = transport({ linked }), c = new AppConnectors({ launch: p.launch, ...(linked ? {} : { accountLinks: { gmail: 'link_businessmail' } }) });
    try {
      await c.connect();
      await assert.rejects(c.call('mcp__codex_apps__gmail_get_profile', {}), /fields|account/);
      assert.equal(p.requests.some(r => r.method === 'mcpServer/tool/call'), false);
    } finally { await c.close(); }
  }
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
