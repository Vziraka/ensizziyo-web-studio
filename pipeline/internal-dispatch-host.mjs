import {createHmac,timingSafeEqual} from 'node:crypto';
import {check,hash,businessDate,StudioLifecycle} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {manualDispatchCapability,isDispatchCapability,dispatchPrincipal,validateDispatchBinding,currentDispatch,dispatchTransition,nextStandingMessage,assertStandingPost} from './shared-internal-dispatch.mjs';
import {googleHostedTransport} from './google-hosted-transport.mjs';
import {syncIncomingMail} from './google-incoming-mail.mjs';
import {createGoogleOAuth,dispatchOAuthProfile} from './google-oauth.mjs';

export const dispatchWorkerPath='/desk/api/internal-dispatch-background';
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
export function dispatchHostBinding(env,context){
 check(isDispatchCapability(env.EVZ_OPERATIONS_DESK_ENABLED)&&env.EVZ_INTERNAL_DISPATCH_RUNTIME===env.EVZ_OPERATIONS_DESK_ENABLED&&env.CONTEXT==='production','Standing host runtime disabled');
 const b=JSON.parse(env.EVZ_INTERNAL_DISPATCH_BINDING);validateDispatchBinding(b.scope);
 check(context?.deploy?.context==='production'&&context.deploy.published===true&&context.site?.id===env.SITE_ID&&context.deploy.id===env.DEPLOY_ID,'Published trusted host context required');
 check(b.scope.capability===env.EVZ_OPERATIONS_DESK_ENABLED&&b.scope.site_id===env.SITE_ID&&b.scope.deploy_id===env.DEPLOY_ID&&b.scope.origin===env.EVZ_OPERATIONS_ORIGIN&&b.scope.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE,'Exact current host deployment required');
 check(typeof env.EVZ_INTERNAL_DISPATCH_SECRET==='string'&&/^[A-Za-z0-9_-]{43,100}$/.test(env.EVZ_INTERNAL_DISPATCH_SECRET)&&![env.EVZ_OPERATIONS_SESSION_SECRET,env.EVZ_REFINEMENT_DISPATCH_SECRET,env.EVZ_KNOWN_RESEARCH_DISPATCH_SECRET].includes(env.EVZ_INTERNAL_DISPATCH_SECRET),'Dedicated host dispatch MAC secret required');return b;
}
const mac=(secret,ref)=>createHmac('sha256',secret).update('evz-internal-dispatch-v1:'+JSON.stringify(ref)).digest();
export function dispatchReference(binding,tick){return {workspace_id:binding.scope.workspace_id,tick_id:tick.id,policy_sha256:binding.scope.policy_sha256,binding_sha256:hash(binding),expires_at:tick.deadline};}
export function signDispatchReference(env,ref){return mac(env.EVZ_INTERNAL_DISPATCH_SECRET,ref).toString('base64url');}
export function verifyDispatchReference(env,binding,ref,token,now){
 check(ref&&Object.keys(ref).sort().join(',')==='binding_sha256,expires_at,policy_sha256,tick_id,workspace_id'&&/^tick-[a-f0-9]{40}$/.test(ref.tick_id)&&ref.workspace_id===binding.scope.workspace_id&&ref.binding_sha256===hash(binding)&&ref.policy_sha256===binding.scope.policy_sha256&&+now<Date.parse(ref.expires_at),'Exact current opaque dispatch reference required');
 const actual=Buffer.from(token??'','base64url'),expected=mac(env.EVZ_INTERNAL_DISPATCH_SECRET,ref);check(actual.length===expected.length&&timingSafeEqual(actual,expected),'Host MAC required');
}
async function body(request,max=2048){check(request.body,'Tiny dispatch envelope required');const reader=request.body.getReader(),chunks=[];let bytes=0;try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;check(bytes<=max,'Dispatch envelope exceeds bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}return JSON.parse(Buffer.concat(chunks));}
async function open(env,binding,storeFactory,now){const raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE);return StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{dispatchBinding:binding}),now});}
export async function enqueueInternalDispatch(app,tick,{env,context,fetcher=fetch}={}){
 const binding=dispatchHostBinding(env,context),ref=dispatchReference(binding,tick);check(hash(app.store.dispatchBinding)===hash(binding)&&tick.status==='Reserved','Exact reserved tick required');
 const response=await fetcher(binding.scope.origin+dispatchWorkerPath,{method:'POST',headers:{'Content-Type':'application/json','x-evz-internal-dispatch':signDispatchReference(env,ref)},body:JSON.stringify(ref),redirect:'error',signal:AbortSignal.timeout(5000)});await response.body?.cancel();return {tick_id:tick.id,acknowledged:response.status===202,status:'Read durable exact background claim; acknowledgement is not delivery'};
}
export function createInternalDispatchClock({env=process.env,storeFactory=defaultStore,now=()=>new Date(),fetcher=fetch}={}){
 return async(request,context)=>{
  try{
   const binding=dispatchHostBinding(env,context);check(request.method==='POST','Trusted scheduled POST required');const input=await body(request,1024);check(Object.keys(input).length===1&&typeof input.next_run==='string'&&Number.isFinite(Date.parse(input.next_run)),'Scheduled envelope required');
   const app=await open(env,binding,storeFactory,now),s=await app.snapshot(),p=currentDispatch(s,await app.loadConfig(),now()),id='tick-'+hash({policy:hash(p),slot:Math.floor(+now()/(p.limits.poll_seconds*1000))}).slice(0,40),prior=s.operations.internal_dispatch.ticks[id];
   if(prior)return reply(200,{tick_id:id,status:prior.status,readback_required:true,delivery:false});
   await dispatchTransition(app,{kind:'reserve-tick',tick_id:id});const saved=(await app.snapshot()).operations.internal_dispatch.ticks[id];
   // A lost 202 acknowledgement never requeues this reserved tick. Inspect/reconcile it explicitly.
   const result=await enqueueInternalDispatch(app,saved,{env,context,fetcher});
   return reply(result.acknowledged?202:503,{...result,delivery:false});
  }catch{return reply(503,{held:true,readback_required:true,delivery:false});}
 };
}

