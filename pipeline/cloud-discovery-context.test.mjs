import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hash} from './lifecycle.mjs';
import {candidatePacket} from './candidate-packet.mjs';
import {verificationData} from './verification-calls.mjs';
import {cloudDiscoveryFixture,cloudDiscoveryCandidate,cloudDiscoveryDecision} from './cloud-discovery-fixtures.mjs';
import {cloudDiscoveryCommand,createCloudDiscoveryWorker} from './cloud-discovery-service.mjs';

async function claimed(t,{lane='call-first',id='context-task'}={}){
 const f=await cloudDiscoveryFixture(t);await f.ready();await cloudDiscoveryCommand(f.app,'create',{revision:(await f.store.snapshot()).revision,id,lane,count:2,assigned_to:'owner',area:f.app.config.cloud_discovery.areas[0],subtypes:['HVAC']},'owner');
 const worker=createCloudDiscoveryWorker(f.app,{actor:'researcher',context_id:'source-context'}),input={id,claim_id:id+'-research'};await worker.claim(input);const context=await worker.context(input);return {...f,worker,input,context};
}

test('emitted context supplies business object, source enums, date formats, profile bounds and bounded review schema',async t=>{
 const f=await claimed(t),c=f.context.contract;
 assert.deepEqual(c.call_packet_schema.properties.business_type,{type:'object',additionalProperties:false,required:['category','subtype'],properties:{category:{const:'home-services'},subtype:{enum:['HVAC']}}});
 assert.deepEqual(c.source_snapshot.schema.properties.kind.enum,['business','social','directory']);assert.deepEqual(c.source_snapshot.schema.properties.capture_method.enum,['http','reviewed_page','search_snippet']);assert.deepEqual(c.source_snapshot.schema.properties.coverage.enum,['full','partial']);
 assert.equal(c.source_snapshot.schema.properties.checked_at.pattern,'^\\d{4}-\\d{2}-\\d{2}$');assert.equal(c.source_snapshot.schema.properties.fetched_at.format,'date-time');assert.equal(c.source_snapshot.schema.allOf[0].else.properties.text.minLength,50);
 assert.deepEqual(c.call_packet.source_limits,{default:2,profile_version_1:4});assert.equal(c.call_review_schema.properties.selection_reason.maxLength,1200);assert.equal(c.call_packet.discovery.channel,'Public web search');
});


// Build the entire public call packet from the emitted contract, without the producer's packet helper.
function callCandidate(context,at,{id='candidate-one',sources=1,profile=false}={}){
 const c=context.contract,p=c.call_packet_schema.properties,e=c.source_snapshot.schema.properties;
 const identity={name:'SYNTHETIC HVAC '+id,website:'https://'+id+'.example.com/',category:p.business_type.properties.category.const,subtype:p.business_type.properties.subtype.enum[0]};
 const excerpt='Emergency enquiries require voicemail; we return these calls the next business day.',text=identity.name+'. HVAC services in Fairfax, VA. Call (703) 555-0123. '+excerpt;
 const captures=Array.from({length:sources},(_,i)=>({url:i?identity.website+'about-'+i:identity.website,text,kind:e.kind.enum[0],capture_method:e.capture_method.enum[0],coverage:e.coverage.enum[0],identity_note:'Synthetic first-party business page; no provider or real contact.',fetched_at:at,checked_at:at.slice(0,10),content_sha256:createHash('sha256').update(text).digest('hex')}));
 const packet={schema_version:p.schema_version.const,...(profile?{profile_version:p.profile_version.const}:{}),id,business_name:identity.name,category:'Home Services: HVAC',business_type:{category:identity.category,subtype:identity.subtype},area:'Fairfax',phone:'(703) 555-0123',topic:'Ask about the published voicemail callback process without assuming a problem.',reviewed_by:'Pending independent source review',first_party_note:'Actual independent review still required; synthetic captures only.',unknowns:['Current operation, owner priorities and buying interest remain unknown.'],sources:captures,identity:{url:captures[0].url,excerpt:identity.name},location:{url:captures[0].url,excerpt:'Fairfax'},offering:{url:captures[0].url,excerpt:'HVAC'},public_phone:{url:captures[0].url,excerpt:'(703) 555-0123'},discovery:{channel:c.call_packet.discovery.channel,source_url:captures[0].url,website_status:c.call_packet.discovery.website_status,website_url:identity.website,customer_channel:'Published voicemail route; actual internal handling remains unknown.',next_check:'Ask the owner how callbacks are tracked.'}};
 return {id,identity,packet};
}
function submission(context,at,candidates){const payload=structuredClone(context.contract.submission);payload.queries=[{query:'Actual synthetic public HVAC search',checked_at:at,urls:candidates.map(c=>c.identity.website)}];payload.candidates=candidates;return payload;}
function callDecision(context,candidate,accepted=true){
 const c=context.contract,review=structuredClone(c.call_review);review.selection_reason=accepted?'The exact published callback step supports the focused question; demand remains unknown.':'No selected opening; retain this candidate for human evidence review.';
 if(accepted){const s=candidate.packet.sources[0],excerpt='Emergency enquiries require voicemail; we return these calls the next business day.',question='How are voicemail callbacks tracked today?';review.pitch_supported=true;review.opening_candidates=[{id:'callbacks',service:c.call_review_schema.properties.opening_candidates.items.properties.service.enum.find(v=>v==='systems'),customer_difficulty:excerpt,source_url:s.url,source_sha256:s.content_sha256,excerpt,hypothesis:'A callback tracker may complement the existing voicemail process if useful.',owner_question:question,opening:'I saw you return voicemail calls the next business day. '+question}];review.selected_opening_id='callbacks';}
 return {candidate_id:candidate.id,accepted,reason:accepted?'The retained first-party source supports the exact identity, contact and question.':'Current review does not establish a sufficiently supported opening.',review};
}
async function reviewer(f){const worker=createCloudDiscoveryWorker(f.app,{actor:'reviewer',context_id:'independent-context'}),input={id:f.input.id,claim_id:f.input.id+'-review'};await worker.claim(input);return {worker,input,context:await worker.context(input)};}
async function importReviewed(f){return cloudDiscoveryCommand(f.app,'import',{id:f.input.id,revision:(await f.store.snapshot()).revision},'owner');}

