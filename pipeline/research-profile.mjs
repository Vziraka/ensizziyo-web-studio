import {check,hash} from './lifecycle.mjs';
import {validateSnapshots} from './sources.mjs';

const host=value=>new URL(value).hostname.toLowerCase().replace(/^www\./,'');
const platforms={'facebook.com':'Facebook','instagram.com':'Instagram','linkedin.com':'LinkedIn','youtube.com':'YouTube','tiktok.com':'TikTok','x.com':'X','twitter.com':'X'};
const emailPattern=/^[^\s@,;<>"\r\n]+@[^\s@,;<>"\r\n]+\.[^\s@,;<>"\r\n]+$/;
export function linkedSocialProfiles(sources){
  const links=new Map();
  for(const source of sources)for(const match of source.text.matchAll(/https:\/\/[^\s\]<>"')]+/g)){
    try{const url=new URL(match[0]),domain=host(url.href),platform=platforms[domain];
      if(!platform||url.username||url.password||url.port||!url.pathname.replaceAll('/','')||/\/(?:share|sharer|intent|watch|reel|p|status|posts)(?:\/|\.php|$)/i.test(url.pathname))continue;
      url.search='';url.hash='';const value=url.href.replace(/\/$/,'');
      if(!links.has(value))links.set(value,{platform,url:value,linked_from:source.url,link_source_sha256:source.content_sha256,checked_at:source.fetched_at});
    }catch{}
  }
  return [...links.values()].slice(0,6);
}
const cite=(value,sources)=>{
  const source=sources.find(s=>s.url===value?.url);
  check(source&&source.capture_method!=='search_snippet'&&typeof value.excerpt==='string'&&value.excerpt.length>2&&value.excerpt.length<=500&&source.text.includes(value.excerpt),'Profile claim needs an exact retained primary-source excerpt');
  return {url:source.url,checked_at:source.fetched_at,source_sha256:source.content_sha256,excerpt:value.excerpt};
};
export function buildResearchProfile(primary,socialSources,review,now=new Date()){
  const links=linkedSocialProfiles(primary),all=[...primary,...socialSources];
  for(const source of socialSources){
    check(links.some(l=>l.url===source.url.replace(/\/$/,'')),'Social evidence must come from a profile linked by the business website');
    validateSnapshots({sources:[source]},{research_version:3,seed_urls:[source.url],as_of:source.checked_at});
    check(Date.parse(source.fetched_at)<=+now&&+now-Date.parse(source.fetched_at)<14*86400000,'Social evidence is stale or future-dated');
  }
  let business_email=null,owner_phone=null;
  if(review.business_email){const e=review.business_email,source=cite(e,primary);
    check(emailPattern.test(e.email)&&e.excerpt.includes(e.email)&&['General business','Owner/operator business'].includes(e.kind),'Email must be published verbatim as a professional business route');
    if(e.kind==='Owner/operator business')check(review.owner&&e.person_name===review.owner.name&&e.excerpt.toLowerCase().includes(e.person_name.toLowerCase()),'Owner email needs an explicit published person-to-email link');
    business_email={email:e.email,kind:e.kind,person_name:e.kind==='Owner/operator business'?e.person_name:null,source};
  }
  if(review.owner_phone){const p=review.owner_phone,source=cite(p,primary),digits=s=>s.replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
    check(review.owner&&p.person_name===review.owner.name&&p.excerpt.toLowerCase().includes(p.person_name.toLowerCase())&&/^\d{10}$/.test(digits(p.number))&&digits(p.excerpt).includes(digits(p.number))&&/call|phone|direct|reach|contact/i.test(p.excerpt),'Owner phone needs an explicit professional person-to-number link');
    owner_phone={number:p.number,person_name:p.person_name,source};
  }
  const social=links.map(link=>{
    const source=socialSources.find(s=>s.url.replace(/\/$/,'')===link.url),metric=(review.social??[]).find(s=>s.url.replace(/\/$/,'')===link.url);
    const result={...link,status:source?'Partial public profile':'Profile linked; metrics unavailable',followers:null,latest_post:null,posts_30_days:null,frequency:'Unavailable — public posting dates were not verified'};
    if(!source||!metric)return result;
    if(metric.followers){const proof=cite({...metric.followers,url:source.url},all);check(typeof metric.followers.display==='string'&&/^[\d,.]+\s?[KMB]?$/i.test(metric.followers.display)&&proof.excerpt.includes(metric.followers.display)&&/followers|subscribers/i.test(proof.excerpt),'Follower count needs its visible count and label');result.followers={display:metric.followers.display,source:proof};}
    const posts=metric.posts??[];check(Array.isArray(posts)&&posts.length<=40,'Bound observed posts');
    const seen=new Set();
    for(const post of posts){check(/^\d{4}-\d{2}-\d{2}$/.test(post.date)&&Number.isFinite(Date.parse(post.date))&&new Date(post.date).toISOString().slice(0,10)===post.date&&Date.parse(post.date)<=+now&&!seen.has(post.post_url),'Use distinct observed post URLs and publication dates');const u=new URL(post.post_url);check(u.protocol==='https:'&&host(u.href)===host(link.url)&&source.text.includes(post.post_url),'Post URL must appear in the retained profile');const proof=cite({...post,url:source.url},all);check(proof.excerpt.includes(post.date),'Use an explicit observed publication date, not the inspection date');seen.add(post.post_url);}
    if(posts.length){const ordered=[...posts].sort((a,b)=>b.date.localeCompare(a.date));result.latest_post={date:ordered[0].date,url:ordered[0].post_url};result.posts_30_days=posts.filter(p=>+now-Date.parse(p.date)<30*86400000).length;result.frequency=`At least ${result.posts_30_days} observed posts in the last 30 days · partial visibility`;}
    return result;
  });
  return {schema_version:1,checked_at:now.toISOString(),business_email,owner_phone,social,coverage:'Bounded public website and linked-profile review. Missing metrics and direct contacts remain unknown; login walls are not bypassed.',sources_sha256:hash(all.map(s=>({url:s.url,sha256:s.content_sha256})))};
}
