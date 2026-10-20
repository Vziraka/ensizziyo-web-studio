// Shared by the browser preview and the native email handoff. Call notes select a topic;
// private notes are never copied verbatim into a customer message.
export const evzIdentity = Object.freeze({name:'EVZ Digital team',email:'hello@evzdigital.studio',phone:'571-752-9610',website:'https://evzdigital.studio/studio/'});
export const followUpOutcomes = ['no_answer','busy','voicemail','connected','callback'];
const topics={
  ai:{label:'AI enquiry handling',idea:'an AI assistant that collects enquiry details and prepares a clear follow-up summary for your team',path:'studio/demos/voice/',demo:'AI receptionist demo',image:'studio/assets/voice-demo-preview.png'},
  systems:{label:'business systems',idea:'a connected workflow that brings requests and next steps into one place for your team',path:'relay-motion/',demo:'Business workflow demonstration',image:null},
  website:{label:'your website',idea:'a website journey that makes it easier for customers to understand your services and enquire',path:'homekind-motion/',demo:'Home-service website demonstration',image:null},
  marketing:{label:'marketing',idea:'a focused campaign page and clearer enquiry journey built around your offer',path:'sola-motion/',demo:'Campaign website demonstration',image:null},
  undecided:{label:'practical AI and digital systems',idea:'a practical AI or digital workflow shaped around the work you want to improve',path:'studio/work/',demo:'Explore our independent demonstrations',image:null}
};
const clean=s=>String(s??'').replace(/[<>\r\n]/g,' ').replace(/{{|}}/g,'').trim();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
export function followUpFocus(call={}){
  if(Object.hasOwn(topics,call.focus)&&call.focus!=='undecided')return call.focus;
  const note=String(call.note??'');
  const matches=[['ai',/\b(?:AI|voice agent|receptionist|missed calls?|enquir(?:y|ies)|inquir(?:y|ies))\b/i],['systems',/\b(?:CRM|workflow|business systems?|admin|integration|scheduling)\b/i],['website',/\b(?:website|web design|site redesign)\b/i],['marketing',/\b(?:marketing|advertising|campaign|social media|SEO)\b/i]].filter(([,pattern])=>pattern.test(note));
  return matches.length===1?matches[0][0]:'undecided';
}
export function composeFollowUp(record,call={},config={}){
  const options=config.follow_up??{},base=https(options.public_origin)||'https://evzdigital.studio/';
  const focus=followUpFocus(call),topic=topics[focus],connected=call.outcome==='connected',callback=call.outcome==='callback';
  const ownerEmail=record.research_profile?.business_email,recipientName=ownerEmail?.kind==='Owner/operator business'&&ownerEmail.email===record.contact?.email?ownerEmail.person_name:null;
  const name=clean(record.name).slice(0,180),person=clean(record.verification?.conversation?.decision_maker??record.contact?.name??recipientName);
  const salutation=person&&person.split(/\s+/).length<=5?`Hi ${person.split(/\s+/)[0]},`:'Hi,';
  const introduction=connected?'Thanks for speaking with me earlier. I wanted to follow up with an example of our work.':callback?'Thanks for your time earlier. I’ve noted the request for a callback and included an example of our work below.':`I tried calling ${name} today and wanted to share a practical example of our work.`;
  const trade=clean(record.business_type?.subtype),area=clean(record.area);
  const context=trade?`For your ${trade==='HVAC'?'HVAC':trade.toLowerCase()} enquiries${area?` in ${area}`:''}, one option we could explore is ${topic.idea}.`:`One option we could explore is ${topic.idea}.`;
  const paragraphs=[salutation,introduction,context,'I’ve included a short voice-agent example below. We would shape the right solution around your goals.'];
  const demo_url=new URL(topics.ai.path,base).href,preview_image=new URL(topics.ai.image,base).href;
  const relevant_url=focus!=='ai'?new URL(topic.path,base).href:null;
  const booking_url=https(options.booking_url),postal_address=String(config.sender?.postal_address??'').trim();
  const subject=clean(`${name} — ${connected?`following up on ${topic.label}`:callback?'the example for our next conversation':`an idea to explore`}`).slice(0,180);
  const body=paragraphs.join('\n\n');
  const next=booking_url?'Reply here with any questions, or book a 20-minute conversation to explore what would fit your business.':'Reply here with any questions and we can arrange a 20-minute conversation.';
  const footer='This is a business introduction from EVZ Digital. Reply “stop” to opt out of further marketing.';
  const text=[body,`AI receptionist demo: ${demo_url}`,relevant_url?`${topic.demo}: ${relevant_url}`:null,next,booking_url,`Best,\n${evzIdentity.name}\nAI solutions & digital systems\n${evzIdentity.email}\n${evzIdentity.phone}\n${evzIdentity.website}`,postal_address||'Business mailing address pending',footer].filter(Boolean).join('\n\n');
  return {subject,body,paragraphs,focus,demo_label:topics.ai.demo,demo_url,preview_image,relevant_label:topic.demo,relevant_url,booking_url,postal_address,next,footer,text,to:record.contact?.email??null};
}
export function followUpSetupIssues(config={}){
  const issues=[];
  if(!config.sender?.postal_address?.trim()||/pending|placeholder|to be supplied/i.test(config.sender.postal_address))issues.push('Choose the business mailing address for the footer');
  if(config.sender?.email!==evzIdentity.email||!config.follow_up?.sender_verified)issues.push('Verify hello@evzdigital.studio as the sending address');
  if(!https(config.follow_up?.booking_url))issues.push('Connect the Google Calendar booking page');
  if(!config.follow_up?.demo_verified)issues.push('Verify the published demo and media links');
  return issues;
}
export function renderFollowUpHtml(message){
  const copy=message.paragraphs.map(p=>`<p style="margin:0 0 20px">${escape(p)}</p>`).join('');
  const image=message.preview_image?`<a href="${escape(message.demo_url)}"><img alt="${escape(message.demo_label)}" src="${escape(message.preview_image)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>`:'';
  const booking=message.booking_url?` <a href="${escape(message.booking_url)}">Book a 20-minute conversation</a>.`:'';
  const relevant=message.relevant_url?`<p><a href="${escape(message.relevant_url)}">${escape(message.relevant_label)} →</a></p>`:'';
  return `<div style="font:16px/1.65 Arial,Helvetica,sans-serif;color:#202020;max-width:600px">${copy}<div style="border:1px solid #e3e4e8;border-radius:9px;overflow:hidden;margin:24px 0">${image}<div style="padding:20px;background:#f4f5f7"><strong style="font-size:18px">${escape(message.demo_label)}</strong><p style="margin:8px 0 18px">Hear a sample call, then try the agent yourself.</p><a href="${escape(message.demo_url)}" style="display:inline-block;padding:12px 20px;background:#202020;color:#fff;text-decoration:none;border-radius:5px">Open demo page →</a></div></div>${relevant}<p>Reply here with any questions.${booking}</p><p>Best,</p><table role="presentation" cellspacing="0" cellpadding="0" style="font:14px/1.65 Arial,Helvetica,sans-serif;width:100%;max-width:400px;table-layout:fixed"><tr><td style="width:93px;padding-right:20px;border-right:1px solid #ddd;vertical-align:middle"><img src="https://evzdigital.studio/studio/assets/evz-wordmark.png" alt="EVZ" width="72" style="display:block;border:0"></td><td style="padding-left:20px;overflow-wrap:anywhere;word-break:break-word"><strong style="font-size:16px">${evzIdentity.name}</strong><br><span style="font-size:12px;color:#656b73">AI solutions &amp; digital systems</span><br><a href="mailto:${evzIdentity.email}" style="color:#202020;text-decoration:none">${evzIdentity.email}</a><br><a href="tel:+15717529610" style="color:#202020;text-decoration:none">${evzIdentity.phone}</a><br><a href="${evzIdentity.website}" style="color:#656b73;text-decoration:none">evzdigital.studio</a></td></tr></table><div style="border-top:1px solid #eee;padding-top:16px;margin-top:24px;font:11px/1.7 Arial,Helvetica,sans-serif;color:#656b73">${escape(message.postal_address||'Business mailing address pending')}<br>${escape(message.footer)}</div></div>`;
}

// Authenticated local preview uses the same message and renderer as the executor.
export function renderFollowUpPreview(entry){
  const message=entry.content,body=renderFollowUpHtml(message).replaceAll('https://evzdigital.studio/studio/assets/','/assets/');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saved follow-up preview — EVZ Digital</title><style>@media(max-width:540px){main{margin:0!important;border-radius:0!important}main>header,main>article{padding:24px!important}}</style><body style="margin:0;background:#f3f4f5;font:14px/1.6 Arial,Helvetica,sans-serif;color:#202020"><main style="max-width:680px;margin:32px auto;background:white;border:1px solid #ddd;border-radius:10px;overflow:hidden"><header style="padding:24px 36px;border-bottom:1px solid #eee"><p style="margin:0 0 12px;color:#656b73">Saved email preview · ${escape(entry.status)} · this page sends nothing</p><h1 style="font-size:21px;margin:0 0 16px">${escape(message.subject)}</h1><strong>EVZ Digital team</strong> &lt;${evzIdentity.email}&gt;<br>To: ${escape(message.to??'Verified business email needed')}</header><article style="padding:30px 36px">${body}</article></main></body></html>`;
}
