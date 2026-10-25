import {check,hash} from './lifecycle.mjs';
import {projectAssetVersion} from './project-assets.mjs';
import {createHash} from 'node:crypto';

const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const fields=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>names.includes(k));
const date=v=>typeof v==='string'&&v.length<=50&&/Z$|[+-]\d\d:\d\d$/.test(v)&&Number.isFinite(Date.parse(v));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const originalEvidencePath=sha256=>{check(sha(sha256),'Invalid original evidence hash');return `project-originals/recovery-${sha256}.bin`;};
export const originalEvidencePattern=/^project-originals\/recovery-([a-f0-9]{64})\.bin$/;
export function originalRecoveryTarget(state,ids){
 check(fields(ids,['project_id','asset_id','version_id'])&&Object.values(ids).length===3&&Object.values(ids).every(key),'Choose exact original recovery IDs');
 const version=projectAssetVersion(state,ids.project_id,ids.asset_id,ids.version_id);return {...ids,reference:version.reference};
}
export function originalEvidenceDeclaration(kind,record){
 check(['manual','drive'].includes(kind),'Choose manual or Drive original recovery');
 if(kind==='manual'){
  check(fields(record,['id','manifest','source','had_original','context_sha256','reserved_by','reserved_at'])&&sha(record.id)&&sha(record.context_sha256)&&typeof record.had_original==='boolean'&&['owner','friend'].includes(record.reserved_by)&&date(record.reserved_at),'Invalid original transfer evidence');
  const s=record.source;check(fields(s,['reference','name','mime_type','modified_time','account'])&&typeof s.reference==='string'&&s.reference.length<=500&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=200&&s.mime_type==='application/pdf'&&typeof s.modified_time==='string'&&s.modified_time.length<=50&&Number.isFinite(Date.parse(s.modified_time))&&(s.account===null||typeof s.account==='string'&&s.account.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.account)),'Invalid original source evidence');
 }else{
  check(fields(record,['schema','id','policy','context','sha256','bytes','chunks','status','claimed_by','claim','lease_until','metadata','hold','target'])&&record.schema===1&&sha(record.id)&&sha(record.policy)&&sha(record.context)&&record.id===hash({policy:record.policy,context:record.context})&&['Reading','Ready','Held','Verified'].includes(record.status)&&['owner','friend'].includes(record.claimed_by)&&key(record.claim)&&Number.isSafeInteger(record.lease_until)&&record.lease_until>=0&&(!record.metadata||sha(record.metadata))&&(!record.hold||typeof record.hold==='string'&&record.hold.length<=1600),'Invalid Drive receipt evidence');
 }
 const m=kind==='manual'?record.manifest:record;
 check((kind==='drive'||fields(m,['format','sha256','bytes','chunk_size','chunks'])&&m.format==='project-original-chunks-v1'&&m.chunk_size===1_000_000)&&sha(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=64_000_000&&Array.isArray(m.chunks)&&m.chunks.length<=64&&m.chunks.every(sha)&&(kind==='manual'?m.chunks.length===Math.ceil(m.bytes/1_000_000):m.chunks.length<=Math.ceil(m.bytes/1_000_000)),'Invalid bounded original evidence declaration');
 return {sha256:m.sha256,bytes:m.bytes,chunk_size:1_000_000,chunks:[...m.chunks]};
}
export function originalUnobserved(declaration){return Array.from({length:Math.ceil(declaration.bytes/1_000_000)-declaration.chunks.length},(_,i)=>{const index=declaration.chunks.length+i;return {index,bytes:Math.min(1_000_000,declaration.bytes-index*1_000_000),disposition:'uncertain-unobserved'};});}
export function originalObservationHash(observation){const {snapshot,...body}=observation;return hash(body);}
export function originalPrior(kind,record){const {recovery,...prior}=record;return kind==='drive'&&recovery?{...prior,status:recovery.prior_status}:prior;}

