// Motion enhances the approved layout. Content is visible before JS and with motion off.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const canMove = () => !reduced.matches && !document.body.classList.contains('motion-off');

export function createScenes({ entries = [], depth = [], tactile = [] }) {
  const root = document.querySelector('main');
  const seen = new WeakSet(), active = new Set();
  let queued = false, scanQueued = false;
  const observer = new IntersectionObserver(records => {
    for (const { target, isIntersecting } of records) {
      if (!isIntersecting || !target.getClientRects().length) continue;
      observer.unobserve(target);
      if (!canMove()) continue;
      const type = target.dataset.scene, delay = Number(target.dataset.sceneDelay || 0);
      const frames = type === 'curtain'
        ? [{ clipPath: 'inset(0 0 9% 0)', opacity: .65, translate: '0 18px' }, { clipPath: 'inset(0)', opacity: 1, translate: '0 0' }]
        : type === 'slide'
          ? [{ opacity: .2, translate: '-18px 0' }, { opacity: 1, translate: '0 0' }]
          : [{ opacity: .3, translate: '0 14px' }, { opacity: 1, translate: '0 0' }];
      const animation = target.animate(frames, { duration: type === 'curtain' ? 820 : 440, delay, easing: 'cubic-bezier(.2,.7,.2,1)' });
      active.add(animation); animation.finished.catch(() => {}).finally(() => active.delete(animation));
    }
  }, { threshold: .12 });

  function scan() {
    scanQueued = false;
    entries.forEach(([selector, type = 'rise']) => root.querySelectorAll(selector).forEach((el, index) => {
      if (seen.has(el)) return;
      seen.add(el); el.dataset.scene = type; el.dataset.sceneDelay = Math.min(index % 3 * 65, 130);
      observer.observe(el);
    }));
    tactile.forEach(selector => root.querySelectorAll(selector).forEach(el => {
      if (el.dataset.tactile) return;
      el.dataset.tactile = 'true';
      const reset = () => { el.style.removeProperty('rotate'); el.style.removeProperty('translate'); };
      el.addEventListener('pointermove', e => {
        if (!canMove() || !finePointer.matches || innerWidth < 760) return;
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5;
        el.style.rotate = `${x * 1.6}deg`; el.style.translate = '0 -3px';
      }, { passive: true });
      el.addEventListener('pointerleave', reset);
      el.addEventListener('focusout', reset);
      el.addEventListener('pointercancel', reset);
    }));
    schedule();
  }
  function update() {
    queued = false;
    const enabled = canMove();
    depth.forEach(([selector, amount = 24]) => root.querySelectorAll(selector).forEach(el => {
      if (!el.getClientRects().length) return;
      if (!enabled) { el.style.removeProperty('transform'); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > innerHeight + 80) return;
      const progress = Math.max(-1, Math.min(1, (innerHeight / 2 - (r.top + r.height / 2)) / innerHeight));
      const distance = innerWidth < 760 ? amount * .3 : amount;
      el.style.transform = `translateY(${(progress * distance).toFixed(2)}px) scale(1.045)`;
    }));
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  function motionChange() {
    if (!canMove()) {
      active.forEach(a => a.finish());
      root.querySelectorAll('[data-tactile]').forEach(el => { el.style.removeProperty('rotate'); el.style.removeProperty('translate'); });
    }
    schedule();
  }
  const mutations = new MutationObserver(records => {
    if (!records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === 1))) return;
    if (!scanQueued) { scanQueued = true; requestAnimationFrame(scan); }
  });
  mutations.observe(root, { childList: true, subtree: true });
  // Existing previews announce manual motion through the body class.
  new MutationObserver(motionChange).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  reduced.addEventListener('change', motionChange);
  document.addEventListener('motionchange', motionChange);
  scan();
}
