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
  const config={sender:{email:'hello@evzdigital.studio',postal_address:'',operator_names:{owner:'Owner Test',friend:'Friend Test'}},follow_up:{sender_verified:true,demo_verified:true,booking_url:'https://calendar.app.google/example'}};
  const message=composeFollowUp({name:'STUDIO TEST Oakline',contact:{email:'owner@example.invalid'}},{outcome:'no_answer',focus:'ai'},config);
  assert.equal(message.postal_address,'');
  assert.doesNotMatch(message.text,/Business mailing address pending/);
  const html=renderFollowUpHtml(message);
  assert.doesNotMatch(html,/Business mailing address pending/);
  assert.ok(html.includes('Reply “stop”'));
  assert.deepEqual(followUpSetupIssues(config),['Choose the business mailing address for the footer']);
});
async function setup(t,{operatorNames}={}){const directory=await mkdtemp(join(tmpdir(),'evz-followup-'));t.after(()=>rm(directory,{recursive:true,force:true}));const config=structuredClone(initialConfig);if(operatorNames)config.sender.operator_names=operatorNames;config.follow_up.enabled=true;const app=await StudioLifecycle.initialize({directory,config,now:()=>new Date(at)});await app.apply(fixtureProspect('sample',at));return app;}
const call=(outcome='no_answer',extra={})=>({id:'call-one',prospect_id:'sample',type:'call_logged',at,data:{call_id:'call-one',performed_at:at,outcome,simulated:true,desk:true,note:'Explore AI enquiry handling. Private internal note: do not quote this.',...extra}});

test('a reviewed connected call keeps transcript, private notes and an unsent evidence-bound email revision separate',async t=>{
 const app=await setup(t);await app.apply(call('connected',{intent:'requested_info',focus:'ai'}));
 const original=structuredClone((await app.snapshot()).prospects.sample.follow_ups['call-one']);
 await app.apply({id:'transcript-one',prospect_id:'sample',type:'transcript_added',at,data:{call_id:'call-one',text:'Customer: Please send a website example. Our contact page is hard to find.',permission_confirmed:true}});
 let state=await app.snapshot(),r=state.prospects.sample;
 const proposal={schema_version:1,transcript_sha256:r.transcripts['call-one'].sha256,outcome:'requested_info',summary:'Customer requested a website example.',claims:[{claim:'You mentioned that your contact page is hard to find.',quote:'Our contact page is hard to find.'}],unknowns:['Project scope and budget'],callback_at:null};
 await app.apply({id:'assessment-one',prospect_id:'sample',type:'transcript_assessed',at,data:{call_id:'call-one',proposal,review:{verdict:'Accepted',proposal_sha256:hash(proposal),independent:true}}},{actor:'controlled-fixture'});
 state=await app.snapshot();r=state.prospects.sample;
 const revision={id:'draft-one',prospect_id:'sample',type:'follow_up_draft_saved',at,data:{call_id:'call-one',focus:'website',note_sha256:hash(r.calls['call-one'].note),proposal_sha256:r.proposals['call-one'].sha256,claim_indexes:[0],customer_context:'You mentioned that your contact page is hard to find.',reviewed:true}};
 for(const [patch,message] of [[{reviewed:false},/Review the customer wording/],[{focus:'undecided'},/relevant service focus/],[{proposal_sha256:hash('stale')},/exact current transcript/],[{claim_indexes:[99]},/Select supported/],[{claim_indexes:[0,0]},/Select supported/],[{customer_context:'<script>unsafe</script>'},/plain-text/]])await assert.rejects(app.apply({...revision,id:'invalid-draft',data:{...revision.data,...patch}}),message);
 await app.apply(revision,{actor:'friend'});state=await app.snapshot();r=state.prospects.sample;
 assert.deepEqual(r.follow_ups['call-one'],original);assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);
 const draft=r.follow_up_drafts[0];assert.equal(draft.status,'Draft');assert.equal(draft.actor,'friend');assert.equal(draft.content.focus,'website');assert.match(draft.content.body,/contact page is hard to find/);assert.doesNotMatch(draft.content.text,/Private internal note/);assert.match(draft.content.demo_url,/homekind-motion/);assert.equal(draft.transcript_sha256,proposal.transcript_sha256);assert.equal(draft.source_follow_up_sha256,hash(original));
 assert.equal((await app.apply(revision,{actor:'friend'})).duplicate,true);assert.equal((await app.snapshot()).prospects.sample.follow_up_drafts.length,1);
 await assert.rejects(app.apply({id:'replace-transcript',prospect_id:'sample',type:'transcript_added',at,data:{call_id:'call-one',text:'A different transcript cannot replace the reviewed source.',permission_confirmed:true}}),/Supply one permitted transcript/);
 await app.change(s=>{s.prospects.sample.transcripts['call-one'].sha256=hash('changed transcript source');});
 await assert.rejects(app.apply({...revision,id:'changed-transcript-draft'}),/exact current transcript/);
 await app.change(s=>{s.prospects.sample.transcripts['call-one'].sha256=proposal.transcript_sha256;});
 await app.apply({id:'note-change',prospect_id:'sample',type:'call_note_updated',at,data:{call_id:'call-one',note:'Website example; keep internal pricing private.'}});
 await assert.rejects(app.apply({...revision,id:'stale-draft'}),/notes changed/);
 const reopened=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)});assert.deepEqual((await reopened.snapshot()).prospects.sample.follow_up_drafts[0],draft);
 // An already handed-off or delivered email cannot be changed by preparing a later draft.
 await app.change(s=>{s.actions[original.action_id].status='Verified';s.prospects.sample.follow_ups['call-one'].status='Sent';s.operations??={};s.operations.requests??={};s.operations.requests[`${original.action_id}-intent`]={status:'Done',content_sha256:hash(original.content)};});
 state=await app.snapshot();const bound=structuredClone(state.prospects.sample.follow_ups['call-one']),intent=structuredClone(state.operations.requests[`${original.action_id}-intent`]);
 await app.apply({...revision,id:'draft-after-delivery',data:{...revision.data,note_sha256:hash(state.prospects.sample.calls['call-one'].note)}});
 state=await app.snapshot();assert.deepEqual(state.prospects.sample.follow_ups['call-one'],bound);assert.deepEqual(state.operations.requests[`${original.action_id}-intent`],intent);assert.equal(Object.values(state.actions).filter(a=>a.type==='email').length,1);
 await app.apply({id:'reply-after-review',prospect_id:'sample',type:'reply_received',at,data:{source_id:'reply-after-review',kind:'reply'}},{actor:'provider'});
 await assert.rejects(app.apply({...revision,id:'draft-after-reply',data:{...revision.data,note_sha256:hash(state.prospects.sample.calls['call-one'].note)}}),/replies need their own review/);
 await app.apply({id:'stop-after-review',prospect_id:'sample',type:'contact_stopped',at,data:{reason:'do_not_contact'}});
 await assert.rejects(app.apply({...revision,id:'draft-after-stop'}),/Restriction cannot be cleared/);
});

