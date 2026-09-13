import { InvalidSkinImageError } from '../avatars/skin-texture.js';
import {
  MinecraftSignatureError,
  MinecraftUnavailableError,
  type FreshMinecraftPlayerLookup,
  type MinecraftPlayerLookup,
} from '../mojang/client.js';
import { MinecraftSkinUnavailableError, type SkinStore } from '../mojang/skin-store.js';
import type { VerifiedUserRepository } from '../users/verified-user-repository.js';
import type { RedisVerificationStore, VerificationClaim } from './redis-verification-store.js';
import type {
  RedisSkinVerificationStore,
  SkinVerificationChallenge,
  SkinVerificationCheckClaim,
} from './redis-skin-verification-store.js';
import {
  createFallbackJavaSkin,
  createSkinMarkerChallenge,
  skinMatchesMarker,
} from './skin-marker.js';
import type { VerificationStatus } from './types.js';

interface PrimaryVerificationStore {
  claimInteraction(interactionId: string): Promise<VerificationClaim | null>;
  complete(
    claim: VerificationClaim,
    player: { uuid: string; username: string },
    resolvedAt: Date,
    method?: 'minecraft_online_mode' | 'minecraft_profile_skin',
  ): Promise<boolean>;
  getStatus(interactionId: string): Promise<VerificationStatus>;
  release(claim: VerificationClaim): Promise<boolean>;
}

interface SkinChallengeStore {
  claimCheck(interactionId: string): Promise<SkinVerificationCheckClaim | null>;
  create(
    interactionId: string,
    challenge: Omit<SkinVerificationChallenge, 'status'>,
  ): Promise<SkinVerificationChallenge>;
  deleteClaimed(claim: SkinVerificationCheckClaim): Promise<boolean>;
  get(interactionId: string): Promise<SkinVerificationChallenge | undefined>;
  releaseCheck(claim: SkinVerificationCheckClaim): Promise<boolean>;
}

export interface SkinVerificationLogger {
  error(details: { readonly errorKind: string }, message: string): void;
}

export class SkinVerificationPlayerNotFoundError extends Error {
  public override readonly name = 'SkinVerificationPlayerNotFoundError';
}

export class SkinVerificationResolutionError extends Error {
  public override readonly name = 'SkinVerificationResolutionError';
}

export class SkinVerificationService {
  public constructor(
    private readonly challenges:
      | Pick<
          RedisSkinVerificationStore,
          'claimCheck' | 'create' | 'deleteClaimed' | 'get' | 'releaseCheck'
        >
      | SkinChallengeStore,
    private readonly verification:
      | Pick<RedisVerificationStore, 'claimInteraction' | 'complete' | 'getStatus' | 'release'>
      | PrimaryVerificationStore,
    private readonly players: MinecraftPlayerLookup & FreshMinecraftPlayerLookup,
    private readonly skins: SkinStore,
    private readonly users: VerifiedUserRepository,
    private readonly logger: SkinVerificationLogger,
  ) {}

  public async start(interactionId: string, username: string): Promise<SkinVerificationChallenge> {
    const existing = await this.challenges.get(interactionId);
    if (existing !== undefined) {
      return existing;
    }

    try {
      const namedProfile = await this.players.findProfileByName(username);
      if (namedProfile === undefined) {
        throw new SkinVerificationPlayerNotFoundError('The Minecraft player was not found');
      }
      const profile = await this.players.findProfileById(namedProfile.uuid);
      if (profile?.uuid !== namedProfile.uuid) {
        throw new SkinVerificationPlayerNotFoundError('The Minecraft player profile was not found');
      }

      const source =
        profile.texture === undefined
          ? await createFallbackJavaSkin()
          : (await this.skins.fetchSkin(profile.texture.hash))?.body;
      if (source === undefined) {
        throw new SkinVerificationResolutionError('The current Minecraft skin is unavailable');
      }
      const marked = await createSkinMarkerChallenge(source);
      return await this.challenges.create(interactionId, {
        body: marked.body,
        height: marked.height,
        markerHash: marked.markerHash,
        model: marked.height === 32 ? 'classic' : (profile.texture?.model ?? 'classic'),
        username: profile.username,
        userUuid: profile.uuid,
      });
    } catch (error: unknown) {
      throw normalizeMinecraftError(error);
    }
  }

