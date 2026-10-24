import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {StudioLifecycle,hash,initialConfig} from './lifecycle.mjs';import {verificationData} from './verification-calls.mjs';import {sourceContentHash} from './sources.mjs';
import {openingAssessment,openingView} from './opening-policy.mjs';import {serveLifecycle} from './lifecycle-server.mjs';
import realOutputs from './gateway-quality-fixture.json' with {type:'json'};
import {composeFollowUp} from './follow-up-template.mjs';
const at='2026-10-24T15:00:00.000Z';
function packet(){const source={url:'https://example.com/',kind:'business',capture_method:'http',coverage:'full',identity_note:'Synthetic source only.',checked_at:'2026-10-24',fetched_at:at,text:'SYNTHETIC Comfort. HVAC services in Fairfax, VA. Call703-555-0100. Emergency enquiries require voicemail; callbacks are returned next business day.'};source.content_sha256=sourceContentHash(source);const claim=excerpt=>({url:source.url,excerpt});return {schema_version:1,id:'opening-proof',business_name:'SYNTHETIC Comfort',category:'Home services HVAC',area:'Fairfax',topic:'Explore the published emergency callback route.',reviewed_by:'Fixture source reviewer',first_party_note:'Synthetic first-party source, no outside access.',unknowns:['Owner needs and process are unconfirmed.'],sources:[source],identity:claim('SYNTHETIC Comfort'),offering:claim('HVAC services'),location:claim('Fairfax, VA'),public_phone:claim('703-555-0100')};}
function review(p){const s=p.sources[0],candidate={id:'urgent-routing',service:'systems',customer_difficulty:'Emergency enquiries wait for a next-business-day voicemail callback.',source_url:s.url,source_sha256:s.content_sha256,excerpt:'Emergency enquiries require voicemail; callbacks are returned next business day.',hypothesis:'An urgent-enquiry routing step might help prioritize requests; confirm the current workflow.',owner_question:'How are emergency voicemail requests prioritized today?',opening:'Hi, I saw your emergency enquiries use voicemail with a next-business-day callback. Could I ask how those requests are prioritized?'};return {opening_candidates:[candidate,{...candidate,id:'callback-status',hypothesis:'A callback status tracker might clarify who is following up; ask about existing tools.',owner_question:'Which tools already track emergency callback status?',opening:'Hi, I saw emergency enquiries receive a next-business-day callback. Could I ask which tools already track those requests?'}],selected_opening_id:'urgent-routing',selection_reason:'The urgent-request route is a specific published customer step; existing tools and owner fit remain unknown.',pitch_supported:true};}

test('actual fictional Gateway author failures are rejected by the operational contract, irrespective of model Accepted',()=>{
 const a=realOutputs.supported_assessment,c=a.candidates[0],p={sources:[{url:c.source_url,content_sha256:c.source_sha256,kind:'business',capture_method:'http',text:c.excerpt}]};
 assert.equal(realOutputs.model_review.verdict,'Accepted');
 assert.throws(()=>openingAssessment(p,{opening_candidates:a.candidates,selected_opening_id:a.selected_id,selection_reason:a.reason,pitch_supported:true}),/process question|conversational/);
 const weak=realOutputs.weak_output,w=weak.opening_candidates[0];
 assert.throws(()=>openingAssessment({sources:[{...p.sources[0],url:w.source_url,content_sha256:w.source_sha256,text:w.excerpt}]},weak),/specific customer|Visual|dated/);
});

test('generic and solution-presuming questions are held while specific process discovery remains eligible',()=>{
 const p=packet(),r=review(p),c=r.opening_candidates[0];
 for(const patch of [
  {opening:'Automate your emergency callback workflow.'},
  {owner_question:'How can we automate emergency callbacks to reduce customer wait times?'},
  {owner_question:'Would you like an AI assistant for emergency enquiries?'},
  {owner_question:'How do new enquiries reach your business today?',opening:'Hi, I saw your HVAC services. How do new enquiries reach your business today?'}
 ])assert.throws(()=>openingAssessment(p,{...r,opening_candidates:[{...c,...patch}]}),/process question|conversational|specific source/);
 for(const patch of [{source_url:'https://wrong.example.invalid/'},{source_sha256:hash('wrong')},{excerpt:'An invented callback quote that is not retained.'}])assert.throws(()=>openingAssessment(p,{...r,opening_candidates:[{...c,...patch}]}),/primary-source/);
 assert.equal(openingAssessment(p,r).selected_id,'urgent-routing');
});

