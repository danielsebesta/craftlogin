import type { Configuration } from 'oidc-provider';

import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';

export type AuthorizationErrorRenderer = NonNullable<Configuration['renderError']>;

export const renderAuthorizationError: AuthorizationErrorRenderer = (context, output): void => {
  const strings = english.authorizationError;
  context.set('cache-control', 'no-store');
  context.set(
    'content-security-policy',
    "default-src 'none'; base-uri 'none'; font-src 'self'; frame-ancestors 'none'; style-src 'self'",
  );
  context.set('referrer-policy', 'no-referrer');
  context.set('x-content-type-options', 'nosniff');
  context.set('x-frame-options', 'DENY');
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
  <body class="surface-grid">
    <a class="skip-link" href="#main">${escapeHtml(english.common.skipToContent)}</a>
    <header class="signin-header">
      <span class="brand"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(english.interaction.brand)}</span>
    </header>
    <main id="main" class="signin">
      <div class="signin-intro">
        <h1 id="error-heading">${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.message)}</p>
        <p class="field-hint">${escapeHtml(strings.codeLabel)}: <code>${escapeHtml(output.error)}</code></p>
      </div>
    </main>
    <footer class="signin-footer">${escapeHtml(strings.footer)}</footer>
  </body>
</html>`;
};
