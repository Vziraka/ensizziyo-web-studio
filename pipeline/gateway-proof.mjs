import {createHash} from 'node:crypto';
import {check,hash} from './lifecycle.mjs';
import {sourceContentHash} from './sources.mjs';
import {openingAssessment} from './opening-policy.mjs';
import audio from './gateway-audio-fixture.json' with {type:'json'};

const audioBytes=Buffer.from(audio.base64,'base64');check(audioBytes.length<=200_000&&audio.seconds>0&&audio.seconds<=10&&audioBytes.toString('ascii',0,4)==='RIFF'&&audioBytes.toString('ascii',8,12)==='WAVE'&&createHash('sha256').update(audioBytes).digest('hex')===audio.sha256,'Synthetic Gateway audio fixture integrity changed');
const source={url:'https://fictional-bakery.example.invalid/contact',kind:'business',capture_method:'http',coverage:'full',fetched_at:'2026-10-24T15:00:00.000Z',text:'STUDIO TEST Juniper Bakery sells weekly pastry boxes. Customers send pickup requests by direct message. Pickup slots are confirmed by a manual callback the next business day.'};source.content_sha256=sourceContentHash(source);
const packet={sources:[source]};
export const gatewayPolicy={version:1,maximum_provider_attempts:8,maximum_count_attempts:4,maximum_generation_attempts:4,fixture_sha256:hash({source,audio_sha256:audio.sha256,request_contract:'fixed-fictional-opening-and-synthetic-audio-v1'}),fictional_only:true,model:'gemini-2.5-flash-lite',jobs:['opening-supported','opening-review','opening-weak','audio-transcript'],maximum_lifetime_requests:4,maximum_daily_requests:4,maximum_cycle_requests:4,reserved_microcredits_per_job:1_000_000,maximum_microcredits:4_000_000,maximum_input_tokens:4096,maximum_output_tokens:1536,thinking_budget:0,total_attempts:1,expiry_minutes:15,minimum_host_reserve_credits:900,maximum_catalog_input_usd_per_million:0.3,maximum_catalog_output_usd_per_million:0.4,audio_sha256:audio.sha256};
export const gatewayPolicyHash=hash(gatewayPolicy);

const bump=(state,now)=>{state.revision++;state.updated_at=now.toISOString();};
const allowed=(input,keys)=>check(input&&Object.keys(input).every(key=>keys.includes(key)),'Only exact fictional proof fields are accepted');
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const day=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(now);
function fictional(app,state){check(app.config.mode==='controlled'&&app.config.outreach_enabled===false&&app.config.research_enabled===false&&app.config.connector_writes_enabled===false&&Object.values(state.prospects).every(r=>r.controlled===true),'Gateway proof requires an execution-disabled fictional workspace');}

