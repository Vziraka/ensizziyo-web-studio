import {check,hash} from './lifecycle.mjs';
import {applyRequestedInformationTransition} from './requested-information.mjs';
import {readProjectAsset} from './project-assets.mjs';
import {blobProjectOriginalStore,originalDigest} from './shared-project-originals.mjs';
async function command(app,type,input,actor,deadline,signal){
 check(app.store?.key==='workspace'&&app.store.manualBinding?.scope.capability==='shared-operations-desk-v1'&&['owner','friend'].includes(actor)&&['confirm','draft','approve'].includes(type),'Signed operations request required');
 check(!Object.hasOwn(input,'agent_task_id')&&!Object.hasOwn(input,'agent_result_sha256'),'Worker proposals require their separate adoption route');
 const alive=()=>check(!signal.aborted&&+app.now()<deadline,'Requested-information invocation expired');
 const {data}=await app.store.envelope();alive();const tr={type,actor,at:app.now().toISOString(),input};applyRequestedInformationTransition(structuredClone(data.state),data.config,tr);
 if(type==='approve'){app.originalStore=blobProjectOriginalStore(app.store.store);for(const part of data.state.prospects[input.project_id].requested_information.draft.content.attachments){alive();const original=await readProjectAsset(app,input.project_id,part.asset_id,part.version_id);alive();check(originalDigest(original.bytes)===part.sha256&&original.bytes.length===part.bytes,'Exact approved PDF bytes changed');}}
 alive();return app.change((state,config)=>applyRequestedInformationTransition(state,config,tr),{configFingerprint:hash(data.config),requestedInformation:tr,requestedInformationDeadline:deadline});
}

export async function requestedInformationCommand(app,type,input,actor){const deadline=+app.now()+25000,controller=new AbortController();let timer;const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Requested-information invocation expired; refresh saved state before retrying'));},25000);});try{return await Promise.race([command(app,type,input,actor,deadline,controller.signal),expired]);}finally{clearTimeout(timer);}}