// Each request is reserved before IO. Overall time and bytes span tokens, fetch and body reads.
export async function executeInternalDispatch(app,ref,{env,context,getAccessToken,fetcher=fetch,oauthOptions={}}={}){
 const binding=dispatchHostBinding(env,context);check(hash(app.store.dispatchBinding)===hash(binding),'Worker workspace differs');const initial=await app.snapshot(),tick=initial.operations?.internal_dispatch?.ticks[ref.tick_id];
 check(tick&&hash(dispatchReference(binding,tick))===hash(ref),'Read the exact durable tick');if(tick.status!=='Reserved')return {status:tick.status,replayed:false};
 await dispatchTransition(app,{kind:'claim-tick',tick_id:ref.tick_id});
 const deadline=Math.min(Date.parse(tick.deadline)-+app.now(),app.config.internal_dispatch.limits.milliseconds_tick),controller=new AbortController();let sequence=0,totalBytes=0,rawReadback;
 const timer=setTimeout(()=>controller.abort(),Math.max(1,deadline));
 const bounded=async start=>{
  check(!controller.signal.aborted,'Overall dispatch deadline exhausted');let rejectAbort;const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('Overall dispatch deadline exhausted'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{return await Promise.race([start(),aborted]);}finally{controller.signal.removeEventListener('abort',rejectAbort);}
 };
 const guard=async()=>{dispatchHostBinding(env,context);check(!controller.signal.aborted,'Overall dispatch deadline exhausted');const c=await app.loadConfig(),s=await app.snapshot(),t=s.operations.internal_dispatch.ticks[ref.tick_id];currentDispatch(s,c,app.now(),{recovery:Boolean(t.reconciliation)});check(t.status==='Claimed'&&+app.now()<Date.parse(t.deadline)&&t.day===businessDate(app.now()),'Worker attempt closed or expired');};
 const reserve=async(operation,action_id)=>{await guard();const request_id='io-'+(++sequence);await dispatchTransition(app,{kind:'io',tick_id:ref.tick_id,request_id,operation,...(action_id?{action_id}:{})});await guard();return request_id;};
 const observed=async(id,bytes,ok)=>dispatchTransition(app,{kind:'io-result',tick_id:ref.tick_id,request_id:id,bytes,ok});
 const boundedFetch=async(url,options={})=>{
  const u=new URL(url);check(['https://gmail.googleapis.com','https://oauth2.googleapis.com','https://www.googleapis.com'].includes(u.origin),'Unsupported host provider');const operation=u.origin==='https://gmail.googleapis.com'&&u.pathname.endsWith('/messages/send')?'POST':'GET';let action_id;
  if(operation==='POST'){const payload=JSON.parse(options.body),s=await app.snapshot(),matches=Object.entries(s.operations.requests).filter(([,q])=>q.standing_internal&&q.tick_id===ref.tick_id&&q.raw_base64url===payload.raw);check(Object.keys(payload).length===1&&matches.length===1,'Exact original internal MIME only');action_id=matches[0][0].slice(0,-7);}
  const id=await reserve(operation,action_id);if(action_id)assertStandingPost(await app.snapshot(),app.config,ref.tick_id,action_id,app.now());let size=0,reader;
  try{
   const response=await bounded(()=>fetcher(url,{...options,signal:controller.signal,redirect:'error'}));await guard();check(response.body,'Provider body unavailable');reader=response.body.getReader();const chunks=[];
   for(;;){const {done,value}=await bounded(()=>reader.read());await guard();if(done)break;size+=value.length;totalBytes+=value.length;check(totalBytes<=app.config.internal_dispatch.limits.bytes_tick,'Overall dispatch body byte ceiling exhausted');chunks.push(Buffer.from(value));}
   await observed(id,size,response.ok);const bytes=Buffer.concat(chunks);
   if(u.origin==='https://gmail.googleapis.com'&&u.searchParams.get('format')==='raw'&&response.ok)rawReadback=JSON.parse(bytes);
   return new Response(bytes,{status:response.status,headers:response.headers});
  }catch(error){try{await observed(id,Math.min(size,app.config.internal_dispatch.limits.bytes_tick),false);}catch{}throw error;}finally{await reader?.cancel().catch(()=>{});}
 };
 let originalToken=getAccessToken;
 const accessToken=()=>{originalToken??=createGoogleOAuth({...oauthOptions,env,now:()=>+app.now(),profile:dispatchOAuthProfile,grantId:app.config.internal_dispatch.grant_id,fetcher:boundedFetch}).getAccessToken;return originalToken();};
 const token=async()=>{const id=await reserve('token');try{const result=await bounded(accessToken);await observed(id,0,true);await guard();return result;}catch(error){try{await observed(id,0,false);}catch{}throw error;}};
 token.invalidate=async rejected=>{await guard();if(originalToken?.invalidate)await bounded(()=>originalToken.invalidate(rejected));await guard();};
 const p=app.config.internal_dispatch,provider=googleHostedTransport({getAccessToken:token,fetcher:boundedFetch,account:p.account_email,grantId:p.grant_id});
 async function reconcile(id){const s=await app.snapshot(),q=s.operations.requests[id+'-intent'];check(q?.raw_base64url,'Retain incomplete MIME intent; no resend');rawReadback=null;await provider.preflight();await provider.reconcileSent({raw:Buffer.from(q.raw_base64url,'base64url'),message_id:q.rfc_message_id,thread_id:q.provider_thread_id??null},q.provider_message_id??null);await guard();check(rawReadback,'Complete raw Sent observation required');await dispatchTransition(app,{kind:'verified',tick_id:ref.tick_id,action_id:id,raw:rawReadback});}
 try{
  if(tick.reconciliation){await reconcile(tick.reconciliation);await dispatchTransition(app,{kind:'close-tick',tick_id:ref.tick_id,held:false});return {status:'Complete',readback_required:true};}
  const pending=Object.entries((await app.snapshot()).operations.requests??{}).filter(([,q])=>q.standing_internal&&!['Verified','Cancelled'].includes(q.status));
  for(const [logical,q] of pending.slice(0,1)){check(q.status==='Uncertain','Unclaimed retained intent requires explicit recovery; never retry');await reconcile(logical.slice(0,-7));}
  check(pending.length<=1,'More retained intents require a bounded subsequent reconcile tick');
  await guard();const observations=[],captured=Object.fromEntries(['incomingProfile','incomingHistory','incomingThread'].map(name=>[name,async(...args)=>{try{const value=await provider[name](...args);observations.push({name,args,value});return value;}catch(error){observations.push({name,args,error:true,...(error.status?{status:error.status}:{})});throw Error('Bounded incoming read unavailable');}}]));
  // Run the existing parser/reducer on an isolated prospective state; publish through replayed CAS only.
  const before=await app.snapshot(),scratch=structuredClone(before),at=app.now().toISOString(),sim={config:app.config,store:{dispatchBinding:binding},now:()=>new Date(at),loadConfig:async()=>app.config,snapshot:async()=>structuredClone(scratch),change:async fn=>fn(scratch)};
  await syncIncomingMail(sim,{actor:dispatchPrincipal,env,transport:captured});await guard();
  await dispatchTransition(app,{kind:'incoming',tick_id:ref.tick_id,observations});
  await dispatchTransition(app,{kind:'prepare',tick_id:ref.tick_id});
  for(let i=0;i<p.limits.sends_tick;i++){
   await guard();const s=await app.snapshot(),m=nextStandingMessage(s,await app.loadConfig(),app.now());if(!m)break;
   await dispatchTransition(app,{kind:'reserve-send',tick_id:ref.tick_id,notification_id:m.id});const id='team-'+hash({run:s.run_id,notification:m.id}).slice(0,32),q=(await app.snapshot()).operations.requests[id+'-intent'];
   await provider.preflight();await guard();await dispatchTransition(app,{kind:'claim-send',tick_id:ref.tick_id,action_id:id});
   const sent=await provider.send({raw:Buffer.from(q.raw_base64url,'base64url'),message_id:q.rfc_message_id,thread_id:null});
   await dispatchTransition(app,{kind:'sent-observation',tick_id:ref.tick_id,action_id:id,message_id:sent.id,thread_id:sent.thread_id});await guard();await reconcile(id);
  }
  await dispatchTransition(app,{kind:'close-tick',tick_id:ref.tick_id,held:false});
 }catch{try{await dispatchTransition(app,{kind:'close-tick',tick_id:ref.tick_id,held:true});}catch{} }
 finally{clearTimeout(timer);controller.abort();}
 return {status:(await app.snapshot()).operations.internal_dispatch.ticks[ref.tick_id].status,readback_required:true};
}
export function createInternalDispatchWorker({env=process.env,storeFactory=defaultStore,now=()=>new Date(),...options}={}){
 return async(request,context)=>{try{const binding=dispatchHostBinding(env,context);check(request.method==='POST'&&new URL(request.url).origin===binding.scope.origin&&new URL(request.url).pathname===dispatchWorkerPath,'Protected background POST required');const ref=await body(request);verifyDispatchReference(env,binding,ref,request.headers.get('x-evz-internal-dispatch'),now());const app=await open(env,binding,storeFactory,now);return reply(200,await executeInternalDispatch(app,ref,{...options,env,context}));}catch{return reply(409,{held:true,readback_required:true,delivery:false});}};
}
export function internalDispatchClockEntry(env={}){
 if(env.CONTEXT!=='production'||!isDispatchCapability(env.EVZ_INTERNAL_DISPATCH_BUILD)||env.EVZ_INTERNAL_DISPATCH_BUILD===manualDispatchCapability&&env.EVZ_OPERATIONS_DESK_ENABLED!==manualDispatchCapability)return '// Generated: standing dispatch clock disabled.\nexport default async()=>Response.json({held:true},{status:503});\n';
 return "import {createInternalDispatchClock} from '../internal-dispatch-host.mjs';\nexport default (request,context)=>createInternalDispatchClock({env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);\nexport const config={schedule:'* * * * *'};\n";
}
