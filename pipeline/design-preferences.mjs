import {check,hash} from './lifecycle.mjs';

// shortcut: only these whole-sentence rules are machine-applied; broader language needs an author.
function interpret(feedback){
 const match=/^(?:(Always|Never|Maybe) )?use "([^"\r\n]{1,80})" for (heading font|body font|page background)\.?$/i.exec(feedback.trim());
 if(!match)return null;
 const target=match[3].toLowerCase().replaceAll(' ','_'),value=match[2];
 if(target==='page_background'?!/^#[a-f0-9]{6}$/i.test(value):!/^[-a-z0-9_]{1,50}$/i.test(value))return null;
 return {target,value:target==='page_background'?value.toUpperCase():value,mode:match[1]?.toLowerCase()==='never'?'never':'use',certainty:match[1]?.toLowerCase()==='maybe'?'tentative':'explicit'};
}
const incompatible=(a,b)=>a.mode==='use'&&b.mode==='use'?a.value!==b.value:a.mode!==b.mode&&a.value===b.value;
export function scopedDesignPreferences(state,project){
 const eventOrder=new Map(Object.keys(state.events).map((id,i)=>[id,i]));
 const preferences=Object.values(state.asset_index??{}).flatMap(a=>(a.feedback??[]).filter(f=>f.scope==='studio'||f.project_id===project).map(f=>({...f,asset_id:a.id,asset_name:a.name,reference:a.versions[f.version_id]?.reference??null,source_version_is_baseline:a.baseline_version===f.version_id,baseline_version:a.baseline_version??null,dispute:a.dispute??null,interpretation:'Quoted feedback; machine interpretation is limited to the separate design_preferences plan'})));
 const ordered=preferences.map(f=>({...f,baseline_approval_event:state.asset_index[f.asset_id].baseline_approval_event??null,order:eventOrder.get(f.id)??eventOrder.size})).sort((a,b)=>a.order-b.order);
 return {preferences,design_preferences:designPreferences(ordered)};
}
export function designPreferences(preferences){
 const feedback=preferences.map(f=>{const rule=interpret(f.feedback),source_baseline_changed=f.baseline_at_feedback!==f.baseline_version||f.approval_at_feedback!==f.baseline_approval_event,stale=!Object.hasOwn(f,'baseline_at_feedback')||f.scope==='project'&&source_baseline_changed;return {...f,rule,source_baseline_changed,status:stale?'stale':rule?.certainty??'tentative'};});
 const groups=new Map();
 for(const f of feedback.filter(f=>f.status==='explicit')){
  const k=f.scope+':'+f.rule.target;let group=groups.get(k);if(!group){group={scope:f.scope,target:f.rule.target,choices:{},constraints:[],conflict:null};groups.set(k,group);}
  const next={...f.rule,scope:f.scope,evidence_id:f.id,actor:f.actor,order:f.order};group.choices[f.actor]=next;
  group.constraints=group.constraints.filter(r=>r.actor!==f.actor||r.value!==next.value&&!(r.mode==='use'&&next.mode==='use'));group.constraints.push(next);
  const [owner,friend]=['owner','friend'].map(a=>group.choices[a]);
  const inconsistent=group.constraints.some((r,i)=>group.constraints.slice(i+1).some(other=>incompatible(r,other)));
  if(inconsistent)group.conflict??={opened_order:f.order,evidence_ids:group.constraints.map(c=>c.evidence_id)};
  if(group.conflict&&owner&&friend&&owner.order>group.conflict.opened_order&&friend.order>group.conflict.opened_order&&owner.mode===friend.mode&&owner.value===friend.value&&!inconsistent)group.conflict=null;
 }
 const conflicts=[...groups.values()].filter(g=>g.conflict).map(g=>({scope:g.scope,target:g.target,...g.conflict,choices:Object.values(g.choices),action:'Keep approved baseline until both operators give fresh matching directions'}));
 let active=[...groups.values()].filter(g=>!g.conflict).flatMap(g=>g.constraints);
 for(const target of new Set(active.map(r=>r.target))){const rules=active.filter(r=>r.target===target);if(rules.some((r,i)=>rules.slice(i+1).some(other=>incompatible(r,other))))conflicts.push({target,scope:'project/studio',evidence_ids:rules.map(r=>r.evidence_id),action:'Project direction contradicts studio direction; explicitly reconcile the scopes before changing this property'});}
 active=active.filter(r=>!conflicts.some(c=>c.target===r.target));
 const suggestions=[];for(const f of feedback.filter(f=>f.status==='tentative')){const normalized=f.feedback.trim().toLowerCase().replace(/\s+/g,' '),matches=feedback.filter(other=>other.status==='tentative'&&other.scope===f.scope&&other.feedback.trim().toLowerCase().replace(/\s+/g,' ')===normalized);if(matches.length>=2&&!suggestions.some(s=>s.evidence_ids.includes(f.id)))suggestions.push({scope:f.scope,feedback:f.feedback,evidence_ids:matches.map(m=>m.id),status:'suggested standard',promoted:false,action:'Suggestion only; a signed explicit studio-scoped instruction is required for a shared standard'});}
 return {method:'Bounded rules; semantic interpretation requires author review',feedback,active,conflicts,suggestions,questions:{maximum:3,skip:'Use your judgment',when:'Only consequential unresolved design facts; uncertainty never creates approval or resolves an operator conflict'}};
}

