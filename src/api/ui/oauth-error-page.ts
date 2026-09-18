import { escapeHtml } from '../html.js';
import { renderPageDocument } from './document.js';

export type OAuthErrorAction =
  | { readonly kind: 'back'; readonly label: string }
  | { readonly href: string; readonly kind: 'link'; readonly label: string };

export interface OAuthErrorPageInput {
  readonly action?: OAuthErrorAction;
  readonly brand: string;
  readonly detail?: { readonly label: string; readonly value: string };
  readonly footer: string;
  readonly heading: string;
  readonly lead: string;
  readonly title: string;
}

export function renderOAuthErrorPage(input: OAuthErrorPageInput): string {
  const detail =
    input.detail === undefined
      ? ''
      : `
          <p class="field-hint">${escapeHtml(input.detail.label)}: <code>${escapeHtml(input.detail.value)}</code></p>`;
  const action = renderAction(input.action);

  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="oauth-error-heading">
        <div class="consent-title">
          <h1 id="oauth-error-heading">${escapeHtml(input.heading)}</h1>
          <p class="lead">${escapeHtml(input.lead)}</p>${detail}
        </div>${action}
      </section>`,
    footer: [input.footer],
    header: { brand: input.brand },
    layout: 'narrow',
    mainClass: 'page-column signin signin-compact',
    ...(input.action?.kind === 'back' ? { script: '/assets/interaction.js' } : {}),
    stylesheet: '/assets/interaction.css',
    title: input.title,
  });
}

function renderAction(action: OAuthErrorAction | undefined): string {
  if (action === undefined) {
    return '';
  }
  const control =
    action.kind === 'back'
      ? `<button type="button" class="button button-secondary" data-go-back hidden>${escapeHtml(action.label)}</button>`
      : `<a class="button button-secondary" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
  return `
        <div class="consent-actions">
          ${control}
        </div>`;
}
