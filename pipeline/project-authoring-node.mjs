// Deterministic declarative composition. No filesystem, network, subprocess or imported-PDF execution.
import {PDFDocument,PDFHexString,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {createHash} from 'node:crypto';

export const nodePDFRenderer='node-pdf-v1';
export const nodePDFDependencies={'pdf-lib':'1.17.1','@pdf-lib/fontkit':'1.1.1'};
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);};
const key=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&v!=='__proto__';
const plain=(v,max=6000)=>{check(typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x08\x0b-\x1f\x7f]/.test(v),'Invalid bounded layout text');return v;};
const number=(v,min,max)=>{check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,'Layout coordinates exceed page bounds');return v;};
const color=v=>{check(/^#[A-Fa-f0-9]{6}$/.test(v),'Use an exact RGB color');return rgb(...[1,3,5].map(i=>parseInt(v.slice(i,i+2),16)/255));};
const fields=(value,keys)=>check(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k)),'Unsupported renderer/resource fields');

// Portable bytes are registered by a trusted caller, never a path or URL in authored content.
export function nodePDFResources(runtime,project){
 fields(runtime,['renderer','resources','fonts','images','wordmark','proposal_template']);
 check(runtime.renderer===nodePDFRenderer,'Select the explicit Node PDF renderer');
 check(runtime.resources&&Object.keys(runtime.resources).length>=2&&Object.keys(runtime.resources).length<=32,'Register 2-32 exact rendering resources');
 const resources=new Map();let total=0;
 for(const [id,r] of Object.entries(runtime.resources)){
  fields(r,['name','sha256','bytes_base64','project_id','provenance','media_type']);
  check(key(id)&&key(r.name)&&/^[a-f0-9]{64}$/.test(r.sha256??'')&&typeof r.bytes_base64==='string'&&r.bytes_base64.length<=24_000_000,'Unsafe or excessive registered resource');
  const bytes=Buffer.from(r.bytes_base64,'base64');total+=bytes.length;
  check(bytes.length>0&&bytes.length<=16_000_000&&total<=24_000_000&&bytes.toString('base64')===r.bytes_base64&&sha(bytes)===r.sha256,'Registered resource hash/size changed');
  check(['font/ttf','image/png','image/jpeg','application/pdf'].includes(r.media_type)&&typeof r.provenance==='string'&&r.provenance.trim()&&r.provenance.length<=1200,'Unsupported resource type/provenance');
  if(r.media_type.startsWith('image/'))check(r.project_id===project||id===runtime.wordmark&&r.project_id==='studio','Image belongs to another project');
  resources.set(id,{...r,bytes});
 }
 fields(runtime.fonts,Object.keys(runtime.fonts??{}));fields(runtime.images??{},Object.keys(runtime.images??{}));
 for(const [alias,id] of Object.entries(runtime.fonts))check(key(alias)&&resources.get(id)?.media_type==='font/ttf','Unregistered font');
 for(const [alias,id] of Object.entries(runtime.images??{}))check(key(alias)&&resources.get(id)?.media_type.startsWith('image/'),'Unregistered image');
 check(runtime.fonts.Manrope&&runtime.fonts.ManropeBold,'Register exact regular/bold Manrope faces');
 return resources;
}

function imageDimensions(bytes,type){
 if(type==='image/png'){
  check(bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR','Invalid PNG resource');
  return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 }
 check(bytes[0]===255&&bytes[1]===216,'Invalid JPEG resource');let i=2;
 while(i<bytes.length){check(bytes[i]===255,'Invalid JPEG segment');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===0xd9||marker===0xda)break;
  const n=bytes.readUInt16BE(i);check(n>=2&&i+n<=bytes.length,'Invalid JPEG segment');
  if([0xc0,0xc1,0xc2].includes(marker)){check(n>=8,'Invalid JPEG dimensions');return [bytes.readUInt16BE(i+5),bytes.readUInt16BE(i+3)];}i+=n;
 }
 throw Error('Unsupported JPEG image');
}

