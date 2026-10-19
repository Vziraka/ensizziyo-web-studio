import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {hash,StudioLifecycle} from './lifecycle.mjs';
import {serveLifecycle} from './lifecycle-server.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
import {ownerContactView} from './owner-contacts.mjs';
import {providerContactView,providerContactSummary} from './provider-contacts.mjs';

const now=new Date('2026-10-19T08:00:00Z');
function card(){
  const r={id:'example',company_id:'company-example',contact:{phone:'202-555-0142',verified:true,checked_at:'2026-10-18T10:00:00Z',source:'https://bakery.example.com/contact'}};
  r.provider_contact_enrichment={schema_version:1,company_id:r.company_id,bound_contact_sha256:hash(r.contact),received_at:'2026-10-19T06:00:00Z',reviewed_at:'2026-10-19T07:00:00Z',outcome:'Owner/operator match',person:{name:'Jane Stone',role:'Owner',organization:'Example Bakery'},phones:[{number:'+12025550182',kind:'mobile_phone',dnc_status:'found',same_business_line:false},{number:'+12025550183',kind:'direct_phone',same_business_line:false}],notes:['Provider reports this professional role; current operation and business use require confirmation.']};
  return r;
}

test('provider phones preserve DNC uncertainty and cannot qualify or replace a public business line',()=>{
  const r=card(),before=structuredClone(r),v=providerContactView(r,now);
  assert.equal(v.current,true);assert.equal(v.phones[0].blocked,true);assert.equal(v.phones[0].dnc_status,'found');
  assert.equal(v.phones[1].dnc_status,'not_provided');assert.equal(v.phones[1].screening_clear,false);
  assert.equal(v.phones[0].screening_clear,false);assert.equal(ownerContactView(r,now).classification,'General business line');
  assert.deepEqual(r,before);
});

test('changed contacts, future reviews and stale provider evidence hide names and numbers until rechecked',()=>{
  for(const change of [r=>r.contact.phone='202-555-0100',r=>r.company_id='other-company',r=>r.provider_contact_enrichment.reviewed_at='2026-10-20T00:00:00Z',r=>r.provider_contact_enrichment.reviewed_at='2026-09-01T00:00:00Z',r=>r.provider_contact_enrichment.received_at='2026-09-01T00:00:00Z',r=>r.provider_contact_enrichment.received_at='2026-10-20T00:00:00Z',r=>delete r.provider_contact_enrichment.received_at]){
    const r=card();change(r);const v=providerContactView(r,now);assert.equal(v.current,false);assert.equal(v.person,null);assert.deepEqual(v.phones,[]);assert.equal(v.outcome,'Needs recheck');
  }
});

test('home, unknown-type and rejected-employer numbers never enter the professional view; summaries exclude existing store-line duplicates',()=>{
  const r=card();r.provider_contact_enrichment.phones.push({number:'+12025550184',kind:'home_phone'},{number:'+12025550185',kind:'other_phone'});
  r.provider_contact_enrichment.phones[1].same_business_line=true;
  const rejected=card();rejected.id='wrong-employer';rejected.provider_contact_enrichment.outcome='Rejected employer/role';
  assert.equal(providerContactView(r,now).phones.length,2);assert.deepEqual(providerContactView(rejected,now).phones,[]);assert.equal(providerContactView(rejected,now).person,null);
  assert.deepEqual(providerContactSummary({prospects:{r,rejected}},now),{reviewed:2,owner_matches:1,staff_matches:0,with_numbers:1,numbers:2,new_numbers:1,dnc_listed:1,screening_unavailable:1});
});

test('the authenticated dashboard exposes reviewed provider evidence without changing calls, restrictions, tasks or public-direct classification',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'provider-contact-'));
  t.after(async()=>{assert(resolve(directory).startsWith(resolve(tmpdir())+sep+'provider-contact-'));await rm(directory,{recursive:true,force:true});});
  const app=await StudioLifecycle.initialize({directory,now:()=>now});
  const input=fixtureProspect('example',now.toISOString(),'STUDIO TEST Example Bakery');
  await app.apply(input,{actor:'controlled-fixture'});
  await app.change(s=>{const r=s.prospects.example;r.restriction='do_not_contact';r.provider_contact_enrichment={...card().provider_contact_enrichment,company_id:r.company_id,bound_contact_sha256:hash(r.contact)};});
  const before=await app.snapshot(),server=await serveLifecycle(app,{port:0,quiet:true});t.after(()=>new Promise(res=>server.close(res)));
  const origin=`http://127.0.0.1:${server.address().port}`,landing=await fetch(origin),cookie=landing.headers.get('set-cookie').split(';')[0];
  const response=await fetch(origin+'/api/state',{headers:{Cookie:cookie}}),view=await response.json();assert.equal(response.status,200);
  assert.equal(view.prospects.example.provider_contact_view.phones[0].blocked,true);assert.equal(view.provider_contact_summary.dnc_listed,1);
  assert.equal(view.owner_contact_summary.owner_direct,0);assert.deepEqual(view.prospects.example.contact,before.prospects.example.contact);assert.equal(view.prospects.example.restriction,'do_not_contact');
  assert.deepEqual(await app.snapshot(),before);
});
