import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { subscriptionEnvironment } from './workers.mjs';

const permitted = new Set([
  'search_service.web_run',
  'apollo_io.apollo_users_api_profile', 'apollo_io.apollo_email_accounts_index', 'apollo_io.apollo_contacts_search', 'apollo_io.apollo_mixed_people_api_search',
  'apollo_io.apollo_contacts_create', 'apollo_io.apollo_contacts_update', 'apollo_io.apollo_accounts_search', 'apollo_io.apollo_accounts_create',
  'apollo_io.apollo_fields_index', 'apollo_io.apollo_emailer_campaigns_search', 'apollo_io.apollo_emailer_campaigns_remove_or_stop_contact_ids',
  'apollo_io.apollo_labels_index', 'apollo_io.apollo_labels_add_entity_ids_to_label_names',
  'apollo_io.apollo_emailer_messages_create', 'apollo_io.apollo_emailer_messages_send_now', 'apollo_io.apollo_emailer_messages_email_send_status',
  'apollo_io.apollo_tasks_create', 'apollo_io.apollo_tasks_show', 'apollo_io.apollo_tasks_search', 'apollo_io.apollo_tasks_skip',
  'gmail.get_profile', 'gmail.search_email_ids', 'gmail.read_email_thread', 'gmail.send_email',
  'google_calendar.get_profile', 'google_calendar.get_availability', 'google_calendar.create_event',
  'google_calendar.search_events', 'google_calendar.read_event'
]);
export function connectorName(name) {
  for (const prefix of ['apollo_io', 'google_calendar', 'gmail', 'search_service']) {
    const start = `mcp__codex_apps__${prefix}_`;
    if (name?.startsWith(start)) {
      const native = `${prefix}.${name.slice(start.length)}`;
      if (permitted.has(native)) return native;
    }
  }
  throw Error('Connector tool is outside the studio dispatcher allowlist');
}

