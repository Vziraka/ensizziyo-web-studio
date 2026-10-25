import {check,hash} from './lifecycle.mjs';
import {queueMeeting,bookingContext} from './production.mjs';
import {validateBookingSlot} from './lifecycle-documents.mjs';
import {meetingSlots} from './call-desk.mjs';
import {bookingIdentity} from './lifecycle-operations.mjs';
import {calendarOAuthProfile,calendarOAuthScopes} from './google-oauth.mjs';
import {randomUUID} from 'node:crypto';
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const bump=(s,app)=>{s.revision++;s.updated_at=app.now().toISOString();};
function capability(app,c,env,actor){
 check(['owner','friend'].includes(actor),'Calendar needs a signed operator');
 check(!app.store?.inertBinding&&c.shared_capability!=='inert-shared-v1','D2 notes-only authority rejects Calendar execution');
 const g=c.google_calendar;
 check(env.CONTEXT==='deploy-preview'&&env.EVZ_OPERATIONS_DESK_ENABLED==='fictional-preview'&&env.EVZ_OPERATIONS_GOOGLE_CALENDAR==='fictional-calendar-v1'&&c.mode==='controlled'&&g?.enabled===true&&g.capability==='fictional-calendar-v1','Hosted Calendar is disabled; production remains unavailable');
 check(g.run_id===c.run_id&&g.account==='ensizziyo@evzdigital.studio'&&g.calendar_id===g.account&&key(g.grant_id)&&c.calendar.owner_email===g.account&&c.calendar.calendar_id==='primary'&&c.calendar.duration_minutes===20&&c.calendar.buffer_minutes===15&&c.calendar.start_hour===9&&c.calendar.end_hour===17&&hash(c.calendar.weekdays)===hash([1,2,3,4,5]),'Exact business Calendar, grant, run and Eastern slot policy required');
 return hash({google:g,calendar:c.calendar,run:c.run_id,site:env.SITE_ID,deploy:env.DEPLOY_ID,origin:env.EVZ_OPERATIONS_ORIGIN,namespace:env.EVZ_OPERATIONS_BLOB_NAMESPACE});
}
function current(s,c,id,actor){
 check(key(id),'Choose the existing exact booking');const b=c.operations?.bookings?.[id],r=s.prospects[b?.prospect_id];
 check(b?.transport==='google-calendar-v1'&&b.approved===true&&b.approved_by===actor&&b.source_sha256===bookingContext(r??{})&&b.timezone==='America/New_York'&&r?.controlled===true&&r.contact?.verified===true&&!r.restriction&&['Discovery','Information requested'].includes(r.stage)&&(!r.follow_up_owner||r.follow_up_owner===actor)&&b.attendee_email.endsWith('@example.invalid')&&(b.attendee_email===r.contact.email||b.recipient_confirmed===true),'Guest confirmation, contact, source or ownership changed; retain the reserved invitation');
 check(!r.meeting||[id,s.operations?.bookings?.[id]?.id].includes(r.meeting.event_id),'An existing meeting owns this conversation');
 const confirmation=s.events[b.confirmation_event];
 check(confirmation?.id===b.confirmation_event&&confirmation.type==='meeting_queued'&&confirmation.prospect_id===b.prospect_id&&confirmation.actor===actor&&confirmation.data?.booking_id===id&&confirmation.data.booking_sha256===hash(b),'Exact signed guest confirmation event required');
 return b;
}
// Each fence reads the actual envelope; an acknowledgement can outlive its source or claim.
function bookingFence(app,c,id,actor,env,options,expected){
 const fingerprint=hash(c),logical=id+'-create';
 function validate(s,actual){
  check(hash(actual)===fingerprint,'Calendar configuration changed; retain the exact intent');
  const policy=capability(app,actual,env,actor),b=current(s,actual,id,actor);
  check(b.policy_sha256===policy,'Calendar grant or account policy changed after guest confirmation');
  check(!options.signal.aborted&&+app.now()<options.calendarDeadline,'Calendar dispatch deadline expired');
  check(hash(s.operations?.requests?.[logical]??null)===hash(expected()??null),'Exact Calendar request claim changed; refresh before reconciling');
  return s;
 }
 return {validate,async read(){check(app.store?.envelope,'Calendar requires its conditional workspace');const {data}=await app.store.envelope();return validate(data.state,data.config);}};
}
export function googleCalendarTransport({getAccessToken,fetcher=fetch,config,now=()=>Date.now(),signal=AbortSignal.timeout(40000),guard=async()=>{}}){
 const g=config.google_calendar;let token;
 function exactToken(minimum){check(token?.profile===calendarOAuthProfile&&token.account===g.account&&token.grant_id===g.grant_id&&Array.isArray(token.scopes)&&token.scopes.length===calendarOAuthScopes.length&&new Set(token.scopes).size===token.scopes.length&&calendarOAuthScopes.every(s=>token.scopes.includes(s))&&typeof token.access_token==='string'&&/^[\x21-\x7e]{10,8192}$/.test(token.access_token)&&token.expires_at>now()+minimum,'Exact independent business Calendar grant/account/scopes required');}
 async function live(authenticated=false){await guard();check(!signal.aborted,'Calendar access expired; retain the existing intent');if(authenticated)exactToken(10000);}
 async function request(path,method='GET',body){
  await live(true);
  let response;try{response=await fetcher('https://www.googleapis.com/calendar/v3/'+path,{method,headers:{Authorization:'Bearer '+token.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});}catch{throw Error('Calendar request interrupted; reconcile the existing intent without another insert');}
  try{await live(true);}catch(error){await response.body?.cancel();throw error;}
  if(!response.ok){await response.body?.cancel();await live(true);if(response.status===401){try{await getAccessToken.invalidate?.(token);}catch{}await live(true);}throw Error(response.status===409?'Calendar event ID conflicts; reconcile only':response.status===404?'Calendar event missing; intent remains held, never recreate':'Calendar response failed; retain existing intent and owner grant');}
  try{check(response.body,'Missing Calendar response');const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {value,done}=await reader.read();await live(true);if(done)break;size+=value.length;check(size<=100000,'Calendar response exceeds bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}await live(true);const data=JSON.parse(Buffer.concat(chunks));check(data&&typeof data==='object'&&!Array.isArray(data)&&!data.nextPageToken,'Incomplete Calendar response');return data;}catch{throw Error('Calendar JSON is malformed, partial or exceeds the read bound');}
 }
 async function preflight(mode){
  await live();
  try{token=await getAccessToken?.();}catch{throw Error('Independent business Calendar grant unavailable');}
  await live();
  exactToken(45000);
  const p=await request('calendars/primary');check(p.kind==='calendar#calendar'&&p.id===g.calendar_id&&p.timeZone==='America/New_York','Primary Calendar identity or timezone differs');if(mode==='video')check(p.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet'),'Business Calendar does not support requested video intent');return p;
 }
 async function availability(start,end){
  const q={timeMin:start,timeMax:end,timeZone:'America/New_York',calendarExpansionMax:1,items:[{id:g.calendar_id}]},p=await request('freeBusy','POST',q),busy=p.calendars?.[g.calendar_id];
  check(p.kind==='calendar#freeBusy'&&Date.parse(p.timeMin)===Date.parse(start)&&Date.parse(p.timeMax)===Date.parse(end)&&!Object.keys(p.groups??{}).length&&Object.keys(p.calendars??{}).length===1&&busy&&(busy.errors===undefined||Array.isArray(busy.errors)&&busy.errors.length===0)&&Array.isArray(busy.busy)&&busy.busy.length<=1000&&busy.busy.every(b=>typeof b.start==='string'&&typeof b.end==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(b.start)&&/(Z|[+-]\d\d:\d\d)$/.test(b.end)&&Date.parse(b.start)<Date.parse(b.end)),'Calendar availability is incomplete or belongs to another calendar');
  return busy.busy;
 }
 return {preflight,availability,async checkSlot(b){const buffer=config.calendar.buffer_minutes*60000,busy=await availability(new Date(Date.parse(b.start)-buffer).toISOString(),new Date(Date.parse(b.end)+buffer).toISOString());return validateBookingSlot({start:b.start,end:b.end,timezone:'America/New_York'},busy,config.calendar,new Date(now()).toISOString(),new Date(now()));},
  async insert(b,id,scope){return request('calendars/'+encodeURIComponent(g.calendar_id)+'/events?sendUpdates=all&conferenceDataVersion=1','POST',{id,summary:b.title,description:b.description,location:b.location,start:{dateTime:b.start,timeZone:b.timezone},end:{dateTime:b.end,timeZone:b.timezone},attendees:[{email:b.attendee_email}],visibility:'private',transparency:'opaque',reminders:{useDefault:false,overrides:[]},guestsCanInviteOthers:false,guestsCanModify:false,extendedProperties:{private:{evzIntent:scope}},...(b.mode==='video'?{conferenceData:{createRequest:{requestId:id,conferenceSolutionKey:{type:'hangoutsMeet'}}}}:{})});},
  async read(b,id,scope){const e=await request('calendars/'+encodeURIComponent(g.calendar_id)+'/events/'+id+'?timeZone=America%2FNew_York');
   check(e.kind==='calendar#event'&&e.id===id&&e.extendedProperties?.private?.evzIntent===scope&&e.description===b.description&&(e.location??'')===b.location&&e.start?.timeZone===b.timezone&&e.end?.timeZone===b.timezone&&!e.start.date&&!e.end.date&&!e.attendeesOmitted&&Array.isArray(e.attendees)&&e.attendees.length===1&&e.attendees[0].email===b.attendee_email&&['needsAction','declined','tentative','accepted'].includes(e.attendees[0].responseStatus)&&e.organizer?.self===true&&e.guestsCanInviteOthers===false&&e.guestsCanModify===false&&!e.recurringEventId&&(!e.eventType||e.eventType==='default')&&/^https:\/\/www\.google\.com\/calendar\//.test(e.htmlLink??''),'Exact Calendar event, organizer, content or guest readback differs');
   if(b.mode==='video')check(e.conferenceData?.createRequest?.requestId===id&&e.conferenceData.createRequest.status?.statusCode==='success'&&e.conferenceData.conferenceSolution?.key?.type==='hangoutsMeet'&&e.conferenceData.entryPoints?.some(p=>p.entryPointType==='video'&&/^https:\/\/meet\.google\.com\/[a-z-]+$/.test(p.uri)),'Video conference is pending, failed or missing; reconcile existing event');
   else check(!e.conferenceData&&!e.hangoutLink,'Unexpected video conference on phone booking');
   const receipt=bookingIdentity({...e,organizer:{...e.organizer,is_self:e.organizer.self},reminders:{use_default:e.reminders?.useDefault,overrides:e.reminders?.overrides}},b,g.account);
   return {...receipt,event_id:id,calendar_id:g.calendar_id,organizer:g.account,invitation_delivery:'Unverified',guest_response:e.attendees[0].responseStatus,conference_status:b.mode==='video'?'success':'Not requested'};
  }};
}
function providerFor(c,options,app,guard){return googleCalendarTransport({...options,guard,config:c,now:()=>+app.now()});}
export async function calendarAvailability(app,{actor,env=process.env,...options}){
 const c=await app.loadConfig();capability(app,c,env,actor);const provider=providerFor(c,options,app);await provider.preflight();const now=app.now(),busy=await provider.availability(now.toISOString(),new Date(+now+11*86400000).toISOString());return {slots:meetingSlots(now,[...busy,...Object.values(c.operations?.bookings??{}).map(b=>({start:b.start,end:b.end}))]),checked_at:now.toISOString(),simulated:true,provider:'Fictional injected Calendar transport; no live delivery proof'};
}
export async function queueGoogleMeeting(app,input,{actor,env=process.env,...options}){
 const c=await app.loadConfig(),policy=capability(app,c,env,actor);
 check(input&&Object.keys(input).every(k=>['revision','prospect_id','attendee_email','recipient_confirmed','slot_agreed','start','end','timezone','title','description','location','mode'].includes(k))&&input.timezone==='America/New_York'&&typeof (input.location??'')==='string'&&(input.location??'').length<=300&&!/[\x00-\x1f\x7f]/.test(input.location??''),'Supply only the exact Eastern guest-confirmed meeting fields');
 check(typeof input.attendee_email==='string'&&/^[^\s@,;<>"\r\n]+@example\.invalid$/.test(input.attendee_email),'Choose one syntactically valid fictional guest email');
 const provider=providerFor(c,options,app);await provider.preflight(input.mode??'video');await provider.checkSlot(input);
 return queueMeeting(app,input,{actor,hostedCalendar:true,configFingerprint:hash(c),calendarPolicy:policy});
}
export async function dispatchGoogleMeeting(app,input,{actor,env=process.env,...options}){
 options.signal??=AbortSignal.timeout(40000);
 options.calendarDeadline??=+app.now()+40000;
 const c=await app.loadConfig(),policy=capability(app,c,env,actor),state=await app.snapshot(),b=current(state,c,input.booking_id,actor),logical=input.booking_id+'-create',prior=state.operations?.requests?.[logical];
 check(b.policy_sha256===policy,'Calendar grant or account policy changed after guest confirmation');
 if(prior)return {booking_id:input.booking_id,status:prior.status,reason:'Intent already reserved; reconcile only'};
 let expected=null;const fence=bookingFence(app,c,input.booking_id,actor,env,options,()=>expected),provider=providerFor(c,options,app,()=>fence.read());await provider.preflight(b.mode);await provider.checkSlot(b);
 const scope=hash({booking:b,policy}),id='e'+hash({run:c.run_id,booking:input.booking_id});
 await app.change((s,actual)=>{fence.validate(s,actual);const o=s.operations??={};o.requests??={};o.bookings??={};o.holds??={};o.effects??={};expected={logical,operation:'booking_create',transport:'google-calendar-v1',status:'Reserved',prepared_at:app.now().toISOString(),event_id:id,scope_sha256:scope,binding_sha256:policy};o.requests[logical]=structuredClone(expected);bump(s,app);},{configFingerprint:hash(c)});
 try{
  await provider.checkSlot(b);
  await app.change((s,actual)=>{fence.validate(s,actual);check(expected.status==='Reserved','Booking already dispatched');expected={...expected,status:'Uncertain',dispatch_started_at:app.now().toISOString(),dispatch_claim:randomUUID()};s.operations.requests[logical]=structuredClone(expected);bump(s,app);},{configFingerprint:hash(c)});
  await fence.read();
  const inserted=await provider.insert(b,id,scope);await fence.read();check(inserted.id===id&&inserted.organizer?.email===c.google_calendar.account&&inserted.organizer.self===true,'Insert receipt identity differs; reconcile exact reserved event');
  return await reconcileGoogleMeeting(app,input,{actor,env,...options});
 }catch{await app.change((s,actual)=>{const q=s.operations?.requests?.[logical];if(hash(actual)===hash(c)&&hash(q??null)===hash(expected)&&q.status!=='Verified'){q.status='Uncertain';s.operations.holds[input.booking_id]='Creation or verification is uncertain; reconcile exact event ID only, never recreate';bump(s,app);}});return {booking_id:input.booking_id,status:'Uncertain'};}
}
export async function reconcileGoogleMeeting(app,input,{actor,env=process.env,...options}){
 options.signal??=AbortSignal.timeout(40000);
 options.calendarDeadline??=+app.now()+40000;
 const c=await app.loadConfig(),policy=capability(app,c,env,actor),s=await app.snapshot(),b=current(s,c,input.booking_id,actor),logical=input.booking_id+'-create',q=s.operations?.requests?.[logical];
 check(q?.logical===logical&&q.operation==='booking_create'&&q.transport==='google-calendar-v1'&&q.event_id==='e'+hash({run:c.run_id,booking:input.booking_id})&&['Reserved','Uncertain','Verified'].includes(q.status)&&q.binding_sha256===policy&&q.scope_sha256===hash({booking:b,policy}),'Existing exact booking intent and unchanged grant required');
 let expected=q,finalized=false,effect;const claim=randomUUID(),fence=bookingFence(app,c,input.booking_id,actor,env,options,()=>expected);
 await app.change((state,actual)=>{fence.validate(state,actual);expected={...expected,read_claim:claim};state.operations.requests[logical]=structuredClone(expected);bump(state,app);},{configFingerprint:hash(c)});
 const provider=providerFor(c,options,app,()=>fence.read());
 try{await provider.preflight(b.mode);const receipt=await provider.read(b,q.event_id,q.scope_sha256);
  await app.change((state,actual)=>{fence.validate(state,actual);expected={...expected,status:'Verified',receipt};state.operations.requests[logical]=structuredClone(expected);finalized=true;state.operations.bookings[input.booking_id]={...receipt,scope_sha256:hash(b),verified:true};delete state.operations.holds[input.booking_id];const eid='booking-'+hash(input.booking_id).slice(0,32);state.operations.effects[eid]??={event:{id:eid,prospect_id:b.prospect_id,type:'meeting_verified',at:app.now().toISOString(),data:receipt}};effect=structuredClone(state.operations.effects[eid]);if(state.prospects[b.prospect_id].meeting?.event_id===receipt.event_id)state.prospects[b.prospect_id].meeting={...state.prospects[b.prospect_id].meeting,...receipt,current_status:'Verified'};bump(state,app);},{configFingerprint:hash(c)});
  const eid='booking-'+hash(input.booking_id).slice(0,32),fresh=await fence.read(),guarded=Object.create(app);check(hash(fresh.operations.effects[eid])===hash(effect),'Exact Calendar effect changed');
  guarded.change=(fn,changeOptions)=>app.change((state,actual)=>{fence.validate(state,actual);check(hash(state.operations.effects[eid])===hash(effect),'Exact Calendar effect changed');return fn(state);},{...changeOptions,configFingerprint:hash(c)});
  await guarded.apply(effect.event,{actor:'provider'});
  await fence.read();
  return {booking_id:input.booking_id,status:'Verified',receipt};
 }catch{await app.change((state,actual)=>{const saved=state.operations?.requests?.[logical];if(finalized||hash(actual)!==hash(c)||hash(saved??null)!==hash(expected))return;saved.status='Uncertain';state.operations.holds[input.booking_id]='Exact event unavailable, changed or conference incomplete; no duplicate create';const booking=state.operations.bookings[input.booking_id];if(booking?.id===q.event_id&&booking.scope_sha256===hash(b))booking.verified=false;const r=state.prospects[b.prospect_id];if(r?.meeting?.event_id===q.event_id)r.meeting.current_status='Needs review';bump(state,app);});return {booking_id:input.booking_id,status:'Uncertain'};}
}
