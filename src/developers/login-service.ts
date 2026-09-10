import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import type { RedisVerificationStore } from '../verification/redis-verification-store.js';
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
  ) {}

  public async start(existingLoginId?: string): Promise<DeveloperLoginAttempt> {
    if (existingLoginId !== undefined) {
      const parsed = developerLoginIdSchema.safeParse(existingLoginId);
      if (parsed.success) {
        const existing = await this.verification.getStatus(parsed.data);
        if (existing.status === 'pending') {
          return {
            code: existing.code,
            loginId: parsed.data,
            status: 'pending',
          };
        }
        if (existing.status === 'verified') {
          return { code: null, loginId: parsed.data, status: 'verified' };
        }
      }
    }

    const loginId = `dl_${randomBytes(32).toString('base64url')}`;
    const code = await this.verification.allocate(loginId);
    return { code, loginId, status: 'pending' };
  }

  public async status(loginIdInput: string): Promise<VerificationStatus> {
    return await this.verification.getStatus(developerLoginIdSchema.parse(loginIdInput));
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
}
