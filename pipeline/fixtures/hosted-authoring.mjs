import {getStore} from '@netlify/blobs';
import {PDFDocument} from 'pdf-lib';
import {readFile} from 'node:fs/promises';
import {createHostedDesk} from '../hosted-desk.mjs';
import {StudioLifecycle,hash} from '../lifecycle.mjs';
import {ConditionalLifecycleStore} from '../lifecycle-store.mjs';
import {blobProjectOriginalStore,originalDigest} from '../shared-project-originals.mjs';
import {archiveProjectAsset} from '../project-assets.mjs';
import {projectContext} from '../project-work.mjs';
import {sharedDeskSession} from '../shared-originals-client.mjs';
import {connectSharedAuthoring} from '../hosted-authoring-client.mjs';

export const at='2026-10-24T21:00:00.000Z',origin='https://preview.example.invalid';
export const env={CONTEXT:'deploy-preview',EVZ_OPERATIONS_DESK_ENABLED:'fictional-preview',EVZ_OPERATIONS_PROJECT_AUTHORING:'fictional-node-v1',EVZ_OPERATIONS_SHARED_ORIGINALS:'fictional-chunks-v1',EVZ_OPERATIONS_ORIGIN:origin,EVZ_OPERATIONS_BLOB_NAMESPACE:'evz-redesign-proof-authoring-123',EVZ_OPERATIONS_OWNER_KEY:'o'.repeat(43),EVZ_OPERATIONS_FRIEND_KEY:'f'.repeat(43),EVZ_OPERATIONS_SESSION_SECRET:'s'.repeat(43)};
export const event=(id,type,data={},prospect_id='shared-proof')=>({id,type,data,prospect_id,at});
// Real pinned SDK, substituted private HTTP boundary. No Netlify network or credentials.
let observeBlobs=null;
export const observeFictionalBlobs=callback=>{observeBlobs=callback;};
export function fictionalBlobs({namespace='fictional-authoring'}={}){
 const entries=new Map(),requests=[];let serial=0;
 const control={entries,requests,lose:null,hook:null};
 control.raw=getStore({name:namespace,siteID:'fictional-site',token:'fictional-token',edgeURL:'https://edge.example.invalid',uncachedEdgeURL:'https://strong.example.invalid',fetch:async(url,options)=>{
  const key=decodeURIComponent(new URL(url).pathname.split('/').slice(3).join('/')),headers=new Headers(options.headers),method=options.method.toUpperCase(),prior=entries.get(key);requests.push({method,key,url:String(url),match:headers.get('if-match'),fresh:headers.get('if-none-match')});
  if(method==='GET'){if(control.readHook)await control.readHook(key);return prior?new Response(prior.bytes,{headers:{etag:prior.etag}}):new Response(null,{status:404});}
  const bytes=Buffer.from(await new Response(options.body).arrayBuffer()),current=entries.get(key);
  if(headers.get('if-none-match')==='*'&&current||headers.get('if-match')&&headers.get('if-match')!==current?.etag)return new Response(null,{status:412});
  const etag='"'+(++serial)+'"';entries.set(key,{bytes,etag});
  if(control.hook)await control.hook(key,bytes);
  if(control.lose===key){control.lose=null;throw Error('Fictional storage response loss');}return new Response(null,{headers:{etag}});
 }});control.namespace=namespace;observeBlobs?.(control);return control;
}
export async function fixture({actor='owner',fetcher:outerFetch}={}){
 const storage=fictionalBlobs(),make=settings=>createHostedDesk({env:settings??env,storeFactory:()=>storage.raw,now:()=>new Date(at)}),requests=[];
 let loseOperation=null;
 const localFetch=async(url,options)=>{const response=await make()(new Request(url,options));requests.push({path:new URL(url).pathname,method:options.method,status:response.status,body_bytes:options.body?Buffer.byteLength(options.body):0});if(loseOperation&&new URL(url).pathname.endsWith('/'+loseOperation)&&response.ok){loseOperation=null;throw Error('Fictional handler response lost; inspect before continuing');}return response;};
 const fetcher=outerFetch??localFetch,session=await sharedDeskSession({origin,key:env[actor==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher});await session.json('/api/project-context/shared-proof');
 const fresh=async()=>{const app=await StudioLifecycle.fromStore({store:new ConditionalLifecycleStore(storage.raw,{maxBytes:2_000_000}),now:()=>new Date(at)});app.originalStore=blobProjectOriginalStore(storage.raw);return app;},app=await fresh();
 if(actor==='friend')await app.change(s=>{s.prospects['shared-proof'].follow_up_owner='friend';});
 await app.apply(event('interest','call_logged',{call_id:'call',outcome:'connected',desk:true,intent:'discovery',focus:'website',performed_at:at,simulated:true,note:'Fictional hosted design interest.'}),{actor});
 const doc=await PDFDocument.create();doc.addPage();const pdf=Buffer.from(await doc.save());
 await app.apply(event('template','asset_registered',{asset_id:'template',scope:'studio',kind:'template',name:'Fictional registered template',version_id:'v1',version_label:'v1',reference:'private-path:fictional/template.pdf'},'studio-assets'),{actor});
 await archiveProjectAsset(app,{project_id:'shared-proof',asset_id:'template',version_id:'v1',context_sha256:projectContext(await app.snapshot(),'shared-proof').context_sha256,expected_sha256:originalDigest(pdf)},pdf,{reference:'private-path:fictional/template.pdf',name:'template.pdf',mime_type:'application/pdf',modified_time:at},actor);
 return {storage,make,requests,fetcher,session,app,fresh,loseResponse:operation=>{loseOperation=operation;},connect:(who=actor)=>connectSharedAuthoring({origin,key:env[who==='owner'?'EVZ_OPERATIONS_OWNER_KEY':'EVZ_OPERATIONS_FRIEND_KEY'],fetcher})};
}
export async function runtime({large=false}={}){
 const resources={};for(const face of ['regular','bold']){const bytes=await readFile(new URL(`./pdf-fonts/manrope-${face}.ttf`,import.meta.url));resources[face]={name:'Manrope-'+face,media_type:'font/ttf',sha256:originalDigest(bytes),bytes_base64:bytes.toString('base64'),provenance:'Bundled OFL Manrope test face.'};}
 if(large){const bytes=Buffer.alloc(2_200_000,32);Buffer.from('%PDF-1.7\nFictional retained reference').copy(bytes);resources.reference={name:'reference',media_type:'application/pdf',sha256:originalDigest(bytes),bytes_base64:bytes.toString('base64'),provenance:'Fictional multi-MB retained resource boundary; never executed or imported.'};}
 return {renderer:'node-pdf-v1',resources,fonts:{Manrope:'regular',ManropeBold:'bold'},images:{}};
}
export function source(context){return {schema_version:1,kind:'website-concepts',context_sha256:context.context_sha256,author:'Fictional hosted proof author',requirements_review:'Five declarative desktop directions with retained sources.',visual_premise:'Readable fictional concept pages with generous spacing.',limitations:'Technical fixture, no client approval or unattended design inference.',questions:[],directions:Array.from({length:5},(_,i)=>({id:'d'+i,name:'Direction '+i,premise:'Fictional layout '+i,tradeoff:'Fixture scope only',sections:['Services','Contact']})),pages:Array.from({length:5},(_,i)=>({title:'Direction '+i,direction:'d'+i,width:1200,height:1600,background:'#FFFFFF',commands:[{op:'line',x:70,y:1000,x2:1100,y2:1000},{op:'text',x:70,y:80,text:'STUDIO TEST / Direction '+i,font:'ManropeBold',size:44,role:'heading'},{op:'paragraph',x:70,y:200,w:700,text:'Services for a fictional local business.\nDiscuss your project with the team.',size:28,role:'body'},{op:'rect',x:70,y:400,w:1050,h:300,color:['#EEE5DD','#DDE9ED','#E6E8DC','#EFE0E5','#E6E0EF'][i]},{op:'text',x:70,y:800,text:'Contact the fictional team',size:24,role:'body'}]}))};}
export const review=(receipt,raster_review)=>({export_sha256:hash(receipt),pages:receipt.pages,requirements:true,visual_design:true,export:true,notes:'Automated boundary fixture only; private proof uses actual inspected PDF PNG pages.',...(raster_review?{raster_review}:{})});
export const substitutedPNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
