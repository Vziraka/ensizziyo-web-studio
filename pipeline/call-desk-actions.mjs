import { join } from 'node:path';
import { check, hash, businessDate } from './lifecycle.mjs';
import { readJson } from './engine.mjs';
import { requireProductionRelease } from './production.mjs';
import { AppConnectors } from './app-connectors.mjs';
import { meetingSlots, sessionSummary } from './call-desk.mjs';

const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const email=v=>typeof v==='string'&&/^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/.test(v);
const unpack=r=>{check(!r.isError,'Connector returned an error');if(r.structuredContent)return r.structuredContent;for(const c of r.content??[])if(c.type==='text'){try{return JSON.parse(c.text);}catch{}}throw Error('Connector returned no structured receipt');};
export async function callingSession(app,input) {
  return app.change(state=>{
    check(['start','end'].includes(input.action),'Choose start or end');
    if(input.action==='start') { if(!state.calling_session||state.calling_session.ended_at) state.calling_session={started_at:app.now().toISOString()}; }
    else {check(state.calling_session,'Start a calling session first');if(!state.calling_session.ended_at){state.calling_session.summary=sessionSummary(state,state.calling_session.started_at);state.calling_session.ended_at=app.now().toISOString();}}
    state.revision++; return state.calling_session;
  });
}
export async function saveInformationDraft(app,input) {
  return app.change(state=>{
    check(input.revision===state.revision,'Record changed; refresh before saving');
    const r=state.prospects[input.prospect_id];
    check(r&&!r.restriction&&['Discovery','Information requested'].includes(r.stage),'Confirm the interested conversation first');
    check(email(input.to)&&(!r.controlled||input.to.endsWith('@example.invalid')),'Enter one confirmed business email');
    check(typeof input.subject==='string'&&input.subject.trim()&&input.subject.length<=200&&!/[\r\n]/.test(input.subject),'Use a single subject line');
    check(typeof input.body==='string'&&input.body.trim()&&input.body.length<=6000,'Keep the message within 6000 characters');
    check(input.recipient_confirmed===true,'Confirm the recipient requested this information');
    const draft={to:input.to,subject:input.subject,body:input.body,recipient_confirmed:true};
    const fingerprint=hash(draft); const prior=r.information_draft;
    check(!prior||!['Sending','Uncertain'].includes(prior.status),'Reconcile the pending message before changing it');
    check(prior?.status!=='Sent','This information message was already sent');
    r.information_draft={...draft,fingerprint,status:'Draft',saved_at:app.now().toISOString()};state.revision++;
    return r.information_draft;
  });
}
export async function sendInformation(app,input,{connect=()=>new AppConnectors()}={}) {
  check(key(input.prospect_id)&&typeof input.fingerprint==='string','Choose the exact saved draft');
  let client;
  try {
    const c=await readJson(join(app.directory,'lifecycle-config.json'));
    if(c.mode==='production') requireProductionRelease(c);
    await app.change(state=>{
      const r=state.prospects[input.prospect_id],d=r?.information_draft;
      check(r&&!r.restriction&&['Discovery','Information requested'].includes(r.stage)&&d?.fingerprint===input.fingerprint,'Message or conversation changed; review it again');
      if(['Sent','Simulated'].includes(d.status))return;
      check(d.status==='Draft'&&input.approved===true,'This send is already reserved or needs exact approval; never resend an uncertain message');
      check(c.mode==='controlled'||c.operations.allowlist.includes(r.id),'Message is outside the approved campaign');
      if(c.mode==='production') {
        const today=businessDate(app.now());
        const reserved=Object.values(state.prospects).filter(p=>p.information_draft?.approved_at&&businessDate(p.information_draft.approved_at)===today).length;
        const native=Object.values(state.operations?.requests??{}).filter(q=>['send','intent'].includes(q.operation)&&q.prepared_at&&businessDate(q.prepared_at)===today).length;
        check(reserved+native<c.sender.daily_email_limit,'Daily sender allowance is reserved; continue on the next business day');
      }
      d.status=c.mode==='controlled'?'Simulated':'Sending';d.approved_at=app.now().toISOString();state.revision++;
    });
    let d=(await app.snapshot()).prospects[input.prospect_id].information_draft;
    if(d.status!=='Sending')return d;
    client=connect();await client.connect();
    const profile=unpack(await client.call('mcp__codex_apps__gmail_get_profile',{}));
    check(profile.email===c.sender.email,'Business sender differs from the connected Gmail account');
    // The durable reservation precedes all network effects. A lost receipt never authorizes a resend.
    await app.change(async state=>{
      const current=await readJson(join(app.directory,'lifecycle-config.json'));requireProductionRelease(current);
      const r=state.prospects[input.prospect_id];d=r.information_draft;
      check(!r.restriction&&['Discovery','Information requested'].includes(r.stage)&&d.status==='Sending'&&d.fingerprint===input.fingerprint&&current.sender.email===profile.email,'Approval changed before dispatch');
      try {
        const receipt=unpack(await client.call('mcp__codex_apps__gmail_send_email',{to:d.to,from_address:profile.email,subject:d.subject,payload:{mime_type:'text/plain',body:{content:d.body}}}));
        check(key(receipt.id)&&key(receipt.thread_id),'Send returned no authoritative message identity');
        d.status='Sent';d.message_id=receipt.id;d.thread_id=receipt.thread_id;d.sent_at=app.now().toISOString();
      } catch(error){d.status='Uncertain';d.error='Delivery could not be confirmed. Inspect the sender Sent folder; do not resend.';}
      state.revision++;
    });
    return (await app.snapshot()).prospects[input.prospect_id].information_draft;
  } catch(error) {
    await app.change(state=>{const d=state.prospects[input.prospect_id]?.information_draft;if(d?.status==='Sending'){d.status='Uncertain';d.error=error.message;state.revision++;}});
    throw error;
  } finally {await client?.close();}
}
export async function availableMeetingSlots(app,{connect=()=>new AppConnectors()}={}) {
  const c=await readJson(join(app.directory,'lifecycle-config.json')),now=app.now();
  if(c.mode==='controlled')return {slots:meetingSlots(now),checked_at:now.toISOString(),simulated:true};
  check(c.calendar.owner_email&&c.calendar.calendar_id,'Verify the business calendar connection before checking slots');
  let client;
  try {
    client=connect();await client.connect();
    const p=unpack(await client.call('mcp__codex_apps__google_calendar_get_profile',{}));check(p.email===c.calendar.owner_email,'Calendar account changed');
    const a=unpack(await client.call('mcp__codex_apps__google_calendar_get_availability',{calendar_ids:[c.calendar.calendar_id],time_min:now.toISOString(),time_max:new Date(+now+11*86400000).toISOString(),response_timezone_str:'America/New_York'}));
    check(a.calendars?.length===1&&a.calendars[0].calendar_id===c.calendar.calendar_id&&!a.calendars[0].errors,'Calendar availability is incomplete');
    return {slots:meetingSlots(now,a.calendars[0].busy),checked_at:now.toISOString(),simulated:false};
  }finally{await client?.close();}
}
