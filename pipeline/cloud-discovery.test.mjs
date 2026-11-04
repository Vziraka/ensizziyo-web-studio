import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,hash} from './lifecycle.mjs';
import {sourceContentHash} from './sources.mjs';
import {candidatePacket} from './candidate-packet.mjs';
import {cloudDiscoveryCapability,validateCloudDiscoveryPolicy,validateCloudDiscoveryState,applyCloudDiscoveryTransition,cloudDiscoveryStatus,assertCloudDiscoveryTransitionLive} from './cloud-discovery.mjs';

const at='2026-11-01T14:00:00.000Z';
const ref=payload=>({sha256:hash(payload),bytes:Buffer.byteLength(JSON.stringify(payload)),reference:'cloud-discovery/'+hash(payload)});
function fixture(){
 const p={schema_version:1,site_id:'site',deploy_id:'deploy',origin:'https://desk.example.com',recovery_generation:'one',expires_at:'2026-11-03T00:00:00.000Z',daily_email_target:100,max_imports_per_day:125,max_candidates_per_day:200,max_tasks:50,max_attempts:100,max_attempts_per_day:100,reserve_percent:30,lease_minutes:10,researcher_id:'researcher',reviewer_id:'reviewer',areas:['Fairfax Northern Virginia Washington DC Maryland'],trades:['HVAC','Plumbing']};
 const config={...structuredClone(initialConfig),mode:'production',shared_capability:cloudDiscoveryCapability,cloud_discovery:p},state={schema_version:1,run_id:config.run_id,mode:'production',revision:0,updated_at:at,prospects:{},events:{},actions:{},exceptions:[]};let time=at;
 const apply=(type,input,actor='owner')=>applyCloudDiscoveryTransition(state,config,{type,actor,at:time,input:{revision:state.revision,...input}});
 const allowance=(id='allowance',remaining_percent=80)=>apply('allowance',{allowance:{id,evidence_ref:'Synthetic independently read included usage',observed_at:time,expires_at:new Date(Date.parse(time)+15*60000).toISOString(),included_only:true,remaining_percent,max_attempts:100,max_candidates:200}});
 const create=(id='task',lane='call-first',count=1,subtype='HVAC')=>apply('create',{id,lane,count,assigned_to:'owner',area:p.areas[0],subtypes:[subtype]});
 const ready=()=>{allowance();apply('pause',{paused:false,reason:'Finite synthetic scope'});};
 return {p,config,state,apply,allowance,create,ready,setTime:v=>time=v,time:()=>time};
}
function candidate(n=0,lane='call-first',subtype='HVAC'){
 const identity={name:'SYNTHETIC '+subtype.toUpperCase()+' '+n,website:'https://business'+n+'.example.com/',category:'home-services',subtype},phone='(703) 555-'+String(1000+n).padStart(4,'0'),email='office@business'+n+'.example.com',basis='Emergency enquiries require voicemail; we return these calls the next business day.';
 const s={url:identity.website,text:identity.name+'. '+subtype+' services in Fairfax, VA. Call '+phone+'. Email '+email+'. Now accepting service appointments. '+basis,kind:'business',capture_method:'http',coverage:'full',identity_note:'Synthetic business-controlled first-party page, no real requests.',fetched_at:at,checked_at:at.slice(0,10)};s.content_sha256=sourceContentHash(s);
 if(lane==='call-first')return {id:'candidate-'+n,identity,packet:candidatePacket(identity,[s],{id:'batch'},new Date(at))};
 const job={id:'research-'+n,business_name:identity.name,website:identity.website,seed_urls:[identity.website],purpose:'Prospect discovery; review required; no outreach.',as_of:at.slice(0,10),research_version:3},snapshots={sources:[s],failures:[]};
 const report={schema_version:3,job_id:job.id,business_name:job.business_name,sources:[{url:s.url,checked_at:s.checked_at,content_sha256:s.content_sha256,facts:[basis]}],unknowns:['Owner priorities and budget remain unknown.'],checkpoint_reused:true,observations:[{fact:basis,source_urls:[s.url],evidence:[{url:s.url,excerpt:basis,context_id:''}]}],journey_checks:['discovery','offer','enquiry_or_ordering','trust_and_activity','follow_up'].map(area=>({area,status:area==='enquiry_or_ordering'?'Observed':'Unknown',finding:area==='enquiry_or_ordering'?basis:'This bounded capture does not establish this part of the customer journey.',observation_indexes:area==='enquiry_or_ordering'?[0]:[],owner_question:'How is this part of the customer journey handled today?'})),opportunities:[{observed_basis:basis,possible_effect:'A request tracker might support callback preparation if useful to the owner.',proposed_solution:'Enhancement: discuss an optional request tracker alongside voicemail.',service_area:'systems',confidence:'hypothesis',owner_question:'How are voicemail callbacks tracked today?',existing_alternatives:['Existing voicemail and callback process'],validation_needed:'Confirm existing tools and owner goals before recommending changes.'}],public_contact_routes:[s.url],recommendation:'Suitable to discuss'};
 return {id:'candidate-'+n,identity,research:{job,snapshots,report}};
}
function decision(c,lane,claim_id){
 if(lane==='call-first'){const s=c.packet.sources[0],excerpt='Emergency enquiries require voicemail; we return these calls the next business day.',question='How are voicemail callbacks tracked today?';return {candidate_id:c.id,accepted:true,reason:'The exact source supports identity, public contact and the focused callback question.',review:{pitch_supported:true,opening_candidates:[{id:'callback',service:'systems',customer_difficulty:excerpt,source_url:s.url,source_sha256:s.content_sha256,excerpt,hypothesis:'A request tracker might complement current voicemail callbacks.',owner_question:question,opening:'I saw you return voicemail calls the next business day. '+question}],selected_opening_id:'callback',selection_reason:'The callback step is explicit; its volume and owner priorities remain unknown.'}};}
 const {job,snapshots,report}=c.research,s=snapshots.sources[0],d={schema_version:1,job_id:job.id,attempt_id:claim_id,report_sha256:hash(report),sources_sha256:hash(snapshots),reviewed_by:'reviewer',decision:'Research-qualified',identity_note:'Exact first-party identity and Fairfax locality match the candidate.',operating_status:'Active',operating_evidence:{url:s.url,excerpt:'Now accepting service appointments.',context_id:''},opportunity_index:0,contact:{url:s.url,email:'office@'+new URL(c.identity.website).hostname,phone:s.text.match(/\(703\) 555-\d{4}/)[0]},observations:[{index:0,supported:true,note:'The entire claim is the retained literal callback statement.'}],journey_checks:report.journey_checks.map((x,index)=>({index,area:x.area,supported:true,note:'Exact observed callback route or explicit unknown coverage limit.'})),opportunity_checks:[{index:0,supported:true,note:'Tentative complement acknowledges voicemail and unknown owner priorities.'}],other_claims_supported:true,other_claims_note:'Contact and activity are first-party, and uncertainty is retained.',rationale:'Specific callback step supports discussion without assuming a defect.',next_action:'Ask the owner how callbacks are tracked before recommending a change.'};return {candidate_id:c.id,accepted:true,reason:'Detailed evidence and every claim independently accepted.',review:{verdict:'Accepted',corrections:[],decision:d}};
}
function research(f,id='task',lane='call-first',cs=[candidate()]){
 f.create(id,lane,cs.length||1,cs[0]?.identity.subtype);f.apply('claim',{id,claim_id:id+'-author',context_id:id+'-author-context'},'researcher');
 const payload={schema_version:1,task_id:id,claim_id:id+'-author',context_id:id+'-author-context',queries:[{query:'independent '+(cs[0]?.identity.subtype??'HVAC')+' Fairfax official business website',checked_at:f.time(),urls:cs.map(c=>c.identity.website)}],candidates:cs};f.apply('submit',{id,claim_id:id+'-author',artifact:ref(payload),payload},'researcher');return payload;
}
function reviewed(f,id='task',lane='call-first',cs=[candidate()]){const submission=research(f,id,lane,cs);f.apply('claim-review',{id,claim_id:id+'-reviewer',context_id:id+'-review-context'},'reviewer');const review={schema_version:1,task_id:id,claim_id:id+'-reviewer',context_id:id+'-review-context',submission_sha256:hash(submission),decisions:cs.map(c=>decision(c,lane,id+'-author'))};f.apply('review',{id,claim_id:id+'-reviewer',artifact:ref(review),payload:review,submission},'reviewer');return {submission,review};}

