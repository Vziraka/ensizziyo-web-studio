import { renderCallDesk } from '/call-desk.js';
import { centsFromDollars } from '/money.js';
let state, csrf, operatorAuthRequired = false, view = 'today', selected = 'juniper', lane = 'all', dirty = false, refreshAfter = 0;
const content = document.querySelector('#content'), message = document.querySelector('#message');
const titles = { today: ['Your calling desk', 'Your next conversation.', 'Prepared leads, clear next steps and your notes in one place.'], reviews: ['Evidence → operator decision', 'Review calls and replies.', 'Connected calls and verified replies wait for an operator decision.'], clients: ['From scope to support', 'Deliver what you agreed.', 'Track materials, payment evidence, delivery checks and open requests.'], exceptions: ['Bounded recovery', 'Handle the exceptions.', 'Held work stays visible while unrelated records continue.'], launch: ['Before the first real contact', 'Approve a working system.', 'These gates stay closed until their evidence and your final approval are recorded.'] };
Object.assign(titles,{businesses:['Your business directory','Businesses, with context.','Research, professional contacts, social profiles and saved conversations.'],emails:['After the call','Follow-ups at a glance.','Each performed call owns one message. Held work shows what is missing.'],meetings:['Your conversations','Meetings and next steps.','Booked conversations and invitations awaiting calendar verification.']});
Object.assign(titles,{assets:['Shared asset index','Keep approved versions easy to find.','Studio files and project references stay organized across every sales stage.']});
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, fn, className = 'quiet') { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', fn); return node; }
function tell(text, error = false) { message.textContent = text; message.className = error ? 'error' : ''; }
async function api(path, input) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Token': csrf }, body: JSON.stringify(input) });
  if (response.status === 401 && operatorAuthRequired) { showOperatorLogin(); throw Error('Sign in with your operator key to continue'); }
  const data = await response.json(); if (!response.ok) throw Error(data.error); return data;
}
function showOperatorLogin(error = '') {
  state = null; document.querySelector('nav').hidden = true; document.querySelector('.aside-foot').hidden = true;
  document.querySelector('#mode-banner').hidden = true; document.querySelector('#backup').hidden = true;
  document.querySelector('#pause').hidden = true; document.querySelector('#operator-label').hidden = true; document.querySelector('#sign-out').hidden = true;
  const node = panel('Sign in to EVZ operations'), form = el('form');
  node.append(el('p', 'Use your individual operator key. Saved decisions show whether you or your friend made them.'));
  const wrap = el('label', 'Operator access key'), input = el('input'); input.type = 'password'; input.name = 'operator-key'; input.autocomplete = 'current-password'; input.required = true; input.setAttribute('aria-label', 'Operator access key'); wrap.append(input); form.append(wrap);
  const submit = el('button', 'Sign in', 'primary'); submit.type = 'submit'; form.append(submit); form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Token': csrf }, body: JSON.stringify({ key: input.value }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error);
      input.value = ''; await refresh();
    } catch (e) { tell(e.message, true); input.focus(); } finally { submit.disabled = false; }
  });
  node.append(form); content.replaceChildren(node); document.querySelector('#view-kicker').textContent = 'Shared company workspace';
  document.querySelector('#view-title').textContent = 'Sign in to continue.'; document.querySelector('#view-description').textContent = 'Each operator uses a separate key; the workspace records who made each decision.';
  tell(error, Boolean(error));
}
async function refresh() {
  const response = await fetch('/api/state');
  if (response.status === 401 && operatorAuthRequired) { showOperatorLogin(); return; }
  if (!response.ok) throw Error('Private session unavailable. Reload the console.');
  state = await response.json();
  document.querySelector('nav').hidden = false; document.querySelector('.aside-foot').hidden = false;
  document.querySelector('#mode-banner').hidden = false; document.querySelector('#backup').hidden = false; document.querySelector('#pause').hidden = false;
  const operatorLabel = document.querySelector('#operator-label'), signOut = document.querySelector('#sign-out');
  operatorLabel.hidden = !state.operator_auth_enabled; operatorLabel.textContent = state.current_operator === 'friend' ? 'Friend · shared team' : 'Owner · shared team';
  signOut.hidden = !state.operator_auth_enabled;
  const panel=content.querySelector('.call-desk > .panel');
  const position=panel&&{panel:panel.scrollTop,list:panel.querySelector('.record-list')?.scrollTop??0,page:window.scrollY};
  render();
  if(position){
    const next=content.querySelector('.call-desk > .panel');
    next?.scrollTo({top:position.panel,behavior:'instant'});
    next?.querySelector('.record-list')?.scrollTo({top:position.list,behavior:'instant'});
    window.scrollTo({top:position.page,behavior:'instant'});
  }
}
function pill(text) { return el('span', text, 'badge'); }
function panel(title) { const node = el('section', undefined, 'panel'); if (title) node.append(el('h2', title)); return node; }
function link(label, href) { const node = el('a', label); if (/^https:\/\//i.test(href) || href === '/preview/' || /^\/(?:proposal\/[a-zA-Z0-9_-]+|follow-up\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)$/.test(href)) { node.href = href; node.target = '_blank'; node.rel = 'noreferrer'; } else node.removeAttribute('href'); return node; }
function summary(r) {
  const node = button('', () => { selected = r.id; render(); }, `record${selected === r.id ? ' selected' : ''}`);
  node.append(el('strong', r.name), pill(r.call_lane === 'verification' ? 'Verification call only' : 'Research reviewed'), pill(r.stage), el('small', r.idea)); return node;
}
function stats() {
  const row = el('div', undefined, 'stats');
  for (const [label, value, note] of [['Businesses today', `${state.daily.unique_businesses} / 50`, 'Actual contacts · follow-ups included'], ['Call & reply reviews', Object.values(state.prospects).filter(r => ['Connected review', 'Verification review', 'Reply review'].includes(r.stage)).length, 'Held until your decision'], ['Open support', Object.values(state.prospects).flatMap(r => r.tickets).filter(t => t.status === 'Open').length, state.controls.mode === 'controlled' ? 'Fictional projects in this review' : 'Saved client requests'], ['Exceptions', state.exceptions.length + (state.reply_alerts?.length ?? 0), 'Consolidated in the private workspace']]) {
    const card = el('div', undefined, 'stat'); card.append(el('p', label, 'eyebrow'), el('strong', String(value)), el('small', note)); row.append(card);
  } return row;
}
function assetRefValue(kind, value) { return kind === 'drive' ? `drive:${value.trim()}` : `private-path:${value.trim()}`; }
async function saveAssetEvent(type, data) {
  await api('/api/event', { revision: state.revision, event: { id: crypto.randomUUID(), prospect_id: 'studio-assets', type, at: new Date().toISOString(), data } });
  dirty = false; tell('Saved in the private shared index.'); await refresh();
}
function renderAssets() {
  const node = panel('Private studio and project assets');
  node.append(el('p', 'Add a Google Drive file ID or a relative path inside private storage. This index saves references only; it does not copy, fetch or verify files. Never paste credentials or file contents.', 'notice'));
  node.append(el('p', 'A version becomes the approved baseline only after both operators select that same version. Conflicting selections leave the last shared baseline in place.', 'muted'));
  const form = el('form'); form.append(el('h3', 'Add an asset reference'));
  const scope = inputField(form, 'Asset scope', 'scope', 'studio', 'text', [{ value: 'studio', label: 'Studio-wide' }, { value: 'project', label: 'Project' }]);
  const projects = Object.values(state.prospects).sort((a, b) => a.name.localeCompare(b.name));
  const project = inputField(form, 'Project', 'project_id', '', 'text', [{ value: '', label: 'Choose a project' }, ...projects.map(r => ({ value: r.id, label: `${r.name} · ${r.stage}` }))]);
  project.parentElement.hidden = scope.value !== 'project';
  scope.addEventListener('change', () => { project.parentElement.hidden = scope.value !== 'project'; });
  const name = inputField(form, 'Asset name', 'name');
  const kind = inputField(form, 'Category', 'kind', 'brand', 'text', ['brand', 'template', 'source', 'brief', 'mockup', 'proposal', 'approval', 'delivery', 'other']);
  const versionLabel = inputField(form, 'Version label', 'version_label', 'v1');
  const referenceKind = inputField(form, 'Reference type', 'reference_kind', 'drive', 'text', [{ value: 'drive', label: 'Google Drive file ID' }, { value: 'path', label: 'Relative private path' }]);
  const referenceValue = inputField(form, 'File ID or relative path', 'reference');
  form.append(el('p', 'Use a separate, immutable file reference for each version. A file ID or path is not a credential.', 'muted'));
  const submit = el('button', 'Add to index', 'primary'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      await saveAssetEvent('asset_registered', { asset_id: crypto.randomUUID(), scope: scope.value, ...(scope.value === 'project' ? { project_id: project.value } : {}), name: name.value, kind: kind.value, version_id: crypto.randomUUID(), version_label: versionLabel.value, reference: assetRefValue(referenceKind.value, referenceValue.value) });
    } catch (error) { tell(error.message, true); } finally { submit.disabled = false; }
  });
  node.append(form);
  const index = Object.values(state.asset_index ?? {});
  if (!index.length) node.append(el('p', 'No asset references yet. Add a studio file or link an asset to any existing project record.', 'empty'));
  for (const asset of index.sort((a, b) => a.name.localeCompare(b.name))) {
    const card = panel(asset.name);
    const projectName = asset.project_id ? state.prospects[asset.project_id]?.name ?? 'Project record unavailable' : 'Studio-wide';
    card.append(pill(asset.kind), pill(projectName));
    const baseline = asset.versions[asset.baseline_version];
    card.append(el('p', baseline ? `Approved baseline: ${baseline.label}` : 'Approved baseline: not set yet', baseline ? '' : 'muted'));
    const ownerChoice = asset.choices.owner?.version_id, friendChoice = asset.choices.friend?.version_id;
    if (ownerChoice && friendChoice && ownerChoice !== friendChoice) card.append(el('p', `Selections differ · owner: ${asset.versions[ownerChoice]?.label ?? 'unknown'} · friend: ${asset.versions[friendChoice]?.label ?? 'unknown'}. The baseline stays ${baseline?.label ?? 'unset'} until both select the same version.`, 'notice'));
    else if (!ownerChoice || !friendChoice) card.append(el('p', 'Both operators must select the same version before it becomes the baseline.', 'muted'));
    for (const version of Object.values(asset.versions).sort((a, b) => a.registered_at.localeCompare(b.registered_at))) {
      const row = el('section', undefined, 'check-item asset-version');
      row.append(el('strong', version.label), el('p', version.reference, 'muted'));
      row.append(el('small', `Added by ${version.registered_by} · ${new Date(version.registered_at).toLocaleDateString()}`));
      const mine = asset.choices[state.current_operator]?.version_id === version.id;
      row.append(button(mine ? 'Your selection' : 'Select as my approved version', async () => { try { await saveAssetEvent('asset_version_selected', { asset_id: asset.id, version_id: version.id }); } catch (error) { tell(error.message, true); } }));
      card.append(row);
    }
    const addVersion = el('form'); addVersion.append(el('h4', 'Register a new version'));
    const label = inputField(addVersion, 'Version label', 'version_label');
    const refKind = inputField(addVersion, 'Reference type', 'reference_kind', 'drive', 'text', [{ value: 'drive', label: 'Google Drive file ID' }, { value: 'path', label: 'Relative private path' }]);
    const ref = inputField(addVersion, 'File ID or relative path', 'reference');
    const add = el('button', 'Add version'); add.type = 'submit'; addVersion.append(add);
    addVersion.addEventListener('submit', async event => {
      event.preventDefault(); add.disabled = true;
      try { await saveAssetEvent('asset_version_registered', { asset_id: asset.id, version_id: crypto.randomUUID(), version_label: label.value, reference: assetRefValue(refKind.value, ref.value) }); }
      catch (error) { tell(error.message, true); } finally { add.disabled = false; }
    });
    card.append(addVersion); node.append(card);
  }
  content.append(node);
}
function inputField(form, label, name, value = '', type = 'text', options) {
  const wrap = el('label', label); let input;
  if (options) { input = el('select'); for (const item of options) { const o = el('option', item.label ?? item); o.value = item.value ?? item; input.append(o); } }
  else input = el(type === 'textarea' ? 'textarea' : 'input');
  input.name = name;
  input.setAttribute('aria-label', label);
  if (input.tagName === 'INPUT') input.type = type === 'money' ? 'text' : type;
  if (type === 'money') { input.inputMode = 'decimal'; input.dataset.money = 'true'; }
  if (type === 'checkbox') { wrap.className = 'checkbox'; input.checked = value === true; wrap.prepend(input); }
  else { input.value = value; wrap.append(input); }
  form.append(wrap); return input;
}
function eventForm(r, title, type, fields, fixed = {}, submitLabel = 'Save reviewed decision') {
  const form = el('form'); form.append(el('h3', title));
  const controls = fields.map(f => ({ name: f[1], node: inputField(form, ...f) }));
  const submit = el('button', submitLabel, 'primary'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const data = { ...fixed };
      for (const { name, node } of controls) data[name] = node.dataset.money ? centsFromDollars(node.value) : node.type === 'checkbox' ? node.checked : node.type === 'number' ? Number(node.value) : node.value;
      if (data.callback_at === '') delete data.callback_at;
      await api('/api/event', { revision: state.revision, event: { id: crypto.randomUUID(), prospect_id: r.id, type, at: new Date().toISOString(), data } });
      dirty = false; tell('Saved. The next step is based on this reviewed record.'); await refresh();
    } catch (error) { tell(error.message, true); } finally { submit.disabled = false; }
  }); return form;
}
function callForm(r) {
  return eventForm(r, r.controlled ? 'Log a simulated call outcome' : 'Log your completed call', 'call_logged', [
    ['Outcome', 'outcome', 'no_answer', 'text', ['no_answer', 'busy', 'voicemail', 'connected', 'callback', 'declined', 'do_not_contact', 'wrong_contact', 'skipped']],
    ['Performed at (ISO timestamp with timezone)', 'performed_at', new Date().toISOString()],
    ['Callback date/time, when requested (ISO timestamp)', 'callback_at', '']
  ], { call_id: crypto.randomUUID(), simulated: r.controlled }, 'Save call outcome');
}
function callPrep(r) {
  const card = el('section', undefined, 'call-prep'); card.setAttribute('aria-label', 'Call preparation');
  card.append(el('h3', 'Before you call'));
  if (r.call_lane === 'verification') {
    const packet = r.verification.packet;
    card.append(el('p', `Verification call only · current activity and owner fit are unconfirmed. This is not a detailed, independently accepted assessment. ${state.controls.follow_up_enabled?'Eligible saved attempts prepare a follow-up when a verified business email is available; commercial release has separate gates.':'No automatic email follows an unanswered call.'}`, 'notice'));
    for (const [key, title] of [['identity', 'Business identity'], ['location', 'Location'], ['offering', 'Public offering'], ['public_phone', 'Public business phone']]) {
      const proof = packet[key], source = packet.sources.find(s => s.url === proof.url), line = el('p');
      line.append(el('strong', `${title}: `), document.createTextNode(proof.excerpt), document.createTextNode(' · '), link('Source ↗', proof.url), document.createTextNode(` · checked ${source.fetched_at}`)); card.append(line);
    }
    card.append(el('h4', 'Suggested opening'), el('blockquote', r.verification.opening, 'quote'));
    card.append(el('h4', 'Then ask'), el('p', r.verification.owner_question ?? 'What would you most like to make easier for customers or for yourself?'), el('p', 'How do customers order or enquire today? Which tools already handle this, and what works well?'), el('p', `Possible enhancement to discuss: ${r.idea}`, 'muted'));
    const unknowns = el('ul'); for (const unknown of packet.unknowns) unknowns.append(el('li', unknown)); card.append(unknowns);
    if (Date.now() - Date.parse(r.contact.checked_at) > 14 * 86400000) card.append(el('p', 'The identity/phone check is stale. Reverify before calling.', 'notice'));
    return card;
  }
  const prep = r.call_prep;
  if (!prep?.observations?.length || prep.observations.some(o => !o.sources?.length || o.sources.some(s => !/^https:\/\//i.test(s.url) || !Number.isFinite(Date.parse(s.checked_at))))) {
    card.append(el('p', 'Call preparation evidence is missing. Check the saved research and current customer route before choosing an opening; no evidence-based script is available.', 'notice'));
    return card;
  }
  card.append(el('p', r.controlled ? 'Fictional call-prep example · no real business researched.' : `Independent review: ${new Date(prep.reviewed_at).toLocaleDateString()}`, 'source'));
  card.append(el('h4', 'What we observed'));
  for (const observation of prep.observations) {
    card.append(el('p', observation.fact));
    for (const source of observation.sources) {
      const cite = el('p', undefined, 'source'); cite.append(link('Checked source ↗', source.url), document.createTextNode(` · inspected ${source.checked_at ? new Date(source.checked_at).toLocaleDateString() : 'date missing — verify before calling'}`));
      card.append(cite);
    }
  }
  card.append(el('h4', 'Current route / tools'), el('p', prep.current_route ? `${prep.current_route.status}: ${prep.current_route.finding}` : 'Not established by the capture. Ask how orders or enquiries work today.'));
  if (prep.existing_alternatives?.length) card.append(el('p', `Existing alternatives: ${prep.existing_alternatives.join('; ')}`, 'muted'));
  card.append(el('h4', 'One idea to explore'), el('p', prep.hypothesis), el('p', `Possible benefit to validate: ${prep.possible_effect}`, 'muted'));
  card.append(el('h4', 'Suggested opening'), el('blockquote', prep.opening, 'quote'), el('h4', 'Then ask'));
  const questions = el('ol'); for (const question of prep.questions) questions.append(el('li', question)); card.append(questions);
  const unknowns = el('details'); unknowns.append(el('summary', 'Uncertainties to confirm'));
  const list = el('ul'); for (const unknown of prep.unknowns) list.append(el('li', unknown)); unknowns.append(list); card.append(unknowns);
  card.append(el('p', 'You place the call. If busy, agree a callback time. Log the actual outcome below; a decline or stop ends campaign follow-ups.', 'muted'));
  return card;
}
function review(r, node) {
  const call = Object.values(r.calls).find(c => c.outcome === 'connected' && !r.approved_calls[c.call_id]);
  if (!call) return;
  const transcript = r.transcripts[call.call_id], proposal = r.proposals[call.call_id];
  if (!transcript) {
    node.append(eventForm(r, 'Add the connected-call transcript', 'transcript_added', [
      ['Transcript', 'text', '', 'textarea'], ['I have permission to use this transcript. Recording consent was handled separately.', 'permission_confirmed', false, 'checkbox']
    ], { call_id: call.call_id }, 'Save transcript')); return;
  }
  const detail = el('details'); detail.append(el('summary', 'Read the saved transcript'), el('p', transcript.text, 'quote transcript')); node.append(detail);
  if (!proposal) {
    node.append(el('p', 'The transcript is saved. AI analysis uses the subscription allowance and preserves the website/client reserve.', 'notice'));
    const run = button(state.workers.includes(`${r.id}:${call.call_id}`) ? 'Analysis running…' : 'Request evidence review', async () => {
      try { await api('/api/analyze', { prospect_id: r.id, call_id: call.call_id }); tell('Analysis requested. Any allowance or evidence hold will appear in Exceptions.'); setTimeout(() => refresh().catch(e => tell(e.message, true)), 2500); }
      catch (error) { tell(error.message, true); }
    }, 'primary'); run.disabled = state.workers.includes(`${r.id}:${call.call_id}`); node.append(run); return;
  }
  node.append(el('hr', undefined, 'divider'), el('h3', 'Proposed outcome'), pill(proposal.outcome), el('p', proposal.summary));
  if (proposal.review.source) node.append(el('p', 'Simulated AI assessment/review for this design exercise. A live Luna/Sol run has not passed.', 'notice'));
  for (const claim of proposal.claims) node.append(el('p', claim.claim), el('blockquote', claim.quote, 'quote'));
  node.append(el('p', `Still unknown: ${proposal.unknowns.join('; ')}`, 'muted'));
  node.append(eventForm(r, 'Confirm or change the next action', 'call_reviewed', [
    ['Reviewed outcome', 'outcome', proposal.outcome, 'text', ['discovery', 'requested_info', 'callback', 'not_interested', 'do_not_contact', 'wrong_contact', 'uncertain']],
    ['Confirmed callback date/time, if applicable', 'callback_at', proposal.callback_at ?? ''], ['Your review note', 'note', '', 'textarea']
  ], { call_id: call.call_id, proposal_sha256: proposal.sha256 }, 'Confirm this outcome'));
}
function nextForm(r, node) {
  const ref = r.controlled ? 'fixture:owner-verified evidence — controlled test only' : '';
  if (['Ready to contact', 'Contacting', 'Ready to verify', 'Verifying', 'Callback'].includes(r.stage)) {
    if (!r.controlled && state.controls.calls_paused) node.append(el('p', 'This prospect is staged. Calling stays paused until the final owner release. Email has separate launch gates.', 'notice'));
    else node.append(callForm(r));
  }
  if (r.stage === 'Connected review') review(r, node);
  if (r.stage === 'Verification review') {
    const callId = Object.keys(r.approved_calls).at(-1);
    node.append(eventForm(r, 'Confirm the actual verification conversation', 'verification_confirmed', [
      ['The speaker confirmed this business identity', 'identity_confirmed', false, 'checkbox'], ['The speaker confirmed current business activity', 'active_confirmed', false, 'checkbox'],
      ['Decision-maker / role confirmed in the conversation', 'decision_maker', ''], ['Specific owner goal', 'goal', '', 'textarea'],
      ['Exact transcript quote confirming identity', 'identity_quote', '', 'textarea'], ['Exact transcript quote confirming current activity', 'activity_quote', '', 'textarea'],
      ['Exact transcript quote confirming decision-maker', 'decision_maker_quote', '', 'textarea'], ['Exact transcript quote supporting the goal', 'goal_quote', '', 'textarea'],
      ['Business email given in this conversation, optional', 'email', ''], ['Exact quote requesting or agreeing to email at this address', 'email_quote', '', 'textarea'], ['I confirmed the owner wants email at this address', 'email_permission_confirmed', false, 'checkbox']
    ], { call_id: callId }, 'Confirm conversation qualification'));
  }
  if (r.stage === 'Reply review') {
    const latestDraft = [...(r.reply_drafts ?? [])].reverse().find(draft => draft.source_id === r.reply.source_id);
    node.append(el('p', 'Review the original message in the connected mailbox. Future cold follow-ups are paused. A saved draft here is attributed and is never sent automatically.', 'notice'));
    if (latestDraft) node.append(el('p', `Saved draft by ${latestDraft.actor} · ${new Date(latestDraft.at).toLocaleString()} · not sent.`, 'muted'));
    node.append(eventForm(r, 'Draft a reply for human review', 'reply_draft_saved', [
      ['Proposed reply (saved only; not sent)', 'body', latestDraft?.body ?? '', 'textarea']
    ], { source_id: r.reply.source_id }, latestDraft ? 'Save revised reply draft' : 'Save reply draft'));
  }
  if (r.stage === 'Reply review') node.append(eventForm(r, 'Review the verified reply', 'reply_reviewed', [
    ['Next action', 'outcome', 'hold', 'text', ['discovery', 'requested_info', 'hold', 'decline', 'do_not_contact']],
    ['Your reply review note', 'note', '', 'textarea']
  ], { source_id: r.reply.source_id }, 'Confirm reply outcome'));
  if (['Discovery', 'Information requested'].includes(r.stage)) node.append(eventForm(r, 'Confirm qualified discovery', 'discovery_confirmed', [
    ['Owner’s goal', 'goal', r.controlled ? 'Make preorder pickup details clear' : '', 'textarea'], ['Decision-maker', 'decision_maker', r.controlled ? 'Fictional owner' : ''],
    ['Serious interest confirmed in conversation', 'serious_interest', false, 'checkbox'], ['We discussed whether a paid project could fit', 'paid_fit_discussed', false, 'checkbox'],
    ['Primary service for this project', 'service', 'website', 'text', ['website', 'systems', 'ai', 'marketing']], ['One main preview flow', 'main_flow', r.controlled ? 'Choose a pastry box and request pickup' : ''],
    ['Preview screen count', 'preview_screens', 3, 'number']
  ], {}, 'Confirm discovery & preview brief'));
  if (['Discovery', 'Information requested'].includes(r.stage)) {
    if (!r.controlled) {
      const form = el('form'); form.append(el('h3', 'Schedule an agreed discovery meeting'));
      const guest = inputField(form, 'Guest email', 'attendee_email', r.contact.email);
      const start = inputField(form, 'Agreed start (ISO timestamp with timezone)', 'start');
      const end = inputField(form, 'Agreed end (ISO timestamp with timezone)', 'end');
      const agreed = inputField(form, 'The guest agreed to this slot and invitation', 'slot_agreed', false, 'checkbox');
      const submit = el('button', 'Check availability & book', 'primary'); submit.type = 'submit'; form.append(submit);
      form.addEventListener('submit', async e => { e.preventDefault(); submit.disabled = true; try {
        await api('/api/booking', { prospect_id: r.id, attendee_email: guest.value, start: start.value, end: end.value, slot_agreed: agreed.checked, title: `EVZ Digital · ${r.name} discovery`, description: 'Discuss one business goal and a possible bounded digital project. Scope and price remain to be agreed.' });
        tell('Request saved. The service will check fresh availability, create one invitation and verify its readback. It is not booked yet.'); await refresh();
      } catch (error) { tell(error.message, true); } finally { submit.disabled = false; } }); node.append(form);
    }
    const meeting = el('details'); meeting.append(el('summary', r.meeting ? 'Update the booked discovery reference' : 'Record a discovery meeting you booked'));
    meeting.append(eventForm(r, 'Calendar confirmation', 'meeting_recorded', [['Calendar event ID', 'event_id', r.meeting?.event_id ?? (r.controlled ? 'fixture-discovery-1' : '')],
      ['Start, with timezone', 'start', r.meeting?.start ?? new Date(Date.now() + 86400000).toISOString()], ['End, with timezone', 'end', r.meeting?.end ?? new Date(Date.now() + 87600000).toISOString()],
      ['Calendar event reference', 'reference', r.meeting?.reference ?? ref], ['I checked the booking in the owner calendar', 'owner_verified', false, 'checkbox']], { timezone: 'America/New_York' }, 'Record calendar evidence'));
    node.append(meeting);
  }
  if (r.stage === 'Preview') {
    if (r.controlled) node.append(link('Open the fictional three-screen preview ↗', '/preview/'));
    node.append(eventForm(r, 'Record the reviewed preview', 'preview_recorded', [['Preview reference', 'reference', r.controlled ? '/preview/' : ''], ['Bounded brief', 'brief', r.discovery.main_flow, 'textarea'],
      ['Reviewed with the decision-maker', 'reviewed_with_owner', false, 'checkbox']], {}, 'Move to proposal'));
  }
  if (r.stage === 'Proposal') node.append(eventForm(r, 'Approve a fixed project quote', 'proposal_approved', [
    [r.controlled ? 'Fixed project price (USD; test value only)' : 'Fixed project price (USD)', 'price_cents', r.controlled ? '1200.00' : '', 'money'], [r.controlled ? 'Initial payment (USD; test value only)' : 'Initial payment (USD)', 'initial_payment_cents', r.controlled ? '600.00' : '', 'money'],
    ['Included revision rounds', 'revision_rounds', 1, 'number'], ['Scope', 'scope', r.discovery.main_flow, 'textarea'], ['Deliverables', 'deliverables', 'Three responsive pages and a verified request route', 'textarea'],
    ['Exclusions and third-party costs', 'exclusions', 'Payments, inventory, ad spend and external subscriptions', 'textarea'], ['Timeline and client dependencies', 'timeline', 'Confirm dates after materials and access', 'textarea'],
    ['Acceptance criteria', 'acceptance', 'Verified request, responsive layout, errors and handover', 'textarea'], ['Ownership and licenses', 'ownership', 'Client owns paid original deliverables; existing tools retain their licenses', 'textarea'],
    ['Support boundaries', 'support_terms', 'Defect coverage and ongoing care to be agreed in the actual quote', 'textarea'], ['Change process', 'change_terms', 'Written scope, price and acceptance before extra work', 'textarea'],
    ['Cancellation terms', 'cancellation_terms', 'Written settlement for work completed and unused prepaid amounts', 'textarea'], ['Reviewed proposal reference', 'reference', ref]
  ], { currency: 'USD' }, r.controlled ? 'Approve this test quote' : 'Approve the written quote'));
  if (r.stage === 'Agreement' && !r.agreement) node.append(eventForm(r, 'Verify the signed agreement', 'agreement_recorded', [['Signed document reference', 'reference', ref], ['I checked signed acceptance of this exact approved quote', 'signed_verified', false, 'checkbox']], { quote_sha256: r.quote_sha256 }, 'Record signed agreement'));
  if (r.agreement && ['Agreement', 'Handover'].includes(r.stage)) {
    const total = r.invoices.reduce((n, i) => n + i.amount_cents, 0), outstanding = r.invoices.find(i => r.payments.filter(p => p.invoice_id === i.invoice_id).reduce((n, p) => n + p.amount_cents, 0) < i.amount_cents);
    if (total < r.quote.price_cents) node.append(eventForm(r, 'Record an issued invoice', 'invoice_recorded', [['Invoice ID', 'invoice_id', `invoice-${crypto.randomUUID()}`], ['Invoice amount (USD)', 'amount_cents', ((r.stage === 'Agreement' ? r.quote.initial_payment_cents : r.quote.price_cents - total) / 100).toFixed(2), 'money'], ['Invoice reference', 'reference', ref]], { currency: 'USD' }, 'Record invoice evidence'));
    if (outstanding) node.append(eventForm(r, 'Verify a settled payment', 'payment_recorded', [['Settled amount (USD)', 'amount_cents', ((outstanding.amount_cents - r.payments.filter(p => p.invoice_id === outstanding.invoice_id).reduce((n, p) => n + p.amount_cents, 0)) / 100).toFixed(2), 'money'], ['Evidence reference', 'reference', ref], ['Settlement was independently verified; this is not an AI claim', 'settled_verified', false, 'checkbox']], { invoice_id: outstanding.invoice_id, payment_id: crypto.randomUUID(), currency: 'USD', simulated: r.controlled }, 'Record test payment evidence'));
  }
  if (r.stage === 'Onboarding') node.append(eventForm(r, 'Complete onboarding', 'onboarding_completed', [['Materials and asset references', 'materials', 'Menu, brand assets, approved pickup wording', 'textarea'], ['Access plan (references only; no passwords)', 'access_plan', 'Client-owned accounts with scoped invitations', 'textarea'], ['Kickoff and agreed dates', 'kickoff', 'Owner confirms after materials', 'textarea']], {}, 'Start scoped delivery'));
  if (r.stage === 'Delivery') {
    for (const task of r.tasks) {
      const row = el('div', undefined, 'check-item'); row.append(el('span', task.status === 'Complete' ? '✓' : '·'), el('p', task.title));
      if (task.status !== 'Complete') { const form = eventForm(r, `Verify: ${task.title}`, 'delivery_task_updated', [['Evidence reference', 'evidence', ref]], { task_id: task.id, status: 'Complete' }, 'Save delivery check'); row.append(form); } node.append(row);
    }
    if (r.tasks.every(t => t.status === 'Complete')) node.append(eventForm(r, 'Submit for client review', 'delivery_submitted', [['Delivery reference', 'reference', r.controlled ? '/preview/' : '']], {}, 'Record delivery submission'));
  }
  if (r.stage === 'Client review') {
    node.append(eventForm(r, 'Record verified client acceptance', 'acceptance_recorded', [['Approval reference', 'reference', ref], ['I verified the client accepted this delivery', 'client_approval_verified', false, 'checkbox']], {}, 'Record acceptance'));
    if (r.revisions.length < r.quote.revision_rounds) node.append(el('hr', undefined, 'divider'), eventForm(r, 'Or record an included revision', 'revision_requested', [['Client feedback', 'feedback', '', 'textarea'], ['Feedback reference', 'reference', ref]], {}, 'Start included revision'));
  }
  if (r.stage === 'Handover' && r.payments.reduce((n, p) => n + p.amount_cents, 0) === r.quote.price_cents) node.append(eventForm(r, 'Complete handover', 'handover_completed', [['Ownership/account handoff', 'ownership', ref], ['Training/operating guide', 'training', ref], ['Backup and restore evidence', 'backup', ref], ['Agreed support boundaries', 'support', ref]], {}, 'Record handover'));
  if (['Support', 'Closed'].includes(r.stage)) {
    for (const ticket of r.tickets.filter(t => t.status === 'Open')) node.append(eventForm(r, `Resolve: ${ticket.description}`, 'support_closed', [['Resolution', 'resolution', '', 'textarea'], ['Evidence reference', 'reference', ref], ['Client notification verified', 'client_notified_verified', false, 'checkbox']], { ticket_id: ticket.id }, 'Close this support request'));
    node.append(eventForm(r, 'Log a new support request', 'support_opened', [['Request', 'description', '', 'textarea'], ['Priority', 'priority', 'routine', 'text', ['routine', 'urgent']], ['Owner review date/time (no automatic SLA promise)', 'review_at', new Date(Date.now() + 86400000).toISOString()]], { ticket_id: crypto.randomUUID() }, 'Open support request'));
    if (r.stage === 'Support' && r.tickets.every(t => t.status === 'Closed')) node.append(eventForm(r, 'Close the completed project', 'project_closed', [], {}, 'Close project'));
  }
  if (['Hold', 'Stopped'].includes(r.stage)) node.append(el('p', r.restriction ? `Contact restriction: ${r.restriction}. Older positive notes cannot restart outreach.` : r.next_check, 'notice'));
}
function detail(r) {
  const node = panel(); node.append(pill(r.stage), el('h2', r.name, 'detail-title'), el('p', r.idea, 'idea'), el('p', `Evidence: ${r.qualification.evidence_ref}`, 'source'));
  if (!r.controlled) node.append(el('p', `Public business phone: ${r.contact.phone ?? 'awaiting verification'} · Email: ${r.contact.email ?? 'unverified — automatic email blocked'}`, 'source'));
  for (const [actionId, email] of Object.entries(state.operations?.email ?? {})) if (state.actions[actionId]?.prospect_id === r.id) node.append(el('p', `Email: ${email.status}${email.thread ? ' · sender thread verified' : ''}`, 'notice'));
  if (r.reply) node.append(el('p', `Verified reply: ${new Date(r.reply.at).toLocaleString()} · cold follow-ups paused · suppression: ${r.suppression ?? 'local only'}`, 'notice'));
  if (r.meeting) {
    const reference = el('p'); reference.append(link('Open the calendar record ↗', r.meeting.reference));
    node.append(el('p', `${r.meeting.current_status === 'Needs review' ? 'Calendar record needs review' : r.controlled ? 'Verified private test booking' : 'Verified meeting'}: ${new Date(r.meeting.start).toLocaleString()} – ${new Date(r.meeting.end).toLocaleTimeString()}`, 'notice'), reference);
  }
  if (!r.restriction && !r.agreement) node.append(button('Record do-not-contact now', async () => { try { await api('/api/event', { revision: state.revision, event: { id: crypto.randomUUID(), prospect_id: r.id, type: 'contact_stopped', at: new Date().toISOString(), data: { reason: 'do_not_contact' } } }); tell('Contact stopped. Pending local follow-ups cancelled; provider suppression still needs authoritative readback if enrolled.'); await refresh(); } catch (error) { tell(error.message, true); } }));
  if (r.quote) node.append(el('p', `${r.controlled ? 'Test quote' : 'Fixed quote'}: $${(r.quote.price_cents / 100).toFixed(2)} · verified payment evidence: $${(r.payments.reduce((n, p) => n + p.amount_cents, 0) / 100).toFixed(2)}`, 'notice'));
  if (r.quote) node.append(link('Open the written project proposal ↗', `/proposal/${r.id}`));
  if (r.stage === 'Callback') {
    const due=r.callback_at??r.callback_due_at,when=due?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(due))+' ET':null;
    node.append(el('p', r.callback_at ? `Requested callback at ${when}. Cold email remains paused.` : when ? `Callback requested without an exact time. Internal reminder set for ${when}; no time was promised. Cold email remains paused.` : 'Callback requested. Check the saved reminder before calling.', 'notice'));
  }
  if (['Ready to contact', 'Contacting', 'Ready to verify', 'Verifying', 'Callback'].includes(r.stage)) node.append(callPrep(r));
  nextForm(r, node);
  const history = el('details'); history.append(el('summary', 'Review the saved event history'));
  const list = el('ol', undefined, 'timeline');
  for (const event of Object.values(state.events).filter(e => e.prospect_id === r.id).reverse()) {
    const item = el('li'); item.append(el('strong', event.type.replaceAll('_', ' ')), el('span', `${event.actor} · ${new Date(event.at).toLocaleString()}`)); list.append(item);
  }
  history.append(list); node.append(history); return node;
}
function render() {
  document.body.classList.toggle('desk-view',['today','businesses'].includes(view));
  const attentionCount = state.exceptions.length + (state.reply_alerts?.length ?? 0), attentionNav = document.querySelector('#attention-nav');
  const attentionBadge = document.querySelector('#attention-count');
  attentionBadge.textContent = attentionCount ? String(attentionCount) : '';
  attentionBadge.hidden = attentionCount === 0;
  attentionNav.setAttribute('aria-label', attentionCount ? `Needs attention, ${attentionCount} open items` : 'Needs attention');
  document.querySelector('#mode-banner').textContent = state.controls.mode === 'controlled' ? 'Controlled operations proof · Fictional businesses, simulated calls and payments. Approved test emails go only to owner-controlled inboxes.' : state.controls.calls_paused ? 'Production workspace · Saved research, verification calls and client work. Contact remains paused until final owner release.' : state.controls.outreach_paused ? 'Calling enabled · You place and log calls. Booking requires verified business Calendar setup and your approval of the guest and time. Commercial email remains paused.' : 'Production workspace · Live calls and email operate within the approved campaign rules. Review due work and exceptions before contacting.';
  const discovery=state.discovery_batches?.find(b=>!['Complete','Stopped','Held'].includes(b.status));
  document.querySelector('#research-status').textContent = discovery ? `Discovery ${discovery.status.toLowerCase()} · ${discovery.reviewed}/25 checked` : `${state.controls.research_paused ? 'Research paused' : 'Research enabled'}${state.research_runtime ? ` · ${state.research_runtime.status}${state.research_runtime.counts ? ` · ${state.research_runtime.counts.Complete} reviewed` : ''}` : ''}`;
  document.querySelector('#outreach-status').textContent = state.controls.calls_paused ? 'Outreach paused' : state.controls.outreach_paused ? 'Calls only · email paused' : 'Outreach enabled';
  content.replaceChildren(); const title = titles[view]; document.querySelector('#view-kicker').textContent = title[0]; document.querySelector('#view-title').textContent = title[1]; document.querySelector('#view-description').textContent = title[2];
  document.querySelector('#updated').textContent = `Saved revision ${state.revision} · ${new Date(state.updated_at).toLocaleTimeString()}`;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'assets') { renderAssets(); return; }
  if (view === 'exceptions') {
    const node = panel('Exception inbox');
    if (state.runtime) node.append(el('p', `Local service: ${state.runtime.status}. Connection: ${state.runtime.transport}. Last check: ${new Date(state.runtime.checked_at).toLocaleString()}. ${state.runtime.last_error ?? ''}`, 'notice'));
    if (state.operations) { const cycle = state.operations.cycle; node.append(el('p', `Monitoring: ${cycle?.completed_cycles ?? 0} completed cycles. Last full cycle: ${cycle?.completed_at ? new Date(cycle.completed_at).toLocaleString() : 'awaiting verification'}. Backup: ${state.operations.maintenance?.backup_date ?? 'awaiting verification'}.`, 'muted')); }
    if (!state.exceptions.length && !state.reply_alerts?.length) node.append(el('p', 'No unresolved exceptions.', 'empty'));
    for (const alert of state.reply_alerts ?? []) { const row = el('div', undefined, 'check-item'); row.append(el('span', '!'), el('p', alert.reason), button('Review reply', () => { selected = alert.prospect_id; view = 'reviews'; render(); }, 'primary')); node.append(row); }
    for (const item of state.exceptions) { const row = el('div', undefined, 'check-item'); row.append(el('span', '!'), el('p', item.reason)); node.append(row); }
    node.append(el('p', 'Routine checks stay in private logs. Notifications are consolidated and sent only for a meaningful change or required decision. The earlier test monitor stays paused.', 'muted')); content.append(node); return;
  }
  if (view === 'launch') {
    if (state.controls.mode === 'production') {
      const calls = panel('Calls-only final review'), review = state.controls.final_review.calls;
      calls.append(el('p', 'Release your manual calls and Apollo call tasks separately from email. Verification calls confirm activity and goals; they never trigger no-answer email. All real contact stays paused until your final approval.', 'notice'));
      for (const [key, label] of [['queue_verified', 'Checked identities, public phones and call cards'], ['outcomes_verified', 'Call outcomes, transcript/owner review and stop handling'], ['supervision_verified', 'Durable task supervision and recovery']]) calls.append(el('p', `${review.evidence[key] ? '✓' : '·'} ${label}`));
      calls.append(el('p', `Transcript review allowance: ${review.transcript_daily_calls} subscription model calls/day. A clean author/reviewer pair uses two; failed calls also count. Website priority and the 30% reserve can pause analysis. Email and invitations retain their separate launch gates.`, 'muted'));
      content.append(calls);
      const research = panel('Research priority');
      research.append(el('p', `Current priority: ${state.controls.research_priority ?? 'unavailable'}. Resume the saved campaign within its subscription allowance. Website and client priority pause research; outreach keeps its separate launch gates.`, 'muted'));
      for (const [value, label] of [['website', 'Website priority'], ['client', 'Client priority'], ['research', 'Resume approved research']]) research.append(button(label, async () => {
        try { await api('/api/research-priority', { priority: value }); tell(`Research priority saved: ${value}.`); await refresh(); } catch (error) { tell(error.message, true); }
      }));
      content.append(research);
    }
    const node = panel('Required before live automation'), list = el('div', undefined, 'checklist');
    const checks = { owner_design_approved: ['Your final design approval', 'Review this console, operating rules and controlled proof.'], business_sender_verified: ['Business sender ready', 'Workspace access, mailbox receipt/send-as and domain authentication checked.'], native_automation_verified: ['Apollo automatic handoff', 'Approved templates, exact intent lists, native workflow triggers and stop rules tested.'], delivery_and_stop_verified: ['Controlled delivery and cancellation', 'One approved owner-only rehearsal of the final native sending route; no blind retries.'], website_inquiry_verified: ['Website and inquiry route', 'Published studio and reachable inquiry destination verified.'], prospect_supply_verified: ['Reviewed local-business prospect supply', 'Resume research only when authorized; do not lower screening quality to fill 50.'], capacity_verified: ['Subscription and operating capacity', 'Live Luna/high + Sol/high compatibility, allowance, source review and upkeep measured.'] };
    for (const [key, [label, description]] of Object.entries(checks)) { const row = el('div', undefined, 'check-item'), copy = el('div'), gate = state.controls.final_review?.gates.find(g => g.key === key); copy.append(el('strong', label), el('p', description)); if (gate?.note) copy.append(el('p', gate.note)); const passed = state.controls.final_review ? gate?.passed : state.controls.readiness[key]; row.append(el('span', passed ? '✓' : '·'), copy); list.append(row); }
    if (state.controls.final_review?.verified?.length) { node.append(el('h3', 'Verified so far')); for (const line of state.controls.final_review.verified) node.append(el('p', line, 'muted')); }
    node.append(list, el('p', 'Readiness values are evidence-based gates, not checkboxes that activate sending. No production activation is available from this review screen.', 'muted')); content.append(node); return;
  }
  if (view === 'emails') {
    const node=panel('Saved follow-ups');
    if(state.controls.outreach_paused)node.append(el('p','Commercial sending is held. Messages below are prepared records, not proof of delivery.','notice'));
    const rows=Object.values(state.prospects).flatMap(r=>Object.values(r.follow_ups??{}).map(f=>({r,f}))).sort((a,b)=>b.f.created_at.localeCompare(a.f.created_at));
    if(!rows.length)node.append(el('p','Save an eligible call attempt to prepare its follow-up.','empty'));
    for(const {r,f} of rows){
      const box=el('details',undefined,'email-row'),due=Date.parse(f.send_after),scheduled=Number.isFinite(due)&&due>Date.now()?` · no earlier than ${new Date(due).toLocaleString('en-US',{timeZone:'America/New_York'})} ET`:'';
      box.append(el('summary',`${r.name} · ${f.status}${scheduled}`),el('p',f.reason||'Prepared from the saved call'),el('p',`To: ${f.content.to??'Verified address needed'}`),el('strong',f.content.subject),el('p',f.content.body,'email-copy'));if(f.content.demo_url)box.append(link(f.content.demo_label+' ↗',f.content.demo_url));box.append(link('Open full email preview ↗',`/follow-up/${r.id}/${f.call_id}`));node.append(box);
    }
    content.append(node);return;
  }
  if(view==='meetings'){const node=panel('Meetings');const page=state.follow_up_settings?.follow_up?.booking_url;if(page)node.append(link('Open EVZ booking page ↗',page));const meetings=Object.values(state.prospects).filter(r=>r.meeting);for(const r of meetings)node.append(el('h3',r.name),el('p',`${new Date(r.meeting.start).toLocaleString()} · ${r.meeting.current_status??'Verified'}`));for(const b of state.pending_bookings??[])node.append(el('h3',state.prospects[b.prospect_id]?.name??'Pending invitation'),el('p',`${new Date(b.start).toLocaleString()} · ${b.status}`));if(!meetings.length&&!state.pending_bookings?.length)node.append(el('p','No meetings booked yet. You can also book an agreed discovery time from the calling desk.','empty'));content.append(node);return;}
  if (['today','businesses'].includes(view)) { renderCallDesk(content,state,{api,refresh,tell,evidence:callPrep,clearDirty:()=>{dirty=false;},allBusinesses:view==='businesses'}); return; }
  if (view === 'today') content.append(stats(), el('p', `Prepared due call cards: ${state.daily.prepared.research} research-reviewed · ${state.daily.prepared.verification} verification only. These are prepared records, not calls made or accepted detailed assessments.`, 'notice'));
  const grid = el('div', undefined, 'grid'), records = Object.values(state.prospects).filter(r => view === 'reviews' ? ['Connected review', 'Verification review', 'Reply review'].includes(r.stage) : view === 'clients' ? r.handover || r.quote || ['Preview', 'Delivery', 'Client review', 'Onboarding'].includes(r.stage) : lane === 'all' || (r.call_lane === 'verification' ? lane === 'verification' : lane === 'research'));
  if (view === 'today') { const order = new Map(state.daily.due.map((a, i) => [a.prospect_id, i])); records.sort((a, b) => (order.get(a.id) ?? 10000) - (order.get(b.id) ?? 10000)); }
  const left = panel(view === 'reviews' ? 'Awaiting your review' : view === 'clients' ? 'Client work' : state.controls.mode === 'controlled' ? 'Controlled working records' : 'Daily call queue & prospects');
  left.append(el('p', view === 'today' ? 'Review the purpose and evidence before calling. Apollo tasks publish after final release; task completion is never call evidence.' : 'Select a record to review its current step.', 'muted'));
  if (view === 'today') {
    const filter = inputField(left, 'Call lane', 'lane', lane, 'text', [{ value: 'all', label: 'All call cards' }, { value: 'research', label: 'Research reviewed' }, { value: 'verification', label: 'Verification calls only' }]);
    filter.addEventListener('change', () => { lane = filter.value; render(); });
  }
  const recordList = el('div', undefined, 'record-list');
  for (const r of records) recordList.append(summary(r));
  left.append(recordList);
  if (!records.length) left.append(el('p', state.controls.mode === 'production' ? 'No reviewed prospects imported yet. Fictional test records stay in the separate rehearsal workspace.' : 'No records at this step.', 'empty'));
  if (!records.some(r => r.id === selected)) selected = records[0]?.id;
  grid.append(left); if (selected && state.prospects[selected]) grid.append(detail(state.prospects[selected])); content.append(grid);
}
document.addEventListener('input', e => { if (e.target.closest('form')) dirty = true; });
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { dirty = false; view = b.dataset.view; tell(''); render(); }));
document.querySelector('#pause').addEventListener('click', async () => { try { await api('/api/pause', {}); tell('AI and connector writes paused. Research and outreach remain paused.'); await refresh(); } catch (error) { tell(error.message, true); } });
document.querySelector('#backup').addEventListener('click', async () => { try { const result = await api('/api/backup', {}); tell(`Private backup saved and checksummed (${result.prospects} records).`); } catch (error) { tell(error.message, true); } });
document.querySelector('#sign-out').addEventListener('click', async () => { try { await api('/api/logout', {}); showOperatorLogin(); } catch (error) { tell(error.message, true); } });
async function start() {
  const response = await fetch('/api/bootstrap'); if (!response.ok) throw Error('Private session unavailable. Reload the console.');
  const boot = await response.json(); csrf = boot.csrf; operatorAuthRequired = boot.operator_auth_required;
  await refresh();
}
start().catch(error => tell(error.message, true));
setInterval(() => {
  if (dirty || document.querySelector('.desk-next') || document.visibilityState !== 'visible' || Date.now() < refreshAfter || document.activeElement?.closest('form') || document.activeElement?.matches('input,textarea,select')) return;
  refresh().catch(error => { refreshAfter = Date.now() + 60000; if (message.textContent !== error.message) tell(error.message, true); });
}, 15000);
