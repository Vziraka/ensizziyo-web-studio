import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {manualRenewalFixture} from './fixtures/manual-mailbox-renewal.mjs';
import {createHostedDesk} from './hosted-desk.mjs';
import {hash} from './lifecycle.mjs';
import {mailboxProfile} from './mailbox-intake.mjs';
import {applyManualRecord} from './shared-manual-records.mjs';

// These are synthetic per-read costs, not observed Blobs latency. Real reducers,
// encrypted OAuth, transport and signed hosted handlers run against inert boundaries.
async function fixture(t,{metadata=true}={}){
 const f=await manualRenewalFixture(t),s=f.b,key=Buffer.alloc(32,7),namespace='evz-mailbox-credentials-delivery-fixture',keyId='fixture-key';
 const binding={capability:s.capability,workspace_id:s.workspace_id,run_id:s.run_id,namespace:s.namespace,manual_binding_sha256:hash(f.packet.binding),source_policy_sha256:hash(f.app.config.mailbox),tenant_id:'fixture-tenant',site_id:s.site_id,deploy_id:s.deploy_id,origin:s.origin,redirect_uri:s.origin+'/desk/api/google-oauth/callback',client_id:'fixture-client.apps.googleusercontent.com',account:f.app.config.mailbox.account,audience:'internal'};
 const grant_id=f.token.grant_id,data={grant_id,status:'Active',access_token:f.token.access_token,refresh_token:'fictional-refresh-token',expires_at:+f.now()+3600000,scopes:f.token.scopes};
 function encrypt(){const iv=Buffer.alloc(12,3),cipher=createCipheriv('aes-256-gcm',key,iv,{authTagLength:16});cipher.setAAD(Buffer.from(JSON.stringify({v:1,namespace,key_id:keyId,binding:{profile:mailboxProfile,...binding},grant_id})));return {v:1,key_id:keyId,grant_id,iv:iv.toString('base64url'),ciphertext:Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]).toString('base64url'),tag:cipher.getAuthTag().toString('base64url')};}
 const control={readMs:0,workspaceReads:0,credentialReads:0,beforeProvider:null,beforeWorkspace:null,beforeCredential:null,metadataReads:0,metadataMs:25,beforeMetadata:null};
 if(metadata)f.raw.getMetadata=async(k,o)=>{assert.equal(k,"workspace");assert.equal(o.consistency,"strong");control.metadataReads++;f.advance(control.metadataMs);if(control.beforeMetadata)await control.beforeMetadata();const entry=f.objects.get(k);return entry?{etag:entry.etag,metadata:{}}:null;};
 Object.assign(f.env,{EVZ_OPERATIONS_GOOGLE_OAUTH:'owner-mailbox-code-v1',EVZ_GOOGLE_OAUTH_BINDING:JSON.stringify(binding),EVZ_GOOGLE_CREDENTIAL_NAMESPACE:namespace,EVZ_GOOGLE_CREDENTIAL_KEY_ID:keyId,EVZ_GOOGLE_CREDENTIAL_KEY:key.toString('base64url'),EVZ_GOOGLE_CLIENT_SECRET:'fictional-client-secret-long-enough'});
 f.control.beforeRead=async k=>{if(k==='workspace'){control.workspaceReads++;f.advance(control.readMs);if(control.beforeWorkspace)await control.beforeWorkspace();}};
 const handler=createHostedDesk({env:f.env,storeFactory:()=>f.raw,now:f.now,googleIncomingOptions:{fetcher:async(url,options)=>{if(control.beforeProvider)await control.beforeProvider(new URL(url),options);return f.fetcher(url,options);}},googleOAuthOptions:{storeFactory:async name=>{assert.equal(name,namespace);return {async getWithMetadata(k){assert.equal(k,'credential');control.credentialReads++;if(control.beforeCredential)await control.beforeCredential();return {data:encrypt(),etag:'fixture-credential'};}};},fetcher:async()=>assert.fail('No OAuth network expected')}});
 const cookie=r=>r.headers.get('set-cookie').split(';')[0],request=(path,options)=>new Request(s.origin+'/desk'+path,options),boot=await handler(request('/api/bootstrap'),f.context),csrf=(await boot.json()).csrf,first=cookie(boot),login=await handler(request('/api/login',{method:'POST',headers:{cookie:first,origin:s.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify({key:f.env.EVZ_OPERATIONS_OWNER_KEY})}),f.context);assert.equal(login.status,200);
 const post=(path,input)=>handler(request(path,{method:'POST',headers:{cookie:first+'; '+cookie(login),origin:s.origin,'content-type':'application/json','x-studio-token':csrf},body:JSON.stringify(input)}),f.context);
 await f.grant('mailbox-delivery','send-one');await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:false,reason:'Synthetic noncommercial acknowledgment'});
 const r=(await f.store.snapshot()).prospects.one;
 await f.okay(await f.owner('/api/event',{revision:await f.revision(),event:{id:'draft-one',type:'reply_draft_saved',prospect_id:'one',at:f.now().toISOString(),data:{source_id:r.reply.source_id,reply_sha256:hash(r.reply),source_sha256:r.reply.content.source_sha256,body:'Thanks for this controlled inquiry.'}}}));
 const draft=(await f.store.snapshot()).prospects.one.reply_draft;
 await f.okay(await f.owner('/api/event',{revision:await f.revision(),event:{id:'content-one',type:'reply_draft_approved',prospect_id:'one',at:f.now().toISOString(),data:{sha256:draft.sha256,approved:true,facts_checked:true}}}));
 const p=await f.command('mailbox-delivery','package',{kind:'reply',project_id:'one'}),approval=await f.command('mailbox-delivery','approve',{revision:await f.revision(),kind:'reply',project_id:'one',package_sha256:p.sha256});
 control.workspaceReads=0;control.credentialReads=0;
 return {...f,providerControl:f.control,control,credential:data,post,approval,dispatch:()=>post('/api/mailbox-delivery/dispatch',{approval_id:approval.approval_id})};
}

