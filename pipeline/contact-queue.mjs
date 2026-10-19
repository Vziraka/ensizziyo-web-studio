import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { check, hash } from './lifecycle.mjs';
import { privateStateDirectory, readJson, saveJson, alive } from './engine.mjs';
import { validateJob, validateSnapshots, collectPublicSources } from './sources.mjs';
import { AppConnectors } from './app-connectors.mjs';

const host = url => new URL(url).hostname.toLowerCase().replace(/^www\./,'');
const platform = url => /(?:^|\.)(?:toasttab\.com|wixsite\.com|cottagecms\.com|s4shops\.com|squarespace\.com)$/.test(host(url));
const queuePath = directory => join(directory,'queue.json');
const stamp = now => now().toISOString();
const scope = items => hash(items.map(i=>[i.prospect_id,i.company_id,i.bound_contact_sha256]).sort((a,b)=>a[0].localeCompare(b[0])));
const current = (i,r) => r && i.company_id===r.company_id && i.bound_contact_sha256===hash(r.contact);
const final = i => Boolean(i.review);
function linkedContactPages(sources,website) {
  return [...new Set(sources.flatMap(s=>[...s.text.matchAll(/\[((?:https:\/\/|\/)[^\]\s]+)\]/g)].map(m=>{try{return new URL(m[1],s.final_url??s.url).href;}catch{return '';}})))]
    .filter(u=>{try{return host(u)===host(website)&&new URL(u).protocol==='https:'&&!new URL(u).search&&!new URL(u).hash&&/about|our-story|our-team|meet-the|founder|contact/i.test(new URL(u).pathname);}catch{return false;}})
    .sort((a,b)=>Number(/about|story|team|founder/i.test(b))-Number(/about|story|team|founder/i.test(a)));
}

export function contactQueueSummary(q) {
  const items=q.items;
  return {id:q.id,total:items.length,enabled:q.enabled,retained_audited:items.filter(i=>i.retained_audited).length,
    fresh_checked:items.filter(i=>i.pages.some(p=>p.status==='Captured')||i.search.status==='Captured'||i.search.previous_read?.status==='Captured').length,
    captured:items.filter(i=>i.status==='Awaiting review'||final(i)).length,reviewed:items.filter(final).length,
    held:items.filter(i=>i.status==='Held').length,pending:items.filter(i=>!final(i)&&i.status!=='Held').length,
    status:items.every(final)?'Complete':!q.enabled?'Paused':items.every(i=>final(i)||['Awaiting review','Held'].includes(i.status))?'Awaiting review':'Running'};
}

export async function createContactQueue(directory,plan,state,{now=()=>new Date()}={}) {
  directory=await privateStateDirectory(directory);
  check(plan.schema_version===1&&/^[a-z0-9-]{1,60}$/.test(plan.id??'')&&plan.approval_ref?.length>5&&Array.isArray(plan.items)&&plan.items.length>0&&plan.items.length<=151&&plan.items.length===Object.keys(state.prospects).length&&new Set(plan.items.map(i=>i.prospect_id)).size===plan.items.length,'Approve the exact existing-card contact scope');
  const items=[];
  for(const input of plan.items){
    const r=state.prospects[input.prospect_id];
    check(current(input,r),'Contact scope binding changed');validateJob(input.job);
    check(input.job.research_version===3&&input.job.business_name===r.name&&host(input.job.website)===host(r.contact.source)&&input.job.seed_urls.every(u=>host(u)===host(input.job.website)),'Capture approved business sources only');
    check(/^[a-z0-9-]{1,80}$/.test(input.prospect_id),'Safe existing-card identity required');
    const i={prospect_id:input.prospect_id,company_id:input.company_id,bound_contact_sha256:input.bound_contact_sha256,job:input.job,pages:input.job.seed_urls.map(url=>({url,status:'Pending'})),search:{status:'Pending'},apollo:{status:platform(input.job.website)?'Skipped platform domain':'Pending'},status:'Pending',retained_audited:Boolean(plan.retained_audit_ref)};
    if(input.reuse){
      const saved=await readJson(input.reuse.path),old=saved.report;
      check(saved.sha256===input.reuse.sha256&&saved.sha256===hash(old)&&old.prospect_id===r.id&&old.company_id===r.company_id&&old.job.business_name===r.name&&old.bound_contact_sha256===input.bound_contact_sha256&&old.snapshots?.sources.every(s=>Date.parse(s.fetched_at)<=+now()&&+now()-Date.parse(s.fetched_at)<=30*86400000),'Existing capture receipt changed or is stale');
      if(old.snapshots){validateSnapshots(old.snapshots,old.job);for(const s of old.snapshots.sources){check(i.pages.some(p=>p.url===s.url),'Reuse must be within the approved page budget');i.pages.find(p=>p.url===s.url).status='Captured';}}
      i.apollo={...old.apollo,reused_from:input.reuse.path};i.reused_sources=old.snapshots?.sources??[];
    }
    items.push(i);
  }
  const q={schema_version:1,id:plan.id,approval_ref:plan.approval_ref,scope_sha256:scope(items),created_at:stamp(now),enabled:true,items};
  await mkdir(directory,{recursive:true,mode:0o700});await writeFile(queuePath(directory),JSON.stringify(q,null,2),{flag:'wx',mode:0o600});return contactQueueSummary(q);
}

