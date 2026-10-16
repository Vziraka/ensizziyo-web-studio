export const finishes=[{id:'russet',name:'Russet velvet',color:'#815033'},{id:'olive',name:'Olive velvet',color:'#414532'},{id:'flax',name:'Flax linen',color:'#cfc3ad'}];
export const rooms=[{id:'living',name:'Living',title:"The collector's room",image:'living-room.webp'},{id:'dining',name:'Dining',title:'Gather well',image:'dining-room.webp'},{id:'reading',name:'Reading',title:'A home for what you love',image:'reading-shelves.webp'}];
export const money=n=>'$'+n.toLocaleString('en-US');
export const quantity=n=>Math.max(1,Math.min(99,Math.trunc(Number(n)||1)));
export const subtotal=bag=>bag.reduce((sum,item)=>sum+item.quantity*1180,0);
export function addPiece(bag,finish,count){if(!finishes.some(f=>f.id===finish))throw Error('Unknown finish');const next=bag.map(i=>({...i})),line=next.find(i=>i.finish===finish);if(line)line.quantity=quantity(line.quantity+count);else next.push({finish,quantity:quantity(count)});return next;}
