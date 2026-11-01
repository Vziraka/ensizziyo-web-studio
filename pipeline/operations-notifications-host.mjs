import {check,StudioLifecycle} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {createGoogleOAuth} from './google-oauth.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {observeOperationsNotificationHealth} from './operations-notifications-service.mjs';

const capability='shared-operations-desk-v1',response=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
// Saved health and summary preparation only; no token refresh, model call or notification transport.
export function createOperationsNotificationClock({env=process.env,storeFactory=defaultStore,now=()=>new Date(),googleOAuthOptions={},readHealth}={}){return async(request,context)=>{
 if(env.EVZ_OPERATIONS_DESK_ENABLED!==capability||env.EVZ_OPERATIONS_NOTIFICATION_CLOCK_RUNTIME!==capability||context?.deploy?.context!=='production'||context.deploy.published!==true||request.method!=='POST')return response(503,{held:true,sending:false});
 const deadline=+now()+25000,signal=AbortSignal.timeout(25000),expired=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Notification invocation expired')),{once:true}));expired.catch(()=>{});
 const alive=()=>check(!signal.aborted&&+now()<deadline,'Notification invocation expired');
 try{return await Promise.race([(async()=>{
  const binding=JSON.parse(env.EVZ_OPERATIONS_MANUAL_BINDING);validateManualBinding(binding.scope);const b=binding.scope;
  check(b.capability===capability&&context.site?.id===b.site_id&&context.deploy.id===b.deploy_id&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace,'Exact published notification authority required');
  const reader=request.body?.getReader();check(reader,'Scheduled envelope required');let size=0;const chunks=[];
  try{for(;;){const {done,value}=await Promise.race([reader.read(),expired]);if(done)break;size+=value.length;check(size<=1024,'Bounded scheduled envelope required');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}
  const input=JSON.parse(Buffer.concat(chunks).toString());check(Object.keys(input).join(',')==='next_run'&&typeof input.next_run==='string'&&Number.isFinite(Date.parse(input.next_run)),'Scheduled envelope required');alive();
  const raw=await storeFactory(b.namespace);alive();const store=new ConditionalLifecycleStore(raw,{manualBinding:binding,now}),app=await StudioLifecycle.fromStore({store,now});alive();
  const result=await observeOperationsNotificationHealth(app,{deadline,readHealth:readHealth??(app=>createGoogleOAuth({...googleOAuthOptions,env,profile:mailboxProfile,dispatchApp:app,grantId:app.config.mailbox.grant_id,now:()=>+now()}).status())});
  return response(200,{...result,sending:false,model_calls:0});
 })(),expired]);}catch(error){return response(error.code==='STATE_CONFLICT'?409:503,{held:true,sending:false,model_calls:0});}
};}
export function operationsNotificationClockEntry(env={}){
 if(env.CONTEXT!=='production'||env.EVZ_OPERATIONS_NOTIFICATION_CLOCK_BUILD!==capability)return '// Generated: operations notification preparation disabled.\nexport default async()=>Response.json({held:true,sending:false},{status:503});\n';
 return `// Generated: exact published saved notification preparation only.\nimport {createOperationsNotificationClock} from '../operations-notifications-host.mjs';\nexport default (request,context)=>createOperationsNotificationClock({env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);\nexport const config={schedule:'*/5 * * * *'};\n`;
}
