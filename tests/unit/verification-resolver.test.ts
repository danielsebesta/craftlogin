import { describe, expect, it } from 'vitest';

import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { VerifiedUserRepository } from '../../src/users/verified-user-repository.js';
import type { VerificationClaim } from '../../src/verification/redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer } from '../../src/verification/types.js';
import {
  VerificationResolutionError,
  VerificationResolver,
} from '../../src/verification/verification-resolver.js';

const player: AuthenticatedMinecraftPlayer = {
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  username: 'VerifiedPlayer',
};
const verifiedAt = new Date('2026-09-06T12:00:00.000Z');

class SingleWinnerStore {
  public completed = 0;
  public method: string | undefined;
  public released = 0;
  private claimed = false;

  public claim(code: string): Promise<VerificationClaim | null> {
    if (this.claimed) {
      return Promise.resolve(null);
    }
    this.claimed = true;

    return Promise.resolve({
      claimId: 'claim-id',
      code,
      codeKey: 'code-key',
      interactionKey: 'interaction-key',
      keyId: 'a'.repeat(64),
    });
  }

  public claimInteraction(): Promise<VerificationClaim | null> {
    return this.claim('ABCDEFGH');
  }

  public complete(
    _claim: VerificationClaim,
    _player: AuthenticatedMinecraftPlayer,
    _verifiedAt: Date,
    method?: string,
  ): Promise<boolean> {
    this.completed += 1;
    this.method = method;
    return Promise.resolve(true);
  }

  public release(): Promise<boolean> {
    this.released += 1;
    return Promise.resolve(true);
  }
}

class RecordingUsers implements VerifiedUserRepository {
  public readonly writes: {
    player: AuthenticatedMinecraftPlayer;
    verifiedAt: Date;
  }[] = [];

  public upsertVerifiedUser(
    authenticatedPlayer: AuthenticatedMinecraftPlayer,
    verificationTime: Date,
  ): Promise<void> {
    this.writes.push({ player: authenticatedPlayer, verifiedAt: verificationTime });
    return Promise.resolve();
  }
}

class FailingUsers implements VerifiedUserRepository {
  public upsertVerifiedUser(): Promise<void> {
    return Promise.reject(new Error('database unavailable'));
  }
}

class RecordingProfiles implements MinecraftPlayerLookup {
  public readonly lookups: string[] = [];

  public findProfileById(uuid: string): Promise<{ username: string; uuid: string }> {
    this.lookups.push(uuid);
    return Promise.resolve({ username: 'VerifiedPlayer', uuid });
  }

  public findProfileByName(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

describe('VerificationResolver', (): void => {
  it('allows only one concurrent resolver to persist and complete a code', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const users = new RecordingUsers();
    const resolver = new VerificationResolver(store, users);

    const results = await Promise.all([
      resolver.resolve('ABCDEFGH', player, verifiedAt),
      resolver.resolve('ABCDEFGH', player, verifiedAt),
    ]);

    expect(results.toSorted()).toEqual(['resolved', 'unavailable']);
    expect(users.writes).toEqual([{ player, verifiedAt }]);
    expect(store.completed).toBe(1);
    expect(store.released).toBe(0);
  });

  it('releases a claim when the user upsert fails', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const resolver = new VerificationResolver(store, new FailingUsers());

    await expect(resolver.resolve('ABCDEFGH', player, verifiedAt)).rejects.toBeInstanceOf(
      VerificationResolutionError,
    );
    expect(store.completed).toBe(0);
    expect(store.released).toBe(1);
  });

  it('warms the Minecraft profile cache after a successful resolve', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const profiles = new RecordingProfiles();
    const resolver = new VerificationResolver(store, new RecordingUsers(), profiles);

    await expect(resolver.resolve('ABCDEFGH', player, verifiedAt)).resolves.toBe('resolved');
    expect(profiles.lookups).toEqual([player.uuid]);
  });

  it('resolves Microsoft identity through the same atomic interaction claim', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const users = new RecordingUsers();
    const resolver = new VerificationResolver(store, users);

    await expect(
      resolver.resolveInteraction(
        'interaction-id',
        { ...player, verifiedVia: 'microsoft-oauth' },
        verifiedAt,
      ),
    ).resolves.toBe('resolved');
    expect(users.writes).toEqual([{ player, verifiedAt }]);
    expect(store.method).toBe('microsoft_oauth');
  });
});
