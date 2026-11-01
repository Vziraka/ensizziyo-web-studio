import {timingSafeEqual} from 'node:crypto';
import {check,hash,StudioLifecycle} from './lifecycle.mjs';
import {validateManualBinding} from './shared-manual-records.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {cloudDiscoveryCapability,validateCloudDiscoveryPolicy} from './cloud-discovery.mjs';
import {createCloudDiscoveryWorker} from './cloud-discovery-service.mjs';

const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
async function defaultStore(scope,token){const {getStore}=await import('@netlify/blobs');return getStore({name:scope.namespace,siteID:scope.site_id,token,consistency:'strong'});}
// Authentication identity and independent context come exclusively from reviewed server configuration.
export async function openCloudDiscoveryWorker({env=process.env,credential,context,origin,storeFactory=defaultStore,now=()=>new Date(),deadline}){
 check(deadline===undefined||Number.isFinite(deadline)&&+now()<deadline,'Discovery invocation expired');
 check(env.EVZ_DISCOVERY_GATEWAY==='bounded-public-research-v1','Discovery gateway disabled');
 const p=JSON.parse(env.EVZ_DISCOVERY_GATEWAY_POLICY??'null');
 check(p&&Object.keys(p).sort().join(',')==='deploy_id,origin,policy_sha256,research_context,research_credential_sha256,review_context,review_credential_sha256,site_id','Closed discovery gateway policy required');
 check([p.site_id,p.deploy_id,p.research_context,p.review_context].every(key)&&p.research_context!==p.review_context&&[p.policy_sha256,p.research_credential_sha256,p.review_credential_sha256].every(sha)&&p.research_credential_sha256!==p.review_credential_sha256,'Distinct research and review authorities required');
 check(context?.site?.id===p.site_id&&context?.deploy?.id===p.deploy_id&&origin===p.origin&&new URL(p.origin).protocol==='https:'&&new URL(p.origin).origin===p.origin,'Exact discovery gateway deployment required');
 check(sha(credential),'Discovery credential required');const digest=Buffer.from(hash(credential),'hex');
 const role=timingSafeEqual(digest,Buffer.from(p.research_credential_sha256,'hex'))?'research':timingSafeEqual(digest,Buffer.from(p.review_credential_sha256,'hex'))?'review':null;check(role,'Discovery credential unavailable');
 const binding=JSON.parse(env.EVZ_DISCOVERY_SOURCE_BINDING??'null');validateManualBinding(binding?.scope);
 check(binding.scope.capability===cloudDiscoveryCapability&&binding.scope.site_id!==p.site_id,'Separate discovery gateway and canonical source required');
 check(typeof env.EVZ_DISCOVERY_SOURCE_BLOBS_TOKEN==='string'&&env.EVZ_DISCOVERY_SOURCE_BLOBS_TOKEN.length>=20,'Authorized source storage credential required');
 const raw=await storeFactory(binding.scope,env.EVZ_DISCOVERY_SOURCE_BLOBS_TOKEN),store=new ConditionalLifecycleStore(raw,{manualBinding:binding,now}),app=await StudioLifecycle.fromStore({store,now});
 const policy=validateCloudDiscoveryPolicy(app.config.cloud_discovery);check(hash(policy)===p.policy_sha256,'Discovery source policy changed');
 check(deadline===undefined||+now()<deadline,'Discovery invocation expired');
 return createCloudDiscoveryWorker(app,{actor:policy[role==='research'?'researcher_id':'reviewer_id'],context_id:p[role+'_context'],deadline});
}
