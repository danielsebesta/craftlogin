import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';

const MAXIMUM_POLL_ATTEMPTS = 48;

export interface InteractionPageInput {
  readonly appName: string;
  readonly code: string;
  readonly interactionId: string;
  readonly minecraftBaseDomain: string;
}

export function renderInteractionPage(input: InteractionPageInput): string {
  const interactionPath = `/interaction/${encodeURIComponent(input.interactionId)}`;
  const serverAddress = `${input.code}.${input.minecraftBaseDomain}`;
  const strings = english.interaction;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="theme-color" content="#111814">
    <title>${escapeHtml(input.appName)} · ${escapeHtml(strings.title)}</title>
    <link rel="stylesheet" href="/assets/interaction.css">
    <script src="/assets/interaction.js" defer></script>
  </head>
  <body>
    <header class="site-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(strings.brand)}</div>
      <span class="protocol-label">${escapeHtml(strings.protocolLabel)}</span>
    </header>
    <main
      class="verification-shell"
      data-verification
      data-status-url="${escapeHtml(`${interactionPath}/status`)}"
      data-maximum-attempts="${MAXIMUM_POLL_ATTEMPTS.toString()}"
      data-pending-message="${escapeHtml(strings.status.pending)}"
      data-verified-message="${escapeHtml(strings.status.verified)}"
      data-expired-message="${escapeHtml(strings.status.expired)}"
      data-network-message="${escapeHtml(strings.status.networkError)}"
      data-stopped-message="${escapeHtml(strings.status.stopped)}"
    >
      <section class="guide" aria-labelledby="verification-heading">
        <div class="guide-content">
          <p class="eyebrow">${escapeHtml(strings.eyebrow)}</p>
          <h1 id="verification-heading">${escapeHtml(strings.heading)}</h1>
          <p class="lead">${escapeHtml(strings.appLead)} <strong><bdi>${escapeHtml(input.appName)}</bdi></strong>.</p>
          <h2 class="steps-heading">${escapeHtml(strings.instructionsHeading)}</h2>
          <ol class="steps">
            ${strings.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n            ')}
          </ol>
        </div>
      </section>
      <section class="connection-panel" aria-labelledby="address-heading">
        <h2 class="address-label" id="address-heading">${escapeHtml(strings.addressLabel)}</h2>
        <code class="server-address">${escapeHtml(serverAddress)}</code>
        <div class="status-block">
          <span class="status-label">${escapeHtml(strings.statusLabel)}</span>
          <p class="status-message" data-status-message data-state="pending" role="status" aria-live="polite">${escapeHtml(strings.status.pending)}</p>
        </div>
        <form class="continue-form" action="${escapeHtml(`${interactionPath}/complete`)}" method="post">
          <button class="continue-button" type="submit">${escapeHtml(strings.continueButton)}</button>
        </form>
        <noscript><p class="no-script">${escapeHtml(strings.noJavaScript)}</p></noscript>
        <p class="security-note">${escapeHtml(strings.securityNote)}</p>
      </section>
    </main>
    <footer class="site-footer">${escapeHtml(strings.footer)}</footer>
  </body>
</html>`;
}
