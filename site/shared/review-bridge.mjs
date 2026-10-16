// Keep full demonstrations linked to the studio; carousel iframes omit this navigation.
if (!new URLSearchParams(location.search).has('showreel')) {
const folders={'sola-motion':'Sola','pulse-motion':'Pulse','fieldwork-motion':'Fieldwork','forma-motion':'Forma','arc-motion':'Arc','relay-motion':'Relay','homekind-motion':'Homekind','juniper-motion':'Juniper'};
let returnHash='#work';try{const saved=JSON.parse(sessionStorage.getItem('studio-return')||'null');if(saved&&/^#(home|work|services|about)(\/[-a-zA-Z]+)?$/.test(saved.hash))returnHash=saved.hash}catch{}
const name=folders[location.pathname.split('/')[1]];
const updateFooter=()=>document.querySelectorAll('.preview-footer>a').forEach(a=>{a.href=`/studio/${returnHash}`;a.textContent='← Back to studio'});
if(document.readyState==='complete')updateFooter();else addEventListener('load',updateFooter,{once:true});
if(name){const style=document.createElement('style');style.textContent='.review-return{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 24px;min-height:48px;background:#202927;color:#fff;font:12px/1.5 Arial,sans-serif;position:relative;z-index:99}.review-return~.masthead{top:48px}.review-return a{color:#fff;text-decoration:none}.review-return a:focus-visible{outline:2px solid white;outline-offset:4px}@media(max-width:600px){.review-return{padding:10px 16px;font-size:11px}.review-return span{display:none}}';document.head.append(style);const bar=document.createElement('aside');bar.className='review-return';bar.setAttribute('aria-label','Studio review navigation');bar.innerHTML=`<a href="/studio/${returnHash}">← Back to studio</a><span>${name} / Independent demonstration</span><a href="/studio/#inquiry/${name}">Discuss a project like this →</a>`;document.body.prepend(bar)}
}
