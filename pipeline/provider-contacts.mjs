import {hash} from './lifecycle.mjs';

const accepted=new Set(['Owner/operator match','Business staff match']);
export function providerContactView(record,now=new Date()) {
  const p=record.provider_contact_enrichment;
  if(!p)return null;
  const fresh=at=>{const age=+now-Date.parse(at);return Number.isFinite(age)&&age>=0&&age<=30*86400000;};
  const current=p.schema_version===1&&p.company_id===record.company_id&&p.bound_contact_sha256===hash(record.contact)&&fresh(p.reviewed_at)&&fresh(p.received_at);
  const usable=current&&accepted.has(p.outcome);
  const phones=usable?(p.phones??[]).filter(n=>['mobile_phone','direct_phone','corporate_phone'].includes(n.kind)&&/^\+?[\d ().-]{7,50}$/.test(n.number??'')).map(n=>{
    const dnc_status=['found','not_found','pending'].includes(n.dnc_status)?n.dnc_status:'not_provided';
    return {...n,dnc_status,blocked:dnc_status==='found',screening_clear:dnc_status==='not_found'};
  }):[];
  return {current,outcome:current?p.outcome:'Needs recheck',person:usable?p.person:null,phones,notes:current?p.notes??[]:['The business contact changed or this provider evidence/review is stale. Recheck the retained result before using it.'],received_at:p.received_at,reviewed_at:p.reviewed_at};
}

export function providerContactSummary(state,now=new Date()) {
  const reviews=Object.values(state.prospects).map(r=>providerContactView(r,now)).filter(v=>v?.current),phones=reviews.flatMap(v=>v.phones);
  return {reviewed:reviews.length,owner_matches:reviews.filter(v=>v.outcome==='Owner/operator match').length,staff_matches:reviews.filter(v=>v.outcome==='Business staff match').length,with_numbers:reviews.filter(v=>v.phones.length).length,numbers:phones.length,new_numbers:phones.filter(p=>!p.same_business_line).length,dnc_listed:phones.filter(p=>p.blocked).length,screening_unavailable:phones.filter(p=>['pending','not_provided'].includes(p.dnc_status)).length};
}
