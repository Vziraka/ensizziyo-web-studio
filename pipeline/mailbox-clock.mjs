import {check,hash} from './lifecycle.mjs';
import {validateMailboxPolicy} from './mailbox-intake.mjs';

export const mailboxClockCapability='shared-mailbox-clock-v1';
export const isMailboxClockCapability=value=>[mailboxClockCapability,'shared-mailbox-delivery-v1','shared-operations-desk-v1'].includes(value);
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200&&!/[\x00-\x1f\x7f]/.test(v);
const exact=(v,fields)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.split(',').sort().join(','),'Closed mailbox clock fields required');
const operator=actor=>check(['owner','friend'].includes(actor),'Signed operator required');
export function validateMailboxClockPolicy(p){
 exact(p,'schema_version,site_id,deploy_id,origin,recovery_generation,interval_minutes,max_steps_per_tick,max_steps_per_day,deadline_ms,expires_at');
 check(p.schema_version===1&&[p.site_id,p.deploy_id,p.recovery_generation].every(key)&&utc(p.expires_at),'Exact mailbox clock deployment and recovery required');
 const origin=new URL(p.origin);check(origin.protocol==='https:'&&origin.origin===p.origin,'Exact clock HTTPS origin required');
 check([5,15,30,60].includes(p.interval_minutes)&&integer(p.max_steps_per_tick,3)&&p.max_steps_per_tick>0&&integer(p.max_steps_per_day,1000)&&p.max_steps_per_day>=p.max_steps_per_tick&&integer(p.deadline_ms,25000)&&p.deadline_ms>0,'Finite mailbox clock bounds required');return p;
}
function policy(config,now,live=true){
 check(isMailboxClockCapability(config.shared_capability)&&config.mode==='production'&&config.outreach_enabled===false,'Exact review-only mailbox clock capability required');
 validateMailboxPolicy(config.mailbox);const p=validateMailboxClockPolicy(config.mailbox_clock);
 check(utc(now)&&(!live||Date.parse(now)<Date.parse(p.expires_at)),'Mailbox clock policy expired');return p;
}
export function mailboxClockTickId(scheduledAt){check(utc(scheduledAt),'Canonical clock slot required');return 'mailbox-clock-'+Date.parse(scheduledAt);}
function allowanceShape(a){
 exact(a,'id,evidence_ref,observed_at,expires_at,included_only,max_steps');
 check(key(a.id)&&text(a.evidence_ref)&&utc(a.observed_at)&&utc(a.expires_at)&&Date.parse(a.expires_at)>Date.parse(a.observed_at)&&a.included_only===true&&integer(a.max_steps,10000)&&a.max_steps>0,'Finite reviewed included-only allowance required');
}
function fresh(p,config,now){return {schema_version:1,policy_sha256:hash(p),mailbox_policy_sha256:hash(config.mailbox),recovery_generation:p.recovery_generation,paused:true,pause:null,allowance_id:null,allowances:{},days:{},last_slot:null,fence:0,tick:null,updated_at:now};}
function bound(clock,p,config){check(clock.policy_sha256===hash(p)&&clock.mailbox_policy_sha256===hash(config.mailbox)&&clock.recovery_generation===p.recovery_generation,'Mailbox clock restored or policy changed');}
export function validateMailboxClockState(state,config){
 const p=validateMailboxClockPolicy(config.mailbox_clock),c=state.mailbox_clock;if(c===undefined)return;
 exact(c,'schema_version,policy_sha256,mailbox_policy_sha256,recovery_generation,paused,pause,allowance_id,allowances,days,last_slot,fence,tick,updated_at');
 check(c.schema_version===1&&digest(c.policy_sha256)&&digest(c.mailbox_policy_sha256)&&key(c.recovery_generation)&&typeof c.paused==='boolean'&&utc(c.updated_at)&&integer(c.fence,Number.MAX_SAFE_INTEGER),'Invalid retained clock identity');
 if(c.pause!==null){exact(c.pause,'by,at,reason');operator(c.pause.by);check(utc(c.pause.at)&&Date.parse(c.pause.at)<=Date.parse(c.updated_at)&&text(c.pause.reason),'Invalid clock pause');}
 check(c.allowances&&typeof c.allowances==='object'&&!Array.isArray(c.allowances)&&Object.keys(c.allowances).length<=100,'Bounded clock allowances required');
 let used=0;for(const [id,a]of Object.entries(c.allowances)){
  exact(a,'id,evidence_ref,observed_at,expires_at,included_only,max_steps,used_steps,recorded_by,recorded_at');
  const {used_steps,recorded_by,recorded_at,...input}=a;allowanceShape(input);operator(recorded_by);
  check(id===a.id&&integer(used_steps,a.max_steps)&&utc(recorded_at)&&Date.parse(a.observed_at)<=Date.parse(recorded_at)&&Date.parse(recorded_at)<Date.parse(a.expires_at)&&Date.parse(recorded_at)<=Date.parse(c.updated_at),'Invalid retained allowance');used+=used_steps;
  if(c.policy_sha256===hash(p))check(Date.parse(a.expires_at)<=Date.parse(p.expires_at),'Allowance exceeds clock policy');
 }
 check(c.allowance_id===null||key(c.allowance_id)&&Object.hasOwn(c.allowances,c.allowance_id),'Current clock allowance missing');
 check(c.days&&typeof c.days==='object'&&!Array.isArray(c.days)&&Object.keys(c.days).length<=400,'Bounded clock days required');
 let reserved=0,ticks=0;for(const [day,d]of Object.entries(c.days)){
  exact(d,'reserved_steps,ticks');check(/^\d{4}-\d\d-\d\d$/.test(day)&&utc(day+'T00:00:00.000Z')&&day<=c.updated_at.slice(0,10)&&integer(d.reserved_steps,1000)&&integer(d.ticks,288),'Invalid clock daily counters');reserved+=d.reserved_steps;ticks+=d.ticks;
  if(c.policy_sha256===hash(p))check(d.reserved_steps<=p.max_steps_per_day,'Clock daily budget exceeded');
 }
 check(reserved===used&&ticks===c.fence,'Clock accounting differs');
 if(c.tick===null){check(c.last_slot===null&&c.fence===0&&reserved===0,'Missing retained clock tick');return;}
 const t=c.tick;exact(t,'id,scheduled_at,claimed_at,deadline_at,fence,status,steps_reserved,steps_settled,pending_step,allowance_id,settlements');
 check(utc(t.scheduled_at)&&t.id===mailboxClockTickId(t.scheduled_at)&&c.last_slot===t.scheduled_at&&utc(t.claimed_at)&&utc(t.deadline_at)&&Date.parse(t.scheduled_at)<=Date.parse(t.claimed_at)&&Date.parse(t.claimed_at)<Date.parse(t.deadline_at)&&Date.parse(t.deadline_at)-Date.parse(t.claimed_at)<=25000&&Date.parse(t.claimed_at)<=Date.parse(c.updated_at)&&t.fence===c.fence&&t.fence>0&&['Running','Completed','Held'].includes(t.status),'Invalid retained clock lease');
 check(key(t.allowance_id)&&Object.hasOwn(c.allowances,t.allowance_id)&&integer(t.steps_reserved,3)&&integer(t.steps_settled,t.steps_reserved)&&t.steps_reserved-t.steps_settled<=1&&t.pending_step===(t.steps_reserved>t.steps_settled?t.steps_reserved:null),'Invalid retained step accounting');
 check(t.status!=='Completed'||t.pending_step===null,'Completed tick has an unresolved read');
 check(t.settlements&&typeof t.settlements==='object'&&!Array.isArray(t.settlements)&&Object.keys(t.settlements).length===t.steps_settled,'Invalid step receipts');
 for(let step=1;step<=t.steps_settled;step++){
  const r=t.settlements[step];exact(r,'outcome,at');check(['Continue','Caught up','Held'].includes(r.outcome)&&utc(r.at)&&Date.parse(r.at)>=Date.parse(step===1?t.claimed_at:t.settlements[step-1].at)&&Date.parse(r.at)<Date.parse(t.deadline_at)&&Date.parse(r.at)<=Date.parse(c.updated_at),'Invalid step receipt');
  check(r.outcome==='Continue'||step===t.steps_reserved&&t.status===(r.outcome==='Held'?'Held':'Completed'),'Tick continued after terminal receipt');
 }
 const grant=c.allowances[t.allowance_id];check(Date.parse(t.claimed_at)>=Date.parse(grant.recorded_at)&&Date.parse(t.deadline_at)<=Date.parse(grant.expires_at),'Tick exceeds reviewed allowance');
 check(t.status!=='Running'||!c.paused&&t.allowance_id===c.allowance_id,'Running tick lost its authority');
 check((c.days[t.claimed_at.slice(0,10)]?.reserved_steps??-1)>=t.steps_reserved&&c.allowances[t.allowance_id].used_steps>=t.steps_reserved,'Missing charged step budget');
 if(c.policy_sha256===hash(p))check(t.steps_reserved<=p.max_steps_per_tick&&Date.parse(t.deadline_at)-Date.parse(t.claimed_at)<=p.deadline_ms&&Date.parse(t.deadline_at)<=Date.parse(p.expires_at)&&Date.parse(t.deadline_at)<=Date.parse(t.scheduled_at)+p.interval_minutes*60000&&Date.parse(t.scheduled_at)%(p.interval_minutes*60000)===0,'Retained tick exceeds clock policy');
}
function allowance(c,now){const a=c.allowances[c.allowance_id];check(a&&Date.parse(a.observed_at)<=Date.parse(now)&&Date.parse(a.expires_at)>Date.parse(now),'Current reviewed allowance evidence required');return a;}
function liveTick(state,config,input,now){
 const p=policy(config,now);validateMailboxClockState(state,config);const c=state.mailbox_clock;check(c,'Mailbox clock is not configured');bound(c,p,config);
 check(!c.paused&&Date.parse(now)>=Date.parse(c.updated_at),'Mailbox clock paused or time moved backwards');const a=allowance(c,now),t=c.tick;
 check(t&&t.id===input.tick_id&&t.fence===input.fence&&t.status==='Running'&&t.allowance_id===a.id&&Date.parse(now)>=Date.parse(t.claimed_at)&&Date.parse(now)<Date.parse(t.deadline_at),'Mailbox tick expired, changed or closed');return {p,c,t,a};
}
export function assertMailboxClockStep(state,config,input,now){
 exact(input,'tick_id,fence,step');const {t}=liveTick(state,config,input,now);
 check(integer(input.step,3)&&input.step>0&&t.pending_step===input.step,'Exact pending mailbox step required');return {tick_id:t.id,fence:t.fence,step:input.step,deadline_at:t.deadline_at};
}
export function mailboxClockStatus(state,config,now){
 const p=policy(config,now,false);validateMailboxClockState(state,config);const c=state.mailbox_clock;
 let status='Allowance required';if(c){
  const a=c.allowances[c.allowance_id];
  status=c.policy_sha256!==hash(p)||c.mailbox_policy_sha256!==hash(config.mailbox)||c.recovery_generation!==p.recovery_generation?'Policy changed':Date.parse(now)<Date.parse(c.updated_at)?'Clock moved backwards':Date.parse(now)>=Date.parse(p.expires_at)?'Expired':c.paused?'Paused':!a||Date.parse(a.observed_at)>Date.parse(now)||Date.parse(a.expires_at)<=Date.parse(now)?'Allowance required':a.used_steps>=a.max_steps?'Allowance exhausted':(c.days[now.slice(0,10)]?.reserved_steps??0)>=p.max_steps_per_day?'Daily limit':c.tick?.status==='Running'?(Date.parse(now)<Date.parse(c.tick.deadline_at)?'Running':'Tick expired'):'Ready';
 }else if(Date.parse(now)>=Date.parse(p.expires_at))status='Expired';
 return {status,allowance_basis:'Finite reviewed steps only; actual provider usage and reserve are unverified',paused:c?.paused??true,allowance:c?.allowance_id?structuredClone(c.allowances[c.allowance_id]):null,tick:c?.tick?structuredClone(c.tick):null,day:structuredClone(c?.days[now.slice(0,10)]??{reserved_steps:0,ticks:0})};
}
export function applyMailboxClockTransition(state,config,tr){
 exact(tr,'type,actor,at,input');const {type,actor,at,input}=tr,p=policy(config,at,!['pause'].includes(type));
 validateMailboxClockState(state,config);const c=structuredClone(state.mailbox_clock??fresh(p,config,at));bound(c,p,config);
 check(Date.parse(at)>=Date.parse(c.updated_at),'Mailbox clock time moved backwards');
 let duplicate=false;
 if(type==='allowance'){
  operator(actor);exact(input,'revision,allowance');check(input.revision===state.revision,'Current mailbox clock revision required');allowanceShape(input.allowance);const a=input.allowance;
  check(Date.parse(a.observed_at)<=Date.parse(at)&&Date.parse(at)<Date.parse(a.expires_at)&&Date.parse(a.expires_at)<=Date.parse(p.expires_at),'Allowance observation is future, expired or exceeds policy');
  if(Object.hasOwn(c.allowances,a.id)){const {used_steps,recorded_by,recorded_at,...saved}=c.allowances[a.id];check(c.allowance_id===a.id&&hash(saved)===hash(a)&&recorded_by===actor,'Allowance identity already used');duplicate=true;}
  else{check(Object.keys(c.allowances).length<100,'Retain bounded allowance history');c.allowances[a.id]={...structuredClone(a),used_steps:0,recorded_by:actor,recorded_at:at};c.allowance_id=a.id;if(c.tick?.status==='Running')c.tick.status='Held';}
 }else if(type==='pause'){
  operator(actor);exact(input,'revision,paused,reason');check(input.revision===state.revision&&typeof input.paused==='boolean'&&text(input.reason),'Current signed pause decision required');
  c.paused=input.paused;c.pause={by:actor,at,reason:input.reason};if(input.paused&&c.tick?.status==='Running')c.tick.status='Held';
 }else{
  check(actor==='clock','Trusted mailbox clock required');
  if(type==='claim'){
   exact(input,'tick_id,scheduled_at,revision');check(input.revision===state.revision,'Current mailbox clock revision required');
   check(utc(input.scheduled_at)&&input.tick_id===mailboxClockTickId(input.scheduled_at),'Canonical mailbox tick identity required');
   const slot=Math.floor(Date.parse(at)/(p.interval_minutes*60000))*p.interval_minutes*60000;
   check(Date.parse(input.scheduled_at)===slot,'Mailbox tick is not the current scheduled slot');
   if(c.tick?.id===input.tick_id)duplicate=true;
   else{
    check(!c.paused&&(!c.last_slot||Date.parse(input.scheduled_at)>Date.parse(c.last_slot)),'Mailbox clock paused or tick replayed');const a=allowance(c,at);
    check(a.used_steps<a.max_steps&&(c.days[at.slice(0,10)]?.reserved_steps??0)<p.max_steps_per_day,'Mailbox step budget exhausted');
    check(!c.tick||c.tick.status!=='Running'||Date.parse(c.tick.deadline_at)<=Date.parse(at),'Another mailbox tick is active');
    const day=at.slice(0,10);check(Object.hasOwn(c.days,day)||Object.keys(c.days).length<400,'Retain bounded clock accounting');c.days[day]??={reserved_steps:0,ticks:0};c.days[day].ticks++;c.fence++;
    const deadline=Math.min(Date.parse(at)+p.deadline_ms,Date.parse(p.expires_at),Date.parse(a.expires_at),slot+p.interval_minutes*60000);check(deadline>Date.parse(at),'Mailbox deadline exhausted');
    c.last_slot=input.scheduled_at;c.tick={id:input.tick_id,scheduled_at:input.scheduled_at,claimed_at:at,deadline_at:new Date(deadline).toISOString(),fence:c.fence,status:'Running',steps_reserved:0,steps_settled:0,pending_step:null,allowance_id:a.id,settlements:{}};
   }
  }else{
   const working={...state,mailbox_clock:c},{t,a}=liveTick(working,config,input,at);
   if(type==='step'){
    exact(input,'tick_id,fence,step');check(t.pending_step===null&&input.step===t.steps_reserved+1&&input.step<=p.max_steps_per_tick,'Previous step unresolved or tick step limit reached');
    const day=c.days[t.claimed_at.slice(0,10)];check(day.reserved_steps<p.max_steps_per_day&&a.used_steps<a.max_steps,'Mailbox step budget exhausted');
    day.reserved_steps++;a.used_steps++;t.steps_reserved++;t.pending_step=input.step;
   }else if(type==='settle'){
    exact(input,'tick_id,fence,step,outcome');check(['Continue','Caught up','Held'].includes(input.outcome),'Closed mailbox step outcome required');
    assertMailboxClockStep(working,config,{tick_id:input.tick_id,fence:input.fence,step:input.step},at);
    t.settlements[input.step]={outcome:input.outcome,at};t.steps_settled++;t.pending_step=null;
    if(input.outcome!=='Continue')t.status=input.outcome==='Held'?'Held':'Completed';
   }else if(type==='finish'){
    exact(input,'tick_id,fence,outcome');check(t.pending_step===null&&['Completed','Held'].includes(input.outcome),'Reconcile pending mailbox read before finishing');t.status=input.outcome;
   }else check(false,'Unsupported mailbox clock transition');
  }
 }
 if(!duplicate){c.updated_at=at;validateMailboxClockState({...state,mailbox_clock:c},config);state.mailbox_clock=c;state.revision++;state.updated_at=at;}
 return {duplicate,...mailboxClockStatus(state,config,at)};
}
