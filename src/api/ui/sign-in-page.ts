import { escapeHtml } from '../html.js';
import { renderPageDocument } from './document.js';

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
  readonly method?: 'online' | 'skin';
  readonly steps?: readonly string[];
  readonly stepsHeading?: string;
}

export interface SignInSkinChallenge {
  readonly downloadLabel: string;
  readonly downloadUrl: string;
  readonly originalDownloadLabel: string;
  readonly originalDownloadUrl: string;
  readonly changeSkinLabel: string;
  readonly changeSkinUrl: string;
  readonly format: string;
  readonly formatLabel: string;
  readonly model: string;
  readonly modelLabel: string;
  readonly steps: readonly string[];
  readonly username: string;
  readonly usernameLabel: string;
}

export interface SignInSkinVerification {
  readonly accountLabel: string;
  readonly accountPlaceholder: string;
  readonly challenge?: SignInSkinChallenge;
  readonly error?: string;
  readonly heading: string;
  readonly hint: string;
  readonly lookupFoundMessage?: string;
  readonly lookupNotFoundMessage?: string;
  readonly lookupSkinMessage?: string;
  readonly lookupUnavailableMessage?: string;
  readonly lookupUrl?: string;
  readonly status?: SignInVerification;
  readonly statusMessages?: SignInMessages;
  readonly startAction: string;
  readonly startLabel: string;
}

export interface SignInMicrosoftVerification {
  readonly error?: string;
  readonly heading: string;
  readonly hint: string;
  readonly startAction: string;
  readonly startLabel: string;
}

export interface SignInPageInput {
  readonly accountAvatarUrl?: string;
  readonly accountLabel: string;
  readonly accountName?: string;
  readonly action: string;
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
  readonly lead: string;
  readonly messages: SignInMessages;
  readonly methodChoices?: readonly {
    readonly detail: string;
    readonly id: string;
    readonly label: string;
  }[];
  readonly methodHeading?: string;
  readonly microsoftVerification?: SignInMicrosoftVerification;
  readonly noJavaScript: string;
  readonly permissions: readonly ConsentPermission[];
  readonly securityNote?: string;
  readonly selectedMethod?: string;
  readonly skinVerification?: SignInSkinVerification;
  readonly switchAccount?: SignInCancel;
  readonly verification?: SignInVerification;
}

function renderPermission(permission: ConsentPermission): string {
  if (permission.kind === 'code') {
    return `<li><span class="consent-check" aria-hidden="true">✓</span><code>${escapeHtml(permission.code)}</code></li>`;
  }
  return `<li><span class="consent-check" aria-hidden="true">✓</span><span>${escapeHtml(permission.text)}</span></li>`;
}

function renderFormAction(cancel: SignInCancel | undefined, className?: string): string {
  if (cancel === undefined) {
    return '';
  }
  const classAttribute = className === undefined ? '' : ` class="${className}"`;
  return `
          <form${classAttribute} action="${escapeHtml(cancel.action)}" method="post">
            <button class="button button-secondary" type="submit">${escapeHtml(cancel.label)}</button>
          </form>`;
}

function renderAccountChip(input: SignInPageInput): string {
  if (input.accountName === undefined) {
    return '';
  }
  const avatar =
    input.accountAvatarUrl === undefined
      ? ''
      : `<img class="account-chip-avatar" src="${escapeHtml(input.accountAvatarUrl)}" alt="" width="32" height="32" decoding="async">`;
  return `
          <p class="account-chip">${avatar}<span><span class="visually-hidden">${escapeHtml(input.accountLabel)} </span><span class="account-chip-name">${escapeHtml(input.accountName)}</span></span></p>`;
}

