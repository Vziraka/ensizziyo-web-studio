import test from 'node:test';
import assert from 'node:assert/strict';
import {businessTypes,businessType,deskQueues,matchesBusiness,offers,carePlan,suggestedOffer} from './business-types.mjs';

test('saved categories classify without changing source evidence; unknowns stay explicit',()=>{
  const original={category:'Food / beverage: home bakery',verification:{packet:{sources:['untouched']}}},before=structuredClone(original);
  assert.equal(businessType(original).category,'food-and-beverage');assert.deepEqual(original,before);
  assert.equal(businessType({category:'Plumbing contractor'}).subtype,'Plumbing');
  assert.equal(businessType({category:'Unclear category'}).unclassified,true);
  assert.equal(businessTypes.length,6);
  assert.equal(matchesBusiness({category:'HVAC contractor'},'home-services',['Roofing']),false);
  assert.equal(matchesBusiness({category:'HVAC contractor'},'home-services',['HVAC','Roofing']),true);
});
test('callbacks and promised follow-ups bypass category, subtype and lane filters, without duplicate main entries',()=>{
  const record=(id,category,stage='Ready to verify')=>({id,category,stage,call_lane:'verification',calls:{}});
  const prospects={bakery:record('bakery','Food bakery','Callback'),hvac:record('hvac','HVAC contractor'),roof:record('roof','Roofing contractor'),promise:record('promise','Dental practice','Information requested'),meeting:{...record('meeting','Dental practice','Discovery'),meeting:{start:'2026-10-25'}}};
  const state={prospects,supply:{queue:['bakery','hvac','roof'].flatMap(id=>[{prospect_id:id},{prospect_id:id}])}};
  const view=deskQueues(state,{category:'home-services',subtypes:['HVAC']});
  assert.deepEqual(view.commitments.map(r=>r.id),['bakery','promise']);assert.deepEqual(view.matching.map(r=>r.id),['hvac']);
  assert.equal(deskQueues(state,{category:'health-wellness',lane:'research'}).commitments.length,2);
  prospects.promise.restriction='Do not contact';assert.equal(deskQueues(state).commitments.length,1);
});
test('approved starting offers and care are suggestions with the agreed prices and finite scope',()=>{
  assert.deepEqual(offers.slice(0,3).map(o=>o.price),[1500,1995,2495]);
  assert.deepEqual([offers[3].price_min,offers[3].price_max],[1500,2500]);
  assert.deepEqual([carePlan.price,carePlan.minutes,carePlan.rollover],[199,60,false]);
});

test('an agreed systems need or reviewed automation hypothesis can suggest systems-only without inventing a budget',()=>{assert.equal(suggestedOffer({discovery:{service:'systems'}}).id,'systems-only');assert.equal(suggestedOffer({qualification:{verdict:'Research-qualified'},call_prep:{hypothesis:'Lead routing integration alongside the existing website'}}).id,'systems-only');assert.equal(suggestedOffer({qualification:{verdict:'Verification call only'},idea:'Needs automation'}),null);});

test('an overdue promised callback remains visible even when freshness or a provider hold removes it from callable supply',()=>{const record={id:'held-callback',category:'Food bakery',stage:'Callback',callback_at:'2026-10-19T12:00:00Z',calls:{},contact:{}};const state={prospects:{'held-callback':record},supply:{checked_at:'2026-10-19T15:00:00Z',queue:[]}};assert.deepEqual(deskQueues(state,{category:'home-services'}).commitments.map(r=>r.id),['held-callback']);});
