import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../../src/config/environment.js';
import { loadMicrosoftOAuthCredentials } from '../../src/config/microsoft-oauth.js';
import { loadOAuthCredentials } from '../../src/config/oauth-credentials.js';

const clientId = '7f143b3d-bf80-4896-86ee-bd902f90ca63';

describe('loadEnvironment', (): void => {
  it('loads explicit Minecraft and infrastructure settings', (): void => {
    const environment = loadEnvironment({
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      DATABASE_URL: 'postgresql://service:secret@database:5432/craftlogin',
      REDIS_URL: 'rediss://cache:6380',
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: '8080',
      HTTP_TRUST_PROXY: 'true',
      OIDC_ISSUER: 'https://login.example.com',
      MC_HOST: '::',
      MC_PORT: '25570',
      MC_BASE_DOMAIN: 'login.example.com',
    });

    expect(environment).toEqual({
      nodeEnvironment: 'production',
      logLevel: 'warn',
      databaseUrl: 'postgresql://service:secret@database:5432/craftlogin',
      redisUrl: 'rediss://cache:6380',
      httpHost: '127.0.0.1',
      httpPort: 8_080,
      httpTrustProxy: true,
      oidcIssuer: 'https://login.example.com',
      minecraftHost: '::',
      minecraftPort: 25_570,
      minecraftBaseDomain: 'login.example.com',
    });
  });

  it('requires an explicit issuer in production', (): void => {
    expect((): void => {
      loadEnvironment({ NODE_ENV: 'production' });
    }).toThrow();
  });

  it('requires HTTPS for the production issuer while allowing local development HTTP', (): void => {
    expect((): void => {
      loadEnvironment({ NODE_ENV: 'production', OIDC_ISSUER: 'http://login.example.com' });
    }).toThrow('must use HTTPS in production');
    expect(loadEnvironment({ OIDC_ISSUER: 'http://localhost:3000' }).oidcIssuer).toBe(
      'http://localhost:3000',
    );
  });

  it('rejects invalid issuers, ports, and base domains', (): void => {
    for (const issuer of [
      'https://login.example.com/',
      'https://login.example.com/path',
      'ftp://login.example.com',
    ]) {
      expect((): void => {
        loadEnvironment({ OIDC_ISSUER: issuer });
      }, issuer).toThrow();
    }

    for (const port of ['0', '65536', '25565.0', ' 25565']) {
      expect((): void => {
        loadEnvironment({ MC_PORT: port });
      }, port).toThrow();
    }

    for (const baseDomain of ['CraftLogin.com', '*.craftlogin.com', 'localhost', '-bad.example']) {
      expect((): void => {
        loadEnvironment({ MC_BASE_DOMAIN: baseDomain });
      }, baseDomain).toThrow();
    }
  });
});

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

describe('loadMicrosoftOAuthCredentials', (): void => {
  it('loads a required client id and optional server-only secret', (): void => {
    expect(loadMicrosoftOAuthCredentials({ MICROSOFT_OAUTH_CLIENT_ID: clientId })).toEqual({
      clientId,
    });
    expect(
      loadMicrosoftOAuthCredentials({
        MICROSOFT_OAUTH_CLIENT_ID: clientId,
        MICROSOFT_OAUTH_CLIENT_SECRET: '',
      }),
    ).toEqual({ clientId });
    expect(
      loadMicrosoftOAuthCredentials({
        MICROSOFT_OAUTH_CLIENT_ID: clientId,
        MICROSOFT_OAUTH_CLIENT_SECRET: 'server-secret',
      }),
    ).toEqual({ clientId, clientSecret: 'server-secret' });
  });

  it('fails closed when the client id is absent or malformed', (): void => {
    expect((): unknown => loadMicrosoftOAuthCredentials({})).toThrow();
    expect((): unknown =>
      loadMicrosoftOAuthCredentials({ MICROSOFT_OAUTH_CLIENT_ID: 'not-a-uuid' }),
    ).toThrow();
    expect((): unknown =>
      loadMicrosoftOAuthCredentials({
        MICROSOFT_OAUTH_CLIENT_ID: clientId,
        MICROSOFT_OAUTH_CLIENT_SECRET: 'line-one\nline-two',
      }),
    ).toThrow();
  });
});
