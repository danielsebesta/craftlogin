import { createHash, createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  accountDeleteToken,
  accountRevokeToken,
  OIDC_INTERACTION_COOKIE,
  OIDC_INTERACTION_SIGNATURE_COOKIE,
  OIDC_RESUME_COOKIE,
  OIDC_RESUME_SIGNATURE_COOKIE,
  OIDC_SESSION_COOKIE,
  OIDC_SESSION_SIGNATURE_COOKIE,
  revokeTokenMatches,
  signSessionCookieValue,
  verifiedSessionId,
} from '../../src/api/account-session.js';
import type { CurrentUser } from '../../src/api/current-user.js';
import { accountRevokeRateLimit } from '../../src/api/rate-limit.js';
import { createApiServer } from '../../src/api/server.js';
import { OwnerAccessError } from '../../src/developers/developer-repository.js';
import { english } from '../../src/locales/en.js';

const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const cookieKeys = ['a'.repeat(32), 'b'.repeat(32)];
const signingKey = cookieKeys[0] ?? 'key';
const accountUuid = '123e4567-e89b-42d3-a456-426614174000';
const sessionId = 'op-session-uid-1';
const clientId = `cl_${'c'.repeat(32)}`;
const otherClientId = `cl_${'d'.repeat(32)}`;

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** The exact Redis surface the OIDC adapters use; grant revokes are recorded. */
class FakeRedis {
  public readonly entries = new Map<string, string>();
  public readonly grantRevokes: string[] = [];

  public eval(...args: readonly unknown[]): Promise<unknown> {
    const keyCount = typeof args[1] === 'number' ? args[1] : 0;
    this.grantRevokes.push(...args.slice(2, 2 + keyCount).map(String));
    return Promise.resolve(1);
  }

  public get(key: unknown): Promise<string | null> {
    return Promise.resolve(this.entries.get(String(key)) ?? null);
  }

  // The signed session cookie carries the session's adapter record id (jti);
  // Session.get resolves it through adapter.find(), so the artifact is keyed
  // directly by that id — matching RedisOidcAdapter.artifactKey.
  public seedSession(jti: string, payload: Record<string, unknown>): void {
    const artifactKey = `craftlogin:oidc:artifact:Session:${digest(jti)}`;
    this.entries.set(
      artifactKey,
      JSON.stringify({
        grantKey: null,
        indexValue: null,
        payload,
        uidKey: null,
        userCodeKey: null,
      }),
    );
  }
}

interface StoredTokenRow {
  readonly adapterPayload: Record<string, unknown>;
  readonly app: { iconHash: string | null; name: string; verifiedAt: Date | null };
  readonly clientId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly grantIdHash: string;
  readonly userUuid: string;
}

interface FindManyCall {
  readonly where: {
    readonly clientId?: string;
    readonly expiresAt: { readonly gt: Date };
    readonly revokedAt: null;
    readonly userUuid: string;
  };
}

interface UpdateManyCall {
  readonly where: {
    readonly clientId?: string;
    readonly revokedAt: null;
    readonly userUuid: string;
  };
  readonly data: { readonly revokedAt: Date };
}

class FakeTokenStore {
  public readonly updateManyCalls: UpdateManyCall[] = [];
  public readonly findManyCalls: FindManyCall[] = [];
  public readonly rows: StoredTokenRow[] = [];

  public findMany(query: FindManyCall): Promise<readonly StoredTokenRow[]> {
    this.findManyCalls.push(query);
    const { where } = query;
    return Promise.resolve(
      this.rows.filter(
        (row): boolean =>
          row.userUuid === where.userUuid &&
          row.revokedAt === null &&
          row.expiresAt > where.expiresAt.gt &&
          (where.clientId === undefined || row.clientId === where.clientId),
      ),
    );
  }

  public updateMany(query: UpdateManyCall): Promise<{ count: number }> {
    this.updateManyCalls.push(query);
    let count = 0;
    this.rows.splice(
      0,
      this.rows.length,
      ...this.rows.map((row): StoredTokenRow => {
        if (
          row.userUuid === query.where.userUuid &&
          row.revokedAt === null &&
          (query.where.clientId === undefined || row.clientId === query.where.clientId)
        ) {
          count += 1;
          return { ...row, revokedAt: query.data.revokedAt };
        }
        return row;
      }),
    );
    return Promise.resolve({ count });
  }
}

