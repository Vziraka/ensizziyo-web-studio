import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';
import {lifecycleAssets} from '../pipeline/lifecycle-assets.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)), output=process.argv[2];
const recording=process.argv.includes('--recording');
if(!output)throw Error('Provide a new private staging source directory');
const target=resolve(output);
await mkdir(target); // Never overwrite an existing staged artifact.
const hashes={}, copied=new Set(), sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function put(path,bytes){await mkdir(dirname(join(target,path)),{recursive:true});await writeFile(join(target,path),bytes,{flag:'wx'});hashes[path]=sha(bytes);}
async function copyModule(path){
 path=resolve(path);if(copied.has(path))return;
 // Source generators contain import strings for generated callers. They are
 // not files in this source graph; actual package imports are verified later.
 try { await lstat(path); } catch(error) { if(error.code==='ENOENT')return;throw error; }
 const rel=relative(join(repo,'pipeline'),path);
 if(rel.startsWith('..')||rel.includes(':'))throw Error('Import escaped pipeline: '+rel);
 if((await lstat(path)).isSymbolicLink())throw Error('Symlink source rejected');
 copied.add(path);const bytes=await readFile(path);await put('pipeline/'+rel.replaceAll('\\','/'),bytes);
 for(const m of bytes.toString().matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"](\.[^'"]+\.(?:mjs|json))['"]/g))await copyModule(resolve(dirname(path),m[1]));
}
await copyModule(join(repo,'pipeline/hosted-desk.mjs'));
await copyModule(join(repo,'pipeline/staging-boundary.mjs'));
for(const name of ['package.json','package-lock.json'])await put(name,await readFile(join(repo,'pipeline',name)));
const assets={},assetPaths=[];
for(const [path,[file]] of lifecycleAssets){if(path==='/preview/'||path==='/preview.js')continue;assets[file]=(await readFile(join(repo,'pipeline/lifecycle-ui',file))).toString('base64');assetPaths.push('/desk'+path);}
assets['index.html']=Buffer.from(Buffer.from(assets['index.html'],'base64').toString().replace('<div class="workspace">','<div class="workspace"><p class="notice" role="status">Protected fictional staging. Live sending and publication are OFF. '+(recording?'Saved workflow decisions and publication receipts are simulations.':'Inspection only; workflow edits are disabled.')+'</p>')).toString('base64');
await put('pipeline/staging-assets.mjs','export default '+JSON.stringify(assets)+';\n');
await put('functions/operations.mjs',`import assets from '../pipeline/staging-assets.mjs';
import binding from '../pipeline/staging.generated.mjs';
import {createHostedDesk} from '../pipeline/hosted-desk.mjs';
import {createStagingBoundary} from '../pipeline/staging-boundary.mjs';
export default (request,context)=>createStagingBoundary({env:process.env,binding,assetPaths:${JSON.stringify(assetPaths)},handlerFactory:env=>createHostedDesk({env,readAsset:file=>{if(!Object.hasOwn(assets,file))throw Error('Unavailable asset');return Buffer.from(assets[file],'base64');}})})(request,context);
export const config={path:['/desk','/desk/*']};\n`);
const namespace='evz-redesign-proof-staging-'+randomBytes(12).toString('hex');
await put('staging-build.mjs',`import {writeFile} from 'node:fs/promises';
const {SITE_ID,DEPLOY_ID,DEPLOY_URL,CONTEXT}=process.env;
if(SITE_ID!=='d7840f1d-c0e6-4f87-a41f-e34f53c81625'||CONTEXT!=='deploy-preview'||!DEPLOY_ID||DEPLOY_URL!=='https://'+DEPLOY_ID+'--evz-hybrid-fictional-20261027.netlify.app')throw Error('Exact staging build metadata required');
await writeFile('pipeline/staging.generated.mjs','export default '+JSON.stringify({site_id:SITE_ID,deploy_id:DEPLOY_ID,origin:DEPLOY_URL,namespace:${JSON.stringify(namespace)},recording:${recording}})+';');\n`);
await put('public/index.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>EVZ protected staging</title><h1>EVZ fictional staging</h1><p>Live sending and publication are OFF. '+(recording?'Workflow records and release receipts are simulations.':'Inspection only; workflow edits are disabled.')+'</p><a href="/desk/">Sign in to the desk</a></html>');
await put('netlify.toml','[build]\ncommand = "npm ci --ignore-scripts --omit=dev && node staging-build.mjs"\npublish = "public"\n[build.environment]\nNODE_VERSION = "24"\n[functions]\ndirectory = "functions"\nnode_bundler = "esbuild"\n');
await put('staging-manifest.json',JSON.stringify({prepared_at:new Date().toISOString(),site_id:'d7840f1d-c0e6-4f87-a41f-e34f53c81625',namespace,mode:recording?'fictional-recording':'fictional-inspection-only',source_hashes:hashes,limits:['Only explicitly bound fictional records; no real client data','No provider or scheduled function entrypoints','Operator keys supplied separately at runtime','Protection and hosted verification required before acceptance']},null,2));
console.log(JSON.stringify({directory:target,files:Object.keys(hashes).length,namespace,uploaded:false}));
