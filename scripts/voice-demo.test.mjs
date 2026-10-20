import assert from 'node:assert/strict';
import {test} from 'node:test';
import {enquiryFields, observeSession} from '../site/studio/demos/voice/session.mjs';
import {drawVoiceWave, mountVoiceWave} from '../site/studio/demos/voice/wave.mjs';

test('the dotted waveform flows between frames and stays inside its canvas at both call intensities', () => {
  const frame = (size, time, energy) => {
    const points = [];
    const context = {clearRect() {}, beginPath() {}, fill() {}, arc(x, y, radius) { points.push({x, y, radius}); }};
    drawVoiceWave(context, size, time, energy);
    for (const {x, y, radius} of points) {
      assert.ok(Number.isFinite(x + y + radius));
      assert.ok(x - radius >= 0 && x + radius <= size);
      assert.ok(y - radius >= 0 && y + radius <= size);
    }
    return points;
  };
  for (const size of [200, 255, 360]) {
    const still = frame(size, 0, 0), flowing = frame(size, 1, 0), speaking = frame(size, 1, 1);
    assert.ok(still.length > 3000);
    assert.equal(flowing.length, still.length);
    assert.notDeepEqual(still, flowing);
    assert.notDeepEqual(flowing, speaking);
    assert.ok(Math.abs(still[100].y - flowing[100].y) < size * .1);
  }
});

test('the waveform stops for reduced motion, hidden pages and hidden content, then resumes', () => {
  const names = ['window', 'document', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const events = {}, frames = new Map();
  let resize, id = 0, draws = 0;
  const media = {matches: false, addEventListener(name, callback) { events.motion = callback; }};
  const context = {setTransform() {}, clearRect() { draws++; }, beginPath() {}, arc() {}, fill() {}};
  const canvas = {hidden: true, getContext: () => context}, image = {hidden: false};
  const visual = {clientWidth: 360, querySelector: selector => selector === 'canvas' ? canvas : image};
  try {
    Object.assign(globalThis, {
      window: {devicePixelRatio: 3, matchMedia: () => media, addEventListener(name, callback) { events[name] = callback; }},
      document: {hidden: false, addEventListener(name, callback) { events[name] = callback; }},
      ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} },
      requestAnimationFrame(callback) { frames.set(++id, callback); return id; },
      cancelAnimationFrame(key) { frames.delete(key); },
    });
    mountVoiceWave(visual, {dataset: {}});
    assert.equal(canvas.hidden, false);
    assert.equal(image.hidden, true);
    assert.equal(canvas.width, 720);
    assert.equal(frames.size, 1);
    const [key, tick] = [...frames][0]; frames.delete(key); tick(100);
    assert.equal(draws, 2);
    assert.equal(frames.size, 1);
    media.matches = true; events.motion();
    assert.equal(canvas.hidden, true);
    assert.equal(image.hidden, false);
    assert.equal(frames.size, 0);
    media.matches = false; events.motion();
    assert.equal(frames.size, 1);
    document.hidden = true; events.visibilitychange();
    assert.equal(frames.size, 0);
    document.hidden = false; events.visibilitychange();
    assert.equal(frames.size, 1);
    visual.clientWidth = 0; resize();
    assert.equal(frames.size, 0);
    visual.clientWidth = 200; resize();
    assert.equal(canvas.width, 400);
    assert.equal(frames.size, 1);
    events.pagehide();
    assert.equal(frames.size, 0);
    events.pageshow();
    assert.equal(frames.size, 1);
  } finally {
    names.forEach((name, index) => saved[index] ? Object.defineProperty(globalThis, name, saved[index]) : delete globalThis[name]);
  }
});

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
