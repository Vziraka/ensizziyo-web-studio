import {validateOpeningAssessment} from './opening-policy.mjs';
import { check, hash } from './lifecycle.mjs';
import { validateJob, validateSnapshots } from './sources.mjs';
import {businessType,validateBusinessType,businessTypes} from './business-types.mjs';
import {buildResearchProfile} from './research-profile.mjs';

export const discoveryChannels=Object.freeze(['Public web search','Google Search','Google Maps','Instagram','Facebook','Local directory','Referral']);

export const verificationLane = r => r.call_lane === 'verification';
export const callStages = ['Ready to contact', 'Contacting', 'Ready to verify', 'Verifying', 'Callback'];
const text = (s, max = 1600) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
export const phoneDigits = s => String(s ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export function verificationData(packet, now, controlled = false) {
  check(packet?.schema_version === 1 && /^[a-z0-9-]{1,60}$/.test(packet.id ?? '') && text(packet.business_name, 250) &&
    text(packet.category, 150) && text(packet.area, 200) && text(packet.topic), 'Bounded local-business verification identity required');
  if(packet.business_type)validateBusinessType(packet.business_type);
  else check(!businessType(packet).unclassified,'Choose a supported business category');
  check(text(packet.reviewed_by, 200) && text(packet.first_party_note) && Array.isArray(packet.unknowns) && packet.unknowns.length > 0 && packet.unknowns.length <= 12 && packet.unknowns.every(s => text(s)), 'Record first-party ownership review and explicit unknowns');
  check(packet.profile_version===undefined||packet.profile_version===1,'Unknown business-profile version');
  check(Array.isArray(packet.sources) && packet.sources.length > 0 && packet.sources.length <= (packet.profile_version===1?4:2), 'Bound the retained verification sources');
  if(packet.profile_version===1)check(packet.sources.every(s=>s.kind==='business'&&new URL(s.url).hostname.replace(/^www\./,'')===new URL(packet.discovery?.website_url).hostname.replace(/^www\./,'')),'Business profile sources must belong to the verified first-party host');
  for (const s of packet.sources) {
    check(['business', 'social', 'directory'].includes(s.kind) && s.capture_method !== 'search_snippet', 'Snippets cannot establish a public business phone');
    if(s.kind==='directory')check(packet.discovery?.source_url===s.url,'Directories are limited to the retained discovery/locality source');
    if (!controlled) validateJob({ id: packet.id, business_name: packet.business_name, website: '', research_version: 3, as_of: s.checked_at, seed_urls: [s.url] });
    validateSnapshots({ sources: [s] }, { research_version: 3, seed_urls: [s.url], as_of: s.checked_at });
    check(Date.parse(s.fetched_at) <= +now && +now - Date.parse(s.fetched_at) <= 14 * 86400000, 'Verification source is stale or from the future');
  }
  const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  for (const kind of ['identity', 'location', 'offering', 'public_phone']) {
    const claim = packet[kind], s = packet.sources.find(s => s.url === claim?.url);
    check(s && text(claim.excerpt, 500) && s.text.includes(claim.excerpt), 'Each verification claim needs an exact retained source excerpt');
    if(kind!=='location')check(['business','social'].includes(s.kind),'Directories cannot establish business identity, offering or public phone');
    else if(s.kind==='directory')check(normalize(s.text).includes(normalize(packet.business_name)),'Directory locality must name the exact business');
  }
  const d=packet.discovery;
  if(d){
    check(discoveryChannels.includes(d.channel)&&packet.sources.some(s=>s.url===d.source_url),'Retain the actual discovery source separately from contact proof');
    check(['Verified site','No verified site found','Not checked'].includes(d.website_status)&&text(d.customer_channel,300)&&text(d.next_check,600),'Record website status, customer channel uncertainty and the next check');
    if(d.website_status==='Verified site'){
      validateJob({id:packet.id,business_name:packet.business_name,website:d.website_url,research_version:3,as_of:packet.sources[0].checked_at,seed_urls:[d.website_url]});
      check(packet.sources.some(s=>s.kind==='business'&&new URL(s.url).hostname.replace(/^www\./,'')===new URL(d.website_url).hostname.replace(/^www\./,'')),'A verified website needs its matching retained business capture');
    }
    else check(!d.website_url,'An unverified website status cannot claim a website URL');
  }
  check(normalize(packet.business_name).includes(normalize(packet.identity.excerpt)), 'Business name differs from the retained identity');
  if(packet.owner_evidence){const o=packet.owner_evidence,s=packet.sources.find(s=>s.url===o.url);check(s&&text(o.name,200)&&text(o.role,150)&&text(o.excerpt,500)&&s.text.includes(o.excerpt)&&normalize(o.excerpt).includes(normalize(o.name))&&normalize(o.excerpt).includes(normalize(o.role)),'Published owner evidence needs an exact name and role source');}
  if(packet.established_evidence){const e=packet.established_evidence;check(text(e.excerpt,200)&&packet.sources.some(s=>s.url===e.url&&s.text.includes(e.excerpt)),'Established-business signals need retained source evidence');}
  check(/fairfax|vienna|arlington|alexandria|chantilly|centreville|herndon|reston|annandale|mclean|falls church|leesburg|ashburn|sterling|loudoun|woodbridge|manassas|virginia|\bva\b|washington|\bdc\b|maryland|\bmd\b|great falls|lorton|burke|oakton|montgomery|prince george|bethesda|rockville|silver spring|gaithersburg|potomac|hyattsville|bowie|springfield|dmv/i.test(packet.location.excerpt), 'Retain the specific DMV location check');
  check(controlled ? !packet.phone : typeof packet.phone === 'string' && /^[+\d(). -]+$/.test(packet.phone) && phoneDigits(packet.phone).length === 10 && phoneDigits(packet.public_phone.excerpt).includes(phoneDigits(packet.phone)), 'Retain the exact public business phone; fictional records have no dialable phone');
  const checked = packet.sources.map(s => s.fetched_at).sort()[0], evidenceRef = `verification:${packet.id}`, digest = hash(packet);
  if(packet.profile_review)check(hash(packet.profile_review.owner??null)===hash(packet.owner_evidence??null),'Profile owner must match the independently retained owner evidence');
  const profile=packet.profile_version===1?buildResearchProfile(packet.sources,packet.profile_evidence?.sources??[],packet.profile_review??{},now):null;
  if(packet.opening_assessment)validateOpeningAssessment(packet);
  const opening=verificationOpening(packet);
  if(packet.opening!==undefined)check(packet.opening===opening,'Prepared opening must match the retained service, offering and location evidence');
  return { company_id: `verification-${hash(controlled ? packet.id : phoneDigits(packet.phone)).slice(0, 24)}`, name: packet.business_name, category: packet.category, area: packet.area,
    controlled, call_lane: 'verification', idea: packet.topic,
    ...(packet.business_type?{business_type:structuredClone(packet.business_type)}:{}),
    ...(d?{discovery_source:structuredClone(d)}:{}),
    ...(profile?{research_profile:profile}:{}),
    contact: { email: controlled ? `${packet.id}@example.invalid` : profile?.business_email?.email??null, phone: packet.phone ?? null, verified: !controlled&&Boolean(profile?.business_email), phone_verified: true, checked_at: checked, source: packet.public_phone.url,...(profile?.business_email?{email_evidence:profile.business_email.source}: {}) },
    qualification: { verdict: 'Verification call only', independent_review: 'Not a detailed assessment', checked_at: checked, evidence_ref: evidenceRef, packet_sha256: digest },
    verification: { packet: structuredClone(packet), packet_sha256: digest, reviewed_at: now.toISOString(), current_activity: 'Unconfirmed', owner_goals: 'Unknown', opening, owner_question: text(packet.owner_question) ? packet.owner_question : 'What would you most like to make easier for customers or for yourself?' } };
}

export function validateVerificationRecord(r, at) {
  check(verificationLane(r) && r.qualification?.verdict === 'Verification call only' && r.contact?.phone_verified === true, 'Public identity/phone verification required');
  check(r.verification?.packet_sha256 === hash(r.verification?.packet) && r.qualification.packet_sha256 === r.verification.packet_sha256, 'Verification packet integrity changed');
  verificationData(r.verification.packet, new Date(at), r.controlled);
  check(r.contact.phone === (r.verification.packet.phone ?? null) && r.name === r.verification.packet.business_name && r.category === r.verification.packet.category && r.contact.source === r.verification.packet.public_phone.url, 'Verified business identity or phone changed');
}
export function verificationFresh(r, at) {
  try { validateVerificationRecord(r, at); return true; } catch { return false; }
}

export function verificationOpening(r) {
  if(r.opening_assessment){const a=validateOpeningAssessment(r);return a.candidates.find(c=>c.id===a.selected_id).opening;}
  const type=businessType(r),name=String(r.name??r.business_name).replace(/[\r\n<>]/g,' ').trim().slice(0,120),offering=String(r.offering?.excerpt??'').replace(/[\r\n<>]/g,' ').trim().slice(0,100),location=String(r.location?.excerpt??'').replace(/[\r\n<>]/g,' ').trim().slice(0,70),service=type.subtype.toLowerCase();
  const proof=offering?`I saw ${name}’s website list ${offering}${location?` and mention ${location}`:''}.`:`I came across ${name}’s website.`;
  return `Hi, I’m calling from EVZ Digital. ${proof} Is the owner or operator available? I have one quick question about how new ${service} enquiries reach your team today.`;
}
