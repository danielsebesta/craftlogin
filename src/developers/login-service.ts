import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import {
  type RedisVerificationStore,
  VerificationStateError,
} from '../verification/redis-verification-store.js';
import type { SkinVerificationChallenge } from '../verification/redis-skin-verification-store.js';
import type {
  SkinVerificationLookup,
  SkinVerificationService,
} from '../verification/skin-verification-service.js';
import type { VerificationStatus } from '../verification/types.js';
import type { DeveloperAccessRepository } from './developer-repository.js';
import type {
  AuthenticatedDeveloperSession,
  DeveloperRequestSignal,
  DeveloperSessionService,
} from './session-service.js';

export const developerLoginIdSchema = z.string().regex(/^dl_[A-Za-z0-9_-]{43}$/u);

export interface DeveloperLoginAttempt {
  readonly code: string | null;
  readonly loginId: string;
  readonly status: 'pending' | 'verified';
  readonly skinChallenge?: DeveloperSkinChallenge;
}

export interface DeveloperSkinChallenge {
  readonly height: 32 | 64;
  readonly model: 'classic' | 'slim';
  readonly username: string;
}

export type DeveloperLoginCompletion =
  | { readonly status: 'complete'; readonly session: AuthenticatedDeveloperSession }
  | { readonly status: 'denied' }
  | { readonly status: 'expired' }
  | { readonly status: 'pending' };

export class DeveloperLoginService {
  public constructor(
    private readonly verification: Pick<
      RedisVerificationStore,
      'allocate' | 'claimVerified' | 'completeFinalization' | 'getStatus' | 'releaseFinalization'
    >,
    private readonly developers: Pick<DeveloperAccessRepository, 'find'>,
    private readonly sessions: Pick<DeveloperSessionService, 'create' | 'revoke'>,
    private readonly skinVerification?: Pick<
      SkinVerificationService,
      'check' | 'getChallenge' | 'start'
    > &
      Partial<Pick<SkinVerificationService, 'lookup'>>,
  ) {}

  public async resume(existingLoginId?: string): Promise<DeveloperLoginAttempt | undefined> {
    if (existingLoginId === undefined) {
      return undefined;
    }
    const parsed = developerLoginIdSchema.safeParse(existingLoginId);
    if (!parsed.success) {
      return undefined;
    }
    const existing = await this.verification.getStatus(parsed.data);
    if (existing.status === 'pending') {
      const skinChallenge = await this.readSkinChallenge(parsed.data);
      return {
        code: existing.code,
        loginId: parsed.data,
        status: 'pending',
        ...(skinChallenge === undefined ? {} : { skinChallenge }),
      };
    }
    if (existing.status === 'verified') {
      return { code: null, loginId: parsed.data, status: 'verified' };
    }
    return undefined;
  }

  public async create(): Promise<DeveloperLoginAttempt> {
    const loginId = `dl_${randomBytes(32).toString('base64url')}`;
    const code = await this.verification.allocate(loginId);
    return { code, loginId, status: 'pending' };
  }

  public async status(loginIdInput: string): Promise<VerificationStatus> {
    return await this.verification.getStatus(developerLoginIdSchema.parse(loginIdInput));
  }

  public async startSkin(loginIdInput: string, username: string): Promise<DeveloperSkinChallenge> {
    const loginId = developerLoginIdSchema.parse(loginIdInput);
    if (this.skinVerification === undefined) {
      throw new Error('Developer skin verification is unavailable');
    }
    const status = await this.verification.getStatus(loginId);
    if (status.status !== 'pending') {
      throw new VerificationStateError('Developer login is not pending');
    }
    return toDeveloperSkinChallenge(await this.skinVerification.start(loginId, username));
  }

  public async getSkinChallenge(
    loginIdInput: string,
  ): Promise<SkinVerificationChallenge | undefined> {
    const loginId = developerLoginIdSchema.parse(loginIdInput);
    return await this.skinVerification?.getChallenge(loginId);
  }

  public async checkSkin(loginIdInput: string): Promise<VerificationStatus> {
    const loginId = developerLoginIdSchema.parse(loginIdInput);
    if (this.skinVerification === undefined) {
      throw new Error('Developer skin verification is unavailable');
    }
    return await this.skinVerification.check(loginId);
  }

  public async lookupSkin(username: string): Promise<SkinVerificationLookup | undefined> {
    return this.skinVerification?.lookup === undefined
      ? undefined
      : await this.skinVerification.lookup(username);
  }

  public async complete(
    loginIdInput: string,
    requestSignal: DeveloperRequestSignal,
  ): Promise<DeveloperLoginCompletion> {
    const loginId = developerLoginIdSchema.parse(loginIdInput);
    const claim = await this.verification.claimVerified(loginId);
    if (claim === null) {
      const status = await this.verification.getStatus(loginId);
      return { status: status.status === 'expired' ? 'expired' : 'pending' };
    }

    let session: AuthenticatedDeveloperSession | undefined;
    try {
      const access = await this.developers.find(claim.player.uuid);
      if (access === undefined) {
        if (!(await this.verification.completeFinalization(claim))) {
          throw new Error('Denied developer login could not be finalized');
        }
        return { status: 'denied' };
      }

      session = await this.sessions.create(claim.player.uuid, access.role, requestSignal);
      if (!(await this.verification.completeFinalization(claim))) {
        throw new Error('Developer login finalization claim was lost');
      }
      return { session, status: 'complete' };
    } catch (error: unknown) {
      const recoveryErrors: unknown[] = [];
      try {
        if (session !== undefined) {
          await this.sessions.revoke(session.sessionId);
        }
      } catch (revokeError: unknown) {
        recoveryErrors.push(revokeError);
      }
      try {
        await this.verification.releaseFinalization(claim);
      } catch (releaseError: unknown) {
        recoveryErrors.push(releaseError);
      }
      if (recoveryErrors.length > 0) {
        throw new AggregateError([error, ...recoveryErrors], 'Developer login recovery failed', {
          cause: error,
        });
      }
      throw error;
    }
  }

  private async readSkinChallenge(loginId: string): Promise<DeveloperSkinChallenge | undefined> {
    const challenge = await this.skinVerification?.getChallenge(loginId);
    return challenge === undefined ? undefined : toDeveloperSkinChallenge(challenge);
  }
}

function toDeveloperSkinChallenge(challenge: SkinVerificationChallenge): DeveloperSkinChallenge {
  return {
    height: challenge.height,
    model: challenge.model,
    username: challenge.username,
  };
}
