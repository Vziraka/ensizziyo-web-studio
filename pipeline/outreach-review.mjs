import {check,hash} from './lifecycle.mjs';

export const outreachReviewEvents=['outreach_draft_saved','outreach_batch_approved','outreach_batch_paused'];
const roles=['owner','friend'],safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const exact=(value,keys)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.split(',').sort().join(','),'Unexpected outreach review fields');
const parts=(date,timezone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
const day=(date,zone)=>{const p=parts(date,zone);return `${p.year}-${p.month}-${p.day}`;};
function localTime(date,hour,zone){
 const [y,m,d]=date.split('-').map(Number),target=Date.UTC(y,m-1,d,hour);let result=target;
 for(let i=0;i<4;i++){const p=parts(new Date(result),zone),actual=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second),delta=target-actual;if(!delta)return result;result+=delta;}
 throw Error('Recipient-local time could not be resolved');
}
export function recipientSlot(now,timezone,occupied,additional=false){
 check(Number.isFinite(+now),'Valid scheduling clock required');let date=day(now,timezone),start=localTime(date,9,timezone);
 // 100 evenly spaced first-email slots, including weekends. Missed slots are not backfilled.
 const spacing=additional?60000:288000,count=additional?480:100,offset=additional?30000:0;
 if(+now>start+offset+(count-1)*spacing){date=new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);start=localTime(date,9,timezone);}
 const used=new Set(occupied.filter(s=>s.timezone===timezone&&s.day===date).map(s=>s.at));
 for(let index=0;index<count;index++){const time=start+offset+index*spacing,at=new Date(time).toISOString();if(time>=+now&&!used.has(at))return {at,day:date,timezone};}
 throw Error('No remaining recipient-local slots; review a later day explicitly');
}
const evidence=r=>({id:r.id,company_id:r.company_id,name:r.name,stage:r.stage,contact:r.contact,qualification:r.qualification,call_prep:r.call_prep,owner:r.follow_up_owner,calls:r.calls,attempts:r.attempts,reply:r.reply??null,restriction:r.restriction??null,cold_paused:r.cold_paused});
function eligibility(r,d,actor){
 if(!r||r.origin==='workspace'||r.origin==='inquiry'||r.restriction||r.cold_paused||r.reply||['Stopped','Hold','Closed'].includes(r.stage))return 'Contact is paused, restricted or already in a conversation';
 if(!roles.includes(r.follow_up_owner)||actor&&r.follow_up_owner!==actor)return 'Assigned operator must review this message';
 if(!r.contact?.verified||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact.email??'')||r.qualification?.verdict!=='Research-qualified'||r.qualification.independent_review!=='Accepted'||!r.call_prep?.observations?.length)return 'Verified contact and retained reviewed research required';
 if(d&&d.source_sha256!==hash(evidence(r)))return 'Contact, ownership or research changed; review a new draft';
 if(d?.lane==='hold')return 'Held by operator';
 const calls=Object.values(r.calls??{});
 if(calls.some(c=>!['no_answer','voicemail'].includes(c.outcome)))return 'Recorded conversation needs individual handling';
 if(d?.lane==='call-first'&&!calls.length)return 'Call first; record the outcome before email approval';
 if((r.attempts??[]).some(a=>a.channel==='email'))return 'Prior email requires its separate follow-up review';
 return null;
}
function kind(r){return Object.keys(r.calls??{}).length||(r.attempts??[]).length?'previously-called':'new-business';}
function identity(r){return {company_id:r.company_id??r.id,email:r.contact.email.toLowerCase()};}
export function applyOutreachReview(app,state,event,actor,revision){
 check(!app.store&&app.config.mode==='controlled'&&roles.includes(actor),'Outreach review is an execution-disabled rehearsal');
 check(safeId(event.id)&&safeId(event.prospect_id)&&outreachReviewEvents.includes(event.type),'Stable outreach event identity required');
 const fingerprint=hash({event,actor}),prior=state.events[event.id];
 if(prior){check(prior.fingerprint===fingerprint,'Event ID conflicts with saved evidence');return {duplicate:true,revision:state.revision};}
 check(revision===state.revision,'Workspace changed; refresh before review');
 const now=app.now(),review=structuredClone(state.outreach_review??{paused:false,drafts:{}}),data=event.data;
 if(event.type==='outreach_draft_saved'){
  exact(data,'lane,timezone,subject,body');const r=state.prospects[event.prospect_id];
  check(r?.controlled===true&&r.contact?.email?.endsWith('@example.invalid'),'Fictional research contact required');
  check(!eligibility(r,null,actor),eligibility(r,null,actor));
  check(['call-first','email-first','hold'].includes(data.lane),'Choose call first, email first or hold');
  check(typeof data.timezone==='string'&&data.timezone.length<=80,'Recipient timezone required');parts(now,data.timezone);
  check(typeof data.subject==='string'&&data.subject.trim()&&data.subject.length<=200&&!/[\r\n\x00-\x1f]/.test(data.subject),'Safe exact subject required');
  check(typeof data.body==='string'&&data.body.trim()&&data.body.length<=8000&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(data.body),'Exact message body required');
  const packet={project_id:r.id,...identity(r),owner:actor,from:'hello@evzdigital.studio',to:r.contact.email,subject:data.subject,body:data.body,lane:data.lane,timezone:data.timezone,kind:kind(r),source_sha256:hash(evidence(r))};
  review.drafts[r.id]={...packet,sha256:hash(packet),saved_at:now.toISOString(),schedule:null};
 }else if(event.type==='outreach_batch_paused'){
  exact(data,'reason');check(event.prospect_id==='outreach-batches'&&typeof data.reason==='string'&&data.reason.trim()&&data.reason.length<=500,'Record why the batch was paused');review.paused=true;
  for(const d of Object.values(review.drafts))d.schedule=null;
 }else{
  exact(data,'items,facts_checked');check(event.prospect_id==='outreach-batches'&&data.facts_checked===true&&Array.isArray(data.items)&&data.items.length>0&&data.items.length<=100,'Review 1–100 exact selected messages and their evidence');
  check(new Set(data.items.map(i=>i.project_id)).size===data.items.length,'Select each business once');
  const occupied=Object.values(review.drafts).filter(d=>d.schedule&&day(now,d.timezone)<=d.schedule.day).map(d=>({...d.schedule,kind:d.kind,...identity(state.prospects[d.project_id])}));
  for(const item of data.items){
   exact(item,'project_id,sha256');check(safeId(item.project_id),'Stable business identity required');const r=state.prospects[item.project_id],d=review.drafts[item.project_id];
   check(d&&d.sha256===item.sha256&&!eligibility(r,d,actor),eligibility(r,d,actor)||'Exact draft changed');
   check(!d.schedule||day(now,d.timezone)>d.schedule.day,'Message already scheduled; do not duplicate approval');
   const who=identity(r);check(!occupied.some(o=>o.company_id===who.company_id||o.email===who.email),'Business or recipient already scheduled');
   const schedule=recipientSlot(now,d.timezone,occupied,d.kind!=='new-business');
   check(d.kind!=='new-business'||occupied.filter(o=>o.kind==='new-business'&&o.day===schedule.day).length<100,'Daily first-email target is full');
   d.schedule={...schedule,approval_event:event.id,approved_by:actor,approved_at:now.toISOString(),execution:'Held: provider and commercial release required'};
   occupied.push({...schedule,kind:d.kind,...who});
  }
  review.paused=false;
 }
 state.outreach_review=review;state.events[event.id]={...structuredClone(event),actor,fingerprint,recorded_at:now.toISOString()};state.revision++;state.updated_at=now.toISOString();return {revision:state.revision};
}
export function outreachReviewView(state,_unused,now=new Date()){
 const review=state.outreach_review??{paused:false,drafts:{}},today=day(now,'America/New_York');
 const items=Object.values(review.drafts).map(d=>{const reason=eligibility(state.prospects[d.project_id],d),missed=d.schedule&&day(now,d.timezone)>d.schedule.day;return {...d,name:state.prospects[d.project_id]?.name,eligible:!reason&&!missed&&!review.paused,approvable:!reason&&(!d.schedule||Boolean(missed)),status:reason||(missed?'Missed day; review again':review.paused?'Paused':d.schedule?'Approved; sending held':'Awaiting exact review')};});
 const scheduled=items.filter(d=>d.eligible&&d.kind==='new-business'&&d.schedule?.day===today).length;
 return {enabled:true,execution:'Review only; live sending is disabled',paused:review.paused,date:today,target:100,scheduled_new:scheduled,sent_new:0,shortfall:100,approval_shortfall:Math.max(0,100-scheduled),items};
}
