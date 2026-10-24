import {check,hash} from './lifecycle.mjs';

const text=(v,max)=>typeof v==='string'&&v.trim().length>=12&&v.length<=max;
const string={type:'string'};
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
  check(!/mobile (?:layout|usability|site|screen)|on (?:a )?phone|hard to (?:find|tap)|responsive|looks? (?:dated|old)|outdated (?:design|look)/i.test([c.customer_difficulty,c.hypothesis,c.opening].join(' ')),'Visual or mobile usability claims need a separate retained visual inspection; text-only discovery must hold them');
  if(c.service==='website')check(!/dated|old[- ]fashion|outdated|old[- ]looking/i.test(c.customer_difficulty),'A dated-looking website alone is not a customer difficulty');
 }
 check(review.selected_opening_id===null||ids.has(review.selected_opening_id),'Select an exact supported opening alternative');
 if(review.pitch_supported)check(review.selected_opening_id!==null&&text(review.selection_reason,1200),'A pitch needs a selected strong opening and comparative evidence reason');
 return {schema_version:1,candidates:structuredClone(review.opening_candidates),selected_id:review.selected_opening_id,reason:review.selection_reason,source_review:'Source-reviewed selection; possible benefit remains a hypothesis, not an owner-confirmed need'};
}
export function validateOpeningAssessment(packet){
 const a=packet.opening_assessment;check(a?.schema_version===1,'Current focused opening assessment required');
 openingAssessment(packet,{opening_candidates:a.candidates,selected_opening_id:a.selected_id,selection_reason:a.reason,pitch_supported:true});return a;
}
export function openingView(r){
 const a=r.verification?.packet?.opening_assessment;if(!a)return null;
 try{validateOpeningAssessment(r.verification.packet);}catch{return {status:'Held',reason:'Opening evidence changed; review its retained source before pitching'};}
 const digest=hash(a),override=r.opening_selection?.assessment_sha256===digest?r.opening_selection:null,selected=a.candidates.find(c=>c.id===(override?.candidate_id??a.selected_id));
 return {status:'Source reviewed',assessment_sha256:digest,selected,reason:override?.reason??a.reason,selected_by:override?.actor??'Source review',candidates:a.candidates};
}
export function selectOpening(r,event,actor){
 check(['owner','friend'].includes(actor)&&!r.restriction,'A signed operator must select an opening for an unrestricted business');
 const view=openingView(r),d=event.data;check(view?.status==='Source reviewed'&&d.assessment_sha256===view.assessment_sha256&&view.candidates.some(c=>c.id===d.candidate_id)&&text(d.reason,1200),'Choose an exact supported opening and reason from the current assessment');
 r.opening_selection={candidate_id:d.candidate_id,assessment_sha256:d.assessment_sha256,reason:d.reason,actor,at:event.at};
}
