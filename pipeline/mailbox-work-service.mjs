import {createHmac,timingSafeEqual} from 'node:crypto';
import {StudioLifecycle,check,hash} from './lifecycle.mjs';
import {mailboxWorkCapability,validateMailboxWorkState,applyMailboxWorkTransition,mailboxWorkContext,mailboxWorkReceipt,mailboxWorkAdoption} from './mailbox-work.mjs';
import {emailDraftReviewBinding} from './email-draft-policy.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {blobProjectOriginalStore,originalDigest,originalChunkSize} from './shared-project-originals.mjs';

const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const token=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(','),'Use exact worker request fields');
export const mailboxWorkSegmentBytes=262144;

export function applyMailboxWorkChange(state,config,transition){
 if(transition.type!=='adopt')return applyMailboxWorkTransition(state,config,transition);
 exact(transition,'type,actor,at,input');exact(transition.input,'id,revision,result_sha256');
 const {input,actor,at}=transition,t=state.email_draft_tasks?.[input.id];
 validateMailboxWorkState(state,config);
 if(t?.status==='Adopted'){
  const e=state.events[t.adoption_event];check(t.adopted_by===actor&&t.result_sha256===input.result_sha256&&e?.actor===actor&&e.type==='reply_draft_saved'&&e.data?.agent_result_sha256===t.result_sha256,'Adoption receipt conflicts');return {id:t.id,event_id:e.id,duplicate:true,revision:state.revision};
 }
 mailboxWorkAdoption(state,config,input,actor,at);
 const r=state.prospects[t.project_id],event={id:'work-adopt-'+hash({id:t.id,result:t.result_sha256}).slice(0,32),prospect_id:r.id,type:'reply_draft_saved',at,data:{source_id:r.reply.source_id,reply_sha256:hash(r.reply),source_sha256:r.reply.content.source_sha256,body:t.result.body,agent_task_id:t.id,agent_result_sha256:t.result_sha256,agent_context_sha256:t.context_sha256,attachments:t.result.attachments??[]}};
 const reducer=new StudioLifecycle(null,()=>new Date(at));reducer.config=config;
 const result=reducer.reduceEvent(state,event,{actor,expectedRevision:input.revision,manualRecording:true,agentDraft:t});
 Object.assign(t,{status:'Adopted',adoption_event:event.id,adopted_by:actor,adopted_at:at,adoption_binding_sha256:emailDraftReviewBinding(config)});
 validateMailboxWorkState(state,config);return {...result,id:t.id,event_id:event.id};
}
async function settings(app){
 check(app.store?.key==='workspace'&&[mailboxWorkCapability,'shared-mailbox-clock-v1'].includes(app.store.manualBinding?.scope.capability),'Exact mailbox worker store required');
 const c=await app.loadConfig();check([mailboxWorkCapability,'shared-mailbox-clock-v1'].includes(c.shared_capability),'Exact mailbox worker configuration required');app.config=c;app.originalStore=blobProjectOriginalStore(app.store.store);return hash(c);
}
export async function mailboxWorkCommand(app,type,input,actor){
 check(['create','cancel','adopt'].includes(type)&&['owner','friend'].includes(actor),'Signed operator task command required');
 const fingerprint=await settings(app),transition={type,actor,input,at:app.now().toISOString()};
 if(type==='adopt'){
  const state=await app.snapshot(),t=state.email_draft_tasks?.[input.id];
  if(t?.status!=='Adopted'){
   mailboxWorkAdoption(state,app.config,input,actor,transition.at);
   for(const part of t.result.attachments??[]){const read=await readProjectAsset(app,t.project_id,part.asset_id,part.version_id);check(read.original.sha256===part.sha256&&originalDigest(read.bytes)===part.sha256,'Approved PDF changed before draft adoption');}
  }
 }
 return app.change((state,config)=>applyMailboxWorkChange(state,config,transition),{configFingerprint:fingerprint,mailboxWork:transition});
}

