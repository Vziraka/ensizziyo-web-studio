import test from 'node:test';
import assert from 'node:assert/strict';
import {StudioLifecycle,initialConfig,hash} from './lifecycle.mjs';
import {applyMailboxObservation,mailboxProfile} from './mailbox-intake.mjs';
import {gmailScopes} from './google-hosted-transport.mjs';
import {applyLocalInquiry} from './local-inquiry-intake.mjs';
import {fixtureReply} from './lifecycle-fixtures.mjs';

const at='2026-11-02T14:00:00.000Z';
function fixture(){
 const config={...structuredClone(initialConfig),mode:'production',shared_capability:'shared-mailbox-review-v1',mailbox:{schema_version:1,account:'ensizziyo@evzdigital.studio',grant_id:'synthetic-mailbox',after:'2026-11-01T00:00:00.000Z'}};
 const app=new StudioLifecycle(null,()=>new Date(at));app.config=config;
 const state={schema_version:1,run_id:config.run_id,mode:'production',revision:0,updated_at:at,prospects:{},events:{},actions:{}};
 return {app,state};
}
const incoming=id=>({id:'received-'+id,prospect_id:'inquiry-intake',type:'inquiry_recorded',at,data:{company_name:'Synthetic incoming business '+id,classification:'uncertain',reply:{...fixtureReply(id,'thread-'+id,id+'@example.org','A synthetic website inquiry.'),received_at:at}}});
const classify=(id,source)=>({id,prospect_id:'inquiry-intake',type:'inquiry_classification_reviewed',at,data:{source_id:source,classification:'inquiry',reason:'Reviewed the retained synthetic message.'}});
test('shared intake requires provider adoption and rotates ownership only after signed classification',()=>{
 const {app,state}=fixture();
 assert.throws(()=>applyLocalInquiry(app,state,incoming('a'),'owner',0,{shared:true}),/provider/);
 applyLocalInquiry(app,state,incoming('a'),'provider',0,{shared:true});
 assert.equal(Object.keys(state.prospects).length,0);
 const a=applyLocalInquiry(app,state,classify('classify-a','a'),'owner',state.revision,{shared:true});
 assert.equal(a.receipt.assigned_to,'owner');assert.equal(state.prospects[a.receipt.project_id].controlled,false);
 applyLocalInquiry(app,state,incoming('b'),'provider',state.revision,{shared:true});
 const b=applyLocalInquiry(app,state,classify('classify-b','b'),'friend',state.revision,{shared:true});
 assert.equal(b.receipt.assigned_to,'friend');assert.equal(Object.keys(state.prospects).length,2);
 const before=structuredClone(state);assert.equal(applyLocalInquiry(app,state,incoming('a'),'provider',state.revision,{shared:true}).duplicate,true);assert.deepEqual(state,before);
});

test('only signed complete-source review excludes internal mail; a later real inquiry remains a separate assignment',()=>{
 const f=fixture(),source=incoming('internal'),review={...classify('exclude-internal','internal'),data:{source_id:'internal',classification:'non_inquiry',reason:'Read the complete internal technical test.'}};
 const direct={...source,data:{...source.data,classification:'non_inquiry'}};assert.throws(()=>applyLocalInquiry(f.app,f.state,direct,'provider',0,{shared:true}),/classification explicitly/);
 applyLocalInquiry(f.app,f.state,source,'provider',0,{shared:true});const original=structuredClone(f.state.inquiry_intake.sources.internal),rev=f.state.revision;assert.throws(()=>applyLocalInquiry(f.app,f.state,review,'provider',rev,{shared:true}),/signed operator/);
 applyLocalInquiry(f.app,f.state,review,'friend',rev,{shared:true});assert.equal(f.state.inquiry_intake.sources.internal.status,'Excluded');assert.equal(f.state.inquiry_intake.sources.internal.source_sha256,original.source_sha256);assert.deepEqual(f.state.inquiry_intake.sources.internal.source,original.source);assert.equal(f.state.inquiry_intake.next_owner,'owner');assert.equal(Object.keys(f.state.prospects).length,0);
 assert.equal(applyLocalInquiry(f.app,f.state,{...source,id:'redelivery'},'provider',f.state.revision,{shared:true}).duplicate,true);assert.equal(f.state.inquiry_intake.sources.internal.classification,'non_inquiry');
 const later=incoming('ack');applyLocalInquiry(f.app,f.state,later,'provider',f.state.revision,{shared:true});applyLocalInquiry(f.app,f.state,classify('review-ack','ack'),'owner',f.state.revision,{shared:true});assert.equal(Object.keys(f.state.prospects).length,1);assert.equal(f.state.inquiry_intake.sources.ack.assigned_to,'owner');assert.equal(f.state.inquiry_intake.next_owner,'friend');
 const held=fixture();start(held);apply(held,'list',{after:held.app.config.mailbox.after,page:null},{messages:[{id:'internal',threadId:'thread-internal'}]});const incomplete=message('internal');incomplete.payload.headers.push({name:'Cc',value:'other@example.org'});apply(held,'message',{id:'internal',threadId:'thread-internal'},incomplete);const before=structuredClone(held.state);assert.throws(()=>applyLocalInquiry(held.app,held.state,review,'owner',held.state.revision,{shared:true}),/unresolved uncertain/);assert.deepEqual(held.state,before);
});

