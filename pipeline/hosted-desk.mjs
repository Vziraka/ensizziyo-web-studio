import {blobProjectOriginalStore,reserveSharedOriginal,uploadSharedOriginalChunk,completeSharedOriginal,sharedOriginalManifest,readSharedOriginalChunk,originalChunkRequest} from './shared-project-originals.mjs';
import {validateInertBinding} from './inert-shared-workspace.mjs';
import {gatewayProofView,configureGatewayProof,runGatewayProof,pauseGatewayProof,reviewGatewayProof} from './gateway-proof.mjs';
import {callTranscriptionView,approveCallTranscription,runCallTranscription,pauseCallTranscription} from './call-transcription.mjs';
import {fullCallView,approveFullCall,runFullCall,pauseFullCall,fullCallWorkerPath} from './full-call-transcription.mjs';
import {assessmentView,approveAssessment,runAssessment,pauseAssessment,assessmentWorkerPath} from './hosted-assessment.mjs';
import {projectSourceBodies,retainedSource} from './retained-sources.mjs';
import {deskSnapshotPage} from './desk-snapshot.mjs';
import {prepareTeamNotifications,notificationView} from './team-notifications.mjs';
import {projectContext,projectWorkContext,resolveProject} from './project-work.mjs';
import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {StudioLifecycle,initialConfig,check} from './lifecycle.mjs';import {ConditionalLifecycleStore} from './lifecycle-store.mjs';import {createOperatorAuth} from './operators.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';import {lifecycleAssets} from './lifecycle-assets.mjs';import {renderFollowUpPreview} from './follow-up-template.mjs';import {callingSession,saveInformationDraft} from './call-desk-actions.mjs';
import {audioRequest,saveCallAudio,readCallAudio,reconcileCallAudio,blobAudioStore} from './call-audio.mjs';

