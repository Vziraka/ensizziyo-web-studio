import {check,hash} from './lifecycle.mjs';
import {operationsDailySummary,operationsNotificationSources} from './operations-notifications.mjs';
import {nativeSummary,nativeSummaryFields} from './native-notifications.mjs';

export const savedOperationsStatusMode='saved-operations-status-v1';
export const savedStatusKinds=['connection','intake','delivery','research','callback','reply','meeting','support','operation','daily_summary'];
export const savedStatusHolds=['health_unknown','health_stale','unsaved_incidents','notification_capacity','unlinked_saved_history'];
const utc=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const kind=id=>typeof id!=='string'?'operation':id.startsWith('google-health:')?'connection':/^mailbox-(failure|clock):/.test(id)?'intake':id.startsWith('delivery:')?'delivery':id.startsWith('discovery-')?'research':['callback','reply','meeting','support'].find(k=>id.startsWith(k+':'))??'operation';
export function savedOperationsStatus(state,config,role,at){
 check(['owner','friend'].includes(role)&&config.shared_capability==='shared-operations-desk-v1'&&utc(at)&&utc(state.updated_at)&&Number.isSafeInteger(state.revision)&&state.revision>=0,'Saved status unavailable');
 const live=operationsNotificationSources(state,config,at).filter(i=>i.role===role),n=state.team_notifications,activeIds=new Set(),holds=new Set(),entries=[];
 for(const [id,m]of Object.entries(n?.messages??{})){
  if(!m||m.recipient_role!==role)continue;
  let itemKind='operation',status='held';const recorded=utc(m.prepared_at)&&m.prepared_at<=at;
  if(m.kind==='digest'){
   itemKind='daily_summary';try{const summary=nativeSummary(m.operations_summary);if(recorded&&m.id===id&&id==='ops-digest-'+summary.day+'-'+role&&summary.generated_at<=m.prepared_at)status='saved';}catch{}
  }else if(m.kind==='attention'){
   itemKind=kind(m.source_id);const fingerprint=hash({id:m.source_id,role,project_id:m.project_id??null}),linked=recorded&&m.id===id&&id.startsWith('ops-incident-')&&sha(m.operations_source)&&m.operations_source===fingerprint&&m.source_sha256===fingerprint;
   if(linked&&utc(m.operations_resolved_at)&&m.operations_resolved_at<=at&&n?.operations_active?.[fingerprint]!==id)status='resolved';
   else if(linked&&!m.operations_resolved_at&&n?.operations_active?.[fingerprint]===id&&live.some(i=>i.id===m.source_id&&hash({id:i.id,role,project_id:i.project_id??null})===fingerprint)){status='active';activeIds.add(id);}
  }
  if(status==='held')holds.add('unlinked_saved_history');
  entries.push({id:hash({mode:savedOperationsStatusMode,role,notification_id:id}),kind:itemKind,state:status,time:recorded?Date.parse(m.prepared_at):0});
 }
 const unsaved=live.some(i=>!activeIds.has(n?.operations_active?.[hash({id:i.id,role,project_id:i.project_id??null})]));if(unsaved)holds.add('unsaved_incidents');if(n?.operations_hold)holds.add('notification_capacity');
 const health=state.operations_notification_health,observed=utc(health?.observed_at)?health.observed_at:null,age=observed?Date.parse(at)-Date.parse(observed):null,healthState=age===null||age<0?'unknown':age<=900000?'current':'stale';if(healthState!=='current')holds.add('health_'+healthState);
 const selected=entries.sort((a,b)=>(a.state==='active'?0:1)-(b.state==='active'?0:1)||b.time-a.time||a.id.localeCompare(b.id)).slice(0,40),items=selected.map(({time,...item})=>item).sort((a,b)=>a.id.localeCompare(b.id)),summary=nativeSummary(operationsDailySummary(state,config,at)),codes=[...holds].sort(),truncated=entries.length>40||unsaved||holds.has('unlinked_saved_history');
 const semantic={role,items,summary:{day:summary.day,...Object.fromEntries(nativeSummaryFields.map(k=>[k,summary[k]]))},holds:codes,truncated,health_state:healthState};
 return {schema_version:1,items,summary,freshness:{checked_at:at,source_updated_at:state.updated_at,revision:state.revision,health_observed_at:observed,health_state:healthState},holds:codes,truncated,fingerprint:hash(semantic)};
}
