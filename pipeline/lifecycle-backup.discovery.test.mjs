import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {StudioLifecycle} from './lifecycle.mjs';
import {cloudDiscoveryArtifactStore} from './cloud-discovery-artifacts.mjs';
import {applyCloudDiscoveryTransition,validateCloudDiscoveryState} from './cloud-discovery.mjs';
import {writeLifecycleBackup,readLifecycleBackup,restoreLifecycleBackup,validateBackupDependencies,installCloudDiscoveryDependencies,hostedManualBackupInventory} from './lifecycle-backup.mjs';
const at='2026-11-01T14:00:00.000Z';
function blobs(){const files=new Map();let writes=0;return {files,get writes(){return writes},async getWithMetadata(k){return files.has(k)?{data:Buffer.from(files.get(k))}:null},async set(k,b,o){writes++;if(o.onlyIfNew&&files.has(k))return {modified:false};files.set(k,Buffer.from(b));return {modified:true}}};}
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'evz-discovery-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));const app=await StudioLifecycle.initialize({directory:join(root,'source'),now:()=>new Date(at)}),state=await app.snapshot();state.mode='production';
 const policy={schema_version:1,site_id:'site',deploy_id:'deploy',origin:'https://desk.example.com',recovery_generation:'one',expires_at:'2026-11-03T00:00:00.000Z',daily_email_target:100,max_imports_per_day:125,max_candidates_per_day:200,max_tasks:50,max_attempts:100,max_attempts_per_day:100,reserve_percent:30,lease_minutes:10,researcher_id:'researcher',reviewer_id:'reviewer',areas:['Fairfax Northern Virginia Washington DC Maryland'],trades:['HVAC']};
 const config={...app.config,mode:'production',shared_capability:'shared-operations-desk-v1',cloud_discovery:policy},raw=blobs(),artifacts=cloudDiscoveryArtifactStore(raw);
 const apply=(type,input,actor='owner')=>applyCloudDiscoveryTransition(state,config,{type,actor,at,input:{revision:state.revision,...input}});
 apply('allowance',{allowance:{id:'allowance',evidence_ref:'Fictional included allowance',observed_at:at,expires_at:'2026-11-01T14:15:00.000Z',included_only:true,remaining_percent:80,max_attempts:100,max_candidates:200}});apply('pause',{paused:false,reason:'Fictional finite test'});
 const create=id=>apply('create',{id,lane:'call-first',count:1,assigned_to:'owner',area:policy.areas[0],subtypes:['HVAC']});
 create('finished');apply('claim',{id:'finished',claim_id:'author',context_id:'author-context'},'researcher');
 const submission={schema_version:1,task_id:'finished',claim_id:'author',context_id:'author-context',queries:[{query:'Fictional HVAC',checked_at:at,urls:[]}],candidates:[]},sref=await artifacts.put(submission);apply('submit',{id:'finished',claim_id:'author',artifact:sref,payload:submission},'researcher');
 apply('claim-review',{id:'finished',claim_id:'reviewer',context_id:'review-context'},'reviewer');const review={schema_version:1,task_id:'finished',claim_id:'reviewer',context_id:'review-context',submission_sha256:sref.sha256,decisions:[]},rref=await artifacts.put(review);apply('review',{id:'finished',claim_id:'reviewer',artifact:rref,payload:review,submission},'reviewer');
 create('pending');apply('claim',{id:'pending',claim_id:'pending-author',context_id:'pending-context'},'researcher');
 for(const [name,bytes]of raw.files){const file=join(app.directory,...name.split('/'));await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
 return {root,app,state,config,raw,submission,review,sref,rref,output:join(root,'backup.json')};
}
test('discovery source and independent review survive portable recovery; old claims remain charged and fenced',async t=>{
 const f=await fixture(t);await writeLifecycleBackup(f.app.directory,f.state,f.output,at);const backup=await readLifecycleBackup(f.output);assert.deepEqual(backup.state,f.state);assert.equal(backup.files.size,4);
 const destination=join(f.root,'restore');await restoreLifecycleBackup(f.output,destination);const state=JSON.parse(await readFile(join(destination,'lifecycle-state.json')));assert.equal(state.cloud_discovery.paused,true);assert.equal(state.cloud_discovery.epoch,f.state.cloud_discovery.epoch+1);assert.deepEqual(state.cloud_discovery.tasks,f.state.cloud_discovery.tasks);assert.deepEqual(state.cloud_discovery.allowances,f.state.cloud_discovery.allowances);validateCloudDiscoveryState(state,f.config);
 const apply=(type,input,actor='owner')=>applyCloudDiscoveryTransition(state,f.config,{type,actor,at,input:{revision:state.revision,...input}});apply('pause',{paused:false,reason:'Fresh explicit recovery review'});assert.throws(()=>apply('claim-review',{id:'pending',claim_id:'new-review',context_id:'new-context'},'reviewer'),/predates pause/);assert.equal(state.cloud_discovery.allowances.allowance.used_attempts,3);
 const target=blobs();await installCloudDiscoveryDependencies(backup.state,backup.files,target);assert.deepEqual(await cloudDiscoveryArtifactStore(target).get(f.sref),f.submission);assert.deepEqual(await cloudDiscoveryArtifactStore(target).get(f.rref),f.review);await installCloudDiscoveryDependencies(backup.state,backup.files,target);assert.equal(target.files.size,4);
 const restoredRaw={async getWithMetadata(path){return {data:await readFile(join(destination,...path.split('/')))}}};assert.deepEqual(await cloudDiscoveryArtifactStore(restoredRaw).get(f.sref),f.submission);
});
test('missing, altered, extra, unsafe and conflicting discovery evidence reject before any install write',async t=>{
 const f=await fixture(t),first=[...f.raw.files.keys()].find(k=>k.includes('/0-'));
 for(const kind of ['missing','altered','extra','unsafe','conflict']){const files=new Map([...f.raw.files].map(([k,v])=>[k,Buffer.from(v)])),state=structuredClone(f.state);if(kind==='missing')files.delete(first);if(kind==='altered')files.get(first)[0]^=1;if(kind==='extra')files.set('cloud-discovery/'+ 'a'.repeat(64)+'/manifest',Buffer.from('{}'));if(kind==='unsafe')state.cloud_discovery.tasks.finished.submission.artifact.reference='../escape';if(kind==='conflict')state.cloud_discovery.tasks.finished.review.artifact={...f.sref,bytes:f.sref.bytes+1};const target=blobs();await assert.rejects(installCloudDiscoveryDependencies(state,files,target));assert.equal(target.writes,0,kind);}
});
test('hosted export reads canonical artifacts and rejects old profile; imported card refs remain required',async t=>{
 const f=await fixture(t),data={state:f.state},app={store:{manualBinding:{scope:{capability:'shared-operations-desk-v1'}},store:f.raw,envelope:async()=>({data})}};
 const exported=await hostedManualBackupInventory(app,join(f.root,'does-not-exist'));assert.equal(exported.files.size,4);app.store.manualBinding.scope.capability='shared-mailbox-delivery-v1';await assert.rejects(hostedManualBackupInventory(app,f.app.directory),/own capability/);
 const state=structuredClone(f.state);delete state.cloud_discovery;state.prospects.retained={cloud_discovery_source:{submission:f.sref,review:f.rref}};const result=await validateBackupDependencies(state,f.raw.files);assert.equal(result.files.size,4);await assert.rejects(validateBackupDependencies(state,new Map()));
});
test('multi-chunk exact discovery JSON participates in complete dependency validation',async()=>{
 const raw=blobs(),payload={evidence:'x'.repeat(1000001)},ref=await cloudDiscoveryArtifactStore(raw).put(payload),state={prospects:{retained:{cloud_discovery_source:{submission:ref,review:ref}}},actions:{},events:{},ai_attempts:{}};
 assert.equal((await validateBackupDependencies(state,raw.files)).files.size,3);const target=blobs();await installCloudDiscoveryDependencies(state,raw.files,target);assert.deepEqual(await cloudDiscoveryArtifactStore(target).get(ref),payload);
});

test('recovery epoch overflow rejects before creating the destination',async t=>{
 const f=await fixture(t);f.state.cloud_discovery.epoch=Number.MAX_SAFE_INTEGER;await writeLifecycleBackup(f.app.directory,f.state,f.output,at);const destination=join(f.root,'overflow');await assert.rejects(restoreLifecycleBackup(f.output,destination),/recovery epoch/);await assert.rejects(readFile(join(destination,'lifecycle-state.json')),e=>e.code==='ENOENT');
});
