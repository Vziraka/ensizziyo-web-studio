import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContentHash} from './sources.mjs';
import {linkedSocialProfiles,buildResearchProfile} from './research-profile.mjs';
const at='2026-10-19T15:00:00Z',now=new Date(at);
const source=(url,text,kind='business')=>{const s={url,text,kind,fetched_at:at,checked_at:'2026-10-19',coverage:'partial',capture_method:'http',identity_note:'Controlled public-source fixture for business contact and profile evidence.'};s.content_sha256=sourceContentHash(s);return s;};
const primary=source('https://oakline.example.com/','Oakline Home Services, Fairfax. Owner Jordan Test. Email our office hello@oakline.example.com. Follow us [https://www.instagram.com/oakline/] [https://facebook.com/sharer.php?u=example]');
test('only business-linked profiles are retained; missing metrics never imply no followers or inactivity',()=>{
 const links=linkedSocialProfiles([primary]);assert.equal(links.length,1);assert.equal(links[0].platform,'Instagram');const p=buildResearchProfile([primary],[],{},now);assert.equal(p.business_email,null);assert.equal(p.social[0].followers,null);assert.equal(p.social[0].posts_30_days,null);assert.match(p.social[0].frequency,/Unavailable/);
});
test('public email provenance and observed social activity retain their actual source and date',()=>{
 const social=source('https://www.instagram.com/oakline','Oakline Home Services. 1,240 followers. New installation 2026-10-10 https://www.instagram.com/p/fixture-1/ completed in Fairfax.','social');
 const review={business_email:{email:'hello@oakline.example.com',kind:'General business',person_name:null,url:primary.url,excerpt:'Email our office hello@oakline.example.com.'},social:[{url:social.url,followers:{display:'1,240',excerpt:'1,240 followers'},posts:[{date:'2026-10-10',post_url:'https://www.instagram.com/p/fixture-1/',excerpt:'New installation 2026-10-10'}]}]};
 const p=buildResearchProfile([primary],[social],review,now);assert.equal(p.business_email.source.source_sha256,primary.content_sha256);assert.equal(p.social[0].followers.display,'1,240');assert.equal(p.social[0].latest_post.date,'2026-10-10');assert.equal(p.social[0].posts_30_days,1);assert.match(p.social[0].frequency,/At least 1.*partial/);
 const unrelated=source('https://instagram.com/unrelated','Unrelated profile with 99,999 followers and enough public text to pass a basic length bound.','social');assert.throws(()=>buildResearchProfile([primary],[unrelated],{},now),/linked by the business/);
});
test('guessed owner contacts and inspection dates substituted for publication dates are rejected',()=>{
 const guessed={business_email:{email:'jordan@oakline.example.com',kind:'Owner/operator business',person_name:'Jordan Test',url:primary.url,excerpt:'Owner Jordan Test.'},owner:{name:'Jordan Test'}};assert.throws(()=>buildResearchProfile([primary],[],guessed,now),/published verbatim/);
 const promoted={business_email:{email:'hello@oakline.example.com',kind:'Owner/operator business',person_name:'Jordan Test',url:primary.url,excerpt:'Email our office hello@oakline.example.com.'},owner:{name:'Jordan Test'}};assert.throws(()=>buildResearchProfile([primary],[],promoted,now),/person-to-email/);
 const social=source('https://www.instagram.com/oakline','Oakline Home Services. Posted yesterday https://www.instagram.com/p/fixture-1/ for a customer.','social');assert.throws(()=>buildResearchProfile([primary],[social],{social:[{url:social.url,posts:[{date:'2026-10-19',post_url:'https://www.instagram.com/p/fixture-1/',excerpt:'Posted yesterday'}]}]},now),/publication date/);
});
