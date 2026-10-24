import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {prepareInertWorkspace} from './inert-shared-workspace.mjs';
import {validateBackupDependencies,writeLifecycleBackup} from './lifecycle-backup.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';

export const manualRecordEvents=Object.freeze(['note_added','call_logged','call_claimed','follow_up_handed_off','contact_stopped']);
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateManualBinding(b){
 check(b?.schema_version===1&&b.capability==='shared-manual-records-v1'&&b.mode==='production'&&b.state_schema===1&&[b.workspace_id,b.run_id,b.site_id,b.deploy_id].every(key),'Invalid manual-record workspace binding');
 const origin=new URL(b.origin);check(origin.protocol==='https:'&&origin.origin===b.origin&&/^evz-manual-shared-[a-z0-9-]{8,40}$/.test(b.namespace),'Invalid manual-record origin or separate namespace');
 check(Object.keys(b).sort().join(',')==='capability,deploy_id,mode,namespace,origin,run_id,schema_version,site_id,state_schema,workspace_id','Unknown manual-record binding fields');return b;
}
export function validateManualEnvelope(data,binding){
 validateManualBinding(binding.scope);const m=data.manual_source;
 check(!data.inert_source&&data?.schema_version===1&&data.config?.schema_version===1&&data.state?.schema_version===1,'Unknown manual-record format');
 check(sha(binding.manifest_sha256)&&m?.kind==='shared-manual-record-source-v1'&&m.schema_version===1&&hash(m)===binding.manifest_sha256&&hash(m.binding)===hash(binding.scope),'Manual-record manifest or deployment binding changed');
 check(hash(data.config)===m.config_sha256&&data.config.shared_capability==='shared-manual-records-v1'&&data.config.mode==='production'&&data.config.run_id===binding.scope.run_id,'Manual-record configuration changed; prepare a new reviewed binding');
 check(data.state.mode===binding.scope.mode&&data.state.run_id===binding.scope.run_id,'Manual-record identity changed');
 for(const flag of ['research_enabled','outreach_enabled','connector_writes_enabled','calls_enabled'])check(data.config[flag]===false,'Manual recording cannot enable execution');
 check(data.config.runtime?.enabled===false&&data.config.operations?.enabled===false&&data.config.transcript_ai?.enabled===false&&data.config.release?.approved===false&&data.config.call_release?.approved===false,'Manual recording cannot release execution');
}
// Local preparation only. A new manifest/capability is required; an old inert binding cannot gain write authority.
export async function prepareManualWorkspace({backup,sourceConfig,scope}){
 validateManualBinding(scope);
 const inertScope={...scope,capability:'inert-shared-v1',namespace:scope.namespace.replace('evz-manual-shared-','evz-inert-shared-')};
 const packet=await prepareInertWorkspace({backup,sourceConfig,scope:inertScope}),config={...packet.envelope.config,shared_capability:'shared-manual-records-v1',follow_up:{...packet.envelope.config.follow_up,enabled:true}};
 const manifest={...packet.envelope.inert_source,kind:'shared-manual-record-source-v1',binding:structuredClone(scope),config_sha256:hash(config),allowed_events:[...manualRecordEvents],attestation:'Human-reported completed call; no call authorization or independent provider proof'};
 const envelope={schema_version:1,config,state:packet.envelope.state,manual_source:manifest},binding={scope:structuredClone(scope),manifest_sha256:hash(manifest)};
 validateManualEnvelope(envelope,binding);return {envelope,binding,files:packet.files};
}
export async function installManualWorkspace(store,packet,{commit=false}={}){
 const {envelope,binding,files}=packet;validateManualEnvelope(envelope,binding);
 check(hash(envelope.state)===envelope.manual_source.source_state_sha256,'Source records changed after preparation');await validateBackupDependencies(envelope.state,files);
 check(hash([...files].map(([path,bytes])=>({path,sha256:originalDigest(bytes),bytes:bytes.length,availability:path.startsWith('project-originals/')?'shared-original-chunks':'offline-package-only'})))===hash(envelope.manual_source.dependencies),'Source dependencies changed after preparation');
 check(Buffer.byteLength(JSON.stringify(envelope))<=20_000_000,'Manual-record workspace exceeds the existing 20 MB store');
 if(!commit)return {dry_run:true,execution:'disabled',binding,dependencies:envelope.manual_source.dependencies};
 check(hash(store.manualBinding)===hash(binding),'Import store must match the reviewed manual binding');store.validate(envelope);
 check(!await store.store.getWithMetadata(store.key,{type:'json',consistency:'strong'}),'Manual-record destination already exists; never overwrite or reseed');
 const originals=blobProjectOriginalStore(store.store);for(const [path,bytes] of files)if(path.startsWith('project-originals/'))await originals.put(bytes);
 let result;try{result=await store.store.setJSON(store.key,envelope,{onlyIfNew:true});}catch{check(hash((await store.envelope()).data)===hash(envelope),'Manual-record import outcome uncertain; inspect exact manifest');return {execution:'disabled',reconciled:true};}
 check(result?.modified===true,'Manual-record destination changed; inspect before retrying');check(hash((await store.envelope()).data)===hash(envelope),'Manual-record readback changed');return {dry_run:false,execution:'disabled'};
}
export function applyManualRecord(state,event,actor,revision,now,config){
 check(['owner','friend'].includes(actor)&&manualRecordEvents.includes(event.type),'Manual workspace permits signed notes, completed-call records, claims, handoffs and stops only');
 check(key(event?.id)&&key(event.prospect_id)&&typeof event.at==='string'&&/Z$|[+-]\d\d:\d\d$/.test(event.at)&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=+now+60_000,'Manual event needs stable IDs and an explicit nonfuture timestamp');
 check(Object.keys(event).every(k=>['id','prospect_id','type','at','data'].includes(k)),'Manual event contains unknown fields');
 check(Number.isSafeInteger(revision),'Manual recording requires the exact current revision');
 check(Object.hasOwn(state.prospects,event.prospect_id),'Choose an existing manual record');
 const fields={note_added:['note'],call_logged:['call_id','outcome','performed_at','simulated','desk','note','focus','intent','callback_at','manual_attested'],call_claimed:[],follow_up_handed_off:['to'],contact_stopped:['reason']}[event.type];
 check(event.data&&typeof event.data==='object'&&!Array.isArray(event.data)&&Object.keys(event.data).every(k=>fields.includes(k)),'Manual event contains unsupported data');
 if(event.type==='call_logged')check(event.data.manual_attested===true&&event.data.desk===true&&event.data.simulated!==true&&event.data.outcome!=='skipped','Attest a completed human call; this is not call authorization or provider proof');
 const app=new StudioLifecycle(null,()=>new Date(now));app.config=config;
 const result=app.reduceEvent(state,event,{actor,expectedRevision:revision,manualRecording:true});
 if(!result.duplicate){
  for(const action of Object.values(state.actions))if(action.created_at===state.updated_at&&action.id.startsWith(event.id+'-'))action.execution_hold='Manual record only; provider execution disabled';
 }
 return {...result,execution:'disabled',external_suppression:'unverified'};
}
export function validateManualChange(before,after,{manualRecord}={}){
 check(manualRecord,'Manual storage rejects worker and provider mutations');
 const expected=structuredClone(before.state);applyManualRecord(expected,manualRecord.event,manualRecord.actor,manualRecord.revision,new Date(after.state.updated_at),before.config);
 check(hash(expected)===hash(after.state)&&hash(before.config)===hash(after.config)&&hash(before.manual_source)===hash(after.manual_source),'Manual edit changed protected records, history, budgets, configuration or execution evidence');
}
export async function exportManualBackup(app,localDependencies,output){
 check(app.store?.manualBinding,'Use an explicitly bound manual-record workspace');const {data}=await app.store.envelope();
 return writeLifecycleBackup(localDependencies,data.state,output,app.now().toISOString());
}
