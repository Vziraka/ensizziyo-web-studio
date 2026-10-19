import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectResearchTools,retainResearchTools} from './research-tools.mjs';
import {sourceContentHash} from './sources.mjs';
const now=()=>new Date('2026-10-19T15:00:00Z');
const job={id:'synthetic-tools',business_name:'SYNTHETIC Bakery',website:'https://example.org/',seed_urls:['https://example.org/'],as_of:'2026-10-19',research_version:3};
const source={url:job.website,fetched_at:now().toISOString(),checked_at:job.as_of,text:'SYNTHETIC Bakery has a public order route at https://example.org/orders and a menu at https://example.org/menu.',kind:'business',capture_method:'http',coverage:'full',identity_note:'Fictional business.'};source.content_sha256=sourceContentHash(source);
source.coverage_reason='Retained complete fictional page.';source.identity_note='Fictional first-party business source.';
const snapshots={sources:[source],failures:[]};
test('bounded read-only tools retain exact routes and distinguish archived history from present activity',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'evz-tools-'));t.after(()=>rm(directory,{recursive:true,force:true}));await mkdir(join(directory,job.id));let calls=0;
  const options={now,resolveMx:async domain=>{assert.equal(domain,'example.org');return[{exchange:'mail.example.org',priority:10}];},request:async(url,o)=>{calls++;assert.equal(o.method,'GET');assert.equal(new URL(url).hostname,'urlscan.io');assert.equal(new URL(url).searchParams.get('size'),'1');return Response.json({results:[{_id:'00000000-0000-4000-8000-000000000000',task:{time:'2026-10-01T15:00:00Z'},page:{url:'https://example.org/',status:'200',title:'Fictional archive'}}]});}};
  const r=await retainResearchTools(directory,job,snapshots,options);assert.equal(r.report.dns_mx.status,'Records found');assert.equal(r.report.urlscan.status,'Archived result');assert.equal(r.report.routes[0].links.length,2);assert.match(r.report.limitations,/does not prove/);
  const bytes=await readFile(join(directory,job.id,'research-tools.json'),'utf8');await retainResearchTools(directory,job,snapshots,options);assert.equal(calls,1);assert.equal(await readFile(join(directory,job.id,'research-tools.json'),'utf8'),bytes);
  await assert.rejects(retainResearchTools(directory,job,{...snapshots,failures:[{url:job.website,reason:'Changed capture'}]},options),/evidence changed/);
});
test('rate limits, missing archive, null MX and bad identity are explicit without retries or negative business claims',async()=>{
  const options={now,resolveMx:async()=>[{exchange:'.',priority:0}]};let calls=0;
  let r=await inspectResearchTools(job,snapshots,{...options,request:async()=>{calls++;return new Response('',{status:429});}});assert.equal(calls,1);assert.equal(r.urlscan.status,'Rate limited');assert.equal(r.dns_mx.status,'Null MX');
  r=await inspectResearchTools(job,snapshots,{...options,request:async()=>Response.json({results:[]})});assert.equal(r.urlscan.status,'No archived result');
  r=await inspectResearchTools(job,snapshots,{...options,request:async()=>Response.json({results:[{page:{url:'https://different.example/'}}]})});assert.equal(r.urlscan.status,'Unavailable');
  const stop=new AbortController();stop.abort();await assert.rejects(inspectResearchTools(job,snapshots,{signal:stop.signal,...options}),/abort/i);
});