// Only the gateway calls this interface. Its credential never grants an operator session.
export function createMailboxWorker(app,{credential,leaseSecret,context,origin}){
 check(token(credential)&&token(leaseSecret)&&credential!==leaseSecret,'Separate worker and lease credentials required');
 async function authorized(){
  await settings(app);const p=app.config.mailbox_work;
  check(token(p.credential_sha256)&&timingSafeEqual(Buffer.from(hash(credential),'hex'),Buffer.from(p.credential_sha256,'hex')),'Worker credential revoked');
  check(context?.site?.id===p.gateway_site_id&&context?.deploy?.id===p.gateway_deploy_id&&['deploy-preview','production'].includes(context.deploy.context)&&origin===p.gateway_origin,'Exact trusted worker deployment required');return p;
 }
 const leaseFor=(p,id,request)=>createHmac('sha256',Buffer.from(leaseSecret,'hex')).update(JSON.stringify({policy:hash(p),id,request})).digest('hex');
 async function change(type,input){const p=await authorized(),fingerprint=hash(app.config),transition={type,actor:'worker',at:app.now().toISOString(),input:{...input,worker_id:p.worker_id}};return app.change((s,c)=>applyMailboxWorkChange(s,c,transition),{configFingerprint:fingerprint,mailboxWork:transition});}
 async function packet(id,lease){const p=await authorized();return mailboxWorkContext(await app.snapshot(),app.config,id,{worker_id:p.worker_id,token:lease},app.now().toISOString());}
 return {
  async authenticate(){await authorized();return {workspace_id:app.store.manualBinding.scope.workspace_id};},
  async claim(input){
   exact(input,'request_id');check(key(input.request_id),'Stable claim request identity required');const p=await authorized(),s=await app.snapshot();validateMailboxWorkState(s,app.config);
   const tasks=Object.values(s.email_draft_tasks??{}).filter(t=>t.schema_version===2&&t.policy_sha256===hash(p));
   const t=tasks.find(t=>t.lease?.request_id===input.request_id)??tasks.filter(t=>t.status==='Ready').sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id))[0];
   if(!t)return {status:'Idle'};
   const lease=leaseFor(p,t.id,input.request_id),saved=await change('claim',{id:t.id,request_id:input.request_id,lease_sha256:hash(lease)});
   return {status:'Claimed',task:saved,lease};
  },
  context:packet,
  async receipt(id,lease){const p=await authorized();return mailboxWorkReceipt(await app.snapshot(),app.config,id,{worker_id:p.worker_id,token:lease},app.now().toISOString());},
  async submit(input){exact(input,'id,lease,context_sha256,result');return change('result',input);},
  async fail(input){exact(input,'id,lease,reason');return change('failure',input);},
  async pdf(input){
   exact(input,'id,lease,asset_id,version_id,sha256,offset');check(Number.isSafeInteger(input.offset)&&input.offset>=0,'Exact PDF segment offset required');
   const before=await packet(input.id,input.lease),item=before.attachment_catalogue.items.find(a=>a.asset_id===input.asset_id&&a.version_id===input.version_id&&a.sha256===input.sha256);
   check(item&&item.bytes<=20_000_000&&input.offset<item.bytes,'Choose an exact offered bounded PDF');
   const originals=blobProjectOriginalStore(app.store.store),manifest=await originals.manifest(item),index=Math.floor(input.offset/originalChunkSize),chunk=await originals.chunk(manifest,index),start=input.offset%originalChunkSize;
   const bytes=chunk.subarray(start,Math.min(start+mailboxWorkSegmentBytes,chunk.length));
   const after=await packet(input.id,input.lease);check(after.task.context_sha256===before.task.context_sha256,'Task source changed during original read');
   return {asset_id:input.asset_id,version_id:input.version_id,sha256:item.sha256,total_bytes:item.bytes,offset:input.offset,bytes:bytes.length,segment_sha256:originalDigest(bytes),next_offset:input.offset+bytes.length<item.bytes?input.offset+bytes.length:null,data:bytes.toString('base64'),mime_type:'application/pdf'};
  }
 };
}
