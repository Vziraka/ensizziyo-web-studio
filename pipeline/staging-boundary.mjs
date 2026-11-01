import {createHash} from 'node:crypto';
// Staging permits inspection, fictional recording and explicit owner connection setup.
// Provider execution cannot be inherited from another deployment's environment.
export function stagingEnvironment(env, context, binding) {
  const fail = () => { throw Error('Exact protected staging deployment required'); };
  if (!binding || binding.site_id !== 'd7840f1d-c0e6-4f87-a41f-e34f53c81625' ||
      !binding.deploy_id || context?.site?.id !== binding.site_id ||
      context?.deploy?.id !== binding.deploy_id || context.deploy.context !== 'deploy-preview' ||
      context.deploy.published === true) fail();
  const origin = new URL(binding.origin);
  if (origin.protocol !== 'https:' || origin.origin !== binding.origin ||
      origin.hostname !== `${binding.deploy_id}--evz-hybrid-fictional-20261027.netlify.app` ||
      !/^evz-redesign-proof-staging-[a-z0-9]{16,40}$/.test(binding.namespace)) fail();
  const projected = {
    CONTEXT: 'deploy-preview', SITE_ID: binding.site_id, DEPLOY_ID: binding.deploy_id,
    EVZ_OPERATIONS_DESK_ENABLED: 'fictional-preview',
    EVZ_OPERATIONS_ORIGIN: binding.origin, EVZ_OPERATIONS_BLOB_NAMESPACE: binding.namespace
  };
  if(binding.recording===true)projected.EVZ_STAGING_RECORD_BINDING=JSON.stringify(binding);
  if(binding.google_connection===true){
    for(const key of ['EVZ_OPERATIONS_GOOGLE_OAUTH','EVZ_GOOGLE_OAUTH_BINDING','EVZ_GOOGLE_CREDENTIAL_NAMESPACE','EVZ_GOOGLE_CREDENTIAL_KEY_ID','EVZ_GOOGLE_CREDENTIAL_KEY','EVZ_GOOGLE_CLIENT_SECRET'])
      if(env[key]!==undefined)projected[key]=env[key];
  }
  for (const key of ['EVZ_OPERATIONS_OWNER_KEY','EVZ_OPERATIONS_FRIEND_KEY','EVZ_OPERATIONS_SESSION_SECRET']) {
    if (typeof env[key] !== 'string' || env[key].length < 32) fail();
    projected[key] = env[key];
  }
  // Bind sessions to the current operator credentials and deployment. Rotating
  // either operator key or moving deployment invalidates prior staging sessions.
  projected.EVZ_OPERATIONS_SESSION_SECRET=createHash('sha256').update(JSON.stringify([
    projected.EVZ_OPERATIONS_SESSION_SECRET,projected.EVZ_OPERATIONS_OWNER_KEY,
    projected.EVZ_OPERATIONS_FRIEND_KEY,binding.deploy_id,binding.namespace
  ])).digest('base64url');
  return projected;
}

const reads = new Set(['/desk','/desk/','/desk/api/bootstrap','/desk/api/state']);
const sessions = new Set(['/desk/api/login','/desk/api/logout']);
export function stagingRouteAllowed(request, assetPaths = [], recording = false, googleConnection = false) {
  const path = new URL(request.url).pathname;
  if(googleConnection===true&&(
    request.method==='GET'&&['/desk/api/google-oauth/status','/desk/api/google-oauth/callback','/desk/google-oauth-callback.js'].includes(path)||
    request.method==='POST'&&['/desk/api/google-oauth/start','/desk/api/google-oauth/callback','/desk/api/google-oauth/disconnect'].includes(path)))return true;
  return request.method === 'GET' && (reads.has(path) || assetPaths.includes(path) || recording && /^\/desk\/api\/events\/[a-zA-Z0-9_-]{1,100}$/.test(path)) ||
    request.method === 'POST' && (sessions.has(path) || recording && path==='/desk/api/event');
}

export function createStagingBoundary({env, binding, handlerFactory, assetPaths = []}) {
  return async (request, context) => {
    let projected;
    try { projected = stagingEnvironment(env,context,binding); }
    catch { return Response.json({error:'Protected staging is not configured'},{status:503,headers:{'Cache-Control':'no-store'}}); }
    if (new URL(request.url).origin !== projected.EVZ_OPERATIONS_ORIGIN || !stagingRouteAllowed(request,assetPaths,binding.recording===true,binding.google_connection===true))
      return Response.json({error:'Staging inspection only; this operation is disabled'},{status:403,headers:{'Cache-Control':'no-store'}});
    return handlerFactory(projected)(request,context);
  };
}
