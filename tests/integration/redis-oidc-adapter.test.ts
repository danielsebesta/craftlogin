import { createHash, randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RedisOidcAdapter } from '../../src/oauth/redis-oidc-adapter.js';

const redisUrl = process.env['TEST_REDIS_URL'];
if (redisUrl === undefined) {
  throw new Error('TEST_REDIS_URL is required for Redis integration tests');
}

describe('RedisOidcAdapter consumption', (): void => {
  const keyPrefix = `craftlogin:test:oidc:${randomUUID()}`;
  let redis: Redis;
  let codes: RedisOidcAdapter;

  beforeAll(async (): Promise<void> => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    codes = new RedisOidcAdapter('AuthorizationCode', redis, keyPrefix);
  });

  afterAll(async (): Promise<void> => {
    const keys = await redis.keys(`${keyPrefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('keeps a consumed code readable so a replay reaches the provider', async (): Promise<void> => {
    const id = randomUUID();
    await codes.upsert(id, { accountId: 'account', grantId: 'grant-a', scope: 'openid' }, 60);
    expect((await codes.find(id))?.consumed).toBeUndefined();

    await codes.consume(id);

    const consumed = await codes.find(id);
    expect(consumed?.accountId).toBe('account');
    expect(consumed?.jti).toBe(id);
    expect(typeof consumed?.consumed).toBe('number');
    await expect(codes.consume(id)).rejects.toThrow();
  });

  it('has exactly one winner under concurrent consumption', async (): Promise<void> => {
    const id = randomUUID();
    await codes.upsert(id, { grantId: 'grant-b' }, 60);

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, (): Promise<void> => codes.consume(id)),
    );

    expect(results.filter((result): boolean => result.status === 'fulfilled')).toHaveLength(1);
  });

  it('leaves the stored payload byte-identical, empty arrays included', async (): Promise<void> => {
    const id = randomUUID();
    await codes.upsert(id, { amr: [], grantId: 'grant-c' }, 60);

    await codes.consume(id);

    expect((await codes.find(id))?.amr).toEqual([]);
  });

  it('expires the consumption marker with the artifact', async (): Promise<void> => {
    const id = randomUUID();
    await codes.upsert(id, { grantId: 'grant-d' }, 60);

    await codes.consume(id);

    const digest = createHash('sha256').update(id, 'utf8').digest('hex');
    const markerTtl = await redis.pttl(`${keyPrefix}:consumed:AuthorizationCode:${digest}`);
    const artifactTtl = await redis.pttl(`${keyPrefix}:artifact:AuthorizationCode:${digest}`);
    expect(markerTtl).toBeGreaterThan(0);
    expect(artifactTtl).toBeGreaterThan(0);
    // Set from the artifact's remaining lifetime, so neither outlives the other by more than the gap.
    expect(Math.abs(markerTtl - artifactTtl)).toBeLessThan(1_000);
  });

  it('refuses to consume a missing or revoked code', async (): Promise<void> => {
    await expect(codes.consume(randomUUID())).rejects.toThrow();

    const id = randomUUID();
    await codes.upsert(id, { grantId: 'grant-e' }, 60);
    await codes.revokeByGrantId('grant-e');

    await expect(codes.find(id)).resolves.toBeUndefined();
    await expect(codes.consume(id)).rejects.toThrow();
  });
});
