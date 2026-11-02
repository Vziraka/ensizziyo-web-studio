import test from 'node:test';
import assert from 'node:assert/strict';
import {hash} from './lifecycle.mjs';
import {mailboxClockCapability,validateMailboxClockPolicy,validateMailboxClockState,mailboxClockTickId,applyMailboxClockTransition,assertMailboxClockStep,mailboxClockStatus} from './mailbox-clock.mjs';

const at='2026-11-02T14:00:00.000Z',time=seconds=>new Date(Date.parse(at)+seconds*1000).toISOString();
function fixture(overrides={}){
 const config={mode:'production',shared_capability:mailboxClockCapability,outreach_enabled:false,mailbox:{schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'fixture-grant',after:'2026-11-01T00:00:00.000Z'},mailbox_clock:{schema_version:1,site_id:'fixture-site',deploy_id:'fixture-deploy',origin:'https://fixture.example.invalid',recovery_generation:'generation-one',interval_minutes:5,max_steps_per_tick:3,max_steps_per_day:6,deadline_ms:25000,expires_at:'2026-11-05T00:00:00.000Z',...overrides}};
 const state={schema_version:1,mode:'production',revision:0,updated_at:at,prospects:{retained:{id:'retained'}},events:{},actions:{},mailbox_sync:{cursor:'100'},email_draft_tasks:{legacy:{body:'Unchanged'}}};
 const tr=(type,input,actor='clock',when=at)=>applyMailboxClockTransition(state,config,{type,actor,at:when,input});
 const grant=(id='grant-one',max_steps=6,when=at,expires_at=time(7200))=>tr('allowance',{revision:state.revision,allowance:{id,evidence_ref:'fixture-account-review',observed_at:when,expires_at,included_only:true,max_steps}},'owner',when);
 const pause=(paused,actor='owner',when=at)=>tr('pause',{revision:state.revision,paused,reason:'Reviewed clock control'},actor,when);
 const claim=(when=at)=>{const p=config.mailbox_clock,scheduled_at=new Date(Math.floor(Date.parse(when)/(p.interval_minutes*60000))*p.interval_minutes*60000).toISOString();return tr('claim',{tick_id:mailboxClockTickId(scheduled_at),scheduled_at,revision:state.revision},'clock',when);};
 const descriptor=(step=1)=>({tick_id:state.mailbox_clock.tick.id,fence:state.mailbox_clock.tick.fence,step});
 const start=()=>{grant();pause(false);claim();};
 return {state,config,tr,grant,pause,claim,descriptor,start};
}
function unchanged(f,fn,pattern){const before=structuredClone(f.state);assert.throws(fn,pattern);assert.deepEqual(f.state,before);}

