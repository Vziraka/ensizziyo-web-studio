// Publish a complete, hash-checked snapshot only after every revision-bound page arrives.
export async function readDeskSnapshot(response,{fetch,path,crypto=globalThis.crypto}){
 let data=await response.json();if(data.transport!=='desk-snapshot-v1')return data;
 const first=data,parts=[];
 if(!Number.isSafeInteger(first.revision)||first.part!==0||!Number.isSafeInteger(first.total)||first.total<1||first.total>100||!Number.isSafeInteger(first.bytes)||first.bytes>20_000_000||first.bytes<1||!/^[a-f0-9]{64}$/.test(first.sha256))throw Error('Private snapshot manifest is invalid.');
 for(let part=0;part<first.total;part++){
  if(part){const next=await fetch(`${path}?part=${part}&revision=${first.revision}&sha256=${first.sha256}${first.as_of?'&as_of='+encodeURIComponent(first.as_of):''}`);if(!next.ok)throw Error('Workspace changed or loading was interrupted. Refresh to read one saved version.');data=await next.json();}
  if(data.transport!==first.transport||data.revision!==first.revision||data.sha256!==first.sha256||data.bytes!==first.bytes||data.total!==first.total||data.as_of!==first.as_of||data.part!==part||typeof data.text!=='string'||data.text.length>1_000_000)throw Error('Private snapshot page does not match this saved version.');
  parts.push(data.text);
 }
 const text=parts.join(''),bytes=new TextEncoder().encode(text);
 if(bytes.length!==first.bytes)throw Error('Private snapshot length does not match.');
 const digest=await crypto.subtle.digest('SHA-256',bytes),sha=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(sha!==first.sha256)throw Error('Private snapshot integrity check failed.');
 const snapshot=JSON.parse(text);if(snapshot.revision!==first.revision)throw Error('Private snapshot revision does not match.');return snapshot;
}
