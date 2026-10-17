import {flavors,wrap,route,pose,railDelta,headingFor,settledPosition,sunRotation} from './model.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const mobile=matchMedia('(max-width:700px)'), reduced=matchMedia('(prefers-reduced-motion:reduce)');
const stage=$('.stage'),menu=$('#menu');
const originals=$$('.product');
originals.forEach((p,i)=>p.dataset.slot=i);
for(const offset of [-3,3])originals.forEach((p,i)=>{const clone=p.cloneNode(true);clone.dataset.slot=i+offset;$('.products').append(clone)});
const products=$$('.product');
let selected=mobile.matches?0:1,position=selected,target=selected,ready=false,frame=0;
let view='collection',savedScroll=0,returnFocus=null,lastDetail=0,point={x:0,y:0},lastTime=0,velocity=0;
let wheelTimer=0,wheelStart=selected,drag=null,ignoreClickUntil=0;
const motion=()=>!reduced.matches;
const announce=message=>$('#announcement').textContent=message;
const closestProduct=index=>products.filter(p=>Number(p.dataset.flavor)===index).sort((a,b)=>Math.abs(railDelta(Number(a.dataset.slot),position))-Math.abs(railDelta(Number(b.dataset.slot),position)))[0];
function select(index){
  clearTimeout(wheelTimer);wheelTimer=0;
  const next=wrap(index);let distance=next-wrap(Math.round(target));if(distance>1)distance-=3;if(distance< -1)distance+=3;
  target=Math.round(target)+distance;updateSelection(next);if(!motion())position=target;requestDraw();
}
function updateSelection(index){
  selected=wrap(index);const f=flavors[selected];
  $('#selected-name').textContent=f.name;$('#selected-description').textContent=f.description;
  $('.counter').textContent=`0${selected+1} / 03`;
  $$('.stage-open,.selection-open').forEach(a=>{a.href=`#flavor/${f.id}`;a.setAttribute('aria-label',`Explore ${f.name}`)});
  $$('[data-select]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.select)===selected)));
}
function requestDraw(){if(!frame)frame=requestAnimationFrame(draw);}
function draw(time){
  frame=0;const dt=Math.min(40,time-(lastTime||time-16));lastTime=time;
  const before=position;
  position=motion()?position+(target-position)*(1-Math.exp(-dt/180)):target;
  if(Math.abs(target-position)<.001)position=target;
  velocity=motion()?velocity+((position-before)/Math.max(dt,1)*1000-velocity)*.2:0;
  if(Math.abs(velocity)<.002)velocity=0;
  const w=stage.clientWidth,h=stage.clientHeight;
  const primary=flavors.map((_,i)=>closestProduct(i));
  products.forEach(p=>{
    const slot=Number(p.dataset.slot),i=Number(p.dataset.flavor),delta=railDelta(slot,position),isPrimary=primary[i]===p;
    if(mobile.matches){
      p.style.transform=`translate3d(${delta*w}px,${motion()?Math.abs(delta)*12:0}px,0) rotate(${motion()?Math.max(-10,Math.min(10,delta*-5-velocity*2)):0}deg)`;
      p.style.opacity='1';p.style.zIndex=String(20-Math.round(Math.abs(delta)*3));p.style.visibility=Math.abs(delta)>1.4?'hidden':'visible';
    }else{
      const a=pose(slot,position,w,h);
      // shortcut: bounded image yaw approximates depth; true label/back rotation needs a 3D bottle asset.
      p.style.transform=`translate3d(${a.x+point.x*a.scale}px,${a.y+point.y*a.scale}px,0) scale(${a.scale}) rotate(${a.rotate+(motion()?-Math.max(-9,Math.min(9,velocity*2.5)):0)}deg) rotateY(${motion()?a.yaw+point.x*.3:0}deg)`;
      p.style.opacity='1';p.style.zIndex=String(a.z);p.style.visibility=Math.abs(delta)>2.8?'hidden':'visible';
    }
    p.tabIndex=isPrimary&&(!mobile.matches||i===selected)?0:-1;
    p.setAttribute('aria-hidden',String(!isPrimary||mobile.matches&&i!==selected));
    p.setAttribute('aria-label',`Explore ${flavors[i].name}`);
    p.removeAttribute('aria-pressed');
  });
  $('.sun').style.transform=motion()?`translate3d(${-point.x*.3}px,${-Math.min(16,Math.abs(velocity)*5)}px,0) rotate(${sunRotation(position)}deg)`:'none';
  $('.tagline').style.transform=mobile.matches||!motion()?'none':`translate3d(${-point.x*.4}px,${Math.min(8,Math.abs(velocity)*3)}px,0)`;
  if((position!==target||velocity!==0)&&view==='collection')requestDraw();else lastTime=0;
}
function settleWheel(){
  target=settledPosition(target,wheelStart);wheelTimer=0;updateSelection(wrap(target));announce(flavors[selected].name);requestDraw();
}
stage.addEventListener('wheel',e=>{
  if(view!=='collection'||mobile.matches||!motion()||menu.open||e.ctrlKey||stage.getBoundingClientRect().top < -1)return;
  e.preventDefault();
  if(!wheelTimer)wheelStart=Math.round(target);
  const units=e.deltaMode===1?16:e.deltaMode===2?stage.clientHeight:1;
  const delta=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*units;
  target+=Math.max(-500,Math.min(500,delta))/(stage.clientWidth*.55);
  updateSelection(wrap(Math.round(target)));requestDraw();clearTimeout(wheelTimer);wheelTimer=setTimeout(settleWheel,200);
},{passive:false});
function applyMotion(){
  clearTimeout(wheelTimer);wheelTimer=0;drag=null;
  document.body.classList.toggle('motion-off',!motion());point={x:0,y:0};$('.ingredients').style.transform='none';$('#detail-image').style.transform='none';
  if(!motion()){target=Math.round(target);position=target;velocity=0;document.getAnimations().forEach(a=>a.finish())}
  updateSelection(wrap(Math.round(target)));requestDraw();
}
function updateDetail(index){
  const f=flavors[index];lastDetail=index;document.body.style.setProperty('--flavor',f.color);
  const im=new Image();im.src='./assets/'+headingFor(index);im.alt=f.name;$('#detail-title').replaceChildren(im);
  $('#detail-image').src='./assets/'+f.image;$('#detail-image').alt=f.alt;$('#detail-image').style.transform='none';
  $('#detail-description').textContent=f.description.replace('. ','.\n');
  for(let i=0;i<2;i++){const word=i?'two':'one';$(`#note-${word}`).textContent=f.ingredients[i];$(`#ingredient-${word}`).textContent=f.ingredients[i];$(`#taste-${word}`).textContent=f.notes[i];$(`#story-${word}`).textContent=f.story[i]}
  $('.ingredients').hidden=index!==0;
  $$('.next-detail').forEach(b=>{b.replaceChildren(document.createTextNode(`${b.classList.contains('pill')?'Explore ':''}${flavors[wrap(index+1)].name}`));const arrow=new Image();arrow.src='./assets/arrow-left.svg';arrow.alt='';b.append(arrow)});
}
function revealDetail(){
  $('#detail-title').animate([{clipPath:'inset(100% 0 0 0)',transform:'translateY(50px)'},{clipPath:'inset(0 0 0 0)',transform:'none'}],{duration:1000,delay:160,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'});
  $$('.detail-caption,.story-link,.notes-line').forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'none'}],{duration:700,delay:300+i*90,easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));
}
function showDetail(index,fromHistory=false){
  clearTimeout(wheelTimer);wheelTimer=0;
  const entering=view!=='detail',source=closestProduct(index).getBoundingClientRect();
  if(entering){savedScroll=scrollY;returnFocus=document.activeElement}
  let departing=null;
  if(entering&&motion()&&ready&&source.bottom>0&&source.top<innerHeight){
    departing=$('.scene').cloneNode(true);departing.classList.add('departing-scene');departing.setAttribute('aria-hidden','true');departing.inert=true;
    const bounds=stage.getBoundingClientRect();Object.assign(departing.style,{position:'fixed',left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,zIndex:25,pointerEvents:'none'});
    departing.querySelectorAll(`[data-flavor="${index}"]`).forEach(p=>p.style.visibility='hidden');document.body.append(departing);
  }
  view='detail';updateDetail(index);$('#collection').hidden=true;$('#detail').hidden=false;$('.all-flavors').hidden=false;$('.brand-type').hidden=true;
  scrollTo({top:0,behavior:'instant'});$('#detail-title').focus({preventScroll:true});
  if(motion()&&ready&&!fromHistory){
    const el=$('.detail-product'),end=el.getBoundingClientRect();
    if(entering&&source.bottom>0&&source.top<innerHeight){
      el.animate([{transform:`translate(${source.left-end.left}px,${source.top-end.top}px) scale(${source.width/end.width},${source.height/end.height}) rotate(-8deg)`},{transform:'none'}],{duration:1100,easing:'cubic-bezier(.16,1,.3,1)'});
    }else el.animate([{opacity:0,transform:'translateX(90px) rotate(12deg) scale(.9)'},{opacity:1,transform:'none'}],{duration:950,easing:'cubic-bezier(.16,1,.3,1)'});
    revealDetail();
  }
  if(departing){const a=departing.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(100px) scale(1.08)'}],{duration:650,easing:'ease-in'});a.finished.finally(()=>departing.remove())}
  document.title=`${flavors[index].name} — Sola`;announce(flavors[index].name+' flavor story');
}
function showCollection(){
  const returning=view==='detail';view='collection';$('#detail').hidden=true;$('#collection').hidden=false;$('.all-flavors').hidden=true;$('.brand-type').hidden=false;document.title='Sola — A little sunshine, bottled';
  if(returning){
    scrollTo({top:savedScroll,behavior:'instant'});
    if(returnFocus?.isConnected&&!returnFocus.closest('[hidden]'))returnFocus.focus({preventScroll:true});else closestProduct(selected).focus({preventScroll:true});
    if(motion()&&ready)$('.scene').animate([{opacity:0,transform:'translateY(55px) scale(.94)'},{opacity:1,transform:'none'}],{duration:900,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  requestDraw();
}
function handleRoute(){
  if(menu.open)menu.close();
  if(location.hash==='#story'){if(view!=='detail')showDetail(lastDetail,true);$('#story').scrollIntoView({behavior:motion()?'smooth':'instant'});return}
  const r=route(location.hash);if(r.view==='detail')showDetail(r.index);else showCollection();
}
$('.previous').addEventListener('click',()=>{select(selected-1);announce(flavors[selected].name)});
$('.next').addEventListener('click',()=>{select(selected+1);announce(flavors[selected].name)});
products.forEach(p=>p.addEventListener('click',e=>{
  if(performance.now()<ignoreClickUntil){e.preventDefault();return}
  const i=Number(p.dataset.flavor);returnFocus=p;location.hash=`flavor/${flavors[i].id}`;
}));
$$('[data-select]').forEach(b=>b.addEventListener('click',()=>{select(Number(b.dataset.select));announce(flavors[selected].name)}));
stage.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select(selected+(e.key==='ArrowRight'?1:-1));announce(flavors[selected].name)}});
stage.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('a,.stage-bottom')||view!=='collection')return;
  clearTimeout(wheelTimer);wheelTimer=0;drag={id:e.pointerId,x:e.clientX,y:e.clientY,position:target,moved:false};
});
stage.addEventListener('pointermove',e=>{
  if(drag&&drag.id===e.pointerId){
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.moved&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.2){drag.moved=true;stage.setPointerCapture(e.pointerId)}
    if(drag.moved){target=drag.position-dx/(stage.clientWidth*(mobile.matches?.8:.34));if(!motion())position=target;updateSelection(wrap(Math.round(target)));requestDraw();return}
  }
  if(!motion()||mobile.matches||e.pointerType==='touch')return;
  const r=stage.getBoundingClientRect();point={x:((e.clientX-r.left)/r.width-.5)*22,y:((e.clientY-r.top)/r.height-.5)*14};requestDraw();
});
function endDrag(e){
  if(!drag||drag.id!==e.pointerId)return;
  if(drag.moved){target=settledPosition(target,Math.round(drag.position));updateSelection(wrap(target));announce(flavors[selected].name);ignoreClickUntil=performance.now()+350;requestDraw()}
  if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);drag=null;
}
stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);
stage.addEventListener('pointerleave',()=>{if(!drag){point={x:0,y:0};requestDraw()}});
let detailFrame=0;
addEventListener('scroll',()=>{
  if(view!=='detail'||!motion()||detailFrame)return;
  detailFrame=requestAnimationFrame(()=>{
    detailFrame=0;const h=$('.detail-intro').offsetHeight,p=Math.max(0,Math.min(1,scrollY/(h*.7)));
    $('#detail-image').style.transform=`translateY(${p*(mobile.matches?25:100)}px) rotate(${-p*13}deg) scale(${1-p*.08})`;
    const r=$('#story').getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)$('.ingredients').style.transform=`translateY(${Math.max(-30,Math.min(30,(r.top-innerHeight*.4)*.07))}px) rotate(${r.top/innerHeight*-5}deg)`;
  });
},{passive:true});
const reveals=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(!entry.isIntersecting||view!=='detail')return;
  if(motion())entry.target.animate([{opacity:0,transform:'translateY(35px)',clipPath:'inset(100% 0 0 0)'},{opacity:1,transform:'none',clipPath:'inset(0 0 0 0)'}],{duration:850,easing:'cubic-bezier(.16,1,.3,1)'});
  reveals.unobserve(entry.target);
}),{threshold:.2});
$$('.story h2,.story-copy p,.note-grid>div,.serve').forEach(el=>reveals.observe(el));
addEventListener('resize',requestDraw);mobile.addEventListener('change',()=>{drag=null;requestDraw()});reduced.addEventListener('change',applyMotion);
$('.menu-button').addEventListener('click',()=>menu.showModal());$('.close-menu').addEventListener('click',()=>menu.close());
menu.addEventListener('click',e=>{if(e.target===menu&&e.clientX<menu.getBoundingClientRect().left)menu.close();if(e.target.closest('a'))menu.close()});
$$('.next-detail').forEach(b=>b.addEventListener('click',()=>{location.hash=`flavor/${flavors[wrap(lastDetail+1)].id}`}));
addEventListener('hashchange',handleRoute);addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.open&&view==='detail')location.hash='collection'});
function loadedImage(im){
  if(im.complete)return im.naturalWidth?Promise.resolve():Promise.reject(new Error('Image unavailable'));
  return new Promise((resolve,reject)=>{im.addEventListener('load',resolve,{once:true});im.addEventListener('error',reject,{once:true})});
}
Promise.all($$('.product img,.tagline').map(loadedImage)).then(()=>{
  ready=true;$('.scene').hidden=false;$('.poster').hidden=true;requestDraw();
  if(motion()&&view==='collection')$('.scene').animate([{opacity:0,transform:'translateY(65px) scale(.95)'},{opacity:1,transform:'none'}],{duration:1100,easing:'cubic-bezier(.16,1,.3,1)'});
}).catch(()=>{$('.asset-error').hidden=false;products.forEach(p=>p.disabled=true)});
// Preload the companion titles so next-flavor transitions never reveal a missing heading.
flavors.forEach((_,i)=>{const im=new Image();im.src='./assets/'+headingFor(i)});
updateSelection(selected);applyMotion();handleRoute();
