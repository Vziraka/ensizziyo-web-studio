import { check, hash } from './lifecycle.mjs';
import { validateJob, validateSnapshots } from './sources.mjs';

export const verificationLane = r => r.call_lane === 'verification';
export const callStages = ['Ready to contact', 'Contacting', 'Ready to verify', 'Verifying', 'Callback'];
const text = (s, max = 1600) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
export const phoneDigits = s => String(s ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
export function verificationData(packet, now, controlled = false) {
  check(packet?.schema_version === 1 && /^[a-z0-9-]{1,60}$/.test(packet.id ?? '') && text(packet.business_name, 250) &&
    text(packet.category, 150) && /food|beverage|bakery|café|cafe/i.test(packet.category) && text(packet.area, 200) && text(packet.topic), 'Bounded food/beverage verification identity required');
  check(text(packet.reviewed_by, 200) && text(packet.first_party_note) && Array.isArray(packet.unknowns) && packet.unknowns.length > 0 && packet.unknowns.length <= 12 && packet.unknowns.every(s => text(s)), 'Record first-party ownership review and explicit unknowns');
  check(Array.isArray(packet.sources) && packet.sources.length > 0 && packet.sources.length <= 2, 'One or two retained verification sources required');
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
    check(['Google Search','Google Maps','Instagram','Facebook','Local directory','Referral'].includes(d.channel)&&packet.sources.some(s=>s.url===d.source_url),'Retain the actual discovery source separately from contact proof');
    check(['Verified site','No verified site found','Not checked'].includes(d.website_status)&&text(d.customer_channel,300)&&text(d.next_check,600),'Record website status, customer channel uncertainty and the next check');
    if(d.website_status==='Verified site'){
      validateJob({id:packet.id,business_name:packet.business_name,website:d.website_url,research_version:3,as_of:packet.sources[0].checked_at,seed_urls:[d.website_url]});
      check(packet.sources.some(s=>s.kind==='business'&&new URL(s.url).hostname.replace(/^www\./,'')===new URL(d.website_url).hostname.replace(/^www\./,'')),'A verified website needs its matching retained business capture');
    }
    else check(!d.website_url,'An unverified website status cannot claim a website URL');
  }
  check(normalize(packet.business_name).includes(normalize(packet.identity.excerpt)), 'Business name differs from the retained identity');
  check(/fairfax|vienna|arlington|alexandria|chantilly|centreville|herndon|reston|annandale|mclean|falls church|leesburg|ashburn|sterling|loudoun|woodbridge|manassas|virginia|\bva\b|washington|\bdc\b|maryland|\bmd\b|dmv/i.test(packet.location.excerpt), 'Retain the specific DMV location check');
  check(controlled ? !packet.phone : typeof packet.phone === 'string' && /^[+\d(). -]+$/.test(packet.phone) && phoneDigits(packet.phone).length === 10 && phoneDigits(packet.public_phone.excerpt).includes(phoneDigits(packet.phone)), 'Retain the exact public business phone; fictional records have no dialable phone');
  const checked = packet.sources.map(s => s.fetched_at).sort()[0], evidenceRef = `verification:${packet.id}`, digest = hash(packet);
  return { company_id: `verification-${hash(controlled ? packet.id : phoneDigits(packet.phone)).slice(0, 24)}`, name: packet.business_name, category: packet.category, area: packet.area,
    controlled, call_lane: 'verification', idea: packet.topic,
    ...(d?{discovery_source:structuredClone(d)}:{}),
    contact: { email: controlled ? `${packet.id}@example.invalid` : null, phone: packet.phone ?? null, verified: false, phone_verified: true, checked_at: checked, source: packet.public_phone.url },
    qualification: { verdict: 'Verification call only', independent_review: 'Not a detailed assessment', checked_at: checked, evidence_ref: evidenceRef, packet_sha256: digest },
    verification: { packet: structuredClone(packet), packet_sha256: digest, reviewed_at: now.toISOString(), current_activity: 'Unconfirmed', owner_goals: 'Unknown', opening: verificationOpening({ name: packet.business_name }), owner_question: text(packet.owner_question) ? packet.owner_question : 'What would you most like to make easier for customers or for yourself?' } };
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
  return `Hi, I’m calling from EVZ Digital. Is this ${r.name}? We help food and beverage businesses with websites and digital systems. Are you currently taking orders, and is the owner available for a brief question about their goals?`;
}
