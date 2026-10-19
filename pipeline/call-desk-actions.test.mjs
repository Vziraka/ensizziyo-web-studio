import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioLifecycle } from './lifecycle.mjs';
import { fixtureProspect } from './lifecycle-fixtures.mjs';
import { saveJson,readJson } from './engine.mjs';
import { productionConfig,releaseFingerprint,queueMeeting } from './production.mjs';
import { saveInformationDraft,sendInformation,callingSession,availableMeetingSlots } from './call-desk-actions.mjs';
const at='2026-10-19T15:00:00Z';
async function setup(t,production=false){
  const directory=await mkdtemp(join(tmpdir(),'desk-actions-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const app=await StudioLifecycle.initialize({directory,now:()=>new Date(at)});await app.apply(fixtureProspect('bakery',at));
  await app.apply({id:'call1',prospect_id:'bakery',type:'call_logged',at,data:{call_id:'call1',performed_at:at,outcome:'connected',simulated:true,desk:true,intent:'discovery'}});
  if(production){const c=structuredClone(productionConfig);c.calendar={...c.calendar,owner_email:'owner@example.com',calendar_id:'primary'};c.sender={...c.sender,email:'owner@example.com',mailbox_id:'fixture-box',postal_address:'FICTIONAL TEST ADDRESS'};c.operations.allowlist=['bakery'];c.outreach_enabled=c.connector_writes_enabled=true;c.native_email={enabled:true,rounds:[1,2].map(round=>({round,list_id:`list-${round}`,list_name:`EVZ TEST ${round}`,sequence_id:`seq-${round}`,sequence_name:`EVZ TEST ${round}`,subject_field_id:`subject-${round}`,body_field_id:`body-${round}`,verified:true}))};for(const k of Object.keys(c.readiness)){c.readiness[k]=true;c.readiness_evidence[k]='fixture:verified';}c.release={approved:true,approval_ref:'fixture:owner-approval',fingerprint:releaseFingerprint(c)};await saveJson(join(directory,'lifecycle-config.json'),c);await app.change(s=>{s.prospects.bakery.controlled=false;});}
  const draft=await saveInformationDraft(app,{revision:(await app.snapshot()).revision,prospect_id:'bakery',to:production?'guest@example.net':'bakery@example.invalid',subject:'Our conversation',body:'An optional preorder page alongside your current ordering route.',recipient_confirmed:true});
  return {app,draft};
}
test('saved exact message sends once and changed approval cannot send',async t=>{
  const {app,draft}=await setup(t,true);let sends=0;
  const configPath=join(app.directory,'lifecycle-config.json'),c=await readJson(configPath);c.sender.link_id='link_businessmail';c.calendar.link_id='link_businesscalendar';c.release.fingerprint=releaseFingerprint(c);await saveJson(configPath,c);
  const connect=options=>{assert.deepEqual(options.accountLinks,{gmail:'link_businessmail',google_calendar:'link_businesscalendar'});return {connect:async()=>{},close:async()=>{},call:async(name,input)=>{if(name.endsWith('get_profile'))return {structuredContent:{email:'owner@example.com'}};sends++;assert.equal(input.payload.body.content,draft.body);assert.equal(input.to,draft.to);return {structuredContent:{id:'message1',thread_id:'thread1'}};}};};
  await assert.rejects(sendInformation(app,{prospect_id:'bakery',fingerprint:'changed',approved:true},{connect}));
  const input={prospect_id:'bakery',fingerprint:draft.fingerprint,approved:true};
  assert.equal((await sendInformation(app,input,{connect})).status,'Sent');await sendInformation(app,input,{connect});assert.equal(sends,1);
});

test('live slot lookup uses the configured business account and checked calendar availability',async t=>{
  const {app}=await setup(t,true);let reads=0;
  const configPath=join(app.directory,'lifecycle-config.json'),c=await readJson(configPath);c.sender.link_id='link_businessmail';c.calendar.link_id='link_businesscalendar';await saveJson(configPath,c);
  const connect=options=>{assert.deepEqual(options.accountLinks,{gmail:'link_businessmail',google_calendar:'link_businesscalendar'});return {connect:async()=>{},close:async()=>{},call:async(name,input)=>{
    reads++;
    if(name.endsWith('get_profile'))return {structuredContent:{email:'owner@example.com'}};
    assert.deepEqual(input.calendar_ids,['primary']);
    return {structuredContent:{calendars:[{calendar_id:'primary',busy:[]}]}};
  }};};
  const result=await availableMeetingSlots(app,{connect});assert.equal(result.simulated,false);assert.ok(result.slots.length>0);assert.equal(reads,2);
});
test('lost send receipt remains uncertain across restart and never sends again',async t=>{
  const {app,draft}=await setup(t,true);let sends=0;
  const connect=()=>({connect:async()=>{},close:async()=>{},call:async name=>{if(name.endsWith('get_profile'))return {structuredContent:{email:'owner@example.com'}};sends++;throw Error('lost receipt');}});
  const input={prospect_id:'bakery',fingerprint:draft.fingerprint,approved:true};
  assert.equal((await sendInformation(app,input,{connect})).status,'Uncertain');
  await assert.rejects(sendInformation(app,input,{connect}),/reserved/);assert.equal(sends,1);
});
test('fictional email and booking never open a connector, session totals persist',async t=>{
  const {app,draft}=await setup(t);await callingSession(app,{action:'start'});
  assert.equal((await sendInformation(app,{prospect_id:'bakery',fingerprint:draft.fingerprint,approved:true},{connect:()=>{throw Error('No network');}})).status,'Simulated');
  const booking={prospect_id:'bakery',start:'2026-10-20T14:00:00Z',end:'2026-10-20T14:20:00Z',attendee_email:'bakery@example.invalid',title:'EVZ Digital test',description:'Fictional discovery',slot_agreed:true,mode:'video'};
  assert.equal((await queueMeeting(app,booking)).simulated,true);
  const summary=await callingSession(app,{action:'end'});assert.equal(summary.summary.bookings,1);assert.equal(summary.summary.interested,1);
  await assert.rejects(queueMeeting(app,{...booking,start:'2026-10-20T03:45:00Z',end:'2026-10-20T04:05:00Z'}),/hours/);
});
