import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RedisDeveloperSessionStore } from '../../src/developers/session-store.js';

const redisUrl = requireRedisUrl();

describe('RedisDeveloperSessionStore', (): void => {
  const keyPrefix = `craftlogin:test:developer-session:${randomUUID()}`;
  let redis: Redis | null = null;

  beforeAll(async (): Promise<void> => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
  });

  afterAll(async (): Promise<void> => {
    if (redis === null) {
      return;
    }
    const keys = await redis.keys(`${keyPrefix}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it('touches, atomically rotates, and revokes opaque developer sessions', async (): Promise<void> => {
    const store = new RedisDeveloperSessionStore(requireRedis(redis), keyPrefix);
    const created = await store.create({
      ipAddress: '203.0.113.12',
      role: 'developer',
      userAgent: 'Integration Browser',
      userUuid: '123e4567-e89b-42d3-a456-426614174000',
    });

    await expect(store.read(created.sessionId)).resolves.toMatchObject({
      role: 'developer',
      userUuid: created.userUuid,
    });

    const rotations = await Promise.all(
      Array.from(
        { length: 8 },
        async (): Promise<Awaited<ReturnType<typeof store.rotateRole>>> =>
          await store.rotateRole(created.sessionId, 'admin'),
      ),
    );
    const winners = rotations.filter((session): boolean => session !== undefined);
    expect(winners).toHaveLength(1);
    await expect(store.read(created.sessionId)).resolves.toBeUndefined();

    const rotated = winners[0];
    if (rotated === undefined) {
      throw new Error('Expected one developer session rotation winner');
    }
    expect(rotated.role).toBe('admin');
    await store.revoke(rotated.sessionId);
    await expect(store.read(rotated.sessionId)).resolves.toBeUndefined();
  });
});

function requireRedis(redis: Redis | null): Redis {
  if (redis === null) {
    throw new Error('Redis integration client is not initialized');
  }
  return redis;
}

function requireRedisUrl(): string {
  const value = process.env['TEST_REDIS_URL'];
  if (value === undefined) {
    throw new Error('TEST_REDIS_URL is required for Redis developer-session integration tests');
  }
  return value;
}
