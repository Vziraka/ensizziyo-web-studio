import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkerOutput } from './workers.mjs';

test('a completed fenced JSON result can have explanatory prose after its closing fence',()=>{
 const review={schema_version:1,packet_sha256:'a'.repeat(64),accepted:true,reason:'SYNTHETIC source facts match the retained packet.',owner:null},body='```json\n'+JSON.stringify(review)+'\n```\n\n| Check | Finding |\n| Identity | Source matches |';
 for(const raw of [JSON.stringify({type:'result',subtype:'success',is_error:false,result:body}),JSON.stringify({type:'assistant',message:{content:[{type:'text',text:body}]}})+'\n'+JSON.stringify({type:'result',subtype:'success',is_error:false,result:body})])assert.deepEqual(parseWorkerOutput(raw),review);
});

test('JSON framing rejects leading prose, multiple fences and terminal provider errors',()=>{
 const json=JSON.stringify({schema_version:1,accepted:true}),fence='```json\n'+json+'\n```';
 for(const result of ['Here is the result:\n'+fence,fence+'\n\n'+fence])assert.throws(()=>parseWorkerOutput(JSON.stringify({type:'result',subtype:'success',is_error:false,result})));
 assert.throws(()=>parseWorkerOutput(JSON.stringify({type:'result',is_error:true,result:fence+'\nExplanation'})));
});

test('direct independent-review JSON is parsed without requiring a top-level research version', () => {
  for (const verdict of ['Accepted', 'Revise']) {
    const result = { verdict, corrections: verdict === 'Accepted' ? [] : ['Check the source.'], decision: { schema_version: 1, decision: 'Hold' } };
    assert.deepEqual(parseWorkerOutput(JSON.stringify(result)), result);
  }
});

test('provider errors and incomplete objects cannot masquerade as direct review results', () => {
  assert.throws(() => parseWorkerOutput(JSON.stringify({ is_error: true, verdict: 'Accepted', decision: {} })));
  assert.throws(() => parseWorkerOutput(JSON.stringify({ verdict: 'Accepted' })));
  assert.throws(() => parseWorkerOutput(JSON.stringify({ verdict: 'Accepted', decision: null })));
});
