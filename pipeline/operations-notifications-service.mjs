import {check,hash} from './lifecycle.mjs';
import {applyOperationsNotificationTransition} from './operations-notifications.mjs';

const capability='shared-operations-desk-v1';
function boundary(app){check(app.store?.key==='workspace'&&app.store.manualBinding?.scope.capability===capability,'Exact operations notification workspace required');}
function budget(app,deadline=Infinity){const end=Math.min(deadline,+app.now()+25000);check(Number.isFinite(end)&&+app.now()<end,'Notification invocation expired');const signal=AbortSignal.timeout(Math.max(1,end-+app.now())),expired=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Notification invocation expired')),{once:true}));expired.catch(()=>{});return {end,alive(){check(!signal.aborted&&+app.now()<end,'Notification invocation expired');},run:operation=>Promise.race([operation,expired])};}
async function read(app,b){b.alive();boundary(app);const result=await app.store.envelope();b.alive();return result.data;}
async function transition(app,type,input,actor,data,b){
 b.alive();const operationsNotifications={type,actor,at:app.now().toISOString(),input};
 return app.change((s,c)=>{b.alive();return applyOperationsNotificationTransition(s,c,operationsNotifications);},{configFingerprint:hash(data.config),operationsNotifications,operationsNotificationsDeadline:b.end});
}
// Only signed preparation inputs are accepted; browser callers cannot submit connection health.
export async function operationsNotificationCommand(app,input,actor,{deadline}={}){
 boundary(app);check(['owner','friend'].includes(actor),'Signed notification preparation required');check(input&&Object.keys(input).join(',')==='revision'&&Number.isSafeInteger(input.revision),'Exact notification revision required');const b=budget(app,deadline);
 return b.run((async()=>{const data=await read(app,b);return transition(app,'prepare',input,actor,data,b);})());
}
function normalizedHealth(value,mailbox){
 if(!value||value.account!==mailbox.account)return 'Unavailable';
 if(value.status==='Connected')return value.grant_id===mailbox.grant_id?'Connected':'Reauthorization required';
 return ['Not connected','Disconnected','Reauthorization required','Awaiting owner authorization','Connection in progress'].includes(value.status)?value.status:'Unavailable';
}
// readHealth is trusted server wiring (OAuth.status in production), never browser-provided metadata.
export async function observeOperationsNotificationHealth(app,{readHealth,deadline}={}){
 boundary(app);check(typeof readHealth==='function','Trusted connection status reader required');const b=budget(app,deadline);
 return b.run((async()=>{
  const data=await read(app,b),mailbox=data.config.mailbox;check(mailbox?.account&&mailbox?.grant_id,'Canonical mailbox policy required');
  let value;try{value=await readHealth(app);}catch{value=null;}b.alive();
  const current=await read(app,b);check(hash(current.config)===hash(data.config),'Notification source policy changed during health read');
  return transition(app,'health',{revision:current.state.revision,status:normalizedHealth(value,mailbox),account:mailbox.account,mailbox_policy_sha256:hash(mailbox)},'notification',current,b);
 })());
}
