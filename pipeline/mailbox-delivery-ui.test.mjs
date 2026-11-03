import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real panel renderer against a small DOM substitute, without a live desk.
const source=await readFile(new URL('./lifecycle-ui/app.js',import.meta.url),'utf8');
const start=source.indexOf('function mailboxDeliveryPanel('),end=source.indexOf('\nfunction replyForms(',start);
assert(start>=0&&end>start,'Delivery panel source must be identifiable');
const panelSource=source.slice(start,end);
const node=(tag,text)=>({tag,text:text??'',children:[],dataset:{},classList:{add(){}},append(...items){this.children.push(...items);}});
const textOf=value=>[value.text,...value.children.map(textOf)].join(' ');

function render(intent,operator='owner',freshApproval=false){
 const record={id:'fictional-project',follow_up_owner:'owner'};
 const approval={id:'fictional-approval',epoch:1,package:{project_id:intent.package?.project_id??record.id,kind:intent.package?.kind??'reply',owner:'owner'}};
 const state={current_operator:operator,shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Ready',runtime_enabled:true},mailbox_delivery:{epoch:freshApproval?2:1,approvals:{one:approval,...freshApproval?{two:{id:'new-approval',epoch:2,package:{project_id:record.id,kind:'reply',owner:'owner'}}}:{}},intents:{one:{id:'fictional-intent',approval_id:approval.id,package:{owner:'owner',project_id:record.id},receipt:null,hold:null,...structuredClone(intent)}}}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const result=node('section');result.append(el('h2',title));return result;},button=(text,handler)=>({...node('button',text),handler});
 const renderPanel=vm.runInNewContext(`(${panelSource})`,{state,el,panel,button});
 const root=node('main');renderPanel(record,root);return textOf(root);
}

test('unclaimed reserved and held intents keep their no-resend guidance after a fresh render',()=>{
 for(const status of ['Reserved','Held'])for(const operator of ['owner','friend'])for(let reload=0;reload<2;reload++){
  const text=render({status,claimed_at:null},operator);assert.match(text,/no claim was recorded/i);assert.match(text,/another writer may still claim/i);assert.match(text,/remains unresolved/i);assert.match(text,/charge is retained/i);assert.match(text,/do not resend/i);assert.match(text,/readback requires a recorded claim/i);
  assert.doesNotMatch(text,/Read original sender receipt|Send this approved reply/);
 }
});

test('a legacy restore note is qualified for display without modifying stored history',()=>{
 const intent={status:'Held',claimed_at:null,hold:'Backup restored; original reservation cannot dispatch'},text=render(intent);
 assert.match(text,/Restored copy cannot dispatch; reconcile other writers/i);assert.doesNotMatch(text,/original reservation cannot dispatch/i);assert.equal(intent.hold,'Backup restored; original reservation cannot dispatch');
});

test('a claimed intent offers original readback only to its owner and does not show the unclaimed notice',()=>{
 const intent={status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'};
 assert.match(render(intent,'owner'),/Read original sender receipt/);assert.doesNotMatch(render(intent,'owner'),/no claim was recorded/i);
 assert.doesNotMatch(render(intent,'friend'),/Read original sender receipt|no claim was recorded/i);
});

test('a fresh approval cannot expose a replacement send while an earlier project intent is unresolved',()=>{
 for(const intent of [{status:'Reserved',claimed_at:null},{status:'Held',claimed_at:null},{status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'},{status:'Held',claimed_at:null,package:{owner:'owner',project_id:'fictional-project',kind:'outreach'}}]){
  const text=render(intent,'owner',true);assert.match(text,/earlier delivery on this project remains unresolved/i);assert.doesNotMatch(text,/Review exact send package|Send this approved reply/);
 }
});

test('an unresolved intent for another project does not hide a fresh approval',()=>{
 const text=render({status:'Held',claimed_at:null,package:{owner:'owner',project_id:'another-project',kind:'reply'}},'owner',true);
 assert.match(text,/Review exact send package/);assert.match(text,/Send this approved reply/);assert.doesNotMatch(text,/earlier delivery on this project remains unresolved/i);
});

test('a verified earlier delivery does not suppress review of a separately approved new message',()=>{
 const text=render({status:'Verified',claimed_at:'2026-11-03T12:00:00.000Z',receipt:{sent_at:'2026-11-03T12:00:00.000Z',message_id:'fictional-sent'}},'owner',true);
 assert.match(text,/Review exact send package/);assert.match(text,/Send this approved reply/);assert.doesNotMatch(text,/earlier delivery on this project remains unresolved/i);
});

test('a paused outreach view retains the original intent warning or readback after reload',()=>{
 const outreachStart=source.indexOf('function outreachReviewPanel('),outreachEnd=source.indexOf('\nfunction link(',outreachStart);assert(outreachStart>=0&&outreachEnd>outreachStart);
 const record={id:'fictional-project',name:'Fictional',follow_up_owner:'owner',contact:{verified:false}},draft={name:'Fictional',project_id:record.id,owner:'owner',status:'Paused',kind:'new-business',lane:'email-first',from:'hello@example.invalid',to:'recipient@example.invalid',subject:'Test',body:'Fictional',timezone:'UTC',schedule:null};
 for(const intent of [{status:'Reserved',claimed_at:null},{status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'},{status:'Verified',claimed_at:'2026-11-03T12:00:00.000Z',receipt:{sent_at:'2026-11-03T12:00:00.000Z',message_id:'fictional-sent'}}])for(let reload=0;reload<2;reload++){
  const approval={id:'outreach-approval',epoch:1,package:{project_id:record.id,kind:'outreach',owner:'owner'}},state={current_operator:'owner',prospects:{[record.id]:record},shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Paused',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{one:{id:'outreach-intent',approval_id:approval.id,package:approval.package,receipt:null,hold:null,...intent}}},outreach_review:{execution:'Held',date:'2026-11-03',scheduled_new:0,approval_shortfall:0,sent_new:0,shortfall:0,items:[draft],cadence:[],saved_summaries:[]}};
  const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),document={createElement:tag=>node(tag),createTextNode:text=>node('#text',text)},eventForm=()=>node('form'),link=text=>node('a',text);
  const context={state,el,panel,button,document,eventForm,link};const renderOutreach=vm.runInNewContext(`${panelSource}\n(${source.slice(outreachStart,outreachEnd)})`,context),text=textOf(renderOutreach());
  assert.doesNotMatch(text,/Review exact send package|Send in its approved time slot/);
  if(intent.status==='Verified')assert.match(text,/Sender verified/);else{assert.match(text,/earlier delivery on this project remains unresolved/i);if(intent.claimed_at)assert.match(text,/Read original sender receipt/);else assert.match(text,/no claim was recorded/i);}
 }
});

test('outreach history remains visible when its current draft or business record is absent',()=>{
 const outreachStart=source.indexOf('function outreachReviewPanel('),outreachEnd=source.indexOf('\nfunction link(',outreachStart);assert(outreachStart>=0&&outreachEnd>outreachStart);
 for(const hasRecord of [true,false])for(const hasDraft of [true,false]){
  const record={id:'fictional-project',name:'Fictional',follow_up_owner:'owner',contact:{verified:false}},approval={id:'outreach-approval',epoch:1,package:{project_id:record.id,kind:'outreach',owner:'owner'}},state={current_operator:'owner',prospects:hasRecord?{[record.id]:record}:{},shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Paused',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{one:{id:'outreach-intent',approval_id:approval.id,package:approval.package,receipt:null,hold:null,status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'}}},outreach_review:{execution:'Held',date:'2026-11-03',scheduled_new:0,approval_shortfall:0,sent_new:0,shortfall:0,items:[],cadence:[],saved_summaries:[]}};
  if(hasDraft)state.outreach_review.items=[{name:'Fictional',project_id:record.id,owner:'owner',status:'Scheduled',kind:'new-business',lane:'email-first',from:'hello@example.invalid',to:'recipient@example.invalid',subject:'Test',body:'Fictional',timezone:'UTC',eligible:true,schedule:{at:'2026-11-03T12:00:00.000Z',execution:'Held'}}];
  const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),document={createElement:tag=>node(tag),createTextNode:text=>node('#text',text)},eventForm=()=>node('form'),link=text=>node('a',text),context={state,el,panel,button,document,eventForm,link};
  const renderOutreach=vm.runInNewContext(`${panelSource}\n(${source.slice(outreachStart,outreachEnd)})`,context),text=textOf(renderOutreach());
  assert.match(text,/Read original sender receipt/);assert.doesNotMatch(text,/Review exact send package|Send in its approved time slot/);
 }
});

test('retained requested-information intents remain visible when the current draft or view is absent',()=>{
 const start=source.indexOf('function requestedInformationPanel('),end=source.indexOf('\nfunction mailboxWorkPanel(',start);assert(start>=0&&end>start);
 for(const view of [undefined,{calls:[],draft:null},{calls:[{id:'fictional-call'}],draft:null,source:null}])for(const intent of [{status:'Reserved',claimed_at:null},{status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'},{status:'Verified',claimed_at:'2026-11-03T12:00:00.000Z',receipt:{sent_at:'2026-11-03T12:00:00.000Z',message_id:'fictional-sent'}}]){
  const record={id:'fictional-project',follow_up_owner:'owner',requested_information_view:view},approval={id:'request-approval',epoch:1,package:{project_id:record.id,kind:'requested-information',owner:'owner'}},state={current_operator:'owner',shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Paused',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{one:{id:'request-intent',approval_id:approval.id,package:approval.package,receipt:null,hold:null,...intent}}}};
  const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),inputField=()=>node('input'),root=node('main'),context={state,el,panel,button,inputField};
  const renderRequested=vm.runInNewContext(`${panelSource}\n(${source.slice(start,end)})`,context);renderRequested(record,root);const text=textOf(root);
  assert.doesNotMatch(text,/Review exact send package|Send this approved requested information/);
  if(intent.status==='Verified')assert.match(text,/Sender verified/);else{assert.match(text,/earlier delivery on this project remains unresolved/i);if(intent.claimed_at)assert.match(text,/Read original sender receipt/);else assert.match(text,/no claim was recorded/i);}
 }
});

test('only current, approved, unrestricted requested information offers its separate send review',()=>{
 const start=source.indexOf('function requestedInformationPanel('),end=source.indexOf('\nfunction mailboxWorkPanel(',start),record={id:'fictional-project',follow_up_owner:'owner',requested_information_view:{calls:[],source:null,current:true,draft:{status:'Approved',content:{to:'recipient@example.invalid',subject:'Fictional',body:'Fictional',signature:'Team',attachments:[]}}}},approval={id:'request-approval',epoch:1,package:{project_id:record.id,kind:'requested-information',owner:'owner'}},state={current_operator:'owner',shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Ready',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{}}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),inputField=()=>node('input'),root=node('main'),context={state,el,panel,button,inputField};
 const renderRequested=vm.runInNewContext(`${panelSource}\n(${source.slice(start,end)})`,context);renderRequested(record,root);const text=textOf(root);
 assert.match(text,/Review exact send package/);assert.match(text,/Send this approved requested information/);
 for(const change of [{restriction:'do_not_contact'},{requested_information_view:{...record.requested_information_view,current:false}},{requested_information_view:{...record.requested_information_view,draft:{...record.requested_information_view.draft,status:'Draft'}}}]){
  const target={...record,...change},root=node('main');renderRequested(target,root);const text=textOf(root);assert.doesNotMatch(text,/Review exact send package|Send this approved requested information/);
 }
});

test('a stopped conversation retains access to its original reply readback',()=>{
 const start=source.indexOf('function replyForms('),end=source.indexOf('\nfunction exactReplyMailPanel(',start);assert(start>=0&&end>start);
 const record={id:'fictional-project',stage:'Stopped',reply:null,follow_up_owner:'friend'},approval={id:'reply-approval',epoch:1,package:{project_id:record.id,kind:'reply',owner:'owner'}},state={current_operator:'owner',shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Paused',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{one:{id:'reply-intent',approval_id:approval.id,package:approval.package,receipt:null,hold:null,status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'}}}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),root=node('main'),context={state,el,panel,button};
 const renderReply=vm.runInNewContext(`${panelSource}\n(${source.slice(start,end)})`,context);renderReply(record,root);const text=textOf(root);
 assert.match(text,/earlier delivery on this project remains unresolved/i);assert.match(text,/Read original sender receipt/);assert.doesNotMatch(text,/Send this approved reply/);
});

test('a stopped conversation displays verified history without exposing new send controls',()=>{
 const start=source.indexOf('function replyForms('),end=source.indexOf('\nfunction exactReplyMailPanel(',start),record={id:'fictional-project',stage:'Stopped',reply:null,follow_up_owner:'owner'},approval={id:'reply-approval',epoch:1,package:{project_id:record.id,kind:'reply',owner:'owner'}},state={current_operator:'owner',shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Ready',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{one:{id:'reply-intent',approval_id:approval.id,package:approval.package,receipt:{sent_at:'2026-11-03T12:00:00.000Z',message_id:'fictional-sent'},hold:null,status:'Verified',claimed_at:'2026-11-03T12:00:00.000Z'}}}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),root=node('main'),context={state,el,panel,button};
 const renderReply=vm.runInNewContext(`${panelSource}\n(${source.slice(start,end)})`,context);renderReply(record,root);const text=textOf(root);
 assert.match(text,/Sender verified/);assert.doesNotMatch(text,/Review exact send package|Send this approved reply/);
});

test('the real Reviews selection reaches a stopped record with retained reply history',()=>{
 const helperStart=source.indexOf('function recordsForView('),helperEnd=source.indexOf('\nfunction render()',helperStart),detailStart=source.indexOf('function detail('),detailEnd=source.indexOf('\nfunction recordsForView(',detailStart),replyStart=source.indexOf('function replyForms('),replyEnd=source.indexOf('\nfunction exactReplyMailPanel(',replyStart),routeStart=source.indexOf("  const grid = el('div', undefined, 'grid'), records = recordsForView("),routeEnd=source.indexOf('\n}',routeStart);
 assert(helperStart>=0&&helperEnd>helperStart&&detailStart>=0&&detailEnd>detailStart&&replyStart>=0&&replyEnd>replyStart&&routeStart>=0&&routeEnd>routeStart);
 const record={id:'fictional-project',name:'Fictional',stage:'Stopped',reply:null,follow_up_owner:'friend'},unrelated={id:'unrelated',name:'Other',stage:'Stopped'},approval={id:'reply-approval',epoch:1,package:{project_id:record.id,kind:'reply',owner:'owner'}},state={current_operator:'owner',controls:{mode:'production'},prospects:{other:unrelated,[record.id]:record},shared_workspace:{capability:'shared-operations-desk-v1',allowed_edits:[]},mailbox_delivery_status:{status:'Paused',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{one:{id:'reply-intent',approval_id:approval.id,package:approval.package,receipt:null,hold:null,status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'}}}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),content=node('main'),summary=r=>node('button',r.name),eventForm=()=>node('form'),requestedInformationPanel=()=>{},context={state,view:'reviews',lane:'all',selected:record.id,content,el,panel,button,summary,eventForm,requestedInformationPanel};
 const result=vm.runInNewContext(`${panelSource}\n${source.slice(replyStart,replyEnd)}\n${source.slice(detailStart,detailEnd)}\n${source.slice(helperStart,helperEnd)}\n(()=>{${source.slice(routeStart,routeEnd)};return selected;})()`,context),text=textOf(content);
 assert.equal(result,record.id);assert.match(text,/Reviews and retained reply history/);assert.match(text,/Read original sender receipt/);assert.doesNotMatch(text,/Other|Review exact send package|Send this approved reply/);
});

test('stopped or ineligible outreach retains history without presenting send controls',()=>{
 const start=source.indexOf('function outreachReviewPanel('),end=source.indexOf('\nfunction link(',start),record={id:'fictional-project',name:'Fictional',follow_up_owner:'owner',contact:{verified:false}},draft={name:'Fictional',project_id:record.id,owner:'owner',status:'Scheduled',kind:'new-business',lane:'email-first',from:'hello@example.invalid',to:'recipient@example.invalid',subject:'Test',body:'Fictional',timezone:'UTC',schedule:{at:'2026-11-03T12:00:00.000Z',execution:'Held'}},approval={id:'outreach-approval',epoch:1,package:{project_id:record.id,kind:'outreach',owner:'owner'}},state={current_operator:'owner',prospects:{[record.id]:record},shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Ready',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{}},outreach_review:{execution:'Held',date:'2026-11-03',scheduled_new:0,approval_shortfall:0,sent_new:0,shortfall:0,items:[draft],cadence:[],saved_summaries:[]}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),document={createElement:tag=>node(tag),createTextNode:text=>node('#text',text)},eventForm=()=>node('form'),link=text=>node('a',text),renderOutreach=vm.runInNewContext(`${panelSource}\n(${source.slice(start,end)})`,{state,el,panel,button,document,eventForm,link});
 draft.eligible=true;let text=textOf(renderOutreach());assert.match(text,/Review exact send package/);assert.match(text,/Send in its approved time slot/);
 record.stage='Stopped';record.restriction='do_not_contact';draft.eligible=false;text=textOf(renderOutreach());assert.doesNotMatch(text,/Review exact send package|Send in its approved time slot/);
 state.mailbox_delivery.intents.one={id:'outreach-intent',approval_id:approval.id,package:approval.package,receipt:null,hold:null,status:'Uncertain',claimed_at:'2026-11-03T12:00:00.000Z'};text=textOf(renderOutreach());assert.match(text,/Read original sender receipt/);assert.doesNotMatch(text,/Review exact send package|Send in its approved time slot/);
});

test('held or stale reply content is history-only even if an old approval remains',()=>{
 const start=source.indexOf('function replyForms('),end=source.indexOf('\nfunction exactReplyMailPanel(',start),record={id:'fictional-project',stage:'Reply review',follow_up_owner:'owner',reply:{content:null,thread_id:'thread'},reply_draft:{status:'Approved; sending held',current:true,content:{attachments:[]}}},approval={id:'reply-approval',epoch:1,package:{project_id:record.id,kind:'reply',owner:'owner'}},state={current_operator:'owner',shared_workspace:{capability:'shared-operations-desk-v1'},mailbox_delivery_status:{status:'Ready',runtime_enabled:true},mailbox_delivery:{epoch:1,approvals:{one:approval},intents:{}}};
 const el=(tag,text)=>node(tag,text),panel=title=>{const n=node('section');n.append(el('h2',title));return n;},button=(text,handler)=>({...node('button',text),handler}),eventForm=()=>node('form'),mailboxWorkPanel=()=>{},renderSavedReplyBundle=()=>{},context={state,el,panel,button,eventForm,mailboxWorkPanel,renderSavedReplyBundle},renderReply=vm.runInNewContext(`${panelSource}\n(${source.slice(start,end)})`,context);
 let root=node('main');renderReply(record,root);let text=textOf(root);assert.match(text,/Review exact send package/);assert.match(text,/Send this approved reply/);
 for(const change of [{stage:'Hold'},{restriction:'do_not_contact'},{reply_draft:{...record.reply_draft,current:false}},{reply_draft:{...record.reply_draft,status:'Draft'}}]){root=node('main');renderReply({...record,...change},root);text=textOf(root);assert.doesNotMatch(text,/Review exact send package|Send this approved reply/);}
});
