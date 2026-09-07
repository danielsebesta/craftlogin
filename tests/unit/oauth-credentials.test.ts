import { describe, expect, it } from 'vitest';

import { loadOAuthCredentials } from '../../src/config/oauth-credentials.js';

describe('loadOAuthCredentials', (): void => {
  it('creates development-only signing and cookie keys when none are supplied', (): void => {
    const credentials = loadOAuthCredentials({}, 'development');

    expect(credentials.cookieKeys).toHaveLength(2);
    expect(credentials.cookieKeys.every((key): boolean => key.length >= 32)).toBe(true);
    expect(credentials.jwks.keys).toHaveLength(1);
    expect(credentials.jwks.keys[0]).toMatchObject({ alg: 'RS256', kty: 'RSA', use: 'sig' });
    const signingKey = credentials.jwks.keys[0];
    expect(signingKey !== undefined && 'd' in signingKey ? signingKey.d : undefined).toBeTypeOf(
      'string',
    );
  });

  it('loads explicit private keys without coercion', (): void => {
    const credentials = loadOAuthCredentials(
      {
        OIDC_COOKIE_KEYS: `${'a'.repeat(32)},${'b'.repeat(32)}`,
        OIDC_JWKS: JSON.stringify({
          keys: [{ d: 'private-value', e: 'AQAB', kty: 'RSA', n: 'modulus' }],
        }),
      },
      'production',
    );

    expect(credentials.cookieKeys).toEqual(['a'.repeat(32), 'b'.repeat(32)]);
    expect(credentials.jwks).toEqual({
      keys: [{ d: 'private-value', e: 'AQAB', kty: 'RSA', n: 'modulus' }],
    });
  });

  it('fails closed when production credentials are missing or malformed', (): void => {
    expect((): void => {
      loadOAuthCredentials({}, 'production');
    }).toThrow();
    expect((): void => {
      loadOAuthCredentials(
        {
          OIDC_COOKIE_KEYS: `${'a'.repeat(32)},${'b'.repeat(32)}`,
          OIDC_JWKS: 'not-json',
        },
        'production',
      );
    }).toThrow('must contain valid JSON');
    expect((): void => {
      loadOAuthCredentials(
        {
          OIDC_COOKIE_KEYS: `${'a'.repeat(32)},${'a'.repeat(32)}`,
          OIDC_JWKS: JSON.stringify({ keys: [{ d: 'private', kty: 'RSA' }] }),
        },
        'production',
      );
    }).toThrow('must be distinct');
  });
});
