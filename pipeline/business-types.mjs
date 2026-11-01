export const businessTypes = [
  {id:'home-services',label:'Home Services',subtypes:['HVAC','Plumbing','Roofing','Electrical','Cleaning','Landscaping']},
  {id:'health-wellness',label:'Health & Wellness',subtypes:['Dental','Med spas','Clinics']},
  {id:'food-and-beverage',label:'Food & Beverage',subtypes:['Restaurants','Cafés','Bakeries','Catering','Beverage vendors','Food trucks']},
  {id:'real-estate-property',label:'Real Estate & Property',subtypes:['Agents / teams','Brokerages','Property management']},
  {id:'professional-services',label:'Professional Services',subtypes:['Law','Accounting','Consulting']},
  {id:'other-local',label:'Other Local Businesses',subtypes:['Other local services']}
];
const patterns = [
  ['home-services',[/\bhvac\b|heating|cooling|air conditioning/i,/plumb/i,/roof/i,/electric/i,/clean/i,/landscap|lawn|tree service/i]],
  ['health-wellness',[/dent/i,/med\s*spa|medical spa/i,/clinic|health|wellness|therapy|optometr/i]],
  ['food-and-beverage',[/restaurant/i,/caf[eé]|coffee/i,/bake|baker|cake|pastr/i,/cater/i,/beverage|drink|juice|matcha|tea vendor/i,/food truck/i]],
  ['real-estate-property',[/real estate|realtor|agent/i,/broker/i,/property manag/i]],
  ['professional-services',[/\blaw\b|legal|attorney/i,/account|bookkeep|\bcpa\b/i,/consult/i]],
  ['other-local',[/other local/i]]
];
export function businessType(record) {
  const explicit=record.business_type ?? record.verification?.packet?.business_type;
  if(explicit){validateBusinessType(explicit);return explicit;}
  const text=record.category??'';
  for(const [id,expressions] of patterns){const index=expressions.findIndex(re=>re.test(text));if(index>=0)return {category:id,subtype:businessTypes.find(t=>t.id===id).subtypes[index]};}
  if(/food|beverage/i.test(text))return {category:'food-and-beverage',subtype:''};
  if(/home service/i.test(text))return {category:'home-services',subtype:''};
  return {category:'other-local',subtype:'',unclassified:true};
}
export function validateBusinessType(value) {
  const type=businessTypes.find(t=>t.id===value?.category);
  if(!type||typeof value.subtype!=='string'||value.subtype!==''&&!type.subtypes.includes(value.subtype))throw Error('Choose a supported business category and subtype');
  return value;
}
export function matchesBusiness(record,category='all',subtypes=[]) {
  const type=businessType(record);
  return (category==='all'||type.category===category)&&(!subtypes.length||subtypes.includes(type.subtype));
}
export function deskQueues(state,{category='all',subtypes=[],lane='all',history=false,allBusinesses=false,assignment='team',operator='owner'}={}) {
  const records=Object.values(state.prospects),byId=new Map();
  for(const action of state.supply.queue)if(!byId.has(action.prospect_id))byId.set(action.prospect_id,state.prospects[action.prospect_id]);
  const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const today=day(state.supply.checked_at??new Date());
  const due=records.filter(r=>{const callbackDue=r.callback_at??r.callback_due_at;return !r.restriction&&r.stage==='Callback'&&(!callbackDue||day(callbackDue)<=today);});
  const promised=records.filter(r=>!r.restriction&&(r.stage==='Discovery'&&!r.meeting||r.stage==='Information requested'&&!['Sent','Verified','Simulated'].includes(r.information_draft?.status)));
  const commitments=[...new Map([...due,...promised].map(r=>[r.id,r])).values()];
  const ids=new Set(commitments.map(r=>r.id));
  const laneMatches=r=>lane==='all'||(lane==='enriched'?r.provider_contact_view?.current:(r.call_lane==='verification'?'verification':'research')===lane);
  const assignmentMatches=r=>assignment==='team'||(assignment==='my'?r.follow_up_owner===operator:!r.follow_up_owner);
  const candidates=history?records.filter(r=>Object.keys(r.calls??{}).length):allBusinesses?records:[...byId.values()].filter(r=>!ids.has(r.id));
  return {commitments:commitments.filter(assignmentMatches),matching:candidates.filter(r=>matchesBusiness(r,category,subtypes)&&laneMatches(r)&&assignmentMatches(r)).sort((a,b)=>Number(Boolean(b.verification?.packet.established_evidence))-Number(Boolean(a.verification?.packet.established_evidence)))};
}
export const offers = [
  {id:'website',name:'Website Foundation',price:1500,scope:'Up to five core pages, mobile layout, contact form, basic on-page SEO and two revision rounds.'},
  {id:'lead-capture',name:'Website + Lead Capture',price:1995,scope:'Website Foundation plus one defined enquiry-to-tracker, owner-notification and customer-acknowledgement flow.'},
  {id:'follow-up',name:'Website + Follow-up',price:2495,scope:'Lead Capture plus one additional agreed workflow, simple reporting and a handover session.'},
  {id:'systems-only',name:'Systems-only',price_min:1500,price_max:2500,scope:'A bounded systems or automation project after discovery, including tool, access, data and acceptance checks.'}
];
export const carePlan={price:199,minutes:60,rollover:false,scope:'Agreed routine maintenance and website/form checks, plus one hour total of small edits or support per month. Unused time expires monthly.'};
export function suggestedOffer(record){
  if(['systems','ai'].includes(record.discovery?.service))return offers.find(o=>o.id==='systems-only');
  if(record.qualification?.verdict==='Research-qualified'&&/crm|follow.?up|lead routing|integrat|automation|workflow|reminder|review request/i.test(record.call_prep?.hypothesis??''))return offers.find(o=>o.id==='systems-only');
  if(record.discovery?.service==='website')return offers[0];
  return null;
}