export async function renderNodePDF(source,context,runtime,{source_sha256}={}){
 check(source?.schema_version===1&&['website-concepts','website-refinement','client-proposal'].includes(source.kind)&&source.context_sha256===context.context_sha256&&/^[a-f0-9]{64}$/.test(source_sha256??''),'Bind the exact declarative source/context');
 check(Buffer.byteLength(JSON.stringify(source))<=4_000_000,'Authored source exceeds bounds');
 const resources=nodePDFResources(runtime,context.project_id),doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const fonts=new Map(),images=new Map();
 for(const [alias,id] of Object.entries(runtime.fonts)){
  const bytes=resources.get(id).bytes;check(bytes.length>=12&&(bytes.readUInt32BE(0)===0x00010000||bytes.toString('ascii',0,4)==='true'),'Only static TrueType fonts are supported');
  const parsed=fontkit.create(bytes);check(!parsed.variationAxes||Object.keys(parsed.variationAxes).length===0,'Variable fonts require an explicitly reviewed static instance');
  check(parsed.glyphsForString('A').every(g=>g.id!==0),'Invalid font resource');
  fonts.set(alias,{font:await doc.embedFont(bytes,{subset:true}),parsed,id});
 }
 const imageIDs=new Set([...Object.values(runtime.images??{}),...(runtime.wordmark?[runtime.wordmark]:[])]);
 let pixels=0;for(const id of imageIDs){const r=resources.get(id);check(r&&r.media_type.startsWith('image/'),'Unregistered image');const [w,h]=imageDimensions(r.bytes,r.media_type);pixels+=w*h;check(w>0&&h>0&&pixels<=40_000_000,'Excessive original image pixels');images.set(id,await(r.media_type==='image/png'?doc.embedPng(r.bytes):doc.embedJpg(r.bytes)));}
 const fontFor=name=>{check(fonts.has(name),'Unconfigured font');return fonts.get(name);};
 const measure=(text,name,size)=>{
  const {font,parsed}=fontFor(name);check(parsed.glyphsForString(text).every(g=>g.id!==0),'Unsupported glyph; register a font covering the exact text');
  return font.widthOfTextAtSize(text,size);
 };
 function lines(text,name,size,width){
  const result=[];
  for(const paragraph of plain(text).split('\n')){
   if(!paragraph.trim()){result.push('');continue;}let line='';
   for(const word of paragraph.trim().split(/\s+/u)){
    // Long words split at Unicode code points; every emitted line is measured.
    if(measure(word,name,size)>width){if(line){result.push(line);line='';}let chunk='';for(const c of word){check(measure(c,name,size)<=width,'Glyph exceeds paragraph width');if(measure(chunk+c,name,size)>width){result.push(chunk);chunk='';}chunk+=c;}line=chunk;}
    else if(line&&measure(line+' '+word,name,size)>width){result.push(line);line=word;}else line+=(line?' ':'')+word;
   }result.push(line);
  }return result;
 }
 const canonical=[];
 function page(width,height,title,background='#FFFFFF'){
  check(canonical.length<16,'Export exceeds sixteen pages');const p={width,height,title:plain(title,300),background,commands:[]};color(background);canonical.push(p);return p;
 }
 function text(p,value,x,y,{font='Manrope',size=24,fill='#202020',leading=size*1.35,width}={}){
  const content=plain(value),ls=width===undefined?[content]:lines(content,font,size,width);
  check(!content.includes('\n')||width!==undefined,'Text command cannot contain newlines');
  const h=width===undefined?size:ls.length*leading;
  check(x>=0&&y>=0&&y+h<=p.height&&ls.every(l=>x+measure(l,font,size)<=p.width+.001),'Text exceeds its page');
  const f=fontFor(font);ls.forEach((line,i)=>{if(line){
   const baseline=y+i*leading+size,run=f.parsed.layout(line),scale=size/f.parsed.unitsPerEm;let advance=0;
   for(const [j,glyph] of run.glyphs.entries()){const pos=run.positions[j],box=glyph.bbox;if(box.maxX>box.minX)check(x+(advance+pos.xOffset+box.minX)*scale>=0&&x+(advance+pos.xOffset+box.maxX)*scale<=p.width+.001&&baseline-(pos.yOffset+box.maxY)*scale>=0&&baseline-(pos.yOffset+box.minY)*scale<=p.height+.001,'Glyph ink exceeds its page');advance+=pos.xAdvance;}
   p.commands.push({op:'text',text:line,x,y:y+i*leading,baseline,font,font_resource:f.id,size,color:fill});
  }});
  return h;
 }
 if(source.kind!=='client-proposal'){
  check(Array.isArray(source.pages)&&source.pages.length>=1&&source.pages.length<=12,'Use 1-12 complete desktop design pages');
  if(source.kind==='website-concepts')check(source.directions?.length===5&&new Set(source.directions.map(d=>d.id)).size===5&&source.directions.every(d=>source.pages.some(p=>p.direction===d.id))&&source.pages.every(p=>source.directions.some(d=>d.id===p.direction)),'Every direction needs an actual authored page');
  for(const original of source.pages){const p=page(number(original.width,1000,1800),number(original.height,1400,3400),original.title,original.background);p.direction=original.direction??null;
   check(Array.isArray(original.commands)&&original.commands.length>=5&&original.commands.length<=800,'Incomplete or excessive layout');
   for(const item of original.commands){const x=number(item.x,0,p.width),y=number(item.y,0,p.height),fill=item.color??'#202020';color(fill);
    if(['rect','ellipse','image'].includes(item.op)){
     const w=number(item.w,item.op==='image'?1:0,p.width-x),h=number(item.h,item.op==='image'?1:0,p.height-y);
     if(item.op==='image'){const id=runtime.images?.[item.image_id],image=images.get(id);check(image,'Unregistered original image');const scale=Math.min(w/image.width,h/image.height);p.commands.push({op:'image',resource:id,x:x+(w-image.width*scale)/2,y:y+(h-image.height*scale)/2,w:image.width*scale,h:image.height*scale});}
     else p.commands.push({op:item.op,x,y,w,h,color:fill});
    }else if(item.op==='line')p.commands.push({op:'line',x,y,x2:number(item.x2,0,p.width),y2:number(item.y2,0,p.height),weight:number(item.weight??1,.2,12),color:fill});
    else if(['text','paragraph'].includes(item.op)){const size=number(item.size??24,8,220);text(p,item.text,x,y,{font:item.font??'Manrope',size,fill,...(item.op==='paragraph'?{width:number(item.w,10,p.width-x),leading:number(item.leading??size*1.35,size,size*2)}:{})});}
    else throw Error('Unsupported layout command; no imported markup/code/PDF edits');
   }
  }
 }else{
  const q=context.source.approved_quote;check(q&&['owner','friend'].includes(q.approved_by)&&source.quote_sha256===context.source.quote_sha256,'Exact scope/price approval missing');
  check(resources.get(runtime.proposal_template)?.media_type==='application/pdf'&&runtime.wordmark,'Register the exact approved template and wordmark');
  const dollars=cents=>{check(Number.isSafeInteger(cents)&&cents>=0,'Invalid exact USD amount');return '$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
  check(q.initial_payment_cents<=q.price_cents,'Initial payment exceeds fixed investment');
  const name=context.source.company.name,sections=[
   ['A defined project.\nA clear next step.',[['Prepared for',name],['Approved project scope',q.scope],['Fixed investment',dollars(q.price_cents)+' USD. Optional services are excluded unless explicitly included in the approved deliverables.'],['Delivery window',q.timeline],['Review status',context.source.company.origin?.fictional||name.startsWith('STUDIO TEST')?'Fictional controlled proof - no real commercial commitment.':'For client review. Internal scope and price approval does not establish client acceptance.']]],
   ['What is included',[['Deliverables',q.deliverables],['Exclusions',q.exclusions],['Client inputs and responsibilities',q.client_inputs??'Confirm the materials and account access required by the approved deliverables before work starts.']]],
   ['Delivery and completion',[['Timeline and dependencies',q.timeline],['Completion checks',q.acceptance],['Ownership and handover',q.ownership]]],
   ['Investment',[['Fixed project total',dollars(q.price_cents)+' USD'],['Initial payment',dollars(q.initial_payment_cents)+' USD'],['Final payment',dollars(q.price_cents-q.initial_payment_cents)+' USD before launch or agreed final handover.'],['Optional and third-party costs',q.third_party_costs??'No optional add-ons or recurring care are included unless listed in the approved deliverables. Client-paid third-party costs require confirmation before purchase.']]],
   ['Review, handover and support',[['Project revisions',String(q.revision_rounds)+' consolidated project revision rounds. Unpaid concept refinement is tracked separately.'],['Changes',q.change_terms],['Defect fixes and ongoing support',q.support_terms],['Cancellation terms',q.cancellation_terms],['Next step','Review this exact proposal with EVZ Digital. Written client acceptance, invoicing, payment and launch approval remain separate steps.']]]
  ];
  let p,y;
  function next(title){p=page(612,792,title);p.commands.push({op:'image',resource:runtime.wordmark,x:44,y:35.3,w:62,h:39.7});text(p,'DIGITAL',116,52,{font:'ManropeBold',size:8});const label='PROJECT PROPOSAL / '+context.project_id;text(p,label,564-measure(label,'Manrope',8),52,{size:8});for(const at of [92,744])p.commands.push({op:'line',x:48,y:at,x2:564,y2:at,weight:.6,color:'#dadada'});text(p,'EVZ Digital / '+plain(q.approved_at,100).slice(0,10),48,756,{size:8,fill:'#606060'});text(p,String(canonical.length),554,756,{size:8,fill:'#606060'});y=126;}
  for(const [title,rows] of sections){next(title);y+=text(p,title,54,y,{font:'ManropeBold',size:30,leading:36,width:504})+22;
   if(title==='Investment'){p.commands.push({op:'rect',x:48,y,w:516,h:94,color:'#202020'});text(p,'FIXED PROJECT INVESTMENT / USD',68,y+15,{font:'ManropeBold',size:9,fill:'#FFFFFF'});text(p,dollars(q.price_cents),68,y+38,{font:'ManropeBold',size:30,fill:'#FFFFFF'});y+=106;}
   for(const [label,value] of rows){const bodyLines=lines(value,'Manrope',10.5,504);if(y+14+19+Math.min(bodyLines.length,2)*16>711)next(title+' (continued)');y+=14;text(p,label,54,y,{font:'ManropeBold',size:13});y+=19;
    for(const line of bodyLines){if(y+16>711)next(title+' (continued)');if(line)text(p,line,54,y,{size:10.5});y+=16;}y+=12;
   }
  }
 }
 doc.setTitle(context.source.company.name+' | '+(source.kind==='client-proposal'?'EVZ Digital proposal':'Desktop website direction review'));doc.setAuthor(source.author);doc.setProducer('EVZ declarative '+nodePDFRenderer);doc.setCreator('EVZ Digital');doc.setCreationDate(new Date('2000-01-01T00:00:00Z'));doc.setModificationDate(new Date('2000-01-01T00:00:00Z'));
 for(const p of canonical){check(p.commands.some(c=>c.op==='text'),'Export page has no searchable text');const out=doc.addPage([p.width,p.height]);out.drawRectangle({x:0,y:0,width:p.width,height:p.height,color:color(p.background)});
  for(const c of p.commands){
   if(c.op==='text')out.drawText(c.text,{x:c.x,y:p.height-c.baseline,size:c.size,font:fontFor(c.font).font,color:color(c.color)});
   if(c.op==='rect')out.drawRectangle({x:c.x,y:p.height-c.y-c.h,width:c.w,height:c.h,color:color(c.color)});
   if(c.op==='ellipse')out.drawEllipse({x:c.x+c.w/2,y:p.height-c.y-c.h/2,xScale:c.w/2,yScale:c.h/2,color:color(c.color)});
   if(c.op==='line')out.drawLine({start:{x:c.x,y:p.height-c.y},end:{x:c.x2,y:p.height-c.y2},thickness:c.weight,color:color(c.color)});
   if(c.op==='image')out.drawImage(images.get(c.resource),{x:c.x,y:p.height-c.y-c.h,width:c.w,height:c.h});
  }
 }
 const outlines=doc.context.obj({Type:'Outlines'}),outlineRef=doc.context.register(outlines),entries=canonical.map(()=>doc.context.register(doc.context.obj({})));
 canonical.forEach((p,i)=>{const entry=doc.context.lookup(entries[i]);entry.set(doc.context.obj('Title'),PDFHexString.fromText(p.title));entry.set(doc.context.obj('Parent'),outlineRef);entry.set(doc.context.obj('Dest'),doc.context.obj([doc.getPages()[i].ref,'Fit']));if(i)entry.set(doc.context.obj('Prev'),entries[i-1]);if(i+1<entries.length)entry.set(doc.context.obj('Next'),entries[i+1]);});
 outlines.set(doc.context.obj('First'),entries[0]);outlines.set(doc.context.obj('Last'),entries.at(-1));outlines.set(doc.context.obj('Count'),doc.context.obj(entries.length));doc.catalog.set(doc.context.obj('Outlines'),outlineRef);
 const pdf=Buffer.from(await doc.save({useObjectStreams:false,addDefaultPage:false}));check(pdf.length<=64_000_000,'PDF exceeds the original archive limit');const parsed=await PDFDocument.load(pdf);check(parsed.getPageCount()===canonical.length&&!parsed.isEncrypted,'Incomplete PDF');
 const files=new Map([['output.pdf',pdf]]),pages=canonical.map((value,i)=>{const name=`page-${i+1}.json`,bytes=Buffer.from(JSON.stringify(value));check(bytes.length<=4_000_000,'Canonical page exceeds bounds');files.set(name,bytes);return {page:i+1,name,sha256:sha(bytes),width:value.width,height:value.height};});
 const receipt={schema_version:1,context_sha256:source.context_sha256,source_sha256,pdf:{name:'output.pdf',bytes:pdf.length,sha256:sha(pdf)},pages,resources:[...resources].map(([id,r])=>({id,name:r.name,sha256:r.sha256,bytes:r.bytes.length,media_type:r.media_type})),validation:{renderer:nodePDFRenderer,node:process.versions.node,dependencies:nodePDFDependencies,searchable_pages:pages.length,rasterizer:null,visual_review:'Required separately on actual PDF renders; canonical page JSON is layout evidence only'}};
 files.set('export.json',Buffer.from(JSON.stringify(receipt,null,2)));return {files,receipt};
}
