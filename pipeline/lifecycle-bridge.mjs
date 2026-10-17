import { check, hash } from './lifecycle.mjs';
import { unwrapApollo } from './apollo.mjs';
import { readJson } from './engine.mjs';
import { join } from 'node:path';

const prefix = 'mcp__codex_apps__apollo_io_apollo_';
const taskTypes = { call_task: 'call', callback_task: 'call', email: 'outreach_manual_email', information_task: 'action_item' };
const methods = { profile: 'users_api_profile', contact: 'contacts_search', create_task: 'tasks_create', read_task: 'tasks_show', search_task: 'tasks_search' };
const validKey = value => /^[a-zA-Z0-9_-]{1,100}$/.test(value ?? '');
function identity(task, expected, existing, readback = false) {
  check(task?.id && task.title === expected.title && task.type === expected.type && task.status === 'scheduled' &&
    (task.contact_id ?? task.contact?.id) === expected.contact_id &&
    (Object.hasOwn(task, 'user_id') ? task.user_id : existing?.user_id) === expected.user_id &&
    (!Object.hasOwn(task, 'account_id') || task.account_id === expected.account_id) && !task.emailer_campaign_id && !task.sequence_id,
  'Provider task does not match the exact owned standalone request');
  check(!existing || existing.id === task.id, 'Provider task identity changed');
  check(task.note === expected.note && Math.floor(Date.parse(task.due_at) / 1000) === Math.floor(Date.parse(expected.due_at) / 1000), 'Provider changed the task note or due time');
  if (expected.type === 'outreach_manual_email') check(task.emailer_message?.status === 'drafted' && task.pending_send !== true &&
    (!readback && !task.standalone_outreach_task_message || hash(task.standalone_outreach_task_message) === hash(expected.standalone_outreach_task_message)), 'Controlled email must remain an exact unsent draft');
  return { id: task.id, user_id: expected.user_id, account_id: expected.account_id, contact_id: expected.contact_id,
    title: task.title, type: task.type, status: task.status, note: task.note, due_at: task.due_at, priority: task.priority,
    ...(task.emailer_message ? { message_id: task.emailer_message.id, email_status: task.emailer_message.status } : {}) };
}

