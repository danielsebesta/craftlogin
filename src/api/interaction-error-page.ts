import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';

export type InteractionErrorKind = 'expired' | 'invalid';

export function renderInteractionErrorPage(kind: InteractionErrorKind): string {
  const interaction = english.interaction;
  const heading =
    kind === 'expired' ? interaction.expiredHeading : english.authorizationError.heading;
  const lead =
    kind === 'expired' ? english.api.errors.interactionExpired : english.authorizationError.message;

  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="interaction-error-heading">
        <div class="consent-title">
          <h1 id="interaction-error-heading">${escapeHtml(heading)}</h1>
          <p class="lead">${escapeHtml(lead)}</p>
        </div>
        <div class="consent-actions">
          <button type="button" class="button button-secondary" data-go-back hidden>${escapeHtml(interaction.goBack)}</button>
        </div>
        <noscript><p class="field-hint">${escapeHtml(interaction.noJavaScript)}</p></noscript>
      </section>`,
    footer: [interaction.footer],
    header: { brand: interaction.brand },
    layout: 'narrow',
    mainClass: 'page-column signin signin-compact',
    script: '/assets/interaction.js',
    stylesheet: '/assets/interaction.css',
    title: heading,
  });
}
