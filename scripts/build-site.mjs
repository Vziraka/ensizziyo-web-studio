import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
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
  home: ['studio', 'AI solutions. Business systems. Websites. Marketing.', 'EVZ Digital integrates practical AI, business systems, websites and marketing around the way your company works.'],
  about: ['studio/about', 'About', 'Learn how EVZ Digital scopes, designs and hands over practical digital work for businesses and agencies.'],
  services: ['studio/services', 'Services', 'Explore website, business system, automation and marketing services from EVZ Digital.'],
  work: ['studio/work', 'Work', 'Explore eight independent interactive demonstrations of websites, systems, automation and campaigns.'],
  inquiry: ['studio/inquiry', 'Inquiry', 'Tell EVZ Digital what you would like to improve and start a conversation about the right scope.'],
  privacy: ['studio/privacy', 'Privacy', 'How EVZ Digital handles website inquiries, form submissions and privacy requests.'],
};
for (const [page, [folder, title, description]] of Object.entries(studioPages)) {
  const content = page === 'inquiry'
    ? '<section class="page inquiry-page"><h1>Let\'s talk.</h1><p>Tell us what you would like to improve. <a href="/studio/privacy/">How we handle your details</a>.</p></section>'
    : views.render(page);
  let html = studioShell.replace('<main id="main"></main>', `<main id="main">${content}</main>`);
  html = html.replace('href="#main"', `href="/${folder}/#main"`);
  html = html.replace(/<title>[^<]+<\/title>/, `<title>${title} — EVZ Digital</title>`);
  html = html.replace(/<meta name="description" content="[^"]+">/, `<meta name="description" content="${description}">`);
  const destination = join(output, folder);
  await mkdir(destination, {recursive: true});
  await writeFile(join(destination, 'index.html'), html);
}

for (const demo of demos) {
  const file = resolve(output, `${demo}-motion`, 'index.html');
  let html = await readFile(file, 'utf8');
  if (!html.includes('</body>')) throw new Error(`Missing closing body: ${file}`);
  html = html.replace('</head>', '<link rel="icon" type="image/svg+xml" href="/shared/favicon.svg"><meta name="robots" content="noindex,nofollow"></head>');
  html = html.replace('</body>', '<script type="module" src="../shared/showreel.mjs"></script><script type="module" src="../shared/review-bridge.mjs"></script></body>');
  await writeFile(file, html);
}

await writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
// Exact HTML routes avoid merging contradictory microphone directives from overlapping header rules.
const policies=[];
async function microphonePolicies(directory,path=''){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const relative=`${path}/${entry.name}`;
    if(entry.isDirectory())await microphonePolicies(join(directory,entry.name),relative);
    else if(entry.name.endsWith('.html')){
      const allowed=relative==='/studio/demos/voice/index.html',routes=entry.name==='index.html'?[relative,relative.slice(0,-10),relative.slice(0,-11)]:[relative,relative.slice(0,-5)];
      for(const route of new Set(routes.filter(Boolean)))policies.push(`${route}\n  Permissions-Policy: microphone=${allowed?'(self)':'()'}`);
    }
  }
}
await microphonePolicies(output);await writeFile(join(output,'_headers'),policies.join('\n\n')+'\n');
console.log('Built studio, voice-agent demo and eight independent demonstrations.');