test('policy, old-profile denial and real low-reserve evidence cannot activate work',()=>{
 const f=fixture();assert.equal(validateCloudDiscoveryPolicy(f.p),f.p);for(const patch of [{reserve_percent:0},{researcher_id:'reviewer'},{daily_email_target:25},{trades:['Bakeries']},{extra:true}])assert.throws(()=>validateCloudDiscoveryPolicy({...f.p,...patch}));
 f.config.shared_capability='shared-mailbox-delivery-v1';assert.throws(()=>f.create(),/capability/);f.config.shared_capability=cloudDiscoveryCapability;f.create();f.allowance('low',17);assert.throws(()=>f.apply('pause',{paused:false,reason:'Attempt below reserve'}),/reserve/);assert.throws(()=>f.apply('claim',{id:'task',claim_id:'first',context_id:'one'},'researcher'),/paused/);assert.equal(f.state.cloud_discovery.allowances.low.used_attempts,0);
});
test('separate worker/reviewer claims import a call-only card while preserving historical records',()=>{
 const f=fixture();f.state.prospects.old={id:'old',name:'Old stopped business',restriction:'do_not_contact',calls:{historic:{note:'Retained'}},contact:{email:'old@example.com'}};const history=structuredClone(f.state.prospects.old);f.ready();const input=reviewed(f);assert.equal(Object.keys(f.state.prospects).length,1);const out=f.apply('import',{id:'task',...input});const r=f.state.prospects[out.imports[0].prospect_id];assert.equal(r.qualification.verdict,'Verification call only');assert.equal(r.stage,'Ready to verify');assert.equal(r.follow_up_owner,'owner');assert.equal(out.email_qualified,0);assert.equal(out.call_first,1);assert.equal(out.email_shortfall,100);assert.deepEqual(f.state.prospects.old,history);assert.equal(f.state.cloud_discovery.allowances.allowance.used_attempts,2);assert.equal(JSON.stringify(f.state.cloud_discovery).includes('Emergency enquiries'),false);validateCloudDiscoveryState(f.state,f.config);
});
test('email qualification uses detailed report and independent evidence review, not call verification',()=>{
 const f=fixture();f.ready();const input=reviewed(f,'email','email-qualified',[candidate(1,'email-qualified')]),out=f.apply('import',{id:'email',...input}),r=f.state.prospects[out.imports[0].prospect_id];assert.equal(r.qualification.verdict,'Research-qualified');assert.equal(r.stage,'Ready to contact');assert.equal(r.contact.email,'office@business1.example.com');assert.equal(out.email_qualified,1);assert.equal(out.call_first,0);assert.equal(out.email_shortfall,99);
});
test('reviewed remodeling businesses can enter both call-only and email-qualified discovery',()=>{
 const f=fixture();f.p.trades.push('Remodeling');f.ready();
 for(const [lane,n] of [['call-first',1],['email-qualified',2]]){
  const id='remodel-'+n,input=reviewed(f,id,lane,[candidate(n,lane,'Remodeling')]),out=f.apply('import',{id,...input}),r=f.state.prospects[out.imports[0].prospect_id];
  assert.equal(out.imports[0].status,'Imported');assert.deepEqual(r.business_type,{category:'home-services',subtype:'Remodeling'});
  assert.equal(r.qualification.verdict,lane==='call-first'?'Verification call only':'Research-qualified');
 }
});
test('remodeling call evidence accepts a renovation offering and holds a source without one',()=>{
 const c=candidate(3,'call-first','Remodeling'),identity={...c.identity,name:'SYNTHETIC BUILDERS'},source=structuredClone(c.packet.sources[0]);
 source.text=source.text.replace(c.identity.name,identity.name).replace('Remodeling services','Home renovation services');source.content_sha256=sourceContentHash(source);
 assert.match(candidatePacket(identity,[source],{id:'renovation'},new Date(at)).offering.excerpt,/renovat/i);
 source.text=source.text.replace('Home renovation services','Property services');source.content_sha256=sourceContentHash(source);
 assert.throws(()=>candidatePacket(identity,[source],{id:'no-offering'},new Date(at)),/evidence was not found/);
});
test('daily chunks rotate across every approved trade and area over a week',()=>{
 const trades=['HVAC','Plumbing','Roofing','Electrical','Cleaning','Landscaping','Remodeling'],areas=['Washington DC','Montgomery County Maryland','Prince George County Maryland','Fairfax Arlington Alexandria Virginia','Loudoun Prince William County Virginia'];
 const seenTrades=new Set(),seenAreas=new Set();
 for(let n=0;n<7;n++){
  const f=fixture();f.p.trades=trades;f.p.areas=areas;f.p.expires_at='2026-11-20T00:00:00.000Z';f.setTime(new Date(Date.parse(at)+n*86400000).toISOString());f.ready();
  for(let i=0;i<4;i++){const {id}=f.apply('queue-daily',{},'discovery'),task=f.state.cloud_discovery.tasks[id];seenTrades.add(task.subtypes[0]);seenAreas.add(task.area);}
 }
 assert.deepEqual([...seenTrades].sort(),[...trades].sort());assert.deepEqual([...seenAreas].sort(),[...areas].sort());
});
test('claims cannot be replayed, change identity or reuse research context for review',()=>{
 const f=fixture();f.ready();f.create();f.apply('claim',{id:'task',claim_id:'claim',context_id:'context'},'researcher');const before=structuredClone(f.state);for(const actor of ['owner','reviewer','researcher'])assert.throws(()=>f.apply('claim',{id:'task',claim_id:'retry',context_id:'retry'},actor));assert.deepEqual(f.state,before);
 const g=fixture();g.ready();research(g);assert.throws(()=>g.apply('claim-review',{id:'task',claim_id:'review',context_id:'task-author-context'},'reviewer'),/context/);assert.throws(()=>g.apply('claim-review',{id:'task',claim_id:'review',context_id:'independent'},'researcher'),/worker/);assert.equal(g.state.cloud_discovery.allowances.allowance.used_attempts,1);
});
test('pause, stale allowance, claim deadline and changed artifact reject publication without refund',()=>{
 for(const mode of ['pause','allowance','deadline','artifact']){const f=fixture();f.ready();const input=reviewed(f);if(mode==='pause')f.apply('pause',{paused:true,reason:'Stop new work'});if(mode==='allowance')f.setTime('2026-11-01T14:16:00.000Z');if(mode==='deadline'){const g=fixture();g.ready();g.create();g.apply('claim',{id:'task',claim_id:'claim',context_id:'context'},'researcher');g.setTime('2026-11-01T14:11:00.000Z');assert.throws(()=>g.apply('submit',{id:'task',claim_id:'claim',artifact:ref({}),payload:{}},'researcher'),/claim/);assert.equal(g.state.cloud_discovery.allowances.allowance.used_attempts,1);continue;}if(mode==='artifact')input.submission.candidates[0].identity.name='Changed';const before=structuredClone(f.state);assert.throws(()=>f.apply('import',{id:'task',...input}));assert.deepEqual(f.state,before);assert.equal(f.state.cloud_discovery.allowances.allowance.used_attempts,2);}
});
test('deduplication checks all historical stopped names, normalized domains, phones and email',()=>{
 for(const match of ['name','domain','phone','email']){const f=fixture(),c=candidate(3,'email-qualified');f.ready();f.state.prospects.old={id:'old',name:match==='name'?'SYNTHETIC  HVAC-3':'Different legacy name',contact:{email:match==='email'?'OFFICE@BUSINESS3.EXAMPLE.COM':null,phone:match==='phone'?'+1 703 555 1003':null,source:match==='domain'?'https://www.business3.example.com/old':''},restriction:'do_not_contact',attempts:[{note:'historic'}]};const history=structuredClone(f.state.prospects.old),input=reviewed(f,'task','email-qualified',[c]),out=f.apply('import',{id:'task',...input});assert.equal(out.imports[0].status,'Duplicate',match);assert.equal(out.imports[0].prospect_id,'old');assert.deepEqual(f.state.prospects.old,history);assert.equal(Object.keys(f.state.prospects).length,1);}
});
test('chunks remain bounded while multiple chunks exceed the legacy 25/day cap',()=>{
 const f=fixture();f.ready();assert.throws(()=>f.create('oversize','call-first',26));for(let batch=0;batch<2;batch++){const id='batch-'+batch,input=reviewed(f,id,'call-first',Array.from({length:15},(_,n)=>candidate(batch*15+n)));f.apply('import',{id,...input});}assert.equal(Object.keys(f.state.prospects).length,30);assert.equal(cloudDiscoveryStatus(f.state,f.config,at).call_first,30);assert.equal(f.state.cloud_discovery.allowances.allowance.used_candidates,30);
});
test('canonical historical imports count toward daily ceiling and failed batch import is atomic',()=>{
 const f=fixture();f.ready();for(let n=0;n<124;n++)f.state.events['old-'+n]={type:'verification_imported',at,data:{}};const input=reviewed(f,'task','call-first',[candidate(10),candidate(11)]),before=structuredClone(f.state);assert.throws(()=>f.apply('import',{id:'task',...input}),/limit/);assert.deepEqual(f.state,before);
});
test('tampered state charges, unknown fields and self-reviewed email evidence fail closed',()=>{
 const f=fixture();f.ready();const input=research(f,'email','email-qualified',[candidate(1,'email-qualified')]);f.apply('claim-review',{id:'email',claim_id:'review',context_id:'review-context'},'reviewer');const payload={schema_version:1,task_id:'email',claim_id:'review',context_id:'review-context',submission_sha256:hash(input),decisions:[decision(input.candidates[0],'email-qualified','email-author')]};payload.decisions[0].review.decision.reviewed_by='researcher';assert.throws(()=>f.apply('review',{id:'email',claim_id:'review',artifact:ref(payload),payload,submission:input},'reviewer'));const s=structuredClone(f.state);s.cloud_discovery.allowances.allowance.used_attempts=0;assert.throws(()=>validateCloudDiscoveryState(s,f.config),/charges/);assert.throws(()=>f.apply('pause',{paused:true,reason:'Pause',extra:true}),/Closed/);
});
test('Eastern daily counters roll at midnight including weekend, without erasing history',()=>{
 const f=fixture();f.ready();const input=reviewed(f),out=f.apply('import',{id:'task',...input});assert.equal(out.day,'2026-11-01');assert.equal(cloudDiscoveryStatus(f.state,f.config,'2026-11-02T04:59:59.000Z').call_first,1);assert.equal(cloudDiscoveryStatus(f.state,f.config,'2026-11-02T05:00:00.000Z').call_first,0);assert.equal(Object.keys(f.state.prospects).length,1);
});
test('trusted daily coordinator derives bounded scope and task count, with additional call supply separate',()=>{
 const f=fixture();f.ready();assert.throws(()=>f.apply('queue-daily',{},'researcher'),/coordinator/);for(let n=0;n<4;n++)f.apply('queue-daily',{},'discovery');const tasks=Object.values(f.state.cloud_discovery.tasks);assert.equal(tasks.reduce((n,t)=>n+t.count,0),100);assert.ok(tasks.every(t=>t.count===25&&t.lane==='email-qualified'&&t.area===f.p.areas[0]&&t.subtypes.every(s=>f.p.trades.includes(s))));assert.deepEqual(tasks.map(t=>t.assigned_to),['owner','friend','owner','friend']);assert.throws(()=>f.apply('queue-daily',{},'discovery'),/covered/);f.create('additional-calls','call-first',25);assert.equal(Object.keys(f.state.cloud_discovery.tasks).length,5);assert.equal(f.state.cloud_discovery.allowances.allowance.used_attempts,0);
});
test('automatic import records coordinator identity and never grants research credentials import authority',()=>{
 const f=fixture();f.ready();const input=reviewed(f);assert.throws(()=>f.apply('import',{id:'task',...input},'researcher'),/coordinator/);f.apply('import',{id:'task',...input},'discovery');assert.deepEqual(f.state.cloud_discovery.tasks.task.imported_by,{actor:'discovery',at});assert.equal(Object.values(f.state.prospects)[0].follow_up_owner,'owner');
});
test('storage live-clock check fences an expired claim after earlier successful pure replay',()=>{
 const f=fixture();f.ready();const payload=research(f),before=structuredClone(f.state);f.apply('claim-review',{id:'task',claim_id:'review',context_id:'review-context'},'reviewer');const tr={type:'claim-review',actor:'reviewer',at,input:{revision:before.revision,id:'task',claim_id:'review',context_id:'review-context'}};assertCloudDiscoveryTransitionLive(before,f.state,f.config,tr,at);assert.throws(()=>assertCloudDiscoveryTransitionLive(before,f.state,f.config,tr,'2026-11-01T14:16:00.000Z'),/allowance/);assert.equal(payload.candidates.length,1);
});
test('expired claims stop covering the daily target without refunding or retrying original work',()=>{
 const f=fixture();f.ready();for(let n=0;n<4;n++){const queued=f.apply('queue-daily',{},'discovery');f.apply('claim',{id:queued.id,claim_id:'author-'+n,context_id:'context-'+n},'researcher');}const original=structuredClone(f.state.cloud_discovery.tasks);f.setTime('2026-11-01T14:16:00.000Z');f.allowance('fresh');const queued=f.apply('queue-daily',{},'discovery');assert.equal(f.state.cloud_discovery.tasks[queued.id].count,25);assert.equal(f.state.cloud_discovery.allowances.allowance.used_candidates,100);assert.equal(f.state.cloud_discovery.allowances.allowance.used_attempts,4);for(const [id,t]of Object.entries(original))assert.deepEqual(f.state.cloud_discovery.tasks[id],t);assert.throws(()=>f.apply('claim',{id:Object.keys(original)[0],claim_id:'retry',context_id:'retry'},'researcher'),/unclaimed/);
});
test('expired reviewer and old-epoch queued chunks cannot permanently consume pending coverage',()=>{
 const f=fixture();f.ready();const submitted=research(f,'old-review','email-qualified',[candidate(1,'email-qualified')]);f.apply('claim-review',{id:'old-review',claim_id:'old-review-claim',context_id:'old-review-context'},'reviewer');f.setTime('2026-11-01T14:16:00.000Z');f.allowance('fresh');for(let n=0;n<4;n++)f.apply('queue-daily',{},'discovery');assert.equal(Object.values(f.state.cloud_discovery.tasks).filter(t=>t.created_by==='discovery').reduce((n,t)=>n+t.count,0),100);assert.equal(submitted.candidates.length,1);f.apply('pause',{paused:true,reason:'Invalidate queued authority'});f.apply('pause',{paused:false,reason:'Fresh bounded scope'});const next=f.apply('queue-daily',{},'discovery');assert.equal(f.state.cloud_discovery.tasks[next.id].count,25);assert.equal(f.state.cloud_discovery.allowances.allowance.used_attempts,2);
});


