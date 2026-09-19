import { english } from '../locales/en.js';
import type { LogoutSourceRenderer, PostLogoutSuccessRenderer } from '../oauth/provider.js';
import { escapeHtml } from './html.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';
import { renderPageDocument } from './ui/document.js';
import { renderIcon } from './ui/icons.js';

export const renderLogoutPage: LogoutSourceRenderer = (context, form): void => {
  const strings = english.logout;
  setPageHeaders(context);
  context.type = 'html';
  context.body = renderPageDocument({
    content: `      <div class="signin-intro">
        <h1 class="icon-heading">${renderIcon('logout', 'heading-icon')}${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.body)}</p>
      </div>
      <section class="signin-action">
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
};

export const renderLogoutSuccessPage: PostLogoutSuccessRenderer = (context): void => {
  const strings = english.logoutSuccess;
  setPageHeaders(context);
  context.type = 'html';
  context.body = renderPageDocument({
    content: `      <div class="signin-intro">
        <h1 class="icon-heading">${renderIcon('check', 'heading-icon')}${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.body)}</p>
      </div>
      <section class="signin-action">
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
};

function setPageHeaders(context: Parameters<LogoutSourceRenderer>[0]): void {
  context.set('cache-control', 'no-store');
  context.set('content-security-policy', PAGE_CONTENT_SECURITY_POLICY);
  context.set('referrer-policy', 'no-referrer');
  context.set('x-content-type-options', 'nosniff');
  context.set('x-frame-options', 'DENY');
}
