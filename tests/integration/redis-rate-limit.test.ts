import { randomUUID } from 'node:crypto';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { appRegistrationRateLimit } from '../../src/api/rate-limit.js';
import { createApiServer } from '../../src/api/server.js';

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
});

async function buildServer(redis: Redis, namespace: string): Promise<FastifyInstance> {
  const unavailable = (): never => {
    throw new Error('Unexpected dependency call');
  };
  const server = await createApiServer({
    accessTokens: { authenticate: unavailable },
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
    clients: { findClientName: unavailable, isAllowedOrigin: unavailable },
    interactions: { complete: unavailable, start: unavailable, status: unavailable },
    issuer: 'https://craftlogin.com',
    minecraftBaseDomain: 'craftlogin.com',
    nodeEnvironment: 'test',
    oidcHandler: unavailable,
    rateLimitNamespace: namespace,
    rateLimitRedis: redis,
    readiness: { check: (): Promise<void> => Promise.resolve() },
    users: { findCurrentUser: unavailable },
  });
  await server.ready();
  return server;
}

async function registerApp(server: FastifyInstance): Promise<LightMyRequestResponse> {
  return await server.inject({
    method: 'POST',
    payload: {
      clientType: 'public',
      name: 'Shared limit test',
      redirectUris: ['https://client.example/callback'],
    },
    url: '/api/apps',
  });
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
