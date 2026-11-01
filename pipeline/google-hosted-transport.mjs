import {createHash} from 'node:crypto';
import {check,hash} from './lifecycle.mjs';
import {replyContent} from './reply-content.mjs';

export const gmailScopes=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'];
const identityScopes=['openid','https://www.googleapis.com/auth/userinfo.email'];
export const mailLimits={attachments:20_000_000,mime:28_000_000,response:38_000_000};
export const byteHash=value=>createHash('sha256').update(value).digest('hex');
export const mailMessageId=intent=>'<evz.'+byteHash(intent)+'@evzdigital.studio>';
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const address=v=>typeof v==='string'&&/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(v)&&v.length<255;
const line=v=>typeof v==='string'&&v.length<=600&&!/[\x00-\x1f\x7f]/.test(v);
const msgId=v=>typeof v==='string'&&/^<[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+>$/.test(v)&&v.length<255;
const wrap=bytes=>bytes.toString('base64').match(/.{1,76}/g)?.join('\r\n')??'';
const traceHeaders=new Set(['received','x-received','dkim-signature','x-google-dkim-signature','x-gm-message-state','x-google-smtp-source','return-path','delivered-to','authentication-results','arc-seal','arc-message-signature','arc-authentication-results']);
function subject(value){
 check(line(value)&&value.trim()&&Buffer.from(value).toString('utf8')===value,'Unsafe subject');
 if(/^[\x20-\x7e]+$/.test(value))return value;
 const chunks=[];let part='';for(const char of value){if(Buffer.byteLength(part+char)>36){chunks.push(part);part='';}part+=char;}if(part)chunks.push(part);
 return chunks.map(p=>'=?UTF-8?B?'+Buffer.from(p).toString('base64')+'?=').join('\r\n ');
}
export function composeExactMail(p,intent,at,attachments=[]){
 check(address(p.from)&&address(p.to)&&p.from==='hello@evzdigital.studio','One exact business sender and recipient required');
 check(typeof p.body==='string'&&p.body.trim()&&Buffer.byteLength(p.body)<=32_000&&Buffer.from(p.body).toString('utf8')===p.body&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(p.body),'Invalid exact body');
 check(!p.thread_id||id(p.thread_id)&&msgId(p.in_reply_to)&&Array.isArray(p.references)&&p.references.length>0&&p.references.length<=30&&new Set(p.references).size===p.references.length&&p.references.every(msgId)&&p.references.at(-1)===p.in_reply_to,'Reply needs exact thread and RFC References/In-Reply-To');
 check(attachments.length===p.attachments.length&&attachments.length<=2,'Exact attachment package required');
 let total=0;for(let i=0;i<attachments.length;i++){
  const a=p.attachments[i],b=attachments[i];total+=b.length;
  check(a.mime==='application/pdf'&&/^[a-zA-Z0-9_-]{1,80}\.pdf$/.test(a.filename)&&Buffer.isBuffer(b)&&b.length===a.bytes&&byteHash(b)===a.sha256&&b.subarray(0,5).toString()==='%PDF-','Attachment bytes or safe PDF metadata differ');
 }
 check(total<=mailLimits.attachments,'Attachment exceeds 20,000,000-byte adapter ceiling; a separate approved Drive-link route is required');
 const message_id=mailMessageId(intent),boundary='evz_'+byteHash(intent),date=new Date(at);
 check(Number.isFinite(+date),'Exact reservation date required');
 const headers=[`From: ${p.from}`,`To: ${p.to}`,`Subject: ${subject(p.subject)}`,`Date: ${date.toUTCString()}`,`Message-ID: ${message_id}`,'MIME-Version: 1.0'];
 if(p.thread_id)headers.push(`In-Reply-To: ${p.in_reply_to}`,`References: ${p.references.join('\r\n ')}`);
 const text=['Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(Buffer.from(p.body))].join('\r\n');
 let content=text;
 if(attachments.length){headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);content=`--${boundary}\r\n${text}\r\n`+attachments.map((b,i)=>`--${boundary}\r\nContent-Type: application/pdf; name="${p.attachments[i].filename}"\r\nContent-Disposition: attachment; filename="${p.attachments[i].filename}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b)}\r\n`).join('')+`--${boundary}--`;}else headers.push('Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64');
 const raw=Buffer.from(headers.join('\r\n')+'\r\n\r\n'+(attachments.length?content:wrap(Buffer.from(p.body))));
 check(raw.length<=mailLimits.mime,'Encoded MIME exceeds 28,000,000-byte adapter ceiling');return {raw,message_id,thread_id:p.thread_id??null};
}
function parseRaw(bytes,depth=0){
 check(depth<=2&&bytes.length<=mailLimits.mime,'MIME exceeds readback bounds');
 const wire=bytes.toString('latin1'),split=wire.indexOf('\r\n\r\n');check(split>0&&split<16_000,'Incomplete MIME headers');
 const head=wire.slice(0,split);check(!/[^\x09\x20-\x7e\r\n]/.test(head),'Unsupported MIME headers');
 const headers={};for(const h of head.replace(/\r\n[ \t]+/g,' ').split('\r\n')){const m=/^([a-zA-Z0-9-]+):[ \t]*(.*)$/.exec(h);check(m,'Invalid MIME header');const name=m[1].toLowerCase();check(!headers[name]||traceHeaders.has(name),'Ambiguous duplicate MIME headers');headers[name]=m[2];}
 const body=wire.slice(split+4),type=headers['content-type']??'';
 if(type.startsWith('multipart/mixed;')){const match=/^multipart\/mixed; boundary="([a-zA-Z0-9_-]{1,80})"$/.exec(type);check(match,'Unsupported multipart MIME');const chunks=body.split('--'+match[1]);check(chunks[0]===''&&/^--(?:\r\n)?$/.test(chunks.at(-1))&&chunks.length<=6,'Incomplete or excessive MIME parts');return {headers,parts:chunks.slice(1,-1).map(c=>{check(c.startsWith('\r\n')&&c.endsWith('\r\n'),'Malformed MIME part');return parseRaw(Buffer.from(c.slice(2,-2)),depth+1);})};}
 check(headers['content-transfer-encoding']==='base64'&&/^(?:text\/plain; charset=UTF-8|application\/pdf; name="[a-zA-Z0-9_-]{1,80}\.pdf")$/.test(type),'Unsupported MIME content or transfer encoding');
 const encoded=body.replace(/\r\n/g,'');check(/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)&&Buffer.from(encoded,'base64').toString('base64')===encoded,'Invalid MIME base64');
 return {headers,body_sha256:byteHash(Buffer.from(encoded,'base64')),bytes:Buffer.from(encoded,'base64').length};
}
export function verifySentRaw(message,expected){
 check(id(message?.id)&&id(message.threadId)&&message.labelIds?.includes('SENT')&&(!expected.thread_id||message.threadId===expected.thread_id),'Sent message thread/labels differ');
 check(typeof message.raw==='string'&&message.raw.length<=mailLimits.response&&/^[A-Za-z0-9_-]+={0,2}$/.test(message.raw),'Missing or oversized complete raw MIME');
 const actual=parseRaw(Buffer.from(message.raw,'base64url')),wanted=parseRaw(expected.raw);check(wanted.headers['message-id']===expected.message_id,'Reserved RFC Message-ID differs');
 function compare(a,b,top=false){
  const names=top?['from','to','subject','date','message-id','in-reply-to','references','mime-version','content-type','content-transfer-encoding']:['content-type','content-transfer-encoding','content-disposition'];
  for(const name of names)check(a.headers[name]===b.headers[name],`Sent ${name} differs from approved MIME`);
  check(Object.keys(a.headers).every(n=>names.includes(n)||top&&traceHeaders.has(n)),'Unexpected unapproved MIME headers');
  check(!Object.keys(a.headers).some(n=>/^(?:cc|bcc|reply-to|sender|resent-)/.test(n)),'Unexpected recipient or routing headers');
  check(a.body_sha256===b.body_sha256&&a.bytes===b.bytes&&(a.parts?.length??0)===(b.parts?.length??0),'Sent complete body or attachment bytes differ');
  for(let i=0;i<(b.parts?.length??0);i++)compare(a.parts[i],b.parts[i]);
 }
 compare(actual,wanted,true);return {message_id:message.id,thread_id:message.threadId,rfc_message_id:expected.message_id,mime_sha256:byteHash(expected.raw),verification:'Exact sender Sent readback; recipient delivery not established'};
}

