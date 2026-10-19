let selected, lane='all', lastSaved, showHistory=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,fn,cls='quiet')=>{const n=el('button',text,cls);n.type='button';n.onclick=fn;return n;};
const when=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET';
function field(parent,label,value='',type='text') {const wrap=el('label',label),n=el(type==='textarea'?'textarea':'input');n.setAttribute('aria-label',label);if(type!=='textarea')n.type=type;n.value=value;wrap.append(n);parent.append(wrap);return n;}
function select(parent,label,options,value){const wrap=el('label',label),n=el('select');n.setAttribute('aria-label',label);for(const [v,t] of options){const o=el('option',t);o.value=v;n.append(o);}n.value=value;wrap.append(n);parent.append(wrap);return n;}
function disclosure(title,child){const d=el('details');d.append(el('summary',title),child);return d;}
export function renderCallDesk(root,state,{api,refresh,tell,evidence,clearDirty}) {
  const records=state.supply.queue.map(a=>state.prospects[a.prospect_id]);
  const visible=records.filter(r=>lane==='all'||(r.call_lane==='verification'?'verification':'research')===lane);
  selected??=visible[0]?.id;
  const run=async fn=>{try{await fn();}catch(e){tell(e.message,true);}};
  const event=async(r,type,data)=>{await api('/api/event',{revision:state.revision,event:{id:crypto.randomUUID(),prospect_id:r.id,type,at:new Date().toISOString(),data}});clearDirty();await refresh();};
  const top=el('section',undefined,'desk-overview');
  top.append(el('div',`${state.daily.unique_businesses} / 50 businesses contacted today`,'desk-count'),el('p',`${state.supply.ready} prepared calls · ${state.daily.prepared.research} ready to pitch · ${state.daily.prepared.verification} quick verification`));
  const active=state.calling_session&&!state.calling_session.ended_at;
  top.append(btn(active?'End calling session':'Start calling session',()=>run(async()=>{const s=await api('/api/calling-session',{action:active?'end':'start'});clearDirty();await refresh();tell(active?`Session saved: ${s.summary.attempts} attempts · ${s.summary.conversations} conversations · ${s.summary.interested} interested · ${s.summary.bookings} bookings. Research continues according to your priority.`:'Calling session started.');})));
  root.append(top);
  if(state.supply.low)root.append(el('p',`Call supply is low: ${state.supply.ready} eligible businesses, below the one-day minimum of 50. ${state.controls.research_paused?'Research is paused by your current priority.':'The saved campaign can replenish within its allowance.'}`,'notice'));
  const technical=state.exceptions.filter(e=>!state.prospects[e.id]);
  if(technical.length)root.append(disclosure(`${technical.length} item${technical.length===1?'':'s'} need attention`,el('p',technical.map(e=>e.reason).join('\n'))));
  const progress=el('div');progress.append(el('p',`Research: ${state.research_runtime?.status??'Waiting'} · priority: ${state.controls.research_priority??state.controls.priority}. Keeps existing attempt limits and 30% reserve.`));
  if(state.build)progress.append(el('p',`Running build ${state.build.source_sha256.slice(0,12)} · started ${when(state.build.started_at)}`,'muted'));
  if(state.research_runtime?.reason)progress.append(el('p',state.research_runtime.reason));
  if(state.controls.mode==='production')for(const [v,label] of [['research','Resume approved research'],['website','Website priority'],['client','Client priority']])progress.append(btn(label,()=>run(async()=>{await api('/api/research-priority',{priority:v});await refresh();})));
  root.append(disclosure('Background research and held work',progress));
  const grid=el('div',undefined,'grid call-desk'),left=el('section',undefined,'panel');
  left.append(el('h2','Today’s calls'),el('p','Callbacks first, then prepared opportunities. Call from your phone.','muted'));
  const filter=select(left,'Call queue',[['all','Both queues'],['research','Ready to pitch'],['verification','Quick verification']],lane);
  filter.onchange=()=>{lane=filter.value;selected=undefined;clearDirty();refresh();};
  left.append(btn(showHistory?'Show due calls':'Show saved calls & follow-ups',()=>{showHistory=!showHistory;selected=showHistory?Object.values(state.prospects).find(r=>Object.keys(r.calls).length)?.id:records[0]?.id;clearDirty();refresh();}));
  const list=el('div',undefined,'record-list');
  const listed=showHistory?Object.values(state.prospects).filter(r=>Object.keys(r.calls).length):visible;
  for(const r of listed){const b=btn('',()=>{selected=r.id;clearDirty();refresh();},`record${selected===r.id?' selected':''}`);b.setAttribute('aria-pressed',String(selected===r.id));b.append(el('strong',r.name),el('span',r.stage==='Callback'?`Callback · ${when(r.callback_at)}`:r.call_lane==='verification'?'Quick verification':'Ready to pitch','badge'),el('small',r.idea));list.append(b);}
  left.append(list);if(!listed.length)left.append(el('p','No eligible calls in this queue right now. Saved work remains available in call history.','empty'));
  grid.append(left);
  const r=state.prospects[selected];
  if(r){const card=el('section',undefined,'panel desk-card');
    card.append(el('p',r.call_lane==='verification'?'QUICK VERIFICATION':'READY TO PITCH','eyebrow'),el('h2',r.name,'detail-title'),el('p',r.contact.name??r.verification?.conversation?.decision_maker??r.discovery?.decision_maker??'Decision-maker: confirm on the call','muted'),el('p',r.contact.phone??(r.controlled?'Fictional rehearsal · no dialable phone':'No verified phone'),'desk-phone'),el('h3','Why this call'),el('p',r.idea,'idea'));
    const prep=r.call_prep;
    card.append(el('h3','Open with'),el('blockquote',r.verification?.opening??prep?.opening??'Review the retained evidence before choosing your opening.','quote'),el('h3','Then ask'),el('p',r.verification?.owner_question??prep?.questions?.[0]??'What would you most like to make easier for your customers?'));
    card.append(disclosure('Research, sources and what is still unknown',evidence(r)));
    if(state.supplemental_reviews)card.append(el('p','Supplemental review is retained separately; it does not replace the original qualification.','muted'));
    const callable=state.supply.queue.some(a=>a.prospect_id===r.id);
    if(callable){const form=el('form');form.onsubmit=e=>e.preventDefault();
      const note=field(form,'Optional call notes','','textarea');note.maxLength=3000;
      const dictate=btn('Dictate notes',()=>{note.focus();const Recognition=window.SpeechRecognition??window.webkitSpeechRecognition;if(!Recognition){tell('With the notes box focused, press Windows + H to dictate your own summary. Review the text before saving.');return;}const speech=new Recognition();speech.lang='en-US';speech.interimResults=false;speech.onresult=e=>{note.value+=(note.value?' ':'')+e.results[0][0].transcript;note.dispatchEvent(new Event('input',{bubbles:true}));};speech.onerror=()=>tell('Dictation is unavailable. You can type or use Windows + H.',true);speech.start();});
      form.append(dictate,el('p','Your own summary only. Review dictated text before saving.','muted'));
      const extra=el('div'),actions=el('div',undefined,'outcome-buttons');let busy=false;
      const save=async(outcome,more={})=>{if(busy)return;busy=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);try{const id=crypto.randomUUID(),at=new Date().toISOString();await api('/api/event',{revision:state.revision,event:{id,prospect_id:r.id,type:'call_logged',at,data:{call_id:id,outcome,performed_at:at,simulated:r.controlled,desk:true,note:note.value,...more}}});lastSaved=r.id;if(outcome!=='connected')selected=visible.find(x=>x.id!==r.id)?.id;clearDirty();await refresh();tell('Outcome saved.');}catch(e){tell(e.message+' Refresh the saved history before trying again.',true);}finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
      actions.append(btn('No answer',()=>save('no_answer'),'primary'),btn('Callback',()=>{extra.replaceChildren();const time=field(extra,'Callback time (your computer timezone)','','datetime-local');extra.append(btn('Save callback',()=>{if(!time.value){tell('Choose the agreed callback time.',true);return;}save('callback',{callback_at:new Date(time.value).toISOString()});}));}),btn('Interested',()=>{extra.replaceChildren(el('h3','What did they agree to?'));extra.append(btn('Book a discovery call',()=>save('connected',{intent:'discovery'}),'primary'),btn('Send information first',()=>save('connected',{intent:'requested_info'})));}),btn('Not interested',()=>save('declined')),btn('Wrong number',()=>save('wrong_contact')),btn('Do not contact',()=>save('do_not_contact')));
      if(state.controls.calls_paused&&state.controls.mode==='production'){actions.querySelectorAll('button').forEach(b=>b.disabled=true);form.append(el('p','Live call release is still paused. The saved cards are available for review.','notice'));}
      form.append(actions,extra);card.append(form);
    }
    if(r.stage==='Verification review'&&Object.values(r.approved_calls).some(c=>c.basis)){const c=Object.keys(r.approved_calls).at(-1),f=el('form');f.onsubmit=e=>e.preventDefault();f.append(el('h3','Confirm what you learned'));const who=field(f,'Decision-maker'),goal=field(f,'Their goal'),identity=field(f,'Business identity confirmed','','checkbox'),activity=field(f,'Currently operating confirmed','','checkbox');f.append(btn('Confirm conversation',()=>run(()=>event(r,'conversation_confirmed',{call_id:c,identity_confirmed:identity.checked,active_confirmed:activity.checked,decision_maker:who.value,goal:goal.value})),'primary'));card.append(f);}
    if(['Discovery','Information requested'].includes(r.stage)){
      card.append(el('h3','Next step'),btn('Book discovery',()=>run(()=>booking(card,r,state,api,refresh,tell)),'primary'),btn('Prepare information email',()=>emailDraft(card,r,state,api,refresh,tell)));
      if(r.information_draft)card.append(el('p',`Information email: ${r.information_draft.status}${r.information_draft.error?' · '+r.information_draft.error:''}`,'notice'));
    }
    for(const b of state.pending_bookings??[])if(b.prospect_id===r.id)card.append(el('p',`${b.status} · ${when(b.start)}`,'notice'));
    if(r.meeting)card.append(el('p',`${r.meeting.current_status??'Verified'} meeting · ${when(r.meeting.start)}`,'notice'));
    if(r.restriction)card.append(el('p',`Contact stopped: ${r.restriction}. A history correction cannot silently restart outreach.`,'notice'));
    const history=el('div');
    for(const c of Object.values(r.calls).reverse()){const f=el('form');f.onsubmit=e=>e.preventDefault();f.append(el('h4',`${c.outcome.replaceAll('_',' ')} · ${when(c.performed_at)}`));const n=field(f,'Edit saved call note',c.note??'','textarea');f.append(btn('Save note correction',()=>run(()=>event(r,'call_note_updated',{call_id:c.call_id,note:n.value}))));history.append(f);}
    card.append(disclosure('Saved call history and note corrections',history));grid.append(card);
  }
  root.append(grid);
  const undo=state.prospects[lastSaved??selected];if(undo?.call_undo&&!undo.restriction&&!undo.meeting&&!undo.information_draft)root.prepend(btn(`Undo last outcome · ${undo.name}`,()=>run(async()=>{selected=undo.id;await event(undo,'call_undone',{call_id:undo.call_undo.call_id});lastSaved=undefined;tell('Outcome reversed; original event remains in history.');})));
}
async function booking(card,r,state,api,refresh,tell){
  card.querySelector('.desk-next')?.remove();const f=el('form',undefined,'desk-next');f.onsubmit=e=>e.preventDefault();f.append(el('h3','Book discovery · 20 minutes'),el('p','Weekdays 9–5 Eastern · 15-minute buffers. Availability is rechecked before an invitation is created.'));card.append(f);
  const result=await api('/api/slots',{});if(!result.slots.length){f.append(el('p','No available slots in the next ten days.'));return;}
  const time=select(f,'Available time',result.slots.map(s=>[s.start,when(s.start)]),result.slots[0].start),mode=select(f,'Meeting type',[['video','Video call'],['phone','Phone call']],'video'),name=field(f,'Guest name',r.contact.name??''),email=field(f,'Guest email',r.contact.email??'','email'),agreed=field(f,'Guest confirmed name, email and time','','checkbox');
  const send=btn(r.controlled?'Simulate invitation':'Approve and send invitation',async()=>{send.disabled=true;try{if(!name.value.trim())throw Error('Confirm the guest name');const start=time.value;const res=await api('/api/booking',{revision:state.revision,prospect_id:r.id,start,end:new Date(Date.parse(start)+1200000).toISOString(),mode:mode.value,attendee_email:email.value,recipient_confirmed:agreed.checked,slot_agreed:agreed.checked,title:`EVZ Digital discovery · ${r.name}`,description:`Discovery with ${name.value}. ${mode.value==='video'?'Video call':'Phone call'}. Discuss: ${r.idea}`});await refresh();tell(res.simulated?'Fictional invitation simulated; nothing sent.':'Invitation queued. The dashboard will show verified calendar readback.');}catch(e){tell(e.message,true);}finally{send.disabled=false;}},'primary');f.append(send);
}
function emailDraft(card,r,state,api,refresh,tell){
  card.querySelector('.desk-next')?.remove();const f=el('form',undefined,'desk-next');f.onsubmit=e=>e.preventDefault();const saved=r.information_draft,notes=Object.values(r.calls).at(-1)?.note;
  f.append(el('h3','Information email'),el('p','Review the recipient and every word before sending.'));
  const to=field(f,'Recipient',saved?.to??r.contact.email??'','email'),subject=field(f,'Subject',saved?.subject??`Following up · ${r.name}`),body=field(f,'Message',saved?.body??`Hi,\n\nThanks for speaking with me. ${notes?`From our conversation: ${notes}\n\n`:''}One idea to explore is ${r.idea}\n\nWould a short discovery call be useful to check whether this fits what you need?\n\nEVZ Digital`,'textarea'),confirmed=field(f,'They requested information at this address','','checkbox');confirmed.checked=saved?.recipient_confirmed??false;
  const save=btn('Save draft',async()=>{save.disabled=true;try{await api('/api/information-draft',{revision:state.revision,prospect_id:r.id,to:to.value,subject:subject.value,body:body.value,recipient_confirmed:confirmed.checked});await refresh();tell('Draft saved. Open it again to approve the saved message.');}catch(e){tell(e.message,true);}finally{save.disabled=false;}});f.append(save);
  if(saved?.status==='Draft'){const send=btn(r.controlled?'Simulate sending':'Approve and send',async()=>{send.disabled=true;try{if(to.value!==saved.to||subject.value!==saved.subject||body.value!==saved.body||!confirmed.checked)throw Error('Save the edited draft before approving it');const result=await api('/api/information-send',{prospect_id:r.id,fingerprint:saved.fingerprint,approved:true});await refresh();tell(result.status==='Simulated'?'Fictional send simulated; nothing sent.':`Email status: ${result.status}`);}catch(e){tell(e.message,true);}finally{send.disabled=false;}},'primary');f.append(send);}
  card.append(f);
}
