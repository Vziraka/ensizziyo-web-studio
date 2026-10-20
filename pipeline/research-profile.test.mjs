import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContentHash} from './sources.mjs';
import {linkedSocialProfiles,buildResearchProfile} from './research-profile.mjs';
import * as profiles from './research-profile.mjs';
import {hash} from './lifecycle.mjs';
const at='2026-10-19T15:00:00Z',now=new Date(at);
const source=(url,text,kind='business')=>{const s={url,text,kind,fetched_at:at,checked_at:'2026-10-19',coverage:'partial',capture_method:'http',identity_note:'Controlled public-source fixture for business contact and profile evidence.'};s.content_sha256=sourceContentHash(s);return s;};
const primary=source('https://oakline.example.com/','Oakline Home Services, Fairfax. Owner Jordan Test. Email our office hello@oakline.example.com. Follow us [https://www.instagram.com/oakline/] [https://facebook.com/sharer.php?u=example]');

test('Facebook numeric page IDs survive link normalization and tracking parameters are removed',()=>{
 const page=source(primary.url,'Oakline Home Services, Fairfax. Facebook [https://www.facebook.com/profile.php?id=100012345678901&ref=footer] and incomplete [https://facebook.com/profile.php]');
 const links=linkedSocialProfiles([page]);assert.equal(links.length,1);assert.equal(links[0].url,'https://www.facebook.com/profile.php?id=100012345678901');
});

test('a retained X post can belong to a business-linked Twitter profile and uses the profile capture date',()=>{
 const page=source(primary.url,'Oakline Home Services, Fairfax. Public updates [https://twitter.com/oakline]'),post_url='https://x.com/oakline/status/12345',excerpt=`October 10, 2026 [${post_url}]`,social=source('https://twitter.com/oakline',`Oakline Home Services. 25 Followers. ${excerpt}`,'social');
 social.checked_at='2026-10-20';social.fetched_at='2026-10-20T12:00:00Z';
 const result=buildResearchProfile([page],[social],{social:[{url:social.url,posts:[{date:'2026-10-10',date_text:'October 10, 2026',post_url,excerpt}]}]},new Date('2026-10-20T15:00:00Z'));
 assert.equal(result.social[0].latest_post.url,post_url);assert.equal(result.social[0].checked_at,'2026-10-20T12:00:00Z');
});

test('an email shown only as a contact-form example is not a published business route',()=>{
 const page=source('https://oakline.example.com/','Oakline Home Services contact form. Name [Input: Name] Email [Input: office@oakline.example.com] Message [Input: Message]');
 const claim={business_email:{email:'office@oakline.example.com',kind:'General business',person_name:null,url:page.url,excerpt:'office@oakline.example.com'}};
 assert.throws(()=>buildResearchProfile([page],[],claim,now),/form.*example|placeholder/);
 const published=source(page.url,page.text+' Email our office office@oakline.example.com.');
 claim.business_email.excerpt='Email our office office@oakline.example.com.';assert.equal(buildResearchProfile([published],[],claim,now).business_email.email,'office@oakline.example.com');
});
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

test('absolute public post labels keep their real publication date and reject inferred years or invalid dates',()=>{
 const post_url='https://www.instagram.com/p/dated-example/',excerpt=`October 10, 2026 [${post_url}]`,social=source('https://www.instagram.com/oakline',`Oakline Home Services. 240 followers. Observed public dated post links: ${excerpt}`,'social');
 const post={date:'2026-10-10',date_text:'October 10, 2026',post_url,excerpt},review={social:[{url:social.url,posts:[post]}]};
 const result=buildResearchProfile([primary],[social],review,now);assert.equal(result.social[0].latest_post.date,'2026-10-10');assert.equal(result.social[0].posts_30_days,1);
 for(const label of ['October 10','yesterday','February 30, 2026']){
  const page=source(social.url,`Oakline Home Services public post ${label} [${post_url}].`,'social');
  assert.throws(()=>buildResearchProfile([primary],[page],{social:[{url:page.url,posts:[{...post,date_text:label,excerpt:`${label} [${post_url}]`}]}]},now),/publication date/);
 }
 assert.throws(()=>buildResearchProfile([primary],[social],{social:[{url:social.url,posts:[{...post,post_url:'https://www.instagram.com/p/unseen/'}]}]},now),/Post URL/);
});

