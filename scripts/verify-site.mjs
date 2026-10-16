import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve, sep} from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const pages = ['studio', 'sola-motion', 'pulse-motion', 'fieldwork-motion', 'forma-motion', 'arc-motion', 'relay-motion', 'homekind-motion', 'juniper-motion'];

async function expectAsset(pageFile, reference) {
  if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) return;
  const path = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!path) return;
  const asset = path.startsWith('/') ? resolve(root, `.${path}`) : resolve(dirname(pageFile), path);
  assert.ok(asset.startsWith(root.endsWith(sep) ? root : root + sep), `Reference outside site: ${reference}`);
  const info = await stat(asset);
  assert.ok(info.isFile() || info.isDirectory(), `Missing asset: ${reference}`);
}

for (const page of pages) {
  const file = join(root, page, 'index.html');
  const html = await readFile(file, 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  if (page === 'studio') {
    assert.match(html, /<form name="studio-inquiry" method="POST" data-netlify="true" hidden>/);
  } else {
    assert.match(html, /shared\/showreel\.mjs/);
    assert.match(html, /shared\/review-bridge\.mjs/);
  }
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) await expectAsset(file, reference);
}

assert.equal(await readFile(join(root, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
assert.ok(!Object.hasOwn(JSON.parse(await readFile(join(root, 'studio', 'data.json'), 'utf8')), 'inquiry'), 'Synthetic studio inquiry data must not ship');
await assert.rejects(stat(join(root, 'README.md')), {code: 'ENOENT'});
console.log('Verified nine private review entry points and their static HTML assets.');
