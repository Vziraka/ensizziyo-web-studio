import {check} from './lifecycle.mjs';
import {createHash} from 'node:crypto';

export const recoveryNames=['context.json','input.json','authored.json','runtime.json','renderer-evidence.json','output.pdf','export.json',...Array.from({length:16},(_,i)=>[`page-${i+1}.json`,`page-${i+1}.png`,`review-page-${i+1}.png`]).flat()];
export const recoveryName=/^recovery-[a-f0-9]{64}\.bin$/;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),digest=b=>createHash('sha256').update(b).digest('hex');
// Recovery bytes are inert observations, never an export, resource binding or file authority.
export async function validateAuthoringRecovery(job,read){
 const r=job.recovery;check(job.status==='Reconciled'&&r?.schema_version===1&&r.disposition==='close-publication'&&r.export_usable===false&&r.execution==='not-attested-stopped'&&['owner','friend'].includes(r.actor)&&r.actor===job.actor&&typeof r.reason==='string'&&r.reason.trim()&&r.reason.length<=1600&&typeof r.observation==='string'&&r.observation.length>0&&sha(r.snapshot),'Invalid authoring recovery disposition');
 check(['Claimed','Rendering','Rendered','Held'].includes(r.prior_status)&&Array.isArray(r.files)&&r.files.length===recoveryNames.length&&r.files.every((f,i)=>f.name===recoveryNames[i]),'Incomplete authoring recovery observations');
 for(const f of r.files)for(const authority of ['published','candidate']){
  const value=f[authority];if(value===null)continue;
  const m=value?.manifest;check(m?.format==='authoring-chunks-v1'&&sha(m.sha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&m.bytes<=64_000_000&&m.chunk_size===1_000_000&&Array.isArray(m.chunks)&&m.chunks.length===Math.ceil(m.bytes/m.chunk_size)&&m.chunks.every(sha)&&value.chunks?.length===m.chunks.length,'Invalid recovery manifest');
  let complete=true,corrupt=false;const chunks=[];
  for(const [i,c] of value.chunks.entries()){
   check(c.index===i&&c.expected_sha256===m.chunks[i],'Recovery chunk identity changed');
   if(c.disposition==='absent-at-observation'){check(Object.keys(c).length===3,'Unexpected missing-chunk evidence');complete=false;continue;}
   check(['available','corrupt-at-observation'].includes(c.disposition)&&sha(c.sha256)&&c.evidence===`recovery-${c.sha256}.bin`&&Number.isSafeInteger(c.bytes)&&c.bytes>0&&c.bytes<=1_000_000,'Invalid recovery chunk evidence');
   const bytes=await read(c.evidence,c.sha256,c.bytes);check(digest(bytes)===c.sha256&&bytes.length===c.bytes,'Recovery evidence changed');chunks.push(bytes);
   const valid=digest(bytes)===m.chunks[i]&&bytes.length===Math.min(1_000_000,m.bytes-i*1_000_000);check(valid===(c.disposition==='available'),'Recovery integrity disposition changed');if(!valid)corrupt=true;
  }
  if(complete&&!corrupt&&digest(Buffer.concat(chunks))!==m.sha256)corrupt=true;
  check(value.disposition===(corrupt?'corrupt':complete?'available':'partial'),'Recovery completeness disposition changed');
 }
 return r;
}
