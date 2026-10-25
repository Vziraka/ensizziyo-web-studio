import {check,hash,businessDate} from './lifecycle.mjs';
import {notificationSources,digestTime} from './team-notifications.mjs';

const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
export function teamNotificationBoundary(app,config){
 check(!app.store?.inertBinding&&!app.store?.manualBinding&&!app.store?.projectBinding&&!config.shared_capability,'Shared record capabilities reject notification delivery');
 check(config.mode==='controlled'&&config.outreach_enabled===false&&config.connector_writes_enabled===false,'Notification delivery accepts only the fictional disabled workspace');
}
export function notificationPolicy(config){
 const c=config.google_team_notifications;
 check(c&&Object.keys(c).every(k=>['enabled','capability','run_id','revision','policy_id','grant_id','account_email','from','approval_mode','kinds','recipients','signature','starts_at','expires_at','daily_limit','sender_daily_limit','max_messages'].includes(k)),'Only the exact notification policy fields are accepted');
 check(c?.enabled===true&&c.capability==='fictional-exact-team-v1'&&c.run_id===config.run_id&&key(c.revision)&&key(c.policy_id),'Exact internal notification policy is disabled or incomplete');
 check(key(c.grant_id)&&typeof c.account_email==='string'&&/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(c.account_email)&&c.account_email===config.sender.account_email&&c.from===config.sender.email&&c.from==='hello@evzdigital.studio','Exact business owner grant and sender required');
 check(c.approval_mode==='each-message'&&c.kinds?.length===2&&c.kinds[0]==='attention'&&c.kinds[1]==='digest','Each message needs separate approval; only existing attention and digest supported');
 check(['owner','friend'].every(role=>typeof c.recipients?.[role]==='string'&&/^[a-zA-Z0-9._+-]+@example\.invalid$/.test(c.recipients[role]))&&Object.keys(c.recipients).length===2&&c.recipients.owner!==c.recipients.friend,'Exact distinct fictional owner and friend recipients required');
 check(c.signature==='EVZ Digital team · Internal operations notification','Review the fixed internal signature');
 check(typeof c.starts_at==='string'&&typeof c.expires_at==='string'&&c.starts_at.endsWith('Z')&&c.expires_at.endsWith('Z'),'Exact UTC policy timestamps required');const start=Date.parse(c.starts_at),end=Date.parse(c.expires_at);
 check(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=7*86400_000,'Finite notification policy window of at most seven days required');
 check(Number.isInteger(c.daily_limit)&&c.daily_limit>0&&c.daily_limit<=20&&c.sender_daily_limit===20&&Number.isInteger(c.max_messages)&&c.max_messages>0&&c.max_messages<=100,'Separate finite internal budget and unchanged combined sender cap of 20 required');
 return c;
}
export function currentNotificationPolicy(state,config,now){
 const c=notificationPolicy(config),a=state.team_notifications?.policy_authorization,e=state.events[a?.event_id];
 check(a?.sha256===hash(c)&&e?.type==='team_notification_policy_authorized'&&e.actor==='owner'&&e.data.policy_sha256===a.sha256,'Signed owner policy authorization required; configuration is not approval');
 check(+now>=Date.parse(c.starts_at)&&+now<Date.parse(c.expires_at),'Notification policy is not current');return c;
}
export async function authorizeNotificationPolicy(app,input,actor){
 const config=await app.loadConfig();teamNotificationBoundary(app,config);const c=notificationPolicy(config);
 check(actor==='owner','Only the signed owner may authorize the recipient policy');
 return app.change(s=>{
  check(Object.values(s.prospects).every(r=>r.controlled===true),'Fictional notification records only');
  check(input.revision===s.revision&&key(input.event_id)&&!s.events[input.event_id]&&input.authorized===true&&input.policy_sha256===hash(c),'Review and explicitly authorize the exact finite recipient policy');
  const at=app.now().toISOString();s.events[input.event_id]={id:input.event_id,type:'team_notification_policy_authorized',actor,at,data:{policy_sha256:hash(c)}};
  (s.team_notifications??={messages:{},active:{}}).policy_authorization={event_id:input.event_id,sha256:hash(c),at};s.revision++;s.updated_at=at;
  return {policy_sha256:hash(c),status:'Policy authorized; every exact message still requires approval'};
 },{configFingerprint:hash(config)});
}
export function notificationPackageInState(state,config,input,actor,now){
 check(Object.values(state.prospects).every(r=>r.controlled===true),'Fictional notification records only');
 check(['owner','friend'].includes(actor)&&key(input.notification_id),'Choose an existing notification as a signed operator');
 const c=currentNotificationPolicy(state,config,now),m=state.team_notifications?.messages?.[input.notification_id];
 return notificationEnvelope(state,m,c,actor,now);
}
// Both approval modes share the same source, recipient-role and digest freshness checks.
export function notificationEnvelope(state,m,c,actor,now){
 check(m&&m.recipient_role===actor,'Only the saved recipient role may approve or dispatch this notification');
 check(m.status==='Prepared; delivery held','Notification resolved, reassigned or already settled');
 check(Date.parse(m.due_at)<=+now,'Notification is not due');
 if(m.kind==='attention'){
  const item=notificationSources(state,now).find(item=>hash(item)===m.source_sha256);
  check(item&&item.id===m.source_id&&item.role===actor&&item.summary===m.body&&m.subject===`EVZ operations: ${item.kind} needs review`&&state.team_notifications.active[m.source_sha256]===m.id,'Notification source resolved, changed or reassigned');
 }else{
  const time=digestTime(now);check(m.kind==='digest'&&time&&m.id===`digest-${time.day}-${actor}`&&m.due_at===time.due_at&&m.source_sha256===hash({day:time.day,body:m.body})&&m.subject===`EVZ team summary · ${time.day}`,'Digest is stale or changed; missed days cannot be backfilled');
 }
 const p={schema_version:1,kind:'notification',draft_id:m.id,notification_id:m.id,recipient_role:actor,from:c.from,to:c.recipients[actor],subject:m.subject,body:m.body+'\n\n'+c.signature,attachments:[],source_sha256:m.source_sha256,source_id:m.source_id??m.id,due_at:m.due_at,policy_sha256:hash(c),policy_revision:c.revision,signature_sha256:hash(c.signature)};
 return {...p,sha256:hash(p)};
}
export async function exactNotificationPackage(app,input,actor){const config=await app.loadConfig();teamNotificationBoundary(app,config);return notificationPackageInState(await app.snapshot(),config,input,actor,app.now());}
export async function approveExactNotification(app,input,actor){
 const config=await app.loadConfig();teamNotificationBoundary(app,config);
 return app.change(s=>{
  const p=notificationPackageInState(s,config,input,actor,app.now());
  check(input.revision===s.revision&&key(input.event_id)&&!s.events[input.event_id]&&input.approved===true&&input.facts_checked===true&&input.package_sha256===p.sha256,'Explicitly approve the current exact internal envelope and facts');
  const id='team-'+hash({run:s.run_id,notification:p.notification_id}).slice(0,32),existing=s.actions[id];
  check(!existing||existing.payload.package_sha256===p.sha256&&!s.operations?.requests?.[id+'-intent'],'Existing changed package or reserved intent must be reconciled; never replace');
  const at=app.now().toISOString();s.events[input.event_id]={id:input.event_id,type:'exact_team_notification_approved',actor,at,data:{package_sha256:p.sha256,action_id:id}};
  s.actions[id]={id,type:'email',status:'Queued',assigned_to:actor,created_at:at,payload:{exact_mail:true,internal_notification:true,package_sha256:p.sha256,selector:{kind:'notification',notification_id:p.notification_id},approval_event:input.event_id,package:p}};
  s.revision++;s.updated_at=at;return {action_id:id,package_sha256:p.sha256,status:'Approved; delivery held until explicit dispatch'};
 },{configFingerprint:hash(config)});
}
export function notificationBudget(state,c,now){
 const requests=Object.values(state.operations?.requests??{}),internal=requests.filter(q=>q.internal_notification===true),today=businessDate(now);
 check(internal.filter(q=>q.policy_id===c.policy_id).length<c.max_messages&&internal.filter(q=>q.prepared_at&&businessDate(q.prepared_at)===today).length<c.daily_limit,'Internal notification reservation budget exhausted');
}
