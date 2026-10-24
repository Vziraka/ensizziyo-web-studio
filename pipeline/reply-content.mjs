import {createHash} from 'node:crypto';
import {operatorDisplayName,evzIdentity} from './follow-up-template.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const limit=24_000;
const address=value=>{const matches=String(value??'').match(/[^\s<>\",;]+@[^\s<>\",;]+\.[^\s<>\",;]+/g)??[];return matches.length===1?matches[0].toLowerCase():'';};
const header=(m,name)=>{const values=(m.payload?.headers??[]).filter(h=>h.name?.toLowerCase()===name.toLowerCase());if(values.length>1||values.some(h=>typeof h.value!=='string'||/[\r\n]/.test(h.value)))throw Error('Ambiguous message headers');return values[0]?.value??'';};
function htmlText(value){
  // Conservative text projection only. Never render incoming HTML or follow its links.
  if(/<!--|<!\[|&(?!(?:amp|lt|gt|quot|apos|nbsp|#39);)/i.test(value))throw Error('HTML needs original-message review');
  return value.replace(/<(script|style|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g,(_,v)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ','#39':"'"}[v]));
}
function extract(payload){
  let count=0,total=0;const plain=[],html=[];
  function visit(p,depth=0){
    if(!p||depth>8||++count>80)throw Error('MIME tree exceeds bounds');
    if(p.filename||/attachment/i.test((p.headers??[]).find(h=>h.name?.toLowerCase()==='content-disposition')?.value??''))return;
    const mime=String(p.mime_type??p.mimeType??'').toLowerCase();
    if(mime.startsWith('multipart/')){if(!Array.isArray(p.parts)||!p.parts.length)throw Error('Missing MIME parts');for(const part of p.parts)visit(part,depth+1);return;}
    if(!['text/plain','text/html'].includes(mime))return;
    const b=p.body??{};let text=b.content??p.content;
    if(b.content!==undefined&&p.content!==undefined&&b.content!==p.content)throw Error('Ambiguous reply text representations');
    if(b.attachment_id||b.attachmentId||p.truncated||b.truncated)throw Error('Reply body is partial or requires a separate attachment read');
    if(text===undefined&&typeof b.data==='string'){
      if(!/^[A-Za-z0-9_-]*={0,2}$/.test(b.data)||b.data.length>limit*2)throw Error('Invalid encoded body');
      text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(b.data,'base64url'));
    }
    if(typeof text!=='string'||!text.trim()||text.includes('\ufffd'))throw Error('Reply body is missing or unreadable');
    if(b.size!==undefined&&(!Number.isSafeInteger(b.size)||b.size!==Buffer.byteLength(text)))throw Error('Reply body size differs from complete source');
    total+=Buffer.byteLength(text);if(total>limit||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw Error('Reply body exceeds text bounds');
    (mime==='text/plain'?plain:html).push(text);
  }
  visit(payload);const bodies=plain.length?plain:html.map(htmlText);
  if(bodies.length!==1)throw Error('Reply has missing or ambiguous text parts');
  return {text:bodies[0].replace(/\r\n?/g,'\n').trim(),format:plain.length?'text/plain':'text/html projection'};
}
export function replyContent(message,threadId){
  let identity={message_id:message.id,thread_id:threadId};
  try{identity={message_id:message.id,thread_id:threadId,message_header_id:header(message,'Message-ID'),in_reply_to:header(message,'In-Reply-To'),from:address(header(message,'From')),to:address(header(message,'To')),subject:header(message,'Subject')};
    if(!identity.message_header_id||!identity.from||!identity.to||header(message,'Reply-To')&&address(header(message,'Reply-To'))!==identity.from||header(message,'Cc')||header(message,'Bcc'))throw Error('Reply routing needs original-message review');
    if(Buffer.byteLength(JSON.stringify(message.payload??{}))>96_000)throw Error('MIME source exceeds bounds');
    const body=extract(message.payload);if(!body.text)throw Error('Reply text is empty');
    const references=header(message,'References');
    const content={...identity,...(references?{references}:{}),...body,mime_sha256:hash(message.payload),body_sha256:hash(body.text),status:'Complete'};
    return {...content,source_sha256:hash(content)};
  }catch(error){return {...identity,status:'Held',hold:error.message};}
}
export function retainReplyThread(thread){
  if(!Array.isArray(thread.messages)||thread.messages.length>=20||thread.messages.some(m=>!Array.isArray(m.payload?.headers)||m.payload.headers.length>80||Buffer.byteLength(JSON.stringify(m.payload.headers))>16_000))throw Error('Missing, truncated or oversized reply thread headers');
  return {id:thread.id,messages:thread.messages?.map(m=>({id:m.id,thread_id:m.thread_id,internal_date:m.internal_date,label_ids:m.label_ids,payload:{headers:m.payload?.headers},reply_content:m.reply_content??replyContent(m,thread.id)}))};
}
export function validReplySource(reply){
  const c=reply?.content;if(!c||c.status!=='Complete'||c.message_id!==reply.source_id||c.thread_id!==reply.thread_id||typeof c.text!=='string'||Buffer.byteLength(c.text)>limit||c.body_sha256!==hash(c.text))return false;
  const {source_sha256,...source}=c;return source_sha256===hash(source);
}
function currentText(text){
  const lines=text.split('\n'),kept=[];
  for(const line of lines){if(/^\s*(?:>|On .{1,300}wrote:|From:|[-_]{3,}\s*(?:Original|Forwarded)|--\s*$|Sent from my )/i.test(line))break;kept.push(line);}
  return kept.join('\n').trim();
}
export function replySuggestion(record){
  const reply=record.reply;
  if(!validReplySource(reply))return {status:'Held',hold:reply?.content?.hold??'A complete verified reply body is required. Review the original in the business mailbox.'};
  const text=currentText(reply.content.text),excerpt=text.slice(0,900);
  if(!text)return {status:'Held',hold:'Only quoted history or a signature was found. Review the original message.'};
  const summary={method:'Extractive preview; no semantic model',excerpt,excerpt_truncated:text.length>900,removed_history_or_signature:text!==reply.content.text};
  if(record.restriction||reply.kind!=='reply')return {status:'Held',summary,hold:'This contact or automatic reply is held. Verify disposition and return details; never automatically resume outreach.'};
  // This only withholds a starter; it never classifies disposition, resumes contact or books a time.
  if(/\b(?:unsubscribe|remove me|stop|not interested|do not contact|undeliver|delivery fail(?:ed|ure)?|out of (?:the )?office|automatic reply|vacation)\b/i.test(text))return {status:'Held',summary,hold:'Possible refusal, delivery issue or automatic reply. Decide the disposition before drafting in the original mailbox.'};
  let next='What would you most like to improve, and which part should we focus on first?';
  if(/\b(?:busy|call (?:me |us )?back|callback)\b/i.test(text))next='What day, time and time zone would work for a callback?';
  else if(/\b(?:when|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|available|meeting)\b/i.test(text))next='Could you confirm the date, time and time zone you have in mind?';
  else if(/\b(?:price|cost|quote|pricing|budget)\b/i.test(text))next='Which deliverables and main goal should a quote cover?';
  else if(/\bwebsite\b/i.test(text))next='Which website page or customer journey would you most like to focus on?';
  return {status:'Starter',summary,body:`Hi,\n\nThanks for getting back to me.\n\n${next}`,method:'Conservative rule-based clarification starter; edit after reading the full reply. No factual answer or intent assessment was generated.'};
}
export function replyDraftContent(record,body,actor,config){
  if(!validReplySource(record.reply))throw Error('A complete verified reply body is required');
  const c=record.reply.content;
  return {from:evzIdentity.email,to:c.from,thread_id:c.thread_id,in_reply_to:c.message_header_id,source_id:c.message_id,source_sha256:c.source_sha256,subject:/^re:/i.test(c.subject)?c.subject:`Re: ${c.subject}`,body:body.trim(),signature:`${operatorDisplayName(actor,config)}\n${evzIdentity.name}\n${evzIdentity.email}\n${evzIdentity.phone}`,prepared_by:actor};
}
export function replyDraftCurrent(record,draft){return Boolean(['Reply review','Discovery','Information requested'].includes(record.stage)&&!record.restriction&&record.reply?.kind==='reply'&&record.contact?.verified===true&&record.contact.email?.toLowerCase()===record.reply.content?.from&&validReplySource(record.reply)&&draft?.source_sha256===record.reply.content.source_sha256&&draft.reply_sha256===hash(record.reply)&&draft.owner===(record.follow_up_owner??null)&&draft.sha256===hash(draft.content));}
