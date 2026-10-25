import {dispatchCapability,manualDispatchCapability,isDispatchCapability,validateDispatchBinding,dispatchCommand,dispatchStatus,dispatchNotificationView} from './shared-internal-dispatch.mjs';
import {enqueueInternalDispatch} from './internal-dispatch-host.mjs';
import {dispatchOAuthProfile,dispatchOAuthPath,dispatchOAuthCallbackHTML,dispatchOAuthCallbackJS} from './google-oauth.mjs';
import {researchCapability,researchWorkerPath,researchCommand,executeResearch,verifyResearchDispatch,researchRuntimeEnabled,researchProjection,researchStatusText} from './known-identity-research.mjs';
import {validateProjectBinding} from './shared-project-continuation.mjs';
import {refinementCapability,refinementWorkerPath,generateRefinement,executeRefinement,verifyRefinementDispatch,refinementStatus,authorizeRefinement,pauseRefinement,continueRefinementRender,refinementRuntimeEnabled,refinementPolicyProjection,refinementStatusText} from './refinement-generation.mjs';
import {blobProjectOriginalStore,reserveSharedOriginal,uploadSharedOriginalChunk,completeSharedOriginal,sharedOriginalManifest,readSharedOriginalChunk,originalChunkRequest,originalDigest} from './shared-project-originals.mjs';
import {validateInertBinding} from './inert-shared-workspace.mjs';
import {validateManualBinding,manualRecordEvents} from './shared-manual-records.mjs';
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
import {exactMailPackage,approveExactMail,dispatchExactMail,reconcileExactMail} from './exact-mail.mjs';
import {teamNotificationBoundary,notificationPolicy,authorizeNotificationPolicy,exactNotificationPackage,approveExactNotification} from './exact-team-notifications.mjs';
import {createGoogleOAuth,googleOAuthPath,googleOAuthCallbackHTML,googleOAuthCallbackJS} from './google-oauth.mjs';
import {readDriveOriginalStep} from './google-drive-originals.mjs';
import {driveOAuthProfile,driveOAuthPath,driveOAuthCallbackHTML,driveOAuthCallbackJS} from './google-oauth.mjs';
import {calendarOAuthProfile,calendarOAuthPath,calendarOAuthCallbackHTML,calendarOAuthCallbackJS} from './google-oauth.mjs';
import {calendarAvailability,queueGoogleMeeting,dispatchGoogleMeeting,reconcileGoogleMeeting} from './google-calendar.mjs';
import {syncIncomingMail,incomingMailView} from './google-incoming-mail.mjs';
import {attachHostedAuthoring,hostedAuthoringTransfer,hostedAuthoringCommand,hostedAuthoringFile,hostedAuthoringBackup} from './hosted-authoring.mjs';
import {hash} from './lifecycle.mjs';

