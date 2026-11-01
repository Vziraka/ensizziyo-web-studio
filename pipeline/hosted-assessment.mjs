import {check,hash,validateTranscriptProposal} from './lifecycle.mjs';
import {transcriptSchema,reviewSchema,acceptedTranscriptReview,publishAssessment,transcriptAuthorPrompt,transcriptReviewerPrompt} from './transcript-assessment-contract.mjs';
import {gatewayCapability,gatewayPolicy,makeGatewayClient,liveCatalog} from './gateway-proof.mjs';

// Candidate only: approval and execution require a separately enabled preview and fresh finite allowance.
// Rendered templates keep identity stable across platform bundling and source line endings.
const policyTranscript={sha256:'TRANSCRIPT_SHA256',text:'UNTRUSTED_TRANSCRIPT',machine_draft:{uncertain_words:['UNCERTAIN_SPEECH']}};
export const assessmentPolicy={version:'adopted-transcript-assessment-v1',fictional_only:true,model:gatewayPolicy.model,independent_review:'Separate fresh-context invocation of the same model; not a distinct model or human fact approval',maximum_jobs:1,maximum_count_attempts:2,maximum_generation_attempts:2,maximum_input_tokens:32768,maximum_output_tokens:4096,maximum_output_bytes:24000,thinking_budget:0,reserved_microcredits:8_000_000,minimum_observed_credits:918,prior_policy_reserve_credits:10,host_reserve_credits:900,approval_minutes:15,execution_ms:600000,author_schema_sha256:hash(transcriptSchema),review_schema_sha256:hash(reviewSchema),author_prompt_sha256:hash(transcriptAuthorPrompt({calls:{call:{performed_at:'CALL_TIME'}}},'call',policyTranscript)),review_prompt_sha256:hash(transcriptReviewerPrompt({claims:[]},policyTranscript))};
export const assessmentPolicyHash=hash(assessmentPolicy),assessmentWorkerPath='/desk/api/transcript-assessment/execute';
const enabled=env=>gatewayCapability(env).ready&&env.EVZ_TRANSCRIPT_ASSESSMENT_ENABLED==='fictional-background-v1';
const fields=(value,keys)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k)),'Supply only exact transcript assessment fields');
const bump=(s,app)=>{s.revision++;s.updated_at=app.now().toISOString();};
function fictional(app,s){check(app.config.mode==='controlled'&&!app.config.outreach_enabled&&!app.config.research_enabled&&!app.config.connector_writes_enabled&&app.config.transcript_ai.enabled===false&&Object.values(s.prospects).every(r=>r.controlled===true),'Assessment requires an execution-disabled fictional workspace');}
function source(s,project,callId){
 const r=s.prospects[project],call=r?.calls[callId],t=r?.transcripts[callId];
 check(r?.controlled&&call?.outcome==='connected'&&!call.undone&&t&&t.sha256===hash(t.text)&&!r.restriction&&!r.reply&&(r.stage==='Connected review'||r.approved_calls[callId]),'Adopt a current connected-call transcript; changed, replied or stopped calls hold');
 const audio=(t.audio_ids??[]).map(id=>{const clip=r.call_audio?.[id];check(clip?.status==='Stored'&&clip.kind==='call'&&clip.call_id===callId&&clip.permission_confirmed===true,'Transcript clips must be verified call audio, never private notes');return {id,metadata_sha256:hash(clip),audio_sha256:clip.sha256};});
 return {prospect_id:project,call_id:callId,call_sha256:hash(call),transcript_sha256:t.sha256,transcript_record_sha256:hash(t),adopted_by:t.actor,adopted_at:t.added_at,audio,approved_call_sha256:hash(r.approved_calls[callId]??null),previous_proposal_sha256:hash(r.proposals[callId]??null)};
}
function current(app,s,job){fictional(app,s);check(job?.policy_sha256===assessmentPolicyHash&&!job.paused_at&&Date.parse(job.expires_at)>+app.now()&&hash(source(s,job.scope.prospect_id,job.scope.call_id))===hash(job.scope),'Assessment paused, expired or exact transcript/call/audio changed');}
async function catalogFor(request){const c=await liveCatalog(request);check(!c.pricing.long_context||c.pricing.long_context.above_tokens>assessmentPolicy.maximum_input_tokens,'Assessment crosses unreviewed catalog pricing');return c;}
export async function assessmentView(app,env=process.env){const s=await app.snapshot();fictional(app,s);const approval=structuredClone(s.transcript_assessment??null);return {policy:assessmentPolicy,policy_sha256:assessmentPolicyHash,enabled:enabled(env),revision:s.revision,approval,attempt:approval?structuredClone(s.ai_attempts[approval.operation_id]??null):null,limit:'Disabled candidate. Separate allowance required; no previous proof budget can be reused. A separate fresh-context model review is not independent quality assurance. Human source/outcome/email review remains required.'};}
export async function approveAssessment(app,input,actor,{env=process.env,catalogRequest=fetch}={}){
 fields(input,['operation_id','policy_sha256','prospect_id','call_id','transcript_sha256','remaining_credits','observed_at','auto_recharge_disabled','fictional_transcript_confirmed']);
 check(actor==='owner'&&enabled(env)&&/^[a-zA-Z0-9_-]{1,100}$/.test(input.operation_id??'')&&input.policy_sha256===assessmentPolicyHash,'Owner must approve the exact enabled assessment policy');
 const observed=Date.parse(input.observed_at),now=app.now();check(input.fictional_transcript_confirmed===true&&input.auto_recharge_disabled===true&&Number.isFinite(input.remaining_credits)&&input.remaining_credits>=assessmentPolicy.minimum_observed_credits&&observed<=+now&&+now-observed<=120000,'Verify fictional transcript, fresh included credits and disabled recharge');
 const catalog=await catalogFor(catalogRequest),fingerprint=hash(input);
 return app.change(s=>{fictional(app,s);if(s.transcript_assessment){check(s.transcript_assessment.fingerprint===fingerprint,'Retain the original finite assessment allowance; no reset or replacement');return s.transcript_assessment;}
  const scope=source(s,input.prospect_id,input.call_id);check(scope.transcript_sha256===input.transcript_sha256,'Review the exact adopted transcript hash');check(!s.ai_attempts[input.operation_id]&&!s.prospects[input.prospect_id].proposals[input.call_id],'An assessment already exists; retain its review and history');
  s.transcript_assessment={operation_id:input.operation_id,policy_sha256:assessmentPolicyHash,fingerprint,scope,approved_by:actor,approved_at:now.toISOString(),expires_at:new Date(observed+assessmentPolicy.approval_minutes*60000).toISOString(),balance_observed_at:input.observed_at,observed_remaining_credits:input.remaining_credits,catalog};bump(s,app);return s.transcript_assessment;
 });
}
export async function pauseAssessment(app,actor){check(['owner','friend'].includes(actor),'Sign in to pause assessment');return app.change(s=>{const job=s.transcript_assessment;if(!job)return {assessment_paused:false};fictional(app,s);if(!job.paused_at){job.paused_at=app.now().toISOString();job.paused_by=actor;bump(s,app);}return {assessment_paused:true,in_flight_may_complete:s.ai_attempts[job.operation_id]?.status==='Running'};});}
// Called inside the lifecycle event's atomic write, including after a lost result acknowledgement.
export function validateHostedAssessment(app,s,project,callId,data){
 const job=s.transcript_assessment,a=s.ai_attempts[data.assessment_attempt_id];current(app,s,job);
 check(job.operation_id===a?.id&&a.status==='Reviewed'&&job.scope.prospect_id===project&&job.scope.call_id===callId&&a.scope_sha256===hash(job.scope)&&hash(a.proposal)===hash(data.proposal)&&hash(a.review)===hash(data.review)&&acceptedTranscriptReview(data.review,data.proposal),'Publish only the exact independently reviewed durable assessment');
 a.status='Published';a.published_at=app.now().toISOString();
}
export async function runAssessment(app,input,actor,{env=process.env,catalogRequest=fetch,clientFactory=()=>makeGatewayClient(env,undefined,assessmentPolicy.execution_ms)}={}){
 fields(input,['operation_id','policy_sha256']);check(actor==='owner'&&enabled(env)&&input.policy_sha256===assessmentPolicyHash,'Only the owner may invoke the enabled exact assessment policy');
 let dispatch=false;const job=await app.change(s=>{fictional(app,s);const j=s.transcript_assessment;check(j?.operation_id===input.operation_id&&j.policy_sha256===input.policy_sha256,'Approve the exact adopted transcript first');if(s.ai_attempts[j.operation_id])return j;current(app,s,j);s.ai_attempts[j.operation_id]={id:j.operation_id,prospect_id:j.scope.prospect_id,call_id:j.scope.call_id,transcript_sha256:j.scope.transcript_sha256,scope_sha256:hash(j.scope),model:assessmentPolicy.model,provider:'netlify-gateway',status:'Running',phase:'claimed',actor,started_at:app.now().toISOString(),reserved_microcredits:assessmentPolicy.reserved_microcredits,phases:{}};bump(s,app);dispatch=true;return j;});
 const publish=async()=>{const a=(await app.snapshot()).ai_attempts[job.operation_id];if(a.status==='Reviewed')await publishAssessment(app,job.scope.prospect_id,job.scope.call_id,a.proposal,a.review,job.operation_id);return (await app.snapshot()).ai_attempts[job.operation_id];};
 if(!dispatch)return publish();
 let phase='author',stage='catalog';
 try{
  const active=async()=>{const s=await app.snapshot();current(app,s,s.transcript_assessment);};
  const catalog=await catalogFor(catalogRequest),client=await clientFactory(),signal=AbortSignal.timeout(assessmentPolicy.execution_ms),r=(await app.snapshot()).prospects[job.scope.prospect_id],t=r.transcripts[job.scope.call_id];
  const run=async(prompt,schema)=>{
   const contents=[{role:'user',parts:[{text:prompt+'\n\nOUTPUT JSON SCHEMA (format contract only): '+JSON.stringify(schema)}]}];await active();stage='claim-count';
   await app.change(s=>{current(app,s,s.transcript_assessment);const a=s.ai_attempts[job.operation_id];check(a.status==='Running'&&!a.phases[phase],'Phase already claimed; never repeat count or generation');a.phase=phase;a.phases[phase]={status:'Claimed',input_sha256:hash(contents),schema_sha256:hash(schema)};bump(s,app);});
   stage='count';const count=await client.models.countTokens({model:assessmentPolicy.model,contents,config:{abortSignal:signal}});check(Number.isSafeInteger(count.totalTokens)&&count.totalTokens>0&&count.totalTokens<=assessmentPolicy.maximum_input_tokens,'Assessment exceeds total input cap');await active();stage='generation';
   const response=await client.models.generateContent({model:assessmentPolicy.model,contents,config:{abortSignal:signal,maxOutputTokens:assessmentPolicy.maximum_output_tokens,thinkingConfig:{thinkingBudget:0},candidateCount:1,temperature:0,responseMimeType:'application/json'}}),u=response.usageMetadata;stage='validation';
   check(u&&Number.isSafeInteger(u.promptTokenCount)&&u.promptTokenCount>0&&u.promptTokenCount<=assessmentPolicy.maximum_input_tokens&&Number.isSafeInteger(u.candidatesTokenCount)&&u.candidatesTokenCount>0&&u.candidatesTokenCount<=assessmentPolicy.maximum_output_tokens&&!(u.thoughtsTokenCount>0)&&!(u.toolUsePromptTokenCount>0)&&response.candidates?.length===1&&response.candidates[0].finishReason==='STOP','Assessment output/usage is incomplete or exceeds caps');
   check(response.modelVersion===undefined||response.modelVersion===assessmentPolicy.model||new RegExp('^'+assessmentPolicy.model.replaceAll('.','\\.')+'-[0-9]{3}$').test(response.modelVersion),'Unexpected assessment model');
   check(typeof response.text==='string'&&Buffer.byteLength(response.text)<=assessmentPolicy.maximum_output_bytes,'Assessment output exceeds byte cap');const result=JSON.parse(response.text);await active();
   await app.change(s=>{current(app,s,s.transcript_assessment);const a=s.ai_attempts[job.operation_id];check(a.status==='Running'&&a.phases[phase].status==='Claimed','Phase changed; retain result without another invocation');Object.assign(a.phases[phase],{status:'Returned',result,result_sha256:hash(result),counted_input_tokens:count.totalTokens,usage:{input:u.promptTokenCount,output:u.candidatesTokenCount,thinking:u.thoughtsTokenCount??0},catalog,returned_model:response.modelVersion??assessmentPolicy.model});bump(s,app);});return result;
  };
  const proposal=await run(transcriptAuthorPrompt(r,job.scope.call_id,t),transcriptSchema);validateTranscriptProposal(proposal,t);
  phase='review';const review=await run(transcriptReviewerPrompt(proposal,t),reviewSchema);check(acceptedTranscriptReview(review,proposal),'Independent review needs repair; retain the result without retry');
  await app.change(s=>{current(app,s,s.transcript_assessment);const a=s.ai_attempts[job.operation_id];check(a.status==='Running','Assessment changed');Object.assign(a,{status:'Reviewed',proposal,review:{...review,independent:true,provenance:{provider:'netlify-gateway',model:assessmentPolicy.model,policy_sha256:assessmentPolicyHash,scope:job.scope,attempt_id:job.operation_id,executed_by:actor}},finished_at:app.now().toISOString()});bump(s,app);});
 }catch{
  // Raw provider errors may contain credentials. Claims/results remain for inspection; never refund or retry.
  await app.change(s=>{const a=s.ai_attempts[job.operation_id];check(a.status==='Running','Read durable assessment receipt');Object.assign(a,{status:['count','generation'].includes(stage)?'Uncertain':'Held',phase,stage,reason:'Source, allowance, transport or output could not be verified; reservation retained without redispatch',finished_at:app.now().toISOString()});bump(s,app);});
 }
 return publish();
}
