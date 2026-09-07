export const interactionStyles = `
:root {
  color-scheme: light;
  --ink: #172019;
  --muted: #59635b;
  --paper: #f3f0e6;
  --paper-deep: #e5dfcf;
  --line: #b8b3a5;
  --green: #206a42;
  --green-bright: #b9e769;
  --night: #111814;
  --danger: #8d2f25;
  font-family: "Trebuchet MS", "Gill Sans", sans-serif;
}

* {
  box-sizing: border-box;
}

html {
  min-height: 100%;
  background: var(--night);
}

body {
  min-height: 100vh;
  margin: 0;
  color: var(--ink);
  background:
    linear-gradient(rgb(17 24 20 / 82%), rgb(17 24 20 / 94%)),
    repeating-linear-gradient(90deg, transparent 0 39px, rgb(185 231 105 / 9%) 40px),
    repeating-linear-gradient(0deg, transparent 0 39px, rgb(185 231 105 / 9%) 40px);
}

.site-header,
.site-footer,
.verification-shell {
  width: min(1120px, calc(100% - 32px));
  margin-inline: auto;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 84px;
  color: #fff;
  border-bottom: 1px solid rgb(255 255 255 / 18%);
}

.brand {
  display: inline-flex;
  gap: 11px;
  align-items: center;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.16rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.brand-mark {
  width: 24px;
  height: 24px;
  background: var(--green-bright);
  border: 5px solid #2c593b;
  box-shadow: 4px 4px 0 rgb(255 255 255 / 16%);
}

.protocol-label,
.eyebrow,
.address-label,
.status-label {
  font-family: "Courier New", Courier, monospace;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.protocol-label {
  color: #cbd2cc;
}

.verification-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.02fr) minmax(360px, 0.98fr);
  min-height: calc(100vh - 164px);
  padding-block: clamp(44px, 8vw, 96px);
}

.guide {
  position: relative;
  padding: clamp(34px, 5vw, 70px);
  background: var(--paper);
  border: 1px solid var(--line);
  box-shadow: 14px 14px 0 rgb(0 0 0 / 28%);
}

.guide::before {
  position: absolute;
  inset: 13px;
  pointer-events: none;
  content: "";
  border: 1px solid var(--line);
}

.guide-content {
  position: relative;
  z-index: 1;
}

.eyebrow {
  margin: 0 0 22px;
  color: var(--green);
}

h1 {
  max-width: 620px;
  margin: 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: clamp(3rem, 7vw, 6.6rem);
  font-weight: 700;
  line-height: 0.88;
  letter-spacing: -0.065em;
}

.lead {
  max-width: 580px;
  margin: 30px 0 0;
  color: var(--muted);
  font-size: clamp(1.05rem, 2vw, 1.3rem);
  line-height: 1.55;
}

.lead strong {
  color: var(--ink);
}

.steps-heading {
  margin: 46px 0 18px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.35rem;
}

.steps {
  display: grid;
  gap: 14px;
  padding: 0;
  margin: 0;
  list-style: none;
  counter-reset: steps;
}

.steps li {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 13px;
  align-items: start;
  line-height: 1.45;
  counter-increment: steps;
}

.steps li::before {
  display: grid;
  width: 28px;
  height: 28px;
  color: #fff;
  background: var(--green);
  place-items: center;
  content: counter(steps, decimal-leading-zero);
  font-family: "Courier New", Courier, monospace;
  font-size: 0.7rem;
  font-weight: 700;
}

.connection-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(34px, 5vw, 70px);
  color: #fff;
  background: #1e2a22;
  border: 1px solid #34463a;
  border-left: 0;
}

.connection-panel::after {
  position: absolute;
  right: 26px;
  bottom: 26px;
  width: 74px;
  height: 74px;
  content: "";
  opacity: 0.18;
  background:
    linear-gradient(90deg, var(--green-bright) 50%, transparent 50%),
    linear-gradient(var(--green-bright) 50%, transparent 50%);
  background-size: 24px 24px;
}

.address-label {
  margin: 0 0 14px;
  color: var(--green-bright);
}

.server-address {
  display: block;
  overflow-wrap: anywhere;
  color: #fff;
  font-family: "Courier New", Courier, monospace;
  font-size: clamp(1.45rem, 4vw, 2.65rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.045em;
}

.status-block {
  padding-top: 26px;
  margin-top: 34px;
  border-top: 1px solid rgb(255 255 255 / 18%);
}

.status-label {
  display: block;
  margin-bottom: 8px;
  color: #aab5ac;
}

.status-message {
  min-height: 48px;
  margin: 0;
  font-size: 1rem;
  line-height: 1.5;
}

.status-message[data-state="verified"] {
  color: var(--green-bright);
}

.status-message[data-state="expired"] {
  color: #ffb1a8;
}

.continue-form {
  margin-top: 30px;
}

.continue-button {
  width: 100%;
  min-height: 54px;
  padding: 13px 18px;
  color: #102018;
  background: var(--green-bright);
  border: 2px solid var(--green-bright);
  border-radius: 0;
  box-shadow: 6px 6px 0 #0b100d;
  cursor: pointer;
  font: 700 0.86rem/1.2 "Courier New", Courier, monospace;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}

.continue-button:hover {
  background: #cdf28d;
  transform: translate(-2px, -2px);
  box-shadow: 8px 8px 0 #0b100d;
}

.continue-button:active {
  transform: translate(3px, 3px);
  box-shadow: 2px 2px 0 #0b100d;
}

.continue-button:focus-visible,
a:focus-visible {
  outline: 4px solid #fff;
  outline-offset: 4px;
}

.security-note,
.no-script {
  position: relative;
  z-index: 1;
  max-width: 540px;
  margin: 28px 0 0;
  color: #c8d0ca;
  font-size: 0.86rem;
  line-height: 1.55;
}

.no-script {
  color: #ffcf8c;
}

.site-footer {
  min-height: 80px;
  padding-top: 22px;
  color: #97a099;
  font-size: 0.78rem;
  line-height: 1.5;
  border-top: 1px solid rgb(255 255 255 / 13%);
}

.error-shell {
  display: grid;
  width: min(780px, calc(100% - 32px));
  min-height: calc(100vh - 164px);
  margin-inline: auto;
  padding-block: clamp(44px, 10vw, 120px);
  place-items: center;
}

.error-card {
  width: 100%;
  padding: clamp(38px, 7vw, 76px);
  background: var(--paper);
  border-top: 8px solid var(--danger);
  box-shadow: 14px 14px 0 rgb(0 0 0 / 28%);
}

.error-card h1 {
  max-width: 640px;
  font-size: clamp(2.8rem, 8vw, 5.6rem);
}

@media (max-width: 840px) {
  .protocol-label {
    display: none;
  }

  .verification-shell {
    grid-template-columns: 1fr;
    width: min(680px, calc(100% - 24px));
    padding-block: 24px 40px;
  }

  .guide {
    box-shadow: 8px 8px 0 rgb(0 0 0 / 28%);
  }

  .connection-panel {
    border-top: 0;
    border-left: 1px solid #34463a;
  }
}

@media (max-width: 480px) {
  .site-header,
  .site-footer {
    width: calc(100% - 24px);
  }

  .site-header {
    min-height: 68px;
  }

  .guide,
  .connection-panel {
    padding: 34px 26px;
  }

  .guide::before {
    inset: 9px;
  }

  h1 {
    font-size: clamp(3rem, 18vw, 4.5rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;

export const interactionScript = `
(() => {
  'use strict';

  const root = document.querySelector('[data-verification]');
  if (!(root instanceof HTMLElement)) return;

  const form = root.querySelector('form');
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

  let attempts = 0;
  let delay = 900;

  const show = (text, state) => {
    message.textContent = text;
    message.dataset.state = state;
  };

  const schedule = () => {
    attempts += 1;
    if (attempts >= maximumAttempts) {
      show(stoppedMessage, 'stopped');
      return;
    }
    window.setTimeout(poll, delay);
    delay = Math.min(Math.round(delay * 1.25), 8000);
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
