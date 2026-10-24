import {fixtureReply} from './lifecycle-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle, hash, initialConfig, businessDaysBetween, dailyNewProspectCount, nextBusinessMorning } from './lifecycle.mjs';
import { acquireLock } from './engine.mjs';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';

export const at = '2026-10-19T15:00:00Z';
export const prospect = (id = 'fictional-bakery') => ({ id: `import-${id}`, prospect_id: id, type: 'prospect_imported', at,
  data: { company_id: `company-${id}`, name: 'STUDIO TEST Juniper Bakery', category: 'Food / bakery', controlled: true,
    idea: 'A short preorder page for the weekly pastry box, while keeping Instagram discovery.',
    qualification: { verdict: 'Research-qualified', independent_review: 'Accepted', checked_at: at,
      report_sha256: hash('fictional assessed report'), review_sha256: hash('fictional independent review'), evidence_ref: 'fixture:weekly pastry box — not real research' },
    contact: { email: `${id}@example.invalid`, verified: true, checked_at: at, source: 'fixture:public contact — fictional' } } });
export const quote = { price_cents: 120000, initial_payment_cents: 60000, currency: 'USD', revision_rounds: 1,
  scope: 'One preorder flow', deliverables: 'Three responsive pages and an inquiry', exclusions: 'No payment processing or advertising spend',
  timeline: 'Two weeks after materials', acceptance: 'Owner can submit and receive a test request', ownership: 'Client owns paid deliverables; existing tools retain their licenses',
  support_terms: 'Seven days of scoped defect fixes; ongoing work separately quoted', change_terms: 'Written change scope and price before extra work',
  cancellation_terms: 'Settle completed work and return unused prepaid amounts as agreed', reference: 'fixture:approved proposal' };
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-life-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const app = await StudioLifecycle.initialize({ directory, now: () => new Date(at) });
  return { app, directory, event: (type, data = {}, id = type, p = 'fictional-bakery', actor = 'owner') =>
    app.apply({ id, prospect_id: p, type, at, data }, { actor }) };
}

test('unspecified callback reminders use 9am Eastern on the next business day across daylight-saving changes',()=>{
  assert.equal(nextBusinessMorning('2026-10-19T15:00:00.000Z').toISOString(),'2026-10-20T13:00:00.000Z');
  assert.equal(nextBusinessMorning('2026-10-30T15:00:00.000Z').toISOString(),'2026-11-02T14:00:00.000Z');
  assert.equal(nextBusinessMorning('2026-03-06T15:00:00.000Z').toISOString(),'2026-03-09T13:00:00.000Z');
});

test('same-host state writers serialize without losing updates', async t => {
  const { app } = await setup(t);
  let entered, resume;
  const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { resume = resolve; });
  const first = app.change(async state => { entered(); await gate; state.concurrent_updates = 1; });
  await started;
  const second = app.change(state => { state.concurrent_updates = (state.concurrent_updates ?? 0) + 1; });
  const results = Promise.allSettled([first, second]); resume();
  assert.deepEqual((await results).map(r => r.status), ['fulfilled', 'fulfilled']);
  assert.equal((await app.snapshot()).concurrent_updates, 2);
});

test('a rejected same-host change does not block the following valid change', async t => {
  const { app } = await setup(t);
  const results = await Promise.allSettled([
    app.change(() => { throw Error('Deliberate validation failure'); }),
    app.change(state => { state.after_failure = true; })
  ]);
  assert.deepEqual(results.map(r => r.status), ['rejected', 'fulfilled']);
  assert.equal((await app.snapshot()).after_failure, true);
});

test('a brief external state lock delays one change without losing or repeating it', async t => {
  const { app, directory } = await setup(t), release = await acquireLock(directory);
  let writes=0;
  const pending=Promise.allSettled([app.change(state=>{writes++;state.after_external_lock=true;})]);
  await new Promise(resolve=>setTimeout(resolve,60));await release();
  const [result]=await pending;assert.equal(result.status,'fulfilled',result.reason?.stack);assert.equal(writes,1);
  assert.equal((await app.snapshot()).after_external_lock,true);
});

