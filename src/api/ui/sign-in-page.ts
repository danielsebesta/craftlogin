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

export interface SignInVerification {
  readonly address?: string;
  readonly addressLabel?: string;
  readonly initialStatus: string;
  readonly initialStatusState: string;
  readonly statusUrl: string;
  readonly steps?: readonly string[];
  readonly stepsHeading?: string;
}

export interface SignInSkinVerification {
  readonly accountLabel: string;
  readonly accountPlaceholder: string;
  readonly challenge?: {
    readonly downloadLabel: string;
    readonly downloadUrl: string;
    readonly format: string;
    readonly model: string;
    readonly steps: readonly string[];
    readonly username: string;
    readonly verificationFor: string;
  };
  readonly heading: string;
  readonly hint: string;
  readonly startAction: string;
  readonly startLabel: string;
}

export interface SignInPageInput {
  readonly action: string;
  readonly address?: string;
  readonly addressLabel?: string;
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
  readonly initialStatus?: string;
  readonly initialStatusState?: string;
  readonly lead: string;
  readonly messages: SignInMessages;
  readonly noJavaScript: string;
  readonly permissions: readonly ConsentPermission[];
  readonly securityNote?: string;
  readonly skipLabel: string;
  readonly statusUrl?: string;
  readonly steps?: readonly string[];
  readonly stepsHeading?: string;
  readonly verification?: SignInVerification;
  readonly accountName?: string;
  readonly accountAvatarUrl?: string;
  readonly switchAccount?: SignInCancel;
  readonly skinVerification?: SignInSkinVerification;
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
  const switchAccountForm =
    input.switchAccount === undefined
      ? ''
      : `<form action="${escapeHtml(input.switchAccount.action)}" method="post">
          <button class="button button-secondary" type="submit">${escapeHtml(input.switchAccount.label)}</button>
        </form>`;
  const verification =
    input.verification ??
    (input.address !== undefined &&
    input.addressLabel !== undefined &&
    input.initialStatus !== undefined &&
    input.initialStatusState !== undefined &&
    input.statusUrl !== undefined &&
    input.steps !== undefined &&
    input.stepsHeading !== undefined
      ? {
          address: input.address,
          addressLabel: input.addressLabel,
          initialStatus: input.initialStatus,
          initialStatusState: input.initialStatusState,
          statusUrl: input.statusUrl,
          steps: input.steps,
          stepsHeading: input.stepsHeading,
        }
      : undefined);
  const verificationMarkup =
    verification === undefined
      ? ''
      : `
        <div class="consent-verify">
          ${
            verification.stepsHeading === undefined || verification.steps === undefined
              ? ''
              : `<h2>${escapeHtml(verification.stepsHeading)}</h2>
          <ol class="steps">
            ${verification.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n            ')}
          </ol>`
          }
          ${
            verification.addressLabel === undefined || verification.address === undefined
              ? ''
              : `<h2 id="address-heading">${escapeHtml(verification.addressLabel)}</h2>
          <div class="signin-address-row">
            <code class="signin-address" data-address>${escapeHtml(verification.address)}</code>
            <button type="button" class="button button-secondary" data-copy-target="[data-address]" data-copied-label="${escapeHtml(input.copiedLabel)}" hidden>${escapeHtml(input.copyLabel)}</button>
          </div>`
          }
          <p class="signin-status" data-status-message data-state="${escapeHtml(verification.initialStatusState)}" role="status" aria-live="polite">${escapeHtml(verification.initialStatus)}</p>
        </div>`;
  const verificationRootAttributes =
    verification === undefined
      ? ''
      : ` data-verification data-status-url="${escapeHtml(verification.statusUrl)}" data-maximum-attempts="${MAXIMUM_POLL_ATTEMPTS.toString()}"
      data-pending-message="${escapeHtml(input.messages.pending)}" data-verified-message="${escapeHtml(input.messages.verified)}"
      data-expired-message="${escapeHtml(input.messages.expired)}" data-network-message="${escapeHtml(input.messages.networkError)}"
      data-stopped-message="${escapeHtml(input.messages.stopped)}"`;
  const skinVerificationMarkup = renderSkinVerification(input.skinVerification);

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
      class="signin${verification === undefined && input.skinVerification === undefined ? ' consent-only' : ''}"
      ${verificationRootAttributes}
    >
      <section class="card consent-card" aria-labelledby="${SIGN_IN_HEADING_ID}">
        <div class="consent-identity">
          <div class="consent-avatars" aria-hidden="true">
            <span class="consent-avatar"><img src="/assets/app-avatar.jpg" alt="" width="740" height="740"></span>
            ${input.accountAvatarUrl === undefined ? '' : `<span class="consent-connector">•••</span><span class="consent-avatar consent-avatar-account"><img src="${escapeHtml(input.accountAvatarUrl)}" alt="" width="64" height="64"></span>`}
          </div>
          <div class="consent-title">
            <h1 id="${SIGN_IN_HEADING_ID}">${escapeHtml(input.heading)}${headingSuffix}</h1>
          <p class="lead">${escapeHtml(input.lead)}${input.accountName === undefined ? '' : ` <bdi>${escapeHtml(input.accountName)}</bdi>`}</p>
          </div>
        </div>
        <div class="consent-scopes">
          <h2>${escapeHtml(input.allowsHeading)}</h2>
          <ul>
            ${input.permissions.map(renderPermission).join('\n            ')}
          </ul>
        </div>
        ${verificationMarkup}
        ${skinVerificationMarkup}
        <div class="consent-actions">
          ${cancelForm}
          ${switchAccountForm}
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

function renderSkinVerification(input: SignInSkinVerification | undefined): string {
  if (input === undefined) {
    return '';
  }
  const challenge = input.challenge;
  return `<section class="skin-verification" aria-labelledby="skin-verification-heading">
    <h2 id="skin-verification-heading">${escapeHtml(input.heading)}</h2>
    <p class="field-hint">${escapeHtml(input.hint)}</p>
    ${
      challenge === undefined
        ? `<form class="skin-start-form" action="${escapeHtml(input.startAction)}" method="post">
      <label for="skin-username">${escapeHtml(input.accountLabel)}</label>
      <div class="skin-start-controls">
        <input id="skin-username" name="username" type="text" minlength="3" maxlength="16" pattern="[A-Za-z0-9_]+" placeholder="${escapeHtml(input.accountPlaceholder)}" autocomplete="username" required>
        <button class="button button-secondary" type="submit">${escapeHtml(input.startLabel)}</button>
      </div>
    </form>`
        : `<p>${escapeHtml(challenge.verificationFor)} <strong><bdi>${escapeHtml(challenge.username)}</bdi></strong> · ${escapeHtml(challenge.format)} · ${escapeHtml(challenge.model)}</p>
    <ol class="steps">
      ${challenge.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n      ')}
    </ol>
    <a class="button button-secondary skin-download" href="${escapeHtml(challenge.downloadUrl)}" download>${escapeHtml(challenge.downloadLabel)}</a>`
    }
  </section>`;
}
