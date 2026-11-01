import {sourceContentHash} from './sources.mjs';

const capture=value=>value&&typeof value==='object'&&typeof value.url==='string'&&typeof value.text==='string'&&typeof value.content_sha256==='string'&&typeof value.capture_method==='string';

// Canonical evidence stays intact; routine hosted reads need citations, not every captured page body.
export function projectSourceBodies(value){
 if(Array.isArray(value))return value.map(projectSourceBodies);
 if(!value||typeof value!=='object')return value;
 const omitted=capture(value);
 return Object.fromEntries([...Object.entries(value).filter(([key])=>!omitted||!['text','reviewed_context'].includes(key)).map(([key,item])=>[key,projectSourceBodies(item)]),...(omitted?[['body_omitted',true]]:[])]);
}

export function retainedSource(state,project,sha,url,fetchedAt){
 if(!Object.hasOwn(state.prospects??{},project)||!/^\w[\w-]{0,99}$/.test(project)||!/^([a-f0-9]{64})$/.test(sha)||typeof url!=='string'||typeof fetchedAt!=='string')throw Error('Saved source is not available for this project');
 let found;
 function visit(value){
  if(!value||typeof value!=='object'||found)return;
  if(capture(value)&&value.url===url&&value.content_sha256===sha&&value.fetched_at===fetchedAt){found=value;return;}
  for(const item of Object.values(value))visit(item);
 }
 visit(state.prospects[project]);
 if(!found)throw Error('Saved source is not available for this project');
 if(Buffer.byteLength(JSON.stringify(found))>200_000)throw Error('Saved source exceeds the private read limit');
 if(sourceContentHash(found)!==sha)throw Error('Saved source integrity check failed');
 return structuredClone(found);
}