test('complete context-built accepted/rejected packets pass actual submit, independent review and atomic import',async t=>{
 const f=await claimed(t),first=callCandidate(f.context,f.now().toISOString()),held=callCandidate(f.context,f.now().toISOString(),{id:'candidate-held'}),payload=submission(f.context,f.now().toISOString(),[first,held]);
 await f.worker.submit({...f.input,payload});const r=await reviewer(f);assert.deepEqual(r.context.submission,payload);const review=structuredClone(r.context.contract.review);review.decisions=[callDecision(r.context,first),callDecision(r.context,held,false)];
 await r.worker.submit({...r.input,payload:review});assert.equal((await r.worker.receipt(r.input)).status,'Reviewed');assert.equal((await f.worker.receipt(f.input)).artifact.sha256,hash(payload));
 const result=await importReviewed(f);assert.deepEqual(result.imports.map(i=>i.status),['Imported','Held']);const state=await f.store.snapshot(),record=state.prospects[result.imports[0].prospect_id];assert.equal(record.discovery_source.channel,'Public web search');assert.equal(record.qualification.verdict,'Verification call only');assert.equal(state.cloud_discovery.allowances[state.cloud_discovery.allowance_id].used_attempts,2);assert.deepEqual((await f.worker.submit({...f.input,payload})).duplicate,true);assert.equal(Object.keys(state.prospects).length,1);
});

test('context-built profile packet permits four same-host sources; legacy explicit discovery labels retain exact hashes',async t=>{
 const f=await claimed(t),candidate=callCandidate(f.context,f.now().toISOString(),{sources:f.context.contract.call_packet.source_limits.profile_version_1,profile:true});candidate.packet.discovery.channel='Google Search';const digest=hash(candidate.packet),payload=submission(f.context,f.now().toISOString(),[candidate]);
 await f.worker.submit({...f.input,payload});const r=await reviewer(f),review=structuredClone(r.context.contract.review);review.decisions=[callDecision(r.context,candidate)];await r.worker.submit({...r.input,payload:review});const imported=await importReviewed(f),s=await f.store.snapshot();assert.equal(s.prospects[imported.imports[0].prospect_id].discovery_source.channel,'Google Search');assert.equal(hash((await r.worker.context(r.input)).submission.candidates[0].packet),digest);assert.equal((await f.worker.receipt(f.input)).artifact.sha256,hash(payload));
});