// These bytes only document an observation. They never grant original/PDF authority.
export async function validateOriginalRecovery(state,kind,record,read,expectedTarget){
 const r=record.recovery,o=r?.observation,prior=originalPrior(kind,record),m=originalEvidenceDeclaration(kind,prior);
 check(fields(r,['schema_version','disposition','reason','actor','at','prior_status','execution','export_usable','observation','prior','event_id'])&&r.schema_version===1&&r.disposition==='close-publication'&&r.execution==='not-attested-stopped'&&r.export_usable===false&&['owner','friend'].includes(r.actor)&&typeof r.reason==='string'&&r.reason.trim()&&r.reason.length<=1600&&date(r.at)&&key(r.event_id),'Invalid original recovery disposition');
 check(hash(r.prior)===hash(prior)&&r.prior_status===(kind==='drive'?prior.status:'Reserved')&&(kind==='manual'||record.status==='Reconciled'&&['Reading','Ready','Held'].includes(prior.status)),'Original recovery changed prior evidence');
 check(fields(o,['schema_version','kind','transfer_id','target','revision','state_sha256','config_sha256','context_sha256','prior_sha256','claim_sha256','observed_at','chunks','unobserved','snapshot'])&&o.schema_version===1&&o.kind===kind&&o.transfer_id===prior.id&&Number.isSafeInteger(o.revision)&&o.revision>=0&&[o.state_sha256,o.config_sha256,o.context_sha256,o.prior_sha256,o.snapshot].every(sha)&&o.prior_sha256===hash(prior)&&o.claim_sha256===(kind==='drive'?hash({claim:prior.claim,lease_until:prior.lease_until}):null)&&date(o.observed_at)&&Date.parse(r.at)>=Date.parse(o.observed_at)&&Date.parse(r.at)<Date.parse(o.observed_at)+45_000&&originalObservationHash(o)===o.snapshot,'Invalid original recovery observation');
 const {reference,...ids}=o.target??{},target=originalRecoveryTarget(state,ids);check(hash(target)===hash(o.target)&&(!expectedTarget||expectedTarget.asset_id===target.asset_id&&expectedTarget.version_id===target.version_id)&&(!prior.target||hash(prior.target)===hash(target))&&(kind!=='manual'||prior.source.reference===reference),'Original recovery target changed');
 if(kind==='manual')check(prior.id===hash({...ids,manifest:prior.manifest,source:prior.source}),'Original transfer identity changed');
 check(Array.isArray(o.chunks)&&o.chunks.length===m.chunks.length&&hash(o.unobserved)===hash(originalUnobserved(m)),'Incomplete original chunk observations');
 for(const [index,c] of o.chunks.entries()){
  const length=Math.min(1_000_000,m.bytes-index*1_000_000);check(c?.index===index&&c.expected_sha256===m.chunks[index]&&c.expected_bytes===length,'Original evidence identity changed');
  if(['absent-at-observation','read-unavailable/uncertain'].includes(c.disposition)){check(Object.keys(c).sort().join(',')==='disposition,expected_bytes,expected_sha256,index','Unexpected unavailable original evidence');continue;}
  check(fields(c,['index','expected_sha256','expected_bytes','disposition','sha256','bytes','evidence'])&&['available','corrupt-at-observation'].includes(c.disposition)&&sha(c.sha256)&&c.evidence===originalEvidencePath(c.sha256)&&Number.isSafeInteger(c.bytes)&&c.bytes>0&&c.bytes<=1_000_000,'Invalid original chunk evidence');
  const bytes=await read(c.evidence,c.sha256,c.bytes);check(Buffer.isBuffer(bytes)&&bytes.length===c.bytes&&digest(bytes)===c.sha256,'Original recovery evidence changed');
  check((bytes.length===length&&digest(bytes)===m.chunks[index])===(c.disposition==='available'),'Original integrity disposition changed');
 }
 check(r.event_id==='original-recovery-'+hash({kind,target,snapshot:o.snapshot}).slice(0,32)&&state.events?.[r.event_id]&&hash(state.events[r.event_id])===hash({id:r.event_id,type:'asset_original_reconciled',prospect_id:target.project_id,actor:r.actor,at:r.at,data:{kind,transfer_id:prior.id,target,snapshot:o.snapshot,prior_status:r.prior_status,reason:r.reason,execution:r.execution,export_usable:false}}),'Missing or changed original recovery event');return r;
}
export async function validateOriginalDependencies(state,read){
 const whole=async m=>{const bytes=await read(`project-originals/${m.sha256}.pdf`,m.sha256,m.bytes);check(Buffer.isBuffer(bytes)&&bytes.length===m.bytes&&digest(bytes)===m.sha256&&bytes.subarray(0,5).toString()==='%PDF-'&&m.chunks.every((sha,index)=>digest(bytes.subarray(index*1_000_000,(index+1)*1_000_000))===sha),'Completed original declaration differs from its actual whole bytes');};
 const versions=[];
 for(const [asset_id,asset] of Object.entries(state.asset_index??{}))for(const [version_id,v] of Object.entries(asset.versions??{})){
  versions.push(v);const t=v.original_transfer;if(!t)continue;
  if(t.recovery)await validateOriginalRecovery(state,'manual',t,read,{asset_id,version_id});
  else{const m=originalEvidenceDeclaration('manual',t);check(v.verified_original?.sha256===m.sha256&&v.verified_original?.bytes===m.bytes,'Complete G1 held: reconcile partial original transfers before exporting');await whole(m);}
 }
 const receipts=Object.entries(state.drive_original_reads??{});check(receipts.length<=64,'Drive receipt evidence exceeds its bound');
 for(const [id,receipt] of receipts){
  check(id===receipt.id,'Drive receipt identity changed');
  if(receipt.recovery)await validateOriginalRecovery(state,'drive',receipt,read);
  else{const m=originalEvidenceDeclaration('drive',receipt);check(receipt.status==='Verified'&&m.chunks.length===Math.ceil(m.bytes/1_000_000)&&versions.some(v=>v.verified_original?.sha256===m.sha256&&v.verified_original?.bytes===m.bytes),'Complete G1 held: reconcile partial Drive originals before exporting');if(receipt.target){const {reference,...ids}=receipt.target;check(hash(originalRecoveryTarget(state,ids))===hash(receipt.target),'Drive receipt target changed');const v=projectAssetVersion(state,ids.project_id,ids.asset_id,ids.version_id);check(v.verified_original?.sha256===m.sha256&&v.verified_original?.bytes===m.bytes,'Verified Drive receipt lacks its exact original');}await whole(m);}
 }
}
export function rejectPartialOriginalImport(state,files){
 check(!Object.values(state.drive_original_reads??{}).some(r=>r.recovery)&&!Object.values(state.asset_index??{}).some(a=>Object.values(a.versions??{}).some(v=>v.original_transfer?.recovery))&&![...files.keys()].some(path=>originalEvidencePattern.test(path)),'Shared installation held: partial original recovery is supported only by the complete inert local G1 restore; preserve the original package');
}
