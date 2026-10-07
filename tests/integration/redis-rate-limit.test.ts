import { randomUUID } from 'node:crypto';

import Fastify, { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import {
  appRegistrationRateLimit,
  developerLoginPageRateLimit,
  registerRateLimiting,
  tokenEndpointGlobalRateLimit,
  tokenRateLimit,
  publicOidcRateLimit,
  verificationStatusRateLimit,
} from '../../src/api/rate-limit.js';
import { registerOidcHttpRoutes } from '../../src/api/oauth-http-routes.js';
import { registerSharedSchemas } from '../../src/api/schemas.js';
import { registerErrorHandling } from '../../src/api/errors.js';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApiServer } from '../../src/api/server.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';

const redisUrl = requireRedisUrl();
const errorResponseSchema = z.object({
  error: z.object({ code: z.literal('rate_limited'), message: z.string() }),
});

describe('Redis-backed API rate limits', (): void => {
  const namespace = `craftlogin:test:rate-limit:${randomUUID()}:`;
  const servers: FastifyInstance[] = [];
  let redis: Redis | null = null;

  beforeAll(async (): Promise<void> => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    servers.push(await buildServer(redis, namespace), await buildServer(redis, namespace));
  });

  afterAll(async (): Promise<void> => {
    await Promise.all(
      servers.map(async (server): Promise<void> => {
        await server.close();
      }),
    );
    if (redis === null) {
      return;
    }
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it('isolates manual limiter buckets and keeps rejected IP traffic off the global budget', async (): Promise<void> => {
    if (redis === null) throw new Error('Expected Redis');
    const api = Fastify();
    servers.push(api);
    await registerRateLimiting(api, redis, `${namespace}oauth:`);
    registerSharedSchemas(api);
    registerErrorHandling(api);
    registerOidcHttpRoutes(api, (_request, response): void => {
      response.end('ok');
    });
    await api.ready();
    expect((await api.inject('/oauth2/jwks')).statusCode).toBe(200);
    const publicKey = (await redis.keys(`${namespace}oauth:*`)).find((key) =>
      key.includes('public:'),
    );
    if (publicKey === undefined) throw new Error('Expected public rate bucket');
    await redis.incrby(publicKey, publicOidcRateLimit.max - 1);
    expect((await api.inject('/oauth2/jwks')).statusCode).toBe(429);
    // Public metadata requests do not consume the first token request.
    expect((await api.inject({ method: 'POST', url: '/oauth2/token' })).statusCode).toBe(200);
    const globalKey = (await redis.keys(`${namespace}oauth:*`)).find((key) =>
      key.includes('oauth-grant-global'),
    );
    if (globalKey === undefined) throw new Error('Expected global rate bucket');
    await redis.incrby(globalKey, tokenEndpointGlobalRateLimit.max - tokenRateLimit.max - 10);
    const attack = Array.from({ length: tokenRateLimit.max + 50 }, () =>
      api.inject({ method: 'POST', url: '/oauth2/revoke' }),
    );
    const responses = await Promise.all(attack);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(51);
    const other = await api.inject({
      method: 'POST',
      url: '/oauth2/token',
      remoteAddress: '192.0.2.55',
    });
    expect(other.statusCode).toBe(200);
  }, 15000);

  it('admits polling for 800 interactions sharing one NAT while bounding each interaction', async (): Promise<void> => {
    if (redis === null) throw new Error('Expected Redis');
    const api = Fastify();
    servers.push(api);
    await registerRateLimiting(api, redis, `${namespace}poll:`);
    api.get(
      '/interaction/:uid/status',
      { config: { rateLimit: verificationStatusRateLimit } },
      (): { status: string } => ({ status: 'pending' }),
    );
    await api.ready();
    const responses = await Promise.all(
      Array.from({ length: 800 }, (_, i) => api.inject(`/interaction/user-${i.toString()}/status`)),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(true);
    for (let i = 1; i < verificationStatusRateLimit.max; i += 1)
      await api.inject('/interaction/user-0/status');
    expect((await api.inject('/interaction/user-0/status')).statusCode).toBe(429);
    expect((await api.inject('/interaction/user-1/status')).statusCode).toBe(200);
  });

  it('shares counters between API instances', async (): Promise<void> => {
    const first = requireServer(servers[0]);
    const second = requireServer(servers[1]);

    for (let index = 0; index < appRegistrationRateLimit.max; index += 1) {
      const response = await registerApp(index % 2 === 0 ? first : second);
      expect(response.statusCode).toBe(201);
    }

    const limited = await registerApp(second);
    expect(limited.statusCode).toBe(429);
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeTypeOf('string');
  });

  it('shares developer login page counters between API instances', async (): Promise<void> => {
    const first = requireServer(servers[0]);
    const second = requireServer(servers[1]);

    for (let index = 0; index < developerLoginPageRateLimit.max; index += 1) {
      const response = await startDeveloperLogin(index % 2 === 0 ? first : second);
      expect(response.statusCode).toBe(303);
    }

    const limited = await startDeveloperLogin(second);
    expect(limited.statusCode).toBe(429);
    expect(errorResponseSchema.parse(limited.json()).error.code).toBe('rate_limited');
    expect(limited.headers['retry-after']).toBeTypeOf('string');
  });
});

async function buildServer(redis: Redis, namespace: string): Promise<FastifyInstance> {
  const unavailable = (): never => {
    throw new Error('Unexpected dependency call');
  };
  const developerSession = {
    csrfToken: 'test-csrf-token',
    expiresInSeconds: 60,
    role: 'developer',
    sessionId: `ds_${'a'.repeat(43)}`,
    userUuid: '123e4567-e89b-42d3-a456-426614174000',
  } satisfies AuthenticatedDeveloperSession;
  const server = await createApiServer({
    icons: { findIcon: unavailable },
    accessTokens: { authenticate: unavailable },
    appManager: {
      decideVerification: unavailable,
      list: unavailable,
      remove: unavailable,
      removeIcon: unavailable,
      resetSecret: unavailable,
      setIcon: unavailable,
      requestVerification: unavailable,
      updateRedirectUris: unavailable,
    },
    apps: {
      register: (input) =>
        Promise.resolve({
          clientId: `cl_${randomUUID()}`,
          clientType: input.clientType,
          createdAt: '2026-09-07T00:00:00.000Z',
          id: randomUUID(),
          name: input.name,
          redirectUris: input.redirectUris,
        }),
    },
    clients: {
      findClient: unavailable,
      findClientOwnerUuid: unavailable,
      isAllowedOrigin: unavailable,
    },
    cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
    database: {
      oidcGrant: { updateMany: unavailable, findMany: unavailable },
      user: { deleteMany: unavailable },
    },
    developerAuthentication: {
      authenticate: (): Promise<undefined> => Promise.resolve(undefined),
      logout: unavailable,
      require: (): Promise<AuthenticatedDeveloperSession> => Promise.resolve(developerSession),
      requireAdministrator: unavailable,
      requireCsrf: (): void => undefined,
    },
    consoleClient: { clientId: 'cl_rate-limit-test-console' },
    developerSessions: {
      create: unavailable,
      list: (): Promise<never[]> => Promise.resolve([]),
      revokeByKeyId: (): Promise<boolean> => Promise.resolve(false),
    },
    developers: {
      find: unavailable,
      grant: unavailable,
      list: unavailable,
      revoke: unavailable,
      setVerified: unavailable,
    },
    httpPort: 3000,
    interactions: {
      abort: unavailable,
      complete: unavailable,
      resetVerification: unavailable,
      start: unavailable,
      status: unavailable,
    },
    issuer: 'https://craftlogin.com',
    minecraftBaseDomain: 'craftlogin.com',
    nodeEnvironment: 'test',
    oidcHandler: unavailable,
    rateLimitNamespace: namespace,
    rateLimitRedis: redis,
    readiness: { check: (): Promise<void> => Promise.resolve() },
    redis,
    users: { findCurrentUser: unavailable },
  });
  await server.ready();
  return server;
}

async function registerApp(server: FastifyInstance): Promise<LightMyRequestResponse> {
  return await server.inject({
    headers: { 'x-csrf-token': 'test-csrf-token' },
    method: 'POST',
    payload: {
      clientType: 'public',
      name: 'Shared limit test',
      redirectUris: ['https://client.example/callback'],
    },
    url: '/api/apps',
  });
}

async function startDeveloperLogin(server: FastifyInstance): Promise<LightMyRequestResponse> {
  return await server.inject({ method: 'GET', url: '/developers/login' });
}

function requireServer(server: FastifyInstance | undefined): FastifyInstance {
  if (server === undefined) {
    throw new Error('Expected API test server');
  }
  return server;
}

function requireRedisUrl(): string {
  const value = process.env['TEST_REDIS_URL'];
  if (value === undefined) {
    throw new Error('TEST_REDIS_URL is required for Redis rate-limit integration tests');
  }
  return value;
}
