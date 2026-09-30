import { describe, expect, it } from 'vitest';

import {
  consoleAuthorizeUrl,
  consoleStatesEqual,
  createConsoleOidcTransaction,
  exchangeConsoleCode,
  fetchConsoleSubject,
  ConsoleOidcError,
  type ConsoleOidcEndpoints,
} from '../../src/api/developer-oidc-login.js';
import {
  CONSOLE_CLIENT_ID,
  CONSOLE_CLIENT_NAME,
  type ConsoleClientStore,
  ensureConsoleClient,
} from '../../src/developers/console-client.js';
import {
  resolveDeveloperIdentifier,
  resolveOwnerProfile,
} from '../../src/developers/developer-identifier.js';
import type { DeveloperAccess } from '../../src/developers/developer-repository.js';
import { DeveloperSessionService } from '../../src/developers/session-service.js';
import type {
  DeveloperSessionRecord,
  DeveloperSessionSummary,
} from '../../src/developers/session-store.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { SessionSignal } from '../../src/oauth/session-security.js';
import { createSessionSignal } from '../../src/oauth/session-security.js';

const uuid = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

function players(
  find: (name: string) => Promise<{ username: string; uuid: string } | undefined>,
): MinecraftPlayerLookup {
  return {
    findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
    findProfileByName: find,
  };
}

describe('resolveDeveloperIdentifier', (): void => {
  it('canonicalizes a dashed or compact UUID without a lookup', async (): Promise<void> => {
    const offline = players((): Promise<undefined> => Promise.resolve(undefined));

    await expect(resolveDeveloperIdentifier(uuid, offline)).resolves.toBe(uuid);
    await expect(resolveDeveloperIdentifier(uuid.replaceAll('-', ''), offline)).resolves.toBe(uuid);
  });

  it('resolves a Minecraft name through the player lookup', async (): Promise<void> => {
    const lookup = players((name) =>
      Promise.resolve(name === 'Notch' ? { username: 'Notch', uuid } : undefined),
    );

    await expect(resolveDeveloperIdentifier('Notch', lookup)).resolves.toBe(uuid);
    await expect(resolveDeveloperIdentifier('  Notch  ', lookup)).resolves.toBe(uuid);
  });

  it('returns undefined for an unknown name, an empty value, or no lookup', async (): Promise<void> => {
    const lookup = players((): Promise<undefined> => Promise.resolve(undefined));

    await expect(resolveDeveloperIdentifier('Nobody', lookup)).resolves.toBeUndefined();
    await expect(resolveDeveloperIdentifier('', lookup)).resolves.toBeUndefined();
    await expect(resolveDeveloperIdentifier('Notch', undefined)).resolves.toBeUndefined();
  });

  it('returns undefined when the player lookup fails', async (): Promise<void> => {
    const failing = players((): Promise<undefined> => Promise.reject(new Error('offline')));

    await expect(resolveDeveloperIdentifier('Notch', failing)).resolves.toBeUndefined();
  });
});

describe('resolveOwnerProfile', (): void => {
  it('canonicalizes a UUID and fills the username from the profile lookup', async (): Promise<void> => {
    const lookup: MinecraftPlayerLookup = {
      findProfileById: (id) =>
        Promise.resolve(id === uuid ? { username: 'Dastcz', uuid } : undefined),
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    };

    await expect(
      resolveOwnerProfile(uuid.replaceAll('-', '').toUpperCase(), lookup),
    ).resolves.toEqual({
      name: 'Dastcz',
      uuid,
    });
  });

  it('keeps the UUID as a display name when the profile lookup fails', async (): Promise<void> => {
    const lookup: MinecraftPlayerLookup = {
      findProfileById: (): Promise<undefined> => Promise.reject(new Error('offline')),
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    };

    await expect(resolveOwnerProfile(uuid, lookup)).resolves.toEqual({ name: uuid, uuid });
  });

  it('resolves a name into the canonical Mojang profile', async (): Promise<void> => {
    const lookup = players((name) =>
      Promise.resolve(name.toLowerCase() === 'dastcz' ? { username: 'Dastcz', uuid } : undefined),
    );

    await expect(resolveOwnerProfile(' dastcz ', lookup)).resolves.toEqual({
      name: 'Dastcz',
      uuid,
    });
  });

  it('returns undefined when unset, unknown, or unresolvable', async (): Promise<void> => {
    const lookup = players((): Promise<undefined> => Promise.resolve(undefined));

    await expect(resolveOwnerProfile(undefined, lookup)).resolves.toBeUndefined();
    await expect(resolveOwnerProfile('   ', lookup)).resolves.toBeUndefined();
    await expect(resolveOwnerProfile('Nobody', lookup)).resolves.toBeUndefined();
  });
});

