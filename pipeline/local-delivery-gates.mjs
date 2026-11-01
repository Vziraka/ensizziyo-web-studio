import {createHash} from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireThat = (ok, message) => { if (!ok) throw Error(message); };
const words = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 3000;
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','constructor','prototype'].includes(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const amount = v => Number.isSafeInteger(v) && v > 0 && v <= 100000000;
const paid = r => r.payments.reduce((n,p) => n + (p.settled_verified && p.simulated ? p.amount_cents : 0),0);
export const buildBasis = r => digest({quote:r.quote,agreement:r.agreement,payments:r.payments,onboarding:r.onboarding});
const exact = (r,d) => r.delivery && d.version === r.delivery.version && d.content_sha256 === r.delivery.content_sha256;
const holds = r => (r.delivery_holds??(r.delivery_hold?[r.delivery_hold]:[])).filter(h=>!h.resolved);
const approvalCurrent = r => r.acceptance?.version === r.delivery?.version && r.acceptance?.content_sha256 === r.delivery?.content_sha256 && r.acceptance?.quote_sha256 === digest(r.quote) && holds(r).length===0 && !r.acceptance.withdrawn_at;
const releaseBasis = r => digest({delivery:r.delivery,acceptance:r.acceptance,quote:r.quote,payments:r.payments,tasks:r.tasks});
const taskNames = {
 website:['Confirm content and customer flow','Build responsive implementation','Check accessibility, inquiry and errors','Prepare hosting and edit handover'],
 systems:['Map workflow and data ownership','Implement bounded integration','Test recovery and permissions','Prepare operating instructions'],
 ai:['Define allowed tasks and human review','Implement with usage limits','Evaluate errors and escalation','Document pause and upkeep'],
 marketing:['Confirm offer, audience and channel','Prepare approved creative and tracking','Check links, claims and consent','Document campaign limits and reporting']
};
export const localDeliveryEvents = ['build_started','client_approver_registered','client_preview_objected','client_preview_withdrawn','client_preview_objection_resolved','publication_authorized','publication_intent_prepared','publication_intent_cancelled','publication_dispatched','publication_uncertain','publication_receipt_recorded','maintenance_agreement_approved','maintenance_extra_approved','maintenance_work_reserved','maintenance_work_consumed'];

