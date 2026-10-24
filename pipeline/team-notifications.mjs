import {setTimeout as delay} from 'node:timers/promises';
import {businessDate,dailyNewProspectCount,hash} from './lifecycle.mjs';

const role=r=>r?.follow_up_owner==='friend'?'friend':'owner';
function sources(state,now){
 const items=[];
 for(const r of Object.values(state.prospects)){
  const add=(id,kind,summary)=>items.push({id,kind,role:role(r),project_id:r.id,summary});
  if(r.stage==='Reply review'&&r.reply?.kind==='reply')add(`reply:${r.id}:${r.reply.source_id}`,'reply',`${r.name}: a verified reply needs review. Read the original in the business mailbox; future cold follow-ups are paused.`);
  if(r.meeting?.current_status==='Needs review')add(`meeting:${r.id}:${hash(r.meeting)}`,'meeting',`${r.name}: the meeting record needs review in the connected calendar.`);
  if(r.information_draft?.status==='Uncertain'||r.information_draft?.status==='Sending'&&+now-Date.parse(r.information_draft.approved_at)>120_000)add(`information:${r.id}:${r.information_draft.id??hash(r.information_draft)}`,'problem',`${r.name}: an information email needs delivery reconciliation. Do not resend.`);
  for(const ticket of r.tickets??[])if(ticket.status==='Open'&&ticket.priority==='urgent')add(`support:${r.id}:${ticket.id}`,'problem',`${r.name}: an urgent support request needs review in the private desk.`);
 }
 for(const a of Object.values(state.actions))if(['Uncertain','Held'].includes(a.status))items.push({id:`action:${a.id}:${a.status}`,kind:'problem',role:role(state.prospects[a.prospect_id]),project_id:a.prospect_id,summary:'A provider action needs reconciliation in the private desk. Do not repeat an uncertain operation.'});
 for(const e of state.exceptions??[]){const project=state.prospects[e.prospect_id??e.id];items.push({id:`exception:${e.id}:${hash(e.reason??'')}`,kind:'problem',role:role(project),project_id:project?.id??null,summary:'A saved exception requires an operator decision. Open Needs attention in the private desk.'});}
 for(const [id,reason] of Object.entries(state.operations?.holds??{}))items.push({id:`hold:${id}:${hash(reason)}`,kind:'problem',role:'owner',summary:'A connected operation is held. Review its retained evidence in the private desk.'});
 if(state.runtime?.last_error)items.push({id:`runtime:${hash(state.runtime.last_error)}`,kind:'problem',role:'owner',summary:'The local operations service reports a problem. Review its private status and retained logs.'});
 return items;
}
export function digestTime(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value])),day=businessDate(now);
 if(['Sat','Sun'].includes(parts.weekday)||Number(parts.hour)<9)return null;
 const guess=new Date(`${day}T09:00:00Z`),localHour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(guess));guess.setUTCHours(18-localHour);
 return {day,due_at:guess.toISOString(),late_minutes:Math.max(0,Math.floor((+now-guess)/60_000))};
}
function digest(state,now,items){
 const due=Object.values(state.actions).filter(a=>['call_task','callback_task'].includes(a.type)&&['Queued','Verified'].includes(a.status)&&!a.cancel_requested&&Date.parse(a.payload?.due_at)<=+now&&state.prospects[a.prospect_id]&&!state.prospects[a.prospect_id].restriction);
 const interested=Object.values(state.prospects).filter(r=>!r.restriction&&['Discovery','Information requested','Preview','Proposal','Agreement'].includes(r.stage));
 return `EVZ Digital internal team summary · ${businessDate(now)} · 9am America/New_York\nNew businesses prepared today: ${dailyNewProspectCount(state,now)} /25 shared target.\nDue callbacks: ${due.filter(a=>a.type==='callback_task').length}. Other due call tasks: ${due.filter(a=>a.type==='call_task').length}.\nInterested projects: ${interested.length}. Verified replies awaiting review: ${items.filter(i=>i.kind==='reply').length}. Attention items: ${items.length}.\nOpen the private desk for source evidence and assigned next steps. No prospect email or private call notes are included in this summary.`;
}
// Preparation has no external effects. A missing channel never masquerades as delivery.
export function prepareNotificationsInState(state,now,{origin=now.toISOString(),includeDigest=true}={}){
 const items=sources(state,now),time=includeDigest?digestTime(now):null;
 if(!state.team_notifications&&!items.length&&!time)return false;
 const before=JSON.stringify(state.team_notifications??null),n=state.team_notifications??={messages:{},active:{}},active={};let full=false;
 const add=message=>{if(n.messages[message.id])return n.messages[message.id];if(Object.keys(n.messages).length>=500){full=true;return null;}return n.messages[message.id]={...message,status:'Prepared; delivery held',prepared_at:now.toISOString(),delivery_hold:'Notification recipients and external transport are not verified or enabled'};};
 for(const item of items){const fingerprint=hash(item),id=n.active[fingerprint]??`attention-${hash({fingerprint,origin,revision:state.revision}).slice(0,40)}`;
  if(add({id,kind:'attention',recipient_role:item.role,source_sha256:fingerprint,source_id:item.id,project_id:item.project_id??null,subject:`EVZ operations: ${item.kind} needs review`,body:item.summary,due_at:now.toISOString()}))active[fingerprint]=id;
 }
 for(const [fingerprint,id] of Object.entries(n.active))if(!active[fingerprint]&&n.messages[id]?.status==='Prepared; delivery held'){n.messages[id].status='Resolved or reassigned before delivery';n.messages[id].resolved_at=now.toISOString();}
 n.active=active;
 if(time)for(const recipient_role of ['owner','friend'])add({id:`digest-${time.day}-${recipient_role}`,kind:'digest',recipient_role,source_sha256:hash({day:time.day,body:digest(state,now,items)}),subject:`EVZ team summary · ${time.day}`,body:digest(state,now,items),due_at:time.due_at,late_minutes:time.late_minutes});
 if(full)n.hold='The bounded notification preparation history is full. Review retention before preparing more.';else delete n.hold;
 return JSON.stringify(n)!==before;
}
export async function prepareTeamNotifications(app){return app.change(state=>{const changed=prepareNotificationsInState(state,app.now());if(changed){state.revision++;state.updated_at=app.now().toISOString();}return notificationView(state);});}
export function notificationView(state){const n=state.team_notifications;return {delivery_enabled:false,channel_status:'External delivery not configured or verified',hold:n?.hold??null,messages:Object.values(n?.messages??{}).slice(-40).reverse(),pending:Object.values(n?.messages??{}).filter(m=>m.status==='Prepared; delivery held').length};}
export async function runNotificationPreparation(app,{signal}={}){
 while(!signal?.aborted){try{await prepareTeamNotifications(app);}catch{if(signal?.aborted)break;console.error('Notification preparation unavailable; no delivery was attempted');}try{await delay(60_000,undefined,{signal});}catch{break;}}
}
