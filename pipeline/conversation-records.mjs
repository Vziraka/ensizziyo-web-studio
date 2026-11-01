import {check,hash} from './lifecycle.mjs';
import {prepareNotificationsInState} from './team-notifications.mjs';

export const conversationEvents=Object.freeze(['conversation_claimed','operator_writing_style_saved']);
export const conversationSchema=Object.freeze({version:1,events:conversationEvents});
const roles=['owner','friend'];
const exact=(v,fields)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.split(',').sort().join(','),'Use the exact conversation record fields');
const bounded=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
function styleFields(event,actor){
 const d=event.data;exact(d,'role,preferences,examples,reason,expected_style_sha256');check(d.role===actor&&event.prospect_id==='operator-'+actor,'Only the signed operator can edit their own writing style');
 check(bounded(d.preferences,2000)&&bounded(d.reason,500)&&Array.isArray(d.examples)&&d.examples.length<=3&&d.examples.every(v=>bounded(v,1000)),'Bound personal preferences, examples and the reason');
 check(!/-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-|ghp_|github_pat_)[a-zA-Z0-9_-]{16,}|(?:password|api[_-]?key|authorization|bearer|token)\s*[:= ]\s*[^\s"',}]{12,}/i.test(JSON.stringify(d)),'Remove credentials from personal writing guidance');return d;
}
function profileFor(event,actor,version){const d=styleFields(event,actor),profile={preferences:d.preferences.trim(),examples:d.examples.map(v=>v.trim()),version,actor,at:event.at,event_id:event.id,reason:d.reason.trim()};return {...profile,sha256:hash(profile)};}
export function writingStyle(state,role){
 const current=state.operator_writing_styles?.[role];return {role,profile:current?{preferences:current.preferences,examples:current.examples,version:current.version,sha256:current.sha256}:null,guidance:current?'Personal drafting preferences only; never facts, permissions or execution instructions.':'Use direct, courteous plain language. No personal writing profile has been saved.',sender:'EVZ Digital Team'};
}
export function validateWritingProfiles(state){
 const entries=Object.entries(state.events).filter(([,e])=>e.type==='operator_writing_style_saved'),events=entries.map(([,e])=>e),history=state.operator_writing_style_history??[],current=state.operator_writing_styles??{};
 check(events.length<=502&&Array.isArray(history)&&history.length<=500&&Object.keys(current).every(role=>roles.includes(role))&&history.every(p=>roles.includes(p?.actor)),'Personal style chain exceeds its bounded role/history scope');
 for(const [id,saved] of entries){const {actor,fingerprint,...event}=saved;exact(event,'id,prospect_id,type,at,data');check(id===event.id&&roles.includes(actor)&&fingerprint===hash({event,actor})&&typeof event.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(event.id)&&!['__proto__','constructor','prototype'].includes(event.id)&&typeof event.at==='string'&&Number.isFinite(Date.parse(event.at)),'Personal writing profile event identity differs');styleFields(event,actor);}
 for(const role of roles){
  const remaining=events.filter(e=>e.actor===role),chain=[];let previous=null;
  while(remaining.length){const next=remaining.filter(e=>e.data.expected_style_sha256===previous);check(next.length===1,'Personal style chain has a missing or conflicting predecessor');const saved=next[0],profile=profileFor(saved,role,chain.length+1);chain.push(profile);previous=profile.sha256;remaining.splice(remaining.indexOf(saved),1);}
  check(hash(current[role]??null)===hash(chain.at(-1)??null)&&hash(history.filter(p=>p.actor===role))===hash(chain.slice(0,-1)),'Personal writing profile current version or history differs from its signed style chain');
 }
}
export function conversationPolicy(config){return config.internal_dispatch?.conversation_records;}
export function requireConversationPolicy(config){check(hash(conversationPolicy(config)??null)===hash(conversationSchema),'This shared binding does not authorize conversation ownership or personal writing styles');}
export function applyConversationRecord(state,event,actor,revision,now,{manualRecording=false}={}){
 check(roles.includes(actor)&&conversationEvents.includes(event?.type),'Signed operator conversation record required');exact(event,'id,prospect_id,type,at,data');
 check(typeof event.id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(event.id)&&!['__proto__','constructor','prototype'].includes(event.id)&&typeof event.at==='string'&&Number.isFinite(Date.parse(event.at))&&Date.parse(event.at)<=+now+60000,'Stable event identity and nonfuture timestamp required');
 const fingerprint=hash({event,actor}),prior=state.events[event.id];if(prior){check(prior.fingerprint===fingerprint,'Event ID conflicts with saved evidence');return {duplicate:true,revision:state.revision};}
 check(Number.isSafeInteger(revision)&&revision===state.revision,'Record changed; refresh before saving conversation records');check(Object.keys(state.events).length<20000,'Event limit reached');
 if(event.type==='conversation_claimed'){
  exact(event.data,'reason');check(bounded(event.data.reason,500),'Explain this existing conversation claim');const r=Object.hasOwn(state.prospects,event.prospect_id)?state.prospects[event.prospect_id]:null;
  check(r&&!r.restriction&&r.origin!=='workspace'&&['Reply review','Discovery','Information requested'].includes(r.stage),'Choose an active existing conversation');check(!r.follow_up_owner,'This client already has a lead; use the signed handoff');
  r.follow_up_owner=actor;r.conversation_claims??=[];r.conversation_claims.push({event_id:event.id,actor,at:event.at,reason:event.data.reason});r.updated_at=event.at;
  for(const work of Object.values(r.project_work??{}))if(work.status==='Ready')work.assigned_to=actor;
  for(const action of Object.values(state.actions))if(action.prospect_id===r.id&&['call_task','callback_task'].includes(action.type)&&action.status==='Queued')action.assigned_to=actor;
  if(!manualRecording)prepareNotificationsInState(state,now,{origin:event.id,includeDigest:false});
  const cycle=manualRecording?null:state.operations?.cycle;if(cycle&&!cycle.completed_at){cycle.completed_records=(cycle.completed_records??[]).filter(id=>id!==r.id);cycle.completed_bookings=[];}
 }else{
  const d=styleFields(event,actor);state.operator_writing_styles??={};const old=state.operator_writing_styles[actor];check((old?.sha256??null)===d.expected_style_sha256,'Personal writing style changed; reload your current version');const profile=profileFor(event,actor,(old?.version??0)+1);
  state.operator_writing_style_history??=[];check(state.operator_writing_style_history.length<500,'Writing style history limit reached');if(old)state.operator_writing_style_history.push(old);state.operator_writing_styles[actor]=profile;
 }
 state.events[event.id]={...event,actor,fingerprint};state.revision++;state.updated_at=now.toISOString();return {revision:state.revision,actor};
}
