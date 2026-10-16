import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve, sep} from 'node:path';
import {routeHref} from '../site/studio/views.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const studioPages = ['studio', 'studio/about', 'studio/services', 'studio/work', 'studio/inquiry', 'studio/privacy'];
const headings = {
  studio: 'We build digital products that help businesses grow.',
  'studio/about': 'Good work starts with<br>understanding your business.',
  'studio/services': 'What needs to work better?',
  'studio/work': 'Explore our work',
  'studio/inquiry': "Let's talk.",
  'studio/privacy': 'How we handle inquiries.',
};
const pages = [...studioPages, 'sola-motion', 'pulse-motion', 'fieldwork-motion', 'forma-motion', 'arc-motion', 'relay-motion', 'homekind-motion', 'juniper-motion'];

async function expectAsset(pageFile, reference) {
  if (/^(?:https?:|mailto:|tel:|data:|#)/i.test(reference)) return;
  const path = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!path) return;
  const asset = path.startsWith('/') ? resolve(root, `.${path}`) : resolve(pageFile.includes(`${sep}studio${sep}`) ? join(root, 'studio') : dirname(pageFile), path);
  assert.ok(asset.startsWith(root.endsWith(sep) ? root : root + sep), `Reference outside site: ${reference}`);
  const info = await stat(asset);
  assert.ok(info.isFile() || info.isDirectory(), `Missing asset: ${reference}`);
}

for (const page of pages) {
  const file = join(root, page, 'index.html');
  const html = await readFile(file, 'utf8');
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/shared\/favicon\.svg">/);
  if (studioPages.includes(page)) {
    assert.match(html, /<form name="studio-inquiry" method="POST" data-netlify="true" hidden>/);
    assert.ok(html.includes(`<h1>${headings[page]}</h1>`), `Wrong static heading: ${page}`);
    assert.doesNotMatch(html, /href="#(?:home|about|services|work|inquiry)(?:\/|\")/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<title>[^<]+ — EVZ Digital<\/title>/);
    assert.match(html, /<a class="wordmark" href="\/studio\/" aria-label="EVZ Digital home">EVZ<\/a>/);
    assert.match(html, /<a href="\/studio\/privacy\/">Privacy<\/a>/);
  } else {
    assert.match(html, /shared\/showreel\.mjs/);
    assert.match(html, /shared\/review-bridge\.mjs/);
  }
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) await expectAsset(file, reference);
}

assert.equal(await readFile(join(root, 'robots.txt'), 'utf8'), 'User-agent: *\nDisallow: /\n');
assert.ok(!Object.hasOwn(JSON.parse(await readFile(join(root, 'studio', 'data.json'), 'utf8')), 'inquiry'), 'Synthetic studio inquiry data must not ship');
assert.equal(routeHref('#services/systems'), '/studio/services/?service=systems');
assert.equal(routeHref('#work/Systems'), '/studio/work/?category=Systems');
assert.equal(routeHref('#inquiry/Arc'), '/studio/inquiry/?sample=Arc');
assert.equal(routeHref('#edit'), '/studio/inquiry/#edit');
assert.equal(routeHref('#privacy'), '/studio/privacy/');
await assert.rejects(stat(join(root, 'README.md')), {code: 'ENOENT'});
console.log('Verified six studio pages, eight demonstrations and their static HTML assets.');
