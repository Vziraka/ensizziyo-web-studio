import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve, sep} from 'node:path';
import {createViews} from '../site/studio/views.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'site');
const output = join(root, 'dist');
const demos = ['sola', 'pulse', 'fieldwork', 'forma', 'arc', 'relay', 'homekind', 'juniper'];

if (!resolve(output).startsWith(resolve(root) + sep)) throw new Error('Unsafe build output path');
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
for (const folder of ['studio', 'shared', ...demos.map(name => `${name}-motion`)]) {
  await cp(join(source, folder), join(output, folder), {recursive: true});
}

const studioShell = await readFile(join(source, 'studio', 'index.html'), 'utf8');
const studioData = JSON.parse(await readFile(join(source, 'studio', 'data.json'), 'utf8'));
const blankInquiry = {description: '', name: '', email: '', business: '', website: '', context: ''};
const views = createViews(studioData, () => ({service: 'websites', filter: 'All', formData: blankInquiry}));
const studioPages = {
  home: ['studio', 'Websites. Systems. Automation. Marketing.', 'Ensizziyo designs websites, connected business systems, practical automation and marketing experiences.'],
  about: ['studio/about', 'About', 'Learn how Ensizziyo scopes, designs and hands over practical digital work for businesses and agencies.'],
  services: ['studio/services', 'Services', 'Explore website, business system, automation and marketing services from Ensizziyo.'],
  work: ['studio/work', 'Work', 'Explore eight independent interactive demonstrations of websites, systems, automation and campaigns.'],
  inquiry: ['studio/inquiry', 'Inquiry', 'Tell Ensizziyo what you would like to improve and start a conversation about the right scope.'],
};
for (const [page, [folder, title, description]] of Object.entries(studioPages)) {
  const content = page === 'inquiry'
    ? '<section class="page inquiry-page"><h1>Let\'s talk.</h1><p>Tell us what you would like to improve.</p></section>'
    : views.render(page);
  let html = studioShell.replace('<main id="main"></main>', `<main id="main">${content}</main>`);
  html = html.replace('href="#main"', `href="/${folder}/#main"`);
  html = html.replace(/<title>[^<]+<\/title>/, `<title>${title} — Ensizziyo</title>`);
  html = html.replace(/<meta name="description" content="[^"]+">/, `<meta name="description" content="${description}">`);
  const destination = join(output, folder);
  await mkdir(destination, {recursive: true});
  await writeFile(join(destination, 'index.html'), html);
}

for (const demo of demos) {
  const file = resolve(output, `${demo}-motion`, 'index.html');
  let html = await readFile(file, 'utf8');
  if (!html.includes('</body>')) throw new Error(`Missing closing body: ${file}`);
  html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
  html = html.replace('</body>', '<script type="module" src="../shared/showreel.mjs"></script><script type="module" src="../shared/review-bridge.mjs"></script></body>');
  await writeFile(file, html);
}

await writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('Built private review site with five studio pages and eight demonstrations.');
