import type { MinecraftPlayerLookup } from '../mojang/client.js';
import type { VerifiedUserRepository } from '../users/verified-user-repository.js';
import type { RedisVerificationStore } from './redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer, InteractionVerifiedIdentity } from './types.js';

export type VerificationResolution = 'resolved' | 'unavailable';

export class VerificationResolutionError extends Error {
  public override readonly name = 'VerificationResolutionError';
}

export class VerificationResolver {
  public constructor(
    private readonly verificationStore: Pick<
      RedisVerificationStore,
      'claim' | 'claimInteraction' | 'complete' | 'release'
    >,
    private readonly users: VerifiedUserRepository,
    private readonly profiles?: MinecraftPlayerLookup,
  ) {}

  public async resolve(
    code: string,
    player: AuthenticatedMinecraftPlayer,
    verifiedAt: Date,
  ): Promise<VerificationResolution> {
    const claim = await this.verificationStore.claim(code);

    return await this.resolveClaim(claim, player, verifiedAt, 'minecraft_online_mode');
  }

  public async resolveInteraction(
    interactionId: string,
    identity: InteractionVerifiedIdentity,
    verifiedAt: Date,
  ): Promise<VerificationResolution> {
    const claim = await this.verificationStore.claimInteraction(interactionId);
    const player = { username: identity.username, uuid: identity.uuid };
    const method =
      identity.verifiedVia === 'microsoft-oauth' ? 'microsoft_oauth' : 'minecraft_profile_skin';

    return await this.resolveClaim(claim, player, verifiedAt, method);
  }

  private async resolveClaim(
    claim: Awaited<ReturnType<RedisVerificationStore['claim']>>,
    player: AuthenticatedMinecraftPlayer,
    verifiedAt: Date,
    method: 'minecraft_online_mode' | 'minecraft_profile_skin' | 'microsoft_oauth',
  ): Promise<VerificationResolution> {
    if (claim === null) {
      return 'unavailable';
    }

    try {
      await this.users.upsertVerifiedUser(player, verifiedAt);
    } catch (error: unknown) {
      try {
        await this.verificationStore.release(claim);
      } catch (releaseError: unknown) {
        throw new VerificationResolutionError(
          'User persistence failed and the verification claim could not be released',
          { cause: new AggregateError([error, releaseError]) },
        );
      }

      throw new VerificationResolutionError('User persistence failed', { cause: error });
    }

    const completed = await this.verificationStore.complete(claim, player, verifiedAt, method);

    if (!completed) {
      throw new VerificationResolutionError('The verification claim could not be completed');
    }

    if (this.profiles !== undefined) {
      // Warm the profile cache while the player is still in the verification flow. A lookup
      // failure must never fail verification, so the result is intentionally discarded.
      await this.profiles.findProfileById(player.uuid).catch((): undefined => undefined);
    }

    return 'resolved';
  }
}
