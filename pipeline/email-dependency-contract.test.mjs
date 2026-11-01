import test from 'node:test';
import assert from 'node:assert/strict';
// All signed/provider-facing fixtures run with literal injected transports, never host credentials.
process.env={...Object.fromEntries(['SystemRoot','WINDIR','TEMP','TMP'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),NODE_TEST_CONTEXT:'child-v8'};
const denied=[],deny=name=>()=>{denied.push(name);throw Error('Unexpected real IO: '+name);};globalThis.fetch=deny('fetch');
for(const name of ['http','https']){const m=(await import('node:'+name)).default;m.request=m.get=deny(name);}
const net=(await import('node:net')).default;net.connect=net.createConnection=net.Socket.prototype.connect=deny('net');
(await import('node:tls')).default.connect=deny('tls');(await import('node:dgram')).default.createSocket=deny('udp');
const dns=(await import('node:dns')).default;
for(const key of ['lookup','lookupService','resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse']){if(typeof dns[key]==='function')dns[key]=deny('dns');if(typeof dns.promises[key]==='function')dns.promises[key]=deny('dns');}
const cp=(await import('node:child_process')).default;for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[key]=deny('process');
(await import('node:module')).syncBuiltinESMExports();test.after(()=>assert.deepEqual(denied,[]));
const {emailDependencyContract,validateEmailDependencyContract}=await import('./email-dependency-contract.mjs');
const {fixture,token,at}=await import('./fixtures/shared-email-draft-tasks.mjs');
const {createEmailDraftTask,submitEmailDraftResult,adoptEmailDraftResult,applyEmailTaskAdoption}=await import('./email-draft-tasks.mjs');
const {hash}=await import('./lifecycle.mjs');
const {fixture:dispatchFixture}=await import('./fixtures/shared-email-draft-dispatch.mjs');
const {signed}=await import('./fixtures/shared-operations-exact-mail.mjs');

const proposal={body:'Please review this direction before we discuss the next step.',source_ids:['reply:incoming'],uncertainties:[],execution:{provider:'fictional',model:'none',duration_ms:1,input_tokens:null,output_tokens:null}};
async function ready(){
 const f=await fixture({capability:'fictional-email-draft-review-v1'});
 await createEmailDraftTask(f.app,{id:'task',project_id:'p',revision:(await f.app.snapshot()).revision,token,replace_task_id:null},'owner');
 await submitEmailDraftResult(f.app,'task',token,proposal);
 const entry=await f.app.store.envelope(),input={id:'task',revision:entry.data.state.revision,result_sha256:hash(proposal)};
 const options={configFingerprint:hash(entry.data.config),emailTask:{type:'adopt',actor:'owner',at,input}};
 return {...f,entry,input,options};
}

test('dependency contract rejects missing declarations, changed authority and extra write permission',async()=>{
 const f=await ready(),before=f.entry.data,binding=f.packet.binding,etag=f.entry.etag;
 const contract=emailDependencyContract(before,f.options,binding,etag),after=structuredClone(before);
 await applyEmailTaskAdoption(f.app,after.state,f.input,'owner');
 assert.equal(contract.version,1);assert.equal(contract.boundary,'whole-workspace');
 assert.ok(contract.reads.some(r=>r.name==='notification-and-cycle-sources'));
 assert.doesNotThrow(()=>validateEmailDependencyContract(contract,before,after,f.options,binding,etag));
 for(const mutate of [c=>{delete c.reads;},c=>c.reads.pop(),c=>c.writes.pop(),c=>c.writes.push(['state']),c=>{c.version=2;},c=>{c.source.etag='old';},c=>{c.witness.sha256='0'.repeat(64);},c=>{c.source.binding_sha256='0'.repeat(64);}]){
  const changed=structuredClone(contract);mutate(changed);
  assert.throws(()=>validateEmailDependencyContract(changed,before,after,f.options,binding,etag),/dependency contract/i);
 }
 assert.throws(()=>validateEmailDependencyContract(null,before,after,f.options,binding,etag),/dependency contract/i);
 assert.equal(JSON.stringify(contract).includes(token),false);
});

test('permitted writes do not authorize unrelated clients, historical events, assets or policy',async()=>{
 const f=await ready(),before=f.entry.data,contract=emailDependencyContract(before,f.options,f.packet.binding,f.entry.etag);
 for(const mutate of [s=>{s.state.prospects.other={id:'other'};},s=>{s.state.events.incoming.at='2020-01-01T00:00:00Z';},s=>{s.state.asset_index.direction.name='Changed';},s=>{s.config.sender.email='other@example.invalid';},s=>{s.state.actions.unrequested={id:'unrequested'};}]){
  const after=structuredClone(before);mutate(after);
  assert.throws(()=>validateEmailDependencyContract(contract,before,after,f.options,f.packet.binding,f.entry.etag),/undeclared write/i);
 }
 const stale=structuredClone(before);stale.state.operations??={};stale.state.operations.holds={gmail_incoming:'gap'};
 assert.throws(()=>validateEmailDependencyContract(contract,stale,stale,f.options,f.packet.binding,f.entry.etag),/dependency contract/i);
});

test('collection and source changes cannot reuse a prepared descriptor even with an unchanged project',async()=>{
 const f=await ready(),before=f.entry.data,contract=emailDependencyContract(before,f.options,f.packet.binding,f.entry.etag);
 for(const mutate of [
  s=>{s.email_draft_tasks.other={id:'other'};},
  s=>{s.asset_index.other={id:'other'};},
  s=>{s.actions.unsettled={id:'unsettled',prospect_id:'p',status:'Uncertain'};},
  s=>{s.operations={requests:{reservation:{operation:'intent'}}};},
  s=>{s.operator_writing_styles.owner.preferences='Changed style';},
  s=>{s.runtime={last_error:'Another client operation failed'};},
  s=>{s.exceptions.push({id:'other',reason:'Needs review'});}
 ]){
  const changed=structuredClone(before);mutate(changed.state);
  assert.throws(()=>validateEmailDependencyContract(contract,changed,changed,f.options,f.packet.binding,f.entry.etag),/dependency contract/i);
 }
});

test('task creation and result declaration cannot smuggle draft, approval or notification writes',async()=>{
 const f=await ready(),before=f.entry.data;
 for(const tr of [
  {type:'create',actor:'owner',at,input:{id:'replacement',project_id:'p',revision:before.state.revision,token_sha256:hash('cd'.repeat(32)),replace_task_id:'task'}},
  {type:'result',actor:'task',at,input:{id:'task',token_sha256:hash(token),result:proposal}}
 ]){
  const options={configFingerprint:hash(before.config),emailTask:tr},contract=emailDependencyContract(before,options,f.packet.binding,f.entry.etag);
  for(const mutate of [s=>{s.prospects.p.reply_draft={status:'Approved; sending held'};},s=>{s.team_notifications={messages:{fake:{id:'fake'}}};},s=>{s.events.fake={id:'fake'};}]){
   const after=structuredClone(before);mutate(after.state);
   assert.throws(()=>validateEmailDependencyContract(contract,before,after,options,f.packet.binding,f.entry.etag),/undeclared write/i);
  }
 }
});

test('adoption retains global notification and cycle effects and exact history under the descriptor',async()=>{
 const f=await ready(),saved=await f.raw.getWithMetadata('workspace',{consistency:'strong'});
 // Independent pre-existing attention work makes the global reducer postlude observable.
 saved.data.state.prospects.other={...structuredClone(saved.data.state.prospects.p),id:'other',name:'Other fictional business',follow_up_owner:'friend'};
 saved.data.state.operations={cycle:{completed_records:['p','other'],completed_bookings:['retained-booking']}};
 saved.data.state.team_notifications={messages:{old:{id:'old',status:'Prepared; delivery held'}},active:{obsolete:'old'}};
 await f.raw.setJSON('workspace',saved.data,{onlyIfMatch:saved.etag});
 const before=(await f.app.store.envelope()).data,input={...f.input,revision:before.state.revision},expected=structuredClone(before.state);
 await applyEmailTaskAdoption(f.app,expected,input,'owner');
 await adoptEmailDraftResult(f.app,input,'owner');const actual=await f.app.snapshot();
 assert.deepEqual(actual,expected);
 assert.ok(Object.values(actual.team_notifications.messages).some(m=>m.project_id==='other'&&m.recipient_role==='friend'));
 assert.equal(actual.team_notifications.messages.old.status,'Resolved or reassigned before delivery');
 assert.deepEqual(actual.operations.cycle.completed_records,['other']);assert.deepEqual(actual.operations.cycle.completed_bookings,[]);
 assert.deepEqual(actual.prospects.other,before.state.prospects.other);
 for(const [id,event]of Object.entries(before.state.events))assert.equal(JSON.stringify(actual.events[id]),JSON.stringify(event));
 const after=JSON.stringify(actual);assert.equal((await adoptEmailDraftResult(f.app,input,'owner')).duplicate,true);assert.equal(JSON.stringify(await f.app.snapshot()),after);
});

test('signed requested-information review retains its one deterministic action and stop/handoff behavior',async t=>{
 const f=await dispatchFixture(t,{importChange(s){s.prospects['shared-proof'].apollo={sequence_id:'fictional-sequence'};}}),r=(await f.app.snapshot()).prospects['shared-proof'];
 await signed(f,'reply_reviewed',{source_id:r.reply.source_id,reply_sha256:hash(r.reply),outcome:'requested_info',focus:'website',note:'Discuss the selected direction.'},'owner','review-info');
 let state=await f.app.snapshot();assert.equal(state.actions['review-info-information_task'].type,'information_task');
 assert.equal(state.actions['review-info-information_task'].prospect_id,'shared-proof');
 await signed(f,'follow_up_handed_off',{to:'friend'},'owner','handoff-info');
 assert.equal((await f.app.snapshot()).prospects['shared-proof'].follow_up_owner,'friend');
 await signed(f,'contact_stopped',{reason:'do_not_contact'},'friend','stop-info');
 state=await f.app.snapshot();assert.equal(state.prospects['shared-proof'].stage,'Stopped');
 assert.equal(state.actions['stop-info-sequence_stop'].type,'sequence_stop');
 assert.equal(Object.keys(state.actions).filter(id=>id==='review-info-information_task').length,1);
 assert.equal(f.mailWire.sent.length,0);
});
