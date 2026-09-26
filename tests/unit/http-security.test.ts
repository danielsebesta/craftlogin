import { describe, expect, it } from 'vitest';

import { renderAutoForwardPage } from '../../src/api/auto-forward-page.js';
import { canonicalRedirectTarget } from '../../src/api/canonical-origin.js';
import { PAGE_CONTENT_SECURITY_POLICY } from '../../src/api/page-csp.js';
import { createLogger } from '../../src/logging/logger.js';

describe('page content security policy', (): void => {
  it('keeps every page restricted to same-origin form submissions', (): void => {
    // Cross-origin hand-offs use plain links or meta-refresh: Chromium blocks
    // form POST redirects under form-action 'self'.
    expect(PAGE_CONTENT_SECURITY_POLICY).toBe(
      [
        "default-src 'none'",
        "base-uri 'none'",
        "connect-src 'self'",
        "font-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self'",
        "manifest-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
      ].join('; '),
    );
  });
});

describe('canonical HTTP origin', (): void => {
  it('redirects http aliases and subdomain hosts to the canonical HTTPS origin', (): void => {
    const issuer = 'https://craftlogin.com';
    const cases: readonly [string, string, string, string][] = [
      ['http', 'craftlogin.com', '/', 'https://craftlogin.com/'],
      ['http', 'www.craftlogin.com', '/docs?q=openid', 'https://craftlogin.com/docs?q=openid'],
      ['https', 'www.craftlogin.com', '/docs?q=openid', 'https://craftlogin.com/docs?q=openid'],
      [
        'http',
        'auth.craftlogin.com',
        '/oauth2/authorize?client_id=test',
        'https://craftlogin.com/oauth2/authorize?client_id=test',
      ],
      [
        'https',
        'auth.craftlogin.com',
        '/oauth2/authorize?client_id=test',
        'https://craftlogin.com/oauth2/authorize?client_id=test',
      ],
    ];
    for (const [protocol, host, path, expected] of cases) {
      expect(
        canonicalRedirectTarget({ host, path, protocol }, issuer),
        `${protocol}://${host}${path}`,
      ).toBe(expected);
    }
  });

  it('leaves the canonical HTTPS origin and unrelated hosts untouched', (): void => {
    const issuer = 'https://craftlogin.com';
    expect(
      canonicalRedirectTarget({ host: 'craftlogin.com', path: '/', protocol: 'https' }, issuer),
    ).toBeUndefined();
    expect(
      canonicalRedirectTarget({ host: 'example.com', path: '/', protocol: 'http' }, issuer),
    ).toBeUndefined();
  });
});

function refreshTarget(html: string): string {
  const target = /http-equiv="refresh" content="0;url=([^"]+)"/u.exec(html)?.[1];
  if (target === undefined) {
    throw new Error('Expected an auto-forward page with a refresh target');
  }
  return target.replace(/&amp;/gu, '&');
}

function linkTarget(html: string): string {
  const target = /<a class="button" href="([^"]+)"/u.exec(html)?.[1];
  if (target === undefined) {
    throw new Error('Expected an auto-forward page with a manual link');
  }
  return target.replace(/&amp;/gu, '&');
}

describe('renderAutoForwardPage target hardening', (): void => {
  it('keeps HTTPS and same-origin relative targets', (): void => {
    const target = 'https://client.example.com/callback?code=abc&state=xyz';
    const httpsPage = renderAutoForwardPage(target);
    expect(refreshTarget(httpsPage)).toBe(target);
    expect(linkTarget(httpsPage)).toBe(target);

    const relativePage = renderAutoForwardPage('/oauth2/authorize?client_id=cl_1');
    expect(refreshTarget(relativePage)).toBe('/oauth2/authorize?client_id=cl_1');
  });

  it('neutralizes dangerous URL schemes', (): void => {
    for (const dangerous of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      '//evil.example.com/phish',
      'file:///etc/passwd',
    ]) {
      const html = renderAutoForwardPage(dangerous);
      expect(refreshTarget(html), dangerous).toBe('/');
      expect(linkTarget(html), dangerous).toBe('/');
      expect(html, dangerous).not.toContain('javascript:');
      expect(html, dangerous).not.toContain('vbscript:');
    }
  });
});

describe('structured logger', (): void => {
  it('redacts OAuth, session, and verification material before serialization', (): void => {
    let output = '';
    const logger = createLogger('info', {
      write: (message): void => {
        output += message;
      },
    });

    logger.info(
      {
        access_token: 'raw-access-token',
        microsoftAccessToken: 'raw-microsoft-token',
        nested: {
          clientSecret: 'raw-client-secret',
          codeVerifier: 'raw-code-verifier',
          identityToken: 'raw-identity-token',
          RpsTicket: 'raw-rps-ticket',
          Token: 'raw-capital-token',
          uhs: 'raw-uhs',
          userHash: 'raw-user-hash',
          verificationCode: 'ABCDEFGH',
          xstsToken: 'raw-xsts-token',
        },
        req: {
          body: 'grant_type=authorization_code&code=raw-code',
          headers: {
            authorization: 'Bearer raw-token',
            cookie: 'raw-cookie',
            'x-csrf-token': 'raw-csrf-token',
          },
          url: '/oauth2/authorize?state=raw-state',
        },
      },
      'redaction test',
    );

    expect(output).toContain('[REDACTED]');
    for (const secret of [
      'raw-access-token',
      'raw-microsoft-token',
      'raw-client-secret',
      'ABCDEFGH',
      'raw-code-verifier',
      'raw-identity-token',
      'raw-rps-ticket',
      'raw-capital-token',
      'raw-uhs',
      'raw-token',
      'raw-cookie',
      'raw-csrf-token',
      'raw-state',
      'raw-user-hash',
      'raw-xsts-token',
    ]) {
      expect(output, secret).not.toContain(secret);
    }
    expect(output).not.toContain('raw-code');
  });
});
