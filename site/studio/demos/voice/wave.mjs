const points = [];
for (let row = 1; row < 72; row++) {
  const latitude = row / 72 * Math.PI - Math.PI / 2;
  // Densify the moving equator without flattening the spherical outline.
  const y = Math.sin(latitude) ** 3;
  const radius = Math.sqrt(1 - y * y), count = Math.round(128 * radius);
  for (let column = 0; column < count; column++) {
    points.push({y, radius, angle: column / count * Math.PI * 2 + row * .035});
  }
}

export function drawVoiceWave(context, size, time, energy = 0) {
  context.clearRect(0, 0, size, size);
  context.fillStyle = '#202020';
  const scale = size * .39;
  for (const point of points) {
    const angle = point.angle + time * .12;
    const x = point.radius * Math.cos(angle), z = point.radius * Math.sin(angle);
    const wave = Math.sin(x * 3.6 + z * .15 - time * .85);
    const y = point.y + (1 - point.y * point.y) * (.23 + energy * .06) * wave;
    const depth = (z + 1) / 2;
    context.globalAlpha = .12 + depth * depth * .7;
    context.beginPath();
    context.arc(size / 2 + x * scale, size * .49 + y * scale, size / 360 * (.35 + depth * .36), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

export function mountVoiceWave(visual, main) {
  const canvas = visual.querySelector('canvas'), image = visual.querySelector('img');
  const context = canvas.getContext('2d');
  if (!context) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, time = 0, energy = 0, size = 0;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0; last = 0;
  }

  function tick(timestamp) {
    frame = requestAnimationFrame(tick);
    if (last && timestamp - last < 1000 / 30) return;
    time += last ? Math.min(timestamp - last, 100) / 1000 : 0;
    last = timestamp;
    energy += ((main.dataset.activity === 'speaking' ? 1 : 0) - energy) * .08;
    drawVoiceWave(context, size, time, energy);
  }

  function refresh() {
    stop();
    canvas.hidden = reduced.matches;
    image.hidden = !reduced.matches;
    size = visual.clientWidth;
    if (reduced.matches || document.hidden || !size) return;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * density);
    context.setTransform(density, 0, 0, density, 0, 0);
    drawVoiceWave(context, size, time, energy);
    frame = requestAnimationFrame(tick);
  }

  new ResizeObserver(refresh).observe(visual);
  reduced.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', refresh);
  refresh();
}
