import test from 'node:test';import assert from 'node:assert/strict';
import {deskSnapshotPage} from './desk-snapshot.mjs';import {readDeskSnapshot} from './lifecycle-ui/snapshot-read.js';

test('bounded UTF-8 snapshot pages reconstruct exactly and fail closed on mixed revisions, corruption or interrupted reads',async()=>{
 const view={revision:7,prospects:{first:{note:'Unicode 🪴 and quoted "evidence". '.repeat(90000)}}},first=deskSnapshotPage(view),response=()=>new Response(JSON.stringify(first));
 let count=0;const fetch=async path=>{const page=deskSnapshotPage(view,new URL(path,'https://local.invalid').searchParams);count++;assert.ok(Buffer.byteLength(JSON.stringify(page))<=3_100_000);return new Response(JSON.stringify(page));};
 assert.deepEqual(await readDeskSnapshot(response(),{path:'/desk/api/state',fetch}),view);assert.ok(count>1);
 assert.throws(()=>deskSnapshotPage({...view,revision:8},new URLSearchParams({part:'1',revision:'7',sha256:first.sha256})),e=>e.code==='STATE_CONFLICT');
 assert.throws(()=>deskSnapshotPage(view,new URLSearchParams({part:'01'})),/Invalid/);
 for(const change of [p=>{p.text=p.text.replace('Unicode','Corrupt');},p=>{p.revision++;},p=>{p.part=0;}])await assert.rejects(readDeskSnapshot(response(),{path:'/desk/api/state',fetch:async path=>{const p=await (await fetch(path)).json();change(p);return new Response(JSON.stringify(p));}}),/match|integrity/);
 await assert.rejects(readDeskSnapshot(response(),{path:'/desk/api/state',fetch:async()=>new Response(null,{status:503})}),/interrupted/);
 assert.deepEqual(await readDeskSnapshot(new Response(JSON.stringify({revision:1})),{}),{revision:1});
});

for(const [from,to] of [['owner','friend'],['friend','owner']])test(`switching ${from} to ${to} during a paged read starts a new session snapshot`,async()=>{
 const {createSessionRefresh}=await import('./lifecycle-ui/snapshot-read.js');let actor=from,release,started;const entered=new Promise(r=>started=r),wait=new Promise(r=>release=r),view=who=>({revision:7,current_operator:who,prospects:{first:{note:'Fictional data. '.repeat(150000)}}}),sessions=createSessionRefresh(async signal=>{const first=deskSnapshotPage(view(actor));return readDeskSnapshot(new Response(JSON.stringify(first)),{path:'/desk/api/state',fetch:async url=>{if(actor===from){started();await wait;}try{return new Response(JSON.stringify(deskSnapshotPage(view(actor),new URL(url,'https://local.invalid').searchParams)));}catch{return new Response(null,{status:409});}}});});
 const old=sessions.refresh(),oldRejected=assert.rejects(old,e=>e.name==='AbortError');await entered;actor=to;sessions.invalidate();const current=sessions.refresh();release();const result=await current;assert.equal(result.current_operator,to);await oldRejected;
});
