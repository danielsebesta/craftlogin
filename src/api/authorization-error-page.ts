import type { Configuration } from 'oidc-provider';

import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';

export type AuthorizationErrorRenderer = NonNullable<Configuration['renderError']>;

export const renderAuthorizationError: AuthorizationErrorRenderer = (context, output): void => {
  const strings = english.authorizationError;
  context.set('cache-control', 'no-store');
  context.set(
    'content-security-policy',
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'self'",
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
    <meta name="theme-color" content="#111814">
    <title>${escapeHtml(strings.title)}</title>
    <link rel="stylesheet" href="/assets/interaction.css">
  </head>
  <body>
    <header class="site-header">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span>${escapeHtml(english.interaction.brand)}</div>
    </header>
    <main class="error-shell">
      <article class="error-card" aria-labelledby="error-heading">
        <p class="eyebrow">${escapeHtml(strings.codeLabel)} · ${escapeHtml(output.error)}</p>
        <h1 id="error-heading">${escapeHtml(strings.heading)}</h1>
        <p class="lead">${escapeHtml(strings.message)}</p>
      </article>
    </main>
    <footer class="site-footer">${escapeHtml(strings.footer)}</footer>
  </body>
</html>`;
};
