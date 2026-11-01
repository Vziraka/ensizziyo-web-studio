import {deskPath} from './paths.js';
let cached,busy=false;
export function gatewayProofPanel(state,{el,button,api,tell,refresh,clearDirty}){
 if(cached&&cached.revision!==state.revision)cached=null;
 const node=el('section');
 const read=async()=>{const response=await fetch(deskPath('/api/gateway-proof'));const data=await response.json();if(!response.ok)throw Error(data.error);cached=data;};
 async function act(action){if(busy)return;busy=true;draw();try{await action();await read();clearDirty();busy=false;await refresh();}catch(error){tell(`${error.message}. Check saved proof state before another action.`,true);await read().catch(()=>{});}finally{busy=false;if(node.isConnected)draw();}}
 function draw(){
  node.replaceChildren(el('h2','Bounded fictional AI Gateway proof'),el('p','This uses the existing Netlify credit pool. It does not use a chat subscription. Production outreach, real transcripts and client records remain excluded. No inference starts when checking capability.','notice'));
  node.append(button('Check Gateway capability and saved proof',()=>act(async()=>{})));
  if(!cached)return;
  const details=el('details');details.append(el('summary','Read exact capability, policy and receipts'),el('pre',JSON.stringify(cached,null,2)));node.append(details);
  if(!cached.capability.ready){node.append(el('p','Matching runtime Gateway configuration is unavailable. No inference can start.','notice'));return;}
  if(state.current_operator!=='owner'){node.append(el('p','Only the owner can approve or run this finite proof. Both operators can inspect its receipts.','muted'));return;}
  const proof=cached.proof,policy=cached.proposed_policy;
  if(!proof){
   const form=el('form');form.onsubmit=event=>event.preventDefault();const label=el('label','Freshly verified remaining Netlify credits'),balance=el('input');balance.type='number';balance.min=String(policy.minimum_host_reserve_credits+policy.maximum_microcredits/1e6);balance.step='0.1';balance.setAttribute('aria-label','Freshly verified remaining Netlify credits');label.append(balance);
   const consent=el('label','I just verified this balance and that auto recharge is disabled.','checkbox'),confirmed=el('input');confirmed.type='checkbox';confirmed.setAttribute('aria-label','I just verified this balance and that auto recharge is disabled.');consent.prepend(confirmed);
   const approve=button('Approve fixed fictional proof · up to 4 model credits',()=>act(async()=>{if(!confirmed.checked||!balance.value)throw Error('Verify the current plan balance and disabled auto recharge first');await api('/api/gateway-proof/configure',{operation_id:'gateway-policy-'+cached.policy_sha256.slice(0,24),policy_sha256:cached.policy_sha256,remaining_credits:Number(balance.value),observed_at:new Date().toISOString(),auto_recharge_disabled:true});}));approve.disabled=busy;
   form.append(label,consent,el('p','The 900-credit reserve uses this observed balance; unrelated site usage is not atomically reserved. Compute/storage use separate shared credits. Approval expires after 15 minutes and cannot reset the lifetime budget.','muted'),approve);node.append(form);return;
  }
  node.append(el('p',`Approved by ${proof.configuration.approved_by} · expires ${new Date(proof.configuration.expires_at).toLocaleString()} · reserved ${Object.values(proof.jobs).reduce((sum,j)=>sum+j.reserved_microcredits,0)/1e6} / 4 model credits`));
  if(proof.configuration.paused_at)node.append(el('p',`Proof paused by ${proof.configuration.paused_by}. Reserved usage is retained; no further job can start.`,'notice'));
  const jobs=el('form');jobs.onsubmit=event=>event.preventDefault();
  for(const kind of policy.jobs){const saved=proof.jobs[kind],run=button(saved?`${kind} · ${saved.status}`:`Run fictional ${kind}`,()=>act(()=>api('/api/gateway-proof/run',{operation_id:'gateway-'+cached.policy_sha256.slice(0,24)+'-'+kind,kind,policy_sha256:cached.policy_sha256})));run.disabled=busy||Boolean(proof.configuration.paused_at)||Boolean(saved)||Object.values(proof.jobs).some(j=>['Reserved','Uncertain'].includes(j.status))||Date.parse(proof.configuration.expires_at)<=Date.now()||kind==='opening-review'&&proof.jobs['opening-supported']?.structural_valid!==true;jobs.append(run);}
  node.append(jobs,el('p','Completed means transport and output contract completed. It does not mean a useful pitch, an independent quality pass or a reliable real-call transcript. Model review is separate from owner acceptance.','notice'));
  for(const [kind,saved] of Object.entries(proof.jobs)){
   node.append(el('p',`${kind} · output contract ${saved.structural_valid?'valid':'not valid'}${saved.fixture_expectation_pass===undefined?'':` · fixed fixture ${saved.fixture_expectation_pass?'matched':'not matched'}`} · owner quality ${saved.operator_quality_review.verdict}`));
   if(!['Completed','Held','Uncertain'].includes(saved.status)||saved.operator_quality_review.verdict!=='Unreviewed')continue;
   const form=el('form');form.onsubmit=event=>event.preventDefault();const label=el('label',`Quality review reason for ${kind}`),reason=el('textarea');reason.maxLength=1200;reason.setAttribute('aria-label',`Quality review reason for ${kind}`);label.append(reason);form.append(label);
   for(const verdict of ['Rejected','Accepted']){const save=button(`Record ${verdict.toLowerCase()} quality · ${kind}`,()=>act(async()=>{if(reason.value.trim().length<12)throw Error('Give a specific quality review reason');await api('/api/gateway-proof/review',{operation_id:'quality-'+saved.receipt_sha256.slice(0,24),kind,receipt_sha256:saved.receipt_sha256,verdict,reason:reason.value});}));save.disabled=busy;form.append(save);}node.append(form);
  }
  node.append(el('p','Each job reserves one model credit before network access. Held, reserved or uncertain work is never retried or refunded automatically. Quality reviews retain exact receipts and cannot change the budget or adopt any result.','muted'));
 }
 draw();return node;
}
