import {followUpOutcomes,followUpSetupIssues,renderFollowUpHtml,composeFollowUp,operatorDisplayName,operatorNamesConfigured,evzIdentity} from './follow-up-template.mjs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { check, hash, initialConfig, businessDate, businessDaysBetween, addBusinessDays, currentHostedTranscript } from './lifecycle.mjs';
import { readJson, saveJson, privateStateDirectory } from './engine.mjs';
import { reviewFiles, readPrivateJson, validateDecision } from './prospects.mjs';
import { validateEvidenceReview } from './evidence-review.mjs';
import { ControlledOperations, controlledThread, verifiedContact } from './lifecycle-operations.mjs';
import { researchCallPrep } from './call-prep.mjs';
import { verificationData, verificationLane, validateVerificationRecord, phoneDigits } from './verification-calls.mjs';
import { validateBookingSlot } from './lifecycle-documents.mjs';
import { upgradeResearch, upgradeBatch } from './research-upgrades.mjs';
import {businessType,businessTypes} from './business-types.mjs';

const email = value => typeof value === 'string' && /^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/.test(value) && !value.endsWith('.invalid');
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const phone = value => String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export const productionConfig = {
  ...structuredClone(initialConfig), mode: 'production', run_id: 'evz-food-beverage',
  calls_enabled: false, call_release: { approved: false }, call_readiness: {},
  runtime: { enabled: false }, operations: { enabled: false, interval_minutes: 5, allowlist: [], bookings: {}, emails: {} },
  apollo: { user_id: '', bindings: {} },
  sender: { email: '', mailbox_id: '', postal_address: '', website: 'https://evzdigital.studio/studio/', daily_email_limit: 20, operator_names: { owner: '', friend: '' } },
  campaign: { category: 'food-and-beverage', area: 'Fairfax / DMV', max_calls: 2, max_emails: 2, business_days: 10 },
  native_email: { enabled: false, rounds: [] }, research: { auto_import: false, supervised: false, source_directory: '' }, release: { approved: false }, readiness_evidence: {}
};
export function releaseFingerprint(c) {
  return hash({ contact_policy: 'call-desk-owner-notes-exact-gmail-v1', run_id: c.run_id, campaign: c.campaign, sender: c.sender, calendar: c.calendar, apollo_owner: c.apollo?.user_id, research_source: c.research?.source_directory ?? '', readiness_evidence: c.readiness_evidence,
    native_email: c.native_email,follow_up:c.follow_up?.enabled?c.follow_up:null, google: c.google ? { spreadsheet_id: c.google.spreadsheet_id, sheet_id: c.google.sheet_id, sheet_title: c.google.sheet_title } : null });
}
export function productionGates(c) {
  return Object.keys(initialConfig.readiness).map(key => ({ key, passed: c.readiness?.[key] === true && typeof c.readiness_evidence?.[key] === 'string' && c.readiness_evidence[key].length > 5, note: c.readiness_notes?.[key] ?? '' }));
}
export function requireProductionRelease(c) {
  check(c.mode === 'production' && c.outreach_enabled && c.connector_writes_enabled, 'Production contact remains paused for the final review');
  check(c.release?.approved === true && c.release.fingerprint === releaseFingerprint(c) && c.release.approval_ref?.length > 5, 'Final owner approval must match the current production connections and rules');
  check(productionGates(c).every(g => g.passed), 'Launch evidence is incomplete; preserve the production hold');
  check(businessTypes.some(t=>t.id===c.campaign?.category) && c.campaign.max_calls === 2 && c.campaign.max_emails === 2 && c.campaign.business_days === 10, 'Campaign bounds changed');
  check(c.sender?.email===evzIdentity.email && email(c.sender.email) && (c.sender.account_email??c.sender.email) === c.calendar.owner_email && id(c.sender.mailbox_id) && c.sender.postal_address?.trim().length > 10, 'Verify hello@evzdigital.studio, its Workspace account, calendar and postal address');
  check(operatorNamesConfigured(c), 'Set both operator display names before commercial email release');
  if(c.follow_up?.enabled)check(followUpSetupIssues(c).length===0,'Follow-up sender, postal address, demo and booking must be verified');
  if(c.follow_up?.enabled)check(c.native_email?.html_verified===true&&c.native_email.template_version==='evz-personal-large-demo-v1','Verify the branded HTML merge and exact owner-only delivery before commercial release');
  check(!/@(?:gmail|googlemail)\.com$/i.test(c.sender.email), 'Production uses the verified business-domain mailbox');
  check(Number.isInteger(c.sender.daily_email_limit) && c.sender.daily_email_limit > 0 && c.sender.daily_email_limit <= 100, 'Use a measured daily mailbox allowance including follow-ups');
  check(c.native_email?.enabled && c.native_email.rounds?.length === 2 && c.native_email.rounds.every((r, i) => r.round === i + 1 && id(r.list_id) && r.list_name?.startsWith('EVZ ') && id(r.sequence_id) && r.sequence_name?.startsWith('EVZ ') && id(r.subject_field_id) && id(r.body_field_id) && r.verified === true), 'Two verified single-email native routes required');
  check(new Set(c.native_email.rounds.flatMap(r => [r.list_id, r.sequence_id, r.subject_field_id, r.body_field_id])).size === 8, 'Email rounds need separate immutable queues, sequences and fields');
}
export function callReleaseFingerprint(c) {
  const ai = c.transcript_ai;
  return hash({ call_policy: 'call-desk-owner-started-discovery-v3', discovery_policy:c.discovery?.approval_ref??null, run_id: c.run_id, apollo_owner: c.apollo?.user_id, campaign: c.campaign, call_readiness: c.call_readiness, calendar: c.calendar, scope: c.operations?.allowlist,
    transcript_policy: { daily_calls: ai.daily_calls, reserve_percent: ai.reserve_percent, author_model: ai.author_model, reviewer_model: ai.reviewer_model, effort: ai.effort } });
}
export function requireCallRelease(c) {
  if (c.outreach_enabled) return requireProductionRelease(c);
  check(c.mode === 'production' && c.calls_enabled === true && c.connector_writes_enabled === true, 'Real calling remains paused pending final call-only release');
  check(c.call_release?.approved === true && c.call_release.fingerprint === callReleaseFingerprint(c) && c.call_release.approval_ref?.length > 5, 'Call-only approval must match the current queue and rules');
  check(id(c.apollo?.user_id) && businessTypes.some(t=>t.id===c.campaign?.category) && c.campaign.max_calls === 2 && c.campaign.max_emails === 2 && c.campaign.business_days === 10, 'Reviewed call owner and campaign bounds required');
  check(['queue_verified', 'outcomes_verified', 'supervision_verified'].every(k => typeof c.call_readiness?.[k] === 'string' && c.call_readiness[k].length > 5), 'Call-only verification evidence is incomplete');
}
export async function approveCallRelease(app, fingerprint, approvalRef) {
  return app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    check(!c.outreach_enabled && fingerprint === callReleaseFingerprint(c), 'Review the current calls-only queue first');
    c.calls_enabled = true; c.connector_writes_enabled = true;
    c.operations.enabled = true; c.runtime.enabled = true;
    c.transcript_ai.enabled = true;
    c.call_release = { approved: true, fingerprint, approval_ref: approvalRef, approved_at: app.now().toISOString() };
    requireCallRelease(c); await saveJson(path, c); app.config = c;
    return { calls_released: true, email_released: false, fingerprint };
  });
}
export function requireBookingRelease(c) {
  if (c.outreach_enabled) return requireProductionRelease(c);
  requireCallRelease(c);
  check(email(c.calendar?.owner_email) && !/@(?:gmail|googlemail)\.com$/i.test(c.calendar.owner_email) && /^link_[a-zA-Z0-9]+$/.test(c.calendar.link_id ?? '') && c.calendar.calendar_id === 'primary', 'Verified business Calendar connection required');
  check(typeof c.call_readiness?.booking_verified === 'string' && c.call_readiness.booking_verified.length > 5, 'Business invitation verification evidence required');
}
export async function approveProductionRelease(app, fingerprint, approvalRef) {
  return app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    check(fingerprint === releaseFingerprint(c), 'Review the current production fingerprint first');
    c.release = { approved: true, fingerprint, approval_ref: approvalRef, approved_at: app.now().toISOString() };
    c.outreach_enabled = true; c.connector_writes_enabled = true;
    requireProductionRelease(c); await saveJson(path, c); app.config = c;
    return { released: true, research_enabled: false, fingerprint };
  });
}
export function contactKeys(r) {
  return [r.company_id && `company:${r.company_id}`, r.contact?.email && `email:${r.contact.email.toLowerCase()}`,
    phone(r.contact?.phone).length >= 10 && `phone:${phone(r.contact.phone)}`].filter(Boolean);
}
export async function importVerification(app, packet, {stage=true}={}) {
  const data = verificationData(packet, app.now(), app.config.mode === 'controlled'), keys = contactKeys(data), state = await app.snapshot();
  const nameKey = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const prior = Object.values(state.prospects).find(r => nameKey(r.name) === nameKey(data.name) || contactKeys(r).some(k => keys.includes(k)));
  if (prior) {
    if (stage && app.config.mode === 'production') await stageProspect(app, prior.id);
    return { imported: false, duplicate_of: prior.id, restricted: Boolean(prior.restriction) };
  }
  const prospectId = `verify-${hash(data.company_id).slice(0, 24)}`;
  await app.apply({ id: `verify-import-${hash(packet.id).slice(0, 24)}`, prospect_id: prospectId, type: 'verification_imported', at: app.now().toISOString(), data }, { actor: app.config.mode === 'controlled' ? 'controlled-fixture' : 'verification-import' });
  if (stage && app.config.mode === 'production') await stageProspect(app, prospectId);
  return { imported: true, prospect_id: prospectId, calls: 'paused until final release', email: 'blocked pending qualification and full release' };
}

