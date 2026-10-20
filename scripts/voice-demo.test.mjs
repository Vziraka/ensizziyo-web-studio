import assert from 'node:assert/strict';
import {test} from 'node:test';
import {enquiryFields, observeSession} from '../site/studio/demos/voice/session.mjs';

test('keeps only bounded text fields from a fictional enquiry', () => {
  assert.deepEqual(enquiryFields({
    name: '  Casey\nExample  ', contact: '202-555-0108', service: 'x'.repeat(200),
    location: 'Fairfax', preferred_time: 'Tomorrow afternoon', extra: 'ignored',
  }), {name: 'Casey Example', contact: '202-555-0108', service: 'x'.repeat(160), location: 'Fairfax', time: 'Tomorrow afternoon'});
  for (const invalid of [null, undefined, 'wrong shape', {name: {}, contact: 123, service: '  '}]) {
    assert.deepEqual(enquiryFields(invalid), {name: 'Not provided', contact: 'Not provided', service: 'Not provided', location: 'Not provided', time: 'Not provided'});
  }
});

test('observing a session preserves original callbacks, arguments, context and return values', () => {
  const order = [], payload = {role: 'agent', message: 'What time works for you?'};
  const session = {options: {onMessage(message) { assert.equal(this, session.options); order.push(['widget', message]); return 'original result'; }}, endSession() {}};
  assert.equal(observeSession(session, {onMessage: message => order.push(['page', message])}, () => true), true);
  assert.equal(session.options.onMessage(payload), 'original result');
  assert.deepEqual(order, [['widget', payload], ['page', payload]]);
});

test('stale callbacks keep the widget behavior without changing the current page', async () => {
  let originalCalls = 0, pageCalls = 0, ended = 0;
  const session = {options: {onConnect() { originalCalls++; }, onMessage() { originalCalls++; }}, async endSession() { ended++; }};
  observeSession(session, {onConnect() { pageCalls++; }, onMessage() { pageCalls++; }}, () => false);
  session.options.onMessage({role: 'agent', message: 'Old session'});
  session.options.onConnect({});
  await Promise.resolve();
  assert.equal(originalCalls, 2);
  assert.equal(pageCalls, 0);
  assert.equal(ended, 1);
});

test('UI observation leaves agent settings and tool bindings unchanged', () => {
  const capture = () => 'Original tool result';
  const options = {agentId: 'existing-agent', clientTools: {capture_enquiry: capture}, overrides: undefined};
  const session = {options, async endSession() {}};
  observeSession(session, {onDisconnect() {}}, () => true);
  assert.equal(session.options, options);
  assert.equal(options.agentId, 'existing-agent');
  assert.equal(options.clientTools.capture_enquiry, capture);
  assert.equal(options.clientTools.capture_enquiry(), 'Original tool result');
  assert.equal(options.overrides, undefined);
});

test('unknown widget contracts retain the native widget instead of installing incomplete observers', () => {
  assert.equal(observeSession({}, {onMessage() { assert.fail('Must not run'); }}, () => true), false);
  assert.equal(observeSession({options: {}}, {}, () => true), false);
});
