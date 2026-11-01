import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,lstat,link,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {check} from './lifecycle.mjs';

export const audioLimit = 4_000_000;
export const audioDigest = bytes => createHash('sha256').update(bytes).digest('hex');
const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const formats = {'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/wav':'wav'};
export async function audioRequest(request) {
  const metadata=request.headers.get('x-studio-audio');check(metadata&&metadata.length<=1500,'Supply bounded call-audio metadata');
  let input;try{input=JSON.parse(metadata);}catch{throw Error('Supply valid call-audio metadata');}
  check(input&&typeof input==='object'&&!Array.isArray(input),'Supply call-audio metadata');
  const reader=request.body?.getReader();check(reader,'Supply the recorded audio bytes');let total=0;const chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>audioLimit){await reader.cancel();throw Error('Audio exceeds the private 4 MB clip limit');}chunks.push(Buffer.from(value));}
  return {input:{...input,mime:request.headers.get('content-type')},bytes:Buffer.concat(chunks)};
}
export function validateAudio(bytes,mime) {
  check(bytes.length >= 16 && bytes.length <= audioLimit, 'Use a nonempty audio clip within 4 MB');
  check(formats[mime], 'This audio format is unsupported');
  const valid = mime==='audio/webm' ? bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : mime==='audio/ogg' ? bytes.toString('ascii',0,4)==='OggS' : mime==='audio/mp4' ? bytes.toString('ascii',4,8)==='ftyp' : bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE';
  check(valid, 'The clip does not match its supported audio container');
}
export function localAudioStore(directory) {
  const root=join(directory,'call-audio');
  const read=async id=>{const folder=await lstat(root),file=await lstat(join(root,id));check(folder.isDirectory()&&!folder.isSymbolicLink()&&file.isFile()&&!file.isSymbolicLink()&&file.size<=audioLimit,'Private audio path is not a bounded regular file');return readFile(join(root,id));};
  return {
    async put(id,bytes) {
      check(key(id),'Invalid private audio ID'); await mkdir(root,{recursive:true,mode:0o700});
      const folder=await lstat(root);check(folder.isDirectory()&&!folder.isSymbolicLink(),'Private audio directory must not be a symbolic link');
      const temporary=join(root,`.${id}.${randomUUID()}.tmp`);
      try {await writeFile(temporary,bytes,{flag:'wx',mode:0o600,flush:true});try{await link(temporary,join(root,id));}catch(error){if(error.code!=='EEXIST')throw error;check(audioDigest(await read(id))===audioDigest(bytes),'Existing audio differs; keep the original clip');}}
      finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    },
    async get(id) { check(key(id),'Invalid private audio ID'); return read(id); }
  };
}
export function blobAudioStore(store) {
  return {
    async put(id,bytes) {
      check(key(id),'Invalid private audio ID');
      try {const result=await store.set(`audio/${id}`,bytes,{onlyIfNew:true});check(typeof result?.modified==='boolean','Audio storage acknowledgement is unavailable');if(result.modified)return;}catch{}
      const saved=await store.getWithMetadata(`audio/${id}`,{type:'arrayBuffer',consistency:'strong'});
      check(saved&&audioDigest(Buffer.from(saved.data))===audioDigest(bytes),'Audio storage outcome is uncertain; retry only this exact retained clip');
    },
    async get(id) {check(key(id),'Invalid private audio ID');const saved=await store.getWithMetadata(`audio/${id}`,{type:'arrayBuffer',consistency:'strong'});check(saved,'Private audio is unavailable');return Buffer.from(saved.data);}
  };
}
export async function saveCallAudio(app,store,input,bytes,actor) {
  check(input && key(input.id)&&key(input.call_id)&&key(input.prospect_id),'Audio needs an exact clip, call and project ID');
  check(input.recorded_by===actor,'Sign in as the operator who started this exact recording');
  const mime=String(input.mime??'').split(';')[0];validateAudio(bytes,mime);
  const audio={id:input.id,call_id:input.call_id,kind:input.kind,mime,bytes:bytes.length,sha256:audioDigest(bytes),started_at:input.started_at,ended_at:input.ended_at,permission_confirmed:input.permission_confirmed===true,partial:input.partial===true,recorded_by:actor,capture:input.kind==='call'?'Desktop microphone; phone on speakerphone for call audio':'Desktop microphone; private operator summary'};
  const event={prospect_id:input.prospect_id,at:input.ended_at,data:audio};
  await app.apply({...event,id:`audio-reserve-${input.id}`,type:'call_audio_reserved'},{actor:'artifact-store'});
  try {await store.put(input.id,bytes);}catch{throw Error('Private audio save is uncertain. Keep or download this clip and retry its exact ID.');}
  return reconcileCallAudio(app,store,input.prospect_id,input.id);
}
export async function reconcileCallAudio(app,store,project,id) {
  check(key(project)&&key(id),'Choose the exact private audio reservation');const clip=(await app.snapshot()).prospects[project]?.call_audio?.[id];
  check(clip&&['Reserved','Stored'].includes(clip.status),'Unknown private audio reservation');let bytes;try{bytes=await store.get(id);}catch{throw Error('Private audio is not yet available. Keep the exact clip for retry or restore.');}
  validateAudio(bytes,clip.mime);check(bytes.length===clip.bytes&&audioDigest(bytes)===clip.sha256,'Private audio differs from the exact reservation; keep it held');
  if(clip.status==='Reserved'){const {status,reserved_at,verified_at,...data}=clip;await app.apply({id:`audio-store-${id}`,prospect_id:project,type:'call_audio_stored',at:clip.ended_at,data},{actor:'artifact-store'});}
  return (await app.snapshot()).prospects[project].call_audio[id];
}
export async function readCallAudio(app,store,project,id) {
  check(key(project)&&key(id),'Choose a private saved audio clip');const audio=(await app.snapshot()).prospects[project]?.call_audio?.[id];
  check(audio?.status==='Stored','This audio save is not yet verified');let bytes;try{bytes=await store.get(id);}catch{throw Error('Private audio storage is unavailable. Retain the exact clip ID for reconciliation.');}check(bytes.length===audio.bytes&&audioDigest(bytes)===audio.sha256,'Private audio integrity check failed');
  return {audio,bytes,filename:`${audio.kind}-${id}.${formats[audio.mime]}`};
}
export async function audioArchiveFiles(state,store) {
  const clips=Object.values(state.prospects).flatMap(r=>Object.values(r.call_audio??{})).filter(c=>c.status==='Stored');
  check(clips.length<=2000&&new Set(clips.map(c=>c.id)).size===clips.length&&clips.reduce((total,c)=>total+c.bytes,0)<=200_000_000,'Audio archive exceeds its verified bounds');
  const files=[];
  for(const clip of clips){check(key(clip.id)&&clip.id.length<=80,'Audio archive contains an unsafe ID');const bytes=await store.get(clip.id);validateAudio(bytes,clip.mime);check(bytes.length===clip.bytes&&audioDigest(bytes)===clip.sha256,'Audio archive integrity check failed');files.push({id:clip.id,bytes});}
  return files;
}
