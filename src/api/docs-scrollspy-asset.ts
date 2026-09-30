// Docs sidebar scrollspy: marks the TOC entry for the section nearest the
// viewport activation line. Pure progressive enhancement — without JS the
// links still jump to their sections, nothing is hidden.
export const docsScrollspyScript = `
(() => {
  'use strict';
  const nav = document.querySelector('.docs-toc');
  if (!(nav instanceof HTMLElement)) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')].filter(
    (node) => node instanceof HTMLAnchorElement,
  );
  const sections = links
    .map((link) => document.getElementById(link.hash.slice(1)))
    .filter((node) => node instanceof HTMLElement);
  if (sections.length === 0) return;

  const setCurrent = (id) => {
    links.forEach((link) => {
      if (link.hash === '#' + id) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  const update = () => {
    const marker = window.innerHeight * 0.3;
    let current = sections[0];
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= marker) current = section;
    }
    setCurrent(current.id);
  };

  let ticking = false;
  addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    },
    { passive: true },
  );
  addEventListener('hashchange', update);
  update();
})();
`;
