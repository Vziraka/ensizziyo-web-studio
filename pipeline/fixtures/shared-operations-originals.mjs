import assert from 'node:assert/strict';
import {fixture as refinementFixture} from './shared-operations-refinement.mjs';
import {connectSharedOriginals} from '../shared-originals-client.mjs';
import {driveOAuthProfile,driveOAuthScopes} from '../google-oauth.mjs';
export const ids={project_id:'shared-proof',asset_id:'drive-pdf',version_id:'v1'};
export async function fixture(t,options={}){
 const f=await refinementFixture(t,{...options,originals:true}),source=f.google_drive_originals.sources[0],calls=[],ranges=[],wire={hook:null,tokenHook:null,bodyHook:null,metadata:{}};
 f.env.EVZ_OPERATIONS_GOOGLE_DRIVE_ORIGINALS=f.env.EVZ_OPERATIONS_DESK_ENABLED;
 f.env.EVZ_DRIVE_RESOURCE_KEYS=JSON.stringify({fictionalOriginal123:'fictionalResourceKey'});
 const token={profile:driveOAuthProfile,account:f.google_drive_originals.account,grant_id:f.google_drive_originals.grant_id,scopes:driveOAuthScopes,access_token:'fictional-drive-only-token',expires_at:+f.now()+3600000};
 f.googleDriveOptions.getAccessToken=async()=>{await wire.tokenHook?.();return token;};
 f.googleDriveOptions.fetcher=async(url,init)=>{
  const u=new URL(url),kind=u.pathname.endsWith('/about')?'about':u.searchParams.get('alt')==='media'?'media':'metadata';
  assert.equal(u.origin,'https://www.googleapis.com');assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer '+token.access_token);assert.equal(init.headers['X-Goog-Drive-Resource-Keys'],'fictionalOriginal123/fictionalResourceKey');
  calls.push(kind);if(kind==='media')ranges.push(init.headers.Range);const override=await wire.hook?.(kind,url,init);if(override)return override;
  let bytes,headers={},status=200;
  if(kind==='about')bytes=Buffer.from(JSON.stringify({user:{emailAddress:token.account}}));
  else if(kind==='metadata'){bytes=Buffer.from(JSON.stringify({id:'fictionalOriginal123',name:source.name,mimeType:source.mime_type,size:String(source.bytes),modifiedTime:source.modified_time,version:source.drive_version,sha256Checksum:source.sha256,trashed:false,capabilities:{canDownload:true},...wire.metadata}));headers.etag=source.etag;}
  else{const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(init.headers.Range);bytes=f.originalBytes.subarray(+a,+b+1);status=206;headers={'content-type':'application/pdf','content-range':`bytes ${a}-${b}/${source.bytes}`,'content-length':String(bytes.length),etag:source.etag};}
  let emitted=false;return new Response(new ReadableStream({async pull(controller){if(emitted){controller.close();return;}emitted=true;await wire.bodyHook?.(kind);controller.enqueue(bytes);controller.close();}},{highWaterMark:0}),{status,headers});
 };
 const connectOriginals=(actor=f.actor)=>connectSharedOriginals({origin:f.env.EVZ_OPERATIONS_ORIGIN,key:f.env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher:f.fetcher}),originals=await connectOriginals();
 return {...f,source,driveWire:wire,driveCalls:calls,ranges,token,originals,connectOriginals};
}