test('a lock released between exclusive-open rejection and owner read stays retryable without claiming ownership',async t=>{
  const {directory}=await setup(t),release=await acquireLock(directory),path=join(directory,'.runner.lock'),before=await readFile(path,'utf8'),original=fs.promises.readFile;
  let injected=0;
  try{
    fs.promises.readFile=async(file,...args)=>{if(file===path&&!injected++){throw Object.assign(Error('Lock disappeared before owner read'),{code:'ENOENT',path});}return original(file,...args);};
    syncBuiltinESMExports();
    await assert.rejects(acquireLock(directory),{code:'RUNNER_BUSY'});
    assert.equal(injected,1);assert.equal(await original(path,'utf8'),before);
  }finally{fs.promises.readFile=original;syncBuiltinESMExports();await release();}
});

test('backup waits for a brief writer and keeps an unknown lock intact', async t => {
  const { app, directory }=await setup(t),release=await acquireLock(directory),output=join(directory,'brief-lock-backup.json');
  const pending=Promise.allSettled([app.backup(output)]);
  await new Promise(resolve=>setTimeout(resolve,60));await release();
  assert.equal((await pending)[0].status,'fulfilled');
  const lock=join(directory,'.runner.lock');await writeFile(lock,'{}');
  await assert.rejects(app.change(()=>assert.fail('Unknown owner must block')),/Another runner/);
  assert.equal(await readFile(lock,'utf8'),'{}');
});

