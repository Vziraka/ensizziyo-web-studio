import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {composeFollowUp,renderFollowUpHtml,followUpSetupIssues} from './follow-up-template.mjs';
import {approvedFollowUp,nativeMessage} from './production.mjs';
const at='2026-10-19T15:00:00Z';
test('blank postal address is omitted from the preview while commercial setup stays held',()=>{
  const config={sender:{email:'hello@evzdigital.studio',postal_address:''},follow_up:{sender_verified:true,demo_verified:true,booking_url:'https://calendar.app.google/example'}};
  const message=composeFollowUp({name:'STUDIO TEST Oakline',contact:{email:'owner@example.invalid'}},{outcome:'no_answer',focus:'ai'},config);
  assert.equal(message.postal_address,'');
  assert.doesNotMatch(message.text,/Business mailing address pending/);
  const html=renderFollowUpHtml(message);
  assert.doesNotMatch(html,/Business mailing address pending/);
  assert.ok(html.includes('Reply “stop”'));
  assert.deepEqual(followUpSetupIssues(config),['Choose the business mailing address for the footer']);
});
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'evz-followup-'));t.after(()=>rm(directory,{recursive:true,force:true}));const config=structuredClone(initialConfig);config.follow_up.enabled=true;const app=await StudioLifecycle.initialize({directory,config,now:()=>new Date(at)});await app.apply(fixtureProspect('sample',at));return app;}
const call=(outcome='no_answer',extra={})=>({id:'call-one',prospect_id:'sample',type:'call_logged',at,data:{call_id:'call-one',performed_at:at,outcome,simulated:true,desk:true,note:'Explore AI enquiry handling. Private internal note: do not quote this.',...extra}});

