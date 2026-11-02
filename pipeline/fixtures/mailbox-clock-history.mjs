import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {cloudDiscoveryFixture} from '../cloud-discovery-fixtures.mjs';
import {fixtureProspect} from '../lifecycle-fixtures.mjs';
import {hash} from '../lifecycle.mjs';
import {applyMailboxClockTransition} from '../mailbox-clock.mjs';
import {createMailboxClock} from '../mailbox-clock-host.mjs';
import {createHostedDesk} from '../hosted-desk.mjs';
import {writeLifecycleBackup,restoreLifecycleBackup} from '../lifecycle-backup.mjs';
import {gmailScopes} from '../google-hosted-transport.mjs';
import {mailboxProfile} from '../mailbox-intake.mjs';

// Actual typed state/handlers; all accounts, keys, storage and provider responses are fictional.
export async function clockHistoryFixture(t,{lane='legacy'}={}){
 const f=await cloudDiscoveryFixture(t,{async seed({state,sourceConfig,mailbox,mailboxClock,local,at}){
  await local.apply(fixtureProspect('retained',at));state.prospects=structuredClone((await local.snapshot()).prospects);for(const r of Object.values(state.prospects))delete r.controlled;
  state.mailbox_sync={policy_sha256:hash(mailbox),after:mailbox.after,phase:'history',cursor:'100',next_cursor:null,page:null,pages:[],pending:[],held_sources:{},checked_at:at,last_read_at:at,hold:null};sourceConfig.sender.postal_address='';
  Object.assign(mailboxClock,{schema_version:2,recovery_generation:'clock-two',max_steps_per_day:2});if(lane==='current')return;
  const old=lane==='restored'?structuredClone(mailboxClock):{...mailboxClock,schema_version:1,deploy_id:'earlier-clock-deploy',recovery_generation:'clock-one',max_steps_per_day:10},config={...sourceConfig,shared_capability:'shared-operations-desk-v1',outreach_enabled:false,mailbox,mailbox_clock:old};
  const tr=(type,input,actor='clock')=>applyMailboxClockTransition(state,config,{type,actor,at,input});
  tr('allowance',{revision:state.revision,allowance:{id:'historical-proof',evidence_ref:'Fictional manually reviewed included capacity',observed_at:at,expires_at:new Date(Date.parse(at)+3600000).toISOString(),included_only:true,max_steps:2}},'owner');tr('pause',{revision:state.revision,paused:false,reason:'Fictional original reviewed check'},'friend');tr('claim',{revision:state.revision,tick_id:'mailbox-clock-'+Date.parse(at),scheduled_at:at});tr('step',{tick_id:state.mailbox_clock.tick.id,fence:1,step:1});
  if(lane==='restored'){const backup=join(local.directory,'clock-backup.json'),destination=join(local.directory,'clock-restored');await writeLifecycleBackup(local.directory,state,backup,at);await restoreLifecycleBackup(backup,destination);Object.assign(state,JSON.parse(await readFile(join(destination,'lifecycle-state.json'),'utf8')));}
  else tr('pause',{revision:state.revision,paused:true,reason:'Original unresolved read remains charged'},'owner');
 }});f.advance(300000);const b=f.packet.binding.scope;
 const env={CONTEXT:'production',SITE_ID:b.site_id,DEPLOY_ID:b.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:b.capability,EVZ_OPERATIONS_MANUAL_BINDING:JSON.stringify(f.packet.binding),EVZ_OPERATIONS_ORIGIN:b.origin,EVZ_OPERATIONS_BLOB_NAMESPACE:b.namespace,EVZ_MAILBOX_CLOCK_RUNTIME:b.capability,EVZ_MAILBOX_CLOCK_INTERVAL_MINUTES:'5',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)},context={site:{id:b.site_id},deploy:{id:b.deploy_id,context:'production',published:true}},calls=[];
 const token={profile:mailboxProfile,account:f.app.config.mailbox.account,grant_id:f.app.config.mailbox.grant_id,access_token:'fictional-clock-token',expires_at:Date.parse('2026-11-05T00:00:00.000Z'),scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes]},getAccessToken=Object.assign(async()=>token,{assertCurrent:async()=>{},assertGrant:async()=>{}}),fetcher=async(url,options)=>{assert.equal(options.method,'GET');assert.equal(new URL(url).origin,'https://gmail.googleapis.com');assert(new URL(url).pathname.endsWith('/history'));calls.push(url);return Response.json({historyId:'101',history:[]});};
 const handler=createHostedDesk({env,storeFactory:()=>f.raw,now:f.now,googleIncomingOptions:{getAccessToken,fetcher}}),clock=createMailboxClock({env,storeFactory:()=>f.raw,now:f.now,googleIncomingOptions:{getAccessToken,fetcher}}),request=(route,options)=>new Request(b.origin+'/desk'+route,options),cookie=r=>r.headers.get('set-cookie').split(';')[0];
 async function signed(role){const boot=await handler(request('/api/bootstrap'),context),csrf=(await boot.json()).csrf,first=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:first,origin:b.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}),context);assert.equal(login.status,200);return async(route,input,extra={})=>handler(request(route,{method:'POST',headers:{cookie:first+'; '+cookie(login),origin:b.origin,'content-type':'application/json','x-studio-token':csrf,...extra},body:JSON.stringify(input)}),context);}
 const owner=await signed('owner'),friend=await signed('friend'),okay=async r=>{const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value;},command=(type,input,who=owner)=>who('/api/mailbox-clock/'+type,input).then(okay),revision=async()=>(await f.store.snapshot()).revision;
 const status=()=>handler(request('/api/state'),context),tick=()=>clock(new Request(b.origin+'/.netlify/functions/mailbox-clock',{method:'POST',body:JSON.stringify({next_run:new Date(+f.now()+300000).toISOString()})}),context);
 return {...f,b,env,context,handler,owner,friend,okay,command,revision,status,tick,calls};
}
