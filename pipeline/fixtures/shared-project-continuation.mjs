import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {StudioLifecycle,initialConfig,hash} from '../lifecycle.mjs';
import {fixtureProspect,fixtureReply,fixtureQuote} from '../lifecycle-fixtures.mjs';
import {archiveProjectAsset} from '../project-assets.mjs';
import {projectContext} from '../project-work.mjs';
import {originalDigest} from '../shared-project-originals.mjs';
import {audioDigest,localAudioStore} from '../call-audio.mjs';
import {writeLifecycleBackup} from '../lifecycle-backup.mjs';
import {prepareProjectWorkspace,installProjectWorkspace} from '../shared-project-continuation.mjs';
import {ConditionalLifecycleStore} from '../lifecycle-store.mjs';
import {createHostedDesk} from '../hosted-desk.mjs';
import {sharedDeskSession} from '../shared-originals-client.mjs';
import {connectSharedAuthoring} from '../hosted-authoring-client.mjs';
import {fictionalBlobs,env as previewEnv,at,origin,event} from './hosted-authoring.mjs';
export {at,origin,event};
export const name='STUDIO TEST Shared production project';
export const scope={schema_version:1,capability:'shared-project-continuation-v1',workspace_id:'fictional-studio',run_id:'fictional-production',mode:'production',state_schema:1,site_id:'fictional-site',deploy_id:'fictional-deploy',origin,namespace:'evz-project-shared-fictional-20261024'};
export async function fixture(t,{actor='owner',directory,fetcher:outerFetch,large=false,approvedQuote=false,audio=false,templateVersions=false,retainedGatewayProof}={}){
 directory??=await mkdtemp(join(tmpdir(),'evz-project-shared-'));t?.after(()=>rm(directory,{recursive:true,force:true}));
 const config={...structuredClone(initialConfig),run_id:scope.run_id,mode:'production',calls_enabled:false,runtime:{enabled:false},operations:{enabled:false},release:{approved:false},call_release:{approved:false}};
 config.sender.operator_names={owner:'Fictional Owner',friend:'Fictional Friend'};
 const sourceApp=await StudioLifecycle.initialize({directory:join(directory,'source'),config,now:()=>new Date(at)});
 const prospect=fixtureProspect('shared-proof',at,name);prospect.data.controlled=false;await sourceApp.apply(prospect,{actor:'research-import'});
 await sourceApp.apply(event('reply','reply_received',fixtureReply()),{actor:'provider'});let state=await sourceApp.snapshot();
 await sourceApp.apply(event('website-interest','reply_reviewed',{source_id:state.prospects['shared-proof'].reply.source_id,reply_sha256:hash(state.prospects['shared-proof'].reply),focus:'website',outcome:'discovery'}),{actor});
 const doc=await PDFDocument.create();doc.addPage();const pdf=Buffer.from(await doc.save());
 await sourceApp.apply(event('template','asset_registered',{asset_id:'template',scope:'studio',kind:'template',name:'Fictional registered template',version_id:'v1',version_label:'v1',reference:'private-path:fictional/template.pdf'},'studio-assets'),{actor});
 if(templateVersions)await sourceApp.apply(event('template-alternative','asset_version_registered',{asset_id:'template',version_id:'v2',version_label:'Unapproved alternative template',reference:'private-path:fictional/alternative-template.pdf'},'studio-assets'),{actor});
 await archiveProjectAsset(sourceApp,{project_id:'shared-proof',asset_id:'template',version_id:'v1',context_sha256:projectContext(await sourceApp.snapshot(),'shared-proof').context_sha256,expected_sha256:originalDigest(pdf)},pdf,{reference:'private-path:fictional/template.pdf',name:'template.pdf',mime_type:'application/pdf',modified_time:at},actor);
 if(approvedQuote){await sourceApp.apply(event('discovery','discovery_confirmed',{goal:'Fictional pickup website',decision_maker:'Fictional owner',serious_interest:true,paid_fit_discussed:true,service:'website',main_flow:'Choose a box and request pickup',preview_screens:3}),{actor});await sourceApp.apply(event('preview','preview_recorded',{reference:'fixture:synthetic preview',reviewed_with_owner:true}),{actor});await sourceApp.apply(event('quote','proposal_approved',fixtureQuote),{actor:actor==='owner'?'friend':'owner'});}
 await sourceApp.change(s=>{s.ai_attempts.historic={status:'Uncertain',reserved_microcredits:120,receipt:large?'Fictional historical evidence. '.repeat(180000):'Fictional old receipt'};s.operations={budget:{reserved_microcredits:800,consumed_microcredits:500,paused:true},requests:{old:{operation:'send',status:'Pending'}}};s.actions.historic={id:'historic',type:'email',prospect_id:'shared-proof',status:'Pending',payload:{}};});
 if(audio){const bytes=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.alloc(20)]),id='fictional-retained-audio';await localAudioStore(sourceApp.directory).put(id,bytes);await sourceApp.change(s=>{s.prospects['shared-proof'].call_audio={[id]:{id,call_id:'fictional-historical-call',kind:'operator_note',mime:'audio/webm',bytes:bytes.length,sha256:audioDigest(bytes),status:'Stored',recorded_by:actor,ended_at:at,capture:'Synthetic fixture bytes; no recording or semantic claim'}};});}
 if(retainedGatewayProof)await sourceApp.change(s=>{s.gateway_proof=structuredClone(retainedGatewayProof);});
 state=await sourceApp.snapshot();const backup=join(directory,'source-backup.json');await writeLifecycleBackup(sourceApp.directory,state,backup,at);
 const packet=await prepareProjectWorkspace({backup,sourceConfig:config,scope}),storage=fictionalBlobs(),store=new ConditionalLifecycleStore(storage.raw,{projectBinding:packet.binding});await installProjectWorkspace(store,packet,{commit:true});
 const env={...previewEnv,CONTEXT:'deploy-preview',SITE_ID:scope.site_id,DEPLOY_ID:scope.deploy_id,EVZ_OPERATIONS_DESK_ENABLED:scope.capability,EVZ_OPERATIONS_PROJECT_AUTHORING:'shared-project-node-v1',EVZ_OPERATIONS_PROJECT_BINDING:JSON.stringify(packet.binding),EVZ_OPERATIONS_BLOB_NAMESPACE:scope.namespace};
 const make=overrides=>createHostedDesk({env:{...env,...overrides},storeFactory:()=>storage.raw,now:()=>new Date(at)}),requests=[];let lose=null;
 const localFetch=async(url,options)=>{const response=await make()(new Request(url,options));requests.push({path:new URL(url).pathname,method:options.method,status:response.status,bytes:options.body?Buffer.byteLength(options.body):0});if(lose&&new URL(url).pathname.endsWith('/'+lose)&&response.ok){lose=null;throw Error('Fictional response lost; inspect exact state');}return response;};
 const fetcher=outerFetch??localFetch;
 const session=who=>sharedDeskSession({origin,key:env[who==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher});
 const connect=(who=actor)=>connectSharedAuthoring({origin,key:env[who==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher});
 const app=await StudioLifecycle.fromStore({store,now:()=>new Date(at)});
 return {directory,sourceApp,state,packet,storage,store,app,env,make,session,connect,fetcher,requests,loseResponse:v=>{lose=v;}};
}
