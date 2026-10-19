import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve, sep} from 'node:path';
import {routeHref} from '../site/studio/views.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const studioPages = ['studio', 'studio/about', 'studio/services', 'studio/work', 'studio/inquiry', 'studio/privacy'];
const headings = {
  studio: 'AI solutions built around your business.',
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
const studioData = JSON.parse(await readFile(join(root, 'studio', 'data.json'), 'utf8'));
assert.ok(!Object.hasOwn(studioData, 'inquiry'), 'Synthetic studio inquiry data must not ship');
assert.ok(studioData.owner_reported_metrics, 'Restored studio figures must ship');
assert.equal(studioData.owner_reported_metrics.clients, 500);
assert.equal(studioData.owner_reported_metrics.projects_delivered, 1000);
assert.ok(studioData.testimonials, 'Restored reviews must ship');
assert.equal(studioData.testimonials.reviews.length, 4);
const studioHome = await readFile(join(root, 'studio', 'index.html'), 'utf8');
assert.match(studioHome, /data-count="500">500\+<\/strong>/);
assert.match(studioHome, /data-count="1000">1,000\+<\/strong>/);
assert.match(studioHome, /Client perspectives/);
assert.equal([...studioHome.matchAll(/class="review-card"/g)].length, 3);
assert.match(studioHome, /Maya Patel/);
assert.match(studioHome, /id="review-next"[^>]*><svg/);
assert.doesNotMatch(studioHome, /Pause motion/);
const privacy = await readFile(join(root, 'studio', 'privacy', 'index.html'), 'utf8');
assert.match(privacy, /use <a href="\/studio\/inquiry\/">the inquiry form<\/a>/);
assert.match(privacy, /mailto:hello@evzdigital\.studio/);
assert.match(privacy, /Voice-agent demonstration/);
assert.match(privacy, /retained by ElevenLabs for up to one day/);
const voice=await readFile(join(root,'studio/demos/voice/index.html'),'utf8');
assert.match(voice, /id="sample-audio" controls preload="none"/);
assert.match(voice, /calendar\.app\.google\/VntxbUGK6wqxF8AU8/);
assert.doesNotMatch(voice,/Design preview|not connected|Planned 45-second/);
for(const [,reference]of voice.matchAll(/(?:src|href)="([^"]+)"/g))await expectAsset(join(root,'studio/demos/voice/index.html'),reference);
assert.ok((await stat(join(root,'studio/assets/voice-demo-example.mp3'))).size>10000,'The recorded voice example must exist');
const policies=await readFile(join(root,'_headers'),'utf8');
assert.match(policies,/\/studio\/demos\/voice\/\n  Permissions-Policy: microphone=\(self\)/);
assert.match(policies,/\/studio\/\n  Permissions-Policy: microphone=\(\)/);
assert.match(policies,/\/homekind-motion\/\n  Permissions-Policy: microphone=\(\)/);
assert.equal(routeHref('#services/systems'), '/studio/services/?service=systems');
assert.equal(routeHref('#work/Systems'), '/studio/work/?category=Systems');
assert.equal(routeHref('#inquiry/Arc'), '/studio/inquiry/?sample=Arc');
assert.equal(routeHref('#edit'), '/studio/inquiry/#edit');
assert.equal(routeHref('#privacy'), '/studio/privacy/');
await assert.rejects(stat(join(root, 'README.md')), {code: 'ENOENT'});
console.log('Verified studio pages, voice demo/audio, microphone scope and eight independent demonstrations.');