class FakeUserStore {
  public readonly deletedUuids: string[] = [];

  public deleteMany(query: { where: { uuid: string } }): Promise<{ count: number }> {
    this.deletedUuids.push(query.where.uuid);
    return Promise.resolve({ count: 1 });
  }
}

function tokenRow(overrides: Partial<StoredTokenRow> = {}): StoredTokenRow {
  return {
    adapterPayload: { grantId: 'grant-one', iat: 1_757_000_000, scope: 'openid offline_access' },
    app: {
      iconHash: 'f'.repeat(64),
      name: 'Local map client',
      verifiedAt: new Date('2026-09-01T00:00:00Z'),
    },
    clientId,
    expiresAt: new Date(Date.now() + 3_600_000),
    revokedAt: null,
    grantIdHash: 'a'.repeat(64),
    userUuid: accountUuid,
    ...overrides,
  };
}

// Independent reimplementation of the keygrip signature (sha1 over the full
// "name=value" pair, matching koa/cookies) so the tests do not simply
// round-trip the implementation under test.
function sessionCookies(uid: string, key: string): Record<string, string> {
  const signature = createHmac('sha1', key)
    .update(`${OIDC_SESSION_COOKIE}=${uid}`, 'utf8')
    .digest('base64')
    .replaceAll('/', '_')
    .replaceAll('+', '-')
    .replace(/=+$/u, '');
  return {
    [OIDC_SESSION_COOKIE]: uid,
    [OIDC_SESSION_SIGNATURE_COOKIE]: signature,
  };
}

describe('account session cookie', (): void => {
  it('computes the exact keygrip signature a koa client would send', (): void => {
    // Pinned to the output of `new Keygrip([key]).sign('__Host-craftlogin_session=session-uid')`
    // — keygrip signs the whole "name=value" pair with HMAC-SHA1, base64url.
    const signature = signSessionCookieValue('session-uid', signingKey);
    expect(signature).toBe('fu2oWSAsFJsgydP5X6YAmzxhjBw');
    expect(signature).toMatch(/^[A-Za-z0-9_-]{27}$/u);
  });

  it('accepts a cookie signed by any configured rotation key', (): void => {
    for (const key of cookieKeys) {
      const request = { cookies: sessionCookies(sessionId, key) };
      expect(verifiedSessionId(request, cookieKeys)).toBe(sessionId);
    }
  });

  it('rejects a signature from an unknown key and missing cookies', (): void => {
    const forged = { cookies: sessionCookies(sessionId, 'not-a-configured-key') };
    expect(verifiedSessionId(forged, cookieKeys)).toBeUndefined();
    expect(verifiedSessionId({ cookies: {} }, cookieKeys)).toBeUndefined();
    expect(
      verifiedSessionId({ cookies: { [OIDC_SESSION_COOKIE]: sessionId } }, cookieKeys),
    ).toBeUndefined();
    expect(
      verifiedSessionId(
        { cookies: { [OIDC_SESSION_SIGNATURE_COOKIE]: 'x'.repeat(43) } },
        cookieKeys,
      ),
    ).toBeUndefined();
  });

  it('rejects a signature for a different cookie value', (): void => {
    const signed = sessionCookies(sessionId, signingKey);
    const tampered = {
      cookies: { ...signed, [OIDC_SESSION_COOKIE]: 'different-uid' },
    };
    expect(verifiedSessionId(tampered, cookieKeys)).toBeUndefined();
  });
});

describe('revoke token', (): void => {
  it('is bound to the session uid and client and compares in constant time', (): void => {
    const token = accountRevokeToken(signingKey, 'session-a', 'cl_client-a');
    expect(token).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      revokeTokenMatches(token, accountRevokeToken(signingKey, 'session-a', 'cl_client-a')),
    ).toBe(true);
    expect(
      revokeTokenMatches(token, accountRevokeToken(signingKey, 'session-b', 'cl_client-a')),
    ).toBe(false);
    expect(
      revokeTokenMatches(token, accountRevokeToken(signingKey, 'session-a', 'cl_client-b')),
    ).toBe(false);
    expect(revokeTokenMatches(token, token.slice(0, -1))).toBe(false);
  });
});

