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

  const continueForm = document.querySelector('[data-continue-form]');
  const panels = Array.from(document.querySelectorAll('[data-method-panel]'));
  const choices = Array.from(document.querySelectorAll('[data-method-choice]'));
  const activePolls = new WeakSet();

  const startPolling = (region) => {
    if (!(region instanceof HTMLElement) || activePolls.has(region)) return;
    const status = region.querySelector('[data-verification]') ?? region;
    if (!(status instanceof HTMLElement)) return;
    const message = status.querySelector('[data-status-message]');
    const statusUrl = status.dataset.statusUrl;
    const pendingMessage = status.dataset.pendingMessage;
    const verifiedMessage = status.dataset.verifiedMessage;
    const expiredMessage = status.dataset.expiredMessage;
    const networkMessage = status.dataset.networkMessage;
    const stoppedMessage = status.dataset.stoppedMessage;
    const maximumAttempts = Number.parseInt(status.dataset.maximumAttempts ?? '', 10);
    if (!(message instanceof HTMLElement) || statusUrl === undefined || pendingMessage === undefined || verifiedMessage === undefined || expiredMessage === undefined || networkMessage === undefined || stoppedMessage === undefined || !Number.isSafeInteger(maximumAttempts)) return;
    activePolls.add(region);
    if (continueForm instanceof HTMLFormElement) continueForm.hidden = true;
    let attempts = 0;
    let delay = 2000;
    const show = (text, state) => { message.textContent = text; message.dataset.state = state; };
    const schedule = () => {
      attempts += 1;
      if (attempts >= maximumAttempts) {
        show(stoppedMessage, 'stopped');
        if (continueForm instanceof HTMLFormElement) continueForm.hidden = false;
        return;
      }
      window.setTimeout(poll, delay);
      delay = Math.min(Math.round(delay * 1.2), 10000);
    };
    const poll = async () => {
      try {
        const response = await window.fetch(statusUrl, { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!response.ok) { show(networkMessage, 'network-error'); schedule(); return; }
        const result = await response.json();
        if (result.status === 'verified') {
          show(verifiedMessage, 'verified');
          if (continueForm instanceof HTMLFormElement) { continueForm.hidden = false; continueForm.requestSubmit(); }
          return;
        }
        if (result.status === 'expired') { show(expiredMessage, 'expired'); return; }
        show(pendingMessage, 'pending');
        schedule();
      } catch { show(networkMessage, 'network-error'); schedule(); }
    };
    schedule();
  };

  const activate = (id) => {
    panels.forEach((panel) => { panel.hidden = panel.dataset.methodPanel !== id; });
    const selected = panels.find((panel) => panel.dataset.methodPanel === id);
    if (selected !== undefined && (id === 'online' || id === 'skin')) startPolling(selected);
  };

  if (choices.length > 0) {
    panels.forEach((panel) => { panel.hidden = true; });
    choices.forEach((choice) => choice.addEventListener('change', () => { if (choice instanceof HTMLInputElement && choice.checked) activate(choice.value); }));
    const checked = choices.find((choice) => choice instanceof HTMLInputElement && choice.checked);
    if (checked instanceof HTMLInputElement) activate(checked.value);
  } else {
    panels.forEach((panel) => { if (panel.dataset.methodPanel === 'online' || panel.dataset.methodPanel === 'skin') startPolling(panel); });
  }

  document.querySelectorAll('[data-skin-lookup]').forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    const input = form.querySelector('[data-skin-username]');
    const button = form.querySelector('[data-skin-start]');
    const status = form.querySelector('[data-skin-lookup-status]');
    const lookupUrl = form.dataset.lookupUrl;
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement) || lookupUrl === undefined) return;
    let timer;
    let controller;
    let ready = false;
    const setStatus = (text) => { status.textContent = text; };
    const lookup = async () => {
      const username = input.value.trim();
      ready = false;
      button.disabled = true;
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) { setStatus(''); return; }
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await window.fetch(lookupUrl + '?username=' + encodeURIComponent(username), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error('lookup');
        const result = await response.json();
        if (result.found === true) {
          input.value = result.username;
          ready = true;
          button.disabled = false;
          setStatus(result.hasSkin === true ? (form.dataset.lookupSkinMessage ?? '') : (form.dataset.lookupFoundMessage ?? ''));
        } else setStatus(form.dataset.lookupNotFoundMessage ?? '');
      } catch (error) { if (error?.name !== 'AbortError') setStatus(form.dataset.lookupUnavailableMessage ?? ''); }
    };
    button.disabled = true;
    input.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(() => { void lookup(); }, 450); });
    form.addEventListener('submit', (event) => { if (!ready) event.preventDefault(); });
  });
})();
`;
