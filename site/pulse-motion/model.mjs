export const classes={
 foundations:{name:'Foundations',duration:50,pace:'Beginner friendly',title:'Start with\nthe foundations.',description:'A slower, guided class to help you find control, connect with your breath and feel at home in the studio.',short:'Learn the basics. Leave with a place to begin.',image:'pulse-foundations.webp'},
 strength:{name:'Strength & control',duration:50,pace:'Steady pace',title:'Build strength.\nMove with control.',description:'A steady, guided practice that builds on the basics, with deliberate movements and room to work at your own pace.',short:'Build a stronger, more deliberate practice.',image:'pulse-strength.webp'},
 reset:{name:'Reset',duration:40,pace:'Gentle pace',title:'Make space\nto reset.',description:'A gentler class with unhurried movement, mobility and a little space to breathe. Recovery belongs in the routine.',short:'Slow down. Breathe. Make room to recover.',image:'pulse-reset.webp'}
};
export const dates=Array.from({length:14},(_,i)=>`2026-10-${12+i}`);
export const sessions=dates.flatMap((date,i)=>{
 const day=i%7;
 const rows=day===1?[]:day===3?[
 ['foundations','07:30','08:20','Maya',6],['foundations','17:30','18:20','Leo',0],['strength','12:00','12:50','Leo',4],['reset','18:45','19:25','Maya',3]
 ]:day===4?[['foundations','09:00','09:50','Maya',4],['reset','17:00','17:40','Leo',5]]:day===6?[['reset','10:00','10:40','Maya',2]]:[['foundations','08:00','08:50','Maya',5],['strength','17:30','18:20','Leo',4]];
 return rows.map(([classId,start,end,teacher,spaces],n)=>({id:`${date}-${n}`,date,classId,start,end,teacher,spaces,room:'Main room',price:24}));
});
export const rowsFor=(date,filter)=>sessions.filter(s=>s.date===date&&(filter==='all'||s.classId===filter)).sort((a,b)=>a.start.localeCompare(b.start));
export const nextAvailable=(date,filter)=>sessions.find(s=>s.date>date&&s.spaces>0&&(filter==='all'||s.classId===filter));
export function validateContact(name,email){return {name:name.trim()?'':'Enter your name',email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())?'':'Enter a valid email address'}}
export function parseRoute(hash){
 const parts=hash.replace(/^#/,'').split('/');
 if(parts[0]==='class'&&classes[parts[1]])return {view:'detail',id:parts[1]};
 if(parts[0]==='schedule')return {view:'schedule',filter:classes[parts[1]]?parts[1]:null};
 if(parts[0]==='booking'){const session=sessions.find(s=>s.id===parts[1]&&s.spaces>0);return session?{view:'booking',session}:{view:'schedule',filter:null};}
 return {view:'home',anchor:['classes','approach','studio'].includes(parts[0])?parts[0]:null};
}
export const dateLabel=(date,options={weekday:'long',day:'numeric',month:'long'})=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...options}).format(new Date(date+'T12:00:00Z'));
