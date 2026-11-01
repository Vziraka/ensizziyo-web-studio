import {StudioLifecycle,check,hash} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {mailboxClockCapability,isMailboxClockCapability,mailboxClockTickId,applyMailboxClockTransition,mailboxClockStatus} from './mailbox-clock.mjs';
import {syncMailboxStep,mailboxProfile} from './mailbox-intake.mjs';
import {createGoogleOAuth} from './google-oauth.mjs';
import {googleHostedTransport} from './google-hosted-transport.mjs';

const response=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
async function transition(app,type,input,actor,config){
 check(app.store?.key==='workspace'&&isMailboxClockCapability(app.store.manualBinding?.scope.capability),'Exact mailbox clock store required');
 config??=await app.loadConfig();const mailboxClock={type,actor,at:app.now().toISOString(),input};
 return app.change((s,c)=>applyMailboxClockTransition(s,c,mailboxClock),{configFingerprint:hash(config),mailboxClock});
}
export async function mailboxClockCommand(app,type,input,actor){
 check(['allowance','pause'].includes(type)&&['owner','friend'].includes(actor),'Signed clock control required');return transition(app,type,input,actor);
}
export async function runMailboxClock(app,{readStep,deadline,initialEnvelope}={}){
 check(typeof readStep==='function'&&Number.isFinite(deadline),'Bounded read-only clock required');
 const {data:{config:c,state:s}}=initialEnvelope??await app.store.envelope(),at=+app.now(),interval=c.mailbox_clock.interval_minutes*60000;
 if(s.mailbox_failure?.reason==='History expired; full recovery required')return {...mailboxClockStatus(s,c,app.now().toISOString()),held:true,reason:s.mailbox_failure.reason,read_steps:0};
 check(at<deadline,'Invocation budget exhausted before claim');
 const scheduled_at=new Date(Math.floor(at/interval)*interval).toISOString();
 // Reuse only the immutable config fingerprint; each transition still reads and validates fresh canonical state.
 const claim=await transition(app,'claim',{tick_id:mailboxClockTickId(scheduled_at),scheduled_at,revision:s.revision},'clock',c);
 if(claim.duplicate)return {...claim,read_steps:0};
 let reads=0,view=claim;
 for(let step=1;step<=c.mailbox_clock.max_steps_per_tick;step++){
  if(view.tick?.status!=='Running'||view.paused||+app.now()>=Math.min(deadline,Date.parse(view.tick.deadline_at))){view=mailboxClockStatus(await app.snapshot(),c,app.now().toISOString());break;}
  const clockStep={tick_id:claim.tick.id,fence:claim.tick.fence,step};
  await transition(app,'step',clockStep,'clock',c);
  reads++;
  await readStep(clockStep,Math.min(deadline,Date.parse(claim.tick.deadline_at)));
  const after=await app.snapshot();view=mailboxClockStatus(after,c,app.now().toISOString());
  if(after.mailbox_clock.tick.status!=='Running')break;
  if(step===c.mailbox_clock.max_steps_per_tick)view=await transition(app,'finish',{tick_id:claim.tick.id,fence:claim.tick.fence,outcome:'Completed'},'clock',c);
 }
 return {...view,read_steps:reads};
}
export function createMailboxClock({env=process.env,storeFactory=defaultStore,now=()=>new Date(),googleIncomingOptions={},googleOAuthOptions={}}={}){
 return async(request,context)=>{
  const deadline=+now()+25000;
  if(!isMailboxClockCapability(env.EVZ_OPERATIONS_DESK_ENABLED)||env.EVZ_MAILBOX_CLOCK_RUNTIME!==env.EVZ_OPERATIONS_DESK_ENABLED||context?.deploy?.context!=='production'||context.deploy.published!==true||request.method!=='POST')return response(503,{held:true,sending:false});
  let binding;
  try{
   binding=JSON.parse(env.EVZ_OPERATIONS_MANUAL_BINDING);validateManualBinding(binding.scope);const b=binding.scope;
   check(b.capability===env.EVZ_OPERATIONS_DESK_ENABLED&&context.site?.id===b.site_id&&context.deploy.id===b.deploy_id&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace,'Exact published clock authority required');
   const reader=request.body?.getReader();check(reader,'Scheduled envelope required');let size=0;const chunks=[];
   try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;check(size<=1024,'Bounded scheduled envelope required');chunks.push(value);}}finally{await reader.cancel();}
   const input=JSON.parse(Buffer.concat(chunks).toString());check(Object.keys(input).length===1&&typeof input.next_run==='string'&&Number.isFinite(Date.parse(input.next_run)),'Scheduled envelope required');
  }catch{return response(400,{held:true,sending:false});}
  try{
   const raw=await storeFactory(binding.scope.namespace),store=new ConditionalLifecycleStore(raw,{manualBinding:binding,now}),initialEnvelope=await store.envelope();
   // The binding carries a manifest digest, not the policy itself. One validated read is required even to deny expiry.
   const status=mailboxClockStatus(initialEnvelope.data.state,initialEnvelope.data.config,now().toISOString());
   if(status.paused||['Expired','Policy changed','Clock moved backwards','Allowance required'].includes(status.status))return response(503,{held:true,sending:false,read_steps:0});
   const app=await StudioLifecycle.fromStore({store,now});
   check(app.config.mailbox_clock.interval_minutes===Number(env.EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES),'Clock cadence differs from reviewed build');
   const result=await runMailboxClock(app,{deadline,initialEnvelope,readStep:async(clockStep,stepDeadline)=>{
    check(+now()<stepDeadline,'Mailbox deadline exhausted');const signal=AbortSignal.timeout(Math.max(1,stepDeadline-+now()));
    const read=getAccessToken=>syncMailboxStep(app,{clockStep,transport:googleHostedTransport({...googleIncomingOptions,getAccessToken,signal,account:app.config.mailbox.account,grantId:app.config.mailbox.grant_id,requiredProfile:mailboxProfile,now})});
    return googleIncomingOptions.getAccessToken?read(googleIncomingOptions.getAccessToken):createGoogleOAuth({...googleOAuthOptions,env,profile:mailboxProfile,dispatchApp:app,grantId:app.config.mailbox.grant_id,now:()=>+now()}).withMailboxRead(read);
   }});
   return response(200,{...result,sending:false});
  }catch(error){return response(error.code==='STATE_CONFLICT'?409:503,{held:true,sending:false,readback_required:error.code==='STATE_UNCERTAIN'});}
 };
}
export function mailboxClockEntry(env={}){
 if(env.CONTEXT!=='production'||!isMailboxClockCapability(env.EVZ_MAILBOX_CLOCK_BUILD))return '// Generated: automatic mailbox intake is disabled.\nexport default async()=>Response.json({held:true,sending:false},{status:503});\n';
 const interval=Number(env.EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES);check([5,15,30,60].includes(interval),'Reviewed clock interval required');
 const schedule=interval===60?'0 * * * *':`*/${interval} * * * *`;
 return `// Generated: exact published mailbox clock only.\nimport {createMailboxClock} from '../mailbox-clock-host.mjs';\nexport default (request,context)=>createMailboxClock({env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);\nexport const config={schedule:${JSON.stringify(schedule)}};\n`;
}