const base='/desk',csrfCookie='evz_desk_csrf',maxBody=120_000;
const headers={'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json=(status,data,extra={})=>{let body=JSON.stringify(data);if(Buffer.byteLength(body)>4_500_000){status=413;body=JSON.stringify({error:'Private response exceeds the bounded read limit; narrow the saved record.'});}return new Response(body,{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});};
const cookieValue=(header,name)=>String(header??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const sign=(secret,payload)=>createHmac('sha256',secret).update('desk-csrf:'+payload).digest();
function csrfValid(token,secret,now){try{const [payload,mac,extra]=token.split('.'),actual=Buffer.from(mac,'base64url'),expected=sign(secret,payload);if(extra!==undefined||actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const [expiry,nonce]=JSON.parse(Buffer.from(payload,'base64url'));return Number.isSafeInteger(expiry)&&expiry>+now&&typeof nonce==='string'&&nonce.length===32;}catch{return false;}}
async function inputBody(request){const reader=request.body?.getReader();check(reader,'A JSON request body is required');let bytes=0;const chunks=[];for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBody){await reader.cancel();throw Error('Request body exceeds the private desk limit');}chunks.push(Buffer.from(value));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Supply valid JSON without credentials in unrelated fields');}}
function configured(env,now){
 check((env.CONTEXT==='production'&&isDispatchCapability(env.EVZ_OPERATIONS_DESK_ENABLED)||env.CONTEXT==='deploy-preview')&&[dispatchCapability,manualDispatchCapability,'fictional-preview','inert-shared-v1','shared-manual-records-v1','shared-project-continuation-v1',refinementCapability,researchCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED),'Private desk is not configured');
 const origin=new URL(env.EVZ_OPERATIONS_ORIGIN);check(origin.protocol==='https:'&&origin.origin===env.EVZ_OPERATIONS_ORIGIN,'Private desk is not configured');
 let inertBinding=null,manualBinding=null,projectBinding=null,dispatchBinding=null;
 if(isDispatchCapability(env.EVZ_OPERATIONS_DESK_ENABLED)){
  check(env.CONTEXT==='production','Standing dispatch has a distinct published deployment profile');
  dispatchBinding=JSON.parse(env.EVZ_INTERNAL_DISPATCH_BINDING);validateDispatchBinding(dispatchBinding.scope);const b=dispatchBinding.scope;check(b.capability===env.EVZ_OPERATIONS_DESK_ENABLED&&b.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE&&b.origin===origin.origin&&b.site_id===env.SITE_ID&&b.deploy_id===env.DEPLOY_ID,'Exact dispatch deployment binding required');
 }else if(env.EVZ_OPERATIONS_DESK_ENABLED==='inert-shared-v1'){
  inertBinding=JSON.parse(env.EVZ_OPERATIONS_INERT_BINDING);validateInertBinding(inertBinding.scope);
  const b=inertBinding.scope;check(b.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE&&b.origin===origin.origin&&b.site_id===env.SITE_ID&&b.deploy_id===env.DEPLOY_ID,'Private desk binding does not match this deployment');
 }else if(env.EVZ_OPERATIONS_DESK_ENABLED==='shared-manual-records-v1'){
  manualBinding=JSON.parse(env.EVZ_OPERATIONS_MANUAL_BINDING);validateManualBinding(manualBinding.scope);
  const b=manualBinding.scope;check(b.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE&&b.origin===origin.origin&&b.site_id===env.SITE_ID&&b.deploy_id===env.DEPLOY_ID,'Manual desk binding does not match this deployment');
 }else if(['shared-project-continuation-v1',refinementCapability,researchCapability].includes(env.EVZ_OPERATIONS_DESK_ENABLED)){
  projectBinding=JSON.parse(env.EVZ_OPERATIONS_PROJECT_BINDING);validateProjectBinding(projectBinding.scope);
  const b=projectBinding.scope;check(b.namespace===env.EVZ_OPERATIONS_BLOB_NAMESPACE&&b.origin===origin.origin&&b.site_id===env.SITE_ID&&b.deploy_id===env.DEPLOY_ID,'Shared project binding does not match this deployment');
  check(b.capability===env.EVZ_OPERATIONS_DESK_ENABLED,'Exact project capability must match deployment');
 }else check(/^evz-redesign-proof-[a-z0-9-]{8,44}$/.test(env.EVZ_OPERATIONS_BLOB_NAMESPACE??''),'Private desk is not configured');
 const auth=createOperatorAuth(env,{now:()=>+now()});check(auth,'Private desk is not configured');return {origin:origin.origin,auth,inertBinding,manualBinding,projectBinding,dispatchBinding};
}
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
async function openApp(raw,now,inertBinding,manualBinding,projectBinding,dispatchBinding){
 if(dispatchBinding)return StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{dispatchBinding}),now});
 if(projectBinding)return StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{projectBinding}),now});
 if(manualBinding)return StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{manualBinding}),now});
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
 for(const r of Object.values(view.prospects))for(const w of Object.values(r.project_work??{})){const a=view.ai_attempts?.['refine-'+w.execution?.id];if(a)w.generation={status:a.status,phase:Object.keys(a.phases).at(-1)??'reserved',reserved_microcredits:a.reserved_microcredits,next:w.execution.status==='Rendered'?'Needs actual raster and human semantic/design review':'Read the exact retained attempt; no automatic retry or repair'};}
 view.events=Object.fromEntries(Object.entries(view.events).map(([id,e])=>[id,{id,type:e.type,prospect_id:e.prospect_id,actor:e.actor,at:e.at}]));
 if(view.operations)view.operations={email:Object.fromEntries(Object.entries(view.operations.email??{}).map(([id,e])=>[id,{status:e.status,thread:Boolean(e.thread)}])),cycle:view.operations.cycle?{completed_cycles:view.operations.cycle.completed_cycles,completed_at:view.operations.cycle.completed_at}:null,maintenance:{backup_date:view.operations.maintenance?.backup_date}};
 delete view.ai_attempts;delete view.transcript_assessment;delete view.gateway_proof;delete view.gateway_proof_reviews;delete view.call_transcription_rehearsal;delete view.full_call_transcription;return projectSourceBodies(view);
}

