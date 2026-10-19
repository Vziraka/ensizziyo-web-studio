const byId=id=>document.getElementById(id);
const sample={name:'Jordan Lee',contact:'202-555-0147 · Fictional number',service:'AC not cooling',location:'Fairfax, Virginia',time:'Tomorrow afternoon',next:'Sample enquiry captured. A real team member would confirm availability.'};
let mode='listen',conversation=null,widget=null,loading=null,viewVersion=0;
const audio=byId('sample-audio');
function setLead(values,status){
 for(const key of ['name','contact','service','location','time','next'])byId('lead-'+key).textContent=values[key]||'Not provided';
 byId('lead-initials').textContent=values.name?values.name.split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase():'··';
 byId('summary-status').textContent=status;
}
function captureEnquiry(input={}){
 const bounded=(key,max)=>typeof input[key]==='string'?input[key].replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'Not provided';
 setLead({name:bounded('name',60),contact:bounded('contact',100),service:bounded('service',160),location:bounded('location',100),time:bounded('preferred_time',100),next:sample.next},'Sample captured');
 byId('call-status').textContent='Sample enquiry captured';
 return 'Sample enquiry displayed only in this browser. No booking or message was created.';
}
function loadWidget(){
 if(customElements.get('elevenlabs-convai'))return Promise.resolve();
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{const script=document.createElement('script'),failed=()=>{clearTimeout(timer);script.remove();loading=null;reject(Error('The live demo could not load. Please try again, listen to the recording, or email the team.'));},timer=setTimeout(failed,15000);script.src='https://unpkg.com/@elevenlabs/convai-widget-embed@0.20.0/dist/index.js';script.async=true;script.crossOrigin='anonymous';script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=failed;document.head.append(script);});
 return loading;
}
async function start(){
 if(mode==='listen'){
  byId('standby').hidden=true;byId('script').hidden=false;byId('reset-example').hidden=false;
  try{await audio.play();byId('call-status').textContent='Playing sample';}catch{byId('call-status').textContent='Use the audio player or read the transcript';}return;
 }
 byId('start-example').disabled=true;byId('call-status').textContent='Loading live demo…';
 const version=viewVersion;
 try{
  await loadWidget();
  if(mode!=='try'||viewVersion!==version)return;
  widget=document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id','agent_6801m5b3wd1pfnntwtqfdm0np72y');widget.setAttribute('variant','full');widget.setAttribute('text-contents',JSON.stringify({main_label:'Speak with Ava',start_call:'Start voice demo',start_chat:'Try text instead',end_call:'End demo',end_chat:'End demo'}));widget.setAttribute('dismissible','false');
  widget.addEventListener('elevenlabs-convai:call',event=>{
   setLead({},'Waiting for details');byId('call-status').textContent='Live fictional demo';
   event.detail.config.clientTools={capture_enquiry:captureEnquiry};
   const existing=event.detail.config.onConversationCreated;
   event.detail.config.onConversationCreated=session=>{conversation=session;existing?.(session);};
  });
  byId('live-demo').replaceChildren(widget);byId('live-demo').hidden=false;byId('standby').hidden=true;byId('reset-example').hidden=false;byId('call-status').textContent='Ready · choose voice or text';
 }catch(error){if(viewVersion===version)byId('call-status').textContent=error.message;}finally{byId('start-example').disabled=false;}
}
async function selectMode(nextMode){
 viewVersion++;
 audio.pause();
 if(conversation){try{await conversation.endSession();}catch{}conversation=null;}
 widget?.remove();widget=null;mode=nextMode;
 for(const value of ['listen','try']){byId(value+'-tab').setAttribute('aria-selected',String(value===mode));byId(value+'-tab').tabIndex=value===mode?0:-1;}
 byId('demo-experience').setAttribute('aria-labelledby',mode+'-tab');
 byId('standby').hidden=false;byId('script').hidden=true;byId('live-demo').hidden=true;byId('reset-example').hidden=true;
 byId('standby-title').textContent=mode==='listen'?'From “hello” to a clear enquiry.':'Take the customer’s side.';
 byId('standby-copy').textContent=mode==='listen'?'A customer needs help with their AC. Listen to a short, fictional example of the enquiry and handoff.':'Speak with Ava about a made-up service request. The live demo uses ElevenLabs. Choose voice or type instead.';
 byId('start-label').textContent=mode==='listen'?'Play sample call':'Load interactive demo';
 byId('panel-footnote').textContent=mode==='listen'?'Recorded example · Transcript included':'90-second limit · Use fictional details';
 byId('standby-footnote').textContent=mode==='listen'?'Sound starts when you press play':'Microphone only after you start a voice call';
 byId('call-status').textContent=mode==='listen'?'Sample call':'Ready to explore';
 byId('mode-hint').textContent=mode==='listen'?'A short example, from first question to follow-up.':'Play the customer in a live conversation.';
 setLead(sample,'Illustrative enquiry');
}
for(const [index,value] of ['listen','try'].entries()){
 const tab=byId(value+'-tab');tab.addEventListener('click',()=>selectMode(value));
 tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'listen':event.key==='End'?'try':index===0?'try':'listen';selectMode(next);byId(next+'-tab').focus();});
}
audio.addEventListener('ended',()=>{setLead(sample,'Sample captured');byId('call-status').textContent='Recorded example complete';});
audio.addEventListener('error',()=>{byId('call-status').textContent='Recording unavailable · Read the transcript or try the live demo';});
byId('start-example').addEventListener('click',start);byId('reset-example').addEventListener('click',()=>{audio.currentTime=0;selectMode(mode);});
window.addEventListener('pagehide',()=>{conversation?.endSession().catch(()=>{});});
selectMode('listen');
