import assets from '../hosted-assets.mjs';
import {createHostedDesk} from '../hosted-desk.mjs';
export default (request,context)=>createHostedDesk({env:{...process.env,CONTEXT:context.deploy?.context??'',SITE_ID:context.site?.id??'',DEPLOY_ID:context.deploy?.id??''},readAsset:file=>{
 if(!Object.hasOwn(assets,file))throw Object.assign(Error('Bundled UI asset unavailable'),{code:'ENOENT'});
 return Buffer.from(assets[file],'base64');
}})(request);
export const config={path:['/desk','/desk/*'],excludedPath:['/desk/api/full-call-transcription/execute','/desk/api/transcript-assessment/execute','/desk/api/project-author/generate-execute']};
