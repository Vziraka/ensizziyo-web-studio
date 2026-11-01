import { ApolloTestConnection, apolloHash, unwrapApollo } from './apollo.mjs';
import { dailyCallQueue } from './call-queue.mjs';
export { dailyCallQueue } from './call-queue.mjs';

const check = (condition, message) => { if (!condition) throw Error(message); };
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
const dated = value => typeof value === 'string' && /Z$|[+-]\d\d:\d\d$/.test(value) && Number.isFinite(Date.parse(value));
const methods = { profile: 'users_api_profile', contact_search: 'contacts_search', account_create: 'accounts_create',
  contact_create: 'contacts_create', task_search: 'tasks_search', task_create: 'tasks_create', task_show: 'tasks_show',
  fixture_complete: 'tasks_complete', call_skip: 'tasks_skip' };
const reads = new Set(['profile', 'contact_search', 'task_search', 'task_show']);
const outcomes = new Set(['no_answer', 'busy', 'voicemail', 'callback', 'interested', 'requested_info', 'decline', 'bad_number', 'skipped']);
const emailTaskMessage = { subject: '[STUDIO TEST] Unsent no-answer handoff',
  body_text: 'CONTROLLED TEST — fictional food/beverage business. No actual call was placed. This unsent email task verifies the no-answer handoff only. Do not send.' };

export function callOutcomeRoute(event, stopped = false) {
  if (stopped || event?.verified === true && event.outcome === 'decline') return { action: 'stop' };
  if (event?.verified !== true) return { action: 'hold' };
  return { action: ({ no_answer: 'email', busy: 'email', voicemail: 'email', callback: 'callback',
    interested: 'discovery', requested_info: 'information', bad_number: 'hold', skipped: 'hold' })[event.outcome] ?? 'hold' };
}

