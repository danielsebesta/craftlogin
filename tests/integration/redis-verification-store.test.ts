import { SESSION_ABSOLUTE_TTL_SECONDS } from '../../src/oauth/session-security.js';
import { RedisSkinVerificationStore } from '../../src/verification/redis-skin-verification-store.js';
import { createHash, randomUUID } from 'node:crypto';

import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

  it('rejects a skin check whose challenge was discarded during a reset', async (): Promise<void> => {
    const client = requireRedis(redis);
    const verification = requireStore(store);
    const skins = new RedisSkinVerificationStore(client, `${keyPrefix}:skins`);
    const id = randomUUID();
    await verification.allocate(id);
    await skins.create(id, {
      body: Buffer.from('skin'),
      height: 64,
      model: 'classic',
      markerHash: 'a'.repeat(64),
      userUuid: '123e4567-e89b-42d3-a456-426614174000',
      username: 'PlayerOne',
    });
    const skinClaim = await skins.claimCheck(id);
    if (skinClaim === null) throw new Error('Expected skin claim');
    const winner = await verification.claimInteraction(id);
    if (winner === null) throw new Error('Expected competing verification');
    await verification.complete(
      winner,
      { uuid: '123e4567-e89b-42d3-a456-426614174000', username: 'OtherPlayer' },
      new Date(),
    );
    await skins.discard(id);
    expect(await verification.reset(id)).toBe(true);
    const fresh = await verification.allocate(id);
    expect(await verification.claimInteraction(id, skinClaim)).toBeNull();
    expect(await verification.hasPendingCode(fresh)).toBe(true);
  });

  it('expires OIDC sessions at the absolute boundary despite clock tolerance and repeated writes', async (): Promise<void> => {
    const sessions = new RedisOidcAdapter('Session', requireRedis(redis), keyPrefix);
    const issued = Math.floor(Date.now() / 1000);
    const payload = { kind: 'Session', iat: issued, uid: randomUUID() };
    const id = randomUUID();
    await sessions.upsert(id, payload, SESSION_ABSOLUTE_TTL_SECONDS);
    const clock = vi.spyOn(Date, 'now');
    try {
      clock.mockReturnValue((issued + SESSION_ABSOLUTE_TTL_SECONDS) * 1000);
      expect(await sessions.find(id)).toBeUndefined();
      await sessions.upsert(id, payload, 1);
      expect(await sessions.find(id)).toBeUndefined();
      expect(await sessions.findByUid(payload.uid)).toBeUndefined();
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects revoked-grant access tokens and late writes across replicas', async (): Promise<void> => {
    let active = true;
    const first = new RedisOidcAdapter('AccessToken', requireRedis(redis), keyPrefix, () =>
      Promise.resolve(active),
    );
    const second = new RedisOidcAdapter('AccessToken', requireRedis(redis), keyPrefix, () =>
      Promise.resolve(active),
    );
    const payload = { grantId: randomUUID(), accountId: randomUUID(), clientId: 'test-client' };
    await first.upsert('revoked-access', payload, 3600);
    expect(await second.find('revoked-access')).toBeDefined();
    active = false;
    expect(await second.find('revoked-access')).toBeUndefined();
    await expect(first.upsert('late-access', payload, 3600)).rejects.toThrow();
  });

  it('invalidates every old browser session after account deletion', async (): Promise<void> => {
    const sessions = new RedisOidcAdapter('Session', requireRedis(redis), keyPrefix);
    const accountId = randomUUID();
    const payload = { kind: 'Session', iat: Math.floor(Date.now() / 1000) - 60, accountId };
    await sessions.upsert('browser-one', payload, 3600);
    await sessions.upsert('browser-two', payload, 3600);
    await sessions.invalidateAccountSessions(accountId);
    expect(await sessions.find('browser-one')).toBeUndefined();
    expect(await sessions.find('browser-two')).toBeUndefined();
    await sessions.upsert('browser-two', payload, 3600);
    expect(await sessions.find('browser-two')).toBeUndefined();
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
    const finalizationWinners = finalizationClaims.filter((result) => result.status === 'claimed');
    expect(finalizationWinners).toHaveLength(1);

    const finalizationWinner = finalizationWinners[0];
    if (finalizationWinner === undefined) {
      throw new Error('Expected one interaction finalization winner');
    }

    expect(await verificationStore.releaseFinalization(finalizationWinner.claim)).toBe(true);
    expect(await verificationStore.getStatus(interactionId)).toEqual({
      status: 'verified',
      player,
      resolvedAt: resolvedAt.toISOString(),
    });

    const reclaimed = await verificationStore.claimVerified(interactionId);
    if (reclaimed.status !== 'claimed') {
      throw new Error('Expected the released finalization claim to be reclaimable');
    }
    expect(await verificationStore.completeFinalization(reclaimed.claim)).toBe(true);
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

  it('allows exactly one winner between server-join and skin verification', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);

    const claims = await Promise.all([
      verificationStore.claim(code),
      verificationStore.claimInteraction(interactionId),
    ]);
    const winners = claims.filter((claim): claim is VerificationClaim => claim !== null);
    expect(winners).toHaveLength(1);
    expect(await verificationStore.hasPendingCode(code)).toBe(false);
  });

  it('carries the skin authentication method into OIDC finalization', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claimInteraction(interactionId);
    if (claim === null) throw new Error('Expected an interaction verification claim');
    const verifiedAt = new Date('2026-09-12T12:00:00.000Z');
    await expect(
      verificationStore.complete(
        claim,
        {
          uuid: '123e4567-e89b-42d3-a456-426614174000',
          username: 'SkinPlayer',
        },
        verifiedAt,
        'minecraft_profile_skin',
      ),
    ).resolves.toBe(true);

    await expect(verificationStore.claimVerified(interactionId)).resolves.toMatchObject({
      status: 'claimed',
      claim: { method: 'minecraft_profile_skin' },
    });
  });

  it('carries the Microsoft authentication method into OIDC finalization', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claimInteraction(interactionId);
    if (claim === null) throw new Error('Expected an interaction verification claim');

    await expect(
      verificationStore.complete(
        claim,
        {
          uuid: '123e4567-e89b-42d3-a456-426614174000',
          username: 'MicrosoftPlayer',
        },
        new Date('2026-09-13T12:00:00.000Z'),
        'microsoft_oauth',
      ),
    ).resolves.toBe(true);
    await expect(verificationStore.claimVerified(interactionId)).resolves.toMatchObject({
      status: 'claimed',
      claim: { method: 'microsoft_oauth' },
    });
  });

  it('discards a verified identity on reset and re-issues a fresh code', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claim(code);
    if (claim === null) {
      throw new Error('Expected the verification code to be claimable');
    }
    const player = {
      uuid: '123e4567-e89b-42d3-a456-426614174000',
      username: 'VerifiedPlayer',
    };
    const resolvedAt = new Date('2026-09-06T12:00:00.000Z');
    expect(await verificationStore.complete(claim, player, resolvedAt)).toBe(true);

    // The claim already consumed the code key, so a reset cannot resurrect it.
    expect(await verificationStore.reset(interactionId)).toBe(true);
    expect(await verificationStore.hasPendingCode(code)).toBe(false);

    const freshCode = await verificationStore.allocate(interactionId);
    expect(freshCode).not.toBe(code);
    expect(await verificationStore.getStatus(interactionId)).toEqual({
      status: 'pending',
      code: freshCode,
    });

    // A second rejection with no verified identity is a no-op.
    expect(await verificationStore.reset(interactionId)).toBe(false);
  });

  it('lets the finalization claim win over a concurrent reset', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claim(code);
    if (claim === null) {
      throw new Error('Expected the verification code to be claimable');
    }
    expect(
      await verificationStore.complete(
        claim,
        { uuid: '123e4567-e89b-42d3-a456-426614174000', username: 'VerifiedPlayer' },
        new Date('2026-09-06T12:00:00.000Z'),
      ),
    ).toBe(true);

    const finalization = await verificationStore.claimVerified(interactionId);
    if (finalization.status !== 'claimed') {
      throw new Error('Expected a finalization claim');
    }
    expect(await verificationStore.reset(interactionId)).toBe(false);
    expect(await verificationStore.completeFinalization(finalization.claim)).toBe(true);
    expect(await verificationStore.getStatus(interactionId)).toEqual({ status: 'expired' });
  });

  it('requires the in-game confirmation code for online-mode finalization', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claim(code);
    if (claim === null) {
      throw new Error('Expected the verification code to be claimable');
    }
    const player = {
      uuid: '123e4567-e89b-42d3-a456-426614174000',
      username: 'VerifiedPlayer',
    };
    const resolvedAt = new Date('2026-09-06T12:00:00.000Z');
    expect(
      await verificationStore.complete(
        claim,
        player,
        resolvedAt,
        'minecraft_online_mode',
        'K7X2QM',
      ),
    ).toBe(true);

    // The confirmation flag surfaces, but the code itself must never leak
    // through status polling.
    expect(await verificationStore.getStatus(interactionId)).toEqual({
      status: 'verified',
      player,
      resolvedAt: resolvedAt.toISOString(),
      requiresConfirmCode: true,
    });

    await expect(verificationStore.claimVerified(interactionId)).resolves.toEqual({
      status: 'code_mismatch',
    });
    await expect(verificationStore.claimVerified(interactionId, 'ZZZZ99')).resolves.toEqual({
      status: 'code_mismatch',
    });
    await expect(verificationStore.claimVerified(interactionId, 'k7x2qm')).resolves.toMatchObject({
      status: 'claimed',
      claim: { method: 'minecraft_online_mode' },
    });
  });

  it('exhausts the verification after bounded wrong confirmation attempts', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claim(code);
    if (claim === null) {
      throw new Error('Expected the verification code to be claimable');
    }
    expect(
      await verificationStore.complete(
        claim,
        { uuid: '123e4567-e89b-42d3-a456-426614174000', username: 'VerifiedPlayer' },
        new Date('2026-09-06T12:00:00.000Z'),
        'minecraft_online_mode',
        'K7X2QM',
      ),
    ).toBe(true);

    for (let attempt = 0; attempt < 9; attempt += 1) {
      await expect(verificationStore.claimVerified(interactionId, 'ZZZZ99')).resolves.toEqual({
        status: 'code_mismatch',
      });
    }
    await expect(verificationStore.claimVerified(interactionId, 'ZZZZ99')).resolves.toEqual({
      status: 'attempts_exhausted',
    });
    await expect(verificationStore.getStatus(interactionId)).resolves.toEqual({
      status: 'expired',
    });
  });

  it('keeps a single finalization winner when the correct code races', async (): Promise<void> => {
    const verificationStore = requireStore(store);
    const interactionId = `interaction-${randomUUID()}`;
    const code = await verificationStore.allocate(interactionId);
    const claim = await verificationStore.claim(code);
    if (claim === null) {
      throw new Error('Expected the verification code to be claimable');
    }
    expect(
      await verificationStore.complete(
        claim,
        { uuid: '123e4567-e89b-42d3-a456-426614174000', username: 'VerifiedPlayer' },
        new Date('2026-09-06T12:00:00.000Z'),
        'minecraft_online_mode',
        'K7X2QM',
      ),
    ).toBe(true);

    const outcomes = await Promise.all(
      Array.from(
        { length: 8 },
        async () => await verificationStore.claimVerified(interactionId, 'K7X2QM'),
      ),
    );
    expect(outcomes.filter((result) => result.status === 'claimed')).toHaveLength(1);
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
