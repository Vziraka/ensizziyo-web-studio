let chosen = '';
function show(id) { for (const name of ['menu', 'request', 'confirmation']) document.getElementById(name).hidden = name !== id; }
document.querySelectorAll('[data-box]').forEach(button => button.addEventListener('click', () => { chosen = button.dataset.box; document.querySelector('#chosen').textContent = chosen; show('request'); }));
document.querySelector('#back').addEventListener('click', () => show('menu'));
document.querySelector('#restart').addEventListener('click', () => { document.querySelector('#pickup').reset(); show('menu'); });
document.querySelector('#pickup').addEventListener('submit', event => { event.preventDefault(); const form = new FormData(event.target); document.querySelector('#request-summary').textContent = `${form.get('name')} · ${chosen} · ${form.get('time')} · Fictional request; nothing sent.`; show('confirmation'); });