async function retainedResearchReview(app, directory, jobId) {
  const f = await reviewFiles(directory, jobId), d = await readPrivateJson(join(f.target, 'qualification.json'));
  validateDecision(d, f, app.now);
  const controller = await readPrivateJson(join(directory, 'controller-state.json')), record = controller.jobs[jobId];
  check(record && (record.status === 'Complete' && record.stage === 'done' || record.status === 'Held' && record.stage === 'held') && /^[a-z0-9.-]+\.json$/.test(record.review_file ?? ''), 'An independently completed controller review is required');
  const raw = await readFile(join(f.target, record.review_file)), receipt = JSON.parse(raw);
  validateEvidenceReview(receipt.result, f, receipt.reviewer, app.now);
  check(Number.isFinite(Date.parse(receipt.reviewed_at)) && Date.parse(receipt.reviewed_at) <= +app.now() && +app.now() - Date.parse(receipt.reviewed_at) <= 14 * 86400000, 'Independent review is stale or from the future');
  check(hash(receipt.result.decision) === hash(Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'reviewed_at'))), 'Qualification differs from the independently reviewed decision');
  return {f,d,raw,receipt,record};
}
// Reads retained source/review files, never an editable Sheet verdict or an owner HTTP event.
export async function importResearch(app, directory, jobId, contactProof) {
  check(app.config.mode === 'production', 'Research imports belong in the production workspace');
  const {f,d,raw,receipt,record}=await retainedResearchReview(app,directory,jobId);
  check(record.status==='Complete'&&record.stage==='done'&&receipt.result.verdict==='Accepted','An independently accepted completed review is required for call upgrades');
  check(d.decision === 'Research-qualified', 'Only research-qualified businesses enter calls');
  const source = f.snapshots.sources.find(s => s.url === d.contact.url), p = contactProof ?? { ...d.contact, source: d.contact.url, checked_at: source?.fetched_at };
  check((!d.contact.email || email(d.contact.email)) && (p?.email ?? '') === d.contact.email && p.source === d.contact.url && p.checked_at && Date.parse(p.checked_at) <= +app.now() && +app.now() - Date.parse(p.checked_at) <= 14 * 86400000, 'Fresh first-party contact proof is required');
  check(Date.parse(p.checked_at) <= Date.parse(source?.fetched_at) + 60000, 'A later review cannot refresh the retained contact inspection date');
  check(phone(p.phone).length >= 10 && source?.text.includes(p.phone) && !/search_snippet/.test(source.capture_method), 'Public business phone must appear exactly in the retained first-party contact source');
  check(!businessType({category:f.intake.discovery.category}).unclassified, 'The reviewed category needs a supported business type');
  const opportunity = f.report.opportunities[d.opportunity_index], companyId = p.company_id ?? `company-${hash(d.contact.email ? d.contact.email.toLowerCase() : `phone:${phone(p.phone)}`).slice(0, 24)}`;
  const data = { company_id: companyId, name: f.job.business_name, category: f.intake.discovery.category, area: f.intake.discovery.area, controlled: false,
    idea: `${opportunity.observed_basis} Possible improvement: ${opportunity.proposed_solution}`,
    call_prep: researchCallPrep(f, d, receipt.reviewed_at),
    contact: { email: d.contact.email || null, phone: p.phone, verified: true, checked_at: p.checked_at, source: p.source },
    discovery_source: { channel:f.intake.discovery.channel,source_url:f.intake.discovery.source_url,website_status:f.intake.discovery.website_check.status,website_url:f.job.website||null,customer_channel:typeof f.intake.discovery.customer_channel==='string'?f.intake.discovery.customer_channel.slice(0,300):'Not confirmed',next_check:d.next_action },
    qualification: { verdict: d.decision, independent_review: 'Accepted', checked_at: `${f.job.as_of}T00:00:00.000Z`, reviewed_at: receipt.reviewed_at, report_sha256: f.report_sha256, review_sha256: hash(raw), evidence_ref: `research:${jobId}` } };
  const upgraded = await upgradeResearch(app, jobId, data);
  if (upgraded) return upgraded;
  const keys = contactKeys(data), state = await app.snapshot();
  const existing = Object.values(state.prospects).find(r => contactKeys(r).some(k => keys.includes(k)));
  if (existing) { await stageProspect(app, existing.id); return { imported: false, duplicate_of: existing.id, restricted: Boolean(existing.restriction) }; }
  const prospectId = `prospect-${hash(companyId).slice(0, 24)}`;
  await app.apply({ id: `import-${hash(jobId).slice(0, 24)}`, prospect_id: prospectId, type: 'prospect_imported', at: app.now().toISOString(), data }, { actor: 'research-import' });
  await stageProspect(app, prospectId);
  return { imported: true, prospect_id: prospectId, outreach: 'paused until release' };
}