const base='/desk',csrfCookie='evz_desk_csrf',maxBody=120_000;
const headers={'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json=(status,data,extra={})=>{let body=JSON.stringify(data);if(Buffer.byteLength(body)>4_500_000){status=413;body=JSON.stringify({error:'Private response exceeds the bounded read limit; narrow the saved record.'});}return new Response(body,{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});};
const cookieValue=(header,name)=>String(header??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const sign=(secret,payload)=>createHmac('sha256',secret).update('desk-csrf:'+payload).digest();
function csrfValid(token,secret,now){try{const [payload,mac,extra]=token.split('.'),actual=Buffer.from(mac,'base64url'),expected=sign(secret,payload);if(extra!==undefined||actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const [expiry,nonce]=JSON.parse(Buffer.from(payload,'base64url'));return Number.isSafeInteger(expiry)&&expiry>+now&&typeof nonce==='string'&&nonce.length===32;}catch{return false;}}
async function inputBody(request){const reader=request.body?.getReader();check(reader,'A JSON request body is required');let bytes=0;const chunks=[];for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBody){await reader.cancel();throw Error('Request body exceeds the private desk limit');}chunks.push(Buffer.from(value));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Supply valid JSON without credentials in unrelated fields');}}
function configured(env,now){
 check(env.CONTEXT==='deploy-preview'&&['fictional-preview','inert-shared-v1'].includes(env.EVZ_OPERATIONS_DESK_ENABLED),'Private desk is not configured');
 const origin=new URL(env.EVZ_OPERATIONS_ORIGIN);check(origin.protocol==='https:'&&origin.origin===env.EVZ_OPERATIONS_ORIGIN,'Private desk is not configured');
 let inertBinding=null;
 if(env.EVZ_OPERATIONS_DESK_ENABLED==='inert-shared-v1'){
  inertBinding=JSON.parse(env.EVZ_OPERATIONS_INERT_BINDING);validateInertBinding(inertBinding.scope);
  const b=inertBinding.scope;check(b.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE&&b.origin===origin.origin&&b.site_id===env.SITE_ID&&b.deploy_id===env.DEPLOY_ID,'Private desk binding does not match this deployment');
 }else check(/^evz-redesign-proof-[a-z0-9-]{8,44}$/.test(env.EVZ_OPERATIONS_BLOB_NAMESPACE??''),'Private desk is not configured');
 const auth=createOperatorAuth(env,{now:()=>+now()});check(auth,'Private desk is not configured');return {origin:origin.origin,auth,inertBinding};
}
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
async function openApp(raw,now,inertBinding){
 if(inertBinding)return StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{inertBinding}),now});
 const store=new ConditionalLifecycleStore(raw,{maxBytes:2_000_000});
 if(!await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'})){
  const config=structuredClone(initialConfig);config.run_id='shared-fictional-proof';config.preview_seeded_at=now().toISOString();config.follow_up.enabled=true;config.sender.operator_names={owner:'Owner proof',friend:'Friend proof'};
  await store.initialize(config,{schema_version:1,run_id:config.run_id,mode:'controlled',revision:0,updated_at:config.preview_seeded_at,prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]});
 }
 const app=await StudioLifecycle.fromStore({store,now}),snapshot=await app.snapshot();check(typeof app.config.preview_seeded_at==='string','Fictional preview seed is unavailable');
 if(!snapshot.events['import-shared-proof'])await app.apply(fixtureProspect('shared-proof',app.config.preview_seeded_at,'STUDIO TEST Shared project'));
 return app;
}
export function projectDashboard(view){
 view.events=Object.fromEntries(Object.entries(view.events).map(([id,e])=>[id,{id,type:e.type,prospect_id:e.prospect_id,actor:e.actor,at:e.at}]));
 if(view.operations)view.operations={email:Object.fromEntries(Object.entries(view.operations.email??{}).map(([id,e])=>[id,{status:e.status,thread:Boolean(e.thread)}])),cycle:view.operations.cycle?{completed_cycles:view.operations.cycle.completed_cycles,completed_at:view.operations.cycle.completed_at}:null,maintenance:{backup_date:view.operations.maintenance?.backup_date}};
 delete view.ai_attempts;delete view.transcript_assessment;delete view.gateway_proof;delete view.gateway_proof_reviews;delete view.call_transcription_rehearsal;delete view.full_call_transcription;return projectSourceBodies(view);
}

