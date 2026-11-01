import {interactiveAuthoringPanel} from './project-authoring.js';
import {deskPath} from './paths.js';

export function preparationPanel(r,state,tools){
  const {el,button,eventForm,tell}=tools;
  const work=Object.values(r.project_work??{}),node=el('section'),recordsOnly=state.shared_workspace?.capability==='shared-operations-records-v1',interactive=['shared-operations-authoring-v1','shared-operations-refinement-v1','shared-operations-originals-v1','shared-operations-calendar-v1','shared-operations-exact-mail-v1','shared-operations-pdf-mail-v1'].includes(state.shared_workspace?.capability);
  node.append(el('h3','Project preparation'),el('p',interactive?'Review current context, supply authored source and registered resources, render the PDF, then inspect every actual raster page. Delivery remains held.':recordsOnly?'Save preparation and focused refinement requests against current context. Requests are queued; authoring and delivery are held in this workspace. Existing output and execution evidence remain history.':'Load current private context for the named workflow. A handoff is a task; file retrieval, authoring and client delivery need a supported authenticated tool.','muted'));
  if(state.shared_workspace?.mail?.pdf_hold)node.append(el('p',state.shared_workspace.mail.pdf_hold,'notice'));
  if(state.shared_workspace?.mail?.incoming_permission?.permission.project_id===r.id)node.append(pdfMailPanel(r,state,tools));
  if(r.restriction){node.append(el('p','Contact is stopped. Prior preparation stays in history; no new sales output is released.','notice'));if(!interactive)return node;}
  if(!r.restriction&&!work.length)node.append(eventForm(r,'Prepare from the existing confirmed project context','project_preparation_requested',[],{},'Create the eligible preparation handoff'));
  for(const item of work){
    const section=el('details');section.append(el('summary',`${item.kind.replaceAll('-',' ')}${item.request?.round?` round ${item.request.round}`:''} · ${recordsOnly&&item.status==='Ready'?'Queued; authoring held':item.status} · requested by ${item.requested_by}`));
    if(recordsOnly)section.append(el('p',`Assigned to ${item.assigned_to}. ${item.execution?`Retained execution: ${item.execution.status}; no retry or continuation is authorized here.`:'No authoring started by this request.'}`,'notice'));
    if(item.hold)section.append(el('p',item.hold,'notice'));
    if(item.generation)section.append(el('p',`Source generation: ${item.generation.status}. Output: ${item.execution?.status??'Not rendered'}. ${item.generation.next}.`,'notice'));
    if(item.result)section.append(el('p',item.result.reference??item.result.internal_review,'source'),el('p',`Prepared by ${item.prepared_by}; awaiting human asset review. No send or client acceptance recorded.`,'muted'));
    const loaded=el('div');
    const sharedAuthoring=recordsOnly||interactive||['shared-project-continuation-v1','shared-refinement-generation-v1'].includes(state.shared_workspace?.capability);
    section.append(button(sharedAuthoring?'Load current context':'Load current context & output form',async()=>{try{
      const response=await fetch(deskPath(`/api/project-context/${r.id}/${item.id}`)),packet=await response.json();if(!response.ok)throw Error(packet.error);
      loaded.replaceChildren(el('p',`${packet.workflow.skill} · ${packet.workflow.output}`),el('p','Only the approved baseline is an approved asset. Exact source feedback may concern a draft or disputed alternative; it does not change approval.','notice'));
      const raw=el('details');raw.append(el('summary','Read the private source packet'));const pre=el('pre',JSON.stringify(packet,null,2));raw.append(pre);loaded.append(raw);
      if(item.status!=='Ready'||sharedAuthoring)return;
      let fields,fixed={work_id:item.id,context_sha256:packet.context_sha256};
      if(item.kind==='internal-scope'){fields=[['Internal scope and price review (never client-addressed)','internal_review','','textarea'],['This is an internal review only','internal_only',false,'checkbox']];}
      else{
        const choices=Object.values(state.asset_index??{}).filter(a=>a.scope==='project'&&a.project_id===r.id&&a.kind===(item.kind==='client-proposal'?'proposal':'mockup'));
        if(!choices.length){loaded.append(el('p','Register this project output in Shared assets first, then reload this form.','notice'));return;}
        // Exact asset and version are chosen together to avoid pairing unrelated files.
        for(const asset of choices){const sub=el('details');sub.append(el('summary',`Record output: ${asset.name}`));
          fields=[['Exact output version','version_id',Object.keys(asset.versions).at(-1),'text',Object.values(asset.versions).map(v=>({value:v.id,label:v.label}))],['I checked the rendered export and original company assets','export_reviewed',false,'checkbox']];
          if(item.kind==='website-concepts')fields.push(['Distinct desktop directions in the initial PDF','direction_count',5,'number']);
          sub.append(eventForm(r,'Record prepared output for review','project_work_recorded',fields,{...fixed,asset_id:asset.id,...(item.kind==='client-proposal'?{quote_sha256:packet.source.quote_sha256}:{})},'Record output; do not send'));loaded.append(sub);
        }return;
      }
      loaded.append(eventForm(r,'Record preparation for review','project_work_recorded',fields,fixed,'Save internal review'));
    }catch(error){tell(error.message,true);}}),loaded);if(interactive)section.append(interactiveAuthoringPanel(r,item,state,tools));node.append(section);
  }
  const last=work.filter(w=>['website-concepts','website-refinement'].includes(w.kind)&&w.status==='Review'&&w.result).at(-1);
  if(!r.restriction&&last&&!r.quote&&!r.agreement&&(!(recordsOnly||interactive)||['Discovery','Information requested','Preview','Proposal'].includes(r.stage))&&!work.some(w=>w.kind==='website-refinement'&&w.status!=='Held'&&!w.result)){
    const used=(r.pre_sale_refinements??[]).length,exceptions=(r.unpaid_refinement_exceptions??[]).filter(e=>!e.used_by);
    node.append(el('p',used?'The included unpaid refinement is used. Agree scope and price, or explicitly approve one additional unpaid round.':'One focused unpaid refinement is included before agreeing scope and price. Paid project revision rounds are separate.','notice'));
    if(!used||exceptions.length)node.append(eventForm(r,'Request a focused refinement of the exact prepared version','concept_refinement_requested',[
      ['Selected direction in that exact PDF','selected_direction',r.pre_sale_refinements?.at(-1)?.selected_direction??''],['Specific consolidated feedback','feedback','','textarea'],...(used?[['Explicit unused exception','exception_id',exceptions[0].id,'text',exceptions.map(e=>({value:e.id,label:`${e.granted_by}: ${e.reason}`}))]]:[])
    ],{asset_id:last.result.asset_id,version_id:last.result.version_id},'Queue one focused refinement'));
    if(used)node.append(eventForm(r,'Explicit exception for one additional unpaid round','unpaid_refinement_exception',[
      ['Why approve this extra unpaid round?','reason','','textarea'],['I approve exactly one additional unpaid round','approved',false,'checkbox']
    ],{extra_rounds:1},'Approve one extra unpaid round'));
  }
  return node;
}
function pdfMailPanel(r,state,{el,button,api,refresh,tell}){
 const mail=state.shared_workspace.mail,permission=mail.incoming_permission.permission,section=el('section'),action=state.actions[permission.action_id],request=state.operations?.requests?.[permission.action_id+'-intent'],coverage=mail.pdf_incoming,approval=action&&state.events[action.payload.approval_event],assigned=!r.follow_up_owner||r.follow_up_owner===state.current_operator;
 section.append(el('h3','Exact PDF message'),el('p',`Finite incoming permission: ${state.shared_workspace.standing.authorization_event??'Owner authorization required'} · package ${permission.package_sha256}. This permission does not approve a send.`, 'notice'),el('p',`Exact message: ${action?'Approved by '+approval?.actor:'Separate assigned-operator approval required'}. Sender: ${request?.status??'Not sent'}. Incoming: ${coverage?.status??'Not started'}${coverage?.hold?' · '+coverage.hold.code:''}. Existing routes: ${state.shared_workspace.standing.existing_routes_status}.`,'notice'));
 if(coverage)section.append(el('p',`Pre-send history ${coverage.anchor?.history_id??'not observed'} · covered through ${coverage.coverage?.history_id??'not established'}. Sender verification does not establish recipient delivery or recipient conversation grouping.`,'muted'));
 const reviewed=el('div');section.append(button('Load exact PDF message',async()=>{try{const p=await api('/api/exact-mail/package',{project_id:r.id,kind:'project',draft_id:permission.draft_id});reviewed.replaceChildren(el('p',`${p.from} to ${p.to}\nSubject: ${p.subject}\n\n${p.body}`,'reply-source'),el('p',`PDF ${p.attachments[0].sha256} · ${p.attachments[0].bytes} bytes. Package ${p.sha256}.`, 'source'));
  if(!action&&assigned&&!r.restriction){const checks=['I checked the complete body, facts, recipient and original PDF bytes','I approve this exact message separately from design, quote and client approval'].map(text=>{const label=el('label'),input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(text));reviewed.append(label);return input;}),approve=button('Approve exact PDF message',async()=>{try{await api('/api/exact-mail/approve',{project_id:r.id,kind:'project',draft_id:permission.draft_id,revision:state.revision,event_id:crypto.randomUUID(),package_sha256:p.sha256,approved:true,facts_checked:true});await refresh();}catch(error){tell(error.message,true);}});approve.disabled=true;for(const check of checks)check.addEventListener('change',()=>{approve.disabled=!checks.every(c=>c.checked);});reviewed.append(approve);}
 }catch(error){tell(error.message,true);}}),reviewed);
 if(action&&!request&&assigned&&!r.restriction){const send=button('Send approved PDF once',async()=>{try{const result=await api('/api/exact-mail/dispatch',{action_id:permission.action_id});tell(`Sender ${result.status}. Read the original intent; no automatic resend.`);await refresh();}catch(error){tell(error.message,true);}});send.disabled=!mail.runtime_enabled;section.append(send);}
 if(request&&request.status!=='Verified'&&request.raw_base64url&&approval?.actor===state.current_operator)section.append(button('Reconcile original PDF Sent proof',async()=>{try{await api('/api/exact-mail/reconcile',{action_id:permission.action_id});await refresh();}catch(error){tell(error.message,true);}}));
 return section;
}
