// Active only inside same-origin carousel iframes with ?showreel=1.
if(window.parent!==window&&new URLSearchParams(location.search).has('showreel')){
  let playing=false,requested=false,elapsed=0,last=0,step=-1,frame=0;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const folder=location.pathname.split('/')[1];
  const style=document.createElement('style');
  style.textContent='html{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important}.preview-footer,.review-return,.skip,footer .motion-control{display:none!important}.showreel-paused *{animation-play-state:paused!important;scroll-behavior:auto!important}';
  document.head.append(style);
  const control=()=>document.querySelector('.motion-toggle,.motion-control');
  function playback(value){
    requested=value;
    playing=requested&&!reduced.matches&&!document.hidden;
    if(playing&&!frame){last=performance.now();frame=requestAnimationFrame(tick)}
    if(!playing){cancelAnimationFrame(frame);frame=0}
    document.body.dataset.previewTime=String(Math.round(elapsed));
    document.body.classList.toggle('showreel-paused',!playing);
    const button=control();
    if(button&&!button.disabled&&(button.getAttribute('aria-pressed')==='true')===playing)button.click();
    document.getAnimations().forEach(a=>{try{if(playing&&a.playState==='paused')a.play();else if(!playing&&a.playState==='running')a.pause()}catch{}});
    document.querySelectorAll('video').forEach(v=>{v.muted=true;v.loop=true;if(playing){v.play().catch(()=>{});v.classList.add('visible')}else v.pause()});
  }
  addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='ensizziyo-preview')playback(Boolean(e.data.playing))});
  const click=selector=>document.querySelector(selector)?.click();
  function scene(n){
    // Only browsing actions: never submit an inquiry, order or reservation.
    if(folder==='sola-motion')click(`[data-select="${n%3}"]`);
    if(folder==='arc-motion')click(`[data-day="${n%7}"]`);
    if(folder==='relay-motion'){if(n===0)click('#test');else click('#next')}
    if(folder==='forma-motion'){const rooms=[...document.querySelectorAll('[data-room]')];rooms[n%Math.max(rooms.length,1)]?.click()}
    if(folder==='homekind-motion'&&n>0){const rooms=[...document.querySelectorAll('[data-room]')];rooms[n%Math.max(rooms.length,1)]?.click()}
  }
  // Follow display frames; a coarse timer made the scroll tours visibly step.
  function tick(now){
    frame=0;if(!playing)return;
    elapsed+=now-last;last=now;
    const next=Math.floor(elapsed/3500);if(next!==step){step=next;scene(step)}
    if(['fieldwork-motion','juniper-motion','homekind-motion'].includes(folder)){
      const max=Math.min(document.documentElement.scrollHeight-innerHeight,folder==='homekind-motion'?1500:1100);
      if(max>0)scrollTo({top:Math.max(0,max*(1-Math.cos(elapsed/14000*Math.PI*2))/2),behavior:'instant'});
    }
    frame=requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange',()=>playback(requested));
  reduced.addEventListener('change',()=>playback(requested));
  addEventListener('pagehide',()=>{playing=false;cancelAnimationFrame(frame);frame=0});
  parent.postMessage({type:'ensizziyo-preview-ready'},location.origin);
}
