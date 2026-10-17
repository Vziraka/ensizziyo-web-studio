// Keep full demonstrations linked to the studio; carousel iframes omit this navigation.
if(!new URLSearchParams(location.search).has('showreel')){
  const folders={'sola-motion':'Sola','pulse-motion':'Pulse','fieldwork-motion':'Fieldwork','forma-motion':'Forma','arc-motion':'Arc','relay-motion':'Relay','homekind-motion':'Homekind','juniper-motion':'Juniper'};
  let returnUrl='/studio/work/';
  try{
    const saved=JSON.parse(sessionStorage.getItem('studio-return')||'null');
    if(saved&&/^\/studio\/(?:$|(?:about|work|services)\/(?:\?(?:service|category)=[A-Za-z%]+)?$)/.test(saved.url))returnUrl=saved.url;
  }catch{}
  const name=folders[location.pathname.split('/')[1]];
  const arrow=(direction)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction==='left'?'M19 12H5m7 7-7-7 7-7':'M5 12h14m-7-7 7 7-7 7'}"/></svg>`;
  const updateFooter=()=>document.querySelectorAll('.preview-footer>a').forEach(a=>{a.href=returnUrl;a.innerHTML=`${arrow('left')} Back to EVZ Digital`});
  if(document.readyState==='complete')updateFooter();else addEventListener('load',updateFooter,{once:true});
  if(name){
    const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='/shared/review-bridge.css';document.head.append(sheet);
    const bar=document.createElement('aside');bar.className='review-return';bar.setAttribute('aria-label','Studio review navigation');
    bar.innerHTML=`<a href="${returnUrl}">${arrow('left')}<span>Back to EVZ Digital</span></a><span class="review-return-title"><strong>${name}</strong><small>Independent demonstration</small></span><a href="/studio/inquiry/?sample=${name}"><span>Discuss a project like this</span>${arrow('right')}</a>`;
    document.body.prepend(bar);
  }
}