test('coordinator holds an exact unimportable reviewed packet without losing evidence or charges',()=>{
 const f=fixture();f.ready();const c=candidate();const source=c.packet.sources[0];source.text+=' Public background detail.'.repeat(250);source.content_sha256=sourceContentHash(source);c.packet=candidatePacket(c.identity,[source],{id:'large'},new Date(at));c.packet.unknowns=Array.from({length:12},(_,n)=>`Explicit unknown ${n}: `+'x'.repeat(1500));const input=reviewed(f,'oversized','call-first',[c]);
 assert.throws(()=>f.apply('import',{id:'oversized',...input}),error=>error.code==='DISCOVERY_IMPORT_INVALID'&&/canonical evidence bound/.test(error.message));
 const before=structuredClone(f.state),task=before.cloud_discovery.tasks.oversized,hold={id:task.id,reason:'Verified canonical packet size exceeds import bound',task_sha256:hash(task)};
 for(const actor of ['owner','friend','researcher','reviewer'])assert.throws(()=>f.apply('hold',hold,actor),/coordinator/);
 assert.throws(()=>f.apply('hold',{...hold,task_sha256:'0'.repeat(64)},'discovery'),/unchanged/);assert.deepEqual(f.state,before);
 f.apply('hold',hold,'discovery');const saved=f.state.cloud_discovery.tasks.oversized;assert.equal(saved.status,'Held');assert.deepEqual({...saved,status:task.status,hold:undefined},{...task,hold:undefined});assert.deepEqual(f.state.cloud_discovery.allowances,before.cloud_discovery.allowances);assert.equal(cloudDiscoveryStatus(f.state,f.config,at).held,1);
 assert.throws(()=>f.apply('import',{id:'oversized',...input}),/completed review/);assert.throws(()=>f.apply('hold',{...hold,task_sha256:hash(saved)},'discovery'),/unchanged/);
 const next=reviewed(f,'valid','call-first',[candidate(2)]);assert.equal(f.apply('import',{id:'valid',...next}).call_first,1);
});

