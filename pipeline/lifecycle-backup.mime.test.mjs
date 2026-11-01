import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {StudioLifecycle,hash} from './lifecycle.mjs';
import {mailboxMimeStore} from './mailbox-mime-store.mjs';
import {writeLifecycleBackup,readLifecycleBackup,restoreLifecycleBackup,validateBackupDependencies,writePortableLifecycleBackup,hostedManualBackupInventory,installMailboxMimeDependencies} from './lifecycle-backup.mjs';
const at='2026-11-02T14:00:00.000Z';
function blobs(){const files=new Map();let writes=0;return {files,get writes(){return writes},async getWithMetadata(k){return files.has(k)?{data:Buffer.from(files.get(k))}:null},async set(k,b,o){writes++;if(o.onlyIfNew&&files.has(k))return {modified:false};files.set(k,Buffer.from(b));return {modified:true}}};}
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'evz-mime-backup-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'source'),app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)}),state=await app.snapshot(),raw=blobs();
 const bytes=Buffer.concat([Buffer.from('Message-ID: <fictional@example.invalid>\r\n\r\n'),Buffer.alloc(1000010,65)]),ref=await mailboxMimeStore(raw).put(bytes);
 const mime={...ref,reference:'mailbox-mime/'+ref.sha256,message_id:'<fictional@example.invalid>'};
 state.mailbox_delivery={paused:false,epoch:2,intents:{uncertain:{status:'Uncertain',claimed_at:at,mime},reserved:{status:'Reserved',claimed_at:null,mime},verified:{status:'Verified',claimed_at:at,mime,receipt:{message_id:'retained'}}}};
 for(const [name,value] of raw.files){const p=join(directory,...name.split('/'));await mkdir(dirname(p),{recursive:true});await writeFile(p,value);}
 return {root,directory,state,raw,bytes,ref,output:join(root,'backup.json'),destination:join(root,'restored')};
}
test('exact multi-chunk MIME survives backup, inert local recovery and immutable shared reinstall',async t=>{
 const f=await fixture(t);await writeLifecycleBackup(f.directory,f.state,f.output,at);const packet=await readLifecycleBackup(f.output);assert.equal(packet.files.size,3);assert.deepEqual(packet.state.mailbox_delivery,f.state.mailbox_delivery);
 const target=blobs();await installMailboxMimeDependencies(packet.state,packet.files,target);assert.deepEqual(await mailboxMimeStore(target).get(f.ref),f.bytes);await installMailboxMimeDependencies(packet.state,packet.files,target);assert.equal(target.files.size,3);
 await restoreLifecycleBackup(f.output,f.destination);const restored=JSON.parse(await readFile(join(f.destination,'lifecycle-state.json'))),config=JSON.parse(await readFile(join(f.destination,'lifecycle-config.json')));
 assert.equal(restored.mailbox_delivery.paused,true);assert.equal(restored.mailbox_delivery.epoch,3);assert.equal(restored.mailbox_delivery.intents.reserved.status,'Held');assert.deepEqual(restored.mailbox_delivery.intents.uncertain,f.state.mailbox_delivery.intents.uncertain);assert.deepEqual(restored.mailbox_delivery.intents.verified,f.state.mailbox_delivery.intents.verified);assert.equal(config.mailbox_delivery,undefined);assert.equal(config.outreach_enabled,false);
 const recovered=blobs();for(const key of target.files.keys())recovered.files.set(key,await readFile(join(f.destination,...key.split('/'))));assert.deepEqual(await mailboxMimeStore(recovered).get(f.ref),f.bytes);
});
test('missing, corrupt, mismatched, extra and unsafe MIME dependencies fail before shared writes',async t=>{
 const f=await fixture(t);const first=[...f.raw.files.keys()].find(p=>p.includes('/0-'));
 for(const kind of ['missing','corrupt','manifest','size','extra','escape']){
  const files=new Map([...f.raw.files].map(([k,v])=>[k,Buffer.from(v)])),state=structuredClone(f.state);
  if(kind==='missing')files.delete(first);if(kind==='corrupt')files.get(first)[0]^=1;
  if(kind==='manifest'){const key=[...files.keys()].find(k=>k.endsWith('/manifest')),m=JSON.parse(files.get(key));m.chunks.reverse();files.set(key,Buffer.from(JSON.stringify(m)));}
  if(kind==='size')for(const i of Object.values(state.mailbox_delivery.intents))i.mime.bytes--;
  if(kind==='extra')files.set('mailbox-mime/'+f.ref.sha256+'/2-'+'a'.repeat(64),Buffer.from('extra'));
  if(kind==='escape')state.mailbox_delivery.intents.uncertain.mime.reference='../escape';
  const destination=blobs();await assert.rejects(installMailboxMimeDependencies(state,files,destination));assert.equal(destination.writes,0);
 }
});
test('legacy state-only backup cannot discard MIME readback evidence',async t=>{
 const f=await fixture(t),body=JSON.stringify(f.state);await writeFile(f.output,JSON.stringify({schema_version:1,created_at:at,body,sha256:hash(body)}));await assert.rejects(readLifecycleBackup(f.output),/Incomplete legacy backup/);
});
test('hosted manual export reads exact MIME blobs without requiring local MIME copies and rejects concurrent state change',async t=>{
 const f=await fixture(t);await rm(join(f.directory,'mailbox-mime'),{recursive:true});const data={state:f.state,config:{shared_capability:'shared-mailbox-delivery-v1'}};let changed=false,calls=0;
 const app={store:{manualBinding:{scope:{capability:'shared-mailbox-delivery-v1'}},store:f.raw,async envelope(){calls++;const copy=structuredClone(data);if(changed&&calls%2===0)copy.state.revision++;return {data:copy}}}};
 const result=await hostedManualBackupInventory(app,f.directory);assert.equal(result.files.size,3);await writePortableLifecycleBackup(result.state,result.files,f.output,at);assert.deepEqual((await readLifecycleBackup(f.output)).state.mailbox_delivery,f.state.mailbox_delivery);
 changed=true;await assert.rejects(hostedManualBackupInventory(app,f.directory),/Workspace changed/);
 app.store.manualBinding.scope.capability='shared-mailbox-clock-v1';await assert.rejects(hostedManualBackupInventory(app,f.directory),/own capability/);
});
test('immutable shared import rejects conflicting existing chunk without overwriting it',async t=>{
 const f=await fixture(t),target=blobs(),first=[...f.raw.files.keys()].find(p=>p.includes('/0-'));target.files.set(first,Buffer.from('conflicting retained evidence'));await assert.rejects(installMailboxMimeDependencies(f.state,f.raw.files,target),/conflicts/);assert.equal(target.files.get(first).toString(),'conflicting retained evidence');
});
