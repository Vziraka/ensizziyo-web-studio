import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {StudioLifecycle,dailyNewProspectCount} from './lifecycle.mjs';import {projectContext} from './project-work.mjs';
import {fixtureProspect} from './lifecycle-fixtures.mjs';
const at='2026-10-24T15:00:00.000Z';
async function setup(t){const directory=await mkdtemp(join(tmpdir(),'evz-workspace-project-'));t.after(()=>rm(directory,{recursive:true,force:true}));return StudioLifecycle.initialize({directory,now:()=>new Date(at)});}
const creation={id:'create-project',prospect_id:'existing-project',type:'workspace_project_created',at,data:{name:'STUDIO TEST Existing client',purpose:'Recover prior approved brand references and design feedback.',controlled:true}};
test('either signed operator creates an inert existing-client workspace, attaches approved assets and recovers context after restart',async t=>{
 const app=await setup(t);await app.apply(creation,{actor:'friend',expectedRevision:0});assert.equal((await app.apply(creation,{actor:'friend',expectedRevision:0})).duplicate,true);
 let state=await app.snapshot(),r=state.prospects['existing-project'];assert.equal(r.stage,'Workspace only');assert.equal(r.origin,'workspace');assert.equal(r.cold_paused,true);assert.deepEqual(r.contact,{verified:false});assert.equal(r.workspace.created_by,'friend');assert.equal(dailyNewProspectCount(state,new Date(at)),0);assert.equal(Object.keys(state.actions).length,0);
 await app.apply({id:'attach-brand',prospect_id:'studio-assets',type:'asset_registered',at,data:{asset_id:'old-brand',scope:'project',project_id:r.id,name:'Original brand',kind:'brand',version_id:'v1',version_label:'Original approved candidate',reference:'private-path:clients/fictional/brand.svg'}},{actor:'owner'});
 await app.apply({id:'approve-brand',prospect_id:'studio-assets',type:'asset_version_selected',at,data:{asset_id:'old-brand',version_id:'v1'}},{actor:'friend'});
 await app.apply({id:'workspace-note',prospect_id:r.id,type:'note_added',at,data:{note:'Keep the original typography until the client selects a direction.'}},{actor:'owner'});
 const restarted=await StudioLifecycle.open({directory:app.directory,now:()=>new Date(at)});state=await restarted.snapshot();const packet=projectContext(state,r.id);assert.equal(packet.source.approved_assets[0].version_id,'v1');assert.equal(packet.source.project_note,'Keep the original typography until the client selects a direction.');assert.equal(packet.source.workspace.purpose,creation.data.purpose);assert.equal(packet.source.company.origin,'workspace');assert.equal((await restarted.dashboard()).supply.ready,0);assert.equal(state.prospects[r.id].quote,undefined);
});
test('workspace creation cannot bypass prospect qualification, daily cap, contacts, calling or sales approvals',async t=>{
 const app=await setup(t);await assert.rejects(app.apply(creation,{actor:'research-import'}),/signed operator/);
 for(const data of [{...creation.data,controlled:false},{...creation.data,name:'Real client in fictional preview'},{...creation.data,contact:{email:'client@example.invalid'}},{...creation.data,stage:'Ready to contact'}])await assert.rejects(app.apply({...creation,data},{actor:'owner'}));
 assert.equal((await app.snapshot()).revision,0);await app.apply(creation,{actor:'owner'});
 await assert.rejects(app.apply({...creation,id:'reserved-id',prospect_id:'studio-assets',data:{...creation.data,name:'STUDIO TEST Reserved project'}},{actor:'owner'}),/reserved ID/);
 await assert.rejects(app.apply({...creation,id:'duplicate-company',prospect_id:'other-project',data:{...creation.data,name:'  studio test   existing CLIENT '}},{actor:'friend'}),/already exists/);
 const before=await app.snapshot();for(const type of ['call_claimed','call_logged','reply_received','project_preparation_requested','proposal_approved'])await assert.rejects(app.apply({id:'forbidden-'+type,prospect_id:creation.prospect_id,type,at,data:{}},{actor:'owner'}),/Workspace-only/);assert.deepEqual(await app.snapshot(),before);
 await assert.rejects(app.apply({...creation,id:'stale',prospect_id:'second-project',data:{...creation.data,name:'STUDIO TEST Other client'}},{actor:'friend',expectedRevision:0}),/Record changed/);
 await app.apply(fixtureProspect('existing-prospect',at,'STUDIO TEST Imported business'));await app.apply({id:'prior-stop',prospect_id:'existing-prospect',type:'contact_stopped',at,data:{reason:'do_not_contact'}},{actor:'owner'});await assert.rejects(app.apply({...creation,id:'duplicate-stopped-business',prospect_id:'another-project',data:{...creation.data,name:'studio test imported business'}},{actor:'friend'}),/already exists/);assert.equal((await app.snapshot()).prospects['existing-prospect'].restriction,'do_not_contact');
});
