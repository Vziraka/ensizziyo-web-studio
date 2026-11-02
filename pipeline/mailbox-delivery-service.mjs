import {check,hash} from './lifecycle.mjs';
import {mailboxDeliveryCapability,isMailboxDeliveryCapability,mailboxDeliveryPackage,mailboxDeliveryIntentId,applyMailboxDeliveryTransition,assertMailboxDeliveryCurrent} from './mailbox-delivery.mjs';
import {mailboxMimeStore} from './mailbox-mime-store.mjs';
import {composeExactMail} from './google-hosted-transport.mjs';
import {blobProjectOriginalStore} from './shared-project-originals.mjs';

function boundary(app){check(app.store?.key==='workspace'&&isMailboxDeliveryCapability(app.store.manualBinding?.scope.capability),'Exact shared mailbox delivery store required');}
async function change(app,type,input,actor,config,deadline){
 boundary(app);const mailboxDelivery={type,actor,input,at:app.now().toISOString()};
 return app.change((s,c)=>applyMailboxDeliveryTransition(s,c,mailboxDelivery),{configFingerprint:hash(config),mailboxDelivery,...(deadline===undefined?{}:{mailboxDeliveryDeadline:deadline})});
}
export async function mailboxDeliveryCommand(app,type,input,actor){
 const deadline=+app.now()+25000;boundary(app);check(['owner','friend'].includes(actor)&&['package','approve','approve-batch','pause','allowance','rebind'].includes(type),'Signed delivery review command required');const {data}=await app.store.envelope();
 if(type==='package')return mailboxDeliveryPackage(data.state,data.config,input,actor,app.now().toISOString());
 return change(app,type,input,actor,data.config,deadline);
}
function budget(app,deadline){
 const end=Math.min(deadline??Infinity,+app.now()+25000);check(Number.isFinite(end)&&+app.now()<end,'Delivery invocation expired');
 const signal=AbortSignal.timeout(Math.max(1,end-+app.now()));return {end,signal,alive(){check(!signal.aborted&&+app.now()<end,'Delivery invocation expired; preserve original intent');}};
}
function requireActor(intent,actor){check(actor==='delivery'||['owner','friend'].includes(actor)&&intent.package.owner===actor,'Assigned operator must send or reconcile this exact message');}
export async function reconcileMailboxDelivery(app,id,{transport,actor,deadline}={}){
 boundary(app);const b=budget(app,deadline),{data}=await app.store.envelope(),i=data.state.mailbox_delivery?.intents[id];check(i?.claimed_at,'Original claimed intent required');requireActor(i,actor);check(data.state.mailbox_delivery.account===data.config.mailbox_delivery.account,'Original sender account read authority required');
 if(i.status==='Verified')return {id,status:'Verified',receipt:i.receipt};
 const guard=async()=>{b.alive();const current=await app.store.envelope();check(hash(current.data.config)===hash(data.config)&&hash(current.data.state.mailbox_delivery?.intents[id]?.mime)===hash(i.mime),'Original delivery authority changed');};
 const raw=await mailboxMimeStore(app.store.store).get({sha256:i.mime.sha256,bytes:i.mime.bytes},{guard}),expected={raw,message_id:i.mime.message_id,thread_id:i.package.thread_id};
 const observed=await transport.reconcileSent(expected,i.provider_message_id,{guard,signal:b.signal,sentTimestamp:true});
 const receipt=Object.fromEntries(['message_id','thread_id','rfc_message_id','mime_sha256','sent_at'].map(k=>[k,observed[k]]));
 const grant=transport.grant(),p=data.config.mailbox_delivery;check(grant?.account===p.account&&grant.grant_id===p.grant_id,'Original bound grant required for sender readback');
 await guard();await change(app,'verify',{id,receipt},'delivery',data.config,b.end);return {id,status:'Verified',receipt};
}
export async function dispatchMailboxDelivery(app,approvalId,{transport,actor,deadline}={}){
 boundary(app);const b=budget(app,deadline),{data}=await app.store.envelope(),c=data.config,a=data.state.mailbox_delivery?.approvals[approvalId];check(a,'Exact saved send approval required');requireActor(a,actor);
 const id=mailboxDeliveryIntentId(data.state,a),prior=data.state.mailbox_delivery.intents[id];if(prior)return {id,status:prior.status,readback_required:prior.status!=='Verified'};
 const fingerprint=hash(c),guard=async()=>{
  b.alive();const {data:current}=await app.store.envelope();check(hash(current.config)===fingerprint,'Delivery configuration changed');
  const i=current.state.mailbox_delivery?.intents[id];
  if(i)assertMailboxDeliveryCurrent(current.state,c,id,app.now().toISOString());
  else check(mailboxDeliveryPackage(current.state,c,{kind:a.package.kind,project_id:a.package.project_id},a.actor,app.now().toISOString()).sha256===a.package.sha256,'Approved package changed');
 };
 await guard();const identity=await transport.preflight({guard,signal:b.signal}),p=c.mailbox_delivery;
 check(identity?.account===p.account&&identity.from===p.from&&identity.grant_id===p.grant_id,'Exact sender grant differs');
 const source=(await app.snapshot()).prospects[a.package.project_id];
 await transport.freshSource({...a.package,...(a.package.kind==='reply'?{reply_source:source.reply}:a.package.kind==='requested-information'?{requested_source_at:source.calls[source.requested_information.requests[a.package.source.request_id].call_id].performed_at}:{})},{guard,signal:b.signal});await guard();
 const originals=blobProjectOriginalStore(app.store.store),attachments=[];
 for(const part of a.package.attachments){await guard();attachments.push(await originals.get({sha256:part.sha256,bytes:part.bytes}));await guard();}
 const reservedAt=app.now().toISOString(),wire=composeExactMail(a.package,id,reservedAt,attachments),mime=await mailboxMimeStore(app.store.store).put(wire.raw,{guard});
 await guard();const revision=(await app.snapshot()).revision;
 await change(app,'reserve',{revision,approval_id:approvalId,mime:{reference:'mailbox-mime/'+mime.sha256,...mime,message_id:wire.message_id}},'delivery',c,b.end);
 // No POST is legal before this permanent conditional claim. A second invocation never claims it again.
 await guard();await change(app,'claim',{id},'delivery',c,b.end);
 try{
  const sent=await transport.send(wire,{guard,signal:b.signal});
  await change(app,'ack',{id,message_id:sent.id,thread_id:sent.thread_id},'delivery',c,b.end);
  return await reconcileMailboxDelivery(app,id,{transport,actor,deadline:b.end});
 }catch{
  const saved=(await app.snapshot()).mailbox_delivery.intents[id];if(saved.status==='Verified')return {id,status:'Verified',receipt:saved.receipt};
  try{await change(app,'hold',{id,reason:'Delivery outcome requires original sender readback; no automatic resend'},'delivery',c);}catch{}
  return {id,status:'Uncertain',readback_required:true};
 }
}
