import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { codexUsage, readCodexUsage } from './usage.mjs';
import { modelArguments } from './workers.mjs';

const now = () => new Date('2026-10-15T12:00:00Z');
const account = { account: { type: 'chatgpt', email: 'fictional@example.com', planType: 'pro' } };
const limits = { rateLimitsByLimitId: {
  codex: { primary: { usedPercent: 10, resetsAt: 1792400000 }, secondary: { usedPercent: 65, resetsAt: 1792800000 } },
  codex_other: { primary: { usedPercent: 40, resetsAt: 1792400000 }, secondary: null }
} };

test('Codex allowance reader includes all windows, omits account identity and refuses unknown/stale/API-only metadata', () => {
  const result = codexUsage(account, limits, now);
  assert.deepEqual(result.buckets.map(b => b.remaining_percent), [90, 35, 60]);
  assert.ok(!JSON.stringify(result).includes('fictional@example.com'));
  assert.throws(() => codexUsage({ account: { type: 'apiKey' } }, limits, now), /subscription authentication/i);
  assert.throws(() => codexUsage(account, {}, now), /unavailable/i);
  assert.throws(() => codexUsage(account, { rateLimits: { primary: { usedPercent: 10, resetsAt: 1 } } }, now), /stale/i);
  assert.throws(() => codexUsage(account, { rateLimits: { primary: { usedPercent: null, resetsAt: 1792400000 } } }, now), /invalid/i);
  assert.throws(() => codexUsage(account, { rateLimits: { primary: null, secondary: null } }, now), /unavailable/i);
});

function transport(answers = {}) {
  const methods = [], child = new EventEmitter(); let closed = false;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { if (!closed) { closed = true; queueMicrotask(() => { child.stdout.end(); child.stderr.end(); child.emit('close', 0); }); } };
  child.stdin = new Writable({ write(chunk, encoding, done) {
    for (const line of chunk.toString().trim().split('\n')) {
      const request = JSON.parse(line); methods.push(request.method);
      const response = answers[request.method];
      if (request.id && response !== undefined) queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: request.id, result: response })}\n`));
    }
    done();
  } });
  return { child, methods, launch: (command, args, options) => {
    assert.equal(args[0], 'app-server'); assert.ok(!args.includes('--ignore-user-config'));
    assert.ok(!Object.keys(options.env).some(k => /API_KEY|TOKEN|SECRET/.test(k)));
    return child;
  } };
}

test('allowance transport completes the initialization handshake and sends metadata requests only', async () => {
  const t = transport({ initialize: {}, 'account/read': account, 'account/rateLimits/read': limits });
  const result = await readCodexUsage({ launch: t.launch, now, timeoutMs: 1000 });
  assert.deepEqual(t.methods, ['initialize', 'initialized', 'account/read', 'account/rateLimits/read']);
  assert.equal(result.buckets.length, 3);
});

test('an allowance protocol timeout closes only its own process and dispatches no model turn', async () => {
  const t = transport();
  await assert.rejects(readCodexUsage({ launch: t.launch, now, timeoutMs: 5 }), /unavailable/i);
  assert.deepEqual(t.methods, ['initialize']);
});

test('explicit models reach all three CLI argument lists; only Codex receives its documented effort setting', () => {
  assert.deepEqual(modelArguments('codex', { model: 'gpt-6-luna', effort: 'low' }), ['--model', 'gpt-6-luna', '-c', 'model_reasoning_effort="low"']);
  assert.deepEqual(modelArguments('claude', { model: 'sonnet', effort: 'high' }), ['--model', 'sonnet']);
  assert.deepEqual(modelArguments('cursor', { model: 'composer-2.5' }), ['--model', 'composer-2.5']);
  assert.throws(() => modelArguments('codex', { model: '--bad-model' }), /model/i);
});