async function lock(directory) {
  const path=join(directory,'queue.lock');
  let guard;
  if(process.platform==='win32'){
    guard=createServer(socket=>socket.destroy());await new Promise((resolve,reject)=>{guard.once('error',reject);guard.listen(`\\\\.\\pipe\\evz-contact-${hash(directory.toLowerCase()).slice(0,32)}`,resolve);});
  }
  try{
    try{await writeFile(path,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});}
    catch(e){if(e.code!=='EEXIST')throw e;const owner=await readJson(path);check(Number.isInteger(owner.pid)&&!alive(owner.pid),'Contact queue already has an active owner');check(guard,'Dead queue lock needs reconciliation on this unsupported host');await unlink(path);await writeFile(path,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});}
    return async()=>{try{await unlink(path);}finally{guard?.close();}};
  }catch(e){guard?.close();throw e;}
}

export async function contactQueueTick(app,directory,{connect,now=app.now,collect=collectPublicSources,signal,project=true,priority=app.config.priority}={}) {
  directory=await privateStateDirectory(directory);const release=await lock(directory);
  try{
    const q=await readJson(queuePath(directory));check(q.scope_sha256===scope(q.items),'Contact queue scope changed');
    if(!q.enabled||['website','client'].includes(priority))return {...contactQueueSummary(q),status:'Paused for priority'};
    const state=await app.snapshot(),i=q.items.find(i=>!final(i)&&!['Held','Awaiting review'].includes(i.status));
    if(!i)return contactQueueSummary(q);
    if(!current(i,state.prospects[i.prospect_id])){i.status='Held';i.reason='Contact binding changed; review without repeating paid actions';await saveJson(queuePath(directory),q);return contactQueueSummary(q);}
    // A crash after reservation has an explicit outcome. Reads are never silently replayed.
    for(const a of [...i.pages,i.search,i.apollo])if(a.status==='Reserved'){a.status='Interrupted';a.reason='Prior read has no final receipt; inspect before authorizing another attempt';}
    const save=()=>saveJson(queuePath(directory),q),page=i.pages.find(p=>p.status==='Pending');
    await mkdir(join(directory,i.prospect_id),{recursive:true,mode:0o700});
    if(page){
      page.status='Reserved';page.started_at=stamp(now);await save();
      const job={...i.job,as_of:stamp(now).slice(0,10),seed_urls:[page.url]};
      try{const snapshots=await collect(job,{now,signal});const receipt={job,snapshots};page.receipt=join(i.prospect_id,`page-${i.pages.indexOf(page)+1}.json`);page.sha256=hash(receipt);await writeFile(join(directory,page.receipt),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});page.status='Captured';
        if(!platform(i.job.website))for(const url of linkedContactPages(snapshots.sources,i.job.website)){if(i.pages.length>=4)break;if(!i.pages.some(p=>p.url===url))i.pages.push({url,status:'Pending',discovered_in:page.url});}
      }
      catch(e){signal?.throwIfAborted();page.status='Unavailable';page.reason=String(e.message).slice(0,350);if(e.failures)page.failures=e.failures.map(f=>({url:f.url,reason:String(f.reason).slice(0,350)}));}
      page.checked_at=stamp(now);await save();
    }else{
      const action=i.search.status==='Pending'?i.search:i.apollo.status==='Pending'?i.apollo:null;
      if(action){action.status='Reserved';action.started_at=stamp(now);await save();
        try{
          check(connect,'Connected public search is unavailable');
          const search=action===i.search;
          const input=search?{system2_search_query:[{q:action.query??`"${i.job.business_name.split(' / ')[0]}" ${state.prospects[i.prospect_id].area??'DMV'} (owner OR founder OR operator)`}],response_length:'short'}:{q_organization_domains_list:[host(i.job.website)],person_titles:['owner','founder','co-owner','operator','CEO','president'],include_similar_titles:false,per_page:5,page:1};
          const raw=await connect.call(search?'mcp__codex_apps__search_service_web_run':'mcp__codex_apps__apollo_io_apollo_mixed_people_api_search',input);
          check(!raw.isError&&Buffer.byteLength(JSON.stringify(raw))<=300_000,'Search response unavailable or exceeds bound');
          if(!search){const data=raw.structuredContent??JSON.parse(raw.content.filter(c=>c.type==='text').map(c=>c.text).join(''));check(Array.isArray(data.people)&&data.people.length<=5,'Apollo identity search response changed');}
          const receipt={checked_at:stamp(now),input,raw};action.receipt=join(i.prospect_id,search?action.refinement?'search-2.json':'search.json':'apollo.json');action.sha256=hash(receipt);await writeFile(join(directory,action.receipt),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});action.status='Captured';
        }catch(e){signal?.throwIfAborted();action.status='Unavailable';action.reason=String(e.message).slice(0,350);}
        action.checked_at=stamp(now);await save();
      }
    }
    if(i.pages.every(p=>p.status!=='Pending')&&i.search.status!=='Pending'&&i.apollo.status!=='Pending')i.status='Awaiting review';
    q.updated_at=stamp(now);await save();
    const summary=contactQueueSummary(q);if(project)await app.change(s=>{s.contact_research=summary;});return summary;
  }finally{await release();}
}

