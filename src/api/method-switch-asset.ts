// Landing-page hero: the middle handoff window is a decorative demo that
// auto-cycles the three verification methods on its own; it has no controls.
export const methodSwitchScript = `
(() => {
  'use strict';
  const root = document.querySelector('[data-method-demo]');
  if (!(root instanceof HTMLElement)) return;
  const panels = [...root.querySelectorAll('[data-method-panel]')].filter(
    (node) => node instanceof HTMLElement,
  );
  if (panels.length < 2) return;

  const activate = (index) => {
    panels.forEach((panel, panelIndex) => {
      if (panelIndex === index) {
        panel.setAttribute('data-active', '');
      } else {
        panel.removeAttribute('data-active');
      }
    });
  };

  // Hover pauses the rotation so a reader can finish a panel; a hidden tab
  // never spends its tick on a switch nobody can see.
  let pointerInside = false;
  root.addEventListener('pointerenter', () => {
    pointerInside = true;
  });
  root.addEventListener('pointerleave', () => {
    pointerInside = false;
  });

  const tick = () => {
    if (document.hidden || pointerInside) return;
    const current = panels.findIndex((panel) => panel.hasAttribute('data-active'));
    activate((current + 1) % panels.length);
  };

  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  ) {
    window.setInterval(tick, 5000);
  }
})();
`;
