import {readFile} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {StudioLifecycle,initialConfig,check} from './lifecycle.mjs';import {ConditionalLifecycleStore} from './lifecycle-store.mjs';import {createOperatorAuth} from './operators.mjs';import {fixtureProspect} from './lifecycle-fixtures.mjs';import {lifecycleAssets} from './lifecycle-server.mjs';import {renderFollowUpPreview} from './follow-up-template.mjs';import {callingSession,saveInformationDraft} from './call-desk-actions.mjs';
import {audioRequest,saveCallAudio,readCallAudio,reconcileCallAudio,blobAudioStore} from './call-audio.mjs';

const base='/desk',csrfCookie='evz_desk_csrf',maxBody=120_000;
const headers={'Cache-Control':'no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
const json=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});
const cookieValue=(header,name)=>String(header??'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const sign=(secret,payload)=>createHmac('sha256',secret).update('desk-csrf:'+payload).digest();
function csrfValid(token,secret,now){try{const [payload,mac,extra]=token.split('.'),actual=Buffer.from(mac,'base64url'),expected=sign(secret,payload);if(extra!==undefined||actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;const [expiry,nonce]=JSON.parse(Buffer.from(payload,'base64url'));return Number.isSafeInteger(expiry)&&expiry>+now&&typeof nonce==='string'&&nonce.length===32;}catch{return false;}}
async function inputBody(request){const reader=request.body?.getReader();check(reader,'A JSON request body is required');let bytes=0;const chunks=[];for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBody){await reader.cancel();throw Error('Request body exceeds the private desk limit');}chunks.push(Buffer.from(value));}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Supply valid JSON without credentials in unrelated fields');}}
function configured(env,now){
 check(env.CONTEXT==='deploy-preview'&&env.EVZ_OPERATIONS_DESK_ENABLED==='fictional-preview','Private desk is not configured');
 const origin=new URL(env.EVZ_OPERATIONS_ORIGIN);check(origin.protocol==='https:'&&origin.origin===env.EVZ_OPERATIONS_ORIGIN,'Private desk is not configured');
 check(/^evz-redesign-proof-[a-z0-9-]{8,44}$/.test(env.EVZ_OPERATIONS_BLOB_NAMESPACE??''),'Private desk is not configured');
 const auth=createOperatorAuth(env,{now:()=>+now()});check(auth,'Private desk is not configured');return {origin:origin.origin,auth};
}
async function defaultStore(namespace){const {getStore}=await import('@netlify/blobs');return getStore({name:namespace,consistency:'strong'});}
async function openApp(raw,now){
 const store=new ConditionalLifecycleStore(raw,{maxBytes:2_000_000});
 if(!await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'})){
  const config=structuredClone(initialConfig);config.run_id='shared-fictional-proof';config.preview_seeded_at=now().toISOString();config.follow_up.enabled=true;config.sender.operator_names={owner:'Owner proof',friend:'Friend proof'};
  await store.initialize(config,{schema_version:1,run_id:config.run_id,mode:'controlled',revision:0,updated_at:config.preview_seeded_at,prospects:{},events:{},actions:{},asset_index:{},ai_attempts:{},exceptions:[]});
 }
 const app=await StudioLifecycle.fromStore({store,now}),snapshot=await app.snapshot();check(typeof app.config.preview_seeded_at==='string','Fictional preview seed is unavailable');
 if(!snapshot.events['import-shared-proof'])await app.apply(fixtureProspect('shared-proof',app.config.preview_seeded_at,'STUDIO TEST Shared project'));
 return app;
}
function projectDashboard(view){
 view.events=Object.fromEntries(Object.entries(view.events).map(([id,e])=>[id,{id,type:e.type,prospect_id:e.prospect_id,actor:e.actor,at:e.at}]));
 if(view.operations)view.operations={email:Object.fromEntries(Object.entries(view.operations.email??{}).map(([id,e])=>[id,{status:e.status,thread:Boolean(e.thread)}])),cycle:view.operations.cycle?{completed_cycles:view.operations.cycle.completed_cycles,completed_at:view.operations.cycle.completed_at}:null,maintenance:{backup_date:view.operations.maintenance?.backup_date}};
 delete view.ai_attempts;return view;
}

export function createHostedDesk({env=process.env,storeFactory=defaultStore,now=()=>new Date(),assetDirectory=fileURLToPath(new URL('./lifecycle-ui/',import.meta.url)),readAsset=null}={}){
 return async request=>{
  let settings;try{settings=configured(env,now);}catch{return json(503,{error:'Private desk is not configured'});}
  const url=new URL(request.url),path=url.pathname.slice(base.length)||'/';
  const publicNavigation=request.method==='GET'&&path==='/'&&request.headers.get('sec-fetch-mode')==='navigate'&&request.headers.get('sec-fetch-dest')==='document';
  if(url.origin!==settings.origin||url.pathname!==base&&!url.pathname.startsWith(base+'/')||request.headers.get('origin')&&request.headers.get('origin')!==settings.origin||!publicNavigation&&request.headers.get('sec-fetch-site')&&!['same-origin','none'].includes(request.headers.get('sec-fetch-site')))return json(403,{error:'Private desk origin is not permitted'});
  try{
   if(request.method==='GET'&&lifecycleAssets.has(path)&&!['/preview/','/preview.js'].includes(path)){
    const [file,type]=lifecycleAssets.get(path);let body=readAsset?await readAsset(file):await readFile(join(assetDirectory,file));
    if(type==='text/html')body=body.toString().replace('<html lang="en">','<html lang="en" data-base="/desk">').replaceAll('href="/','href="/desk/').replaceAll('src="/','src="/desk/').replace('Private on this computer','Private shared fictional preview');
    if(type==='text/css')body=body.toString().replaceAll('url(/assets/','url(/desk/assets/');
    return new Response(body,{headers:{...headers,'Content-Type':type+(type.startsWith('text/')?'; charset=utf-8':'')}});
   }
   let csrf=cookieValue(request.headers.get('cookie'),csrfCookie);
   if(request.method==='GET'&&path==='/api/bootstrap'){
    if(!csrfValid(csrf,env.EVZ_OPERATIONS_SESSION_SECRET,now())){const payload=Buffer.from(JSON.stringify([+now()+8*3600000,randomBytes(16).toString('hex')])).toString('base64url');csrf=payload+'.'+sign(env.EVZ_OPERATIONS_SESSION_SECRET,payload).toString('base64url');}
    return json(200,{csrf,operator_auth_required:true},{'Set-Cookie':`${csrfCookie}=${csrf}; HttpOnly; Secure; SameSite=Strict; Path=/desk/; Max-Age=28800`});
   }
   const post=request.method==='POST';if(post&&(!csrfValid(csrf,env.EVZ_OPERATIONS_SESSION_SECRET,now())||request.headers.get('x-studio-token')!==csrf||path!=='/api/call-audio'&&request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json(403,{error:'Current same-origin approval token required'});
   if(post&&path==='/api/login'){const input=await inputBody(request),actor=settings.auth.authenticate(input.key);return actor?json(200,{operator:actor},{'Set-Cookie':settings.auth.cookie(settings.auth.issue(actor),{secure:true})}):json(401,{error:'The operator key was not recognized'});}
   const actor=settings.auth.actorFromCookie(request.headers.get('cookie'));if(!actor)return json(401,{error:'Sign in with your individual operator key'});
   if(post&&path==='/api/logout')return json(200,{signed_out:true},{'Set-Cookie':settings.auth.cookie('',{secure:true,clear:true})});
   let app,raw;try{raw=await storeFactory(env.EVZ_OPERATIONS_BLOB_NAMESPACE);app=await openApp(raw,now);}catch{return json(503,{error:'Private shared storage is unavailable; no execution was started'});}
   if(request.method==='GET'&&path==='/api/state')return json(200,{...projectDashboard(await app.dashboard()),csrf,current_operator:actor,operator_auth_enabled:true,workers:[],hosted_preview:true});
   if(request.method==='GET'&&/^\/api\/events\/[a-zA-Z0-9_-]{1,100}$/.test(path)){const id=path.split('/').at(-1),state=await app.snapshot(),event=state.events[id];return json(200,{found:Boolean(event),id,...(event?{actor:event.actor,fingerprint:event.fingerprint,at:event.at}:{}),revision:state.revision});}
   if(request.method==='GET'&&/^\/follow-up(?:-draft|-history)?\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,100}$/.test(path)){
    const [,route,id,key]=path.split('/'),r=(await app.snapshot()).prospects[id];let entry;if(route==='follow-up-draft')entry=r?.follow_up_drafts?.find(d=>d.id===key);else if(route==='follow-up-history'){if(Object.hasOwn(r?.follow_up_history??[],key))entry={...r.follow_up_history[key],status:'Superseded original; retained for history'};}else entry=r?.follow_ups?.[key];check(entry?.content,'Unknown saved follow-up');
    return new Response(renderFollowUpPreview(entry).replaceAll('"/assets/','"/desk/assets/'),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}});
   }
   if(request.method==='GET'&&/^\/call-audio\/[a-zA-Z0-9_-]{1,100}\/[a-zA-Z0-9_-]{1,80}$/.test(path)){const [, ,project,id]=path.split('/'),clip=await readCallAudio(app,blobAudioStore(raw),project,id);return new Response(clip.bytes,{headers:{...headers,'Content-Type':clip.audio.mime,'Content-Disposition':`inline; filename="${clip.filename}"`}});}
   if(post&&path==='/api/call-audio'){const {input,bytes}=await audioRequest(request);return json(200,await saveCallAudio(app,blobAudioStore(raw),input,bytes,actor));}
   if(post&&path==='/api/call-audio-check'){const input=await inputBody(request);return json(200,await reconcileCallAudio(app,blobAudioStore(raw),input.prospect_id,input.id));}
   if(post&&path==='/api/event'){const input=await inputBody(request);check(!['prospect_imported','verification_imported','transcript_assessed','reply_received','email_delivered','meeting_verified','call_audio_reserved','call_audio_stored'].includes(input.event?.type),'Provider/research events require their separate trusted route');return json(200,await app.apply(input.event,{actor,expectedRevision:input.revision}));}
   if(post&&path==='/api/calling-session')return json(200,await callingSession(app,await inputBody(request)));
   if(post&&path==='/api/information-draft')return json(200,await saveInformationDraft(app,await inputBody(request),actor));
   if(post&&path==='/api/pause')return json(200,{paused:true,reason:'Execution is disabled throughout this fictional preview'});
   return json(409,{error:'This action needs a connected execution or file service; it is disabled in the fictional shared preview'});
  }catch(error){if(['ENOENT','EACCES','ENOTDIR'].includes(error.code))return json(503,{error:'Private desk UI is unavailable; no execution was started'});if(error.code==='STATE_CONFLICT')return json(409,{error:error.message});if(error.code==='STATE_UNCERTAIN'||error.code==='STATE_UNAVAILABLE')return json(503,{error:error.message});return json(400,{error:error.message?.startsWith('Shared')?'Private shared state is unavailable; retain your event ID and retry after readback':error.message?.includes('token')?'Private request rejected':error.message?.slice(0,240)??'Private request failed'});}
 };
}
