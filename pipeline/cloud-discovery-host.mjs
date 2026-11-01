import {check,StudioLifecycle} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {cloudDiscoveryCapability,cloudDiscoveryStatus} from './cloud-discovery.mjs';
import {cloudDiscoveryCoordinator} from './cloud-discovery-service.mjs';

const response=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
// The clock only coordinates saved tasks. It cannot run a model, renew usage evidence or buy capacity.
export function createCloudDiscoveryClock({env=process.env,storeFactory=defaultStore,now=()=>new Date()}={}){return async(request,context)=>{
 if(env.EVZ_OPERATIONS_DESK_ENABLED!==cloudDiscoveryCapability||env.EVZ_DISCOVERY_CLOCK_RUNTIME!==cloudDiscoveryCapability||context?.deploy?.context!=='production'||context.deploy.published!==true||request.method!=='POST')return response(503,{held:true});
 const deadline=+now()+25000,signal=AbortSignal.timeout(25000);
 const expired=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Invocation expired')),{once:true}));expired.catch(()=>{});
 let binding;try{
  binding=JSON.parse(env.EVZ_OPERATIONS_MANUAL_BINDING);validateManualBinding(binding.scope);const b=binding.scope;
  check(b.capability===cloudDiscoveryCapability&&context.site?.id===b.site_id&&context.deploy.id===b.deploy_id&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace,'Exact published discovery authority required');
  const reader=request.body?.getReader();check(reader,'Scheduled envelope required');let size=0;const chunks=[];try{for(;;){const {done,value}=await Promise.race([reader.read(),expired]);if(done)break;size+=value.length;check(size<=1024,'Bounded scheduled envelope required');chunks.push(value);}}finally{void reader.cancel().catch(()=>{});}
  const input=JSON.parse(Buffer.concat(chunks).toString());check(Object.keys(input).join(',')==='next_run'&&typeof input.next_run==='string'&&Number.isFinite(Date.parse(input.next_run)),'Scheduled envelope required');
 }catch{return response(400,{held:true});}
 try{return await Promise.race([(async()=>{
  const raw=await storeFactory(binding.scope.namespace),store=new ConditionalLifecycleStore(raw,{manualBinding:binding,now}),app=await StudioLifecycle.fromStore({store,now}),s=await app.snapshot();
  if(cloudDiscoveryStatus(s,app.config,now().toISOString()).status!=='Ready')return response(503,{held:true});
  const task=Object.values(s.cloud_discovery.tasks).find(t=>t.status==='Reviewed'&&!t.imports&&t.epoch===s.cloud_discovery.epoch);
  check(!signal.aborted&&+now()<deadline,'Discovery invocation expired');
  let result;
  try{result=await cloudDiscoveryCoordinator(app,task?'import':'queue-daily',{revision:s.revision,...(task?{id:task.id}:{})},{deadline});}
  catch(error){
   if(!task||error.code!=='DISCOVERY_IMPORT_INVALID')throw error;
   check(!signal.aborted&&+now()<deadline,'Discovery invocation expired');
   result=await cloudDiscoveryCoordinator(app,'hold',{revision:(await app.snapshot()).revision,id:task.id,task_sha256:error.task_sha256,reason:String(error.message).slice(0,1000)},{deadline});
   result.task_held=true;
  }
  return response(200,{...result,model_calls:0,sending:false});
 })(),expired]);}catch(error){return response(error.code==='STATE_CONFLICT'?409:503,{held:true,model_calls:0,sending:false});}
};}
export function cloudDiscoveryClockEntry(env={}){
 if(env.CONTEXT!=='production'||env.EVZ_DISCOVERY_CLOCK_BUILD!==cloudDiscoveryCapability)return '// Generated: discovery coordination disabled.\nexport default async()=>Response.json({held:true},{status:503});\n';
 return `// Generated: bounded public discovery coordination only.\nimport {createCloudDiscoveryClock} from '../cloud-discovery-host.mjs';\nexport default (request,context)=>createCloudDiscoveryClock({env:{...process.env,SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''}})(request,context);\nexport const config={schedule:'*/5 * * * *'};\n`;
}
