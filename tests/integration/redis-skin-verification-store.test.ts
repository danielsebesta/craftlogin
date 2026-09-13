import { randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  RedisSkinVerificationStore,
  type SkinVerificationCheckClaim,
} from '../../src/verification/redis-skin-verification-store.js';

const redisUrl = requireRedisUrl();
const uuid = '853c80ef-3c37-49fd-aa49-938b674adae6';

describe('RedisSkinVerificationStore', (): void => {
  const keyPrefix = `craftlogin:test:skin:${randomUUID()}`;
  let redis: Redis | null = null;
  let store: RedisSkinVerificationStore | null = null;

  beforeAll(async (): Promise<void> => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    store = new RedisSkinVerificationStore(redis, keyPrefix);
  });

  afterAll(async (): Promise<void> => {
    if (redis === null) return;
    const keys = await redis.keys(`${keyPrefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('creates idempotently and gives a due profile check to one claimant', async (): Promise<void> => {
    const challengeStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const first = await challengeStore.create(interactionId, {
      body: Buffer.from('first'),
      height: 32,
      markerHash: 'a'.repeat(64),
      model: 'classic',
      username: 'PlayerOne',
      userUuid: uuid,
    });
    const second = await challengeStore.create(interactionId, {
      body: Buffer.from('second'),
      height: 64,
      markerHash: 'b'.repeat(64),
      model: 'slim',
      username: 'PlayerTwo',
      userUuid: uuid,
    });
    expect(first.body).toEqual(Buffer.from('first'));
    expect(second).toEqual(first);

    const claims = await Promise.all(
      Array.from({ length: 8 }, async () => await challengeStore.claimCheck(interactionId)),
    );
    const winners = claims.filter((claim): claim is SkinVerificationCheckClaim => claim !== null);
    expect(winners).toHaveLength(1);
    const winner = winners[0];
    if (winner === undefined) throw new Error('Expected a skin check claim winner');
    expect(await challengeStore.releaseCheck(winner)).toBe(true);

    // A release does not bypass the bounded Mojang check interval.
    await expect(challengeStore.claimCheck(interactionId)).resolves.toBeNull();
  });

  it('deletes a challenge only for its exact claim owner', async (): Promise<void> => {
    const challengeStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    await challengeStore.create(interactionId, {
      body: Buffer.from('skin'),
      height: 64,
      markerHash: 'c'.repeat(64),
      model: 'slim',
      username: 'PlayerOne',
      userUuid: uuid,
    });
    const claim = await challengeStore.claimCheck(interactionId);
    if (claim === null) throw new Error('Expected a skin check claim');

    await expect(challengeStore.deleteClaimed({ ...claim, claimId: randomUUID() })).resolves.toBe(
      false,
    );
    expect(await challengeStore.get(interactionId)).toBeDefined();
    await expect(challengeStore.deleteClaimed(claim)).resolves.toBe(true);
    await expect(challengeStore.get(interactionId)).resolves.toBeUndefined();
  });
});

function requireStore(store: RedisSkinVerificationStore | null): RedisSkinVerificationStore {
  if (store === null) throw new Error('Redis skin verification store is not initialized');
  return store;
}

function requireRedisUrl(): string {
  const value = process.env['TEST_REDIS_URL'];
  if (value === undefined)
    throw new Error('TEST_REDIS_URL is required for Redis integration tests');
  return value;
}
