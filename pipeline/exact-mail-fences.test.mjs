// Independent required-safe repair regression. Fixture setup derived from the retained base reproduction; expectations are stop=zero and healthy/unrelated=one.
// No project/SDK import occurs until environment replacement and denial guards finish.
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports,createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

process.env={EVZ_PRIVATE_FICTIONAL_PROOF:'exact-mail-fences',...(process.platform==='win32'?{TEMP:'C:/Windows/Temp',TMP:'C:/Windows/Temp',SystemRoot:'C:/Windows'}:{TMPDIR:'/tmp'})};
const denied={fetch:0,http:0,https:0,net:0,tls:0,dgram:0,dns:0,child_process:0},unexpected=[];
const deny=name=>(..._args)=>{denied[name]++;throw Error('GUARDED_REAL_BOUNDARY_DENIED:'+name);};
globalThis.fetch=deny('fetch');
for(const module of [http,https])for(const name of ['request','get'])module[name]=deny(module===http?'http':'https');
net.connect=deny('net');net.createConnection=deny('net');net.Socket.prototype.connect=deny('net');
tls.connect=deny('tls');dgram.createSocket=deny('dgram');
for(const name of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse']){
 if(typeof dns[name]==='function')dns[name]=deny('dns');
 if(typeof dns.promises[name]==='function')dns.promises[name]=deny('dns');
}
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])childProcess[name]=deny('child_process');
syncBuiltinESMExports();
const forbidden=name=>(..._args)=>{unexpected.push(name);throw Error('UNEXPECTED_INJECTED_BOUNDARY:'+name);};
const unselected=name=>({fetcher:forbidden(name+'-http'),storeFactory:forbidden(name+'-credential-store'),getAccessToken:forbidden(name+'-token'),certificates:forbidden(name+'-certificates'),catalogLoader:forbidden(name+'-catalogue'),capture:forbidden(name+'-capture'),model:forbidden(name+'-model'),transport:new Proxy({}, {get:(_t,key)=>forbidden(name+'-transport-'+String(key))})});
const guardsInstalledBeforeImports=true;
const pipeline=dirname(fileURLToPath(import.meta.url));
const moduleURL=name=>pathToFileURL(join(pipeline,name)).href;
const requireProject=createRequire(import.meta.url);
const sdkPackage=JSON.parse(await readFile(join(pipeline,'node_modules/@netlify/blobs/package.json'),'utf8'));
const sourceFiles=['exact-mail.mjs','google-hosted-transport.mjs','exact-mail-fences.test.mjs','lifecycle.mjs','lifecycle-store.mjs','hosted-desk.mjs','reply-content.mjs','project-assets.mjs','google-oauth.mjs','internal-dispatch-host.mjs'];
const sourceIdentity=async()=>Promise.all(sourceFiles.map(async path=>{const bytes=await readFile(join(pipeline,path));return {path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}));
const sourceAtStart=await sourceIdentity();
assert.equal(sdkPackage.version,'11.1.6');
const {getStore}=await import(pathToFileURL(requireProject.resolve('@netlify/blobs')).href);
const {createHostedDesk}=await import(moduleURL('hosted-desk.mjs'));
const {ConditionalLifecycleStore}=await import(moduleURL('lifecycle-store.mjs'));
const {StudioLifecycle,hash}=await import(moduleURL('lifecycle.mjs'));
const {fixtureProspect,fixtureReply}=await import(moduleURL('lifecycle-fixtures.mjs'));
const {gmailScopes}=await import(moduleURL('google-hosted-transport.mjs'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const origin='https://exact-mail-contract.example.invalid',at='2026-10-25T18:00:00.000Z';
const account='business@example.invalid';
export const proofCases=[];const allCases=proofCases,activeCases=[];

async function scenario({pauseAt='none',mutation='none',sender='owner',other='friend',clockStart=at}){
 const entries=new Map(),trace=[],storageRequests=[],providerCalls=[];
 let serial=0,logical=null,paused=false,release,started,committed=null,tokenCalls=0,claimCommitted=false,lostAck=false;
 const controller=new AbortController();
 const pause=new Promise(resolve=>release=resolve),begun=new Promise(resolve=>started=resolve);
 const record=(kind,details={})=>trace.push({order:trace.length+1,kind,...details});
 const active={case:pauseAt+'-'+mutation,sender,other,trace,storage_requests:storageRequests,provider_calls:providerCalls};activeCases.push(active);
 const stateNow=()=>JSON.parse(entries.get('workspace').bytes).state;
 const waitHere=async(kind)=>{paused=true;record(kind);started();await pause;record(kind+'_released');};
 const hit=async kind=>{if(pauseAt===kind&&!paused)await waitHere(kind);};
 const raw=getStore({name:'fictional-exact-mail-contract',siteID:'fictional-site',token:'fictional-sdk-token',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  const u=new URL(url),headers=new Headers(options.headers),method=options.method.toUpperCase();
  assert.ok(['https://edge.example.invalid','https://strong.example.invalid'].includes(u.origin));
  const key=decodeURIComponent(u.pathname.split('/').slice(3).join('/'));assert.equal(key,'workspace');
  storageRequests.push({method,key,if_match:headers.get('if-match'),if_none_match:headers.get('if-none-match')});
  if(method==='GET'){const prior=entries.get(key);return prior?new Response(prior.bytes,{headers:{etag:prior.etag}}):new Response(null,{status:404});}
  assert.equal(method,'PUT');const bytes=Buffer.from(await new Response(options.body).arrayBuffer()),prior=entries.get(key);
  if(headers.get('if-none-match')==='*'&&prior||headers.get('if-match')&&headers.get('if-match')!==prior?.etag)return new Response(null,{status:412});
  const old=prior?JSON.parse(prior.bytes).state.operations?.requests?.[logical]:null;
  const etag='"'+(++serial)+'"',data=JSON.parse(bytes);entries.set(key,{bytes,etag});
  const q=logical&&data.state.operations?.requests?.[logical];
  record('fictional_sdk_commit',{etag,revision:data.state.revision,request_status:q?.status??null,stop_actor:data.state.events['signed-stop']?.actor??null});
  if(!claimCommitted&&q?.status==='Uncertain'&&q.dispatch_started_at){
   claimCommitted=true;record('final_claim_committed',{etag,revision:data.state.revision});
   if(pauseAt==='claim-ack'&&!paused)await waitHere('claim_ack_withheld_after_commit');
  }
  if(q&&!old)await hit('reserve-ack');
  if(q?.raw_base64url&&!old?.raw_base64url)await hit('mime-ack');
  if(q?.provider_message_id&&!old?.provider_message_id)await hit('response-id-ack');
  if(q?.read_claim&&q.read_claim!==old?.read_claim)await hit('read-claim-ack');
  if(q?.status==='Verified'&&old?.status!=='Verified')await hit('verified-ack');
  if(mutation==='lose-ack'&&paused&&!lostAck){lostAck=true;throw Error('Fictional committed acknowledgement lost');}
  return new Response(null,{headers:{etag}});
 }});
 const env={CONTEXT:'deploy-preview',SITE_ID:'fictional-site',DEPLOY_ID:'fictional-deploy',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-exact-mail-contract',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43),EVZ_OPERATIONS_GOOGLE_EXACT_MAIL:'fictional-exact-mail-v1'};
 const token={account,grant_id:'fictional-grant',access_token:'fictional-exact-mail-token',expires_at:Date.now()+3600000,scopes:gmailScopes};
 const getAccessToken=async()=>{tokenCalls++;record('fictional_gmail_token',{call:tokenCalls,claim_committed:claimCommitted});if(pauseAt==='send-token'&&claimCommitted&&!paused)await waitHere('send_token_wait');await hit('token-'+tokenCalls);return token;};
 let grantActive=true;
 getAccessToken.assertCurrent=async value=>{record('fictional_current_grant',{token_call:tokenCalls});if(tokenCalls===4)await hit('grant-current-send');assert.ok(grantActive,'Fictional grant disconnected');assert.equal(value.access_token,token.access_token);};
 getAccessToken.assertGrant=async value=>{record('fictional_grant_metadata',{token_call:tokenCalls});if(tokenCalls===4)await hit('grant-metadata-send');assert.ok(grantActive,'Fictional grant disconnected');assert.deepEqual(value,Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,token[k]])));};
 const json=async(value,label,status=200)=>{
  await hit(label+'-headers');const bytes=Buffer.from(JSON.stringify(value));let emitted=false;
  return {ok:status>=200&&status<300,status,body:{cancel:async()=>hit(label+'-cancel'),getReader:()=>({async read(){await hit(label+(emitted?'-done':'-chunk'));if(emitted)return {done:true};emitted=true;return {done:false,value:bytes};},async cancel(){await hit(label+'-cancel');}})}};
 };
 const provider=async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+token.access_token);
  const path=u.pathname.slice('/gmail/v1/users/me/'.length),s=stateNow();
  const call={method:options.method,path,query:u.search,restriction_at_request:s.prospects['shared-proof'].restriction??null,stop_actor_at_request:s.events['signed-stop']?.actor??null,request_status_at_request:logical?s.operations?.requests?.[logical]?.status??null:null};
  providerCalls.push(call);record('fictional_gmail_request',call);
  if(path==='profile')return json({emailAddress:account},'profile');
  if(path==='settings/sendAs')return json({sendAs:[{sendAsEmail:'hello@evzdigital.studio',verificationStatus:'accepted'}]},'aliases');
  if(path==='threads/thread'){
   const text='Could you share examples of website work?';
   const m={id:'incoming',threadId:'thread',internalDate:String(Date.parse(at)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:'shared-proof@example.invalid'},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Re: Website question'},{name:'Message-ID',value:'<incoming@example.invalid>'},{name:'In-Reply-To',value:'<original@example.invalid>'}],body:{data:Buffer.from(text).toString('base64url'),size:Buffer.byteLength(text)}}};
   return json({id:'thread',messages:[m]},'source');
  }
  if(path==='messages/send'){
   assert.equal(options.method,'POST');const body=JSON.parse(options.body);committed={id:'fictional-sent',threadId:body.threadId??'fictional-new-thread',labelIds:['SENT'],raw:body.raw};
   call.raw_sha256=digest(Buffer.from(body.raw,'base64url'));if(mutation==='lost-response')throw Error('Fictional committed response lost');return json({id:committed.id,threadId:committed.threadId},'send');
  }
  if(path==='messages/fictional-sent'){assert.equal(u.searchParams.get('format'),'raw');return json(committed,'raw');}
  if(path==='messages'){assert.match(u.searchParams.get('q'),/^in:sent rfc822msgid:<evz\./);return json({messages:committed?[{id:committed.id}]:[]},'search');}
  throw Error('Unexpected fictional Gmail path:'+path);
 };
 let clock=Date.parse(clockStart);
 const options={env,storeFactory:namespace=>{assert.equal(namespace,env.EVZ_OPERATIONS_BLOB_NAMESPACE);return raw;},now:()=>new Date(clock),readAsset:forbidden('ui-asset-read'),gatewayOptions:unselected('gateway'),refinementOptions:unselected('refinement'),researchOptions:unselected('research'),googleMailOptions:{getAccessToken,fetcher:provider,signal:controller.signal},googleIncomingOptions:unselected('incoming'),googleDriveOptions:unselected('drive'),googleCalendarOptions:unselected('calendar'),googleOAuthOptions:unselected('oauth'),internalDispatchOptions:unselected('internal')};
 const handler=createHostedDesk(options);
 async function session(actor){
  const boot=await handler(new Request(origin+'/desk/api/bootstrap'));assert.equal(boot.status,200);const csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0];
  const login=await handler(new Request(origin+'/desk/api/login',{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}));assert.equal(login.status,200);
  return {cookie:cookie+'; '+login.headers.get('set-cookie').split(';')[0],origin,'content-type':'application/json','x-studio-token':csrf};
 }
 const sessions={owner:await session('owner'),friend:await session('friend')};
 async function post(path,body,actor){const response=await handler(new Request(origin+'/desk'+path,{method:'POST',headers:sessions[actor],body:JSON.stringify(body)})),data=await response.json();record('signed_handler_response',{path,actor,status:response.status});return {status:response.status,data};}
 const seeded=await handler(new Request(origin+'/desk/api/state',{headers:sessions[sender]}));assert.equal(seeded.status,200);await seeded.body.cancel();
 const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{maxBytes:2000000}),now:()=>new Date(at)});
 // Trusted fictional setup, not a signed approval or raced stop.
 await app.apply(fixtureProspect('unrelated-proof',at,'STUDIO TEST Unrelated record'),{actor:'controlled-fixture'});
 await app.change((state,config)=>{
  config.sender={...config.sender,email:'hello@evzdigital.studio',account_email:account,operator_names:{owner:'Fictional Owner',friend:'Fictional Friend'}};
  config.google_exact_mail={enabled:true,capability:'fictional-exact-mail-v1',run_id:config.run_id,grant_id:token.grant_id,account_email:account,from:'hello@evzdigital.studio',daily_limit:20};
  state.prospects['shared-proof'].follow_up_owner=sender;
  state.operations??={};state.operations.requests??={};state.operations.requests['unrelated-liability']={logical:'unrelated-liability',operation:'intent',transport:'fictional-retained-only',status:'Uncertain',prepared_at:at,no_replay:true};state.revision++;state.updated_at=at;
 });
 await app.apply({id:'fictional-provider-reply',prospect_id:'shared-proof',type:'reply_received',at,data:fixtureReply('incoming','thread','shared-proof@example.invalid')},{actor:'provider'});
 const signedEvent=async(id,type,data,actor,project='shared-proof')=>post('/api/event',{revision:(await app.snapshot()).revision,event:{id,prospect_id:project,type,at,data}},actor);
 let r=(await app.snapshot()).prospects['shared-proof'];
 assert.equal((await signedEvent('signed-review','reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'discovery',focus:'website'},sender)).status,200);
 r=(await app.snapshot()).prospects['shared-proof'];
 assert.equal((await signedEvent('signed-draft','reply_draft_saved',{source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:'Hi,\n\nHere is the exact fictional reviewed reply.'},sender)).status,200);
 r=(await app.snapshot()).prospects['shared-proof'];
 assert.equal((await signedEvent('signed-content-approval','reply_draft_approved',{sha256:r.reply_draft.sha256,approved:true,facts_checked:true},sender)).status,200);
 const packaged=await post('/api/exact-mail/package',{project_id:'shared-proof',kind:'reply'},sender);assert.equal(packaged.status,200,JSON.stringify(packaged));
 const approved=await post('/api/exact-mail/approve',{project_id:'shared-proof',kind:'reply',revision:(await app.snapshot()).revision,event_id:'signed-send-approval',package_sha256:packaged.data.sha256,approved:true,facts_checked:true},sender);assert.equal(approved.status,200,JSON.stringify(approved));
 const id=approved.data.action_id;logical=id+'-intent';assert.equal((await app.snapshot()).events['signed-send-approval'].actor,sender);
 const before=await app.snapshot(),protectedState=s=>({unrelated_event:hash(s.events['import-unrelated-proof']),unrelated_liability:hash(s.operations.requests['unrelated-liability']),ai_attempts:hash(s.ai_attempts),approved_package:hash(s.actions[id].payload.package),approval:hash(s.events['signed-send-approval']??null)});
 const protectedBefore=protectedState(before),configHash=hash(await app.loadConfig());
 const dispatch=post('/api/exact-mail/dispatch',{action_id:id},sender);
 let raced=null;
 if(pauseAt!=='none'){
  await Promise.race([begun,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Expected deferred boundary was not reached')),5000);timer.unref();})]);
  const claimed=await app.snapshot();record('boundary_independently_read',{status:claimed.operations.requests[logical].status});
  if(mutation==='stop')raced=await signedEvent('signed-stop','contact_stopped',{reason:'do_not_contact'},other);
  else if(mutation==='unrelated-note')raced=await signedEvent('signed-unrelated-note','note_added',{note:'Fictional unrelated update while an exact send awaits acknowledgement.'},other,'unrelated-proof');
  else if(mutation==='handoff')raced=await signedEvent('signed-handoff','follow_up_handed_off',{to:other},sender);
  else if(mutation==='edit'){const r=(await app.snapshot()).prospects['shared-proof'];raced=await signedEvent('signed-edit','reply_draft_saved',{source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:'New current fictional content requires new facts/content review.'},sender);}
  else{
   record('trusted_fixture_fault_injection',{mutation});
   if(mutation==='lose-ack'){}
   else if(mutation==='abort-late-release'){controller.abort();const returned=await dispatch;record('operation_returned_before_dependency_release',{status:returned.status});assert.ok([200,400].includes(returned.status));}
   else if(mutation==='runtime')delete env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL;
   else if(mutation==='deadline')clock=Date.parse(at)+40_001;
   else if(mutation==='reservation-day')clock+=200;
   else if(mutation==='grant')grantActive=false;
   else if(mutation==='token-scope')token.scopes=[];
   else if(mutation==='token-expiry')token.expires_at=Date.now()-1;
   else if(mutation==='token-account')token.account='other@example.invalid';
   else if(mutation==='token-grant')token.grant_id='fictional-other-grant';
   else await app.change((state,config)=>{const q=state.operations.requests[logical],action=state.actions[id];
    if(mutation==='config')config.sender.operator_names.owner='Fictional changed configuration';
    else if(mutation==='approval')delete state.events[action.payload.approval_event];
    else if(mutation==='content-approval')state.events[state.prospects['shared-proof'].reply_draft.approval_event].data.facts_checked=false;
    else if(mutation==='actor')action.assigned_to=other;
    else if(mutation==='claim')q.request_claim='fictional-successor';
    else if(mutation==='complete-request')q.unrecognized_successor_detail={different:true};
    else if(mutation==='email')state.operations.email[id]={status:'Uncertain',successor:'preserve-exactly'};
    else if(mutation==='action-receipt')action.delivery={successor:'preserve-exactly'};
    else if(mutation==='terminal'){q.status='Verified';q.receipt={fixture_terminal:'preserve-exactly'};action.status='Verified';action.delivery={fixture_terminal:'preserve-exactly'};state.operations.email[id]={status:'Verified',receipt:q.receipt};}
    else throw Error('Unknown fixture fault '+mutation);
    state.revision++;
   });
   raced={status:200,data:{trusted_fixture_fault:mutation}};
  }
  assert.equal(raced.status,200,JSON.stringify(raced));
  const independentlyRead=await app.snapshot();if(mutation==='stop'){assert.equal(independentlyRead.prospects['shared-proof'].restriction,'do_not_contact');assert.equal(independentlyRead.events['signed-stop'].actor,other);}
  record('signed_mutation_independently_read_before_release',{mutation,revision:independentlyRead.revision,actor:other});release();
 }
 const dispatched=await dispatch;if(mutation==='abort-late-release')await new Promise(resolve=>setImmediate(resolve));assert.ok((['deadline','abort-late-release','lose-ack'].includes(mutation)?[200,400,409]:[200]).includes(dispatched.status),JSON.stringify(dispatched));
 const after=await app.snapshot(),posts=providerCalls.filter(c=>c.path==='messages/send');
 const stable=['unrelated_event','unrelated_liability','ai_attempts','approved_package'];for(const key of stable)assert.equal(protectedState(after)[key],protectedBefore[key]);
 if(mutation!=='approval')assert.equal(protectedState(after).approval,protectedBefore.approval);
 if(mutation!=='config')assert.equal(hash(await app.loadConfig()),configHash);
 const retry=await post('/api/exact-mail/dispatch',{action_id:id},sender);assert.equal(providerCalls.filter(c=>c.path==='messages/send').length,posts.length);
 const restarted=createHostedDesk(options),restartResponse=await restarted(new Request(origin+'/desk/api/exact-mail/dispatch',{method:'POST',headers:sessions[sender],body:JSON.stringify({action_id:id})}));await restartResponse.body.cancel();assert.equal(providerCalls.filter(c=>c.path==='messages/send').length,posts.length);
 assert.equal(JSON.stringify(after).includes(token.access_token),false);
 const result={...active,mutation,configuration_before:configHash,configuration_after:hash(await app.loadConfig()),action_id:id,dispatch:dispatched,mutation_response:raced,repeated_dispatch:retry,post_count:posts.length,post_after_saved_stop:posts.some(c=>c.restriction_at_request==='do_not_contact'&&c.stop_actor_at_request===other),token_calls:tokenCalls,protected_before:protectedBefore,protected_after:protectedState(after),configuration_unchanged:true,final_request:after.operations.requests[logical],final_action:after.actions[id],final_envelope:JSON.parse(entries.get('workspace').bytes)};
 allCases.push(result);return result;
}

for(const [sender,other] of [['owner','friend'],['friend','owner']])test('signed '+sender+' exact reply: both saved stop waits fence POST and unrelated changes may progress',async()=>{
 for(const [pauseAt,mutation,wanted] of [['none','none',1],['claim-ack','stop',0],['send-token','stop',0],['claim-ack','unrelated-note',1]]){
  const r=await scenario({sender,other,pauseAt,mutation});assert.equal(r.post_count,wanted);assert.equal(r.post_after_saved_stop,false);
  if(wanted)assert.equal(r.final_request.status,'Verified');else assert.ok(r.final_request.dispatch_claim);
 }
});
test('fresh actor, approval, content, configuration, grant, runtime and whole-request ownership fence unstarted sends',async()=>{
 for(const [pauseAt,mutation] of [['reserve-ack','handoff'],['mime-ack','edit'],['source-headers','stop'],['source-chunk','approval'],['source-done','actor'],['source-cancel','config'],['claim-ack','claim'],['send-token','content-approval'],['send-token','complete-request'],['send-token','email'],['send-token','runtime'],['send-token','token-scope'],['send-token','token-expiry'],['send-token','token-account'],['send-token','token-grant'],['grant-current-send','grant'],['grant-metadata-send','stop'],['token-1','config']]){
  const r=await scenario({pauseAt,mutation});assert.equal(r.post_count,0,pauseAt+'/'+mutation);assert.ok(r.final_request.raw_base64url||pauseAt==='reserve-ack');
 }
});
test('the encompassing deadline includes token, source bodies and successful CAS acknowledgements',async()=>{
 for(const pauseAt of ['reserve-ack','source-chunk','claim-ack','send-token']){const r=await scenario({pauseAt,mutation:'deadline'});assert.equal(r.post_count,0);}
});
test('the original sender-day liability cannot authorize a new-day POST after its token wait',async()=>{const r=await scenario({pauseAt:'send-token',mutation:'reservation-day',clockStart:'2026-10-26T03:59:59.900Z'});assert.equal(r.post_count,0);assert.match(r.dispatch.data.reason,/reservation date/);assert.equal(r.final_request.prepared_at,'2026-10-26T03:59:59.900Z');});
test('expired invocations return while dependencies wait, and their late callbacks cannot initiate a POST',async()=>{
 for(const pauseAt of ['reserve-ack','source-headers','source-chunk','claim-ack','send-token','raw-chunk']){const r=await scenario({pauseAt,mutation:'abort-late-release'});assert.equal(r.post_count,pauseAt==='raw-chunk'?1:0);assert.ok(r.trace.some(x=>x.kind==='operation_returned_before_dependency_release'));if(pauseAt==='raw-chunk')assert.notEqual(r.final_request.status,'Verified');}
});
test('lost durable acknowledgements retain the same reservation, MIME and request without resending',async()=>{
 for(const pauseAt of ['reserve-ack','mime-ack','claim-ack','response-id-ack','verified-ack']){const r=await scenario({pauseAt,mutation:'lose-ack'});assert.equal(r.post_count,['response-id-ack','verified-ack'].includes(pauseAt)?1:0);assert.ok(r.final_request.request_claim);if(pauseAt==='verified-ack')assert.ok(r.final_request.receipt);}
});
test('late success, failure and readback preserve a successor complete request or terminal receipt',async()=>{
 for(const [pauseAt,mutation] of [['send-headers','claim'],['send-chunk','terminal'],['send-done','complete-request'],['send-cancel','claim'],['response-id-ack','terminal'],['read-claim-ack','claim'],['raw-headers','complete-request'],['raw-chunk','terminal'],['raw-done','claim'],['raw-cancel','terminal'],['verified-ack','terminal']]){
  const r=await scenario({pauseAt,mutation});assert.equal(r.post_count,1,pauseAt);if(mutation==='terminal'){assert.deepEqual(r.final_request.receipt,{fixture_terminal:'preserve-exactly'});assert.deepEqual(r.final_action.delivery,{fixture_terminal:'preserve-exactly'});}else if(mutation==='claim')assert.equal(r.final_request.request_claim,'fictional-successor');else assert.deepEqual(r.final_request.unrecognized_successor_detail,{different:true});
 }
});
test('a final receipt acknowledgement cannot publish over a changed action receipt or email projection',async()=>{
 for(const mutation of ['email','action-receipt']){const r=await scenario({pauseAt:'verified-ack',mutation});assert.equal(r.post_count,1);assert.equal(r.dispatch.data.status,'Uncertain');if(mutation==='email')assert.equal(r.final_envelope.state.operations.email[r.action_id].successor,'preserve-exactly');else assert.deepEqual(r.final_action.delivery,{successor:'preserve-exactly'});assert.ok(r.final_request.receipt);}
});
test('a signed stop after the single POST starts preserves truthful complete Sent readback',async()=>{
 for(const pauseAt of ['send-headers','send-chunk','send-done','send-cancel','response-id-ack','raw-chunk','verified-ack']){const r=await scenario({pauseAt,mutation:'stop'});assert.equal(r.post_count,1);assert.equal(r.final_request.status,'Verified');assert.equal(r.final_envelope.state.prospects['shared-proof'].restriction,'do_not_contact');assert.equal(r.final_request.receipt.mime_sha256,r.final_request.mime_sha256);}
});
after(async()=>{assert.deepEqual(unexpected,[]);assert.ok(Object.values(denied).every(n=>n===0));assert.deepEqual(await sourceIdentity(),sourceAtStart,'Source changed during proof');if(process.argv[2]){await mkdir(process.argv[2],{recursive:true});await writeFile(join(process.argv[2],'fence-evidence.json'),JSON.stringify({schema_version:1,sdk_version:sdkPackage.version,source_files:sourceAtStart,guardsInstalledBeforeImports,denied,unexpected,qualification:'Actual signed hosted handlers, ConditionalLifecycleStore and pinned SDK; fictional HTTP/token/current-grant boundaries. Other fault injections are explicitly labelled in traces.',cases:allCases,active_cases:activeCases},null,2)+'\n');}});