test('supported website content and phone automation process questions remain eligible without visual or demand claims',()=>{
 for(const [service,quote,question] of [
  ['website','For roof replacement estimates, call us; our online form only accepts maintenance requests.','How do customers request roof replacement estimates today?'],
  ['ai','Our phone system offers automated callback requests when the office is busy.','How do you currently prioritize automated callback requests?'],
  ['systems','Our phone platform is broken; leave a voicemail for a callback.','How are voicemail requests handled while the phone platform is unavailable?']
 ]){const p=packet(),s=p.sources[0];s.text+=' '+quote;s.content_sha256=sourceContentHash(s);const r=review(p);r.opening_candidates=[{...r.opening_candidates[0],service,excerpt:quote,source_sha256:s.content_sha256,customer_difficulty:quote,hypothesis:'The published request route might support a focused improvement; confirm existing tools and usefulness.',owner_question:question,opening:`Hi, I saw your published request route. ${question}`}];assert.equal(openingAssessment(p,r).selected_id,'urgent-routing');
 const falseClaim={...r.opening_candidates[0],opening:'Your website form is broken. How do customers request estimates today?'};assert.throws(()=>openingAssessment(p,{...r,opening_candidates:[falseClaim]}),/visual inspection/);}
});
test('source-bound alternatives reject invented quotes, visual claims, dated-only websites and missing strongest choice',()=>{
 const p=packet(),r=review(p);assert.equal(openingAssessment(p,r).selected_id,'urgent-routing');
 for(const patch of [{source_sha256:hash('other source')},{excerpt:'This unsupported quote must fail.'},{customer_difficulty:'The mobile layout makes enquiries hard to find.'},{service:'website',customer_difficulty:'The website has an outdated design.'}])assert.throws(()=>openingAssessment(p,{...r,opening_candidates:[{...r.opening_candidates[0],...patch}]}),/source|Visual|dated-looking/);
 assert.throws(()=>openingAssessment(p,{...r,opening_candidates:[],selected_opening_id:null}),/selected strong opening/);
 assert.equal(openingAssessment(p,{...r,opening_candidates:[],selected_opening_id:null,pitch_supported:false}).selected_id,null);
});
test('published phone-process and contact-finding difficulties are not misclassified as visual claims',()=>{
 const p=packet(),quote='Customers on the phone tell us it is hard to find the person responsible for callback.';p.sources[0].text+=' '+quote;p.sources[0].content_sha256=sourceContentHash(p.sources[0]);const r=review(p);r.opening_candidates[0]={...r.opening_candidates[0],excerpt:quote,customer_difficulty:'Customers on the phone may find it hard to find the person responsible for the promised callback.',hypothesis:'Ask who owns the callback queue and whether the existing phone process works for urgent requests.',owner_question:'Who is responsible for a callback requested on the phone?',opening:'Could I ask who is responsible when a customer is on the phone about an emergency callback?'};assert.equal(openingAssessment(p,r).selected_id,'urgent-routing');
 const claim={...r.opening_candidates[0],customer_difficulty:'The website contact button is hard to find.'};assert.throws(()=>openingAssessment(p,{...r,opening_candidates:[claim]}),/visual inspection/);
});
test('signed operator chooses another supported opening through real HTTP without replacing verification evidence or releasing outreach',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'evz-opening-policy-'));t.after(()=>rm(directory,{recursive:true,force:true}));const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)}),p=packet();p.opening_assessment=openingAssessment(p,review(p));const data=verificationData(p,new Date(at),true);await app.apply({id:'opening-import',prospect_id:p.id,type:'verification_imported',at,data});
 const before=await app.snapshot(),original=structuredClone(before.prospects[p.id].verification),view=openingView(before.prospects[p.id]);assert.equal(view.selected.id,'urgent-routing');
 const server=await serveLifecycle(app,{port:0,quiet:true,operatorAuth:null});t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`,cookie=(await fetch(base)).headers.get('set-cookie').split(';')[0],csrf=(await(await fetch(base+'/api/bootstrap',{headers:{cookie}})).json()).csrf;
 const event={id:'operator-opening',prospect_id:p.id,type:'opening_selected',at,data:{assessment_sha256:view.assessment_sha256,candidate_id:'callback-status',reason:'Ask about the existing callback tracker before proposing another tool.'}};
 const response=await fetch(base+'/api/event',{method:'POST',headers:{cookie,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({revision:before.revision,event})});assert.equal(response.status,200);
 const after=await app.snapshot();assert.deepEqual(after.prospects[p.id].verification,original);assert.deepEqual(after.actions,before.actions);assert.equal(openingView(after.prospects[p.id]).selected.id,'callback-status');assert.equal(openingView(after.prospects[p.id]).selected_by,'owner');
 await assert.rejects(app.apply({...event,id:'stale',data:{...event.data,assessment_sha256:hash('old review')}},{actor:'friend'}),/current assessment/);await assert.rejects(app.apply({...event,id:'free-text',data:{...event.data,candidate_id:'invented'}},{actor:'friend'}),/current assessment/);
 const friend={...event,id:'friend-selection',data:{...event.data,candidate_id:'urgent-routing'}};await app.apply(friend,{actor:'friend'});assert.equal(openingView((await app.snapshot()).prospects[p.id]).selected_by,'friend');
 await app.apply({id:'opening-stop',prospect_id:p.id,type:'contact_stopped',at,data:{reason:'do_not_contact'}},{actor:'owner'});await assert.rejects(app.apply({...event,id:'stopped-selection'},{actor:'friend'}),/Restriction/);
});

test('selected opening and operator override survive call saving, follow-up preparation and later selection changes',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'evz-opening-followup-'));t.after(()=>rm(directory,{recursive:true,force:true}));const config=structuredClone(initialConfig);config.follow_up.enabled=true;const app=await StudioLifecycle.initialize({directory,config,now:()=>new Date(at)});
 const p=packet();p.opening_assessment=openingAssessment(p,review(p));await app.apply({id:'import-focused',prospect_id:p.id,type:'verification_imported',at,data:verificationData(p,new Date(at),true)});
 const before=await app.dashboard(),view=before.prospects[p.id].opening_view;
 await app.apply({id:'choose-callback',prospect_id:p.id,type:'opening_selected',at,data:{assessment_sha256:view.assessment_sha256,candidate_id:'callback-status',reason:'Start by learning which callback tracking tools the team already uses.'}},{actor:'friend'});
 const projected=(await app.dashboard()).prospects[p.id],preview=composeFollowUp(projected,{actor:'friend',outcome:'no_answer',focus:'ai'},app.config);
 assert.equal(preview.focus,'systems');assert.match(preview.body,/Which tools already track emergency callback status\?/);assert.match(preview.body,/Emergency enquiries require voicemail; callbacks are returned next business day\./);assert.doesNotMatch(preview.text,/AI assistant|I missed your call|lost revenue|customer wait times/);
 await app.apply({id:'save-unanswered',prospect_id:p.id,type:'call_logged',at,data:{call_id:'unanswered',performed_at:at,outcome:'no_answer',simulated:true,desk:true,focus:'ai',note:'Private note: upsell an AI assistant.',opening_context:{selected:{id:'injected'}}}},{actor:'friend'});
 let r=(await app.snapshot()).prospects[p.id];assert.equal(r.calls.unanswered.opening_context.selected.id,'callback-status');assert.equal(r.calls.unanswered.opening_context.selected_by,'friend');assert.deepEqual(r.follow_ups.unanswered.content,preview);
 const saved=structuredClone(r.follow_ups.unanswered);await app.apply({id:'choose-urgent-later',prospect_id:p.id,type:'opening_selected',at,data:{assessment_sha256:view.assessment_sha256,candidate_id:'urgent-routing',reason:'The next conversation should explore emergency prioritization.'}},{actor:'owner'});
 r=(await app.snapshot()).prospects[p.id];assert.deepEqual(r.follow_ups.unanswered,saved);assert.deepEqual(composeFollowUp(r,r.calls.unanswered,app.config),preview);
 const reopened=await StudioLifecycle.open({directory,now:()=>new Date(at)});assert.deepEqual((await reopened.snapshot()).prospects[p.id].follow_ups.unanswered,saved);
 const connected=composeFollowUp(projected,{outcome:'connected',focus:'website',customer_context:'You asked about the roofing quote page.'},app.config);assert.equal(connected.focus,'website');assert.match(connected.body,/roofing quote page/);assert.doesNotMatch(connected.body,/Which tools already track/);
 const held=composeFollowUp({...projected,opening_view:{status:'Held'}},{outcome:'no_answer',focus:'ai'},app.config);assert.equal(held.focus,'undecided');assert.equal(held.demo_url,null);
});