function upgraded(){const f=fixture();f.start();f.tr('step',f.descriptor());f.pause(true,'friend',time(1));f.config.mailbox_clock={...f.config.mailbox_clock,schema_version:2,deploy_id:'next-deploy',recovery_generation:'next-generation',interval_minutes:15,max_steps_per_tick:1,max_steps_per_day:2};return f;}
function rebind(f,actor='owner',at=time(30)){const v=mailboxClockStatus(f.state,f.config,at);return f.tr('rebind',{revision:f.state.revision,previous:v.previous_identity,current:v.current_identity,authorized:true},actor,at);}
test('explicit clock2 rebind archives the exact pending legacy tick without resetting charges, cursor, slot or fence',()=>{
 const f=upgraded(),before=structuredClone(f.state),old=before.mailbox_clock;assert.equal(mailboxClockStatus(f.state,f.config,time(30)).rebind_required,true);unchanged(f,()=>f.grant('premature',1,time(30)));rebind(f,'friend');const c=f.state.mailbox_clock;assert.equal(c.schema_version,2);assert.equal(c.paused,true);assert.equal(c.tick,null);assert.equal(c.allowance_id,null);assert.equal(c.fence,old.fence);assert.equal(c.last_slot,old.last_slot);assert.deepEqual(c.retired_ticks[old.tick.id].tick,old.tick);assert.deepEqual(c.allowances,old.allowances);assert.deepEqual(c.days,old.days);assert.deepEqual(f.state.mailbox_sync,before.mailbox_sync);assert.deepEqual(f.state.prospects,before.prospects);
 f.grant('fresh',1,time(30));assert.equal(c.paused,true);f.pause(false,'owner',time(30));unchanged(f,()=>f.claim(time(30)),/replayed/);f.claim(time(900));assert.equal(f.state.mailbox_clock.fence,2);assert.equal(f.state.mailbox_clock.retired_ticks[old.tick.id].tick.pending_step,1);
});
test('clock2 rebind closes prior/current identities, roles, revision, pause and deadline before any partial change',()=>{
 for(const fault of ['worker','stale','prior','current','authorized','unknown','deadline','unpaused']){const f=upgraded(),v=mailboxClockStatus(f.state,f.config,time(30)),i={revision:f.state.revision,previous:v.previous_identity,current:v.current_identity,authorized:true};let actor='owner',when=time(30);if(fault==='worker')actor='worker';if(fault==='stale')i.revision--;if(fault==='prior')i.previous.policy_sha256='0'.repeat(64);if(fault==='current')i.current.config_sha256='0'.repeat(64);if(fault==='authorized')i.authorized=false;if(fault==='unknown')i.extra=true;if(fault==='deadline')when=time(2);if(fault==='unpaused')f.state.mailbox_clock.paused=false;unchanged(f,()=>f.tr('rebind',i,actor,when));}
 const f=upgraded();rebind(f);unchanged(f,()=>rebind(f),/already current/);const legacy={...f.config,mailbox_clock:{...f.config.mailbox_clock,schema_version:1}};assert.throws(()=>validateMailboxClockState(f.state,legacy));
 const reordered=upgraded(),v=mailboxClockStatus(reordered.state,reordered.config,time(30));reordered.tr('rebind',{revision:reordered.state.revision,previous:Object.fromEntries(Object.entries(v.previous_identity).reverse()),current:Object.fromEntries(Object.entries(v.current_identity).reverse()),authorized:true},'owner',time(30));assert.equal(reordered.state.mailbox_clock.paused,true);
});
test('old charges and expiry remain readable above lower clock2 limits while new daily authority stays held',()=>{
 const f=fixture();f.start();f.tr('step',f.descriptor());f.tr('settle',{...f.descriptor(),outcome:'Continue'});f.tr('step',f.descriptor(2));f.pause(true,'owner',time(1));const before=structuredClone(f.state.mailbox_clock);f.config.mailbox_clock={...f.config.mailbox_clock,schema_version:2,max_steps_per_tick:1,max_steps_per_day:1,expires_at:time(100)};rebind(f);assert.deepEqual(f.state.mailbox_clock.allowances,before.allowances);assert.deepEqual(f.state.mailbox_clock.days,before.days);f.grant('fresh',1,time(30),time(60));unchanged(f,()=>f.pause(false,'friend',time(30)),/budget/);assert.equal(f.state.mailbox_clock.days['2026-11-02'].reserved_steps,2);
});
test('clock2 future slots archive unresolved receipts without charging them again or accepting duplicates',()=>{
 const f=fixture({schema_version:2});f.start();f.tr('step',f.descriptor());const old=structuredClone(f.state.mailbox_clock.tick);f.claim(time(300));let c=f.state.mailbox_clock;assert.deepEqual(c.retired_ticks[old.id].tick,old);assert.equal(c.fence,2);assert.equal(c.allowances['grant-one'].used_steps,1);assert.equal(c.days['2026-11-02'].reserved_steps,1);f.tr('step',f.descriptor(),'clock',time(301));assert.equal(f.state.mailbox_clock.allowances['grant-one'].used_steps,2);
 for(const fault of ['duplicate-fence','undercharge','missing-latest','unknown-policy','receipt','extra']){const state=structuredClone(f.state),clock=state.mailbox_clock,h=clock.retired_ticks[old.id];if(fault==='duplicate-fence')clock.tick.fence=old.fence;if(fault==='undercharge')h.tick.steps_reserved=2;if(fault==='missing-latest')clock.tick=null;if(fault==='unknown-policy')h.policy_sha256='0'.repeat(64);if(fault==='receipt')h.tick.settlements={1:{outcome:'Caught up',at}};if(fault==='extra')h.secret='no';assert.throws(()=>validateMailboxClockState(state,f.config),fault);}
});
test('restore-required clock2 cannot execute with identical policy bytes; rebind keeps original Running evidence',()=>{
 const f=fixture({schema_version:2});f.start();f.tr('step',f.descriptor());const old=structuredClone(f.state.mailbox_clock.tick),c=f.state.mailbox_clock;c.paused=true;c.allowance_id=null;c.recovery_required=true;assert.doesNotThrow(()=>validateMailboxClockState(f.state,f.config));assert.equal(mailboxClockStatus(f.state,f.config,time(30)).status,'Restore review required');for(const op of [()=>f.claim(time(300)),()=>f.grant('restore',1,time(30)),()=>f.pause(false,'owner',time(30)),()=>f.tr('settle',{...f.descriptor(),outcome:'Caught up'},'clock',time(1))])unchanged(f,op);rebind(f);assert.deepEqual(f.state.mailbox_clock.retired_ticks[old.id].tick,old);assert.equal(f.state.mailbox_clock.allowance_id,null);assert.equal(f.state.mailbox_clock.recovery_required,false);assert.equal(f.state.mailbox_clock.paused,true);
});
test('clock2 allowances require fresh unique evidence and never resume; pause remains possible after expiry',()=>{
 const f=fixture({schema_version:2});f.grant();unchanged(f,()=>f.grant());unchanged(f,()=>f.tr('allowance',{revision:f.state.revision,allowance:{id:'stale',evidence_ref:'Reviewed',observed_at:at,expires_at:time(7200),included_only:true,max_steps:1}},'friend',time(901)),/Fresh/);assert.equal(f.state.mailbox_clock.paused,true);f.pause(true,'friend','2026-11-06T00:00:00.000Z');assert.equal(f.state.mailbox_clock.paused,true);
});
test('valid full clock archives still permit safety pause but cannot discard a receipt to rebind or claim',()=>{
 const f=fixture({schema_version:2});f.start();f.tr('step',f.descriptor());const c=f.state.mailbox_clock,original=structuredClone(c.tick),iso=ms=>new Date(ms).toISOString(),first=Date.parse(at)-999*300000;c.retired_ticks={};c.days={};c.allowance_id=null;c.paused=true;c.fence=1001;c.last_slot=time(300);c.updated_at=time(330);c.allowances['grant-one']={...c.allowances['grant-one'],max_steps:10000,used_steps:1001,observed_at:iso(first),recorded_at:iso(first)};
 for(let i=0;i<1000;i++){const date=iso(first+i*300000),tick={...structuredClone(original),id:mailboxClockTickId(date),scheduled_at:date,claimed_at:date,deadline_at:iso(Date.parse(date)+25000),fence:i+1},day=date.slice(0,10);c.days[day]??={reserved_steps:0,ticks:0};c.days[day].reserved_steps++;c.days[day].ticks++;c.retired_ticks[tick.id]={policy_sha256:c.policy_sha256,mailbox_policy_sha256:c.mailbox_policy_sha256,recovery_generation:c.recovery_generation,tick,archived_by:'clock',archived_at:time(330),reason:'superseded_unresolved'};}
 c.tick={...original,id:mailboxClockTickId(time(300)),scheduled_at:time(300),claimed_at:time(300),deadline_at:time(325),fence:1001,status:'Held'};c.days[at.slice(0,10)].reserved_steps++;c.days[at.slice(0,10)].ticks++;f.state.updated_at=time(330);assert.doesNotThrow(()=>validateMailboxClockState(f.state,f.config));f.pause(true,'friend',time(330));unchanged(f,()=>f.pause(false,'owner',time(330)));f.config.mailbox_clock={...f.config.mailbox_clock,recovery_generation:'new-full-history'};unchanged(f,()=>rebind(f,'owner',time(330)),/archive/);f.pause(true,'owner','2026-11-06T00:00:00.000Z');assert.equal(Object.keys(f.state.mailbox_clock.retired_ticks).length,1000);
});

