import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
export async function runtimeVersion() {
  const root=fileURLToPath(new URL('.',import.meta.url)),hash=createHash('sha256');
  for(const dir of ['', 'lifecycle-ui'])for(const name of (await readdir(join(root,dir))).sort()) {
    if(!/\.(mjs|js|css|html|ps1)$/.test(name)||name.endsWith('.test.mjs'))continue;
    hash.update(`${dir}/${name}\n`);hash.update((await readFile(join(root,dir,name),'utf8')).replace(/\r\n/g,'\n'));
  }
  return {source_sha256:hash.digest('hex'),started_at:new Date().toISOString(),pid:process.pid};
}
