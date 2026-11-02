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
 check([1,2].includes(p.schema_version)&&[p.site_id,p.deploy_id,p.recovery_generation].every(key)&&utc(p.expires_at),'Exact mailbox clock deployment and recovery required');
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
function fresh(p,config,now){return {schema_version:p.schema_version,...(p.schema_version===2?{policy_history:[],retired_ticks:{},recovery_required:false}:{}),policy_sha256:hash(p),mailbox_policy_sha256:hash(config.mailbox),recovery_generation:p.recovery_generation,paused:true,pause:null,allowance_id:null,allowances:{},days:{},last_slot:null,fence:0,tick:null,updated_at:now};}
function bound(clock,p,config){check((p.schema_version!==2||clock.schema_version===2&&!clock.recovery_required)&&clock.policy_sha256===hash(p)&&clock.mailbox_policy_sha256===hash(config.mailbox)&&clock.recovery_generation===p.recovery_generation,'Mailbox clock restored or policy changed');}
const priorIdentity=c=>({schema_version:c.schema_version,policy_sha256:c.policy_sha256,mailbox_policy_sha256:c.mailbox_policy_sha256,recovery_generation:c.recovery_generation,recovery_required:c.recovery_required??false});
const currentIdentity=config=>({config_sha256:hash(config),policy_sha256:hash(config.mailbox_clock),mailbox_policy_sha256:hash(config.mailbox),recovery_generation:config.mailbox_clock.recovery_generation});
function identity(v){exact(v,'schema_version,policy_sha256,mailbox_policy_sha256,recovery_generation,recovery_required');check([1,2].includes(v.schema_version)&&digest(v.policy_sha256)&&digest(v.mailbox_policy_sha256)&&key(v.recovery_generation)&&typeof v.recovery_required==='boolean'&&(v.schema_version===2||!v.recovery_required),'Invalid historical clock identity');}
function sameIdentity(a,b){return ['policy_sha256','mailbox_policy_sha256','recovery_generation'].every(k=>a[k]===b[k]);}
function tickShape(t,c,p,current){
 exact(t,'id,scheduled_at,claimed_at,deadline_at,fence,status,steps_reserved,steps_settled,pending_step,allowance_id,settlements');
 check(utc(t.scheduled_at)&&t.id===mailboxClockTickId(t.scheduled_at)&&utc(t.claimed_at)&&utc(t.deadline_at)&&t.scheduled_at<=t.claimed_at&&t.claimed_at<t.deadline_at&&Date.parse(t.deadline_at)-Date.parse(t.claimed_at)<=25000&&t.claimed_at<=c.updated_at&&integer(t.fence,c.fence)&&t.fence>0&&['Running','Completed','Held'].includes(t.status),'Invalid retained clock lease');
 check(key(t.allowance_id)&&Object.hasOwn(c.allowances,t.allowance_id)&&integer(t.steps_reserved,3)&&integer(t.steps_settled,t.steps_reserved)&&t.steps_reserved-t.steps_settled<=1&&t.pending_step===(t.steps_reserved>t.steps_settled?t.steps_reserved:null),'Invalid retained step accounting');
 check(t.status!=='Completed'||t.pending_step===null,'Completed tick has an unresolved read');
 check(t.settlements&&typeof t.settlements==='object'&&!Array.isArray(t.settlements)&&Object.keys(t.settlements).length===t.steps_settled,'Invalid step receipts');
 for(let step=1;step<=t.steps_settled;step++){const r=t.settlements[step];exact(r,'outcome,at');check(['Continue','Caught up','Held'].includes(r.outcome)&&utc(r.at)&&r.at>=(step===1?t.claimed_at:t.settlements[step-1].at)&&r.at<t.deadline_at&&r.at<=c.updated_at,'Invalid step receipt');check(r.outcome==='Continue'||step===t.steps_reserved&&t.status===(r.outcome==='Held'?'Held':'Completed'),'Tick continued after terminal receipt');}
 const grant=c.allowances[t.allowance_id];check(t.claimed_at>=grant.recorded_at&&t.deadline_at<=grant.expires_at,'Tick exceeds reviewed allowance');
 if(current){check(t.fence===c.fence&&c.last_slot===t.scheduled_at,'Current clock slot or fence differs');check(t.status!=='Running'||c.recovery_required===true||!c.paused&&t.allowance_id===c.allowance_id,'Running tick lost its authority');}
 check((c.days[t.claimed_at.slice(0,10)]?.reserved_steps??-1)>=t.steps_reserved&&grant.used_steps>=t.steps_reserved,'Missing charged step budget');
 if(current&&c.policy_sha256===hash(p)&&!c.recovery_required&&(p.schema_version===1||c.schema_version===2))check(t.steps_reserved<=p.max_steps_per_tick&&Date.parse(t.deadline_at)-Date.parse(t.claimed_at)<=p.deadline_ms&&t.deadline_at<=p.expires_at&&Date.parse(t.deadline_at)<=Date.parse(t.scheduled_at)+p.interval_minutes*60000&&Date.parse(t.scheduled_at)%(p.interval_minutes*60000)===0,'Retained tick exceeds clock policy');
}
export function validateMailboxClockState(state,config){
 const p=validateMailboxClockPolicy(config.mailbox_clock),c=state.mailbox_clock;if(c===undefined)return;
 exact(c,'schema_version,policy_sha256,mailbox_policy_sha256,recovery_generation,paused,pause,allowance_id,allowances,days,last_slot,fence,tick,updated_at'+(c.schema_version===2?',policy_history,retired_ticks,recovery_required':''));
 check((c.schema_version===1||p.schema_version===2&&c.schema_version===2)&&digest(c.policy_sha256)&&digest(c.mailbox_policy_sha256)&&key(c.recovery_generation)&&typeof c.paused==='boolean'&&utc(c.updated_at)&&integer(c.fence,Number.MAX_SAFE_INTEGER),'Invalid retained clock identity');
 if(c.pause!==null){exact(c.pause,'by,at,reason');operator(c.pause.by);check(utc(c.pause.at)&&c.pause.at<=c.updated_at&&text(c.pause.reason),'Invalid clock pause');}
 if(c.schema_version===2){
  check(typeof c.recovery_required==='boolean'&&(!c.recovery_required||c.paused&&c.allowance_id===null)&&Array.isArray(c.policy_history)&&c.policy_history.length<=20,'Invalid clock recovery or history');
  for(const h of c.policy_history){exact(h,'previous,rebound_by,rebound_at,last_slot,fence');identity(h.previous);operator(h.rebound_by);check(utc(h.rebound_at)&&h.rebound_at<=c.updated_at&&integer(h.fence,c.fence)&&(h.fence===0?h.last_slot===null:utc(h.last_slot)&&h.last_slot<=h.rebound_at),'Invalid clock rebind receipt');}
  check(c.retired_ticks&&typeof c.retired_ticks==='object'&&!Array.isArray(c.retired_ticks)&&Object.keys(c.retired_ticks).length<=1000,'Bounded retired clock ticks required');
 }
 check(c.allowances&&typeof c.allowances==='object'&&!Array.isArray(c.allowances)&&Object.keys(c.allowances).length<=100,'Bounded clock allowances required');
 let used=0;for(const [id,a]of Object.entries(c.allowances)){
  exact(a,'id,evidence_ref,observed_at,expires_at,included_only,max_steps,used_steps,recorded_by,recorded_at');const {used_steps,recorded_by,recorded_at,...input}=a;allowanceShape(input);operator(recorded_by);
  check(id===a.id&&integer(used_steps,a.max_steps)&&utc(recorded_at)&&a.observed_at<=recorded_at&&recorded_at<a.expires_at&&recorded_at<=c.updated_at,'Invalid retained allowance');used+=used_steps;
  if(c.policy_sha256===hash(p)&&(p.schema_version===1||c.schema_version===2&&!c.recovery_required&&c.allowance_id===id))check(a.expires_at<=p.expires_at,'Allowance exceeds clock policy');
 }
 check(c.allowance_id===null||key(c.allowance_id)&&Object.hasOwn(c.allowances,c.allowance_id),'Current clock allowance missing');
 check(c.days&&typeof c.days==='object'&&!Array.isArray(c.days)&&Object.keys(c.days).length<=400,'Bounded clock days required');
 let reserved=0,ticks=0;for(const [day,d]of Object.entries(c.days)){exact(d,'reserved_steps,ticks');check(/^\d{4}-\d\d-\d\d$/.test(day)&&utc(day+'T00:00:00.000Z')&&day<=c.updated_at.slice(0,10)&&integer(d.reserved_steps,1000)&&integer(d.ticks,288),'Invalid clock daily counters');reserved+=d.reserved_steps;ticks+=d.ticks;if(p.schema_version===1&&c.policy_sha256===hash(p))check(d.reserved_steps<=p.max_steps_per_day,'Clock daily budget exceeded');}
 check(reserved===used&&ticks===c.fence,'Clock accounting differs');
 const retained=[],fences=new Set(),slots=new Set();for(const [id,h]of Object.entries(c.retired_ticks??{})){
  exact(h,'policy_sha256,mailbox_policy_sha256,recovery_generation,tick,archived_by,archived_at,reason');check(digest(h.policy_sha256)&&digest(h.mailbox_policy_sha256)&&key(h.recovery_generation)&&id===h.tick?.id&&utc(h.archived_at)&&h.archived_at<=c.updated_at&&h.archived_at>=h.tick.claimed_at&&(!h.tick.pending_step||h.archived_at>=h.tick.deadline_at),'Invalid retired tick identity');
  check(h.reason==='policy_rebind'&&['owner','friend'].includes(h.archived_by)||h.reason==='superseded_unresolved'&&h.archived_by==='clock'&&h.tick.pending_step!==null,'Invalid clock archival authority');check(sameIdentity(h,c)||c.policy_history.some(v=>sameIdentity(h,v.previous)),'Unknown retired clock policy');tickShape(h.tick,c,p,false);retained.push(h.tick);
 }
 if(c.tick!==null){tickShape(c.tick,c,p,true);retained.push(c.tick);}else check(c.fence===0?c.last_slot===null&&reserved===0:Object.values(c.retired_ticks??{}).some(h=>h.tick.fence===c.fence&&h.tick.scheduled_at===c.last_slot),'Missing retained clock tick');
 const ordered=[...retained].sort((a,b)=>a.fence-b.fence);for(let i=1;i<ordered.length;i++)check(ordered[i-1].scheduled_at<ordered[i].scheduled_at,'Clock slots moved backwards across fences');
 for(const h of c.policy_history??[])if(h.fence>0)check(Object.values(c.retired_ticks).some(v=>v.tick.fence===h.fence&&v.tick.scheduled_at===h.last_slot),'Missing clock rebind source receipt');
 const grants={},days={},counts={};for(const t of retained){check(!fences.has(t.fence)&&!slots.has(t.scheduled_at),'Duplicate retained clock fence or slot');fences.add(t.fence);slots.add(t.scheduled_at);const day=t.claimed_at.slice(0,10);grants[t.allowance_id]=(grants[t.allowance_id]??0)+t.steps_reserved;days[day]=(days[day]??0)+t.steps_reserved;counts[day]=(counts[day]??0)+1;}
 for(const [id,n]of Object.entries(grants))check(n<=c.allowances[id].used_steps,'Retired ticks exceed permanent grant charges');for(const [day,n]of Object.entries(days))check(n<=c.days[day].reserved_steps&&counts[day]<=c.days[day].ticks,'Retired ticks exceed permanent day charges');
}
function archive(c,actor,at,reason){if(!c.tick)return;check(Object.keys(c.retired_ticks).length<1000&&!Object.hasOwn(c.retired_ticks,c.tick.id)&&(!c.tick.pending_step||at>=c.tick.deadline_at),'Clock archive full, collision or read deadline pending');c.retired_ticks[c.tick.id]={policy_sha256:c.policy_sha256,mailbox_policy_sha256:c.mailbox_policy_sha256,recovery_generation:c.recovery_generation,tick:structuredClone(c.tick),archived_by:actor,archived_at:at,reason};}
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
 const rebindRequired=Boolean(c&&p.schema_version===2&&(c.schema_version!==2||c.recovery_required||!sameIdentity(c,currentIdentity(config))));
 let status='Allowance required';if(c){
  const a=c.allowances[c.allowance_id];
  status=c.policy_sha256!==hash(p)||c.mailbox_policy_sha256!==hash(config.mailbox)||c.recovery_generation!==p.recovery_generation?'Policy changed':Date.parse(now)<Date.parse(c.updated_at)?'Clock moved backwards':Date.parse(now)>=Date.parse(p.expires_at)?'Expired':c.paused?'Paused':!a||Date.parse(a.observed_at)>Date.parse(now)||Date.parse(a.expires_at)<=Date.parse(now)?'Allowance required':a.used_steps>=a.max_steps?'Allowance exhausted':(c.days[now.slice(0,10)]?.reserved_steps??0)>=p.max_steps_per_day?'Daily limit':c.tick?.status==='Running'?(Date.parse(now)<Date.parse(c.tick.deadline_at)?'Running':'Tick expired'):'Ready';
 }else if(Date.parse(now)>=Date.parse(p.expires_at))status='Expired';
 if(p.schema_version===2&&c){if(c.recovery_required)status='Restore review required';else if(rebindRequired)status='Policy changed';else if(Object.keys(c.retired_ticks).length>=1000)status='Archive full';}
 return {status,...(p.schema_version===2?{compatible_history:true,limits:{max_steps_per_tick:p.max_steps_per_tick,max_steps_per_day:p.max_steps_per_day,deadline_ms:p.deadline_ms},used_steps_total:Object.values(c?.allowances??{}).reduce((n,a)=>n+a.used_steps,0),rebind_required:rebindRequired,recovery_required:c?.recovery_required??false,previous_identity:c?priorIdentity(c):null,current_identity:currentIdentity(config),retired_ticks:Object.keys(c?.retired_ticks??{}).length,unresolved_reads:Object.values(c?.retired_ticks??{}).filter(h=>h.tick.pending_step!==null).length+(c?.tick?.pending_step?1:0),archive_remaining:1000-Object.keys(c?.retired_ticks??{}).length,policy_history_remaining:20-(c?.policy_history?.length??0)}:{}),allowance_basis:'Finite reviewed steps only; actual provider usage and reserve are unverified',paused:c?.paused??true,allowance:c?.allowance_id?structuredClone(c.allowances[c.allowance_id]):null,tick:c?.tick?structuredClone(c.tick):null,day:structuredClone(c?.days[now.slice(0,10)]??{reserved_steps:0,ticks:0})};
}
export function applyMailboxClockTransition(state,config,tr){
 exact(tr,'type,actor,at,input');const {type,actor,at,input}=tr,p=policy(config,at,!['pause'].includes(type));
 validateMailboxClockState(state,config);const c=structuredClone(state.mailbox_clock??fresh(p,config,at));
 const safetyPause=p.schema_version===2&&type==='pause'&&input?.paused===true;
 if(type!=='rebind'&&!safetyPause)bound(c,p,config);
 check(Date.parse(at)>=Date.parse(c.updated_at),'Mailbox clock time moved backwards');
 let duplicate=false;
 if(type==='rebind'){
  operator(actor);exact(input,'revision,previous,current,authorized');identity(input.previous);exact(input.current,'config_sha256,policy_sha256,mailbox_policy_sha256,recovery_generation');
  check(p.schema_version===2&&state.mailbox_clock&&input.revision===state.revision&&input.authorized===true&&sameIdentity(input.previous,c)&&input.previous.schema_version===c.schema_version&&input.previous.recovery_required===(c.recovery_required??false)&&sameIdentity(input.current,currentIdentity(config))&&input.current.config_sha256===hash(config)&&c.paused&&(c.tick?.status!=='Running'||c.recovery_required)&&(!c.tick?.pending_step||at>=c.tick.deadline_at),'Exact paused clock rebind required');
  check(c.schema_version!==2||c.recovery_required||!sameIdentity(c,currentIdentity(config)),'Clock settings already current');c.policy_history??=[];c.retired_ticks??={};check(c.policy_history.length<20,'Clock policy history full');
  c.policy_history.push({previous:priorIdentity(c),rebound_by:actor,rebound_at:at,last_slot:c.last_slot,fence:c.fence});archive(c,actor,at,'policy_rebind');c.schema_version=2;c.policy_sha256=hash(p);c.mailbox_policy_sha256=hash(config.mailbox);c.recovery_generation=p.recovery_generation;c.tick=null;c.allowance_id=null;c.paused=true;c.recovery_required=false;
 }else if(type==='allowance'){
  operator(actor);exact(input,'revision,allowance');check(input.revision===state.revision,'Current mailbox clock revision required');allowanceShape(input.allowance);const a=input.allowance;
  check(Date.parse(a.observed_at)<=Date.parse(at)&&Date.parse(at)<Date.parse(a.expires_at)&&Date.parse(a.expires_at)<=Date.parse(p.expires_at),'Allowance observation is future, expired or exceeds policy');
  if(p.schema_version===2)check(Date.parse(at)-Date.parse(a.observed_at)<=900000&&!Object.hasOwn(c.allowances,a.id),'Fresh unique clock allowance required');
  if(Object.hasOwn(c.allowances,a.id)){const {used_steps,recorded_by,recorded_at,...saved}=c.allowances[a.id];check(c.allowance_id===a.id&&hash(saved)===hash(a)&&recorded_by===actor,'Allowance identity already used');duplicate=true;}
  else{check(Object.keys(c.allowances).length<100,'Retain bounded allowance history');c.allowances[a.id]={...structuredClone(a),used_steps:0,recorded_by:actor,recorded_at:at};c.allowance_id=a.id;if(c.tick?.status==='Running')c.tick.status='Held';}
 }else if(type==='pause'){
  operator(actor);exact(input,'revision,paused,reason');check(input.revision===state.revision&&typeof input.paused==='boolean'&&text(input.reason),'Current signed pause decision required');
  if(p.schema_version===2&&!input.paused){policy(config,at);const a=allowance(c,at);check(a.used_steps<a.max_steps&&(c.days[at.slice(0,10)]?.reserved_steps??0)<p.max_steps_per_day&&Object.keys(c.retired_ticks).length<1000,'Clock budget or archive exhausted');}
  c.paused=input.paused;c.pause={by:actor,at,reason:input.reason};if(input.paused&&c.tick?.status==='Running'&&!c.recovery_required)c.tick.status='Held';
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
    if(p.schema_version===2){check(Object.keys(c.retired_ticks).length<1000&&c.fence<Number.MAX_SAFE_INTEGER,'Clock archive or fence full');if(c.tick?.pending_step)archive(c,'clock',at,'superseded_unresolved');}
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
export function assertMailboxClockTransitionLive(before,after,config,tr,now){
 check(now>=tr.at,'Mailbox clock moved backwards before CAS');
 // Replay only clock controls; unrelated mailbox/client bodies are excluded from the projection.
 const projection={revision:before.revision,updated_at:before.updated_at,mailbox_clock:structuredClone(before.mailbox_clock)};
 applyMailboxClockTransition(projection,config,{...tr,at:now});
 if(['claim','step','settle','finish'].includes(tr.type))check(now<after.mailbox_clock.tick.deadline_at,'Mailbox clock expired before CAS');
}