test('saving an unanswered attempt prepares exactly one follow-up across replay, note correction and restart',async t=>{
 const app=await setup(t),event=call('voicemail');await app.apply(event);const first=await app.snapshot(),entry=first.prospects.sample.follow_ups['call-one'];
 assert.equal(entry.status,'Prepared');assert.match(entry.content.body,/I tried calling/);assert.doesNotMatch(entry.content.body,/Thanks for speaking|Private internal note/);assert.equal(entry.content.focus,'ai');
 assert.equal(Object.values(first.actions).filter(a=>a.type==='email').length,1);
 assert.equal((await app.apply(event)).duplicate,true);
 await app.apply({id:'note-fix',prospect_id:'sample',type:'call_note_updated',at,data:{call_id:'call-one',note:'Now discussing website work; this is a historical correction.'}});
 const reopened=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)}),saved=await reopened.snapshot();
 assert.deepEqual(saved.prospects.sample.follow_ups['call-one'],entry);assert.equal(Object.values(saved.actions).filter(a=>a.type==='email').length,1);
});
test('a connected owner-reported conversation prepares personal copy and replies cancel it',async t=>{
 const app=await setup(t);await app.apply(call('connected',{intent:'requested_info',focus:'systems'}));let state=await app.snapshot(),record=state.prospects.sample,entry=record.follow_ups['call-one'];
 assert.match(entry.content.body,/Thanks for speaking/);assert.equal(entry.content.focus,'systems');assert.equal(approvedFollowUp(record,state.actions[entry.action_id],app.config),true);
 await app.apply({id:'reply-one',prospect_id:'sample',type:'reply_received',at,data:{source_id:'provider-reply',kind:'reply'}},{actor:'provider'});
 state=await app.snapshot();record=state.prospects.sample;assert.equal(record.follow_ups['call-one'].status,'Cancelled');assert.equal(state.actions[entry.action_id].status,'Cancelled');assert.equal(approvedFollowUp(record,state.actions[entry.action_id],app.config),false);
});
test('declines, stop requests and skipped calls never prepare automatic email',async t=>{
 for(const outcome of ['declined','do_not_contact','wrong_contact','skipped']){const app=await setup(t);await app.apply(call(outcome));const state=await app.snapshot();assert.equal(Object.keys(state.prospects.sample.follow_ups??{}).length,0);assert.equal(Object.values(state.actions).some(a=>a.type==='email'),false);}
});
test('missing email leaves an explicit held follow-up and never guesses a recipient',async t=>{
 const app=await setup(t);await app.change(s=>{s.prospects.sample.contact.email=null;s.prospects.sample.contact.verified=false;});await app.apply(call());const state=await app.snapshot(),entry=state.prospects.sample.follow_ups['call-one'];assert.equal(entry.status,'Held');assert.match(entry.reason,/verified business email/);assert.equal(entry.content.to,null);assert.equal(Object.values(state.actions).some(a=>a.type==='email'),false);
});
test('an unsent call can be undone without leaving a deliverable follow-up',async t=>{
 const app=await setup(t);await app.apply(call());await app.apply({id:'undo-one',prospect_id:'sample',type:'call_undone',at,data:{call_id:'call-one'}});const state=await app.snapshot();assert.equal(state.prospects.sample.calls['call-one'],undefined);assert.equal(Object.values(state.actions).some(a=>a.type==='email'&&a.status==='Queued'),false);
});
test('a completed native handoff cannot be undone into an orphaned live email',async t=>{
 const app=await setup(t);await app.apply(call());const entry=(await app.snapshot()).prospects.sample.follow_ups['call-one'];await app.change(s=>{s.operations??={};s.operations.requests??={};s.operations.requests[`${entry.action_id}-intent`]={status:'Done'};});await assert.rejects(app.apply({id:'undo-released',prospect_id:'sample',type:'call_undone',at,data:{call_id:'call-one'}}),/native email handoff/);assert.equal((await app.snapshot()).prospects.sample.calls['call-one'].outcome,'no_answer');
});
test('native handoff includes the full branded HTML, actual footer and relevant topic demo',async t=>{
 const app=await setup(t);await app.apply(call('busy',{focus:'website'}));const r=(await app.snapshot()).prospects.sample,c={follow_up:{enabled:true,booking_url:'https://calendar.app.google/example'},sender:{postal_address:'CONTROLLED TEST ADDRESS'}};const m=nativeMessage(r,1,c,'call-one');assert.match(m.body,/<img.*voice-demo-preview/);assert.match(m.body,/homekind-motion/);assert.match(m.body,/CONTROLLED TEST ADDRESS/);assert.match(m.body,/EVZ Digital team/);assert.match(m.body,/calendar.app.google/);assert.doesNotMatch(m.body,/Private internal note|{{/);
});
test('the branded template escapes business text, preserves team identity and holds incomplete setup',()=>{
 const record={name:'Oakline <script>alert(1)</script>',contact:{name:'Jordan Lee',email:'jordan@oakline.example'}};
 const message=composeFollowUp(record,{outcome:'no_answer',focus:'ai'},{sender:{postal_address:''}}),html=renderFollowUpHtml(message);
 assert.match(html,/hello@evzdigital\.studio/);assert.match(html,/EVZ Digital team/);assert.match(html,/voice-demo-preview\.png/);assert.match(html,/evz-wordmark\.png/);assert.doesNotMatch(html,/<script>|javascript:/);assert.match(message.body,/I tried calling/);assert.equal(followUpSetupIssues({}).length,4);
});

test('a researched owner cannot make the preview greeting differ from the saved follow-up',async t=>{
 const app=await setup(t);await app.change(s=>{const r=s.prospects.sample;delete r.contact.name;r.owner_contact={bound_contact_sha256:hash(r.contact),reviewed_at:at,person:{name:'Riley Test',role:'Owner',source:{checked_at:at}}};});
 const view=await app.dashboard();assert.equal(view.prospects.sample.owner_contact_view.person.name,'Riley Test');const event=call('voicemail'),preview=composeFollowUp(view.prospects.sample,event.data,app.config);
 await app.apply(event);const entry=(await app.snapshot()).prospects.sample.follow_ups['call-one'];assert.deepEqual(entry.content,preview);assert.equal(preview.paragraphs[0],'Hi,');
});

test('the greeting uses a source-linked owner email only for that recipient and preserves confirmed names',()=>{
 const record={name:'SYNTHETIC Comfort HVAC',contact:{email:'riley@example.invalid'},research_profile:{business_email:{email:'riley@example.invalid',kind:'Owner/operator business',person_name:'Riley Test'}}};
 assert.equal(composeFollowUp(record).paragraphs[0],'Hi Riley,');record.contact.email='office@example.invalid';assert.equal(composeFollowUp(record).paragraphs[0],'Hi,');record.contact.name='Sam Confirmed';assert.equal(composeFollowUp(record).paragraphs[0],'Hi Sam,');record.verification={conversation:{decision_maker:'Taylor Confirmed'}};assert.equal(composeFollowUp(record).paragraphs[0],'Hi Taylor,');
});
