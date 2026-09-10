import { escapeHtml } from '../html.js';

export const MAXIMUM_POLL_ATTEMPTS = 48;

export interface SignInMessages {
  readonly expired: string;
  readonly networkError: string;
  readonly pending: string;
  readonly stopped: string;
  readonly verified: string;
}

export interface SignInPageInput {
  readonly action: string;
  readonly address: string;
  readonly addressLabel: string;
  readonly appName?: string;
  readonly brand: string;
  readonly continueLabel: string;
  readonly copiedLabel: string;
  readonly copyLabel: string;
  readonly documentTitle: string;
  readonly footer: string;
  readonly heading: string;
  readonly headingId: string;
  readonly initialStatus: string;
  readonly initialStatusState: string;
  readonly lead: string;
  readonly messages: SignInMessages;
  readonly noJavaScript: string;
  readonly securityNote?: string;
  readonly skipLabel: string;
  readonly statusUrl: string;
  readonly steps: readonly string[];
  readonly stepsHeading: string;
}

export function renderSignInPage(input: SignInPageInput): string {
  const headingSuffix =
    input.appName === undefined ? '' : ` <bdi>${escapeHtml(input.appName)}</bdi>`;
  const securityNote =
    input.securityNote === undefined
      ? ''
      : `<p class="field-hint">${escapeHtml(input.securityNote)}</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="#131714">
    <title>${escapeHtml(input.documentTitle)}</title>
    <link rel="stylesheet" href="/assets/interaction.css">
    <script src="/assets/interaction.js" defer></script>
  </head>
  <body class="surface-grid">
    <a class="skip-link" href="#main">${escapeHtml(input.skipLabel)}</a>
    <header class="signin-header">
      <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(input.brand)}</span>
    </header>
    <main
      id="main"
      class="signin"
      data-verification
      data-status-url="${escapeHtml(input.statusUrl)}"
      data-maximum-attempts="${MAXIMUM_POLL_ATTEMPTS.toString()}"
      data-pending-message="${escapeHtml(input.messages.pending)}"
      data-verified-message="${escapeHtml(input.messages.verified)}"
      data-expired-message="${escapeHtml(input.messages.expired)}"
      data-network-message="${escapeHtml(input.messages.networkError)}"
      data-stopped-message="${escapeHtml(input.messages.stopped)}"
    >
      <div class="signin-intro">
        <h1 id="${escapeHtml(input.headingId)}">${escapeHtml(input.heading)}${headingSuffix}</h1>
        <p class="lead">${escapeHtml(input.lead)}</p>
        <h2>${escapeHtml(input.stepsHeading)}</h2>
        <ol class="steps">
          ${input.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n          ')}
        </ol>
      </div>
      <section class="signin-action" aria-labelledby="address-heading">
        <h2 id="address-heading">${escapeHtml(input.addressLabel)}</h2>
        <div class="signin-address-row">
          <code class="signin-address" data-address>${escapeHtml(input.address)}</code>
          <button type="button" class="button button-secondary" data-copy-target="[data-address]" data-copied-label="${escapeHtml(input.copiedLabel)}" hidden>${escapeHtml(input.copyLabel)}</button>
        </div>
        <p class="signin-status" data-status-message data-state="${escapeHtml(input.initialStatusState)}" role="status" aria-live="polite">${escapeHtml(input.initialStatus)}</p>
        <form class="signin-continue" data-continue-form action="${escapeHtml(input.action)}" method="post">
          <button class="button" type="submit">${escapeHtml(input.continueLabel)}</button>
        </form>
        <noscript><p class="field-hint">${escapeHtml(input.noJavaScript)}</p></noscript>
        ${securityNote}
      </section>
    </main>
    <footer class="signin-footer">${escapeHtml(input.footer)}</footer>
  </body>
</html>`;
}
