import {StudioLifecycle,check} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {mailboxDeliveryCapability,mailboxDeliveryStatus,mailboxDeliveryPackage,mailboxDeliveryIntentId} from './mailbox-delivery.mjs';
import {dispatchMailboxDelivery} from './mailbox-delivery-service.mjs';
import {googleHostedTransport} from './google-hosted-transport.mjs';
import {createGoogleOAuth} from './google-oauth.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';

const response=(status,value)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
async function scheduledEnvelope(request,deadline,now){
 const reader=request.body?.getReader();check(reader,'Scheduled envelope required');let bytes=0;const chunks=[],signal=AbortSignal.timeout(Math.max(1,deadline-+now()));
 const read=async()=>{check(!signal.aborted&&+now()<deadline,'Invocation expired');let abort;const expired=new Promise((_,reject)=>{abort=()=>reject(Error('Scheduled envelope deadline expired'));signal.addEventListener('abort',abort,{once:true});});try{return await Promise.race([reader.read(),expired]);}finally{signal.removeEventListener('abort',abort);}};
 try{for(;;){const {done,value}=await read();if(done)break;bytes+=value.length;check(bytes<=1024,'Bounded scheduled envelope required');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}
 const input=JSON.parse(Buffer.concat(chunks).toString());check(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).join(',')==='next_run'&&typeof input.next_run==='string'&&Number.isFinite(Date.parse(input.next_run)),'Scheduled envelope required');
}
// A single minute invocation attempts at most one currently due, separately approved outreach package.
// It never refreshes intake, classifies messages, creates approvals or retries an existing intent.
export function createMailboxDeliveryClock({env=process.env,storeFactory=defaultStore,now=()=>new Date(),googleMailOptions={},googleOAuthOptions={}}={}){
 return async(request,context)=>{
  const deadline=+now()+25000;
  if(env.EVZ_MAILBOX_DELIVERY_CLOCK_RUNTIME!==mailboxDeliveryCapability||env.EVZ_MAILBOX_DELIVERY_RUNTIME!==mailboxDeliveryCapability||env.EVZ_OPERATIONS_DESK_ENABLED!==mailboxDeliveryCapability||context?.deploy?.context!=='production'||context.deploy.published!==true||request.method!=='POST')return response(503,{held:true,attempted:0});
  let binding;
  try{
   binding=JSON.parse(env.EVZ_OPERATIONS_MANUAL_BINDING);validateManualBinding(binding.scope);const b=binding.scope;
   check(b.capability===mailboxDeliveryCapability&&context.site?.id===b.site_id&&context.deploy.id===b.deploy_id&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace,'Exact published delivery clock authority required');
   await scheduledEnvelope(request,deadline,now);
  }catch{return response(400,{held:true,attempted:0});}
  try{
   const raw=await storeFactory(binding.scope.namespace),store=new ConditionalLifecycleStore(raw,{manualBinding:binding,now}),{data}=await store.envelope(),p=data.config.mailbox_delivery,b=binding.scope;
   check(p.site_id===b.site_id&&p.deploy_id===b.deploy_id&&p.origin===b.origin,'Delivery policy deployment differs');
   if(mailboxDeliveryStatus(data.state,data.config,now().toISOString()).status!=='Ready')return response(503,{held:true,attempted:0});
   const d=data.state.mailbox_delivery,at=+now();check(at<deadline,'Invocation expired before selection');
   const candidates=Object.values(d.approvals).filter(a=>a.epoch===d.epoch&&a.package.kind==='outreach'&&Date.parse(a.package.source.scheduled_at)<=at&&at<Date.parse(a.package.source.scheduled_at)+60000&&!d.intents[mailboxDeliveryIntentId(data.state,a)]).sort((a,b)=>a.package.source.scheduled_at.localeCompare(b.package.source.scheduled_at)||a.id.localeCompare(b.id));
   const approval=candidates.find(a=>{try{return mailboxDeliveryPackage(data.state,data.config,{kind:'outreach',project_id:a.package.project_id},a.actor,now().toISOString()).sha256===a.package.sha256;}catch{return false;}});
   if(!approval)return response(200,{status:'Idle',attempted:0});
   const app=await StudioLifecycle.fromStore({store,now});check(+now()<deadline,'Invocation expired before provider access');
   const options={...googleMailOptions};
   if(!options.getAccessToken)options.getAccessToken=createGoogleOAuth({...googleOAuthOptions,env,profile:mailboxProfile,dispatchApp:app,grantId:p.grant_id,now:()=>+now()}).getAccessToken;
   const signal=AbortSignal.timeout(Math.max(1,deadline-+now())),transport=googleHostedTransport({...options,signal,account:p.account,grantId:p.grant_id,requiredProfile:mailboxProfile,now});
   const result=await dispatchMailboxDelivery(app,approval.id,{transport,actor:'delivery',deadline});
   return response(200,{...result,attempted:1});
  }catch(error){return response(error.code==='STATE_CONFLICT'?409:503,{held:true,readback_required:true});}
 };
}
export function mailboxDeliveryClockEntry(env={}){
 if(env.CONTEXT!=='production'||env.EVZ_MAILBOX_DELIVERY_CLOCK_BUILD!==mailboxDeliveryCapability)return '// Generated: scheduled delivery is disabled.\nexport default async()=>Response.json({held:true,attempted:0},{status:503});\n';
 return `// Generated: exact published, separately approved mailbox delivery only.\nimport {createMailboxDeliveryClock} from '../mailbox-delivery-host.mjs';\nexport default (request,context)=>createMailboxDeliveryClock({env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);\nexport const config={schedule:'* * * * *'};\n`;
}
