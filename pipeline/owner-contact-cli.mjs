import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { StudioLifecycle, check, hash } from './lifecycle.mjs';
import { AppConnectors } from './app-connectors.mjs';
import { privateStateDirectory } from './engine.mjs';
import { ownerContactView, ownerContactSummary, retainContactDiscovery, applyOwnerContact } from './owner-contacts.mjs';
import { createContactQueue, contactQueueTick, reviewContactQueue, recoverContactTransport, refineContactSearch, enableApolloGap } from './contact-queue.mjs';

const [command,directory,input,output]=process.argv.slice(2);
let app;for(let attempt=0;!app;attempt++)try{app=await StudioLifecycle.open({directory});}catch(e){if(attempt>=20||e.message!=='Another runner is active; refusing overlapping execution')throw e;await delay(100);}
const read=async path=>JSON.parse(await readFile(path,'utf8'));
if(command==='queue-enable-apollo'){
  console.log(JSON.stringify(await enableApolloGap(app,input,await read(output))));
}else if(command==='audit'){
  await privateStateDirectory(dirname(resolve(input)));
  const state=await app.snapshot(),at=app.now();
  const report={at:at.toISOString(),revision:state.revision,summary:ownerContactSummary(state,at),records:Object.values(state.prospects).map(r=>({prospect_id:r.id,name:r.name,call_lane:r.call_lane??'research',...ownerContactView(r,at)}))};
  await writeFile(input,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report.summary));
}else if(command==='collect'){
  await privateStateDirectory(output);
  const plan=await read(input),state=await app.snapshot();
  check(plan.schema_version===1&&plan.approval_ref?.length>5&&Array.isArray(plan.items)&&plan.items.length>0&&plan.items.length<=10&&new Set(plan.items.map(i=>i.prospect_id)).size===plan.items.length&&new Set(plan.items.map(i=>i.job.id)).size===plan.items.length,'An approved contact batch of at most ten existing cards is required');
  for(const i of plan.items)check(state.prospects[i.prospect_id]&&i.bound_contact_sha256===hash(state.prospects[i.prospect_id].contact),'Contact plan identity changed');
  for(const i of plan.items){const saved=await retainContactDiscovery(output,state.prospects[i.prospect_id],i.job);console.log(JSON.stringify({job:i.job.id,sources:saved.report.snapshots?.sources.length??0,apollo:saved.report.apollo.status,capture_failure:saved.report.capture_failure??null}));}
}else if(command==='queue-create'){
  console.log(JSON.stringify(await createContactQueue(output,await read(input),await app.snapshot())));
}else if(command==='queue-review'){
  console.log(JSON.stringify(await reviewContactQueue(app,output,await read(input))));
}else if(command==='queue-run'){
  let client;
  try{for(let count=0;count<1000;count++){
    if(client?.closed||client?.bytes>20_000_000){await client.close();client=null;}
    const connect={call:async(...args)=>{if(!client){client=new AppConnectors({cwd:directory,conversationRef:'evzownerqueue7c4'});try{await client.connect();}catch(error){await client.close();client=null;throw error;}}return client.call(...args);}};
    const config=await read(resolve(directory,'lifecycle-config.json'));
    const result=await contactQueueTick(app,input,{connect,project:false,priority:config.priority});
    if(count%10===0||result.captured+result.held===result.total)console.log(JSON.stringify(result));
    if(result.captured+result.held===result.total||result.status.startsWith('Paused'))break;
  }}finally{await client?.close();}
}else if(command==='queue-recover-transport'){
  console.log(JSON.stringify(await recoverContactTransport(input)));
}else if(command==='queue-refine-search'){
  console.log(JSON.stringify(await refineContactSearch(app,output,await read(input))));
}else if(command==='apply'){
  const packet=await read(input);console.log(JSON.stringify(await applyOwnerContact(app,packet)));
}else throw Error('Use audit DIRECTORY OUTPUT, collect DIRECTORY PLAN EVIDENCE_DIRECTORY, or apply DIRECTORY REVIEWED_PACKET');