const roleFor=target=>target==='heading_font'?'heading':'body';
function propertyValues(pages,target){return target==='page_background'?pages.map(p=>p.background??'#FFFFFF'):pages.flatMap(p=>(p.commands??[]).filter(c=>['text','paragraph'].includes(c.op)&&c.role===roleFor(target)).map(c=>c.font??'Manrope'));}
function setProperty(pages,target,value){for(const page of pages){if(target==='page_background')page.background=value;else for(const item of page.commands??[])if(['text','paragraph'].includes(item.op)&&item.role===roleFor(target))item.font=value;}}
function withoutChanges(pages,targets){const copy=structuredClone(pages);for(const p of copy){if(targets.has('page_background'))delete p.background;for(const c of p.commands??[])if(['text','paragraph'].includes(c.op)&&targets.has(c.role+'_font'))delete c.font;}return copy;}

export function applyDesignPreferences(source,packet,baseline=null){
 if(!['website-concepts','website-refinement'].includes(source.kind))return source;
 const plan=packet.source.design_preferences,applied=structuredClone(source),pages=applied.pages??[],targets=new Set([...plan.active,...plan.conflicts].map(r=>r.target));
 if([...targets].some(t=>t.endsWith('_font')))check(pages.flatMap(p=>p.commands??[]).filter(c=>['text','paragraph'].includes(c.op)).every(c=>['heading','body'].includes(c.role)),'Classify every text command as heading or body for preference checks');
 const changes=new Set(plan.active.map(r=>r.target));for(const rule of plan.active.filter(r=>r.mode==='use')){check(propertyValues(pages,rule.target).length,'No rendered property matches the explicit preference');setProperty(pages,rule.target,rule.value);}
 for(const conflict of plan.conflicts){check(baseline,'Conflicting preferences require a verified declarative approved baseline; keep the baseline until both agree');const expected=propertyValues(baseline.pages,conflict.target);check(expected.length&&new Set(expected).size===1,'Conflicting property has no single approved value; preserve the approved output and resolve the conflict');setProperty(pages,conflict.target,expected[0]);}
 for(const rule of plan.active.filter(r=>r.mode==='never'))check(propertyValues(pages,rule.target).length&&!propertyValues(pages,rule.target).includes(rule.value),'Authored output violates an explicit never preference; choose an allowed alternative');
 if(baseline){
  check(!baseline.dispute||hash(pages)===hash(baseline.pages),'An open asset dispute preserves the exact approved composition');
  check(hash(withoutChanges(pages,changes))===hash(withoutChanges(baseline.pages,changes)),'Approved composition or wording changed outside explicit supported preferences; reopen the exact change before authoring');
 }
 const review=plan.feedback.filter(f=>['tentative','stale'].includes(f.status));
 check(!review.length||Array.isArray(source.preference_review)&&review.every(f=>source.preference_review.some(r=>r.feedback_id===f.id&&['defer','applied by author','preserved baseline'].includes(r.decision)&&typeof r.notes==='string'&&r.notes.trim()&&r.notes.length<=1000)),'Review each tentative/stale feedback item explicitly; no inferred approval or silent application');
 applied.preference_application={method:plan.method,plan_sha256:hash(plan),applied:plan.active.map(r=>({evidence_id:r.evidence_id,target:r.target,mode:r.mode,value:r.value})),preserved_conflicts:plan.conflicts,baseline:baseline?{asset_id:baseline.asset_id,version_id:baseline.version_id,source_sha256:baseline.source_sha256,comparison:'Exact pages except explicit supported property changes'}:null,author_review:source.preference_review??[],limits:'Typography/background rules only. Meaning, role classification, visual quality and external original fidelity require author/reviewer inspection. No automatic shared standard, model training or unattended authoring.'};
 return applied;
}
