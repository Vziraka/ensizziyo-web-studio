const parts=(at,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(p=>[p.type,p.value]));
export function cadenceDate(sentAt,zone,days,business=false){
 const p=parts(sentAt,zone),date=new Date(Date.UTC(+p.year,+p.month-1,+p.day,12));
 for(let left=days;left;){date.setUTCDate(date.getUTCDate()+1);if(!business||![0,6].includes(date.getUTCDay()))left--;}
 const target=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),+p.hour,+p.minute,+p.second);let result=target;
 for(let n=0;n<4;n++){const q=parts(result,zone),delta=target-Date.UTC(+q.year,+q.month-1,+q.day,+q.hour,+q.minute,+q.second);if(!delta)return new Date(result).toISOString();result+=delta;}
 throw Error('Recipient-local cadence time could not be resolved');
}
export function outreachCadence(state,now=new Date()){
 const intents=Object.values(state.outreach_delivery?.intents??{}),items=[];
 for(const first of intents.filter(i=>i.kind!=='follow-up'&&i.status==='Verified'&&i.receipt?.sent_at)){
  const r=state.prospects[first.project_id];if(!r)continue;
  const stop=r.reply||r.restriction||r.cold_paused||['Stopped','Hold','Closed'].includes(r.stage)||Object.values(r.calls??{}).some(c=>!['no_answer','voicemail'].includes(c.outcome));
  const callAt=cadenceDate(first.receipt.sent_at,first.timezone,3,true),followAt=cadenceDate(first.receipt.sent_at,first.timezone,7);
  const follow=intents.find(i=>i.project_id===r.id&&i.kind==='follow-up');
  const called=Object.values(r.calls??{}).some(c=>Date.parse(c.performed_at??c.at)>=Date.parse(callAt));
  items.push({project_id:r.id,name:r.name,owner:r.follow_up_owner,first_intent:first.id,sent_at:first.receipt.sent_at,timezone:first.timezone,call_due_at:callAt,call_due:!stop&&!called&&+now>=Date.parse(callAt),follow_up_due_at:followAt,follow_up_due:!stop&&!follow&&+now>=Date.parse(followAt),follow_up_available:!stop&&!follow,stopped:Boolean(stop),follow_up_status:follow?.status??'Requires exact approval'});
 }return items;
}

export function outreachDailySummary(state,now=new Date()){
 const date=at=>{const p=parts(at,'America/New_York');return `${p.year}-${p.month}-${p.day}`;},today=date(now);
 const intents=Object.values(state.outreach_delivery?.intents??{}),sent=intents.filter(i=>i.status==='Verified'&&i.receipt?.sent_at&&date(i.receipt.sent_at)===today);
 const newSent=new Set(sent.filter(i=>i.kind==='new-business').map(i=>i.company_id)).size;
 const scheduled=Object.values(state.outreach_review?.drafts??{}).filter(d=>d.schedule&&Date.parse(d.schedule.at)>+now&&!intents.some(i=>i.package_sha256===d.sha256));
 return {date:today,generated_at:now.toISOString(),sender_verified:sent.length,new_businesses:newSent,follow_ups:sent.filter(i=>i.kind==='follow-up').length,shortfall:Math.max(0,100-newSent),replies:Object.values(state.prospects).filter(r=>r.reply?.at&&date(r.reply.at)===today).length,calls:Object.values(state.prospects).flatMap(r=>Object.values(r.calls??{})).filter(c=>(c.performed_at??c.at)&&date(c.performed_at??c.at)===today).length,call_due:outreachCadence(state,now).filter(c=>c.call_due).length,still_scheduled:scheduled.length,uncertain:intents.filter(i=>i.status==='Uncertain').length,reserved:intents.filter(i=>i.status==='Reserved').length};
}
