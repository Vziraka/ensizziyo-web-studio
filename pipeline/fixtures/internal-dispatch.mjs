import {operationsOriginalsCapability,originalTransitionSchema} from '../shared-operations-originals.mjs';
import {fixture as projectFixture,name} from './shared-project-continuation.mjs';
import {fictionalBlobs,env as previewEnv,origin,runtime,source as authoredSource,review,substitutedPNG} from './hosted-authoring.mjs';
import {originalDigest} from '../shared-project-originals.mjs';
import {hash,StudioLifecycle} from '../lifecycle.mjs';
import {writeLifecycleBackup,writePortableLifecycleBackup,hostedBackupInventory} from '../lifecycle-backup.mjs';
import {attachHostedAuthoring} from '../hosted-authoring.mjs';import {blobAudioStore} from '../call-audio.mjs';
import {join} from 'node:path';
import {ConditionalLifecycleStore} from '../lifecycle-store.mjs';
import {dispatchCapability,manualDispatchCapability,operationsRecordsCapability,dispatchHumanSchema,dispatchAuthoringSchema,dispatchManualSchema,dispatchVersions,prepareDispatchWorkspace,installDispatchWorkspace} from '../shared-internal-dispatch.mjs';
import {createHostedDesk} from '../hosted-desk.mjs';
import {createInternalDispatchClock,dispatchWorkerPath,dispatchReference,signDispatchReference} from '../internal-dispatch-host.mjs';
import {createInternalDispatchBackground} from '../netlify-functions/internal-dispatch.mjs';
import {sharedDeskSession} from '../shared-originals-client.mjs';
import {notificationTemplates} from '../team-notifications.mjs';
import {gmailScopes} from '../google-hosted-transport.mjs';
import {authoringManifest} from '../hosted-authoring.mjs';
import {operationsRefinementCapability,refinementCapability,refinementRequest,refinementSchema,generationTransitionSchema} from '../refinement-generation.mjs';
import {projectWorkContext} from '../project-work.mjs';
export const at='2026-10-26T13:07:00.000Z',account='ensizziyo@evzdigital.studio';
export async function fixture(t,{authorize=true,limits={},sourceChange,completeDependencies=false,manual=false,records=false,authoring=false,projectVersions=false,refinement=false,originals=false,originalBytes,actor='owner',keep=false,standingExpiresAt='2026-10-30T00:00:00Z',retainedGatewayProof}={}){
 refinement=refinement||originals;authoring=authoring||refinement;completeDependencies=completeDependencies||refinement;records=records||authoring;const capability=originals?operationsOriginalsCapability:refinement?operationsRefinementCapability:authoring?'shared-operations-authoring-v1':records?operationsRecordsCapability:manual?manualDispatchCapability:dispatchCapability;manual=manual||records;
 let google_drive_originals; if(originals){const ids={project_id:'shared-proof',asset_id:'drive-pdf',version_id:'v1'},reference='drive:fictionalOriginal123';originalBytes??=Buffer.from('%PDF-1.7\nFictional unit-only PDF\n%%EOF');google_drive_originals={account,grant_id:'fictional-drive-grant',sources:[{...ids,reference,name:'Fictional retained original.pdf',mime_type:'application/pdf',modified_time:at,drive_version:'42',bytes:originalBytes.length,sha256:originalDigest(originalBytes),etag:'"fictional-file-etag"'}]};}
 const base=await projectFixture(keep?null:t,{actor,audio:manual&&(completeDependencies||authoring),templateVersions:refinement,retainedGatewayProof,registeredDriveSource:google_drive_originals?.sources[0]});let source=base.sourceApp;
 if(manual&&completeDependencies){
  const client=await base.connect(),job=await client.begin(name,'website-concepts'),bytes=Buffer.from(JSON.stringify(authoredSource(job.context))),manifest=authoringManifest(bytes),session=await base.session(actor),path=`/api/project-author/${job.id}/file/input.json`;
  await session.json(path+'/reserve',{method:'POST',body:{manifest}});await session.json(path+'/chunk/0',{method:'POST',binary:true,headers:{'x-studio-transfer':hash(manifest)},body:bytes});
  const observed=await client.recovery(job.id);await client.reconcile(job.id,{snapshot:observed.snapshot,reason:'Fictional retained partial source; no process exit attestation.',disposition:'close-publication'});await client.revise(job.id,'Fictional corrected source after retained interruption.');
 }
 if(completeDependencies){const client=await base.connect(),job=await client.begin(name,'website-concepts');await client.render(job.id,authoredSource(job.context),await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json')),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Test-only substituted PNG; existing PDF renderer/source/runtime dependencies are actual',pages:receipt.pages.map(()=>substitutedPNG)});await client.complete(job.id,review(receipt,rasters));source=base.app;attachHostedAuthoring(source,base.storage.raw);}
 if(projectVersions){
  const state=await source.snapshot(),prior=state.prospects['shared-proof'].project_work['website-concepts'].result,client=await base.connect();
  await source.apply({id:'prior-refinement-request',prospect_id:'shared-proof',type:'concept_refinement_requested',at:source.now().toISOString(),data:{asset_id:prior.asset_id,version_id:prior.version_id,selected_direction:'d0',feedback:'Retain this exact first direction.'}},{actor:'owner',expectedRevision:state.revision});
  const job=await client.begin(name,'website-refinement'),original=JSON.parse(await client.download(prior.asset_id,'authored.json')),next={...authoredSource(job.context),kind:'website-refinement',selected_direction:'d0',previous_asset_id:prior.asset_id,previous_version_id:prior.version_id,feedback:job.context.source.request.feedback,preserves_direction:true,pages:[original.pages[0]]};delete next.directions;
  await client.render(job.id,next,await runtime());const receipt=JSON.parse(await client.download(job.id,'export.json')),rasters=await client.rasters(job.id,{pdf_sha256:receipt.pdf.sha256,rasterizer:'Test-only substituted PNG; no semantic claim',pages:receipt.pages.map(()=>substitutedPNG)});await client.complete(job.id,review(receipt,rasters));
 }

 source.now=()=>new Date(at);if(manual&&!completeDependencies)await source.change(s=>{const r=s.prospects['shared-proof'];r.stage='Ready to contact';r.cold_paused=false;});if(sourceChange)await source.change(sourceChange);
 let selected,refinementPolicy,refinementRuntimes,catalog;

 if(refinement){const current=await source.snapshot(),seed=current.prospects['shared-proof'].project_work['website-concepts'].result,session=await base.session(actor);
  for(const [id,type,data]of [['baseline','asset_version_selected',{asset_id:seed.asset_id,version_id:seed.version_id}],['background','asset_feedback_added',{asset_id:seed.asset_id,version_id:seed.version_id,feedback:'Use "#EDF1E8" for page background.',scope:'project',project_id:'shared-proof'}],['refinement','concept_refinement_requested',{asset_id:seed.asset_id,version_id:seed.version_id,selected_direction:'d0',feedback:'Keep composition and wording; apply the supported background rules.'}]])await session.json('/api/event',{method:'POST',body:{event:{id,type,data,prospect_id:type.startsWith('asset_')?'studio-assets':'shared-proof',at:base.state.updated_at},revision:(await source.snapshot()).revision}});
  selected=JSON.parse(await (await base.connect(actor)).download(seed.asset_id,'authored.json'));
 }
 const state=await source.snapshot();
 // Fictional import fixture starts in the contact lane; no bound live workspace is patched.
 if(manual&&completeDependencies){state.prospects['shared-proof'].stage='Ready to contact';state.prospects['shared-proof'].cold_paused=false;}
 const route={project_id:'shared-proof',thread_id:'thread',original_id:'original',from:'hello@evzdigital.studio',to:'shared-proof@example.invalid',subject:'Website question',contact_sha256:hash(state.prospects['shared-proof'].contact)};
 const binding={workspace_id:'fictional-studio',run_id:state.run_id,site_id:'fictional-site',deploy_id:'fictional-deploy',origin,namespace:'evz-project-shared-standing-fictional'},p={schema_version:1,status:'UNAPPROVED',capability,policy_id:'fictional-standing',revision:'review-1',binding,grant_id:'fictional-standing-grant',account_email:account,from:'hello@evzdigital.studio',approval_mode:'standing-internal-only',kinds:['attention','digest'],recipients:{owner:'owner@example.invalid',friend:'friend@example.invalid'},role_mapping:Object.fromEntries(['owner','friend'].map(role=>[role,{role,address:role+'@example.invalid',verified:true,verification_id:'fictional-'+role}])),versions:dispatchVersions,templates:notificationTemplates,signature:'EVZ Digital team · Internal operations notification',starts_at:'2026-10-24T00:00:00Z',expires_at:standingExpiresAt,routes:[route],limits:{ticks_lifetime:10,ticks_day:8,poll_seconds:60,gets_tick:30,sends_tick:3,bytes_tick:4_000_000,milliseconds_tick:60000,sends_day:8,sends_lifetime:20,attention_role_day:3,sender_day:20,...limits},priority:['reconcile','incoming','reply','meeting','problem','digest'],host_allowance:{available_ticks:20,observed_at:at,evidence_reference:'fictional-measured-cycle-allowance-only'},host_reserve_percent:30,pause_rule:'both-roles-pause-owner-new-policy-no-resume'};
 if(authoring)p.authoring=dispatchAuthoringSchema;
 if(records)p.human_events=dispatchHumanSchema;else if(manual)p.manual_events=dispatchManualSchema;
 if(refinement){const model='fictional-refinement-model',packet=projectWorkContext(state,'shared-proof','website-refinement-1'),rt=await runtime(),request=refinementRequest(packet,selected,rt,{model,maximum_output_tokens:4096}).request,job_id='author-'+hash({project:'shared-proof',work:packet.work.id,event:packet.work.request_event,context:packet.context_sha256,attempt:packet.work.authoring_attempt??0}).slice(0,32);
  catalog={providers:{gemini:{models:{[model]:{pricing:{input:1,output:1}}}}}};
  refinementPolicy={version:refinementCapability,status:'UNAPPROVED',model,jobs:[{job_id,project_id:'shared-proof',work_id:packet.work.id,context_sha256:packet.context_sha256,source_sha256:hash(selected),runtime_sha256:hash(rt),request_sha256:hash(request),schema_sha256:hash(refinementSchema)}],catalog_sha256:hash(catalog),maximum_catalog_input_usd_per_million:1,maximum_catalog_output_usd_per_million:1,maximum_input_tokens:8192,maximum_output_tokens:4096,maximum_output_bytes:120000,maximum_request_bytes:300000,maximum_count_attempts:1,maximum_generation_attempts:1,maximum_lifetime_requests:1,maximum_daily_requests:1,maximum_cycle_requests:1,reserved_microcredits_per_job:3_000_000,maximum_microcredits:3_000_000,host_reserve_credits:900,prior_policy_reserve_credits:20,execution_ms:30000,expires_at:'2026-10-26T13:22:00.000Z',cycle:'fictional-only'};refinementRuntimes={[job_id]:rt};p.generation={policy_sha256:hash(refinementPolicy),schema:generationTransitionSchema};
 }
 if(originals)p.originals={grant_profile:'drive-originals-readonly-v1',source_policy_sha256:hash(google_drive_originals),schema:originalTransitionSchema};
 const scope={...binding,schema_version:1,capability,mode:'production',state_schema:1,policy_sha256:hash(p)},backup=join(base.directory,'standing-source.json');if(completeDependencies){const inv=await hostedBackupInventory(source,blobAudioStore(base.storage.raw));await writePortableLifecycleBackup(state,inv.files,backup,at);}else await writeLifecycleBackup(source.directory,state,backup,at);
 const preparation={backup,sourceConfig:await source.loadConfig(),scope,dispatchPolicy:p,...(originals?{google_drive_originals}:{}),...(refinement?{refinementPolicy,refinementRuntimes}:{})},packet=await prepareDispatchWorkspace(preparation),storage=fictionalBlobs(),store=new ConditionalLifecycleStore(storage.raw,{dispatchBinding:packet.binding});await installDispatchWorkspace(store,packet,{commit:true});
 let clock=Date.parse(at);const now=()=>new Date(clock),env={...previewEnv,CONTEXT:'production',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:capability,EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace,EVZ_INTERNAL_DISPATCH_BINDING:JSON.stringify(packet.binding),EVZ_INTERNAL_DISPATCH_RUNTIME:capability,...(authoring?{EVZ_OPERATIONS_PROJECT_AUTHORING:originals?'shared-operations-originals-node-v1':refinement?'shared-operations-refinement-node-v1':'shared-operations-node-v1'}:{}),EVZ_INTERNAL_DISPATCH_SECRET:'h'.repeat(43)},context={site:{id:scope.site_id},deploy:{id:scope.deploy_id,context:'production',published:true}};
 const app=await StudioLifecycle.fromStore({store,now}),refinementOptions={},googleDriveOptions={},googleOAuthOptions={},make=()=>createHostedDesk({env,storeFactory:()=>storage.raw,now,refinementOptions,googleDriveOptions,googleOAuthOptions,internalDispatchOptions:{fetcher:async()=>new Response(null,{status:202})}}),fetcher=(url,options)=>make()(new Request(url,options),context);
 store.originalsEnvironment=env;store.now=now;
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
 const f={base,app,store,storage,packet,preparation,refinementPolicy,refinementOptions,googleDriveOptions,googleOAuthOptions,google_drive_originals,originalBytes,refinementRuntimes,catalog,selected,env,context,wire,session,make,fetcher,now,setNow:value=>clock=Date.parse(value),advance:ms=>clock+=ms,queued,async clock(){return scheduled(new Request(origin+'/.netlify/functions/internal-dispatch-clock',{method:'POST',body:JSON.stringify({next_run:new Date(clock+60000).toISOString()})}),context);},async run(request=queued.at(-1)){return worker(request.clone(),context);},async control(command,input={},role='owner'){const s=await app.snapshot();return (await session(role)).json('/api/internal-dispatch/'+command,{method:'POST',body:{revision:s.revision,event_id:command+'-'+s.revision,...input}});},async manualRun(tick){const ref=dispatchReference(packet.binding,tick);return worker(new Request(origin+dispatchWorkerPath,{method:'POST',headers:{'x-evz-internal-dispatch':signDispatchReference(env,ref)},body:JSON.stringify(ref)}),context);}};
 if(authorize)await f.control('authorize',{authorized:true,policy_sha256:hash(p)});return f;
}
