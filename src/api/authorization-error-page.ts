import type { Configuration } from 'oidc-provider';

import { english } from '../locales/en.js';
import { escapeHtml } from './html.js';
import { renderPageDocument } from './ui/document.js';

export type AuthorizationErrorRenderer = NonNullable<Configuration['renderError']>;

export const renderAuthorizationError: AuthorizationErrorRenderer = (context, output): void => {
  const strings = english.authorizationError;
  context.set('cache-control', 'no-store');
  context.set(
    'content-security-policy',
    "default-src 'none'; base-uri 'none'; font-src 'self'; frame-ancestors 'none'; img-src 'self'; manifest-src 'self'; style-src 'self'",
  );
  context.set('referrer-policy', 'no-referrer');
  context.set('x-content-type-options', 'nosniff');
  context.set('x-frame-options', 'DENY');
  context.type = 'html';
  context.body = renderPageDocument({
    content: `      <h1>${escapeHtml(strings.heading)}</h1>
      <p class="lead">${escapeHtml(strings.message)}</p>
      <p class="field-hint">${escapeHtml(strings.codeLabel)}: <code>${escapeHtml(output.error)}</code></p>`,
    footer: [strings.footer],
    header: { brand: english.interaction.brand },
    layout: 'narrow',
    mainClass: 'page-column signin signin-compact',
    stylesheet: '/assets/interaction.css',
    title: strings.title,
  });
};
