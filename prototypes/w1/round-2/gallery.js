const previews = [
  ['Studio','Centered introduction · asymmetric work grid','The clearest service-first introduction; familiar to a business owner.','Less expressive in the hero; the project material carries the ambition.'],
  ['Focus','Split introduction · overlapping project surfaces','Shows depth and more than one type of concept work at first glance.','The layered samples need more space and careful mobile composition.'],
  ['Index','Typographic introduction · browsable work rows','Compact, precise and quick to scan.','The work needs strong imagery; the rows show less of each study.'],
  ['Gallery','Dark canvas · selectable project stage','A deliberate portfolio presence with a controlled visual peak.','Feels more like a design studio; contrast and project quality carry more weight.'],
  ['Frame','Broad introduction · one architectural project','Gives one example enough space to be understood.','The renovation study may make the studio seem more specialized than intended.'],
  ['Ledger','Desktop sidebar · compact working canvas','About, Services and Work stay close to the content.','The sidebar is less familiar and reduces the available desktop canvas.'],
  ['Surface','Live concept selector · interactive interface','Makes the website, business interface and product concepts easy to explore.','More interaction and more information in the first screen.'],
  ['Common','Quiet asymmetry · direct studio introduction','Approachable, measured and personal without decorative motifs.','A slower portfolio introduction; the interactive concepts appear further down.']
];
const grid = document.querySelector('#preview-grid');
previews.forEach((p,index) => {
  const number = index + 1;
  const article = document.createElement('article');
  article.className = 'preview-card';
  article.innerHTML = '<header><div><span>Direction ' + number + '</span><h3>' + p[0] + '</h3></div><a href="preview.html?variant=' + number + '">Open interactive preview ↗</a></header>' +
    '<a class="capture" href="preview.html?variant=' + number + '" aria-label="Explore direction ' + number + ', ' + p[0] + '"><img src="evidence/' + number + '-desktop.jpg" data-number="' + number + '" width="1440" height="1100" alt="' + p[0] + ' desktop browser preview"></a>' +
    '<div class="card-copy"><p class="structure">' + p[1] + '</p><p>' + p[2] + '</p><p class="tradeoff">' + p[3] + '</p></div>';
  grid.append(article);
});
document.querySelectorAll('[data-device]').forEach(button => button.addEventListener('click',() => {
  const device = button.dataset.device;
  document.body.dataset.device = device;
  document.querySelectorAll('[data-device]').forEach(item => item.setAttribute('aria-pressed',String(item === button)));
  document.querySelectorAll('.capture img').forEach(img => {
    const number = Number(img.dataset.number);
    img.src = 'evidence/' + number + '-' + device + '.jpg';
    img.width = device === 'mobile' ? 390 : 1440;
    img.height = 1100;
    img.alt = previews[number-1][0] + ' ' + device + ' browser preview';
  });
}));
