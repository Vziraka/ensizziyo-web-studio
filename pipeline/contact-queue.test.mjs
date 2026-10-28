import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from './lifecycle.mjs';
import { collectPublicSources } from './sources.mjs';
import { createContactQueue, contactQueueTick, reviewContactQueue, contactQueueSummary, recoverContactTransport, refineContactSearch, runContactQueueService, enableApolloGap } from './contact-queue.mjs';

const now=()=>new Date('2026-10-19T08:00:00Z');

test('default research finishes public review without querying Apollo, including old pending queues',async t=>{
 const {directory,app,plan,state}=await fixture(t);await createContactQueue(directory,plan,state,{now});
 const path=join(directory,'queue.json'),q=JSON.parse(await readFile(path,'utf8'));q.items[0].apollo.status='Pending';await writeFile(path,JSON.stringify(q));
 let searches=0;const connect={call:async name=>{assert.match(name,/web_run$/);searches++;return {content:[{type:'text',text:'No public result'}]};}};
 for(let n=0;n<4;n++)await contactQueueTick(app,directory,{collect:async()=>{throw Error('Public page unavailable');},connect});
 const done=JSON.parse(await readFile(path,'utf8'));assert.equal(searches,1);assert.equal(done.items[0].status,'Awaiting review');assert.equal(done.items[0].apollo.status,'Deferred public-first review');
});
async function fixture(t){
  const directory=await mkdtemp(join(tmpdir(),'contact-queue-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const r={id:'existing',company_id:'company',name:'Example Bakery',area:'Fairfax',contact:{phone:'202-555-0123',source:'https://bakery.example.com/'},qualification:{keep:true},calls:{keep:true},restriction:'do_not_contact'};
  const state={prospects:{existing:r}},app={now,config:{priority:'idle'},snapshot:async()=>structuredClone(state),change:async fn=>fn(state)};
  const plan={schema_version:1,id:'contact-proof',approval_ref:'Owner exact existing-card review',items:[{prospect_id:r.id,company_id:r.company_id,bound_contact_sha256:hash(r.contact),job:{id:'contact-existing',business_name:r.name,website:r.contact.source,seed_urls:[r.contact.source],research_version:3,as_of:'2026-10-19'}}]};
  return {directory,r,state,app,plan};
}

test('only a current reviewed public gap permits one optional Apollo identity query',async t=>{
 const {directory,app,plan,state,r}=await fixture(t);await createContactQueue(directory,plan,state,{now});
 const readQueue=async()=>JSON.parse(await readFile(join(directory,'queue.json'),'utf8'));
 const review={prospect_id:r.id,reviewed_by:'Source reviewer',reviewed_at:now().toISOString(),gap:'Public pages did not identify the current owner',approval_ref:'Owner requested one free identity check',public_evidence_sha256:'not-current'};
 await assert.rejects(enableApolloGap(app,directory,review),/Finish public review/);
 let apollo=0;const connect={call:async name=>{if(name.endsWith('mixed_people_api_search')){apollo++;return {content:[{type:'text',text:'{"people":[]}'}]};}return {content:[{type:'text',text:'Public search, no owner found'}]};}};
 const collect=async()=>{throw Error('Public page unavailable');};
 for(let n=0;n<3;n++)await contactQueueTick(app,directory,{collect,connect});
 await assert.rejects(enableApolloGap(app,directory,review),/Public evidence changed/);
 const item=(await readQueue()).items[0];review.public_evidence_sha256=hash({pages:item.pages,search:item.search});
 await enableApolloGap(app,directory,review);await contactQueueTick(app,directory,{collect,connect});await contactQueueTick(app,directory,{collect,connect});assert.equal(apollo,1);
 await assert.rejects(enableApolloGap(app,directory,review),/one unused/);
 assert.equal((await readQueue()).items[0].apollo.gap_review.gap,review.gap);
 assert.equal(r.owner_contact,undefined,'provider candidates do not become verified owner evidence');
});

test('changed public evidence and an expired gap review cannot dispatch Apollo',async t=>{
 for(const changed of ['evidence','expiry']){
  const {directory,app,plan,state,r}=await fixture(t);await createContactQueue(directory,plan,state,{now});
  let providerCalls=0;const connect={call:async name=>{if(name.endsWith('mixed_people_api_search'))providerCalls++;return {content:[{type:'text',text:'{"people":[]}'}]};}},collect=async()=>{throw Error('Source unavailable');};
  for(let n=0;n<3;n++)await contactQueueTick(app,directory,{collect,connect});
  const path=join(directory,'queue.json'),q=JSON.parse(await readFile(path,'utf8')),item=q.items[0];
  await enableApolloGap(app,directory,{prospect_id:r.id,reviewed_by:'Source reviewer',reviewed_at:now().toISOString(),gap:'No current owner in the inspected public sources',approval_ref:'One optional identity query',public_evidence_sha256:hash({pages:item.pages,search:item.search})});
  if(changed==='evidence'){const q=JSON.parse(await readFile(path,'utf8'));q.items[0].search.status='Interrupted';await writeFile(path,JSON.stringify(q));}
  await contactQueueTick(app,directory,{collect,connect,...(changed==='expiry'?{now:()=>new Date('2026-10-21T08:00:00Z')}:{})});
  assert.equal(providerCalls,0);assert.equal(JSON.parse(await readFile(path,'utf8')).items[0].apollo.status,'Deferred public-first review');
  if(changed==='expiry')app.now=()=>new Date('2026-10-21T08:00:00Z');
  const deferred=JSON.parse(await readFile(path,'utf8')).items[0];
  await enableApolloGap(app,directory,{prospect_id:r.id,reviewed_by:'Source reviewer',reviewed_at:app.now().toISOString(),gap:'Fresh review still cannot identify the current owner',approval_ref:'Fresh one-query approval; no earlier provider attempt',public_evidence_sha256:hash({pages:deferred.pages,search:deferred.search})});
  await contactQueueTick(app,directory,{collect,connect});assert.equal(providerCalls,1);
  assert.equal(JSON.parse(await readFile(path,'utf8')).items[0].apollo.gap_review_history.length,1);
 }
});

test('the durable contact queue bounds linked capture, keeps primary evidence and never repeats completed reads or changes calls',async t=>{
  const {directory,app,plan,state,r}=await fixture(t),before=structuredClone(r);await createContactQueue(directory,plan,state,{now});
  let gets=0,searches=0,apollo=0;
  const html='<h1>Example Bakery</h1><p>Jane Stone is the owner. Public business telephone 202-555-0123.</p>'+['about','our-story','our-team','contact','about-extra'].map(p=>`<a href="/${p}">${p}</a>`).join('')+'<p>Freshly baked bread for our local community, available every day.</p>';
  const collect=job=>collectPublicSources(job,{now,resolveHost:async()=>[{address:'8.8.8.8'}],request:async()=>{gets++;return new Response(html,{headers:{'content-type':'text/html'}});}});
  const connect={call:async name=>{if(name.endsWith('web_run'))searches++;else apollo++;return {content:[{type:'text',text:'{"people":[]}'}]};}};
  for(let n=0;n<8;n++)await contactQueueTick(app,directory,{now,collect,connect});
  const q=JSON.parse(await readFile(join(directory,'queue.json'),'utf8'));
  assert.equal(q.items[0].pages.length,4);assert.equal(gets,4);assert.equal(searches,1);assert.equal(apollo,0);assert.equal(q.items[0].status,'Awaiting review');assert.deepEqual(r,before);assert.equal(contactQueueSummary(q).reviewed,0);
  assert.equal((await refineContactSearch(app,directory,[r.id])).refined,1);await contactQueueTick(app,directory,{now,collect,connect});assert.equal((await refineContactSearch(app,directory,[r.id])).refined,0);assert.equal(searches,2);assert.equal(apollo,0);
  assert.equal((await readFile(join(directory,q.items[0].search.receipt),'utf8')).includes('people'),true);
  const review={schema_version:1,prospect_id:r.id,reviewed_by:'Identified source reviewer',reviewed_at:now().toISOString(),outcome:'Owner identified; no direct number found',notes:'Jane Stone is listed as owner; the published shop number has no explicit direct-person link.',next_action:'Use the verified business line and confirm the decision-maker in conversation.'};
  await reviewContactQueue(app,directory,review);await reviewContactQueue(app,directory,review);assert.equal(state.contact_research.reviewed,1);assert.deepEqual({...r,contact_review:undefined},{...before,contact_review:undefined});
  await contactQueueTick(app,directory,{now,collect,connect});assert.equal(gets,4);assert.equal(searches,2);assert.equal(apollo,0);
  delete r.contact_review;state.contact_research_runtime={status:'Complete'};app.directory=directory;await writeFile(join(directory,'lifecycle-config.json'),JSON.stringify({priority:'idle',contact_research:{enabled:true,directory,approval_ref:'Owner exact existing-card review'}}));const stop=new AbortController();await runContactQueueService(app,{signal:stop.signal,wait:async()=>stop.abort()});assert.equal(r.contact_review.outcome,review.outcome);assert.equal(searches,2);assert.equal(apollo,0);
});

test('priority, binding changes, access failures and interrupted reads remain explicit without retries or inferred identity',async t=>{
  const {directory,app,plan,state,r}=await fixture(t);await createContactQueue(directory,plan,state,{now});let reads=0;
  const collect=async()=>{reads++;throw Error('Public source blocked');},connect={call:async()=>{reads++;throw Error('Provider unavailable');}};
  assert.equal((await contactQueueTick(app,directory,{priority:'client',collect,connect})).status,'Paused for priority');assert.equal(reads,0);
  const path=join(directory,'queue.json'),q=JSON.parse(await readFile(path,'utf8'));q.items[0].search.status='Reserved';await writeFile(path,JSON.stringify(q));
  for(let n=0;n<4;n++)await contactQueueTick(app,directory,{collect,connect});
  const done=JSON.parse(await readFile(path,'utf8'));assert.equal(reads,1);assert.equal(done.items[0].search.status,'Interrupted');assert.equal(done.items[0].status,'Awaiting review');assert.equal(r.owner_contact,undefined);
  const review={schema_version:1,prospect_id:r.id,reviewed_by:'Source reviewer',reviewed_at:now().toISOString(),outcome:'Source access held',notes:'The source was blocked, search was interrupted, and the provider was unavailable.',next_action:'Retain the verified store line; explicitly authorize any fresh source attempt.'};
  r.contact.phone='202-555-0199';await assert.rejects(reviewContactQueue(app,directory,review),/binding/);
});

test('an explicit contact-review correction preserves its predecessor and never repeats reads',async t=>{
  const {directory,app,plan,state,r}=await fixture(t);await createContactQueue(directory,plan,state,{now});let reads=0;
  const collect=async()=>{reads++;throw Error('Source unavailable');},connect={call:async()=>{reads++;return {content:[{type:'text',text:'{"people":[]}'}]};}};
  for(let n=0;n<3;n++)await contactQueueTick(app,directory,{collect,connect});
  const review={schema_version:1,prospect_id:r.id,reviewed_by:'Source reviewer',reviewed_at:now().toISOString(),outcome:'No owner found in checked sources',notes:'Checked public sources did not establish a current owner.',next_action:'Use the verified business line to confirm the current decision-maker.'};
  await reviewContactQueue(app,directory,review);const before=structuredClone(r.contact_review),readsBefore=reads;
  const corrected={...review,notes:'No individual was accepted; the general shop number remains a business fallback.'};
  await assert.rejects(reviewContactQueue(app,directory,corrected),/explicit review/);
  await assert.rejects(reviewContactQueue(app,directory,{...corrected,supersedes_review_sha256:hash('wrong')}),/explicit review/);
  const amendment={...corrected,supersedes_review_sha256:hash(before)};
  await reviewContactQueue(app,directory,amendment);await reviewContactQueue(app,directory,amendment);
  assert.deepEqual(JSON.parse(await readFile(join(directory,r.contact_review.previous_review_ref),'utf8')),before);
  assert.deepEqual(r.contact_review.evidence,before.evidence);assert.equal(r.contact_review.notes,corrected.notes);
  await contactQueueTick(app,directory,{collect,connect});assert.equal(reads,readsBefore);assert.deepEqual(r.calls,{keep:true});assert.equal(r.restriction,'do_not_contact');
});

test('scope expansion, evidence tampering and incomplete review are rejected',async t=>{
  const {directory,app,plan,state}=await fixture(t);const invalid=structuredClone(plan);invalid.items.push(invalid.items[0]);await assert.rejects(createContactQueue(directory,invalid,state,{now}),/exact/);
  await createContactQueue(directory,plan,state,{now});await assert.rejects(reviewContactQueue(app,directory,{prospect_id:'existing'}),/retrieval/);
  const path=join(directory,'queue.json'),q=JSON.parse(await readFile(path,'utf8'));q.items[0].bound_contact_sha256='changed';await writeFile(path,JSON.stringify(q));await assert.rejects(contactQueueTick(app,directory),/scope/);
});

test('one transport recovery preserves failure evidence and cannot reopen provider errors or consume another attempt',async t=>{
  const {directory,app,plan,state}=await fixture(t);await createContactQueue(directory,plan,state,{now});const path=join(directory,'queue.json'),q=JSON.parse(await readFile(path,'utf8'));
  q.items[0].search={status:'Unavailable',reason:'Connector session is closed',checked_at:now().toISOString()};q.items[0].apollo={status:'Unavailable',reason:'Provider permission denied'};q.items[0].status='Awaiting review';await writeFile(path,JSON.stringify(q));
  assert.equal((await recoverContactTransport(directory,{now})).recovered,1);let saved=JSON.parse(await readFile(path,'utf8'));assert.equal(saved.items[0].search.transport_recovery.previous_reason,'Connector session is closed');assert.equal(saved.items[0].apollo.status,'Unavailable');
  saved.items[0].search.status='Unavailable';saved.items[0].search.reason='Malformed connector protocol response';await writeFile(path,JSON.stringify(saved));assert.equal((await recoverContactTransport(directory,{now})).recovered,0);
  await assert.rejects(reviewContactQueue(app,directory,{prospect_id:'existing'}),/retrieval/);
});

test('public image-alt role evidence survives capture and an unavailable URL retains its actual failure',async()=>{
  const job={id:'alt-proof',business_name:'Example Bakery',website:'https://bakery.example.com/',seed_urls:['https://bakery.example.com/'],research_version:3,as_of:'2026-10-19'};
  const options={now,resolveHost:async()=>[{address:'8.8.8.8'}]};
  const s=await collectPublicSources(job,{...options,request:async()=>new Response('<h1>Example Bakery</h1><img alt="Jane Stone, Owner and Baker" src="portrait.jpg"><p>'+('Fresh bread for the neighborhood. '.repeat(10))+'</p>',{headers:{'content-type':'text/html'}})});assert.match(s.sources[0].text,/Jane Stone, Owner and Baker/);
  await assert.rejects(collectPublicSources(job,{...options,request:async()=>new Response('Forbidden',{status:403})}),e=>e.code==='SOURCE_UNAVAILABLE'&&e.failures[0].url===job.seed_urls[0]&&/readable/.test(e.failures[0].reason));
});

test('the supervised contact loop does not open a connector during website/client priority',async t=>{
  const {directory,app,plan,state}=await fixture(t);app.directory=directory;await createContactQueue(directory,plan,state,{now});await writeFile(join(directory,'lifecycle-config.json'),JSON.stringify({priority:'website',contact_research:{enabled:true,directory,approval_ref:'Owner exact existing-card review'}}));const stop=new AbortController();await runContactQueueService(app,{signal:stop.signal,clientFactory:()=>assert.fail('Priority must prevent even connector startup'),wait:async()=>stop.abort()});assert.equal(state.contact_research_runtime.status,'Paused for priority');
});

test('the supervised loop captures public pages before attempting an unavailable connector',async t=>{
 const {directory,app,plan,state}=await fixture(t);app.directory=directory;await createContactQueue(directory,plan,state,{now});
 await writeFile(join(directory,'lifecycle-config.json'),JSON.stringify({priority:'idle',contact_research:{enabled:true,directory,approval_ref:'Owner exact existing-card review'}}));
 let captures=0,connections=0,ticks=0;const stop=new AbortController();
 const collect=job=>collectPublicSources(job,{now,resolveHost:async()=>[{address:'8.8.8.8'}],request:async()=>{captures++;return new Response('Example Bakery public menu and shop telephone. '+('Fresh bread. '.repeat(12)),{headers:{'content-type':'text/plain'}});}});
 await runContactQueueService(app,{collect,signal:stop.signal,clientFactory:()=>{connections++;throw Error('Connector session unavailable');},wait:async()=>{if(++ticks===1){assert.equal(captures,1);assert.equal(connections,0);}if(ticks===3)stop.abort();}});
 const saved=JSON.parse(await readFile(join(directory,'queue.json'),'utf8'));assert.equal(saved.items[0].pages[0].status,'Captured');assert.equal(saved.items[0].search.status,'Unavailable');assert.equal(saved.items[0].status,'Awaiting review');assert.equal(connections,1);
});
