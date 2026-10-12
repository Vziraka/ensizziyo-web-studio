// Eight isolated page structures. All project and inquiry state is temporary.
const directions = [
  {id:1, name:'Studio', className:'studio'},
  {id:2, name:'Focus', className:'focus'},
  {id:3, name:'Index', className:'index'},
  {id:4, name:'Gallery', className:'gallery'},
  {id:5, name:'Frame', className:'frame'},
  {id:6, name:'Ledger', className:'ledger'},
  {id:7, name:'Surface', className:'surface'},
  {id:8, name:'Common', className:'common'}
];
const projects = [
  {id:'fieldwork', name:'Fieldwork', category:'Service website', filter:'website', description:'A home renovation website with a clear service story, large project photography and a direct inquiry path.'},
  {id:'arc', name:'Arc', category:'Business interface', filter:'interface', description:'A fictional enquiry workspace for reviewing requests and planning follow-ups. Local view controls illustrate an interface; no business tools are connected.'},
  {id:'forma', name:'Forma', category:'Product campaign', filter:'product', description:'A fictional product campaign page with layered composition and material controls. An exploration of presentation, without campaign performance claims.'}
];
let state;
const arrow = '<span class="arrow" aria-hidden="true">↗</span>';
const description = 'Websites, landing pages, business systems and integrations. Practical automation, AI and marketing support for small businesses.';