// App connector calls are executed by the authenticated chat, never by extracting its credentials.
export class LifecycleBridge {
  constructor(app, session) { check(validKey(session), 'A fresh connected session token is required'); this.app = app; this.session = session; }
  async config() {
    const config = await readJson(join(this.app.directory, 'lifecycle-config.json'));
    check(config.mode === 'controlled' && config.research_enabled === false && config.outreach_enabled === false, 'This connector adapter only executes controlled, unsent tests');
    check(config.apollo?.user_id && config.apollo?.bindings, 'Explicit owner and controlled provider bindings required'); return config;
  }
  async prepare(key, operation, actionId, prospectId) {
    check(validKey(key) && methods[operation], 'Unsupported connector request');
    const config = await this.config();
    return this.app.change(state => {
      state.bridge ??= { operations: {}, contacts: {} };
      const bridge = state.bridge, old = bridge.operations[key], action = state.actions[actionId];
      if (old) { check(old.operation === operation && old.action_id === actionId && old.prospect_id === prospectId, 'Connector key conflict'); check(old.status === 'Done', 'Pending operation requires readback; never replay'); return { key, already_done: true }; }
      let input;
      if (operation === 'profile') { bridge.verified_session = null; input = { include_credit_usage: false }; }
      else {
        const record = state.prospects[prospectId], binding = config.apollo.bindings[prospectId];
        check(record?.controlled === true && binding?.email?.endsWith('@example.invalid') && binding.contact_id && binding.account_id, 'Only explicitly bound fictional contacts are allowed');
        if (operation === 'contact') { delete bridge.contacts[prospectId]; input = { q_keywords: binding.email, per_page: 10, page: 1 }; }
        else {
          check(action?.prospect_id === prospectId && taskTypes[action.type], 'Action is not an allowed call/email-task handoff');
          check(bridge.verified_session === this.session && bridge.contacts[prospectId]?.session === this.session, 'Verify owner and exact contact in this session');
          if (operation === 'create_task') {
            check(config.connector_writes_enabled === true && action.status === 'Queued', 'Writes disabled, cancelled or already dispatched');
            check(!record.restriction && (action.type !== 'email' || !record.cold_paused), 'Contact was held/stopped before handoff');
            const due = new Date(Math.floor(Date.parse(action.payload.due_at ?? this.app.now().toISOString()) / 1000) * 1000).toISOString();
            input = { user_id: config.apollo.user_id, account_id: binding.account_id, contact_id: binding.contact_id, type: taskTypes[action.type],
              title: `STUDIO TEST ${config.run_id} ${action.id}`, note: `CONTROLLED TEST — fictional record. No actual call; do not dial or send. ${action.type === 'email' ? 'Email follows the explicitly simulated no-answer outcome.' : 'Owner review/task handoff only.'}`,
              due_at: due, priority: action.type === 'callback_task' ? 'high' : 'low', status: 'scheduled' };
            if (action.type === 'email') input.standalone_outreach_task_message = { subject: '[STUDIO TEST] Unsent lifecycle handoff', body_text: 'CONTROLLED TEST — fictional business. This unsent draft checks the call-outcome handoff only. Do not send.' };
            action.status = 'Pending'; action.request = input; action.request_sha256 = hash(input); action.dispatched_at = this.app.now().toISOString();
          } else if (operation === 'read_task') {
            check(action.provider_task?.id && ['Awaiting readback', 'Uncertain', 'Verified'].includes(action.status), 'An exact provider task ID is needed for readback'); input = { id: action.provider_task.id };
          } else {
            check(['Pending', 'Uncertain'].includes(action.status) && action.request, 'Search only reconciles an uncertain saved task request');
            input = { user_id: config.apollo.user_id, contact_id: binding.contact_id, q_keywords: action.request.title, per_page: 10, page: 1, task_status: 'scheduled' };
          }
        }
      }
      const op = bridge.operations[key] = { key, operation, action_id: actionId, prospect_id: prospectId, input, status: 'Pending', session: this.session };
      return { key, operation, tool: `${prefix}${methods[operation]}`, input: op.input };
    });
  }
  async settle(key, raw) {
    const config = await this.config();
    try {
      return await this.app.change(state => {
        const op = state.bridge?.operations[key]; check(op?.status === 'Pending' && op.session === this.session, 'Unknown or already settled connector operation');
        const data = unwrapApollo(raw), action = state.actions[op.action_id];
        if (op.operation === 'profile') { check(data.id === config.apollo.user_id, 'Connected Apollo account differs from the owner'); state.bridge.verified_session = this.session; }
        else if (op.operation === 'contact') {
          const binding = config.apollo.bindings[op.prospect_id];
          check(data.contacts?.length === 1 && (!data.pagination || data.pagination.total_pages <= 1), 'Contact read is missing/ambiguous');
          const c = data.contacts[0]; check(c.id === binding.contact_id && c.account_id === binding.account_id && c.owner_id === config.apollo.user_id && c.email === binding.email && Array.isArray(c.phone_numbers) && c.phone_numbers.length === 0, 'Contact differs from the exact owned no-phone fictional record');
          state.bridge.contacts[op.prospect_id] = { id: c.id, account_id: c.account_id, session: this.session };
        } else if (op.operation === 'create_task') {
          action.provider_task = identity(data.task ?? data, action.request); action.status = 'Awaiting readback';
        } else if (op.operation === 'read_task') {
          action.provider_task = identity(data.task ?? data, action.request, action.provider_task, true); action.status = 'Verified'; delete action.hold; action.verified_at = this.app.now().toISOString();
        } else if (op.operation === 'search_task') {
          check(data.tasks?.length === 1 && (!data.pagination || data.pagination.total_pages <= 1), 'Uncertain creation not uniquely reconciled; do not resend');
          const task = data.tasks[0], expected = action.request;
          // Search omits note/owner/account; its exact owner+contact filters bind a candidate, detail readback still must pass.
          check(task.id && task.title === expected.title && task.type === expected.type && task.status === 'scheduled' &&
            (task.contact_id ?? task.contact?.id) === expected.contact_id && (!Object.hasOwn(task, 'user_id') || task.user_id === expected.user_id) &&
            (!Object.hasOwn(task, 'account_id') || task.account_id === expected.account_id) && Math.floor(Date.parse(task.due_at) / 1000) === Math.floor(Date.parse(expected.due_at) / 1000), 'Filtered task candidate differs from the saved request');
          action.provider_task = { id: task.id, user_id: expected.user_id, account_id: expected.account_id, ownership_basis: 'verified owner/contact search filters' }; action.status = 'Awaiting readback';
          for (const pending of Object.values(state.bridge.operations)) if (pending.operation === 'create_task' && pending.action_id === action.id && pending.status !== 'Done') { pending.status = 'Done'; pending.reconciled_by = key; }
        }
        op.status = 'Done'; op.receipt_sha256 = hash(raw); op.finished_at = this.app.now().toISOString();
        return { key, verified: true, action_status: action?.status ?? null };
      });
    } catch (error) {
      await this.app.change(state => { const op = state.bridge?.operations[key]; if (op?.status === 'Pending') { op.status = 'Held'; op.error = error.message; const a = state.actions[op.action_id]; if (a && a.status !== 'Verified') { a.status = 'Uncertain'; a.hold = error.message; } } });
      throw error;
    }
  }
}
