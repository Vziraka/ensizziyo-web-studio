import {check,hash} from './lifecycle.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {validateMailboxClockPolicy} from './mailbox-clock.mjs';
import {createMailboxClock} from './mailbox-clock-host.mjs';
import {nativeGuardedFetch} from './native-notification-transport.mjs';

const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(','),'Closed production clock input required');
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const held=()=>Response.json({held:true,sending:false},{status:503,headers:{'Cache-Control':'no-store'}});

// Nonsecret immutable packaging input; never reads environment, storage or providers.
export function validateProductionMailboxClock(input){
 exact(input,'binding,oauth,credentialNamespace,clockPolicy,starts_at,expires_at');
 const {binding,oauth:o,credentialNamespace,clockPolicy:p,starts_at,expires_at}=input;
 exact(binding,'scope,manifest_sha256');validateManualBinding(binding.scope);const b=binding.scope;
 check(b.capability==='shared-operations-desk-v1'&&digest(binding.manifest_sha256),'Exact operations binding required');
 validateMailboxClockPolicy(p);check(p.schema_version===2&&p.site_id===b.site_id&&p.deploy_id===b.deploy_id&&p.origin===b.origin,'Exact policy2 clock deployment required');
 check(utc(starts_at)&&utc(expires_at)&&Date.parse(starts_at)<Date.parse(expires_at)&&Date.parse(expires_at)<=Date.parse(p.expires_at),'Finite clock invocation window required');
 check(/^evz-mailbox-credentials-[a-z0-9-]{8,40}$/.test(credentialNamespace)&&credentialNamespace!==b.namespace,'Separate production Google credential namespace required');
 exact(o,'tenant_id,account,audience,client_id,capability,workspace_id,run_id,namespace,manual_binding_sha256,source_policy_sha256,site_id,deploy_id,origin,redirect_uri');
 check(key(o.tenant_id)&&o.account==='ensizziyo@evzdigital.studio'&&['internal','external-testing'].includes(o.audience)&&/^[A-Za-z0-9_-]{6,180}\.apps\.googleusercontent\.com$/.test(o.client_id),'Exact business Google identity required');
 check(['capability','workspace_id','run_id','namespace','site_id','deploy_id','origin'].every(k=>o[k]===b[k])&&o.manual_binding_sha256===hash(binding)&&digest(o.source_policy_sha256)&&o.redirect_uri===b.origin+'/desk/api/google-oauth/callback','Exact production OAuth source binding required');
 return input;
}

export function createProductionMailboxClock({input=null,env=process.env,now=()=>new Date(),storeFactory,googleOAuthOptions={},googleIncomingOptions={}}={}){
 const pinned=input===null?null:structuredClone(validateProductionMailboxClock(input));
 return async(request,context)=>{
  if(!pinned)return held();
  try{
   const {binding,oauth,credentialNamespace,clockPolicy,starts_at,expires_at}=pinned,b=binding.scope;
   const live=()=>{const date=now();check(date instanceof Date&&Number.isFinite(+date)&&+date>=Date.parse(starts_at)&&+date<Date.parse(expires_at),'Production clock window closed');return date;};
   live();
   check(request.method==='POST'&&new URL(request.url).origin===b.origin&&context?.site?.id===b.site_id&&context?.deploy?.id===b.deploy_id&&context.deploy.context==='production'&&context.deploy.published===true,'Exact published production clock required');
   check(env.EVZ_PRODUCTION_MAILBOX_CLOCK==='finite-intake-v1','Production intake disabled');
   const end=Math.min(+live()+25000,Date.parse(expires_at));
   const controller=new AbortController();
   const alive=()=>{check(!controller.signal.aborted,'Production clock invocation closed');const date=live();check(+date<end,'Production clock invocation expired');return date;};
   const projected={CONTEXT:'production',SITE_ID:b.site_id,DEPLOY_ID:b.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:b.capability,EVZ_OPERATIONS_ORIGIN:b.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:b.namespace,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(binding),EVZ_MAILBOX_CLOCK_RUNTIME:b.capability,EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES:String(clockPolicy.interval_minutes),EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-mailbox-code-v1',EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(oauth),EVZ_GOOGLE_CREDENTIAL_NAMESPACE:credentialNamespace};
   for(const k of ['CREDENTIAL_KEY_ID','CREDENTIAL_KEY','CLIENT_SECRET'])projected['EVZ_GOOGLE_'+k]=env['EVZ_PRODUCTION_GOOGLE_'+k];
   const secret=projected.EVZ_GOOGLE_CREDENTIAL_KEY;
   check(key(projected.EVZ_GOOGLE_CREDENTIAL_KEY_ID)&&typeof secret==='string'&&Buffer.from(secret,'base64url').length===32&&Buffer.from(secret,'base64url').toString('base64url')===secret&&typeof projected.EVZ_GOOGLE_CLIENT_SECRET==='string'&&/^[\x21-\x7e]{10,8192}$/.test(projected.EVZ_GOOGLE_CLIENT_SECRET),'Production Google configuration unavailable');
   const fetchGuard=fetcher=>async(url,options={})=>{alive();const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,end-+alive()))]);const result=await fetcher(url,{...options,signal:options.signal?AbortSignal.any([options.signal,signal]):signal});alive();return result;};
   const defaultStore=async namespace=>{const {getStore}=await import('@netlify/blobs');alive();return getStore({name:namespace,consistency:'strong',fetch:fetchGuard(nativeGuardedFetch)});};
   const guardedStore=factory=>async namespace=>{
    alive();const raw=await factory(namespace);alive();
    return new Proxy(raw,{get(target,property){const value=Reflect.get(target,property);if(typeof value!=='function')return value;return async(...args)=>{alive();const result=await Reflect.apply(value,target,args);alive();if(namespace===b.namespace&&property==='getWithMetadata'&&args[0]==='workspace'&&result?.data){check(hash(result.data.config?.mailbox_clock)===hash(clockPolicy)&&hash(result.data.config?.mailbox)===oauth.source_policy_sha256,'Production clock policy differs from package');}return result;};}});
   };
   const handler=createMailboxClock({env:projected,now:alive,invocationDeadline:end,storeFactory:guardedStore(storeFactory??defaultStore),googleOAuthOptions:{...googleOAuthOptions,storeFactory:guardedStore(googleOAuthOptions.storeFactory??defaultStore),fetcher:fetchGuard(googleOAuthOptions.fetcher??nativeGuardedFetch)},googleIncomingOptions:{...googleIncomingOptions,fetcher:fetchGuard(googleIncomingOptions.fetcher??nativeGuardedFetch)}});
   let timer;
   try{return await Promise.race([handler(request,context),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(held());},Math.max(1,end-+alive()));})]);}
   finally{clearTimeout(timer);controller.abort();}
  }catch{return held();}
 };
}

// Place emitted entry in pipeline/netlify-functions. No ambient build flag supplies input.
export function productionMailboxClockEntry(input=null){
 if(input===null)return 'export default async()=>Response.json({held:true,sending:false},{status:503});\n';
 validateProductionMailboxClock(input);const minutes=input.clockPolicy.interval_minutes;
 return `import {createProductionMailboxClock} from '../production-mailbox-clock.mjs';\nconst input=${JSON.stringify(input)};\nexport default createProductionMailboxClock({input});\nexport const config={schedule:${JSON.stringify(minutes===60?'0 * * * *':`*/${minutes} * * * *`)}};\n`;
}