describe('account page', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(async (server): Promise<void> => {
        await server.close();
      }),
    );
  });

  it('shows a friendly sign-in prompt when there is no session cookie', async (): Promise<void> => {
    const server = await buildServer(servers);
    const response = await server.inject({ method: 'GET', url: '/account' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.body).toContain(english.account.notSignedIn.heading);
    expect(response.body).toContain(english.account.notSignedIn.homeAction);
    expect(response.body).toContain('href="/"');
    expect(response.body).not.toContain(english.account.connectedHeading);
  });

  it('shows the sign-in prompt for missing, malformed, or expired session state', async (): Promise<void> => {
    const redis = new FakeRedis();
    const server = await buildServer(servers, { redis });

    const unsigned = await server.inject({
      cookies: { [OIDC_SESSION_COOKIE]: sessionId },
      method: 'GET',
      url: '/account',
    });
    expect(unsigned.statusCode).toBe(200);
    expect(unsigned.body).toContain(english.account.notSignedIn.heading);

    const forged = await server.inject({
      cookies: sessionCookies(sessionId, 'not-a-configured-key'),
      method: 'GET',
      url: '/account',
    });
    expect(forged.body).toContain(english.account.notSignedIn.heading);

    // Valid signature but no Redis record: the session expired server-side.
    const expired = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      method: 'GET',
      url: '/account',
    });
    expect(expired.body).toContain(english.account.notSignedIn.heading);

    // A record that does not satisfy the session payload shape.
    redis.seedSession('weird-session', { kind: 'Session' });
    const malformed = await server.inject({
      cookies: sessionCookies('weird-session', signingKey),
      method: 'GET',
      url: '/account',
    });
    expect(malformed.body).toContain(english.account.notSignedIn.heading);
  });

  it('renders the Minecraft identity and connected apps grouped by client', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    tokens.rows.push(
      tokenRow(),
      tokenRow({
        adapterPayload: { grantId: 'grant-two', iat: 1_757_100_000, scope: 'openid profile' },
        grantIdHash: 'b'.repeat(64),
      }),
      tokenRow({
        adapterPayload: { grantId: 'grant-three', iat: 1_757_200_000, scope: 'openid' },
        app: { iconHash: null, name: 'Other app', verifiedAt: null },
        clientId: otherClientId,
        expiresAt: new Date(Date.now() + 7_200_000),
        grantIdHash: 'c'.repeat(64),
      }),
      // Expired and revoked rows never surface.
      tokenRow({
        clientId: `cl_${'e'.repeat(32)}`,
        expiresAt: new Date(Date.now() - 1_000),
        grantIdHash: 'd'.repeat(64),
      }),
      tokenRow({
        clientId: `cl_${'f'.repeat(32)}`,
        revokedAt: new Date(),
        grantIdHash: 'e'.repeat(64),
      }),
      // Another user's rows are invisible.
      tokenRow({
        app: { iconHash: null, name: 'Hidden app', verifiedAt: null },
        clientId: `cl_${'0'.repeat(32)}`,
        grantIdHash: '9'.repeat(64),
        userUuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
    );
    const server = await buildServer(servers, { redis, tokens });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      method: 'GET',
      url: '/account',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(english.account.heading);
    expect(response.body).toContain('VerifiedPlayer');
    expect(response.body).toContain(`<code>${accountUuid}</code>`);
    expect(response.body).toContain(`/api/avatars/${accountUuid}/face?size=64`);
    expect(response.body).toContain(english.account.connectedHeading);
    expect(response.body).toContain('Local map client');
    expect(response.body).toContain('Other app');
    expect(response.body).not.toContain('Hidden app');
    expect(response.body).toContain('verification-badge-verified');
    expect(response.body).toContain(`/api/apps/${clientId}/icon?v=${'f'.repeat(64)}`);
    expect(response.body).not.toContain(`/api/apps/${otherClientId}/icon`);
    // Two token rows for the first client collapse into one card.
    expect(response.body.match(/<h3 class="app-name">/g)).toHaveLength(2);
    expect(response.body).toContain(english.account.sessionsLabel);
    expect(response.body).toContain('<code>offline_access</code>');
    expect(response.body).toContain('<code>profile</code>');
    expect(response.body).toContain('aria-current="page"');
    // Every card carries its own revoke form bound to this session.
    expect(response.body).toContain('action="/account/revoke"');
    expect(response.body).toContain(`name="client" value="${clientId}"`);
    expect(response.body).toContain(`name="client" value="${otherClientId}"`);
    expect(response.body).toMatch(/name="token" value="[0-9a-f]{64}"/u);
    // Earliest iat of the group wins.
    expect(response.body).toContain(new Date(1_757_000_000 * 1_000).toISOString());
  });

  it('renders an empty state when nothing stays signed in', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const server = await buildServer(servers, { redis, tokens: new FakeTokenStore() });

    const response = await server.inject({
      // Signed under the rotated key: cookie-key rotation keeps sessions valid.
      cookies: sessionCookies(sessionId, cookieKeys[1] ?? 'key'),
      method: 'GET',
      url: '/account',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(english.account.emptyConnected);
    expect(response.body).toContain(english.account.durableNote);
    expect(response.body).not.toContain('action="/account/revoke"');
  });

  it('escapes application names', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    tokens.rows.push(
      tokenRow({ app: { iconHash: null, name: '<script>alert(1)</script>', verifiedAt: null } }),
    );
    const server = await buildServer(servers, { redis, tokens });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      method: 'GET',
      url: '/account',
    });

    expect(response.body).not.toContain('<script>alert(1)</script>');
    expect(response.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('still shows the UUID when the user record is missing', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const server = await buildServer(servers, { redis, user: 'missing' });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      method: 'GET',
      url: '/account',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(`<code>${accountUuid}</code>`);
    expect(response.body).not.toContain(english.account.usernameLabel);
  });

  it('shows the revoked notice after a redirect', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const server = await buildServer(servers, { redis, tokens: new FakeTokenStore() });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      method: 'GET',
      url: '/account?revoked=1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(english.account.revokedNotice);
  });
});

