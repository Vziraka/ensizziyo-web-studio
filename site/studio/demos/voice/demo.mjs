import {enquiryFields, observeSession} from './session.mjs';

const byId = id => document.getElementById(id);
const main = byId('main'), dialog = byId('voice-dialog'), audio = byId('sample-audio');
const sample = {name: 'Jordan Lee', contact: '202-555-0147 · Fictional number', service: 'AC not cooling', location: 'Fairfax, Virginia', time: 'Tomorrow afternoon'};
let session = null, widget = null, loading = null, viewVersion = 0, pendingEnquiry = null, messages = [], textOnly = false;

function status(message) {
  byId('call-status').textContent = message;
  byId('call-status').hidden = !message;
}

function addMessage({role, message} = {}) {
  if (!['agent', 'user'].includes(role) || typeof message !== 'string' || !message.trim()) return;
  const text = message.slice(0, 12000), speaker = role === 'agent' ? 'Evan' : 'You';
  if (messages.at(-1)?.role === role && messages.at(-1)?.message === text) return;
  messages.push({role, message: text});
  const row = document.createElement('li'), label = document.createElement('strong'), content = document.createElement('span');
  label.textContent = speaker; content.textContent = text; row.append(label, content);
  byId('transcript').append(row);
  byId('turn-speaker').textContent = speaker; byId('latest-message').textContent = text;
  byId('conversation').hidden = false;
}

function showResult(enquiry, recorded = false) {
  main.dataset.state = 'complete'; delete main.dataset.activity;
  byId('intro').hidden = true; byId('experience').hidden = true; byId('result').hidden = false;
  byId('result-label').textContent = recorded ? 'Recorded example complete' : 'Demo complete';
  byId('result-title').innerHTML = enquiry ? 'A clear next step<br>for your team.' : 'Let’s talk about<br>your business.';
  byId('result-intro').textContent = enquiry ? 'Explore what an AI receptionist could do for your business.' : 'No enquiry was captured this time. You can try again or talk with our team.';
  byId('enquiry').hidden = !enquiry;
  if (enquiry) for (const [key, value] of Object.entries(enquiry)) byId('lead-' + key).textContent = value;
  byId('result-title').focus({preventScroll: true});
  main.scrollIntoView({behavior: 'instant', block: 'start'});
}

async function reset() {
  viewVersion++;
  const previous = session; session = null;
  audio.pause(); audio.currentTime = 0;
  if (previous) try { await previous.endSession(); } catch {}
  widget?.remove(); widget = null;
  pendingEnquiry = null; messages = []; textOnly = false;
  main.dataset.state = 'ready'; delete main.dataset.activity;
  for (const id of ['conversation', 'recording', 'result', 'text-chat']) byId(id).hidden = true;
  byId('intro').hidden = false; byId('experience').hidden = false;
  byId('transcript').replaceChildren(); byId('full-transcript').open = false; byId('chat-message').value = '';
  byId('talk-label').textContent = 'Talk to Evan'; byId('talk-button').querySelector('img').hidden = false;
  byId('talk-button').disabled = false; byId('listen-button').hidden = false; byId('suggestion').hidden = false;
  status('');
}

function loadWidget() {
  if (customElements.get('elevenlabs-convai')) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const failed = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error('The live demo could not load. Listen to the example or try again.')); };
    const timer = setTimeout(failed, 15000);
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed@0.20.0/dist/index.js';
    script.async = true; script.crossOrigin = 'anonymous';
    script.onload = () => { clearTimeout(timer); resolve(); }; script.onerror = failed;
    document.head.append(script);
  });
  return loading;
}

