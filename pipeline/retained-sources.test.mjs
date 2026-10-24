import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceContentHash} from './sources.mjs';
import {projectSourceBodies,retainedSource} from './retained-sources.mjs';

const capture=(url='https://example.invalid/services')=>{
 const s={url,text:'Fictional retained page. '.repeat(700),capture_method:'http',fetched_at:'2026-10-23T15:00:00.000Z',coverage:'full'};
 s.content_sha256=sourceContentHash(s);return s;
};
test('hosted projection removes only captured web bodies, preserving exact citations and conversation text without mutating state',()=>{
 const source=capture(),original={prospects:{alpha:{verification:{packet:{sources:[source],claims:[{excerpt:'Fictional retained page.',source_url:source.url,source_sha256:source.content_sha256}]}},calls:[{transcript:{text:'Customer conversation'},note:{text:'Private operator note'}}]}}},before=structuredClone(original),view=projectSourceBodies(original);
 assert.deepEqual(original,before);assert.ok(JSON.stringify(view).length<JSON.stringify(original).length/10);
 const projected=view.prospects.alpha.verification.packet.sources[0];assert.equal(projected.text,undefined);assert.equal(projected.body_omitted,true);assert.equal(projected.content_sha256,source.content_sha256);
 assert.deepEqual(view.prospects.alpha.calls,original.prospects.alpha.calls);assert.deepEqual(view.prospects.alpha.verification.packet.claims,original.prospects.alpha.verification.packet.claims);
 assert.deepEqual(retainedSource(original,'alpha',source.content_sha256,source.url,source.fetched_at),source);
});
test('private saved capture lookup binds exact project, URL and digest, checks context integrity and never follows a URL',()=>{
 const source=capture(),other=capture('https://other.invalid/services'),state={prospects:{alpha:{nested:[source,other]},beta:{}}};
 assert.deepEqual(retainedSource(state,'alpha',source.content_sha256,other.url,other.fetched_at),other);
 for(const [project,sha,url] of [['beta',source.content_sha256,source.url],['missing',source.content_sha256,source.url],['__proto__',source.content_sha256,source.url],['alpha','a'.repeat(64),source.url],['alpha',source.content_sha256,'https://unrelated.invalid/']])assert.throws(()=>retainedSource(state,project,sha,url,source.fetched_at),/not available/);
 assert.throws(()=>retainedSource(state,'alpha',source.content_sha256,source.url,'2026-10-22T15:00:00.000Z'),/not available/);
 source.text='Corrupted body';assert.throws(()=>retainedSource(state,'alpha',source.content_sha256,source.url,source.fetched_at),/integrity/);
 const reviewed={...capture(),reviewed_context:{facts:[{statement:'Reviewed fact'}]}};reviewed.content_sha256=sourceContentHash(reviewed);state.prospects.alpha={reviewed};assert.deepEqual(retainedSource(state,'alpha',reviewed.content_sha256,reviewed.url,reviewed.fetched_at),reviewed);
 assert.equal(projectSourceBodies(reviewed).reviewed_context,undefined);reviewed.reviewed_context.facts[0].statement='Changed fact';assert.throws(()=>retainedSource(state,'alpha',reviewed.content_sha256,reviewed.url,reviewed.fetched_at),/integrity/);
 const oversized=capture();oversized.text='x'.repeat(200_000);oversized.content_sha256=sourceContentHash(oversized);state.prospects.alpha={oversized};assert.throws(()=>retainedSource(state,'alpha',oversized.content_sha256,oversized.url,oversized.fetched_at),/limit/);
});
