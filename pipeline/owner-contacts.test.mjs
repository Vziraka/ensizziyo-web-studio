import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from './lifecycle.mjs';
import { sourceContentHash } from './sources.mjs';
import { ownerContactView, ownerContactSummary, retainContactDiscovery, applyOwnerContact } from './owner-contacts.mjs';

const now = () => new Date('2026-10-19T06:00:00Z');
const record = () => ({ id:'existing-card',company_id:'existing-company',name:'Example Bakery',contact:{name:'Jane Stone',phone:'202-555-0142',verified:true,checked_at:'2026-10-18T12:00:00Z',source:'https://bakery.example.com/contact'},qualification:{verdict:'Research-qualified'},calls:{keep:{outcome:'callback'}},restriction:'do_not_contact' });
function packet(r=record(),direct=false) {
  const text='Example Bakery\nJane Stone, owner\nCall owner Jane Stone directly for business enquiries at 202-555-0182.\nOur team also answers general shop questions.';
  const source={url:'https://bakery.example.com/about',final_url:'https://bakery.example.com/about',fetched_at:'2026-10-19T05:00:00Z',checked_at:'2026-10-19',text,kind:'business',capture_method:'http',coverage:'full',truncated:false,identity_note:'Exact existing business website; public owner and professional contact information.'};source.content_sha256=sourceContentHash(source);
  return {schema_version:1,id:'owner-contact-test',prospect_id:r.id,company_id:r.company_id,bound_contact_sha256:hash(r.contact),reviewed_by:'Source-check operator',reviewed_at:'2026-10-19T05:30:00Z',job:{id:'owner-contact-test',business_name:r.name,website:'https://bakery.example.com/',seed_urls:[source.url],as_of:'2026-10-19',research_version:3},snapshots:{sources:[source]},person:{name:'Jane Stone',role:'owner',source_url:source.url,excerpt:'Jane Stone, owner'},direct_phone:direct?{number:'202-555-0182',source_url:source.url,excerpt:'Call owner Jane Stone directly for business enquiries at 202-555-0182.',public_professional:true,explicit_person_link:true}:null};
}

test('all cards have a contact-completeness view; a verified shop phone and named contact never imply owner-direct',()=>{
  const r=record(),before=structuredClone(r),v=ownerContactView(r,now());
  assert.equal(v.classification,'General business line');assert.equal(v.person,null);assert.equal(v.direct_phone,null);assert.deepEqual(r,before);
  assert.equal(ownerContactView({...r,contact:{...r.contact,verified:false,phone_verified:true}},now()).classification,'General business line');
  assert.deepEqual(ownerContactSummary({prospects:{a:r,b:{...r,id:'b',call_lane:'verification'}}},now()),{total:2,owner_direct:0,general_business:2,unverified:0,identified:0});
  assert.equal(ownerContactView(r,new Date('2026-12-01')).classification,'Unverified number');
});

test('a source-checked owner identity is distinct from a direct phone; enrichment preserves every operational field and is idempotent',async()=>{
  const r=record(),state={revision:7,prospects:{[r.id]:r},actions:{keep:{status:'Verified'}},events:{keep:{type:'call_logged'}}},before=structuredClone(state);
  const app={now,change:async fn=>fn(state)};const p=packet(r);
  await applyOwnerContact(app,p);assert.equal(state.revision,8);
  assert.deepEqual({...r,owner_contact:undefined},{...before.prospects[r.id],owner_contact:undefined});assert.deepEqual(state.actions,before.actions);assert.deepEqual(state.events,before.events);
  assert.equal(ownerContactView(r,now()).person.name,'Jane Stone');assert.equal(ownerContactView(r,now()).classification,'General business line');
  assert.equal((await applyOwnerContact(app,p)).duplicate,true);assert.equal(state.revision,8);
  const changed=structuredClone(p);changed.person.name='Other Owner';await assert.rejects(applyOwnerContact(app,changed),/changed|excerpt|identity/i);
});

