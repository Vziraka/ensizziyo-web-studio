import { dailyCallQueue } from './apollo-queue.mjs';
import { verificationLane, verificationFresh, callStages } from './verification-calls.mjs';
import { validateBookingSlot } from './lifecycle-documents.mjs';
import { businessDaysBetween } from './lifecycle.mjs';

export function callSupply(state, now = new Date()) {
  const candidates = Object.values(state.actions).filter(a => ['call_task','callback_task'].includes(a.type) && ['Queued','Verified'].includes(a.status)).map(a => {
    const r=state.prospects[a.prospect_id];
    const fresh=r && (verificationLane(r) ? verificationFresh(r,now.toISOString()) : r.qualification?.verdict==='Research-qualified' && r.qualification.independent_review==='Accepted' && Date.parse(r.qualification.checked_at)<=+now && +now-Date.parse(r.qualification.checked_at)<=30*86400000);
    const expired=r?.stage!=='Callback'&&r?.attempts.length&&(r.attempts.filter(x=>x.channel==='call').length>=2||businessDaysBetween(r.attempts[0].at,now)>=10);
    return {...a,company_id:r?.company_id,kind:a.payload.kind,due_at:a.payload.due_at,status:'scheduled',stopped:!fresh||a.cancel_requested||a.cancellation||expired||r.restriction||!callStages.includes(r.stage)||r.cold_paused&&r.stage!=='Callback'};
  });
  const queue=dailyCallQueue(candidates,now);
  queue.sort((a,b)=>(a.kind==='callback'?0:1)-(b.kind==='callback'?0:1) || (verificationLane(state.prospects[a.prospect_id])?1:0)-(verificationLane(state.prospects[b.prospect_id])?1:0) || Date.parse(a.due_at)-Date.parse(b.due_at));
  return {ready:queue.length,target:100,low:queue.length<50,full:queue.length>=100,queue};
}
export function sessionSummary(state, since) {
  const calls=Object.values(state.prospects).flatMap(r=>Object.values(r.calls).filter(c=>!c.undone&&Date.parse(c.performed_at)>=Date.parse(since)));
  return {attempts:calls.filter(c=>c.outcome!=='skipped').length,conversations:calls.filter(c=>['connected','callback','declined','do_not_contact'].includes(c.outcome)).length,
    interested:calls.filter(c=>c.outcome==='connected'&&['discovery','requested_info'].includes(c.intent)).length,
    bookings:Object.values(state.prospects).filter(r=>r.meeting&&Date.parse(r.meeting.verified_at??r.meeting.at??r.meeting.start)>=Date.parse(since)).length};
}
export function meetingSlots(now=new Date(),busy=[],days=10) {
  const config={duration_minutes:20,buffer_minutes:15,start_hour:9,end_hour:17,weekdays:[1,2,3,4,5]};
  const slots=[]; const start=Math.ceil((+now+60000)/900000)*900000;
  for(let t=start;t<+now+days*86400000;t+=900000){
    const slot={start:new Date(t).toISOString(),end:new Date(t+1200000).toISOString(),timezone:'America/New_York'};
    try{validateBookingSlot(slot,busy,config,now.toISOString(),now);slots.push(slot);}catch{}
  }
  return slots;
}
