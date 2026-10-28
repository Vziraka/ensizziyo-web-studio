import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {searchReferences,evaluateApollo,main} from './studio-context.mjs';

test('reference search ranks relevant patterns and returns no unrelated defaults',async()=>{
  const entries=JSON.parse(await readFile(new URL('../docs/design-references.json',import.meta.url)));
  assert.equal(searchReferences(entries,'reduced-motion')[0].id,'reduced-motion');
  assert.equal(searchReferences(entries,'keyboard')[0].id,'wai-navigation');
  assert.deepEqual(searchReferences(entries,'unfindable-pattern'),[]);
  assert.throws(()=>searchReferences(entries,''),/query/);
  assert.equal((await main(['references','waveform'])).references[0].id,'studio-voice');
  await assert.rejects(main(['preferences']),/Use references/);
});

test('Apollo comparison measures additional reviewed utility and refuses incomplete or duplicate evidence',()=>{
  const rows=[{id:'fictional-a',public_reviewed:true,apollo_reviewed:true,public_usable:true,apollo_additional_usable:false,public_minutes:4,apollo_minutes:2,credits:1,additional_evidence:''},
    {id:'fictional-b',public_reviewed:true,apollo_reviewed:true,public_usable:false,apollo_additional_usable:true,public_minutes:5,apollo_minutes:3,credits:8,additional_evidence:'Reviewed professional route, distinct from retained public route; exact private receipt reference.'}];
  const result=evaluateApollo(rows);assert.equal(result.public_usable,1);assert.equal(result.apollo_additional_usable,1);assert.equal(result.credits_per_additional,9);assert.equal(result.apollo_minutes_per_additional,5);assert.equal(result.public_minutes,9);
  assert.equal(JSON.stringify(result).includes('fictional-b'),false,'Summary excludes client identities and evidence');
  for(const bad of [[rows[0],rows[0]],[{...rows[0],credits:-1}],[{...rows[1],additional_evidence:''}],[{...rows[0],public_reviewed:false}]])assert.throws(()=>evaluateApollo(bad),/observation/);
  assert.equal(evaluateApollo([rows[0]]).credits_per_additional,null);
});
