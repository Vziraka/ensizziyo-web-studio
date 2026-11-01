import {check,hash} from './lifecycle.mjs';

export const replyAttachmentLimit=20_000_000;
const key=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validateStudioPermission(state,ids){check(Array.isArray(ids)&&ids.length<=12&&new Set(ids).size===ids.length&&ids.every(id=>key(id)&&state.asset_index?.[id]?.scope==='studio'),'Explicit exact studio asset IDs required');return [...ids].sort();}
function descriptor(state,project,id,studioIds){
 const a=state.asset_index?.[id],v=a?.versions?.[a.baseline_version],o=v?.verified_original;
 const approvalIds=a?.baseline_approval_event?[a.baseline_approval_event]:a?.baseline_agreement_events??[],approvals=approvalIds.map(e=>state.events[e]),single=approvalIds.length===1&&['owner','friend'].includes(approvals[0]?.actor)&&approvals[0]?.type==='asset_version_selected',joint=approvalIds.length===2&&new Set(approvals.map(e=>e?.actor)).size===2&&['owner','friend'].every(role=>approvals.some(e=>e?.actor===role));
 check(a&&a.id===id&&(a.scope==='project'&&a.project_id===project||a.scope==='studio'&&studioIds.includes(id))&&!a.dispute&&v&&v.id===a.baseline_version&&(single||joint)&&approvals.every(e=>e&&['asset_version_selected','asset_version_disputed'].includes(e.type)&&e.prospect_id==='studio-assets'&&e.data.asset_id===id&&e.data.version_id===v.id)&&o&&o.reference===v.reference&&o.mime_type==='application/pdf'&&sha(o.sha256)&&Number.isSafeInteger(o.bytes)&&o.bytes>0&&o.bytes<=replyAttachmentLimit,'Choose a current approved undisputed PDF with a verified bounded original in this project scope');
 check(typeof a.name==='string'&&a.name.trim()&&a.name.length<=200&&!/[\x00-\x1f\x7f]/.test(a.name)&&typeof v.label==='string'&&v.label.length<=200&&!/[\x00-\x1f\x7f]/.test(v.label),'Use safe PDF and version labels');
 return {asset_id:id,version_id:v.id,sha256:o.sha256,name:a.name,version_label:v.label,bytes:o.bytes,mime:'application/pdf',scope:a.scope,baseline_approval_event:a.baseline_approval_event??null,baseline_agreement_events:approvalIds,approval_sha256:hash(approvals),...(a.scope==='studio'?{studio_permitted:true}:{})};
}
export function replyAttachmentCatalogue(state,project,studioIds=[]){
 const candidates=[];for(const id of Object.keys(state.asset_index??{}).sort()){try{candidates.push(descriptor(state,project,id,studioIds));}catch{}}
 return {items:candidates.slice(0,12),truncated:candidates.length>12,limit:12};
}
export function selectReplyAttachments(state,project,selections,studioIds=[]){
 check(Array.isArray(selections)&&selections.length<=2,'Select at most two approved PDF attachments');const seen=new Set();let total=0;
 return selections.map(s=>{check(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).sort().join(',')==='asset_id,sha256,version_id'&&key(s.asset_id)&&key(s.version_id)&&sha(s.sha256)&&!seen.has(s.asset_id),'Use unique exact catalogue asset/version/hash selections');seen.add(s.asset_id);const d=descriptor(state,project,s.asset_id,studioIds);check(d.version_id===s.version_id&&d.sha256===s.sha256,'The selected PDF baseline or original hash changed');total+=d.bytes;check(total<=replyAttachmentLimit,'Combined PDF attachments exceed the 20,000,000-byte limit');return d;});
}
export function currentReplyAttachments(state,project,attachments){
 check(Array.isArray(attachments)&&attachments.length<=2,'Saved reply attachment bundle is invalid');const studioIds=attachments.filter(a=>a.scope==='studio'&&a.studio_permitted===true).map(a=>a.asset_id),selected=selectReplyAttachments(state,project,attachments.map(({asset_id,version_id,sha256})=>({asset_id,version_id,sha256})),studioIds);check(hash(selected)===hash(attachments),'Saved PDF approval, label, size or permission changed');return selected;
}
