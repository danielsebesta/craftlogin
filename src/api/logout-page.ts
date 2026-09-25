import { english } from '../locales/en.js';
import type { LogoutSourceRenderer, PostLogoutSuccessRenderer } from '../oauth/provider.js';
import { escapeHtml } from './html.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon } from './ui/icons.js';

type LogoutPageContext = Pick<Parameters<LogoutSourceRenderer>[0], 'body' | 'set' | 'type'>;

export const renderLogoutPage = ((context: LogoutPageContext, form: string): void => {
  const strings = english.logout;
  setPageHeaders(context);
  context.type = 'html';
  context.body = renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="logout-heading">
        <div class="consent-title">
          <h1 class="icon-heading" id="logout-heading">${renderIcon('logout', 'heading-icon')}${escapeHtml(strings.heading)}</h1>
          <p class="lead">${escapeHtml(strings.body)}</p>
        </div>
        ${form}
        <div class="button-row">
          <button class="button" type="submit" form="op.logoutForm" name="logout" value="yes">${renderIcon('logout', 'button-icon')}${escapeHtml(strings.confirm)}</button>
          <button class="button button-secondary" type="submit" form="op.logoutForm">${renderIcon('refresh', 'button-icon')}${escapeHtml(strings.decline)}</button>
        </div>
      </section>`,
    footer: [english.interaction.footer],
    header: { brand: english.interaction.brand },
    layout: 'narrow',
    mainClass: 'page-column signin',
    stylesheet: '/assets/interaction.css',
    title: strings.title,
  });
}) satisfies LogoutSourceRenderer;

export const renderLogoutSuccessPage = ((context: LogoutPageContext): void => {
  const strings = english.logoutSuccess;
  setPageHeaders(context);
  context.type = 'html';
  context.body = renderPageDocument({
    content: `      <section class="card consent-card" aria-labelledby="logout-success-heading">
        <div class="consent-title">
          <h1 class="icon-heading" id="logout-success-heading">${renderIcon('check', 'heading-icon')}${escapeHtml(strings.heading)}</h1>
          <p class="lead">${escapeHtml(strings.body)}</p>
        </div>
        <div class="button-row">
          <a class="button button-secondary" href="/">${renderIcon('home', 'button-icon')}${escapeHtml(strings.returnAction)}</a>
        </div>
      </section>`,
    footer: [english.interaction.footer],
    header: { brand: english.interaction.brand },
    layout: 'narrow',
    mainClass: 'page-column signin',
    stylesheet: '/assets/interaction.css',
    title: strings.title,
  });
}) satisfies PostLogoutSuccessRenderer;

function setPageHeaders(context: LogoutPageContext): void {
  context.set('cache-control', 'no-store');
  context.set('content-security-policy', PAGE_CONTENT_SECURITY_POLICY);
  context.set('referrer-policy', 'no-referrer');
  context.set('x-content-type-options', 'nosniff');
  context.set('x-frame-options', 'DENY');
}
