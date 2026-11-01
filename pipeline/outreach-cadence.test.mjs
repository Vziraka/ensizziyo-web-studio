import test from 'node:test';import assert from 'node:assert/strict';
import {cadenceDate,outreachCadence} from './outreach-cadence.mjs';
test('cadence preserves recipient local time across DST and counts only weekdays for calls',()=>{
 assert.equal(cadenceDate('2026-10-30T15:00:00Z','America/New_York',3,true),'2026-11-04T16:00:00.000Z');
 assert.equal(cadenceDate('2026-10-30T15:00:00Z','America/New_York',7),'2026-11-06T16:00:00.000Z');
 assert.equal(cadenceDate('2026-03-06T16:00:00Z','America/New_York',3,true),'2026-03-11T15:00:00.000Z');
});
test('only a verified actual send enrolls cadence; stop, reply and conversations suppress due work',()=>{
 const state={prospects:{a:{id:'a',name:'STUDIO TEST A',follow_up_owner:'owner',calls:{}}},outreach_delivery:{intents:{first:{id:'first',project_id:'a',kind:'new-business',status:'Uncertain',timezone:'America/New_York',receipt:{sent_at:'2026-10-30T15:00:00Z'}}}}};
 assert.deepEqual(outreachCadence(state),[]);state.outreach_delivery.intents.first.status='Verified';
 const at=new Date('2026-11-06T16:00:00Z');let c=outreachCadence(state,at)[0];assert.equal(c.call_due,true);assert.equal(c.follow_up_due,true);
 for(const change of [r=>r.reply={source_id:'reply'},r=>r.restriction='opt-out',r=>r.calls={call:{outcome:'connected'}},r=>r.cold_paused=true]){const copy=structuredClone(state);change(copy.prospects.a);c=outreachCadence(copy,at)[0];assert.equal(c.call_due,false);assert.equal(c.follow_up_due,false);}
 state.prospects.a.calls={call:{outcome:'no_answer',performed_at:'2026-11-05T16:00:00Z'}};c=outreachCadence(state,at)[0];assert.equal(c.call_due,false);assert.equal(c.follow_up_due,true);
 state.outreach_delivery.intents.second={id:'second',project_id:'a',kind:'follow-up',status:'Uncertain'};c=outreachCadence(state,at)[0];assert.equal(c.follow_up_due,false);assert.equal(c.follow_up_available,false);
});