test('unknown allowance, paused default and old profiles cannot claim',()=>{
 const f=fixture();assert.equal(mailboxClockStatus(f.state,f.config,at).status,'Allowance required');unchanged(f,()=>f.claim());
 f.grant();assert.equal(f.state.mailbox_clock.paused,true);unchanged(f,()=>f.claim(),/paused/);f.pause(false);f.claim();
 assert.equal(mailboxClockStatus(f.state,f.config,at).status,'Running');
 for(const capability of ['shared-mailbox-review-v1','shared-mailbox-work-v1','shared-manual-records-v1']){const g=fixture();g.config.shared_capability=capability;unchanged(g,()=>g.grant(),/capability/);}
});

test('bounded immutable policy and signed reviewed allowance reject unsupported inputs',()=>{
 const f=fixture();for(const change of [{max_steps_per_tick:4},{max_steps_per_tick:0},{deadline_ms:25001},{interval_minutes:1},{max_steps_per_day:1001},{origin:'http://fixture.example.invalid'},{unknown:true}])assert.throws(()=>validateMailboxClockPolicy({...f.config.mailbox_clock,...change}));
 const input={revision:0,allowance:{id:'a',evidence_ref:'fixture',observed_at:at,expires_at:time(60),included_only:true,max_steps:1}};
 for(const actor of ['clock','provider','worker'])unchanged(f,()=>f.tr('allowance',input,actor),/operator/);
 for(const change of [{included_only:false},{max_steps:0},{max_steps:Infinity},{observed_at:time(1)},{expires_at:at},{expires_at:'2030-01-01T00:00:00.000Z'},{evidence_ref:''}])unchanged(f,()=>f.tr('allowance',{...input,allowance:{...input.allowance,...change}},'owner'));
});

