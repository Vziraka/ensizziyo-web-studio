import {StudioLifecycle,check} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {prepareTeamNotifications} from './team-notifications.mjs';

const response=(status,result)=>Response.json(result,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}

// This candidate can prepare fictional messages only; it has no delivery or execution adapter.
export function createNotificationClock({env=process.env,storeFactory=defaultStore,now=()=>new Date()}={}){
 return async (request,context)=>{
  if(env.EVZ_NOTIFICATION_CLOCK_ENABLED!=='fictional-preparation-only'||context?.deploy?.context!=='production'||context.deploy.published!==true||!env.EVZ_NOTIFICATION_CLOCK_SITE_ID||context.site?.id!==env.EVZ_NOTIFICATION_CLOCK_SITE_ID||!env.DEPLOY_ID||context.deploy.id!==env.DEPLOY_ID||!/^evz-redesign-proof-[a-z0-9-]{8,44}$/.test(env.EVZ_OPERATIONS_BLOB_NAMESPACE??''))return response(503,{held:true,delivery_enabled:false});
  if(request.method!=='POST')return response(405,{held:true,delivery_enabled:false});
  try{
   const reader=request.body?.getReader();check(reader,'Scheduled clock envelope required');let body='',bytes=0;
   for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024){await reader.cancel();throw Error('Clock envelope exceeds limit');}body+=Buffer.from(value).toString('utf8');}
   const input=JSON.parse(body);check(Object.keys(input).length===1&&typeof input.next_run==='string'&&Number.isFinite(Date.parse(input.next_run)),'Scheduled clock envelope required');
  }catch{return response(400,{held:true,delivery_enabled:false});}
  try{
   const raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE),store=new ConditionalLifecycleStore(raw,{maxBytes:2_000_000}),app=await StudioLifecycle.fromStore({store,now});
   check(typeof app.config.preview_seeded_at==='string','Existing fictional workspace required');
   const view=await prepareTeamNotifications(app);
   return response(200,{prepared:true,delivery_enabled:false,pending:view.pending,hold:view.hold});
  }catch(error){return response(error.code==='STATE_CONFLICT'?409:503,{held:true,delivery_enabled:false,readback_required:error.code==='STATE_UNCERTAIN'});}
 };
}

// Netlify parses literal source config. Default builds emit no scheduler and no storage-capable handler.
export function notificationClockEntry(env={}){
 if(env.CONTEXT!=='production'||env.EVZ_NOTIFICATION_CLOCK_BUILD!=='scheduled-fictional-preparation-only')return '// Generated: hosted notification clock is disabled.\nexport default async()=>Response.json({held:true,delivery_enabled:false},{status:503});\n';
 return "// Generated: separately gated fictional preparation only.\nimport {createNotificationClock} from '../notification-clock.mjs';\nexport default (request,context)=>createNotificationClock()(request,context);\nexport const config={schedule:'* * * * *'};\n";
}
