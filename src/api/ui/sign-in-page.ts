import { escapeHtml } from '../html.js';

// Forty gentle polls cover the five-minute verification code lifetime.
export const MAXIMUM_POLL_ATTEMPTS = 40;

export const SIGN_IN_HEADING_ID = 'verification-heading';

export interface SignInMessages {
  readonly expired: string;
  readonly networkError: string;
  readonly pending: string;
  readonly stopped: string;
  readonly verified: string;
}

export type ConsentPermission =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly code: string };

export interface SignInCancel {
  readonly action: string;
  readonly label: string;
}

export interface SignInPageInput {
  readonly action: string;
  readonly address: string;
  readonly addressLabel: string;
  readonly allowsHeading: string;
  readonly appName?: string;
  readonly brand: string;
  readonly cancel?: SignInCancel;
  readonly continueLabel: string;
  readonly copiedLabel: string;
  readonly copyLabel: string;
  readonly documentTitle: string;
  readonly footer: string;
  readonly heading: string;
  readonly initialStatus: string;
  readonly initialStatusState: string;
  readonly lead: string;
  readonly messages: SignInMessages;
  readonly noJavaScript: string;
  readonly permissions: readonly ConsentPermission[];
  readonly securityNote?: string;
  readonly skipLabel: string;
  readonly statusUrl: string;
  readonly steps: readonly string[];
  readonly stepsHeading: string;
}

function renderPermission(permission: ConsentPermission): string {
  if (permission.kind === 'code') {
    return `<li><span class="consent-check" aria-hidden="true">✓</span><code>${escapeHtml(permission.code)}</code></li>`;
  }
  return `<li><span class="consent-check" aria-hidden="true">✓</span><span>${escapeHtml(permission.text)}</span></li>`;
}

export function renderSignInPage(input: SignInPageInput): string {
  const headingSuffix =
    input.appName === undefined ? '' : ` <bdi>${escapeHtml(input.appName)}</bdi>`;
  const securityNote =
    input.securityNote === undefined
      ? ''
      : `<p class="field-hint">${escapeHtml(input.securityNote)}</p>`;
  const cancelForm =
    input.cancel === undefined
      ? ''
      : `<form action="${escapeHtml(input.cancel.action)}" method="post">
          <button class="button button-secondary" type="submit">${escapeHtml(input.cancel.label)}</button>
        </form>`;

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
  <body class="page-surface">
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
      <section class="card consent-card" aria-labelledby="${SIGN_IN_HEADING_ID}">
        <div class="consent-identity">
          <span class="consent-avatar" aria-hidden="true"><img src="/assets/app-avatar.jpg" alt="" width="740" height="740"></span>
          <div class="consent-title">
            <h1 id="${SIGN_IN_HEADING_ID}">${escapeHtml(input.heading)}${headingSuffix}</h1>
            <p class="lead">${escapeHtml(input.lead)}</p>
          </div>
        </div>
        <div class="consent-scopes">
          <h2>${escapeHtml(input.allowsHeading)}</h2>
          <ul>
            ${input.permissions.map(renderPermission).join('\n            ')}
          </ul>
        </div>
        <div class="consent-verify">
          <h2>${escapeHtml(input.stepsHeading)}</h2>
          <ol class="steps">
            ${input.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n            ')}
          </ol>
          <h2 id="address-heading">${escapeHtml(input.addressLabel)}</h2>
          <div class="signin-address-row">
            <code class="signin-address" data-address>${escapeHtml(input.address)}</code>
            <button type="button" class="button button-secondary" data-copy-target="[data-address]" data-copied-label="${escapeHtml(input.copiedLabel)}" hidden>${escapeHtml(input.copyLabel)}</button>
          </div>
          <p class="signin-status" data-status-message data-state="${escapeHtml(input.initialStatusState)}" role="status" aria-live="polite">${escapeHtml(input.initialStatus)}</p>
        </div>
        <div class="consent-actions">
          ${cancelForm}
          <form class="signin-continue" data-continue-form action="${escapeHtml(input.action)}" method="post">
            <button class="button" type="submit">${escapeHtml(input.continueLabel)}</button>
          </form>
        </div>
        <noscript><p class="field-hint">${escapeHtml(input.noJavaScript)}</p></noscript>
        ${securityNote}
      </section>
    </main>
    <footer class="signin-footer">${escapeHtml(input.footer)}</footer>
  </body>
</html>`;
}
