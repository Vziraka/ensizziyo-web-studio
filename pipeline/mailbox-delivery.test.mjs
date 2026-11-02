import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,hash} from './lifecycle.mjs';
import {fixtureReply} from './lifecycle-fixtures.mjs';
import {replyDraftContent} from './reply-content.mjs';
import {emailDraftReviewBinding} from './email-draft-policy.mjs';
import {applyOutreachReview} from './outreach-review.mjs';
import {mailMessageId,composeExactMail,byteHash} from './google-hosted-transport.mjs';
import {selectReplyAttachments} from './reply-attachments.mjs';
import {mailboxDeliveryCapability,validateMailboxDeliveryPolicy,validateMailboxDeliveryState,mailboxDeliveryPackage,mailboxDeliveryIntentId,assertMailboxDeliveryCurrent,assertMailboxDeliveryTransitionLive,applyMailboxDeliveryTransition,mailboxDeliveryStatus,mailboxDeliveryOutreachState} from './mailbox-delivery.mjs';

const at='2026-11-02T14:00:00.000Z',time=n=>new Date(Date.parse(at)+n*1000).toISOString();
function fixture(kind='reply'){
 const config={...structuredClone(initialConfig),mode:'production',shared_capability:mailboxDeliveryCapability,outreach_enabled:false,mailbox:{schema_version:1,account:'fixture@evzdigital.studio',grant_id:'grant',after:'2026-11-01T00:00:00.000Z'}};
 config.sender.email='hello@evzdigital.studio';config.sender.postal_address='FICTIONAL reviewed address';
 config.mailbox_delivery={schema_version:1,site_id:'site',deploy_id:'deploy',origin:'https://fictional.example.invalid',account:config.mailbox.account,grant_id:'grant',from:config.sender.email,recovery_generation:'one',expires_at:time(7200),max_intents:200,max_per_day:200,kinds:['reply','outreach'],sender_ready:true,postal_address_verified:true};
 const r={id:'project',company_id:'company',name:'Fictional company',contact:{email:'inquiry@example.invalid',verified:true},follow_up_owner:'owner',stage:'Reply review',calls:{},attempts:[],qualification:{verdict:'Research-qualified',independent_review:'Accepted'},call_prep:{observations:[{fact:'Fictional reviewed source'}]},cold_paused:false};
 const state={schema_version:1,mode:'production',run_id:'delivery-fixture',revision:0,updated_at:at,prospects:{project:r},events:{},actions:{},asset_index:{},mailbox_sync:{policy_sha256:hash(config.mailbox),phase:'history',cursor:'100',pending:[],page:null,next_cursor:null,checked_at:at,hold:null,held_sources:{}}};
 if(kind==='reply'){
  r.reply=fixtureReply('latest','thread',r.contact.email);const content=replyDraftContent(r,'Thanks. Which process would help most?','owner',config,true);content.review_binding_sha256=emailDraftReviewBinding(config);
  r.reply_draft={source_id:r.reply.source_id,source_sha256:r.reply.content.source_sha256,reply_sha256:hash(r.reply),body:content.body,content,sha256:hash(content),owner:'owner',actor:'owner',status:'Approved; sending held',approved_by:'owner',approval_event:'content-approval'};
  state.events['content-approval']={id:'content-approval',type:'reply_draft_approved',prospect_id:r.id,actor:'owner',data:{sha256:r.reply_draft.sha256,approved:true,facts_checked:true}};
 }else{
  r.stage='Ready to contact';r.controlled=true;const app={config:{...config,mode:'controlled'},now:()=>new Date(at)};
  applyOutreachReview(app,state,{id:'draft',prospect_id:r.id,type:'outreach_draft_saved',data:{lane:'email-first',timezone:'America/New_York',subject:'Fictional question',body:'Could this reviewed idea help?'}},'owner',state.revision);
  applyOutreachReview(app,state,{id:'batch',prospect_id:'outreach-batches',type:'outreach_batch_approved',data:{items:[{project_id:r.id,sha256:state.outreach_review.drafts.project.sha256}],facts_checked:true}},'owner',state.revision);delete r.controlled;
 }
 const tr=(type,input,actor='delivery',when=at)=>applyMailboxDeliveryTransition(state,config,{type,actor,at:when,input});
 const grant=(id='allowance',max_intents=10,when=at)=>tr('allowance',{revision:state.revision,allowance:{id,evidence_ref:'fictional included allowance review',observed_at:when,expires_at:time(3600),included_only:true,max_intents}},'owner',when);
 const pause=(paused,when=at)=>tr('pause',{revision:state.revision,paused,reason:'Signed finite proof'},'friend',when);
 const approve=(when=at)=>{const p=mailboxDeliveryPackage(state,config,{kind,project_id:'project'},'owner',when);return tr('approve',{revision:state.revision,kind,project_id:'project',package_sha256:p.sha256},'owner',when);};
 const reserve=(approval,when=at)=>{const a=state.mailbox_delivery.approvals[approval.approval_id],id=mailboxDeliveryIntentId(state,a);return tr('reserve',{revision:state.revision,approval_id:a.id,mime:{reference:'mailbox-mime/'+hash('exact MIME'),sha256:hash('exact MIME'),bytes:500,message_id:mailMessageId(id)}},'delivery',when);};
 const start=()=>{grant();pause(false);return reserve(approve());};
 const receipt=id=>({message_id:'gmail-message',thread_id:kind==='reply'?'thread':'new-thread',rfc_message_id:state.mailbox_delivery.intents[id].mime.message_id,mime_sha256:hash('exact MIME'),sent_at:at});
 return {state,config,r,tr,grant,pause,approve,reserve,start,receipt};
}
function unchanged(f,fn,pattern){const before=structuredClone(f.state);assert.throws(fn,pattern);assert.deepEqual(f.state,before);}