type UpsertOptions = Parameters<ConsoleClientStore['app']['upsert']>[0];
type UpdateManyOptions = Parameters<ConsoleClientStore['app']['updateMany']>[0];

describe('ensureConsoleClient', (): void => {
  it('seeds the console atomically by its fixed client id', async (): Promise<void> => {
    const upserts: UpsertOptions[] = [];
    const updates: UpdateManyOptions[] = [];
    const store: ConsoleClientStore = {
      app: {
        upsert: (options: UpsertOptions): Promise<{ clientId: string; id: string }> => {
          upserts.push(options);
          return Promise.resolve({ clientId: options.create.clientId, id: 'internal-id' });
        },
        updateMany: (options: UpdateManyOptions): Promise<{ count: number }> => {
          updates.push(options);
          return Promise.resolve({ count: 1 });
        },
      },
    };

    const client = await ensureConsoleClient(store, 'https://craftlogin.com');

    expect(client).toEqual({
      clientId: CONSOLE_CLIENT_ID,
      redirectUri: 'https://craftlogin.com/developers/callback',
    });
    // One atomic upsert keyed on the stable client id — no separate create that could race.
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.where).toEqual({ clientId: CONSOLE_CLIENT_ID });
    expect(upserts[0]?.create).toMatchObject({
      clientId: CONSOLE_CLIENT_ID,
      clientSecretHash: null,
      name: CONSOLE_CLIENT_NAME,
      ownerUuid: null,
      redirectUris: ['https://craftlogin.com/developers/callback'],
    });
    expect(upserts[0]?.create.verifiedAt).toBeInstanceOf(Date);
    // The update path repairs name and callback but never touches ownership.
    expect(upserts[0]?.update).toEqual({
      name: CONSOLE_CLIENT_NAME,
      redirectUris: ['https://craftlogin.com/developers/callback'],
    });
    // The first-party label is restored only when it was stripped.
    expect(updates).toHaveLength(1);
    expect(updates[0]?.where).toEqual({ id: 'internal-id', verifiedAt: null });
  });

  it('adopts an unowned console client for the configured owner', async (): Promise<void> => {
    const ownerUuid = '4a11ca60-63b6-451f-82eb-50119d8e5052';
    const updates: UpdateManyOptions[] = [];
    const store: ConsoleClientStore = {
      app: {
        upsert: (options: UpsertOptions): Promise<{ clientId: string; id: string }> =>
          Promise.resolve({ clientId: options.create.clientId, id: 'internal-id' }),
        updateMany: (options: UpdateManyOptions): Promise<{ count: number }> => {
          updates.push(options);
          return Promise.resolve({ count: 1 });
        },
      },
    };

    await ensureConsoleClient(store, 'https://craftlogin.com', ownerUuid);

    expect(updates).toContainEqual({
      data: { ownerUuid },
      where: { id: 'internal-id', ownerUuid: null },
    });
  });
});

const endpoints: ConsoleOidcEndpoints = {
  authorizationEndpoint: 'https://craftlogin.com/oauth2/authorize',
  clientId: 'cl_console-test',
  redirectUri: 'https://craftlogin.com/developers/callback',
  tokenEndpoint: 'http://127.0.0.1:3000/oauth2/token',
  userInfoEndpoint: 'http://127.0.0.1:3000/oauth2/userinfo',
};

function stubFetch(handler: (url: string) => Response): typeof fetch {
  return (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return Promise.resolve(handler(url));
  };
}