describe('account revoke', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(async (server): Promise<void> => {
        await server.close();
      }),
    );
  });

  it('redirects to the account page when the session is gone', async (): Promise<void> => {
    const tokens = new FakeTokenStore();
    const server = await buildServer(servers, { tokens });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `client=${clientId}&token=${'0'.repeat(64)}`,
      url: '/account/revoke',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/account');
    expect(tokens.updateManyCalls).toHaveLength(0);
  });

  it('rejects a token that does not match this session and client', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    tokens.rows.push(tokenRow());
    const server = await buildServer(servers, { redis, tokens });
    const cookies = sessionCookies(sessionId, signingKey);

    for (const candidate of [
      '0'.repeat(64),
      accountRevokeToken(signingKey, 'other-session', clientId),
      accountRevokeToken(signingKey, sessionId, otherClientId),
    ]) {
      const response = await server.inject({
        cookies,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        payload: `client=${clientId}&token=${candidate}`,
        url: '/account/revoke',
      });
      expect(response.statusCode).toBe(403);
      expect(errorResponseSchema.parse(response.json()).error.code).toBe('forbidden');
    }
    expect(tokens.updateManyCalls).toHaveLength(0);
    expect(tokens.rows).toHaveLength(1);
  });

  it('rejects malformed bodies before touching storage', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    tokens.rows.push(tokenRow());
    const server = await buildServer(servers, { redis, tokens });

    for (const payload of [
      `client=not-a-client&token=${'0'.repeat(64)}`,
      `client=${clientId}&token=not-hex`,
      `client=${clientId}`,
    ]) {
      const response = await server.inject({
        cookies: sessionCookies(sessionId, signingKey),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        payload,
        url: '/account/revoke',
      });
      expect(response.statusCode).toBe(400);
    }
    expect(tokens.updateManyCalls).toHaveLength(0);
  });

  it('removes every active session for the selected client and revokes its grants', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    tokens.rows.push(
      tokenRow(),
      tokenRow({ adapterPayload: { grantId: 'grant-two' }, grantIdHash: 'b'.repeat(64) }),
      tokenRow({
        adapterPayload: { grantId: 'other-user-grant' },
        grantIdHash: 'c'.repeat(64),
        userUuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      }),
      tokenRow({ clientId: otherClientId, grantIdHash: 'd'.repeat(64) }),
      tokenRow({ expiresAt: new Date(Date.now() - 1_000), grantIdHash: 'e'.repeat(64) }),
      tokenRow({ revokedAt: new Date(), grantIdHash: 'f'.repeat(64) }),
    );
    const server = await buildServer(servers, { redis, tokens });
    const token = accountRevokeToken(signingKey, sessionId, clientId);

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `client=${clientId}&token=${token}`,
      url: '/account/revoke',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/account?revoked=1');
    expect(tokens.updateManyCalls).toHaveLength(1);
    const call = tokens.updateManyCalls[0];
    expect(call?.where.clientId).toBe(clientId);
    expect(call?.where.userUuid).toBe(accountUuid);
    expect(call?.where.revokedAt).toBeNull();
    // Revocation leaves tombstones and covers expired grants as well.
    expect(
      tokens.rows
        .filter((row) => row.revokedAt === null)
        .map((row) => row.grantIdHash)
        .sort(),
    ).toEqual(['c'.repeat(64), 'd'.repeat(64)]);
    expect(tokens.findManyCalls).toHaveLength(0);
    expect(redis.grantRevokes).toHaveLength(0);
  });

  it('returns 303 unchanged when nothing active matches', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    const server = await buildServer(servers, { redis, tokens });
    const token = accountRevokeToken(signingKey, sessionId, clientId);

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `client=${clientId}&token=${token}`,
      url: '/account/revoke',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/account?revoked=1');
    expect(tokens.updateManyCalls).toHaveLength(1);
    expect(redis.grantRevokes).toHaveLength(0);
  });

  it('rate-limits revoke attempts', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const server = await buildServer(servers, { redis });
    const cookies = sessionCookies(sessionId, signingKey);
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };
    const payload = `client=${clientId}&token=${'0'.repeat(64)}`;

    for (let index = 0; index < accountRevokeRateLimit.max; index += 1) {
      const response = await server.inject({
        cookies,
        headers,
        method: 'POST',
        payload,
        url: '/account/revoke',
      });
      expect(response.statusCode).toBe(403);
    }
    const limited = await server.inject({
      cookies,
      headers,
      method: 'POST',
      payload,
      url: '/account/revoke',
    });
    expect(limited.statusCode).toBe(429);
  });
});

