import { describe, expect, it } from 'vitest';

import type { DeveloperAccess } from '../../src/developers/developer-repository.js';
import { DeveloperLoginService } from '../../src/developers/login-service.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';
import type { VerificationFinalizationClaim } from '../../src/verification/redis-verification-store.js';
import type { VerificationStatus } from '../../src/verification/types.js';

const player = {
  username: 'BuilderOne',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
};
const claim: VerificationFinalizationClaim = {
  claimId: 'claim-id',
  interactionKey: 'interaction-key',
  player,
  resolvedAt: '2026-09-07T12:00:00.000Z',
};
const requestSignal = { ipAddress: '203.0.113.8', userAgent: 'Test Browser' };

class VerificationStub {
  public claim: VerificationFinalizationClaim | null = claim;
  public completed = 0;
  public released = 0;
  public statusValue: VerificationStatus = {
    player,
    resolvedAt: claim.resolvedAt,
    status: 'verified',
  };

  public allocate(): Promise<string> {
    return Promise.resolve('ABCDEFGH');
  }

  public claimVerified(): Promise<VerificationFinalizationClaim | null> {
    return Promise.resolve(this.claim);
  }

  public completeFinalization(): Promise<boolean> {
    this.completed += 1;
    return Promise.resolve(true);
  }

  public getStatus(): Promise<VerificationStatus> {
    return Promise.resolve(this.statusValue);
  }

  public releaseFinalization(): Promise<boolean> {
    this.released += 1;
    return Promise.resolve(true);
  }
}

class SessionStub {
  public created = 0;
  public revoked: string[] = [];
  public readonly session: AuthenticatedDeveloperSession = {
    csrfToken: 'csrf-token',
    expiresInSeconds: 60,
    role: 'developer',
    sessionId: `ds_${'a'.repeat(43)}`,
    userUuid: player.uuid,
  };

  public create(): Promise<AuthenticatedDeveloperSession> {
    this.created += 1;
    return Promise.resolve(this.session);
  }

  public revoke(sessionId: string): Promise<void> {
    this.revoked.push(sessionId);
    return Promise.resolve();
  }
}

describe('DeveloperLoginService', (): void => {
  it('consumes a verified login but denies UUIDs outside the developer registry', async (): Promise<void> => {
    const verification = new VerificationStub();
    const sessions = new SessionStub();
    const service = new DeveloperLoginService(
      verification,
      { find: (): Promise<undefined> => Promise.resolve(undefined) },
      sessions,
    );

    await expect(service.complete(validLoginId(), requestSignal)).resolves.toEqual({
      status: 'denied',
    });
    expect(verification.completed).toBe(1);
    expect(verification.released).toBe(0);
    expect(sessions.created).toBe(0);
  });

  it('creates a new privileged session only after finding registered access', async (): Promise<void> => {
    const verification = new VerificationStub();
    const sessions = new SessionStub();
    const access: DeveloperAccess = {
      createdAt: '2026-09-07T10:00:00.000Z',
      role: 'developer',
      uuid: player.uuid,
    };
    const service = new DeveloperLoginService(
      verification,
      { find: (): Promise<DeveloperAccess> => Promise.resolve(access) },
      sessions,
    );

    await expect(service.complete(validLoginId(), requestSignal)).resolves.toEqual({
      session: sessions.session,
      status: 'complete',
    });
    expect(verification.completed).toBe(1);
    expect(sessions.created).toBe(1);
  });

  it('releases the verification claim and revokes the session when finalization fails', async (): Promise<void> => {
    const verification = new VerificationStub();
    verification.completeFinalization = (): Promise<boolean> => Promise.resolve(false);
    const sessions = new SessionStub();
    const service = new DeveloperLoginService(
      verification,
      {
        find: (): Promise<DeveloperAccess> =>
          Promise.resolve({
            createdAt: '2026-09-07T10:00:00.000Z',
            role: 'admin',
            uuid: player.uuid,
          }),
      },
      sessions,
    );

    await expect(service.complete(validLoginId(), requestSignal)).rejects.toThrow(
      'finalization claim was lost',
    );
    expect(verification.released).toBe(1);
    expect(sessions.revoked).toEqual([sessions.session.sessionId]);
  });

  it('reuses pending attempts and replaces expired attempts', async (): Promise<void> => {
    const verification = new VerificationStub();
    verification.statusValue = { code: 'ABCDEFGH', status: 'pending' };
    const service = new DeveloperLoginService(
      verification,
      { find: (): Promise<undefined> => Promise.resolve(undefined) },
      new SessionStub(),
    );
    const existingId = validLoginId();

    await expect(service.start(existingId)).resolves.toEqual({
      code: 'ABCDEFGH',
      loginId: existingId,
      status: 'pending',
    });

    verification.statusValue = { status: 'expired' };
    const replacement = await service.start(existingId);
    expect(replacement.loginId).not.toBe(existingId);
    expect(replacement.loginId).toMatch(/^dl_[A-Za-z0-9_-]{43}$/u);
  });
});

function validLoginId(): string {
  return `dl_${'b'.repeat(43)}`;
}
