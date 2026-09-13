import { describe, expect, it } from 'vitest';

import type { DeveloperAccess } from '../../src/developers/developer-repository.js';
import { DeveloperLoginService } from '../../src/developers/login-service.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';
import type { VerificationFinalizationClaim } from '../../src/verification/redis-verification-store.js';
import type { SkinVerificationChallenge } from '../../src/verification/redis-skin-verification-store.js';
import type { VerificationStatus } from '../../src/verification/types.js';

const player = {
  username: 'BuilderOne',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
};
const claim: VerificationFinalizationClaim = {
  claimId: 'claim-id',
  interactionKey: 'interaction-key',
  method: 'minecraft_online_mode',
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

  it('resumes pending attempts and creates replacements for expired attempts', async (): Promise<void> => {
    const verification = new VerificationStub();
    verification.statusValue = { code: 'ABCDEFGH', status: 'pending' };
    const service = new DeveloperLoginService(
      verification,
      { find: (): Promise<undefined> => Promise.resolve(undefined) },
      new SessionStub(),
    );
    const existingId = validLoginId();

    await expect(service.resume(existingId)).resolves.toEqual({
      code: 'ABCDEFGH',
      loginId: existingId,
      status: 'pending',
    });

    verification.statusValue = { status: 'expired' };
    await expect(service.resume(existingId)).resolves.toBeUndefined();
    const replacement = await service.create();
    expect(replacement.loginId).not.toBe(existingId);
    expect(replacement.loginId).toMatch(/^dl_[A-Za-z0-9_-]{43}$/u);
  });

  it('reuses a skin challenge and delegates skin checks for the same login attempt', async (): Promise<void> => {
    const verification = new VerificationStub();
    verification.statusValue = { code: 'ABCDEFGH', status: 'pending' };
    const challenge: SkinVerificationChallenge = {
      body: Buffer.from('marked-skin'),
      height: 64,
      markerHash: 'marker-hash',
      model: 'slim',
      status: 'pending',
      username: player.username,
      userUuid: player.uuid,
    };
    const calls: { operation: string; loginId: string; username?: string }[] = [];
    const service = new DeveloperLoginService(
      verification,
      { find: (): Promise<undefined> => Promise.resolve(undefined) },
      new SessionStub(),
      {
        check: (loginId): Promise<VerificationStatus> => {
          calls.push({ loginId, operation: 'check' });
          return Promise.resolve({ code: 'ABCDEFGH', status: 'pending' });
        },
        getChallenge: (loginId): Promise<SkinVerificationChallenge> => {
          calls.push({ loginId, operation: 'get' });
          return Promise.resolve(challenge);
        },
        start: (loginId, username): Promise<SkinVerificationChallenge> => {
          calls.push({ loginId, operation: 'start', username });
          return Promise.resolve(challenge);
        },
      },
    );
    const loginId = validLoginId();

    await expect(service.resume(loginId)).resolves.toMatchObject({
      code: 'ABCDEFGH',
      loginId,
      skinChallenge: { height: 64, model: 'slim', username: player.username },
      status: 'pending',
    });
    await expect(service.startSkin(loginId, player.username)).resolves.toEqual({
      height: 64,
      model: 'slim',
      username: player.username,
    });
    await expect(service.checkSkin(loginId)).resolves.toEqual({
      code: 'ABCDEFGH',
      status: 'pending',
    });
    expect(calls).toEqual([
      { loginId, operation: 'get' },
      { loginId, operation: 'start', username: player.username },
      { loginId, operation: 'check' },
    ]);

    verification.statusValue = { status: 'expired' };
    await expect(service.startSkin(loginId, player.username)).rejects.toThrow(
      'Developer login is not pending',
    );
    expect(calls).toHaveLength(3);
  });
});

function validLoginId(): string {
  return `dl_${'b'.repeat(43)}`;
}