describe('account deletion', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(async (server): Promise<void> => {
        await server.close();
      }),
    );
  });

  it('renders a delete form bound to this session', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const server = await buildServer(servers, { redis });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      method: 'GET',
      url: '/account',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('action="/account/delete"');
    expect(response.body).toContain(`value="${accountDeleteToken(signingKey, sessionId)}"`);
  });

  it('redirects to the account page when the session is gone', async (): Promise<void> => {
    const userStore = new FakeUserStore();
    const server = await buildServer(servers, { userStore });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `token=${'0'.repeat(64)}`,
      url: '/account/delete',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/account');
    expect(userStore.deletedUuids).toHaveLength(0);
  });

  it('rejects foreign, malformed, and revoke-scoped tokens', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const userStore = new FakeUserStore();
    const server = await buildServer(servers, { redis, userStore });
    const cookies = sessionCookies(sessionId, signingKey);

    for (const candidate of [
      '0'.repeat(64),
      accountDeleteToken(signingKey, 'other-session'),
      // A service-revoke token must never authorize identity deletion.
      accountRevokeToken(signingKey, sessionId, clientId),
    ]) {
      const response = await server.inject({
        cookies,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        payload: `token=${candidate}`,
        url: '/account/delete',
      });
      expect(response.statusCode).toBe(403);
    }
    expect(userStore.deletedUuids).toHaveLength(0);
  });

  it('erases the identity, revokes grants, destroys the session, and clears cookies', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const tokens = new FakeTokenStore();
    tokens.rows.push(
      tokenRow(),
      tokenRow({ clientId: otherClientId, grantIdHash: 'b'.repeat(64) }),
    );
    const userStore = new FakeUserStore();
    const developerRevocations: string[] = [];
    const server = await buildServer(servers, {
      developerRevoke: (uuid): Promise<boolean> => {
        developerRevocations.push(uuid);
        return Promise.resolve(true);
      },
      redis,
      tokens,
      userStore,
    });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `token=${accountDeleteToken(signingKey, sessionId)}`,
      url: '/account/delete',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/account');
    expect(developerRevocations).toEqual([accountUuid]);
    // The durable refresh tokens are removed explicitly before the identity
    // row, without a client filter so every connected service is covered.
    expect(tokens.updateManyCalls).toHaveLength(1);
    const call = tokens.updateManyCalls[0];
    expect(call?.where.clientId).toBeUndefined();
    expect(call?.where.userUuid).toBe(accountUuid);
    expect(tokens.rows.every((row) => row.revokedAt !== null)).toBe(true);
    expect(userStore.deletedUuids).toEqual([accountUuid]);
    // Every active grant of the account was revoked on the Redis side, and the
    // session artifact itself was destroyed.
    expect(redis.grantRevokes).toEqual(
      expect.arrayContaining([`craftlogin:oidc:artifact:Session:${digest(sessionId)}`]),
    );
    const cleared = String(response.headers['set-cookie']);
    for (const name of [
      OIDC_SESSION_COOKIE,
      OIDC_SESSION_SIGNATURE_COOKIE,
      OIDC_INTERACTION_COOKIE,
      OIDC_INTERACTION_SIGNATURE_COOKIE,
      OIDC_RESUME_COOKIE,
      OIDC_RESUME_SIGNATURE_COOKIE,
    ]) {
      expect(cleared).toContain(`${name}=;`);
    }
  });

  it('still deletes the account when a developer role is protected', async (): Promise<void> => {
    const redis = new FakeRedis();
    redis.seedSession(sessionId, {
      accountId: accountUuid,
      iat: Math.floor(Date.now() / 1000) - 60,
      kind: 'Session',
    });
    const userStore = new FakeUserStore();
    const server = await buildServer(servers, {
      developerRevoke: (): Promise<boolean> =>
        Promise.reject(new OwnerAccessError('The configured owner cannot be revoked')),
      redis,
      userStore,
    });

    const response = await server.inject({
      cookies: sessionCookies(sessionId, signingKey),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `token=${accountDeleteToken(signingKey, sessionId)}`,
      url: '/account/delete',
    });

    expect(response.statusCode).toBe(303);
    expect(userStore.deletedUuids).toEqual([accountUuid]);
  });
});

