import {fixture as projectFixture,name} from './shared-project-continuation.mjs';
import {fictionalBlobs,env as previewEnv,origin,runtime,source as authoredSource,review,substitutedPNG} from './hosted-authoring.mjs';
import {hash,StudioLifecycle} from '../lifecycle.mjs';
import {writeLifecycleBackup,writePortableLifecycleBackup,hostedBackupInventory} from '../lifecycle-backup.mjs';
import {attachHostedAuthoring} from '../hosted-authoring.mjs';import {blobAudioStore} from '../call-audio.mjs';
import {join} from 'node:path';
import {ConditionalLifecycleStore} from '../lifecycle-store.mjs';
import {dispatchCapability,manualDispatchCapability,dispatchManualSchema,dispatchVersions,prepareDispatchWorkspace,installDispatchWorkspace} from '../shared-internal-dispatch.mjs';
import {createHostedDesk} from '../hosted-desk.mjs';
import {createInternalDispatchClock,dispatchWorkerPath,dispatchReference,signDispatchReference} from '../internal-dispatch-host.mjs';
import {createInternalDispatchBackground} from '../netlify-functions/internal-dispatch.mjs';
import {sharedDeskSession} from '../shared-originals-client.mjs';
import {notificationTemplates} from '../team-notifications.mjs';
import {gmailScopes} from '../google-hosted-transport.mjs';
import {authoringManifest} from '../hosted-authoring.mjs';
export const at='2026-10-26T13:07:00.000Z',account='ensizziyo@evzdigital.studio';
export async function fixture(t,{authorize=true,limits={},sourceChange,completeDependencies=false,manual=false}={}){
 const capability=manual?manualDispatchCapability:dispatchCapability;
 const base=await projectFixture(t,{audio:manual&&completeDependencies});let source=base.sourceApp;
 if(manual&&completeDependencies){
  const client=await base.connect(),job=await client.begin(name,'website-concepts'),bytes=Buffer.from(JSON.stringify(authoredSource(job.context))),manifest=authoringManifest(bytes),session=await base.session('owner'),path=`/api/project-author/${job.id}/file/input.json`;
  await session.json(path+'/reserve',{method:'POST',body:{manifest}});await session.json(path+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes});
  const observed=await client.recovery(job.id);await client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Fictional retained partial source; no process exit attestation.',disposition:'close-publication'});await client.revise(job.id,'Fictional corrected source after retained interruption.');
 }
 if(completeDependencies){const client=await base.connect(),job=await client.begin(name,'website-concepts');await client.render(job.id,authoredSource(job.context),await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json')),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Test-only substituted PNG; existing PDF renderer/source/runtime dependencies are actual',pages:receipt.pages.map(()=>substitutedPNG)});await client.complete(job.id,review(receipt,rasters));source=base.app;attachHostedAuthoring(source,base.storage.raw);}

 source.now=()=>new Date(at);if(manual&&!completeDependencies)await source.change(s=>{const r=s.prospects['shared-proof'];r.stage='Ready to contact';r.cold_paused=false;});if(sourceChange)await source.change(sourceChange);
 const state=await source.snapshot();
 // Fictional import fixture starts in the contact lane; no bound live workspace is patched.
 if(manual&&completeDependencies){state.prospects['shared-proof'].stage='Ready to contact';state.prospects['shared-proof'].cold_paused=false;}
 const route={project_id:'shared-proof',thread_id:'thread',original_id:'original',from:'hello@evzdigital.studio',to:'shared-proof@example.invalid',subject:'Website question',contact_sha256:hash(state.prospects['shared-proof'].contact)};
 const binding={workspace_id:'fictional-studio',run_id:state.run_id,site_id:'fictional-site',deploy_id:'fictional-deploy',origin,namespace:'evz-project-shared-standing-fictional'},p={schema_version:1,status:'UNAPPROVED',capability,policy_id:'fictional-standing',revision:'review-1',binding,grant_id:'fictional-standing-grant',account_email:account,from:'hello@evzdigital.studio',approval_mode:'standing-internal-only',kinds:['attention','digest'],recipients:{owner:'owner@example.invalid',friend:'friend@example.invalid'},role_mapping:Object.fromEntries(['owner','friend'].map(role=>[role,{role,address:role+'@example.invalid',verified:true,verification_id:'fictional-'+role}])),versions:dispatchVersions,templates:notificationTemplates,signature:'EVZ Digital team · Internal operations notification',starts_at:'2026-10-24T00:00:00Z',expires_at:'2026-10-30T00:00:00Z',routes:[route],limits:{ticks_lifetime:10,ticks_day:8,poll_seconds:60,gets_tick:30,sends_tick:3,bytes_tick:4_000_000,milliseconds_tick:60000,sends_day:8,sends_lifetime:20,attention_role_day:3,sender_day:20,...limits},priority:['reconcile','incoming','reply','meeting','problem','digest'],host_allowance:{available_ticks:20,observed_at:at,evidence_reference:'fictional-measured-cycle-allowance-only'},host_reserve_percent:30,pause_rule:'both-roles-pause-owner-new-policy-no-resume'};
 if(manual)p.manual_events=dispatchManualSchema;
 const scope={...binding,schema_version:1,capability,mode:'production',state_schema:1,policy_sha256:hash(p)},backup=join(base.directory,'standing-source.json');if(completeDependencies){const inv=await hostedBackupInventory(source,blobAudioStore(base.storage.raw));await writePortableLifecycleBackup(state,inv.files,backup,at);}else await writeLifecycleBackup(source.directory,state,backup,at);
 const packet=await prepareDispatchWorkspace({backup,sourceConfig:await source.loadConfig(),scope,dispatchPolicy:p}),storage=fictionalBlobs(),store=new ConditionalLifecycleStore(storage.raw,{dispatchBinding:packet.binding});await installDispatchWorkspace(store,packet,{commit:true});
 let clock=Date.parse(at);const now=()=>new Date(clock),env={...previewEnv,CONTEXT:'production',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:capability,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_INTERNAL_DISPATCH_BINDING:JSON.stringify(packet.binding),EVZ_INTERNAL_DISPATCH_RUNTIME:capability,EVZ_INTERNAL_DISPATCH_SECRET:'h'.repeat(43)},context={site:{id:scope.site_id},deploy:{id:scope.deploy_id,context:'production',published:true}};
 const app=await StudioLifecycle.fromStore({store,now}),make=()=>createHostedDesk({env,storeFactory:()=>storage.raw,now,internalDispatchOptions:{fetcher:async()=>new Response(null,{status:202})}}),fetcher=(url,options)=>make()(new Request(url,options),context);
 const session=role=>sharedDeskSession({origin,key:env[role==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher});
 const wire={sent:[],calls:[],tokenCalls:0,history:{historyId:'110'},lost:false,hook:null,tokenHook:null};
 const h=(name,value)=>({name,value}),message=(id,time,text,sent=false)=>({id,threadId:'thread',historyId:'103',labelIds:sent?['SENT']:['INBOX'],internalDate:String(Date.parse(time)),payload:{mimeType:'text/plain',headers:[h('From',sent?'hello@evzdigital.studio':route.to),h('To',sent?route.to:'hello@evzdigital.studio'),h('Subject',sent?route.subject:'Re: '+route.subject),h('Message-ID',`<${id}@example.invalid>`),...sent?[]:[h('In-Reply-To','<original@example.invalid>'),h('Authentication-Results','mx.google.com; dmarc=pass header.from=example.invalid')]],body:{size:Buffer.byteLength(text),data:Buffer.from(text).toString('base64url')}}});
 wire.thread={id:'thread',messages:[message('original','2026-10-24T20:59:00Z','Original',true),message('reply','2026-10-24T21:00:00Z','Prior reply'),message('new-incoming','2026-10-26T13:06:00Z','Could you share examples?')]};
 wire.getAccessToken=async()=>{wire.tokenCalls++;await wire.tokenHook?.();return {access_token:'fictional-standing-token',expires_at:Date.now()+3600000,account,grant_id:p.grant_id,scopes:gmailScopes};};
 wire.fetcher=async(url,o)=>{
  const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);wire.calls.push({path,method:o.method});await wire.hook?.(path,o);
  if(path==='profile')return Response.json({emailAddress:account,historyId:'100'});
  if(path==='settings/sendAs')return Response.json({sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]});
  if(path==='threads/thread')return Response.json(wire.thread);
  if(path==='history')return Response.json(wire.history);
  if(path==='messages/send'){
   const payload=JSON.parse(o.body),s=await app.snapshot(),q=Object.values(s.operations.requests).find(q=>q.raw_base64url===payload.raw);if(q?.status!=='Uncertain')throw Error('No durable exact send claim');
   const msg={id:'sent-'+wire.sent.length,threadId:'internal-'+wire.sent.length,labelIds:['SENT'],raw:payload.raw};wire.sent.push(msg);if(wire.lost)throw Error('Lost committed response');return Response.json(msg);
  }
  if(path==='messages')return Response.json({messages:wire.sent.filter(m=>Buffer.from(m.raw,'base64url').toString().includes(u.searchParams.get('q').replace('in:sent rfc822msgid:',''))).map(m=>({id:m.id}))});
  if(path.startsWith('messages/'))return Response.json(wire.sent.find(m=>m.id===path.slice(9)));
  throw Error('Unexpected Google route '+path);
 };
 const worker=createInternalDispatchBackground({env,storeFactory:()=>storage.raw,now,getAccessToken:wire.getAccessToken,fetcher:wire.fetcher}),queued=[];
 const scheduled=createInternalDispatchClock({env,storeFactory:()=>storage.raw,now,fetcher:async(url,o)=>{queued.push(new Request(url,o));if(wire.lostAck)throw Error('Lost 202');return new Response(null,{status:202});}});
 const f={base,app,store,storage,packet,env,context,wire,session,make,fetcher,now,setNow:value=>clock=Date.parse(value),advance:ms=>clock+=ms,queued,async clock(){return scheduled(new Request(origin+'/.netlify/functions/internal-dispatch-clock',{method:'POST',body:JSON.stringify({next_run:new Date(clock+60000).toISOString()})}),context);},async run(request=queued.at(-1)){return worker(request.clone(),context);},async control(command,input={},role='owner'){const s=await app.snapshot();return (await session(role)).json('/api/internal-dispatch/'+command,{method:'POST',body:{revision:s.revision,event_id:command+'-'+s.revision,...input}});},async manualRun(tick){const ref=dispatchReference(packet.binding,tick);return worker(new Request(origin+dispatchWorkerPath,{method:'POST',headers:{'x-evz-internal-dispatch':signDispatchReference(env,ref)},body:JSON.stringify(ref)}),context);}};
 if(authorize)await f.control('authorize',{authorized:true,policy_sha256:hash(p)});return f;
}
