(() => {
  'use strict';

  // Keep the pointer target still while the record turns inside it.
  const vinyl = document.getElementById('hero-vinyl');
  const rotor = vinyl?.querySelector('.vinyl-rotor');
  if (!rotor) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cruisingSpeed = 150; // Degrees per second; the printed RPM is label artwork.
  let angle = -24;
  let speed = 0;
  let hovering = false;
  let frame = null;
  let previousTime = null;

  function halt() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
    speed = 0;
    hovering = false;
    vinyl.classList.remove('is-spinning');
  }

  function tick(now) {
    frame = null;
    if (document.hidden || reducedMotion.matches) {
      halt();
      return;
    }
    const elapsed = Math.min((now - previousTime) / 1000, 0.064);
    previousTime = now;
    const target = hovering ? cruisingSpeed : 0;
    const rate = hovering ? 7 : 2;
    const decay = Math.exp(-rate * elapsed);

    // Integrate the changing speed to preserve angle and momentum on re-entry.
    angle = (angle + target * elapsed + (speed - target) * (1 - decay) / rate) % 360;
    speed = target + (speed - target) * decay;
    rotor.style.setProperty('--record-angle', `${angle}deg`);

    if (!hovering && speed < 0.2) {
      halt();
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function enter(event) {
    if (event.pointerType === 'touch' || reducedMotion.matches || document.hidden) return;
    hovering = true;
    if (frame !== null) return;
    previousTime = performance.now();
    vinyl.classList.add('is-spinning');
    frame = requestAnimationFrame(tick);
  }

  function release() {
    hovering = false;
  }

  vinyl.addEventListener('pointerenter', enter);
  vinyl.addEventListener('pointermove', event => {
    if (!hovering) enter(event);
  });
  vinyl.addEventListener('pointerleave', release);
  vinyl.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', halt);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) halt();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) halt();
  });
})();
