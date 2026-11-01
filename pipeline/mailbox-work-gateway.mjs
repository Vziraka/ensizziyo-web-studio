import {timingSafeEqual} from 'node:crypto';
import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {createMailboxWorker} from './mailbox-work-service.mjs';

async function defaultStore(scope,token){const {getStore}=await import('@netlify/blobs');return getStore({name:scope.namespace,siteID:scope.site_id,token,consistency:'strong'});}
export async function openMailboxWorker({env=process.env,credential,context,origin,storeFactory=defaultStore,now=()=>new Date()}){
 check(env.EVZ_MAILBOX_WORK_GATEWAY==='scoped-reply-worker-v1','Worker gateway is disabled');
 const digest=env.EVZ_MAILBOX_WORK_CREDENTIAL_SHA256;
 check(/^[a-f0-9]{64}$/.test(credential??'')&&/^[a-f0-9]{64}$/.test(digest??'')&&timingSafeEqual(Buffer.from(hash(credential),'hex'),Buffer.from(digest,'hex')),'Worker credential unavailable');
 const binding=JSON.parse(env.EVZ_MAILBOX_WORK_SOURCE_BINDING??'null');validateManualBinding(binding?.scope);
 check(binding.scope.capability==='shared-mailbox-work-v1'&&context?.site?.id!==binding.scope.site_id,'Separate worker gateway and source authority required');
 check(typeof env.EVZ_MAILBOX_WORK_SOURCE_BLOBS_TOKEN==='string'&&env.EVZ_MAILBOX_WORK_SOURCE_BLOBS_TOKEN.length>=20,'Authorized source storage credential required');
 const raw=await storeFactory(binding.scope,env.EVZ_MAILBOX_WORK_SOURCE_BLOBS_TOKEN),store=new ConditionalLifecycleStore(raw,{manualBinding:binding,now}),app=await StudioLifecycle.fromStore({store,now});
 const worker=createMailboxWorker(app,{credential,leaseSecret:env.EVZ_MAILBOX_WORK_LEASE_SECRET,context,origin});await worker.authenticate();return worker;
}
