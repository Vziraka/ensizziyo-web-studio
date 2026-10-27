import {operationsMailCapability,isOperationsMail,mailRecordEvents,applyMailRecord} from './shared-operations-exact-mail.mjs';
import {applySharedProjectEvent,sharedProjectDashboard} from './shared-project-continuation.mjs';
import {bookingConfirmations} from './calendar-confirmation.mjs';
import {calendarBookingView} from './shared-operations-calendar.mjs';
import {replySuggestion,replyDraftContent,replyDraftCurrent,validReplySource,emailDraftSource} from './reply-content.mjs';
import {retainedConversationContext} from './google-incoming-mail.mjs';
import {conversationEvents,applyConversationRecord} from './conversation-records.mjs';
import {selectReplyAttachments,currentReplyAttachments} from './reply-attachments.mjs';
import {applyInertNote,inertReconciliation} from './inert-shared-workspace.mjs';
import {applyManualRecord,manualRecordEvents} from './shared-manual-records.mjs';
import {applyDispatchManualRecord,applyDispatchProjectRecord,dispatchHasManual,dispatchHasProjects,dispatchProjectEvents} from './shared-internal-dispatch.mjs';
import {prepareNotificationsInState,notificationView} from './team-notifications.mjs';
import {openingView,selectOpening} from './opening-policy.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { acquireLock, privateStateDirectory, readJson, saveJson } from './engine.mjs';
import { dailyCallQueue } from './apollo-queue.mjs';
import { verificationLane, verificationData, validateVerificationRecord, verificationFresh, callStages } from './verification-calls.mjs';
import { verifySupplementalReviewLedger } from './supplemental-reviews.mjs';
import { callSupply } from './call-desk.mjs';
import { ownerContactView, ownerContactSummary, contactEvidenceView } from './owner-contacts.mjs';
import { providerContactView, providerContactSummary } from './provider-contacts.mjs';
import {applyProjectWork,syncProjectWork} from './project-work.mjs';
import {scopedDesignPreferences,feedbackScope} from './design-preferences.mjs';
import {businessType} from './business-types.mjs';
import {composeFollowUp,followUpOutcomes,followUpSetupIssues} from './follow-up-template.mjs';

