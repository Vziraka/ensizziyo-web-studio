import {gatewayProofPanel} from './gateway-proof.js';
import {renderHostedAssessment} from './transcript-assessment.js';
import {preparationPanel} from './project-work.js';
import { renderCallDesk } from './call-desk.js';
import { centsFromDollars } from './money.js';
import {deskPath} from './paths.js';
import {createEventRequest} from './event-request.js';
import {readDeskSnapshot} from './snapshot-read.js';
import {audioBusy,stopAudioCapture} from './call-audio.js';
let state, csrf, operatorAuthRequired = false, view = 'today', selected = 'juniper', lane = 'all', assetProject = '', dirty = false, refreshAfter = 0;
let eventRequest,loadedWorkspaceContext;
const emailTaskHandoffs=new Map();
const content = document.querySelector('#content'), message = document.querySelector('#message');
const titles = { today: ['Your calling desk', 'Your next conversation.', 'Prepared leads, clear next steps and your notes in one place.'], reviews: ['Evidence → operator decision', 'Review calls and replies.', 'Connected calls and verified replies wait for an operator decision.'], clients: ['From scope to support', 'Deliver what you agreed.', 'Track materials, payment evidence, delivery checks and open requests.'], exceptions: ['Bounded recovery', 'Handle the exceptions.', 'Held work stays visible while unrelated records continue.'], launch: ['Before the first real contact', 'Approve a working system.', 'These gates stay closed until their evidence and your final approval are recorded.'] };
Object.assign(titles,{businesses:['Your business directory','Businesses, with context.','Research, professional contacts, social profiles and saved conversations.'],emails:['After the call','Follow-ups at a glance.','Each performed call owns one message. Held work shows what is missing.'],meetings:['Your conversations','Meetings and next steps.','Booked conversations and invitations awaiting calendar verification.']});
Object.assign(titles,{assets:['Shared asset index','Keep approved versions easy to find.','Studio files and project references stay organized across every sales stage.']});
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function button(text, fn, className = 'quiet') { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', fn); return node; }
function tell(text, error = false) { message.textContent = text; message.className = error ? 'error' : ''; }
async function api(path, input) {
  if (eventRequest && path === '/api/event') return eventRequest.send(input);
  if (eventRequest?.pending && !['/api/login','/api/logout','/api/pause'].includes(path)) throw Error('Resolve the pending saved action before making another change.');
  const read=['/api/calendar/availability','/api/google-calendar-oauth/status'].includes(path);
  const response = await fetch(deskPath(path), { method: read?'GET':'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Token': csrf }, ...(read?{}:{body:JSON.stringify(input)}) });
  if (response.status === 401 && operatorAuthRequired) { showOperatorLogin(); throw Error('Sign in with your operator key to continue'); }
  const data = await response.json(); if (!response.ok){const error=Error(data.error);error.status=response.status;throw error;} return data;
}
async function uploadCallAudio(input,blob) {
  if(eventRequest?.pending)throw Error('Resolve the pending approval before saving audio.');
  const response=await fetch(deskPath('/api/call-audio'),{method:'POST',headers:{'Content-Type':blob.type,'X-Studio-Token':csrf,'X-Studio-Audio':JSON.stringify(input)},body:blob});
  if(response.status===401&&operatorAuthRequired){showOperatorLogin();throw Error('Sign in as the recording operator before retrying this exact clip.');}
  const result=await response.json();if(!response.ok)throw Error(result.error);
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()),sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(result.status!=='Stored'||result.id!==input.id||result.call_id!==input.call_id||result.kind!==input.kind||result.recorded_by!==input.recorded_by||result.bytes!==blob.size||result.sha256!==sha256)throw Error('The private audio receipt does not match this exact clip.');return result;
}
function showPendingEvent() {
  document.querySelector('#pending-event')?.remove();
  const pending = eventRequest?.pending; if (!pending) return;
  const notice = el('section', undefined, 'notice'); notice.id = 'pending-event';
  notice.append(el('p', `Pending ${pending.type} approval by ${pending.actor} · ${pending.id}. Its exact input is retained in this tab until confirmed or rejected. A second click cannot create a different action.`));
  for (const [label, action] of [['Check saved action', () => eventRequest.recover()], ['Retry exact pending approval', () => eventRequest.retry()]]) notice.append(button(label, async () => {
    try { const result = await action(); if (result === false) tell('No saved receipt is visible yet. The approval remains held; retry only the exact pending approval.'); else { await refresh(); tell('Pending action resolved. Review the refreshed record before the next change.'); } }
    catch (error) { tell(error.message, true); }
  }));
  message.after(notice);
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
      const response = await fetch(deskPath('/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Token': csrf }, body: JSON.stringify({ key: input.value }) });
      const result = await response.json(); if (!response.ok) throw Error(result.error);
      input.value = ''; await refresh();
    } catch (e) { tell(e.message, true); input.focus(); } finally { submit.disabled = false; }
  });
  node.append(form); content.replaceChildren(node); document.querySelector('#view-kicker').textContent = 'Shared company workspace';
  document.querySelector('#view-title').textContent = 'Sign in to continue.'; document.querySelector('#view-description').textContent = 'Each operator uses a separate key; the workspace records who made each decision.';
  tell(error, Boolean(error));
}
async function refresh() {
  const response = await fetch(deskPath('/api/state'));
  if (response.status === 401 && operatorAuthRequired) { showOperatorLogin(); return; }
  if (!response.ok) throw Error('Private session unavailable. Reload the console.');
  state = await readDeskSnapshot(response,{fetch:(...args)=>fetch(...args),path:deskPath('/api/state')});
  if (state.hosted_preview && !eventRequest) eventRequest = createEventRequest({fetch: (...args) => fetch(...args), storage: sessionStorage, csrf: () => csrf, actor: () => state?.current_operator, changed: showPendingEvent});
  showPendingEvent();
  document.querySelector('nav').hidden = false; document.querySelector('.aside-foot').hidden = false;
  document.querySelector('#mode-banner').hidden = false; document.querySelector('#backup').hidden = Boolean(state.shared_workspace); document.querySelector('#pause').hidden = Boolean(state.shared_workspace);
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
function link(label, href) { const node = el('a', label); if (/^https:\/\//i.test(href) || href === '/preview/' || /^\/retained-source\/[a-zA-Z0-9_-]{1,100}\/[a-f0-9]{64}\?url=[^#]+&at=[^#]+$/.test(href) || /^\/(?:proposal\/[a-zA-Z0-9_-]+|follow-up\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)$/.test(href)) { node.href = deskPath(href); node.target = '_blank'; node.rel = 'noreferrer'; } else node.removeAttribute('href'); return node; }
function summary(r) {
  const node = button('', () => { selected = r.id; render(); }, `record${selected === r.id ? ' selected' : ''}`);
  node.append(el('strong', r.name), pill(r.origin==='workspace'?'Project workspace · no outreach':r.call_lane === 'verification' ? 'Verification call only' : 'Research reviewed'), pill(r.stage), el('small', r.idea)); return node;
}
function stats() {
  const row = el('div', undefined, 'stats');
  for (const [label, value, note] of [['New businesses prepared', `${state.daily.new_researched} / ${state.daily.research_target}`, 'Shared research target · callbacks separate'], ['Call & reply reviews', Object.values(state.prospects).filter(r => ['Connected review', 'Verification review', 'Reply review'].includes(r.stage)).length, 'Held until your decision'], ['Open support', Object.values(state.prospects).flatMap(r => r.tickets).filter(t => t.status === 'Open').length, state.controls.mode === 'controlled' ? 'Fictional projects in this review' : 'Saved client requests'], ['Exceptions', state.exceptions.length + (state.reply_alerts?.length ?? 0), 'Consolidated in the private workspace']]) {
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
  node.append(el('p', ['shared-operations-records-v1','shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace?.capability)?(['shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace.capability)?'Review registered originals, versions and attributed feedback. Exact Drive reads require their independent owner-controlled grant and runtime. New registration and generic uploads remain unavailable.':'Review registered originals, versions and attributed feedback in this current workspace. New asset/version registration and original transfers are unavailable here.'):'Add a Google Drive file ID or a relative path inside private storage. This index saves references only; it does not copy, fetch or verify files. Never paste credentials or file contents.', 'notice'));
  node.append(el('p', 'Either operator can approve a version as the baseline. If you disagree with a direction, flag an alternative; the last approved baseline stays active until both operators make matching choices to resolve it.', 'muted'));
  const form = el('form'); form.append(el('h3', 'Add an asset reference'));
  const scope = inputField(form, 'Asset scope', 'scope', 'studio', 'text', [{ value: 'studio', label: 'Studio-wide' }, { value: 'project', label: 'Project' }]);
  const projects = Object.values(state.prospects).sort((a, b) => a.name.localeCompare(b.name));
  const create=el('details');create.append(el('summary','Add an existing company/project workspace'));const workspaceForm=el('form');
  workspaceForm.append(el('p','Search the existing project list first. This creates private asset context only: no contact routes, call tasks, research qualification, approved scope or client acceptance.','muted'));
  const workspaceName=inputField(workspaceForm,'Existing company name','workspace_name',state.controls.mode==='controlled'?'STUDIO TEST ':''),purpose=inputField(workspaceForm,'Project purpose','workspace_purpose');
  const saveWorkspace=el('button','Create private project workspace','primary');saveWorkspace.type='submit';workspaceForm.append(saveWorkspace);create.append(workspaceForm);if(!state.shared_workspace)node.append(create);
  workspaceForm.onsubmit=async event=>{event.preventDefault();saveWorkspace.disabled=true;try{const id=crypto.randomUUID();await api('/api/event',{revision:state.revision,event:{id:crypto.randomUUID(),prospect_id:id,type:'workspace_project_created',at:new Date().toISOString(),data:{name:workspaceName.value,purpose:purpose.value,controlled:state.controls.mode==='controlled'}}});assetProject=id;tell('Private project workspace saved. Add its source references below; no outreach or approval was created.');dirty=false;await refresh();}catch(error){tell(error.message,true);}finally{saveWorkspace.disabled=false;}};

  const context=el('section');context.append(el('h3','Continue a project'));
  const contextProject=inputField(context,'Project context','asset_project',assetProject,'text',[{value:'',label:'All studio and project assets'},...projects.map(r=>({value:r.id,label:r.name}))]);
  const assetCards=[],feedbackRows=[];
  const relevantFeedback=Object.values(state.asset_index??{}).flatMap(asset=>(asset.feedback??[]).map(f=>({asset,feedback:f})));
  context.append(el('p','Recorded directions retain their exact source version and operator. Feedback does not approve a changed file or resolve a disagreement; review it alongside the current baseline.','muted'));
  for(const {asset,feedback:f} of relevantFeedback){const row=el('section');row.append(el('p',`${asset.name} · ${asset.versions[f.version_id]?.label??f.version_id} · ${f.scope==='studio'?'Studio-wide direction':state.prospects[f.project_id]?.name??'Project'} · ${f.actor} · ${new Date(f.at).toLocaleDateString()}`,'muted'),el('blockquote',f.feedback,'quote'),el('p',f.scope_reason??'Saved scope retained; no automatic reinterpretation of earlier feedback.','muted'),el('p',asset.versions[f.version_id]?.reference??'Source reference unavailable','muted'));context.append(row);feedbackRows.push({row,feedback:f});}
  const emptyFeedback=el('p','No retained feedback for this context yet.','muted');context.append(emptyFeedback);node.append(context);
  const updateContext=()=>{for(const {card,asset} of assetCards)card.hidden=Boolean(assetProject&&asset.scope!=='studio'&&asset.project_id!==assetProject);for(const {row,feedback:f} of feedbackRows)row.hidden=Boolean(assetProject&&f.scope!=='studio'&&f.project_id!==assetProject);emptyFeedback.hidden=feedbackRows.some(({row})=>!row.hidden);};
  contextProject.onchange=()=>{assetProject=contextProject.value;updateContext();};
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
  if(!state.shared_workspace)node.append(form);
  const index = Object.values(state.asset_index ?? {});
  if (!index.length) node.append(el('p', 'No asset references yet. Add a studio file or link an asset to any existing project record.', 'empty'));
  for (const asset of index.sort((a, b) => a.name.localeCompare(b.name))) {
    const card = panel(asset.name);
    assetCards.push({card,asset});
    const projectName = asset.project_id ? state.prospects[asset.project_id]?.name ?? 'Project record unavailable' : 'Studio-wide';
    card.append(pill(asset.kind), pill(projectName));
    const baseline = asset.versions[asset.baseline_version];
    card.append(el('p', baseline ? `Approved baseline: ${baseline.label}` : 'Approved baseline: not set yet', baseline ? '' : 'muted'));
    if (asset.dispute) {
      const choiceLabel = operator => {
        const choice = asset.dispute.choices[operator];
        return choice ? asset.versions[choice.version_id]?.label ?? 'unknown version' : 'needs a current choice';
      };
      card.append(el('p', `Disagreement open · baseline stays ${baseline?.label ?? 'unset'} · owner: ${choiceLabel('owner')} · friend: ${choiceLabel('friend')}. Both current choices must match to resolve it.`, 'notice'));
    } else {
      const approval = asset.baseline_agreement_events?.length ? ' Both operators confirmed this version.' : asset.baseline_approved_by ? ` Last approved by ${asset.baseline_approved_by}.` : '';
      card.append(el('p', `An individual approval takes effect immediately.${approval} Older selections do not count as objections.`, 'muted'));
    }
    for (const version of Object.values(asset.versions).sort((a, b) => a.registered_at.localeCompare(b.registered_at))) {
      const row = el('section', undefined, 'check-item asset-version');
      row.append(el('strong', version.label), el('p', version.reference, 'muted'));
      row.append(el('small', `Added by ${version.registered_by} · ${new Date(version.registered_at).toLocaleDateString()}`));
      const currentChoices = asset.dispute ? asset.dispute.choices : asset.choices;
      const mine = currentChoices[state.current_operator]?.version_id === version.id;
      if (asset.dispute) {
        row.append(button(mine ? 'Your current resolution choice' : 'Choose to resolve disagreement', async () => { try { await saveAssetEvent('asset_version_selected', { asset_id: asset.id, version_id: version.id }); } catch (error) { tell(error.message, true); } }));
      } else if (asset.baseline_version === version.id) {
        row.append(el('small', 'Current approved baseline'));
      } else {
        row.append(button('Approve as baseline', async () => { try { await saveAssetEvent('asset_version_selected', { asset_id: asset.id, version_id: version.id }); } catch (error) { tell(error.message, true); } }));
        if (baseline) row.append(button('Flag disagreement', async () => { try { await saveAssetEvent('asset_version_disputed', { asset_id: asset.id, version_id: version.id }); } catch (error) { tell(error.message, true); } }));
      }
      card.append(row);
    }
    const feedbackForm=el('form');feedbackForm.append(el('h4','Save design feedback'));
    const feedbackVersion=inputField(feedbackForm,`Feedback version · ${asset.name}`,'version_id',asset.baseline_version??Object.keys(asset.versions).at(-1),'text',Object.values(asset.versions).map(v=>({value:v.id,label:v.label})));
    const feedbackScope=inputField(feedbackForm,`Feedback applies to · ${asset.name}`,'feedback_scope','auto','text',[{value:'auto',label:'Automatic'},{value:'project',label:'This project only'},{value:'studio',label:'Explicit studio-wide direction'}]);
    feedbackForm.append(el('p','Automatic saves current-project feedback by default. Whole sentences such as Always use "Syne" for heading font. or Never use "Manrope" for body font. create shared standards. Only quoted heading font, body font or six-digit page background rules are recognized; other wording needs author review. Choose This project to keep an Always/Never direction local.','muted'));
    const feedbackProject=inputField(feedbackForm,`Feedback project · ${asset.name}`,'feedback_project',asset.project_id??assetProject,'text',[{value:'',label:'Choose a project'},...projects.filter(r=>!asset.project_id||r.id===asset.project_id).map(r=>({value:r.id,label:r.name}))]);
    feedbackScope.onchange=()=>{feedbackProject.parentElement.hidden=feedbackScope.value==='studio';};
    const feedbackText=inputField(feedbackForm,`Operator feedback · ${asset.name}`,'feedback','','textarea');feedbackText.maxLength=2000;
    const saveFeedback=el('button','Save feedback');saveFeedback.type='submit';feedbackForm.append(saveFeedback);
    feedbackForm.onsubmit=async event=>{event.preventDefault();saveFeedback.disabled=true;try{await saveAssetEvent('asset_feedback_added',{asset_id:asset.id,version_id:feedbackVersion.value,feedback:feedbackText.value,scope:feedbackScope.value,...(feedbackScope.value!=='studio'&&feedbackProject.value?{project_id:feedbackProject.value}:{})});}catch(error){tell(error.message,true);}finally{saveFeedback.disabled=false;}};
    card.append(feedbackForm);
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
    if(!state.shared_workspace)card.append(addVersion); node.append(card);
  }
  updateContext();content.append(node);
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
  if(state.shared_workspace&&!state.shared_workspace.allowed_edits.includes(type))return el('p','Saved context · editing unavailable in this workspace','muted');
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
      line.append(el('strong', `${title}: `), document.createTextNode(proof.excerpt), document.createTextNode(' · '), link('Saved capture ↗', `/retained-source/${r.id}/${source.content_sha256}?url=${encodeURIComponent(source.url)}&at=${encodeURIComponent(source.fetched_at)}`), document.createTextNode(' · '), link('Live source ↗', proof.url), document.createTextNode(` · checked ${source.fetched_at}`)); card.append(line);
    }
    const opening=r.opening_view;
    if(opening?.selected){const c=opening.selected,source=r.verification.packet.sources.find(s=>s.url===c.source_url&&s.content_sha256===c.source_sha256);card.append(el('h4','Strongest source-backed opening'),el('blockquote',c.opening,'quote'),el('p',`Customer step / difficulty: ${c.customer_difficulty}`),el('blockquote',c.excerpt,'quote'),link('Saved capture ↗',`/retained-source/${r.id}/${c.source_sha256}?url=${encodeURIComponent(c.source_url)}&at=${encodeURIComponent(source?.fetched_at??'')}`),link('Live source ↗',c.source_url),el('p',`Possible improvement to discuss: ${c.hypothesis}`),el('p',`${opening.selected_by}: ${opening.reason}`,'muted'));
      card.append(eventForm(r,'Choose another supported opening','opening_selected',[
        ['Supported alternative','candidate_id',c.id,'text',opening.candidates.map(option=>({value:option.id,label:`${option.service}: ${option.owner_question}`}))],['Reason for your selection','reason','','textarea']
      ],{assessment_sha256:opening.assessment_sha256},'Save opening selection'));
    }else if(opening?.status==='Held')card.append(el('p',opening.reason,'notice'));
    else card.append(el('h4','Verification question'),el('blockquote',r.verification.opening,'quote'),el('p','An offering/locality check is not a strong pitch. This older verification record has not received the current focused opening assessment.','muted'));
    if(!opening)card.append(el('h4', 'Then ask'), el('p', r.verification.owner_question ?? 'What would you most like to make easier for customers or for yourself?'), el('p', 'How do customers order or enquire today? Which tools already handle this, and what works well?'), el('p', `Possible enhancement to discuss: ${r.idea}`, 'muted'));
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
    if(renderHostedAssessment(node,r,call,state,{api,refresh,tell}))return;
    node.append(el('p', 'The transcript is saved. AI analysis uses the subscription allowance and preserves the website/client reserve.', 'notice'));
    const run = button(state.workers.includes(`${r.id}:${call.call_id}`) ? 'Analysis running…' : 'Request evidence review', async () => {
      try { await api('/api/analyze', { prospect_id: r.id, call_id: call.call_id }); tell('Analysis requested. Any allowance or evidence hold will appear in Exceptions.'); setTimeout(() => refresh().catch(e => tell(e.message, true)), 2500); }
      catch (error) { tell(error.message, true); }
    }, 'primary'); run.disabled = state.workers.includes(`${r.id}:${call.call_id}`); node.append(run); return;
  }
  node.append(el('hr', undefined, 'divider'), el('h3', 'Proposed outcome'), pill(proposal.outcome), el('p', proposal.summary));
  if(proposal.review.provenance)node.append(el('p','Hosted model proposal with a separate fresh-context model review. Check every quoted claim and uncertainty before confirming the outcome.','notice'));
  if (proposal.review.source) node.append(el('p', 'Simulated AI assessment/review for this design exercise. A live Luna/Sol run has not passed.', 'notice'));
  for (const claim of proposal.claims) node.append(el('p', claim.claim), el('blockquote', claim.quote, 'quote'));
  node.append(el('p', `Still unknown: ${proposal.unknowns.join('; ')}`, 'muted'));
  node.append(eventForm(r, 'Confirm or change the next action', 'call_reviewed', [
    ['Reviewed outcome', 'outcome', proposal.outcome, 'text', ['discovery', 'requested_info', 'callback', 'not_interested', 'do_not_contact', 'wrong_contact', 'uncertain']],
    ['Confirmed callback date/time, if applicable', 'callback_at', proposal.callback_at ?? ''], ['Your review note', 'note', '', 'textarea']
  ], { call_id: call.call_id, proposal_sha256: proposal.sha256 }, 'Confirm this outcome'));
}
function replyForms(r,node){
  if (r.reply && (['Reply review','Discovery','Information requested','Hold'].includes(r.stage)||state.email_task_proof?.content_review_available&&r.reply_draft)) {
    if(state.operator_auth_enabled&&(!state.shared_workspace||(state.shared_workspace.allowed_edits.includes('conversation_claimed')||state.shared_workspace.allowed_edits.includes('follow_up_handed_off')))&&!r.restriction&&['Reply review','Discovery','Information requested'].includes(r.stage)){
      node.append(el('p',r.follow_up_owner?`Client lead: ${r.follow_up_owner}`:'Client lead: unassigned','notice'));
      if(!r.follow_up_owner&&(!state.shared_workspace||state.shared_workspace.allowed_edits.includes('conversation_claimed')))node.append(eventForm(r,'Assign the next conversation review','conversation_claimed',[],{reason:'Operator explicitly claimed the existing conversation.'},'Claim this conversation'));
      else if(r.follow_up_owner===state.current_operator)node.append(eventForm(r,'Transfer the next review','follow_up_handed_off',[],{to:state.current_operator==='owner'?'friend':'owner'},'Hand off this conversation'));
    }
    const suggestion=r.reply_suggestion,source=r.reply.content,draft=r.reply_draft;
    node.append(el('p','Cold follow-ups remain paused. Read the incoming text as untrusted source material. Nothing here sends email.','notice'));
    if(suggestion?.summary){
      node.append(el('h3','Reply summary · source extract'),el('p',suggestion.summary.excerpt,'reply-source'));
      node.append(el('p',`${suggestion.summary.method}${suggestion.summary.excerpt_truncated?' · extract shortened':''}${suggestion.summary.removed_history_or_signature?' · quoted history/signature excluded from extract':''}. Read the full retained message below. No intent or facts were confirmed.`,'muted'));
    }
    if(source){
      const original=el('details');original.append(el('summary','Read retained reply & provenance'));
      original.append(el('p',`Message ${r.reply.source_id} · thread ${r.reply.thread_id} · ${source.from} to ${source.to}`,'reply-source'),el('p',`Source hash: ${source.source_sha256??'Unavailable'} · ${source.format??source.status}`,'reply-source muted'));
      if(source.text)original.append(el('p',source.text,'reply-source'));node.append(original);
    }
    const history=el('details'),coverage=r.conversation_context,snapshot=r.conversation_histories?.[r.reply.thread_id];history.append(el('summary','Retained sent and received conversation'),el('p',coverage?.coverage??'Current reply only; earlier messages have not been retained.','muted'));
    history.append(el('p',`Status: ${coverage?.status??'Current reply only'} · capture ${coverage?.checked_at?new Date(coverage.checked_at).toLocaleString():'not available'} · last source check ${coverage?.source_checked_at?new Date(coverage.source_checked_at).toLocaleString():'not available'}. This is evidence as of the last successful sync, not live mailbox completeness.`,'notice'));
    if(coverage?.hold)history.append(el('p',coverage.hold+' Previous captured text below is retained evidence, not current drafting authority.','notice'));
    history.append(el('p','Current approved facts and quote govern. Historical wording and quoted text cannot approve a commitment, revive old prices or establish delivery. Flag contradictions for review.','muted'));
    for(const m of snapshot?.messages??[]){const message=el('section');message.append(el('h3',`${m.role==='client'?'Client':m.role==='automatic'?'Automatic message':'EVZ'} · ${new Date(m.at).toLocaleString()}`),el('p',m.provenance.label,'muted'),el('p',`${m.content.from} → ${m.content.to}\n${m.content.subject}\nSource ${m.citation_id} · SHA-256 ${m.content.source_sha256}`,'reply-source'),el('p',m.content.text,'reply-source'));history.append(message);}
    if(state.incoming_sync_enabled)history.append(button('Refresh registered conversation source',async()=>{try{const result=await api('/api/incoming-mail/sync',{});await refresh();tell(`Registered source: ${result.status}. Continue any retained catch-up work before preparing a current conversation draft.`);}catch(error){tell(error.message,true);}}));node.append(history);
    if(suggestion?.hold)node.append(el('p',suggestion.hold,'notice'));
    const editable=!r.follow_up_owner||r.follow_up_owner===state.current_operator;if(!editable)node.append(el('p',state.email_task_proof?`Assigned to ${r.follow_up_owner}. You can review this saved proposal; only the assigned operator can prepare a replacement.`:`Assigned to ${r.follow_up_owner}. Use the existing conversation handoff before editing or approving.`, 'notice'));
    if(state.email_task_proof&&state.operator_auth_enabled&&r.controlled&&(r.follow_up_owner===state.current_operator||r.email_draft_task_id))renderEmailDraftTask(r,node);
    if(state.email_task_proof?.content_review_available&&draft&&(!editable||!['Reply review','Discovery','Information requested'].includes(r.stage))){node.append(el('h3','Saved exact reply'),el('p',`${draft.status} · ${draft.current?'Current bundle':'Stale or held; fresh review is required'}`,'notice'));renderSavedReplyBundle(r,draft,node);}
    if((!state.email_task_proof||state.email_task_proof.content_review_available&&draft)&&editable&&(suggestion?.body||state.email_task_proof?.content_review_available&&draft)&&['Reply review','Discovery','Information requested'].includes(r.stage)){
      if(!state.shared_workspace&&state.operator_auth_enabled&&r.controlled&&r.follow_up_owner===state.current_operator)renderEmailDraftTask(r,node);
      node.append(el('p',draft?.content.agent_origin?'Saved reply based on the agent proposal. Review the current wording, source and PDFs before approval.':draft?'Saved reply. Review the current wording and exact source before approval.':suggestion.method,'muted'));
      const current=draft?.current,editor=eventForm(r,draft?'Edit saved reply':'Edit a suggested response','reply_draft_saved',[
        ['Proposed reply (saved only; not sent)','body',draft?draft.body:suggestion.body,'textarea']
      ],{source_id:r.reply.source_id,reply_sha256:r.reply_sha256,source_sha256:source.source_sha256},current?'Save revised reply draft':'Save reply draft');
      editor.classList.add('reply-editor');
      node.append(editor);
      if((!state.shared_workspace||state.email_task_proof?.content_review_available)&&draft?.content.attachments?.length)node.append(eventForm(r,'Remove PDFs and keep the saved wording','reply_draft_saved',[],{source_id:r.reply.source_id,reply_sha256:r.reply_sha256,source_sha256:source.source_sha256,body:draft.body,attachments:[]},'Remove all reply attachments'));
      if(current){
        const review=el('div');review.append(el('h3','Review exact saved reply'),el('p',`${draft.status} · prepared by ${draft.actor}. Approval does not send.`,'notice'));
        renderSavedReplyBundle(r,draft,review);
        if(draft.status==='Draft')review.append(eventForm(r,'Approve this held revision','reply_draft_approved',[
          ['I checked every statement against the source and corrected unsupported facts, prices, dates, promises and attachments','facts_checked',false,'checkbox'],
          ['I reviewed the exact recipient, thread, body and signature above','approved',false,'checkbox']
        ],{sha256:draft.sha256},'Approve exact reply · keep sending held'));
        else review.append(el('p',`Approved by ${draft.approved_by}. ${state.email_task_proof?.composed_mail?'Exact send approval is a separate step below.':'Sending remains held; use a separately authorized exact-message handoff.'}`,'muted'));
        if(state.email_task_proof?.composed_mail)review.append(exactReplyMailPanel(r));
        editor.addEventListener('input',()=>{review.hidden=true;});node.append(review);
      }else if(draft)node.append(el('p','The old draft is stale. Save and review a new revision for the current reply and assignment.','notice'));
    }
  }
  if(state.email_task_proof?.composed_mail&&r.reply_draft&&(!r.reply_draft.current||r.follow_up_owner!==state.current_operator))node.append(exactReplyMailPanel(r));
  if (!state.email_task_proof&&(!state.shared_workspace?.mail||!r.follow_up_owner||r.follow_up_owner===state.current_operator)&&(r.stage === 'Reply review'||r.reply&&['Discovery','Information requested'].includes(r.stage)&&r.reply_review&&(!r.reply_review.focus||r.reply_review.focus==='unspecified'||r.reply_review.reply_sha256!==r.reply_sha256))) {
    if(r.stage!=='Reply review')node.append(el('p','Confirm which service the business wants before preparing project work.','notice'));
    node.append(eventForm(r, 'Review the verified reply', 'reply_reviewed', [
    ['Next action', 'outcome', r.stage==='Reply review'?'hold':r.reply_review.outcome, 'text', ['discovery', 'requested_info', 'hold', 'decline', 'do_not_contact']],
    ['Service confirmed in this reply', 'focus', 'unspecified', 'text', [{value:'unspecified',label:'Not confirmed — ask which service'}, {value:'website',label:'Website'}, {value:'systems',label:'Systems'}, {value:'ai',label:'AI'}, {value:'marketing',label:'Marketing'}]],
    ['Your reply review note', 'note', r.stage==='Reply review'?'':r.reply_review.note??'', 'textarea']
  ], { source_id: r.reply.source_id, reply_sha256:r.reply_sha256 }, 'Confirm reply outcome'));}
}
function exactReplyMailPanel(r){
 const section=el('section'),draft=r.reply_draft,mail=state.shared_workspace.mail,assigned=r.follow_up_owner===state.current_operator,actions=Object.values(state.actions).filter(a=>a.prospect_id===r.id&&a.payload?.exact_mail&&a.payload.selector?.kind==='reply');
 section.append(el('h3','Separate exact reply send approval'),el('p','Content approval does not authorize sending. Review the complete recipient, thread, message and PDFs again. Sender verification does not establish recipient delivery.','notice'));
 if(assigned&&draft?.current&&draft.status==='Approved; sending held'&&!actions.some(a=>a.payload.package?.source?.draft_sha256===draft.sha256)){
  const packageView=el('div');section.append(button('Load exact reply send package',async()=>{packageView.dataset.exactReplyReview='active';try{const p=await api('/api/exact-mail/package',{project_id:r.id,kind:'reply'});packageView.replaceChildren(el('p',`${p.from} to ${p.to}\nSubject: ${p.subject}\nThread: ${p.thread_id}\n\n${p.body}`,'reply-source'),el('p',`Package SHA-256 ${p.sha256}`,'source'));for(const a of p.attachments)packageView.append(el('p',`PDF ${a.name} · ${a.bytes} bytes · ${a.sha256}`,'source'));
   if(assigned){const checks=['I checked the complete recipient, thread, body, facts and original PDF bytes','I authorize this exact message separately from content approval'].map(text=>{const label=el('label'),input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(text));packageView.append(label);return input;}),approve=button('Approve exact reply for one send',async()=>{try{await api('/api/exact-mail/approve',{project_id:r.id,kind:'reply',revision:state.revision,event_id:crypto.randomUUID(),package_sha256:p.sha256,approved:true,facts_checked:true});await refresh();tell('Exact send approved. No message has been sent.');}catch(error){delete packageView.dataset.exactReplyReview;packageView.replaceChildren();await refresh();tell(error.message,true);}});approve.disabled=true;for(const check of checks)check.addEventListener('change',()=>{approve.disabled=!checks.every(c=>c.checked);});packageView.append(approve);}
   packageView.append(button('Close send package review and refresh',async()=>{try{delete packageView.dataset.exactReplyReview;await refresh();}catch(error){tell(error.message,true);}}));
  }catch(error){delete packageView.dataset.exactReplyReview;tell(error.message,true);}}),packageView);
 }
 for(const a of actions){const status=state.operations?.email?.[a.id]?.status,owned=a.assigned_to===state.current_operator;section.append(el('p',`Exact reply ${a.id} · ${status??a.status}. ${a.delivery?`Sender receipt ${a.delivery.message_id} · MIME ${a.delivery.mime_sha256}`:'No verified sender receipt.'}`,'notice'));
  if(owned&&!status&&draft?.current&&a.payload.package.source.draft_sha256===draft.sha256&&!r.restriction){const send=button('Send approved reply once',async()=>{try{const result=await api('/api/exact-mail/dispatch',{action_id:a.id});await refresh();tell(`Sender ${result.status}. Reconcile the original intent; never send again after uncertainty.`);}catch(error){tell(error.message,true);}});send.disabled=!mail.runtime_enabled;section.append(send);}
  if(owned&&status&&status!=='Verified'){const reconcile=button('Reconcile original reply Sent receipt',async()=>{try{const result=await api('/api/exact-mail/reconcile',{action_id:a.id});await refresh();tell(`Original intent: ${result.status}.`);}catch(error){tell(error.message,true);}});reconcile.disabled=!mail.runtime_enabled;section.append(reconcile);}
 }
 return section;
}
function renderSavedReplyBundle(r,draft,node){
 node.append(el('p',`${draft.content.from} to ${draft.content.to}\nSubject: ${draft.content.subject}\nThread: ${draft.content.thread_id} · in reply to ${draft.content.in_reply_to}\n\n${draft.content.body}\n\n${draft.content.signature}`,'reply-source'));
 const origin=draft.content.agent_origin;if(origin)node.append(el('p',`Proposal origin sources: ${origin.source_ids.join(', ')}. The saved wording may include operator edits.`,'muted'),el('p',`Original proposal uncertainties: ${origin.uncertainties.join('; ')||'None reported; verify every claim.'}`,'notice'));
 for(const a of draft.content.attachments??[]){const row=el('section'),path=`/api/project-asset/${r.id}/${a.asset_id}/${a.version_id}`,preview=el('a','Preview exact PDF'),download=el('a','Download exact PDF');preview.href=deskPath(path+'?preview=1');download.href=deskPath(path);for(const link of [preview,download]){link.target='_blank';link.rel='noreferrer';}row.append(el('p',`${a.name} · ${a.version_label} · ${a.bytes} bytes\nSHA-256 ${a.sha256}`,'reply-source'),preview,el('span',' · '),download);node.append(row);}
}
function renderEmailDraftTask(r,node){
 const shared=Boolean(state.email_task_proof),review=Boolean(state.email_task_proof?.adoption_available),panel=el('section'),task=state.email_draft_tasks?.[r.email_draft_task_id];panel.append(el('h3',shared?'Fictional shared draft proposal':'Local agent draft preparation'),el('p',shared?(review?'Adopt the exact proposal as an unapproved reply, then review its wording, sources and PDFs separately. '+(state.email_task_proof?.composed_mail?'Exact send approval and its independent mail runtime remain separate.':'Sending remains unavailable.'):'Prepare a sourced proposal with approved PDFs up to 512,000 bytes each. Results persist in this shared proof. Adoption, email approval and sending are unavailable. This desk does not start a worker.'):'Prepare a reply with an authorized local worker and optionally select approved PDFs. This desk does not start a worker; cloud execution is not connected.','muted'));
 const permitted=[];for(const asset of Object.values(state.asset_index??{}).filter(a=>a.scope==='studio'&&a.baseline_version&&(a.baseline_approval_event||a.baseline_agreement_events?.length===2)&&!a.dispute)){const v=asset.versions[asset.baseline_version],o=v?.verified_original;if(o?.mime_type!=='application/pdf'||!Number.isSafeInteger(o.bytes)||o.bytes>(shared?512000:20000000))continue;const input=inputField(panel,`Permit studio PDF for this task: ${asset.name} · ${v.label} · ${o.bytes} bytes`,'studio-'+asset.id,false,'checkbox');permitted.push({id:asset.id,input});}
 if((!shared||r.follow_up_owner===state.current_operator)&&!r.restriction)panel.append(button(task?(shared?'Prepare replacement shared task':'Prepare replacement local agent task'):(shared?'Prepare fictional shared draft task':'Prepare local agent draft task'),async()=>{try{
  let handoff=emailTaskHandoffs.get(r.id);if(!handoff||handoff.saved){const bytes=crypto.getRandomValues(new Uint8Array(32));handoff={id:crypto.randomUUID(),project_id:r.id,revision:state.revision,token:[...bytes].map(n=>n.toString(16).padStart(2,'0')).join(''),replace_task_id:r.email_draft_task_id??null,studio_asset_ids:permitted.filter(p=>p.input.checked).map(p=>p.id)};emailTaskHandoffs.set(r.id,handoff);}
  await api('/api/email-draft-tasks/create',{id:handoff.id,project_id:handoff.project_id,revision:handoff.revision,token:handoff.token,replace_task_id:handoff.replace_task_id,studio_asset_ids:handoff.studio_asset_ids});handoff.saved=true;await refresh();tell('Draft task prepared. Give its task-specific handoff only to the authorized worker.');
 }catch(e){if(e.status===400)emailTaskHandoffs.delete(r.id);tell(e.message,true);}}));
 const h=emailTaskHandoffs.get(r.id);if(h&&h.id===task?.id&&task.status==='Ready'){const details=el('details');details.append(el('summary','Reveal private worker handoff'),el('p','This credential permits only this task’s context/result routes for two hours. Keep it out of the returned draft, context files and logs.','notice'),el('pre',`GET ${location.origin}${deskPath('/api/email-draft-task/'+h.id+'/context')}\nPOST ${location.origin}${deskPath('/api/email-draft-task/'+h.id+'/result')}\n${shared?'MCP '+location.origin+'/desk-email-task/'+h.id+'/mcp\n':''}Authorization: Bearer ${h.token}\nContent-Type: application/json`));panel.append(details);}
 for(const a of task?.result?.attachments??[]){const asset=state.asset_index?.[a.asset_id],v=asset?.versions?.[a.version_id];panel.append(el('p',`Proposed PDF: ${asset?.name??a.asset_id} · ${v?.label??a.version_id}\nSHA-256 ${a.sha256}`,'reply-source'));}
 if(task){panel.append(el('p',`${task.status} · requested by ${task.created_by} · expires ${new Date(task.expires_at).toLocaleString()}`,'muted'));if(task.result){panel.append(el('p',task.result.body,'reply-source'),el('p',`Sources: ${task.result.source_ids.join(', ')}`),el('p',`Uncertainties: ${task.result.uncertainties.join('; ')||'None reported; verify every claim.'}`),el('p',`Prepared by ${task.result.execution.provider} / ${task.result.execution.model} · ${task.result.execution.duration_ms} ms. Proposal only.`,'muted'));if(shared)panel.append(el('p',review?'Saved shared proposal. Adoption does not approve content or send email.':'Saved shared proposal. Adoption and all approval/sending controls remain unavailable.','notice'));if((!shared||review&&r.follow_up_owner===state.current_operator)&&task.status==='Review')panel.append(button('Adopt agent proposal as unapproved draft',async()=>{try{await api('/api/email-draft-tasks/adopt',{id:task.id,revision:state.revision,result_sha256:task.result_sha256});emailTaskHandoffs.delete(r.id);await refresh();tell('Agent proposal adopted. Review and approve the exact saved reply separately. Nothing was sent.');}catch(e){tell(e.message,true);}}));}}
 node.append(panel);
}
function personalWritingStyle(){
 const node=el('details');node.append(el('summary','My email writing style'));const actor=state.current_operator,current=state.operator_writing_styles?.[actor],form=el('form');form.append(el('p','These personal preferences guide new draft preparation. The sender stays EVZ Digital Team. Existing reviewed wording is retained. Use fictional examples without client information or credentials.','muted'));
 const preferences=inputField(form,'My writing preferences','preferences',current?.preferences??'','textarea'),example=inputField(form,'One optional fictional writing example','example',current?.examples?.[0]??'','textarea'),reason=inputField(form,'Reason for this style update','reason','','text');preferences.maxLength=2000;example.maxLength=1000;reason.maxLength=500;
 const submit=el('button','Save my writing style','primary');submit.type='submit';form.append(submit);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await api('/api/event',{revision:state.revision,event:{id:crypto.randomUUID(),prospect_id:'operator-'+actor,type:'operator_writing_style_saved',at:new Date().toISOString(),data:{role:actor,preferences:preferences.value,examples:example.value.trim()?[example.value]:[],reason:reason.value,expected_style_sha256:current?.sha256??null}}});await refresh();tell('Personal writing style saved. Existing approved wording was retained.');}catch(error){tell(error.message,true);}finally{submit.disabled=false;}};node.append(form);return node;
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
  replyForms(r,node);
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
  if(state.email_task_proof){const node=panel(r.name);node.append(el('p',`${r.stage} · ${state.email_task_proof.content_review_available?(state.email_task_proof.composed_mail?'shared task, draft review and separate exact-mail approval. Both operators can inspect the bundle and sender receipt.':'shared draft adoption and exact content review. Both operators can inspect the saved bundle; sending remains unavailable.'):'fictional shared task proposals only. Both operators can inspect saved results; adoption, approvals and sending are unavailable.'}`,'notice'));replyForms(r,node);return node;}
  if(state.shared_workspace?.capability==='shared-known-identity-research-v1'){const node=panel(r.name);node.append(el('p',state.shared_workspace.execution));const link=el('a','Open known business source review');link.href=deskPath('/known-research/');node.append(link);return node;}
  if(state.shared_workspace){const node=panel(r.name);node.append(el('p',`${r.stage} · saved record · ${['shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace.capability)?'interactive authoring; delivery held':state.shared_workspace.capability==='shared-refinement-generation-v1'?state.shared_workspace.execution:'execution disabled'}`),eventForm(r,'Private business note','note_added',[['Private note','note',r.note??'','textarea']],{},'Save private note'));if(state.shared_workspace.mail){node.append(el('p',`${state.shared_workspace.mail.status}. Reply content and facts approval remains separate from exact send approval.`, 'notice'));replyForms(r,node);}if(['shared-project-continuation-v1','shared-refinement-generation-v1','shared-operations-records-v1','shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace.capability))node.append(preparationPanel(r,state,{el,button,eventForm,tell,api,refresh,csrf:()=>csrf,clearDirty:()=>{dirty=false;}}));return node;}
  if(r.origin==='workspace'){
    const node=panel(r.name);node.append(pill('Project workspace · no outreach'),el('p',r.workspace.purpose),el('p',`Created by ${r.workspace.created_by}. Private references and notes do not establish a design selection, approved quote, client acceptance or contact permission.`,'notice'));
    const packet=el('div');if(loadedWorkspaceContext?.id===r.id&&loadedWorkspaceContext.revision===state.revision)packet.append(el('pre',JSON.stringify(loadedWorkspaceContext.data,null,2)));node.append(button('Load private project context',async()=>{try{const response=await fetch(deskPath(`/api/project-context/${r.id}`)),data=await response.json();if(!response.ok)throw Error(data.error);loadedWorkspaceContext={id:r.id,revision:state.revision,data};packet.replaceChildren(el('pre',JSON.stringify(data,null,2)));}catch(error){tell(error.message,true);}}),packet,eventForm(r,'Private project note','note_added',[['Project note','note',r.note??'','textarea']],{},'Save project note'));return node;
  }
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
  if(Object.keys(r.project_work??{}).length||['Discovery','Information requested','Preview','Proposal','Agreement'].includes(r.stage))node.append(preparationPanel(r,state,{el,button,eventForm,tell,api,refresh,csrf:()=>csrf,clearDirty:()=>{dirty=false;}}));
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
  if(state.shared_workspace)document.querySelector('#mode-banner').textContent=['shared-refinement-generation-v1','shared-known-identity-research-v1'].includes(state.shared_workspace.capability)?`Shared projects · ${state.shared_workspace.execution}`:state.shared_workspace.capability==='shared-project-continuation-v1'?'Shared projects; Save attributed design feedback, inspect current context and request one protected refinement. Interactive PDF authoring stays held for review. External execution is disabled.':state.shared_workspace.capability==='shared-manual-records-v1'?'Shared manual records · Execution disabled. Attest completed human calls, record callbacks, hand off ownership, add notes and stop local future work. This does not authorize placing calls or sending email. External suppression is unverified.':'Shared workspace · Execution disabled. Read saved records and edit private notes. Imported actions, approvals and monitoring are history; external effects require reconciliation. Hosted authoring and backup are unavailable.';
  if(['shared-refinement-generation-v1','shared-known-identity-research-v1'].includes(state.shared_workspace?.capability))document.querySelector('#workspace-status').textContent=`EVZ Digital · Private shared workspace · ${state.shared_workspace.execution}`;
  if(state.email_task_proof){document.querySelector('#mode-banner').textContent=state.email_task_proof.content_review_available?'Fictional shared draft review. The assigned operator adopts an unapproved proposal, then separately reviews exact content and PDFs. Both operators can inspect.':'Fictional shared task proposals only. Both operators can review saved results. Adoption, approvals and sending are unavailable; this desk does not start a worker.';document.querySelector('#workspace-status').textContent='EVZ Digital · Fictional shared draft proof';}
  document.querySelector('#research-status').textContent = discovery ? `Discovery ${discovery.status.toLowerCase()} · ${discovery.reviewed}/25 checked` : `${state.controls.research_paused ? 'Research paused' : 'Research enabled'}${state.research_runtime ? ` · ${state.research_runtime.status}${state.research_runtime.counts ? ` · ${state.research_runtime.counts.Complete} reviewed` : ''}` : ''}`;
  document.querySelector('#outreach-status').textContent = state.controls.calls_paused ? 'Outreach paused' : state.controls.outreach_paused ? 'Calls only · email paused' : 'Outreach enabled';
  if(state.shared_workspace?.capability==='shared-known-identity-research-v1'){document.querySelector('#research-status').textContent=`Known-identity ${state.shared_workspace.research.policy} · Runtime ${state.shared_workspace.research.runtime}`;const link=el('a','Open known business source review');link.href=deskPath('/known-research/');document.querySelector('#mode-banner').append(link);}
  if(['shared-internal-dispatch-v1','shared-manual-internal-dispatch-v1','shared-operations-records-v1','shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace?.capability)){
    const authoring=['shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace.capability),records=['shared-operations-records-v1','shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace.capability),manual=records||state.shared_workspace.capability==='shared-manual-internal-dispatch-v1',standing=state.shared_workspace.standing,banner=document.querySelector('#mode-banner');banner.replaceChildren(el('p',`Shared ${state.shared_workspace.calendar?'operations · Calendar and internal dispatch':state.shared_workspace.generation?'operations refinement · internal dispatch':authoring?'operations authoring':records?'operations records':manual?'manual records and internal dispatch':'internal dispatch'} · ${standing.status}. Sender verification does not establish inbox delivery.`),el('p','Standing owner policy for registered incoming monitoring and internal attention/team summaries. Each-message approval remains a separate capability. Both operators can inspect and pause this policy.'));
    if(state.shared_workspace.mail){const mail=state.shared_workspace.mail;banner.append(el('p',`Exact mail: ${mail.status}. Each message needs its separate exact signed approval and independent Gmail grant/runtime. Source-bound PDF incoming permission is separate from sender proof and coverage.`, 'notice'),el('p',mail.execution_hold??mail.pdf_hold??(mail.pdf_incoming?`PDF incoming ${mail.pdf_incoming.status}; inspect retained coverage and any hold.`:'One selected existing PDF companion; earlier owner permission and exact message approval are both required.'),'notice'));banner.append(button('Check exact reply connection',async()=>{try{const connection=await api('/api/operations-exact-mail-oauth/status');tell(`Exact reply connection: ${connection.status}. ${mail.incoming_permission?'The one PDF permission and incoming coverage remain separate from this connection.':'New PDF conversations remain held.'}`);}catch(error){tell(error.message,true);}}));if(mail.consent_enabled&&state.current_operator==='owner')banner.append(button('Connect exact reply Gmail',async()=>{try{const connection=await api('/api/operations-exact-mail-oauth/start',{});location.assign(connection.authorization_url);}catch(error){tell(error.message,true);}}));}
    if(state.shared_workspace.calendar){const calendar=state.shared_workspace.calendar;banner.append(el('p',`Calendar policy ${calendar.policy} · runtime ${calendar.runtime_enabled?'enabled':'disabled'} · owner consent controls ${calendar.consent_enabled?'enabled':'disabled'} · ${calendar.account}. Each invitation needs its exact signed guest and time confirmation. Event verification, invitation delivery and guest response are separate. Calendar, Drive, generation and internal dispatch controls are independent.`,'notice'));banner.append(button('Check Calendar connection',async()=>{try{const connection=await api('/api/google-calendar-oauth/status');tell(`Calendar connection: ${connection.status}. Invitation delivery remains unverified.`);}catch(error){tell(error.message,true);}}));if(calendar.consent_enabled&&state.current_operator==='owner')banner.append(button('Connect business Calendar',async()=>{try{const connection=await api('/api/google-calendar-oauth/start',{});location.assign(connection.authorization_url);}catch(error){tell(error.message,true);}}));}
    if(state.shared_workspace.originals){const originals=state.shared_workspace.originals;banner.append(el('p',`Retained originals: Drive runtime ${originals.runtime_enabled?'enabled':'disabled'}; owner consent controls ${originals.consent_enabled?'enabled':'disabled'}. A separate exact read-only grant is required. Drive reads, refinement generation and internal standing-policy controls are independent. Both operators retain original access after fresh context.`, 'notice'));}
    if(manual)banner.append(el('p','Record completed human call attestations, callbacks, handoffs, private notes and local stops even while background dispatch is paused. External suppression is unverified.'+(records?' Save attributed feedback, design choices and protected preparation requests with equal owner/friend design authority.'+(authoring?' Interactive Node authoring: '+(state.shared_workspace.authoring.runtime?'enabled':'disabled')+'. Output requires actual PDF raster review; delivery remains held.':' Authoring and delivery remain held.'):' Project design work requires its separate capability.')));
    document.querySelector('#workspace-status').textContent=`EVZ Digital · Private shared workspace · ${standing.status}`;document.querySelector('#research-status').textContent='Research disabled';document.querySelector('#outreach-status').textContent='Prospect outreach disabled';
    const details=el('details');details.append(el('summary','Review exact policy, recipients, limits and saved tick status'));const bytes=el('pre',JSON.stringify(standing,null,2));bytes.style.whiteSpace='pre-wrap';bytes.style.overflowWrap='anywhere';details.append(bytes);banner.append(details);
    if(standing.authorization_event)banner.append(button('Pause internal dispatch',async()=>{try{await api('/api/internal-dispatch/pause',{revision:state.revision,event_id:'dispatch-pause-'+crypto.randomUUID()});await refresh();tell('Standing policy paused. Already-started requests may finish; uncertain intents cannot resend.');}catch(error){tell(error.message,true);}}));
    if(state.shared_workspace.generation){const generation=state.shared_workspace.generation;banner.append(el('p',state.shared_workspace.execution,'notice'));document.querySelector('#workspace-status').textContent=`EVZ Digital · Internal ${standing.status} · Generation ${generation.policy} · Inference runtime ${generation.runtime}`;if(['Authorized','Expired','Held: binding changed'].includes(generation.policy))banner.append(button('Pause refinement generation',async()=>{try{await api('/api/project-author/generation-pause',{policy_sha256:state.shared_workspace.generation.policy_sha256});await refresh();tell('Generation paused. Already-started requests may finish; retained evidence grants no new publication.');}catch(error){tell(error.message,true);}}));}
    if(standing.ticks.some(t=>['Reserved','Claimed'].includes(t.status)))banner.append(button('Close incomplete dispatch for recovery',async()=>{try{await api('/api/internal-dispatch/reconcile',{revision:state.revision,event_id:'dispatch-recover-'+crypto.randomUUID(),observed_sha256:standing.observed_sha256});await refresh();tell('Exact observed dispatch retained for recovery. This does not assert process exit or permit replay.');}catch(error){tell(error.message,true);}}));
  }
  if(state.shared_workspace){const views=[...(state.shared_workspace.capability==='shared-internal-dispatch-v1'?[]:['today']),'businesses','emails','clients','exceptions',...(state.shared_workspace.calendar?['meetings']:[]),...(state.shared_workspace.mail?['reviews']:[]),...(['shared-project-continuation-v1','shared-refinement-generation-v1','shared-operations-records-v1','shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace.capability)?['assets']:[])];for(const button of document.querySelectorAll('nav button'))button.hidden=!views.includes(button.dataset.view);document.querySelector('.aside-foot').hidden=true;if(!views.includes(view))view='businesses';}
  content.replaceChildren(); const title = titles[view]; document.querySelector('#view-kicker').textContent = title[0]; document.querySelector('#view-title').textContent = title[1]; document.querySelector('#view-description').textContent = title[2];
  if(['reviews','emails'].includes(view)&&state.operator_auth_enabled&&(!state.shared_workspace||state.shared_workspace.allowed_edits.includes('operator_writing_style_saved')))content.append(personalWritingStyle());
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
    const standingInternal=['shared-internal-dispatch-v1','shared-manual-internal-dispatch-v1','shared-operations-records-v1','shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace?.capability);const notices=el('section');notices.append(el('h3','Owner alerts and team summary'),el('p',standingInternal?'Current attention items and weekday 9am Eastern summaries use only the exact finite standing policy shown above. Read each retained intent; sender verification does not establish inbox delivery.':'Verified attention items prepare private messages for the responsible operator. The team summary becomes due at 9am Eastern on weekdays. External delivery is held until recipients and a supported channel are verified.','notice'));
    if(!standingInternal)notices.append(button('Check due alerts and team summary',async()=>{try{await api('/api/team-notifications/prepare',{});await refresh();tell('Preparation checked. No external notification was sent.');}catch(error){tell(error.message,true);}}));
    const preparation=state.notification_preparation;
    if(preparation?.hold)notices.append(el('p',preparation.hold,'notice'));
    for(const notice of preparation?.messages??[]){const entry=el('details');entry.append(el('summary',`${notice.recipient_role} · ${notice.subject} · ${notice.status}`),el('p',`Due ${new Date(notice.due_at).toLocaleString('en-US',{timeZone:'America/New_York'})} Eastern${notice.late_minutes?`; prepared ${notice.late_minutes} minutes late`:''}`,'muted'),el('p',`Prepared/as of ${new Date(notice.prepared_at).toLocaleString('en-US',{timeZone:'America/New_York'})} Eastern${notice.kind==='digest'?'; immutable daily snapshot, later changes are not backfilled':''}`,'muted'),el('pre',notice.body),el('p',notice.delivery_hold,'muted'));notices.append(entry);}
    if(!preparation?.messages?.length)notices.append(el('p','No notification messages prepared yet.','empty'));
    node.append(notices,el('p',standingInternal?'Bounded ticks and pending digests stay visible in policy status. Exhausted limits never grant extra sends or backfill.':'Routine checks stay in private logs. The earlier test monitor stays paused; no external delivery is enabled by these prepared messages.','muted'));content.append(node);return;
  }
  if (view === 'launch') {
    if(state.hosted_preview&&!state.shared_workspace)content.append(gatewayProofPanel(state,{el,button,api,tell,refresh,clearDirty:()=>{dirty=false;}}));
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
    const checks = { owner_design_approved: ['Your final design approval', 'Review this console, operating rules and controlled proof.'], business_sender_verified: ['Business sender ready', 'Workspace access, mailbox receipt/send-as and domain authentication checked.'], native_automation_verified: ['Apollo automatic handoff', 'Approved templates, exact intent lists, native workflow triggers and stop rules tested.'], delivery_and_stop_verified: ['Controlled delivery and cancellation', 'One approved owner-only rehearsal of the final native sending route; no blind retries.'], website_inquiry_verified: ['Website and inquiry route', 'Published studio and reachable inquiry destination verified.'], prospect_supply_verified: ['Reviewed local-business prospect supply', 'Resume research only when authorized; keep the shared 25-new-business target honest when strong evidence is missing.'], capacity_verified: ['Subscription and operating capacity', 'Live Luna/high + Sol/high compatibility, allowance, source review and upkeep measured.'] };
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
  if (['today','businesses'].includes(view)&&!state.email_task_proof) { renderCallDesk(content,state,{api,refresh,tell,evidence:callPrep,clearDirty:()=>{dirty=false;},uploadAudio:uploadCallAudio,allBusinesses:view==='businesses'}); return; }
  if (view === 'today') content.append(stats(), el('p', `Prepared due call cards: ${state.daily.prepared.research} research-reviewed · ${state.daily.prepared.verification} verification only. These are prepared records, not calls made or accepted detailed assessments.`, 'notice'));
  const grid = el('div', undefined, 'grid'), records = Object.values(state.prospects).filter(r => view === 'reviews' ? ['Connected review', 'Verification review', 'Reply review'].includes(r.stage)||state.shared_workspace?.mail&&r.reply&&['Discovery','Information requested','Hold'].includes(r.stage) : view === 'clients' ? r.origin==='workspace' || Object.keys(r.project_work??{}).length || r.handover || r.quote || ['Discovery','Information requested','Proposal','Preview', 'Delivery', 'Client review', 'Onboarding'].includes(r.stage) : lane === 'all' || (r.call_lane === 'verification' ? lane === 'verification' : lane === 'research'));
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
document.querySelector('#pause').addEventListener('click', async () => { try { const paused=await api('/api/pause', {}); tell('AI and connector writes paused. Research and outreach remain paused.'+(paused.in_flight_may_complete?' Already-started Gateway usage may still complete; inspect its saved receipt.':'')); await refresh(); } catch (error) { tell(error.message, true); } });
document.querySelector('#backup').addEventListener('click', async () => { try { const result = await api('/api/backup', {}); tell(`Private backup saved and checksummed (${result.prospects} records).`); } catch (error) { tell(error.message, true); } });
document.querySelector('#sign-out').addEventListener('click', async () => { try { stopAudioCapture(); await api('/api/logout', {}); showOperatorLogin(); } catch (error) { tell(error.message, true); } });
async function start() {
  const response = await fetch(deskPath('/api/bootstrap')); if (!response.ok) throw Error('Private session unavailable. Reload the console.');
  const boot = await response.json(); csrf = boot.csrf; operatorAuthRequired = boot.operator_auth_required;
  await refresh();
}
start().catch(error => tell(error.message, true));
setInterval(() => {
  if (audioBusy() || dirty || document.querySelector('[data-exact-reply-review="active"]') || document.querySelector('.desk-next') || document.visibilityState !== 'visible' || Date.now() < refreshAfter || document.activeElement?.closest('form') || document.activeElement?.matches('input,textarea,select')) return;
  refresh().catch(error => { refreshAfter = Date.now() + 60000; if (message.textContent !== error.message) tell(error.message, true); });
}, 15000);
