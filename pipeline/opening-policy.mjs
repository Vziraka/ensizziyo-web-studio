import {check,hash} from './lifecycle.mjs';

const text=(v,max)=>typeof v==='string'&&v.trim().length>=12&&v.length<=max;
const string={type:'string'};
export const openingInstructions=`Choose one meaningful source-supported customer step or difficulty. Keep three things distinct: customer_difficulty is a factual observation (a published process is not proof of a problem); hypothesis is a tentative improvement to explore only if useful; owner_question asks how that specific process works today, including existing tools. Write a short conversational opening ending in one process-discovery question. Do not command a solution, ask how WE can automate, presume a desire to buy, claim delays/lost revenue from a manual process alone, or bundle services. A callback tomorrow supports asking how callbacks are handled, not asserting unmet demand or recommending automation. Example: "I saw pickup slots are confirmed by a callback the next business day. How do you currently track pickup requests?" Keep the question tied to a specific term in the quoted step, rather than a generic question about new enquiries. A launch/copyright date and working online booking/payment do not establish dated appearance or a customer difficulty: hold unless other strong evidence exists. Text captures cannot prove visual or functional usability defects. Reviewers must check these meanings against the exact source, challenge unsupported inferences even when the author/model says Accepted, and hold weak openings. A separate context using the same model is not independent semantic quality assurance.`;
const processQuestion=/^(?:how (?:do|does|are|is|many|often)|what (?:is|are|happens|does|do)|which|who|when|where|could I ask (?:how|what|which|who|when|where))\b/i;
const genericTerms=new Set('about after already before business businesses call calls company contact could customer customers does enquiries enquiry have into more online offer offers owner people service services site team that their them there these they this those today website what when where which with would your'.split(' '));
function specificQuestion(question,excerpt){
 const words=value=>(value.toLowerCase().match(/[a-z]{4,}/g)??[]).filter(w=>!genericTerms.has(w)).map(w=>w.replace(/s$/,'')),anchors=new Set(words(excerpt));
 return words(question).some(w=>anchors.has(w));
}
export const openingFields={
 opening_candidates:{type:'array',maxItems:3,items:{type:'object',additionalProperties:false,required:['id','service','customer_difficulty','source_url','source_sha256','excerpt','hypothesis','owner_question','opening'],properties:{id:string,service:{enum:['website','systems','ai','marketing']},customer_difficulty:string,source_url:string,source_sha256:string,excerpt:string,hypothesis:string,owner_question:string,opening:string}}},
 selected_opening_id:{anyOf:[string,{type:'null'}]},selection_reason:string
};
export function openingAssessment(packet,review){
 check(Array.isArray(review.opening_candidates)&&review.opening_candidates.length<=3&&typeof review.selection_reason==='string'&&review.selection_reason.length<=1200,'Opening selection needs bounded alternatives and an evidence-based reason');
 const ids=new Set();
 for(const c of review.opening_candidates){
  check(/^[a-zA-Z0-9_-]{1,60}$/.test(c.id??'')&&!ids.has(c.id)&&['website','systems','ai','marketing'].includes(c.service),'Opening alternatives need distinct IDs and one service');ids.add(c.id);
  const source=packet.sources.find(s=>s.url===c.source_url&&s.content_sha256===c.source_sha256);
  check(source&&['business','social'].includes(source.kind)&&source.capture_method!=='search_snippet'&&text(c.excerpt,600)&&source.text.includes(c.excerpt),'Opening needs an exact retained primary-source quote and hash');
  check(text(c.customer_difficulty,800)&&text(c.hypothesis,800)&&text(c.owner_question,400)&&text(c.opening,800),'State a specific customer difficulty, possible improvement and focused owner question');
  check(!/mobile (?:layout|usability|screen)|tap targets?|font size|horizontal scrolling|\b(?:layout|website|web page|contact button|menu button|form)\b.{0,45}(?:hard to (?:find|tap)|not responsive|unresponsive|broken|does not work)|looks? (?:dated|old)|dated appearance|appearing .?old|outdated (?:design|look)/i.test([c.customer_difficulty,c.hypothesis,c.owner_question,c.opening].join(' ')),'Visual or functional usability claims need a separate retained visual inspection; text-only discovery must hold them');
  if(c.service==='website')check(!/dated|old[- ]fashion|outdated|old[- ]looking/i.test(c.customer_difficulty),'A dated-looking website alone is not a customer difficulty');
  check(processQuestion.test(c.owner_question.trim())&&c.owner_question.trim().endsWith('?')&&(c.owner_question.match(/\?/g)??[]).length===1,'Ask one current-process question before proposing a solution');
  check(c.opening.trim().endsWith('?')&&(c.opening.match(/\?/g)??[]).length===1,'Use a conversational opening with one question, not a solution command');
  check(specificQuestion(c.owner_question,c.excerpt),'Tie the process question to a specific source step, not a generic business enquiry');
 }
 check(review.selected_opening_id===null||ids.has(review.selected_opening_id),'Select an exact supported opening alternative');
 if(review.pitch_supported)check(review.selected_opening_id!==null&&text(review.selection_reason,1200),'A pitch needs a selected strong opening and comparative evidence reason');
 return {schema_version:1,candidates:structuredClone(review.opening_candidates),selected_id:review.selected_opening_id,reason:review.selection_reason,source_review:'Source contract checked; semantic quality requires human review. Observation, possible improvement and owner need remain distinct'};
}
export function validateOpeningAssessment(packet){
 const a=packet.opening_assessment;check(a?.schema_version===1,'Current focused opening assessment required');
 openingAssessment(packet,{opening_candidates:a.candidates,selected_opening_id:a.selected_id,selection_reason:a.reason,pitch_supported:true});return a;
}
export function openingView(r){
 const a=r.verification?.packet?.opening_assessment;if(!a)return null;
 try{validateOpeningAssessment(r.verification.packet);}catch{return {status:'Held',reason:'Review the retained source and process question before pitching; this opening does not meet the current checks'};}
 const digest=hash(a),override=r.opening_selection?.assessment_sha256===digest?r.opening_selection:null,selected=a.candidates.find(c=>c.id===(override?.candidate_id??a.selected_id));
 return {status:'Source reviewed',assessment_sha256:digest,selected,reason:override?.reason??a.reason,selected_by:override?.actor??'Source review',candidates:a.candidates};
}
export function selectOpening(r,event,actor){
 check(['owner','friend'].includes(actor)&&!r.restriction,'A signed operator must select an opening for an unrestricted business');
 const view=openingView(r),d=event.data;check(view?.status==='Source reviewed'&&d.assessment_sha256===view.assessment_sha256&&view.candidates.some(c=>c.id===d.candidate_id)&&text(d.reason,1200),'Choose an exact supported opening and reason from the current assessment');
 r.opening_selection={candidate_id:d.candidate_id,assessment_sha256:d.assessment_sha256,reason:d.reason,actor,at:event.at};
}