test('held email tasks no longer cover target, and pause or stale task hashes fence holds',()=>{
 const f=fixture();f.ready();reviewed(f,'email','email-qualified',[candidate(1,'email-qualified')]);const task=f.state.cloud_discovery.tasks.email,input={id:task.id,reason:'Exact source no longer satisfies import validation',task_sha256:hash(task)};
 f.apply('hold',input,'discovery');for(let n=0;n<4;n++)f.apply('queue-daily',{},'discovery');assert.equal(Object.values(f.state.cloud_discovery.tasks).filter(t=>t.status==='Queued').reduce((n,t)=>n+t.count,0),100);
 const g=fixture();g.ready();reviewed(g);const old=g.state.cloud_discovery.tasks.task;g.apply('pause',{paused:true,reason:'Stop'});assert.throws(()=>g.apply('hold',{id:'task',reason:'Import failed',task_sha256:hash(old)},'discovery'),/predates|paused/);
});


test('revision, allowance, daily limit, target and canonical capacity are not invalid packet holds',()=>{
 for(const kind of ['revision','allowance','daily','target','capacity']){
  const f=fixture();f.ready();const lane=kind==='target'?'email-qualified':'call-first',input=reviewed(f,'task',lane,[candidate(1,lane)]);
  if(kind==='allowance')f.setTime('2026-11-01T14:16:00.000Z');
  if(kind==='daily')for(let n=0;n<125;n++)f.state.events['prior-'+n]={type:'verification_imported',at,data:{}};
  if(kind==='target')for(let n=0;n<100;n++)f.state.events['prior-'+n]={type:'prospect_imported',at,data:{qualification:{verdict:'Research-qualified'},contact:{email:'prior'+n+'@example.com'}}};
  if(kind==='capacity')f.state.capacity_fixture='x'.repeat(19000000);
  const before=structuredClone(f.state);
  assert.throws(()=>kind==='revision'?applyCloudDiscoveryTransition(f.state,f.config,{type:'import',actor:'owner',at,input:{id:'task',...input,revision:f.state.revision-1}}):f.apply('import',{id:'task',...input}),error=>error.code!=='DISCOVERY_IMPORT_INVALID'&&/revision|allowance|limit|target|capacity/.test(error.message),kind);
  assert.deepEqual(f.state,before);
 }
});
