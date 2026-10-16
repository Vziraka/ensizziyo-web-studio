import {homes,money,filterHomes,routeFor,wrap,validateInquiry,preferredDay} from './model.mjs';
import {createScrollMotion} from './scroll-motion.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const reduced=matchMedia('(prefers-reduced-motion:reduce)'),rail=$('.listing-rail'),gallery=$('#gallery');
let paused=false,current={page:'home'},setting='all',price='any',order='setting',railIndex=0,photoIndex=0,origin=null,modalOrigin=null,propertyY=0,inquiryHome=null,transitioning=false;
const motion=()=>!paused&&!reduced.matches;
const facts=h=>`${h.setting} / ${h.beds} bedrooms / ${h.baths} bathrooms / ${h.area.toLocaleString('en-US')} sq ft`;
const images=[['foundry-living.webp','The living room, opening onto a sheltered garden.'],['foundry-courtyard.webp','From the courtyard, looking toward the living room.'],['foundry-detail.webp','Brick, steel and a continuous stone threshold.']];
function animate(el,ms=240){if(motion())el.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:ms,easing:'ease-out'});}
function homeCard(h){return `<a class="listing-card" href="#property/${h.id}" aria-label="Explore ${h.name}"><div class="image-wrap"><img src="assets/${h.image}" alt="${h.name}" loading="eager"></div><div class="listing-meta"><h2>${h.name}</h2><p>${money(h.price)}</p></div><p class="listing-setting">${h.setting}</p></a>`;}
rail.innerHTML=homes.map(homeCard).join('');
function updateRail(){const cards=$$('.listing-card'),left=rail.getBoundingClientRect().left+22;railIndex=cards.reduce((best,card,i)=>Math.abs(card.getBoundingClientRect().left-left)<Math.abs(cards[best].getBoundingClientRect().left-left)?i:best,0);$('.rail-count').textContent=`0${railIndex+1} / 03`;cards.forEach((card,i)=>card.classList.toggle('active',i===railIndex));}
rail.addEventListener('scroll',updateRail,{passive:true});
function moveRail(delta){railIndex=wrap(railIndex+delta,3);const card=$$('.listing-card')[railIndex];rail.scrollTo({left:card.offsetLeft-rail.offsetLeft-22,behavior:motion()?'smooth':'instant'});$('.rail-count').textContent=`0${railIndex+1} / 03`;}
$('.rail-prev').onclick=()=>moveRail(-1);$('.rail-next').onclick=()=>moveRail(1);
function renderCollection(){
 const focus=document.activeElement?.dataset.setting;
 $('.settings-filter').innerHTML=['all','City','Coast','Country'].map(s=>`<button data-setting="${s}" aria-pressed="${s===setting}">${s==='all'?'All homes':s} <span>${filterHomes(s,price).length}</span></button>`).join('');
 $$('[data-setting]').forEach(b=>b.onclick=()=>{setting=b.dataset.setting;renderCollection()});
 const result=filterHomes(setting,price,order);$('#results-count').textContent=`${result.length} ${result.length===1?'home':'homes'} found`;
 $('.collection-grid').innerHTML=result.map((h,i)=>`<a class="collection-card" href="#property/${h.id}" aria-label="Explore ${h.name}"><div class="image-wrap"><img src="assets/${h.image}" alt="${h.name}"></div><div><span class="eyebrow">0${i+1} / ${h.setting}</span><div class="collection-meta"><h2>${h.name}</h2><p>${money(h.price)}</p></div><div class="detail-line"><p>${h.beds} bedrooms / ${h.baths} bathrooms / ${h.area.toLocaleString('en-US')} sq ft</p><span class="line-link">Explore this home <img src="assets/arrow-left.svg" alt=""></span></div></div></a>`).join('');
 $('.empty').hidden=result.length>0;$('.empty-selection').textContent=`${setting==='all'?'All homes':setting} / ${price==='any'?'Any price':'Up to '+money(Number(price))}`;$('.empty-description').textContent=`${setting==='Coast'?'The coastal home':setting==='Country'?'The country home':'The homes'} in this collection ${setting==='all'?'are':'is'} above this price. Adjust the budget or explore all three homes.`;
 animate($('.collection-grid'),180);if(focus)$(`[data-setting="${focus}"]`)?.focus({preventScroll:true});
}
$('#price').onchange=e=>{price=e.target.value;renderCollection()};$('#order').onchange=e=>{order=e.target.value;renderCollection()};
$('.clear-price').onclick=()=>{price='any';$('#price').value=price;renderCollection();$('#price').focus()};$('.clear-all').onclick=()=>{price='any';setting='all';$('#price').value=price;renderCollection();$('[data-setting="all"]').focus()};
function fillHome(h){
 $$('.property-name').forEach(el=>el.textContent=h.name);$$('.property-price').forEach(el=>el.textContent=money(h.price));$$('.viewing-link').forEach(a=>a.href='#inquiry/'+h.id);$$('.back-property').forEach(a=>a.href='#property/'+h.id);
 $('#property-title').textContent=h.name;$('#property-kind').textContent=h.setting+' / '+h.type;
 $('#property-image').src='assets/'+h.image;$('#property-image').alt=h.name+' — '+h.type;$('.property-beds').textContent=h.beds;$('.property-baths').textContent=h.baths;$('.property-area').textContent=h.area.toLocaleString('en-US')+' sq ft';
 $('.foundry-story').hidden=h.id!=='foundry';$('.other-story').hidden=h.id==='foundry';$('.other-description').textContent=h.id==='tide'?'A modern coastal home with expansive views and easy living.':'A country retreat among mature trees and quiet gardens.';
 $('.gallery-open').textContent=`Gallery (${h.id==='foundry'?3:1})`;$('[data-scroll="practical"]').hidden=h.id!=='foundry';
 $('.inquiry-image').src='assets/'+h.image;$('.inquiry-image').alt=h.name;$('.inquiry-facts').textContent=facts(h);
 $('.back-homes').href=origin?.hash||'#homes';$('.back-homes').lastChild.textContent=origin?.hash==='#home'?' Back to home':' Back to homes';
}
function updateBar(){const factsEl=$('.facts');$('.property-bar').hidden=current.page!=='property'||factsEl.getBoundingClientRect().bottom>0||$$('dialog').some(d=>d.open);}
let scrollPending=false;
function scheduleScroll(){if(!scrollPending){scrollPending=true;requestAnimationFrame(()=>{scrollPending=false;updateBar();scrollMotion.update()})}}
addEventListener('scroll',scheduleScroll,{passive:true});
addEventListener('resize',scheduleScroll);
document.addEventListener('visibilitychange',scheduleScroll);
function applyRoute(initial=false){
 const next=routeFor(location.hash),previous=current;current=next;document.body.classList.remove('home','homes','property','inquiry');document.body.classList.add(next.page);$$('[data-view]').forEach(el=>el.hidden=el.dataset.view!==next.page);$$('dialog[open]').forEach(d=>d.close());
 if(next.page==='homes')renderCollection();if(next.home)fillHome(next.home);
 if(next.page==='inquiry'){
  if(inquiryHome!==next.home.id){$('#inquiry-form').reset();$$('.error').forEach(e=>e.textContent='');$$('[aria-invalid]').forEach(e=>e.removeAttribute('aria-invalid'));inquiryHome=next.home.id;}
  $('#inquiry-form').hidden=false;$('.inquiry-result').hidden=true;
 }
 document.title=next.page==='home'?'Fieldwork — Some places feel different':next.page==='homes'?'Find your place — Fieldwork':next.page==='property'?next.home.name+' — Fieldwork':'Arrange a viewing — Fieldwork';
 const returning=previous.page==='property'&&['homes','home'].includes(next.page)&&origin?.hash===location.hash;
 if(returning){scrollTo({top:origin.y,behavior:'instant'});const link=origin.el?.isConnected?origin.el:$(`[data-view="${next.page}"] a[href="${origin.href}"]`);link?.focus({preventScroll:true});}
 else if(previous.page==='inquiry'&&next.page==='property'){scrollTo({top:propertyY,behavior:'instant'});$('.facts .viewing-link').focus({preventScroll:true});}
 else{scrollTo({top:0,behavior:'instant'});if(!initial)$(`[data-view="${next.page}"] h1`)?.focus({preventScroll:true});}
 updateBar();scheduleScroll();
}
async function navigateRoute(){
 const next=routeFor(location.hash),source=origin?.el?.querySelector('img');
 if(!transitioning&&motion()&&document.startViewTransition&&next.page==='property'&&['home','homes'].includes(current.page)&&source){
  transitioning=true;source.style.viewTransitionName='property-photo';
  try{const vt=document.startViewTransition(()=>{source.style.viewTransitionName='';applyRoute();$('#property-image').style.viewTransitionName='property-photo'});await vt.finished;}catch{applyRoute();}finally{source.style.viewTransitionName='';$('#property-image').style.viewTransitionName='';transitioning=false;}
 }else applyRoute();
}
addEventListener('hashchange',navigateRoute);
document.addEventListener('click',e=>{
 const a=e.target.closest('a[href^="#"]');if(!a)return;const hash=a.getAttribute('href');if(hash==='#main'){e.preventDefault();const h=$(`[data-view="${current.page}"] h1`);h.focus();return;}
 if(hash.startsWith('#property/')&&['home','homes'].includes(current.page))origin={hash:location.hash||'#home',y:scrollY,el:a,href:hash};
 if(hash.startsWith('#inquiry/')&&current.page==='property')propertyY=scrollY;
 if(hash===location.hash){e.preventDefault();applyRoute();}
});
$$('[data-scroll]').forEach(b=>b.onclick=()=>{const el=$('#'+b.dataset.scroll);el.scrollIntoView({behavior:motion()?'smooth':'instant'});const h=el.querySelector('h2');h.tabIndex=-1;h.focus({preventScroll:true})});
function photoSet(){return current.home?.id==='foundry'?images:[[current.home?.image||homes[0].image,current.home?.name||'The Foundry']];}
function renderPhoto(){const list=photoSet();photoIndex=wrap(photoIndex,list.length);const [src,caption]=list[photoIndex];$('.gallery-image').src='assets/'+src;$('.gallery-image').alt=caption;$('.gallery-caption').textContent=caption;$('.gallery-count').textContent=`0${photoIndex+1} / 0${list.length}`;$('.gallery-prev').hidden=$('.gallery-next').hidden=list.length===1;$('.gallery-thumbs').innerHTML=list.map(([src,label],i)=>`<button data-gallery="${i}" aria-label="${label}" aria-pressed="${i===photoIndex}"><img src="assets/${src}" alt=""></button>`).join('');$$('[data-gallery]').forEach(b=>b.onclick=()=>{photoIndex=Number(b.dataset.gallery);renderPhoto();$(`[data-gallery="${photoIndex}"]`).focus({preventScroll:true})});if(motion())$('.gallery-image').animate([{opacity:.25},{opacity:1}],{duration:280});}
function openGallery(index,el){modalOrigin=el;photoIndex=index;$('#gallery-title').textContent=current.home?.name||'The Foundry';renderPhoto();gallery.showModal();$('.close-gallery').focus();updateBar();}
$('.property-photo').onclick=e=>openGallery(photoIndex,e.currentTarget);$('.gallery-open').onclick=e=>openGallery(photoIndex,e.currentTarget);$$('.gallery-photo').forEach(b=>b.onclick=()=>openGallery(Number(b.dataset.photo),b));
$('.gallery-prev').onclick=()=>{photoIndex--;renderPhoto()};$('.gallery-next').onclick=()=>{photoIndex++;renderPhoto()};$('.close-gallery').onclick=()=>gallery.close();
gallery.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();photoIndex=e.key==='Home'?0:e.key==='End'?photoSet().length-1:photoIndex+(e.key==='ArrowRight'?1:-1);renderPhoto();}});
let touch=null;$('.gallery-image').onpointerdown=e=>touch={x:e.clientX,y:e.clientY};$('.gallery-image').onpointerup=e=>{if(touch){const dx=e.clientX-touch.x,dy=e.clientY-touch.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){photoIndex+=dx<0?1:-1;renderPhoto()}touch=null}};$('.gallery-image').onpointercancel=()=>touch=null;
const info={about:['Places to belong.','Distinctive homes. Carefully selected. Fieldwork is an illustrative property collection, exploring the spaces, materials and surroundings that make a home feel different.'],sell:['A considered next step.','Selling services and valuations are not connected in this local preview. Explore the representative homes and viewing journey.'],contact:['Start with a home.','Contact delivery is not connected in this local preview. Choose a home to explore its details and preview a viewing inquiry.'],loft:['The Loft','A reimagined industrial space in the heart of the city. This is an editorial feature; a full listing, price and viewing journey are not included in the sample.']};
$$('[data-info]').forEach(b=>b.onclick=()=>{const [title,copy]=info[b.dataset.info];if($('#menu').open)$('#menu').close();modalOrigin=b;$('#info-title').textContent=title;$('#info-text').textContent=copy;$('#info').showModal();$('.close-info').focus()});
$$('.plan-open').forEach(b=>b.onclick=()=>{modalOrigin=b;$('#plan').showModal();$('.close-plan').focus()});
$('.close-plan').onclick=()=>$('#plan').close();$('.close-info').onclick=()=>$('#info').close();$('.menu-button').onclick=e=>{modalOrigin=e.currentTarget;$('#menu').showModal()};$('.close-menu').onclick=()=>$('#menu').close();
$$('dialog').forEach(d=>d.addEventListener('close',()=>{if(modalOrigin?.isConnected&&!modalOrigin.closest('[hidden]')&&!modalOrigin.closest('dialog:not([open])'))modalOrigin.focus({preventScroll:true});updateBar()}));
function applyMotion(){document.body.classList.toggle('motion-off',!motion());$$('.motion-toggle').forEach(b=>{b.textContent=motion()?'Pause motion':'Enable motion';b.setAttribute('aria-pressed',String(!motion()))});if(!motion())document.getAnimations().forEach(a=>a.finish());scheduleScroll();}
$$('.motion-toggle').forEach(b=>b.onclick=()=>{paused=!paused;applyMotion()});reduced.addEventListener('change',applyMotion);
$('#inquiry-form').addEventListener('submit',e=>{e.preventDefault();const data={name:$('#name').value,email:$('#email').value,day:$('#day').value};const errors=validateInquiry(data);for(const id of ['name','email','day']){$('#'+id+'-error').textContent=errors[id];$('#'+id).setAttribute('aria-invalid',String(!!errors[id]))}const first=Object.keys(errors).find(key=>errors[key]);if(first){$('#'+first).focus();return;}
 $('.result-home').textContent=current.home.name+' / '+money(current.home.price);$('.result-preference').textContent='Preferred: '+preferredDay(data.day)+' / '+$('#time').value.toLowerCase();$('.result-email').textContent='Reply to: '+data.email.trim();$('#inquiry-form').hidden=true;$('.inquiry-result').hidden=false;$('.inquiry-result h2').focus();animate($('.inquiry-result'));
});$('.edit-inquiry').onclick=()=>{$('.inquiry-result').hidden=true;$('#inquiry-form').hidden=false;$('#name').focus()};
$('.mobile-note-toggle').onclick=()=>{const open=$('.note-field').classList.toggle('note-visible');$('.mobile-note-toggle').setAttribute('aria-expanded',String(open));if(open)$('#note').focus();};
const scrollMotion=createScrollMotion(motion);
new ResizeObserver(scheduleScroll).observe($('#main'));
document.fonts.ready.then(scheduleScroll);
applyMotion();applyRoute(true);renderCollection();updateRail();