// Shares the existing private ledger/lock; the connected app remains the only executor.
export class ApolloCallQueue extends ApolloTestConnection {
  static async open(options) {
    const c = options.config, q = c?.daily_queue;
    check(c?.enabled === false && !c.reply_monitor?.enabled, 'Outbound and the old reply monitor must remain disabled');
    check(q && typeof q.enabled === 'boolean' && Array.isArray(q.cases) && q.cases.length > 0 && q.cases.length <= 10, 'Explicit bounded controlled queue required');
    check(new Set(q.cases.map(x => x.id)).size === q.cases.length, 'Duplicate case IDs');
    for (const item of q.cases) {
      check(/^[a-z][a-z-]{1,24}$/.test(item.id ?? '') && outcomes.has(item.outcome), 'Invalid fictional case or outcome');
      check(item.outcome !== 'callback' || dated(item.callback_at), 'Callback requires an exact dated time');
    }
    const base = await ApolloTestConnection.open(options);
    const connection = new ApolloCallQueue(base.directory, base.config, base.now, base.session);
    await connection.change(state => {
      const identity = apolloHash(q.cases);
      if (!state.daily_queue) state.daily_queue = { identity, records: Object.fromEntries(q.cases.map(item => [item.id, { tasks: {}, empty_tasks: {}, events: [], stopped: false }])) };
      check(state.daily_queue.identity === identity, 'Queue scope changed; preserve and reconcile the original state');
    });
    return connection;
  }
  scope(caseId) {
    const item = this.config.daily_queue.cases.find(x => x.id === caseId);
    check(item, 'Case is outside the controlled allowlist');
    return { ...item, name: `STUDIO TEST ${this.config.run_id} ${caseId}`, email: `${caseId}.${this.config.run_id}@example.invalid`,
      domain: `${caseId}.${this.config.run_id}.invalid` };
  }
  taskType(record, kind) {
    if (kind === 'call') return 'call';
    if (kind === 'fixture') return 'action_item';
    const route = callOutcomeRoute(record.events.at(-1), record.stopped).action;
    check(['email', 'callback', 'discovery', 'information'].includes(route), 'A verified eligible outcome is required before handoff');
    return route === 'email' ? 'outreach_manual_email' : route === 'callback' ? 'call' : 'action_item';
  }
  taskOwned(task, record, scope, kind) {
    const previous = record.tasks[kind];
    // The connector's compact get-task projection omits owner/account fields.
    const owner = task && Object.hasOwn(task, 'user_id') ? task.user_id : previous?.id === task?.id ? previous.user_id : null;
    check(id(task?.id) && task.title === `${scope.name} ${kind}` && owner === this.config.user_id &&
      (task.contact_id ?? task.contact?.id) === record.contact?.id && (!task.contact_id || !task.contact?.id || task.contact_id === task.contact.id) &&
      (!task.account_id || task.account_id === record.account?.id) && !task.emailer_campaign_id && !task.sequence_id &&
      task.type === this.taskType(record, kind) && ['scheduled', 'completed', 'skipped'].includes(task.status), 'Foreign or malformed standalone queue task');
    check(!record.tasks[kind] || record.tasks[kind].id === task.id, 'Task mapping changed or duplicate task found');
    if (task.type === 'outreach_manual_email') {
      check(task.pending_send !== true && task.emailer_message?.status === 'drafted', 'Email task is no longer an unsent draft');
      if (task.standalone_outreach_task_message) check(apolloHash(task.standalone_outreach_task_message) === apolloHash(emailTaskMessage), 'Email task message changed');
    }
    if (kind === 'handoff' && task.type === 'call') check(task.priority === 'high' && dated(task.due_at) &&
      Date.parse(task.due_at) === Date.parse(scope.callback_at), 'Callback time or priority changed');
    return { id: task.id, title: task.title, type: task.type, status: task.status, user_id: owner,
      contact_id: record.contact.id, account_id: record.account.id, due_at: task.due_at, priority: task.priority, note: task.note, completed_at: task.completed_at ?? previous?.completed_at,
      standalone_outreach_task_message: task.standalone_outreach_task_message };
  }
  async prepare(key, operation, caseId, kind = 'call') {
    check(/^[a-zA-Z0-9_-]{1,80}$/.test(key ?? ''), 'Invalid action key');
    check(Object.hasOwn(methods, operation), 'Unsupported queue operation; no email sending or sequence actions');
    check(['call', 'fixture', 'handoff'].includes(kind), 'Unsupported task kind');
    const scope = operation === 'profile' ? null : this.scope(caseId);
    return this.change(state => {
      const q = state.daily_queue, record = scope && q.records[caseId], options = { case_id: scope ? caseId : null, kind };
      const previous = state.actions[key];
      if (previous) {
        check(previous.operation === `queue_${operation}` && apolloHash(previous.options) === apolloHash(options), 'Action key conflicts');
        check(previous.status === 'Done', 'Pending/uncertain action requires readback; never replay a mutation');
        return { key, already_done: true };
      }
      if (!reads.has(operation)) {
        check(this.config.daily_queue.enabled, 'Controlled queue mutations are disabled');
        check(q.verified_session === this.session, 'Verify the Apollo owner in this session before mutations');
        check(!Object.values(state.actions).some(a => a.operation.startsWith('queue_') && !reads.has(a.operation.slice(6)) && a.status === 'Pending' && a.options.case_id === caseId), 'Pending/uncertain mutation blocks this case; reconcile');
      }
      if (['account_create', 'contact_create'].includes(operation) && record[operation === 'account_create' ? 'account' : 'contact']) return { key, already_done: true };
      let input;
      if (operation === 'profile') { input = { include_credit_usage: false }; q.verified_session = null; }
      else if (operation === 'contact_search') { input = { q_keywords: scope.email, page: 1, per_page: 10 }; record.contact_session = null; }
      else if (operation === 'account_create') {
        check(record.contact_search_empty, 'Exact empty contact search required'); input = { name: scope.name, domain: scope.domain };
      } else if (operation === 'contact_create') {
        check(record.account && record.contact_search_empty, 'Observed account and exact empty contact search required');
        input = { first_name: 'STUDIO TEST', last_name: caseId, organization_name: scope.name, email: scope.email, account_id: record.account.id };
      } else {
        check(record.contact && record.contact_session === this.session, 'Refresh the exact fictional contact in this session');
        const title = `${scope.name} ${kind}`, selected = record.tasks[kind];
        if (operation === 'task_search') input = { contact_id: record.contact.id, user_id: this.config.user_id, q_keywords: title, task_status: 'scheduled', page: 1, per_page: 10, sort_by_field: 'task_due_at', sort_ascending: true };
        else if (operation === 'task_create') {
          const type = this.taskType(record, kind);
          if (selected) return { key, already_done: true };
          check(!record.stopped && record.empty_tasks[kind], 'Stopped case or missing exact empty task search');
          const event = record.events.at(-1), route = callOutcomeRoute(event, record.stopped).action;
          input = { contact_id: record.contact.id, user_id: this.config.user_id, type, title, status: 'scheduled',
            priority: kind === 'handoff' && route === 'callback' ? 'high' : 'low',
            due_at: kind === 'handoff' && route === 'callback' ? scope.callback_at : this.now().toISOString(),
            note: 'CONTROLLED TEST — DO NOT DIAL OR SEND. Fictional record; no phone number. ' +
              (kind === 'fixture' ? `Run the local ${scope.outcome} simulation, then complete this action item only.` : kind === 'handoff' ? `Verified simulated ${event.outcome}; ${route} handoff only, no real contact.` : 'Call queue display only. Simulate outcomes in the separate action item.') };
          if (kind === 'handoff' && route === 'email') input.standalone_outreach_task_message = structuredClone(emailTaskMessage);
        } else {
          check(selected?.id, 'Read an owned task ID first');
          if (operation === 'task_show') { selected.read_session = null; input = { id: selected.id }; }
          else {
            check(selected.read_session === this.session && selected.status === 'scheduled', 'Fresh scheduled task readback required before a mutation');
            if (operation === 'fixture_complete') {
              check(kind === 'fixture' && record.performed, 'Run the local simulation before completing its action item');
              input = { id: selected.id, note: `CONTROLLED TEST — no phone call placed.\nSTUDIO_TEST_OUTCOME ${JSON.stringify(record.performed)}` };
            } else { check(operation === 'call_skip' && kind === 'call', 'Only an unperformed test call can be skipped'); input = { id: selected.id, note: 'CONTROLLED TEST — no call placed; simulation uses a separate action item.' }; }
          }
        }
      }
      state.actions[key] = { operation: `queue_${operation}`, options, input, hash: apolloHash(input), status: 'Pending', prepared_at: this.now().toISOString() };
      return { key, operation, tool: `mcp__codex_apps__apollo_io_apollo_${methods[operation]}`, input };
    });
  }
  async performFixture(caseId) {
    const scope = this.scope(caseId);
    return this.change(state => {
      check(this.config.daily_queue.enabled, 'Controlled queue is disabled');
      const record = state.daily_queue.records[caseId], task = record.tasks.fixture;
      check(task?.status === 'scheduled' && task.read_session === this.session, 'Read the scheduled simulation action item first');
      if (!record.performed) {
        check(scope.outcome !== 'callback' || Date.parse(scope.callback_at) > +this.now(), 'Requested callback must be in the future');
        record.performed = { id: `fixture:${task.id}`, outcome: scope.outcome, at: this.now().toISOString(), ...(scope.outcome === 'callback' ? { callback_at: scope.callback_at } : {}) };
      }
      return { simulated: true, outcome: record.performed.outcome, real_outreach: 0 };
    });
  }
  async settle(key, raw) {
    return this.change(state => {
      const action = state.actions[key]; check(action?.status === 'Pending' && action.operation.startsWith('queue_'), 'Exact pending queue action required');
      const operation = action.operation.slice(6), { case_id: caseId, kind } = action.options, q = state.daily_queue;
      const data = unwrapApollo(raw), scope = caseId && this.scope(caseId), record = caseId && q.records[caseId];
      if (operation === 'profile') { check(data.id === this.config.user_id, 'Apollo account owner changed'); q.verified_session = this.session; }
      else if (operation === 'account_create') {
        const account = data.account;
        // Apollo reduces these reserved test subdomains to the run's registrable domain.
        check(id(account?.id) && account.name === scope.name && action.input.domain === scope.domain &&
          [scope.domain, `${this.config.run_id}.invalid`].includes(account.domain), 'Foreign fictional company');
        record.account = { id: account.id, name: account.name, domain: account.domain };
      } else if (['contact_search', 'contact_create'].includes(operation)) {
        const contacts = operation === 'contact_create' ? [data.contact] : data.contacts;
        check(Array.isArray(contacts) && contacts.length <= 1 && (!data.pagination || data.pagination.total_pages <= 1), 'Ambiguous/incomplete fictional contact readback');
        record.contact_search_empty = contacts.length === 0;
        if (contacts.length) {
          const contact = contacts[0];
          check(id(contact?.id) && contact.email === scope.email && contact.first_name?.toLowerCase() === 'studio test' && contact.organization_name === scope.name &&
            record.account && contact.account_id === record.account.id && (!record.contact || record.contact.id === contact.id) &&
            !(contact.phone_numbers?.length) && !(contact.contact_campaign_statuses?.length), 'Foreign or externally activated fictional contact');
          record.contact = { id: contact.id, email: contact.email, account_id: contact.account_id }; record.contact_session = this.session;
          for (const pending of Object.values(state.actions)) if (pending.operation === 'queue_contact_create' && pending.status === 'Pending' && pending.options.case_id === caseId) Object.assign(pending, { status: 'Done', reconciled_by: key });
        }
      } else if (operation === 'task_search') {
        check(Array.isArray(data.tasks) && data.tasks.length <= 1 && (!data.pagination || data.pagination.total_pages <= 1), 'Ambiguous/incomplete task search');
        record.empty_tasks[kind] = data.tasks.length === 0;
        for (const rawTask of data.tasks) {
          const task = this.taskOwned(rawTask, record, scope, kind);
          const pending = Object.values(state.actions).find(a => a.operation === 'queue_task_create' && a.status === 'Pending' && a.options.case_id === caseId && a.options.kind === kind);
          check(record.tasks[kind] || pending, 'Unowned preexisting task requires reconciliation');
          record.tasks[kind] = task;
          if (pending) Object.assign(pending, { status: 'Done', reconciled_by: key, finished_at: this.now().toISOString() });
        }
      } else {
        const task = this.taskOwned(data.task ?? data, record, scope, kind);
        check(operation !== 'task_create' || task.status === 'scheduled' && dated(task.due_at), 'New task must be scheduled with a due date');
        check(operation !== 'fixture_complete' || task.status === 'completed', 'Fixture completion was not confirmed');
        check(operation !== 'call_skip' || task.status === 'skipped', 'Test call skip was not confirmed');
        record.tasks[kind] = task;
        if (operation === 'task_show') {
          if (task.type === 'outreach_manual_email') check(task.standalone_outreach_task_message, 'Readback omitted the unsent email task content');
          task.read_session = this.session;
          if (kind === 'fixture' && task.status === 'completed') {
            const matches = [...(task.note ?? '').matchAll(/STUDIO_TEST_OUTCOME (\{[^\r\n]*\})/g)];
            check(record.performed && matches.length === 1 && apolloHash(JSON.parse(matches[0][1])) === apolloHash(record.performed), 'Missing/conflicting saved simulation outcome');
            check(Date.parse(record.performed.at) <= +this.now() && (!task.completed_at || dated(task.completed_at) && Date.parse(task.completed_at) >= Date.parse(record.performed.at)), 'Outcome completion time is invalid');
            const event = { ...record.performed, verified: true, source: 'apollo_fixture_readback' };
            const existing = record.events.find(e => e.id === event.id);
            check(!existing || apolloHash(existing) === apolloHash(event), 'Conflicting duplicate outcome');
            if (!existing) record.events.push(event);
            if (event.outcome === 'decline') record.stopped = true;
          }
          for (const pending of Object.values(state.actions)) if (['queue_fixture_complete', 'queue_call_skip'].includes(pending.operation) && pending.status === 'Pending' && pending.input.id === task.id &&
            (pending.operation === 'queue_fixture_complete' ? record.events.length > 0 && task.status === 'completed' : task.status === 'skipped')) Object.assign(pending, { status: 'Done', reconciled_by: key });
        }
      }
      action.status = 'Done'; action.finished_at = this.now().toISOString();
      return { key, operation, status: 'Done', real_outreach: 0 };
    });
  }
  async queueStatus() {
    const state = await this.state(), records = state.daily_queue.records;
    const summary = Object.entries(records).map(([caseId, r]) => ({ case_id: caseId, company_id: r.account?.id,
      action: callOutcomeRoute(r.events.at(-1), r.stopped).action, verified_outcomes: r.events.length,
      tasks: Object.fromEntries(Object.entries(r.tasks).map(([kind, t]) => [kind, { id: t.id, type: t.type, status: t.status, due_at: t.due_at }])) }));
    const calls = summary.flatMap(r => Object.entries(r.tasks).filter(([, t]) => t.type === 'call').map(([kind, t]) => ({ ...t, company_id: r.company_id,
      kind: kind === 'handoff' ? 'callback' : 'new', stopped: r.action === 'stop' })));
    return { mode: 'controlled-test', records: summary, due_call_queue: dailyCallQueue(calls, this.now()), real_businesses_contacted: 0, actual_calls: 0, emails_sent: 0 };
  }
}