test('step reservation is charged before execution and exact settlement preserves unrelated records',()=>{
 const f=fixture(),before=structuredClone(f.state);f.start();const d=f.descriptor();f.tr('step',d);
 assert.equal(f.state.mailbox_clock.days['2026-11-02'].reserved_steps,1);assert.equal(f.state.mailbox_clock.allowances['grant-one'].used_steps,1);
 assert.equal(assertMailboxClockStep(f.state,f.config,d,time(1)).deadline_at,time(25));
 f.tr('settle',{...d,outcome:'Continue'},'clock',time(1));f.tr('step',f.descriptor(2),'clock',time(2));f.tr('settle',{...f.descriptor(2),outcome:'Caught up'},'clock',time(3));
 assert.equal(f.state.mailbox_clock.tick.status,'Completed');assert.equal(f.state.mailbox_clock.tick.steps_settled,2);
 for(const key of ['prospects','events','actions','mailbox_sync','email_draft_tasks'])assert.deepEqual(f.state[key],before[key]);
 assert.match(mailboxClockStatus(f.state,f.config,time(3)).allowance_basis,/unverified/);
});

test('tick replay and lost acknowledgments cannot repeat provider steps',()=>{
 const f=fixture();f.start();let before=structuredClone(f.state);assert.equal(f.claim().duplicate,true);assert.deepEqual(f.state,before);
 f.tr('step',f.descriptor());unchanged(f,()=>f.tr('step',f.descriptor()),/unresolved/);unchanged(f,()=>f.tr('step',f.descriptor(2)),/unresolved/);
 f.tr('settle',{...f.descriptor(),outcome:'Continue'});unchanged(f,()=>f.tr('settle',{...f.descriptor(),outcome:'Continue'}),/pending/);
 f.tr('finish',{tick_id:f.descriptor().tick_id,fence:f.descriptor().fence,outcome:'Completed'});
 before=structuredClone(f.state);assert.equal(f.claim().duplicate,true);assert.deepEqual(f.state,before);unchanged(f,()=>f.tr('step',f.descriptor(2)),/closed/);
});

