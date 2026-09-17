import { describe, expect, it } from 'vitest';

import type { DeveloperAccess } from '../../src/developers/developer-repository.js';
import { DeveloperSessionService } from '../../src/developers/session-service.js';
import type { DeveloperSessionRecord } from '../../src/developers/session-store.js';
import type { SessionSignal } from '../../src/oauth/session-security.js';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const sessionId = `ds_${'a'.repeat(43)}`;

class SessionStoreStub {
  public record: DeveloperSessionRecord | undefined = {
    expiresInSeconds: 3_600,
    ipAddress: '203.0.113.9',
    issuedAtMilliseconds: Date.now(),
    role: 'developer',
    sessionId,
    userAgent: 'Original Browser',
    userUuid: uuid,
  };
  public revoked: string[] = [];

  public create(): Promise<DeveloperSessionRecord> {
    if (this.record === undefined) {
      throw new Error('Missing test session record');
    }
    return Promise.resolve(this.record);
  }

  public read(): Promise<DeveloperSessionRecord | undefined> {
    return Promise.resolve(this.record);
  }

  public revoke(value: string): Promise<void> {
    this.revoked.push(value);
    return Promise.resolve();
  }

  public rotateRole(
    _current: string,
    role: 'admin' | 'developer',
  ): Promise<DeveloperSessionRecord | undefined> {
    if (this.record === undefined) {
      return Promise.resolve(undefined);
    }
    this.record = { ...this.record, role, sessionId: `ds_${'c'.repeat(43)}` };
    return Promise.resolve(this.record);
  }
}

describe('DeveloperSessionService', (): void => {
  it('rotates a live session after a role change and rotates its CSRF token', async (): Promise<void> => {
    const store = new SessionStoreStub();
    const signals: (SessionSignal & { readonly event: string })[] = [];
    const access: DeveloperAccess = {
      createdAt: '2026-09-07T00:00:00.000Z',
      role: 'admin',
      uuid,
      verified: false,
    };
    const service = new DeveloperSessionService(
      store,
      { find: (): Promise<DeveloperAccess> => Promise.resolve(access) },
      {
        info: (signal): void => {
          signals.push(signal);
        },
        warn: (): void => undefined,
      },
      'k'.repeat(32),
    );

    const original = await service.create(uuid, 'developer', {
      ipAddress: '203.0.113.9',
      userAgent: 'Original Browser',
    });
    const authenticated = await service.authenticate(sessionId, {
      ipAddress: '203.0.113.9',
      userAgent: 'Original Browser',
    });

    expect(authenticated?.role).toBe('admin');
    expect(authenticated?.sessionId).not.toBe(sessionId);
    expect(authenticated?.csrfToken).not.toBe(original.csrfToken);
    expect(signals.some((signal): boolean => signal.event === 'developer_session_rotated')).toBe(
      true,
    );
  });

  it('logs changed request signals without invalidating the session', async (): Promise<void> => {
    const store = new SessionStoreStub();
    const anomalies: (SessionSignal & { readonly event: string })[] = [];
    const service = new DeveloperSessionService(
      store,
      {
        find: (): Promise<DeveloperAccess> =>
          Promise.resolve({
            createdAt: '2026-09-07T00:00:00.000Z',
            role: 'developer',
            uuid,
            verified: false,
          }),
      },
      {
        info: (): void => undefined,
        warn: (signal): void => {
          anomalies.push(signal);
        },
      },
      'k'.repeat(32),
    );

    await expect(
      service.authenticate(sessionId, {
        ipAddress: '198.51.100.22',
        userAgent: 'Different Browser',
      }),
    ).resolves.toBeDefined();
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.ipAddress).toBe('198.51.100.22');
  });

  it('revokes access immediately when the UUID leaves the registry', async (): Promise<void> => {
    const store = new SessionStoreStub();
    const service = new DeveloperSessionService(
      store,
      { find: (): Promise<undefined> => Promise.resolve(undefined) },
      { info: (): void => undefined, warn: (): void => undefined },
      'k'.repeat(32),
    );

    await expect(
      service.authenticate(sessionId, {
        ipAddress: '203.0.113.9',
        userAgent: 'Original Browser',
      }),
    ).resolves.toBeUndefined();
    expect(store.revoked).toEqual([sessionId]);
  });
});
