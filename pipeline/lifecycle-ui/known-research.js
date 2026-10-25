import {readDeskSnapshot} from './snapshot-read.js';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let csrf,view;
async function api(operation,input){const response=await fetch('/desk/api/known-research/'+operation,{method:'POST',headers:{'Content-Type':'application/json','X-Studio-Token':csrf},body:JSON.stringify(input)}),body=await response.json();if(!response.ok)throw Error(body.error);return body;}
function action(label,fn){const button=el('button',label);button.type='button';button.addEventListener('click',async()=>{button.disabled=true;try{await fn();$('message').textContent='Saved. Read the current exact candidate.';}catch(e){$('message').textContent=e.message;}finally{button.disabled=false;}});return button;}
function field(form,label,multiline=true){const wrap=el('label',label),input=el(multiline?'textarea':'input');input.required=true;input.maxLength=1200;wrap.append(input);form.append(wrap);return input;}
async function show(){
 const ids=JSON.parse($('candidate').value),v=await api('status',ids),root=$('research');root.replaceChildren(el('h2',v.candidate.name),el('p',v.candidate.status),el('p',v.next));
 $('candidate').selectedOptions[0].textContent=`${v.candidate.name} · ${v.candidate.status}`;
 const intake=v.candidate.research_intake;root.append(el('h3','Supplied identity and intake provenance'),el('p',`${intake.channel}: ${intake.source}`),el('p',intake.note),el('p',`Supplied ${intake.supplied_at} · Assigned to ${intake.assigned_to}`));
 for(const url of intake.urls)root.append(el('p',`Approved first-party URL: ${url}`));
 if(!v.candidate.research_registration)root.append(action('Register exact supplied intake',async()=>{await api('register',ids);await show();}));
 if(v.candidate.status==='Registered known identity')root.append(action('Run bounded approved research',async()=>{await api('run',{...ids,revision:v.revision,policy_sha256:v.policy_sha256});await show();}));
 const a=v.attempt;if(!a)return;root.append(el('p',`Retained attempt: ${a.status} · ${a.reserved_microcredits/1e6} included model credits reserved`));
 for(const s of a.captures?.sources??[]){const d=el('details'),summary=el('summary',`Original source · ${s.url}`);d.append(summary,el('p',`${s.capture_method} · ${s.coverage} · fetched ${s.fetched_at} · SHA-256 ${s.content_sha256}`),el('pre',s.text));root.append(d);}
 for(const f of [...(a.captures?.failures??[]),...(a.capture_failures??[])])root.append(el('p',`Capture held: ${f.url} · ${f.reason}`));
 if(a.proposal){
  root.append(el('h3','Extractive source observations'));
  for(const o of a.proposal.observations){const article=el('article');article.append(el('p',o.statement),el('p',`Source: ${o.source_url}`));root.append(article);}
  root.append(el('h3','Derived opening hypotheses — require semantic review'));
  for(const c of a.proposal.assessment.candidates){const article=el('article');article.append(el('h4',`${c.service} · ${c.id===a.proposal.assessment.selected_id?'Selected opening':'Alternative opening'}`),el('p',`Published customer step: ${c.excerpt}`),el('p',`Possible improvement: ${c.hypothesis}`),el('p',`Question: ${c.owner_question}`),el('p',`Proposed opening: ${c.opening}`));root.append(article);}
  root.append(el('p',a.proposal.assessment.reason),el('h3','Uncertainty'));for(const u of a.proposal.unknowns)root.append(el('p',u));
 }
 if(a.reason)root.append(el('p',(a.human_review?'Original proposal: ':'')+a.reason));
 if(a.human_review)root.append(el('h3','Signed human disposition · import held'),el('p',`${a.human_review.verdict} by ${a.human_review.actor} at ${a.human_review.at}`),el('p',a.human_review.reason),el('p',a.human_review.opening_reason),el('p',a.human_review.import_status));
 if(a.status==='Awaiting human source/semantic review'){
  const form=el('form'),reviews=a.proposal.observations.map(o=>({id:o.id,note:field(form,`Source/meaning review for ${o.id}: ${o.excerpt}`)})),opening=field(form,'Review the selected opening against the exact source: difficulty, uncertainty and unsupported assumptions'),reason=field(form,'Overall human disposition reason');
  const wrap=el('label','I inspected the retained original sources and reviewed the meaning of every claim and opening.'),checked=el('input');checked.type='checkbox';checked.required=true;wrap.prepend(checked);form.append(wrap);
  for(const verdict of ['Accepted','Rejected'])form.append(action(verdict==='Accepted'?'Accept human review; keep import held':'Reject proposal; retain evidence',async()=>{if(!form.reportValidity())return;await api('review',{...ids,snapshot:v.attempt_sha256,verdict,reason:reason.value,inspected_sources:checked.checked,semantic_review:checked.checked,independent_model_review:false,import_authorized:false,observations:reviews.map(r=>({id:r.id,verdict,reason:r.note.value})),opening_reason:opening.value});await show();}));root.append(form);
 }
 const details=el('details');details.append(el('summary','Retained original request, raw output, policy and recovery'),el('pre',JSON.stringify(a,null,2)));root.append(details);
}
try{const boot=await (await fetch('/desk/api/bootstrap')).json();csrf=boot.csrf;view=await readDeskSnapshot(await fetch('/desk/api/state'),{fetch,path:'/desk/api/state'});$('runtime').textContent=view.shared_workspace?.execution??'Sign in at the operations desk first.';for(const c of view.known_research??[]){const option=el('option',`${c.name} · ${c.status}`);option.value=JSON.stringify({batch_id:c.batch_id,candidate_id:c.candidate_id});$('candidate').append(option);}$('candidate').addEventListener('change',()=>show().catch(e=>$('message').textContent=e.message));}catch(e){$('runtime').textContent='Sign in at the operations desk, then reopen source review.';$('message').textContent=e.message;}
