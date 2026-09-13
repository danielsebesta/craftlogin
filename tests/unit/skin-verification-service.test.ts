import { describe, expect, it } from 'vitest';

import type {
  MinecraftPlayerProfile,
  MinecraftPlayerProfileWithSkin,
} from '../../src/mojang/client.js';
import type { SkinImage } from '../../src/mojang/skin-store.js';
import type { VerifiedUserRepository } from '../../src/users/verified-user-repository.js';
import type { VerificationClaim } from '../../src/verification/redis-verification-store.js';
import type {
  SkinVerificationChallenge,
  SkinVerificationCheckClaim,
} from '../../src/verification/redis-skin-verification-store.js';
import { SkinVerificationService } from '../../src/verification/skin-verification-service.js';
import type {
  AuthenticatedMinecraftPlayer,
  VerificationStatus,
} from '../../src/verification/types.js';
import { createSkinPng } from './support/skin-fixture.js';

const uuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
const originalHash = '1'.repeat(64);
const markedHash = '2'.repeat(64);

class MemoryChallenges {
  public challenge: SkinVerificationChallenge | undefined;
  public claimed = false;

  public claimCheck(): Promise<SkinVerificationCheckClaim | null> {
    if (this.challenge === undefined || this.claimed) return Promise.resolve(null);
    this.claimed = true;
    return Promise.resolve({
      claimId: 'skin-claim',
      interactionKey: 'skin-key',
      markerHash: this.challenge.markerHash,
      username: this.challenge.username,
      userUuid: this.challenge.userUuid,
    });
  }

  public create(
    _interactionId: string,
    challenge: Omit<SkinVerificationChallenge, 'status'>,
  ): Promise<SkinVerificationChallenge> {
    this.challenge ??= { ...challenge, status: 'pending' };
    return Promise.resolve(this.challenge);
  }

  public deleteClaimed(): Promise<boolean> {
    if (!this.claimed) return Promise.resolve(false);
    this.challenge = undefined;
    return Promise.resolve(true);
  }

  public get(): Promise<SkinVerificationChallenge | undefined> {
    return Promise.resolve(this.challenge);
  }

  public releaseCheck(): Promise<boolean> {
    if (!this.claimed) return Promise.resolve(false);
    this.claimed = false;
    return Promise.resolve(true);
  }
}

class MemoryVerification {
  public completedPlayer: AuthenticatedMinecraftPlayer | undefined;
  public claimed = false;

  public claimInteraction(): Promise<VerificationClaim | null> {
    if (this.claimed || this.completedPlayer !== undefined) return Promise.resolve(null);
    this.claimed = true;
    return Promise.resolve({
      claimId: 'verification-claim',
      code: 'ABCDEFGH',
      codeKey: 'code-key',
      interactionKey: 'interaction-key',
      keyId: 'a'.repeat(64),
    });
  }

  public complete(
    _claim: VerificationClaim,
    player: AuthenticatedMinecraftPlayer,
  ): Promise<boolean> {
    this.completedPlayer = player;
    return Promise.resolve(true);
  }

  public getStatus(): Promise<VerificationStatus> {
    return Promise.resolve(
      this.completedPlayer === undefined
        ? { code: 'ABCDEFGH', status: 'pending' }
        : {
            player: this.completedPlayer,
            resolvedAt: '2026-09-12T00:00:00.000Z',
            status: 'verified',
          },
    );
  }

  public release(): Promise<boolean> {
    this.claimed = false;
    return Promise.resolve(true);
  }
}

class Players {
  public fresh: MinecraftPlayerProfileWithSkin | undefined;
  public freshCalls = 0;
  public profile: MinecraftPlayerProfileWithSkin | undefined = {
    texture: { hash: originalHash, model: 'slim' },
    username: 'Player',
    uuid,
  };

  public findProfileByName(): Promise<MinecraftPlayerProfile | undefined> {
    return Promise.resolve({ username: 'Player', uuid });
  }

  public findProfileById(): Promise<MinecraftPlayerProfileWithSkin | undefined> {
    return Promise.resolve(this.profile);
  }

  public findFreshProfileById(): Promise<MinecraftPlayerProfileWithSkin | undefined> {
    this.freshCalls += 1;
    return Promise.resolve(this.fresh);
  }
}

class Skins {
  public readonly values = new Map<string, Buffer>();

  public fetchSkin(hash: string): Promise<SkinImage | undefined> {
    const body = this.values.get(hash);
    return Promise.resolve(body === undefined ? undefined : { body, contentType: 'image/png' });
  }
}

class Users implements VerifiedUserRepository {
  public writes: AuthenticatedMinecraftPlayer[] = [];

  public upsertVerifiedUser(player: AuthenticatedMinecraftPlayer): Promise<void> {
    this.writes.push(player);
    return Promise.resolve();
  }
}

describe('SkinVerificationService', (): void => {
  it('creates a format-preserving challenge and resolves only a fresh signed profile', async (): Promise<void> => {
    const challenges = new MemoryChallenges();
    const verification = new MemoryVerification();
    const players = new Players();
    const skins = new Skins();
    const users = new Users();
    skins.values.set(originalHash, await createSkinPng([], 32));
    const service = new SkinVerificationService(challenges, verification, players, skins, users, {
      error: (): void => undefined,
    });

    const challenge = await service.start('interaction', 'Player');
    expect(challenge).toMatchObject({
      height: 32,
      model: 'classic',
      username: 'Player',
      userUuid: uuid,
    });

    skins.values.set(markedHash, challenge.body);
    players.fresh = {
      texture: { hash: markedHash, model: 'classic' },
      username: 'RenamedPlayer',
      uuid,
    };
    await expect(service.check('interaction')).resolves.toMatchObject({
      player: { username: 'RenamedPlayer', uuid },
      status: 'verified',
    });
    expect(players.freshCalls).toBe(1);
    expect(users.writes).toEqual([{ username: 'RenamedPlayer', uuid }]);
    expect(verification.completedPlayer).toEqual({ username: 'RenamedPlayer', uuid });
  });

  it('keeps the challenge pending when the current signed skin has a different marker', async (): Promise<void> => {
    const challenges = new MemoryChallenges();
    const verification = new MemoryVerification();
    const players = new Players();
    const skins = new Skins();
    const users = new Users();
    const unmarked = await createSkinPng([]);
    skins.values.set(originalHash, unmarked);
    skins.values.set(markedHash, unmarked);
    players.fresh = {
      texture: { hash: markedHash, model: 'slim' },
      username: 'Player',
      uuid,
    };
    const service = new SkinVerificationService(challenges, verification, players, skins, users, {
      error: (): void => undefined,
    });

    await service.start('interaction', 'Player');
    await expect(service.check('interaction')).resolves.toEqual({
      code: 'ABCDEFGH',
      status: 'pending',
    });
    expect(users.writes).toHaveLength(0);
    expect(challenges.claimed).toBe(false);
    expect(challenges.challenge).toBeDefined();
  });

  it('provides a modern classic template when the signed profile uses a default skin', async (): Promise<void> => {
    const challenges = new MemoryChallenges();
    const players = new Players();
    players.profile = { username: 'Player', uuid };
    const service = new SkinVerificationService(
      challenges,
      new MemoryVerification(),
      players,
      new Skins(),
      new Users(),
      { error: (): void => undefined },
    );

    await expect(service.start('interaction', 'Player')).resolves.toMatchObject({
      height: 64,
      model: 'classic',
      username: 'Player',
    });
  });
});
