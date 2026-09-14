import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';

/**
 * Same-origin hand-off page after a form POST whose destination may be
 * cross-origin (the OAuth client or the Microsoft authorize endpoint). A direct
 * 303 to such a target would be blocked by form-action, while Chromium enforces
 * it on the redirect and reports the original form target. A meta refresh starts
 * a fresh non-form navigation instead, which form-action does not restrict; the
 * manual link covers browsers without refresh support.
 */
export function renderAutoForwardPage(targetUrl: string): string {
  const strings = english.interaction;
  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="forward-heading">
        <h1 id="forward-heading">${escapeHtml(strings.forwardHeading)}</h1>
        <p class="lead">${escapeHtml(strings.forwardHint)}</p>
        <div class="consent-actions">
          <a class="button" href="${escapeHtml(targetUrl)}">${escapeHtml(strings.forwardAction)}</a>
        </div>
      </section>`,
    footer: [strings.footer],
    headExtra: `<meta http-equiv="refresh" content="0;url=${escapeHtml(targetUrl)}">`,
    header: { brand: strings.brand },
    layout: 'narrow',
    mainClass: 'page-column signin signin-compact',
    stylesheet: '/assets/interaction.css',
    title: strings.forwardTitle,
  });
}
