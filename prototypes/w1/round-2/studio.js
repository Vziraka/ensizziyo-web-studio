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
  {id:'arc', name:'Arc', category:'Digital interface', filter:'interface', description:'An interactive workspace study. Clear navigation, useful states and a focused planning experience.'},
  {id:'forma', name:'Forma', category:'Product experience', filter:'product', description:'A material-led product study with layered composition, responsive controls and restrained transitions.'}
];
let state;
const arrow = '<span class="arrow" aria-hidden="true">↗</span>';
const description = 'Custom websites and landing pages for service businesses. Clear information, considered design, and a straightforward way to get in touch.';

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
  return '<div class="actions">' + link('work','Explore work ' + arrow,'button primary') + link('contact','Let’s talk','button secondary') + '</div>';
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
    return '<div class="sample arc" data-sample="arc"><aside class="arc-sidebar"><b>arc</b><span class="arc-active">Workspace</span><span>Projects</span><span>Calendar</span><small>Design study</small></aside>' +
      '<div class="arc-main"><div class="arc-toolbar"><span>Studio workspace</span><span class="avatar">A</span></div><div class="arc-title"><h3>Project overview</h3><span>A little more room to focus.</span></div>' +
      '<div class="arc-tabs">' + tabs + '</div><div class="arc-view">' + arcBoard() + '</div></div></div>';
  }
  return '<div class="sample forma" data-sample="forma" data-material="stone"><div class="forma-top"><b>FORMA</b><span>Objects for considered spaces</span></div>' +
    '<div class="forma-body"><div class="forma-type"><span>Material collection</span><h3>Form.<br>Function.</h3><p>Light, in balance.</p></div>' +
    '<div class="sculpture" aria-label="Original geometric lamp illustration"><div class="lamp-shade"></div><div class="lamp-stem"></div><div class="lamp-base"></div><div class="lamp-shadow"></div></div></div>' +
    '<div class="forma-bottom"><span>Table light / Material study</span>' + (interactive ? '<div class="swatches"><button type="button" data-material="stone" aria-pressed="true">Stone</button><button type="button" data-material="ink" aria-pressed="false">Ink</button><button type="button" data-material="sand" aria-pressed="false">Sand</button></div>' : '<span>Stone · Ink · Sand</span>') + '</div></div>';
}
function arcBoard() {
  return '<div class="arc-board"><div><h4>To do <span>2</span></h4><article><span class="task-type">Website</span><b>Map the customer journey</b><small>Discovery</small></article><article><span class="task-type">Content</span><b>Plan service pages</b><small>Structure</small></article></div>' +
    '<div><h4>In progress <span>1</span></h4><article class="active-task"><span class="task-type">Design</span><b>Explore the homepage</b><div class="task-lines"><i></i><i></i><i></i></div><small>Desktop & mobile</small></article></div>' +
    '<div><h4>Ready <span>1</span></h4><article><span class="task-type">Review</span><b>Review the first direction</b><small>Studio preview</small></article></div></div>';
}
function arcSchedule() {
  return '<div class="arc-schedule"><div><b>Monday</b><span>Discovery conversation</span><small>Define the scope</small></div><div><b>Tuesday</b><span>Design exploration</span><small>Review the hierarchy</small></div><div><b>Wednesday</b><span>Prototype review</span><small>Agree the next step</small></div></div>';
}
function caption(id, className='') {
  const p = projects.find(item => item.id === id);
  return '<div class="project-caption ' + className + '"><div><h3>' + p.name + '</h3><p>' + p.category + ' <span>· Design study</span></p></div>' + arrow + '</div>';
}
function card(id, className='') {
  return link('project',caption(id) + '<div class="project-art">' + visual(id) + '</div>', 'project-card ' + className, id);
}
function heading(text, page, label) {
  return '<div class="section-heading"><h2>' + text + '</h2>' + (page ? link(page,label + ' ' + arrow,'text-link') : '') + '</div>';
}
function proof() {
  return '<section class="proof-strip wrap" aria-label="Design study facts"><div><strong>3</strong><span>Original design studies</span></div><div><strong>Web + UI</strong><span>Service sites and digital interfaces</span></div><div><strong>Desktop + mobile</strong><span>Considered at every size</span></div></section>';
}
function servicesTeaser() {
  return '<section class="services-teaser wrap">' + heading('Services','services','View services') +
    '<div class="service-lines">' +
    link('services','<h3>Website design & development</h3><p>A custom site that explains your services and makes the next step clear.</p>' + arrow) +
    link('services','<h3>Focused landing pages</h3><p>A clear destination for one service, campaign or offer.</p>' + arrow) +
    link('services','<h3>Interfaces & integrations</h3><p>A separately scoped conversation for a defined workflow or digital tool.</p>' + arrow) +
    '</div></section>';
}
function reviews() {
  return '<section class="reviews wrap"><div><h2>Client reviews</h2><p class="muted">A small space for feedback from the people behind the work.</p></div>' +
    '<div class="review-placeholder"><span class="content-label">Review placement preview</span><p>Space for a client’s own words.</p><small>An approved quote and attribution will appear here. No client review is claimed.</small></div></section>';
}
function closing() {
  return '<section class="closing wrap"><div><h2>Let’s talk.</h2><p>Share what your business does and what you have in mind.</p></div>' + link('contact','Let’s talk ' + arrow,'button primary') + '</section>';
}
function home() {
  switch (state.variant.id) {
    case 1:
      return '<section class="hero hero-studio wrap">' + intro('Web design &<br>development.') +
        '<div class="studio-grid">' + card('fieldwork','wide') + card('arc') + '</div></section>' + proof() + servicesTeaser() + reviews() + closing();
    case 2:
      return '<section class="hero hero-focus wrap">' + intro('Custom websites.<br>Digital interfaces.') +
        '<div class="focus-stage"><p class="stage-title">Website & interface design studies</p><div class="focus-back">' + visual('arc') + '</div><div class="focus-front">' + visual('fieldwork') + '</div><div class="stage-caption">Original design studies. ' + link('work','Explore the details ' + arrow) + '</div></div></section>' +
        proof() + '<section class="work-teaser wrap">' + heading('A closer look','work','Explore work') + '<div class="focus-work">' + card('forma') + '<div><h2>Clear websites.<br>Room for more.</h2><p>From a service website to an interactive product experience, the design follows what your customer needs to do.</p>' + link('work','See the studies ' + arrow,'text-link') + '</div></div></section>' + servicesTeaser() + reviews() + closing();
    case 3:
      return '<section class="hero hero-index wrap"><div class="index-intro"><h1>Website design.<br>Development.<br>Digital interfaces.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div><div class="work-index">' +
        projects.map(p => link('project','<div class="index-art">' + visual(p.id) + '</div><h2>' + p.name + '</h2><span>' + p.category + '<small>Design study</small></span>' + arrow,'index-row',p.id)).join('') + '</div></section>' +
        proof() + servicesTeaser() + reviews() + closing();
    case 4:
      return '<section class="hero hero-gallery wrap">' + intro('Websites &<br>digital experiences.') + '<div class="gallery-stage" data-stage>' + visual('fieldwork',true) + '</div><div class="stage-selector" aria-label="Featured design study">' +
        projects.map((p,i) => '<button type="button" data-stage-project="' + p.id + '" aria-pressed="' + (i===0) + '">' + p.name + '<span>' + p.category + '</span></button>').join('') +
        '</div><p class="study-note">Original design studies, built to explore the possibilities. ' + link('work','Explore work ' + arrow) + '</p></section>' +
        proof() + servicesTeaser() + reviews() + closing();
    case 5:
      return '<section class="hero hero-frame"><div class="frame-heading wrap"><h1>Website design<br>& development.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div>' +
        '<div class="frame-project wrap">' + link('project','<div class="frame-picture"><img src="../assets/renovation-concept.png" width="1536" height="1024" alt="Original illustrative kitchen for the Fieldwork design study"><span class="frame-brand">fieldwork</span></div>' + caption('fieldwork'),'frame-project-link','fieldwork') + '</div></section>' +
        proof() + servicesTeaser() + '<section class="work-teaser wrap">' + heading('Digital experiences','work','Explore work') + '<div class="two-projects">' + card('arc') + card('forma') + '</div></section>' + reviews() + closing();
    case 6:
      return '<section class="hero hero-ledger wrap">' + intro('Websites &<br>digital interfaces.') +
        '<div class="ledger-feature">' + link('project','<div class="project-art">' + visual('arc') + '</div>' + caption('arc'),'project-card','arc') + '</div>' +
        '<div class="ledger-links">' + link('project','<h3>Fieldwork</h3><span>Service website · Design study</span>' + arrow,'','fieldwork') + link('project','<h3>Forma</h3><span>Product experience · Design study</span>' + arrow,'','forma') + '</div></section>' + proof() + servicesTeaser() + reviews() + closing();
    case 7:
      return '<section class="hero hero-surface wrap"><div class="surface-heading"><h1>Websites, interfaces<br>& development.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div>' +
        '<div class="surface-explorer"><div class="surface-options" aria-label="Experience type">' +
        projects.map((p,i) => '<button type="button" data-surface-project="' + p.id + '" aria-pressed="' + (i===1) + '"><b>' + p.category + '</b><span>' + p.description + '</span>' + arrow + '</button>').join('') +
        '</div><div class="surface-stage"><div data-stage>' + visual('arc',true) + '</div><p class="study-note">Interactive design study. Try the controls.</p></div></div></section>' +
        proof() + servicesTeaser() + reviews() + closing();
    case 8:
      return '<section class="hero hero-common wrap"><div class="common-heading"><h1>Custom websites<br>& landing pages.</h1><div><p class="lead">' + description + '</p>' + actions() + '</div></div>' +
        '<div class="common-composition"><div class="common-introduction"><h2>A direct<br>conversation.</h2><p>Start with your business, your customers, and what the website needs to do. Agree the scope, then review the design together.</p>' + link('about','About the studio ' + arrow,'text-link') + '</div>' +
        '<div class="common-project">' + card('fieldwork') + '</div></div></section>' + proof() + servicesTeaser() + '<section class="work-teaser wrap">' + heading('More to explore','work','Explore work') + '<div class="two-projects">' + card('forma') + card('arc') + '</div></section>' + reviews() + closing();
  }
}
function about() {
  return '<section class="inner-hero wrap"><p class="page-label">About</p><h1>A small web studio.<br>A direct conversation.</h1><p class="lead">Custom websites and landing pages for owner-operated and small service businesses. Agency development partnerships are a separate conversation.</p></section>' +
    '<section class="about-layout wrap"><h2>Start with<br>the business.</h2><div><p>The work begins with what you do, who you serve, and what a useful website needs to help people understand.</p><p>We agree the message and scope before moving into design. You review the direction in a working preview, so the important decisions happen before a launch.</p><p class="content-label">Founder name, biography and portrait are awaiting approval. No experience or team-size claims are made in this draft.</p>' + link('contact','Let’s talk ' + arrow,'button primary') + '</div></section>' + closing();
}
function services() {
  return '<section class="inner-hero wrap"><p class="page-label">Services</p><h1>Website design<br>& development.</h1><p class="lead">Start with the right scope for your business. Websites, focused landing pages, and separately scoped digital tools.</p></section>' +
    '<section class="service-detail wrap"><article><h2>Custom websites</h2><div><p>Service pages, clear navigation, responsive layouts, and an agreed path to inquiry.</p><ul><li>Content and page structure</li><li>Custom visual design</li><li>Desktop and mobile development</li><li>Inquiry journey and handover</li></ul></div></article>' +
    '<article><h2>Focused landing pages</h2><div><p>A dedicated destination for one service, offer or campaign, with one clear next step.</p><p>Advertising spend and campaign management are separate from the page build.</p></div></article>' +
    '<article><h2>Interfaces & integrations</h2><div><p>For a defined workflow or digital tool, we start by agreeing users, data, acceptance criteria and support needs.</p><p>Custom systems require a separate estimate. The design studies illustrate possibilities, not an included feature list.</p></div></article>' +
    '<article><h2>Ongoing website care</h2><div><p>Optional updates and maintenance, with bounded tasks, response times and pricing agreed separately.</p><p>Hosting, subscriptions and third-party services are distinct from the build.</p></div></article></section>' + closing();
}
function work() {
  return '<section class="inner-hero wrap"><p class="page-label">Work</p><h1>Websites.<br>Interfaces. Experiences.</h1><p class="lead">Three original design studies showing different kinds of work. Each is a fictional brand created for this preview.</p></section>' +
    '<section class="work-page wrap"><div class="work-filters" aria-label="Filter design studies"><button type="button" data-filter="all" aria-pressed="true">All studies</button><button type="button" data-filter="website" aria-pressed="false">Websites</button><button type="button" data-filter="interface" aria-pressed="false">Interfaces</button><button type="button" data-filter="product" aria-pressed="false">Product</button></div>' +
    '<div class="work-grid">' + projects.map(p => '<div data-category="' + p.filter + '">' + card(p.id) + '</div>').join('') + '</div><p class="study-note" data-filter-status aria-live="polite">Showing all 3 design studies.</p></section>' + closing();
}
function projectPage() {
  const p = state.project;
  return '<section class="inner-hero project-heading wrap">' + link('work','← All work','text-link') + '<p class="page-label">' + p.category + ' · Design study</p><h1>' + p.name + '</h1><p class="lead">' + p.description + '</p></section>' +
    '<section class="project-demo wrap" aria-label="' + p.name + ' interactive design study">' + visual(p.id,true) + '<p class="study-note">Original fictional brand. Interactive design study, not completed client work or measured client results.</p></section>' +
    '<section class="project-summary wrap"><h2>The design approach</h2><div><p>' + (p.id==='fieldwork' ? 'Let the spaces lead. Clear page structure and readable content support a calm service website. Try View room detail to see a closer crop without leaving the context.' : p.id==='arc' ? 'Make navigation and state easy to understand. Try Board and Schedule: the interface changes with a short, controlled transition, and the controls remain usable by keyboard.' : 'Give the product room to breathe. Three independently drawn layers create the lamp form; material controls change its finish without moving the visitor away from the product.') + '</p>' + link('contact','Let’s talk ' + arrow,'button primary') + '</div></section>' + closing();
}
function contact() {
  return '<section class="contact-layout wrap"><div><p class="page-label">Let’s talk</p><h1>Tell us about<br>your project.</h1><p class="lead">A few details are enough to start a scope conversation.</p><p>Websites, landing pages, or an agency development partnership.</p></div>' +
    '<div class="contact-panel"><p class="content-label">Prototype only. Use made-up details; nothing is sent or saved.</p><form id="inquiry"><label for="name">Your name</label><input id="name" name="name" autocomplete="off" required maxlength="100"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="off" required maxlength="254"><label for="type">What are you considering?</label><select id="type" name="type"><option>A custom website</option>A landing page</option>An interface or integration</option>An agency partnership</option>Not sure yet</option></select><label for="context">A little about your project</label><textarea id="context" name="context" rows="4" maxlength="2000"></textarea><button type="submit" class="button primary">Let’s talk ' + arrow + '</button></form><div id="confirmation" hidden role="status"><h2>Your demo inquiry is complete.</h2><p>No message was sent or saved.</p><button type="button" class="button secondary" data-reset>Try again</button></div></div></section>';
}
function header() {
  return '<header class="site-header wrap">' + link('home','ensizziyo<span class="brand-sub">WEB STUDIO</span>','wordmark') +
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
    document.querySelector('[data-filter-status]').textContent = category === 'all' ? 'Showing all 3 design studies.' : 'Showing ' + count + ' ' + category + ' design study.';
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