export async function reviewContactQueue(app,directory,review) {
  directory=await privateStateDirectory(directory);const release=await lock(directory);
  try{
    const q=await readJson(queuePath(directory)),i=q.items.find(i=>i.prospect_id===review.prospect_id),state=await app.snapshot();
    check(q.scope_sha256===scope(q.items)&&i&&current(i,state.prospects[i.prospect_id]),'Review scope/contact binding changed');
    check(i.status==='Awaiting review'||final(i),'Complete bounded retrieval before semantic review');
    check(review.schema_version===1&&review.reviewed_by?.length>=3&&Number.isFinite(Date.parse(review.reviewed_at))&&Date.parse(review.reviewed_at)<=+app.now()&&+app.now()-Date.parse(review.reviewed_at)<=86400000&&['Owner and professional number','Owner identified; no direct number found','No owner found in checked sources','Source access held'].includes(review.outcome)&&review.next_action?.length>=15&&review.next_action.length<=600&&review.notes?.length>=10&&review.notes.length<=1500,'Dated explicit source review/outcome required');
    const evidence=[];
    for(const p of [...i.pages,i.search.previous_read??{},i.search,i.apollo])if(p.receipt){const receipt=await readJson(join(directory,p.receipt));check(hash(receipt)===p.sha256,'Captured contact evidence changed');evidence.push({receipt:p.receipt,sha256:p.sha256});}
    const owner=state.prospects[i.prospect_id].owner_contact;
    let saved={...review,review_input_sha256:hash(review),bound_contact_sha256:i.bound_contact_sha256,evidence,queue_id:q.id,...(owner?.bound_contact_sha256===i.bound_contact_sha256?{owner_evidence_ref:owner.evidence_ref,owner_packet_sha256:owner.packet_sha256}:{})};
    if(i.review){check(i.review.review_input_sha256===hash(review),'Completed review changed; use a new explicit review rather than overwrite');saved=i.review;}
    i.review=saved;i.status='Reviewed';await saveJson(queuePath(directory),q);
    await app.change(s=>{check(current(i,s.prospects[i.prospect_id]),'Contact changed during review');s.prospects[i.prospect_id].contact_review=saved;s.contact_research=contactQueueSummary(q);s.revision=(s.revision??0)+1;s.updated_at=stamp(app.now);});
    return contactQueueSummary(q);
  }finally{await release();}
}