test('a persistent live lock remains owned and the waiting writer stops within its bound',async t=>{
  const {app,directory}=await setup(t),release=await acquireLock(directory),path=join(directory,'.runner.lock'),before=await readFile(path,'utf8');
  try{await assert.rejects(app.change(()=>assert.fail('Live owner must exclude this writer')),{code:'RUNNER_BUSY'});assert.equal(await readFile(path,'utf8'),before);}
  finally{await release();}
});
async function connected(s) {
  await s.app.apply(prospect());
  await s.event('call_logged', { call_id: 'call-1', outcome: 'connected', simulated: true, performed_at: at });
  const transcript = 'Owner: I sell weekly pastry boxes through Instagram. I would like a preorder page. I am the owner and want to discuss a paid project.';
  await s.event('transcript_added', { call_id: 'call-1', text: transcript, permission_confirmed: true });
  const proposal = { schema_version: 1, transcript_sha256: hash(transcript), outcome: 'discovery', callback_at: null,
    summary: 'Owner wants to discuss a preorder page.', claims: [{ claim: 'Wants a preorder page', quote: 'I would like a preorder page.' }], unknowns: ['Budget and schedule are unknown'] };
  await s.event('transcript_assessed', { call_id: 'call-1', proposal, review: { verdict: 'Accepted', proposal_sha256: hash(proposal), independent: true } }, 'assessed', undefined, 'controlled-fixture');
  return proposal;
}
test('shared prospect imports stop at 25 per Eastern day across both operators and all import callers',async t=>{
  const {app}=await setup(t);
  for(let i=0;i<25;i++){const event=prospect(`home-service-${i}`);await app.apply(event,{actor:i%2?'friend':'owner'});}
  assert.equal(dailyNewProspectCount(await app.snapshot(),app.now()),25);
  const blocked=prospect('home-service-26');await assert.rejects(app.apply(blocked,{actor:'friend'}),/shared limit of 25 new businesses/);
  app.now=()=>new Date('2026-10-20T04:01:00.000Z');const next=prospect('home-service-next-day');next.at=app.now().toISOString();
  await app.apply(next,{actor:'friend'});assert.equal(dailyNewProspectCount(await app.snapshot(),app.now()),1);
});
test('the first caller owns the business until an explicit operator handoff',async t=>{
  const s=await setup(t);await s.app.apply(prospect());
  await s.event('call_claimed',{},'claim','fictional-bakery','friend');
  let state=await s.app.snapshot(),task=Object.values(state.actions).find(a=>a.prospect_id==='fictional-bakery'&&a.type==='call_task');
  assert.equal(state.prospects['fictional-bakery'].follow_up_owner,'friend');assert.equal(task.assigned_to,'friend');
  await assert.rejects(s.event('call_logged',{call_id:'owner-call-first',outcome:'no_answer',simulated:true,performed_at:at},'owner-call-first','fictional-bakery','owner'),/assigned to the other operator/);
  await s.event('call_logged',{call_id:'friend-call',outcome:'no_answer',simulated:true,performed_at:at},'friend-call','fictional-bakery','friend');
  state=await s.app.snapshot();assert.equal(state.prospects['fictional-bakery'].calls['friend-call'].actor,'friend');
  const email=Object.values(state.actions).find(a=>a.prospect_id==='fictional-bakery'&&a.type==='email');assert.equal(email.assigned_to,'friend');
  await s.event('follow_up_handed_off',{to:'owner'},'handoff','fictional-bakery','friend');
  state=await s.app.snapshot();assert.equal(state.prospects['fictional-bakery'].follow_up_owner,'owner');assert.deepEqual(state.prospects['fictional-bakery'].follow_up_handoffs.at(-1),{from:'friend',to:'owner',at,event_id:'handoff'});assert.equal(state.actions[email.id].assigned_to,'owner');
  await s.event('call_logged',{call_id:'owner-call-second',outcome:'no_answer',simulated:true,performed_at:at},'owner-call-second','fictional-bakery','owner');
  assert.equal((await s.app.snapshot()).prospects['fictional-bakery'].calls['owner-call-second'].actor,'owner');
});
test('fictional customer reaches accepted delivery, paid handover and resolved support; no real activity is counted', async t => {
  const s = await setup(t), proposal = await connected(s);
  await s.event('call_reviewed', { call_id: 'call-1', proposal_sha256: hash(proposal), outcome: 'discovery' });
  await s.event('discovery_confirmed', { goal: 'Preorder weekly pastry boxes', decision_maker: 'Fictional owner', serious_interest: true, paid_fit_discussed: true, service: 'website', main_flow: 'Choose a box and send a preorder', preview_screens: 3 });
  await s.event('preview_recorded', { reference: 'fixture:clickable preview', brief: 'One preorder flow', reviewed_with_owner: true });
  await s.event('proposal_approved', quote);
  await assert.rejects(s.event('payment_recorded', { payment_id: 'unverified' }), /payment evidence/);
  const record = (await s.app.snapshot()).prospects['fictional-bakery'];
  await s.event('agreement_recorded', { reference: 'fixture:signed agreement', signed_verified: true, quote_sha256: hash(record.quote) });
  await s.event('invoice_recorded', { invoice_id: 'invoice-1', amount_cents: 60000, currency: 'USD', reference: 'fixture:deposit invoice' });
  await s.event('payment_recorded', { invoice_id: 'invoice-1', payment_id: 'payment-1', amount_cents: 60000, currency: 'USD', settled_verified: true, simulated: true, reference: 'fixture:settled deposit' });
  await s.event('onboarding_completed', { materials: 'Menu and brand assets', access_plan: 'Client-owned hosting invitation; no password sharing', kickoff: 'Owner confirms delivery dates' });
  await assert.rejects(s.event('delivery_submitted', { reference: 'fixture:too early' }), /Complete all/);
  for (let i = 1; i <= 4; i++) await s.event('delivery_task_updated', { task_id: `task-${i}`, status: 'Complete', evidence: `fixture:check-${i}` }, `task-${i}`);
  await s.event('delivery_submitted', { reference: 'fixture:delivery-v1' });
  await s.event('revision_requested', { feedback: 'Clarify pickup instructions', reference: 'fixture:client feedback' });
  await s.event('delivery_task_updated', { task_id: 'revision-1', status: 'Complete', evidence: 'fixture:pickup check' }, 'revision-task');
  await s.event('delivery_submitted', { reference: 'fixture:delivery-v2' }, 'delivery-v2');
  await assert.rejects(s.event('revision_requested', { feedback: 'Extra scope', reference: 'fixture:extra' }, 'extra-revision'), /Revision limit/);
  await s.event('acceptance_recorded', { client_approval_verified: true, reference: 'fixture:client approval' });
  const handover = { ownership: 'fixture:ownership', training: 'fixture:training', backup: 'fixture:backup', support: 'fixture:support terms' };
  await assert.rejects(s.event('handover_completed', handover), /settled project balance/);
  await s.event('invoice_recorded', { invoice_id: 'invoice-2', amount_cents: 60000, currency: 'USD', reference: 'fixture:balance invoice' }, 'balance-invoice');
  await s.event('payment_recorded', { invoice_id: 'invoice-2', payment_id: 'payment-2', amount_cents: 60000, currency: 'USD', settled_verified: true, simulated: true, reference: 'fixture:settled balance' }, 'balance-payment');
  await s.event('handover_completed', handover);
  await s.event('support_opened', { ticket_id: 'ticket-1', description: 'Update pickup hours', priority: 'routine', review_at: '2026-10-20T15:00:00Z' });
  await assert.rejects(s.event('project_closed'), /open support/);
  await s.event('support_closed', { ticket_id: 'ticket-1', resolution: 'Hours corrected and checked', client_notified_verified: true, reference: 'fixture:notification' });
  await s.event('project_closed');
  const dashboard = await s.app.dashboard();
  assert.equal(dashboard.prospects['fictional-bakery'].stage, 'Closed');
  assert.equal(dashboard.daily.unique_businesses, 0); assert.equal(dashboard.daily.actual_call_attempts, 0); assert.equal(dashboard.daily.actual_emails, 0);
  assert.equal(dashboard.controls.research_paused, true); assert.equal(dashboard.controls.outreach_paused, true);
});
test('transcript analysis cannot approve itself; exact quotes and independent review bind the owner decision', async t => {
  const s = await setup(t), proposal = await connected(s);
  assert.equal((await s.app.snapshot()).prospects['fictional-bakery'].stage, 'Connected review');
  await assert.rejects(s.event('call_reviewed', { call_id: 'call-1', proposal_sha256: hash(proposal), outcome: 'discovery' }, 'worker-approval', undefined, 'worker'), /owner review/);
  await assert.rejects(s.event('call_reviewed', { call_id: 'call-1', proposal_sha256: hash('stale'), outcome: 'discovery' }), /exact current/);
  await assert.rejects(s.event('transcript_assessed', { call_id: 'call-1', proposal: { ...proposal, claims: [{ claim: 'Invented budget', quote: 'I have $5000' }] }, review: {} }, 'bad-proposal', undefined, 'worker'), /exact transcript quote/);
  await assert.rejects(s.app.apply({ id: 'revision-stale', prospect_id: 'fictional-bakery', type: 'note_added', at, data: { note: 'stale approval' } }, { expectedRevision: 0 }), /Record changed/);
});
test('no-answer releases one queued email; decline cancels it permanently and late positive events cannot revive it', async t => {
  const s = await setup(t); await s.app.apply(prospect());
  const event = { id: 'attempt-1', prospect_id: 'fictional-bakery', type: 'call_logged', at, data: { call_id: 'call-1', outcome: 'no_answer', simulated: true, performed_at: at } };
  await s.app.apply(event); assert.equal((await s.app.apply(event)).duplicate, true);
  assert.equal(Object.values((await s.app.snapshot()).actions).filter(a => a.type === 'email').length, 1);
  await s.event('call_logged', { call_id: 'call-2', outcome: 'do_not_contact', simulated: true, performed_at: at }, 'stop');
  const r = (await s.app.snapshot()).prospects['fictional-bakery']; assert.equal(r.stage, 'Stopped');
  assert.equal(Object.values((await s.app.snapshot()).actions).find(a => a.type === 'email').status, 'Cancelled');
  await assert.rejects(s.event('discovery_confirmed', { goal: 'old positive note' }), /Restriction/);
  await assert.rejects(s.app.apply({ ...event, data: { ...event.data, outcome: 'connected' } }), /conflicts/);
});
test('verified replies create an attention item and save attributed drafts against the exact reply', async t => {
  const s = await setup(t); await s.app.apply(prospect());
  await s.app.apply({ id: 'reply-source-event', prospect_id: 'fictional-bakery', type: 'reply_received', at, data: fixtureReply('verified-reply-1','fictional-thread','fictional-bakery@example.invalid') }, { actor: 'provider' });
  const alert = (await s.app.dashboard()).reply_alerts.find(item => item.prospect_id === 'fictional-bakery');
  assert.ok(alert, 'a verified reply should appear in Needs attention');
  assert.match(alert.reason, /future cold follow-ups are paused/);
  await assert.rejects(s.event('reply_draft_saved', { source_id: 'stale-reply', body: 'A draft for the wrong reply.' }, 'stale-reply-draft', undefined, 'friend'), /exact current reply/);
  await s.event('reply_draft_saved', { source_id: 'verified-reply-1', reply_sha256:hash((await s.app.snapshot()).prospects['fictional-bakery'].reply), source_sha256:(await s.app.snapshot()).prospects['fictional-bakery'].reply.content.source_sha256, body: 'Thanks for the details. I would be glad to discuss the next step.' }, 'reply-draft', undefined, 'friend');
  let state = await s.app.snapshot();
  assert.equal(state.prospects['fictional-bakery'].reply_drafts.at(-1).actor,'friend');
  assert.equal(state.prospects['fictional-bakery'].reply_draft.status,'Draft');
  assert.equal(state.events['reply-draft'].actor, 'friend');
  await s.event('reply_reviewed', { source_id: 'verified-reply-1', reply_sha256: hash(state.prospects['fictional-bakery'].reply), outcome: 'hold', note: 'Wait for a human follow-up.' }, 'reply-decision', undefined, 'friend');
  state = await s.app.snapshot();
  assert.equal(state.prospects['fictional-bakery'].stage, 'Hold');
  assert.equal((await s.app.dashboard()).reply_alerts.length, 0);
});
test('skipping a task never becomes a call or email; campaign dates use local business days', async t => {
  const s = await setup(t); await s.app.apply(prospect());
  await s.event('call_logged', { call_id: 'skip-1', outcome: 'skipped', simulated: true, performed_at: at });
  const state = await s.app.snapshot(); assert.equal(state.prospects['fictional-bakery'].attempts.length, 0);
  assert.ok(!Object.values(state.actions).some(a => a.type === 'email'));
  assert.equal(businessDaysBetween('2026-10-16T23:30:00Z', '2026-10-19T14:00:00Z'), 1);
});
test('backup and restore preserve history, disable execution, refuse corrupt or existing destinations', async t => {
  const s = await setup(t); await connected(s);
  const output = join(s.directory, 'backup.json'), destination = `${s.directory}-restored`;
  t.after(() => rm(destination, { recursive: true, force: true }));
  await s.app.backup(output); await StudioLifecycle.restore({ input: output, destination });
  const restored = await StudioLifecycle.open({ directory: destination, now: () => new Date(at) });
  assert.deepEqual((await restored.snapshot()).events, (await s.app.snapshot()).events);
  assert.equal(restored.config.outreach_enabled, false); assert.equal(restored.config.transcript_ai.enabled, false);
  await assert.rejects(StudioLifecycle.restore({ input: output, destination }), /EEXIST/);
  const bundle = JSON.parse(await readFile(output, 'utf8')); bundle.body += ' ';
  await writeFile(output, JSON.stringify(bundle)); await assert.rejects(StudioLifecycle.restore({ input: output, destination: `${destination}-bad` }), /checksum/);
});
test('controlled mode refuses real contacts and production execution remains closed', async t => {
  const s = await setup(t), real = prospect(); real.data.controlled = false; real.data.contact.email = 'someone@business.com';
  await assert.rejects(s.app.apply(real), /fictional records only/);
  const config = { ...initialConfig, outreach_enabled: true };
  await writeFile(join(s.directory, 'lifecycle-config.json'), JSON.stringify(config));
  await assert.rejects(StudioLifecycle.open({ directory: s.directory }), /final readiness review/);
});
test('two cold calls are a limit; an unverified email holds the handoff without losing the actual recorded outcome', async t => {
  const s = await setup(t); await s.app.apply(prospect());
  for (let n = 1; n <= 2; n++) await s.event('call_logged', { call_id: `call-${n}`, outcome: 'no_answer', simulated: true, performed_at: at }, `attempt-${n}`);
  await assert.rejects(s.event('call_logged', { call_id: 'call-3', outcome: 'no_answer', simulated: true, performed_at: at }, 'attempt-3'), /Two-call/);
  const uncertain = prospect('uncertain-email'); uncertain.data.contact.verified = false; await s.app.apply(uncertain);
  await s.event('call_logged', { call_id: 'uncertain-call', outcome: 'no_answer', simulated: true, performed_at: at }, 'uncertain-attempt', 'uncertain-email');
  const r = (await s.app.snapshot()).prospects['uncertain-email']; assert.equal(r.attempts.length, 1); assert.equal(r.stage, 'Hold'); assert.match(r.next_check, /Verify the public email/);
  await s.app.apply(prospect('phone-only')); await s.app.change(state => { state.prospects['phone-only'].contact.email = null; });
  await s.event('call_logged', { call_id: 'phone-call', outcome: 'no_answer', simulated: true, performed_at: at }, 'phone-attempt', 'phone-only');
  const phoneState = await s.app.snapshot();
  assert.equal(Object.values(phoneState.actions).some(a => a.prospect_id === 'phone-only' && a.type === 'email'), false);
  assert.equal(Object.values(phoneState.actions).some(a => a.prospect_id === 'phone-only' && a.type === 'call_task' && a.status === 'Queued'), true);
});
test('a late-logged promised callback stays due and a stop cancels that local callback', async t => {
  const s = await setup(t), p = prospect(); p.data.qualification.checked_at = '2026-10-19T12:00:00Z'; p.data.contact.checked_at = '2026-10-19T12:00:00Z'; await s.app.apply(p);
  await s.event('call_logged', { call_id: 'callback-1', outcome: 'callback', simulated: true, performed_at: '2026-10-19T13:00:00Z', callback_at: '2026-10-19T14:00:00Z' });
  assert.equal((await s.app.dashboard()).daily.due[0].kind, 'callback');
  await s.event('contact_stopped', { reason: 'do_not_contact' });
  assert.ok(Object.values((await s.app.snapshot()).actions).filter(a => a.type === 'callback_task').every(a => a.status === 'Cancelled'));
});
test('a transcript callback with no exact time stays a reminder and never invents a client commitment',async t=>{
  const s=await setup(t);await s.app.apply(prospect());
  await s.event('call_logged',{call_id:'connected-callback',outcome:'connected',simulated:true,performed_at:at});
  const transcript='Owner: Please call back next week. I do not have an exact time.';
  await s.event('transcript_added',{call_id:'connected-callback',text:transcript,permission_confirmed:true},'callback-transcript');
  const proposal={schema_version:1,transcript_sha256:hash(transcript),outcome:'callback',callback_at:null,summary:'The owner requested a callback without giving an exact time.',claims:[{claim:'Requested a callback',quote:'Please call back next week.'}],unknowns:['Exact callback time is unknown']};
  await s.event('transcript_assessed',{call_id:'connected-callback',proposal,review:{verdict:'Accepted',proposal_sha256:hash(proposal),independent:true}},'callback-assessment','fictional-bakery','controlled-fixture');
  await s.event('call_reviewed',{call_id:'connected-callback',proposal_sha256:hash(proposal),outcome:'callback'},'callback-owner-review');
  const state=await s.app.snapshot(),r=state.prospects['fictional-bakery'];
  assert.equal(r.callback_at,null);assert.equal(r.callback_due_at,'2026-10-20T13:00:00.000Z');
  assert.equal(Object.values(state.actions).some(a=>a.type==='email'),false);
});
test('an unspecified callback stays call-only and receives an internal 9am next-business-day task',async t=>{
  const s=await setup(t);await s.app.apply(prospect());
  await s.event('call_logged',{call_id:'unspecified-callback',outcome:'callback',simulated:true,performed_at:at});
  const state=await s.app.snapshot(),r=state.prospects['fictional-bakery'],task=Object.values(state.actions).find(a=>a.type==='callback_task');
  assert.equal(r.stage,'Callback');assert.equal(r.callback_at,null);assert.equal(r.callback_due_at,'2026-10-20T13:00:00.000Z');
  assert.deepEqual(task.payload,{due_at:'2026-10-20T13:00:00.000Z',kind:'callback',exact_time:false});
  assert.equal(Object.values(state.actions).some(a=>a.type==='email'),false);
  assert.equal(nextBusinessMorning('2026-10-30T15:00:00.000Z').toISOString(),'2026-11-02T14:00:00.000Z');
});