test('either operator pause fences an inflight read permanently even after resume',()=>{
 for(const actor of ['owner','friend']){
  const f=fixture();f.start();f.tr('step',f.descriptor());const d=f.descriptor();f.pause(true,actor,time(1));
  assert.throws(()=>assertMailboxClockStep(f.state,f.config,d,time(2)),/paused/);f.pause(false,actor,time(3));
  assert.throws(()=>assertMailboxClockStep(f.state,f.config,d,time(4)),/closed/);assert.equal(f.state.mailbox_clock.allowances['grant-one'].used_steps,1);
  unchanged(f,()=>f.tr('settle',{...d,outcome:'Continue'},'clock',time(4)),/closed/);
 }
});

test('expiry, recovery and config changes reject both provider reads and late commits',()=>{
 for(const change of [f=>f.config.mailbox_clock.recovery_generation='changed',f=>f.config.mailbox.grant_id='changed',f=>f.config.mailbox_clock.deploy_id='changed']){const f=fixture();f.start();f.tr('step',f.descriptor());change(f);unchanged(f,()=>f.tr('settle',{...f.descriptor(),outcome:'Continue'},'clock',time(1)));}
 const f=fixture();f.start();f.tr('step',f.descriptor());for(const now of [time(25),time(26)]){assert.throws(()=>assertMailboxClockStep(f.state,f.config,f.descriptor(),now),/expired/);unchanged(f,()=>f.tr('settle',{...f.descriptor(),outcome:'Continue'},'clock',now),/expired/);}
 assert.equal(f.state.mailbox_clock.allowances['grant-one'].used_steps,1);
 const g=fixture({expires_at:time(10)});g.grant('short',1,at,time(10));g.pause(false);g.claim();g.tr('step',g.descriptor());assert.equal(g.state.mailbox_clock.tick.deadline_at,time(10));assert.throws(()=>assertMailboxClockStep(g.state,g.config,g.descriptor(),time(10)),/expired/);
});

test('new slot fences orphaned step; uncertain work remains charged and is never replayed',()=>{
 const f=fixture();f.start();f.tr('step',f.descriptor());const old=f.descriptor();f.claim(time(300));assert.equal(f.state.mailbox_clock.tick.fence,2);
 f.tr('step',f.descriptor(),'clock',time(301));assert.throws(()=>assertMailboxClockStep(f.state,f.config,old,time(302)),/changed/);
 assert.equal(f.state.mailbox_clock.allowances['grant-one'].used_steps,2);assert.equal(f.state.mailbox_clock.days['2026-11-02'].reserved_steps,2);
 unchanged(f,()=>f.tr('claim',{tick_id:old.tick_id,scheduled_at:at,revision:f.state.revision},'clock',time(302)),/current scheduled slot/);
});

test('allowance expiry and schedule boundary shorten deadlines and prevent falsely completed work',()=>{
 const f=fixture();f.grant('short-review',2,at,time(8));f.pause(false);f.claim();assert.equal(f.state.mailbox_clock.tick.deadline_at,time(8));
 f.tr('step',f.descriptor());unchanged(f,()=>f.tr('finish',{tick_id:f.descriptor().tick_id,fence:1,outcome:'Completed'}),/pending/);
 assert.throws(()=>assertMailboxClockStep(f.state,f.config,f.descriptor(),time(8)),/allowance/);
 assert.equal(mailboxClockStatus(f.state,f.config,time(9)).status,'Allowance required');
 const g=fixture();g.grant();g.pause(false);g.claim(time(299));assert.equal(g.state.mailbox_clock.tick.deadline_at,time(300));g.tr('step',g.descriptor(),'clock',time(299));
 assert.throws(()=>assertMailboxClockStep(g.state,g.config,g.descriptor(),time(300)),/expired/);
 assert.equal(mailboxClockStatus(g.state,g.config,time(300)).status,'Tick expired');
});

test('daily and grant bounds include failed and unfinished reads',()=>{
 const f=fixture({max_steps_per_day:3});f.start();for(let step=1;step<=3;step++){f.tr('step',f.descriptor(step));f.tr('settle',{...f.descriptor(step),outcome:'Continue'});}
 unchanged(f,()=>f.tr('step',f.descriptor(4)),/step limit/);unchanged(f,()=>f.claim(time(300)),/budget exhausted/);assert.equal(mailboxClockStatus(f.state,f.config,time(300)).status,'Daily limit');
 const g=fixture();g.grant('single',1);g.pause(false);g.claim();g.tr('step',g.descriptor());g.tr('settle',{...g.descriptor(),outcome:'Held'});
 assert.equal(g.state.mailbox_clock.tick.status,'Held');unchanged(g,()=>g.claim(time(300)),/budget exhausted/);assert.equal(mailboxClockStatus(g.state,g.config,time(300)).status,'Allowance exhausted');
});