test('invalid business shape, enums, source/query dates and profile counts reject before artifact or canonical publication',async t=>{
 const f=await claimed(t),candidate=callCandidate(f.context,f.now().toISOString()),payload=submission(f.context,f.now().toISOString(),[candidate]),before=await f.store.snapshot(),objects=f.objects.size;
 const mutations=[
  p=>{p.candidates[0].packet.business_type='home-services';},
  p=>{p.candidates[0].packet.sources[0].kind='first_party';},
  p=>{p.candidates[0].packet.sources[0].capture_method='browser';},
  p=>{p.candidates[0].packet.sources[0].coverage='complete';},
  p=>{const source=p.candidates[0].packet.sources[0];source.text='Too short';source.content_sha256=createHash('sha256').update(source.text).digest('hex');},
  p=>{p.candidates[0].packet.sources[0].checked_at=f.now().toISOString();},
  p=>{p.candidates[0].packet.sources[0].fetched_at=f.now().toISOString().slice(0,10);},
  p=>{p.queries[0].checked_at=f.now().toISOString().slice(0,10);},
  p=>{p.candidates=[callCandidate(f.context,f.now().toISOString(),{sources:3})];},
  p=>{p.candidates=[callCandidate(f.context,f.now().toISOString(),{sources:5,profile:true})];},
  p=>{p.candidates=[callCandidate(f.context,f.now().toISOString(),{sources:4,profile:true})];p.candidates[0].packet.sources[1].kind='social';}
 ];
 for(const mutate of mutations){const invalid=structuredClone(payload);mutate(invalid);await assert.rejects(f.worker.submit({...f.input,payload:invalid}));assert.deepEqual(await f.store.snapshot(),before);assert.equal(f.objects.size,objects);}
 await f.worker.submit({...f.input,payload});assert.equal((await f.worker.receipt(f.input)).status,'Awaiting review');
});

test('bounded review schema rejects invalid enum/selection reason and preserves the original claim before an accepted retry',async t=>{
 const f=await claimed(t),candidate=callCandidate(f.context,f.now().toISOString()),payload=submission(f.context,f.now().toISOString(),[candidate]);await f.worker.submit({...f.input,payload});const r=await reviewer(f),review=structuredClone(r.context.contract.review);review.decisions=[callDecision(r.context,candidate)];const before=await f.store.snapshot(),objects=f.objects.size;
 for(const mutate of [p=>{p.decisions[0].review.selection_reason='x'.repeat(r.context.contract.call_review_schema.properties.selection_reason.maxLength+1);},p=>{p.decisions[0].review.opening_candidates[0].service='automation';}]){const invalid=structuredClone(review);mutate(invalid);await assert.rejects(r.worker.submit({...r.input,payload:invalid}));assert.deepEqual(await f.store.snapshot(),before);assert.equal(f.objects.size,objects);}
 await r.worker.submit({...r.input,payload:review});assert.equal((await r.worker.receipt(r.input)).status,'Reviewed');
});

test('new unspecified search provenance is generic while named and Referral source evidence remains untouched',async t=>{
 const f=await claimed(t),candidate=callCandidate(f.context,f.now().toISOString()),source=candidate.packet.sources[0],batch={id:'synthetic-batch'},at=f.now();assert.equal(candidatePacket(candidate.identity,[source],batch,at).discovery.channel,'Public web search');
 for(const channel of ['Google Search','Google Maps','Instagram','Facebook','Local directory','Referral']){const p=structuredClone(candidate.packet);p.discovery.channel=channel;const before=hash(p);assert.equal(verificationData(p,at).discovery_source.channel,channel);assert.equal(hash(p),before);}
 const intake={channel:'Referral',source:'Supplied fictional identity',note:'Exact manual provenance',supplied_at:f.now().toISOString(),assigned_to:'owner',urls:[source.url]};const packet=candidatePacket(candidate.identity,[source],batch,at,intake);assert.deepEqual(packet.discovery.intake,intake);assert.equal(packet.discovery.channel,'Referral');
});

test('detailed research uses emitted context source enums and independent review schemas without inventing a search engine',async t=>{
 const f=await claimed(t,{lane:'email-qualified'}),candidate=cloudDiscoveryCandidate(0,'email-qualified'),schema=f.context.contract.source_snapshot.schema.properties;const source=candidate.research.snapshots.sources[0];source.kind=schema.kind.enum[0];source.capture_method=schema.capture_method.enum[0];source.coverage=schema.coverage.enum[0];
 const payload=submission(f.context,f.now().toISOString(),[candidate]);await f.worker.submit({...f.input,payload});const r=await reviewer(f);assert.equal(r.context.review_schemas[0].candidate_id,candidate.id);const review=structuredClone(r.context.contract.review);review.decisions=[cloudDiscoveryDecision(candidate,'email-qualified',f.input.claim_id)];await r.worker.submit({...r.input,payload:review});const result=await importReviewed(f),state=await f.store.snapshot();assert.equal(state.prospects[result.imports[0].prospect_id].discovery_source.channel,'Public web search');assert.equal((await f.worker.receipt(f.input)).artifact.sha256,hash(payload));
});