export function gatewayCapability(env=process.env){
 let sameOrigin=false;
 try{const provider=new URL(env.GOOGLE_GEMINI_BASE_URL),gateway=new URL(env.NETLIFY_AI_GATEWAY_URL);sameOrigin=provider.protocol==='https:'&&gateway.protocol==='https:'&&provider.origin===gateway.origin&&![provider,gateway].some(u=>u.username||u.password||u.search||u.hash);}catch{}
 const present=Boolean(env.NETLIFY_AI_GATEWAY_KEY&&env.NETLIFY_AI_GATEWAY_URL&&env.GEMINI_API_KEY&&env.GOOGLE_GEMINI_BASE_URL),matching=Boolean(present&&env.GEMINI_API_KEY===env.NETLIFY_AI_GATEWAY_KEY),conflict=Boolean(env.GOOGLE_API_KEY||env.GOOGLE_VERTEX_BASE_URL||env.GOOGLE_GENAI_USE_VERTEXAI==='true');
 return {ready:env.CONTEXT==='deploy-preview'&&present&&matching&&sameOrigin&&!conflict,runtime_credentials_present:present,provider_key_matches_gateway:matching,provider_origin_matches_gateway:sameOrigin,conflicting_google_configuration:conflict,limits:'Runtime booleans only; no credential values. Capability is not an inference, audio pass-through or quota proof.'};
}
export async function liveCatalog(request=fetch){
 const response=await request('https://api.netlify.com/api/v1/ai-gateway/providers/detailed',{signal:AbortSignal.timeout(5000)});check(response.ok,'Gateway model catalog unavailable');const body=await response.text();check(Buffer.byteLength(body)<=300_000,'Gateway model catalog exceeds inspection limit');const catalog=JSON.parse(body),price=catalog.providers?.gemini?.models?.[gatewayPolicy.model]?.pricing;
 check(price&&Number.isFinite(price.input)&&Number.isFinite(price.output)&&price.input>=0&&price.output>=0&&(!price.long_context||price.long_context.above_tokens>gatewayPolicy.maximum_input_tokens)&&price.input<=gatewayPolicy.maximum_catalog_input_usd_per_million&&price.output<=gatewayPolicy.maximum_catalog_output_usd_per_million,'Pinned Gateway model is missing or exceeds reviewed pricing');return {sha256:hash(catalog),pricing:price};
}
export async function gatewayProofView(app,env=process.env){
 const state=await app.snapshot();fictional(app,state);const proof=structuredClone(state.gateway_proof??null);
 if(proof)for(const [kind,job] of Object.entries(proof.jobs)){
  const receiptHash=hash(job),legacy=job.quality_pass;delete job.quality_pass;
  job.receipt_sha256=receiptHash;job.structural_valid=job.structural_valid??job.status==='Completed';
  if(['opening-weak','audio-transcript'].includes(kind))job.fixture_expectation_pass=job.fixture_expectation_pass??legacy??false;
  job.operator_quality_review=state.gateway_proof_reviews?.[kind]?.receipt_sha256===receiptHash?state.gateway_proof_reviews[kind]:{verdict:'Unreviewed'};
 }
 return {revision:state.revision,capability:gatewayCapability(env),proposed_policy:gatewayPolicy,policy_sha256:gatewayPolicyHash,proof,production_execution:false,quality_limit:'Completed means the transport and output contract completed. Model review is not operator acceptance; original receipts and reservations remain unchanged.'};
}
export async function reviewGatewayProof(app,input,actor){
 allowed(input,['operation_id','kind','receipt_sha256','verdict','reason']);
 check(actor==='owner'&&safeId(input.operation_id)&&gatewayPolicy.jobs.includes(input.kind)&&['Accepted','Rejected'].includes(input.verdict)&&typeof input.reason==='string'&&input.reason.trim().length>=12&&input.reason.length<=1200,'Owner must review an exact saved receipt with a specific quality reason');
 return app.change(state=>{fictional(app,state);const job=state.gateway_proof?.jobs[input.kind];check(job&&['Completed','Held','Uncertain'].includes(job.status)&&hash(job)===input.receipt_sha256,'Read the exact finished receipt before reviewing quality');
  state.gateway_proof_reviews??={};const existing=state.gateway_proof_reviews[input.kind],fingerprint=hash(input);if(existing){check(existing.fingerprint===fingerprint,'Retain the original quality review; it cannot be overwritten');return existing;}
  const review={...input,fingerprint,actor,at:app.now().toISOString()};state.gateway_proof_reviews[input.kind]=review;bump(state,app.now());return review;
 });
}
export async function pauseGatewayProof(app,actor){
 check(['owner','friend'].includes(actor),'A signed operator must pause the proof');
 return app.change(state=>{fictional(app,state);const proof=state.gateway_proof;if(!proof)return {gateway_proof_paused:false,in_flight_may_complete:false};if(!proof.configuration.paused_at){Object.assign(proof.configuration,{paused_at:app.now().toISOString(),paused_by:actor});bump(state,app.now());}return {gateway_proof_paused:true,in_flight_may_complete:Object.values(proof.jobs).some(j=>j.status==='Reserved')};});
}
export async function configureGatewayProof(app,input,actor,{env=process.env,catalogRequest=fetch}={}){
 allowed(input,['operation_id','policy_sha256','remaining_credits','observed_at','auto_recharge_disabled']);check(actor==='owner'&&safeId(input.operation_id)&&input.policy_sha256===gatewayPolicyHash,'Owner must approve the exact bounded Gateway policy');check(gatewayCapability(env).ready,'Matching injected Gateway configuration is unavailable');
 const now=app.now(),observed=Date.parse(input.observed_at);check(input.auto_recharge_disabled===true&&Number.isFinite(input.remaining_credits)&&input.remaining_credits>=gatewayPolicy.minimum_host_reserve_credits+gatewayPolicy.maximum_microcredits/1e6&&Number.isFinite(observed)&&observed<=+now&&+now-observed<=120000,'Record a fresh verified included-credit balance above the hosting reserve');
 const catalog=await liveCatalog(catalogRequest),fingerprint=hash(input);
 return app.change(state=>{fictional(app,state);if(state.gateway_proof){check(state.gateway_proof.configuration.operation_id===input.operation_id&&state.gateway_proof.configuration.fingerprint===fingerprint,'A proof is already configured; its lifetime budget cannot be reset');return state.gateway_proof;}
  state.gateway_proof={configuration:{operation_id:input.operation_id,fingerprint,policy_sha256:gatewayPolicyHash,approved_by:actor,approved_at:now.toISOString(),observed_remaining_credits:input.remaining_credits,balance_observed_at:input.observed_at,auto_recharge_disabled_attested:true,expires_at:new Date(observed+gatewayPolicy.expiry_minutes*60000).toISOString(),catalog,host_reserve_limit:'Observed balance only; unrelated site usage is not atomically reserved'},jobs:{}};bump(state,now);return state.gateway_proof;
 });
}