function renderVerification(input: SignInPageInput): string {
  const verification = input.verification;
  if (verification === undefined) {
    return '';
  }
  const steps =
    verification.stepsHeading === undefined || verification.steps === undefined
      ? ''
      : `
          <h2>${escapeHtml(verification.stepsHeading)}</h2>
          <ol class="steps">
            ${verification.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n            ')}
          </ol>`;
  const address =
    verification.addressLabel === undefined || verification.address === undefined
      ? ''
      : `
          <h2 id="address-heading">${escapeHtml(verification.addressLabel)}</h2>
          <div class="signin-address-row">
            <code class="signin-address" data-address>${escapeHtml(verification.address)}</code>
            <button type="button" class="button button-secondary" data-copy-target="[data-address]" data-copied-label="${escapeHtml(input.copiedLabel)}" hidden>${escapeHtml(input.copyLabel)}</button>
          </div>`;

  return `
        <div class="consent-verify" data-method-panel="${verification.method ?? 'online'}" data-verification data-status-url="${escapeHtml(verification.statusUrl)}" data-maximum-attempts="${MAXIMUM_POLL_ATTEMPTS.toString()}"
          data-pending-message="${escapeHtml(input.messages.pending)}" data-verified-message="${escapeHtml(input.messages.verified)}"
          data-expired-message="${escapeHtml(input.messages.expired)}" data-network-message="${escapeHtml(input.messages.networkError)}"
          data-stopped-message="${escapeHtml(input.messages.stopped)}">${steps}${address}
          <p class="signin-status" data-status-message data-state="${escapeHtml(verification.initialStatusState)}" role="status" aria-live="polite">${escapeHtml(verification.initialStatus)}</p>
        </div>`;
}

function renderMethodChooser(input: SignInPageInput): string {
  if (input.methodChoices === undefined || input.methodChoices.length < 2) {
    return '';
  }
  return `
        <fieldset class="method-picker" data-method-picker>
          <legend>${escapeHtml(input.methodHeading ?? '')}</legend>
          <div class="method-options">
            ${input.methodChoices
              .map(
                (choice): string => `
            <label class="method-option">
              <input type="radio" name="verification-method" value="${escapeHtml(choice.id)}" data-method-choice${input.selectedMethod === choice.id ? ' checked' : ''}>
              <span><strong>${escapeHtml(choice.label)}</strong><small>${escapeHtml(choice.detail)}</small></span>
            </label>`,
              )
              .join('')}
          </div>
        </fieldset>`;
}

function renderSkinVerification(input: SignInSkinVerification | undefined): string {
  if (input === undefined) {
    return '';
  }
  const challenge = input.challenge;
  const challengeMarkup =
    challenge === undefined
      ? `
          <form class="field" action="${escapeHtml(input.startAction)}" method="post" data-skin-lookup${input.lookupUrl === undefined ? '' : ` data-lookup-url="${escapeHtml(input.lookupUrl)}"`} data-lookup-found-message="${escapeHtml(input.lookupFoundMessage ?? '')}" data-lookup-not-found-message="${escapeHtml(input.lookupNotFoundMessage ?? '')}" data-lookup-skin-message="${escapeHtml(input.lookupSkinMessage ?? '')}" data-lookup-unavailable-message="${escapeHtml(input.lookupUnavailableMessage ?? '')}">
            <label for="skin-username">${escapeHtml(input.accountLabel)}</label>
            <div class="skin-start-controls">
              <input id="skin-username" name="username" type="text" minlength="3" maxlength="16" pattern="[A-Za-z0-9_]+" placeholder="${escapeHtml(input.accountPlaceholder)}" autocomplete="username" required data-skin-username>
              <button class="button button-secondary" type="submit" data-skin-start>${escapeHtml(input.startLabel)}</button>
            </div>
            <p class="field-hint" data-skin-lookup-status role="status" aria-live="polite"></p>
          </form>`
      : `
          <dl class="summary-list">
            <div>
              <dt>${escapeHtml(challenge.usernameLabel)}</dt>
              <dd><bdi>${escapeHtml(challenge.username)}</bdi></dd>
            </div>
            <div>
              <dt>${escapeHtml(challenge.formatLabel)}</dt>
              <dd>${escapeHtml(challenge.format)}</dd>
            </div>
            <div>
              <dt>${escapeHtml(challenge.modelLabel)}</dt>
              <dd>${escapeHtml(challenge.model)}</dd>
            </div>
          </dl>
          <ol class="steps">
            ${challenge.steps.map((step): string => `<li>${escapeHtml(step)}</li>`).join('\n            ')}
          </ol>
          <div class="skin-actions">
            <a class="button button-secondary" href="${escapeHtml(challenge.originalDownloadUrl)}" download>${escapeHtml(challenge.originalDownloadLabel)}</a>
            <a class="button button-secondary" href="${escapeHtml(challenge.downloadUrl)}" download>${escapeHtml(challenge.downloadLabel)}</a>
            <a class="button button-secondary" href="${escapeHtml(challenge.changeSkinUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(challenge.changeSkinLabel)}</a>
          </div>`;

  return `
        <section class="skin-verification" data-method-panel="skin" aria-labelledby="skin-verification-heading">
          <h2 id="skin-verification-heading">${escapeHtml(input.heading)}</h2>
          <p class="field-hint">${escapeHtml(input.hint)}</p>
          ${input.error === undefined ? '' : `<p class="notice notice-error" role="alert">${escapeHtml(input.error)}</p>`}${challengeMarkup}${input.status === undefined ? '' : renderVerificationStatus(input.status, input.statusMessages)}
        </section>`;
}

