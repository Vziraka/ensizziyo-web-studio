import assert from 'node:assert/strict';
import {fixture as dispatchFixture,at} from './internal-dispatch.mjs';
import {name} from './shared-project-continuation.mjs';
import {hash} from '../lifecycle.mjs';
import {connectSharedAuthoring} from '../hosted-authoring-client.mjs';
import {createRefinementBackground} from '../netlify-functions/refinement-generation.mjs';
import {makeGatewayClient} from '../gateway-proof.mjs';
export {at,name};
export async function fixture(t,{actor='owner',editOutput,afterPhase,...options}={}){
 const f=await dispatchFixture(t,{refinement:true,actor,authorize:false,...options}),p=f.refinementPolicy,counts={count:0,generation:0,dispatch:0},tokens=[];
 Object.assign(f.env,{EVZ_REFINEMENT_GENERATION_ENABLED:f.env.EVZ_OPERATIONS_DESK_ENABLED,EVZ_REFINEMENT_DISPATCH_SECRET:'g'.repeat(48),NETLIFY_AI_GATEWAY_KEY:'fictional-key',GEMINI_API_KEY:'fictional-key',NETLIFY_AI_GATEWAY_URL:'https://gateway.example.invalid',GOOGLE_GEMINI_BASE_URL:'https://gateway.example.invalid'});
 const connect=(who=actor)=>connectSharedAuthoring({origin:f.env.EVZ_OPERATIONS_ORIGIN,key:f.env[who==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher:f.fetcher}),caller=await connect(),job=await caller.begin(name,'website-refinement'),rt=f.refinementRuntimes[job.id];await caller.registerRuntime(job.id,rt);
 const packet=job.context;
 Object.assign(f.refinementOptions,{catalogRequest:async()=>Response.json(f.catalog),afterPhase,clientFactory:async()=>makeGatewayClient(f.env,async(url,init)=>{
  const body=JSON.parse(init.body);assert.deepEqual(body.contents,(await caller.generationStatus(job.id)).attempt.request.contents);
  assert.equal(body.tools,undefined);
  if(String(url).endsWith(':countTokens')){counts.count++;return Response.json({totalTokens:500});}
  counts.generation++;const source={schema_version:1,kind:'website-refinement',context_sha256:packet.context_sha256,author:'Injected fictional provider',requirements_review:'Preserve the exact selected source and supported background preference.',visual_premise:'Retained selected direction with supported background change.',limitations:'Technical fictional SDK integration only; actual model quality is unproved.',questions:[],selected_direction:'d0',previous_asset_id:packet.source.request.asset_id,previous_version_id:packet.source.request.version_id,feedback:packet.source.request.feedback,preserves_direction:true,pages:[f.selected.pages[0]],preference_review:[]},response={text:JSON.stringify(source),usageMetadata:{promptTokenCount:500,candidatesTokenCount:500},modelVersion:p.model,candidates:[{finishReason:'STOP'}]},result=editOutput?await editOutput(response,source):response;
  return Response.json({...result,text:undefined,candidates:[{finishReason:result.candidates[0].finishReason,content:{role:'model',parts:[{text:result.text}]}}]});
 },30000,p,f.env.EVZ_OPERATIONS_DESK_ENABLED)});
 const worker=createRefinementBackground({env:f.env,storeFactory:()=>f.storage.raw,now:f.now,refinementOptions:f.refinementOptions}),request=token=>new Request(f.env.EVZ_OPERATIONS_ORIGIN+'/desk/api/project-author/generate-execute',{method:'POST',headers:{'content-type':'application/json','x-evz-refinement-capability':token},body:JSON.stringify({job_id:job.id,attempt_id:'refine-'+job.id})}),execute=(token,context=f.context)=>worker(request(token),context);
 f.refinementOptions.dispatch=async token=>{counts.dispatch++;tokens.push(token);const result=await execute(token);assert.equal(result.status,200,await result.text());};
 const approval={policy_sha256:hash(p),remaining_credits:1000,observed_at:at,auto_recharge_disabled:true};
 return {...f,actor,caller,connect,job,rt,generationContext:packet,counts,tokens,execute,request,approval,authorize:async()=>(await connect('owner')).authorizeGeneration(approval),generate:async()=>caller.generate(job.id,(await f.app.snapshot()).revision,hash(p))};
}
