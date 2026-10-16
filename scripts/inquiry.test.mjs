import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sendInquiry, validateInquiry} from '../site/studio/inquiry.mjs';

const valid = {
  description: 'Please improve our booking flow.',
  name: 'Example Owner',
  email: 'owner@example.com',
  business: 'Example Studio',
  website: 'https://example.com',
  context: 'Pulse',
};

test('rejects missing and malformed inquiry details', () => {
  assert.deepEqual(validateInquiry({...valid, description: '', email: 'bad', website: 'javascript:alert(1)'}), {
    description: 'Tell us what you would like to improve.',
    email: 'Enter a complete email address.',
    website: 'Use a website address starting with https://, or leave it blank.',
  });
});

test('posts encoded details to the form service', async () => {
  let request;
  await sendInquiry({...valid, description: 'A & B'}, async (url, options) => {
    request = {url, options};
    return {ok: true};
  });
  assert.equal(request.url, '/studio/');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get('form-name'), 'studio-inquiry');
  assert.equal(body.get('description'), 'A & B');
  assert.equal(body.get('email'), valid.email);
});

test('never treats rejection or a network error as success', async () => {
  await assert.rejects(sendInquiry(valid, async () => ({ok: false})), /did not accept/);
  await assert.rejects(sendInquiry(valid, async () => { throw new Error('Offline'); }), /Offline/);
});
