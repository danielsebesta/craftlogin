import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RedisMinecraftCache } from '../../src/mojang/cache.js';

const redisUrl = requireRedisUrl();

describe('RedisMinecraftCache', (): void => {
  const namespace = `craftlogin:test:mojang:${randomUUID()}:`;
  let redis: Redis | null = null;
  let cache: RedisMinecraftCache | null = null;

  beforeAll(async (): Promise<void> => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    cache = new RedisMinecraftCache(redis, namespace);
  });

  afterAll(async (): Promise<void> => {
    if (redis === null) {
      return;
    }
    const keys = await redis.keys(`${namespace}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await redis.quit();
  });

  it('round-trips a JSON value with its fetch timestamp', async (): Promise<void> => {
    const store = requireCache(cache);
    await store.write('profile', { username: 'jeb_' }, 60);

    const entry = await store.read('profile');
    expect(entry?.value).toEqual({ username: 'jeb_' });
    expect(typeof entry?.fetchedAt).toBe('number');
  });

  it('expires an entry after its TTL', async (): Promise<void> => {
    const store = requireCache(cache);
    await store.write('short-lived', { ok: true }, 1);
    await new Promise((resolve): void => {
      setTimeout(resolve, 1_100);
    });

    expect(await store.read('short-lived')).toBeUndefined();
  });

  it('ignores a malformed cache entry', async (): Promise<void> => {
    const store = requireCache(cache);
    const client = requireRedis(redis);
    await client.set(`${namespace}broken`, 'not json');

    expect(await store.read('broken')).toBeUndefined();
  });
});

function requireCache(cache: RedisMinecraftCache | null): RedisMinecraftCache {
  if (cache === null) {
    throw new Error('Redis Minecraft cache is not initialized');
  }
  return cache;
}

function requireRedis(redis: Redis | null): Redis {
  if (redis === null) {
    throw new Error('Redis integration test client is not initialized');
  }
  return redis;
}

function requireRedisUrl(): string {
  const value = process.env['TEST_REDIS_URL'];
  if (value === undefined) {
    throw new Error('TEST_REDIS_URL is required for Redis integration tests');
  }
  return value;
}
