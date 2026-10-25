import {operationsMailCapability} from './shared-operations-exact-mail.mjs';
import {check,hash} from './lifecycle.mjs';
import {bookingKey,bookingContext,bookingConfirmations} from './calendar-confirmation.mjs';
import {validateBookingSlot} from './lifecycle-documents.mjs';
import {currentCalendarBooking,applyCalendarStep,calendarEventReceipt,calendarInsertBody,calendarQueueInput,validateCalendarMetadata,calendarBusyResponse} from './google-calendar.mjs';
import {calendarOAuthProfile,calendarOAuthScopes} from './google-oauth.mjs';
export const operationsCalendarCapability='shared-operations-calendar-v1';
export const calendarTransitionSchema=Object.freeze({version:1,transitions:['queue','reserve','dispatch','read','verified','effect','hold'],confirmation:'state.operations.bookings.confirmation',confirmation_observation:'state.operations.bookings.confirmation_observation',grant_profile:'calendar-booking-v1',recovery:'exact-id-read-only-no-recreate'});
export const calendarSlotPolicy=Object.freeze({duration_minutes:20,buffer_minutes:15,start_hour:9,end_hour:17,weekdays:[1,2,3,4,5]});
const exact=(v,fields)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===fields.split(',').sort().join(','),'Unknown or missing Calendar fields');
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export const hasOperationsCalendar=app=>[operationsCalendarCapability,operationsMailCapability].includes(app.config?.shared_capability)&&app.store?.dispatchBinding?.scope.capability===app.config.shared_capability;
export function validateCalendarPolicy(p){
 exact(p,'version,status,account,calendar_id,grant_id,grant_profile,slot_policy,operations,response_bytes,request_ms,execution_ms');
 check(p.version===operationsCalendarCapability&&p.status==='UNAPPROVED'&&p.account==='ensizziyo@evzdigital.studio'&&p.calendar_id===p.account&&key(p.grant_id)&&p.grant_profile==='calendar-booking-v1'&&hash(p.slot_policy)===hash(calendarSlotPolicy)&&hash(p.operations)===hash(['availability','queue','dispatch-once','exact-id-reconcile'])&&p.response_bytes===100000&&p.request_ms===10000&&p.execution_ms===40000,'Exact unapproved independent Calendar policy required');return p;
}
export function sharedCalendarPolicy(app,c,env,{runtime=true}={}){
 check(hasOperationsCalendar({...app,config:c})&&!app.store.projectBinding&&app.store.key==='workspace','Exact shared Calendar dispatch authority required');
 const binding=app.store.dispatchBinding,b=binding.scope,p=validateCalendarPolicy(c.google_calendar);
 check(env?.CONTEXT==='production'&&env.EVZ_OPERATIONS_DESK_ENABLED===c.shared_capability&&env.EVZ_OPERATIONS_BLOB_NAMESPACE===b.namespace&&env.EVZ_OPERATIONS_ORIGIN===b.origin&&env.SITE_ID===b.site_id&&env.DEPLOY_ID===b.deploy_id&&hash(JSON.parse(env.EVZ_INTERNAL_DISPATCH_BINDING??'null'))===hash(binding),'Calendar deployment binding changed');
 check(!runtime||env.EVZ_OPERATIONS_GOOGLE_CALENDAR===c.shared_capability,'Hosted Calendar is disabled');
 check(hash(c.calendar)===hash({...calendarSlotPolicy,calendar_id:'primary',owner_email:p.account}),'Exact Eastern business-primary slot policy required');
 return hash({capability:c.shared_capability,authority_key:app.store.key,binding_sha256:hash(binding),source_policy_sha256:hash(p),calendar:c.calendar,run:c.run_id});
}
export function validateCalendarImport(state,sourceConfig){
 check(!Object.keys(sourceConfig?.operations?.bookings??{}).length,'Legacy config-owned Calendar confirmations require an explicit source-bound adaptation; whole installation held before writes');
 for(const [id,q] of Object.entries(state.operations?.requests??{}))if(q.operation==='booking_create'||q.transport==='google-calendar-v1')check(id.endsWith('-create')&&q.logical===id&&q.operation==='booking_create'&&q.transport==='google-calendar-v1'&&state.operations.bookings?.[id.slice(0,-7)]?.confirmation,'Legacy Calendar intent has no exact preserved state confirmation/key; whole installation held before writes');
 for(const e of Object.values(state.events??{}))if(e.type==='meeting_queued')check(state.operations?.bookings?.[e.data?.booking_id]?.confirmation?.confirmation_event===e.id,'Legacy signed Calendar confirmation is missing; whole installation held before writes');
 for(const [id,record] of Object.entries(state.operations?.bookings??{})){
  const b=record.confirmation,e=state.events[b?.confirmation_event];check(b,'Legacy Calendar receipt has no preserved state confirmation; whole installation held before writes');
  exact(b,'prospect_id,attendee_email,start,end,title,description,mode,location,timezone,approved,approval_ref,approved_by,source_sha256,policy_sha256,confirmation_event,transport'+(b.recipient_confirmed===undefined?'':',recipient_confirmed'));
  check(key(b.prospect_id)&&state.prospects[b.prospect_id]&&id===bookingKey(b)&&b.approved===true&&['owner','friend'].includes(b.approved_by)&&b.transport==='google-calendar-v1'&&b.confirmation_event===id+'-confirmed'&&b.approval_ref==='owner-console:'+id&&sha(b.source_sha256)&&sha(b.policy_sha256)&&['phone','video'].includes(b.mode)&&b.timezone==='America/New_York'&&/^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[a-zA-Z]{2,63}$/.test(b.attendee_email??'')&&b.title?.startsWith('EVZ Digital')&&b.title.length<=200&&typeof b.description==='string'&&b.description.length<1500&&typeof b.location==='string'&&b.location.length<=300&&!/[\x00-\x1f\x7f]/.test(b.location)&&(b.recipient_confirmed===undefined||b.recipient_confirmed===true),'Exact preserved Calendar confirmation required');
  exact(e,'id,type,prospect_id,actor,at,data');exact(e.data,'booking_id,booking_sha256');check(e.id===b.confirmation_event&&e.type==='meeting_queued'&&e.prospect_id===b.prospect_id&&e.actor===b.approved_by&&e.data.booking_id===id&&e.data.booking_sha256===hash(b),'Exact preserved signed Calendar event required');
  validateBookingSlot(b,[],calendarSlotPolicy,e.at,new Date(e.at));
  const observed=record.confirmation_observation;exact(observed,'type,at,grant,claim,requests');exact(observed.claim,'dispatch_claim,read_claim');check(observed.type==='queue'&&observed.at===e.at&&observed.claim.dispatch_claim===null&&observed.claim.read_claim===null,'Preserve the exact original queue observation');
  const historical={google_calendar:{account:'ensizziyo@evzdigital.studio',calendar_id:'ensizziyo@evzdigital.studio',grant_id:observed.grant?.grant_id},calendar:calendarSlotPolicy};validateGrant(observed.grant,historical,observed.at);validateObservations(observed.requests,historical,b,null,observed.at);check(hash(observed.requests.map(o=>o.path))===hash(['calendars/primary','freeBusy'])&&observed.requests.every(o=>Date.parse(o.at)>=Date.parse(observed.at)-40000),'Exact retained queue availability evidence required');const busy=observed.requests[1];validateBookingSlot(b,calendarBusyResponse(busy.value,busy.body.timeMin,busy.body.timeMax,historical),calendarSlotPolicy,busy.at,new Date(observed.at));
  const q=state.operations?.requests?.[id+'-create'];
  if(!q){exact(record,'confirmation,confirmation_observation');continue;}
  check(Object.keys(q).every(k=>['logical','operation','transport','status','prepared_at','event_id','scope_sha256','binding_sha256','dispatch_started_at','dispatch_claim','read_claim','receipt','observations'].includes(k))&&q.logical===id+'-create'&&q.operation==='booking_create'&&q.transport==='google-calendar-v1'&&['Reserved','Uncertain','Verified'].includes(q.status)&&Number.isFinite(Date.parse(q.prepared_at))&&q.event_id==='e'+hash({run:state.run_id,booking:id})&&q.scope_sha256===hash({booking:b,policy:b.policy_sha256})&&q.binding_sha256===b.policy_sha256&&(q.dispatch_claim===undefined||uuid(q.dispatch_claim)&&Number.isFinite(Date.parse(q.dispatch_started_at)))&&(q.read_claim===undefined||uuid(q.read_claim)),'Exact preserved Calendar intent required');
  check((q.dispatch_started_at===undefined)===(q.dispatch_claim===undefined)&&Date.parse(q.prepared_at)>=Date.parse(e.at)&&(!q.dispatch_started_at||Date.parse(q.dispatch_started_at)>=Date.parse(q.prepared_at))&&(q.status!=='Reserved'||!q.dispatch_claim&&!q.receipt),'Calendar reservation/claim chronology changed; never reset an intent');
  check(Array.isArray(q.observations)&&q.observations.length>0,'Calendar raw observations must remain with the original intent');const receipts=[];
  for(const o of q.observations){exact(o,'type,at,grant,claim,requests');exact(o.claim,'dispatch_claim,read_claim');check(['reserve','dispatch','verified','hold'].includes(o.type)&&Number.isFinite(Date.parse(o.at))&&(o.claim.dispatch_claim===null||uuid(o.claim.dispatch_claim)&&o.claim.dispatch_claim===q.dispatch_claim)&&(o.claim.read_claim===null||uuid(o.claim.read_claim))&&(o.type!=='verified'||o.claim.read_claim),'Exact Calendar observation/claim history required');const historical={google_calendar:{account:'ensizziyo@evzdigital.studio',calendar_id:'ensizziyo@evzdigital.studio',grant_id:o.grant?.grant_id},calendar:calendarSlotPolicy};if(o.grant)validateGrant(o.grant,historical,o.at,o.type!=='hold');else check(o.type==='hold','Calendar grant observation is missing');validateObservations(o.requests,historical,b,q,o.at,o.type==='hold');if(o.type==='verified')receipts.push(calendarEventReceipt(o.requests.at(-1)?.value,b,q.event_id,q.scope_sha256,historical));}
  if(q.receipt)check(receipts.some(r=>hash(r)===hash(q.receipt)),'Preserve the exact raw observation for every retained Calendar receipt');
  check(q.status!=='Verified'||q.receipt&&q.read_claim,'Verified Calendar intent requires exact retained readback');
  if(q.receipt){check(record.id,'Calendar receipt lost its existing booking record');validateCalendarEffect(state,id);}
  if(record.id){const receipt=Object.fromEntries(Object.keys(q.receipt??{}).map(k=>[k,record[k]]));check(q.receipt&&hash(receipt)===hash(q.receipt)&&record.scope_sha256===hash(b)&&typeof record.verified==='boolean'&&(q.status!=='Verified'||record.verified===true)&&Object.keys(record).every(k=>['confirmation','confirmation_observation','scope_sha256','verified',...Object.keys(q.receipt)].includes(k)),'Exact current preserved Calendar booking receipt required');}
  else exact(record,'confirmation,confirmation_observation');
 }
 for(const [eid,value] of Object.entries(state.operations?.effects??{}))if(value.event?.type==='meeting_verified'){const id=Object.keys(state.operations.bookings??{}).find(id=>eid==='booking-'+hash(id).slice(0,32));check(id&&state.operations.requests?.[id+'-create']?.receipt,'Legacy Calendar effect has no preserved exact receipt; whole installation held before writes');validateCalendarEffect(state,id);}
 for(const e of Object.values(state.events??{}))if(e.type==='meeting_verified')check(state.operations?.effects?.[e.id]?.event?.type==='meeting_verified','Calendar provider event lost its exact existing effect');
}
export function validateCalendarEffect(state,id){
 const b=state.operations.bookings[id].confirmation,q=state.operations.requests[id+'-create'],eid='booking-'+hash(id).slice(0,32),effect=state.operations.effects?.[eid],e=effect?.event;
 exact(effect,'event');exact(e,'id,prospect_id,type,at,data');check(e.id===eid&&e.prospect_id===b.prospect_id&&e.type==='meeting_verified'&&q.observations.some(o=>o.type==='verified'&&o.at===e.at&&hash(calendarEventReceipt(o.requests.at(-1).value,b,q.event_id,q.scope_sha256,{google_calendar:{account:'ensizziyo@evzdigital.studio',calendar_id:'ensizziyo@evzdigital.studio'}}))===hash(e.data)),'Calendar effect must retain the exact observed receipt, booking and prospect');
 const applied=state.events[eid];if(applied)check(hash(applied)===hash({fingerprint:hash({event:e,actor:'provider'}),actor:'provider',...e}),'Applied Calendar event differs from its original effect');return effect;
}
export const calendarSource=r=>hash({context:bookingContext(r??{}),stage:r?.stage??null,restriction:r?.restriction??null,meeting:r?.meeting??null});
export function calendarBookingView(state){return Object.entries(state.operations?.bookings??{}).filter(([,b])=>b.confirmation).map(([id,b])=>({id,confirmation:b.confirmation,reservation:'Reserved',request_status:state.operations.requests?.[id+'-create']?.status??'Not dispatched',event_status:b.verified?'Verified':b.id?'Needs review':'Unverified',invitation_delivery:b.invitation_delivery??'Unverified',guest_response:b.guest_response??'Not observed',hold:state.operations.holds?.[id]??null}));}
export function calendarWitness(app,state,c,id,actor,options,type,expected,details,provider){
 const b=bookingConfirmations(state,c)[id],r=state.prospects[b?.prospect_id??details.input?.prospect_id];
 return {type,actor,booking_id:id,binding_sha256:hash(app.store?.dispatchBinding??null),config_sha256:hash(c),source_policy_sha256:hash(c.google_calendar),prior_sha256:hash(expected??null),confirmation_sha256:b?hash(b):null,source_sha256:calendarSource(r),at:app.now().toISOString(),deadline:options.calendarDeadline,details:structuredClone(details),observations:structuredClone(provider?.observations??[]),grant:provider?.grant()??null};
}
export async function calendarChange(app,c,id,actor,options,type,expected,details,provider,fn){
 const shared=hasOperationsCalendar(app),w={};return app.change((state,actual)=>{Object.assign(w,calendarWitness(app,state,actual,id,actor,options,type,expected,details,provider));return fn(state,actual,w);},shared?{configFingerprint:hash(c),projectCalendar:w,calendarSignal:options.signal}:type==='hold'?{}:{configFingerprint:hash(c)});
}
function validateGrant(grant,c,at,live=true){
 exact(grant,'profile,account,grant_id,scopes,expires_at');check(grant.profile===calendarOAuthProfile&&grant.account===c.google_calendar.account&&key(grant.grant_id)&&grant.grant_id===c.google_calendar.grant_id&&Array.isArray(grant.scopes)&&hash([...grant.scopes].sort())===hash([...calendarOAuthScopes].sort())&&Number.isSafeInteger(grant.expires_at)&&grant.expires_at>0&&(!live||grant.expires_at>Date.parse(at)+10000),'Exact independent current Calendar grant required');
}
function validateObservations(observations,c,b,q,at,held=false){
 check(Array.isArray(observations)&&observations.length<=4,'Bounded exact Calendar observations required');
 for(const o of observations){
  exact(o,'path,method,body,value,at');check(Number.isFinite(Date.parse(o.at))&&Date.parse(o.at)<=Date.parse(at)&&o.value&&typeof o.value==='object'&&!Array.isArray(o.value)&&!o.value.nextPageToken&&Buffer.byteLength(JSON.stringify(o.value))<=100000,'Bounded dated raw Calendar observation required');
  if(o.path==='calendars/primary'){check(o.method==='GET'&&o.body===null,'Exact primary metadata request required');if(!held)validateCalendarMetadata(o.value,c,b.mode??'video');}
  else if(o.path==='freeBusy'){
   const start=new Date(Date.parse(b.start)-900000).toISOString(),end=new Date(Date.parse(b.end)+900000).toISOString();check(o.method==='POST'&&hash(o.body)===hash({timeMin:start,timeMax:end,timeZone:'America/New_York',calendarExpansionMax:1,items:[{id:c.google_calendar.calendar_id}]}),'Exact buffered Calendar request required');if(!held)calendarBusyResponse(o.value,start,end,c);
  }else if(o.path==='calendars/'+encodeURIComponent(c.google_calendar.calendar_id)+'/events/'+q?.event_id+'?timeZone=America%2FNew_York'){check(o.method==='GET'&&o.body===null,'Exact reserved event GET required');}
  else check(o.path==='calendars/'+encodeURIComponent(c.google_calendar.calendar_id)+'/events?sendUpdates=all&conferenceDataVersion=1'&&o.method==='POST'&&q&&hash(o.body)===hash(calendarInsertBody(b,q.event_id,q.scope_sha256)),'Only the exact reserved insert observation is supported');
 }
}
export async function replayCalendarTransition(before,expected,w,{binding,env,now,calendarGrant}={}){
 exact(w,'type,actor,booking_id,binding_sha256,config_sha256,source_policy_sha256,prior_sha256,confirmation_sha256,source_sha256,at,deadline,details,observations,grant');
 const c=before.config,at=Date.parse(w.at),clock=()=>+now(),app={config:c,store:{dispatchBinding:binding,projectBinding:null,key:'workspace'},now:()=>new Date(w.at)};
 check(calendarTransitionSchema.transitions.includes(w.type)&&['owner','friend'].includes(w.actor)&&key(w.booking_id)&&w.binding_sha256===hash(binding)&&w.config_sha256===hash(c)&&w.source_policy_sha256===hash(c.google_calendar)&&Number.isFinite(at)&&at<=clock()&&Number.isSafeInteger(w.deadline)&&w.deadline<=at+40000,'Exact current Calendar witness required');
 const policy=sharedCalendarPolicy(app,c,env,{runtime:w.type!=='hold'}),b=bookingConfirmations(before.state,c)[w.booking_id],q=before.state.operations?.requests?.[w.booking_id+'-create'];
 if(w.type!=='hold'){check(typeof calendarGrant==='function','Independent Calendar grant authority required');validateGrant(await calendarGrant(w.grant),c,w.at);sharedCalendarPolicy(app,c,env);check(clock()<w.deadline,'Calendar deadline expired during grant read');}
 check(w.source_sha256===calendarSource(before.state.prospects[b?.prospect_id??w.details.input?.prospect_id]),'Calendar source changed during transition');
 if(w.type!=='hold')check(clock()<w.deadline&&w.prior_sha256===hash(q??null),'Calendar deadline or exact claim changed');
 if(w.type==='queue'){
  exact(w.details,'input');calendarQueueInput(w.details.input,true);check(w.booking_id===bookingKey(w.details.input),'Exact signed booking identity required');validateGrant(w.grant,c,w.at);validateObservations(w.observations,c,w.details.input,q,w.at);check(hash(w.observations.map(o=>o.path))===hash(['calendars/primary','freeBusy']),'Exact queue availability evidence required');
  validateBookingSlot(w.details.input,calendarBusyResponse(w.observations[1].value,w.observations[1].body.timeMin,w.observations[1].body.timeMax,c),c.calendar,w.observations[1].at,new Date(w.at));
  const {queueMeeting}=await import('./production.mjs'),replay={...app,change:async fn=>fn(expected,c)};await queueMeeting(replay,w.details.input,{actor:w.actor,hostedCalendar:true,calendarPolicy:policy,calendarRecord:w});check(hash(expected.operations.bookings[w.booking_id].confirmation)===w.confirmation_sha256,'Exact queued confirmation changed');
 }else{
  check(b&&w.confirmation_sha256===hash(b)&&b.approved_by===w.actor,'Exact original signed Calendar confirmation required');
  if(w.type!=='hold')check(currentCalendarBooking(before.state,c,w.booking_id,w.actor).policy_sha256===policy,'Calendar policy changed after confirmation');
  const names={reserve:'',dispatch:'dispatch_claim',read:'read_claim',verified:'receipt',effect:'effect_sha256',hold:'phase'};exact(w.details,names[w.type]);
  if(['dispatch','read'].includes(w.type))check(uuid(w.details[w.type==='dispatch'?'dispatch_claim':'read_claim']),'Exact fresh Calendar claim UUID required');
  if(['reserve','dispatch','verified'].includes(w.type))validateGrant(w.grant,c,w.at);
  validateObservations(w.observations,c,b,q,w.at,w.type==='hold');
  if(w.type==='reserve'||w.type==='dispatch'){
   check(hash(w.observations.map(o=>o.path))===hash(['calendars/primary','freeBusy',...(w.type==='dispatch'?['freeBusy']:[])]),'Exact fresh reservation/dispatch availability evidence required');const o=w.observations.at(-1);validateBookingSlot(b,calendarBusyResponse(o.value,o.body.timeMin,o.body.timeMax,c),c.calendar,o.at,new Date(w.at));
  }else if(w.type==='verified')check(hash(w.observations.map(o=>o.path))===hash(['calendars/primary','calendars/'+encodeURIComponent(c.google_calendar.calendar_id)+'/events/'+q.event_id+'?timeZone=America%2FNew_York']),'Exact reserved-ID readback evidence required');
  else if(w.type!=='hold')check(!w.observations.length&&w.grant===null,'No provider observation belongs to this Calendar step');
  applyCalendarStep(expected,c,w);
 }
 check(w.observations.every(o=>Date.parse(o.at)>=w.deadline-40000),'Calendar observation predates this bounded request');
 if(w.type!=='hold')validateGrant(await calendarGrant(w.grant),c,w.at);
 sharedCalendarPolicy(app,c,env,{runtime:w.type!=='hold'});if(w.type!=='hold')check(clock()<w.deadline,'Calendar deadline expired during independent replay');
}
