import {mountShowcase} from './showcase.mjs';
import {createViews,routeHref} from './views.mjs';
import {validateInquiry,sendInquiry} from './inquiry.mjs';
import {createScenes} from '../shared/scene-motion.mjs';
import {$,$$,setupPreview,focusHeading,motion,openDialog} from '../shared/preview.mjs';
const data=await fetch('data.json').then(r=>r.json());setupPreview({studio:true});let service='websites',filter='All',showIndex=1,page='home',formData={description:'',name:'',email:'',business:'',website:'',context:''},reviewed=false,completed=false,returnState=null;
try{returnState=JSON.parse(sessionStorage.getItem('studio-return')||'null');if(returnState){filter=returnState.filter||'All';service=returnState.service||'websites';showIndex=returnState.showIndex||0}}catch{}
const views=createViews(data,()=>({service,filter,formData}));
const {samples,categories,categoryLabels,art}=views;
let showcase=null;

function attachHome(){showcase=mountShowcase($('.horizon-gallery'),samples,showIndex,i=>showIndex=i,art)}

function changeService(value){
  service=value;
  history.replaceState(null,'',`/studio/services/?service=${encodeURIComponent(value)}`);
  $$('[data-service]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.service===service)));
  $('#service-select').value=service;
  $('.service-content').innerHTML=views.serviceBody();
  $('.agreement p').textContent=data.services.find(s=>s.id===service).agree;
  if(motion())$('.service-content').animate([{opacity:.3},{opacity:1}],{duration:150});
  $('#announcement').textContent=data.services.find(s=>s.id===service).label+' selected.';
}

function render(){
  showcase?.destroy();showcase=null;
  if(/^#(home|about|services|work|inquiry|privacy)(\/|$)/.test(location.hash))history.replaceState(null,'',routeHref(location.hash));
  const route=location.pathname.split('/').filter(Boolean)[1]||'home';
  const params=new URLSearchParams(location.search);
  page=['about','services','work','inquiry','privacy'].includes(route)?route:'home';
  if(page==='services')service=data.services.some(s=>s.id===params.get('service'))?params.get('service'):'websites';
  if(page==='work')filter=categories.includes(params.get('category'))?params.get('category'):'All';
  if(page==='inquiry'){
    const sample=params.get('sample');
    if(samples.some(s=>s.name===sample))formData.context=sample;
    if(location.hash==='#review'&&reviewed)page='review';
    if(location.hash==='#complete'&&completed)page='complete';
    if(['#review','#complete'].includes(location.hash)&&page==='inquiry')history.replaceState(null,'',location.pathname+location.search);
  }
  $('#main').innerHTML=views.render(page);
  document.title=(page==='home'?'Websites. Systems. Automation. Marketing.':page.charAt(0).toUpperCase()+page.slice(1))+' — EVZ Digital';
  const navPage=page==='review'||page==='complete'?'inquiry':page;
  $$('.site-header nav a').forEach(a=>{
    a.removeAttribute('aria-current');
    if(a.pathname===(navPage==='home'?'/studio/':`/studio/${navPage}/`))a.setAttribute('aria-current','page');
  });
  if($('#mobile-nav').open)$('#mobile-nav').close();
  const restore=returnState&&page===(returnState.page||'work')?returnState:null;
  scrollTo({top:restore?.scroll??0,behavior:'instant'});
  if(restore){
    requestAnimationFrame(()=>{
      $$('[data-sample]').find(a=>a.dataset.sample===restore.sample&&(a.classList.contains('text-link')||a.closest('.gallery-panel')))?.focus({preventScroll:true});
      scrollTo({top:restore.scroll||0,behavior:'instant'});
    });
    returnState=null;sessionStorage.removeItem('studio-return');
  }else focusHeading();
  document.body.dataset.page=page;
  if(page==='home')attachHome();
  if(page==='services')$('#service-select').onchange=e=>changeService(e.target.value);
  const form=$('#inquiry-form');
  if(form){
    const capture=()=>{const fd=new FormData(form);for(const key of ['description','name','email','business','website'])formData[key]=String(fd.get(key)||'');reviewed=false};
    form.oninput=capture;
    form.onsubmit=e=>{
      e.preventDefault();capture();
      const errors=validateInquiry(formData);
      for(const k of ['description','name','email','business','website']){
        const v=errors[k]||'';
        $('#'+k+'-error').textContent=v;
        if(v)form.elements[k].setAttribute('aria-invalid','true');else form.elements[k].removeAttribute('aria-invalid');
      }
      const first=Object.keys(errors).find(k=>errors[k]);
      if(first){form.elements[first].focus();return}
      reviewed=true;location.hash='review';
    };
  }
}

async function submitReview(button){
  if(button.disabled)return;
  button.disabled=true;button.textContent='Sending…';$('#finish-error').textContent='';
  try{await sendInquiry(formData);completed=true;location.hash='complete'}
  catch{$('#finish-error').textContent='We could not send your inquiry. Your details are still here. Try again or return to edit them.';button.disabled=false;button.textContent='Try sending again'}
}

document.addEventListener('click',e=>{
  const el=e.target.closest('button,a');if(!el)return;
  if(el.dataset.sample){
    try{sessionStorage.setItem('studio-return',JSON.stringify({page,url:location.pathname+location.search,filter,service,showIndex,scroll:scrollY,sample:el.dataset.sample}))}catch{}
    return;
  }
  if(el.classList.contains('menu-open'))openDialog($('#mobile-nav'),el);
  if(el.classList.contains('menu-close'))$('#mobile-nav').close();
  if(el.dataset.service)changeService(el.dataset.service);
  if(el.dataset.filter){
    filter=el.dataset.filter;
    history.replaceState(null,'',filter==='All'?'/studio/work/':`/studio/work/?category=${encodeURIComponent(filter)}`);
    render();$(`[data-filter="${filter}"]`)?.focus({preventScroll:true});
  }
  if(el.id==='new-inquiry'){formData={description:'',name:'',email:'',business:'',website:'',context:''};reviewed=false;completed=false}
  if(el.getAttribute('href')==='/studio/inquiry/#edit'){e.preventDefault();location.hash='edit'}
  if(el.id==='remove-context'){formData.context='';history.replaceState(null,'','/studio/inquiry/');render()}
  if(el.id==='finish')submitReview(el);
});
addEventListener('hashchange',render);
render();

createScenes({entries:[['.horizon-hero h1','rise'],['.horizon-intro','rise'],['.services-heading','rise'],['.horizon-service-grid>a','rise'],['.home-contact','rise'],['.home-services>h2','rise'],['.service-row','slide'],['.campaign-example','curtain'],['.principles article','rise'],['.audiences article','slide'],['.handoff article','rise'],['.service-content','curtain'],['.scope article','slide'],['.project','curtain'],['.cta','rise'],['.success','rise']],tactile:['.project .art']});
