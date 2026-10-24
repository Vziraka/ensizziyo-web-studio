import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {lifecycleAssets} from '../pipeline/lifecycle-assets.mjs';

// Bundle only the explicit UI allowlist; runtime paths change when Netlify packages functions.
export async function deskAssets(){
  const assets={},directory=fileURLToPath(new URL('../pipeline/lifecycle-ui/',import.meta.url));
  for(const [path,[file]] of lifecycleAssets){
    if(['/preview/','/preview.js'].includes(path))continue;
    assets[file]=(await readFile(join(directory,file))).toString('base64');
  }
  return assets;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  await writeFile(new URL('../pipeline/hosted-assets.mjs',import.meta.url),`// Generated from the UI allowlist; no private state or environment values.\nexport default ${JSON.stringify(await deskAssets())};\n`);
}
