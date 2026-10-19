import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { StudioLifecycle, check, hash } from './lifecycle.mjs';
import { AppConnectors } from './app-connectors.mjs';
import { privateStateDirectory } from './engine.mjs';
import { ownerContactView, ownerContactSummary, retainContactDiscovery, applyOwnerContact } from './owner-contacts.mjs';

const [command,directory,input,output]=process.argv.slice(2),app=await StudioLifecycle.open({directory});
const read=async path=>JSON.parse(await readFile(path,'utf8'));
if(command==='audit'){
  await privateStateDirectory(dirname(resolve(input)));
  const state=await app.snapshot(),at=app.now();
  const report={at:at.toISOString(),revision:state.revision,summary:ownerContactSummary(state,at),records:Object.values(state.prospects).map(r=>({prospect_id:r.id,name:r.name,call_lane:r.call_lane??'research',...ownerContactView(r,at)}))};
  await writeFile(input,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report.summary));
}else if(command==='collect'){
  await privateStateDirectory(output);
  const plan=await read(input),state=await app.snapshot();
  check(plan.schema_version===1&&plan.approval_ref?.length>5&&Array.isArray(plan.items)&&plan.items.length>0&&plan.items.length<=10&&new Set(plan.items.map(i=>i.prospect_id)).size===plan.items.length&&new Set(plan.items.map(i=>i.job.id)).size===plan.items.length,'An approved contact batch of at most ten existing cards is required');
  for(const i of plan.items)check(state.prospects[i.prospect_id]&&i.bound_contact_sha256===hash(state.prospects[i.prospect_id].contact),'Contact plan identity changed');
  const client=new AppConnectors({cwd:directory,conversationRef:'evzcontact6f93'});let connect;
  try{
    try{connect=await client.connect();}catch{console.log('Apollo identity adapter unavailable; public-source capture continues without enrichment.');}
    for(const i of plan.items){const saved=await retainContactDiscovery(output,state.prospects[i.prospect_id],i.job,{connect});console.log(JSON.stringify({job:i.job.id,sources:saved.report.snapshots?.sources.length??0,apollo:saved.report.apollo.status,capture_failure:saved.report.capture_failure??null}));}
  }finally{await client.close();}
}else if(command==='apply'){
  const packet=await read(input);console.log(JSON.stringify(await applyOwnerContact(app,packet)));
}else throw Error('Use audit DIRECTORY OUTPUT, collect DIRECTORY PLAN EVIDENCE_DIRECTORY, or apply DIRECTORY REVIEWED_PACKET');