// Only the local deterministic dispatcher uses this client. It never starts a model turn.
export class AppConnectors {
  constructor({ launch = spawn, timeoutMs = 30_000, cwd, signal, conversationRef = 'm8q2r7v4p9', accountLinks = {} } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw Error('Invalid connector timeout');
    this.launch = launch; this.timeoutMs = timeoutMs; this.cwd = cwd; this.signal = signal; this.conversationRef = conversationRef;
    this.accountLinks = { ...accountLinks };
    for (const [provider, link] of Object.entries(this.accountLinks)) {
      if (!['gmail', 'google_calendar'].includes(provider) || link !== undefined && (typeof link !== 'string' || !/^link_[a-zA-Z0-9]+$/.test(link)))
        throw Error('Invalid configured Google account link');
    }
    this.pending = new Map(); this.sequence = 0; this.bytes = 0; this.closed = false;
  }
  async connect() {
    this.signal?.throwIfAborted();
    if (this.child || this.closed) throw Error('Connector session has already been used');
    this.child = this.launch(process.platform === 'win32' ? 'codex.exe' : 'codex', [
      'app-server', '--stdio', '--enable', 'apps', '--disable', 'plugins', '--disable', 'hooks', '--disable', 'shell_tool',
      '-c', 'web_search="disabled"', '-c', 'mcp_servers={}'
    ], { env: subscriptionEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.stopped = new Promise(resolve => this.child.once('close', resolve));
    const fail = () => this.fail('Authenticated connector process unavailable');
    this.child.once('error', fail); this.child.once('close', fail); this.child.stdin.on('error', fail);
    this.child.stderr.on('data', data => { this.bytes += data.length; if (this.bytes > 40_000_000) this.fail('Connector response bound exceeded'); });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => this.receive(line));
    this.abort = () => this.fail('Connector operation interrupted; reconcile any pending mutation');
    this.signal?.addEventListener('abort', this.abort, { once: true });
    await this.rpc('initialize', { clientInfo: { name: 'studio_operations', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    this.write({ method: 'initialized', params: {} });
    const account = await this.rpc('account/read', { refreshToken: false });
    if (account.account?.type !== 'chatgpt') throw Error('Use the existing ChatGPT sign-in; paid model API authentication is not enabled');
    const started = await this.rpc('thread/start', { ephemeral: true, cwd: this.cwd,
      baseInstructions: 'Deterministic Studio Operations connector session. No model turns, shell actions, delegated work or automatic approval of requests.' });
    this.threadId = started.thread?.id;
    if (!this.threadId) throw Error('Connector session returned no thread identity');
    const catalog = await this.rpc('mcpServerStatus/list', { threadId: this.threadId, detail: 'toolsAndAuthOnly', limit: 100 });
    if (catalog.nextCursor) throw Error('Connector catalog is incomplete; no operation dispatched');
    const server = catalog.data?.find(s => s.name === 'codex_apps');
    if (!server || server.authStatus !== 'bearerToken') throw Error('Existing connected apps are not authenticated');
    this.tools = server.tools; return this;
  }
  write(message) {
    if (this.closed || !this.child) throw Error('Connector session is closed');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  receive(line) {
    this.bytes += Buffer.byteLength(line);
    if (this.bytes > 40_000_000 || Buffer.byteLength(line) > 12_000_000) return this.fail('Connector response bound exceeded');
    let m; try { m = JSON.parse(line); } catch { return this.fail('Malformed connector protocol response'); }
    if (m.id !== undefined && m.method) {
      // Provider approvals belong to the owner. Never answer an approval or token request affirmatively.
      this.approvalRequired = true;
      this.write({ id: m.id, error: { code: -32001, message: 'Owner action required; unattended Studio Operations cannot approve this request' } });
      return;
    }
    const waiting = this.pending.get(m.id); if (!waiting) return;
    this.pending.delete(m.id); clearTimeout(waiting.timer);
    if (m.error) waiting.reject(Error(this.approvalRequired ? 'Provider requires owner approval; operation held' : 'Connector RPC rejected; retain pending state and inspect the account'));
    else waiting.resolve(m.result);
  }
  rpc(method, params) {
    if (!['initialize', 'account/read', 'thread/start', 'mcpServerStatus/list', 'mcpServer/tool/call'].includes(method)) throw Error('Unsupported connector protocol method');
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(Error('Connector session is closed'));
      const id = ++this.sequence;
      const timer = setTimeout(() => this.fail('Connector timeout; reconcile any pending mutation'), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch { this.fail('Connector process input failed'); }
    });
  }
  async call(name, input) {
    this.signal?.throwIfAborted();
    const native = connectorName(name), tool = this.tools?.[native];
    if (!tool || tool.name !== native) throw Error('Prepared connector tool is unavailable or changed');
    if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 120_000) throw Error('Invalid bounded connector input');
    const args = native.startsWith('apollo_io.') ? { ...input, _conversation_ref: this.conversationRef,
      _rationale: 'Execute the exact authorized studio workflow instruction.' } : { ...input };
    const link = this.accountLinks[native.split('.')[0]];
    if (Object.hasOwn(input, 'link_id') && input.link_id !== link) throw Error('Requested account differs from the configured connector account');
    if (link) args.link_id = link;
    for (const field of tool.inputSchema.required ?? []) if (!Object.hasOwn(args, field)) throw Error('Connector required fields changed; no operation dispatched');
    if (tool.inputSchema.properties && Object.keys(args).some(key => !Object.hasOwn(tool.inputSchema.properties, key))) throw Error('Prepared connector fields differ from the current tool contract');
    const result = await this.rpc('mcpServer/tool/call', { threadId: this.threadId, server: 'codex_apps', tool: native, arguments: args });
    if (!result || !Array.isArray(result.content)) throw Error('Connector returned no authoritative receipt');
    if (this.approvalRequired) throw Error('Provider requires owner approval; operation held without automatic consent');
    return result;
  }
  fail(message) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error(message)); }
    this.pending.clear(); this.child?.kill();
  }
  async close() {
    this.fail('Connector session closed'); this.lines?.close(); this.signal?.removeEventListener('abort', this.abort);
    if (this.stopped) await this.stopped;
  }
}
