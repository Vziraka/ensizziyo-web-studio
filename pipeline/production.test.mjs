import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle, initialConfig, hash } from './lifecycle.mjs';
import { fixtureProspect } from './lifecycle-fixtures.mjs';
import { saveJson } from './engine.mjs';
import { productionConfig, releaseFingerprint, requireProductionRelease, approveProductionRelease, approveCallRelease, callReleaseFingerprint, ProductionOperations, NativeProofOperations, operationsFor, importResearch, importVerification, syncResearchImports, queueMeeting, pauseStudio, nativeMessage,nativeProofMessage } from './production.mjs';
import { researchCallPrep } from './call-prep.mjs';
import { dailyCallQueue } from './call-queue.mjs';
import { intakeCandidate, reviewFiles, reviewTemplate, prospectPurpose } from './prospects.mjs';
import { sourceContentHash } from './sources.mjs';
import { controlledThread, operationNames } from './lifecycle-operations.mjs';
import { operationsTick } from './operations-service.mjs';

const at = '2026-10-19T14:00:00.000Z', owner = 'studio@example.com';

test('the spoken opening preserves the evidence beside it without reciting research caveats', () => {
  const fact = 'The published cookie range includes dietary labels; safety and availability were not independently tested.';
  const f = { job: { business_name: 'SYNTHETIC Bakery' }, snapshots: { sources: [{ url: 'https://example.com/', fetched_at: at }] },
    report: { unknowns: ['Internal systems unverified.'], observations: [{ fact, evidence: [{ url: 'https://example.com/', excerpt: 'Cookies' }] }], opportunities: [{ observed_basis: fact, proposed_solution: 'An optional gift request.', possible_effect: 'A hypothesis.', existing_alternatives: ['Existing email'], validation_needed: 'Check current tools.', owner_question: 'Would a gift request help?' }] } };
  const prep = researchCallPrep(f, { opportunity_index: 0, observations: [{ index: 0, supported: true }] }, at);
  assert.equal(prep.observations[0].fact, fact);
  assert.ok(prep.opening.includes('SYNTHETIC Bakery'));
  assert.ok(prep.opening.includes('Cookies'));
  assert.ok(!prep.opening.includes(fact));
  assert.equal(prep.questions[0], 'Would a gift request help?');
});

test('native email introduces the retained enhancement and owner question without research commentary', () => {
  const record = { name: 'SYNTHETIC Bakery', idea: 'INTERNAL RESEARCH COMMENTARY', call_prep: { hypothesis: 'An optional gift-order request.', questions: ['Would this complement your current email process?'] } };
  const c = { sender: { website: 'https://example.com', postal_address: 'SYNTHETIC POSTAL ADDRESS' } };
  const message = nativeMessage(record, 1, c);
  assert.ok(message.body.includes(record.call_prep.hypothesis));
  assert.ok(message.body.includes(record.call_prep.questions[0]));
  assert.ok(!message.body.includes(record.idea));
  assert.ok(message.body.includes('I tried calling SYNTHETIC Bakery'));
  assert.ok(message.body.includes('Reply "stop"'));
  assert.throws(() => nativeMessage({ ...record, call_prep: { hypothesis: {}, questions: ['A question?'] } }, 1, c), /reviewed enhancement/);
});
test('the legacy native email caller signs with the saved call actor',()=>{
  const record={name:'SYNTHETIC Bakery',idea:'A fictional enhancement',call_prep:{hypothesis:'A relevant improvement.',questions:['Would this help?']},calls:{'call-one':{actor:'friend'}}};
  const c={sender:{website:'https://example.com',postal_address:'SYNTHETIC ADDRESS',operator_names:{owner:'Owner Test',friend:'Friend Test'}}};
  const message=nativeMessage(record,1,c,'call-one');assert.match(message.body,/Best,\nFriend Test\nhello@evzdigital\.studio/);
});

