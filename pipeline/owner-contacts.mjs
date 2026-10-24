import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { check, hash } from './lifecycle.mjs';
import { collectPublicSources, validateJob, validateSnapshots } from './sources.mjs';

const domain = value => new URL(value).hostname.toLowerCase().replace(/^www\./,'');
const digits = value => String(value??'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const normalize = value => value.replace(/\s+/g,' ').trim().toLowerCase();
const canonical = value => value.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
const fresh = (at,now) => Number.isFinite(Date.parse(at)) && Date.parse(at)<=+now && +now-Date.parse(at)<=30*86400000;
const binding = r => hash(r.contact);
const role = /\b(?:owner|founder|operator|president|ceo|director|principal)\b/i;

export function contactEvidenceView(r,now=new Date()){
 const c=r.contact??{},maxDays=r.qualification?.verdict==='Verification call only'?14:30;
 const changed=[r.owner_contact,r.contact_review].some(v=>v&&v.bound_contact_sha256!==binding(r));
 const packet=r.verification?.packet,invalidPacket=packet&&(r.verification.packet_sha256!==hash(packet)||r.qualification?.packet_sha256!==r.verification.packet_sha256);
 const wrong=Object.values(r.calls??{}).some(call=>!call.undone&&call.outcome==='wrong_contact');
 const conversation=r.verification?.conversation,confirmedPhone=conversation?.identity_confirmed===true&&conversation.active_confirmed===true&&conversation.contact_binding?.phone===c.phone&&r.calls?.[conversation.call_id]?.outcome==='connected'&&!r.calls[conversation.call_id].undone;
 const emailEvidence=c.email_evidence,callId=emailEvidence?.source?.startsWith('call:')?emailEvidence.source.slice(5):null,transcript=r.transcripts?.[callId];
 const confirmedEmail=emailEvidence?.email===c.email&&transcript&&typeof transcript.text==='string'&&hash(transcript.text)===transcript.sha256&&typeof emailEvidence.quote==='string'&&emailEvidence.quote.includes(c.email)&&transcript.text.includes(emailEvidence.quote)&&r.calls?.[callId]?.outcome==='connected'&&!r.calls[callId].undone;
 function channel(value,label,checkedAt,source,reason){
  const valid=Number.isFinite(Date.parse(checkedAt)),current=valid&&Date.parse(checkedAt)<=+now&&+now-Date.parse(checkedAt)<=maxDays*86400000;
  const why=reason??(invalidPacket?'Retained verification integrity changed':changed?'Contact binding changed':!source?'Source evidence missing':!current?'Source check expired, future-dated or missing':null);
  return {label,checked_at:checkedAt??null,source:source??null,max_age_days:maxDays,expires_at:valid?new Date(Date.parse(checkedAt)+maxDays*86400000).toISOString():null,reuse_current_evidence:Boolean(value&&!why),status:!value?'No saved route':why?`Recheck: ${why}`:'Reuse retained proof; do not repeat a fresh lookup'};
 }
 const publicSource=typeof c.source==='string'&&/^https:\/\//i.test(c.source)?c.source:null;
 const phoneLabel=!c.phone?'No business number saved':wrong?'Wrong contact reported':confirmedPhone?'Business identity confirmed during conversation':c.phone_verified&&publicSource?'Published business number':c.verified&&publicSource?'Business number · source reviewed':'Number needs source review';
 const phone=channel(c.phone,phoneLabel,confirmedPhone?conversation.at:c.checked_at,confirmedPhone?`call:${conversation.call_id}`:publicSource,wrong?'Wrong contact outcome; verify the public phone/ownership':!confirmedPhone&&!c.phone_verified&&!c.verified?'Number needs source review':null);
 const profile=r.research_profile?.business_email,published=profile?.email===c.email;
 const emailLabel=!c.email?'No business email saved':r.reply?.kind==='bounce'?'Bounce reported · route held':confirmedEmail?'Email confirmed during conversation':published?`Published ${profile.kind==='Owner/operator business'?'owner':'general'} business email`:c.verified?'Business email · source reviewed':'Email needs source review';
 const email=channel(c.email,emailLabel,confirmedEmail?emailEvidence.confirmed_at:published?profile.source.checked_at:c.checked_at,confirmedEmail?emailEvidence.source:published?profile.source.url:publicSource,r.reply?.kind==='bounce'?'Provider bounce; review this route without automatic resumption':!confirmedEmail&&!published&&!c.verified?'Email needs source review':null);
 return {phone,email,limits:'Evidence labels describe saved observations, not guaranteed reachability or delivery. Existing call, email, stop and release rules still apply.'};
}

export function ownerContactView(r,now=new Date()) {
  const a=r.owner_contact,valid=a&&a.bound_contact_sha256===binding(r)&&fresh(a.reviewed_at,now)&&(!a.person||fresh(a.person.source?.checked_at,now))&&(!a.direct_phone||fresh(a.direct_phone.source?.checked_at,now));
  const published=Boolean(r.contact?.phone&&(r.contact.verified||r.contact.phone_verified===true)&&fresh(r.contact.checked_at,now));
  const stale=Boolean(a&&!valid),direct=valid&&a.direct_phone;
  return {classification:direct?'Owner/operator direct business':stale||!published?'Unverified number':'General business line',
    confidence:direct?'Source-linked professional number':valid&&a.person?'Owner identity supported; direct number unverified':published&&!stale?'Business line supported; owner link unverified':'Contact evidence needs verification',
    person:valid?a.person:null,direct_phone:direct||null,notes:valid?a.notes??[]:[],checked_at:valid?a.reviewed_at:r.contact?.checked_at??null,
    source:r.contact?.source??null,evidence_ref:valid?a.evidence_ref:null,
    review:r.contact_review?{...r.contact_review,current:r.contact_review.bound_contact_sha256===binding(r)&&fresh(r.contact_review.reviewed_at,now)}:null,
    next_action:direct?'Confirm the person still operates the business and can be reached at this published number.':stale?'Recheck the changed or stale contact evidence before using an owner-direct claim.':valid&&a.person?'Find an explicit public professional number for this person; the shop line alone does not establish direct access.':'Identify the current owner/operator from business-controlled or authoritative professional sources, then verify an explicitly linked business number.'};
}
export function ownerContactSummary(state,now=new Date()) {
  const all=Object.values(state.prospects).map(r=>ownerContactView(r,now));
  return {total:all.length,owner_direct:all.filter(a=>a.direct_phone).length,general_business:all.filter(a=>a.classification==='General business line').length,unverified:all.filter(a=>a.classification==='Unverified number').length,identified:all.filter(a=>a.person).length};
}
function boundJob(r,job,{source_approvals=[],snapshots}={}) {
  validateJob(job);
  check(job.research_version===3&&job.business_name===r.name&&domain(job.website)===domain(r.contact.source),'Contact capture must stay on the existing business domain and identity');
  check(Array.isArray(source_approvals)&&source_approvals.length<=4,'Bound reviewed professional sources');
  for(const url of job.seed_urls)if(domain(url)!==domain(job.website)){
    const approval=source_approvals.find(a=>a.url===url),source=snapshots?.sources.find(s=>s.url===url);
    let linked=false;if(approval?.business_url)try{validateJob({...job,seed_urls:[approval.business_url]});linked=domain(approval.business_url)===domain(job.website)&&source?.text.includes(approval.business_url);}catch{}
    check(approval&&approval.business_name===r.name&&['Business-linked profile','Professional publication','Official business registry'].includes(approval.kind)&&source&&source.capture_method!=='search_snippet'&&typeof approval.identity_excerpt==='string'&&approval.identity_excerpt.length>=10&&approval.identity_excerpt.length<=350&&(canonical(approval.identity_excerpt).includes(canonical(r.name.split(' / ')[0]))||linked)&&normalize(source.text).includes(normalize(approval.identity_excerpt))&&!/(?:^|\.)(?:whitepages\.com|spokeo\.com|truthfinder\.com|radaris\.com|beenverified\.com|fastpeoplesearch\.com)$/.test(domain(url)),'External domain contact evidence needs an explicit reviewed business identity; private-person brokers and search snippets are excluded');
  }
}

export async function retainContactDiscovery(directory,r,job,{connect,now=()=>new Date(),...captureOptions}={}) {
  boundJob(r,job);const path=join(directory,job.id,'discovery.json'),bound_contact_sha256=binding(r);
  try {const saved=JSON.parse(await readFile(path,'utf8'));check(saved.sha256===hash(saved.report)&&saved.report.prospect_id===r.id&&saved.report.bound_contact_sha256===bound_contact_sha256&&hash(saved.report.job)===hash(job),'Retained contact discovery changed; reconcile rather than repeat');return saved;}
  catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(join(directory,job.id),{recursive:true,mode:0o700});
  const report={schema_version:1,prospect_id:r.id,company_id:r.company_id,bound_contact_sha256,job,checked_at:now().toISOString(),limitations:'Public business sources and identity candidates only. Search results, masked names, number availability flags and general shop phones do not verify an owner-direct line.'};
  try {report.snapshots=await collectPublicSources(job,{...captureOptions,now});}
  catch(e){report.capture_failure=String(e.message).slice(0,300);}
  report.apollo={status:'Not connected'};
  if(connect){
    try {
      const input={q_organization_domains_list:[domain(job.website)],person_titles:['owner','founder','co-owner','operator','CEO','president'],include_similar_titles:false,per_page:5,page:1};
      const raw=await connect.call('mcp__codex_apps__apollo_io_apollo_mixed_people_api_search',input);
      check(!raw.isError&&Buffer.byteLength(JSON.stringify(raw))<=200_000,'Identity search unavailable or response exceeds bound');
      const data=raw.structuredContent??JSON.parse(raw.content.filter(c=>c.type==='text').map(c=>c.text).join(''));
      check(Array.isArray(data.people)&&data.people.length<=5,'Identity search response changed');
      report.apollo={status:data.people.length?'Candidates':'No match',input,raw_response:raw,response_sha256:hash(raw),candidates:data.people.map(p=>({id:p.id,first_name:p.first_name,last_name_obfuscated:p.last_name_obfuscated,title:p.title,organization:p.organization?.name,phone_availability:p.has_direct_phone??null,requires_source_verification:true}))};
    }catch(e){report.apollo={status:'Unavailable',reason:String(e.message).slice(0,200)};}
  }
  const saved={report,sha256:hash(report)};await writeFile(path,JSON.stringify(saved,null,2),{flag:'wx',mode:0o600});return saved;
}

export async function applyOwnerContact(app,p) {
  check(p?.schema_version===1&&/^[a-z0-9-]{1,60}$/.test(p.id??'')&&typeof p.reviewed_by==='string'&&p.reviewed_by.trim().length>=3&&fresh(p.reviewed_at,app.now()),'A current identified source review is required');
  return app.change(state=>{
    const r=state.prospects[p.prospect_id];
    check(r&&r.company_id===p.company_id&&p.bound_contact_sha256===binding(r),'Existing contact identity/binding changed');
    boundJob(r,p.job,p);validateSnapshots(p.snapshots,p.job);
    check(p.job.id===p.id&&p.job.as_of<=p.reviewed_at.slice(0,10)&&p.snapshots.sources.every(s=>fresh(s.fetched_at,app.now())&&Date.parse(s.fetched_at)<=Date.parse(p.reviewed_at)),'Contact source identity/date changed');
    const cite=(value)=>{
      const s=p.snapshots.sources.find(s=>s.url===value.source_url);
      check(s&&s.capture_method!=='search_snippet'&&typeof value.excerpt==='string'&&value.excerpt.length>=5&&value.excerpt.length<=350&&normalize(s.text).includes(normalize(value.excerpt)),'Contact excerpt is missing from retained primary/professional source');
      return {url:s.url,checked_at:s.fetched_at,source_sha256:s.content_sha256,excerpt:value.excerpt};
    };
    let person=null,direct_phone=null;
    if(p.person){
      check(typeof p.person.name==='string'&&p.person.name.trim().length>=2&&p.person.name.length<=120&&typeof p.person.role==='string'&&p.person.role.length<=100&&role.test(p.person.role),'Explicit professional owner/operator identity required');
      const source=cite(p.person);
      const phrase=p.person.source_role_phrase??p.person.role;
      check(typeof phrase==='string'&&phrase.length<=100&&(/\b(?:owners?|founders?|operator|president|ceo|director|principal|founded|owns|owned|operated)\b/i.test(phrase))&&normalize(p.person.excerpt).includes(normalize(p.person.name))&&normalize(p.person.excerpt).includes(normalize(phrase)),'Owner name and role must be in the exact identity excerpt');
      if(p.person.source_role_phrase)check((/founder/i.test(p.person.role)&&/founder|founded/i.test(phrase))||(/owner/i.test(p.person.role)&&/owner|owns|owned/i.test(phrase))||(/operator/i.test(p.person.role)&&/operator|operated/i.test(phrase))||normalize(p.person.role).includes(normalize(phrase)),'Source wording must support the stated professional role');
      check(p.person.current_role_status===undefined||['Business currently lists this role','Historical founder; current role unconfirmed','Professional source; current role unconfirmed'].includes(p.person.current_role_status),'Keep current operating role separate from identity evidence');
      person={name:p.person.name,role:p.person.role,source,...(p.person.current_role_status?{current_role_status:p.person.current_role_status}:{})};
    }
    if(p.direct_phone){
      const d=p.direct_phone,source=cite(d);
      const citedName=d.name_in_excerpt??person?.name;
      check(person&&typeof citedName==='string'&&[normalize(person.name),normalize(person.name).split(' ')[0]].includes(normalize(citedName))&&typeof d.number==='string'&&d.number.length<=50&&/^\d{10}$/.test(digits(d.number))&&d.public_professional===true&&d.explicit_person_link===true&&normalize(d.excerpt).includes(normalize(citedName))&&digits(d.excerpt).includes(digits(d.number))&&/\b(?:call|phone|telephone|text|direct|reach|contact)\b/i.test(d.excerpt),'Direct number needs an explicit public professional person-to-number link');
      direct_phone={number:d.number,source};
    }
    const packet_sha256=hash(p);
    if(r.owner_contact?.evidence_ref===`owner-contact:${p.id}`){check(r.owner_contact.packet_sha256===packet_sha256,'Retained owner-contact review changed');return {duplicate:true,prospect_id:r.id};}
    // Evidence is additive: it never replaces the provider-bound phone or authorizes outreach.
    check(p.notes===undefined||Array.isArray(p.notes)&&p.notes.length<=4&&p.notes.every(s=>typeof s==='string'&&s.length<=600),'Keep contact-review notes bounded');
    r.owner_contact={schema_version:1,bound_contact_sha256:p.bound_contact_sha256,reviewed_at:p.reviewed_at,reviewed_by:p.reviewed_by,person,direct_phone,notes:p.notes??[],packet_sha256,evidence_ref:`owner-contact:${p.id}`};
    state.revision++;state.updated_at=app.now().toISOString();return {duplicate:false,prospect_id:r.id,view:ownerContactView(r,app.now())};
  });
}
