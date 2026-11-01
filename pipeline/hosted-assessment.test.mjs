import test from 'node:test';
import assert from 'node:assert/strict';
import {createHostedDesk} from './hosted-desk.mjs';

test('hosted transcript assessment has a read-only disabled policy view',async()=>{
 const origin='https://assessment.example.invalid',env={CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-assessment-test',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
 let data,version=0;const raw={async getWithMetadata(){return data?{data:structuredClone(data),etag:String(version)}:null;},async setJSON(key,next,options){if(options.onlyIfNew&&data||options.onlyIfMatch!==undefined&&options.onlyIfMatch!==String(version))return {modified:false};data=structuredClone(next);return {modified:true,etag:String(++version)};}};
 const handler=createHostedDesk({env,storeFactory:()=>raw}),req=(path,options={})=>new Request(origin+'/desk'+path,options),boot=await handler(req('/api/bootstrap')),csrf=(await boot.json()).csrf,cookie=boot.headers.get('set-cookie').split(';')[0],login=await handler(req('/api/login',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':csrf,origin},body:JSON.stringify({key:env.EVZ_OPERATIONS_OWNER_KEY})})),session=cookie+'; '+login.headers.get('set-cookie').split(';')[0];
 const response=await handler(req('/api/transcript-assessment',{headers:{cookie:session}}));assert.equal(response.status,200);const view=await response.json();assert.equal(view.enabled,false);assert.equal(view.approval,null);
});