async function setup(t, released = true, outcome = 'no_answer', followUp = false) {
  const directory = await mkdtemp(join(tmpdir(), 'evz-production-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const config = structuredClone(productionConfig); let now = new Date(at);
  config.calendar = { ...config.calendar, owner_email: owner, calendar_id: 'primary' }; config.apollo.user_id = 'owned-user';
  config.sender = { email: 'hello@evzdigital.studio', account_email: owner, mailbox_id: 'business-mailbox', postal_address: 'TEST POSTAL ADDRESS — synthetic fixture', website: 'https://example.com', daily_email_limit: 20, operator_names: { owner: 'Owner Test', friend: 'Friend Test' } };
  config.operations.enabled = true; config.operations.allowlist = ['synthetic-cafe'];
  config.native_email = { enabled: true, rounds: [1, 2].map(round => ({ round, list_id: `list-${round}`, list_name: `EVZ TEST round ${round}`, sequence_id: `sequence-${round}`, sequence_name: `EVZ TEST one-email ${round}`, subject_field_id: `subject-${round}`, body_field_id: `body-${round}`, verified: true })) };
  if(followUp){Object.assign(config.sender,{email:'hello@evzdigital.studio',account_email:owner});config.follow_up={enabled:true,sender_verified:true,demo_verified:true,booking_url:'https://calendar.app.google/synthetic'};Object.assign(config.native_email,{html_verified:true,template_version:'evz-personal-large-demo-v1'});}
  for (const key of Object.keys(config.readiness)) { config.readiness[key] = true; config.readiness_evidence[key] = 'fixture:independent verification only'; }
  const app = await StudioLifecycle.initialize({ directory, config, now: () => now });
  if (released) await approveProductionRelease(app, releaseFingerprint(config), 'human-final-fixture-approval');
  const data = { company_id: 'synthetic-company', name: 'SYNTHETIC Café', category: 'Food / beverage', controlled: false, idea: 'A complementary preorder page could help customers choose pickup details.',
    contact: { email: 'cafe@example.net', phone: '+1 202 555 0100', verified: true, checked_at: at, source: 'https://example.net/contact' },
    qualification: { verdict: 'Research-qualified', independent_review: 'Accepted', checked_at: at, report_sha256: 'a'.repeat(64), review_sha256: 'b'.repeat(64), evidence_ref: 'fixture:retained source/review' } };
  await app.apply({ id: 'imported', prospect_id: 'synthetic-cafe', type: 'prospect_imported', at, data }, { actor: 'research-import' });
  if (released && outcome) await app.apply({ id: 'call-event', prospect_id: 'synthetic-cafe', type: 'call_logged', at, data: { call_id: 'call-one', performed_at: at, outcome, simulated: false, ...(followUp?{desk:true,focus:'ai',note:'Discuss AI enquiry handling. PRIVATE BUDGET NOTE',...(outcome==='connected'?{intent:'requested_info'}:{})}:{}), ...(outcome === 'callback' ? { callback_at: '2026-10-20T14:00:00.000Z' } : {}) } });
  return { app, directory, data, config: app.config, advance(ms = 301000) { now = new Date(+now + ms); } };
}
function provider(c) {
  const calls = [], tasks = {}, person = { id: 'native-contact', account_id: 'native-account', email: 'cafe@example.net', owner_id: c.apollo.user_id, label_ids: [], typed_custom_fields: {}, phone_numbers: [{ raw_number: '+1 202 555 0100' }] };
  let sent, reply = false, finished = false, booking;
  const respond = r => {
    calls.push(r); const p = r.input;
    if (r.operation === 'apollo_profile') return { id: c.apollo.user_id };
    if (['gmail_profile', 'calendar_profile'].includes(r.operation)) return { email: owner };
    if (r.operation === 'contact') return { contacts: [{ ...person, contact_campaign_statuses: sent ? [{ emailer_campaign_id: 'sequence-1', status: finished ? 'finished' : 'active' }] : [] }] };
    if (r.operation === 'task_create') { const task = { ...p, id: `task-${Object.keys(tasks).length}` }; tasks[task.id] = task; return { task }; }
    if (r.operation === 'task_read') return { task: tasks[p.id] };
    if (r.operation === 'task_skip') { tasks[p.id].status = 'skipped'; return { task: tasks[p.id] }; }
    if (r.operation === 'fields') return { fields: c.native_email.rounds.flatMap(v => [{ id: v.subject_field_id, modality: 'contact', type: 'string' }, { id: v.body_field_id, modality: 'contact', type: 'textarea' }]) };
    if (r.operation === 'lists') return { labels: c.native_email.rounds.map(v => ({ id: v.list_id, name: v.list_name, modality: 'contacts' })) };
    if (r.operation === 'sequence') return { emailer_campaigns: [{ id: 'sequence-1', name: c.native_email.rounds[0].sequence_name, user_id: c.apollo.user_id, active: true, num_steps: 1, emailer_steps: [{ type: 'auto_email', wait_time: 0 }], mark_finished_if_reply: true, mark_paused_if_ooo: true }] };
    if (r.operation === 'mailboxes') return { email_accounts: [{ id: c.sender.mailbox_id, email: c.sender.email, user_id: c.apollo.user_id, active: true }] };
    if (r.operation === 'personalize') { Object.assign(person.typed_custom_fields, p.typed_custom_fields); return { contact: person }; }
    if (r.operation === 'intent') { person.label_ids.push('list-1'); sent = { id: 'native-sent', subject: person.typed_custom_fields['subject-1'] }; return { success: true }; }
    if (r.operation === 'gmail_search') return { message_ids: sent ? ['native-sent'] : [], next_page_token: null };
    if (r.operation === 'thread') {
      const h = (name, value) => ({ name, value });
      return { id: 'native-thread', messages: [{ id: sent.id, thread_id: 'native-thread', internal_date: String(Date.parse(at)), label_ids: ['SENT'], payload: { headers: [h('From', c.sender.email), h('To', person.email), h('Subject', sent.subject), h('Message-ID', '<native-original>')] } },
        ...(reply ? [{ id: 'native-reply', thread_id: 'native-thread', internal_date: String(Date.parse(at) + 1000), payload: { headers: [h('From', person.email), h('To', c.sender.email), h('Subject', `Re: ${sent.subject}`), h('In-Reply-To', '<native-original>')] } }] : [])] };
    }
    if (r.operation === 'stop') { finished = true; return { success: true }; }
    if (r.operation === 'busy') return { calendars: [{ calendar_id: 'primary', busy: [], errors: null }] };
    if (r.operation === 'booking_create') { booking = { id: 'agreed-event', summary: p.title, description: p.description, start: p.start_time, end: p.end_time, status: 'confirmed', visibility: 'private', transparency: 'opaque', reminders: { use_default: false }, organizer: { email: owner, is_self: true }, attendees: p.attendees.map(email => ({ email })) }; return booking; }
    if (r.operation === 'booking_read') return booking;
    throw Error(`Unexpected operation ${r.operation}`);
  };
  return { calls, person, respond, addReply() { reply = true; } };
}
async function drive(app, p, session = 'test-session') {
  const ops = operationsFor(app, session);
  for (let count = 0; count < 90; count++) {
    const r = await ops.next();
    if (!r.operation) { await ops.effects(); return r; }
    assert.equal((await ops.settle(r.key, { structuredContent: p.respond(r) })).status, 'Done');
  }
  throw Error('Bound exceeded');
}

test('a connected follow-up hands the full branded HTML to one native executor and survives restart without another intent',async t=>{
 const s=await setup(t,true,'connected',true),p=provider(s.config);await drive(s.app,p);
 let state=await s.app.snapshot(),r=state.prospects['synthetic-cafe'];assert.equal(r.follow_ups['call-one'].status,'Sent');assert.equal(p.calls.filter(x=>x.operation==='intent').length,1);assert.match(p.person.typed_custom_fields['body-1'],/voice-demo-preview\.png/);assert.match(p.person.typed_custom_fields['body-1'],/Owner Test/);assert.doesNotMatch(p.person.typed_custom_fields['body-1'],/PRIVATE BUDGET NOTE/);
 s.advance();const reopened=await StudioLifecycle.open({directory:s.directory,now:s.app.now});await drive(reopened,p,'followup-restart');assert.equal(p.calls.filter(x=>x.operation==='intent').length,1);
});

test('an exactly approved call revision reaches the existing native executor once instead of its unreserved predecessor',async t=>{
 const s=await setup(t,true,'connected',true),text='Customer: Please send the pickup website example.',proposal={schema_version:1,transcript_sha256:hash(text),outcome:'requested_info',summary:'Customer requested the pickup website example.',claims:[{claim:'A pickup website example was requested.',quote:'Please send the pickup website example.'}],unknowns:['Scope and budget'],callback_at:null};
 await s.app.apply({id:'revision-transcript',prospect_id:'synthetic-cafe',type:'transcript_added',at,data:{call_id:'call-one',text,permission_confirmed:true}});
 await s.app.apply({id:'revision-assessment',prospect_id:'synthetic-cafe',type:'transcript_assessed',at,data:{call_id:'call-one',proposal,review:{verdict:'Accepted',proposal_sha256:hash(proposal),independent:true}}},{actor:'worker'});
 let r=(await s.app.snapshot()).prospects['synthetic-cafe'];const original=structuredClone(r.follow_ups['call-one']);
 await s.app.apply({id:'revision-draft',prospect_id:r.id,type:'follow_up_draft_saved',at,data:{call_id:'call-one',focus:'website',note_sha256:hash(r.calls['call-one'].note),proposal_sha256:r.proposals['call-one'].sha256,claim_indexes:[0],customer_context:'You asked for a pickup website example.',reviewed:true}});
 r=(await s.app.snapshot()).prospects[r.id];const draft=r.follow_up_drafts[0];await s.app.apply({id:'revision-approval',prospect_id:r.id,type:'follow_up_draft_approved',at,data:{draft_id:draft.id,sha256:draft.sha256,approved:true}},{actor:'friend'});
 const p=provider(s.config);await drive(s.app,p);let state=await s.app.snapshot();r=state.prospects[r.id];assert.equal(p.calls.filter(c=>c.operation==='intent').length,1);assert.match(p.person.typed_custom_fields['body-1'],/You asked for a pickup website example/);assert.doesNotMatch(p.person.typed_custom_fields['body-1'],/PRIVATE BUDGET NOTE|voice-demo-preview/);assert.deepEqual(r.follow_up_history,[original]);assert.equal(state.actions[original.action_id].status,'Cancelled');assert.equal(r.follow_ups['call-one'].status,'Sent');assert.equal(r.attempts.filter(a=>a.channel==='email').length,1);
 const reopened=await StudioLifecycle.open({directory:s.directory,now:s.app.now});s.advance();await drive(reopened,p,'revision-restart');assert.equal(p.calls.filter(c=>c.operation==='intent').length,1);
});
test('a reply observed in the provider read phase cancels a prepared next follow-up before native release',async t=>{
 const s=await setup(t,true,'no_answer',true),p=provider(s.config);await drive(s.app,p);s.advance();const next=s.app.now().toISOString();await s.app.apply({id:'second-call',prospect_id:'synthetic-cafe',type:'call_logged',at:next,data:{call_id:'second-call',outcome:'voicemail',performed_at:next,simulated:false,desk:true,focus:'ai',note:'Discuss AI enquiry handling.'}});assert.equal((await s.app.snapshot()).prospects['synthetic-cafe'].follow_ups['second-call'].status,'Prepared');p.addReply();s.advance();await drive(s.app,p,'reply-before-second-release');assert.equal(p.calls.filter(x=>x.operation==='intent').length,1);assert.equal((await s.app.snapshot()).prospects['synthetic-cafe'].follow_ups['second-call'].status,'Cancelled');
});

test('production reply body upgrades preserve earlier sources and same-cycle native stops without another send',async t=>{
 const s=await setup(t,true,'no_answer',true),p=provider(s.config);await drive(s.app,p);const respond=p.respond;let body='Could you share website examples?';
 p.respond=request=>{const result=respond(request);if(request.operation==='thread')for(const m of result.messages.filter(m=>m.id==='native-reply')){m.payload.mime_type='text/plain';m.payload.headers.push({name:'Message-ID',value:'<native-reply@example.invalid>'});m.payload.body={content:body};}return result;};
 p.addReply();s.advance();await drive(s.app,p,'body-one');const first=(await s.app.snapshot()).prospects['synthetic-cafe'].reply;assert.equal(first.content.text,body);
 body='What should a website quote include?';s.advance();await drive(s.app,p,'body-two');const r=(await s.app.snapshot()).prospects['synthetic-cafe'];assert.equal(r.reply.content.text,body);assert.ok(r.reply_history.some(old=>old.content?.source_sha256===first.content.source_sha256));assert.notEqual(r.reply.content.source_sha256,first.content.source_sha256);assert.equal(r.cold_paused,true);assert.equal(p.calls.filter(x=>x.operation==='intent').length,1);
});
test('a stop after an uncertain native intent keeps delivery uncertain and reconciles a late sent receipt without resending',async t=>{
 const s=await setup(t,true,'voicemail',true),p=provider(s.config),ops=operationsFor(s.app,'before-lost-handoff');
 for(;;){const request=await ops.next();if(request.operation==='intent'){p.respond(request);break;}assert.ok(request.operation);await ops.settle(request.key,{structuredContent:p.respond(request)});}
 await s.app.apply({id:'stop-after-handoff',prospect_id:'synthetic-cafe',type:'contact_stopped',at,data:{reason:'do_not_contact'}});assert.equal((await s.app.snapshot()).prospects['synthetic-cafe'].follow_ups['call-one'].status,'Uncertain');
 s.advance(91000);await drive(s.app,p,'after-handoff-stop');s.advance();await drive(s.app,p,'after-stop-readback');s.advance();await drive(s.app,p,'after-task-stop-readback');const state=await s.app.snapshot();assert.equal(p.calls.filter(x=>x.operation==='intent').length,1);assert.equal(state.prospects['synthetic-cafe'].stage,'Stopped');assert.equal(state.prospects['synthetic-cafe'].follow_ups['call-one'].status,'Sent',JSON.stringify(state.operations.holds));assert.equal(state.prospects['synthetic-cafe'].attempts.filter(x=>x.channel==='email').length,1);
});
test('an owner-requested callback remains a task and never releases a sales email',async t=>{
 const s=await setup(t,true,'callback',true),p=provider(s.config);await s.app.change(state=>{state.prospects['synthetic-cafe'].attempts.unshift(...['old-call-1','old-call-2'].map(id=>({id,channel:'call',at,outcome:'no_answer'})));});await drive(s.app,p);const state=await s.app.snapshot();assert.equal(p.calls.filter(x=>x.operation==='intent').length,0);assert.equal(Object.keys(state.prospects['synthetic-cafe'].follow_ups??{}).length,0);assert.ok(Object.values(state.actions).some(a=>a.type==='callback_task'&&['Queued','Verified'].includes(a.status)));
});
test('production release binds final approval to exact connections, evidence and campaign rules', async t => {
  const s = await setup(t, false);
  assert.throws(() => requireProductionRelease(s.config), /paused/);
  const changed = structuredClone(s.config); changed.readiness.capacity_verified = false; await saveJson(join(s.directory, 'lifecycle-config.json'), changed);
  await assert.rejects(approveProductionRelease(s.app, releaseFingerprint(changed), 'human-owner-approval'), /evidence is incomplete/);
  assert.equal((await s.app.dashboard()).controls.outreach_paused, true);
  await saveJson(join(s.directory, 'lifecycle-config.json'), s.config);
  await approveProductionRelease(s.app, releaseFingerprint(s.config), 'human-owner-approval');
  const c = structuredClone(s.app.config); c.sender.mailbox_id = 'different-mailbox'; assert.throws(() => requireProductionRelease(c), /must match/);
  const wrongSender=structuredClone(s.app.config);wrongSender.sender.email='other@example.net';wrongSender.release.fingerprint=releaseFingerprint(wrongSender);assert.throws(()=>requireProductionRelease(wrongSender),/Verify hello@evzdigital\.studio/);
  const missingName = structuredClone(s.app.config); missingName.sender.operator_names = { owner: 'Owner Test' }; missingName.release.fingerprint = releaseFingerprint(missingName);
  assert.throws(() => requireProductionRelease(missingName), /both operator display names/);
});
test('staging forbids self-qualified imports, mixed fixtures, duplicate contacts and premature actual calls', async t => {
  const s = await setup(t, false);
  await assert.rejects(s.app.apply({ id: 'self', prospect_id: 'other', type: 'prospect_imported', at, data: { ...s.data, company_id: 'other-company' } }), /retained independent/);
  await assert.rejects(s.app.apply({ id: 'duplicate', prospect_id: 'other', type: 'prospect_imported', at, data: { ...s.data, company_id: 'other-company' } }, { actor: 'research-import' }), /Duplicate contact/);
  await assert.rejects(s.app.apply({ id: 'premature', prospect_id: 'synthetic-cafe', type: 'call_logged', at, data: { call_id: 'premature', outcome: 'no_answer', simulated: false, performed_at: at } }), /paused/);
});
test('one actual-shaped no-answer publishes verified fields and exactly one native intent; restart never resends', async t => {
  const s = await setup(t), p = provider(s.config); await drive(s.app, p);
  const snap = await s.app.snapshot(); assert.equal(snap.prospects['synthetic-cafe'].attempts.length, 2);
  assert.equal(p.calls.filter(c => c.operation === 'intent').length, 1);
  assert.equal(p.calls.some(c => ['draft', 'send'].includes(c.operation)), false);
  assert.match(snap.operations.email['call-event-email'].status, /Sent — Gmail verified/);
  s.advance(); await drive(s.app, p, 'restarted-session');
  assert.equal(p.calls.filter(c => c.operation === 'intent').length, 1);
});
test('a lost intent receipt reconciles through the sent thread and never republishes', async t => {
  const s = await setup(t), p = provider(s.config), ops = new ProductionOperations(s.app, 'before-crash');
  for (;;) { const r = await ops.next(); if (r.operation === 'intent') { p.respond(r); break; } await ops.settle(r.key, { structuredContent: p.respond(r) }); }
  s.advance(91000); await drive(s.app, p, 'after-crash');
  assert.equal(p.calls.filter(c => c.operation === 'intent').length, 1);
  assert.equal((await s.app.snapshot()).prospects['synthetic-cafe'].attempts.filter(a => a.channel === 'email').length, 1);
});
test('verified reply stops the native round, cancels future call tasks and survives readback/restart', async t => {
  const s = await setup(t), p = provider(s.config); await drive(s.app, p); s.advance(); p.addReply();
  await drive(s.app, p, 'reply-session'); s.advance(); await drive(s.app, p, 'stop-readback'); s.advance(); await drive(s.app, p, 'cancellation-readback');
  const state = await s.app.snapshot(); assert.equal(state.prospects['synthetic-cafe'].cold_paused, true);
  assert.equal(state.operations.suppression['synthetic-cafe'], 'Verified');
  assert.equal(p.calls.filter(c => c.operation === 'stop').length, 1);
  assert.equal(p.calls.filter(c => c.operation === 'intent').length, 1);
});
test('a promised callback remains a call task while cold email stays paused', async t => {
  const s = await setup(t, true, 'callback'), p = provider(s.config); await drive(s.app, p);
  const callback = Object.values((await s.app.snapshot()).actions).find(a => a.type === 'callback_task');
  assert.equal(callback.status, 'Verified'); assert.equal(p.calls.filter(c => c.operation === 'task_create').length, 1);
  assert.equal(p.calls.some(c => c.operation === 'intent' || c.operation === 'task_skip'), false);
});
test('the actual service dispatch path honors a requested callback while keeping cold email paused', async t => {
  const s = await setup(t, true, 'callback'), p = provider(s.config);
  const connect = () => ({ connect: async () => {}, close: async () => {}, call: async (tool, input) => {
    const operation = Object.keys(operationNames).find(key => tool === `mcp__codex_apps__${operationNames[key]}`);
    return { structuredContent: p.respond({ operation, input }) };
  } });
  assert.equal((await operationsTick(s.app, { connect, paceMs: 0 })).status, 'Complete');
  const callback = Object.values((await s.app.snapshot()).actions).find(a => a.type === 'callback_task');
  assert.equal(callback.status, 'Verified'); assert.equal(p.calls.some(c => c.operation === 'intent'), false);
});
test('restarting completed task synchronization makes no contact/task reads, but cancellation and changed bindings do', async t => {
  const s = await setup(t, true, 'callback'), p = provider(s.config);
  await drive(s.app, p);
  const original = structuredClone(Object.values((await s.app.snapshot()).actions).find(a => a.type === 'callback_task'));
  s.advance(); const before = p.calls.length;
  await drive(s.app, p, 'idle-restart');
  assert.equal(p.calls.slice(before).some(r => ['contact', 'task_read', 'task_create'].includes(r.operation)), false);
  assert.equal(Object.values((await s.app.snapshot()).actions).find(a => a.id === original.id).verified_at, original.verified_at);
  await s.app.change(state => { state.operations.bindings['synthetic-cafe'].phone = '+1 202 555 0199'; });
  s.advance(); const changed = await drive(s.app, p, 'changed-binding');
  assert.match(changed.holds['synthetic-cafe'], /phone differs/);
  await s.app.change(state => { state.operations.bindings['synthetic-cafe'].phone = '+1 202 555 0100'; state.actions[original.id].cancel_requested = true; });
  s.advance(); const cancelBefore = p.calls.length; await drive(s.app, p, 'cancel');
  assert(p.calls.slice(cancelBefore).some(r => r.operation === 'contact'));
  assert.equal(p.calls.filter(r => r.operation === 'task_skip').length, 1);
  s.advance(); await drive(s.app, p, 'cancel-readback');
  assert.equal((await s.app.snapshot()).actions[original.id].status, 'Cancelled');
  const now = s.app.now().toISOString(), callbackBefore = p.calls.length;
  await s.app.apply({ id: 'second-callback', prospect_id: 'synthetic-cafe', type: 'call_logged', at: now,
    data: { call_id: 'call-two', performed_at: now, outcome: 'callback', simulated: false, callback_at: '2026-10-21T14:00:00.000Z' } });
  s.advance(); await drive(s.app, p, 'new-callback');
  assert(p.calls.slice(callbackBefore).some(r => r.operation === 'contact'));
  assert.equal(p.calls.filter(r => r.operation === 'task_create').length, 2);
});
test('structured Apollo rate errors wait across service restarts, retain proof and retry only reads after the window', async t => {
  const s = await setup(t, true, 'callback'), p = provider(s.config); let limited = true;
  const connect = () => ({ connect: async () => {}, close: async () => {}, call: async (tool, input) => {
    const operation = Object.keys(operationNames).find(key => tool === `mcp__codex_apps__${operationNames[key]}`);
    if (operation === 'contact' && limited) { p.calls.push({ operation, input }); return { isError: false, structuredContent: {
      error_details: { code: 'USAGE.RATE_LIMIT.API_RATE_LIMIT_EXCEEDED', context: { window: { value: 'hour' } } }
    } }; }
    return { structuredContent: p.respond({ operation, input }) };
  } });
  const first = await operationsTick(s.app, { connect, paceMs: 0 });
  assert.equal(first.status, 'Waiting'); assert.equal(first.next_at, '2026-10-19T15:00:00.000Z');
  const held = await s.app.snapshot(); assert.deepEqual(held.operations.holds, {});
  const receipt = Object.values(held.operations.requests).find(r => r.operation === 'contact');
  assert.equal(receipt.status, 'Deferred'); assert.match(receipt.receipt_sha256, /^[a-f0-9]{64}$/);
  s.advance(91_000); await operationsTick(s.app, { connect, paceMs: 0 });
  assert.equal(p.calls.filter(r => r.operation === 'contact').length, 1);
  assert.equal(p.calls.some(r => r.operation === 'task_create'), false);
  limited = false; s.advance(3_600_000);
  assert.equal((await operationsTick(s.app, { connect, paceMs: 0 })).status, 'Complete');
  assert.equal(p.calls.filter(r => r.operation === 'task_create').length, 1);
  assert.equal(Object.values((await s.app.snapshot()).actions).find(a => a.type === 'callback_task').status, 'Verified');
});
test('a rate error on a task mutation remains uncertain and cannot reserve a second creation', async t => {
  const s = await setup(t, true, 'callback'), p = provider(s.config);
  const connect = () => ({ connect: async () => {}, close: async () => {}, call: async (tool, input) => {
    const operation = Object.keys(operationNames).find(key => tool === `mcp__codex_apps__${operationNames[key]}`);
    if (operation === 'task_create') { p.calls.push({ operation, input }); return { structuredContent: { error_details: { code: 'USAGE.RATE_LIMIT.API_RATE_LIMIT_EXCEEDED' } } }; }
    if (operation === 'task_search') return { structuredContent: { tasks: [] } };
    return { structuredContent: p.respond({ operation, input }) };
  } });
  await assert.rejects(operationsTick(s.app, { connect, paceMs: 0 }), /Provider operation failed/);
  s.advance(3_601_000); const result = await operationsTick(s.app, { connect, paceMs: 0 });
  assert.match(result.holds['synthetic-cafe'], /not uniquely reconciled/);
  assert.equal(p.calls.filter(r => r.operation === 'task_create').length, 1);
});
test('daily call queue puts callbacks and saved follow-ups ahead of new businesses with both spellings', () => {
  const make = (company_id, kind) => ({ company_id, kind, due_at: at, status: 'scheduled' });
  assert.deepEqual(dailyCallQueue([make('new', 'new'), make('follow', 'follow-up'), make('callback', 'callback')], new Date(at)).map(x => x.company_id), ['callback', 'follow', 'new']);
});
test('retained detailed research and independent review import once, preserve suppression and reject tampered evidence', async t => {
  const s = await setup(t, false), directory = await mkdtemp(join(tmpdir(), 'evz-reviewed-research-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const job = { id: 'source-backed-bakery', business_name: 'SYNTHETIC bakery', website: '', seed_urls: ['https://www.instagram.com/syntheticbakery/'], as_of: '2026-10-19', research_version: 3, purpose: prospectPurpose };
  const source = { url: job.seed_urls[0], checked_at: job.as_of, fetched_at: '2026-10-19T13:00:00.000Z', text: 'DM to order\nFriday pickup\nNow accepting October orders\nbakery@example.org\n+1 202 555 0101', kind: 'social', capture_method: 'reviewed_page', coverage: 'partial', coverage_reason: 'Bio and one current caption inspected.', identity_note: 'SYNTHETIC bakery and Fairfax identity match.', reviewed_context: { reviewed_by: 'Fixture source reviewer', inspected_at: at, scope: 'Public bio and October 19 caption only.', facts: [{ id: 'orders', statement: 'The public bio invites orders by direct message.', excerpt: 'DM to order', published_at: null }, { id: 'active', statement: 'The October 19 caption accepts October orders.', excerpt: 'Now accepting October orders', published_at: '2026-10-19' }, { id: 'contact', statement: 'The public business bio lists its email and business phone.', excerpt: 'bakery@example.org', published_at: null }] } };
  source.content_sha256 = sourceContentHash(source);
  const packet = { schema_version: 1, job, worker: 'codex', discovery: { channel: 'Instagram', query: 'Synthetic Fairfax bakery', category: 'Home bakery', area: 'Fairfax', source_url: source.url, website_check: { status: 'No verified site found', searches: ['Exact business and public links checked'], note: 'No website verified in this bounded check; absence remains unknown.' } }, captures: { reviewed_by: 'Fixture source reviewer', sources: [source], failures: [] } };
  await intakeCandidate({ directory, packet, queue: { intakeJob: async () => ({ verified: true }) }, now: s.app.now });
  const report = { schema_version: 3, job_id: job.id, business_name: job.business_name, sources: [{ url: source.url, checked_at: job.as_of, content_sha256: source.content_sha256, facts: [source.reviewed_context.facts[0].statement] }], unknowns: ['Owner goals and current tools need discussion.'], checkpoint_reused: true, observations: [{ fact: source.reviewed_context.facts[0].statement, source_urls: [source.url], evidence: [{ url: source.url, excerpt: 'DM to order', context_id: 'orders' }] }], journey_checks: ['discovery', 'offer', 'enquiry_or_ordering', 'trust_and_activity', 'follow_up'].map(area => ({ area, status: area === 'enquiry_or_ordering' ? 'Observed' : 'Unknown', finding: area === 'enquiry_or_ordering' ? source.reviewed_context.facts[0].statement : 'This bounded capture does not establish this part of the customer journey.', observation_indexes: area === 'enquiry_or_ordering' ? [0] : [], owner_question: 'What would you like to improve, if anything?' })), opportunities: [{ observed_basis: source.reviewed_context.facts[0].statement, possible_effect: 'A complementary preorder page might help customers prepare; owner benefit remains a hypothesis.', proposed_solution: 'Discuss a simple optional menu and pickup request page.', service_area: 'websites', confidence: 'hypothesis', owner_question: 'Would a preorder page complement your DMs?', existing_alternatives: ['Existing DM ordering'], validation_needed: 'Confirm the current tools and owner goals.' }], public_contact_routes: [source.url], recommendation: 'Suitable to discuss' };
  const target = join(directory, job.id), attempt_id = 'independent-fixture-attempt';
  await saveJson(join(target, 'report.json'), report); await saveJson(join(target, 'state.json'), { job_id: job.id, status: 'Complete', attempt_id });
  const d = await reviewTemplate({ directory, jobId: job.id });
  Object.assign(d, { reviewed_by: 'codex/sol independent review', decision: 'Research-qualified', identity_note: 'Retained fictional business and Fairfax identity match.', operating_status: 'Active', operating_evidence: { url: source.url, excerpt: 'Now accepting October orders', context_id: 'active' }, opportunity_index: 0, contact: { url: source.url, email: 'bakery@example.org', phone: '+1 202 555 0101' }, rationale: 'A specific complementary addition fits the observed order route.', next_action: 'Ask the owner whether this would fit their goals.', opportunity_checks: [{ index: 0, supported: true, note: 'Scoped enhancement hypothesis, not a claim of failure.' }], other_claims_supported: true, other_claims_note: 'All remaining claims are bounded by the capture.' });
  d.observations.forEach(c => { c.supported = true; c.note = 'The retained bio supports this exact scoped observation.'; });
  d.journey_checks.forEach(c => { c.supported = true; c.note = 'Observed or explicitly unknown within the inspected scope.'; });
  await saveJson(join(target, 'qualification.json'), { ...d, reviewed_at: at });
  await saveJson(join(target, 'auto-review-fixture.json'), { schema_version: 1, reviewer: d.reviewed_by, reviewed_at: at, result: { verdict: 'Accepted', corrections: [], decision: d } });
  await saveJson(join(directory, 'controller-state.json'), { jobs: { [job.id]: { status: 'Complete', stage: 'done', review_file: 'auto-review-fixture.json' } } });
  await reviewFiles(directory, job.id);
  const result = await importResearch(s.app, directory, job.id); assert.equal(result.imported, true);
  const importedRecord=(await s.app.snapshot()).prospects[result.prospect_id]; assert.equal(importedRecord.contact.checked_at, source.fetched_at); assert.equal(importedRecord.qualification.checked_at, '2026-10-19T00:00:00.000Z');
  assert.equal(importedRecord.call_prep.questions[0], report.opportunities[0].owner_question);
  assert.equal(importedRecord.call_prep.observations[0].fact, report.observations[0].fact);
  assert.deepEqual(importedRecord.call_prep.observations[0].sources, [{ url: source.url, checked_at: source.fetched_at, excerpt: 'DM to order' }]);
  assert.equal(importedRecord.call_prep.hypothesis, report.opportunities[0].proposed_solution);
  const phoneOnly = await setup(t, false), phoneDirectory = await mkdtemp(join(tmpdir(), 'evz-phone-only-research-'));
  t.after(() => rm(phoneDirectory, { recursive: true, force: true })); await cp(directory, phoneDirectory, { recursive: true });
  const phoneDecision = { ...d, contact: { ...d.contact, email: '' } };
  await saveJson(join(phoneDirectory, job.id, 'qualification.json'), { ...phoneDecision, reviewed_at: at });
  await saveJson(join(phoneDirectory, job.id, 'auto-review-fixture.json'), { schema_version: 1, reviewer: d.reviewed_by, reviewed_at: at, result: { verdict: 'Accepted', corrections: [], decision: phoneDecision } });
  const phoneResult = await importResearch(phoneOnly.app, phoneDirectory, job.id), phoneCard = (await phoneOnly.app.dashboard()).prospects[phoneResult.prospect_id];
  assert.equal(phoneCard.contact.email, null); assert.equal(phoneCard.contact.phone, '+1 202 555 0101'); assert.equal(phoneCard.qualification.verdict, 'Research-qualified');
  assert.equal((await phoneOnly.app.dashboard()).controls.calls_paused, true);
  assert.equal((await importResearch(phoneOnly.app, phoneDirectory, job.id)).duplicate_of, phoneResult.prospect_id);
  assert.ok(importedRecord.call_prep.unknowns.includes(report.unknowns[0]));
  const up = await setup(t,false), url = 'https://example.org/contact';
  const vsource = {url,checked_at:job.as_of,fetched_at:at,text:'SYNTHETIC bakery. Fairfax, VA. Custom cakes. Call +1 202 555 0101.',kind:'business',capture_method:'http',coverage:'full',identity_note:'Fictional first-party business source.'};
  vsource.content_sha256=sourceContentHash(vsource);
  const v = await importVerification(up.app,{schema_version:1,id:'upgrade-verification',business_name:job.business_name,category:'Food bakery',area:'Fairfax',phone:'+1 202 555 0101',topic:'Discuss custom order requests.',unknowns:['Activity unknown.'],reviewed_by:'fixture operator',first_party_note:'Fictional source.',sources:[vsource],identity:{url,excerpt:job.business_name},location:{url,excerpt:'Fairfax, VA'},offering:{url,excerpt:'Custom cakes'},public_phone:{url,excerpt:'+1 202 555 0101'}});
  const original=await up.app.snapshot(), vr=original.prospects[v.prospect_id];
  const settings=JSON.parse(await readFile(join(up.app.directory,'lifecycle-config.json')));
  settings.research.upgrade_batch={schema_version:1,id:'upgrade-batch',approval_ref:'fixture-owner-ten',items:[{job_id:job.id,prospect_id:vr.id,company_id:vr.company_id,phone_digits:'2025550101',verification_sha256:vr.verification.packet_sha256}]};
  await saveJson(join(up.app.directory,'lifecycle-config.json'),settings);
  const fingerprint=callReleaseFingerprint(settings), upgraded=await importResearch(up.app,directory,job.id);
  assert.equal(upgraded.upgraded,true);assert.equal(upgraded.prospect_id,vr.id);
  const after=await up.app.snapshot(), changed=after.prospects[vr.id];
  assert.equal(changed.call_lane,'research');assert.equal(changed.contact.email,null);assert.equal(changed.research_contact.email,'bakery@example.org');
  assert.deepEqual(changed.verification,vr.verification);assert.deepEqual(changed.attempts,vr.attempts);assert.deepEqual(after.actions,original.actions);
  assert.equal(changed.company_id,vr.company_id);assert.equal(Object.keys(after.prospects).length,Object.keys(original.prospects).length);
  assert.equal(callReleaseFingerprint(JSON.parse(await readFile(join(up.app.directory,'lifecycle-config.json')))),fingerprint);
  assert.equal((await importResearch(await StudioLifecycle.open({directory:up.app.directory,now:up.app.now}),directory,job.id)).upgraded,true);
  assert.equal(Object.values((await up.app.snapshot()).events).filter(e=>e.type==='research_upgraded').length,1);
  settings.research.upgrade_batch.items[0].phone_digits='2025550199';await saveJson(join(up.app.directory,'lifecycle-config.json'),settings);
  await assert.rejects(importResearch(up.app,directory,job.id),/identity|evidence changed/);
  const heldDirectory=await mkdtemp(join(tmpdir(),'evz-reviewed-hold-'));t.after(()=>rm(heldDirectory,{recursive:true,force:true}));await cp(directory,heldDirectory,{recursive:true});
  const heldDecision={...d,decision:'Hold',operating_status:'Unverified',rationale:'Current activity needs a fresh first-party check.',next_action:'Confirm current operation with the owner.'};
  await saveJson(join(heldDirectory,job.id,'qualification.json'),{...heldDecision,reviewed_at:at});
  await saveJson(join(heldDirectory,job.id,'auto-review-fixture.json'),{schema_version:1,reviewer:d.reviewed_by,reviewed_at:at,result:{verdict:'Accepted',corrections:[],decision:heldDecision}});
  await saveJson(join(heldDirectory,'controller-state.json'),{jobs:{[job.id]:{status:'Complete',stage:'done',decision:'Hold',review_file:'auto-review-fixture.json'}}});
  const heldApp=await setup(t,false),heldId=(await importVerification(heldApp.app,vr.verification.packet)).prospect_id,heldBefore=await heldApp.app.snapshot(),hr=heldBefore.prospects[heldId],hc=JSON.parse(await readFile(join(heldApp.app.directory,'lifecycle-config.json')));
  Object.assign(hc.research,{auto_import:true,source_directory:heldDirectory,upgrade_batch:{schema_version:1,id:'held-review-batch',approval_ref:'fixture-owner-ten',items:[{job_id:job.id,prospect_id:heldId,company_id:hr.company_id,phone_digits:'2025550101',verification_sha256:hr.verification.packet_sha256}]}});await saveJson(join(heldApp.app.directory,'lifecycle-config.json'),hc);
  assert.equal((await syncResearchImports(heldApp.app)).examined,1);
  const heldAfter=await heldApp.app.snapshot();assert.equal(heldAfter.prospects[heldId].research_assessment.decision,'Hold');assert.equal(heldAfter.prospects[heldId].research_assessment.next_action,heldDecision.next_action);assert.equal(heldAfter.prospects[heldId].call_lane,'verification');assert.deepEqual(heldAfter.prospects[heldId].qualification,hr.qualification);assert.deepEqual(heldAfter.actions,heldBefore.actions);
  assert.equal((await syncResearchImports(heldApp.app)).examined,0);
  heldDecision.other_claims_supported=false;heldDecision.other_claims_note='The recommendation must remain pending activity verification.';
  await saveJson(join(heldDirectory,job.id,'qualification.json'),{...heldDecision,reviewed_at:at});await saveJson(join(heldDirectory,job.id,'auto-review-held-fixture.json'),{schema_version:1,reviewer:d.reviewed_by,reviewed_at:at,result:{verdict:'Revise',corrections:['Use the permitted Needs review recommendation while activity is unverified.'],decision:heldDecision}});
  await saveJson(join(heldDirectory,'controller-state.json'),{jobs:{[job.id]:{status:'Held',stage:'held',decision:'Hold',reason:'EVIDENCE_REPAIR_EXHAUSTED',review_file:'auto-review-held-fixture.json'}}});
  assert.equal((await syncResearchImports(heldApp.app)).examined,1);const heldReview=(await heldApp.app.snapshot()).prospects[heldId];assert.equal(heldReview.research_assessment.independent_verdict,'Revise');assert.equal(heldReview.research_assessment.opportunities.length,1);assert.equal(heldReview.call_lane,'verification');assert.deepEqual(heldReview.qualification,hr.qualification);
  await assert.rejects(importResearch(heldApp.app,heldDirectory,job.id),/accepted completed review/);
  await s.app.apply({ id: 'stop-imported', prospect_id: result.prospect_id, type: 'contact_stopped', at, data: { reason: 'do_not_contact' } });
  const duplicate = await importResearch(s.app, directory, job.id); assert.equal(duplicate.imported, false); assert.equal(duplicate.restricted, true);
  assert.equal((await s.app.snapshot()).prospects[result.prospect_id].contact.phone, '+1 202 555 0101');
  report.unknowns.push('Changed after independent review.'); await saveJson(join(target, 'report.json'), report);
  await assert.rejects(importResearch(s.app, directory, job.id), /identity\/hash|changed/);
});
test('production booking requires a reviewed exact guest and keeps one reservation for the same agreed slot', async t => {
  const s = await setup(t, true, 'callback');
  await s.app.change(state => { state.prospects['synthetic-cafe'].stage = 'Discovery'; });
  const p = provider(s.app.config); await drive(s.app, p);
  const input = { prospect_id: 'synthetic-cafe', attendee_email: 'cafe@example.net', start: '2026-10-20T14:00:00.000Z', end: '2026-10-20T14:20:00.000Z', title: 'EVZ Digital discovery', description: 'Discuss the owner goal.', slot_agreed: true };
  await assert.rejects(queueMeeting(s.app, { ...input, attendee_email: 'foreign@example.org' }), /exact guest/);
  const a = await queueMeeting(s.app, input), b = await queueMeeting(s.app, input);
  assert.equal(a.booking_id, b.booking_id); assert.equal(Object.keys(s.app.config.operations.bookings).length, 1); assert.equal(a.booked, false);
  assert.equal((await s.app.snapshot()).runtime.wake_requested,true);
  await drive(s.app, p);
  assert.deepEqual(p.calls.find(r => r.operation === 'booking_create').input.attendees, ['cafe@example.net']);
  assert.equal((await s.app.snapshot()).prospects['synthetic-cafe'].meeting.event_id, 'agreed-event');
  s.advance(); await drive(s.app, p, 'booking-restart'); assert.equal(p.calls.filter(r => r.operation === 'booking_create').length, 1);
});
test('calls-only booking uses the confirmed guest despite a contact rate limit, without releasing email', async t => {
  const s = await setup(t, false), c = s.app.config;
  c.sender.mailbox_id = ''; c.sender.postal_address = ''; c.native_email.enabled = false;
  c.calendar.link_id = 'link_businesscalendar';
  c.call_readiness = Object.fromEntries(['queue_verified','outcomes_verified','supervision_verified','booking_verified'].map(k => [k,'fixture:independent proof']));
  await saveJson(join(s.directory,'lifecycle-config.json'),c);
  await approveCallRelease(s.app,callReleaseFingerprint(c),'fixture:owner calls and booking approval');
  await s.app.change(state => { state.prospects['synthetic-cafe'].stage = 'Discovery'; });
  const input = { prospect_id:'synthetic-cafe',attendee_email:'confirmed@example.net',recipient_confirmed:true,start:'2026-10-20T14:00:00.000Z',end:'2026-10-20T14:20:00.000Z',title:'EVZ Digital discovery',description:'Discuss the agreed goal.',slot_agreed:true,mode:'phone' };
  const noProof=structuredClone(s.app.config);delete noProof.call_readiness.booking_verified;noProof.call_release.fingerprint=callReleaseFingerprint(noProof);
  await saveJson(join(s.directory,'lifecycle-config.json'),noProof);
  await assert.rejects(queueMeeting(s.app,input),/invitation verification/);
  await saveJson(join(s.directory,'lifecycle-config.json'),s.app.config);
  await assert.rejects(queueMeeting(s.app,{...input,recipient_confirmed:false}),/exact guest/);
  await queueMeeting(s.app,input);
  await s.app.change(state => { (state.operations ??= { requests: {}, effects: {}, bookings: {}, email: {}, holds: {}, replies: [] }).rate_limits = { contact: { retry_at: '2026-10-19T15:00:00.000Z' } }; });
  const p=provider(s.app.config),connect=()=>({connect:async()=>{},close:async()=>{},call:async(tool,input)=>({structuredContent:p.respond({operation:Object.keys(operationNames).find(k=>tool===`mcp__codex_apps__${operationNames[k]}`),input})})});
  assert.equal((await operationsTick(s.app,{connect,paceMs:0})).status,'Waiting');
  assert.equal((await s.app.snapshot()).prospects['synthetic-cafe'].meeting.event_id,'agreed-event');
  assert.deepEqual(p.calls.find(r=>r.operation==='booking_create').input.attendees,['confirmed@example.net']);
  assert.equal(p.calls.some(r=>r.operation==='contact'),false);
  assert.equal(p.calls.some(r=>['gmail_profile','mailboxes','intent','send','draft'].includes(r.operation)),false);
  assert.throws(()=>requireProductionRelease(s.app.config),/paused/);
  s.advance(3_601_000); await operationsTick(s.app,{connect,paceMs:0});
  assert.equal(p.calls.filter(r=>r.operation==='booking_create').length,1);
  const changed=structuredClone(s.app.config);changed.calendar.owner_email='other@example.org';await saveJson(join(s.directory,'lifecycle-config.json'),changed);
  await assert.rejects(queueMeeting(s.app,input),/must match/);
});

test('calls-only booking rejects a different connected Calendar owner before creating an invitation', async t => {
  const s=await setup(t,false),c=s.app.config;c.calendar.link_id='link_businesscalendar';
  c.call_readiness=Object.fromEntries(['queue_verified','outcomes_verified','supervision_verified','booking_verified'].map(k=>[k,'fixture:independent proof']));
  await saveJson(join(s.directory,'lifecycle-config.json'),c);await approveCallRelease(s.app,callReleaseFingerprint(c),'fixture:owner calls and booking approval');
  await s.app.change(state=>{state.prospects['synthetic-cafe'].stage='Discovery';});
  await queueMeeting(s.app,{prospect_id:'synthetic-cafe',attendee_email:'cafe@example.net',start:'2026-10-20T14:00:00.000Z',end:'2026-10-20T14:20:00.000Z',title:'EVZ Digital discovery',description:'Discuss the agreed goal.',slot_agreed:true,mode:'phone'});
  const p=provider(s.app.config),connect=()=>({connect:async()=>{},close:async()=>{},call:async(tool,input)=>({structuredContent:tool.includes('google_calendar')?{email:'personal@gmail.com'}:p.respond({operation:Object.keys(operationNames).find(k=>tool===`mcp__codex_apps__${operationNames[k]}`),input})})});
  const result=await operationsTick(s.app,{connect,paceMs:0});assert.equal(result.status,'Held');assert.match(result.reason,/Calendar connection/);
  assert.equal(p.calls.some(r=>r.operation==='booking_create'),false);
});

test('a mismatched native phone holds the task and never publishes email', async t => {
  const s = await setup(t, true, 'callback'), p = provider(s.config); p.person.phone_numbers = [{ raw_number: '+1 202 555 0199' }];
  await drive(s.app, p); assert.equal(p.calls.some(r => ['task_create', 'intent'].includes(r.operation)), false);
  assert.match((await s.app.snapshot()).operations.holds['synthetic-cafe'], /phone differs/);
});
test('a detailed call card can synchronize a contact-only Apollo task without a company account', async t => {
  const s=await setup(t,true,'callback'),p=provider(s.config);delete p.person.account_id;
  const connect=()=>({connect:async()=>{},close:async()=>{},call:async(tool,input)=>({structuredContent:p.respond({operation:Object.keys(operationNames).find(k=>tool===`mcp__codex_apps__${operationNames[k]}`),input})})});
  assert.equal((await operationsTick(s.app,{connect,paceMs:0})).status,'Complete');
  const action=Object.values((await s.app.snapshot()).actions).find(a=>a.type==='callback_task');
  assert.equal(action.status,'Verified');assert.equal(Object.hasOwn(p.calls.find(r=>r.operation==='task_create').input,'account_id'),false);
  s.advance();await operationsTick(s.app,{connect,paceMs:0});assert.equal(p.calls.filter(r=>r.operation==='task_create').length,1);
});
test('changed reply subjects still stop contact; an unverified incoming thread message holds the route', () => {
  const h = (name, value) => ({ name, value }), expected = { thread_id: 'thread', original_id: 'sent', from: owner, to: 'cafe@example.net', subject: 'Original idea', sent_after: at, sent_before: at };
  const original = { id: 'sent', thread_id: 'thread', internal_date: String(Date.parse(at)), label_ids: ['SENT'], payload: { headers: [h('From', owner), h('To', expected.to), h('Subject', expected.subject), h('Message-ID', '<original>')] } };
  const incoming = { id: 'reply', thread_id: 'thread', internal_date: String(Date.parse(at) + 1000), payload: { headers: [h('From', expected.to), h('To', owner), h('Subject', 'A changed topic'), h('References', '<original>')] } };
  assert.equal(controlledThread({ id: 'thread', messages: [original, incoming] }, expected, new Date(Date.parse(at) + 2000)).length, 1);
  incoming.payload.headers = [h('From', 'mailer-daemon@example.net'), h('To', owner)];
  assert.throws(() => controlledThread({ id: 'thread', messages: [original, incoming] }, expected, new Date(Date.parse(at) + 2000)), /Unverified incoming/);
});
async function nativeProof(t, approved = true) {
  const directory = await mkdtemp(join(tmpdir(), 'evz-native-proof-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const c = structuredClone(initialConfig); c.readiness.owner_design_approved = true;
  c.calendar = { ...c.calendar, owner_email: owner, calendar_id: 'primary' };
  c.sender = { email: owner, mailbox_id: 'business-mailbox', daily_email_limit: 1 };
  c.apollo = { user_id: 'owned-user', bindings: { 'native-proof': { contact_id: 'native-contact', account_id: 'native-account', email: 'cafe@example.net', controlled_name: 'STUDIO TEST Owner inbox', require_no_phone: true } } };
  c.native_email = { enabled: true, rounds: [{ round: 1, list_id: 'list-1', list_name: 'STUDIO TEST native intent', sequence_id: 'sequence-1', sequence_name: 'STUDIO TEST native email', subject_field_id: 'subject-1', body_field_id: 'body-1' }] };
  c.operations = { enabled: true, interval_minutes: 5, allowlist: ['native-proof'], recipients: [owner, 'cafe@example.net'], emails: {}, bookings: {}, native_proof: { enabled: true, message: { from: owner, to: 'cafe@example.net', mailbox_id: 'business-mailbox', subject: '[STUDIO TEST] Native handoff', body_text: 'CONTROLLED TEST — fictional record, no actual call. No real business is contacted.', approved, approval_ref: 'human-single-test-approval' } } };
  const app = await StudioLifecycle.initialize({ directory, config: c, now: () => new Date(at) });
  await app.apply(fixtureProspect('native-proof', at));
  await app.apply({ id: 'native-call', prospect_id: 'native-proof', type: 'call_logged', at, data: { call_id: 'native-call', outcome: 'no_answer', performed_at: at, simulated: true } });
  const p = provider(c); p.person.phone_numbers = []; p.person.name = 'STUDIO TEST Owner inbox';
  return { app, p, c, directory };
}
test('the bounded native proof uses one exact approved owner-inbox email and counts zero real outreach', async t => {
  const s = await nativeProof(t); assert.ok(operationsFor(s.app, 'proof-session') instanceof NativeProofOperations);
  await drive(s.app, s.p, 'proof-session');
  assert.equal(s.p.calls.filter(c => c.operation === 'intent').length, 1);
  const daily = (await s.app.dashboard()).daily; assert.equal(daily.actual_emails, 0); assert.equal(daily.actual_call_attempts, 0);
  assert.equal(s.app.config.outreach_enabled, false);
});
test('the owner-only branded HTML proof is generated from the approved template and rejects altered HTML before dispatch',async t=>{
 const s=await nativeProof(t),m=s.c.operations.native_proof.message;m.template_version='evz-personal-large-demo-v1';m.body_html=nativeProofMessage(s.c).body;await saveJson(join(s.directory,'lifecycle-config.json'),s.c);await drive(s.app,s.p,'html-owner-proof');assert.equal(s.p.calls.filter(c=>c.operation==='intent').length,1);assert.match(s.p.person.typed_custom_fields['body-1'],/CONTROLLED TEST/);assert.match(s.p.person.typed_custom_fields['body-1'],/voice-demo-preview/);assert.equal((await s.app.dashboard()).daily.actual_emails,0);m.body_html+='<p>Changed after approval</p>';await saveJson(join(s.directory,'lifecycle-config.json'),s.c);await assert.rejects(operationsFor(s.app,'changed-html-proof').next(),/Literal controlled/);
});
test('an unapproved native proof cannot publish an intent; a foreign recipient fails before dispatch', async t => {
  const s = await nativeProof(t, false); await drive(s.app, s.p);
  assert.equal(s.p.calls.some(c => ['intent', 'personalize', 'task_create'].includes(c.operation)), false);
  const c = structuredClone(s.c); c.operations.native_proof.message.to = 'foreign@example.org'; await saveJson(join(s.directory, 'lifecycle-config.json'), c);
  await assert.rejects(operationsFor(s.app, 'foreign-proof').next(), /owner-controlled test inboxes/);
});
test('native handoff accepts the connector contact-list envelope and rejects failed or malformed lists', async t => {
  for (const variant of ['success', 'failed', 'malformed']) {
    const s = await nativeProof(t), respond = s.p.respond;
    s.p.respond = r => {
      const data = respond(r);
      return r.operation === 'lists' ? { success: variant !== 'failed', data: variant === 'malformed' ? {} : data.labels } : data;
    };
    if (variant === 'success') await drive(s.app, s.p);
    else {
      const ops = operationsFor(s.app, 'list-receipt-test');
      for (let count = 0; count < 10; count++) {
        const request = await ops.next();
        assert.ok(request.operation);
        const settled = await ops.settle(request.key, { content: [{ type: 'text', text: JSON.stringify(s.p.respond(request)) }] });
        assert.equal(settled.status, request.operation === 'lists' ? 'Failed' : 'Done');
        if (request.operation === 'lists') { assert.equal((await ops.next()).operation, undefined); break; }
      }
    }
    assert.equal(s.p.calls.filter(c => c.operation === 'intent').length, variant === 'success' ? 1 : 0, variant);
  }
});
test('Pause all stops and reads back the configured research controller, preserving its priority and quota settings', async t => {
  const s = await setup(t, false), directory = await mkdtemp(join(tmpdir(), 'evz-pause-research-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const control = { schema_version: 1, enabled: true, priority: 'research', quota_resumes: { example: 'unchanged' } };
  await saveJson(join(directory, 'research-control.json'), control);
  s.config.research.source_directory = directory;s.config.contact_research={enabled:true,directory,approval_ref:'Owner exact contact scope'}; await saveJson(join(s.directory, 'lifecycle-config.json'), s.config);
  assert.equal((await s.app.dashboard()).controls.research_paused, false);
  assert.equal((await pauseStudio(s.app)).paused, true);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'research-control.json'), 'utf8')), { ...control, enabled: false });
  assert.deepEqual(JSON.parse(await readFile(join(s.directory,'lifecycle-config.json'),'utf8')).contact_research,{...s.config.contact_research,enabled:false});
  assert.equal((await s.app.dashboard()).controls.research_paused, true);
});
test('an unavailable research control leaves other execution paused and reports an unverified research stop', async t => {
  const s = await setup(t, false); s.config.research.source_directory = join(s.directory, 'missing-research');
  await saveJson(join(s.directory, 'lifecycle-config.json'), s.config);
  await assert.rejects(pauseStudio(s.app), /research-controller pause is unverified/);
  const d = await s.app.dashboard(); assert.equal(d.controls.outreach_paused, true); assert.equal(d.controls.ai_enabled, false);
  assert.ok(d.exceptions.some(e => e.id === 'research-pause'));
});