export async function makeGatewayClient(env=process.env,request,timeout=20000){
 check(Number.isSafeInteger(timeout)&&timeout>0&&timeout<=720000,'Gateway timeout exceeds the background bound');
 check(gatewayCapability(env).ready,'Matching injected Gateway configuration is unavailable');const {GoogleGenAI}=await import('@google/genai');
 const send=request??fetch,origin=new URL(env.NETLIFY_AI_GATEWAY_URL).origin,basePath=new URL(env.GOOGLE_GEMINI_BASE_URL).pathname.replace(/\/$/,'');
 const paths=new Set(['countTokens','generateContent'].map(action=>`${basePath}/v1beta/models/${gatewayPolicy.model}:${action}`));
 const boundFetch=(input,options={})=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  check(url.origin===origin&&paths.has(url.pathname)&&!url.search,'Only reviewed Gateway endpoints are permitted');
  check((options.method??(input instanceof Request?input.method:'GET'))==='POST','Only reviewed Gateway POST requests are permitted');
  return send(input,{...options,redirect:'error'});
 };
 // Explicit validated binding prevents local Google/Vertex credentials or SDK defaults from escaping the Gateway.
 return new GoogleGenAI({apiKey:env.GEMINI_API_KEY,vertexai:false,httpOptions:{baseUrl:env.GOOGLE_GEMINI_BASE_URL,timeout,retryOptions:{attempts:1},fetch:boundFetch}});
}
function contentsFor(kind,proof){
 const shape='Return only JSON: {"pitch_supported":boolean,"opening_candidates":[{"id":string,"service":"website"|"systems"|"ai"|"marketing","customer_difficulty":string,"source_url":string,"source_sha256":string,"excerpt":string,"hypothesis":string,"owner_question":string,"opening":string}],"selected_opening_id":string|null,"selection_reason":string}. At most two alternatives. Copy exact source URL/hash/excerpt. Explain a supported specific customer step; improvements remain hypotheses. Do not infer visual defects or owner demand. Hold weak evidence with false, no candidates and null selection.';
 if(kind==='audio-transcript')return [{role:'user',parts:[{text:'Transcribe the audible words exactly. Do not invent a speaker, business facts or missing words. Return JSON only: {"transcript":string,"uncertain_words":string[]}.'},{inlineData:{mimeType:audio.mime,data:audio.base64}}]}];
 if(kind==='opening-review'){const author=proof.jobs['opening-supported'];check(author?.status==='Completed'&&(author.structural_valid??author.quality_pass)===true,'Complete the supported opening before its separate evidence review');return [{role:'user',parts:[{text:'Independently check this exact fictional opening against its retained source. A hypothesis must not become a business fact. Return JSON only: {"verdict":"Accepted"|"Held","reason":string,"assessment_sha256":string}. Use the exact assessment hash.\n'+JSON.stringify({source,assessment:author.result,assessment_sha256:hash(author.result)})}]}];}
 return [{role:'user',parts:[{text:shape+'\n'+JSON.stringify(kind==='opening-weak'?{business:'STUDIO TEST Old-looking Site',source:{...source,text:'Our website was launched in 2004. Customers can book and pay online.',content_sha256:sourceContentHash({...source,text:'Our website was launched in 2004. Customers can book and pay online.'})}}:{business:'STUDIO TEST Juniper Bakery',source})}]}];
}
function reviewedResult(kind,text,proof){
 check(typeof text==='string'&&Buffer.byteLength(text)<=32000,'Gateway returned no bounded text result');const parsed=JSON.parse(text);
 if(kind==='audio-transcript'){check(typeof parsed.transcript==='string'&&parsed.transcript.length<=3000&&Array.isArray(parsed.uncertain_words)&&parsed.uncertain_words.length<=30&&parsed.uncertain_words.every(v=>typeof v==='string'&&v.length<=100),'Audio output must retain bounded transcript uncertainty');const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');return {result:{transcript:parsed.transcript,uncertain_words:parsed.uncertain_words,source_sha256:audio.sha256,source:'Synthetic offline speech fixture; not a recorded customer call',review_status:'Unreviewed transcript; never confirms a customer fact'},structural_valid:true,fixture_expectation_pass:normalized(parsed.transcript)===normalized(audio.expected_text)&&parsed.uncertain_words.length===0};}
 if(kind==='opening-review'){check(['Accepted','Held'].includes(parsed.verdict)&&typeof parsed.reason==='string'&&parsed.reason.length>=12&&parsed.reason.length<=1200&&parsed.assessment_sha256===hash(proof.jobs['opening-supported'].result),'Independent review must bind the exact saved assessment');return {result:parsed,structural_valid:true};}
 check(typeof parsed.pitch_supported==='boolean','Opening output requires explicit support or hold');
 if(kind==='opening-weak'){check(parsed.pitch_supported===false&&parsed.selected_opening_id===null&&Array.isArray(parsed.opening_candidates)&&parsed.opening_candidates.length===0&&typeof parsed.selection_reason==='string'&&parsed.selection_reason.length>=12&&parsed.selection_reason.length<=1200,'Dated-only evidence must remain held');return {result:{held:true,reason:parsed.selection_reason},structural_valid:true,fixture_expectation_pass:true};}
 check(parsed.pitch_supported===true,'Supported fictional opening was not accepted');return {result:openingAssessment(packet,parsed),structural_valid:true};
}
export async function runGatewayProof(app,input,actor,{env=process.env,catalogRequest=fetch,clientFactory=()=>makeGatewayClient(env)}={}){
 allowed(input,['operation_id','kind','policy_sha256']);check(actor==='owner'&&safeId(input.operation_id)&&gatewayPolicy.jobs.includes(input.kind)&&input.policy_sha256===gatewayPolicyHash,'Owner must choose an exact fictional proof job');check(gatewayCapability(env).ready,'Matching injected Gateway configuration is unavailable');
 const fingerprint=hash(input);let dispatch=false,contents;
 const reservation=await app.change(state=>{fictional(app,state);const proof=state.gateway_proof,now=app.now();check(proof?.configuration.policy_sha256===gatewayPolicyHash,'Approve the current bounded Gateway policy first');const existing=proof.jobs[input.kind];if(existing){check(existing.fingerprint===fingerprint,'Retain the original proof operation ID; jobs are never replayed');return existing;}
  check(!proof.configuration.paused_at&&Date.parse(proof.configuration.expires_at)>+now,'Gateway proof is paused or approval expired; no inference started');const jobs=Object.values(proof.jobs);check(!jobs.some(j=>['Reserved','Uncertain'].includes(j.status)),'Another proof job is unresolved; read it back before continuing');check(jobs.length<gatewayPolicy.maximum_lifetime_requests&&jobs.filter(j=>j.day===day(now)).length<gatewayPolicy.maximum_daily_requests&&jobs.reduce((total,j)=>total+j.reserved_microcredits,0)+gatewayPolicy.reserved_microcredits_per_job<=gatewayPolicy.maximum_microcredits,'Gateway proof request/credit allowance is exhausted');
  contents=contentsFor(input.kind,proof);proof.jobs[input.kind]={operation_id:input.operation_id,fingerprint,kind:input.kind,day:day(now),actor,reserved_at:now.toISOString(),reserved_microcredits:gatewayPolicy.reserved_microcredits_per_job,input_sha256:hash(contents),model:gatewayPolicy.model,status:'Reserved'};bump(state,now);dispatch=true;return proof.jobs[input.kind];
 });
 if(!dispatch)return reservation;
 let generationStarted=false,completed,observedUsage,outputText,stage='catalog';
 try{
  const active=async()=>{stage='approval-check';const config=(await app.snapshot()).gateway_proof?.configuration;check(config&&!config.paused_at&&Date.parse(config.expires_at)>+app.now(),'Gateway proof is paused or approval expired');};
  const catalog=await liveCatalog(catalogRequest),client=await clientFactory(),signal=AbortSignal.timeout(40000);await active();stage='input-count';
  const count=await client.models.countTokens({model:gatewayPolicy.model,contents,config:{abortSignal:signal}});check(Number.isSafeInteger(count.totalTokens)&&count.totalTokens>0&&count.totalTokens<=gatewayPolicy.maximum_input_tokens,'Gateway input token count is missing or exceeds the proof cap');
  await active();stage='generation';generationStarted=true;const response=await client.models.generateContent({model:gatewayPolicy.model,contents,config:{abortSignal:signal,maxOutputTokens:gatewayPolicy.maximum_output_tokens,thinkingConfig:{thinkingBudget:0},candidateCount:1,temperature:0,responseMimeType:'application/json'}}),usage=response.usageMetadata;
  if(usage)observedUsage={input:usage.promptTokenCount??null,output:usage.candidatesTokenCount??null,thinking:usage.thoughtsTokenCount??null};
  if(typeof response.text==='string'&&Buffer.byteLength(response.text)<=32000)outputText=response.text;
  check(usage&&Number.isSafeInteger(usage.promptTokenCount)&&usage.promptTokenCount>=0&&usage.promptTokenCount<=gatewayPolicy.maximum_input_tokens&&Number.isSafeInteger(usage.candidatesTokenCount)&&usage.candidatesTokenCount>=0&&usage.candidatesTokenCount<=gatewayPolicy.maximum_output_tokens&&!(usage.thoughtsTokenCount>0)&&!(usage.toolUsePromptTokenCount>0),'Gateway usage exceeded the reviewed token contract or is unavailable');
  check(response.candidates?.length===1&&response.candidates[0].finishReason==='STOP','Gateway output is incomplete or blocked');stage='output-review';
  const proof=(await app.snapshot()).gateway_proof,result=reviewedResult(input.kind,response.text,proof);completed={status:'Completed',...result,counted_input_tokens:count.totalTokens,usage:{input:usage.promptTokenCount,output:usage.candidatesTokenCount,thinking:usage.thoughtsTokenCount??0},conservative_usage_microcredits:Math.ceil((usage.promptTokenCount*0.3+usage.candidatesTokenCount*0.4)*180),catalog,returned_model:response.modelVersion??null};
 }catch(error){completed={status:stage==='output-review'||!generationStarted?'Held':'Uncertain',stage,error_category:Number.isInteger(error.status)?`provider-http-${error.status}`:'Gateway contract or transport unavailable',...(observedUsage?{usage:observedUsage}:{}),...(outputText?{unreviewed_output:outputText}:{}),review_required:true};}
 return app.change(state=>{const job=state.gateway_proof?.jobs[input.kind];check(job?.fingerprint===fingerprint&&job.status==='Reserved','Gateway receipt changed; reconcile without repeating inference');Object.assign(job,completed,{finished_at:app.now().toISOString()});bump(state,app.now());return job;});
}