  public async getChallenge(interactionId: string): Promise<SkinVerificationChallenge | undefined> {
    return await this.challenges.get(interactionId);
  }

  public async check(interactionId: string): Promise<VerificationStatus> {
    const claim = await this.challenges.claimCheck(interactionId);
    if (claim === null) {
      return await this.verification.getStatus(interactionId);
    }

    try {
      const profile = await this.players.findFreshProfileById(claim.userUuid);
      if (profile?.texture === undefined || profile.uuid !== claim.userUuid) {
        await this.releaseChallenge(claim);
        return await this.verification.getStatus(interactionId);
      }
      const skin = await this.skins.fetchSkin(profile.texture.hash);
      if (skin === undefined || !(await skinMatchesMarker(skin.body, claim.markerHash))) {
        await this.releaseChallenge(claim);
        return await this.verification.getStatus(interactionId);
      }

      return await this.resolve(interactionId, claim, {
        username: profile.username,
        uuid: profile.uuid,
      });
    } catch (error: unknown) {
      if (error instanceof SkinVerificationResolutionError) {
        throw error;
      }
      await this.releaseChallengeAfterFailure(claim, error);
      throw normalizeMinecraftError(error);
    }
  }

  private async resolve(
    interactionId: string,
    skinClaim: SkinVerificationCheckClaim,
    player: { readonly username: string; readonly uuid: string },
  ): Promise<VerificationStatus> {
    const verificationClaim = await this.verification.claimInteraction(interactionId);
    if (verificationClaim === null) {
      const status = await this.verification.getStatus(interactionId);
      if (status.status === 'pending') {
        await this.releaseChallenge(skinClaim);
      } else {
        await this.challenges.deleteClaimed(skinClaim);
      }
      return status;
    }

    const verifiedAt = new Date();
    try {
      await this.users.upsertVerifiedUser(player, verifiedAt);
    } catch (error: unknown) {
      await this.releaseResolutionClaims(verificationClaim, skinClaim, error);
      throw new SkinVerificationResolutionError('Skin verification user persistence failed', {
        cause: error,
      });
    }

    if (
      !(await this.verification.complete(
        verificationClaim,
        player,
        verifiedAt,
        'minecraft_profile_skin',
      ))
    ) {
      throw new SkinVerificationResolutionError('The skin verification claim could not complete');
    }
    if (!(await this.challenges.deleteClaimed(skinClaim))) {
      this.logger.error(
        { errorKind: 'SkinVerificationChallengeClaimLost' },
        'Resolved skin verification challenge cleanup was not applied',
      );
    }
    return { player, resolvedAt: verifiedAt.toISOString(), status: 'verified' };
  }

  private async releaseChallenge(claim: SkinVerificationCheckClaim): Promise<void> {
    if (!(await this.challenges.releaseCheck(claim))) {
      throw new SkinVerificationResolutionError('The skin verification check claim was lost');
    }
  }

  private async releaseChallengeAfterFailure(
    claim: SkinVerificationCheckClaim,
    originalError: unknown,
  ): Promise<void> {
    try {
      await this.releaseChallenge(claim);
    } catch (releaseError: unknown) {
      throw new SkinVerificationResolutionError(
        'The skin verification check could not be released',
        {
          cause: new AggregateError([originalError, releaseError]),
        },
      );
    }
  }

  private async releaseResolutionClaims(
    verificationClaim: VerificationClaim,
    skinClaim: SkinVerificationCheckClaim,
    originalError: unknown,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.verification.release(verificationClaim),
      this.challenges.releaseCheck(skinClaim),
    ]);
    const failures = results.filter(
      (result): boolean => result.status === 'rejected' || !result.value,
    );
    if (failures.length > 0) {
      throw new SkinVerificationResolutionError('Skin verification claims could not be released', {
        cause: new AggregateError([originalError, ...failures]),
      });
    }
  }
}

function normalizeMinecraftError(error: unknown): unknown {
  return error instanceof MinecraftUnavailableError ||
    error instanceof MinecraftSignatureError ||
    error instanceof MinecraftSkinUnavailableError ||
    error instanceof InvalidSkinImageError
    ? new SkinVerificationResolutionError('Minecraft skin verification is unavailable', {
        cause: error,
      })
    : error;
}
