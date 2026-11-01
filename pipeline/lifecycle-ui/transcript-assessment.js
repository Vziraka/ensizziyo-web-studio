import {deskPath} from './paths.js';

export function renderHostedAssessment(parent,r,call,state,{api,refresh,tell}){
 if(!state.hosted_preview)return false;
 const node=document.createElement('section'),el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};let busy=false;
 const button=(label,action)=>{const n=el('button',label);n.type='button';n.onclick=async()=>{if(busy)return;busy=true;const controls=[...node.querySelectorAll('button')].map(b=>({b,disabled:b.disabled}));for(const {b} of controls)b.disabled=true;try{await action();}catch(error){tell(error.message,true);}finally{busy=false;for(const {b,disabled} of controls)if(b.isConnected)b.disabled=disabled;read.disabled=false;}};return n;};
 const read=button('Read hosted fact assessment policy and receipt',async()=>{
  const response=await fetch(deskPath('/api/transcript-assessment'));const view=await response.json();if(!response.ok)throw Error(view.error);node.replaceChildren(read);const j=view.approval,a=view.attempt,t=r.transcripts[call.call_id];
  node.append(el('p',view.limit),el('p',`Transcript ${t.sha256} · adopted by ${t.actor}. Private notes are excluded from model input.`));
  const details=el('details',''),summary=el('summary','Exact assessment policy, source and receipt');details.append(summary,el('pre',JSON.stringify(view,null,2)));node.append(details);
  if(j){
   if(j.scope.prospect_id!==r.id||j.scope.call_id!==call.call_id){node.append(el('p','This finite allowance belongs to another call. Its receipt cannot be replaced.'));return;}
   node.append(el('p',`${a?.status??'Approved; not invoked'} · ${a?.reserved_microcredits/1e6||0} / 8 reserved model credits. Separate fresh-context model review precedes human approval.`));
   if(a){if(a.status==='Published'){node.append(el('p','Evidence review saved. Confirm the outcome in Review calls, then select quotes and prepare an unsent email revision in History.'));await refresh();}else node.append(el('p','Read the retained receipt. Unresolved, held or uncertain requests cannot be retried or refunded.'));return;}
   const start=button('Invoke approved hosted fact assessment',async()=>{const response=await fetch(deskPath('/api/transcript-assessment/execute'),{method:'POST',headers:{'content-type':'application/json','x-studio-token':state.csrf},body:JSON.stringify({operation_id:j.operation_id,policy_sha256:view.policy_sha256})});if(!response.ok)throw Error('Invocation not acknowledged; read the receipt before taking another action');tell('Invocation acknowledged only. Read the durable receipt; a 202 does not prove authentication, execution or a result.');});start.disabled=!view.enabled||state.current_operator!=='owner'||Boolean(j.paused_at)||Date.parse(j.expires_at)<=Date.now()||j.scope.transcript_sha256!==t.sha256;node.append(start);return;
  }
  node.append(el('p','Disabled unless separately enabled and approved. Proposed allowance: one source, two counts and two generations, eight credits; at least 918 freshly observed included credits preserves 900 for hosting and ten for prior policies. No repair, replay or fallback. This estimate is not measured billing or an account-wide reserve.'));
  if(!view.enabled||state.current_operator!=='owner'||r.restriction||r.reply)return;
  const label=el('label','Fresh included credits for transcript assessment'),balance=el('input','');balance.type='number';balance.min=String(view.policy.minimum_observed_credits);balance.step='0.1';balance.setAttribute('aria-label','Fresh included credits for transcript assessment');label.append(balance);
  const confirm=el('label','I verified this exact fictional transcript, fresh included credits and disabled recharge.'),checked=el('input','');checked.type='checkbox';checked.setAttribute('aria-label','I verified fictional transcript, fresh credits and disabled recharge');confirm.prepend(checked);
  node.append(label,confirm,button('Approve exact fictional fact assessment allowance',async()=>{if(!checked.checked||!balance.value)throw Error('Review the exact fictional source, fresh balance and disabled recharge');await api('/api/transcript-assessment/approve',{operation_id:'assessment-'+t.sha256.slice(0,24),policy_sha256:view.policy_sha256,prospect_id:r.id,call_id:call.call_id,transcript_sha256:t.sha256,remaining_credits:Number(balance.value),observed_at:new Date().toISOString(),auto_recharge_disabled:true,fictional_transcript_confirmed:true});tell('Allowance saved; no model request started. Read the receipt before invoking.');}));
 });
 node.append(read);parent.append(node);return true;
}
