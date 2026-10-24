import {deskPath} from './paths.js';

export function preparationPanel(r,state,{el,button,eventForm,tell}){
  const work=Object.values(r.project_work??{}),node=el('section');
  node.append(el('h3','Project preparation'),el('p','Load current private context for the named workflow. A handoff is a task; file retrieval, authoring and client delivery need a supported authenticated tool.','muted'));
  if(r.restriction){node.append(el('p','Contact is stopped. Prior preparation stays in history; no new sales output is released.','notice'));return node;}
  if(!work.length)node.append(eventForm(r,'Prepare from the existing confirmed project context','project_preparation_requested',[],{},'Create the eligible preparation handoff'));
  for(const item of work){
    const section=el('details');section.append(el('summary',`${item.kind.replaceAll('-',' ')}${item.request?.round?` round ${item.request.round}`:''} · ${item.status} · requested by ${item.requested_by}`));
    if(item.hold)section.append(el('p',item.hold,'notice'));
    if(item.result)section.append(el('p',item.result.reference??item.result.internal_review,'source'),el('p',`Prepared by ${item.prepared_by}; awaiting human asset review. No send or client acceptance recorded.`,'muted'));
    const loaded=el('div');
    section.append(button('Load current context & output form',async()=>{try{
      const response=await fetch(deskPath(`/api/project-context/${r.id}/${item.id}`)),packet=await response.json();if(!response.ok)throw Error(packet.error);
      loaded.replaceChildren(el('p',`${packet.workflow.skill} · ${packet.workflow.output}`),el('p','Only the approved baseline is an approved asset. Exact source feedback may concern a draft or disputed alternative; it does not change approval.','notice'));
      const raw=el('details');raw.append(el('summary','Read the private source packet'));const pre=el('pre',JSON.stringify(packet,null,2));raw.append(pre);loaded.append(raw);
      if(item.status!=='Ready')return;
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
    }catch(error){tell(error.message,true);}}),loaded);node.append(section);
  }
  const last=work.filter(w=>['website-concepts','website-refinement'].includes(w.kind)&&w.status==='Review'&&w.result).at(-1);
  if(last&&!r.quote&&!r.agreement&&!work.some(w=>w.kind==='website-refinement'&&w.status!=='Held'&&!w.result)){
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