async function projectBatchReview(app,directory,jobId) {
  const {f,d,raw,receipt,record}=await retainedResearchReview(app,directory,jobId);
  return app.change(async state=>{
    const c=await readJson(join(app.directory,'lifecycle-config.json')),batch=upgradeBatch(c,state),item=batch?.items.find(i=>i.job_id===jobId),r=state.prospects[item?.prospect_id];
    check(r&&r.name===f.job.business_name,'Detailed review must match its approved existing card');
    if(r.research_assessment?.report_sha256===f.report_sha256&&r.research_assessment?.review_sha256===hash(raw))return {reviewed:true,prospect_id:r.id};
    r.research_assessment={job_id:jobId,status:record.status,independent_verdict:receipt.result.verdict,decision:d.decision,operating_status:d.operating_status,rationale:d.rationale,next_action:d.next_action,reviewed_at:receipt.reviewed_at,report_sha256:f.report_sha256,review_sha256:hash(raw),unknowns:f.report.unknowns,
      observations:f.report.observations.filter((_,i)=>d.observations[i]?.supported).map(o=>({fact:o.fact,sources:o.evidence.map(e=>({...e,checked_at:f.snapshots.sources.find(s=>s.url===e.url).fetched_at}))})),
      opportunities:f.report.opportunities.filter((_,i)=>d.opportunity_checks?.find(c=>c.index===i)?.supported),journey_checks:f.report.journey_checks.filter((_,i)=>d.journey_checks[i]?.supported)};
    state.revision++;state.updated_at=app.now().toISOString();
    return {reviewed:true,prospect_id:r.id,decision:d.decision};
  });
}
async function stageProspect(app, prospectId) {
  await app.change(async () => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    if (!c.operations.allowlist.includes(prospectId)) {
      check(c.operations.allowlist.length < 500, 'Archive completed campaign records before importing more'); c.operations.allowlist.push(prospectId);
      if (c.calls_enabled && !c.outreach_enabled) { c.calls_enabled = false; c.connector_writes_enabled = false; c.call_release.approved = false; }
      await saveJson(path, c);
    }
    app.config = c;
  });
}
export async function queueMeeting(app, input) {
  const path = join(app.directory, 'lifecycle-config.json');
  return app.change(async state => {
    const c = await readJson(path);
    if(c.mode==='production') requireBookingRelease(c);
    const r = state.prospects[input.prospect_id];
    check(r && !r.restriction && ['Discovery', 'Information requested'].includes(r.stage), 'Review the owner conversation before scheduling');
    check(input.revision===undefined||input.revision===state.revision,'Record changed; review the invitation again');
    check(input.slot_agreed === true && (email(input.attendee_email)||r.controlled&&input.attendee_email?.endsWith('@example.invalid')) && (input.attendee_email === r.contact.email || input.recipient_confirmed===true), 'Confirm the exact guest agreed to this invitation');
    check(input.title?.startsWith('EVZ Digital') && input.title.length <= 200 && typeof input.description === 'string' && input.description.length < 1500 && Number.isFinite(Date.parse(input.start)) && Number.isFinite(Date.parse(input.end)), 'Bound the exact meeting title, description and times');
    check(input.mode===undefined||['video','phone'].includes(input.mode),'Choose video or phone');
    validateBookingSlot({start:input.start,end:input.end,timezone:'America/New_York'},[],c.calendar,app.now().toISOString(),app.now());
    const key = `meeting-${hash({ prospect_id: r.id, start: input.start, end: input.end, attendee: input.attendee_email }).slice(0, 32)}`;
    check(!r.meeting||r.meeting.event_id===key,'A meeting already exists; reconcile or reschedule that event instead of creating another');
    check(!Object.entries(c.operations?.bookings??{}).some(([id,b])=>b.prospect_id===r.id&&id!==key),'An invitation is already reserved for this business; review it before choosing another slot');
    if(c.mode==='controlled') {r.meeting={event_id:key,start:input.start,end:input.end,mode:input.mode??'video',reference:`fixture:${key}`,current_status:'Simulated',verified_at:app.now().toISOString()};state.revision++;return {simulated:true,booked:false,booking_id:key};}
    const booking = { prospect_id: r.id, attendee_email: input.attendee_email, start: input.start, end: input.end, title: input.title, description: input.description,
      ...(input.mode?{mode:input.mode}:{}), ...(input.recipient_confirmed === true ? { recipient_confirmed: true } : {}), approved: true, approval_ref: `owner-console:${key}` };
    check(!c.operations.bookings[key] || hash(c.operations.bookings[key]) === hash(booking), 'An existing slot changed; preserve its reservation');
    c.operations.bookings[key] ??= booking;
    await saveJson(path, c); app.config = c;
    if (state.operations?.cycle) { state.operations.cycle.completed_bookings = state.operations.cycle.completed_bookings.filter(id => id !== key); delete state.operations.cycle.completed_at; }
    state.runtime = { ...state.runtime, wake_requested: true };
    state.revision++; state.updated_at=app.now().toISOString();
    return { queued: true, booking_id: key, booked: false };
  });
}
export async function pauseStudio(app) {
  const c = await app.change(async state => {
    const path = join(app.directory, 'lifecycle-config.json'), c = await readJson(path);
    c.transcript_ai.enabled = false; c.connector_writes_enabled = false; c.outreach_enabled = false; c.calls_enabled = false; c.research_enabled = false;
    if(c.contact_research)c.contact_research.enabled=false;
    for(const b of Object.values(state.discovery_batches??{}))if(!['Complete','Stopped','Held'].includes(b.status)){b.status='Paused';b.reason='Paused by Pause all';}
    if (c.operations) c.operations.enabled = false;
    await saveJson(path, c); app.config = c; return c;
  });
  if (c.research?.source_directory) {
    try {
      const directory = await privateStateDirectory(c.research.source_directory), controlPath = join(directory, 'research-control.json');
      const control = await readJson(controlPath); check(control.schema_version === 1 && typeof control.enabled === 'boolean', 'Unknown research control');
      control.enabled = false; await saveJson(controlPath, control);
      check((await readJson(controlPath)).enabled === false, 'Research pause readback failed');
      await app.change(state => { state.exceptions = state.exceptions.filter(e => e.id !== 'research-pause'); });
    } catch {
      const reason = 'Connector work and transcript AI paused; configured research-controller pause is unverified. Check its private control before assuming its worker stopped.';
      await app.change(state => { state.exceptions = state.exceptions.filter(e => e.id !== 'research-pause'); state.exceptions.push({ id: 'research-pause', reason }); });
      throw Error(reason);
    }
  }
  return { paused: true };
}
export async function syncResearchImports(app) {
  const c = await readJson(join(app.directory, 'lifecycle-config.json'));
  if (c.mode !== 'production' || !c.research?.auto_import) return { status: 'Paused' };
  const controller = await readPrivateJson(join(c.research.source_directory, 'controller-state.json'));
  const batch = c.research.upgrade_batch;
  const jobs = Object.entries(controller.jobs).filter(([id, r]) => (!batch || batch.items.some(i=>i.job_id===id)) && (r.status === 'Complete' && r.stage === 'done' && (batch || r.decision === 'Research-qualified') || batch && r.status === 'Held' && r.stage === 'held' && r.review_file));
  check(jobs.length <= 200, 'Research import scope exceeds the bounded controller campaign');
  let count = 0;
  for (const [jobId, record] of jobs) {
    const prior = (await app.snapshot()).research_imports?.[jobId];
    if (prior?.review_file === record.review_file) continue;
    if (count++ === 10) break;
    try {
      const reviewed = batch ? await projectBatchReview(app,c.research.source_directory,jobId) : null;
      const result = record.status==='Complete'&&record.decision === 'Research-qualified' ? {...reviewed,...await importResearch(app, c.research.source_directory, jobId)} : reviewed;
      await app.change(state => {
        (state.research_imports ??= {})[jobId] = { status: record.status==='Held'?'Held review':'Verified', review_file: record.review_file, ...result, checked_at: app.now().toISOString() };
        state.exceptions = state.exceptions.filter(e => e.id !== `import-${jobId}`);
      });
    } catch (error) {
      await app.change(state => {
        (state.research_imports ??= {})[jobId] = { status: 'Hold', review_file: record.review_file, checked_at: app.now().toISOString() };
        state.exceptions = state.exceptions.filter(e => e.id !== `import-${jobId}`);
        state.exceptions.push({ id: `import-${jobId}`, reason: `Research import ${jobId}: ${String(error.message).slice(0, 300)}. Verify the retained contact/evidence or create a fresh reviewed job.` });
      });
    }
  }
  return { status: 'Checked', examined: Math.min(count, 10) };
}
export function nativeMessage(record, round, c,callId) {
  if(c.follow_up?.enabled){const entry=record.follow_ups?.[callId];check(entry?.status==='Prepared'&&entry.content,'Choose the immutable follow-up for this performed call');check(!/{{|}}|[<>]/.test(entry.content.subject+entry.content.body),'Native personalized copy cannot contain markup');const message={...entry.content,postal_address:c.sender.postal_address,booking_url:c.follow_up.booking_url},body=renderFollowUpHtml(message);check(body.length<=12000&&!/{{|}}/.test(body),'Bound the rendered native HTML and reject unresolved variables');return {subject:entry.content.subject,body};}
  const subject = `${round === 1 ? 'An idea' : 'Following up on an idea'} for ${record.name}`.replace(/["\r\n]/g, ' ').slice(0, 119);
  const idea = record.call_prep?.hypothesis ?? record.idea;
  const question = record.call_prep?.questions?.[0] ?? 'Would an improvement like this fit what you want to do next?';
  check(typeof idea === 'string' && idea.trim() && typeof question === 'string' && question.trim(), 'A reviewed enhancement and owner question are required');
  const senderName=operatorDisplayName(record.calls?.[callId]?.actor,c);
  const body = `Hi,\n\nI tried calling ${record.name} and wanted to share one idea: ${idea}\n\n${question}\n\nI build focused websites and business tools through EVZ Digital.\n${c.sender.website}\n\nBest,\n${senderName}\n${evzIdentity.email}\n${c.sender.postal_address}\n\nThis is a business introduction and advertisement. Reply "stop" to opt out of all further marketing from EVZ Digital.`;
  check(body.length <= 4000 && !/{{|}}|[<>]/.test(subject + body), 'Tailored email exceeds the native field bounds or contains markup/template instructions');
  return { subject, body };
}

export function reviewedHostedFollowUp(record,action){
  const follow=record.follow_ups?.[action?.payload?.call_id];
  if(record.proposals?.[action?.payload?.call_id]?.review?.provenance?.provider==='netlify-gateway'){
    const draft=record.follow_up_drafts?.find(d=>d.id===follow?.draft_id);
    if(!draft||draft.status!=='Approved'||draft.approval_event!==follow.approval_event||draft.action_id!==action.id||draft.sha256!==hash(follow.content))return false;
    try{currentHostedTranscript(record,action.payload.call_id);}catch{return false;}
  }
  return true;
}
export function approvedFollowUp(record,action,config){
  const follow=record.follow_ups?.[action?.payload?.call_id];
  return Boolean(config.follow_up?.enabled&&action?.payload?.follow_up&&action.prospect_id===record.id&&action.status!=='Cancelled'&&!record.restriction&&!record.reply&&['Prepared','Sending','Awaiting delivery'].includes(follow?.status)&&follow.action_id===action.id&&hash(follow.content)===action.payload.content_sha256&&follow.content.to===record.contact.email&&record.contact.verified&&followUpOutcomes.includes(record.calls[action.payload.call_id]?.outcome));
}
export class ProductionOperations extends ControlledOperations {
  writeReady(c) { if ((c.outreach_enabled || c.calls_enabled) && c.connector_writes_enabled) { requireCallRelease(c); return true; } return false; }
  emailReady(c) { return c.outreach_enabled === true; }
  composeMessage(record, round, c,callId) { return nativeMessage(record, round, c,callId); }
  async settings() {
    const c = await readJson(join(this.app.directory, 'lifecycle-config.json'));
    check(c.mode === 'production' && c.research_enabled === false, 'Use the separate research controller and production workspace');
    check(c.operations?.interval_minutes === 5 && Array.isArray(c.operations.allowlist) && c.operations.allowlist.length <= 500 && new Set(c.operations.allowlist).size === c.operations.allowlist.length, 'Bounded production scope required');
    check(!Object.keys(c.operations.emails ?? {}).length, 'Production email uses reviewed native automation, never test draft approvals');
    for (const [key, b] of Object.entries(c.operations.bookings ?? {})) {
      check(id(key) && c.operations.allowlist.includes(b.prospect_id) && b.approved === true && b.approval_ref?.length > 5 && email(b.attendee_email) && b.title?.startsWith('EVZ Digital') && b.title.length < 200 && b.description?.length < 1500, 'Production invitations require a bounded owner-approved booking');
      check((await this.app.snapshot()).prospects[b.prospect_id]?.contact.email === b.attendee_email || b.recipient_confirmed === true, 'Meeting guest must match the reviewed conversation contact or exact owner confirmation');
    }
    if (c.outreach_enabled || c.calls_enabled || c.connector_writes_enabled) requireCallRelease(c);
    return c;
  }
  validateScope(state, c) { check(c.operations.allowlist.every(id => state.prospects[id]?.controlled === false), 'Production cannot include fictional or missing records'); }
  *plan(state, c) {
    const o = state.operations, now = this.app.now(), request = (logical, operation, input) => ({ logical, operation, input });
    const retain = logical => { const r = o.requests[`${o.cycle.read_epoch}-${this.session}-${logical}`]; if (r) r.retain = true; };
    const ap = yield request('apollo-owner', 'apollo_profile', { include_credit_usage: false });
    check(!ap.failed && ap.id === c.apollo.user_id, 'Apollo owner unavailable or changed');
    if (!c.calls_enabled || c.outreach_enabled) {
      const gp = yield request('gmail-owner', 'gmail_profile', {}), cp = yield request('calendar-owner', 'calendar_profile', {});
      check(!gp.failed && !cp.failed && gp.email === c.calendar.owner_email && cp.email === c.calendar.owner_email, 'Business Gmail/Calendar connection is not the configured owner');
    } else if (Object.keys(c.operations.bookings ?? {}).length) {
      requireBookingRelease(c);
      const cp = yield request('calendar-owner', 'calendar_profile', {});
      check(!cp.failed && cp.email === c.calendar.owner_email, 'Business Calendar connection is not the configured owner');
    }
    const writeReady = this.writeReady(c);
    if (writeReady && Object.keys(c.operations.bookings ?? {}).length) { requireBookingRelease(c); yield* this.bookings(state, c, request, retain); }
    o.bindings ??= {};
    for (const prospectId of c.operations.allowlist.filter(id => !o.cycle.completed_records.includes(id))) {
      const r = state.prospects[prospectId];
      try {
        if (verificationLane(r) && !r.restriction && ['Ready to verify', 'Verifying', 'Callback'].includes(r.stage)) {
          try { validateVerificationRecord(r, now); }
          catch (error) {
            r.stage = 'Hold'; r.cold_paused = true; r.next_check = `Reverify public identity/phone before calling: ${error.message}`;
            for (const a of Object.values(state.actions).filter(a => a.prospect_id === r.id && ['call_task', 'callback_task'].includes(a.type))) {
              if (a.status === 'Queued') a.status = 'Cancelled'; else if (a.provider_task) a.cancel_requested = true;
            }
          }
        }
        if (!r.restriction && r.attempts.length && businessDaysBetween(r.attempts[0].at, now) >= 10) { r.cold_paused = true; if (['Ready to contact', 'Contacting', 'Ready to verify', 'Verifying'].includes(r.stage)) { r.stage = 'Hold'; r.next_check = 'Ten-business-day cold campaign ended; review before any new campaign.'; } }
        for (const e of Object.values(o.email).filter(e => e.prospect_id === prospectId && e.thread)) {
          const raw = yield request(`${prospectId}-${e.thread.thread_id}-thread`, 'thread', { thread_id: e.thread.thread_id, max_messages: 20 });
          check(!raw.failed, 'Reply monitoring unavailable; hold contact');
          for (const reply of controlledThread(raw, e.thread, now)) {
            const effectId = `reply-${hash(`${prospectId}:${reply.id}:${hash(reply.content)}`).slice(0, 32)}`;
            o.effects[effectId] ??= { event: { id: effectId, prospect_id: prospectId, type: 'reply_received', at: reply.at, data: { source_id: reply.id, kind: reply.kind, thread_id: e.thread.thread_id, content:reply.content } } };
            if (!o.replies.includes(reply.id)) { o.replies.push(reply.id); retain(`${prospectId}-${e.thread.thread_id}-thread`); }
            r.cold_paused = true;
            // Keep same-cycle send guards closed before the persisted reply effect is applied.
            if(!r.reply||Date.parse(r.reply.at)<=Date.parse(reply.at)){
              const incoming={source_id:reply.id,thread_id:e.thread.thread_id,kind:reply.kind,content:reply.content,at:reply.at};
              if(r.reply&&hash(r.reply)!==hash(incoming)){r.reply_history??=[];r.reply_history.push(r.reply);}
              r.reply=incoming;
            }
          }
        }
        let binding = o.bindings[prospectId];
        if (!binding && writeReady && !r.restriction && (!r.cold_paused || r.stage === 'Callback'||Object.values(state.actions).some(a=>approvedFollowUp(r,a,c)))) {
          if (verificationLane(r)) validateVerificationRecord(r, now);
          const query = r.contact.email || r.name;
          let found = yield request(`${prospectId}-find-contact`, 'contact', { q_keywords: query, per_page: 10, page: 1 });
          check(!found.failed && Array.isArray(found.contacts) && !found.pagination?.next_page && (!found.pagination || found.pagination.total_pages <= 1), 'Contact discovery failed or is truncated');
          const match = p => r.contact.email ? p.email?.toLowerCase() === r.contact.email.toLowerCase() : p.organization_name === r.name && [p.corporate_phone, p.direct_phone, ...(p.phone_numbers ?? []).map(n => n.raw_number ?? n.sanitized_number ?? n.number)].some(n => phoneDigits(n) === phoneDigits(r.contact.phone));
          let person = found.contacts.find(match);
          check(found.contacts.length <= 1, 'Ambiguous contact match requires owner resolution');
          check(!found.contacts.length || person, 'Contact search returned a different address; verify before creating or updating');
          const create = `${prospectId}-contact-create`;
          if (!person) {
            if (!o.requests[create]) {
              const created = yield request(create, 'contact_create', { ...(r.contact.email ? { email: r.contact.email } : {}), first_name: 'Business', last_name: 'Contact', organization_name: r.name, corporate_phone: r.contact.phone });
              check(!created.failed, 'Contact creation failed; reconcile before continuing');
            }
            found = yield request(`${prospectId}-created-contact`, 'contact', { q_keywords: query, per_page: 10, page: 1 });
            check(!found.failed && found.contacts?.length === 1 && !found.pagination?.next_page && (!found.pagination || found.pagination.total_pages <= 1), 'Created contact is missing, ambiguous or truncated; never recreate'); person = found.contacts[0];
          }
          check(person && match(person) && person.owner_id === c.apollo.user_id && id(person.id) && (person.account_id == null || id(person.account_id)), 'Existing contact ownership/organization needs review');
          check(!person.contact_campaign_statuses?.some(s => ['active', 'paused'].includes(s.status)), 'Existing contact is already in a sequence; hold to prevent overlapping outreach');
          if (o.requests[create] && o.requests[create].status !== 'Done') Object.assign(o.requests[create], { status: 'Done', result: { contact: person }, reconciliation: { kind: 'unique authoritative contact readback; creation was not retried', contact_id: person.id, at: now.toISOString() } });
          binding = o.bindings[prospectId] = { contact_id: person.id, account_id: person.account_id ?? null, email: person.email ?? null, phone: r.contact.phone, ...(!r.contact.email ? { verification: true, business_name: r.name } : {}) };
        }
        if (binding) {
          if (r.cold_paused || r.restriction) yield* this.suppressNative(state, c, r, binding, request, retain);
          if (writeReady || r.restriction || r.cold_paused) yield* this.tasks(state, c, prospectId, binding, r, request, retain);
          yield* this.nativeEmails(state, c, r, binding, request, retain, writeReady && this.emailReady(c));
        }
        delete o.holds[prospectId];
      } catch (error) { o.holds[prospectId] = error.message; }
      o.cycle.completed_records.push(prospectId);
    }
  }
  *suppressNative(state, c, r, binding, request, retain) {
    const o = state.operations;
    for (const [actionId,e] of Object.entries(o.email).filter(([,e]) => e.prospect_id === r.id && e.route)) {
      if(approvedFollowUp(r,state.actions[actionId],c))continue;
      const found = yield request(`${r.id}-${e.route.round}-stop-contact`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
      const person = verifiedContact(found, binding, c.apollo.user_id, true), status = person.contact_campaign_statuses?.find(s => s.emailer_campaign_id === e.route.sequence_id);
      if (!status) continue;
      const seq = yield request(`${r.id}-${e.route.round}-stop-sequence`, 'sequence', { q_name: e.route.sequence_name, per_page: '10', page: '1' });
      check(!seq.failed && seq.emailer_campaigns?.length === 1 && seq.emailer_campaigns[0].id === e.route.sequence_id && seq.emailer_campaigns[0].user_id === c.apollo.user_id, 'Native suppression sequence ownership changed');
      if (status.status === 'finished') { (o.suppression ??= {})[r.id] = 'Verified'; r.suppression = 'Verified'; retain(`${r.id}-${e.route.round}-stop-contact`); continue; }
      check(['active', 'paused'].includes(status.status), 'Unknown native sequence state requires readback');
      const logical = `${r.id}-${e.route.round}-native-stop`;
      if (!o.requests[logical]) yield request(logical, 'stop', { contact_ids: [person.id], emailer_campaign_ids: [e.route.sequence_id], mode: 'stop', stop_reason: 'Verified reply or owner stop; cancel future EVZ outreach' });
      throw Error('Native suppression awaits finished readback; never repeat the stop');
    }
  }
  *nativeEmails(state, c, r, binding, request, retain, writeReady) {
    const o = state.operations, now = this.app.now();
    check(c.follow_up?.enabled || !verificationLane(r) || !Object.values(state.actions).some(a => a.prospect_id === r.id && a.type === 'email' && a.status !== 'Cancelled'), 'Verification calls cannot release cold email; qualify the conversation and review its next action');
    for (const a of Object.values(state.actions).filter(a => a.prospect_id === r.id && a.type === 'email' && a.status !== 'Cancelled')) {
      const e = o.email[a.id] ??= { prospect_id: r.id, status: 'Awaiting native release' }, intentKey = `${a.id}-intent`;
      if (e.thread) continue;
      if(a.payload.due_at&&Date.parse(a.payload.due_at)>+now){e.status='Scheduled for follow-up';e.due_at=a.payload.due_at;continue;}
      if (!o.requests[intentKey]) {
        if (!writeReady || r.restriction||r.reply||r.cold_paused&&!approvedFollowUp(r,a,c)) continue;
        check(reviewedHostedFollowUp(r,a),'Review and approve the exact hosted transcript email before a new native intent');
        const calls = r.attempts.filter(x => x.channel === 'call'), sent = r.attempts.filter(x => x.channel === 'email');
        const followUp=approvedFollowUp(r,a,c);
        check((followUp || ['no_answer','voicemail'].includes(r.calls[a.payload.call_id]?.outcome) && calls.length <= 2) && sent.length < 2 && calls.length>0 && businessDaysBetween(calls[0].at, now) < 10, 'An eligible saved call within the two-email, ten-business-day campaign is required');
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
        check(r.controlled || !['Sat', 'Sun'].includes(parts.weekday) && Number(parts.hour) >= 9 && Number(parts.hour) < 17, 'Email release waits for weekday business hours');
        check(+now - Date.parse(r.qualification.checked_at) <= 30 * 86400000, 'Research is stale; hold email');
        const today = businessDate(now), reservedToday = Object.entries(o.email).filter(([key]) => o.requests[`${key}-intent`] && businessDate(o.requests[`${key}-intent`].prepared_at) === today).length;
        check(reservedToday < c.sender.daily_email_limit, 'Daily sending allowance reached, including pending sends and follow-ups');
        const route = c.native_email.rounds[sent.length]; check(route, 'No approved native route for this email round');
        const fields = yield request(`${a.id}-fields`, 'fields', { modality: 'contact', source: 'custom', limit: 100 });
        check(!fields.failed && fields.fields?.some(f => f.id === route.subject_field_id && f.modality === 'contact' && f.type === 'string') && fields.fields.some(f => f.id === route.body_field_id && f.modality === 'contact' && f.type === 'textarea'), 'Native personalized fields changed');
        const lists = yield request(`${a.id}-lists`, 'lists', {});
        check(!lists.failed && lists.labels?.some(l => l.id === route.list_id && l.name === route.list_name && l.modality === 'contacts'), 'Intent queue identity changed');
        const sequences = yield request(`${a.id}-sequence`, 'sequence', { q_name: route.sequence_name, per_page: '10', page: '1' });
        const sequence = sequences.emailer_campaigns?.[0];
        check(!sequences.failed && sequences.emailer_campaigns?.length === 1 && sequence.id === route.sequence_id && sequence.user_id === c.apollo.user_id && sequence.active === true && sequence.num_steps === 1 && sequence.emailer_steps?.length === 1 && sequence.emailer_steps[0].type === 'auto_email' && sequence.emailer_steps[0].wait_time === 0 && sequence.mark_finished_if_reply === true && sequence.mark_paused_if_ooo === true, 'Native route must remain one immediate automatic email with reply and automatic-reply stops');
        const found = yield request(`${a.id}-native-contact`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
        const person = verifiedContact(found, binding, c.apollo.user_id, true);
        check(!person.contact_campaign_statuses?.some(s => ['active', 'paused'].includes(s.status)), 'Existing native sequence could duplicate outreach');
        check(!person.label_ids?.includes(route.list_id), 'Intent was already published outside this action; reconcile without reenrollment');
        const boxes = yield request(`${a.id}-mailbox`, 'mailboxes', {});
        check(!boxes.failed && boxes.email_accounts?.some(b => b.id === c.sender.mailbox_id && b.email === c.sender.email && b.user_id === c.apollo.user_id && b.active === true), 'Business sender unavailable');
        if(a.payload.follow_up)check(approvedFollowUp(r,a,c),'Follow-up content, recipient or call eligibility changed');
        e.content ??= this.composeMessage(r, route.round, c,a.payload.call_id); e.route ??= route; e.content_sha256 ??= hash(e.content);
        check(hash(e.content) === e.content_sha256 && hash(e.route) === hash(route), 'Native message changed after reservation');
        const personalized = { [route.subject_field_id]: e.content.subject, [route.body_field_id]: e.content.body };
        if (!o.requests[`${a.id}-personalize`]) yield request(`${a.id}-personalize`, 'personalize', { id: binding.contact_id, typed_custom_fields: personalized });
        const read = yield request(`${a.id}-personalized-read`, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
        const current = verifiedContact(read, binding, c.apollo.user_id, true);
        check(Object.entries(personalized).every(([key, value]) => current.typed_custom_fields?.[key] === value), 'Personalization awaits exact readback; never publish unverified content');
        if(a.payload.follow_up)r.follow_ups[a.payload.call_id].status='Sending';
        yield request(intentKey, 'intent', { modality: 'contacts', entity_ids: [current.id], label_names: [route.list_name] });
        e.status = 'Released to native sequence';
        if(a.payload.follow_up)r.follow_ups[a.payload.call_id].status='Awaiting delivery';
      }
      const membershipRead = `${a.id}-intent-readback`, membership = yield request(membershipRead, 'contact', { q_keywords: binding.email, per_page: 10, page: 1 });
      const member = verifiedContact(membership, binding, c.apollo.user_id, true);
      check(member.label_ids?.includes(e.route.list_id) && member.contact_campaign_statuses?.some(s => s.emailer_campaign_id === e.route.sequence_id), 'Native intent/enrollment awaits exact readback; never publish again');
      const before = o.requests[intentKey].prepared_at, query = `in:sent from:${c.sender.email} to:${binding.email} subject:"${e.content.subject}" after:${Math.floor(Date.parse(before) / 1000) - 1}`;
      const found = yield request(`${a.id}-native-sent`, 'gmail_search', { query, max_results: 10 });
      check(!found.failed && !found.next_page_token && found.message_ids?.length <= 1, 'Native send readback is unavailable or ambiguous');
      if (!found.message_ids.length) { e.status = 'Awaiting native send readback'; throw Error('Native email is queued or unsent; inspect Apollo, never publish another intent'); }
      const raw = yield request(`${a.id}-native-thread`, 'thread', { message_id: found.message_ids[0], max_messages: 20 });
      check(!raw.failed, 'Native sent-thread readback failed');
      const bound = { thread_id: raw.id, original_id: found.message_ids[0], from: c.sender.email, to: binding.email, subject: e.content.subject, sent_after: new Date(Date.parse(before) - 1000).toISOString(), sent_before: new Date(Date.parse(before) + 86400000).toISOString() };
      controlledThread(raw, bound, now); e.thread = bound; e.message_id = bound.original_id; e.status = 'Sent — Gmail verified'; retain(`${a.id}-native-thread`);
      if (o.requests[intentKey].status !== 'Done') { o.requests[intentKey].original_status = o.requests[intentKey].status; o.requests[intentKey].status = 'Done'; o.requests[intentKey].reconciliation = { contact_read: membershipRead, sent_message: bound.original_id, verified_at: now.toISOString() }; }
      const effectId = `email-${hash(a.id).slice(0, 32)}`;
      const sentAt = new Date(Number(raw.messages.find(m => m.id === bound.original_id).internal_date)).toISOString();
      o.effects[effectId] ??= { event: { id: effectId, prospect_id: r.id, type: 'email_delivered', at: sentAt, data: { action_id: a.id, message_id: e.message_id, simulated: r.controlled } } };
    }
  }
}
export function nativeProofMessage(c){
  const m=c.operations.native_proof.message;
  if(m.template_version!=='evz-personal-large-demo-v1')return {subject:m.subject,body:m.body_text};
  const message=composeFollowUp({name:'STUDIO TEST Oakline Home Services',area:'Fairfax, Virginia',business_type:{subtype:'HVAC'},contact:{name:'Jordan Test',email:m.to}},{outcome:'no_answer',focus:'ai'},c);
  message.paragraphs.unshift('CONTROLLED TEST — a fictional example for the owner inbox only. No business was called or contacted.');
  return {subject:m.subject,body:renderFollowUpHtml(message)};
}
export class NativeProofOperations extends ProductionOperations {
  async settings() {
    const c = await readJson(join(this.app.directory, 'lifecycle-config.json')), o = c.operations, p = o?.native_proof, m = p?.message;
    check(c.mode === 'controlled' && !c.research_enabled && !c.outreach_enabled && !c.connector_writes_enabled, 'Native proof cannot enable research or production contact');
    check(c.readiness.owner_design_approved && o?.interval_minutes === 5 && o.allowlist?.length === 1 && !Object.keys(o.emails ?? {}).length && !Object.keys(o.bookings ?? {}).length, 'One isolated fictional native proof required');
    check(p && typeof p.enabled === 'boolean' && typeof m?.approved === 'boolean' && (c.sender?.account_email??m.from) === c.calendar.owner_email && m.from === c.sender?.email && email(m.to) && m.from !== m.to && o.recipients?.includes(m.to) && o.recipients.includes(m.from) && o.recipients.length <= 2, 'Exact owner-controlled test inboxes required');
    const html=m.template_version==='evz-personal-large-demo-v1',content=nativeProofMessage(c);
    check(m.subject?.startsWith('[STUDIO TEST]') && m.subject.length < 120 && !/["\r\n]/.test(m.subject) && (html?m.body_html===content.body&&content.body.length<12000&&!/{{|}}/.test(content.body):m.body_text?.startsWith('CONTROLLED TEST')&&m.body_text.length<4000&&!/{{|}}|[<>]/.test(m.body_text)), 'Literal controlled email content required');
    check(!m.approved || m.approval_ref?.length > 5, 'Concrete owner approval must bind the single test email');
    const binding = c.apollo?.bindings?.[o.allowlist[0]], route = c.native_email?.rounds?.[0];
    check(id(c.apollo?.user_id) && id(binding?.contact_id) && id(binding.account_id) && binding.email === m.to && binding.require_no_phone === true && binding.controlled_name?.toLowerCase().includes('studio test'), 'Dedicated owned no-phone fictional recipient required');
    check(c.calendar.calendar_id === 'primary' && c.sender.mailbox_id === m.mailbox_id && id(m.mailbox_id) && c.sender.daily_email_limit === 1, 'One controlled mailbox/send allowance required');
    check(c.native_email.enabled && c.native_email.rounds.length === 1 && route.round === 1 && route.list_name?.startsWith('STUDIO TEST ') && route.sequence_name?.startsWith('STUDIO TEST ') && [route.list_id, route.sequence_id, route.subject_field_id, route.body_field_id].every(id), 'Dedicated test list and one-email sequence required');
    return c;
  }
  validateScope(state, c) { check(c.operations.allowlist.every(id => state.prospects[id]?.controlled === true && state.prospects[id].contact.email.endsWith('@example.invalid') && !state.prospects[id].contact.phone), 'Native proof accepts one fictional lifecycle record only'); }
  writeReady(c) { return c.operations.native_proof.enabled && c.operations.native_proof.message.approved; }
  emailReady(c) { return this.writeReady(c); }
  composeMessage(record, round, c) { return nativeProofMessage(c); }
  *plan(state, c) {
    const id = c.operations.allowlist[0], binding = c.apollo.bindings[id];
    for (const e of Object.values(state.operations.email)) if (e.content) check(hash(e.content) === hash(this.composeMessage(null, 1, c)) && hash(e.route) === hash(c.native_email.rounds[0]), 'Approved native proof message or route changed after reservation');
    state.operations.bindings ??= {};
    check(!state.operations.bindings[id] || hash(state.operations.bindings[id]) === hash(binding), 'Native test contact changed; reconcile the existing proof');
    state.operations.bindings[id] ??= binding;
    yield* super.plan(state, c);
  }
}
export function operationsFor(app, session) { return app.config.mode === 'production' ? new ProductionOperations(app, session) : app.config.operations?.native_proof ? new NativeProofOperations(app, session) : new ControlledOperations(app, session); }