test('saving an unanswered attempt prepares exactly one follow-up across replay, note correction and restart',async t=>{
 const app=await setup(t),event=call('voicemail');await app.apply(event);const first=await app.snapshot(),entry=first.prospects.sample.follow_ups['call-one'];
 assert.equal(entry.status,'Prepared');assert.match(entry.content.body,/I tried calling/);assert.doesNotMatch(entry.content.body,/Thanks for speaking|Private internal note/);assert.equal(entry.content.focus,'ai');
 assert.equal(Object.values(first.actions).filter(a=>a.type==='email').length,1);
 assert.equal((await app.apply(event)).duplicate,true);
 await app.apply({id:'note-fix',prospect_id:'sample',type:'call_note_updated',at,data:{call_id:'call-one',note:'Now discussing website work; this is a historical correction.'}});
 const reopened=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)}),saved=await reopened.snapshot();
 assert.deepEqual(saved.prospects.sample.follow_ups['call-one'],entry);assert.equal(Object.values(saved.actions).filter(a=>a.type==='email').length,1);
});
test('an unanswered call without a reviewed service focus stays task-only until a relevant message can be prepared',async t=>{
 const app=await setup(t);await app.apply(call('voicemail',{note:''}));const state=await app.snapshot(),entry=state.prospects.sample.follow_ups['call-one'];
 assert.equal(entry.status,'Held');assert.match(entry.reason,/specific, reviewed service focus/);assert.equal(entry.content.focus,'undecided');
 assert.equal(Object.values(state.actions).some(action=>action.type==='email'),false);assert.doesNotMatch(renderFollowUpHtml(entry.content),/voice-demo-preview|independent demonstrations|Open example/);
});
test('call two is due the next business day and the final unanswered email waits three days after it is logged',async t=>{
 const app=await setup(t),friday='2026-10-23T15:00:00.000Z';app.now=()=>new Date(friday);
 const first=call('voicemail');first.at=friday;first.data.performed_at=friday;await app.apply(first);
 let state=await app.snapshot(),firstTask=Object.values(state.actions).find(a=>a.prospect_id==='sample'&&a.type==='call_task'&&a.status==='Queued');
 assert.equal(firstTask.payload.due_at,'2026-10-26T15:00:00.000Z');assert.equal(state.prospects.sample.follow_ups['call-one'].send_after,friday);
 const second=call('no_answer');second.id='call-two-event';second.at=friday;second.data.call_id='call-two';second.data.performed_at=friday;await app.apply(second);
 state=await app.snapshot();const final=state.prospects.sample.follow_ups['call-two'];assert.equal(final.send_after,'2026-10-28T15:00:00.000Z');assert.equal(state.actions[final.action_id].payload.due_at,final.send_after);
 await assert.rejects(app.apply({id:'early-final-email',prospect_id:'sample',type:'email_delivered',at:friday,data:{action_id:final.action_id,message_id:'too-soon',simulated:true}},{actor:'provider'}),/cannot be delivered before its due time/);
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
test('busy and agreed callbacks create call tasks only',async t=>{
 for(const outcome of ['busy','callback']){const app=await setup(t),event=call(outcome,{callback_at:outcome==='callback'?'2026-10-19T16:00:00.000Z':undefined});delete event.data.desk;await app.apply(event);const state=await app.snapshot();assert.equal(Object.keys(state.prospects.sample.follow_ups??{}).length,0);assert.equal(Object.values(state.actions).some(a=>a.type==='email'),false);assert.equal(Object.values(state.actions).some(a=>['call_task','callback_task'].includes(a.type)),true);}
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
 const app=await setup(t);await app.apply(call('no_answer',{focus:'website'}));const r=(await app.snapshot()).prospects.sample,c={follow_up:{enabled:true,booking_url:'https://calendar.app.google/example'},sender:{postal_address:'CONTROLLED TEST ADDRESS'}};const m=nativeMessage(r,1,c,'call-one');assert.doesNotMatch(m.body,/voice-demo-preview|voice-agent example|AI receptionist demo/);assert.match(m.body,/homekind-motion/);assert.match(m.body,/Home-service website demonstration/);assert.match(m.body,/CONTROLLED TEST ADDRESS/);assert.match(m.body,/EVZ Digital team/);assert.match(m.body,/calendar.app.google/);assert.doesNotMatch(m.body,/Private internal note|{{/);
});
test('the branded template escapes business text, preserves team identity and holds incomplete setup',()=>{
 const record={name:'Oakline <script>alert(1)</script>',contact:{name:'Jordan Lee',email:'jordan@oakline.example'}};
 const message=composeFollowUp(record,{outcome:'no_answer',focus:'ai'},{sender:{postal_address:''}}),html=renderFollowUpHtml(message);
 assert.match(html,/hello@evzdigital\.studio/);assert.match(html,/EVZ Digital team/);assert.match(html,/voice-demo-preview\.png/);assert.match(html,/evz-wordmark\.png/);assert.doesNotMatch(html,/<script>|javascript:/);assert.match(message.body,/I tried calling/);assert.equal(followUpSetupIssues({}).length,5);
});

test('each call focus links to its matching example and only AI uses the voice-demo image',()=>{
 const record={name:'SYNTHETIC Comfort HVAC',business_type:{category:'home-services',subtype:'HVAC'},contact:{email:'owner@example.invalid'}};
 const website=composeFollowUp(record,{focus:'website'}),systems=composeFollowUp(record,{focus:'systems'}),ai=composeFollowUp(record,{focus:'ai'});
 assert.match(website.demo_url,/homekind-motion/);assert.equal(website.preview_image,null);assert.doesNotMatch(website.text,/AI receptionist|voice-demo/);
 assert.match(systems.demo_url,/relay-motion/);assert.equal(systems.preview_image,null);assert.match(ai.demo_url,/studio\/demos\/voice/);assert.match(ai.preview_image,/voice-demo-preview/);
 assert.match(renderFollowUpHtml(website),/View a short project example/);assert.doesNotMatch(renderFollowUpHtml(website),/Hear a sample call/);
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

test('follow-up signature uses the responsible operator name and keeps both names as a release gate',()=>{
 const config={sender:{operator_names:{owner:'Owner Test',friend:'Friend & Test'}}};
 const message=composeFollowUp({name:'SYNTHETIC Comfort HVAC',contact:{email:'office@example.invalid'}},{actor:'friend',focus:'website'},config);
 assert.equal(message.sender_name,'Friend & Test');assert.match(message.text,/Best,\nFriend & Test\nAI solutions/);
 assert.match(renderFollowUpHtml(message),/Friend &amp; Test/);
 assert.equal(composeFollowUp({}, {actor:'constructor'}, {sender:{operator_names:{constructor:'Unexpected Name'}}}).sender_name,'EVZ Digital team');
 assert.ok(followUpSetupIssues({sender:{operator_names:{owner:'Owner Test'}}}).some(issue=>/both operator display names/.test(issue)));
 assert.ok(followUpSetupIssues({sender:{operator_names:{owner:'Owner Test',friend:'Friend Test\nBad'}}}).some(issue=>/both operator display names/.test(issue)));
});

test('the saved call actor owns the follow-up sender name',async t=>{
 const app=await setup(t,{operatorNames:{owner:'Owner Test',friend:'Friend Test'}});
 await app.apply(call('voicemail'),{actor:'friend'});
 const entry=(await app.snapshot()).prospects.sample.follow_ups['call-one'];
 assert.equal(entry.content.sender_name,'Friend Test');assert.match(entry.content.text,/Best,\nFriend Test\nAI solutions/);
});
