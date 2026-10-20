import {mkdir, readFile, writeFile, copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'dist/__voice-ui-qa');
await mkdir(directory, {recursive: true});
const html = await readFile(resolve(root, 'dist/studio/demos/voice/index.html'), 'utf8');
await writeFile(resolve(directory, 'index.html'), html.replace('<head>', '<head><base href=\"/studio/demos/voice/\"><script src=\"/__voice-ui-qa/widget.js\"></script>'));
await copyFile(resolve(root, 'scripts/fixtures/voice-widget.js'), resolve(directory, 'widget.js'));
console.log('Local-only UI rehearsal: /__voice-ui-qa/. Rebuilding removes this fixture.');
