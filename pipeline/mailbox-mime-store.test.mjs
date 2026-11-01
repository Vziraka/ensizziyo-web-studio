import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mailboxMimeStore} from './mailbox-mime-store.mjs';

function fixture(){
 const objects=new Map();let lose=false,reads=0,writes=0;
 const raw={async set(key,bytes,{onlyIfNew}){writes++;assert.equal(onlyIfNew,true);if(objects.has(key))return {modified:false};objects.set(key,Buffer.from(bytes));if(lose){lose=false;throw Error('ack lost');}return {modified:true};},async getWithMetadata(key){reads++;const bytes=objects.get(key);return bytes?{data:Uint8Array.from(bytes).buffer}:null;}};
 return {objects,raw,store:mailboxMimeStore(raw),lose:()=>lose=true,counts:()=>({reads,writes})};
}
test('large exact MIME survives chunk storage and lost acknowledgement without entering canonical state',async()=>{
 const f=fixture(),bytes=Buffer.alloc(2_100_123,97);f.lose();const ref=await f.store.put(bytes);
 assert.deepEqual(ref,{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});assert.equal(JSON.stringify(ref).length<120,true);
 assert.equal(f.objects.size,4);assert.deepEqual(await f.store.get(ref),bytes);await f.store.put(bytes);assert.equal(f.objects.size,4);
});
test('missing or altered MIME bytes and conflicting immutable writes fail closed',async()=>{
 const f=fixture(),bytes=Buffer.from('From: hello@evzdigital.studio\r\n\r\nExact original'),ref=await f.store.put(bytes),chunk=[...f.objects.keys()].find(k=>!k.endsWith('/manifest'));
 f.objects.set(chunk,Buffer.alloc(bytes.length,98));await assert.rejects(f.store.get(ref),/integrity/);await assert.rejects(f.store.put(bytes),/conflicts/);
 f.objects.delete(chunk);await assert.rejects(f.store.get(ref),/missing/);
});
test('invalid references reject before storage and a changed guard interrupts transfer',async()=>{
 const f=fixture();for(const ref of [{sha256:'../secret',bytes:1},{sha256:'a'.repeat(64),bytes:28_000_001},{sha256:'a'.repeat(64),bytes:1,path:'other'}])await assert.rejects(f.store.get(ref));
 assert.deepEqual(f.counts(),{reads:0,writes:0});let guards=0;await assert.rejects(f.store.put(Buffer.alloc(2_000_001),{guard:async()=>{if(++guards===3)throw Error('deadline expired');}}),/deadline/);
 assert.equal(f.objects.size,1);assert.ok(![...f.objects.keys()].some(k=>k.endsWith('/manifest')));
});