function readState() {
  const query = new URLSearchParams(location.search);
  const variant = directions.find(d => String(d.id) === query.get('variant')) || directions[0];
  const page = ['home','about','services','work','project','contact'].includes(query.get('page')) ? query.get('page') : 'home';
  const project = projects.find(p => p.id === query.get('project')) || projects[0];
  return {variant, page, project, embed:query.get('embed') === '1'};
}
function href(page='home', project) {
  return '?variant=' + state.variant.id + (page === 'home' ? '' : '&page=' + page) + (project ? '&project=' + project : '') + (state.embed ? '&embed=1' : '');
}
function link(page, label, className='', project) {
  return '<a data-page href="' + href(page,project) + '" class="' + className + '">' + label + '</a>';
}
function actions() {
  return '<div class="actions">' + link('contact','Let’s talk ' + arrow,'button primary') + link('work','Explore work','button secondary') + '</div>';
}
function intro(title, extra='') {
  return '<div class="intro"><h1>' + title + '</h1><p class="lead">' + description + '</p>' + actions() + extra + '</div>';
}
function visual(id, interactive=false) {
  if (id === 'fieldwork') {
    return '<div class="sample fieldwork" data-sample="fieldwork"><div class="sample-top"><b>fieldwork</b><span>Homes, thoughtfully considered.</span></div>' +
      '<div class="room"><img src="../assets/renovation-concept.png" width="1536" height="1024" alt="Illustrative oak kitchen with a stone island and natural daylight">' +
      '<div class="room-copy"><span>Home renovations</span><h3>Spaces for<br>everyday living.</h3></div></div>' +
      '<div class="sample-bottom"><span>Kitchens & interiors</span>' +
      (interactive ? '<button type="button" data-rooms aria-pressed="false">View room detail ↗</button>' : '<span>Discover the spaces ↗</span>') + '</div></div>';
  }
  if (id === 'arc') {
    const tabs = interactive ? '<button type="button" data-arc="board" aria-pressed="true">Board</button><button type="button" data-arc="schedule" aria-pressed="false">Schedule</button>' : '<span>Board</span><span>Schedule</span>';
    return '<div class="sample arc" data-sample="arc"><aside class="arc-sidebar"><b>arc</b><span class="arc-active">Workspace</span><span>Enquiries</span><span>Calendar</span><small>Concept study</small></aside>' +
      '<div class="arc-main"><div class="arc-toolbar"><span>Business workspace</span><span class="avatar">A</span></div><div class="arc-title"><h3>Enquiry overview</h3><span>Review the next steps.</span></div>' +
      '<div class="arc-tabs">' + tabs + '</div><div class="arc-view">' + arcBoard() + '</div></div></div>';
  }
  return '<div class="sample forma" data-sample="forma" data-material="stone"><div class="forma-top"><b>FORMA</b><span>Objects for considered spaces</span></div>' +
    '<div class="forma-body"><div class="forma-type"><span>Material collection</span><h3>Form.<br>Function.</h3><p>Light, in balance.</p></div>' +
    '<div class="sculpture" aria-label="Original geometric lamp illustration"><div class="lamp-shade"></div><div class="lamp-stem"></div><div class="lamp-base"></div><div class="lamp-shadow"></div></div></div>' +
    '<div class="forma-bottom"><span>Table light / Material study</span>' + (interactive ? '<div class="swatches"><button type="button" data-material="stone" aria-pressed="true">Stone</button><button type="button" data-material="ink" aria-pressed="false">Ink</button><button type="button" data-material="sand" aria-pressed="false">Sand</button></div>' : '<span>Stone · Ink · Sand</span>') + '</div></div>';
}
function arcBoard() {
  return '<div class="arc-board"><div><h4>New <span>2</span></h4><article><span class="task-type">Repair</span><b>Kitchen tap repair</b><small>Website enquiry</small></article><article><span class="task-type">Quote</span><b>Bathroom estimate</b><small>Awaiting review</small></article></div>' +
    '<div><h4>In review <span>1</span></h4><article class="active-task"><span class="task-type">Site visit</span><b>Arrange a visit</b><div class="task-lines"><i></i><i></i><i></i></div><small>Follow-up needed</small></article></div>' +
    '<div><h4>Ready <span>1</span></h4><article><span class="task-type">Confirmed</span><b>Hallway repaint</b><small>Ready to schedule</small></article></div></div>';
}
function arcSchedule() {
  return '<div class="arc-schedule"><div><b>Monday</b><span>Review new enquiries</span><small>Agree next steps</small></div><div><b>Tuesday</b><span>Site visit</span><small>Review the request</small></div><div><b>Wednesday</b><span>Estimate follow-up</span><small>Prepare a reply</small></div></div>';
}
function caption(id, className='') {
  const p = projects.find(item => item.id === id);
  return '<div class="project-caption ' + className + '"><div><h3>' + p.name + '</h3><p>' + p.category + ' <span>· Concept study</span></p></div>' + arrow + '</div>';
}
function card(id, className='') {
  return link('project',caption(id) + '<div class="project-art">' + visual(id) + '</div>', 'project-card ' + className, id);
}
function heading(text, page, label) {
  return '<div class="section-heading"><h2>' + text + '</h2>' + (page ? link(page,label + ' ' + arrow,'text-link') : '') + '</div>';
}
function proof() {
  return '<section class="proof-strip wrap" aria-label="Concept study facts"><div><strong>3</strong><span>Original concept studies</span></div><div><strong>Web + UI</strong><span>Service site, business interface and product page</span></div><div><strong>Desktop + mobile</strong><span>Responsive previews</span></div></section>';
}
function servicesTeaser() {
  return '<section class="services-teaser wrap">' + heading('Services','services','View services') +
    '<div class="service-lines">' +
    link('services','<h3>Websites & landing pages</h3><p>For unclear service pages, a dated website or a campaign needing its own destination.</p>' + arrow) +
    link('services','<h3>Business systems & integrations</h3><p>For enquiries, bookings and customer records spread across disconnected tools.</p>' + arrow) +
    link('services','<h3>Practical automation & AI</h3><p>For repeated data entry, follow-ups or documents that need a first draft.</p>' + arrow) +
    link('services','<h3>Marketing support</h3><p>For a campaign needing content, a landing page and a way to track enquiries.</p>' + arrow) +
    '</div></section>';
}
function reviews() {
  return '<section class="reviews wrap"><div><h2>Client reviews</h2><p class="muted">A small space for feedback from the people behind the work.</p></div>' +
    '<div class="review-placeholder"><span class="content-label">Review placement preview</span><p>Space for a client’s own words.</p><small>An approved quote and attribution will appear here. No client review is claimed.</small></div></section>';
}
function closing() {
  return '<section class="closing wrap"><div><h2>Let’s talk.</h2><p>What would you like to improve in your business?</p></div>' + link('contact','Let’s talk ' + arrow,'button primary') + '</section>';
}
function home() {
  switch (state.variant.id) {
    case 1:
      return '<section class="hero hero-studio wrap">' + intro('Websites &<br>business systems.') +
        '<div class="studio-grid">' + card('fieldwork','wide') + card('arc') + '</div></section>' + proof() + servicesTeaser() + reviews() + closing();
    case 2:
      return '<section class="hero hero-focus wrap">' + intro('Websites. Systems.<br>Automation & AI.') +
        '<div class="focus-stage"><p class="stage-title">Website & business interface concepts</p><div class="focus-back">' + visual('arc') + '</div><div class="focus-front">' + visual('fieldwork') + '</div><div class="stage-caption">Original concept studies. ' + link('work','Explore the details ' + arrow) + '</div></div></section>' +
        proof() + '<section class="work-teaser wrap">' + heading('A closer look','work','Explore work') + '<div class="focus-work">' + card('forma') + '<div><h2>Product campaign<br>concept.</h2><p>A focused page for a fictional product. Explore the material controls and layered presentation; no campaign results are claimed.</p>' + link('work','See the studies ' + arrow,'text-link') + '</div></div></section>' + servicesTeaser() + reviews() + closing();
    case 3:
      return '<section class="hero hero-index wrap"><div class="index-intro"><h1>Websites.<br>Business systems.<br>Marketing support.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div><div class="work-index">' +
        projects.map(p => link('project','<div class="index-art">' + visual(p.id) + '</div><h2>' + p.name + '</h2><span>' + p.category + '<small>Concept study</small></span>' + arrow,'index-row',p.id)).join('') + '</div></section>' +
        proof() + servicesTeaser() + reviews() + closing();
    case 4:
      return '<section class="hero hero-gallery wrap">' + intro('Websites &<br>business tools.') + '<div class="gallery-stage" data-stage>' + visual('fieldwork',true) + '</div><div class="stage-selector" aria-label="Featured concept study">' +
        projects.map((p,i) => '<button type="button" data-stage-project="' + p.id + '" aria-pressed="' + (i===0) + '">' + p.name + '<span>' + p.category + '</span></button>').join('') +
        '</div><p class="study-note">Original concept studies. Fictional brands, with local demo controls. ' + link('work','Explore work ' + arrow) + '</p></section>' +
        proof() + servicesTeaser() + reviews() + closing();
    case 5:
      return '<section class="hero hero-frame"><div class="frame-heading wrap"><h1>Websites, systems<br>& marketing.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div>' +
        '<div class="frame-project wrap">' + link('project','<div class="frame-picture"><img src="../assets/renovation-concept.png" width="1536" height="1024" alt="Original illustrative kitchen for the Fieldwork design study"><span class="frame-brand">fieldwork</span></div>' + caption('fieldwork'),'frame-project-link','fieldwork') + '</div></section>' +
        proof() + servicesTeaser() + '<section class="work-teaser wrap">' + heading('More concept work','work','Explore work') + '<div class="two-projects">' + card('arc') + card('forma') + '</div></section>' + reviews() + closing();
    case 6:
      return '<section class="hero hero-ledger wrap">' + intro('Websites &<br>business tools.') +
        '<div class="ledger-feature">' + link('project','<div class="project-art">' + visual('arc') + '</div>' + caption('arc'),'project-card','arc') + '</div>' +
        '<div class="ledger-links">' + link('project','<h3>Fieldwork</h3><span>Service website · Concept study</span>' + arrow,'','fieldwork') + link('project','<h3>Forma</h3><span>Product campaign · Concept study</span>' + arrow,'','forma') + '</div></section>' + proof() + servicesTeaser() + reviews() + closing();
    case 7:
      return '<section class="hero hero-surface wrap"><div class="surface-heading"><h1>Websites, systems<br>& automation.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div>' +
        '<div class="surface-explorer"><div class="surface-options" aria-label="Experience type">' +
        projects.map((p,i) => '<button type="button" data-surface-project="' + p.id + '" aria-pressed="' + (i===1) + '"><b>' + p.category + '</b><span>' + p.description + '</span>' + arrow + '</button>').join('') +
        '</div><div class="surface-stage"><div data-stage>' + visual('arc',true) + '</div><p class="study-note">Concept study. Local demo controls; no live integrations or AI.</p></div></div></section>' +
        proof() + servicesTeaser() + reviews() + closing();
    case 8:
      return '<section class="hero hero-common wrap"><div class="common-heading"><h1>Websites &<br>business support.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div>' +
        '<div class="common-composition"><div class="common-introduction"><h2>A direct<br>conversation.</h2><p>Start with what needs to work better: how customers find you, how enquiries move through the business, or where the same admin keeps returning.</p>' + link('about','About the studio ' + arrow,'text-link') + '</div>' +
        '<div class="common-project">' + card('fieldwork') + '</div></div></section>' + proof() + servicesTeaser() + '<section class="work-teaser wrap">' + heading('More to explore','work','Explore work') + '<div class="two-projects">' + card('forma') + card('arc') + '</div></section>' + reviews() + closing();
  }
}
function about() {
  return '<section class="inner-hero wrap"><p class="page-label">About</p><h1>Websites, systems<br>& business support.</h1><p class="lead">A digital studio for owner-operated and small service businesses. Websites and landing pages, connected systems, practical automation and AI, and marketing support. Agency partnerships can start with the same conversation.</p></section>' +
    '<section class="about-layout wrap"><h2>Start with<br>the business.</h2><div><p>The work begins with what you want to improve: how customers find your services, how bookings reach the right person, or where your team repeats the same admin.</p><p>We define the problem and scope, then review the approach together. Systems and AI work need tool, data and feasibility checks before a build is agreed.</p><p class="content-label">Founder name, biography and portrait are awaiting approval. No experience or team-size claims are made in this draft.</p>' + link('contact','Let’s talk ' + arrow,'button primary') + '</div></section>' + closing();
}
function services() {
  return '<section class="inner-hero wrap"><p class="page-label">Services</p><h1>Digital services<br>for your business.</h1><p class="lead">Choose a starting point based on what is difficult today. Each project begins with a defined scope and a check that the approach fits.</p></section>' +
    '<section class="service-detail wrap"><article><h2>Websites & landing pages</h2><div><p>If your site is hard to navigate, visitors cannot find the right service, or a campaign needs its own page, start here.</p><ul><li>Service content and page structure</li><li>Custom design for desktop and mobile</li><li>Inquiry and booking journeys</li><li>Focused pages for a service or campaign</li></ul><p>Hosting and ongoing website care are agreed separately.</p></div></article>' +
    '<article><h2>Business systems & integrations</h2><div><p>If customer details are copied between enquiry forms, bookings and spreadsheets, map the handoffs first.</p><p>Possible scope: booking or CRM connections, internal dashboards and a shared view of enquiries. Tool access, data ownership, failure handling and support needs are checked before agreeing a build.</p></div></article>' +
    '<article><h2>Practical automation & AI</h2><div><p>If routine admin slows the day, look for a repeatable task with a clear trigger and a result someone can check.</p><p>Possible scope: routing enquiries, creating follow-up reminders, or preparing draft summaries and replies for human review. AI suitability, data access, review steps and running costs are agreed before use.</p></div></article>' +
    '<article><h2>Marketing support</h2><div><p>If a new service or campaign needs a clear message and destination, connect the content to an agreed audience and next step.</p><p>Possible scope: campaign pages, content or advertising creative, measurement setup and scoped campaign support. Ad spend and subscriptions are separate; no lead or revenue outcome is promised.</p></div></article></section>' + closing();
}
function work() {
  return '<section class="inner-hero wrap"><p class="page-label">Work</p><h1>Original<br>concept studies.</h1><p class="lead">Explore a service website, a business interface and a product campaign page. These fictional examples show design and interaction ideas. They do not demonstrate live integrations, automation or AI delivery.</p></section>' +
    '<section class="work-page wrap"><div class="work-filters" aria-label="Filter concept studies"><button type="button" data-filter="all" aria-pressed="true">All studies</button><button type="button" data-filter="website" aria-pressed="false">Websites</button><button type="button" data-filter="interface" aria-pressed="false">Interfaces</button><button type="button" data-filter="product" aria-pressed="false">Product</button></div>' +
    '<div class="work-grid">' + projects.map(p => '<div data-category="' + p.filter + '">' + card(p.id) + '</div>').join('') + '</div><p class="study-note" data-filter-status aria-live="polite">Showing all 3 concept studies.</p></section>' + closing();
}
function projectPage() {
  const p = state.project;
  return '<section class="inner-hero project-heading wrap">' + link('work','← All work','text-link') + '<p class="page-label">' + p.category + ' · Concept study</p><h1>' + p.name + '</h1><p class="lead">' + p.description + '</p></section>' +
    '<section class="project-demo wrap" aria-label="' + p.name + ' interactive concept study">' + visual(p.id,true) + '<p class="study-note">Original fictional brand. Concept work with local demo controls; no completed client work, measured results, live integrations or AI is claimed.</p></section>' +
    '<section class="project-summary wrap"><h2>The design approach</h2><div><p>' + (p.id==='fieldwork' ? 'Help a homeowner find the service and a way to enquire. Readable pages and project photography support the service story. View room detail changes the crop in this concept; no enquiry is delivered.' : p.id==='arc' ? 'Bring sample enquiries and follow-up tasks into one view. Board and Schedule illustrate how the same workspace could support different tasks. The views use invented content; no CRM, booking service or automation is connected.' : 'Give a product campaign a focused destination. Layered composition and material controls explore how a visitor could inspect the lamp. The concept has no checkout, analytics or campaign results.') + '</p>' + link('contact','Let’s talk ' + arrow,'button primary') + '</div></section>' + closing();
}
function contact() {
  return '<section class="contact-layout wrap"><div><p class="page-label">Let’s talk</p><h1>What would you<br>like to improve?</h1><p class="lead">Tell us where things feel unclear, slow or disconnected. You do not need a technical brief.</p><p>That might be your website, business tools, repeat admin or a marketing campaign. Agency partnerships are welcome too.</p></div>' +
    '<div class="contact-panel"><p class="content-label">Prototype only. Use made-up details; nothing is sent or saved.</p><form id="inquiry"><label for="name">Your name</label><input id="name" name="name" autocomplete="off" required maxlength="100"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="off" required maxlength="254"><label for="context">What would you like to improve? (required)</label><p class="content-label" id="context-hint">For example, make bookings easier, connect enquiries to your records, reduce repeat admin, or support a campaign. A short description is enough.</p><textarea id="context" name="context" rows="4" required maxlength="2000" aria-describedby="context-hint"></textarea><label for="type">Where might you need help? (optional)</label><select id="type" name="type"><option>Not sure yet</option><option>Websites & landing pages</option><option>Business systems & integrations</option><option>Practical automation & AI</option><option>Marketing support</option><option>Several areas</option><option>Agency partnership</option></select><button type="submit" class="button primary">Let’s talk ' + arrow + '</button></form><div id="confirmation" hidden role="status"><h2>Your demo inquiry is complete.</h2><p>No message was sent or saved.</p><button type="button" class="button secondary" data-reset>Try again</button></div></div></section>';
}
function header() {
  return '<header class="site-header wrap">' + link('home','ensizziyo<span class="brand-sub">DIGITAL STUDIO</span>','wordmark') +
    '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button><nav class="nav-links" id="site-nav" aria-label="Main navigation">' +
    ['about','services','work'].map(page => link(page,page[0].toUpperCase()+page.slice(1),state.page === page ? 'current' : '')).join('') +
    '</nav>' + link('contact','Let’s talk ' + arrow,'header-contact button primary') + '</header>';
}
function render(focusMain=false) {
  state = readState();
  document.body.dataset.direction = state.variant.className;
  document.body.classList.toggle('embedded',state.embed);
  document.title = state.variant.name + ' · ' + (state.page==='home' ? 'Ensizziyo' : state.page[0].toUpperCase()+state.page.slice(1)) + ' · Design preview';
  const pages = {home, about, services, work, project:projectPage, contact};
  document.querySelector('#app').innerHTML = '<div class="studio-shell">' + header() + '<main class="page' + (focusMain ? ' page-enter' : '') + '" id="main" tabindex="-1">' + pages[state.page]() + '</main></div><footer class="site-footer wrap"><span>ensizziyo</span><div>' + link('about','About') + link('services','Services') + link('work','Work') + link('contact','Let’s talk') + '</div><small>Local design preview · All inquiries simulated</small></footer>';
  document.querySelector('#direction-select').value = String(state.variant.id);
  if (focusMain) document.querySelector('#main').focus({preventScroll:true});
  document.querySelector('#page-announcement').textContent = state.variant.name + ' design. ' + state.page + ' page.';
  if (observer) observer.disconnect();
  observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('revealed');
      observer.unobserve(entry.target);
    }
  }), {threshold:0.08});
  document.querySelectorAll('.services-teaser,.reviews,.work-teaser,.proof-strip,.closing').forEach(el => observer.observe(el));
}
let observer;
function navigate(url) {
  history.pushState(null,'',url);
  render(true);
  scrollTo({top:0,behavior:'instant'});
}
document.addEventListener('click', event => {
  const pageLink = event.target.closest('a[data-page]');
  if (pageLink && event.button===0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    navigate(pageLink.href);
    return;
  }
  const menu = event.target.closest('.menu-toggle');
  if (menu) {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded',String(open));
    menu.closest('header').classList.toggle('menu-open',open);
  }
  const cycle = event.target.closest('[data-cycle]');
  if (cycle) {
    const query = new URLSearchParams(location.search);
    query.set('variant',String((state.variant.id - 1 + Number(cycle.dataset.cycle) + 8) % 8 + 1));
    navigate('?' + query);
  }
  const filter = event.target.closest('[data-filter]');
  if (filter) {
    const category = filter.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed',String(button===filter)));
    let count = 0;
    document.querySelectorAll('[data-category]').forEach(el => {
      el.hidden = category !== 'all' && el.dataset.category !== category;
      if (!el.hidden) count++;
    });
    document.querySelector('[data-filter-status]').textContent = category === 'all' ? 'Showing all 3 concept studies.' : 'Showing ' + count + ' ' + category + ' concept study.';
  }
  const stageButton = event.target.closest('[data-stage-project],[data-surface-project]');
  if (stageButton) {
    const project = stageButton.dataset.stageProject || stageButton.dataset.surfaceProject;
    document.querySelectorAll('[data-stage-project],[data-surface-project]').forEach(button => button.setAttribute('aria-pressed',String(button===stageButton)));
    const stage = document.querySelector('[data-stage]');
    stage.innerHTML = visual(project,true);
    stage.classList.remove('stage-enter');
    void stage.offsetWidth;
    stage.classList.add('stage-enter');
  }
  const arcButton = event.target.closest('[data-arc]');
  if (arcButton) {
    const sample = arcButton.closest('.arc');
    sample.querySelectorAll('[data-arc]').forEach(button => button.setAttribute('aria-pressed',String(button===arcButton)));
    const view = sample.querySelector('.arc-view');
    view.innerHTML = arcButton.dataset.arc==='schedule' ? arcSchedule() : arcBoard();
    view.classList.remove('stage-enter');
    void view.offsetWidth;
    view.classList.add('stage-enter');
  }
  const material = event.target.closest('button[data-material]');
  if (material) {
    const sample = material.closest('.forma');
    sample.dataset.material = material.dataset.material;
    sample.querySelectorAll('button[data-material]').forEach(button => button.setAttribute('aria-pressed',String(button===material)));
  }
  const rooms = event.target.closest('[data-rooms]');
  if (rooms) {
    const close = rooms.getAttribute('aria-pressed') !== 'true';
    rooms.setAttribute('aria-pressed',String(close));
    rooms.textContent = close ? 'View full room ↗' : 'View room detail ↗';
    rooms.closest('.fieldwork').classList.toggle('room-detail',close);
  }
  if (event.target.closest('[data-reset]')) {
    document.querySelector('#inquiry').hidden = false;
    document.querySelector('#confirmation').hidden = true;
    document.querySelector('#name').focus();
  }
});
document.querySelector('#direction-select').addEventListener('change',event => {
  const query = new URLSearchParams(location.search);
  query.set('variant',event.target.value);
  navigate('?' + query);
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'inquiry') return;
  event.preventDefault();
  event.target.reset();
  event.target.hidden = true;
  const confirmation = document.querySelector('#confirmation');
  confirmation.hidden = false;
  confirmation.tabIndex = -1;
  confirmation.focus();
});
addEventListener('popstate',() => render(true));
render();
