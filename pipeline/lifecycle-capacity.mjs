import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialConfig,check} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {sourceContentHash} from './sources.mjs';
import {privateStateDirectory} from './engine.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const jsonHash=value=>digest(JSON.stringify(value));
function evidenceInventory(state){
 const entries=[];
 function visit(value,path){
  if(!value||typeof value!=='object')return;
  if(typeof value.url==='string'&&typeof value.content_sha256==='string'&&typeof value.capture_method==='string'){
   check(typeof value.text==='string'&&sourceContentHash(value)===value.content_sha256,'Retained source is missing or corrupt; migration is held');
   entries.push({path,sha256:value.content_sha256,url:value.url,at:value.fetched_at??null});
  }
  for(const [key,item] of Object.entries(value))visit(item,`${path}/${key}`);
 }
 visit(state,'');return {count:entries.length,sha256:jsonHash(entries)};
}

// Local candidate only. Original event fingerprints, approvals and all ledgers stay byte-equivalent.
export function capacityCandidate(input){
 const original=JSON.parse(input.toString('utf8')),state=structuredClone(original),controlled=Object.create(null);
 check(original.schema_version===1&&original.prospects&&original.events&&original.actions,'Unknown canonical state');
 for(const [id,r] of Object.entries(state.prospects)){controlled[id]={present:Object.hasOwn(r,'controlled'),value:r.controlled??null};r.controlled=true;}
 state.mode='controlled';
 const config={...structuredClone(initialConfig),run_id:state.run_id,calls_enabled:false,runtime:{enabled:false}},candidate={schema_version:1,config,state};
 new ConditionalLifecycleStore(null).validate(candidate);
 const manifest={schema_version:1,kind:'private-local-capacity-rehearsal',execution:'disabled',upload_authorized:false,source_file_sha256:digest(input),source_file_bytes:input.length,source_state_sha256:jsonHash(original),candidate_sha256:jsonHash(candidate),candidate_bytes:Buffer.byteLength(JSON.stringify(candidate)),prospects:Object.keys(original.prospects).length,events:Object.keys(original.events).length,evidence:evidenceInventory(original),sections:Object.fromEntries(Object.entries(original).map(([key,value])=>[key,jsonHash(value)])),restore:{mode:original.mode,controlled},limitations:['Canonical-state capacity only. Source configuration is not copied; all execution remains disabled.','File references are preserved, not uploaded or retrieved. Sidecars, credentials, audio and external assets need a separate reviewed migration.','No real Netlify latency, credits, production activation or computer-off execution is established.']};
 verifyCapacityCandidate(candidate,manifest);return {candidate,manifest};
}

export function verifyCapacityCandidate(candidate,manifest){
 check(manifest?.schema_version===1&&manifest.kind==='private-local-capacity-rehearsal'&&manifest.upload_authorized===false&&manifest.execution==='disabled','Unknown capacity manifest');
 new ConditionalLifecycleStore(null).validate(candidate);
 check(jsonHash(candidate)===manifest.candidate_sha256&&Buffer.byteLength(JSON.stringify(candidate))===manifest.candidate_bytes,'Capacity candidate integrity check failed');
 const restored=structuredClone(candidate.state);restored.mode=manifest.restore.mode;
 check(Object.keys(restored.prospects).length===manifest.prospects&&Object.keys(restored.events).length===manifest.events,'Capacity record counts changed');
 for(const [id,r] of Object.entries(restored.prospects)){check(Object.hasOwn(manifest.restore.controlled,id),'Capacity record identity changed');const prior=manifest.restore.controlled[id];if(prior.present)r.controlled=prior.value;else delete r.controlled;}
 check(jsonHash(restored)===manifest.source_state_sha256,'Canonical restore hash does not match');
 check(JSON.stringify(Object.fromEntries(Object.entries(restored).map(([key,value])=>[key,jsonHash(value)])))===JSON.stringify(manifest.sections),'Canonical section hashes changed');
 check(JSON.stringify(evidenceInventory(restored))===JSON.stringify(manifest.evidence),'Retained evidence inventory changed');return restored;
}

export async function rehearseCapacity(sourceDirectory,destination){
 sourceDirectory=await privateStateDirectory(sourceDirectory);destination=await privateStateDirectory(destination);
 const source=join(sourceDirectory,'lifecycle-state.json'),stat=await lstat(source);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=30_000_000,'Use a bounded regular canonical state file');
 const input=await readFile(source),{candidate,manifest}=capacityCandidate(input);
 manifest.external_files=[];
 for(const name of ['lifecycle-config.json','supplemental-reviews.json']){
  try{const info=await lstat(join(sourceDirectory,name));check(info.isFile()&&!info.isSymbolicLink()&&info.size<=30_000_000,'Use bounded regular private dependency files');const bytes=await readFile(join(sourceDirectory,name));manifest.external_files.push({name,bytes:bytes.length,sha256:digest(bytes),copied:false});}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await mkdir(destination,{mode:0o700});
 await writeFile(join(destination,'candidate.json'),JSON.stringify(candidate),{flag:'wx',mode:0o600});
 // Manifest is the publication marker: a partial directory is never a restorable bundle.
 await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
 verifyCapacityCandidate(JSON.parse(await readFile(join(destination,'candidate.json'),'utf8')),JSON.parse(await readFile(join(destination,'manifest.json'),'utf8')));
 check(digest(await readFile(source))===manifest.source_file_sha256,'Canonical input changed during rehearsal; retain candidate for review only');
 return {prospects:manifest.prospects,events:manifest.events,evidence_captures:manifest.evidence.count,candidate_bytes:manifest.candidate_bytes,source_unchanged:true,execution:'disabled'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 try{check(process.argv.length===4,'Usage: node lifecycle-capacity.mjs <private-source-directory> <new-private-destination>');console.log(JSON.stringify(await rehearseCapacity(process.argv[2],process.argv[3])));}catch{console.error('Private capacity rehearsal failed; original state was not written. Inspect the private candidate before retrying.');process.exitCode=1;}
}