test('daily reset does not reset the reviewed total allowance',()=>{
 const f=fixture({max_steps_per_tick:1,max_steps_per_day:1});f.grant('two-days',2,at,time(172800));f.pause(false);f.claim();f.tr('step',f.descriptor());f.tr('settle',{...f.descriptor(),outcome:'Held'});
 f.claim(time(86400));f.tr('step',f.descriptor(),'clock',time(86401));f.tr('settle',{...f.descriptor(),outcome:'Caught up'},'clock',time(86402));
 assert.equal(f.state.mailbox_clock.days['2026-11-02'].reserved_steps,1);assert.equal(f.state.mailbox_clock.days['2026-11-03'].reserved_steps,1);assert.equal(f.state.mailbox_clock.allowances['two-days'].used_steps,2);
 unchanged(f,()=>f.claim(time(86700)),/budget exhausted/);
});

test('allowance replacement holds active tick; reused identity cannot reset consumption',()=>{
 const f=fixture();f.start();f.tr('step',f.descriptor());const d=f.descriptor();f.grant('grant-two',2,time(1));
 assert.throws(()=>assertMailboxClockStep(f.state,f.config,d,time(2)),/closed/);assert.equal(f.state.mailbox_clock.allowances['grant-one'].used_steps,1);
 unchanged(f,()=>f.grant('grant-one',6,time(3)),/identity already used/);
 const before=structuredClone(f.state);assert.equal(f.grant('grant-two',2,time(1)).duplicate,true);assert.deepEqual(f.state,before);
});

test('canonical revision, slot and closed field boundaries reject with no partial writes',()=>{
 const f=fixture();f.grant();f.pause(false);
 for(const input of [{tick_id:mailboxClockTickId(at),scheduled_at:at,revision:0},{tick_id:'arbitrary',scheduled_at:at,revision:f.state.revision},{tick_id:mailboxClockTickId(time(1)),scheduled_at:time(1),revision:f.state.revision}])unchanged(f,()=>f.tr('claim',input));
 f.claim();unchanged(f,()=>f.tr('step',{...f.descriptor(),extra:true}));unchanged(f,()=>f.pause(true,'worker'),/operator/);unchanged(f,()=>f.tr('step',f.descriptor(),'provider'),/Trusted/);
 f.tr('step',f.descriptor(),'clock',time(2));unchanged(f,()=>f.tr('settle',{...f.descriptor(),outcome:'Continue'},'clock',time(1)),/backwards/);
});

test('retained corruption is rejected while historical generations remain inert',()=>{
 const original=fixture();original.start();original.tr('step',original.descriptor());
 const corruptions=[c=>c.tick.fence++,c=>c.tick.pending_step=3,c=>c.tick.deadline_at=time(26),c=>c.allowances['grant-one'].used_steps=0,c=>c.days['2026-11-02'].ticks++,c=>c.tick.status='Approved',c=>c.tick.extra=true,c=>c.policy_sha256='bad',c=>c.allowance_id='missing'];
 for(const corrupt of corruptions){const f=fixture();f.state.mailbox_clock=structuredClone(original.state.mailbox_clock);corrupt(f.state.mailbox_clock);assert.throws(()=>validateMailboxClockState(f.state,f.config));}
 const f=fixture();f.state.mailbox_clock=structuredClone(original.state.mailbox_clock);f.config.mailbox_clock.recovery_generation='new-generation';assert.doesNotThrow(()=>validateMailboxClockState(f.state,f.config));assert.equal(mailboxClockStatus(f.state,f.config,at).status,'Policy changed');unchanged(f,()=>f.pause(true),/restored/);
 assert.equal(hash(original.state.mailbox_sync),hash({cursor:'100'}));
});