export function createHostedDesk({env=process.env,storeFactory=defaultStore,now=()=>new Date(),assetDirectory=fileURLToPath(new URL('./lifecycle-ui/',import.meta.url)),readAsset=null,gatewayOptions={},refinementOptions={},googleMailOptions={},googleIncomingOptions={},googleOAuthOptions={},googleDriveOptions={},googleCalendarOptions={},researchOptions={},internalDispatchOptions={},backgroundOnly=false}={}){
 return async(request,context)=>{
  let settings;try{settings=configured(env,now);}catch{return json(503,{error:'Private desk is not configured'});}
  const url=new URL(request.url),path=url.pathname.slice(base.length)||'/';
  const workerPath=backgroundOnly===true?fullCallWorkerPath:backgroundOnly;
  if(workerPath&&(url.pathname!==workerPath||request.method!=='POST')||!workerPath&&[fullCallWorkerPath,assessmentWorkerPath,refinementWorkerPath,researchWorkerPath].includes(url.pathname))return json(409,{error:'Use the protected background entry and read its durable receipt'});
  if(workerPath===researchWorkerPath){
   try{check(settings.projectBinding?.scope.capability===researchCapability&&url.origin===settings.origin,'Exact research deployment required');const token=request.headers.get('x-evz-known-research-capability');verifyResearchDispatch(env,settings.projectBinding,token,now());const reference=await inputBody(request),raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE),app=await openApp(raw,now,null,null,settings.projectBinding);await executeResearch(app,reference,token,{...researchOptions,env});return json(200,{status:'Read exact saved research candidate'});}catch{return json(409,{error:'Exact research capability unavailable; inspect retained attempt'});}
  }
  if(workerPath===refinementWorkerPath){
   try{check(settings.projectBinding?.scope.capability===refinementCapability&&url.origin===settings.origin,'Exact refinement deployment required');const token=request.headers.get('x-evz-refinement-capability');verifyRefinementDispatch(env,settings.projectBinding,token,now());const reference=await inputBody(request),raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE),app=await openApp(raw,now,null,null,settings.projectBinding);attachHostedAuthoring(app,raw);return json(200,await executeRefinement(app,reference,token,{...refinementOptions,env}));}catch{return json(409,{error:'Exact host refinement capability unavailable; inspect retained attempt'});}
  }
  const calendarOAuth=url.pathname.startsWith(calendarOAuthPath+'/')||path==='/google-calendar-oauth-callback.js';
  const internalOAuth=url.pathname.startsWith(dispatchOAuthPath+'/')||path==='/internal-google-oauth-callback.js';
  const selectedProfile=internalOAuth?{profile:dispatchOAuthProfile}:calendarOAuth?{profile:calendarOAuthProfile}:{};
  const driveOAuth=url.pathname.startsWith(driveOAuthPath+'/')||path==='/google-drive-oauth-callback.js',oauthPath=internalOAuth?dispatchOAuthPath:driveOAuth?driveOAuthPath:calendarOAuth?calendarOAuthPath:googleOAuthPath;
  const oauthLanding=request.method==='GET'&&url.pathname===oauthPath+'/callback';
  const publicNavigation=request.method==='GET'&&(path==='/'||oauthLanding)&&request.headers.get('sec-fetch-mode')==='navigate'&&request.headers.get('sec-fetch-dest')==='document';
  if(url.origin!==settings.origin||url.pathname!==base&&!url.pathname.startsWith(base+'/')||request.headers.get('origin')&&request.headers.get('origin')!==settings.origin||!publicNavigation&&request.headers.get('sec-fetch-site')&&!['same-origin','none'].includes(request.headers.get('sec-fetch-site')))return json(403,{error:'Private desk origin is not permitted'});
  if(settings.dispatchBinding&&!internalOAuth&&(oauthLanding||/google(?:-drive|-calendar)?-oauth/.test(path)))return json(409,{error:'Standing workspace permits only its exact internal Google profile'});
  if((settings.inertBinding||settings.manualBinding||settings.projectBinding)&&(oauthLanding||/google(?:-drive|-calendar)?-oauth/.test(path)))return json(409,{error:'Shared records cannot authorize provider connections'});
  try{
   if(oauthLanding||request.method==='GET'&&['/google-oauth-callback.js','/google-drive-oauth-callback.js','/google-calendar-oauth-callback.js','/internal-google-oauth-callback.js'].includes(path)){
    createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),...(driveOAuth?{profile:driveOAuthProfile}:selectedProfile)});
    check(url.href.length<=8192,'Google callback exceeds bounds');
    return new Response(oauthLanding?(internalOAuth?dispatchOAuthCallbackHTML:driveOAuth?driveOAuthCallbackHTML:calendarOAuth?calendarOAuthCallbackHTML:googleOAuthCallbackHTML):(internalOAuth?dispatchOAuthCallbackJS:driveOAuth?driveOAuthCallbackJS:calendarOAuth?calendarOAuthCallbackJS:googleOAuthCallbackJS),{headers:{...headers,'Content-Type':oauthLanding?'text/html; charset=utf-8':'text/javascript; charset=utf-8'}});
   }
   if(request.method==='GET'&&lifecycleAssets.has(path)&&!['/preview/','/preview.js'].includes(path)){
    const [file,type]=lifecycleAssets.get(path);let body=readAsset?await readAsset(file):await readFile(join(assetDirectory,file));
    if(type==='text/html')body=body.toString().replace('<html lang="en">','<html lang="en" data-base="/desk">').replaceAll('href="/','href="/desk/').replaceAll('src="/','src="/desk/').replace('Private on this computer',settings.projectBinding?.scope.capability===researchCapability?'Private shared workspace - bounded known-identity research requires an exact grant':settings.projectBinding?.scope.capability===refinementCapability?'Private shared workspace · bounded refinement requires an exact grant and enabled runtime':(settings.inertBinding||settings.manualBinding||settings.projectBinding)?'Private shared workspace · execution disabled':'Private shared fictional preview');
    if(type==='text/css')body=body.toString().replaceAll('url(/assets/','url(/desk/assets/');
    return new Response(body,{headers:{...headers,'Content-Type':type+(type.startsWith('text/')?'; charset=utf-8':'')}});
   }
   let csrf=cookieValue(request.headers.get('cookie'),csrfCookie);
   if(request.method==='GET'&&path==='/api/bootstrap'){
    if(!csrfValid(csrf,env.EVZ_OPERATIONS_SESSION_SECRET,now())){const payload=Buffer.from(JSON.stringify([+now()+8*3600000,randomBytes(16).toString('hex')])).toString('base64url');csrf=payload+'.'+sign(env.EVZ_OPERATIONS_SESSION_SECRET,payload).toString('base64url');}
    return json(200,{csrf,operator_auth_required:true},{'Set-Cookie':`${csrfCookie}=${csrf}; HttpOnly; Secure; SameSite=Strict; Path=/desk/; Max-Age=28800`});
   }
   const post=request.method==='POST';if(post&&(!csrfValid(csrf,env.EVZ_OPERATIONS_SESSION_SECRET,now())||request.headers.get('x-studio-token')!==csrf||path!=='/api/call-audio'&&!/^\/api\/project-original\/[^/]+\/[^/]+\/[^/]+\/chunk\/[0-9]+$/.test(path)&&!/^\/api\/project-author\/author-[a-f0-9]{32}\/file\/[^/]+\/chunk\/[0-9]+$/.test(path)&&request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json(403,{error:'Current same-origin approval token required'});
   if(post&&path==='/api/login'){const input=await inputBody(request),actor=settings.auth.authenticate(input.key);return actor?json(200,{operator:actor},{'Set-Cookie':settings.auth.cookie(settings.auth.issue(actor),{secure:true})}):json(401,{error:'The operator key was not recognized'});}
   const actor=settings.auth.actorFromCookie(request.headers.get('cookie'));if(!actor)return json(401,{error:'Sign in with your individual operator key'});
   if(post&&path==='/api/logout')return json(200,{signed_out:true},{'Set-Cookie':settings.auth.cookie('',{secure:true,clear:true})});
   if(path.startsWith('/api/internal-google-oauth/')||path.startsWith('/api/google-oauth/')||path.startsWith('/api/google-drive-oauth/')||path.startsWith('/api/google-calendar-oauth/')){
    const connectionPath=internalOAuth?'/api/internal-google-oauth':driveOAuth?'/api/google-drive-oauth':calendarOAuth?'/api/google-calendar-oauth':'/api/google-oauth',connectionEnabled=internalOAuth?env.EVZ_INTERNAL_GOOGLE_OAUTH==='owner-internal-gmail-code-v1':driveOAuth?env.EVZ_OPERATIONS_GOOGLE_DRIVE_OAUTH==='owner-drive-code-v1':calendarOAuth?env.EVZ_OPERATIONS_GOOGLE_CALENDAR_OAUTH==='owner-calendar-code-v1':env.EVZ_OPERATIONS_GOOGLE_OAUTH==='owner-code-v1';
    if(request.method==='GET'&&path===connectionPath+'/status'&&!connectionEnabled)return json(200,{enabled:false,status:'Disabled',scopes:[]});
    const oauth=createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),...(driveOAuth?{profile:driveOAuthProfile}:selectedProfile)}),session=cookieValue(request.headers.get('cookie'),'evz_operator_session');
    if(request.method==='GET'&&path===connectionPath+'/status')return json(200,await oauth.status());
    check(actor==='owner','Only the signed owner can manage Google authorization');
    if(post&&path===connectionPath+'/start'){await inputBody(request);return json(200,await oauth.start(actor,session));}
    if(post&&path===connectionPath+'/callback')return json(200,await oauth.callback(actor,session,await inputBody(request)));
    if(post&&path===connectionPath+'/disconnect'){await inputBody(request);return json(200,await oauth.disconnect(actor));}
    return json(405,{error:'Use the supported Google connection operation'});
   }
   if(settings.dispatchBinding){
    const manual=settings.dispatchBinding.scope.capability===manualDispatchCapability;
    const savedRead=request.method==='GET'&&(path==='/api/project-resolve'||/^\/api\/project-context\//.test(path)||/^\/api\/events\//.test(path)||/^\/retained-source\//.test(path)||/^\/follow-up(?:-draft|-history)?\//.test(path)||/^\/api\/project-original\//.test(path));
    if(!((request.method==='GET'&&(path==='/api/state'||path==='/api/team-notifications'||/^\/api\/project-author\/backup(?:\/(?:state-chunk|chunk))?$/.test(path)))||/^\/api\/internal-dispatch\/(?:policy|status|authorize|pause|reconcile)$/.test(path)||manual&&(savedRead||post&&path==='/api/event')))return json(409,{error:'Exact standing internal dispatch only; all other execution and edits remain disabled'});
   }
   if(settings.projectBinding?.scope.capability===researchCapability){
    if(!(request.method==='GET'&&(path==='/api/state'||/^\/api\/project-author\/backup(?:\/(?:state-chunk|chunk))?$/.test(path)))&&!path.startsWith('/api/known-research/'))return json(409,{error:'Exact known-identity candidate research only; trusted import, authoring, contact and sending remain held'});
   }
   if(settings.projectBinding&&settings.projectBinding.scope.capability!==researchCapability){
    const reads=request.method==='GET'&&(path==='/api/state'||path==='/api/project-resolve'||/^\/api\/project-context\//.test(path)||/^\/api\/events\//.test(path)||/^\/retained-source\//.test(path)||/^\/follow-up(?:-draft|-history)?\//.test(path)||/^\/api\/project-original\//.test(path));
    if(!reads&&!(post&&path==='/api/event')&&!path.startsWith('/api/project-author/'))return json(409,{error:settings.projectBinding.scope.capability===refinementCapability?'Shared refinement permits exact bounded source generation and saved project authoring only; contact and sending remain disabled':'Shared project supports saved context, signed design feedback and interactive authoring only; provider execution is disabled'});
   }
   if(settings.inertBinding||settings.manualBinding){
    const reads=request.method==='GET'&&(path==='/api/state'||path==='/api/project-resolve'||/^\/api\/project-context\//.test(path)||/^\/api\/events\//.test(path)||/^\/retained-source\//.test(path)||/^\/follow-up(?:-draft|-history)?\//.test(path)||/^\/api\/project-original\//.test(path));
    if(!reads&&!(post&&path==='/api/event'))return json(409,{error:settings.manualBinding?'Manual workspace supports saved reads and signed manual records only; execution, audio, authoring, transfer writes and hosted backup are disabled':'Inert workspace supports saved reads and signed private notes only; execution, authoring, transfer writes and hosted backup are disabled'});
   }
   if(path.startsWith('/api/project-original/')&&!settings.inertBinding&&!settings.manualBinding&&!settings.projectBinding&&!settings.dispatchBinding&&env.EVZ_OPERATIONS_SHARED_ORIGINALS!=='fictional-chunks-v1')return json(503,{error:'Shared original transfer is not configured'});
   if(path.startsWith('/api/project-author/')&&!settings.dispatchBinding&&settings.projectBinding?.scope.capability!==researchCapability&&!(settings.projectBinding?env.EVZ_OPERATIONS_PROJECT_AUTHORING==='shared-project-node-v1':env.EVZ_OPERATIONS_PROJECT_AUTHORING==='fictional-node-v1'))return json(503,{error:'Hosted authoring is disabled'});
   let app,raw;try{raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE);app=await openApp(raw,now,settings.inertBinding,settings.manualBinding,settings.projectBinding,settings.dispatchBinding);}catch{return json(503,{error:'Private shared storage is unavailable; no execution was started'});}
   if(path.startsWith('/api/known-research/')){
    check(settings.projectBinding?.scope.capability===researchCapability,'Exact research capability required');
    if(post&&/^\/api\/known-research\/(register|status|run|authorize|pause|review|reconcile)$/.test(path))return json(200,await researchCommand(app,path.split('/').at(-1),await inputBody(request),actor,{...researchOptions,env}));
    return json(405,{error:'Use signed exact research candidate commands'});
   }
   if(path.startsWith('/api/project-author/')){
    check((Boolean(settings.dispatchBinding)||settings.projectBinding?.scope.capability===researchCapability|| (settings.projectBinding?env.EVZ_OPERATIONS_PROJECT_AUTHORING==='shared-project-node-v1':env.EVZ_OPERATIONS_PROJECT_AUTHORING==='fictional-node-v1'))&&!settings.inertBinding&&!settings.manualBinding,'Hosted authoring is disabled');attachHostedAuthoring(app,raw);
    if(post&&['generate','generation-status','generation-authorize','generation-pause','generation-render'].some(p=>path==='/api/project-author/'+p)){
     const input=await inputBody(request),operation=path.split('/').at(-1),options={...refinementOptions,env};
     return json(200,await (operation==='generate'?generateRefinement(app,input,actor,options):operation==='generation-status'?refinementStatus(app,input,actor):operation==='generation-authorize'?authorizeRefinement(app,input,actor,options):operation==='generation-pause'?pauseRefinement(app,input,actor):continueRefinementRender(app,input,actor)));
    }
    const file=/^\/api\/project-author\/(author-[a-f0-9]{32})\/file\/([^/]+)(?:\/(reserve|complete|chunk)(?:\/([0-9]{1,2}))?)?$/.exec(path);
    const binary=result=>new Response(result.bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(result.bytes.length),'X-Content-SHA256':result.sha256,'Content-Disposition':'attachment; filename="authoring-chunk.bin"'}});
    if(file){const [,id,name,operation,index]=file;
     if(request.method==='GET')return operation==='chunk'&&index!==undefined?binary(await hostedAuthoringFile(app,id,name,Number(index))):!operation?json(200,await hostedAuthoringFile(app,id,name)):json(405,{error:'Use exact file/chunk retrieval'});
     if(post)return json(200,await hostedAuthoringTransfer(app,id,name,operation,operation==='chunk'?{transfer_id:request.headers.get('x-studio-transfer')}:await inputBody(request),actor,index===undefined?undefined:Number(index),operation==='chunk'?await originalChunkRequest(request):undefined));
    }
    if(request.method==='GET'&&path==='/api/project-author/backup')return json(200,(await hostedAuthoringBackup(app,raw)).wire);
    if(request.method==='GET'&&path==='/api/project-author/backup/state-chunk'){
     const {wire,body}=await hostedAuthoringBackup(app,raw);check(wire.body_manifest&&url.searchParams.get('snapshot')===hash(wire),'Backup changed; restart its exact state read');const index=Number(url.searchParams.get('chunk'));check(Number.isInteger(index)&&index>=0&&index*1_000_000<body.length,'Choose an exact state backup chunk');const bytes=body.subarray(index*1_000_000,(index+1)*1_000_000);return binary({bytes,sha256:originalDigest(bytes)});
    }
    if(request.method==='GET'&&path==='/api/project-author/backup/chunk'){
     const {wire:bundle,files}=await hostedAuthoringBackup(app,raw);check(url.searchParams.get('snapshot')===hash(bundle),'Backup changed; retain the prior package and restart its exact read');
     const item=Number(url.searchParams.get('file')),index=Number(url.searchParams.get('chunk'));check(Number.isInteger(item)&&item>=0&&item<bundle.files.length&&Number.isInteger(index)&&index>=0,'Choose an exact backup chunk');const entry=bundle.files[item],bytes=files.get(entry.path);check(index*1_000_000<bytes.length,'Invalid backup chunk');const part=bytes.subarray(index*1_000_000,(index+1)*1_000_000);return binary({bytes:part,sha256:originalDigest(part)});
    }
    if(post&&/^\/api\/project-author\/(begin|render|inspect|resume|revise|rasters|complete|recovery|reconcile)$/.test(path))return json(200,await hostedAuthoringCommand(app,path.split('/').at(-1),await inputBody(request),actor));
    return json(405,{error:'Use the existing bounded project authoring caller'});
   }
   const originalRoute=/^\/api\/project-original\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})\/([a-zA-Z0-9_-]{1,100})(?:\/(reserve|complete|chunk|drive-read)(?:\/([0-9]{1,2}))?)?$/.exec(path);
   if(originalRoute){
    check(settings.projectBinding||settings.dispatchBinding?request.method==='GET':(settings.inertBinding||settings.manualBinding)&&request.method==='GET'||env.EVZ_OPERATIONS_SHARED_ORIGINALS==='fictional-chunks-v1','Shared original transfer is not configured');
    const [,project_id,asset_id,version_id,operation,index]=originalRoute,ids={project_id,asset_id,version_id},store=blobProjectOriginalStore(raw);
    if(request.method==='GET'&&!operation)return json(200,await sharedOriginalManifest(app,store,ids));
    if(request.method==='GET'&&operation==='chunk'&&index!==undefined){const result=await readSharedOriginalChunk(app,store,ids,Number(index));return new Response(result.bytes,{headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(result.bytes.length),'Content-Disposition':'attachment; filename="original-chunk.bin"','X-Content-SHA256':result.sha256}});}
    if(post&&operation==='drive-read'&&index===undefined){
     const input=await inputBody(request),options={...googleDriveOptions,env,actor,now:()=>+now()};
     check(env.EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS==='fictional-drive-read-v1','Hosted Drive original read is disabled');
     if(!options.getAccessToken)options.getAccessToken=createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),profile:driveOAuthProfile,grantId:app.config.google_drive_originals?.grant_id}).getAccessToken;
     return json(200,await readDriveOriginalStep(app,store,ids,input,options));
    }
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
   if(path.startsWith('/api/internal-dispatch/')){check(settings.dispatchBinding,'Exact standing dispatch profile required');const command=path.split('/').at(-1);check(request.method==='GET'&&['policy','status'].includes(command)||post&&!['policy','status'].includes(command),'Use exact standing control operation');const input=post?await inputBody(request):{},result=await dispatchCommand(app,command,input,actor,{runtime:env.EVZ_INTERNAL_DISPATCH_RUNTIME===settings.dispatchBinding?.scope.capability});if(command==='reconcile'&&input.action_id){const tick=result.ticks.find(t=>t.authorization_event===input.event_id);return json(202,{...result,dispatch:await enqueueInternalDispatch(app,tick,{...internalDispatchOptions,env,context})});}return json(200,result);}
   if(request.method==='GET'&&path==='/api/team-notifications')return json(200,settings.dispatchBinding?dispatchNotificationView(await app.snapshot(),await app.loadConfig(),now(),env.EVZ_INTERNAL_DISPATCH_RUNTIME===settings.dispatchBinding?.scope.capability):notificationView(await app.snapshot()));
   if(request.method==='GET'&&path==='/api/incoming-mail')return json(200,{enabled:env.EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL==='fictional-incoming-v1',...incomingMailView(await app.snapshot())});
   if(post&&path==='/api/incoming-mail/sync'){
    await inputBody(request);const options={...googleIncomingOptions,actor,env};
    check(env.EVZ_OPERATIONS_GOOGLE_INCOMING_MAIL==='fictional-incoming-v1','Hosted incoming synchronization is disabled');
    if(!options.getAccessToken&&env.EVZ_OPERATIONS_GOOGLE_OAUTH==='owner-code-v1')options.getAccessToken=createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),grantId:app.config.google_incoming_mail?.grant_id}).getAccessToken;
    return json(200,await syncIncomingMail(app,options));
   }
   if(request.method==='GET'&&path==='/api/state'){
    const asOf=url.searchParams.get('as_of')??now().toISOString(),age=+now()-Date.parse(asOf);
    check(Number.isFinite(age)&&age>=0&&age<=300_000,'Desk snapshot expired; refresh to load the current workspace');
    app.now=()=>new Date(asOf);
    const dashboard=await app.dashboard();
    if(settings.dispatchBinding){const standing=dispatchStatus(dashboard,app.config,now(),env.EVZ_INTERNAL_DISPATCH_RUNTIME===settings.dispatchBinding?.scope.capability);dashboard.shared_workspace={capability:settings.dispatchBinding.scope.capability,workspace_id:settings.dispatchBinding.scope.workspace_id,allowed_edits:settings.dispatchBinding.scope.capability===manualDispatchCapability?manualRecordEvents:[],external_suppression:'unverified',execution:standing.status,standing};dashboard.notification_preparation=dispatchNotificationView(dashboard,app.config,now(),env.EVZ_INTERNAL_DISPATCH_RUNTIME===settings.dispatchBinding?.scope.capability);}
    if(dashboard.shared_workspace?.research){dashboard.shared_workspace.research=researchProjection(settings.projectBinding,dashboard,now(),await researchRuntimeEnabled(env)?'Enabled':'Disabled');dashboard.shared_workspace.execution=researchStatusText(dashboard.shared_workspace.research);dashboard.known_research=dashboard.shared_workspace.candidates;}
    if(dashboard.shared_workspace?.generation){dashboard.shared_workspace.generation=refinementPolicyProjection(settings.projectBinding,dashboard,now());dashboard.shared_workspace.generation.runtime=await refinementRuntimeEnabled(env)?'Enabled':'Disabled';dashboard.shared_workspace.execution=refinementStatusText(dashboard.shared_workspace.generation);}
    return json(200,deskSnapshotPage({...projectDashboard(dashboard),csrf,current_operator:actor,operator_auth_enabled:true,workers:[],hosted_preview:true},url.searchParams));
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
   if(post&&path.startsWith('/api/exact-team-notifications/')){
    check(env.EVZ_OPERATIONS_GOOGLE_TEAM_NOTIFICATIONS==='fictional-exact-team-v1','Exact internal notification delivery is disabled');
    teamNotificationBoundary(app,await app.loadConfig());const input=await inputBody(request),options={...googleMailOptions,actor,env};
    if(path==='/api/exact-team-notifications/policy'){const policy=notificationPolicy(await app.loadConfig());return json(200,{policy,sha256:hash(policy),approval_required:'Signed owner policy authorization and separate exact message approval'});}
    if(path==='/api/exact-team-notifications/authorize-policy')return json(200,await authorizeNotificationPolicy(app,input,actor));
    if(path==='/api/exact-team-notifications/package')return json(200,await exactNotificationPackage(app,input,actor));
    if(path==='/api/exact-team-notifications/approve')return json(200,await approveExactNotification(app,input,actor));
    if(['/api/exact-team-notifications/dispatch','/api/exact-team-notifications/reconcile'].includes(path)){
     check((await app.snapshot()).actions[input.action_id]?.payload?.internal_notification===true,'Choose an exact saved internal notification action');
     if(!options.getAccessToken&&env.EVZ_OPERATIONS_GOOGLE_OAUTH==='owner-code-v1')options.getAccessToken=createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),grantId:app.config.google_team_notifications?.grant_id}).getAccessToken;
     return json(200,await (path.endsWith('/dispatch')?dispatchExactMail:reconcileExactMail)(app,input,options));
    }
    return json(405,{error:'Use the supported exact internal notification operation'});
   }
   if(post&&path.startsWith('/api/exact-mail/')){
    check(env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL==='fictional-exact-mail-v1','Hosted exact email is disabled');
    const input=await inputBody(request),options={...googleMailOptions,actor,env};
    if(!options.getAccessToken&&['/api/exact-mail/dispatch','/api/exact-mail/reconcile'].includes(path)&&env.EVZ_OPERATIONS_GOOGLE_OAUTH==='owner-code-v1')options.getAccessToken=createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),grantId:app.config.google_exact_mail?.grant_id}).getAccessToken;
    if(path==='/api/exact-mail/package')return json(200,await exactMailPackage(app,input,actor));
    if(path==='/api/exact-mail/approve')return json(200,await approveExactMail(app,input,actor));
    if(path==='/api/exact-mail/dispatch')return json(200,await dispatchExactMail(app,input,options));
    if(path==='/api/exact-mail/reconcile')return json(200,await reconcileExactMail(app,input,options));
   }
   if(path.startsWith('/api/calendar/')){
    check(env.EVZ_OPERATIONS_GOOGLE_CALENDAR==='fictional-calendar-v1','Hosted Calendar is disabled');
    const options={...googleCalendarOptions,actor,env};
    if(!options.getAccessToken)options.getAccessToken=createGoogleOAuth({...googleOAuthOptions,env,now:()=>+now(),profile:calendarOAuthProfile,grantId:app.config.google_calendar?.grant_id}).getAccessToken;
    if(request.method==='GET'&&path==='/api/calendar/availability')return json(200,await calendarAvailability(app,options));
    if(post){const input=await inputBody(request);
     if(path==='/api/calendar/queue')return json(200,await queueGoogleMeeting(app,input,options));
     if(path==='/api/calendar/dispatch')return json(200,await dispatchGoogleMeeting(app,input,options));
     if(path==='/api/calendar/reconcile')return json(200,await reconcileGoogleMeeting(app,input,options));
    }
   }
   if(post&&path==='/api/pause'){const proof=await pauseGatewayProof(app,actor),recording=await pauseCallTranscription(app,actor),full=await pauseFullCall(app,actor),assessment=await pauseAssessment(app,actor);return json(200,{paused:true,...proof,...recording,...full,...assessment,in_flight_may_complete:proof.in_flight_may_complete||recording.in_flight_may_complete||full.in_flight_may_complete||assessment.in_flight_may_complete||false,reason:'Operational execution stays disabled; further finite Gateway jobs are paused'});}
   return json(409,{error:'This action needs a connected execution or file service; it is disabled in the fictional shared preview'});
  }catch(error){if(['ENOENT','EACCES','ENOTDIR'].includes(error.code))return json(503,{error:'Private desk UI is unavailable; no execution was started'});if(error.code==='STATE_CONFLICT')return json(409,{error:error.message});if(error.code==='STATE_UNCERTAIN'||error.code==='STATE_UNAVAILABLE')return json(503,{error:error.message});return json(400,{error:error.message?.startsWith('Shared')?'Private shared state is unavailable; retain your event ID and retry after readback':error.message?.includes('token')?'Private request rejected':error.message?.slice(0,240)??'Private request failed'});}
 };
}
