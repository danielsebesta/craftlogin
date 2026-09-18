export const promptCopyScript = `
(() => {
  'use strict';
  const button = document.querySelector('[data-copy-target]');
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('click', () => {
    const selector = button.dataset.copyTarget;
    if (selector === undefined) return;
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) return;
    void navigator.clipboard.writeText(target.textContent ?? '').then(() => {
      button.textContent = button.dataset.copiedLabel ?? button.textContent;
    });
  });
})();
`;
