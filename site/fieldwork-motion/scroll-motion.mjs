const clamp = value => Math.max(0, Math.min(1, value));

// Near the footer, use the scroll that actually exists so every image can finish.
export function entryProgress(top, viewport, remaining, delay = 0) {
  const start = viewport * .98 - delay;
  const end = Math.max(viewport * .58, top - remaining);
  return end >= start ? (top <= viewport ? 1 : 0) : clamp((start - top) / (start - end));
}

export function createScrollMotion(enabled) {
  const hero = document.querySelector('.hero');
  const details = [...document.querySelectorAll('.beyond-grid figure')];
  const groups = [
    ...document.querySelectorAll('.featured, .settings-intro, .editorial-grid article, .beyond-grid figure, .property-photo, .story-grid > div, .story-grid figure')
  ];
  document.body.classList.add('scroll-crafted');
  return {
    update() {
      if (!enabled() || document.hidden) return;
      const height = innerHeight;
      const remaining = Math.max(0, document.documentElement.scrollHeight - height - scrollY);
      const compact = innerWidth <= 600;
      const frames = groups.filter(el => !el.closest('[hidden]')).map(el => ({el, rect: el.getBoundingClientRect()}));
      const heroRect = hero.getBoundingClientRect();
      if (!hero.closest('[hidden]')) hero.style.setProperty('--travel', clamp(-heroRect.top / heroRect.height).toFixed(4));
      for (const {el, rect} of frames) {
        const detailIndex = details.indexOf(el);
        const delay = detailIndex < 0 ? 0 : (compact ? detailIndex % 2 : detailIndex) * 35;
        const enter = entryProgress(rect.top, height, remaining, delay);
        const drift = clamp((height - rect.top) / (height + rect.height));
        el.style.setProperty('--enter', enter.toFixed(4));
        el.style.setProperty('--drift', drift.toFixed(4));
        if (el.classList.contains('featured')) {
          el.querySelectorAll('.listing-card').forEach((card, i) => {
            card.style.setProperty('--enter', entryProgress(rect.top, height, remaining, compact ? 0 : i * 55).toFixed(4));
          });
        }
      }
    }
  };
}
