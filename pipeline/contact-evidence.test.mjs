import test from 'node:test';import assert from 'node:assert/strict';
import {contactEvidenceView} from './owner-contacts.mjs';import {hash} from './lifecycle.mjs';
const at='2026-10-24T15:00:00.000Z',now=new Date(at);
const record=()=>({contact:{phone:'202-555-0100',phone_verified:true,email:'office@example.invalid',verified:true,checked_at:at,source:'https://example.invalid/contact'},qualification:{verdict:'Verification call only'},calls:{},transcripts:{}});
test('contact labels describe source evidence, exact existing cache windows and expiry without authorizing outreach',()=>{
 const r=record(),before=structuredClone(r),view=contactEvidenceView(r,now);assert.equal(view.phone.label,'Published business number');assert.equal(view.email.label,'Business email · source reviewed');assert.equal(view.phone.max_age_days,14);assert.equal(view.phone.expires_at,'2026-11-07T15:00:00.000Z');assert.equal(view.phone.reuse_current_evidence,true);assert.deepEqual(r,before);
 assert.equal(contactEvidenceView({...r,qualification:{verdict:'Research-qualified'}},now).phone.max_age_days,30);
 const corrupted={...r,verification:{packet:{sources:[]},packet_sha256:hash('different')}};assert.match(contactEvidenceView(corrupted,now).phone.status,/integrity/);
 for(const date of ['2026-10-01T15:00:00.000Z','2026-11-01T15:00:00.000Z','invalid']){const v=contactEvidenceView({...r,contact:{...r.contact,checked_at:date}},now);assert.equal(v.phone.reuse_current_evidence,false);assert.match(v.phone.status,/Recheck/);}
 assert.equal(contactEvidenceView({...r,contact:{...r.contact,phone_verified:false,verified:false}},now).phone.label,'Number needs source review');
 assert.equal(contactEvidenceView({...r,contact:{...r.contact,phone:null,email:null}},now).email.label,'No business email saved');
});
test('wrong-contact and bounce reports override positive labels and never renew or resume a held route',()=>{
 const r=record();r.calls.wrong={outcome:'wrong_contact',performed_at:at};r.reply={kind:'bounce',at};r.cold_paused=true;const before=structuredClone(r),view=contactEvidenceView(r,now);assert.equal(view.phone.label,'Wrong contact reported');assert.equal(view.email.label,'Bounce reported · route held');assert.equal(view.phone.reuse_current_evidence,false);assert.equal(view.email.reuse_current_evidence,false);assert.deepEqual(r,before);
 r.calls.wrong.undone=true;assert.equal(contactEvidenceView(r,now).phone.label,'Published business number');
 const changed=record();changed.owner_contact={bound_contact_sha256:hash({...changed.contact,phone:'202-555-0199'}),reviewed_at:at};assert.equal(contactEvidenceView(changed,now).phone.reuse_current_evidence,false);assert.match(contactEvidenceView(changed,now).phone.status,/changed/i);
});
test('conversation confirmation applies only to the exact bound route and intact permitted transcript',()=>{
 const r=record();r.calls.connected={outcome:'connected',performed_at:at};r.verification={conversation:{call_id:'connected',identity_confirmed:true,active_confirmed:true,contact_binding:{phone:r.contact.phone,email:r.contact.email},at}};const text='Please email office@example.invalid.';r.transcripts.connected={text,sha256:hash(text)};r.contact.email_evidence={email:r.contact.email,source:'call:connected',quote:text,confirmed_at:at};
 let view=contactEvidenceView(r,now);assert.equal(view.phone.label,'Business identity confirmed during conversation');assert.equal(view.email.label,'Email confirmed during conversation');
 r.contact.phone='202-555-0199';assert.notEqual(contactEvidenceView(r,now).phone.label,'Business identity confirmed during conversation');r.contact.email='changed@example.invalid';assert.notEqual(contactEvidenceView(r,now).email.label,'Email confirmed during conversation');
 r.contact.email='office@example.invalid';r.transcripts.connected.text+=' changed';assert.notEqual(contactEvidenceView(r,now).email.label,'Email confirmed during conversation');
});
