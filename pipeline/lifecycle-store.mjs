import {validateProjectEnvelope,validateProjectChange} from './shared-project-continuation.mjs';
import {validateDispatchEnvelope,validateDispatchChange,validateDispatchOptions,operationsOriginalsCapability} from './shared-internal-dispatch.mjs';
import {check,hash} from './lifecycle.mjs';
import {validateInertEnvelope,validateInertChange} from './inert-shared-workspace.mjs';
import {validateManualEnvelope,validateManualChange} from './shared-manual-records.mjs';

// Callbacks must reserve local state only: a conflict never reruns a callback or an external effect.
export class ConditionalLifecycleStore {
  constructor(store,{key='workspace',maxBytes=20_000_000,inertBinding=null,manualBinding=null,projectBinding=null,dispatchBinding=null,originalsEnvironment=null,now=()=>new Date()}={}){this.store=store;this.key=key;this.maxBytes=maxBytes;this.inertBinding=inertBinding;this.manualBinding=manualBinding;this.projectBinding=projectBinding;this.dispatchBinding=dispatchBinding;this.originalsEnvironment=originalsEnvironment;this.now=now;check([inertBinding,manualBinding,projectBinding,dispatchBinding].filter(Boolean).length<=1,'Choose one shared capability');check(dispatchBinding?.scope.capability!==operationsOriginalsCapability||key==='workspace','Shared originals require the actual workspace authority key');}
  async initialize(config,state){
    const data={schema_version:1,config,state};this.validate(data);
    const result=await this.store.setJSON(this.key,data,{onlyIfNew:true});
    check(typeof result?.modified==='boolean','Conditional creation result is unavailable');
    return this.envelope();
  }
  validate(data){
    check(data?.schema_version===1&&data.config?.schema_version===1&&data.state?.schema_version===1,'Unknown shared workspace format');
    check(data.state.run_id===data.config.run_id&&data.state.mode===data.config.mode,'Shared state belongs to another run or mode');
    if(this.inertBinding)validateInertEnvelope(data,this.inertBinding);
    else if(this.manualBinding)validateManualEnvelope(data,this.manualBinding);
    else if(this.projectBinding)validateProjectEnvelope(data,this.projectBinding);
    else if(this.dispatchBinding)validateDispatchEnvelope(data,this.dispatchBinding);
    else check(!data.dispatch_source&&!data.project_source&&!data.manual_source&&!data.inert_source&&data.config.mode==='controlled'&&data.config.outreach_enabled===false&&data.config.research_enabled===false&&data.config.connector_writes_enabled===false&&data.config.transcript_ai?.enabled===false&&Object.values(data.state.prospects).every(r=>r.controlled===true),'Shared preview accepts execution-disabled fictional records only');
    check(Buffer.byteLength(JSON.stringify(data))<=this.maxBytes,'Shared workspace size limit reached; archive closed records');
  }
  async envelope(){
    let entry;try{entry=await this.store.getWithMetadata(this.key,{type:'json',consistency:'strong'});}catch{const error=Error('Shared storage read is unavailable');error.code='STATE_UNAVAILABLE';throw error;}
    check(entry&&typeof entry.etag==='string'&&entry.etag.length>0,'Shared workspace is unavailable');this.validate(entry.data);
    return {data:structuredClone(entry.data),etag:entry.etag};
  }
  async config(){return (await this.envelope()).data.config;}
  async snapshot(){return (await this.envelope()).data.state;}
  async change(fn,options={}){
    const {eventId,eventFingerprint}=options;
    const {data,etag}=await this.envelope(),before=JSON.stringify(data);
    if(options.configFingerprint)check(hash(data.config)===options.configFingerprint,'Incoming configuration changed during read; no cursor or effects committed');
    if(this.inertBinding)check(options.inertNote,'Inert storage rejects worker and provider mutations');
    if(this.manualBinding)check(options.manualRecord,'Manual storage rejects worker and provider mutations');
    if(this.projectBinding)check(options.projectResearch&&this.projectBinding.scope.capability==='shared-known-identity-research-v1'||options.projectRecord||options.projectAuthoring||options.projectReconcile||options.projectGeneration&&this.projectBinding.scope.capability==='shared-refinement-generation-v1','Shared project storage rejects untyped worker and provider mutations');
    if(this.dispatchBinding)validateDispatchOptions(this.dispatchBinding.scope.capability,options);
    const result=await fn(data.state,data.config);this.validate(data);
    if(this.inertBinding)validateInertChange(JSON.parse(before).state,data.state,options);
    if(this.manualBinding)validateManualChange(JSON.parse(before),data,options);
    if(this.projectBinding)await validateProjectChange(JSON.parse(before),data,options,this.store);
    if(this.dispatchBinding)await validateDispatchChange(JSON.parse(before),data,options,this.store,{binding:this.dispatchBinding,env:this.originalsEnvironment,now:this.now});
    if(options.projectOriginal)check(+this.now()<options.projectOriginal.http_deadline,'Original transition deadline expired before CAS');
    if(JSON.stringify(data)===before)return result;
    let modified,uncertain=false;
    try {const written=await this.store.setJSON(this.key,data,{onlyIfMatch:etag});check(typeof written?.modified==='boolean'&&(!written.modified||typeof written.etag==='string'&&written.etag.length>0),'Conditional write result is unavailable');modified=written.modified;}
    catch {uncertain=true;}
    if(modified===true)return result;
    if(eventId&&eventFingerprint){
      try {const current=await this.snapshot();if(current.events[eventId]?.fingerprint===eventFingerprint)return {...result,reconciled:true};}catch {}
    }
    const error=Error(uncertain?'Shared write outcome is uncertain; retain the event ID and read back before retrying.':'Shared workspace changed; refresh before approving.');
    error.code=uncertain?'STATE_UNCERTAIN':'STATE_CONFLICT';throw error;
  }
}
