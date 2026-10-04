import type { MinecraftPlayerLookup } from '../mojang/client.js';
import type { VerifiedUserRepository } from '../users/verified-user-repository.js';
import { generateConfirmationCode } from './code.js';
import type { RedisVerificationStore } from './redis-verification-store.js';
import type {
  AuthenticatedMinecraftPlayer,
  InteractionVerifiedIdentity,
  VerificationMethod,
} from './types.js';

// confirmCode is the anti-phishing secret shown only over the encrypted
// in-game channel: it binds the browser interaction to the physical player
// who joined, so a relaying proxy cannot harvest an identity it cannot read.
export type VerificationResolution =
  | {
      readonly status: 'resolved';
      readonly appName?: string;
      readonly confirmCode?: string;
    }
  | { readonly status: 'unavailable' };

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
    method: VerificationMethod,
  ): Promise<VerificationResolution> {
    if (claim === null) {
      return { status: 'unavailable' };
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

    // The confirmation code exists only for the online-mode join path: skin
    // and Microsoft verifications are proven in the user's own browser, where
    // there is no encrypted channel to deliver a second secret through.
    const confirmCode = method === 'minecraft_online_mode' ? generateConfirmationCode() : undefined;
    const completed = await this.verificationStore.complete(
      claim,
      player,
      verifiedAt,
      method,
      confirmCode,
    );

    if (!completed) {
      throw new VerificationResolutionError('The verification claim could not be completed');
    }

    if (this.profiles !== undefined) {
      // Warm the profile cache during verification; the discarded result means
      // a lookup failure can never fail verification.
      await this.profiles.findProfileById(player.uuid).catch((): undefined => undefined);
    }

    return {
      status: 'resolved',
      ...(confirmCode === undefined ? {} : { confirmCode }),
      ...(claim.clientName === undefined ? {} : { appName: claim.clientName }),
    };
  }
}