for(const large of [false,true])test('encrypted hosted delivery completes exact Sent readback within 25 seconds at synthetic 250 ms per workspace read'+(large?' with 12 MB retained history at 750 ms':''),async t=>{
 const f=await fixture(t);
 if(large){
  const entry=f.objects.get('workspace'),envelope=JSON.parse(entry.bytes);
  // Build legal retained notes through the production reducer, not an unknown padding field.
  for(let n=0;n<3800;n++)applyManualRecord(envelope.state,{id:'synthetic-note-'+n,type:'note_added',prospect_id:'two',at:f.now().toISOString(),data:{note:'Synthetic retained history. '+ 'x'.repeat(2970)}},'owner',envelope.state.revision,f.now(),envelope.config);
  const bytes=Buffer.from(JSON.stringify(envelope));assert(bytes.length>=12000000&&bytes.length<13000000);f.store.validate(envelope);f.objects.set('workspace',{bytes,etag:'synthetic-retained-history'});t.diagnostic('Validated retained envelope bytes: '+bytes.length);
 }
 f.control.readMs=large?750:250;const before=+f.now(),response=await f.dispatch(),body=await response.json(),reads=f.control.workspaceReads;
 t.diagnostic(JSON.stringify({workspaceReads:reads,credentialReads:f.control.credentialReads,syntheticElapsedMs:+f.now()-before,body}));
 if(response.status!==200){const state=JSON.parse(f.objects.get('workspace').bytes).state;assert.equal(f.sent.length,0);assert.equal(Object.keys(state.mailbox_delivery.intents).length,0);assert.equal(state.mailbox_delivery.allowances['send-one'].used_intents,0);}
 assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.status,'Verified');assert.equal(f.sent.length,1);assert(f.paths.includes('messages/sent-1'));assert(reads<100,'Full operation must fit the unchanged finite budget');
 f.control.readMs=0;const saved=await f.store.snapshot(),intent=saved.mailbox_delivery.intents[body.id];assert.equal(intent.status,'Verified');assert.equal(intent.receipt.mime_sha256,intent.mime.sha256);assert.equal(saved.mailbox_delivery.allowances['send-one'].used_intents,1);
 const repeated=await f.okay(await f.dispatch());assert.equal(repeated.id,body.id);assert.equal(f.sent.length,1);
});

