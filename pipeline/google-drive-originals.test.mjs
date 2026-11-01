import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHostedDesk} from './hosted-desk.mjs';
import {StudioLifecycle} from './lifecycle.mjs';
import {ConditionalLifecycleStore} from './lifecycle-store.mjs';
import {projectContext} from './project-work.mjs';
import {originalDigest,blobProjectOriginalStore} from './shared-project-originals.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {connectSharedOriginals} from './shared-originals-client.mjs';
import {createGoogleOAuth,driveOAuthProfile,driveOAuthPath,driveOAuthScopes,googleOAuthScopes,normalizedGoogleScopes} from './google-oauth.mjs';

const origin='https://preview.example.invalid',ids={project_id:'shared-proof',asset_id:'pdf',version_id:'v1'},file='syntheticOriginal123',at='2026-10-24T17:00:00.000Z';
const baseEnv={CONTEXT:'deploy-preview',SITE_ID:'synthetic-site',DEPLOY_ID:'synthetic-deploy',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_SHARED_ORIGINALS:'fictional-chunks-v1',EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS:'fictional-drive-read-v1',EVZ_DRIVE_RESOURCE_KEYS:JSON.stringify({syntheticOriginal123:'syntheticResourceKey'}),EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-drive-synthetic',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
function memoryBlobs(){const entries=new Map();let version=0;return {entries,loseKey:null,conflictKey:null,async getWithMetadata(key,{type,consistency}){assert.equal(consistency,'strong');const entry=entries.get(key);return entry?{data:type==='json'?JSON.parse(entry.bytes):Buffer.from(entry.bytes),etag:entry.etag}:null;},async set(key,value,options={}){const prior=entries.get(key);if(this.conflictKey===key){this.conflictKey=null;return {modified:false};}if(options.onlyIfNew&&prior||options.onlyIfMatch&&prior?.etag!==options.onlyIfMatch)return {modified:false};const etag='"'+(++version)+'"';entries.set(key,{bytes:Buffer.from(value),etag});if(this.loseKey===key){this.loseKey=null;throw Error('synthetic-lost-ack');}return {modified:true,etag};},async setJSON(key,value,options){return this.set(key,JSON.stringify(value),options);}};}
export async function driveFixture({bytes=Buffer.from('%PDF-1.7\nsynthetic PDF\n%%EOF'),tokenOverrides={},envOverrides={}}={}){
 const raw=memoryBlobs(),env={...baseEnv,...envOverrides};let clock=Date.now(),metadataOverride={},rangeMode='',pause=null,interrupt=false,onRequest=null,providerAccount='ensizziyo@evzdigital.studio';const calls=[];
 const source={...ids,reference:'drive:'+file,name:'Fictional original.pdf',mime_type:'application/pdf',modified_time:at,drive_version:'42',bytes:bytes.length,sha256:originalDigest(bytes),etag:'"synthetic-file-etag"'};
 const token={profile:driveOAuthProfile,account:providerAccount,grant_id:'synthetic-drive-grant',scopes:driveOAuthScopes,access_token:'synthetic-only-access-token',expires_at:clock+3600000,...tokenOverrides};
 const provider=async(url,options)=>{
  const u=new URL(url);assert.equal(u.origin,'https://www.googleapis.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-only-access-token');assert.equal(options.headers['X-Goog-Drive-Resource-Keys'],file+'/syntheticResourceKey');calls.push({path:u.pathname,query:u.search,range:options.headers.Range??null});if(onRequest)await onRequest(u,options);if(pause)await pause;
  if(u.pathname==='/drive/v3/about')return Response.json({user:{emailAddress:providerAccount}});
  assert.equal(u.pathname,'/drive/v3/files/'+file);
  if(u.searchParams.get('alt')!=='media')return Response.json({id:file,name:source.name,mimeType:'application/pdf',size:String(bytes.length),modifiedTime:at,version:'42',sha256Checksum:source.sha256,trashed:false,capabilities:{canDownload:true},webContentLink:'https://evil.invalid/token-theft',resourceKey:'ignoredUntrustedKey',...metadataOverride},{headers:{etag:rangeMode==='metadata-etag'?'"drifted"':source.etag}});
  if(interrupt){interrupt=false;throw Error('synthetic-only-access-token SECRET provider failure');}
  const match=/^bytes=(\d+)-(\d+)$/.exec(options.headers.Range);assert.ok(match);const start=+match[1],end=+match[2];let chunk=bytes.subarray(start,end+1);if(rangeMode==='corrupt'){chunk=Buffer.from(chunk);chunk[chunk.length-1]^=1;}
  const headers={'content-type':'application/pdf','content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(chunk.length),etag:source.etag};
  if(rangeMode==='range')headers['content-range']='bytes 0-1/2';if(rangeMode==='length')headers['content-length']='2';if(rangeMode==='encoding')headers['content-encoding']='gzip';if(rangeMode==='media-etag')headers.etag='"other"';if(rangeMode==='drift')metadataOverride={version:'43'};
  return new Response(chunk,{status:rangeMode==='ignored-range'?200:206,headers});
 };
 const options={env,storeFactory:()=>raw,now:()=>new Date(clock),googleDriveOptions:{getAccessToken:async()=>token,fetcher:(...args)=>provider(...args)}};
 const make=()=>createHostedDesk(options);let handler=make();const fetcher=(url,options)=>handler(new Request(url,options));
 const client=await connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_OWNER_KEY,fetcher});await client.context(ids.project_id);
 const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(raw,{maxBytes:2_000_000}),now:()=>new Date(clock)});
 await app.apply({id:'registered-drive-pdf',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:ids.asset_id,scope:'project',project_id:ids.project_id,kind:'mockup',name:source.name,version_id:ids.version_id,version_label:'v1',reference:source.reference}},{actor:'owner'});
 const envelope=await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});envelope.data.config.google_drive_originals={account:token.account,grant_id:token.grant_id,sources:[source]};await raw.setJSON('workspace',envelope.data,{onlyIfMatch:envelope.etag});app.config=envelope.data.config;
 return {raw,env,source,app,client,calls,provider,make,options,fetcher,bytes,get token(){return token;},advance(ms=45001){clock+=ms;},restart(){handler=make();},metadata(value){metadataOverride=value;},range(value){rangeMode=value;},interrupt(){interrupt=true;},pause(value){pause=value;},onRequest(value){onRequest=value;},account(value){providerAccount=value;},async friend(){return connectSharedOriginals({origin,key:env.EVZ_OPERATIONS_FRIEND_KEY,fetcher});},async changeConfig(fn){const e=await raw.getWithMetadata('workspace',{type:'json',consistency:'strong'});fn(e.data.config);await raw.setJSON('workspace',e.data,{onlyIfMatch:e.etag});},async signed(actor='owner'){const boot=await handler(new Request(origin+'/desk/api/bootstrap')),csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0],login=await handler(new Request(origin+'/desk/api/login',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY']})}));return {cookie:cookie+'; '+login.headers.get('set-cookie').split(';')[0],origin,'x-studio-token':csrf,'content-type':'application/json'};}};
}

test('signed owner and fresh friend resume one exact Drive original into existing verified reader without approving it',async()=>{
 const f=await driveFixture(),friend=await f.friend(),before=await f.app.snapshot();
 await assert.rejects(friend.download(ids),/not verified/);
 const first=await f.client.readDriveOriginal(ids);assert.equal(first.status,'Ready');assert.equal(first.chunks_verified,1);assert.equal((await f.app.snapshot()).asset_index.pdf.baseline_version,before.asset_index.pdf.baseline_version);
 f.restart();const done=await friend.readDriveOriginal(ids);assert.equal(done.status,'Verified');assert.equal(done.sha256,f.source.sha256);
 assert.deepEqual((await friend.download(ids)).bytes,f.bytes);const state=await f.app.snapshot();assert.equal(state.asset_index.pdf.baseline_version,null);assert.equal(state.asset_index.pdf.versions.v1.reference,'drive:'+file);assert.equal(state.asset_index.pdf.versions.v1.verified_original.verified_by,'friend');
 assert.equal(f.calls.filter(c=>c.range).length,1);assert.ok(f.calls.every(c=>!c.path.includes('evil')));assert.doesNotMatch(JSON.stringify([...f.raw.entries].map(([key,e])=>[key,e.bytes.toString()])),/synthetic-only-access-token|syntheticResourceKey|token-theft/);
});

for(const [name,metadata] of Object.entries({id:{id:'other'},version:{version:'43'},modified:{modifiedTime:'2026-10-24T18:00:00Z'},size:{size:'1'},hash:{sha256Checksum:'f'.repeat(64)},mime:{mimeType:'application/vnd.google-apps.document'},shortcut:{shortcutDetails:{targetId:'other'}},download:{capabilities:{canDownload:false}},trash:{trashed:true}}))test('Drive '+name+' metadata holds before any media and never substitutes a version',async()=>{
 const f=await driveFixture();f.metadata(metadata);await assert.rejects(f.client.readDriveOriginal(ids),/metadata\/version or download permission/);assert.equal(f.calls.filter(c=>c.range).length,0);f.metadata({});assert.equal((await f.client.readDriveOriginal(ids)).status,'Held');await assert.rejects(f.client.download(ids),/not verified/);
});
for(const mode of ['range','length','encoding','media-etag','ignored-range','drift','metadata-etag'])test('Drive '+mode+' cannot publish a mismatched range',async()=>{
 const f=await driveFixture();f.range(mode);await assert.rejects(f.client.readDriveOriginal(ids),/range\/ETag|version changed|ETag changed|metadata\/version/);await assert.rejects(f.client.download(ids),/not verified/);assert.equal((await f.client.readDriveOriginal(ids)).status,'Held');
});

test('interruption, fresh instance and concurrent claims resume safely without skipped chunks or credential output',async()=>{
 const f=await driveFixture();f.interrupt();await assert.rejects(f.client.readDriveOriginal(ids),e=>!e.message.includes('synthetic-only-access-token')&&/interrupted/.test(e.message));await assert.rejects(f.client.readDriveOriginal(ids),/already claimed/);f.advance();f.restart();assert.equal((await f.client.readDriveOriginal(ids)).chunks_verified,1);
 let release;f.pause(new Promise(r=>release=r));const one=f.client.readDriveOriginal(ids);while(f.calls.length<6)await new Promise(r=>setImmediate(r));await assert.rejects((await f.friend()).readDriveOriginal(ids),/already claimed/);f.pause(null);release();assert.equal((await one).status,'Verified');assert.equal(f.calls.filter(c=>c.range).length,2);
});

test('lost committed claim and CAS conflict never start provider reads; next exact invocation reconciles durable progress',async()=>{
 for(const mode of ['loseKey','conflictKey']){const f=await driveFixture();f.raw[mode]='workspace';await assert.rejects(f.client.readDriveOriginal(ids),/uncertain or changed/);assert.equal(f.calls.length,0);f.advance();assert.equal((await f.client.readDriveOriginal(ids)).chunks_verified,1);}
});

test('lost range-progress, final archive and final receipt acknowledgements or archive CAS conflicts reconcile without another range or archive event',async()=>{
 for(const mode of ['range-progress','archive-ack','archive-conflict','verified-receipt']){
  const f=await driveFixture(),write=f.raw.setJSON.bind(f.raw);let injected=false;
  f.raw.setJSON=async(key,value,options)=>{const receipt=Object.values(value?.state?.drive_original_reads??{})[0],archived=Boolean(value?.state?.asset_index?.pdf?.versions.v1.verified_original),prior=JSON.parse(f.raw.entries.get('workspace').bytes).state.asset_index.pdf.versions.v1.verified_original;
   const hit=key==='workspace'&&!injected&&(mode==='range-progress'&&receipt?.status==='Ready'||mode==='verified-receipt'&&receipt?.status==='Verified'||mode.startsWith('archive-')&&archived&&!prior);
   if(hit){injected=true;f.raw[mode==='archive-conflict'?'conflictKey':'loseKey']=key;}return write(key,value,options);
  };
  if(mode!=='range-progress')await f.client.readDriveOriginal(ids);await assert.rejects(f.client.readDriveOriginal(ids),/interrupted/);assert.equal(injected,true);f.advance();f.restart();assert.equal((await (await f.friend()).readDriveOriginal(ids)).status,'Verified');assert.deepEqual((await f.client.download(ids)).bytes,f.bytes);assert.equal(f.calls.filter(c=>c.range).length,1);assert.equal(Object.values((await f.app.snapshot()).events).filter(e=>e.type==='asset_original_archived').length,1);
 }
});

test('expired older finalizer cannot publish or overwrite the successor claim and verified original',async()=>{
 const f=await driveFixture();await f.client.readDriveOriginal(ids);let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let metadata=0,blocked=false;
 f.onRequest(async u=>{if(u.pathname.includes('/files/')&&u.searchParams.get('alt')!=='media'&&++metadata===2&&!blocked){blocked=true;entered();await gate;}});
 const older=f.client.readDriveOriginal(ids);await waiting;f.advance();const successor=await (await f.friend()).readDriveOriginal(ids);assert.equal(successor.status,'Verified');const accepted=structuredClone((await f.app.snapshot()).drive_original_reads[successor.transfer_id]);release();await assert.rejects(older,/interrupted/);
 const state=await f.app.snapshot();assert.deepEqual(state.drive_original_reads[successor.transfer_id],accepted);assert.equal(state.asset_index.pdf.versions.v1.verified_original.verified_by,'friend');assert.equal(Object.values(state.events).filter(e=>e.type==='asset_original_archived').length,1);
});

test('missing/corrupt immutable chunks and wrong final hash stay outside the verified original authority',async()=>{
 for(const mode of ['missing','corrupt','wrong-hash']){const f=await driveFixture();if(mode==='wrong-hash'){await f.changeConfig(c=>{c.google_drive_originals.sources[0].sha256='1'.repeat(64);});f.metadata({sha256Checksum:'1'.repeat(64)});}await f.client.readDriveOriginal(ids);const key=[...f.raw.entries.keys()].find(k=>k.startsWith('project-originals/'));if(mode==='missing')f.raw.entries.delete(key);if(mode==='corrupt')f.raw.entries.get(key).bytes[0]^=1;await assert.rejects(f.client.readDriveOriginal(ids),/held for recovery/);assert.equal((await f.client.readDriveOriginal(ids)).status,'Held');await assert.rejects(f.client.download(ids),/not verified/);}
});

test('current context, allowlist, policy, exact grant/account/profile and disabled/inert defaults block reads',async()=>{
 for(const overrides of [{profile:undefined},{account:'personal@gmail.com'},{grant_id:'other-grant'},{scopes:googleOAuthScopes},{scopes:[...driveOAuthScopes,'https://www.googleapis.com/auth/drive']},{expires_at:1}]){const f=await driveFixture({tokenOverrides:overrides});if(overrides.account)await f.changeConfig(c=>c.google_drive_originals.account='ensizziyo@evzdigital.studio');if(overrides.grant_id)await f.changeConfig(c=>c.google_drive_originals.grant_id='synthetic-drive-grant');await assert.rejects(f.client.readDriveOriginal(ids));assert.equal(f.calls.length,0);}
 const f=await driveFixture();f.account('wrong@evzdigital.studio');await assert.rejects(f.client.readDriveOriginal(ids),/account differs/);assert.equal(f.calls.filter(c=>c.range).length,0);
 for(const change of [c=>c.google_drive_originals.sources=[],c=>c.google_drive_originals.sources[0].bytes=64000001,c=>c.google_drive_originals.sources[0].reference='drive:anotherFile123']){const g=await driveFixture();await g.changeConfig(change);await assert.rejects(g.client.readDriveOriginal(ids));assert.equal(g.calls.length,0);}
 const g=await driveFixture(),headers=await g.signed(),url=origin+'/desk/api/project-original/shared-proof/pdf/v1/drive-read',context=projectContext(await g.app.snapshot(),ids.project_id).context_sha256;
 assert.equal((await g.make()(new Request(url,{method:'POST',headers:{...headers,'x-studio-token':'bad'},body:'{}'}))).status,403);
 assert.equal((await g.make()(new Request(url,{method:'POST',headers:{...headers,origin:'https://evil.invalid'},body:'{}'}))).status,403);
 for(const body of [{context_sha256:context,file_id:'arbitrary'},{context_sha256:'0'.repeat(64)}])assert.equal((await g.make()(new Request(url,{method:'POST',headers,body:JSON.stringify(body)}))).status,400);
 for(const envOverrides of [{EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS:''},{CONTEXT:'production'},{EVZ_OPERATIONS_SHARED_ORIGINALS:''}]){const handler=createHostedDesk({...g.options,env:{...g.env,...envOverrides}});assert.ok([400,503].includes((await handler(new Request(url,{method:'POST',headers,body:JSON.stringify({context_sha256:context})}))).status));}
 assert.equal(g.calls.length,0);
 const h=await driveFixture();let once=false;h.onRequest(async u=>{if(!once&&u.searchParams.get('alt')==='media'){once=true;await h.changeConfig(c=>c.google_drive_originals.grant_id='changed-grant');}});await assert.rejects(h.client.readDriveOriginal(ids),/context changed/);await assert.rejects(h.client.download(ids),/not verified/);
});

test('fresh context starts a separate exact read; completed original retains the approved baseline and original events',async()=>{
 const f=await driveFixture();for(const actor of ['owner','friend'])await f.app.apply({id:'selected-'+actor,prospect_id:'studio-assets',type:'asset_version_selected',at,data:{asset_id:ids.asset_id,version_id:ids.version_id}},{actor});
 const original=await f.app.snapshot(),baseline=structuredClone(original.asset_index.pdf),first=await f.client.readDriveOriginal(ids);
 await f.app.apply({id:'fresh-project-note',prospect_id:ids.project_id,type:'note_added',at,data:{note:'New project context; preserve the original and approvals.'}},{actor:'friend'});
 const second=await f.client.readDriveOriginal(ids);assert.notEqual(second.transfer_id,first.transfer_id);assert.equal(second.chunks_verified,1);assert.equal((await f.client.readDriveOriginal(ids)).status,'Verified');const after=await f.app.snapshot();
 for(const [id,event] of Object.entries(original.events))assert.deepEqual(after.events[id],event);
 for(const key of ['baseline_version','baseline_approved_by','baseline_approval_event','baseline_agreement_events','choices','dispute'])assert.deepEqual(after.asset_index.pdf[key],baseline[key]);assert.equal(after.asset_index.pdf.baseline_version,'v1');
});

test('provider 401/403/redirect and unsafe resource-key configuration never leak credentials or read bytes',async()=>{
 for(const status of [401,403,302]){const f=await driveFixture();let invalidated=false;f.options.googleDriveOptions.getAccessToken.invalidate=async token=>{assert.equal(token.access_token,'synthetic-only-access-token');invalidated=true;};f.options.googleDriveOptions.fetcher=async()=>new Response('synthetic-only-access-token provider body',{status,headers:{location:'https://evil.invalid'}});f.restart();await assert.rejects(f.client.readDriveOriginal(ids),e=>!e.message.includes('synthetic-only-access-token'));assert.equal(invalidated,status===401);await assert.rejects(f.client.download(ids),/not verified/);}
 const f=await driveFixture();f.env.EVZ_DRIVE_RESOURCE_KEYS=JSON.stringify({syntheticOriginal123:'invalid\r\nAuthorization: secret'});await assert.rejects(f.client.readDriveOriginal(ids),/resource-key configuration/);assert.equal(f.calls.length,0);
});

test('independent Drive profile shares OAuth state machine while exact Gmail scope equality and credential AAD stay separate',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048}),certs={synthetic:publicKey.export({type:'spki',format:'pem'})},raw=memoryBlobs(),binding={origin,redirect_uri:origin+driveOAuthPath+'/callback',site_id:baseEnv.SITE_ID,deploy_id:baseEnv.DEPLOY_ID,tenant_id:'synthetic-business',account:'ensizziyo@evzdigital.studio',client_id:'synthetic-drive-client.apps.googleusercontent.com',audience:'external-testing'},env={...baseEnv,EVZ_OPERATIONS_GOOGLE_DRIVE_OAUTH:'owner-drive-code-v1',EVZ_DRIVE_OAUTH_BINDING:JSON.stringify(binding),EVZ_DRIVE_CREDENTIAL_NAMESPACE:'evz-drive-credentials-synthetic-only',EVZ_DRIVE_CREDENTIAL_KEY_ID:'drive-k1',EVZ_DRIVE_CREDENTIAL_KEY:Buffer.alloc(32,8).toString('base64url'),EVZ_DRIVE_CLIENT_SECRET:'synthetic-drive-client-secret'};let nonce;
 const make=(overrides={})=>createGoogleOAuth({env,profile:driveOAuthProfile,storeFactory:namespace=>{assert.equal(namespace,env.EVZ_DRIVE_CREDENTIAL_NAMESPACE);return raw;},certificates:async()=>certs,fetcher:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');const sec=Math.floor(Date.now()/1000),head=Buffer.from(JSON.stringify({alg:'RS256',kid:'synthetic'})).toString('base64url'),body=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud:binding.client_id,iat:sec,exp:sec+3600,sub:'synthetic-owner',email:binding.account,email_verified:true,hd:'evzdigital.studio',nonce})).toString('base64url'),wire=head+'.'+body;return Response.json({access_token:'synthetic-drive-access',refresh_token:'synthetic-drive-refresh',token_type:'Bearer',expires_in:3600,scope:driveOAuthScopes.join(' '),id_token:wire+'.'+sign('RSA-SHA256',Buffer.from(wire),privateKey).toString('base64url')});},...overrides});
 assert.throws(()=>createGoogleOAuth({env}),/disabled/);assert.throws(()=>normalizedGoogleScopes(driveOAuthScopes.join(' ')),/scopes/);assert.throws(()=>normalizedGoogleScopes(googleOAuthScopes.join(' '),driveOAuthProfile),/scopes/);
 const session='synthetic-owner-session'.repeat(4),start=await make().start('owner',session),url=new URL(start.authorization_url);nonce=url.searchParams.get('nonce');assert.equal(url.searchParams.get('scope'),['openid','email',driveOAuthScopes[2]].join(' '));assert.equal(url.searchParams.get('include_granted_scopes'),'false');
 const connected=await make().callback('owner',session,{state:url.searchParams.get('state'),code:'fictional-code'});assert.deepEqual(connected.scopes,driveOAuthScopes);assert.equal((await make().getAccessToken()).profile,driveOAuthProfile);assert.throws(()=>make({env:{...env,EVZ_GOOGLE_CREDENTIAL_KEY:env.EVZ_DRIVE_CREDENTIAL_KEY}}),/independent/);
 const f=await driveFixture();f.options.env={...env};f.options.googleOAuthOptions={storeFactory:()=>raw,certificates:async()=>certs,fetcher:async(url,options)=>{assert.equal(url,'https://oauth2.googleapis.com/token');const sec=Math.floor(Date.now()/1000),wire=[{alg:'RS256',kid:'synthetic'},{iss:'https://accounts.google.com',aud:binding.client_id,iat:sec,exp:sec+3600,sub:'synthetic-owner',email:binding.account,email_verified:true,hd:'evzdigital.studio',nonce}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return Response.json({access_token:'synthetic-only-access-token',refresh_token:'synthetic-drive-refresh',token_type:'Bearer',expires_in:3600,scope:driveOAuthScopes.join(' '),id_token:wire+'.'+sign('RSA-SHA256',Buffer.from(wire),privateKey).toString('base64url')});}};
 f.options.googleDriveOptions={fetcher:f.provider};f.restart();const headers=await f.signed(),friendHeaders=await f.signed('friend'),post=async(path,body={},h=headers)=>f.make()(new Request(origin+'/desk/api/google-drive-oauth/'+path,{method:'POST',headers:h,body:JSON.stringify(body)}));
 assert.equal((await post('start',{},friendHeaders)).status,400);const launch=await (await post('start')).json(),hostedURL=new URL(launch.authorization_url);nonce=hostedURL.searchParams.get('nonce');const callback=await post('callback',{state:hostedURL.searchParams.get('state'),code:'fictional-hosted-code'});assert.equal(callback.status,200);const grant=await callback.json();await f.changeConfig(c=>c.google_drive_originals.grant_id=grant.grant_id);assert.equal((await f.client.readDriveOriginal(ids)).status,'Ready');assert.equal((await (await f.friend()).readDriveOriginal(ids)).status,'Verified');assert.deepEqual((await f.client.download(ids)).bytes,f.bytes);
 assert.equal((await f.make()(new Request(origin+'/desk/api/google-oauth/status',{headers:friendHeaders}))).status,200);
 await assert.rejects(make({env:{...env,EVZ_DRIVE_CREDENTIAL_NAMESPACE:'evz-drive-credentials-synthetic-other'}}).getAccessToken());assert.doesNotMatch(JSON.stringify([...raw.entries].map(([k,e])=>[k,e.bytes.toString()])),/synthetic-drive-access|synthetic-drive-refresh|synthetic-owner/);
});

test('real local HTTP 30,591,178-byte Drive ranges cross signed handler and existing original/portable backup readers',async t=>{
 const bytes=Buffer.alloc(30_591_178,32);Buffer.from('%PDF-1.7\nfictional-only\n').copy(bytes);Buffer.from('\n%%EOF\n').copy(bytes,bytes.length-7);const f=await driveFixture({bytes}),wire=[];
 const server=createServer(async(req,res)=>{try{const headers={...req.headers};delete headers.host;let response;if(req.url.startsWith('/drive/v3/'))response=await f.provider('https://www.googleapis.com'+req.url,{method:req.method,headers:{Authorization:req.headers.authorization,'X-Goog-Drive-Resource-Keys':req.headers['x-goog-drive-resource-keys'],Range:req.headers.range},redirect:'error'});else response=await f.make()(new Request(origin+req.url,{method:req.method,headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})}));const body=Buffer.from(await response.arrayBuffer());wire.push({path:req.url,status:response.status,bytes:body.length,range:req.headers.range??null});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);}catch{res.writeHead(500);res.end('Fictional local HTTP boundary failed');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const loopback='http://127.0.0.1:'+server.address().port;
 f.options.googleDriveOptions.fetcher=(url,options)=>fetch(loopback+new URL(url).pathname+new URL(url).search,options);
 const fetcher=(url,options)=>fetch(loopback+new URL(url).pathname+new URL(url).search,options),owner=await connectSharedOriginals({origin,key:baseEnv.EVZ_OPERATIONS_OWNER_KEY,fetcher}),friend=await connectSharedOriginals({origin,key:baseEnv.EVZ_OPERATIONS_FRIEND_KEY,fetcher});
 for(let i=0;i<32;i++){const result=await (i%2?friend:owner).readDriveOriginal(ids);assert.equal(result.chunks_verified,Math.min(i+1,31));assert.equal(result.status,i===31?'Verified':'Ready');}
 const downloaded=await friend.download(ids);assert.deepEqual(downloaded.bytes,bytes);assert.equal(wire.filter(r=>r.range).length,31);assert.ok(wire.every(r=>r.bytes<=1_000_000));
 const directory=await mkdtemp(join(tmpdir(),'evz-drive-original-'));t.after(()=>rm(directory,{recursive:true,force:true}));const local=await StudioLifecycle.initialize({directory,config:(await f.app.store.config()),now:()=>new Date(at)});await local.change(state=>Object.assign(state,JSON.parse(f.raw.entries.get('workspace').bytes).state));await friend.materialize(local,ids);assert.deepEqual((await readProjectAsset(local,ids.project_id,ids.asset_id,ids.version_id)).bytes,bytes);
 // The test's server-owned source policy is configuration, not a credential.
 const backup=join(directory,'portable.json');await local.backup(backup);await StudioLifecycle.restore({input:backup,destination:join(directory,'restored')});assert.deepEqual((await readProjectAsset(await StudioLifecycle.open({directory:join(directory,'restored')}),ids.project_id,ids.asset_id,ids.version_id)).bytes,bytes);assert.equal((await f.app.snapshot()).asset_index.pdf.baseline_version,null);
});