export function createHostedDesk({env=process.env,storeFactory=defaultStore,now=()=>new Date(),assetDirectory=fileURLToPath(new URL('./lifecycle-ui/',import.meta.url)),readAsset=null,gatewayOptions={},backgroundOnly=false}={}){
 return async request=>{
  let settings;try{settings=configured(env,now);}catch{return json(503,{error:'Private desk is not configured'});}
  const url=new URL(request.url),path=url.pathname.slice(base.length)||'/';
  const workerPath=backgroundOnly===true?fullCallWorkerPath:backgroundOnly;
  if(workerPath&&(url.pathname!==workerPath||request.method!=='POST')||!workerPath&&[fullCallWorkerPath,assessmentWorkerPath].includes(url.pathname))return json(409,{error:'Use the protected background entry and read its durable receipt'});
  const publicNavigation=request.method==='GET'&&path==='/'&&request.headers.get('sec-fetch-mode')==='navigate'&&request.headers.get('sec-fetch-dest')==='document';
  if(url.origin!==settings.origin||url.pathname!==base&&!url.pathname.startsWith(base+'/')||request.headers.get('origin')&&request.headers.get('origin')!==settings.origin||!publicNavigation&&request.headers.get('sec-fetch-site')&&!['same-origin','none'].includes(request.headers.get('sec-fetch-site')))return json(403,{error:'Private desk origin is not permitted'});
  try{
   if(request.method==='GET'&&lifecycleAssets.has(path)&&!['/preview/','/preview.js'].includes(path)){
    const [file,type]=lifecycleAssets.get(path);let body=readAsset?await readAsset(file):await readFile(join(assetDirectory,file));
    if(type==='text/html')body=body.toString().replace('<html lang="en">','<html lang="en" data-base="/desk">').replaceAll('href="/','href="/desk/').replaceAll('src="/','src="/desk/').replace('Private on this computer',settings.inertBinding?'Private shared workspace · execution disabled':'Private shared fictional preview');
    if(type==='text/css')body=body.toString().replaceAll('url(/assets/','url(/desk/assets/');
    return new Response(body,{headers:{...headers,'Content-Type':type+(type.startsWith('text/')?'; charset=utf-8':'')}});
   }
   let csrf=cookieValue(request.headers.get('cookie'),csrfCookie);
   if(request.method==='GET'&&path==='/api/bootstrap'){
    if(!csrfValid(csrf,env.EVZ_OPERATIONS_SESSION_SECRET,now())){const payload=Buffer.from(JSON.stringify([+now()+8*3600000,randomBytes(16).toString('hex')])).toString('base64url');csrf=payload+'.'+sign(env.EVZ_OPERATIONS_SESSION_SECRET,payload).toString('base64url');}
    return json(200,{csrf,operator_auth_required:true},{'Set-Cookie':`${csrfCookie}=${csrf}; HttpOnly; Secure; SameSite=Strict; Path=/desk/; Max-Age=28800`});
   }
   const post=request.method==='POST';if(post&&(!csrfValid(csrf,env.EVZ_OPERATIONS_SESSION_SECRET,now())||request.headers.get('x-studio-token')!==csrf||path!=='/api/call-audio'&&!/^\/api\/project-original\/[^/]+\/[^/]+\/[^/]+\/chunk\/[0-9]+$/.test(path)&&request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json(403,{error:'Current same-origin approval token required'});
   if(post&&path==='/api/login'){const input=await inputBody(request),actor=settings.auth.authenticate(input.key);return actor?json(200,{operator:actor},{'Set-Cookie':settings.auth.cookie(settings.auth.issue(actor),{secure:true})}):json(401,{error:'The operator key was not recognized'});}
   const actor=settings.auth.actorFromCookie(request.headers.get('cookie'));if(!actor)return json(401,{error:'Sign in with your individual operator key'});
   if(post&&path==='/api/logout')return json(200,{signed_out:true},{'Set-Cookie':settings.auth.cookie('',{secure:true,clear:true})});
   if(settings.inertBinding){
    const reads=request.method==='GET'&&(path==='/api/state'||path==='/api/project-resolve'||/^\/api\/project-context\//.test(path)||/^\/api\/events\//.test(path)||/^\/retained-source\//.test(path)||/^\/follow-up(?:-draft|-history)?\//.test(path)||/^\/api\/project-original\//.test(path));
    if(!reads&&!(post&&path==='/api/event'))return json(409,{error:'Inert workspace supports saved reads and signed private notes only; execution, authoring, transfer writes and hosted backup are disabled'});
   }
   if(path.startsWith('/api/project-original/')&&!settings.inertBinding&&env.EVZ_OPERATIONS_SHARED_ORIGINALS!=='fictional-chunks-v1')return json(503,{error:'Shared original transfer is not configured'});
   let app,raw;try{raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE);app=await openApp(raw,now,settings.inertBinding);}catch{return json(503,{error:'Private shared storage is unavailable; no execution was started'});}
   const originalRoute=/^\/api\/project-original\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})(?:\/(reserve|complete|chunk)(?:\/([0-9]{1,2}))?)?$/.exec(path);
   if(originalRoute){
    check(settings.inertBinding&&request.method==='GET'||env.EVZ_OPERATIONS_SHARED_ORIGINALS==='fictional-chunks-v1','Shared original transfer is not configured');
    const [,project_id,asset_id,version_id,operation,index]=originalRoute,ids={project_id,asset_id,version_id},store=blobProjectOriginalStore(raw);
    if(request.method==='GET'&&!operation)return json(200,await sharedOriginalManifest(app,store,ids));
    if(request.method==='GET'&&operation==='chunk'&&index!==undefined){const result=await readSharedOriginalChunk(app,store,ids,Number(index));return new Response(result.bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(result.bytes.length),'Content-Disposition':'attachment; filename="original-chunk.bin"','X-Content-SHA256':result.sha256}});}
    if(post&&operation==='reserve'&&index===undefined)return json(200,await reserveSharedOriginal(app,{...await inputBody(request),...ids},actor));
    if(post&&operation==='complete'&&index===undefined)return json(200,await completeSharedOriginal(app,store,{...ids,transfer_id:(await inputBody(request)).transfer_id},actor));
    if(post&&operation==='chunk'&&index!==undefined)return json(200,await uploadSharedOriginalChunk(app,store,{...ids,transfer_id:request.headers.get('x-studio-transfer')},Number(index),await originalChunkRequest(request)));
    return json(405,{error:'Use the bounded original transfer operation'});
   }
   if(request.method==='GET'&&/^\/api\/project-context\/[a-zA-Z0-9_-]{1,100}(?:\/[a-zA-Z0-9_-]{1,100})?$/.test(path)){const [,,,project,workId]=path.split('/'),snapshot=await app.snapshot();return json(200,workId?projectWorkContext(snapshot,project,workId):projectContext(snapshot,project));}
   if(request.method==='GET'&&path==='/api/project-resolve')return json(200,resolveProject(await app.snapshot(),url.searchParams.get('name')));
   if(request.method==='GET'&&/^\/retained-source\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9]{64}$/.test(path)){const [,,project,sha]=path.split('/');return json(200,retainedSource(await app.snapshot(),project,sha,url.searchParams.get('url'),url.searchParams.get('at')));}
   if(request.method==='GET'&&path==='/api/gateway-proof')return json(200,await gatewayProofView(app,env));
   if(request.method==='GET'&&path==='/api/call-transcription')return json(200,await callTranscriptionView(app,env));
   if(request.method==='GET'&&path==='/api/full-call-transcription')return json(200,await fullCallView(app,env));
   if(request.method==='GET'&&path==='/api/transcript-assessment')return json(200,await assessmentView(app,env));
   if(request.method==='GET'&&path==='/api/team-notifications')return json(200,notificationView(await app.snapshot()));
   if(request.method==='GET'&&path==='/api/state'){
    const asOf=url.searchParams.get('as_of')??now().toISOString(),age=+now()-Date.parse(asOf);
    check(Number.isFinite(age)&&age>=0&&age<=300_000,'Desk snapshot expired; refresh to load the current workspace');
    app.now=()=>new Date(asOf);
    return json(200,deskSnapshotPage({...projectDashboard(await app.dashboard()),csrf,current_operator:actor,operator_auth_enabled:true,workers:[],hosted_preview:true},url.searchParams));
   }
   if(request.method==='GET'&&/^\/api\/events\/[a-zA-Z0-9_-]{1,100}$/.test(path)){const id=path.split('/').at(-1),state=await app.snapshot(),event=state.events[id];return json(200,{found:Boolean(event),id,...(event?{actor:event.actor,fingerprint:event.fingerprint,at:event.at}:{}),revision:state.revision});}
   if(request.method==='GET'&&/^\/follow-up(?:-draft|-history)?\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,100}$/.test(path)){
    const [,route,id,key]=path.split('/'),r=(await app.snapshot()).prospects[id];let entry;if(route==='follow-up-draft')entry=r?.follow_up_drafts?.find(d=>d.id===key);else if(route==='follow-up-history'){if(Object.hasOwn(r?.follow_up_history??[],key))entry={...r.follow_up_history[key],status:'Superseded original; retained for history'};}else entry=r?.follow_ups?.[key];check(entry?.content,'Unknown saved follow-up');
    return new Response(renderFollowUpPreview(entry).replaceAll('"/assets/','"/desk/assets/'),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
   }
   if(request.method==='GET'&&/^\/call-audio\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,80}$/.test(path)){const [, ,project,id]=path.split('/'),clip=await readCallAudio(app,blobAudioStore(raw),project,id);return new Response(clip.bytes,{headers:{...headers,'Content-Type':clip.audio.mime,'Content-Disposition':`inline; filename="${clip.filename}"`}});}
   if(post&&path==='/api/call-audio'){const {input,bytes}=await audioRequest(request);return json(200,await saveCallAudio(app,blobAudioStore(raw),input,bytes,actor));}
   if(post&&path==='/api/call-audio-check'){const input=await inputBody(request);return json(200,await reconcileCallAudio(app,blobAudioStore(raw),input.prospect_id,input.id));}
   if(post&&path==='/api/event'){const input=await inputBody(request);check(!['prospect_imported','verification_imported','transcript_assessed','reply_received','email_delivered','meeting_verified','call_audio_reserved','call_audio_stored'].includes(input.event?.type),'Provider/research events require their separate trusted route');return json(200,await app.apply(input.event,{actor,expectedRevision:input.revision}));}
   if(post&&path==='/api/gateway-proof/configure')return json(200,await configureGatewayProof(app,await inputBody(request),actor,{...gatewayOptions,env}));
   if(post&&path==='/api/gateway-proof/run')return json(200,await runGatewayProof(app,await inputBody(request),actor,{...gatewayOptions,env}));
   if(post&&path==='/api/gateway-proof/review')return json(200,await reviewGatewayProof(app,await inputBody(request),actor));
   if(post&&path==='/api/call-transcription/approve')return json(200,await approveCallTranscription(app,await inputBody(request),actor,{...gatewayOptions,env}));
   if(post&&path==='/api/call-transcription/run')return json(200,await runCallTranscription(app,blobAudioStore(raw),await inputBody(request),actor,{...gatewayOptions,env}));
   if(post&&path==='/api/full-call-transcription/approve')return json(200,await approveFullCall(app,await inputBody(request),actor,{...gatewayOptions,env}));
   if(post&&path==='/api/transcript-assessment/approve')return json(200,await approveAssessment(app,await inputBody(request),actor,{...gatewayOptions,env}));
   if(workerPath&&post&&url.pathname===assessmentWorkerPath)return json(200,await runAssessment(app,await inputBody(request),actor,{...gatewayOptions,env}));
   if(backgroundOnly&&post&&url.pathname===fullCallWorkerPath)return json(200,await runFullCall(app,blobAudioStore(raw),await inputBody(request),actor,{...gatewayOptions,env}));
   if(post&&path==='/api/team-notifications/prepare')return json(200,await prepareTeamNotifications(app));
   if(post&&path==='/api/calling-session')return json(200,await callingSession(app,await inputBody(request)));
   if(post&&path==='/api/information-draft')return json(200,await saveInformationDraft(app,await inputBody(request),actor));
   if(post&&path==='/api/pause'){const proof=await pauseGatewayProof(app,actor),recording=await pauseCallTranscription(app,actor),full=await pauseFullCall(app,actor),assessment=await pauseAssessment(app,actor);return json(200,{paused:true,...proof,...recording,...full,...assessment,in_flight_may_complete:proof.in_flight_may_complete||recording.in_flight_may_complete||full.in_flight_may_complete||assessment.in_flight_may_complete||false,reason:'Operational execution stays disabled; further finite Gateway jobs are paused'});}
   return json(409,{error:'This action needs a connected execution or file service; it is disabled in the fictional shared preview'});
  }catch(error){if(['ENOENT','EACCES','ENOTDIR'].includes(error.code))return json(503,{error:'Private desk UI is unavailable; no execution was started'});if(error.code==='STATE_CONFLICT')return json(409,{error:error.message});if(error.code==='STATE_UNCERTAIN'||error.code==='STATE_UNAVAILABLE')return json(503,{error:error.message});return json(400,{error:error.message?.startsWith('Shared')?'Private shared state is unavailable; retain your event ID and retry after readback':error.message?.includes('token')?'Private request rejected':error.message?.slice(0,240)??'Private request failed'});}
 };
}
