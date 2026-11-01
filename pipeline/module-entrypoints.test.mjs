import test from 'node:test';
import {execFileSync} from 'node:child_process';
test('manual migration can be imported directly without a lifecycle import-order workaround',()=>{
 const url=new URL('./shared-manual-records.mjs',import.meta.url).href;
 execFileSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(url)}); if(typeof m.prepareManualWorkspace!=='function')throw Error('Missing migration entry point');`],{timeout:30000,stdio:'pipe'});
});