// These same parsers consume real bounded responses and inert store replay observations.
export async function mailPreflight(request,account){
 const profile=await request('profile');check(profile.emailAddress===account,'Gmail business owner differs');const aliases=await request('settings/sendAs');check(Array.isArray(aliases.sendAs)&&aliases.sendAs.filter(a=>a.sendAsEmail==='hello@evzdigital.studio'&&a.verificationStatus==='accepted').length===1,'Accepted hello@evzdigital.studio send-as identity required');
 return profile;
}
export async function mailFreshSource(request,p){
 if(!p.reply_source){const suffix=p.kind==='requested-information'?(check(Number.isFinite(Date.parse(p.requested_source_at)),'Exact requested source time required'),' after:'+Math.floor(Date.parse(p.requested_source_at)/1000)):'';const result=await request('messages?'+new URLSearchParams({q:'from:'+p.to+suffix,maxResults:'10'}));check(!result.nextPageToken&&(!result.messages||Array.isArray(result.messages)&&result.messages.length===0),'Mailbox contains an unbound prior reply; import and review it before dispatch');return {no_prior_incoming:true};}
 check(p.reply_source?.content?.status==='Complete','Complete prior reply provenance is required');const c=p.reply_source.content;
 const thread=await request('threads/'+encodeURIComponent(c.thread_id)+'?format=full',{max:2_000_000});
 check(thread.id===c.thread_id&&Array.isArray(thread.messages)&&thread.messages.length>0&&thread.messages.length<20&&!thread.nextPageToken,'Missing, truncated or excessive current reply thread');
 const source=thread.messages.find(m=>m.id===c.message_id),latest=thread.messages.at(-1);
 check(source&&latest.id===source.id&&source.threadId===c.thread_id&&!source.labelIds?.includes('SENT'),'Reply changed or later provider message exists; review current thread');
 const time=Number(source.internalDate);check(Number.isSafeInteger(time)&&time===Date.parse(p.reply_source.at)&&new Set(thread.messages.map(m=>m.id)).size===thread.messages.length&&thread.messages.every(m=>id(m.id)&&m.threadId===thread.id&&Number.isSafeInteger(Number(m.internalDate))&&Number(m.internalDate)<=time&&(m.id===source.id||Number(m.internalDate)<time)),'Reply chronology or complete provider identity changed');
 const content=replyContent(source,thread.id);
 check(content.status==='Complete'&&['message_header_id','in_reply_to','from','to','subject','body_sha256'].every(k=>content[k]===c[k])&&(content.references??'')===(c.references??''),'Fresh reply source differs from retained original provenance');return {source_id:c.message_id,thread_id:thread.id,body_sha256:c.body_sha256};
}
export function mailSendBody(expected){return {raw:expected.raw.toString('base64url'),...(expected.thread_id?{threadId:expected.thread_id}:{})};}
export function mailObservationJSON(value){
 const pending=[value];let count=0;while(pending.length){const next=pending.pop();if(!next||typeof next!=='object')continue;check(++count<=200000,'Gmail JSON exceeds bounded structure');for(const [key,v]of Object.entries(next)){check(!['accesstoken','refreshtoken','idtoken','clientsecret','credentialkey','authorization','error','errordescription','errormessage'].includes(key.replaceAll('_','').toLowerCase()),'Credential or error response is not Gmail success evidence');if(v&&typeof v==='object')pending.push(v);}}return value;
}
export function mailSendResponse(sent,expected){check(id(sent?.id)&&id(sent.threadId)&&(!expected.thread_id||sent.threadId===expected.thread_id),'Send identity incomplete; reconcile only');return {id:sent.id,thread_id:sent.threadId};}
export async function mailSentReadback(request,expected,known=null,max=mailLimits.response,sentTimestamp=false){
 let ids=[];
 if(known)ids=[known];else{let page;const seen=new Set();for(let n=0;n<3;n++){
  const query=new URLSearchParams({q:'in:sent rfc822msgid:'+expected.message_id,maxResults:'10',...(page?{pageToken:page}:{})}),result=await request('messages?'+query);
  check(result.messages===undefined||Array.isArray(result.messages)&&result.messages.length<=10,'Invalid Gmail search result');ids.push(...(result.messages??[]).map(m=>m.id));
  check(ids.every(id)&&new Set(ids).size===ids.length&&ids.length<=10,'Ambiguous Sent Message-ID search');page=result.nextPageToken;if(!page)break;check(typeof page==='string'&&page.length<=500&&!seen.has(page)&&n<2,'Truncated or looping Sent search');seen.add(page);
 }}
 check(ids.length===1,'Sent search empty or ambiguous; uncertain intent must never resend');
 const raw=await request('messages/'+encodeURIComponent(ids[0])+'?format=raw',{max});check(raw.id===ids[0],'Sent readback identity changed');const receipt=verifySentRaw(raw,expected);
 if(sentTimestamp){const time=Number(raw.internalDate);check(Number.isSafeInteger(time)&&time>0&&Number.isFinite(+new Date(time)),'Actual provider send timestamp required');receipt.sent_at=new Date(time).toISOString();}
 return receipt;
}
// Credentials exist only in this server-owned closure; the owner grant supplies them.
export function googleHostedTransport({getAccessToken,fetcher=fetch,account,grantId,requiredProfile=null,observations=null,rawResponseMax=mailLimits.response,now=()=>new Date(),signal:sessionSignal}={}){
 let observedGrant=null;
 async function request(path,{method='GET',body,max=120_000,guard=async()=>{},signal:operationSignal,onPost=()=>{}}={}){
  const signal=AbortSignal.any([operationSignal,sessionSignal,AbortSignal.timeout(25_000)].filter(Boolean));
  const alive=()=>check(!signal.aborted,'Gmail request deadline expired; retain the original intent');
  async function bounded(start){alive();let abort;const expired=new Promise((_,reject)=>{abort=()=>reject(Error('Gmail request deadline expired; retain the original intent'));signal.addEventListener('abort',abort,{once:true});});try{const result=await Promise.race([start(),expired]);alive();return result;}finally{signal.removeEventListener('abort',abort);}}
  let token,response,requestGrant=null,size=0,chunks=[],failure='NETWORK',recorded=false;
  const metadata=()=>token?Object.fromEntries(['profile','account','grant_id','scopes','expires_at'].map(k=>[k,token[k]])):null;
  const observe=value=>{if(observations){observations.push({path,method,body_sha256:hash(body??null),...value,at:now().toISOString(),grant:requestGrant});recorded=true;}};
  try{
   check(typeof getAccessToken==='function','New hosted owner OAuth grant is unavailable');
   if(requiredProfile)check(typeof getAccessToken.assertCurrent==='function'&&typeof getAccessToken.assertGrant==='function','Independent exact mail current/grant readers required');
   await bounded(guard);
   try{token=await bounded(()=>getAccessToken());}catch{throw Error('Hosted Google authorization unavailable; owner reauthorization required');}
   const exactToken=()=>check((!requiredProfile||token?.profile===requiredProfile)&&token?.account===account&&token.grant_id===grantId&&typeof token.access_token==='string'&&/^[\x21-\x7e]{10,8192}$/.test(token.access_token)&&Number.isSafeInteger(token.expires_at)&&token.expires_at>(requiredProfile?+now():Date.now())+30_000&&Array.isArray(token.scopes)&&new Set(token.scopes).size===token.scopes.length&&gmailScopes.every(s=>token.scopes.includes(s))&&(requiredProfile?token.scopes.length===4&&identityScopes.every(s=>token.scopes.includes(s)):token.scopes.length===gmailScopes.length||token.scopes.length===4&&identityScopes.every(s=>token.scopes.includes(s))),'Exact hosted gmail.readonly + gmail.send grant/account required; only essential OpenID email identity may accompany it');
   async function live(){alive();exactToken();if(getAccessToken.assertCurrent)await bounded(()=>getAccessToken.assertCurrent(token));if(getAccessToken.assertGrant)await bounded(()=>getAccessToken.assertGrant(metadata()));await bounded(guard);alive();exactToken();requestGrant=metadata();observedGrant=requestGrant;}
   await live();
   try{if(method==='POST')onPost();response=await bounded(()=>fetcher('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{method,headers:{Authorization:'Bearer '+token.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal}));}catch{throw Error('Gmail response unavailable; never retry an uncertain send');}
   try{await live();}catch(error){void response.body?.cancel().catch(()=>{});throw error;}
   if(!response.ok){failure='HTTP';await bounded(()=>response.body?.cancel());await live();if(response.status===401&&typeof getAccessToken.invalidate==='function'){try{await bounded(()=>getAccessToken.invalidate(token));}catch{}}const error=Error(response.status===403?'Gmail 403: exact grant/API or send-as access unavailable; verify required grant without expanding scopes':`Gmail ${response.status}: held; automatic retry disabled`);error.status=response.status;throw error;}
   check(response.body,'Gmail response incomplete');const reader=response.body.getReader();
   try{for(;;){const {value,done}=await bounded(()=>reader.read());await live();if(done)break;size+=value.length;if(size>max){failure='OVERSIZE';throw Error('Gmail response exceeds bounded read');}chunks.push(Buffer.from(value));}}finally{const cancelled=reader.cancel();try{await bounded(()=>cancelled);}catch(error){void cancelled.catch(()=>{});throw error;}}
   await live();let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{failure='INVALID_JSON';throw Error('Gmail returned invalid JSON; held without retry');}
   if(requiredProfile&&path.endsWith('?format=raw')){const {raw,...metadata}=value;check(Buffer.byteLength(JSON.stringify(metadata))<=120_000,'Gmail raw metadata exceeds bounded read');}
   failure='INVALID_JSON';check(value&&typeof value==='object'&&!Array.isArray(value),'Gmail returned unsupported JSON; held without retry');if(requiredProfile)mailObservationJSON(value);observe({value});return value;
  }catch(error){if(!recorded)observe({error:{code:signal.aborted||/deadline|expired/i.test(error.message)?'DEADLINE':failure,status:Number.isInteger(response?.status)?response.status:null,bytes:size,body_sha256:failure!=='OVERSIZE'&&chunks.length?byteHash(Buffer.concat(chunks)):null}});throw error;}
 }
 return {
  observations,grant:()=>structuredClone(observedGrant),
  incomingProfile:()=>request('profile'),
  incomingHistory:(cursor,page)=>request('history?'+new URLSearchParams({startHistoryId:cursor,maxResults:'50',...(page?{pageToken:page}:{})}),{max:250_000}),
  incomingThread:thread=>request('threads/'+encodeURIComponent(thread)+'?format=full',{max:2_000_000}),
  mailboxList:(after,page)=>{check(typeof after==='string'&&Number.isFinite(Date.parse(after))&&(!page||typeof page==='string'&&page.length<=500),'Bounded mailbox search required');return request('messages?'+new URLSearchParams({q:'after:'+Math.floor(Date.parse(after)/1000)+' -in:sent -in:drafts -in:spam -in:trash',maxResults:'50',...(page?{pageToken:page}:{})}),{max:250_000});},
  mailboxMessage:message=>{check(id(message),'Exact Gmail message ID required');return request('messages/'+encodeURIComponent(message)+'?format=full',{max:2_000_000});},
  async preflight(options={}){await mailPreflight((path,more)=>request(path,{...options,...more}),account);return {account,from:'hello@evzdigital.studio',grant_id:grantId};},
  freshSource:(p,options={})=>mailFreshSource((path,more)=>request(path,{...options,...more}),p),
  async send(expected,options={}){return mailSendResponse(await request('messages/send',{...options,method:'POST',body:mailSendBody(expected)}),expected);},
  reconcileSent:(expected,known=null,options={})=>mailSentReadback((path,more)=>request(path,{...options,...more}),expected,known,typeof rawResponseMax==='function'?rawResponseMax():rawResponseMax,options.sentTimestamp===true)
 };
}
