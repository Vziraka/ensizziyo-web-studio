import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperatorAuth } from './operators.mjs';

const keys = {
  EVZ_OPERATIONS_OWNER_KEY: 'o'.repeat(43),
  EVZ_OPERATIONS_FRIEND_KEY: 'f'.repeat(43),
  EVZ_OPERATIONS_SESSION_SECRET: 's'.repeat(43)
};

test('operator auth is opt-in and incomplete or reused credentials fail closed', () => {
  assert.equal(createOperatorAuth({}), null);
  assert.throws(() => createOperatorAuth({ EVZ_OPERATIONS_OWNER_KEY: keys.EVZ_OPERATIONS_OWNER_KEY }), /separate 32-byte/);
  assert.throws(() => createOperatorAuth({ ...keys, EVZ_OPERATIONS_FRIEND_KEY: keys.EVZ_OPERATIONS_OWNER_KEY }), /must be different/);
  assert.throws(() => createOperatorAuth({ ...keys, EVZ_OPERATIONS_SESSION_SECRET: 'short' }), /separate 32-byte/);
});

test('individual operator keys create distinct expiring signed sessions', () => {
  let time = 1_800_000_000_000;
  const auth = createOperatorAuth(keys, { now: () => time });
  assert.equal(auth.authenticate(keys.EVZ_OPERATIONS_OWNER_KEY), 'owner');
  assert.equal(auth.authenticate(keys.EVZ_OPERATIONS_FRIEND_KEY), 'friend');
  assert.equal(auth.authenticate('wrong'), null);

  const owner = auth.issue('owner'), friend = auth.issue('friend');
  assert.equal(auth.actorFromCookie(`other=x; evz_operator_session=${owner}`), 'owner');
  assert.equal(auth.actorFromCookie(`evz_operator_session=${friend}`), 'friend');
  assert.equal(auth.actorFromCookie(`evz_operator_session=${friend}x`), null);
  assert.equal(auth.actorFromCookie(`evz_operator_session=${owner.slice(0, -1)}x`), null);
  assert.match(auth.cookie(friend), /HttpOnly; SameSite=Strict/);
  assert.match(auth.cookie(friend, { secure: true }), /; Secure$/);
  assert.match(auth.cookie('', { clear: true }), /Max-Age=0/);

  time += 8 * 60 * 60 * 1000 + 1;
  assert.equal(auth.actorFromCookie(`evz_operator_session=${owner}`), null);
});