export async function recoverContactTransport(directory,{now=()=>new Date()}={}) {
  directory=await privateStateDirectory(directory);const release=await lock(directory);
  try{
    const q=await readJson(queuePath(directory));check(q.scope_sha256===scope(q.items),'Contact scope changed');let recovered=0;
    for(const i of q.items)if(!i.review)for(const a of [i.search,i.apollo])if(a.status==='Unavailable'&&!a.transport_recovery&&/Connector session is closed|Malformed connector protocol response|Authenticated connector process unavailable|Connector response bound exceeded/.test(a.reason??'')){
      a.transport_recovery={at:stamp(now),previous_status:a.status,previous_reason:a.reason,previous_started_at:a.started_at,previous_checked_at:a.checked_at,reason:'One bounded fresh authenticated session for a free read; no paid reveal or model inference'};a.status='Pending';delete a.reason;i.status='Pending';recovered++;
    }
    await saveJson(queuePath(directory),q);return {recovered,...contactQueueSummary(q)};
  }finally{await release();}
}

export async function refineContactSearch(app,directory,ids) {
  directory=await privateStateDirectory(directory);const release=await lock(directory);
  try{
    const q=await readJson(queuePath(directory)),state=await app.snapshot();check(q.scope_sha256===scope(q.items)&&Array.isArray(ids)&&ids.length<=151&&new Set(ids).size===ids.length,'Exact bounded contact refinement required');let refined=0;
    for(const id of ids){const i=q.items.find(i=>i.prospect_id===id);check(i&&current(i,state.prospects[id]),'Contact refinement scope changed');if(i.review||i.search.refinement)continue;
      check(['Captured','Unavailable','Interrupted'].includes(i.search.status),'Finish the first public search before refinement');
      i.search={status:'Pending',refinement:true,query:`"${i.job.business_name.split(' / ')[0]}" ${state.prospects[id].area??'DMV'} (owner OR founder)`,previous_read:i.search};i.status='Pending';refined++;
    }
    await saveJson(queuePath(directory),q);return {refined,...contactQueueSummary(q)};
  }finally{await release();}
}

export async function runContactQueueService(app,{signal,wait=delay,intervalMs=15_000,clientFactory=options=>new AppConnectors(options)}={}) {
  let client;
  try{
    while(!signal?.aborted){
      const config=await readJson(join(app.directory,'lifecycle-config.json')),c=config.contact_research;
      if(c?.enabled){
        try{
          check(c.approval_ref?.length>5,'Approve contact research scope first');
          const q=await readJson(queuePath(await privateStateDirectory(c.directory)));check(q.scope_sha256===scope(q.items),'Contact queue scope changed');
          if(!q.items.some(i=>!final(i)&&!['Awaiting review','Held'].includes(i.status))){
            await client?.close();client=null;const result=contactQueueSummary(q),state=await app.snapshot();
            if(hash(state.contact_research??null)!==hash(result)||state.contact_research_runtime?.status!==result.status||q.items.some(i=>i.review&&current(i,state.prospects[i.prospect_id])&&hash(state.prospects[i.prospect_id].contact_review??null)!==hash(i.review)))await app.change(s=>{for(const i of q.items)if(i.review&&current(i,s.prospects[i.prospect_id]))s.prospects[i.prospect_id].contact_review=i.review;s.contact_research=result;s.contact_research_runtime={...result,checked_at:stamp(app.now)};});
          }else if(['website','client'].includes(config.priority)){
            await client?.close();client=null;const result={...contactQueueSummary(q),status:'Paused for priority'};await app.change(s=>{s.contact_research=result;s.contact_research_runtime={...result,checked_at:stamp(app.now)};});
          }else{
          if(client?.closed||client?.bytes>20_000_000){await client.close();client=null;}
          if(!client){client=clientFactory({cwd:app.directory,signal,conversationRef:'evzownerqueue7c4'});await client.connect();}
          const result=await contactQueueTick(app,c.directory,{connect:client,signal,priority:config.priority});
          await app.change(s=>{s.contact_research=result;s.contact_research_runtime={...result,checked_at:stamp(app.now)};});
          }
        }catch(e){if(signal?.aborted)break;await client?.close();client=null;await app.change(s=>{s.contact_research_runtime={status:'Held',reason:String(e.message).slice(0,350),checked_at:stamp(app.now)};});}
      }else{await client?.close();client=null;}
      try{await wait(intervalMs,undefined,{signal});}catch{if(!signal?.aborted)throw Error('Contact service wait failed');}
    }
  }finally{await client?.close();}
}
