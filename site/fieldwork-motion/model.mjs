export const homes=[
 {id:'foundry',name:'The Foundry',setting:'City',type:'Courtyard home',price:1450000,beds:3,baths:2,area:2140,image:'foundry-living.webp'},
 {id:'tide',name:'Tide House',setting:'Coast',type:'Coastal home',price:2100000,beds:4,baths:3,area:2680,image:'tide-house.webp'},
 {id:'orchard',name:'Orchard House',setting:'Country',type:'Country home',price:1850000,beds:4,baths:3,area:2420,image:'orchard-house.webp'}
];
export const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
export function filterHomes(setting='all',price='any',order='setting'){const result=homes.filter(h=>(setting==='all'||h.setting===setting)&&(price==='any'||h.price<=Number(price)));return order==='low'?result.sort((a,b)=>a.price-b.price):order==='high'?result.sort((a,b)=>b.price-a.price):result;}
export function routeFor(hash){const [page,id]=(hash||'#home').slice(1).split('/');return ['property','inquiry'].includes(page)?{page,home:homes.find(h=>h.id===id)||homes[0]}:{page:page==='homes'?'homes':'home'};}
export const wrap=(n,count)=>(n%count+count)%count;
export function validateInquiry({name,email,day}){return {name:name.trim()?'':'Enter your name.',email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())?'':'Enter a valid email address.',day:!day||/^2026-10-(2[2-9]|3[01])$/.test(day)?'':'Choose October 22–31 for this preview, or leave the day open.'};}
export function preferredDay(day){return day?new Intl.DateTimeFormat('en-US',{weekday:'short',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')):'Day to be arranged';}
