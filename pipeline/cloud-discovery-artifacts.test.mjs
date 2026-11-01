import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cloudDiscoveryArtifactStore,cloudDiscoveryArtifactMaxBytes} from './cloud-discovery-artifacts.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function fixture(){
 const objects=new Map(),paths=[];let lose=null,fail=false;
 const raw={async set(key,bytes,options){paths.push(['write',key]);assert.deepEqual(options,{onlyIfNew:true});assert.match(key,/^cloud-discovery\/[a-f0-9]{64}\/(manifest|[01]-[a-f0-9]{64})$/);assert.ok(bytes.length<=1000000);if(fail)throw Error('Not saved');if(objects.has(key))return {modified:false};objects.set(key,Buffer.from(bytes));if(lose?.(key)){lose=null;throw Error('Lost acknowledgement');}return {modified:true};},async getWithMetadata(key,options){paths.push(['read',key]);assert.deepEqual(options,{type:'arrayBuffer',consistency:'strong'});const bytes=objects.get(key);return bytes?{data:Uint8Array.from(bytes).buffer}:null;}};
 return {objects,paths,store:cloudDiscoveryArtifactStore(raw),lose:fn=>lose=fn,fail:()=>fail=true};
}
test('exact UTF-8 JSON reference and bounded chunks round-trip with lost chunk or manifest acknowledgement',async()=>{
 for(const suffix of ['chunk','manifest']){
  const f=fixture(),payload={schema_version:1,evidence:'é'.repeat(510000),candidates:[{name:'Fictional',sources:['https://example.invalid/']}],review:null};f.lose(path=>suffix==='manifest'?path.endsWith('/manifest'):!path.endsWith('/manifest'));
  const ref=await f.store.put(payload);assert.deepEqual(ref,{sha256:hash(payload),bytes:Buffer.byteLength(JSON.stringify(payload)),reference:'cloud-discovery/'+hash(payload)});assert.equal(f.objects.size,3);assert.deepEqual(await f.store.get(ref),payload);await f.store.put(payload);assert.equal(f.objects.size,3);assert.equal(Object.keys(ref).length,3);
 }
});
test('exact byte ceiling accepted, over-ceiling and non-JSON/prototype input rejected before storage',async()=>{
 const f=fixture(),payload={value:'a'.repeat(cloudDiscoveryArtifactMaxBytes-12)},ref=await f.store.put(payload);assert.equal(ref.bytes,cloudDiscoveryArtifactMaxBytes);assert.deepEqual(await f.store.get(ref),payload);
 const cyclic={};cyclic.self=cyclic;const getter={};Object.defineProperty(getter,'value',{enumerable:true,get(){assert.fail('Getter must not execute');}});const sparse=[];sparse.length=1;const hidden={};Object.defineProperty(hidden,'secret',{value:'not JSON'});const extra=[];extra.extra='not JSON';const symbol={};symbol[Symbol('bad')]='bad';let deep={};for(let i=0;i<66;i++)deep={nested:deep};
 const bad=[{value:payload.value+'x'},[],null,'text',new Date(),{n:NaN},{n:Infinity},{n:-0},{v:undefined},{v:1n},{v:()=>{}},getter,hidden,symbol,cyclic,deep,{a:sparse},{a:extra},Object.create({inherited:true}),JSON.parse('{"__proto__":{"polluted":true}}'),{nested:{constructor:'bad'}},{nested:{prototype:'bad'}},{toJSON(){assert.fail('toJSON must not execute');}}];
 bad.push({a:new (class extends Array {toJSON(){assert.fail('Inherited serialization must not execute');}})()});
 for(const input of bad){const before=f.paths.length;await assert.rejects(f.store.put(input));assert.equal(f.paths.length,before);}
 assert.equal({}.polluted,undefined);
});
test('closed references reject traversal, prototype, hash and byte changes before reads',async()=>{
 const f=fixture(),ref={sha256:'a'.repeat(64),bytes:2,reference:'cloud-discovery/'+'a'.repeat(64)};
 for(const bad of [{...ref,reference:'../secret'},{...ref,sha256:'../secret'},{...ref,bytes:2000001},{...ref,bytes:1},{...ref,path:'other'},Object.assign(Object.create({path:'other'}),ref),{...ref,get reference(){assert.fail('Reference getter must not run');}}])await assert.rejects(f.store.get(bad));assert.equal(f.paths.length,0);
});
test('missing, corrupt, mismatched and extra manifest fields fail closed without overwriting',async()=>{
 for(const kind of ['missing-manifest','missing-chunk','corrupt-chunk','wrong-size','wrong-whole-hash','wrong-chunk-hash','extra-field','bad-count']){
  const f=fixture(),payload={value:'x'.repeat(1000010)},ref=await f.store.put(payload),manifest=ref.reference+'/manifest',m=JSON.parse(f.objects.get(manifest)),chunk=[...f.objects.keys()].find(k=>k.includes('/0-'));
  if(kind==='missing-manifest')f.objects.delete(manifest);if(kind==='missing-chunk')f.objects.delete(chunk);if(kind==='corrupt-chunk')f.objects.get(chunk)[0]^=1;
  if(kind==='wrong-size')m.bytes--;if(kind==='wrong-whole-hash')m.sha256='b'.repeat(64);if(kind==='wrong-chunk-hash')m.chunks[0]='../bad';if(kind==='extra-field')m.path='../bad';if(kind==='bad-count')m.chunks.pop();if(!kind.startsWith('missing')&&kind!=='corrupt-chunk')f.objects.set(manifest,Buffer.from(JSON.stringify(m)));
  await assert.rejects(f.store.get(ref));if(kind==='corrupt-chunk'){const before=Buffer.from(f.objects.get(chunk));await assert.rejects(f.store.put(payload),/conflicting/);assert.deepEqual(f.objects.get(chunk),before);}
 }
 const f=fixture();f.fail();await assert.rejects(f.store.put({value:'not committed'}),/missing/);assert.equal(f.objects.size,0);
});
test('whole-file SHA and canonical object JSON checked even with resealed manifest/chunks',async()=>{
 for(const bytes of [Buffer.from('{ "a":1}'),Buffer.from('[1,2]'),Buffer.from('{"__proto__":{}}'),Buffer.from('{"x":"\ufffd"}'),Buffer.from([123,34,120,34,58,34,255,34,125])]){
  const f=fixture(),chunkHash=createHash('sha256').update(bytes).digest('hex'),ref={sha256:chunkHash,bytes:bytes.length,reference:'cloud-discovery/'+chunkHash};f.objects.set(ref.reference+'/0-'+chunkHash,bytes);f.objects.set(ref.reference+'/manifest',Buffer.from(JSON.stringify({format:'cloud-discovery-json-v1',sha256:ref.sha256,bytes:bytes.length,chunk_size:1000000,chunks:[chunkHash]})));
  if(bytes.equals(Buffer.from('{"x":"\ufffd"}')))assert.deepEqual(await f.store.get(ref),{x:'\ufffd'});else await assert.rejects(f.store.get(ref));
 }
 const f=fixture(),ref=await f.store.put({value:'one'}),m=JSON.parse(f.objects.get(ref.reference+'/manifest')),bytes=Buffer.from('{"value":"two"}'),chunkHash=hash(bytes.toString());m.chunks=[chunkHash];f.objects.set(ref.reference+'/manifest',Buffer.from(JSON.stringify(m)));f.objects.set(ref.reference+'/0-'+chunkHash,bytes);await assert.rejects(f.store.get(ref),/whole-file/);
});
test('guard revocation interrupts writes/reads and caller mutation cannot redirect a read',async()=>{
 const f=fixture();let calls=0;await assert.rejects(f.store.put({value:'x'.repeat(1000010)},{guard:async()=>{if(++calls===3)throw Error('Revoked');}}),/Revoked/);assert.equal(f.objects.size,1);assert.ok(![...f.objects.keys()].some(k=>k.endsWith('/manifest')));
 const g=fixture(),ref=await g.store.put({value:'safe'});calls=0;await assert.rejects(g.store.get(ref,{guard:async()=>{if(++calls===2)throw Error('Expired');}}),/Expired/);
 const input={...ref};assert.deepEqual(await g.store.get(input,{guard:async()=>{input.reference='../redirect';}}),{value:'safe'});assert.ok(g.paths.every(([,p])=>p.startsWith('cloud-discovery/')));
});
