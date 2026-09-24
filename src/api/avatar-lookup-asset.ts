// Landing-page avatar lookup: submits an identifier and retargets every
// showcase image at that player's renders. Cards whose image fails to load
// (a capeless player's /cape, or an invalid name) hide themselves, and the
// status line appears only once every card has failed.
export const avatarLookupScript = `
(() => {
  'use strict';
  const form = document.querySelector('[data-avatar-lookup]');
  if (!(form instanceof HTMLFormElement)) return;
  const input = form.querySelector('input[name="player"]');
  if (!(input instanceof HTMLInputElement)) return;
  const images = [...document.querySelectorAll('[data-avatar-view]')].filter(
    (node) => node instanceof HTMLImageElement,
  );
  const caption = document.querySelector('[data-avatar-caption]');
  const status = document.querySelector('[data-avatar-status]');
  const template =
    caption instanceof HTMLElement ? caption.dataset.captionTemplate ?? '{player}' : '{player}';
  const fallback = input.placeholder.trim() === '' ? 'Dastcz' : input.placeholder.trim();

  const setCardHidden = (image, hidden) => {
    const card = image.closest('li');
    if (card instanceof HTMLElement) card.hidden = hidden;
  };
  const refreshStatus = () => {
    if (!(status instanceof HTMLElement)) return;
    const hiddenCount = images.filter((image) => {
      const card = image.closest('li');
      return card instanceof HTMLElement && card.hidden;
    }).length;
    status.hidden = hiddenCount !== images.length;
  };
  images.forEach((image) => {
    image.addEventListener('error', () => {
      setCardHidden(image, true);
      refreshStatus();
    });
    image.addEventListener('load', () => {
      setCardHidden(image, false);
      refreshStatus();
    });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const player = input.value.trim() === '' ? fallback : input.value.trim();
    images.forEach((image) => {
      const view = image.dataset.avatarView;
      if (view === undefined) return;
      const next = '/api/avatars/' + encodeURIComponent(player) + '/' + view;
      if (!image.src.endsWith(next)) image.src = next;
    });
    if (caption instanceof HTMLElement) {
      caption.textContent = template.replaceAll('{player}', player);
    }
  });
})();
`;
