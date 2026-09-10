import { describe, expect, it } from 'vitest';

import { loadEnvironment } from '../../src/config/environment.js';

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
      MC_PROTOCOL_TRACE: 'true',
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
      minecraftProtocolTrace: true,
    });
  });

  it('keeps Minecraft protocol tracing opt-in', (): void => {
    expect(loadEnvironment().minecraftProtocolTrace).toBe(false);
    expect(loadEnvironment({ MC_PROTOCOL_TRACE: 'true' }).minecraftProtocolTrace).toBe(true);
    expect((): void => {
      loadEnvironment({ MC_PROTOCOL_TRACE: 'yes' });
    }).toThrow();
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

  it.each([
    'https://login.example.com/',
    'https://login.example.com/path',
    'ftp://login.example.com',
  ])('rejects invalid issuer %s', (issuer): void => {
    expect((): void => {
      loadEnvironment({ OIDC_ISSUER: issuer });
    }).toThrow();
  });

  it.each(['0', '65536', '25565.0', ' 25565'])('rejects invalid port %s', (port): void => {
    expect((): void => {
      loadEnvironment({ MC_PORT: port });
    }).toThrow();
  });

  it.each(['CraftLogin.com', '*.craftlogin.com', 'localhost', '-bad.example'])(
    'rejects invalid base domain %s',
    (baseDomain): void => {
      expect((): void => {
        loadEnvironment({ MC_BASE_DOMAIN: baseDomain });
      }).toThrow();
    },
  );
});
