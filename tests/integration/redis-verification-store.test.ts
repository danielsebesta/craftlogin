import { createHash, randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RedisOidcAdapter } from '../../src/oauth/redis-oidc-adapter.js';
import {
  RedisVerificationStore,
  type VerificationClaim,
} from '../../src/verification/redis-verification-store.js';

const redisUrl = requireRedisUrl();

describe('RedisVerificationStore', (): void => {
  const keyPrefix = `craftlogin:test:${randomUUID()}`;
  let redis: Redis | null = null;
  let store: RedisVerificationStore | null = null;

  beforeAll(async (): Promise<void> => {
    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    store = new RedisVerificationStore(redis, keyPrefix);
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

  it('allocates idempotently and gives a code to one concurrent claimant', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);

    expect(await verificationStore.allocate(interactionId)).toBe(code);
    expect(await verificationStore.hasPendingCode(code)).toBe(true);

    const claims = await Promise.all(
      Array.from(
        { length: 8 },
        async (): Promise<VerificationClaim | null> => await verificationStore.claim(code),
      ),
    );
    const winners = claims.filter((claim): claim is VerificationClaim => claim !== null);

    expect(winners).toHaveLength(1);
    expect(await verificationStore.hasPendingCode(code)).toBe(false);

    const winner = winners[0];
    if (winner === undefined) {
      throw new Error('Expected one verification claim winner');
    }

    const player = {
      uuid: '123e4567-e89b-42d3-a456-426614174000',
      username: 'VerifiedPlayer',
    };
    const resolvedAt = new Date('2026-09-06T12:00:00.000Z');

    expect(await verificationStore.complete(winner, player, resolvedAt)).toBe(true);
    expect(await verificationStore.getStatus(interactionId)).toEqual({
      status: 'verified',
      player,
      resolvedAt: resolvedAt.toISOString(),
    });

    const finalizationClaims = await Promise.all(
      Array.from({ length: 8 }, async () => await verificationStore.claimVerified(interactionId)),
    );
    const finalizationWinners = finalizationClaims.filter((claim) => claim !== null);
    expect(finalizationWinners).toHaveLength(1);

    const finalizationWinner = finalizationWinners[0];
    if (finalizationWinner === undefined) {
      throw new Error('Expected one interaction finalization winner');
    }

    expect(await verificationStore.releaseFinalization(finalizationWinner)).toBe(true);
    expect(await verificationStore.getStatus(interactionId)).toEqual({
      status: 'verified',
      player,
      resolvedAt: resolvedAt.toISOString(),
    });

    const reclaimed = await verificationStore.claimVerified(interactionId);
    if (reclaimed === null) {
      throw new Error('Expected the released finalization claim to be reclaimable');
    }
    expect(await verificationStore.completeFinalization(reclaimed)).toBe(true);
    expect(await verificationStore.getStatus(interactionId)).toEqual({ status: 'expired' });
  });

  it('restores an unexpired code when persistence fails', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claim(code);

    if (claim === null) {
      throw new Error('Expected the verification code to be claimable');
    }

    expect(await verificationStore.release(claim)).toBe(true);
    expect(await verificationStore.hasPendingCode(code)).toBe(true);
    expect(await verificationStore.getStatus(interactionId)).toEqual({ status: 'pending', code });
  });

  it('atomically deletes an authorization code after one consumption and stores no plaintext code', async (): Promise<void> => {
    const redisClient = requireRedis(redis);
    const adapter = new RedisOidcAdapter('AuthorizationCode', redisClient, keyPrefix);
    const authorizationCode = `authorization-code-${randomUUID()}`;

    await adapter.upsert(
      authorizationCode,
      {
        accountId: '123e4567-e89b-42d3-a456-426614174000',
        clientId: 'integration-client',
        grantId: `grant-${randomUUID()}`,
      },
      60,
    );

    const keys = await redisClient.keys(`${keyPrefix}:*`);
    const values = keys.length === 0 ? [] : await redisClient.mget(...keys);
    expect([...keys, ...values.filter((value) => value !== null)].join('\n')).not.toContain(
      authorizationCode,
    );

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, async (): Promise<void> => {
        await adapter.consume(authorizationCode);
      }),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(7);
    await expect(adapter.find(authorizationCode)).resolves.toBeUndefined();
  });

  it('rejects and removes a legacy authorization code already marked as consumed', async (): Promise<void> => {
    const redisClient = requireRedis(redis);
    const adapter = new RedisOidcAdapter('AuthorizationCode', redisClient, keyPrefix);
    const authorizationCode = `legacy-authorization-code-${randomUUID()}`;
    const artifactKey = `${keyPrefix}:artifact:AuthorizationCode:${createHash('sha256')
      .update(authorizationCode, 'utf8')
      .digest('hex')}`;
    await redisClient.set(
      artifactKey,
      JSON.stringify({
        grantKey: null,
        indexValue: null,
        payload: { consumed: 1_000, exp: 2_000, iat: 1_000 },
        uidKey: null,
        userCodeKey: null,
      }),
      'PX',
      60_000,
    );

    await expect(adapter.consume(authorizationCode)).rejects.toThrow();
    await expect(redisClient.exists(artifactKey)).resolves.toBe(0);
  });

  it('maintains and removes the session uid index atomically', async (): Promise<void> => {
    const redisClient = requireRedis(redis);
    const adapter = new RedisOidcAdapter('Session', redisClient, keyPrefix);
    const sessionId = `session-${randomUUID()}`;
    const uid = `interaction-${randomUUID()}`;

    await adapter.upsert(sessionId, { accountId: 'account', uid }, 300);
    await expect(adapter.findByUid(uid)).resolves.toMatchObject({
      accountId: 'account',
      jti: sessionId,
      uid,
    });

    await adapter.destroy(sessionId);
    await expect(adapter.findByUid(uid)).resolves.toBeUndefined();
  });
});

function requireStore(store: RedisVerificationStore | null): RedisVerificationStore {
  if (store === null) {
    throw new Error('Redis integration test store is not initialized');
  }

  return store;
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
