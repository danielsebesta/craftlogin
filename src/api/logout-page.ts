import { english } from '../locales/en.js';
import type { LogoutSourceRenderer, PostLogoutSuccessRenderer } from '../oauth/provider.js';
import { escapeHtml } from './html.js';
import { PAGE_CONTENT_SECURITY_POLICY } from './page-csp.js';

export const renderLogoutPage: LogoutSourceRenderer = (context, form): void => {
  const strings = english.logout;
  setPageHeaders(context);
  context.type = 'html';
  context.body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="#131714">
    <title>${escapeHtml(strings.title)}</title>
    <link rel="stylesheet" href="/assets/interaction.css">
  </head>
  <body class="page-surface">
    <a class="skip-link" href="#main">${escapeHtml(english.common.skipToContent)}</a>
    <header class="signin-header">
      <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(english.interaction.brand)}</span>
    </header>
    <main id="main" class="signin">
      <div class="signin-intro">
        <h1 id="logout-heading">${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.body)}</p>
      </div>
      <section class="signin-action">
        ${form}
        <div class="button-row">
          <button class="button" type="submit" form="op.logoutForm" name="logout" value="yes">${escapeHtml(strings.confirm)}</button>
          <button class="button button-secondary" type="submit" form="op.logoutForm">${escapeHtml(strings.decline)}</button>
        </div>
      </section>
    </main>
    <footer class="signin-footer">${escapeHtml(english.interaction.footer)}</footer>
  </body>
</html>`;
};

export const renderLogoutSuccessPage: PostLogoutSuccessRenderer = (context): void => {
  const strings = english.logoutSuccess;
  setPageHeaders(context);
  context.type = 'html';
  context.body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="theme-color" content="#131714">
    <title>${escapeHtml(strings.title)}</title>
    <link rel="stylesheet" href="/assets/interaction.css">
  </head>
  <body class="page-surface">
    <a class="skip-link" href="#main">${escapeHtml(english.common.skipToContent)}</a>
    <header class="signin-header">
      <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(english.interaction.brand)}</span>
    </header>
    <main id="main" class="signin">
      <div class="signin-intro">
        <h1 id="logout-success-heading">${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.body)}</p>
      </div>
      <section class="signin-action">
        <div class="button-row">
          <a class="button button-secondary" href="/">${escapeHtml(strings.returnAction)}</a>
        </div>
      </section>
    </main>
    <footer class="signin-footer">${escapeHtml(english.interaction.footer)}</footer>
  </body>
</html>`;
};

function setPageHeaders(context: Parameters<LogoutSourceRenderer>[0]): void {
  context.set('cache-control', 'no-store');
  context.set('content-security-policy', PAGE_CONTENT_SECURITY_POLICY);
  context.set('referrer-policy', 'no-referrer');
  context.set('x-content-type-options', 'nosniff');
  context.set('x-frame-options', 'DENY');
}