test('non-inquiry exclusion clears coverage only with Excluded status and never resumes outreach or commercial gates',()=>{
 const f=fixture('outreach'),source={source_id:'internal',classification:'non_inquiry',status:'Identity review',paused_projects:['project'],source:{content:{from:f.r.contact.email}}};f.state.inquiry_intake={sources:{internal:source}};
 unchanged(f,()=>mailboxDeliveryPackage(f.state,f.config,{kind:'outreach',project_id:'project'},'owner',at),/incoming evidence/);source.status='Excluded';assert.doesNotThrow(()=>mailboxDeliveryPackage(f.state,f.config,{kind:'outreach',project_id:'project'},'owner',at));assert.equal(f.state.mailbox_delivery,undefined);
 f.r.cold_paused=true;unchanged(f,()=>mailboxDeliveryPackage(f.state,f.config,{kind:'outreach',project_id:'project'},'owner',at));f.r.cold_paused=false;f.config.sender.postal_address='';f.config.mailbox_delivery.postal_address_verified=false;unchanged(f,()=>mailboxDeliveryPackage(f.state,f.config,{kind:'outreach',project_id:'project'},'owner',at),/postal|address/i);
});

test('exact separately approved reply reserves once, claims before POST and verifies original receipt',()=>{
 const f=fixture(),records=structuredClone(f.state.prospects),{id}=f.start();assert.equal(f.state.mailbox_delivery.intents[id].status,'Reserved');assert.equal(f.state.mailbox_delivery.allowances.allowance.used_intents,1);
 f.tr('claim',{id});assert.equal(f.state.mailbox_delivery.intents[id].status,'Uncertain');f.tr('ack',{id,message_id:'gmail-message',thread_id:'thread'});f.tr('verify',{id,receipt:f.receipt(id)});
 assert.equal(f.state.mailbox_delivery.intents[id].status,'Verified');assert.deepEqual(f.state.prospects,records);assert.equal(f.state.mailbox_delivery.intents[id].mime.reference,'mailbox-mime/'+hash('exact MIME'));assert.equal(JSON.stringify(f.state.mailbox_delivery).includes('raw_base64'),false);
 const before=structuredClone(f.state);assert.equal(f.tr('verify',{id,receipt:f.receipt(id)}).duplicate,true);assert.deepEqual(f.state,before);
});
test('closed policy, old profiles and cross-account grants fail closed',()=>{
 const f=fixture();for(const change of [{max_per_day:501},{max_intents:0},{kinds:['reply']},{origin:'http://bad.invalid'},{unknown:true},{from:'other@evzdigital.studio'}])assert.throws(()=>validateMailboxDeliveryPolicy({...f.config.mailbox_delivery,...change}));
 for(const capability of ['shared-mailbox-review-v1','shared-mailbox-work-v1','shared-mailbox-clock-v1']){const g=fixture();g.config.shared_capability=capability;unchanged(g,()=>g.grant(),/capability/);}
 f.config.mailbox.grant_id='different';unchanged(f,()=>f.grant(),/account/);
});
test('assigned operator and separate current content approval cannot be replaced by worker approval',()=>{
 const f=fixture();unchanged(f,()=>f.tr('approve',{revision:0,kind:'reply',project_id:'project',package_sha256:'a'.repeat(64)}),/operator/);
 assert.throws(()=>mailboxDeliveryPackage(f.state,f.config,{kind:'reply',project_id:'project'},'friend',at),/Assigned/);
 for(const mutate of [g=>g.r.reply_draft.status='Draft',g=>g.state.events['content-approval'].data.facts_checked=false,g=>g.r.reply_draft.content.body='changed',g=>g.r.follow_up_owner='friend']){const g=fixture();mutate(g);unchanged(g,()=>g.approve());}
});
test('unknown allowance and initial pause cannot reserve; reservation permanently consumes finite budget',()=>{
 const f=fixture(),a=f.approve();unchanged(f,()=>f.reserve(a),/paused/);f.pause(false);unchanged(f,()=>f.reserve(a),/allowance/);f.grant('single',1);const {id}=f.reserve(a);f.tr('hold',{id,reason:'Lost reservation acknowledgement'});
 unchanged(f,()=>f.tr('claim',{id}),/unsettled/);assert.equal(f.state.mailbox_delivery.allowances.single.used_intents,1);assert.equal(mailboxDeliveryStatus(f.state,f.config,at).status,'Allowance exhausted');unchanged(f,()=>f.grant('single',1),/already used/);
});
test('CAS revision and deterministic reservation prevent concurrent/restarted replacement sends',()=>{
 const f=fixture();f.grant();f.pause(false);const a=f.approve(),revision=f.state.revision,{id}=f.reserve(a);unchanged(f,()=>f.reserve(a),/already reserved/);
 unchanged(f,()=>f.tr('reserve',{revision,approval_id:a.approval_id,mime:f.state.mailbox_delivery.intents[id].mime}),/revision/);f.tr('claim',{id});unchanged(f,()=>f.tr('claim',{id}),/already claimed/);
 f.tr('hold',{id,reason:'Uncertain POST'});unchanged(f,()=>f.tr('claim',{id}),/unsettled/);f.tr('verify',{id,receipt:f.receipt(id)});assert.equal(f.state.mailbox_delivery.intents[id].status,'Verified');
});
test('pause, ownership, new source, held coverage and allowance replacement fence prior intent',()=>{
 for(const mutate of [f=>f.pause(true,time(1)),f=>{f.r.follow_up_owner='friend';},f=>{f.state.mailbox_sync.pending=['new-message'];},f=>{f.state.mailbox_sync.held_sources.bad={matched_projects:['project']};},f=>{f.state.inquiry_intake={sources:{new:{status:'Identity review',candidates:['project']}}};},f=>f.grant('replacement',2,time(1))]){
  const f=fixture(),{id}=f.start();mutate(f);unchanged(f,()=>f.tr('claim',{id},'delivery',time(2)));assert.equal(f.state.mailbox_delivery.allowances.allowance.used_intents,1);
 }
 const f=fixture(),{id}=f.start();f.pause(true,time(1));f.pause(false,time(2));unchanged(f,()=>f.tr('claim',{id},'delivery',time(3)),/Fresh exact/);
});
test('live pre-CAS expiry rejects stale reservation/claim while readback survives expiry and pause',()=>{
 const f=fixture(),before=structuredClone(f.state),{id}=f.start();assert.throws(()=>assertMailboxDeliveryTransitionLive(before,f.state,f.config,{type:'claim',input:{id}},time(25)),/expired/);
 f.tr('claim',{id});f.pause(true,time(1));f.tr('verify',{id,receipt:f.receipt(id)},'delivery',time(8000));assert.equal(f.state.mailbox_delivery.intents[id].status,'Verified');
});
test('readback requires original claim, exact MIME, matching acknowledgement and original reply thread',()=>{
 const f=fixture(),{id}=f.start();unchanged(f,()=>f.tr('verify',{id,receipt:f.receipt(id)}),/unclaimed/);f.tr('claim',{id});f.tr('ack',{id,message_id:'gmail-message',thread_id:'thread'});
 for(const change of [{mime_sha256:hash('different')},{message_id:'other'},{thread_id:'wrong'},{rfc_message_id:'<other@example.invalid>'},{sent_at:time(70)},{unknown:true}])unchanged(f,()=>f.tr('verify',{id,receipt:{...f.receipt(id),...change}}));
});
test('outreach requires exact batch approval, current footer and finite approved minute slot',()=>{
 const f=fixture('outreach'),{id}=f.start();f.tr('claim',{id});f.tr('verify',{id,receipt:f.receipt(id)});const projected=mailboxDeliveryOutreachState(f.state);assert.equal(projected.outreach_delivery.intents[id].kind,'new-business');assert.equal(projected.outreach_delivery.intents[id].status,'Verified');assert.equal(f.state.outreach_delivery,undefined);
 for(const mutate of [g=>g.config.mailbox_delivery.postal_address_verified=false,g=>g.config.sender.postal_address='',g=>g.state.events.batch.data.facts_checked=false,g=>g.state.outreach_review.paused=true,g=>g.state.mailbox_sync.pending.push('new')]){const g=fixture('outreach');mutate(g);unchanged(g,()=>g.approve());}
 const late=fixture('outreach');unchanged(late,()=>late.approve(time(60)),/slot/);
});
test('historical company/recipient liabilities and 100-new ceiling survive unrelated new approvals',()=>{
 for(const match of ['company','recipient']){const f=fixture('outreach');f.state.outreach_delivery={intents:{old:{id:'old',company_id:match==='company'?'company':'other',project_id:'old',to:match==='recipient'?'inquiry@example.invalid':'other@example.invalid',kind:'new-business',status:'Uncertain',sender_day:'2026-11-02'}}};f.grant();f.pause(false);const a=f.approve();unchanged(f,()=>f.reserve(a),/business or recipient/);}
 const f=fixture('outreach');f.state.outreach_delivery={intents:Object.fromEntries(Array.from({length:100},(_,i)=>['old'+i,{id:'old'+i,project_id:'old'+i,company_id:'old'+i,to:'old'+i+'@example.invalid',kind:'new-business',status:'Uncertain',sender_day:'2026-11-02'}]))};f.grant();f.pause(false);const a=f.approve();unchanged(f,()=>f.reserve(a),/100 new-business/);
});
test('MIME references and retained accounting reject tampering; no failed transition mutates records',()=>{
 const f=fixture();f.grant();f.pause(false);const a=f.approve(),id=mailboxDeliveryIntentId(f.state,f.state.mailbox_delivery.approvals[a.approval_id]),mime={reference:'mailbox-mime/'+hash('exact MIME'),sha256:hash('exact MIME'),bytes:500,message_id:mailMessageId(id)};
 for(const change of [{reference:'https://other.invalid'},{bytes:28000001},{message_id:'<unbound@example.invalid>'},{raw:'secret'}])unchanged(f,()=>f.tr('reserve',{revision:f.state.revision,approval_id:a.approval_id,mime:{...mime,...change}}));f.reserve(a);
 for(const mutate of [d=>d.allowances.allowance.used_intents=0,d=>d.intents[id].mime.sha256=hash('other'),d=>d.intents[id].package.body='changed',d=>d.intents[id].status='Verified',d=>d.intents[id].extra=true]){const copy=structuredClone(f.state);mutate(copy.mailbox_delivery);assert.throws(()=>validateMailboxDeliveryState(copy,f.config));}
});
test('one follow-up uses the original verified send and cannot become a second follow-up',()=>{
 const f=fixture('outreach');f.config.mailbox_delivery.expires_at=time(900000);const {id}=f.start();f.tr('claim',{id});f.tr('verify',{id,receipt:f.receipt(id)});
 const followAt=time(604800),projected=mailboxDeliveryOutreachState(f.state),app={config:{...f.config,mode:'controlled'},now:()=>new Date(followAt)};f.r.controlled=true;
 applyOutreachReview(app,projected,{id:'follow-draft',prospect_id:'project',type:'outreach_draft_saved',data:{lane:'email-first',timezone:'America/New_York',subject:'One follow-up',body:'Any thoughts on the reviewed idea?',kind:'follow-up'}},'owner',projected.revision);
 applyOutreachReview(app,projected,{id:'follow-batch',prospect_id:'outreach-batches',type:'outreach_batch_approved',data:{items:[{project_id:'project',sha256:projected.outreach_review.drafts.project.sha256}],facts_checked:true}},'owner',projected.revision);delete f.r.controlled;
 Object.assign(f.state,{outreach_review:projected.outreach_review,events:projected.events,revision:projected.revision,updated_at:followAt});
 f.tr('allowance',{revision:f.state.revision,allowance:{id:'follow-allowance',evidence_ref:'Reviewed fictional follow-up budget',observed_at:followAt,expires_at:time(608400),included_only:true,max_intents:1}},'friend',followAt);
 const slot=f.state.outreach_review.drafts.project.schedule.at,approval=f.approve(followAt);unchanged(f,()=>f.reserve(approval,followAt),/slot/);const follow=f.reserve(approval,slot);assert.equal(f.state.mailbox_delivery.intents[follow.id].package.source.first_intent,id);f.tr('claim',{id:follow.id},'delivery',slot);
 f.tr('verify',{id:follow.id,receipt:{...f.receipt(follow.id),message_id:'follow-message',thread_id:'follow-thread',sent_at:slot}},'delivery',slot);
 const current=mailboxDeliveryOutreachState(f.state);assert.equal(Object.values(current.outreach_delivery.intents).filter(i=>i.kind==='follow-up').length,1);current.prospects.project.controlled=true;
 assert.throws(()=>applyOutreachReview(app,current,{id:'second-follow',prospect_id:'project',type:'outreach_draft_saved',data:{lane:'email-first',timezone:'America/New_York',subject:'Another follow-up',body:'More?',kind:'follow-up'}},'owner',current.revision),/One follow-up/);
});
test('PDF package composes actual MIME with current exact descriptors and deduplicated references',()=>{
 const f=fixture(),bytes=Buffer.from('%PDF-1.4\nfictional exact original\n%%EOF'),digest=byteHash(bytes),d=f.r.reply_draft;
 f.state.asset_index={asset:{id:'asset',name:'Fictional PDF',scope:'project',project_id:'project',baseline_version:'v1',baseline_approval_event:'asset-approved',versions:{v1:{id:'v1',label:'Reviewed original',reference:'private-path:original.pdf',verified_original:{reference:'private-path:original.pdf',sha256:digest,bytes:bytes.length,mime_type:'application/pdf'}}}}};
 f.state.events['asset-approved']={id:'asset-approved',type:'asset_version_selected',actor:'owner',prospect_id:'studio-assets',data:{asset_id:'asset',version_id:'v1'}};
 d.content.attachments=selectReplyAttachments(f.state,'project',[{asset_id:'asset',version_id:'v1',sha256:digest}]);d.sha256=hash(d.content);f.state.events['content-approval'].data.sha256=d.sha256;
 const packet=mailboxDeliveryPackage(f.state,f.config,{kind:'reply',project_id:'project'},'owner',at),wire=composeExactMail(packet,'fictional-intent',at,[bytes]);assert.equal(packet.attachments[0].filename,digest+'.pdf');assert.match(wire.raw.toString(),/Content-Type: application\/pdf/);assert.equal(new Set(packet.references).size,packet.references.length);
 f.state.asset_index.asset.dispute={reason:'Disputed'};unchanged(f,()=>f.approve(),/approval/);
});
test('live allowance expiry and unverified sender never authorize a new effect',()=>{
 const f=fixture();f.config.mailbox_delivery.sender_ready=false;f.grant();f.pause(false);const a=f.approve();unchanged(f,()=>f.reserve(a),/sender/);
 const g=fixture();g.grant();g.pause(false);const approval=g.approve();unchanged(g,()=>g.reserve(approval,time(3600)),/allowance/);
 assert.throws(()=>assertMailboxDeliveryTransitionLive(g.state,g.state,g.config,{type:'allowance',input:{allowance:{expires_at:time(1)}}},time(1)),/expired/);
});
test('prototype-shaped identifiers never address inherited objects or change global state',()=>{
 const f=fixture();f.start();for(const id of ['__proto__','constructor','prototype','toString'])unchanged(f,()=>f.tr('hold',{id,reason:'Invalid inherited target'}),/Original intent/);
 assert.equal(Object.hasOwn(Object.prototype,'hold'),false);assert.equal(Object.hasOwn(Object.prototype,'status'),false);
});

test('batch send approval is atomic, assigned and bound to every exact package',()=>{
 const f=fixture('outreach'),p=mailboxDeliveryPackage(f.state,f.config,{kind:'outreach',project_id:'project'},'owner',at),item={project_id:'project',package_sha256:p.sha256};
 unchanged(f,()=>f.tr('approve-batch',{revision:f.state.revision,items:[item,{project_id:'missing',package_sha256:p.sha256}]},'owner'));
 unchanged(f,()=>f.tr('approve-batch',{revision:f.state.revision,items:[item,item]},'owner'));
 unchanged(f,()=>f.tr('approve-batch',{revision:f.state.revision,items:[item]},'friend'));
 const result=f.tr('approve-batch',{revision:f.state.revision,items:[item]},'owner');assert.equal(result.approval_ids.length,1);assert.equal(Object.keys(f.state.mailbox_delivery.approvals).length,1);assert.equal(Object.keys(f.state.mailbox_delivery.intents).length,0);
});