test('mutable pause observed after provider preflight prevents the Gmail POST',async t=>{
 const f=await fixture(t);let paused=false;f.control.beforeProvider=async url=>{if(url.pathname.endsWith('/settings/sendAs')&&!paused){paused=true;await f.command('mailbox-delivery','pause',{revision:await f.revision(),paused:true,reason:'Concurrent operator stop'});}};
 const response=await f.dispatch();assert.equal(response.status,400);assert.equal(f.sent.length,0);assert.equal((await f.store.snapshot()).mailbox_delivery.allowances['send-one'].used_intents,0);
});

test('hosted delivery budget includes the OAuth scope entry read',async t=>{
 const f=await fixture(t);let delayed=false;
 // The first two reads open the app; the third is OAuth scope entry.
 f.control.beforeWorkspace=()=>{if(f.control.workspaceReads===3){delayed=true;f.advance(25001);}};
 const response=await f.dispatch();assert.equal(delayed,true);assert.notEqual(response.status,200);assert.equal(f.paths.length,0);assert.equal(f.sent.length,0);
 const state=await f.store.snapshot();assert.equal(Object.keys(state.mailbox_delivery.intents).length,0);assert.equal(state.mailbox_delivery.allowances['send-one'].used_intents,0);
});

for(const drift of ['credential','configuration'])test('fresh '+drift+' drift during preflight prevents the Gmail POST',async t=>{
 const f=await fixture(t);let changed=false;f.control.beforeProvider=async url=>{if(url.pathname.endsWith('/profile')&&!changed){changed=true;if(drift==='credential')f.credential.status='Reauthorization required';else{const entry=f.objects.get('workspace'),data=JSON.parse(entry.bytes);data.config.sender.postal_address='Synthetic changed address';f.objects.set('workspace',{bytes:Buffer.from(JSON.stringify(data)),etag:'synthetic-config-change'});}}};
 const response=await f.dispatch();assert.equal(response.status,400);assert.equal(f.sent.length,0);assert.equal(JSON.parse(f.objects.get('workspace').bytes).state.mailbox_delivery.allowances['send-one'].used_intents,0);
});

test('scope exit storage failure preserves the verified original intent and never resends',async t=>{
 const f=await fixture(t);let failed=false;f.control.beforeWorkspace=()=>{const state=JSON.parse(f.objects.get('workspace').bytes).state;if(!failed&&Object.values(state.mailbox_delivery.intents).some(i=>i.status==='Verified')){failed=true;throw Error('Synthetic scope-exit storage loss');}};
 const response=await f.dispatch();assert.equal(response.status,503);assert.equal(failed,true);assert.equal(f.sent.length,1);f.control.beforeWorkspace=null;
 const saved=await f.store.snapshot(),intent=Object.values(saved.mailbox_delivery.intents)[0];assert.equal(intent.status,'Verified');assert.equal(saved.mailbox_delivery.allowances['send-one'].used_intents,1);
 const repeated=await f.okay(await f.dispatch());assert.equal(repeated.id,intent.id);assert.equal(repeated.status,'Verified');assert.equal(f.sent.length,1);
});


