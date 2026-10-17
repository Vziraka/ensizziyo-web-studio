import {motion,openDialog} from '../shared/preview.mjs';

// Only the visible samples are mounted. The full sites remain separate destinations.
export function mountShowcase(root,samples,initial,onChange,art){
  let index=initial,inView=true,timer=0,destroyed=false,drag=null,settling=0;
  const mq=matchMedia('(max-width:700px)'),frames=new Map(),abort=new AbortController();
  const listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:abort.signal});
  const active=()=>motion()&&inView&&!document.hidden;
  root.innerHTML=`<div class="gallery-heading"><span></span><h2>Our top work</h2></div>
    <div class="gallery-stage" aria-label="Sample project carousel" aria-roledescription="carousel" tabindex="0"></div>
    <div class="gallery-nav"><button class="round-control" data-step="-1" aria-label="Previous project">←</button><div class="gallery-captions"></div><button class="round-control" data-step="1" aria-label="Next project">→</button></div>
    <div class="gallery-tools"><button class="browse-projects" aria-haspopup="dialog">8 projects <span> / Browse all</span></button><div class="gallery-dots" aria-label="Choose project">${samples.map((s,i)=>`<button data-index="${i}" aria-label="Show ${s.name}"><span></span></button>`).join('')}</div><div class="gallery-actions"><a class="open-sample">Open sample <span aria-hidden="true"><svg class="ui-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M7 5h12v12"/></svg></span></a></div></div>
    <p class="sr-only gallery-announcement" aria-live="polite"></p>
    <dialog class="project-picker" aria-labelledby="picker-title"><div><h2 id="picker-title">Our top work</h2><button class="picker-close" aria-label="Close project picker">Close ×</button></div><div class="picker-list">${samples.map((s,i)=>`<button data-index="${i}"><span>${s.name}</span><small>${s.category}</small><span aria-hidden="true"><svg class="ui-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M7 5h12v12"/></svg></span></button>`).join('')}</div></dialog>`;
  const stage=root.querySelector('.gallery-stage'),picker=root.querySelector('dialog');
  const positions=()=>mq.matches?[0]:[-1,0,1];
  const positionIndex=offset=>(index+offset+samples.length)%samples.length;
  const scale=()=>{frames.forEach(({card,iframe})=>{if(iframe)iframe.style.transform=`scale(${card.clientWidth/1440})`})};
  const resize=new ResizeObserver(scale);resize.observe(stage);
  function send(){
    frames.forEach(({iframe})=>iframe?.contentWindow?.postMessage({type:'ensizziyo-preview',playing:active()&&!settling},location.origin));
    root.classList.toggle('gallery-paused',!active());
  }
  function mountFrame(entry,s){
    if(entry.iframe||!active()||settling)return;
    const iframe=document.createElement('iframe');entry.iframe=iframe;
    iframe.title=`${s.name} animated preview`;iframe.tabIndex=-1;iframe.setAttribute('aria-hidden','true');iframe.setAttribute('inert','');
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin');iframe.allow='autoplay';
    iframe.src=s.url+'?showreel=1#home';
    iframe.onload=()=>{if(destroyed)return;scale();send();entry.card.classList.add('preview-loaded')};
    entry.card.prepend(iframe);scale();
  }
  function render(announce=false,animate=false,duration=700){
    const before=animate&&motion()?new Map([...frames].map(([i,e])=>[i,e.card.getBoundingClientRect().left])):null;
    stage.style.setProperty('--gallery-duration',`${duration}ms`);
    const visible=positions().map(offset=>({offset,i:positionIndex(offset)}));
    const keep=new Set(visible.map(v=>v.i));
    frames.forEach((entry,i)=>{if(!keep.has(i)){entry.card.remove();frames.delete(i)}});
    for(const {offset,i} of visible){
      const s=samples[i];let entry=frames.get(i);
      if(!entry){
        const card=document.createElement('article');card.className='gallery-panel';
        card.innerHTML=`<div class="preview-poster">${art(s.name)}</div><a href="${s.url}" data-sample="${s.name}" aria-label="Open ${s.name} sample"><span class="panel-open">Open ${s.name} <svg class="ui-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19 19 5M7 5h12v12"/></svg></span></a>`;
        entry={card,iframe:null};frames.set(i,entry);stage.append(card);
      }
      entry.card.dataset.position=String(offset);entry.card.style.order=offset+1;
    }
    root.querySelector('.gallery-captions').innerHTML=visible.map(({i})=>`<div><strong>${samples[i].name}</strong><span>${samples[i].name==='Arc'?'Web app / Systems / Automation':samples[i].description.split(' / ')[0]}</span></div>`).join('');
    root.querySelectorAll('.gallery-dots button').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===index));b.tabIndex=mq.matches?-1:0;b.setAttribute('aria-hidden',String(mq.matches))});
    root.querySelectorAll('.picker-list button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
    root.querySelector('.browse-projects').innerHTML=`${index+1} / 8 projects <span> / Browse all</span>`;
    const link=root.querySelector('.open-sample');link.href=samples[index].url;link.dataset.sample=samples[index].name;
    if(announce)root.querySelector('.gallery-announcement').textContent=`${samples[index].name}, project ${index+1} of 8`;
    onChange(index);
    if(before){
      clearTimeout(settling);
      // Keep sample startup/decoding off the carousel transition's frame budget.
      settling=setTimeout(()=>{settling=0;if(!destroyed){frames.forEach((entry,i)=>mountFrame(entry,samples[i]));send()}},duration+50);
      const moves=[...frames].map(([i,{card}])=>({card,dx:before.has(i)?before.get(i)-card.getBoundingClientRect().left:80,existed:before.has(i)}));
      moves.forEach(({card,dx,existed})=>{card._slide?.cancel();card._slide=card.animate([{translate:`${dx}px 0`,opacity:existed?1:0},{translate:'0 0',opacity:1}],{duration,easing:'cubic-bezier(.4,0,.2,1)'})});
    }
    frames.forEach((entry,i)=>mountFrame(entry,samples[i]));send();scale();
  }
  function schedule(){clearInterval(timer);if(active())timer=setInterval(()=>select(index+1,false),15000)}
  function select(next,manual=true){index=(next+samples.length)%samples.length;render(manual,true,manual?700:1200);schedule()}
  listen(root,'click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.step){select(index+Number(b.dataset.step));return}
    if(b.dataset.index!==undefined){select(Number(b.dataset.index));if(picker.open)picker.close();return}
    if(b.classList.contains('browse-projects'))openDialog(picker,b);
    if(b.classList.contains('picker-close'))picker.close();
  });
  listen(stage,'keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();select(e.key==='Home'?0:e.key==='End'?7:index+(e.key==='ArrowRight'?1:-1))}});
  listen(stage,'pointerdown',e=>{if(e.button===0)drag={x:e.clientX,y:e.clientY}});
  listen(stage,'pointerup',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){select(index+(dx<0?1:-1));const stop=ev=>{ev.preventDefault();ev.stopImmediatePropagation()};stage.addEventListener('click',stop,{once:true,capture:true})}});
  listen(stage,'pointercancel',()=>drag=null);
  const view=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)render();else send();schedule()},{threshold:.08});view.observe(root);
  listen(mq,'change',()=>{render();schedule()});listen(document,'visibilitychange',()=>{send();schedule()});
  listen(document,'motionchange',()=>{render();schedule()});
  listen(window,'message',e=>{if(e.origin===location.origin&&e.data?.type==='ensizziyo-preview-ready'&&[...frames.values()].some(f=>f.iframe?.contentWindow===e.source))send()});
  render();schedule();
  return {destroy(){destroyed=true;clearInterval(timer);clearTimeout(settling);abort.abort();resize.disconnect();view.disconnect();frames.forEach(e=>e.card.remove());if(picker.open)picker.close()}};
}