describe('Developer Console OIDC client', (): void => {
  it('builds a standard authorization URL with S256 PKCE', (): void => {
    const transaction = createConsoleOidcTransaction();
    const url = new URL(consoleAuthorizeUrl(endpoints, transaction.state, transaction.challenge));

    expect(url.origin + url.pathname).toBe('https://craftlogin.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cl_console-test');
    expect(url.searchParams.get('redirect_uri')).toBe('https://craftlogin.com/developers/callback');
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe(transaction.state);
    expect(url.searchParams.get('code_challenge')).toBe(transaction.challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('compares callback states in constant time', (): void => {
    expect(consoleStatesEqual('correct-state', 'correct-state')).toBe(true);
    expect(consoleStatesEqual('correct-state', 'wrong-state!')).toBe(false);
    expect(consoleStatesEqual('short', 'much-longer-state')).toBe(false);
  });

  it('exchanges the code and reads the subject', async (): Promise<void> => {
    const calls: string[] = [];
    const fetchImplementation = stubFetch((url) => {
      calls.push(url);
      if (url.endsWith('/oauth2/token')) {
        return Response.json({ access_token: 'console-token', token_type: 'Bearer' });
      }
      return Response.json({ sub: '123e4567-e89b-42d3-a456-426614174000' });
    });
    const scoped = { ...endpoints, fetchImplementation };

    await expect(exchangeConsoleCode(scoped, 'code', 'verifier')).resolves.toBe('console-token');
    await expect(fetchConsoleSubject(scoped, 'console-token')).resolves.toBe(
      '123e4567-e89b-42d3-a456-426614174000',
    );
    expect(calls).toEqual([scoped.tokenEndpoint, scoped.userInfoEndpoint]);
  });

  it('rejects failed token and userinfo responses without details', async (): Promise<void> => {
    const failing = {
      ...endpoints,
      fetchImplementation: stubFetch(() => new Response('no', { status: 500 })),
    };
    await expect(exchangeConsoleCode(failing, 'code', 'verifier')).rejects.toBeInstanceOf(
      ConsoleOidcError,
    );
    await expect(fetchConsoleSubject(failing, 'token')).rejects.toBeInstanceOf(ConsoleOidcError);

    const malformed = {
      ...endpoints,
      fetchImplementation: stubFetch(() => Response.json({ unexpected: true })),
    };
    await expect(exchangeConsoleCode(malformed, 'code', 'verifier')).rejects.toBeInstanceOf(
      ConsoleOidcError,
    );
    await expect(fetchConsoleSubject(malformed, 'token')).rejects.toBeInstanceOf(ConsoleOidcError);
  });
});

const sessionUuid = '123e4567-e89b-42d3-a456-426614174000';
const sessionId = `ds_${'a'.repeat(43)}`;

class SessionStoreStub {
  public record: DeveloperSessionRecord | undefined = {
    expiresInSeconds: 3_600,
    ipReference: createSessionSignal('seed', '203.0.113.9', 'seed', 'k'.repeat(32)).ipReference,
    issuedAtMilliseconds: Date.now(),
    role: 'developer',
    sessionId,
    userAgent: 'Original Browser',
    userUuid: sessionUuid,
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

  public revokeByKeyId(keyId: string): Promise<void> {
    this.revoked.push(keyId);
    return Promise.resolve();
  }

  public keyIdFor(value: string): string {
    return `key:${value}`;
  }

  public listForUser(): Promise<DeveloperSessionSummary[]> {
    return Promise.resolve(
      this.record === undefined
        ? []
        : [
            {
              expiresInSeconds: this.record.expiresInSeconds,
              ipReference: this.record.ipReference,
              issuedAtMilliseconds: this.record.issuedAtMilliseconds,
              role: this.record.role,
              sessionKeyId: `key:${this.record.sessionId}`,
              userAgent: this.record.userAgent,
              userUuid: this.record.userUuid,
            },
          ],
    );
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
      uuid: sessionUuid,
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

    const original = await service.create(sessionUuid, 'developer', {
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
            uuid: sessionUuid,
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
    expect(anomalies[0]?.ipReference).toMatch(/^ip_[A-Za-z0-9_-]{22}$/u);
    expect(JSON.stringify(anomalies[0])).not.toContain('198.51.100');
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
