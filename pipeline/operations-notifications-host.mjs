import {check,hash,StudioLifecycle,businessDate} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {createGoogleOAuth} from './google-oauth.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {observeOperationsNotificationHealth} from './operations-notifications-service.mjs';
import {dispatchNativeNotification,expireNativeClaim} from './native-notification-dispatch.mjs';
import {nativeNotificationCurrent} from './native-notifications.mjs';

const capability='shared-operations-desk-v1',response=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
// Saved health and summary preparation; optional native callback dispatch is separately gated.
export function createOperationsNotificationClock({env=process.env,storeFactory=defaultStore,now=()=>new Date(),googleOAuthOptions={},readHealth,nativeOptions={}}={}){return async(request,context)=>{
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
  let native=null,callbackAttempted=false;if(env.EVZ_NATIVE_NOTIFICATION_DISPATCH==='mcp-events-v1'&&app.config.native_notifications){
   alive();const data=(await store.envelope()).data;alive();const n=data.state.native_notifications,at=now().toISOString();
   const expiredClaim=Object.values(n?.attempts??{}).find(a=>a.status==='Claimed'&&a.deadline<=at);if(expiredClaim){const role=n.outbox[expiredClaim.event_id]?.role;native=await expireNativeClaim(app,role,expiredClaim.claim_id,{deadline});}
   else if(n&&!n.paused&&n.allowance?.expires_at>at&&n.policy_sha256===hash(app.config.native_notifications)&&app.config.native_notifications.expires_at>at&&n.used_total<app.config.native_notifications.max_attempts_total&&(n.used_by_day[businessDate(at)]??0)<app.config.native_notifications.max_attempts_per_day){const event=Object.values(n.outbox).find(o=>{const sub=n.subscriptions[o.role+':'+o.event],message=data.state.team_notifications?.messages[o.notification_id],attempts=Object.values(n.attempts).filter(a=>a.event_id===o.id),last=attempts.at(-1);return businessDate(o.at)===businessDate(at)&&o.epoch===n.epoch&&sub?.active&&sub.generation===o.subscription_generation&&sub.expires_at>at&&message&&nativeNotificationCurrent(data.state,data.config,o,at)&&attempts.length<3&&(!last||last.status==='Uncertain'&&last.next_at&&last.next_at<=at);});if(event){const namespace=env.EVZ_NATIVE_NOTIFICATION_CREDENTIAL_NAMESPACE;check(/^evz-native-notification-secrets-[a-z0-9-]{8,40}$/.test(namespace??'')&&namespace!==b.namespace,'Separate native credential namespace required');const credentialStore=await storeFactory(namespace);alive();const oldId=env.EVZ_NATIVE_NOTIFICATION_PREVIOUS_KEY_ID,oldKey=env.EVZ_NATIVE_NOTIFICATION_PREVIOUS_KEY;check(!oldId&&!oldKey||typeof oldId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(oldId)&&typeof oldKey==='string'&&oldId!==env.EVZ_NATIVE_NOTIFICATION_MASTER_KEY_ID,'Invalid previous key configuration');native=await dispatchNativeNotification(app,event.role,event.id,{credentialStore,masterKey:env.EVZ_NATIVE_NOTIFICATION_MASTER_KEY,keyId:env.EVZ_NATIVE_NOTIFICATION_MASTER_KEY_ID,previousKeys:oldId?{[oldId]:oldKey}:{},...nativeOptions,deadline});callbackAttempted=true;}}
  }
  return response(200,{...result,sending:callbackAttempted,native,model_calls:0});
 })(),expired]);}catch(error){return response(error.code==='STATE_CONFLICT'?409:503,{held:true,sending:false,model_calls:0});}
};}
export function operationsNotificationClockEntry(env={}){
 if(env.CONTEXT!=='production'||env.EVZ_OPERATIONS_NOTIFICATION_CLOCK_BUILD!==capability)return '// Generated: operations notification preparation disabled.\nexport default async()=>Response.json({held:true,sending:false},{status:503});\n';
 return `// Generated: exact published notification preparation and separately gated native dispatch.\nimport {createOperationsNotificationClock} from '../operations-notifications-host.mjs';\nexport default (request,context)=>createOperationsNotificationClock({env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);\nexport const config={schedule:'*/5 * * * *'};\n`;
}