function renderVerificationStatus(
  verification: SignInVerification,
  messages: SignInMessages | undefined,
): string {
  const fallback = messages ?? {
    expired: verification.initialStatus,
    networkError: verification.initialStatus,
    pending: verification.initialStatus,
    stopped: verification.initialStatus,
    verified: verification.initialStatus,
  };
  return `<div class="signin-status" data-verification data-status-url="${escapeHtml(verification.statusUrl)}" data-maximum-attempts="${MAXIMUM_POLL_ATTEMPTS.toString()}" data-pending-message="${escapeHtml(fallback.pending)}" data-verified-message="${escapeHtml(fallback.verified)}" data-expired-message="${escapeHtml(fallback.expired)}" data-network-message="${escapeHtml(fallback.networkError)}" data-stopped-message="${escapeHtml(fallback.stopped)}" data-state="${escapeHtml(verification.initialStatusState)}" role="status" aria-live="polite"><span data-status-message>${escapeHtml(verification.initialStatus)}</span></div>`;
}

function renderMicrosoftVerification(input: SignInMicrosoftVerification | undefined): string {
  if (input === undefined) {
    return '';
  }
  return `
        <section class="microsoft-verification" data-method-panel="microsoft" aria-labelledby="microsoft-verification-heading">
          <h2 id="microsoft-verification-heading">${escapeHtml(input.heading)}</h2>
          <p class="field-hint">${escapeHtml(input.hint)}</p>
          ${input.error === undefined ? '' : `<p class="notice notice-error" role="alert">${escapeHtml(input.error)}</p>`}
          <a class="button button-secondary" href="${escapeHtml(input.startAction)}">${escapeHtml(input.startLabel)}</a>
        </section>`;
}

export function renderSignInPage(input: SignInPageInput): string {
  const headingSuffix =
    input.appName === undefined ? '' : ` <bdi>${escapeHtml(input.appName)}</bdi>`;
  const securityNote =
    input.securityNote === undefined
      ? ''
      : `<p class="field-hint">${escapeHtml(input.securityNote)}</p>`;
  const singular =
    input.verification === undefined &&
    input.skinVerification === undefined &&
    input.microsoftVerification === undefined;

  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="${SIGN_IN_HEADING_ID}">
        <div class="consent-identity">
          <div class="consent-title">
            <h1 id="${SIGN_IN_HEADING_ID}">${escapeHtml(input.heading)}${headingSuffix}</h1>
            <p class="lead">${escapeHtml(input.lead)}</p>
          </div>${renderAccountChip(input)}
        </div>
        <div class="consent-scopes">
          <h2>${escapeHtml(input.allowsHeading)}</h2>
          <ul>
            ${input.permissions.map(renderPermission).join('\n            ')}
          </ul>
        </div>${renderMethodChooser(input)}${renderVerification(input)}${renderMicrosoftVerification(input.microsoftVerification)}${renderSkinVerification(input.skinVerification)}
        <div class="consent-actions">${renderFormAction(input.cancel)}${renderFormAction(input.switchAccount)}
          <form class="signin-continue" data-continue-form action="${escapeHtml(input.action)}" method="post">
            <button class="button" type="submit">${escapeHtml(input.continueLabel)}</button>
          </form>
        </div>
        <noscript><p class="field-hint">${escapeHtml(input.noJavaScript)}</p></noscript>
        ${securityNote}
      </section>`,
    footer: [input.footer],
    header: { brand: input.brand },
    layout: 'narrow',
    ...(input.methodChoices === undefined ? {} : { mainAttributes: ' data-methods' }),
    mainClass: `page-column signin${singular ? ' signin-compact' : ''}`,
    script: '/assets/interaction.js',
    stylesheet: '/assets/interaction.css',
    title: input.documentTitle,
  });
}