const grant={profile:mailboxProfile,account:'ensizziyo@evzdigital.studio',grant_id:'synthetic-mailbox',scopes:['openid','https://www.googleapis.com/auth/userinfo.email',...gmailScopes],expires_at:Date.parse(at)+3600000};
function apply(f,operation,input,value){return applyMailboxObservation(f.state,f.app.config,{operation,input,value,grant,at,before_sha256:hash(f.state.mailbox_sync??null),policy_sha256:hash(f.app.config.mailbox)});}
const message=(id='a',more={})=>({id,threadId:'thread-'+id,internalDate:String(Date.parse(at)),labelIds:['INBOX'],payload:{mimeType:'text/plain',headers:[{name:'From',value:id+'@example.org'},{name:'To',value:'hello@evzdigital.studio'},{name:'Subject',value:'Synthetic inquiry'},{name:'Message-ID',value:'<'+id+'@example.org>'}],body:{data:Buffer.from('Synthetic website inquiry').toString('base64url')}},...more});
function start(f){apply(f,'profile',null,{emailAddress:grant.account,historyId:'100'});}
test('bootstrap retains its original history anchor and drains message evidence before claiming catch-up',()=>{
 const f=fixture();start(f);apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[{id:'a',threadId:'thread-a'}]});
 assert.equal(f.state.mailbox_sync.cursor,'100');assert.equal(f.state.mailbox_sync.checked_at,null);
 apply(f,'message',{id:'a',threadId:'thread-a'},message());assert.equal(f.state.inquiry_intake.sources.a.classification,'uncertain');
 apply(f,'history',{cursor:'100',page:null},{historyId:'120',history:[{id:'110',messagesAdded:[{message:{id:'b',threadId:'thread-b'}}]}]});
 assert.equal(f.state.mailbox_sync.cursor,'100');assert.equal(f.state.mailbox_sync.checked_at,null);
 apply(f,'message',{id:'b',threadId:'thread-b'},message('b'));
 assert.equal(f.state.mailbox_sync.cursor,'120');assert.equal(f.state.mailbox_sync.checked_at,at);
});
test('a registered reply pauses before newsletter classification or unparseable source handling',()=>{
 for(const held of [false,true]){const f=fixture();f.state.prospects.old={id:'old',name:'Synthetic saved client',contact:{email:'a@example.org'},cold_paused:false,attempts:[],calls:{}};start(f);
 apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[{id:'a',threadId:'thread-a'}]});const m=message();m.payload.headers.push({name:held?'Cc':'List-ID',value:held?'other@example.org':'synthetic.list'});
 apply(f,'message',{id:'a',threadId:'thread-a'},m);assert.equal(f.state.prospects.old.cold_paused,true);
 if(held)assert.equal(f.state.mailbox_sync.held_sources.a.status,'Original review required');else assert.equal(f.state.inquiry_intake.sources.a.classification,'newsletter');
 assert.equal(Object.keys(f.state.prospects).length,1);
 }
});
test('wrong grant, cursor, account and evidence cannot advance mailbox state',()=>{
 const f=fixture();const o={operation:'profile',input:null,value:{emailAddress:grant.account,historyId:'100'},grant,at,before_sha256:hash(null),policy_sha256:hash(f.app.config.mailbox)};
 for(const altered of [{...o,grant:{...grant,account:'someone@example.org'}},{...o,before_sha256:'wrong'},{...o,value:{emailAddress:'someone@example.org',historyId:'100'}},{...o,value:{...o.value,access_token:'forbidden'}}]){const original=structuredClone(f.state);assert.throws(()=>applyMailboxObservation(f.state,f.app.config,altered));assert.deepEqual(f.state,original);}
});


