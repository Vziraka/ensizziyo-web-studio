import { Resolver } from 'node:dns/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { check, hash } from './lifecycle.mjs';
import { validateJob, validateSnapshots } from './sources.mjs';

const hostname = value => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
async function mx(domain, signal) {
  const resolver = new Resolver({ timeout:2000, tries:1 }), abort = () => resolver.cancel();
  signal?.throwIfAborted(); signal?.addEventListener('abort', abort, {once:true});
  try { return await resolver.resolveMx(domain); }
  finally { signal?.removeEventListener('abort', abort); }
}
async function boundedJson(response) {
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; check(bytes <= 200_000, 'Research tool response exceeds bound'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function inspectResearchTools(job, snapshots, {now=()=>new Date(), signal, resolveMx=mx, request=fetch}={}) {
  validateJob(job); validateSnapshots(snapshots,job);
  const domain = job.website ? hostname(job.website) : null;
  const report = {schema_version:1,job_id:job.id,checked_at:now().toISOString(),sources_sha256:hash(snapshots),limitations:'Advisory technical evidence. MX does not prove mailbox existence or deliverability. Archived scans do not prove current activity, business ownership or buying interest.',routes:[],dns_mx:{status:'Not applicable'},urlscan:{status:'Not applicable'}};
  // Inventory retained routes without following or submitting links, forms, logins or orders.
  for (const source of snapshots.sources) {
    const links = [...new Set((source.text.match(/https:\/\/[^\s<>\[\]"']+/g)??[]).map(s=>s.replace(/[),.;]+$/,'')))].slice(0,40);
    report.routes.push({source:source.url,source_sha256:source.content_sha256,coverage:source.coverage,links});
  }
  if (!domain) return report;
  signal?.throwIfAborted();
  try {
    const records = await resolveMx(domain,signal);
    check(Array.isArray(records)&&records.length<=50&&records.every(r=>typeof r.exchange==='string'&&Number.isInteger(r.priority)), 'Malformed MX response');
    report.dns_mx = {status:records.some(r=>r.exchange && r.exchange!=='.')?'Records found':records.some(r=>r.exchange==='.'||r.exchange==='')?'Null MX':'No MX records',domain,records};
  } catch (e) { signal?.throwIfAborted(); report.dns_mx={status:'Unavailable',domain,code:['ENODATA','ENOTFOUND','ETIMEOUT','ECANCELLED'].includes(e.code)?e.code:'DNS_ERROR'}; }
  const endpoint = new URL('https://urlscan.io/api/v1/search/');
  endpoint.searchParams.set('q',`page.domain:${domain} AND date:>now-1y`); endpoint.searchParams.set('size','1');
  try {
    const timeout=AbortSignal.timeout(8000);
    const response=await request(endpoint.href,{method:'GET',redirect:'error',signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{Accept:'application/json','User-Agent':'EVZ-Research/1.0 (read-only archived search)'}});
    if(!response.ok) { await response.body?.cancel(); report.urlscan={status:response.status===429?'Rate limited':'Unavailable',http_status:response.status,domain}; return report; }
    check(/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''),'Research tool returned non-JSON content');
    const data=await boundedJson(response);check(Array.isArray(data.results)&&data.results.length<=1,'Malformed archive search response');
    const result=data.results[0];
    if(!result) report.urlscan={status:'No archived result',domain};
    else {
      const observed = result.task?.time;
      check(hostname(result.page?.url)===domain && Number.isFinite(Date.parse(observed))&&Date.parse(observed)<=+now()&&/^[a-f0-9-]{36}$/.test(result._id??''),'Archive identity/date mismatch');
      report.urlscan={status:'Archived result',domain,observed_at:observed,reference:`https://urlscan.io/result/${result._id}/`,page_status:result.page.status??null,title:String(result.page.title??'').slice(0,200)};
    }
    report.urlscan.response_sha256=hash(data);
    report.urlscan.raw_response=data;
  } catch {signal?.throwIfAborted();report.urlscan={status:'Unavailable',domain,code:'ARCHIVE_LOOKUP_FAILED'};}
  return report;
}

export async function retainResearchTools(directory,job,snapshots,options={}) {
  const path=join(directory,job.id,'research-tools.json');
  try {
    const saved=JSON.parse(await readFile(path,'utf8'));
    check(saved.sha256===hash(saved.report)&&saved.report.job_id===job.id&&saved.report.sources_sha256===hash(snapshots),'Retained tool evidence changed; reconcile rather than overwrite');
    return saved;
  } catch(e) {if(e.code!=='ENOENT')throw e;}
  const report=await inspectResearchTools(job,snapshots,options), saved={report,sha256:hash(report)};
  await writeFile(path,JSON.stringify(saved,null,2),{flag:'wx',mode:0o600});return saved;
}
