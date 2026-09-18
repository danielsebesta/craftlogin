import type { Configuration } from 'oidc-provider';

import { english } from '../locales/en.js';
import { renderOAuthErrorPage } from './ui/oauth-error-page.js';

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
  context.body = renderOAuthErrorPage({
    brand: english.interaction.brand,
    detail: { label: strings.codeLabel, value: output.error },
    footer: strings.footer,
    heading: strings.heading,
    lead: strings.message,
    title: strings.title,
  });
};