export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const check = (condition, message) => { if (!condition) throw Error(message); };
const text = (value, max = 3000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const date = value => typeof value === 'string' && /Z$|[+-]\d\d:\d\d$/.test(value) && Number.isFinite(Date.parse(value));
async function acquireLifecycleLock(directory) {
  for(let attempt=0;;attempt++)try{return await acquireLock(directory);}
  catch(error){if(error.code!=='RUNNER_BUSY'||attempt===15)throw error;await delay(Math.min(20*2**attempt,200));}
}
const money = value => Number.isSafeInteger(value) && value > 0 && value <= 100_000_000;
const services = ['website', 'systems', 'ai', 'marketing'];
const coldOutcomes = ['no_answer', 'busy', 'voicemail'];
const connectedOutcomes = ['discovery', 'requested_info', 'callback', 'not_interested', 'do_not_contact', 'wrong_contact', 'uncertain'];
const assetEvents = ['asset_registered', 'asset_version_registered', 'asset_version_selected', 'asset_version_disputed', 'asset_feedback_added'];
const assetKey = value => key(value) && value !== '__proto__';
function validateAssetReference(value) {
  check(text(value, 600) && value === value.trim(), 'Add a private file reference, not copied file content');
  if (value.startsWith('drive:')) check(/^drive:[a-zA-Z0-9_-]{10,256}$/.test(value), 'Use a Google Drive file ID only; omit share tokens and query parameters');
  else if (value.startsWith('private-path:')) {
    const path = value.slice('private-path:'.length).replaceAll('\\', '/');
    check(path && !path.startsWith('/') && !/^[a-zA-Z]:/.test(path) && !/[?#]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'), 'Use a relative path inside private storage');
  } else check(false, 'Use drive:<file-id> or private-path:<relative-path>; never store credentials or file contents');
}
export const initialConfig = {
  schema_version: 1, mode: 'controlled', run_id: 'studio-lifecycle-controlled',
  research_enabled: false, outreach_enabled: false, connector_writes_enabled: false,
  priority: 'website', timezone: 'America/New_York', daily_new_research_target: 25,
  sender: { operator_names: { owner: '', friend: '' } },
  follow_up: { enabled: false, sender_verified: false, demo_verified: false, booking_url: '' },
  transcript_ai: { enabled: false, daily_calls: 4, reserve_percent: 30,
    author_model: 'gpt-5.6-luna', reviewer_model: 'gpt-5.6-sol', effort: 'high' },
  calendar: { duration_minutes: 20, buffer_minutes: 15, start_hour: 9, end_hour: 17, weekdays: [1, 2, 3, 4, 5] },
  readiness: { owner_design_approved: false, business_sender_verified: false, native_automation_verified: false,
    delivery_and_stop_verified: false, website_inquiry_verified: false, prospect_supply_verified: false, capacity_verified: false }
};

export function businessDate(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function dailyNewProspectCount(state, now = new Date()) {
  const day = businessDate(now);
  return Object.values(state.events ?? {}).filter(event => ['prospect_imported', 'verification_imported'].includes(event.type) && businessDate(event.at) === day).length;
}
export function addBusinessDays(value, count) {
  check(Number.isInteger(count) && count >= 0 && count <= 30, 'Use a bounded business-day offset');
  const due = new Date(value); let days = 0;
  while (days < count) { due.setUTCDate(due.getUTCDate() + 1); if (![0, 6].includes(new Date(`${businessDate(due)}T12:00:00Z`).getUTCDay())) days++; }
  return due;
}
export function nextBusinessMorning(value) {
  check(date(value), 'Use a dated callback request');
  const day = new Date(`${businessDate(value)}T12:00:00Z`);
  do { day.setUTCDate(day.getUTCDate() + 1); } while ([0, 6].includes(day.getUTCDay()));
  const datePart = day.toISOString().slice(0, 10), guess = new Date(`${datePart}T09:00:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(guess).map(part => [part.type, part.value]));
  const observedLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  const offset = observedLocal - guess.getTime();
  return new Date(Date.parse(`${datePart}T09:00:00Z`) - offset);
}
export function businessDaysBetween(start, end) {
  let day = new Date(`${businessDate(start)}T12:00:00Z`), count = 0;
  const finish = businessDate(end);
  while (day.toISOString().slice(0, 10) < finish && count <= 11) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (![0, 6].includes(day.getUTCDay())) count++;
  }
  return count;
}
function request(state, record, type, payload, eventId) {
  const id = `${eventId}-${type}`;
  state.actions[id] ??= { id, prospect_id: record.id, type, payload, status: 'Queued', created_at: state.updated_at,
    ...(record.follow_up_owner ? { assigned_to: record.follow_up_owner } : {}) };
}
function scheduleCallback(state, record, callbackAt, performedAt, eventId) {
  const exact = callbackAt ?? null;
  if (exact !== null) check(date(exact) && Date.parse(exact) > Date.parse(performedAt), 'Confirm an exact callback after the call; overdue promises stay due');
  const due = exact ? new Date(exact) : nextBusinessMorning(performedAt);
  record.stage = 'Callback'; record.callback_at = exact; record.callback_due_at = due.toISOString();
  request(state, record, 'callback_task', { due_at: due.toISOString(), kind: 'callback', exact_time: Boolean(exact) }, eventId);
}
export function pauseCold(state, record, eventId, reason) {
  record.cold_paused = true;
  for (const action of Object.values(state.actions)) if (action.prospect_id === record.id && ['email', 'call_task', 'callback_task'].includes(action.type)) {
    if (action.status === 'Queued') {
      const handedOff=action.type==='email'&&state.operations?.requests?.[`${action.id}-intent`];
      action.status=handedOff?'Uncertain':'Cancelled';const follow=record.follow_ups?.[action.payload.call_id];
      if(handedOff)action.hold='Stop arrived after native handoff; verify suppression and delivery before continuing';
      if(follow){follow.status=handedOff?'Uncertain':'Cancelled';follow.reason=handedOff?action.hold:reason;}
    }
    if (action.status === 'Pending') { action.status = 'Uncertain'; action.hold = 'Stop arrived after dispatch; reconcile provider before continuing'; }
    if (action.status === 'Verified' && action.provider_task && ['call_task', 'callback_task'].includes(action.type)) action.cancel_requested = true;
  }
  if (record.apollo?.sequence_id) {
    record.suppression = 'Pending';
    if (!Object.values(state.actions).some(a => a.prospect_id === record.id && a.type === 'sequence_stop' && ['Queued', 'Pending', 'Uncertain', 'Verified'].includes(a.status)))
      request(state, record, 'sequence_stop', { reason }, eventId);
  } else record.suppression = 'Local only';
}
function contactable(record, at) {
  check(record.stage !== 'Stopped' && !record.restriction && !record.cold_paused, 'Cold contact is paused or restricted');
  if (verificationLane(record)) validateVerificationRecord(record, at);
  else {
    check(record.qualification?.verdict === 'Research-qualified' && record.qualification.independent_review === 'Accepted', 'Reviewed qualification required');
    check(date(record.qualification.checked_at) && Date.parse(at) >= Date.parse(record.qualification.checked_at) &&
      Date.parse(at) - Date.parse(record.qualification.checked_at) <= 30 * 86_400_000, 'Research/contact check is stale or from the future');
  }
  const first = record.attempts[0]?.at;
  check(!first || businessDaysBetween(first, at) < 10, 'Ten-business-day cold campaign has ended');
}
function safeReference(value) {
  check(text(value, 1500), 'An evidence/document reference is required');
  check(!/^(?:javascript|data|file):/i.test(value), 'Unsafe document reference');
  return value;
}
function owner(actor) { check(['owner', 'friend', 'controlled-fixture'].includes(actor), 'This decision requires owner review'); }
export function currentHostedTranscript(record,callId){
 const scope=record.proposals[callId]?.review?.provenance?.scope;if(!scope)return;
 const t=record.transcripts[callId];
 check(scope.call_sha256===hash(record.calls[callId])&&scope.transcript_record_sha256===hash(t)&&t?.sha256===hash(t.text)&&scope.audio.every(a=>a.metadata_sha256===hash(record.call_audio?.[a.id])),'Hosted assessment source changed; do not approve stale facts or email');
}

function prepareCallFollowUp(state,record,call,config,at,reviewed=false){
  if(!config.follow_up?.enabled||!call.desk||!followUpOutcomes.includes(call.outcome))return;
  record.follow_ups??={};
  // The original performed call owns this message. Historical note changes never regenerate it.
  const prior=record.follow_ups[call.call_id];
  if(prior&&(!reviewed||prior.status!=='Held'||prior.action_id))return;
  const content=prior?{...prior.content,to:record.contact.email??null}:composeFollowUp(record,call,config);
  storeCallFollowUp(state,record,call,config,at,content,call.event_id,prior?.created_at);
}
function storeCallFollowUp(state,record,call,config,at,content,eventId,createdAt=at,emailReviewed=false){
  const issues=[];
  if(config.shared_capability==='shared-manual-records-v1'||dispatchHasManual(config.shared_capability))issues.push('Manual recording only; provider execution and email sending are disabled');
  if(record.proposals[call.call_id]?.review?.provenance?.provider==='netlify-gateway'&&!emailReviewed)issues.push('Review selected transcript facts and approve the exact email revision before sending');
  if(content.focus==='undecided')issues.push('A specific, reviewed service focus is needed before preparing a relevant follow-up');
  if(record.restriction||record.reply)issues.push('Contact stopped or a reply needs owner review');
  if(!content.to||!record.contact.verified)issues.push('A verified business email is needed; follow up with a confirmed address');
  if(['Verification review','Connected review'].includes(record.stage)||call.outcome==='connected'&&!['Discovery','Information requested','Callback'].includes(record.stage))issues.push('Confirm the saved conversation and next step first');
  const emails=record.attempts.filter(a=>a.channel==='email').length;
  const pending=Object.values(record.follow_ups).filter(f=>f.call_id!==call.call_id&&f.action_id&&!['Sent','Cancelled'].includes(f.status)).length;
  if(emails+pending>=2)issues.push('The two-email campaign limit is already used or reserved');
  if(record.attempts[0]&&businessDaysBetween(record.attempts[0].at,at)>=10)issues.push('The ten-business-day campaign has ended');
  const setup=record.controlled?[]:followUpSetupIssues(config);
  const unansweredCalls=record.attempts.filter(a=>a.channel==='call').length,sendAfter=unansweredCalls>=2&&['no_answer','voicemail'].includes(call.outcome)?addBusinessDays(at,3).toISOString():at;
  const entry={call_id:call.call_id,call_sha256:hash(call),content,status:issues.length?'Held':'Prepared',reason:[...issues,...setup,...(!record.controlled&&!config.outreach_enabled?['Commercial email sending is held']:[])].join('. '),created_at:createdAt,send_after:sendAfter};
  record.follow_ups??={};
  record.follow_ups[call.call_id]=entry;
  if(!issues.length){request(state,record,'email',{call_id:call.call_id,follow_up:true,content_sha256:hash(content),email:content.to,due_at:sendAfter},eventId);entry.action_id=`${eventId}-email`;}
  return entry;
}

export function validateTranscriptProposal(proposal, transcript) {
  check(proposal?.schema_version === 1 && proposal.transcript_sha256 === transcript.sha256 && connectedOutcomes.includes(proposal.outcome), 'Transcript proposal does not match the saved call');
  check(text(proposal.summary) && Array.isArray(proposal.claims) && proposal.claims.length > 0 && proposal.claims.length <= 16, 'A supported transcript summary is required');
  for (const claim of proposal.claims) check(text(claim.claim, 1200) && text(claim.quote, 1500) && transcript.text.includes(claim.quote), 'Every claim needs an exact transcript quote');
  check(Array.isArray(proposal.unknowns) && proposal.unknowns.every(x => text(x, 1000)), 'Unknowns must be explicit');
  check(proposal.callback_at === null || date(proposal.callback_at), 'Invalid proposed callback time');
  check(proposal.outcome !== 'callback' || proposal.callback_at === null || date(proposal.callback_at), 'Callback time must be an exact date or explicitly unknown');
  return proposal;
}

export class StudioLifecycle {
  constructor(directory, now = () => new Date()) { this.directory = directory; this.now = now; }
  static async fromStore({store,now}){
    const app=new StudioLifecycle(null,now);app.store=store;app.config=await store.config();
    check(app.config.schema_version===1&&['controlled','production'].includes(app.config.mode)&&key(app.config.run_id)&&app.config.timezone==='America/New_York','Invalid shared lifecycle configuration');
    if(store.inertBinding||store.manualBinding||store.projectBinding||store.dispatchBinding){await store.envelope();return app;}
    check(app.config.mode==='controlled'&&app.config.outreach_enabled===false&&app.config.connector_writes_enabled===false&&app.config.research_enabled===false&&app.config.transcript_ai.enabled===false,'Shared preview accepts execution-disabled fictional work only');
    const state=await app.snapshot();check(state.run_id===app.config.run_id&&state.mode===app.config.mode&&Object.values(state.prospects).every(r=>r.controlled===true),'Shared preview cannot load production records');return app;
  }
  async loadConfig(){return this.store?this.store.config():readJson(join(this.directory,'lifecycle-config.json'));}
  static async open({ directory, now }) {
    directory = await privateStateDirectory(directory);
    const app = new StudioLifecycle(directory, now);
    const config = await readJson(join(directory, 'lifecycle-config.json'));
    check(config.schema_version === 1 && ['controlled', 'production'].includes(config.mode) && key(config.run_id), 'Invalid lifecycle configuration');
    check(config.timezone === 'America/New_York' && (config.daily_new_research_target??25)===25 && (config.daily_target===undefined||config.daily_target===50), 'Use the shared 25-new-business research target and Eastern timezone');
    check(config.research_enabled === false, 'Research execution uses the separately bound controller control');
    if (config.mode === 'controlled') check(config.outreach_enabled === false, 'Production activation requires the separate final readiness review');
    else if (config.outreach_enabled || config.connector_writes_enabled || config.calls_enabled) { const { requireCallRelease } = await import('./production.mjs'); requireCallRelease(config); }
    app.config = config;
    await app.change(state => { check(state.run_id === config.run_id && state.mode === config.mode, 'State belongs to a different run or mode'); });
    return app;
  }
  static async initialize({ directory, config = initialConfig, now }) {
    directory = await privateStateDirectory(directory); await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(join(directory, 'lifecycle-config.json'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
    await writeFile(join(directory, 'lifecycle-state.json'), JSON.stringify({ schema_version: 1, run_id: config.run_id, mode: config.mode,
      revision: 0, updated_at: new Date().toISOString(), prospects: {}, events: {}, actions: {}, asset_index: {}, ai_attempts: {}, exceptions: [] }, null, 2), { flag: 'wx', mode: 0o600 });
    return StudioLifecycle.open({ directory, now });
  }
  async change(fn,options) {
    if(this.store)return this.store.change(fn,options);
    const previous = this.changeTail ?? Promise.resolve();
    let finish;
    this.changeTail = new Promise(resolve => { finish = resolve; });
    await previous;
    let release;
    try {
      release = await acquireLifecycleLock(this.directory);
      const state = await readJson(join(this.directory, 'lifecycle-state.json'));
      check(state.schema_version === 1, 'Unknown state version');
      if(options?.configFingerprint)check(hash(await this.loadConfig())===options.configFingerprint,'Incoming configuration changed during read; no cursor or effects committed');
      const result = await fn(state);
      check(Buffer.byteLength(JSON.stringify(state)) <= 20_000_000, 'State size limit reached; archive closed records before proceeding');
      await saveJson(join(this.directory, 'lifecycle-state.json'), state);
      return result;
    } finally { try { await release?.(); } finally { finish(); } }
  }
  async snapshot() { return this.store?this.store.snapshot():readJson(join(this.directory, 'lifecycle-state.json')); }
  async apply(event, { actor = 'owner', expectedRevision } = {}) {
    this.config = await this.loadConfig();
    check(key(event?.id) && key(event.prospect_id) && text(event.type, 80) && date(event.at), 'Event needs stable IDs and an explicit timestamp');
    check(Date.parse(event.at) <= +this.now() + 60_000, 'An event cannot claim a future action');
    if(this.store?.emailTaskBinding)return (await import('./shared-email-draft-tasks.mjs')).recordEmailTaskReview(this,event,actor,expectedRevision);
    if(this.store?.dispatchBinding&&dispatchHasManual(this.store.dispatchBinding.scope.capability)){
      const config=this.config,record={event,actor,revision:expectedRevision};
      const mail=isOperationsMail(config.shared_capability)&&mailRecordEvents.includes(event.type);
      const project=dispatchHasProjects(config.shared_capability)&&(dispatchProjectEvents.includes(event.type)||conversationEvents.includes(event.type));
      return this.change(state=>{record.at=this.now().toISOString();return (mail?applyMailRecord:project?applyDispatchProjectRecord:applyDispatchManualRecord)(state,config,record,new Date(record.at));},{eventId:event.id,eventFingerprint:hash({event,actor}),configFingerprint:hash(config),[mail?'mailRecord':project?'projectRecord':'manualRecord']:record});
    }
    if(this.store?.projectBinding)return this.change(state=>applySharedProjectEvent(state,event,actor,expectedRevision,this.now(),this.config),{eventId:event.id,eventFingerprint:hash({event,actor}),projectRecord:{event,actor,revision:expectedRevision}});
    if(this.store?.inertBinding)return this.change(state=>applyInertNote(state,event,actor,expectedRevision,this.now()),{eventId:event.id,eventFingerprint:hash({event,actor}),inertNote:{event,actor,revision:expectedRevision}});
    if(this.store?.manualBinding)return this.change(state=>applyManualRecord(state,event,actor,expectedRevision,this.now(),this.config),{eventId:event.id,eventFingerprint:hash({event,actor}),manualRecord:{event,actor,revision:expectedRevision}});
    if (event.type === 'call_logged' && this.config.mode === 'production') {
      const { requireCallRelease } = await import('./production.mjs'); requireCallRelease(this.config);
      check(this.config.operations.allowlist.includes(event.prospect_id), 'Call is outside the approved queue');
    }
    const validateMachineDraft=event.type==='transcript_added'&&(event.data?.transcription_draft_sha256||event.data?.transcription_policy_sha256)?(event.data.transcription_policy_sha256?(await import('./full-call-transcription.mjs')).validateFullCallDraft:(await import('./call-transcription.mjs')).validateTranscriptionDraft):null;
    const validateHostedAssessment=event.type==='transcript_assessed'&&event.data?.assessment_attempt_id?(await import('./hosted-assessment.mjs')).validateHostedAssessment:null;
    const eventFingerprint=hash({event,actor});
    return this.change(state=>this.reduceEvent(state,event,{actor,expectedRevision,validateMachineDraft,validateHostedAssessment}),{eventId:event.id,eventFingerprint});
  }
  // Shared manual recording reuses this reducer without the production call-execution release.
  reduceEvent(state,event,{actor,expectedRevision,validateMachineDraft=null,validateHostedAssessment=null,manualRecording=false,projectRecording=false,agentDraft=null}) {
      if(conversationEvents.includes(event.type))return applyConversationRecord(state,event,actor,expectedRevision,this.now());
      const fingerprint = hash({ event, actor });
      if (state.events[event.id]) { check(state.events[event.id].fingerprint === fingerprint, 'Event ID conflicts with saved evidence'); return { duplicate: true, revision: state.revision }; }
      check(expectedRevision === undefined || expectedRevision === state.revision, 'Record changed; refresh before approving');
      check(Object.keys(state.events).length < 20_000, 'Event limit reached; archive closed records');
      const data = event.data ?? {}, eid = event.id;
      let r = state.prospects[event.prospect_id];
      state.updated_at = this.now().toISOString();
      if (assetEvents.includes(event.type)) {
        check(event.prospect_id === 'studio-assets' && ['owner', 'friend'].includes(actor), 'Studio assets require one of the two signed operators');
        const index = state.asset_index ??= {};
        if (event.type === 'asset_registered') {
          check(assetKey(data.asset_id) && !Object.hasOwn(index, data.asset_id) && text(data.name, 200) && text(data.kind, 80), 'Use a unique asset ID, name and category');
          check(data.scope === 'studio' || data.scope === 'project', 'Choose studio-wide or project asset scope');
          if (data.scope === 'project') check(key(data.project_id) && Object.hasOwn(state.prospects, data.project_id), 'Choose an existing project record; asset scope is independent of its sales stage');
          else check(data.project_id === undefined || data.project_id === null, 'Studio-wide assets cannot name a client project');
          check(assetKey(data.version_id) && text(data.version_label, 80), 'Give the first asset version a stable ID and label');
          validateAssetReference(data.reference);
          index[data.asset_id] = { id: data.asset_id, name: data.name.trim(), kind: data.kind.trim(), scope: data.scope,
            ...(data.scope === 'project' ? { project_id: data.project_id } : {}), baseline_version: null, choices: {}, dispute: null,
            versions: { [data.version_id]: { id: data.version_id, label: data.version_label.trim(), reference: data.reference,
              registered_by: actor, registered_at: event.at } } };
        } else {
          const asset = Object.hasOwn(index, data.asset_id) ? index[data.asset_id] : null;
          check(asset, 'Register the asset before adding or approving a version');
          if (event.type === 'asset_version_registered') {
            check(assetKey(data.version_id) && !Object.hasOwn(asset.versions, data.version_id) && text(data.version_label, 80) && !Object.values(asset.versions).some(v => v.label === data.version_label.trim()), 'Use a unique version ID and label');
            validateAssetReference(data.reference);
            check(!Object.values(asset.versions).some(v => v.reference === data.reference), 'Each version needs its own immutable file reference');
            asset.versions[data.version_id] = { id: data.version_id, label: data.version_label.trim(), reference: data.reference,
              registered_by: actor, registered_at: event.at };
          } else if (event.type === 'asset_feedback_added') {
            check(Object.hasOwn(asset.versions,data.version_id), 'Choose a registered asset version for the feedback');
            check(text(data.feedback,2000), 'Retain the operator feedback within 2000 characters');
            const selection=data.scope??'auto',resolved=feedbackScope(data.feedback,selection),{scope}=resolved,projectId=data.project_id??asset.project_id;
            if(scope==='project'||selection==='auto'&&projectId!=null)check(key(projectId)&&Object.hasOwn(state.prospects,projectId)&&(!asset.project_id||asset.project_id===projectId), 'Choose the existing project that owns this feedback');
            if(selection==='studio')check(data.project_id===undefined||data.project_id===null, 'Studio-wide feedback cannot name a project');
            asset.feedback??=[];
            asset.feedback.push({id:eid,version_id:data.version_id,feedback:data.feedback,...resolved,...(scope==='project'?{project_id:projectId}:{}),...(projectId?{source_project_id:projectId}:{}),actor,at:event.at,baseline_at_feedback:asset.baseline_version??null,approval_at_feedback:asset.baseline_approval_event??null});
          } else if (event.type === 'asset_version_disputed') {
            check(!asset.dispute, 'A disagreement is already open; select a version to resolve it');
            check(asset.baseline_version && Object.hasOwn(asset.versions, data.version_id), 'Choose a registered version to dispute against an approved baseline');
            check(data.version_id !== asset.baseline_version, 'Choose a version different from the approved baseline');
            asset.dispute = { id: eid, baseline_version: asset.baseline_version, opened_by: actor, opened_at: event.at,
              choices: { [actor]: { version_id: data.version_id, event_id: eid, at: event.at } } };
            asset.choices = {};
          } else {
            check(Object.hasOwn(asset.versions, data.version_id), 'Select a registered asset version');
            const choice = { version_id: data.version_id, event_id: eid, at: event.at };
            if(!asset.dispute&&asset.baseline_version&&asset.baseline_version!==data.version_id&&scopedDesignPreferences(state,asset.project_id??null).design_preferences.conflicts.length){
              asset.dispute={id:eid,baseline_version:asset.baseline_version,opened_by:actor,opened_at:event.at,reason:'Unresolved scoped design preferences; both operators must select the same new version',choices:{}};asset.choices={};
            }
            asset.choices ??= {};
            if (asset.dispute) {
              asset.dispute.choices[actor] = choice;
              const ownerChoice = asset.dispute.choices.owner, friendChoice = asset.dispute.choices.friend;
              if (ownerChoice && friendChoice && ownerChoice.version_id === friendChoice.version_id) {
                asset.baseline_version = ownerChoice.version_id;
                asset.baseline_approved_at = event.at;
                asset.baseline_confirmed_at = event.at;
                asset.baseline_agreement_events = [ownerChoice.event_id, friendChoice.event_id];
                delete asset.baseline_approved_by;
                delete asset.baseline_approval_event;
                asset.choices = structuredClone(asset.dispute.choices);
                asset.dispute = null;
              }
            } else if (asset.baseline_version !== data.version_id) {
              asset.baseline_version = data.version_id;
              asset.baseline_approved_at = event.at;
              asset.baseline_approved_by = actor;
              asset.baseline_approval_event = eid;
              delete asset.baseline_confirmed_at;
              delete asset.baseline_agreement_events;
              asset.choices = { [actor]: choice };
            } else {
              asset.choices[actor] = choice;
              const ownerChoice = asset.choices.owner, friendChoice = asset.choices.friend;
              if (ownerChoice && friendChoice && ownerChoice.version_id === asset.baseline_version && friendChoice.version_id === asset.baseline_version) {
                asset.baseline_confirmed_at = event.at;
                asset.baseline_agreement_events = [ownerChoice.event_id, friendChoice.event_id];
              }
            }
          }
        }
        r = { id: event.prospect_id };
      } else if (event.type==='workspace_project_created') {
        check(['owner','friend'].includes(actor),'An existing project needs a signed operator');
        check(Object.keys(data).every(k=>['name','purpose','controlled'].includes(k))&&text(data.name,250)&&text(data.purpose,1600),'Supply only the company name, project purpose and workspace mode');
        check(typeof data.controlled==='boolean'&&data.controlled===(this.config.mode==='controlled')&&(!data.controlled||/^STUDIO TEST\s/i.test(data.name.trim())),'Fictional workspaces need a STUDIO TEST name; real clients belong in a separate production workspace');
        const normalized=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(),companyId='workspace-'+hash(normalized(data.name)).slice(0,24);
        check(assetKey(event.prospect_id)&&event.prospect_id!=='studio-assets'&&!r&&!Object.values(state.prospects).some(x=>x.company_id===companyId||normalized(x.name)===normalized(data.name)),'This company/project already exists or uses a reserved ID; use its existing context');
        r=state.prospects[event.prospect_id]={id:event.prospect_id,company_id:companyId,name:data.name.trim(),category:'Existing project',origin:'workspace',idea:data.purpose.trim(),controlled:data.controlled,stage:'Workspace only',cold_paused:true,contact:{verified:false},workspace:{purpose:data.purpose.trim(),created_by:actor,created_at:event.at},
          attempts:[],calls:{},transcripts:{},proposals:{},approved_calls:{},payments:[],invoices:[],materials:[],tasks:[],revisions:[],tickets:[]};
      } else if (['prospect_imported', 'verification_imported'].includes(event.type)) {
        check(dailyNewProspectCount(state, this.now()) < 25, 'The shared limit of 25 new businesses has been reached for today. Import resumes after midnight America/New_York time');
        const verification = event.type === 'verification_imported';
        if (this.config.mode === 'production') check(actor === (verification ? 'verification-import' : 'research-import'), verification ? 'Production verification calls must enter through the retained verification import' : 'Production prospects must enter through the retained independent research review'); else owner(actor);
        check(!r && !Object.values(state.prospects).some(x => x.company_id === data.company_id), 'Prospect/company already exists');
        check(key(data.company_id) && text(data.name, 250) && text(data.idea, 1600) && text(data.category, 150), 'Identity, category and tailored idea required');
        check(typeof data.controlled === 'boolean' && data.controlled === (this.config.mode === 'controlled'), 'Controlled mode accepts fictional records only; production records need a separate workspace');
        check(!data.controlled || data.contact?.email?.endsWith('@example.invalid') && !data.contact?.phone, 'Fictional records must use .invalid email and no dialable phone');
        if (verification) {
          check(date(data.verification?.reviewed_at) && Date.parse(data.verification.reviewed_at) <= Date.parse(event.at), 'Verification review time must be observed, not future');
          const expected = verificationData(data.verification?.packet, new Date(data.verification?.reviewed_at), data.controlled);
          check(hash(data) === hash(expected), 'Verification import differs from its retained packet');
          validateVerificationRecord(data, event.at);
        } else {
          check(!data.call_lane || data.call_lane === 'research', 'Research import cannot choose the verification lane');
          check(data.qualification?.verdict === 'Research-qualified' && data.qualification.independent_review === 'Accepted' &&
            date(data.qualification.checked_at) && /^[a-f0-9]{64}$/.test(data.qualification.report_sha256 ?? '') &&
            /^[a-f0-9]{64}$/.test(data.qualification.review_sha256 ?? '') && text(data.qualification.evidence_ref), 'Accepted source-backed research and review references required');
          check(data.controlled || !businessType(data).unclassified, 'Choose a supported local-business category');
          check(data.controlled || data.contact?.verified === true && date(data.contact.checked_at) && text(data.contact.source), 'Public contact ownership must be verified');
        }
        if (!data.controlled) check(!Object.values(state.prospects).some(x => data.contact.email && x.contact?.email?.toLowerCase() === data.contact.email.toLowerCase() || x.contact?.phone && x.contact.phone.replace(/\D/g, '') === data.contact.phone?.replace(/\D/g, '')), 'Duplicate contact identity already exists; preserve its restrictions');
        r = state.prospects[event.prospect_id] = { ...data, id: event.prospect_id, stage: verification ? 'Ready to verify' : 'Ready to contact', cold_paused: false,
          attempts: [], calls: {}, transcripts: {}, proposals: {}, approved_calls: {}, payments: [], invoices: [], materials: [], tasks: [], revisions: [], tickets: [] };
        request(state, r, 'call_task', { due_at: event.at, kind: 'new' }, eid);
      } else {
        check(r, 'Unknown prospect');
        if(r.origin==='workspace')check(event.type==='note_added','Workspace-only projects support private notes and asset context; no contact, sales qualification or approvals can be inferred');
        if (r.restriction) check(['support_opened', 'support_closed', 'note_added', 'call_note_updated', 'call_audio_reserved', 'call_audio_stored', 'reply_received', 'email_delivered', 'meeting_verified'].includes(event.type), 'Restriction cannot be cleared by a later event');
        switch (event.type) {
          case 'opening_selected':selectOpening(r,event,actor);break;
          case 'project_preparation_requested':
          case 'project_work_recorded':
          case 'concept_refinement_requested':
          case 'unpaid_refinement_exception':
            applyProjectWork(state,r,event,actor);break;
          case 'call_audio_reserved': {
            check(actor==='artifact-store'&&['owner','friend'].includes(data.recorded_by),'Audio metadata must come from authenticated private storage');
            check(key(data.id)&&data.id.length<=80&&key(data.call_id)&&['call','operator_note'].includes(data.kind),'Choose an exact audio clip and purpose');
            check(data.permission_confirmed===true&&date(data.started_at)&&date(data.ended_at)&&Date.parse(data.ended_at)>Date.parse(data.started_at)&&Date.parse(data.ended_at)-Date.parse(data.started_at)<=21*60_000,'Confirm permission and keep each recording within twenty minutes');
            check(['audio/webm','audio/ogg','audio/mp4','audio/wav'].includes(data.mime)&&Number.isInteger(data.bytes)&&data.bytes>=16&&data.bytes<=4_000_000&&/^[a-f0-9]{64}$/.test(data.sha256),'Audio format, size and exact bytes must be verified');
            check(!Object.values(state.prospects).some(p=>p.call_audio?.[data.id]),'The clip ID already belongs to an audio reservation');
            if(data.kind==='operator_note')check(r.calls[data.call_id],'Own spoken notes belong to a saved call');
            else if(!r.calls[data.call_id])check(!r.restriction&&callStages.includes(r.stage)&&r.follow_up_owner===data.recorded_by,'Claim the eligible call before recording it');
            if(r.restriction&&data.kind==='call')check(r.calls[data.call_id]&&Date.parse(data.ended_at)<=Date.parse(r.calls[data.call_id].performed_at)+60_000,'Stopped contact cannot start a later call recording');
            const clips=Object.values(state.prospects).flatMap(p=>Object.values(p.call_audio??{}));
            check(clips.length<2000&&clips.reduce((total,c)=>total+c.bytes,0)+data.bytes<=200_000_000,'Private audio storage allowance is full; review retention before recording more');
            check(clips.filter(c=>businessDate(c.ended_at)===businessDate(event.at)).length<50,'The shared daily audio-clip allowance is full');
            r.call_audio??={};r.call_audio[data.id]={...data,status:'Reserved',reserved_at:event.at};break;
          }
          case 'call_audio_stored': {
            check(actor==='artifact-store','Audio verification must come from private storage');const clip=r.call_audio?.[data.id];
            check(clip?.status==='Reserved'&&hash({...data,status:'Reserved',reserved_at:event.at})===hash(clip),'Verify the exact reserved recording before marking it saved');
            clip.status='Stored';clip.verified_at=event.at;break;
          }
          case 'call_logged': {
            const purpose=r.stage==='Callback'?'callback':r.attempts.some(a=>a.channel==='call')?'follow-up':'new';
            owner(actor); check(key(data.call_id) && !r.calls[data.call_id] && [...coldOutcomes, 'connected', 'callback', 'declined', 'do_not_contact', 'wrong_contact', 'skipped'].includes(data.outcome), 'Explicit unique call outcome required');
            check(!r.follow_up_owner || r.follow_up_owner === actor, 'This business is assigned to the other operator; request a handoff before logging a call');
            check(data.note === undefined || typeof data.note === 'string' && data.note.length <= 3000, 'Keep the call note within 3000 characters');
            check(data.focus===undefined||['ai','systems','website','marketing','undecided'].includes(data.focus),'Choose a supported call focus');
            if (data.desk) {
              check(data.desk === true && (data.intent === undefined || data.outcome === 'connected' && ['discovery','requested_info'].includes(data.intent)), 'Choose the interested next step');
              if(!manualRecording)r.call_undo = {call_id:data.call_id,event_id:eid,record:Object.fromEntries(['stage','cold_paused','callback_at','callback_due_at','next_check','suppression','note','follow_ups','project_work'].map(k=>[k,structuredClone(r[k]??null)])),actions:structuredClone(Object.fromEntries(Object.entries(state.actions).filter(([,a])=>a.prospect_id===r.id)))};
            }
            check(data.simulated === r.controlled, 'Simulated and actual calls cannot be mixed');
            check(date(data.performed_at) && Date.parse(data.performed_at) <= Date.parse(event.at) && (!r.attempts.length || Date.parse(data.performed_at) >= Date.parse(r.attempts.at(-1).at)), 'Call time must be performed, ordered and dated');
            if (data.outcome !== 'skipped') {
              r.follow_up_owner ??= actor === 'controlled-fixture' ? 'owner' : actor;
              if (verificationLane(r)) validateVerificationRecord(r, data.performed_at);
              check(callStages.includes(r.stage), 'Call is outside the contact stage');
              check(r.stage === 'Callback' || r.attempts.filter(x => x.channel === 'call').length < 2, 'Two-call campaign cap reached');
              if (r.stage !== 'Callback') contactable(r, data.performed_at);
              r.attempts.push({ id: data.call_id, channel: 'call', at: data.performed_at, simulated: data.simulated, connected: ![...coldOutcomes, 'wrong_contact'].includes(data.outcome) });
            }
            const opening=openingView(r);
            r.calls[data.call_id] = { ...data, purpose, actor, event_id: eid,...(manualRecording?{attestation:{kind:'operator-reported-completed-call',provider_verified:false,execution:'disabled'}}:{}),opening_context:opening?{status:opening.status,assessment_sha256:opening.assessment_sha256,selected:opening.selected,selected_by:opening.selected_by}:null };
            for (const a of Object.values(state.actions)) if (a.prospect_id === r.id && ['call_task', 'callback_task'].includes(a.type)) {
              if (a.status === 'Queued') a.status = 'Cancelled';
              else if (a.provider_task) a.cancel_requested = true;
            }
            if (['declined', 'do_not_contact'].includes(data.outcome)) { r.restriction = data.outcome; r.stage = 'Stopped'; pauseCold(state, r, eid, data.outcome); }
            else if (data.outcome === 'connected') {
              r.stage = 'Connected review'; pauseCold(state, r, eid, 'Connected call awaiting owner decision');
              if (data.desk && data.intent) {
                r.approved_calls[data.call_id]={outcome:data.intent,at:event.at,actor,note:data.note??'',basis:'Owner-reported conversation; no recording'};
                if(verificationLane(r)) { r.stage='Verification review'; r.next_check='Confirm identity, current activity, decision-maker and goal from your conversation.'; }
                else r.stage=data.intent==='discovery'?'Discovery':'Information requested';
              }
            }
            else if (data.outcome === 'callback') {
              pauseCold(state, r, eid, 'Requested callback'); scheduleCallback(state, r, data.callback_at, data.performed_at, eid);
            } else if (coldOutcomes.includes(data.outcome)) {
              if (data.desk || verificationLane(r) || !r.contact.email || !this.config.outreach_enabled && !r.controlled) {
                r.stage = verificationLane(r) ? 'Verifying' : 'Contacting';
                if (r.cold_paused || r.attempts.filter(x => x.channel === 'call').length >= 2) {
                  r.stage = 'Hold'; r.next_check = r.cold_paused ? 'Requested callback was unanswered; owner reviews the next conversational step. Email stays blocked.' : 'Two call attempts used; hold for owner review. No email is released by this call-only lane.';
                } else {
                  request(state,r,'call_task',{due_at:addBusinessDays(data.performed_at,1).toISOString(),kind:'follow-up'},eid);
                }
              } else {
              r.stage = 'Contacting';
              if(data.outcome==='busy'){
                if(r.attempts.filter(x=>x.channel==='call').length>=2){r.stage='Hold';r.next_check='Two call attempts used; hold for owner review.';}
                else request(state,r,'call_task',{due_at:addBusinessDays(data.performed_at,1).toISOString(),kind:'follow-up'},eid);
              }else if (!r.contact?.verified || r.cold_paused) { r.stage = 'Hold'; r.next_check = r.cold_paused ? 'Requested callback was unanswered; owner chooses the conversational next step' : 'Verify the public email before handoff'; }
              else if (['no_answer','voicemail'].includes(data.outcome) && r.attempts.filter(x => x.channel === 'email').length < 2 && !Object.values(state.actions).some(a => a.prospect_id === r.id && a.type === 'email' && ['Queued', 'Pending', 'Uncertain', 'Awaiting readback'].includes(a.status))) request(state, r, 'email', { call_id: data.call_id, idea: r.idea, email: r.contact.email }, eid);
              }
            } else { r.stage = 'Hold'; r.next_check = data.outcome === 'wrong_contact' ? 'Verify the public phone/contact ownership' : 'Record an actual outcome; skipped tasks do not release email'; pauseCold(state, r, eid, r.next_check); }
            prepareCallFollowUp(state,r,r.calls[data.call_id],this.config,event.at);
            break;
          }
          case 'call_claimed': {
            owner(actor); check(['owner', 'friend'].includes(actor) && callStages.includes(r.stage) && !r.restriction && !r.cold_paused, 'Only an eligible business can be claimed');
            check(!r.follow_up_owner || r.follow_up_owner === actor, 'This business is assigned to the other operator; request a handoff');
            r.follow_up_owner = actor;
            for (const action of Object.values(state.actions)) if (action.prospect_id === r.id && ['call_task', 'callback_task'].includes(action.type) && ['Queued', 'Verified'].includes(action.status)) action.assigned_to = actor;
            break;
          }
          case 'follow_up_handed_off': {
            owner(actor); check(['owner', 'friend'].includes(actor) && r.follow_up_owner === actor && ['owner', 'friend'].includes(data.to) && data.to !== actor, 'Only the assigned operator can hand this business to the other operator');
            for(const work of Object.values(r.project_work??{}))if(work.status==='Ready')work.assigned_to=data.to;
            r.follow_up_owner = data.to; r.follow_up_handoffs ??= [];
            r.follow_up_handoffs.push({ from: actor, to: data.to, at: event.at, event_id: eid });
            for (const action of Object.values(state.actions)) if (action.prospect_id === r.id && ['call_task', 'callback_task', 'email'].includes(action.type) && ['Queued', 'Pending', 'Uncertain', 'Awaiting readback', 'Verified'].includes(action.status)) action.assigned_to = data.to;
            break;
          }
          case 'call_undone': {
            owner(actor); const undo=r.call_undo;
            check(undo?.call_id===data.call_id && r.calls[data.call_id], 'Only the latest quick call can be undone');
            check(!['Sending','Sent','Uncertain'].includes(r.follow_ups?.[data.call_id]?.status),'Reconcile the reserved follow-up before undoing this call');
            const followAction=r.follow_ups?.[data.call_id]?.action_id;
            check(!followAction||!state.operations?.requests?.[`${followAction}-intent`],'A native email handoff already exists; reconcile delivery or cancellation before correcting the call');
            check(!r.information_draft&&!r.meeting&&!Object.values(this.config.operations?.bookings??{}).some(b=>b.prospect_id===r.id),'A draft or booking followed this call; reconcile it before correcting the outcome');
            check(Object.values(state.events).filter(e=>e.prospect_id===r.id).at(-1)?.id===undo.event_id,'Another decision followed this call; review history instead');
            check(!Object.values(state.operations?.requests??{}).some(q=>['Pending','Uncertain'].includes(q.status)) && !Object.values(state.actions).some(a=>a.prospect_id===r.id&&(a.provider_task||['Pending','Verified','Uncertain'].includes(a.status))), 'A provider action exists; reconcile it before correcting the call');
            for(const k of Object.keys(state.actions)) if(state.actions[k].prospect_id===r.id) delete state.actions[k];
            Object.assign(state.actions,undo.actions);
            for(const [k,v] of Object.entries(undo.record)) { if(v===null) delete r[k]; else r[k]=v; }
            r.attempts=r.attempts.filter(a=>a.id!==data.call_id); delete r.calls[data.call_id]; delete r.approved_calls[data.call_id]; delete r.call_undo;
            break;
          }
          case 'call_note_updated':
            owner(actor); check(r.calls[data.call_id] && typeof data.note==='string' && data.note.length<=3000,'Choose a saved call and bounded note');
            r.calls[data.call_id].note=data.note; break;
          case 'conversation_confirmed': {
            owner(actor); const reviewed=r.approved_calls[data.call_id];
            check(r.stage==='Verification review' && reviewed?.basis && ['discovery','requested_info'].includes(reviewed.outcome),'Confirm the recorded verification conversation first');
            check(data.identity_confirmed===true && data.active_confirmed===true && text(data.decision_maker,250) && text(data.goal,1600),'Confirm identity, current activity, decision-maker and goal');
            r.verification.conversation={...data,at:event.at,actor,basis:'Owner attestation',contact_binding:{phone:r.contact.phone??null,email:r.contact.email??null}};
            r.stage=reviewed.outcome==='discovery'?'Discovery':'Information requested';prepareCallFollowUp(state,r,r.calls[data.call_id],this.config,event.at,true); break;
          }
          case 'contact_stopped':
            owner(actor); check(['decline', 'do_not_contact'].includes(data.reason), 'Record the explicit stop reason');
            r.restriction = data.reason; r.stage = 'Stopped'; pauseCold(state, r, eid, data.reason); break;
          case 'transcript_added':
            owner(actor); check(r.calls[data.call_id]?.outcome === 'connected' && (r.stage === 'Connected review' || r.approved_calls[data.call_id]), 'Transcript must match a connected call');
            check(!r.transcripts[data.call_id] && text(data.text, 60_000) && data.permission_confirmed === true, 'Supply one permitted transcript; recording consent is separate');
            check(!/-----BEGIN [A-Z ]*PRIVATE KEY|\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}|\b(?:password|api[_ -]?key|authorization)\s*[:=]\s*\S+/i.test(data.text), 'Redact credentials before saving or analyzing a transcript');
            check(data.audio_ids===undefined||Array.isArray(data.audio_ids)&&data.audio_ids.length>0&&data.audio_ids.length<=20&&new Set(data.audio_ids).size===data.audio_ids.length&&data.audio_ids.every(id=>r.call_audio?.[id]?.status==='Stored'&&r.call_audio[id].call_id===data.call_id&&r.call_audio[id].kind==='call'),'Transcript audio must belong to this exact saved call');
            const machine=validateMachineDraft?validateMachineDraft(state,r.id,data.call_id,data):null;
            r.transcripts[data.call_id] = { text: data.text, sha256: hash(data.text), added_at: event.at, call_id: data.call_id, actor,...(data.audio_ids?{audio_ids:[...data.audio_ids]}:{}),...(machine?{machine_draft:machine}:{}), source:machine?'Operator-reviewed machine transcript linked to exact saved call audio; factual claims still need review':data.audio_ids?'Operator-supplied transcript linked to saved call audio; wording requires review':'Operator-supplied transcript; audio capture not verified' };
            request(state, r, 'transcript_review', { call_id: data.call_id }, eid); break;
          case 'transcript_assessed': {
            check(actor === 'worker' || actor === 'controlled-fixture', 'Assessment must come from the restricted worker boundary');
            const transcript = r.transcripts[data.call_id]; check(transcript && (r.stage === 'Connected review' || r.approved_calls[data.call_id]), 'Call is no longer awaiting analysis');
            validateTranscriptProposal(data.proposal, transcript);
            if(validateHostedAssessment)validateHostedAssessment(this,state,r.id,data.call_id,data);
            check(data.review?.verdict === 'Accepted' && data.review.proposal_sha256 === hash(data.proposal) && data.review.independent === true, 'Independent review must accept the exact proposal');
            r.proposals[data.call_id] = { ...data.proposal, sha256: hash(data.proposal), review: data.review };
            state.exceptions = state.exceptions.filter(x => x.id !== `transcript-${hash(`${r.id}:${data.call_id}`).slice(0, 24)}`);
            for (const a of Object.values(state.actions)) if (a.type === 'transcript_review' && a.prospect_id === r.id && a.payload.call_id === data.call_id) a.status = 'Verified';
            break;
          }
          case 'follow_up_draft_saved': {
            owner(actor); const call=r.calls[data.call_id],proposal=r.proposals[data.call_id],transcript=r.transcripts[data.call_id],reviewed=r.approved_calls[data.call_id];
            currentHostedTranscript(r,data.call_id);
            check(this.config.follow_up?.enabled && call?.outcome==='connected' && ['discovery','requested_info'].includes(reviewed?.outcome) && !r.reply && !['Connected review','Verification review'].includes(r.stage), 'Review the connected conversation before preparing a draft; replies need their own review');
            check(data.reviewed===true && ['ai','systems','website','marketing'].includes(data.focus), 'Review the customer wording and choose a relevant service focus');
            check(data.note_sha256===hash(call.note??''), 'Call notes changed; review the current notes before saving a draft');
            check(proposal && transcript && proposal.sha256===data.proposal_sha256 && proposal.transcript_sha256===transcript.sha256, 'Review the exact current transcript assessment');
            check(Array.isArray(data.claim_indexes) && data.claim_indexes.length>0 && data.claim_indexes.length<=16 && new Set(data.claim_indexes).size===data.claim_indexes.length && data.claim_indexes.every(i=>Number.isInteger(i)&&i>=0&&i<proposal.claims.length), 'Select supported transcript facts for review');
            check(text(data.customer_context,1600) && !/[<>]|{{|}}/.test(data.customer_context), 'Review a plain-text customer-facing summary within 1600 characters');
            const content=composeFollowUp(r,{...call,focus:data.focus,customer_context:data.customer_context},this.config);
            r.follow_up_drafts??=[];
            r.follow_up_drafts.push({id:eid,call_id:data.call_id,at:event.at,actor,status:'Draft',content,customer_context:data.customer_context,sha256:hash(content),note_sha256:data.note_sha256,proposal_sha256:proposal.sha256,transcript_sha256:transcript.sha256,claim_indexes:[...data.claim_indexes],source_follow_up_sha256:r.follow_ups?.[data.call_id]?hash(r.follow_ups[data.call_id]):null});
            break;
          }
          case 'follow_up_draft_approved': {
            owner(actor);const draft=r.follow_up_drafts?.find(d=>d.id===data.draft_id),call=r.calls[draft?.call_id],prior=r.follow_ups?.[draft?.call_id];
            if(call)currentHostedTranscript(r,call.call_id);
            check(this.config.follow_up?.enabled&&draft?.status==='Draft'&&data.approved===true&&data.sha256===draft.sha256&&hash(draft.content)===draft.sha256, 'Review and approve the exact current draft revision');
            check(call?.outcome==='connected'&&['discovery','requested_info'].includes(r.approved_calls[call.call_id]?.outcome)&&!r.reply&&!['Connected review','Verification review','Stopped'].includes(r.stage), 'Review the current conversation; replies or stopped contact cannot release a revision');
            const predecessors=Object.values(state.actions).filter(a=>a.prospect_id===r.id&&a.type==='email'&&a.payload.call_id===call.call_id);
            check(!prior||['Held','Prepared'].includes(prior.status), 'Reconcile reserved, uncertain or sent follow-up before approving a revision');
            for(const action of predecessors){
              check(['Queued','Cancelled'].includes(action.status)&&!Object.hasOwn(state.operations?.email??{},action.id)&&!Object.keys(state.operations?.requests??{}).some(k=>k.startsWith(`${action.id}-`)), 'Reconcile every native reservation or request before replacing this message');
              check(action.status==='Cancelled'||action.id===prior?.action_id, 'Reconcile the current local message before approving a revision');
            }
            check(draft.source_follow_up_sha256===(prior?hash(prior):null), 'The original follow-up changed; prepare a fresh revision');
            check(draft.note_sha256===hash(call.note??'')&&draft.transcript_sha256===r.transcripts[call.call_id]?.sha256&&draft.proposal_sha256===r.proposals[call.call_id]?.sha256, 'Call evidence changed; review a current revision');
            check(text(draft.customer_context,1600)&&hash(composeFollowUp(r,{...call,focus:draft.content.focus,customer_context:draft.customer_context},this.config))===draft.sha256, 'Recipient, sender or settings changed; prepare and review a current revision');
            const entry=storeCallFollowUp(state,r,call,this.config,event.at,draft.content,eid,event.at,true);
            check(entry.status==='Prepared'&&entry.action_id, entry.reason||'Current conversation cannot release this revision');
            if(prior){r.follow_up_history??=[];r.follow_up_history.push(structuredClone(prior));}
            for(const action of predecessors)if(action.status==='Queued'){action.status='Cancelled';action.cancelled_by=eid;}
            Object.assign(entry,{draft_id:draft.id,approved_by:actor,approval_event:eid});
            Object.assign(draft,{status:'Approved',approved_by:actor,approved_at:event.at,action_id:entry.action_id,approval_event:eid});
            break;
          }
          case 'call_reviewed': {
            owner(actor); const proposal = r.proposals[data.call_id];
            currentHostedTranscript(r,data.call_id);
            check(r.stage === 'Connected review' && proposal?.sha256 === data.proposal_sha256 && !r.approved_calls[data.call_id], 'Approve the exact current transcript proposal');
            check(connectedOutcomes.includes(data.outcome), 'Unsupported reviewed outcome');
            r.approved_calls[data.call_id] = { outcome: data.outcome, at: event.at, actor, proposal_sha256: proposal.sha256, note: data.note ?? '' };
            if (['not_interested', 'do_not_contact'].includes(data.outcome)) { r.restriction = data.outcome; r.stage = 'Stopped'; pauseCold(state, r, eid, data.outcome); }
            else if (data.outcome === 'callback') scheduleCallback(state, r, data.callback_at ?? proposal.callback_at, r.calls[data.call_id].performed_at, eid);
            else if (['discovery', 'requested_info'].includes(data.outcome) && verificationLane(r)) { r.stage = 'Verification review'; r.next_check = 'Confirm business identity, current activity, decision-maker and goal from the actual conversation. Email remains blocked.'; }
            else if (data.outcome === 'discovery') r.stage = 'Discovery';
            else if (data.outcome === 'requested_info') { r.stage = 'Information requested'; request(state, r, 'information_task', { summary: proposal.summary }, eid); }
            else { r.stage = 'Hold'; r.next_check = 'Owner clarification of the connected call'; }
            prepareCallFollowUp(state,r,r.calls[data.call_id],this.config,event.at,true);
            break;
          }
          case 'verification_confirmed': {
            owner(actor); const reviewed = r.approved_calls[data.call_id], transcript = r.transcripts[data.call_id];
            check(verificationLane(r) && r.stage === 'Verification review' && reviewed && ['discovery', 'requested_info'].includes(reviewed.outcome) && transcript, 'Review a connected verification call first');
            check(data.identity_confirmed === true && data.active_confirmed === true && text(data.decision_maker, 250) && text(data.goal, 1600), 'Confirm identity, current activity, decision-maker and a specific goal');
            check(['identity_quote', 'activity_quote', 'decision_maker_quote', 'goal_quote'].every(k => text(data[k], 1500) && transcript.text.includes(data[k])), 'Retain exact transcript quotes for identity, activity, decision-maker and goal');
            if (data.email) {
              check(typeof data.email === 'string' && /^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/.test(data.email) && (!r.controlled || data.email.endsWith('@example.invalid')), 'Use the confirmed business email; controlled records retain .invalid addresses');
              check(data.email_permission_confirmed === true && text(data.email_quote, 1500) && data.email_quote.includes(data.email) && transcript.text.includes(data.email_quote), 'Confirm the requested email route with an exact transcript quote');
              r.contact.email = data.email; r.contact.verified = true; r.contact.email_evidence = { email:data.email, source: `call:${data.call_id}`, quote: data.email_quote, confirmed_at: event.at };
            }
            r.verification.conversation = { ...data, at: event.at, actor, transcript_sha256: transcript.sha256,contact_binding:{phone:r.contact.phone??null,email:r.contact.email??null} };
            r.stage = reviewed.outcome === 'requested_info' ? 'Information requested' : 'Discovery'; r.next_check = 'Continue the confirmed owner conversation; cold email remains paused.';
            if (r.stage === 'Information requested') request(state, r, 'information_task', { summary: data.goal }, eid);
            prepareCallFollowUp(state,r,r.calls[data.call_id],this.config,event.at,true);
            break;
          }
          case 'reply_received':
            check(actor === 'provider' || actor === 'controlled-fixture', 'Reply must be verified at the provider boundary');
            check(key(data.source_id) && ['reply', 'decline', 'do_not_contact', 'bounce', 'out_of_office'].includes(data.kind), 'A verified reply/event ID and kind are required');
            pauseCold(state, r, eid, data.kind);
            if(r.reply&&Date.parse(r.reply.at)>Date.parse(event.at))break;
            if(r.reply){r.reply_history??=[];r.reply_history.push(r.reply);}
            r.reply = { ...data, at: event.at };
            if(data.content?.status==='Complete')check(validReplySource(r.reply),'Reply body/provenance differs from its exact source');
            if(r.reply_draft){r.reply_draft_history??=[];r.reply_draft_history.push({...r.reply_draft,status:'Superseded'});delete r.reply_draft;}
            r.reply_suggestion=replySuggestion(r);
            if(r.reply_review){r.reply_review_history??=[];r.reply_review_history.push({...r.reply_review,superseded_by:eid});delete r.reply_review;}
            if (r.restriction) { r.stage = 'Stopped'; break; }
            if (['decline', 'do_not_contact'].includes(data.kind)) { r.restriction = data.kind; r.stage = 'Stopped'; }
            else { r.stage = data.kind === 'reply' ? 'Reply review' : 'Hold'; r.next_check = data.kind === 'reply' ? 'Owner reviews reply and next action' : 'Verify contact/return date; never auto-resume from a bounce or auto-reply'; } break;
          case 'reply_draft_saved': {
            const sharedReview=this.store?.key==='workspace'&&this.store.emailTaskBinding?.scope.capability==='fictional-email-draft-review-v1';
            owner(actor);check(['owner','friend'].includes(actor),'A signed operator must prepare reply drafts');check(!r.restriction&&r.reply?.kind==='reply'&&['Reply review','Discovery','Information requested'].includes(r.stage)&&validReplySource(r.reply)&&data.source_id===r.reply.source_id&&data.reply_sha256===hash(r.reply)&&data.source_sha256===r.reply.content.source_sha256,'Draft must match the exact current reply with complete content');
            check(!r.follow_up_owner||r.follow_up_owner===actor,'Claim or hand off this reply before editing its draft');
            check(r.contact?.verified===true&&r.contact.email?.toLowerCase()===r.reply.content.from,'Reply recipient differs from the current verified contact');
            check(text(data.body),'Write a bounded reply draft for human review');
            if(data.agent_task_id||data.agent_context_sha256||data.agent_result_sha256)check((!this.store||sharedReview)&&agentDraft&&state.email_draft_tasks?.[data.agent_task_id]===agentDraft&&agentDraft.status==='Review'&&agentDraft.project_id===r.id&&agentDraft.result.body===data.body&&agentDraft.result_sha256===data.agent_result_sha256&&agentDraft.context_sha256===data.agent_context_sha256&&hash(emailDraftSource(r,this.config,state))===data.agent_context_sha256,'Agent drafts require the atomic task adoption service');
            if(data.attachments!==undefined)check((!this.store||sharedReview)&&Array.isArray(data.attachments)&&(data.agent_task_id||data.attachments.length===0),'Attached replies require local task adoption; manual edits may only remove the bundle');
            if(data.agent_task_id)check(hash(data.attachments??[])===hash(agentDraft.result.attachments??[]),'Adopt the exact worker attachment selection');
            const attachments=data.agent_task_id?selectReplyAttachments(state,r.id,data.attachments??[],agentDraft.studio_asset_ids??[]):data.attachments??r.reply_draft?.content.attachments??[];
            if(attachments.length){check(!this.store||sharedReview,'Shared profiles do not authorize attached reply drafts');currentReplyAttachments(state,r.id,attachments);}
            const boundContext=data.agent_context_sha256||(sharedReview||r.reply_draft?.agent_context_sha256||r.conversation_histories?hash(emailDraftSource(r,this.config,state)):null);
            const content=replyDraftContent(r,data.body,actor,this.config,Boolean(boundContext));
            if(attachments.length)content.attachments=structuredClone(attachments);
            if(sharedReview){content.review_binding_sha256=this.config.email_task_proof.binding_sha256;const origin=agentDraft?{task_id:agentDraft.id,result_sha256:agentDraft.result_sha256,context_sha256:agentDraft.context_sha256,source_ids:agentDraft.result.source_ids,uncertainties:agentDraft.result.uncertainties}:r.reply_draft?.content.agent_origin;if(origin)content.agent_origin=structuredClone(origin);}
            if(r.reply_draft){r.reply_draft_history??=[];r.reply_draft_history.push({...r.reply_draft,status:'Superseded'});}
            r.reply_draft={source_id:data.source_id,source_sha256:data.source_sha256,reply_sha256:data.reply_sha256,body:content.body,content,sha256:hash(content),owner:r.follow_up_owner??null,at:event.at,actor,status:'Draft',...(boundContext?{agent_context_sha256:boundContext}:{}),...(data.agent_task_id?{agent_task_id:data.agent_task_id,agent_result_sha256:data.agent_result_sha256}:{})};
            r.reply_drafts??=[];r.reply_drafts.push(r.reply_draft);break;
          }
          case 'reply_draft_approved': {
            owner(actor);check(['owner','friend'].includes(actor),'A signed operator must approve reply drafts');const draft=r.reply_draft;
            check(!r.follow_up_owner||r.follow_up_owner===actor,'Claim or hand off this reply before approving');
            check(['Reply review','Discovery','Information requested'].includes(r.stage)&&draft?.status==='Draft'&&replyDraftCurrent(r,draft,this.config,state)&&data.sha256===draft.sha256&&data.approved===true&&data.facts_checked===true,'Review the exact current reply draft, recipient and facts before approval');
            draft.status='Approved; sending held';draft.approved_by=actor;draft.approved_at=event.at;draft.approval_event=eid;break;
          }
          case 'email_delivered': {
            check(actor === 'provider' && data.simulated === r.controlled && key(data.message_id), 'Verified provider email identity required');
            const action = state.actions[data.action_id];
            check(action?.prospect_id === r.id && action.type === 'email' && (['no_answer','voicemail'].includes(r.calls[action.payload.call_id]?.outcome)||this.config.follow_up?.enabled&&action.payload.follow_up&&followUpOutcomes.includes(r.calls[action.payload.call_id]?.outcome)), 'Delivery must match the explicit call/email handoff');
            if(action.payload.follow_up)check(r.follow_ups?.[action.payload.call_id]?.action_id===action.id, 'Delivery must match the current exact message; reconcile a superseded action separately');
            check(!action.payload.due_at || date(action.payload.due_at) && Date.parse(action.payload.due_at) <= Date.parse(event.at), 'Scheduled follow-up cannot be delivered before its due time');
            check(r.attempts.filter(a => a.channel === 'email').length < 2, 'Two-email campaign cap reached');
            r.attempts.push({ id: data.message_id, channel: 'email', at: event.at, simulated: data.simulated });
            if(action.payload.follow_up&&r.follow_ups?.[action.payload.call_id])r.follow_ups[action.payload.call_id].status='Sent';
            action.status = 'Verified'; action.delivery = { message_id: data.message_id, at: event.at };
            if (!r.cold_paused && !r.restriction && r.attempts.filter(a => a.channel === 'call').length < 2 && !Object.values(state.actions).some(a=>a.prospect_id===r.id&&['call_task','callback_task'].includes(a.type)&&['Queued','Verified'].includes(a.status)&&!a.cancel_requested)) {
              request(state, r, 'call_task', { due_at: addBusinessDays(r.attempts.find(a => a.channel === 'call').at,1).toISOString(), kind: 'follow-up' }, eid);
            }
            break;
          }
          case 'reply_reviewed':
            owner(actor); check((r.stage === 'Reply review'||r.reply&&['Discovery','Information requested'].includes(r.stage)&&r.reply_review&&(!r.reply_review.focus||r.reply_review.focus==='unspecified'||r.reply_review.reply_sha256!==hash(r.reply))) && data.source_id === r.reply?.source_id && data.reply_sha256 === hash(r.reply), 'Review the exact current reply and its source hash');
            check(['discovery', 'requested_info', 'hold', 'decline', 'do_not_contact'].includes(data.outcome), 'Unsupported reply disposition');
            check(!['discovery','requested_info'].includes(data.outcome)||[...services,'unspecified'].includes(data.focus),'Choose the service confirmed in this reply, or mark it not confirmed');
            check(data.note === undefined || typeof data.note === 'string' && data.note.length <= 3000, 'Bound the reply review note');
            if(r.reply_review){r.reply_review_history??=[];r.reply_review_history.push({...r.reply_review,superseded_by:eid});}
            r.reply_review = { ...data, at: event.at, actor, review_event:eid };
            if (['decline', 'do_not_contact'].includes(data.outcome)) { r.restriction = data.outcome; r.stage = 'Stopped'; }
            else { r.stage = { discovery: 'Discovery', requested_info: 'Information requested', hold: 'Hold' }[data.outcome]; if (data.outcome === 'hold') r.next_check = data.note || 'Owner chooses the next conversational action'; else r.next_check=data.focus==='unspecified'?'Confirm which service the business wants before preparing project work.':'Continue the reviewed conversation; project preparation does not send email.'; if (data.outcome === 'requested_info') request(state, r, 'information_task', { summary: data.note }, eid); } break;
          case 'discovery_confirmed':
            owner(actor); check(['Discovery', 'Information requested'].includes(r.stage), 'Discovery follows reviewed interest');
            check(text(data.goal) && text(data.decision_maker, 200) && data.serious_interest === true && data.paid_fit_discussed === true, 'Goal, decision-maker, serious interest and paid fit are required');
            check(services.includes(data.service) && text(data.main_flow) && Number.isInteger(data.preview_screens) && data.preview_screens >= 1 && data.preview_screens <= 5, 'Bound one service, main flow and a few preview screens');
            r.discovery = { ...data, confirmed_at: event.at, ...(r.reply_review?{reply_review_event:r.reply_review.review_event}:{}) }; r.stage = 'Preview'; break;
          case 'meeting_recorded':
            owner(actor); check(['Discovery', 'Information requested'].includes(r.stage) && key(data.event_id) && data.owner_verified === true && date(data.start) && date(data.end) &&
              Date.parse(data.end) > Date.parse(data.start) && data.timezone === 'America/New_York', 'Record an exact owner-verified calendar event for this conversation');
            r.meeting = { ...data, reference: safeReference(data.reference), verified_at: event.at }; break;
          case 'meeting_verified':
            check(actor === 'provider' && key(data.event_id) && date(data.start) && date(data.end) && Date.parse(data.end) > Date.parse(data.start) && data.timezone === 'America/New_York', 'Exact provider booking evidence required');
            check(Object.values(state.operations?.bookings ?? {}).some(b => b.id === data.event_id && b.verified && b.start === data.start && b.end === data.end), 'Booking must pass the controller readback boundary');
            r.meeting = { ...data, reference: safeReference(data.reference), verified_at: event.at, current_status: 'Verified' }; break;
          case 'preview_recorded':
            owner(actor); check(r.stage === 'Preview', 'Preview requires qualified discovery');
            r.preview = { reference: safeReference(data.reference), approved_brief: text(data.brief) ? data.brief : r.discovery.main_flow, reviewed_with_owner: data.reviewed_with_owner === true };
            check(r.preview.reviewed_with_owner, 'Review the small preview with the decision-maker before quoting'); r.stage = 'Proposal'; break;
          case 'proposal_approved':
            owner(actor); check(r.stage === 'Proposal' && money(data.price_cents) && data.currency === 'USD', 'Owner-approved fixed USD project price required');
            check(money(data.initial_payment_cents) && data.initial_payment_cents <= data.price_cents && Number.isInteger(data.revision_rounds) && data.revision_rounds >= 0 && data.revision_rounds <= 10, 'Define payment and revision boundaries');
            for (const name of ['scope', 'deliverables', 'exclusions', 'timeline', 'acceptance', 'ownership', 'support_terms', 'change_terms', 'cancellation_terms']) check(text(data[name]), `Proposal requires ${name}`);
            r.quote = { ...data, approved_at: event.at, approved_by: actor, reference: safeReference(data.reference) }; r.stage = 'Agreement'; break;
          case 'agreement_recorded':
            owner(actor); check(r.stage === 'Agreement' && data.signed_verified === true && data.quote_sha256 === hash(r.quote), 'Verify signed acceptance of the exact approved quote');
            r.agreement = { reference: safeReference(data.reference), verified_at: event.at }; break;
          case 'invoice_recorded':
            owner(actor); check(r.agreement && key(data.invoice_id) && !r.invoices.some(x => x.invoice_id === data.invoice_id), 'A signed agreement and unique invoice are required');
            check(money(data.amount_cents) && data.currency === r.quote.currency && r.invoices.reduce((n, x) => n + x.amount_cents, 0) + data.amount_cents <= r.quote.price_cents, 'Invoice exceeds the fixed approved price');
            r.invoices.push({ ...data, reference: safeReference(data.reference), at: event.at }); break;
          case 'payment_recorded':
            owner(actor); const invoice = r.invoices.find(x => x.invoice_id === data.invoice_id);
            check(invoice && key(data.payment_id) && !r.payments.some(x => x.payment_id === data.payment_id) && data.settled_verified === true && data.simulated === r.controlled, 'Authoritative unique settled payment evidence required');
            check(money(data.amount_cents) && data.currency === r.quote.currency && r.payments.filter(x => x.invoice_id === data.invoice_id).reduce((n, x) => n + x.amount_cents, 0) + data.amount_cents <= invoice.amount_cents, 'Payment amount exceeds invoice or currency differs');
            r.payments.push({ ...data, reference: safeReference(data.reference), at: event.at });
            if (r.stage === 'Agreement' && r.payments.reduce((n, x) => n + x.amount_cents, 0) >= r.quote.initial_payment_cents) r.stage = 'Onboarding'; break;
          case 'onboarding_completed':
            owner(actor); check(r.stage === 'Onboarding' && text(data.materials) && text(data.access_plan) && text(data.kickoff), 'Paid onboarding requires materials, least-privilege access plan and kickoff');
            check(!/password\s*[:=]|-----BEGIN .*PRIVATE KEY/i.test(JSON.stringify(data)), 'Store credential references, never passwords or keys');
            r.onboarding = { ...data, at: event.at }; r.stage = 'Delivery';
            r.tasks = ({ website: ['Confirm content and customer flow', 'Build responsive implementation', 'Check accessibility, inquiry and errors', 'Prepare hosting and edit handover'],
              systems: ['Map workflow and data ownership', 'Implement bounded integration', 'Test recovery and permissions', 'Prepare operating instructions'],
              ai: ['Define allowed tasks and human review', 'Implement with usage limits', 'Evaluate errors and escalation', 'Document pause and upkeep'],
              marketing: ['Confirm offer, audience and channel', 'Prepare approved creative and tracking', 'Check links, claims and consent', 'Document campaign limits and reporting'] })[r.discovery.service].map((title, i) => ({ id: `task-${i + 1}`, title, status: 'Open' })); break;
          case 'delivery_task_updated':
            owner(actor); check(r.stage === 'Delivery' && ['Open', 'Complete'].includes(data.status), 'Tasks can be updated during delivery');
            const task = r.tasks.find(x => x.id === data.task_id); check(task, 'Unknown delivery task'); task.status = data.status; task.evidence = safeReference(data.evidence); break;
          case 'delivery_submitted':
            owner(actor); check(r.stage === 'Delivery' && r.tasks.length > 0 && r.tasks.every(x => x.status === 'Complete'), 'Complete all scoped checks before client review');
            r.delivery = { reference: safeReference(data.reference), at: event.at }; r.stage = 'Client review'; break;
          case 'revision_requested':
            owner(actor); check(r.stage === 'Client review' && text(data.feedback) && r.revisions.length < r.quote.revision_rounds, 'Revision limit reached; agree a separate change before more work');
            r.revisions.push({ feedback: data.feedback, reference: safeReference(data.reference), at: event.at }); r.stage = 'Delivery';
            r.tasks.push({ id: `revision-${r.revisions.length}`, title: data.feedback, status: 'Open' }); break;
          case 'acceptance_recorded':
            owner(actor); check(r.stage === 'Client review' && data.client_approval_verified === true, 'Verify client acceptance of the delivery');
            r.acceptance = { reference: safeReference(data.reference), at: event.at }; r.stage = 'Handover'; break;
          case 'handover_completed':
            owner(actor); check(r.stage === 'Handover' && r.payments.reduce((n, x) => n + x.amount_cents, 0) === r.quote.price_cents, 'Approved delivery and settled project balance required for final handover');
            for (const name of ['ownership', 'training', 'backup', 'support']) safeReference(data[name]);
            r.handover = { ...data, at: event.at }; r.stage = 'Support'; break;
          case 'support_opened':
            owner(actor); check(r.handover && key(data.ticket_id) && !r.tickets.some(x => x.id === data.ticket_id) && text(data.description), 'Support needs a handed-over project and unique request');
            check(['routine', 'urgent'].includes(data.priority) && date(data.review_at), 'Define support priority and owner review date; no invented SLA');
            r.tickets.push({ id: data.ticket_id, description: data.description, priority: data.priority, review_at: data.review_at, status: 'Open', opened_at: event.at });
            if (!r.restriction) r.stage = 'Support'; break;
          case 'support_closed':
            owner(actor); const ticket = r.tickets.find(x => x.id === data.ticket_id); check(ticket?.status === 'Open' && text(data.resolution) && data.client_notified_verified === true, 'Resolve and verify notification before closing support');
            Object.assign(ticket, { status: 'Closed', resolution: data.resolution, reference: safeReference(data.reference), closed_at: event.at }); break;
          case 'project_closed':
            owner(actor); check(r.stage === 'Support' && r.handover && r.tickets.every(x => x.status === 'Closed'), 'Finish handover and open support requests before closure'); r.stage = 'Closed'; break;
          case 'note_added': owner(actor); check(text(data.note), 'Note required'); r.note = data.note; break;
          default: throw Error('Unsupported lifecycle event');
        }
      }
      if(!manualRecording&&r?.calls)syncProjectWork(state,r,event,actor);
      if(!manualRecording&&!projectRecording)prepareNotificationsInState(state,this.now(),{origin:event.id,includeDigest:false});
      const cycle = manualRecording||projectRecording?null:state.operations?.cycle;
      if (cycle && !cycle.completed_at) {
        cycle.completed_records = (cycle.completed_records ?? []).filter(id => id !== r.id);
        cycle.completed_bookings = [];
      }
      r.updated_at = event.at; state.events[eid] = { fingerprint, actor, ...event }; state.revision++;
      return { prospect_id: r.id, stage: r.stage, revision: state.revision };
  }
  async dashboard() {
    const {discoverySummary,discoveryCampaignSummary,discoveryDailySummary}=await import('./discovery-batches.mjs');
    this.config = await this.loadConfig();
    const state = await this.snapshot(), today = businessDate(this.now());
    if(this.store?.projectBinding)state.shared_workspace=sharedProjectDashboard(this.store.projectBinding,state,this.now());
    if(this.store?.inertBinding)state.shared_workspace={capability:'inert-shared-v1',workspace_id:this.store.inertBinding.scope.workspace_id,manifest_sha256:this.store.inertBinding.manifest_sha256,allowed_edits:['note_added'],reconciliation:inertReconciliation(state),unsupported:['hosted-authoring-sidecars','hosted-backup','provider-execution']};
    if(this.store?.manualBinding)state.shared_workspace={capability:'shared-manual-records-v1',workspace_id:this.store.manualBinding.scope.workspace_id,manifest_sha256:this.store.manualBinding.manifest_sha256,allowed_edits:manualRecordEvents,reconciliation:inertReconciliation(state),execution:'disabled',external_suppression:'unverified',unsupported:['hosted-authoring-sidecars','hosted-backup','provider-execution']};
    let supplementalReviews = null, supplementalHold;
    if(!this.store)try {
      const ledger = JSON.parse(await readFile(join(this.directory, 'supplemental-reviews.json'), 'utf8'));
      supplementalReviews = verifySupplementalReviewLedger(ledger, state);
    } catch (error) {
      if (error.code !== 'ENOENT') supplementalHold = 'Supplemental review sidecar failed validation. Keep the original verification cards and review its source files.';
    }
    let researchPaused = !this.config.research_enabled, researchHold, researchPriority;
    if (this.config.research?.source_directory) {
      try { const control = await readJson(join(this.config.research.source_directory, 'research-control.json')); check(control.schema_version === 1 && typeof control.enabled === 'boolean', 'Unknown control'); researchPaused = !control.enabled || control.priority !== 'research'; researchPriority = control.priority; }
      catch { researchPaused = true; researchHold = 'Configured research control is unavailable; verify its pause/priority before running workers.'; }
    }
    const real = Object.values(state.prospects).filter(r => !r.controlled);
    const contacted = real.filter(r => r.attempts.some(a => !a.simulated && businessDate(a.at) === today));
    const first = contacted.filter(r => businessDate(r.attempts.find(a => !a.simulated).at) === today).length;
    const supply = callSupply(state, this.now()), queue = supply.queue;
    state.reply_alerts = Object.values(state.prospects).filter(r => r.stage === 'Reply review').map(r => ({ id: `reply-review-${r.id}`, prospect_id: r.id, reason: `${r.name}: verified reply needs a human decision; future cold follow-ups are paused.` }));
    return { ...state,email_draft_tasks:Object.fromEntries(Object.entries(state.email_draft_tasks??{}).map(([id,{token_sha256,workspace_sha256,...task}])=>[id,task])),team_notifications:undefined,notification_preparation:notificationView(state),follow_up_settings:{follow_up:{booking_url:this.config.follow_up?.booking_url},sender:{email:this.config.sender?.email,postal_address:this.config.sender?.postal_address,operator_names:this.config.sender?.operator_names}}, discovery_daily:discoveryDailySummary(state,this.now()), discovery_batches:Object.values(state.discovery_batches??{}).map(discoverySummary), discovery_campaigns:Object.values(state.discovery_campaigns??{}).map(c=>discoveryCampaignSummary(c,state)), discovery_enabled:this.config.discovery?.enabled===true, owner_contact_summary:ownerContactSummary(state,this.now()), provider_contact_summary:providerContactSummary(state,this.now()), supply, calendar_bookings:['shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(this.config.shared_capability)?calendarBookingView(state):undefined, pending_bookings:Object.entries(bookingConfirmations(state,this.config)).filter(([id])=>!state.operations?.bookings?.[id]?.verified).map(([id,b])=>({id,prospect_id:b.prospect_id,start:b.start,mode:b.mode,status:state.operations?.holds?.[id]??'Queued for calendar verification'})), supplemental_reviews: supplementalReviews, prospects: Object.fromEntries(Object.entries(state.prospects).map(([id, r]) => [id, { ...r, conversation_context:{...retainedConversationContext(state,this.config,r.id),messages:undefined,checked_at:r.conversation_histories?.[r.reply?.thread_id]?.checked_at??null,source_checked_at:state.operations?.gmail_incoming?.checked_at??null}, reply_sha256:r.reply?hash(r.reply):null, reply_suggestion:replySuggestion(r),reply_draft:r.reply_draft?{...r.reply_draft,current:replyDraftCurrent(r,r.reply_draft,this.config,state)}:null, opening_view:openingView(r),owner_contact_view:ownerContactView(r,this.now()),contact_evidence:contactEvidenceView(r,this.now()), provider_contact_view:providerContactView(r,this.now()), quote_sha256: r.quote ? hash(r.quote) : null }])), controls: { mode: this.config.mode,follow_up_enabled:this.config.follow_up?.enabled===true, research_paused: researchPaused, research_priority: researchPriority, outreach_paused: !this.config.outreach_enabled, calls_paused: !this.config.outreach_enabled && !this.config.calls_enabled, priority: this.config.priority,
      runtime_enabled: this.config.runtime?.enabled === true, final_review: this.config.mode === 'production' ? { fingerprint: (await import('./production.mjs')).releaseFingerprint(this.config), gates: (await import('./production.mjs')).productionGates(this.config), approved: this.config.release?.approved === true, verified: this.config.verified_summary ?? [],
        calls: { fingerprint: (await import('./production.mjs')).callReleaseFingerprint(this.config), approved: this.config.call_release?.approved === true, evidence: this.config.call_readiness ?? {}, transcript_daily_calls: this.config.transcript_ai.daily_calls } } : null,
      ai_enabled: this.config.transcript_ai.enabled, connector_writes_enabled: this.config.connector_writes_enabled, readiness: this.config.readiness },
      daily: { date: today, unique_businesses: contacted.length, new_businesses: first, repeat_businesses: contacted.length - first,
        actual_call_attempts: real.flatMap(r => r.attempts).filter(a => a.channel === 'call' && businessDate(a.at) === today && !a.simulated).length,
        actual_emails: real.flatMap(r => r.attempts).filter(a => a.channel === 'email' && businessDate(a.at) === today && !a.simulated).length,
        research_target:25,new_researched:dailyNewProspectCount(state,this.now()),research_shortfall:Math.max(0,25-dailyNewProspectCount(state,this.now())),
        callback_attempts:real.flatMap(r=>Object.values(r.calls)).filter(c=>!c.simulated&&c.purpose==='callback'&&businessDate(c.performed_at)===today).length, due: queue,
        prepared: { research: queue.filter(a => !verificationLane(state.prospects[a.prospect_id])).length, verification: queue.filter(a => verificationLane(state.prospects[a.prospect_id])).length } },
      exceptions: [...state.exceptions, ...Object.values(state.prospects).filter(r=>r.information_draft?.status==='Uncertain'||r.information_draft?.status==='Sending'&&+this.now()-Date.parse(r.information_draft.approved_at)>120000).map(r=>({id:`information-${r.id}`,reason:`${r.name}: information email needs sender-side reconciliation; do not resend.`})), ...(researchHold ? [{ id: 'research-control', reason: researchHold }] : []), ...(supplementalHold ? [{ id: 'supplemental-review', reason: supplementalHold }] : []), ...(state.runtime?.last_error ? [{ id: 'runtime', reason: state.runtime.last_error }] : []), ...Object.entries(state.operations?.holds ?? {}).map(([id, reason]) => ({ id: `operations-${id}`, reason })), ...Object.values(state.actions).filter(a => ['Uncertain', 'Held'].includes(a.status)).map(a => ({ id: a.id, reason: a.hold })),
        ...Object.values(state.prospects).filter(r => r.stage === 'Hold').map(r => ({ id: r.id, reason: r.next_check }))] };
  }
  async backup(output) {
    check(!this.store, 'Use the private local workspace for complete backups');
    const release = await acquireLifecycleLock(this.directory);
    try {
      const state = await this.snapshot();
      check(!Object.values(state.ai_attempts).some(a => a.status === 'Running'), 'Stop workers before backup');
      const {writeLifecycleBackup} = await import('./lifecycle-backup.mjs');
      return await writeLifecycleBackup(this.directory, state, output, this.now().toISOString());
    } finally { await release(); }
  }
  static async restore({ input, destination }) {
    const {restoreLifecycleBackup} = await import('./lifecycle-backup.mjs');
    return restoreLifecycleBackup(input, destination);
  }
}