function unavailable(): never {
  throw new Error('Unexpected account test dependency call');
}

async function buildServer(
  servers: FastifyInstance[],
  options: {
    readonly developerRevoke?: (uuid: string) => Promise<boolean>;
    readonly redis?: FakeRedis;
    readonly tokens?: FakeTokenStore;
    readonly user?: 'missing' | 'present';
    readonly userStore?: FakeUserStore;
  } = {},
): Promise<FastifyInstance> {
  const redis = options.redis ?? new FakeRedis();
  const tokens = options.tokens ?? new FakeTokenStore();
  const userStore = options.userStore ?? new FakeUserStore();
  const server = await createApiServer({
    icons: { findIcon: unavailable },
    accessTokens: { authenticate: unavailable },
    appManager: {
      decideVerification: unavailable,
      list: unavailable,
      remove: unavailable,
      removeIcon: unavailable,
      resetSecret: unavailable,
      setIcon: unavailable,
      requestVerification: unavailable,
      updateRedirectUris: unavailable,
    },
    apps: { register: unavailable },
    clients: {
      findClient: unavailable,
      findClientOwnerUuid: unavailable,
      isAllowedOrigin: unavailable,
    },
    cookieKeys,
    database: { oidcGrant: tokens, user: userStore },
    developerAuthentication: {
      authenticate: unavailable,
      logout: unavailable,
      require: unavailable,
      requireAdministrator: unavailable,
      requireCsrf: unavailable,
    },
    consoleClient: { clientId: 'cl_account-test-console' },
    developerSessions: {
      create: unavailable,
      list: (): Promise<never[]> => Promise.resolve([]),
      revokeByKeyId: (): Promise<boolean> => Promise.resolve(false),
    },
    developers: {
      find: unavailable,
      grant: unavailable,
      list: unavailable,
      revoke: options.developerRevoke ?? ((): Promise<boolean> => Promise.resolve(false)),
      setVerified: unavailable,
    },
    httpPort: 3000,
    interactions: {
      abort: unavailable,
      complete: unavailable,
      resetVerification: unavailable,
      start: unavailable,
      status: unavailable,
    },
    issuer: 'https://craftlogin.com',
    minecraftBaseDomain: 'craftlogin.com',
    nodeEnvironment: 'test',
    oidcHandler: (_request: IncomingMessage, response: ServerResponse): void => {
      response.statusCode = 404;
      response.end();
    },
    readiness: { check: unavailable },
    redis,
    users: {
      findCurrentUser: (uuid): Promise<CurrentUser | undefined> =>
        Promise.resolve(
          options.user === 'missing' ? undefined : { username: 'VerifiedPlayer', uuid },
        ),
    },
  });
  servers.push(server);
  await server.ready();
  return server;
}
