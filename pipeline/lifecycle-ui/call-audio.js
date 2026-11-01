import {deskPath} from './paths.js';
const retained = new Map();
let active;
export const audioBusy = () => Boolean(active);
export const stopAudioCapture = () => active?.recorder.stop();

export function createDesktopRecorder({getUserMedia,Recorder,now=()=>new Date(),changed=()=>{},timer=setInterval,clearTimer=clearInterval}) {
  let recorder,stream,interval,chunks=[],bytes=0,started;
  const state={status:'Idle'};
  const release=()=>{clearTimer(interval);for(const track of stream?.getTracks()??[])track.stop();};
  const stop=()=>{if(recorder?.state==='recording'){state.status='Stopping';recorder.stop();changed(state);}};
  return {state,stop,async start(){
    if(!['Idle','Error'].includes(state.status))throw Error('This recording has already started.');
    chunks=[];bytes=0;state.status='Requesting microphone';delete state.error;changed(state);
    try {
      stream=await getUserMedia({audio:true,video:false});
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>Recorder.isTypeSupported(value));
      recorder=new Recorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:24000});
      started=now();Object.assign(state,{status:'Recording',started_at:started.toISOString(),seconds:0});
      recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>=3_800_000){state.limitReached=true;stop();}}};
      recorder.onerror=()=>{state.error='Microphone recording failed. Review any retained clip; it is not a complete call recording.';release();stop();};
      recorder.onstop=()=>{release();Object.assign(state,{status:'Recorded',ended_at:now().toISOString(),blob:new Blob(chunks,{type:recorder.mimeType})});changed(state);};
      recorder.start(1000);
      interval=timer(()=>{state.seconds=Math.floor((+now()-+started)/1000);if(state.seconds>=20*60){state.limitReached=true;stop();}changed(state);},1000);changed(state);
    }catch(error){release();Object.assign(state,{status:'Error',error:error.name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser and try again.':error.name==='NotFoundError'?'No microphone was found. Connect one and try again.':'Recording could not start. Use a supported browser on HTTPS or localhost and check your microphone.'});changed(state);}
  }};
}
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const button=(text,fn)=>{const node=el('button',text);node.type='button';node.onclick=fn;return node;};
function pendingNotice(clip,upload,refresh,tell) {
  document.querySelector('#audio-active')?.remove();const notice=el('section');notice.id='audio-active';notice.className='notice';notice.setAttribute('role','region');notice.setAttribute('aria-label','Active recording or pending audio save');
  let phase;const update=()=>{const s=clip.recorder.state,title=s.status==='Recording'?`● Recording ${clip.input.kind==='call'?'call':'own notes'} · ${Math.floor((s.seconds??0)/60)}:${String((s.seconds??0)%60).padStart(2,'0')}`:s.status==='Recorded'?'Recording stopped · private save pending':s.status;
    if(phase===s.status&&['Recording','Requesting microphone','Stopping'].includes(phase)){notice.querySelector('strong').textContent=title;return;}phase=s.status;notice.replaceChildren(el('strong',title));
    notice.append(el('p',`${clip.name} · ${clip.input.kind==='call'?'Computer microphone: keep the iPhone on speakerphone nearby.':'Your private spoken summary, separate from customer call audio.'}`));
    if(['Recording','Stopping'].includes(s.status))notice.append(button('Stop recording',()=>clip.recorder.stop()));
    if(s.error)notice.append(el('p',s.error));
    if(s.status==='Recorded'){
      if(!clip.url)clip.url=URL.createObjectURL(s.blob);const player=el('audio');player.controls=true;player.src=clip.url;notice.append(player);
      const download=el('a','Download this retained clip');download.href=clip.url;download.download=`${clip.input.kind}-${clip.input.id}.${s.blob.type.startsWith('audio/mp4')?'m4a':s.blob.type.startsWith('audio/ogg')?'ogg':'webm'}`;notice.append(download);
      const retry=button('Save exact audio clip',()=>save());retry.disabled=clip.saving;notice.append(retry,el('p','Keep this tab open until private saving is confirmed. Playback checks audibility; no transcript is generated automatically.'));
      const discard=button('Discard this tab’s audio copy',()=>{if(!confirm('Discard only this tab’s audio copy? Any uncertain private save remains in history. Download it first if needed.'))return;retained.delete(clip.input.id);active=null;URL.revokeObjectURL(clip.url);notice.remove();});discard.disabled=clip.saving;notice.append(discard);
    }
  };
  async function save(){
    if(clip.saving)return;clip.saving=true;update();
    let saved=false;
    try {const s=clip.recorder.state;await upload({...clip.input,started_at:s.started_at,ended_at:s.ended_at,partial:Boolean(s.error)},s.blob);saved=true;retained.delete(clip.input.id);active=null;URL.revokeObjectURL(clip.url);notice.remove();}
    catch(error){tell(error.message+' The exact clip is retained here for retry or download.',true);}
    finally{clip.saving=false;if(retained.has(clip.input.id))update();}
    if(saved){try{await refresh();tell(clip.recorder.state.limitReached?'Clip limit reached: recording stopped and saved. Start another clip if the call continues.':'Audio saved privately against this exact call. Review playback, then add a permitted transcript if needed.');}catch{tell('Audio saved and verified. Refresh to load playback. Recording has stopped; start another clip if the call continues.');}}
  }
  clip.changed=()=>{update();if(clip.recorder.state.status==='Recording'&&!clip.announced){clip.announced=true;tell('Recording is active. Use Stop recording when finished.');}if(clip.recorder.state.status==='Recorded'&&!clip.autoSaved){clip.autoSaved=true;if(!clip.recorder.state.error)save();}if(clip.recorder.state.status==='Error'){active=null;retained.delete(clip.input.id);tell(clip.recorder.state.error,true);}};
  document.querySelector('#message').after(notice);update();
}
export function renderAudioControls(parent,{record,callId,kind,state,upload,check,refresh,tell}) {
  const box=el('section');box.className='audio-controls';
  const title=kind==='call'?'Record call':'Record my spoken notes';box.append(el('h3',title));
  box.append(el('p',kind==='call'?'Put the iPhone on speakerphone near this computer. Only voices audible to the computer microphone are captured. This does not access the cellular call directly.':'Record your own post-call summary separately. Review any dictated text before saving it as private call notes.'));
  const permission=el('input');permission.type='checkbox';const label=el('label',kind==='call'?'I confirmed recording permission with the people on this call.':'This recording is my own private summary.');label.className='checkbox';label.prepend(permission);box.append(label);
  const start=button(title,async()=>{
    if(active){tell('Stop or save the active recording first.',true);return;}
    if(!permission.checked){tell('Confirm recording permission before starting.',true);return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){tell('Microphone recording needs a supported browser on HTTPS or localhost.',true);return;}
    const clip={input:{id:crypto.randomUUID(),prospect_id:record.id,call_id:callId,kind,permission_confirmed:true,recorded_by:state.current_operator},name:record.name};
    clip.recorder=createDesktopRecorder({getUserMedia:options=>navigator.mediaDevices.getUserMedia(options),Recorder:window.MediaRecorder,changed:()=>clip.changed?.()});
    active=clip;retained.set(clip.input.id,clip);pendingNotice(clip,upload,refresh,tell);await clip.recorder.start();
  });
  start.disabled=kind==='call'&&record.follow_up_owner!==state.current_operator;box.append(start,el('p','Each clip stops at twenty minutes or near 4 MB. Continue with another clip if needed. Keep the tab open while recording.'));
  renderAudioPlayback(box,record,callId,kind,{check,refresh,tell});
  parent.append(box);
}
export function renderAudioPlayback(parent,record,callId,kind='call',{check,refresh,tell}={}) {
  const clips=Object.values(record.call_audio??{}).filter(c=>c.call_id===callId&&c.kind===kind);
  for(const clip of clips){parent.append(el('p',`${clip.status}${clip.partial?' · partial capture; recorder error':''} · ${clip.recorded_by} · ${new Date(clip.started_at).toLocaleString()} · ${clip.capture}`));
    if(clip.status==='Stored'){const player=el('audio');player.controls=true;player.preload='none';player.src=deskPath(`/call-audio/${record.id}/${clip.id}`);parent.append(player);}
    else{parent.append(el('p','Private saving is unresolved. Check the exact private save or retry its retained clip; do not record a replacement to hide it.'));
      if(check)parent.append(button('Verify private audio save',async()=>{try{const receipt=await check({prospect_id:record.id,id:clip.id});if(receipt.status!=='Stored'||receipt.sha256!==clip.sha256)throw Error('The saved clip does not match.');const pending=retained.get(clip.id);if(pending){retained.delete(clip.id);URL.revokeObjectURL(pending.url);if(active===pending){active=null;document.querySelector('#audio-active')?.remove();}}await refresh();tell('Exact private audio verified. No replacement recording was created.');}catch(error){tell(error.message,true);}}));
    }
  }
  return clips;
}
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(active||retained.size){event.preventDefault();event.returnValue='';}});