test('conflicting identities and looping pages fail before a cursor can be adopted',()=>{
 const f=fixture();start(f);
 assert.throws(()=>apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[{id:'a',threadId:'one'},{id:'a',threadId:'two'}]}),/Conflicting/);
 apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[],nextPageToken:'page-two'});
 assert.throws(()=>apply(f,'list',{after:f.app.config.mailbox.after,page:'page-two'},{messages:[],nextPageToken:'page-two'}),/pagination/);assert.equal(f.state.mailbox_sync.cursor,'100');
});

test('late classification of an older message never replaces a newer verified reply',()=>{
 const f=fixture(),old=incoming('a');old.data.reply.received_at='2026-11-01T10:00:00.000Z';applyLocalInquiry(f.app,f.state,old,'provider',0,{shared:true});
 const newer=incoming('b');newer.data.reply=fixtureReply('b','thread-new','a@example.org','Newer synthetic incoming source.');newer.data.reply.received_at=at;
 applyLocalInquiry(f.app,f.state,newer,'provider',f.state.revision,{shared:true});const adopted=applyLocalInquiry(f.app,f.state,classify('newest-first','b'),'owner',f.state.revision,{shared:true});
 applyLocalInquiry(f.app,f.state,classify('older-later','a'),'owner',f.state.revision,{shared:true});assert.equal(f.state.prospects[adopted.receipt.project_id].reply.source_id,'b');assert.equal(f.state.prospects[adopted.receipt.project_id].reply.at,at);
});


test('a missing sender on malformed mail does not match every record lacking an email',()=>{
 const f=fixture();f.state.prospects.unrelated={id:'unrelated',contact:{phone:'synthetic'},cold_paused:false};start(f);apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[{id:'a',threadId:'thread-a'}]});const m=message();m.payload.headers=m.payload.headers.filter(h=>h.name!=='From');apply(f,'message',{id:'a',threadId:'thread-a'},m);assert.equal(f.state.prospects.unrelated.cold_paused,false);assert.deepEqual(f.state.mailbox_sync.held_sources.a.matched_projects,[]);
});


test('a changed sender in a registered outreach thread stays ambiguous without consuming ownership rotation',()=>{
 const f=fixture();f.state.prospects.existing={id:'existing',name:'Synthetic existing client',contact:{email:'prior@example.org'},follow_up_owner:'friend',cold_paused:false};f.state.outreach_delivery={intents:{sent:{project_id:'existing',receipt:{thread_id:'thread-a'}}}};start(f);
 apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[{id:'a',threadId:'thread-a'}]});apply(f,'message',{id:'a',threadId:'thread-a'},message());assert.equal(f.state.prospects.existing.cold_paused,true);
 const result=applyLocalInquiry(f.app,f.state,classify('classify-changed-sender','a'),'owner',f.state.revision,{shared:true});assert.equal(result.receipt.status,'Identity review');assert.deepEqual(result.receipt.candidates,['existing']);assert.equal(result.receipt.assigned_to,null);assert.equal(Object.keys(f.state.prospects).length,1);assert.equal(f.state.inquiry_intake.next_owner,'owner');
});

test('ambiguous headers retain an original-review hold and sender pause without blocking the next message',()=>{
 for(const header of ['List-ID','Subject']){const f=fixture();f.state.prospects.existing={id:'existing',name:'Synthetic existing',contact:{email:'a@example.org'},cold_paused:false};start(f);apply(f,'list',{after:f.app.config.mailbox.after,page:null},{messages:[{id:'a',threadId:'thread-a'},{id:'b',threadId:'thread-b'}]});const m=message();if(header==='List-ID')m.payload.headers.push({name:header,value:'synthetic-list'});m.payload.headers.push({name:header,value:'duplicate'});
 apply(f,'message',{id:'a',threadId:'thread-a'},m);assert.equal(f.state.prospects.existing.cold_paused,true);assert.deepEqual(f.state.mailbox_sync.held_sources.a.matched_projects,['existing']);assert.deepEqual(f.state.mailbox_sync.pending,[{id:'b',threadId:'thread-b'}]);apply(f,'message',{id:'b',threadId:'thread-b'},message('b'));assert.equal(f.state.inquiry_intake.sources.b.classification,'uncertain');}
});
