// W1 only: compare service-first and example-first layouts. No transport or persistence.
const host = document.querySelector('#direction');
const switcher = document.querySelector('.prototype-switcher');
const conceptDialog = document.querySelector('#concept-dialog');
let currentVariant;

function renderVariant() {
  currentVariant = new URLSearchParams(location.search).get('variant') === 'b' ? 'b' : 'a';
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  host.replaceChildren(document.querySelector(`#direction-${currentVariant}`).content.cloneNode(true));
  document.body.dataset.variant = currentVariant;
  document.title = `${currentVariant.toUpperCase()} — ${currentVariant === 'a' ? 'The local studio' : 'The digital atelier'} · W1 prototype`;
  switcher.querySelectorAll('[data-variant]').forEach(button => {
    if (button.dataset.variant === currentVariant) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({top: 0, behavior: 'instant'});
}

function changeVariant(variant) {
  if (variant === currentVariant) return;
  const url = new URL(location.href);
  url.searchParams.set('variant', variant);
  url.hash = '';
  history.pushState(null, '', url);
  renderVariant();
}

switcher.addEventListener('click', event => {
  const direct = event.target.closest('[data-variant]');
  if (direct) changeVariant(direct.dataset.variant);
  else if (event.target.closest('[data-cycle]')) changeVariant(currentVariant === 'a' ? 'b' : 'a');
});
window.addEventListener('popstate', () => {
  const requestedVariant = new URLSearchParams(location.search).get('variant') === 'b' ? 'b' : 'a';
  if (requestedVariant !== currentVariant) renderVariant();
});
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, button, a, dialog, details, [contenteditable]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    changeVariant(currentVariant === 'a' ? 'b' : 'a');
  }
});

function showConceptView(view) {
  host.querySelectorAll('[data-concept-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.conceptView === view)));
  host.querySelectorAll('[data-concept-panel]').forEach(panel => { panel.hidden = panel.dataset.conceptPanel !== view; });
}

const processCopy = {
  scope: ['START WITH THE RIGHT QUESTIONS', 'Decide what the site needs to do.', 'Talk through your business, customers, content, and inquiry needs. Agree the deliverables and responsibilities in writing before quoting.'],
  design: ['REVIEW SOMETHING YOU CAN USE', 'Shape the message and the experience.', 'Explore a focused direction in a working preview. Refine the copy, layout, and next step together before the production build.'],
  build: ['CHECK THE DETAILS THAT MATTER', 'Build, verify, and hand over.', 'Implement the chosen design. Check phones, keyboards, and the agreed inquiry destination, then document hosting ownership, costs, and handover.']
};

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.matches('[data-inquire]')) {
    const dialog = host.querySelector('.inquiry-dialog');
    if (button.hasAttribute('data-agency')) dialog.querySelector('select').value = 'Agency partnership';
    dialog.showModal();
  }
  if (button.matches('[data-concept]')) conceptDialog.showModal();
  if (button.matches('[data-close]')) button.closest('dialog').close();
  if (button.matches('[data-concept-view]')) showConceptView(button.dataset.conceptView);
  if (button.matches('[data-show-inquiry]')) {
    showConceptView('inquiry');
    host.querySelector('[data-concept-view="inquiry"]').focus();
  }
  if (button.matches('[data-process]')) {
    host.querySelectorAll('[data-process]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const copy = host.querySelector('.process-copy');
    const [eyebrow, title, description] = processCopy[button.dataset.process];
    copy.querySelector('.eyebrow').textContent = eyebrow;
    copy.querySelector('h3').textContent = title;
    copy.querySelector('p').textContent = description;
  }
  if (button.matches('[data-next]')) {
    const form = button.closest('form');
    const project = form.querySelector('input[name="project"]');
    if (!project.reportValidity()) return;
    form.querySelector('[data-brief-step="1"]').hidden = true;
    form.querySelector('[data-brief-step="2"]').hidden = false;
    form.querySelector('input[name="name"]').focus();
  }
  if (button.matches('[data-back]')) {
    const form = button.closest('form');
    form.querySelector('[data-brief-step="1"]').hidden = false;
    form.querySelector('[data-brief-step="2"]').hidden = true;
    form.querySelector('input[name="project"]:checked').focus();
  }
  if (button.matches('[data-reset]')) {
    const result = button.closest('.form-result');
    const form = result.parentElement.querySelector('[data-studio-form]');
    form.reset();
    result.hidden = true;
    form.hidden = false;
    if (form.querySelector('[data-brief-step]')) {
      form.querySelector('[data-brief-step="1"]').hidden = false;
      form.querySelector('[data-brief-step="2"]').hidden = true;
    }
    form.querySelector('input').focus();
  }
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  if (form.matches('[data-studio-form]')) {
    const result = form.parentElement.querySelector('.form-result');
    form.reset();
    form.hidden = true;
    result.hidden = false;
    result.focus();
  }
  if (form.matches('[data-concept-form]')) {
    form.reset();
    form.querySelector('.sample-status').textContent = 'Demo complete. No estimate was requested, and nothing was sent or saved.';
  }
});

renderVariant();
