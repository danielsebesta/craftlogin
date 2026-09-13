import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';

interface MicrosoftOAuthSuccessPageInput {
  readonly interactionId: string;
  readonly kind: 'success';
  readonly username: string;
}

interface MicrosoftOAuthFailurePageInput {
  readonly interactionId: string;
  readonly kind: 'ownership-required';
}

export type MicrosoftOAuthResultPageInput =
  MicrosoftOAuthSuccessPageInput | MicrosoftOAuthFailurePageInput;

export function renderMicrosoftOAuthResultPage(input: MicrosoftOAuthResultPageInput): string {
  const strings = english.interaction.microsoft;
  const interactionPath = `/interaction/${encodeURIComponent(input.interactionId)}`;
  const success = input.kind === 'success';
  const details = success
    ? `
        <dl class="summary-list">
          <div>
            <dt>${escapeHtml(strings.usernameLabel)}</dt>
            <dd><bdi>${escapeHtml(input.username)}</bdi></dd>
          </div>
          <div>
            <dt>${escapeHtml(strings.editionLabel)}</dt>
            <dd>${escapeHtml(strings.javaEdition)}</dd>
          </div>
        </dl>`
    : '';
  const action = success
    ? `
        <form action="${interactionPath}/complete" method="post">
          <button class="button" type="submit">${escapeHtml(strings.continueButton)}</button>
        </form>`
    : `
        <form action="${interactionPath}/microsoft/start" method="post">
          <button class="button" type="submit">${escapeHtml(strings.retryButton)}</button>
        </form>
        <a class="button button-secondary" href="${interactionPath}">${escapeHtml(strings.otherMethodButton)}</a>`;

  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="microsoft-result-heading">
        <div class="consent-title">
          <h1 id="microsoft-result-heading">${escapeHtml(success ? strings.successHeading : strings.ownershipHeading)}</h1>
          <p class="lead">${escapeHtml(success ? strings.successLead : strings.ownershipLead)}</p>
        </div>${details}
        <div class="consent-actions">${action}
        </div>
        <p class="field-hint">${escapeHtml(strings.privacyNote)}</p>
      </section>`,
    footer: [english.interaction.footer],
    header: { brand: english.interaction.brand },
    layout: 'narrow',
    mainClass: 'page-column signin signin-compact',
    stylesheet: '/assets/interaction.css',
    title: success ? strings.successTitle : strings.ownershipTitle,
  });
}
