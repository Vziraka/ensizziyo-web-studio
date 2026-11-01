import assert from 'node:assert/strict';
import {fixture as mailFixture,signed} from './shared-operations-exact-mail.mjs';
import {hash} from '../lifecycle.mjs';
import {PDFDocument} from 'pdf-lib';
export {signed};
export async function fixture(t,{actor='owner',authorize=true,policyChange,...options}={}){
 const original=await PDFDocument.create();original.setCreationDate(new Date('2026-10-24T21:00:00Z'));original.setModificationDate(new Date('2026-10-24T21:00:00Z'));original.addPage([360,240]).drawText('FICTIONAL retained original - offline source proof',{x:18,y:180,size:10});
 const f=await mailFixture(t,{originalBytes:Buffer.from(await original.save()),...options,actor,pdf:true,stableProjectReply:true,authorize,policyChange(p,state){
  // Trusted historical incoming import, not a claimed signed tick or live mailbox proof.
  const g={enabled:true,capability:'shared-registered-incoming-v1',run_id:state.run_id,grant_id:p.grant_id,account_email:p.account_email},registered=p.routes;
  state.operations.gmail_incoming={binding:hash({g,registered}),routes:structuredClone(registered),seen:{},phase:'history',index:registered.length,status:'Caught up',cursor:'100',page:null,pages:[],checked_at:'2026-10-26T13:06:00.000Z'};
  policyChange?.(p,state);
 }});
 f.env.EVZ_OPERATIONS_GOOGLE_EXACT_MAIL=f.env.EVZ_OPERATIONS_DESK_ENABLED;
 const draft=(await f.app.snapshot()).prospects['shared-proof'].project_email_drafts.at(-1),selector={project_id:'shared-proof',kind:'project',draft_id:draft.id},wire=f.mailWire;
 const review=()=>f.call('package',selector),approve=async(id='signed-exact-pdf')=>{const pkg=await review();return f.call('approve',{...selector,revision:(await f.app.snapshot()).revision,event_id:id,package_sha256:pkg.sha256,approved:true,facts_checked:true});};
 wire.threadId='pdf-thread';wire.root=null;wire.reply=null;wire.historyId='110';wire.incomingHook=null;
 const oldHook=wire.hook;wire.hook=async(path,body,init)=>{
  const override=await oldHook?.(path,body,init);if(override)return override;
  if(path==='messages/send'){
   assert.deepEqual(Object.keys(body),['raw']);assert.equal(wire.sent.length,0);const q=(await f.app.snapshot()).operations.requests[f.app.config.internal_dispatch.incoming_pdf.permission.action_id+'-intent'];assert.ok(q.dispatch_claim&&q.incoming_pdf.anchor);assert.equal(q.status,'Uncertain');
   const text=Buffer.from(body.raw,'base64url').toString('utf8');assert.doesNotMatch(text,/\r\n(?:In-Reply-To|References):/);
   const h=(name,value)=>({name,value}),p=(await f.app.snapshot()).actions[f.app.config.internal_dispatch.incoming_pdf.permission.action_id].payload.package;
   wire.root={id:'fictional-exact-sent',threadId:wire.threadId,historyId:'104',labelIds:['SENT'],internalDate:String(+f.now()),payload:{mimeType:'text/plain',headers:[h('From',p.from),h('To',p.to),h('Subject',p.subject),h('Message-ID',q.rfc_message_id)],body:{size:0,data:''}}};
   const sent={id:wire.root.id,threadId:wire.threadId,historyId:'104',labelIds:['SENT'],raw:body.raw};wire.sent.push(sent);if(wire.lost)throw Error('Injected fictional lost POST response');return Response.json(sent);
  }
  if(path==='messages/fictional-exact-sent?format=raw'){await wire.bodyHook?.(path);return Response.json(wire.rawChange?wire.rawChange(structuredClone(wire.sent[0])):wire.sent[0]);}
 };
 const incomingFetch=f.wire.fetcher;f.wire.incomingCalls=[];f.wire.fetcher=async(url,init)=>{
  f.wire.incomingCalls.push({url:String(url),method:init.method,body_sha256:hash(init.body??null)});
  const u=new URL(url),path=u.pathname.slice('/gmail/v1/users/me/'.length);const response=await wire.incomingHook?.(path,u,init);if(response)return response;
  if(path==='profile')return Response.json({emailAddress:f.app.config.internal_dispatch.account_email,historyId:wire.historyId});
  if(path==='threads/pdf-thread')return Response.json({id:wire.threadId,messages:[wire.root,...(wire.reply?[wire.reply]:[])]});
  return incomingFetch(url,init);
 };
 const incomingReply=(text='Thanks, can we discuss this design?')=>{const h=(name,value)=>({name,value});wire.reply={id:'immediate-pdf-reply',threadId:wire.threadId,historyId:'106',labelIds:['INBOX'],internalDate:String(Number(wire.root.internalDate)+1000),payload:{mimeType:'text/plain',headers:[h('From',draft.to),h('To',draft.from),h('Subject','Re: '+draft.subject),h('Message-ID','<immediate-pdf-reply@example.invalid>'),h('In-Reply-To',wire.root.payload.headers.find(h=>h.name==='Message-ID').value),h('Authentication-Results','mx.google.com; dmarc=pass header.from=example.invalid')],body:{size:Buffer.byteLength(text),data:Buffer.from(text).toString('base64url')}}};return wire.reply;};
 async function tick(){f.advance(60000);const clock=await f.clock();assert.equal(clock.status,202,await clock.text());return (await f.run()).json();}
 return {...f,draft,selector,review,approve,incomingReply,tick,fixture_mutations:[...f.fixture_mutations,'Trusted compatible historical incoming cursor100 import; not a signed or real tick.','Trusted parallel Ready refinement snapshot imported alongside the actually signed completed PDF; creation of parallel work is not proved.','Actual Node authoring with substituted technical PNG review; no fresh visual acceptance.','Internal tokens use an injected fictional refresh at each new tick, not live OAuth.']};
}