test('reviewed social upgrades preserve contact bindings, original evidence, stops and operations and replay once',async()=>{
 const packet={profile_version:1,sources:[primary],profile_evidence:{sources:[]},profile_review:{social:[{url:'https://www.instagram.com/ignored-unlinked/',followers:null,posts:[]}]}},r={id:'existing',company_id:'company',contact:{email:null,phone:'202-555-0142'},verification:{packet,packet_sha256:hash(packet)},research_profile:buildResearchProfile([primary],[],{},now),restriction:'do_not_contact',calls:{keep:'callback'}},state={revision:4,prospects:{existing:r},actions:{keep:'Verified'},events:{keep:'call_logged'}};
 const before=structuredClone(state),social=source('https://www.instagram.com/oakline','Oakline Home Services public business profile, Fairfax. 240 followers.','social'),review={schema_version:1,id:'profile-check',prospect_id:r.id,company_id:r.company_id,bound_contact_sha256:hash(r.contact),verification_sha256:r.verification.packet_sha256,previous_profile_sha256:hash(r.research_profile),reviewed_by:'Public source reviewer',reviewed_at:at,sources:[social],social:[{url:social.url,followers:{display:'240',excerpt:'240 followers'}}]};
 const app={now:()=>now,change:async fn=>fn(state)};
 await profiles.applyResearchProfile(app,review);assert.equal(r.research_profile.social[0].followers.display,'240');assert.equal(state.revision,5);assert.deepEqual(r.contact,before.prospects.existing.contact);assert.deepEqual(r.verification,before.prospects.existing.verification);assert.equal(r.restriction,'do_not_contact');assert.deepEqual(r.calls,before.prospects.existing.calls);assert.deepEqual(state.actions,before.actions);assert.deepEqual(state.events,before.events);
 assert.equal((await profiles.applyResearchProfile(app,structuredClone(review))).duplicate,true);assert.equal(state.revision,5);assert.equal(r.research_profile_reviews.length,1);assert.deepEqual(r.research_profile_reviews[0].packet,review);
 const stale={...review,id:'stale-review'};await assert.rejects(profiles.applyResearchProfile(app,stale),/profile changed/);
 const changed=structuredClone(review);changed.social[0].followers.display='999';await assert.rejects(profiles.applyResearchProfile(app,changed),/review changed/);
 const bad={...review,id:'changed-binding',bound_contact_sha256:'wrong',previous_profile_sha256:hash(r.research_profile)};await assert.rejects(profiles.applyResearchProfile(app,bad),/binding/);
 const corrupt=structuredClone({...review,id:'bad-source',previous_profile_sha256:hash(r.research_profile)});corrupt.sources[0].text+=' changed';await assert.rejects(profiles.applyResearchProfile(app,corrupt),/integrity/);
 const unlinked=structuredClone({...review,id:'unlinked-source',previous_profile_sha256:hash(r.research_profile)});unlinked.sources[0].url=unlinked.social[0].url='https://www.instagram.com/unrelated/';await assert.rejects(profiles.applyResearchProfile(app,unlinked),/business-linked/);
 const future=structuredClone({...review,id:'future-source',previous_profile_sha256:hash(r.research_profile)});future.sources[0].fetched_at='2026-10-20T15:00:00Z';await assert.rejects(profiles.applyResearchProfile(app,future),/postdate/);
 await assert.rejects(profiles.applyResearchProfile({...app,now:()=>new Date('2026-11-05T15:00:00Z')},{...review,id:'old-review'}),/current identified/);
 const next=structuredClone({...review,id:'second-review',previous_profile_sha256:hash(r.research_profile)});next.sources[0]=source(social.url,'Oakline Home Services public business profile, Fairfax. 250 followers.','social');next.social[0].followers={display:'250',excerpt:'250 followers'};
 await profiles.applyResearchProfile(app,next);assert.equal(r.research_profile.social[0].followers.display,'250');assert.equal(r.research_profile_reviews.length,2);
 assert.equal((await profiles.applyResearchProfile(app,review)).duplicate,true);assert.equal(r.research_profile.social[0].followers.display,'250');assert.equal(state.revision,6);
 packet.sources[0]={...primary,text:'Changed original evidence'};await assert.rejects(profiles.applyResearchProfile(app,{...review,id:'changed-original'}),/binding/);
});