async function startLive() {
  if (session) {
    byId('talk-button').disabled = true;
    try { await session.endSession(); }
    catch { byId('talk-button').disabled = false; status('The call could not end. Please try again.'); }
    return;
  }
  await reset();
  const version = viewVersion;
  byId('talk-button').disabled = true; byId('widget-loading').hidden = false;
  byId('widget-loading').textContent = 'Getting the demo ready…'; dialog.showModal();
  try {
    await loadWidget();
    if (version !== viewVersion || !dialog.open) return;
    widget = document.createElement('elevenlabs-convai');
    widget.setAttribute('agent-id', 'agent_6801m5b3wd1pfnntwtqfdm0np72y');
    widget.setAttribute('variant', 'full'); widget.setAttribute('dismissible', 'false');
    widget.setAttribute('avatar-image-url', new URL('assets/voice-wave.png', import.meta.url).href);
    widget.setAttribute('text-contents', JSON.stringify({main_label: 'Speak with Evan', start_call: 'Start voice demo', start_chat: 'Try text instead', end_call: 'End demo', end_chat: 'End demo'}));
    widget.addEventListener('elevenlabs-convai:call', event => {
      const isText = !!event.detail.config.textOnly;
      event.detail.config.clientTools = {
        capture_enquiry: input => {
          if (version === viewVersion) pendingEnquiry = enquiryFields(input);
          return 'Sample enquiry displayed only in this browser. No booking or message was created.';
        },
      };
      const original = event.detail.config.onConversationCreated;
      event.detail.config.onConversationCreated = connected => {
        original?.(connected);
        if (version === viewVersion) { session = connected; textOnly = isText; }
        const observed = observeSession(connected, {
          onConnect: () => {
            main.dataset.state = 'active';
            byId('talk-label').textContent = 'End demo'; byId('talk-button').querySelector('img').hidden = true;
            byId('talk-button').disabled = false; byId('listen-button').hidden = true; byId('suggestion').hidden = true;
            byId('text-chat').hidden = !textOnly;
            status(textOnly ? 'Live text demo' : 'Listening'); dialog.close();
          },
          onMessage: addMessage,
          onModeChange: ({mode} = {}) => { main.dataset.activity = mode === 'speaking' ? 'speaking' : 'listening'; status(mode === 'speaking' ? 'Evan is speaking' : textOnly ? 'Live text demo' : 'Listening'); },
          onDisconnect: () => {
            session = null; widget?.remove(); widget = null;
            byId('talk-button').disabled = false;
            showResult(pendingEnquiry);
            if (dialog.open) dialog.close();
          },
        }, () => version === viewVersion);
        if (!observed && version === viewVersion) {
          byId('widget-loading').hidden = false;
          byId('widget-loading').textContent = 'Continue your conversation in the panel below.';
        }
      };
    });
    byId('live-demo').replaceChildren(widget); byId('widget-loading').hidden = true;
  } catch (error) {
    if (version === viewVersion) { byId('widget-loading').hidden = false; byId('widget-loading').textContent = error.message; }
  } finally {
    if (version === viewVersion) byId('talk-button').disabled = false;
  }
}

byId('talk-button').addEventListener('click', startLive);
byId('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (main.dataset.state !== 'active' && main.dataset.state !== 'complete') void reset(); });
byId('listen-button').addEventListener('click', async () => {
  await reset(); byId('recording').hidden = false;
  status('Recorded example');
  try { await audio.play(); } catch { status('Use the audio player or read the transcript below.'); }
});
byId('close-recording').addEventListener('click', async () => { await reset(); byId('talk-button').focus(); });
byId('try-again').addEventListener('click', async () => { await reset(); byId('talk-button').focus(); });
audio.addEventListener('ended', () => { if (!byId('recording').hidden) showResult(sample, true); });
audio.addEventListener('error', () => { if (!byId('recording').hidden) status('Recording unavailable. Read the transcript below or try the live demo.'); });
byId('text-chat').addEventListener('submit', event => {
  event.preventDefault();
  const input = byId('chat-message'), message = input.value.trim();
  if (session && message) {
    addMessage({role: 'user', message});
    try { session.sendUserMessage(message); input.value = ''; }
    catch { status('Your message could not be sent. Please try again.'); }
    input.focus();
  }
});
document.addEventListener('visibilitychange', () => { document.body.classList.toggle('is-background', document.hidden); });
window.addEventListener('pagehide', () => { viewVersion++; audio.pause(); session?.endSession().catch(() => {}); });
