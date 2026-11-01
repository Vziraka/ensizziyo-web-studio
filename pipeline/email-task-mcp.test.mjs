import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {PDFDocument} from 'pdf-lib';
import {createEmailTaskMcp,emailTaskMcpLimits} from './email-task-mcp.mjs';
import {openFictionalEmailTaskAuthority} from './shared-email-draft-tasks.mjs';
import {createEmailDraftTask} from './email-draft-tasks.mjs';
import {fixture as sharedFixture,token as sharedToken,origin as sharedOrigin} from './fixtures/shared-email-draft-tasks.mjs';

const credential='a'.repeat(64),origin='https://fictional-evz.example',taskId='task-one',url=origin+'/desk-email-task/'+taskId+'/mcp';
const hash=v=>createHash('sha256').update(v).digest('hex');
const document=await PDFDocument.create();document.addPage([200,200]).drawText('Fictional EVZ direction',{x:15,y:100,size:10});
const pdf=Buffer.from(await document.save()),pdfHash=hash(pdf),contextHash='b'.repeat(64);
const result={body:'Please review the attached direction.',source_ids:['reply:latest-client'],uncertainties:[],attachments:[{asset_id:'asset-one',version_id:'version-one',sha256:pdfHash}],execution:{provider:'fictional-protocol-test',model:'none',duration_ms:1,input_tokens:null,output_tokens:null}};
function fixture(){
 const durable={result:null,saves:0,expired:false};let opens=0;
 const check=(id,token)=>{assert.equal(id,taskId);assert.equal(token,credential);assert.equal(durable.expired,false);};
 const openAuthority=async()=>{opens++;return {origin,async context(id,token){check(id,token);return {task:{id,context_sha256:contextHash},context:{reply:'Fictional reviewed message'},source_ids:['reply:latest-client']};},async readPdf(id,token,asset,version){check(id,token);assert.equal(asset,'asset-one');assert.equal(version,'version-one');return {bytes:durable.pdf??pdf,sha256:pdfHash,filename:'fictional.pdf'};},async submit(id,token,value){check(id,token);if(durable.result)assert.deepEqual(value,durable.result);else{durable.result=structuredClone(value);durable.saves++;}return {task_id:id,status:'Review',result_sha256:hash(JSON.stringify(durable.result))};},async receipt(id,token){check(id,token);return {task_id:id,status:durable.result?'Review':'Ready',result:durable.result,result_sha256:durable.result?hash(JSON.stringify(durable.result)):null};}};};
 const fetch=async(input,init)=>createEmailTaskMcp({openAuthority})(new Request(input,init),{});
 return {durable,fetch,get opens(){return opens;},handler:()=>createEmailTaskMcp({openAuthority})};
}
async function clientFor(f,t){
 const client=new Client({name:'evz-protocol-test',version:'1.0.0'}),transport=new StreamableHTTPClientTransport(new URL(url),{fetch:f.fetch,requestInit:{headers:{Authorization:'Bearer '+credential}}});
 await client.connect(transport);t.after(()=>client.close());return client;
}
test('actual SDK client discovers only four task tools and durably reads one idempotent result across fresh gateways',async t=>{
 const f=fixture(),client=await clientFor(f,t),tools=(await client.listTools()).tools;
 assert.deepEqual(tools.map(v=>v.name).sort(),['evz_get_draft_receipt','evz_get_draft_task','evz_read_task_pdf','evz_submit_draft_result']);
 assert.equal(tools.find(v=>v.name==='evz_submit_draft_result').annotations.readOnlyHint,false);
 assert.equal(tools.find(v=>v.name==='evz_get_draft_task').annotations.readOnlyHint,true);
 const context=await client.callTool({name:'evz_get_draft_task',arguments:{task_id:taskId}});assert.equal(context.structuredContent.task.context_sha256,contextHash);
 const file=await client.callTool({name:'evz_read_task_pdf',arguments:{task_id:taskId,asset_id:'asset-one',version_id:'version-one',sha256:pdfHash}});
 assert.deepEqual(Buffer.from(file.content[0].resource.blob,'base64'),pdf);assert.equal(file.structuredContent.sha256,pdfHash);
 for(let i=0;i<2;i++){const saved=await client.callTool({name:'evz_submit_draft_result',arguments:{task_id:taskId,context_sha256:contextHash,result}});assert.equal(saved.structuredContent.status,'Review');}
 const receipt=await client.callTool({name:'evz_get_draft_receipt',arguments:{task_id:taskId}});assert.deepEqual(receipt.structuredContent.result,result);assert.equal(f.durable.saves,1);assert.ok(f.opens>=6);
 assert.equal(JSON.stringify([tools,context,file,receipt]).includes(credential),false);
});
test('discovery rejects missing, invalid and expired credentials and unexpected host/origin/path/query/method before tools',async()=>{
 const f=fixture(),handler=f.handler(),headers={authorization:'Bearer '+credential,'content-type':'application/json'},body=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal((await handler(new Request(url,{method:'POST',body}),{})).status,401);assert.equal(f.opens,0);
 assert.equal((await handler(new Request(url,{method:'POST',headers:{...headers,authorization:'Bearer '+'c'.repeat(64)},body}),{})).status,403);
 for(const altered of [origin+'/wrong',url+'?token=no',origin+'/desk-email-task/foreign/mcp','https://other.example/desk-email-task/'+taskId+'/mcp'])assert.ok([403,404].includes((await handler(new Request(altered,{method:'POST',headers,body}),{})).status));
 for(const extra of [{host:'other.example'},{origin:'https://other.example'}])assert.equal((await handler(new Request(url,{method:'POST',headers:{...headers,...extra},body}),{})).status,403);
 assert.equal((await handler(new Request(url,{method:'PUT',headers,body}),{})).status,405);
 f.durable.expired=true;assert.equal((await handler(new Request(url,{method:'POST',headers,body}),{})).status,403);
});
test('actual SDK calls hold foreign IDs, altered PDF bytes/hash, oversize PDF, stale context, extra fields and conflicting writes',async t=>{
 const f=fixture(),client=await clientFor(f,t),call=(name,args)=>client.callTool({name,arguments:args});
 const held=async(name,args)=>assert.equal((await call(name,args)).isError,true);
 await held('evz_get_draft_task',{task_id:'foreign'});
 await held('evz_get_draft_task',{task_id:taskId,url:'https://forbidden.example'});
 const input={task_id:taskId,asset_id:'asset-one',version_id:'version-one',sha256:pdfHash};
 await held('evz_read_task_pdf',{...input,sha256:'f'.repeat(64)});
 await held('evz_read_task_pdf',{...input,asset_id:'foreign'});
 f.durable.pdf=Buffer.from('%PDF-corrupt');await held('evz_read_task_pdf',input);
 f.durable.pdf=Buffer.alloc(emailTaskMcpLimits.pdf+1);await held('evz_read_task_pdf',input);delete f.durable.pdf;
 await held('evz_submit_draft_result',{task_id:taskId,context_sha256:'f'.repeat(64),result});assert.equal(f.durable.saves,0);
 await call('evz_submit_draft_result',{task_id:taskId,context_sha256:contextHash,result});
 await held('evz_submit_draft_result',{task_id:taskId,context_sha256:contextHash,result:{...result,body:'Conflicting draft'}});assert.equal(f.durable.saves,1);
 await held('evz_submit_draft_result',{task_id:taskId,context_sha256:contextHash,result:{...result,operator:'owner'}});
});
test('bounded HTTP body fails before SDK execution and malformed protocol has no state effect',async()=>{
 const f=fixture(),headers={authorization:'Bearer '+credential,'content-type':'application/json',accept:'application/json, text/event-stream'};
 assert.equal((await f.handler()(new Request(url,{method:'POST',headers,body:'x'.repeat(emailTaskMcpLimits.request+1)}),{})).status,413);
 const response=await f.handler()(new Request(url,{method:'POST',headers,body:'{malformed'}),{});assert.equal(response.status,400);assert.equal(f.durable.saves,0);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('a lost SDK submission response is reconciled from the saved receipt before an identical retry',async t=>{
 const f=fixture(),ordinaryFetch=f.fetch;let lose=false;
 f.fetch=async(input,init)=>{const request=new Request(input,init),body=request.method==='POST'?await request.clone().text():'';const response=await ordinaryFetch(request);if(lose&&body.includes('evz_submit_draft_result')){lose=false;throw Error('Injected lost result acknowledgement');}return response;};
 const client=await clientFor(f,t);lose=true;
 await assert.rejects(client.callTool({name:'evz_submit_draft_result',arguments:{task_id:taskId,context_sha256:contextHash,result}}));
 const receipt=await client.callTool({name:'evz_get_draft_receipt',arguments:{task_id:taskId}});assert.deepEqual(receipt.structuredContent.result,result);assert.equal(f.durable.saves,1);
 const retry=await client.callTool({name:'evz_submit_draft_result',arguments:{task_id:taskId,context_sha256:contextHash,result}});assert.equal(retry.structuredContent.result_sha256,receipt.structuredContent.result_sha256);assert.equal(f.durable.saves,1);
});
test('real shared authority persists exact SDK proposal and PDF across fresh function instances with provider actions unchanged',async t=>{
 const f=await sharedFixture(),task='task',prepared=await createEmailDraftTask(f.app,{id:task,project_id:'p',revision:(await f.app.snapshot()).revision,token:sharedToken,replace_task_id:null},f.actor),before=await f.app.snapshot();
 const fetch=async(input,init)=>createEmailTaskMcp({openAuthority:()=>openFictionalEmailTaskAuthority(f.options)})(new Request(input,init),f.context);
 const client=new Client({name:'evz-shared-protocol-proof',version:'1.0.0'}),transport=new StreamableHTTPClientTransport(new URL(sharedOrigin+'/desk-email-task/'+task+'/mcp'),{fetch,requestInit:{headers:{Authorization:'Bearer '+sharedToken}}});
 await client.connect(transport);t.after(()=>client.close());
 const context=(await client.callTool({name:'evz_get_draft_task',arguments:{task_id:task}})).structuredContent;
 assert.equal(context.task.context_sha256,prepared.context_sha256);
 const file=await client.callTool({name:'evz_read_task_pdf',arguments:{task_id:task,...f.selection}});assert.deepEqual(Buffer.from(file.content[0].resource.blob,'base64'),f.bytes);
 const proposal={...result,source_ids:context.source_ids,attachments:[f.selection]},args={task_id:task,context_sha256:context.task.context_sha256,result:proposal};
 const saved=await client.callTool({name:'evz_submit_draft_result',arguments:args});assert.equal(saved.isError,undefined);assert.equal(saved.structuredContent.status,'Review');
 const receipt=await client.callTool({name:'evz_get_draft_receipt',arguments:{task_id:task}});assert.deepEqual(receipt.structuredContent.result,proposal);assert.equal(receipt.structuredContent.result_sha256,saved.structuredContent.result_sha256);
 const reopened=await f.open(),snapshot=await reopened.snapshot();assert.deepEqual(snapshot.email_draft_tasks[task].result,proposal);assert.deepEqual(snapshot.actions,before.actions);assert.deepEqual(snapshot.events,before.events);assert.equal(snapshot.prospects.p.reply_draft,before.prospects.p.reply_draft);
 const revision=snapshot.revision;await client.callTool({name:'evz_submit_draft_result',arguments:args});assert.equal((await reopened.snapshot()).revision,revision);
 f.advance(2*3600000+1);await assert.rejects(client.callTool({name:'evz_get_draft_receipt',arguments:{task_id:task}}));
});
