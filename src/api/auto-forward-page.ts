import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon } from './ui/icons.js';

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
  // Callers already pass provider-validated targets (a registered https
  // redirect URI or an issuer-origin returnTo); the scheme check is a second
  // line so a javascript:/data: URL can never become a clickable or
  // meta-refresh navigation if a future caller misuses the page.
  const parsed = URL.parse(targetUrl);
  const safeTarget =
    targetUrl.startsWith('/') && !targetUrl.startsWith('//')
      ? targetUrl
      : parsed !== null && (parsed.protocol === 'https:' || parsed.protocol === 'http:')
        ? targetUrl
        : '/';
  return renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="forward-heading">
        <h1 class="icon-heading" id="forward-heading">${renderIcon('login', 'heading-icon')}${escapeHtml(strings.forwardHeading)}</h1>
        <p class="lead">${escapeHtml(strings.forwardHint)}</p>
        <div class="consent-actions">
          <a class="button" href="${escapeHtml(safeTarget)}">${renderIcon('login', 'button-icon')}${escapeHtml(strings.forwardAction)}</a>
        </div>
      </section>`,
    footer: [strings.footer],
    headExtra: `<meta http-equiv="refresh" content="0;url=${escapeHtml(safeTarget)}">`,
    header: { brand: strings.brand },
    layout: 'narrow',
    mainClass: 'page-column signin',
    stylesheet: '/assets/interaction.css',
    title: strings.forwardTitle,
  });
}
