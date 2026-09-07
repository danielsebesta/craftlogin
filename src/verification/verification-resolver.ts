import type { VerifiedUserRepository } from '../users/verified-user-repository.js';
import type { RedisVerificationStore } from './redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer } from './types.js';

export type VerificationResolution = 'resolved' | 'unavailable';

export class VerificationResolutionError extends Error {
  public override readonly name = 'VerificationResolutionError';
}

export class VerificationResolver {
  public constructor(
    private readonly verificationStore: Pick<
      RedisVerificationStore,
      'claim' | 'complete' | 'release'
    >,
    private readonly users: VerifiedUserRepository,
  ) {}

  public async resolve(
    code: string,
    player: AuthenticatedMinecraftPlayer,
    verifiedAt: Date,
  ): Promise<VerificationResolution> {
    const claim = await this.verificationStore.claim(code);

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

    const completed = await this.verificationStore.complete(claim, player, verifiedAt);

    if (!completed) {
      throw new VerificationResolutionError('The verification claim could not be completed');
    }

    return 'resolved';
  }
}
