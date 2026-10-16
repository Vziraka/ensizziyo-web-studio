import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve, sep} from 'node:path';

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

for (const demo of demos) {
  const file = resolve(output, `${demo}-motion`, 'index.html');
  let html = await readFile(file, 'utf8');
  if (!html.includes('</body>')) throw new Error(`Missing closing body: ${file}`);
  html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
  html = html.replace('</body>', '<script type="module" src="../shared/showreel.mjs"></script><script type="module" src="../shared/review-bridge.mjs"></script></body>');
  await writeFile(file, html);
}

await writeFile(join(output, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
console.log('Built private review site with studio and eight demonstrations.');
