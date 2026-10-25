import {sharedDeskSession} from './shared-originals-client.mjs';
import {downloadHostedBackup} from './hosted-authoring-client.mjs';

// Signed explicit caller; no polling, automatic phase replay, repair or activation.
export async function connectKnownResearch(options={}){
 const session=await sharedDeskSession(options),command=(operation,input)=>session.json('/api/known-research/'+operation,{method:'POST',body:input},1_500_000);
 return {operator:session.operator,status:ids=>command('status',ids),register:ids=>command('register',ids),run:input=>command('run',input),authorize:input=>command('authorize',input),pause:policy_sha256=>command('pause',{policy_sha256}),review:input=>command('review',input),reconcile:input=>command('reconcile',input),backup:output=>downloadHostedBackup(session,output)};
}