test('direct owner business phone requires exact identity and number linkage, retained source integrity and current contact binding',async()=>{
  const r=record(),state={revision:0,prospects:{[r.id]:r}},app={now,change:async fn=>fn(state)};const p=packet(r,true);
  await applyOwnerContact(app,p);assert.equal(ownerContactView(r,now()).classification,'Owner/operator direct business');assert.equal(ownerContactView(r,now()).direct_phone.number,'202-555-0182');assert.equal(r.contact.phone,'202-555-0142');
  const bad=packet(r,true);bad.id=bad.job.id='other-packet';bad.direct_phone.excerpt='Our team also answers general shop questions.';await assert.rejects(applyOwnerContact(app,bad),/link|number|person/i);
  const tampered=packet(r);tampered.snapshots.sources[0].text+='tamper';await assert.rejects(applyOwnerContact(app,tampered),/integrity/i);
  r.contact.phone='202-555-0100';assert.equal(ownerContactView(r,now()).classification,'Unverified number');await assert.rejects(applyOwnerContact(app,p),/binding|changed/i);
});

test('an explicit first-name business phone link can bind to the fully named owner; a different person cannot',async()=>{
  const r=record(),state={revision:0,prospects:{[r.id]:r}},app={now,change:async fn=>fn(state)},p=packet(r,true),s=p.snapshots.sources[0];
  s.text=s.text.replace('Call owner Jane Stone directly','Call Jane directly');s.content_sha256=sourceContentHash(s);p.direct_phone.excerpt='Call Jane directly for business enquiries at 202-555-0182.';p.direct_phone.name_in_excerpt='Jane';
  await applyOwnerContact(app,p);assert.equal(ownerContactView(r,now()).direct_phone.number,'202-555-0182');
  const other=structuredClone(p);other.direct_phone.name_in_excerpt='Janet';await assert.rejects(applyOwnerContact(app,other),/person-to-number/);
});

test('reviewing retained contact evidence preserves its original check date and cannot extend source freshness',async()=>{
  const r=record(),state={revision:0,prospects:{[r.id]:r}},app={now,change:async fn=>fn(state)},p=packet(r,true);
  p.job.as_of=p.snapshots.sources[0].checked_at='2026-10-17';p.snapshots.sources[0].fetched_at='2026-10-17T05:00:00Z';
  await applyOwnerContact(app,p);assert.equal(r.owner_contact.direct_phone.source.checked_at,'2026-10-17T05:00:00Z');assert.equal(ownerContactView(r,new Date('2026-11-17T06:00:00Z')).classification,'Unverified number');
});

test('contact discovery reuses bounded public capture and free identity search once; masked names and Maybe phone flags stay candidates',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'owner-contact-'));t.after(()=>rm(directory,{recursive:true,force:true}));const r=record(),p=packet(r);let gets=0,calls=[];
  const connect={call:async(name,input)=>{calls.push({name,input});return {content:[{type:'text',text:JSON.stringify({total_entries:1,people:[{id:'provider-person',first_name:'Jane',last_name_obfuscated:'St***',title:'Owner',has_direct_phone:'Maybe'}]})}]};}};
  const options={now,connect,request:async()=>{gets++;return new Response(p.snapshots.sources[0].text,{headers:{'content-type':'text/plain'}});},resolveHost:async()=>[{address:'8.8.8.8'}]};
  const first=await retainContactDiscovery(directory,r,p.job,options),again=await retainContactDiscovery(directory,r,p.job,options);
  assert.equal(first.sha256,again.sha256);assert.equal(gets,1);assert.equal(calls.length,1);assert.match(calls[0].name,/mixed_people_api_search$/);assert.deepEqual(calls[0].input.q_organization_domains_list,['bakery.example.com']);assert.equal(first.report.apollo.status,'Candidates');assert.equal(first.report.person,undefined);assert.equal(first.report.direct_phone,undefined);
  assert.equal(JSON.parse(await readFile(join(directory,p.job.id,'discovery.json'))).sha256,first.sha256);
  const outside={...p.job,id:'outside',seed_urls:['https://other.example.org/about']};await assert.rejects(retainContactDiscovery(directory,r,outside,options),/existing|domain|scope/i);assert.equal(gets,1);
});
