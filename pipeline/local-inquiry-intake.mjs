import {check,hash,pauseCold} from './lifecycle.mjs';
import {validReplySource} from './reply-content.mjs';

// Classification is a reviewed input. Shared source adoption has a separate provider boundary.
export const localInquiryEvents=['inquiry_recorded','inquiry_classification_reviewed','inquiry_identity_resolved'];
const normalize=value=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const roles=['owner','friend'];
const key=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const exact=(value,keys)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.split(',').sort().join(','),'Use exact inquiry fields');
export function applyLocalInquiry(app,state,event,actor,revision,{shared=false}={}){
  check(!app.store&&(shared?app.config.mode==='production'&&app.config.shared_capability==='shared-mailbox-review-v1':app.config.mode==='controlled'&&roles.includes(actor)),shared?'Inquiry intake requires its exact shared review authority':'Inquiry intake is local fictional operator review only');
  if(shared)check(event.type==='inquiry_recorded'?actor==='provider':roles.includes(actor),'Shared adoption requires the provider; classification requires a signed operator');
  check(event.prospect_id==='inquiry-intake','Use the local inquiry intake record');
  const fingerprint=hash({event,actor}),oldEvent=state.events[event.id];
  if(oldEvent){check(oldEvent.fingerprint===fingerprint,'Event ID conflicts with saved evidence');return {duplicate:true,revision:state.revision};}
  let data=event.data;
  const intake=state.inquiry_intake??{next_owner:'owner',sources:{}};
  let receipt,classificationReview;
  if(event.type==='inquiry_classification_reviewed'){
    exact(data,'source_id,classification,reason');check(key(data.source_id)&&['inquiry','newsletter','spam','automatic_reply'].includes(data.classification)&&typeof data.reason==='string'&&data.reason.trim().length>0&&data.reason.length<=500,'Record a reviewed classification and reason');
    const prior=intake.sources[data.source_id];check(prior?.classification==='uncertain'&&prior.status==='Identity review','Only an unresolved uncertain classification can be reviewed');
    classificationReview={by:actor,at:event.at,event_id:event.id,reason:data.reason,original_classification:'uncertain'};
    data={company_name:prior.company_name,classification:data.classification,reply:prior.source};
  }
  if(event.type==='inquiry_recorded'||classificationReview){
    exact(data,'company_name,classification,reply');
    check(typeof data.company_name==='string'&&data.company_name.trim()&&data.company_name.length<=250&&(shared||/^STUDIO TEST\s/i.test(data.company_name)),'Use a bounded source name; local rehearsal requires an explicitly fictional company');
    check(['inquiry','uncertain','newsletter','spam','automatic_reply'].includes(data.classification),'Review the inquiry classification explicitly');
    check(validReplySource(data.reply)&&key(data.reply.source_id)&&key(data.reply.thread_id)&&(shared||data.reply.content.from.endsWith('@example.invalid'))&&data.reply.kind==='reply','Retain a complete source; local rehearsal requires an .invalid sender');
    if(shared)check(typeof data.reply.received_at==='string'&&Number.isFinite(Date.parse(data.reply.received_at))&&Date.parse(data.reply.received_at)<=+app.now()+60000,'Retain actual provider receipt time');
    const prior=intake.sources[data.reply.source_id],sourceFingerprint=classificationReview?prior.source_sha256:hash(data);
    if(prior&&!classificationReview){check(prior.source_sha256===sourceFingerprint,'Incoming source was replayed with different content');return {duplicate:true,revision:state.revision,receipt:prior};}
    receipt={source_id:data.reply.source_id,source_sha256:sourceFingerprint,company_name:data.company_name,classification:data.classification,source:structuredClone(data.reply),actor,at:event.at,event_id:event.id,status:'Excluded',project_id:null,assigned_to:null,candidates:[]};
    if(classificationReview){receipt.classification_review=classificationReview;receipt.original_event_id=prior.event_id;}
    if(data.classification==='uncertain')receipt.status='Identity review';
    if(data.classification==='inquiry'){
      const email=data.reply.content.from.toLowerCase(),thread=data.reply.thread_id;
      const matches=Object.values(state.prospects).filter(r=>r.contact?.email?.toLowerCase()===email||r.reply?.thread_id===thread||r.conversation_histories?.[thread]||normalize(r.name)===normalize(data.company_name)||Object.values(intake.sources).some(s=>s.project_id===r.id&&s.source.thread_id===thread));
      receipt.candidates=matches.map(r=>r.id);
      if(matches.length>1||matches.length===1&&(matches[0].origin==='workspace'||matches[0].contact?.email?.toLowerCase()!==email))receipt.status='Identity review';
      else if(matches.length===1){receipt.project_id=matches[0].id;receipt.assigned_to=matches[0].follow_up_owner??null;receipt.status=matches[0].restriction?'Restricted':receipt.assigned_to?'Matched existing client':'Ownership review';}
      else{receipt.project_id='inquiry-'+hash(email).slice(0,24);receipt.assigned_to=intake.next_owner;receipt.status='Assigned new inquiry';}
    }
  }else{
    exact(data,'source_id,project_id');
    check(key(data.source_id)&&key(data.project_id),'Use stable inquiry and client IDs');
    const prior=intake.sources[data.source_id],r=state.prospects[data.project_id];
    check(prior?.status==='Identity review'&&prior.classification==='inquiry'&&r&&(shared||r.controlled)&&r.origin!=='workspace'&&r.contact?.email?.toLowerCase()===prior.source.content.from.toLowerCase(),'Choose an existing client with the exact source sender; uncertain classification remains held');
    receipt={...prior,project_id:r.id,assigned_to:r.follow_up_owner??null,status:r.restriction?'Restricted':r.follow_up_owner?'Matched existing client':'Ownership review',resolved_by:actor,resolved_at:event.at,resolution_event:event.id};
  }
  check(revision===undefined||revision===state.revision,'Record changed; refresh before reviewing inquiry');
  check((intake.sources[receipt.source_id]||Object.keys(intake.sources).length<1000)&&Object.keys(state.events).length<19998,'Inquiry retention limit reached');
  // Source identity can stop outreach before classification or client assignment is resolved.
  // A matching business name alone cannot associate a reply with an existing conversation.
  receipt.paused_projects=Object.values(state.prospects).filter(r=>r.contact?.email?.toLowerCase()===receipt.source.content.from.toLowerCase()||r.reply?.thread_id===receipt.source.thread_id||r.conversation_histories?.[receipt.source.thread_id]||Object.values(intake.sources).some(s=>s.project_id===r.id&&s.source.thread_id===receipt.source.thread_id)).map(r=>r.id);
  for(const id of receipt.paused_projects)pauseCold(state,state.prospects[id],event.id,'Incoming reply awaits review');
  if(receipt.status==='Assigned new inquiry'){
    check(!state.prospects[receipt.project_id],'Existing inquiry identity must be matched before rotation');
    state.prospects[receipt.project_id]={id:receipt.project_id,company_id:receipt.project_id,name:data.company_name,category:'Inbound inquiry',origin:'inquiry',idea:'Review the incoming client request; no researched sales opening is implied.',controlled:!shared,stage:'Reply review',cold_paused:true,follow_up_owner:receipt.assigned_to,contact:{email:data.reply.content.from,verified:true,source:shared?'gmail:reviewed incoming source':'fixture:reviewed incoming source'},attempts:[],calls:{},transcripts:{},proposals:{},approved_calls:{},payments:[],invoices:[],materials:[],tasks:[],revisions:[],tickets:[]};
    intake.next_owner=intake.next_owner==='owner'?'friend':'owner';
  }
  state.inquiry_intake=intake;intake.sources[receipt.source_id]=receipt;
  if(receipt.project_id){
    const nested={id:'incoming-'+hash(receipt.source_id).slice(0,32),prospect_id:receipt.project_id,type:'reply_received',at:shared?receipt.source.received_at:event.at,data:receipt.source};
    // Reuse current reply-stop, stale-draft, history and notification behavior in the SAME commit.
    app.reduceEvent(state,nested,{actor:shared?'provider':'controlled-fixture',expectedRevision:state.revision,manualRecording:shared});
  }
  state.events[event.id]={...event,actor,fingerprint};state.revision++;state.updated_at=app.now().toISOString();
  return {revision:state.revision,receipt};
}
