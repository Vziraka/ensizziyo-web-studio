import {storyIndex,storyOffset} from './motion.mjs';
import {classes,dates,sessions,rowsFor,nextAvailable,validateContact,parseRoute,dateLabel} from './model.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const film=$('.hero-film'),reduced=matchMedia('(prefers-reduced-motion:reduce)'),menu=$('#mobile-menu'),answer=$('#answer');
let paused=false,view='home',step=0,filter='foundations',day='2026-10-15',week=0,chosen=null,scheduleY=0,filmStarted=false,filmFinished=false,answerOrigin=null;
const motion=()=>!paused&&!reduced.matches;
const storyTrack=$('.story-track'),storyStage=$('.story-stage'),storyMedia=$('.story-media');
const pinnedStory=()=>motion()&&innerWidth>900&&innerHeight>=700;
let scrollFrame=0;
function animate(el,ms=240){if(motion())el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:ms,easing:'ease-out'});}
const answers={
 experience:['Do I need experience?','No. Foundations is designed as a starting point. Your teacher explains each movement and offers options throughout the class.'],
 bring:['What should I bring?','Wear comfortable clothes and bring water. Mats are provided. Arrive 10 minutes early so you have time to settle in.'],
 right:['Is the class right for me?','Foundations moves at an approachable pace, with clear cues and time for questions. Let your teacher know if you need an easier option.'],
 easier:['Can I ask for an easier option?','Yes. Ask your teacher at any point. The practice is guided, and you can take a break whenever you need one.'],
 change:['Can I change my booking?','In this preview, return to the schedule and choose another time. No place is reserved and nothing is charged. Live booking and cancellation policies will be added before launch.'],
 reset:['What happens in a Reset class?','A slower 40-minute practice with gentle movement, mobility and space to breathe. There is no need to keep up with anyone else.'],
 start:['Where do I start?','Start with Foundations: a 50-minute introduction to breath, alignment and controlled movement. You do not need previous class experience.'],
 full:['What happens if a class is full?','Choose See other times to find the next available session. This preview does not take waitlist requests.'],
 access:['Questions about access or taking part?','The class preview includes easier movement options and time to ask questions. Venue access information and a working contact route need confirmation before a live launch.'],
 login:['Member access','Member accounts are not connected in this local preview. You can explore the classes and try the booking preview without signing in.'],
 contact:['Contact the studio','This is a local studio concept. Contact delivery is not connected; no message will be sent. Explore the class information or try the booking preview.']
};
const steps=[
 {label:'Find your starting point',title:'Your first class\nstarts with the basics.',copy:'Foundations introduces the breath, alignment and controlled movement you will return to in every class.',action:'Explore Foundations',href:'#class/foundations',image:'pulse-foundations.webp',alt:'A teacher guiding two participants through a Foundations movement',questions:['experience','bring']},
 {label:'Move with guidance',title:'Someone there\nto help you find it.',copy:'Clear cues. Easier options. Time to ask a question. Your teacher helps you find a pace that feels right for you.',action:'Meet the approach',href:'#class/foundations',image:'pulse-guidance.webp',alt:'A teacher providing personal movement guidance',questions:['right','easier']},
 {label:'Build your rhythm',title:'A regular place\nin your week.',copy:'Choose a time that fits. Keep coming back to a familiar space, with a little room to build on what you know.',action:'See the schedule',href:'#schedule/foundations',image:'pulse-strength.webp',alt:'Participants practicing controlled strength movements',questions:['change']},
 {label:'Make space to reset',title:'Recovery is part\nof the practice.',copy:'Slow down with gentle mobility and a little space to breathe. There is room for a quieter day, too.',action:'Explore Reset',href:'#class/reset',image:'pulse-reset.webp',alt:'A quiet recovery and stretching session',questions:['reset']}
];
function showStep(index){
 step=(index+4)%4;const s=steps[step];$$('[data-step]').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===step));b.setAttribute('aria-label',`${i+1}. ${steps[i].label}`)});
 $('#story-title').textContent=s.title;$('#story-description').textContent=s.copy;$('#story-action').href=s.href;$('#story-action').firstChild.textContent=s.action+' ';
 storyStage.dataset.scene=String(step);$$('.story-image').forEach((img,i)=>{img.setAttribute('aria-hidden',String(i!==step));if(i===step)img.alt=s.alt});
 $('.questions').replaceChildren(...s.questions.map(key=>{const b=document.createElement('button');b.dataset.answer=key;b.textContent=answers[key][0];return b}));
 $('.upcoming').hidden=step!==2;$('.upcoming').textContent='Upcoming Foundations · Thu 15 Oct · 07:30 · Maya · 6 spaces';
 animate($('.story-body'),500);
}
function chooseStep(index){if(pinnedStory()){const start=storyTrack.getBoundingClientRect().top+scrollY;const travel=storyTrack.offsetHeight-storyStage.offsetHeight;scrollTo({top:start+storyOffset(index,travel),behavior:'smooth'})}else showStep(index);}
$$('[data-step]').forEach(b=>b.addEventListener('click',()=>chooseStep(Number(b.dataset.step))));
$('.steps').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?3:(step+(e.key==='ArrowRight'?1:3))%4;chooseStep(i);$$('[data-step]')[i].focus({preventScroll:true})});
let swipeStart=null;
storyMedia.addEventListener('pointerdown',e=>{swipeStart={x:e.clientX,y:e.clientY};});
storyMedia.addEventListener('pointerup',e=>{if(swipeStart){const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)chooseStep((step+(dx<0?1:3))%4);swipeStart=null}});
storyMedia.addEventListener('pointercancel',()=>swipeStart=null);
function openAnswer(key,origin){
 const data=answers[key];if(!data)return;answerOrigin=origin;$('#answer-title').textContent=data[0];$('#answer-text').textContent=data[1];$('.answer-image').src='./assets/'+(key==='reset'?'pulse-reset.webp':'pulse-foundations.webp');
 $('.answer-image').alt=key==='reset'?'A quiet recovery practice':'Participants learning with a teacher';const answerClass=key==='reset'?'reset':'foundations';$('.answer-copy .button').href='#schedule/'+answerClass;$('.answer-copy .button').textContent='Find a '+classes[answerClass].name+' class';
 if(menu.open)menu.close();answer.showModal();animate(answer);$('#answer-title').focus();
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-answer],[data-info]');if(b)openAnswer(b.dataset.answer||b.dataset.info,b)});
$('.close-answer').addEventListener('click',()=>answer.close());
answer.addEventListener('click',e=>{if(e.target===answer){const r=answer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)answer.close()}});
answer.addEventListener('close',()=>{if(answerOrigin?.isConnected&&!answerOrigin.closest('[hidden]'))answerOrigin.focus({preventScroll:true})});
$('.menu-button').addEventListener('click',()=>menu.showModal());$('.close-menu').addEventListener('click',()=>menu.close());
document.addEventListener('click',e=>{if(e.target.closest('dialog a')){if(answer.open)answer.close();if(menu.open)menu.close()}});
function buildCards(){
 for(const [id,c] of Object.entries(classes)){const article=document.createElement('article');article.className='class-card';article.innerHTML=`<a href="#class/${id}" aria-label="Explore ${c.name}"><div class="image-wrap"><img src="./assets/${c.image}" alt="${c.name} movement class" loading="lazy"></div><small>${c.duration} min / ${c.pace}</small><h3>${c.name}</h3><p>${c.short}</p><span class="text-link">Explore class <img src="./assets/arrow-left.svg" alt=""></span></a>`;$('.class-grid').append(article)}
}
function updateDetail(id){const c=classes[id];$('#class-name').textContent=c.name;$('#class-title').textContent=c.title;$('#class-meta').textContent=`${c.duration} minutes / ${c.pace}`;$('#class-description').textContent=c.description;$('#class-image').src='./assets/'+c.image;$('#class-image').alt=c.name+' movement class';$('#class-book').href='#schedule/'+id;$('#class-book').textContent=`Find a ${c.name} class`;$('#outline-middle').textContent=`10–${c.duration-10} MIN`;$('#outline-end').textContent=`${c.duration-10}–${c.duration} MIN`;}
function renderSchedule(){
 const focused=document.activeElement;const focusFilter=focused?.dataset.filter,focusDate=focused?.dataset.date;
 $('.filters').replaceChildren(...[['all','All classes'],...Object.entries(classes).map(([id,c])=>[id,c.name])].map(([id,name])=>{const b=document.createElement('button');b.textContent=name;b.dataset.filter=id;b.setAttribute('aria-pressed',String(filter===id));b.addEventListener('click',()=>{filter=id;renderSchedule()});return b}));
 $('#week-label').textContent=week===0?'12–18 October':'19–25 October';$('.previous-week').disabled=week===0;$('.next-week').disabled=week===1;
 $('.days').replaceChildren(...dates.slice(week*7,week*7+7).map(date=>{const b=document.createElement('button');b.innerHTML=`<span>${dateLabel(date,{weekday:'short'})}</span><strong>${Number(date.slice(-2))}</strong>`;b.dataset.date=date;b.setAttribute('aria-label',dateLabel(date));b.setAttribute('aria-pressed',String(date===day));b.addEventListener('click',()=>{day=date;renderSchedule()});return b}));
 const rows=rowsFor(day,filter);$('#selected-date').textContent=dateLabel(day);$('#session-count').textContent=`${rows.length} ${rows.length===1?'class':'classes'}`;
 $('.sessions').replaceChildren(...rows.map(s=>{const el=document.createElement('article');el.className='session';const c=classes[s.classId];el.innerHTML=`<div class="time">${s.start}<span>${s.end}</span></div><div><h3>${c.name}</h3><p>${s.teacher} / ${s.room} / ${c.duration} min</p></div><p class="availability">${s.spaces?s.spaces+' spaces':'Class full'}</p>`;const b=document.createElement(s.spaces?'a':'button');b.className='button'+(s.spaces?'':' outline');b.textContent=s.spaces?'Choose class':'See other times';b.setAttribute('aria-label',`${b.textContent}: ${c.name} at ${s.start}`);if(s.spaces)b.href='#booking/'+s.id;else b.addEventListener('click',()=>findNext(s.classId));el.append(b);return el}));
 $('.empty').hidden=rows.length!==0;$('.empty p').textContent=`No ${filter==='all'?'':classes[filter].name+' '}classes on this day. Try another day or show all classes.`;
 $('.next-available').disabled=!nextAvailable(day,filter);$('.show-all').hidden=filter==='all';animate($('.sessions'),180);
 if(focusFilter)$(`[data-filter="${focusFilter}"]`)?.focus({preventScroll:true});if(focusDate)$(`[data-date="${focusDate}"]`)?.focus({preventScroll:true});
}
function findNext(classFilter=filter){const next=nextAvailable(day,classFilter);if(next){filter=classFilter;day=next.date;week=dates.indexOf(day)>=7?1:0;renderSchedule();$('#selected-date').setAttribute('tabindex','-1');$('#selected-date').focus({preventScroll:true});$('#announcement').textContent='Showing '+dateLabel(day)}else{$('#announcement').textContent='No later sessions in this preview. Choose another day.'}}
$('.next-available').addEventListener('click',()=>findNext());$('.show-all').addEventListener('click',()=>{filter='all';renderSchedule()});
$('.previous-week').addEventListener('click',()=>{week=0;day=dates[dates.indexOf(day)%7];renderSchedule()});$('.next-week').addEventListener('click',()=>{week=1;day=dates[7+dates.indexOf(day)%7];renderSchedule()});$('.this-week').addEventListener('click',()=>{week=0;day='2026-10-15';renderSchedule()});
function renderBooking(s){chosen=s;const c=classes[s.classId];$('.booking-date').textContent=dateLabel(s.date,{weekday:'long',day:'numeric',month:'long',year:'numeric'});$('.booking-class').textContent=c.name;$('.booking-time').textContent=`${s.start}–${s.end} / ${c.duration} minutes`;$('.booking-teacher').textContent=`With ${s.teacher} / ${s.room}`;$('#booking-form').hidden=false;$('.booking-result').hidden=true;}
$('#booking-form').addEventListener('submit',e=>{
 e.preventDefault();const errors=validateContact($('#name').value,$('#email').value);
 for(const id of ['name','email']){$('#'+id+'-error').textContent=errors[id];$('#'+id).setAttribute('aria-invalid',String(!!errors[id]))}
 if(errors.name||errors.email){$(errors.name?'#name':'#email').focus();return}
 if(!chosen||chosen.spaces<=0)return;
 $('.result-summary').textContent=`${classes[chosen.classId].name} with ${chosen.teacher} / ${dateLabel(chosen.date,{weekday:'short',month:'short',day:'numeric'})} / ${chosen.start}–${chosen.end}`;
 $('#booking-form').hidden=true;$('.booking-result').hidden=false;animate($('.booking-result'));$('.booking-result h2').focus();
});
function route(initial=false){
 const next=parseRoute(location.hash),old=view;
 if(old==='schedule'&&next.view==='booking'){scheduleY=scrollY}
 if(menu.open)menu.close();if(answer.open)answer.close();
 view=next.view;$$('[data-view]').forEach(el=>el.hidden=el.dataset.view!==view);
 if(view==='detail')updateDetail(next.id);
 if(view==='schedule'){if(next.filter)filter=next.filter;renderSchedule()}
 if(view==='booking'){renderBooking(next.session);if(old!=='schedule'){day=next.session.date;week=dates.indexOf(day)>=7?1:0;filter=next.session.classId}}
 document.title=view==='home'?'Pulse — Move with more control':view==='detail'?classes[next.id].name+' — Pulse':view==='schedule'?'Find your rhythm — Pulse':'Your first class — Pulse';
 if(old==='booking'&&view==='schedule'){scrollTo({top:scheduleY,behavior:'instant'});const id=chosen?.id;const link=$(`a[href="#booking/${id}"]`);(link||$('#schedule-view h1')).focus({preventScroll:true})}
 else if(next.anchor){$('#'+next.anchor).scrollIntoView({behavior:motion()?'smooth':'instant'});const h=$('#'+next.anchor+' h2');if(h){h.tabIndex=-1;h.focus({preventScroll:true})}}
 else{scrollTo({top:0,behavior:'instant'});const h=$(`[data-view="${view}"] h1`);if(!initial)h?.focus({preventScroll:true})}
 updateHeader();if(view!=='home')film.pause();else if(!filmStarted&&motion())playFilm(false);
}
function updateHeader(){
 $('.header').classList.toggle('compact',view==='home'&&scrollY>90);
 if(view==='home'&&pinnedStory()){const rect=storyTrack.getBoundingClientRect();const travel=storyTrack.offsetHeight-storyStage.offsetHeight;const next=storyIndex(-rect.top/travel);if(next!==step)showStep(next)}
}
function onScroll(){if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateHeader()})}
addEventListener('scroll',onScroll,{passive:true});addEventListener('resize',updateHeader);addEventListener('hashchange',()=>route());
function filmLabel(){$('.film-control').textContent=!motion()?'Motion paused':filmFinished?'Replay film':film.paused?'Play film':'Pause film';$('.film-control').disabled=!motion()}
async function playFilm(replay){if(!motion()||view!=='home')return;if(replay){film.currentTime=0;filmFinished=false}try{await film.play();filmStarted=true;film.classList.add('visible')}catch{film.classList.remove('visible')}filmLabel();}
film.addEventListener('playing',()=>{film.classList.add('visible');filmLabel()});film.addEventListener('pause',filmLabel);film.addEventListener('ended',()=>{filmFinished=true;filmLabel()});film.addEventListener('error',()=>{film.classList.remove('visible');$('.film-control').textContent='Film unavailable';$('.film-control').disabled=true});
$('.film-control').addEventListener('click',()=>{if(!film.paused)film.pause();else playFilm(filmFinished)});
function applyMotion(){const before=storyTrack.getBoundingClientRect();const inside=view==='home'&&before.top<=0&&before.bottom>innerHeight;document.body.classList.toggle('motion-off',!motion());if(inside)scrollTo({top:storyTrack.getBoundingClientRect().top+scrollY,behavior:'instant'});$$('.motion-toggle').forEach(b=>{b.textContent=reduced.matches?'Reduced motion enabled':paused?'Enable motion':'Pause motion';b.setAttribute('aria-pressed',String(!motion()));b.disabled=reduced.matches});if(!motion()){film.pause();film.classList.remove('visible');document.getAnimations().forEach(a=>a.finish())}filmLabel();}
$$('.motion-toggle').forEach(b=>b.addEventListener('click',()=>{paused=!paused;applyMotion()}));reduced.addEventListener('change',applyMotion);
document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause()});
$('.skip').addEventListener('click',e=>{e.preventDefault();$('#main').tabIndex=-1;$('#main').focus();});
document.addEventListener('click',e=>{const link=e.target.closest('a[href^="#"]');if(link&&link.getAttribute('href')===location.hash){e.preventDefault();route()}});
buildCards();showStep(0);applyMotion();route(true);
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('revealed');observer.unobserve(entry.target)}}),{threshold:.16});
$$('.intro li,.class-card,.closing').forEach((el,i)=>{el.classList.add('reveal');el.style.setProperty('--reveal-delay',`${(i%4)*80}ms`);observer.observe(el)});
