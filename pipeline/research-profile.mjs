import {check,hash} from './lifecycle.mjs';
import {validateSnapshots} from './sources.mjs';

const host=value=>new URL(value).hostname.toLowerCase().replace(/^www\./,'');
const platforms={'facebook.com':'Facebook','instagram.com':'Instagram','linkedin.com':'LinkedIn','youtube.com':'YouTube','tiktok.com':'TikTok','x.com':'X','twitter.com':'X'};
const profileKey=value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&platforms[host(value)]==='X'?`https://x.com${u.pathname.replace(/\/$/,'').toLowerCase()}`:value.replace(/\/$/,'');};
const emailPattern=/^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/;
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function publicationDate(label){
  if(/^\d{4}-\d{2}-\d{2}$/.test(label))return label;
  const match=/^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(label),month=match?months.findIndex(m=>m===match[1].toLowerCase()||m.slice(0,3)===match[1].toLowerCase()):-1;
  if(month<0)return null;
  const date=new Date(Date.UTC(+match[3],month,+match[2]));
  return date.getUTCMonth()===month&&date.getUTCDate()===+match[2]?date.toISOString().slice(0,10):null;
}
export function linkedSocialProfiles(sources){
  const links=new Map();
  for(const source of sources)for(const match of source.text.matchAll(/https:\/\/[^\s\]<>"')]+/g)){
    try{const url=new URL(match[0]),domain=host(url.href),platform=platforms[domain];
      if(!platform||url.username||url.password||url.port||!url.pathname.replaceAll('/','')||/\/(?:share|sharer|intent|watch|reel|p|status|posts)(?:\/|\.php|$)/i.test(url.pathname))continue;
      const pageId=domain==='facebook.com'&&url.pathname==='/profile.php'?url.searchParams.get('id'):null;
      if(domain==='facebook.com'&&url.pathname==='/profile.php'&&!/^\d{1,30}$/.test(pageId??''))continue;
      url.search=pageId?`?id=${pageId}`:'';url.hash='';const value=url.href.replace(/\/$/,'');
      if(!links.has(profileKey(value)))links.set(profileKey(value),{platform,url:value,linked_from:source.url,link_source_sha256:source.content_sha256,checked_at:source.fetched_at});
    }catch{}
  }
  return [...links.values()].slice(0,6);
}
const cite=(value,sources)=>{
  const source=sources.findLast(s=>s.url===value?.url&&(!value.source_sha256||s.content_sha256===value.source_sha256));
  check(source&&source.capture_method!=='search_snippet'&&typeof value.excerpt==='string'&&value.excerpt.length>2&&value.excerpt.length<=500&&source.text.includes(value.excerpt),'Profile claim needs an exact retained primary-source excerpt');
  return {url:source.url,checked_at:source.fetched_at,source_sha256:source.content_sha256,excerpt:value.excerpt};
};
export function buildResearchProfile(primary,socialSources,review,now=new Date()){
  const links=linkedSocialProfiles(primary),all=[...primary,...socialSources];
  for(const source of socialSources){
    check(links.some(l=>profileKey(l.url)===profileKey(source.url)),'Social evidence must come from a profile linked by the business website');
    validateSnapshots({sources:[source]},{research_version:3,seed_urls:[source.url],as_of:source.checked_at});
    check(Date.parse(source.fetched_at)<=+now&&+now-Date.parse(source.fetched_at)<14*86400000,'Social evidence is stale or future-dated');
  }
  let business_email=null,owner_phone=null;
  if(review.business_email){const e=review.business_email,source=cite(e,primary);
    check(emailPattern.test(e.email)&&e.excerpt.includes(e.email)&&['General business','Owner/operator business'].includes(e.kind),'Email must be published verbatim as a professional business route');
    check(!/\[Input:/i.test(e.excerpt)&&primary.find(s=>s.url===e.url).text.replace(/\[Input:[^\]]*\]/gi,'').includes(e.email),'Contact-form examples and placeholders are not published business email routes');
    if(e.kind==='Owner/operator business')check(review.owner&&e.person_name===review.owner.name&&e.excerpt.toLowerCase().includes(e.person_name.toLowerCase()),'Owner email needs an explicit published person-to-email link');
    business_email={email:e.email,kind:e.kind,person_name:e.kind==='Owner/operator business'?e.person_name:null,source};
  }
  if(review.owner_phone){const p=review.owner_phone,source=cite(p,primary),digits=s=>s.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
    check(review.owner&&p.person_name===review.owner.name&&p.excerpt.toLowerCase().includes(p.person_name.toLowerCase())&&/^\d{10}$/.test(digits(p.number))&&digits(p.excerpt).includes(digits(p.number))&&/call|phone|direct|reach|contact/i.test(p.excerpt),'Owner phone needs an explicit professional person-to-number link');
    owner_phone={number:p.number,person_name:p.person_name,source};
  }
  const social=links.map(link=>{
    const source=socialSources.findLast(s=>profileKey(s.url)===profileKey(link.url)),metric=(review.social??[]).find(s=>profileKey(s.url)===profileKey(link.url));
    const result={...link,checked_at:source?.fetched_at??link.checked_at,status:source?'Partial public profile':'Profile linked; metrics unavailable',followers:null,latest_post:null,posts_30_days:null,frequency:'Unavailable — public posting dates were not verified'};
    if(!source||!metric)return result;
    const captureFor=claim=>{const capture=claim.source_sha256?socialSources.findLast(s=>profileKey(s.url)===profileKey(link.url)&&s.content_sha256===claim.source_sha256):source;check(capture,'Metric source snapshot missing from retained profile');return capture;};
    if(metric.followers){const capture=captureFor(metric.followers),proof=cite({...metric.followers,url:capture.url},all);check(typeof metric.followers.display==='string'&&/^[\d,.]+\s?[KMB]?$/i.test(metric.followers.display)&&proof.excerpt.includes(metric.followers.display)&&/followers|subscribers/i.test(proof.excerpt),'Follower count needs its visible count and label');result.followers={display:metric.followers.display,source:proof};}
    const posts=metric.posts??[];check(Array.isArray(posts)&&posts.length<=40,'Bound observed posts');
    const seen=new Set(),verified=[];
    for(const post of posts){
      check(/^\d{4}-\d{2}-\d{2}$/.test(post.date)&&Number.isFinite(Date.parse(post.date))&&new Date(post.date).toISOString().slice(0,10)===post.date&&Date.parse(post.date)<=+now&&!seen.has(post.post_url),'Use distinct observed post URLs and publication dates');
      const u=new URL(post.post_url),samePlatform=host(u.href)===host(link.url)||link.platform==='X'&&['x.com','twitter.com'].includes(host(u.href));
      const capture=captureFor(post);check(u.protocol==='https:'&&samePlatform&&capture.text.includes(post.post_url),'Post URL must appear in the retained profile');
      const proof=cite({...post,url:capture.url},all),label=post.date_text??post.date;
      check(typeof label==='string'&&proof.excerpt.includes(label)&&publicationDate(label)===post.date&&(!post.date_text||proof.excerpt.includes(post.post_url)),'Use an explicit observed publication date, not the inspection date');seen.add(post.post_url);verified.push({...post,source:proof});
    }
    if(verified.length){const ordered=verified.sort((a,b)=>b.date.localeCompare(a.date));result.latest_post={date:ordered[0].date,url:ordered[0].post_url,source:ordered[0].source};result.posts_30_days=verified.filter(p=>+now-Date.parse(p.date)<30*86400000).length;result.frequency=`At least ${result.posts_30_days} observed posts in the last 30 days · partial visibility`;}
    return result;
  });
  return {schema_version:1,checked_at:now.toISOString(),business_email,owner_phone,social,coverage:'Bounded public website and linked-profile review. Missing metrics and direct contacts remain unknown; login walls are not bypassed.',sources_sha256:hash(all.map(s=>({url:s.url,sha256:s.content_sha256})))};
}

export async function applyResearchProfile(app,p){
  const now=app.now(),at=Date.parse(p?.reviewed_at);
  check(p?.schema_version===1&&/^[a-z0-9-]{1,60}$/.test(p.id??'')&&typeof p.reviewed_by==='string'&&p.reviewed_by.trim().length>=3&&p.reviewed_by.length<=200&&Number.isFinite(at)&&at<=+now&&+now-at<14*86400000,'A current identified profile review is required');
  check(Array.isArray(p.sources)&&p.sources.length>=1&&p.sources.length<=6&&Array.isArray(p.social)&&p.social.length>=1&&p.social.length<=6&&new Set(p.sources.map(s=>profileKey(s.url))).size===p.sources.length&&new Set(p.social.map(s=>profileKey(s.url))).size===p.social.length,'Bound distinct reviewed social profiles');
  return app.change(state=>{
    const r=state.prospects[p.prospect_id],packet=r?.verification?.packet,digest=hash(p);
    check(r&&r.company_id===p.company_id&&hash(r.contact)===p.bound_contact_sha256&&packet?.profile_version===1&&hash(packet)===r.verification.packet_sha256&&p.verification_sha256===r.verification.packet_sha256,'Existing profile/contact evidence binding changed');
    const history=r.research_profile_reviews??[],saved=history.find(v=>v.packet.id===p.id);
    if(saved){check(saved.packet_sha256===digest&&hash(saved.packet)===digest,'Retained profile review changed');return {duplicate:true,prospect_id:r.id};}
    check(hash(r.research_profile)===p.previous_profile_sha256,'Existing profile changed; review against its current evidence');
    const links=linkedSocialProfiles(packet.sources);
    for(const entry of history)check(hash(entry.packet)===entry.packet_sha256,'Retained profile review integrity changed');
    for(const s of p.sources)check(Date.parse(s.fetched_at)<=at,'Profile capture cannot postdate its review');
    for(const m of p.social)check(typeof m.url==='string'&&links.some(l=>profileKey(l.url)===profileKey(m.url))&&p.sources.some(s=>profileKey(s.url)===profileKey(m.url)),'Reviewed metrics must match a business-linked profile and its retained capture');
    buildResearchProfile(packet.sources,p.sources,{...packet.profile_review,social:p.social},now);
    const layers=[{sources:packet.profile_evidence?.sources??[],social:packet.profile_review?.social??[]},...history.map(v=>v.packet),p],retained=layers.flatMap(v=>v.sources),current=retained.filter(s=>+now-Date.parse(s.fetched_at)<14*86400000),metrics=new Map();
    for(const layer of layers)for(const m of layer.social){
      const key=profileKey(m.url),source=layer.sources.findLast(s=>profileKey(s.url)===key);if(!source)continue;
      const previous=metrics.get(key)??{},posts=new Map((previous.posts??[]).map(post=>[post.post_url,post]));
      for(const post of m.posts??[])posts.set(post.post_url,{...post,source_sha256:source.content_sha256});
      metrics.set(key,{...previous,...m,followers:Object.hasOwn(m,'followers')?m.followers&&{...m.followers,source_sha256:source.content_sha256}:previous.followers,posts:[...posts.values()]});
    }
    for(const [key,m] of metrics){const available=claim=>current.some(s=>profileKey(s.url)===key&&s.content_sha256===claim.source_sha256);if(m.followers&&!available(m.followers))m.followers=null;m.posts=m.posts.filter(available).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,40);}
    const profile=buildResearchProfile(packet.sources,current,{...packet.profile_review,social:[...metrics.values()]},now);
    for(const link of profile.social)if(!current.some(s=>profileKey(s.url)===profileKey(link.url))){const old=retained.findLast(s=>profileKey(s.url)===profileKey(link.url));if(old)Object.assign(link,{checked_at:old.fetched_at,status:'Profile metrics stale; refresh required',frequency:'Unavailable — previous profile metrics need a fresh check'});}
    check(hash(profile.business_email)===hash(r.research_profile.business_email)&&hash(profile.owner_phone)===hash(r.research_profile.owner_phone),'Social review cannot replace business contact evidence');
    r.research_profile=profile;r.research_profile_reviews=[...history,{packet:structuredClone(p),packet_sha256:digest}];
    state.revision++;state.updated_at=now.toISOString();return {duplicate:false,prospect_id:r.id};
  });
}
