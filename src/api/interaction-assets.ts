import { uiBaseStyles } from './ui/base.js';
import { uiControlStyles } from './ui/controls.js';
import { signInSurfaceStyles } from './ui/surface.js';

export const interactionStyles = `${uiBaseStyles}${uiControlStyles}${signInSurfaceStyles}`;

export const interactionScript = `
(() => {
  'use strict';

  document.querySelectorAll('[data-copy-target]').forEach((element) => {
    if (!(element instanceof HTMLButtonElement)) return;
    const selector = element.dataset.copyTarget;
    if (selector === undefined || selector.length === 0) return;
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) return;
    element.hidden = false;
    element.addEventListener('click', () => {
      const clipboard = navigator.clipboard;
      if (clipboard === undefined) return;
      void clipboard.writeText(target.textContent ?? '').then(
        () => {
          element.textContent = element.dataset.copiedLabel ?? element.textContent;
        },
        () => undefined,
      );
    });
  });

  const root = document.querySelector('[data-verification]');
  if (!(root instanceof HTMLElement)) return;

  const form = root.querySelector('[data-continue-form]');
  const message = root.querySelector('[data-status-message]');
  const statusUrl = root.dataset.statusUrl;
  const pendingMessage = root.dataset.pendingMessage;
  const verifiedMessage = root.dataset.verifiedMessage;
  const expiredMessage = root.dataset.expiredMessage;
  const networkMessage = root.dataset.networkMessage;
  const stoppedMessage = root.dataset.stoppedMessage;
  const maximumAttempts = Number.parseInt(root.dataset.maximumAttempts ?? '', 10);

  if (
    !(form instanceof HTMLFormElement) ||
    !(message instanceof HTMLElement) ||
    statusUrl === undefined ||
    pendingMessage === undefined ||
    verifiedMessage === undefined ||
    expiredMessage === undefined ||
    networkMessage === undefined ||
    stoppedMessage === undefined ||
    !Number.isSafeInteger(maximumAttempts)
  ) return;

  // With JavaScript the live status decides when continuing is safe. Without it
  // the visible form stays available as the manual fallback.
  form.hidden = true;

  // Gentle polling: joining in Minecraft takes a while, so start slow and stay
  // far below the per-minute status budget even across reloads and open tabs.
  let attempts = 0;
  let delay = 2000;

  const show = (text, state) => {
    message.textContent = text;
    message.dataset.state = state;
  };

  const schedule = () => {
    attempts += 1;
    if (attempts >= maximumAttempts) {
      show(stoppedMessage, 'stopped');
      // Hand control back to the user so the manual fallback still works.
      form.hidden = false;
      return;
    }
    window.setTimeout(poll, delay);
    delay = Math.min(Math.round(delay * 1.2), 10_000);
  };

  const poll = async () => {
    try {
      const response = await window.fetch(statusUrl, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        show(networkMessage, 'network-error');
        schedule();
        return;
      }

      const result = await response.json();
      if (result.status === 'verified') {
        show(verifiedMessage, 'verified');
        form.hidden = false;
        form.requestSubmit();
        return;
      }
      if (result.status === 'expired') {
        show(expiredMessage, 'expired');
        return;
      }

      show(pendingMessage, 'pending');
      schedule();
    } catch {
      show(networkMessage, 'network-error');
      schedule();
    }
  };

  schedule();
})();
`;
