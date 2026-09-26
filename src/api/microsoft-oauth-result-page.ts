import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon, renderMicrosoftIcon } from './ui/icons.js';

interface MicrosoftOAuthFailurePageInput {
  readonly interactionId: string;
  readonly kind: 'ownership-required';
  readonly homeUrl: string;
}

interface MicrosoftOAuthUnavailablePageInput {
  readonly interactionId: string;
  readonly kind: 'temporarily-unavailable';
  readonly homeUrl: string;
}

interface MicrosoftOAuthRejectedPageInput {
  readonly interactionId: string;
  readonly kind: 'rejected';
  readonly homeUrl: string;
}

interface MicrosoftOAuthExpiredPageInput {
  readonly kind: 'expired';
  readonly homeUrl?: string;
}

export type MicrosoftOAuthResultPageInput =
  | MicrosoftOAuthFailurePageInput
  | MicrosoftOAuthUnavailablePageInput
  | MicrosoftOAuthRejectedPageInput
  | MicrosoftOAuthExpiredPageInput;

export function renderMicrosoftOAuthResultPage(input: MicrosoftOAuthResultPageInput): string {
  const strings = english.interaction.microsoft;
  const interactionId = input.kind === 'expired' ? undefined : input.interactionId;
  const interactionPath =
    interactionId === undefined ? undefined : `/interaction/${encodeURIComponent(interactionId)}`;
  const homeUrl = input.homeUrl ?? '/';
  const action = renderAction(input, interactionPath, homeUrl);
  const heading = renderHeading(input);
  const lead = renderLead(input);
  const title = renderTitle(input);

  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="microsoft-result-heading">
        <div class="consent-title">
          <h1 class="icon-heading" id="microsoft-result-heading">${renderIcon('warning', 'heading-icon')}${escapeHtml(heading)}</h1>
          <p class="lead">${escapeHtml(lead)}</p>
        </div>
        <div class="consent-actions">${action}
        </div>
        <p class="field-hint icon-note">${renderIcon('lock', 'list-icon')}<span>${escapeHtml(strings.privacyNote)}</span></p>
      </section>`,
    footer: [english.interaction.footer],
    header: { brand: english.interaction.brand },
    layout: 'narrow',
    mainClass: 'page-column signin',
    stylesheet: '/assets/interaction.css',
    title,
  });
}

function renderAction(
  input: MicrosoftOAuthResultPageInput,
  interactionPath: string | undefined,
  homeUrl: string,
): string {
  const strings = english.interaction.microsoft;
  if (input.kind !== 'expired' && interactionPath !== undefined) {
    return `
        <a class="button" href="${interactionPath}/microsoft/start">${renderMicrosoftIcon('button-icon')}${escapeHtml(strings.retryButton)}</a>
        <a class="button button-secondary" href="${escapeHtml(homeUrl)}">${renderIcon('gamepad', 'button-icon')}${escapeHtml(strings.otherMethodButton)}</a>`;
  }
  if (input.kind === 'expired' && interactionPath === undefined) {
    return `
        <a class="button" href="/">${renderIcon('home', 'button-icon')}${escapeHtml(strings.homeButton)}</a>`;
  }
  return `
        <a class="button button-secondary" href="${escapeHtml(homeUrl)}">${renderIcon('gamepad', 'button-icon')}${escapeHtml(strings.otherMethodButton)}</a>`;
}

function renderHeading(input: MicrosoftOAuthResultPageInput): string {
  const strings = english.interaction.microsoft;
  switch (input.kind) {
    case 'ownership-required':
      return strings.ownershipHeading;
    case 'temporarily-unavailable':
      return strings.unavailableHeading;
    case 'rejected':
      return strings.rejectedHeading;
    case 'expired':
      return strings.expiredHeading;
  }
}

function renderLead(input: MicrosoftOAuthResultPageInput): string {
  const strings = english.interaction.microsoft;
  switch (input.kind) {
    case 'ownership-required':
      return strings.ownershipLead;
    case 'temporarily-unavailable':
      return english.api.errors.microsoftSignInUnavailable;
    case 'rejected':
      return english.api.errors.microsoftSignInRejected;
    case 'expired':
      return english.api.errors.microsoftStateInvalid;
  }
}

function renderTitle(input: MicrosoftOAuthResultPageInput): string {
  const strings = english.interaction.microsoft;
  switch (input.kind) {
    case 'ownership-required':
      return strings.ownershipTitle;
    case 'temporarily-unavailable':
      return strings.unavailableTitle;
    case 'rejected':
      return strings.rejectedTitle;
    case 'expired':
      return strings.expiredTitle;
  }
}