// These events record fictional, operator-attested evidence in the existing locked
// local transaction. They neither authenticate a client nor call any provider.
export function applyLocalDelivery(app,r,event,actor) {
 const d=event.data??{}, type=event.type;
 const intercepted = localDeliveryEvents.includes(type) || r?.controlled && (type==='onboarding_completed' || r.delivery_control_version===1 && ['delivery_submitted','acceptance_recorded','handover_completed','support_closed'].includes(type));
 if(!intercepted)return false;
 requireThat(!app.store && r?.controlled && app.config.mode==='controlled','Delivery gates are fictional local records only');
 requireThat(['owner','friend','controlled-fixture'].includes(actor),'Delivery decisions require an authorized operator');
 const evidence = () => {requireThat(words(d.reference),'Retain an attributable evidence reference');return {event_id:event.id,at:event.at,by:actor,reference:d.reference,attestation:'operator-attested fictional evidence; not verified client authentication'};};
 const currentRelease = () => {requireThat(approvalCurrent(r),'Current exact approval without objections or withdrawal required');requireThat(r.tasks.length>0 && r.tasks.every(t=>t.status==='Complete') && r.delivery.internal_checks===true,'Current internal checks required');requireThat(paid(r)===r.quote.price_cents,'Required settled project balance missing');requireThat(r.publication_authority?.basis===releaseBasis(r),'Release authority is missing or stale');};
 switch(type){
 case 'onboarding_completed':
  requireThat(r.stage==='Onboarding' && words(d.materials)&&words(d.access_plan)&&words(d.kickoff),'Paid onboarding requires materials, least-privilege access plan and kickoff');
  requireThat(!/password\s*[:=]|-----BEGIN .*PRIVATE KEY/i.test(JSON.stringify(d)),'Store credential references, never passwords or keys');
  requireThat(r.agreement?.quote_sha256===digest(r.quote)&&paid(r)>=r.quote.initial_payment_cents,'Current exact agreement and settled deposit required');
  r.onboarding={...d,at:event.at};r.delivery_control_version=1;r.stage='Ready to build';r.tasks=[];break;
 case 'build_started':
  requireThat(r.stage==='Ready to build'&&!r.build_authorization,'Separate Start build is available after onboarding');
  requireThat(d.basis_sha256===buildBasis(r)&&d.authorized===true,'Start build requires explicit current quote, payment and materials authorization');
  requireThat(r.agreement?.quote_sha256===digest(r.quote)&&paid(r)>=r.quote.initial_payment_cents,'Current exact agreement and settled deposit required');
  r.build_authorization={...evidence(),basis_sha256:d.basis_sha256};r.tasks=taskNames[r.discovery.service].map((title,i)=>({id:`task-${i+1}`,title,status:'Open'}));r.stage='Delivery';break;
 case 'delivery_submitted':
  requireThat(r.stage==='Delivery'&&r.build_authorization&&r.tasks.length>0&&r.tasks.every(t=>t.status==='Complete'),'Complete all scoped checks before client review');
  requireThat(id(d.version)&&sha(d.content_sha256)&&d.internal_checks===true,'Bind a unique deliverable version, content hash and internal checks');
  requireThat(!(r.deliveries??[]).some(x=>x.version===d.version),'Deliverable versions are immutable; use a new version');
  r.delivery={...evidence(),version:d.version,content_sha256:d.content_sha256,internal_checks:true};(r.deliveries??=[]).push({...r.delivery});r.acceptance=null;r.publication_authority=null;r.stage='Client review';break;
 case 'client_approver_registered':
  requireThat(id(d.approver_id)&&words(d.name)&&d.authority_confirmed===true,'Register a named authorized client approver');
  requireThat(!Object.hasOwn(r.client_approvers??{},d.approver_id),'Approver identity is already registered');
  (r.client_approvers??={})[d.approver_id]={name:d.name,...evidence()};break;
 case 'acceptance_recorded':
  requireThat(r.stage==='Client review'&&exact(r,d)&&Object.hasOwn(r.client_approvers??{},d.approver_id)&&d.client_approval_verified===true&&holds(r).length===0,'Exact version, named approver and no unresolved objection required');
  r.acceptance={...evidence(),version:d.version,content_sha256:d.content_sha256,approver_id:d.approver_id,approver_name:r.client_approvers[d.approver_id].name,quote_sha256:digest(r.quote)};
  (r.client_approval_history??=[]).push({...r.acceptance});r.stage='Handover';break;
 case 'client_preview_objected': case 'client_preview_withdrawn':
  requireThat(exact(r,d)&&Object.hasOwn(r.client_approvers??{},d.approver_id)&&words(d.reason),'Bind the objection or withdrawal to an exact version and named approver');
  r.delivery_holds??=holds(r);
  const newHold={...evidence(),kind:type,reason:d.reason,approver_id:d.approver_id,version:d.version,content_sha256:d.content_sha256};
  r.delivery_holds.push(newHold);r.delivery_hold=holds(r)[0];
  if(r.acceptance)r.acceptance.withdrawn_at=event.at;
  (r.client_approval_history??=[]).push({...newHold});
  if(r.publication?.status==='Published')r.publication.urgent_review={...newHold,action:'Review published site; no automatic undo'};
  break;
 case 'client_preview_objection_resolved': {
  r.delivery_holds??=holds(r);const hold=holds(r).find(h=>h.event_id===d.hold_event_id);
  requireThat(hold&&hold.version===d.version&&hold.content_sha256===d.content_sha256&&hold.approver_id===d.approver_id&&d.client_agreed===true&&words(d.resolution),'Resolve only the exact named approver hold with recorded client agreement');
  hold.resolved={...evidence(),resolution:d.resolution,client_agreed:true,approver_id:d.approver_id};
  (r.client_approval_history??=[]).push({...hold.resolved,hold_event_id:d.hold_event_id});r.delivery_hold=holds(r)[0]??null;r.acceptance=null;r.publication_authority=null;r.stage='Client review';break;}
 case 'publication_authorized':
  requireThat(approvalCurrent(r)&&exact(r,d)&&d.authorized===true&&words(d.target)&&d.target.startsWith('fixture:'),'Authorize an exact fictional target and current approved release');
  requireThat(paid(r)===r.quote.price_cents,'Required settled project balance missing');
  r.publication_authority={...evidence(),target:d.target,basis:releaseBasis(r)};break;
 case 'publication_intent_prepared':
  currentRelease();requireThat(!r.publication || r.publication.status==='Cancelled' || r.publication.status==='Published'&&r.publication.version!==r.delivery.version,'An existing release intent must be reconciled, never resent');
  requireThat(id(d.intent_id)&&!(r.publication_history??[]).some(p=>p.intent_id===d.intent_id)&&exact(r,d)&&d.target===r.publication_authority.target,'Bind a fresh intent to the exact version and authorized target');
  r.publication={...evidence(),intent_id:d.intent_id,target:d.target,version:d.version,content_sha256:d.content_sha256,basis:releaseBasis(r),status:'Prepared',simulated:true};
  (r.publication_history??=[]).push({...r.publication});break;
 case 'publication_intent_cancelled':
  requireThat(r.publication?.status==='Prepared'&&d.intent_id===r.publication.intent_id&&words(d.reason),'Only an undispatched prepared intent may be cancelled');
  r.publication.status='Cancelled';r.publication.cancellation={...evidence(),reason:d.reason};(r.publication_history??=[]).push({...r.publication});break;
 case 'publication_dispatched':
  currentRelease();requireThat(r.publication?.status==='Prepared'&&d.intent_id===r.publication.intent_id&&r.publication.basis===releaseBasis(r),'Only the original current prepared intent can dispatch once');
  r.publication.status='Dispatched';r.publication.dispatched={...evidence(),simulated:true};break;
 case 'publication_uncertain':
  requireThat(r.publication?.status==='Dispatched'&&d.intent_id===r.publication.intent_id,'Only the dispatched intent can become uncertain');r.publication.status='Uncertain';r.publication.uncertainty=evidence();break;
 case 'publication_receipt_recorded':
  requireThat(['Dispatched','Uncertain'].includes(r.publication?.status)&&d.intent_id===r.publication.intent_id&&d.version===r.publication.version&&d.content_sha256===r.publication.content_sha256&&d.target===r.publication.target&&id(d.receipt_id)&&d.simulated===true,'Receipt must bind the original dispatched intent, version, content and target');
  r.publication.receipt={...evidence(),receipt_id:d.receipt_id,intent_id:d.intent_id,version:d.version,content_sha256:d.content_sha256,target:d.target,simulated:true};r.publication.status='Published';
  if(r.delivery_hold)r.publication.urgent_review={...r.delivery_hold,action:'Review published site; no automatic undo'};
  (r.publication_history??=[]).push({...r.publication});break;
 case 'handover_completed':
  requireThat(r.stage==='Handover'&&paid(r)===r.quote.price_cents,'Approved delivery and settled project balance required for final handover');
  requireThat(approvalCurrent(r)&&r.publication?.status==='Published'&&r.publication.version===r.delivery.version&&r.publication.content_sha256===r.delivery.content_sha256,'Exact simulated publication receipt and current client approval required');
  for(const k of ['ownership','training','backup','support'])requireThat(words(d[k]),'Retain handover references');r.handover={...d,at:event.at};r.stage='Support';break;
 case 'maintenance_agreement_approved':
  requireThat(r.handover&&id(d.agreement_id)&&!Object.hasOwn(r.maintenance_agreements??{},d.agreement_id),'Use a unique maintenance agreement after handover');
  requireThat(words(d.period_start)&&words(d.period_end)&&Number.isFinite(Date.parse(d.period_start))&&Date.parse(d.period_end)>Date.parse(d.period_start)&&amount(d.allowance_minutes)&&Number.isSafeInteger(d.price_cents)&&d.price_cents>=0&&d.currency==='USD'&&Array.isArray(d.categories)&&d.categories.length>0&&d.categories.every(id),'Specify the agreed period, categories, time allowance and price');
  requireThat(Object.hasOwn(r.client_approvers??{},d.approver_id)&&d.client_accepted===true&&d.operator_approved===true,'Internal approval and named client acceptance required');
  (r.maintenance_agreements??={})[d.agreement_id]={...d,...evidence(),used_minutes:0};break;
 case 'maintenance_extra_approved':
  requireThat(r.handover&&id(d.extra_id)&&!Object.hasOwn(r.maintenance_extras??{},d.extra_id)&&words(d.scope)&&amount(d.minutes)&&Number.isSafeInteger(d.price_cents)&&d.price_cents>=0&&d.currency==='USD'&&words(d.category),'Specify exact additional scope, time, category and price');
  requireThat(Object.hasOwn(r.client_approvers??{},d.approver_id)&&d.client_accepted===true&&d.operator_approved===true,'Internal approval and named client acceptance required');
  (r.maintenance_extras??={})[d.extra_id]={...d,...evidence(),scope_sha256:digest({scope:d.scope,minutes:d.minutes,price_cents:d.price_cents,currency:d.currency,category:d.category})};break;
 case 'maintenance_work_reserved': {
  requireThat(r.handover&&id(d.work_id)&&words(d.scope)&&words(d.category)&&amount(d.minutes),'Specify unique work, exact scope, category and estimated minutes');
  requireThat(id(d.extra_id)&&d.agreement_id===undefined||id(d.agreement_id)&&d.extra_id===undefined,'Choose exactly one allocation: included agreement or accepted extra scope');
  if(d.ticket_id!==undefined)requireThat(r.tickets.some(t=>t.id===d.ticket_id&&t.status==='Open'&&t.description===d.scope),'Link reserved work to the exact open support request scope');
  const works=r.maintenance_work??={};const fingerprint=digest(d);
  if(Object.hasOwn(works,d.work_id)){requireThat(works[d.work_id].fingerprint===fingerprint,'Work ID conflicts with saved scope');break;}
  if(d.extra_id){const extra=r.maintenance_extras?.[d.extra_id];requireThat(extra&&extra.scope_sha256===d.scope_sha256&&extra.scope===d.scope&&extra.category===d.category&&extra.minutes===d.minutes&&!extra.reserved_by,'Extra work requires exact unused accepted scope and price');extra.reserved_by=d.work_id;}
  else {const agreement=r.maintenance_agreements?.[d.agreement_id],now=+app.now();requireThat(agreement&&now>=Date.parse(agreement.period_start)&&now<Date.parse(agreement.period_end)&&agreement.categories.includes(d.category),'Current approved period and covered category required');const reserved=Object.values(works).filter(w=>w.agreement_id===d.agreement_id).reduce((n,w)=>n+w.minutes,0);requireThat(reserved+d.minutes<=agreement.allowance_minutes,'Allowance exceeded; approve exact extra scope and price first');}
  works[d.work_id]={...d,...evidence(),authorized_at:app.now().toISOString(),fingerprint,status:'Reserved'};break;}
 case 'maintenance_work_consumed': {
  const work=r.maintenance_work?.[d.work_id];requireThat(work&&d.reservation_event_id===work.event_id&&d.minutes===work.minutes,'Consume the exact reserved work once');
  if(work.status==='Consumed')break;
  work.status='Consumed';work.completion=evidence();if(work.agreement_id)r.maintenance_agreements[work.agreement_id].used_minutes+=work.minutes;break;}
 case 'support_closed': {
  const ticket=r.tickets.find(t=>t.id===d.ticket_id),work=r.maintenance_work?.[d.work_id];
  requireThat(ticket?.status==='Open'&&work?.status==='Consumed'&&work.ticket_id===ticket.id&&work.scope===ticket.description,'Close support only after its exact approved work allocation is consumed');
  requireThat(words(d.resolution)&&d.client_notified_verified===true,'Resolve and verify notification before closing support');
  Object.assign(ticket,{status:'Closed',resolution:d.resolution,reference:evidence().reference,closed_at:event.at,work_id:d.work_id});break;}
 }
 return true;
}

export function deliveryGateView(r){return r.delivery_control_version===1?{build_basis_sha256:buildBasis(r),approval_current:!!approvalCurrent(r),publication_status:r.publication?.status??'Not prepared',hold:holds(r).map(h=>h.reason).join('; ')||null,unresolved_holds:holds(r),authority:'Local operator-attested simulation; no client authentication or external publication'}:null;}
