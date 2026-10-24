import {createHash} from 'node:crypto';
import {check} from './lifecycle.mjs';

// One canonical CAS object; paging changes transport only, never evidence or approvals.
export function deskSnapshotPage(view,params=new URLSearchParams()){
 const serialized=JSON.stringify(view),bytes=Buffer.byteLength(serialized);
 check(bytes<=20_000_000,'Desk snapshot exceeds the private read limit');
 if(bytes<=2_000_000&&!params.has('part'))return view;
 const part=params.has('part')?params.get('part'):'0',sha256=createHash('sha256').update(serialized).digest('hex'),length=1_000_000,total=Math.ceil(serialized.length/length);
 check(/^(0|[1-9][0-9]{0,2})$/.test(part)&&Number(part)<total,'Invalid desk snapshot page');
 if(Number(part)>0&&(params.get('revision')!==String(view.revision)||params.get('sha256')!==sha256)){
  const error=Error('Workspace changed while loading; refresh to read one saved version.');error.code='STATE_CONFLICT';throw error;
 }
 const page={transport:'desk-snapshot-v1',revision:view.revision,sha256,bytes,as_of:view.supply?.checked_at??null,part:Number(part),total,text:serialized.slice(Number(part)*length,(Number(part)+1)*length)};
 check(Buffer.byteLength(JSON.stringify(page))<=3_100_000,'Desk snapshot page exceeds the private read limit');return page;
}
