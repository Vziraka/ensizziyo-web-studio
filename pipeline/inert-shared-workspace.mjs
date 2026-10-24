import {check,hash,initialConfig} from './lifecycle.mjs';
import {readLifecycleBackup,validateBackupDependencies,writeLifecycleBackup} from './lifecycle-backup.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';

const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateInertBinding(b){
 check(b?.schema_version===1&&b.capability==='inert-shared-v1'&&b.mode==='production'&&b.state_schema===1&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id].every(key),'Invalid inert workspace binding');
 const origin=new URL(b.origin);check(origin.protocol==='https:'&&origin.origin===b.origin&&/^evz-inert-shared-[a-z0-9-]{8,40}$/.test(b.namespace),'Invalid inert workspace origin or separate namespace');
 check(Object.keys(b).sort().join(',')==='capability,deploy_id,mode,namespace,origin,run_id,schema_version,site_id,state_schema,workspace_id','Unknown inert workspace binding fields');return b;
}
export function validateInertEnvelope(data,binding){
 check(data?.schema_version===1&&data.config?.schema_version===1&&data.state?.schema_version===1,'Unknown inert workspace format');
 const m=data.inert_source;validateInertBinding(binding.scope);
 check(sha(binding.manifest_sha256)&&m?.kind==='inert-shared-source-v1'&&m.schema_version===1&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(binding.scope),'Inert source manifest or deployment binding changed');
 check(hash(data.config)===m.config_sha256&&data.config.shared_capability==='inert-shared-v1'&&data.config.mode==='production'&&data.config.run_id===binding.scope.run_id,'Inert configuration changed; prepare a new reviewed binding');
 check(data.state.mode===binding.scope.mode&&data.state.run_id===binding.scope.run_id,'Inert record identity changed');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(data.config[flag]===false,'Inert execution must stay disabled');
 check(data.config.runtime?.enabled===false&&data.config.operations?.enabled===false&&data.config.transcript_ai?.enabled===false&&data.config.release?.approved===false&&data.config.call_release?.approved===false,'Inert release must stay revoked');
}
function freshConfig(source,scope){
 const c={...structuredClone(initialConfig),run_id:scope.run_id,mode:scope.mode,shared_capability:'inert-shared-v1',calls_enabled:false,runtime:{enabled:false},operations:{enabled:false,allowlist:[],bookings:{},emails:{}},release:{approved:false},call_release:{approved:false}};
 for(const k of ['daily_calls','reserve_percent'])if(source.transcript_ai?.[k]!==undefined)c.transcript_ai[k]=source.transcript_ai[k];
 // Only display names cross this boundary; connection settings, paths and approvals do not.
 for(const actor of ['owner','friend']){const name=source.sender?.operator_names?.[actor];if(typeof name==='string'&&name.length<=100)c.sender.operator_names[actor]=name;}
 return c;
}
export function inertReconciliation(state){
 return {execution:'disabled',action_ids:Object.values(state.actions??{}).filter(a=>['Queued','Pending','Uncertain'].includes(a.status)).map(a=>a.id),request_ids:Object.entries(state.operations?.requests??{}).filter(([,r])=>!['Verified','Cancelled'].includes(r.status)).map(([id])=>id),prior_lease:Boolean(state.operations?.lease),prior_runtime:Boolean(state.runtime),requires:'Historical external effects need provider readback and separate release; never replay an imported request.'};
}
// Accept only an already verified G1 package; this function performs local reads only.
export async function prepareInertWorkspace({backup,sourceConfig,scope}){
 validateInertBinding(scope);const {state,files}=await readLifecycleBackup(backup);
 check(state.mode===scope.mode&&state.run_id===scope.run_id&&sourceConfig?.schema_version===1&&sourceConfig.mode===state.mode&&sourceConfig.run_id===state.run_id,'Source configuration and records must match the exact production run');
 const config=freshConfig(sourceConfig,scope),dependencies=[...files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:path.startsWith('project-originals/')?'shared-original-chunks':'offline-package-only'}));
 const manifest={schema_version:1,kind:'inert-shared-source-v1',binding:structuredClone(scope),source_state_sha256:hash(state),source_config_sha256:hash(sourceConfig),config_sha256:hash(config),dependencies,reconciliation:inertReconciliation(state),unsupported:['hosted-authoring-sidecars','hosted-backup','provider-execution','automatic-migration']};
 const envelope={schema_version:1,config,state,inert_source:manifest},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)};
 validateInertEnvelope(envelope,binding);check(Buffer.byteLength(JSON.stringify(envelope))<=20_000_000,'Inert workspace exceeds the existing 20 MB store');return {envelope,binding,files};
}
async function validatePackage(packet){
 const {envelope,binding,files}=packet;validateInertEnvelope(envelope,binding);check(Buffer.byteLength(JSON.stringify(envelope))<=20_000_000,'Inert workspace exceeds the existing 20 MB store');check(hash(envelope.state)===envelope.inert_source.source_state_sha256,'Source records changed after preparation');
 await validateBackupDependencies(envelope.state,files);
 check(hash([...files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:path.startsWith('project-originals/')?'shared-original-chunks':'offline-package-only'})))===hash(envelope.inert_source.dependencies),'Source dependencies changed after preparation');
}
// Default is validation only and does not even read the supplied store. No hosted import route exists.
export async function installInertWorkspace(store,packet,{commit=false}={}){
 await validatePackage(packet);if(!commit)return {execution:'disabled',dry_run:true,binding:packet.binding,dependencies:packet.envelope.inert_source.dependencies};
 check(hash(store.inertBinding)===hash(packet.binding),'Import store must match the reviewed binding');
 store.validate(packet.envelope);
 check(!await store.store.getWithMetadata(store.key,{type:'json',consistency:'strong'}),'Inert destination already exists; never overwrite or reseed');
 const originals=blobProjectOriginalStore(store.store);
 for(const [path,bytes] of packet.files)if(path.startsWith('project-originals/'))await originals.put(bytes);
 let result;try{result=await store.store.setJSON(store.key,packet.envelope,{onlyIfNew:true});}catch{const saved=await store.envelope();check(hash(saved.data)===hash(packet.envelope),'Inert import outcome uncertain; inspect the exact manifest before retrying');return {execution:'disabled',reconciled:true};}
 check(result?.modified===true,'Inert destination changed; inspect before retrying');check(hash((await store.envelope()).data)===hash(packet.envelope),'Inert import readback changed');return {execution:'disabled',dry_run:false};
}
export function applyInertNote(state,event,actor,expectedRevision,now){
 check(['owner','friend'].includes(actor)&&event.type==='note_added','Inert shared workspace permits signed private notes only');
 const fingerprint=hash({event,actor});if(state.events[event.id]){check(state.events[event.id].fingerprint===fingerprint,'Event ID conflicts with saved evidence');return {duplicate:true,revision:state.revision};}
 check(expectedRevision===state.revision,'Record changed; refresh before approving');
 check(Object.keys(state.events).length<20_000,'Event limit reached; archive closed records');
 const r=Object.hasOwn(state.prospects,event.prospect_id)?state.prospects[event.prospect_id]:null;check(r&&typeof event.data?.note==='string'&&event.data.note.trim().length>0&&event.data.note.length<=3000,'Choose an existing record and bounded private note');
 r.note=event.data.note;r.updated_at=event.at;state.events[event.id]={...event,fingerprint,actor};state.updated_at=now.toISOString();state.revision++;
 return {prospect_id:r.id,stage:r.stage,revision:state.revision,execution:'disabled'};
}
export function validateInertChange(before,after,{inertNote}={}){
 check(inertNote,'Inert storage rejects worker and provider mutations');
 const expected=structuredClone(before);applyInertNote(expected,inertNote.event,inertNote.actor,inertNote.revision,new Date(after.updated_at));
 check(hash(expected)===hash(after),'Inert edit changed protected records, budgets or execution evidence');
}
export async function exportInertBackup(app,localDependencies,output){
 check(app.store?.inertBinding,'Use an explicitly bound inert workspace');
 const {data}=await app.store.envelope();
 // G1 validates the declared local sidecars; D1 alone cannot claim a hosted complete backup.
 return writeLifecycleBackup(localDependencies,data.state,output,app.now().toISOString());
}