test('pause during the final send token read retains the charged claim and prevents POST',async t=>{
 const f=await fixture(t);let paused=false;f.control.beforeCredential=async()=>{const state=JSON.parse(f.objects.get('workspace').bytes).state;if(!paused&&Object.values(state.mailbox_delivery.intents).some(i=>i.claimed_at)){paused=true;await f.command('mailbox-delivery','pause',{revision:state.revision,paused:true,reason:'Stop during final token preflight'});}};
 const response=await f.dispatch(),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.status,'Uncertain');assert.equal(paused,true);assert.equal(f.sent.length,0);
 const state=await f.store.snapshot(),intent=state.mailbox_delivery.intents[body.id];assert(intent.claimed_at);assert.equal(state.mailbox_delivery.allowances['send-one'].used_intents,1);assert.equal((await f.okay(await f.dispatch())).id,intent.id);assert.equal(f.sent.length,0);
});


test('encrypted hosted reconcile verifies a lost send acknowledgment without another POST',async t=>{
 const f=await fixture(t);f.providerControl.sendLoss=true;
 const first=await f.okay(await f.dispatch());assert.equal(first.status,'Uncertain');assert.equal(first.readback_required,true);assert.equal(f.sent.length,1);
 let saved=await f.store.snapshot(),intent=saved.mailbox_delivery.intents[first.id];assert(intent.claimed_at);const originalMime=structuredClone(intent.mime);assert.equal(saved.mailbox_delivery.allowances['send-one'].used_intents,1);
 f.providerControl.sendLoss=false;const result=await f.okay(await f.post('/api/mailbox-delivery/reconcile',{id:first.id}));assert.equal(result.status,'Verified');assert.equal(result.id,first.id);assert.equal(f.sent.length,1);
 saved=await f.store.snapshot();intent=saved.mailbox_delivery.intents[first.id];assert.equal(intent.status,'Verified');assert.deepEqual(intent.mime,originalMime);assert.equal(intent.receipt.mime_sha256,originalMime.sha256);assert.equal(saved.mailbox_delivery.allowances['send-one'].used_intents,1);assert(f.paths.includes('messages')&&f.paths.includes('messages/sent-1'));
});

test('strong metadata witnesses complete delivery at 750ms full-envelope latency',async t=>{const f=await fixture(t,{metadata:true});f.control.readMs=750;const before=+f.now(),response=await f.dispatch(),body=await response.json();t.diagnostic(JSON.stringify({workspaceReads:f.control.workspaceReads,metadataReads:f.control.metadataReads,elapsed:+f.now()-before,body}));assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.status,'Verified');assert.equal(f.sent.length,1);assert(f.control.metadataReads>0);assert(+f.now()-before<25000);});

for(const mode of ['missing','unavailable','expired'])test('metadata '+mode+' fails closed before provider access',async t=>{const f=await fixture(t);f.control.beforeMetadata=()=>{if(mode==='missing')f.objects.delete('workspace');if(mode==='unavailable')throw Error('Synthetic metadata outage');if(mode==='expired')f.advance(25001);};const response=await f.dispatch();assert.notEqual(response.status,200);assert.equal(f.sent.length,0);assert.equal(f.paths.length,0);});
test('delivery retains full-read fallback without metadata support',async t=>{const f=await fixture(t,{metadata:false});const response=await f.dispatch(),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.status,'Verified');assert.equal(f.sent.length,1);assert.equal(f.control.metadataReads,0);});
test('pause during metadata read after durable claim prevents send and preserves charge',async t=>{const f=await fixture(t);let paused=false;f.control.beforeMetadata=async()=>{const state=JSON.parse(f.objects.get('workspace').bytes).state;if(!paused&&Object.values(state.mailbox_delivery.intents).some(i=>i.claimed_at)){paused=true;await f.command('mailbox-delivery','pause',{revision:state.revision,paused:true,reason:'Concurrent pause at metadata boundary'});}};const body=await f.okay(await f.dispatch());assert.equal(paused,true);assert.equal(body.status,'Uncertain');assert.equal(f.sent.length,0);const state=JSON.parse(f.objects.get('workspace').bytes).state;assert.equal(state.mailbox_delivery.allowances['send-one'].used_intents,1);assert(Object.values(state.mailbox_delivery.intents)[0].claimed_at);});
