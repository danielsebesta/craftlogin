import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import type { DeveloperAuthentication } from '../../src/api/developer-authentication.js';
import { ApiError } from '../../src/api/errors.js';
import { createApiServer } from '../../src/api/server.js';
import type { ManagedApp } from '../../src/developers/app-management.js';
import type { DeveloperRole } from '../../src/developers/developer-repository.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { SkinVerificationChallenge } from '../../src/verification/redis-skin-verification-store.js';
import type { VerificationStatus } from '../../src/verification/types.js';

const developerSession: AuthenticatedDeveloperSession = {
  csrfToken: 'developer-csrf-token',
  expiresInSeconds: 3_600,
  role: 'admin',
  sessionId: `ds_${'a'.repeat(43)}`,
  userUuid: '123e4567-e89b-42d3-a456-426614174000',
};

describe('Developer Console', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(async (server): Promise<void> => {
        await server.close();
      }),
    );
  });

  it('renders progressive Minecraft login and sets only a hardened pre-authentication cookie', async (): Promise<void> => {
    const server = await buildServer({ authenticated: false });
    const response = await server.inject({ method: 'GET', url: '/developers/login' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<h1 id="verification-heading">');
    expect(response.body).toContain('ABCDEFGH.craftlogin.com');
    expect(response.body).toContain('<noscript>');
    expect(response.body).toContain('/assets/interaction.js');
    expect(response.body).toContain('Or verify by changing your skin');
    expect(response.body).toContain('action="/developers/login/skin/start"');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("form-action 'self'");
    const loginCookie = response.headers['set-cookie'];
    expect(loginCookie).toContain('__Secure-craftlogin_developer_login=');
    expect(loginCookie).toContain('HttpOnly');
    expect(loginCookie).toContain('Secure');
    expect(loginCookie).toContain('SameSite=Lax');
  });

  it('reuses one pending login code across repeated page refreshes', async (): Promise<void> => {
    const loginCreations: string[] = [];
    const server = await buildServer({ authenticated: false, loginCreations });
    const first = await server.inject({ method: 'GET', url: '/developers/login' });
    const cookie = cookiePair(first.headers['set-cookie']);

    for (let index = 0; index < 20; index += 1) {
      const refresh = await server.inject({
        headers: { cookie },
        method: 'GET',
        url: '/developers/login',
      });
      expect(refresh.statusCode).toBe(200);
      expect(refresh.body).toContain('ABCDEFGH.craftlogin.com');
    }

    expect(loginCreations).toEqual([`dl_${'b'.repeat(43)}`]);
  });

  it('rate-limits only creation of new developer login attempts', async (): Promise<void> => {
    const loginCreations: string[] = [];
    const server = await buildServer({ authenticated: false, loginCreations });

    for (let index = 0; index < 10; index += 1) {
      const response = await server.inject({ method: 'GET', url: '/developers/login' });
      expect(response.statusCode).toBe(200);
    }
    const limited = await server.inject({ method: 'GET', url: '/developers/login' });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' },
    });
    expect(limited.headers['retry-after']).toBeTypeOf('string');
    expect(loginCreations).toHaveLength(10);
  });

  it('starts skin verification from the signed developer login attempt', async (): Promise<void> => {
    const skinStartCalls: { loginId: string; username: string }[] = [];
    const server = await buildServer({ authenticated: false, skinStartCalls });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const response = await server.inject({
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookiePair(login.headers['set-cookie']),
      },
      method: 'POST',
      payload: 'username=BuilderOne',
      url: '/developers/login/skin/start',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers/login');
    expect(skinStartCalls).toEqual([{ loginId: `dl_${'b'.repeat(43)}`, username: 'BuilderOne' }]);
  });

  it('renders, downloads, and checks an active developer skin challenge', async (): Promise<void> => {
    const challenge: SkinVerificationChallenge = {
      body: Buffer.from('marked-skin-png'),
      height: 64,
      markerHash: 'marker-hash',
      model: 'slim',
      status: 'pending',
      username: 'BuilderOne',
      userUuid: developerSession.userUuid,
    };
    const server = await buildServer({ authenticated: false, skinChallenge: challenge });
    const initial = await server.inject({ method: 'GET', url: '/developers/login' });
    const cookie = cookiePair(initial.headers['set-cookie']);
    const login = await server.inject({
      headers: { cookie },
      method: 'GET',
      url: '/developers/login',
    });

    expect(login.body).toContain('Verification skin for');
    expect(login.body).toContain('BuilderOne');
    expect(login.body).toContain('slim arms');
    expect(login.body).toContain('/developers/login/skin/download');
    expect(login.body).toContain('data-status-url="/developers/login/skin/status"');

    const download = await server.inject({
      headers: { cookie },
      method: 'GET',
      url: '/developers/login/skin/download',
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toBe(
      'attachment; filename="craftlogin-BuilderOne.png"',
    );
    expect(download.rawPayload).toEqual(challenge.body);

    const status = await server.inject({
      headers: { cookie },
      method: 'GET',
      url: '/developers/login/skin/status',
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ status: 'pending' });
  });

  it('consumes an unregistered Minecraft login without creating a console session', async (): Promise<void> => {
    const server = await buildServer({ authenticated: false, denyLogin: true });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const cookie = cookiePair(login.headers['set-cookie']);
    const response = await server.inject({
      headers: { cookie },
      method: 'POST',
      url: '/developers/login/complete',
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('This account is not on the list.');
    expect(response.headers['set-cookie']).not.toContain('__Host-craftlogin_developer_session=');
  });

  it('shows owned applications and the UUID registry to an administrator without JavaScript', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true });
    const response = await server.inject({ method: 'GET', url: '/developers' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<h1>Developer Console</h1>');
    expect(response.body).toContain('Local map client');
    expect(response.body).toContain('Access registry');
    expect(response.body).toContain(`value="${developerSession.csrfToken}"`);
    expect(response.body).not.toContain('<script');
    expect(response.headers['set-cookie']).toContain('__Host-craftlogin_developer_session=');
  });

  it('confirms application deletion before the destructive request', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true });
    const response = await server.inject({
      method: 'GET',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174001/delete',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Delete this application?');
    expect(response.body).toContain('value="developer-csrf-token"');
    expect(response.body).toContain(
      'action="/developers/apps/123e4567-e89b-42d3-a456-426614174001/delete"',
    );

    const missing = await server.inject({
      method: 'GET',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174099/delete',
    });
    expect(missing.statusCode).toBe(303);
    expect(missing.headers.location).toBe('/developers?notice=not-found');
  });

  it('renders inline HTML errors for invalid form input instead of JSON', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&clientType=public&redirectUris=',
      url: '/developers/apps',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(
      'Check the application name and redirect URIs, then try again.',
    );
    expect(response.body).toContain('<h1>Developer Console</h1>');
  });

  it('rejects anonymous client registration before application persistence', async (): Promise<void> => {
    const server = await buildServer({ authenticated: false });
    const response = await server.inject({
      headers: { 'x-csrf-token': 'attacker-token' },
      method: 'POST',
      payload: {
        clientType: 'public',
        name: 'Unauthorized client',
        redirectUris: ['https://client.example/callback'],
      },
      url: '/api/apps',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBeUndefined();
    expect(response.json()).toEqual({
      error: {
        code: 'developer_unauthorized',
        message: 'Sign in as a registered developer to continue.',
      },
    });
  });

  it('resolves a Minecraft username when granting developer access', async (): Promise<void> => {
    const grantCalls: { role: DeveloperRole; uuid: string }[] = [];
    const server = await buildServer({
      authenticated: true,
      grantCalls,
      players: {
        findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
        findProfileByName: (name) =>
          Promise.resolve(
            name === 'Notch'
              ? { username: 'Notch', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' }
              : undefined,
          ),
      },
    });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&role=developer&uuid=Notch',
      url: '/developers/admin/developers',
    });

    expect(response.statusCode).toBe(303);
    expect(grantCalls).toEqual([
      { role: 'developer', uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5' },
    ]);
  });

  async function buildServer(options: {
    readonly authenticated: boolean;
    readonly denyLogin?: boolean;
    readonly grantCalls?: { role: DeveloperRole; uuid: string }[];
    readonly loginCreations?: string[];
    readonly players?: MinecraftPlayerLookup;
    readonly skinChallenge?: SkinVerificationChallenge;
    readonly skinStartCalls?: { loginId: string; username: string }[];
    readonly skinStatus?: VerificationStatus;
  }): Promise<FastifyInstance> {
    const unavailable = (): never => {
      throw new Error('Unexpected developer console test dependency call');
    };
    const authentication = createAuthentication(options.authenticated);
    const app: ManagedApp = {
      clientId: 'cl_local-map',
      clientType: 'public',
      createdAt: '2026-09-07T12:00:00.000Z',
      id: '123e4567-e89b-42d3-a456-426614174001',
      name: 'Local map client',
      ownerUuid: developerSession.userUuid,
      redirectUris: ['https://client.example/callback'],
    };
    const server = await createApiServer({
      accessTokens: { authenticate: unavailable },
      appManager: {
        list: (): Promise<readonly ManagedApp[]> => Promise.resolve([app]),
        remove: unavailable,
      },
      apps: { register: unavailable },
      clients: { findClientName: unavailable, isAllowedOrigin: unavailable },
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      developerAuthentication: authentication,
      developerLogins: {
        complete: () =>
          Promise.resolve(
            options.denyLogin === true
              ? { status: 'denied' }
              : { session: developerSession, status: 'complete' },
          ),
        create: () => {
          const loginId = `dl_${'b'.repeat(43)}`;
          options.loginCreations?.push(loginId);
          return Promise.resolve({
            code: 'ABCDEFGH',
            loginId,
            status: 'pending',
          });
        },
        resume: (loginId) =>
          loginId === undefined
            ? Promise.resolve(undefined)
            : Promise.resolve({
                code: 'ABCDEFGH',
                loginId,
                ...(options.skinChallenge === undefined
                  ? {}
                  : {
                      skinChallenge: {
                        height: options.skinChallenge.height,
                        model: options.skinChallenge.model,
                        username: options.skinChallenge.username,
                      },
                    }),
                status: 'pending',
              }),
        startSkin: (loginId, username) => {
          options.skinStartCalls?.push({ loginId, username });
          return Promise.resolve(
            options.skinChallenge ?? {
              body: Buffer.from('marked-skin-png'),
              height: 64,
              markerHash: 'marker-hash',
              model: 'classic',
              status: 'pending',
              username,
              userUuid: developerSession.userUuid,
            },
          );
        },
        getSkinChallenge: () => Promise.resolve(options.skinChallenge),
        checkSkin: () =>
          Promise.resolve(options.skinStatus ?? { code: 'ABCDEFGH', status: 'pending' }),
        status: () => Promise.resolve({ code: 'ABCDEFGH', status: 'pending' }),
      },
      developers: {
        find: (): Promise<undefined> => Promise.resolve(undefined),
        grant: (uuid, role) => {
          options.grantCalls?.push({ role, uuid });
          return Promise.resolve({ createdAt: '2026-09-07T12:00:00.000Z', role, uuid });
        },
        list: () =>
          Promise.resolve([
            {
              createdAt: '2026-09-07T12:00:00.000Z',
              role: 'admin',
              uuid: developerSession.userUuid,
            },
          ]),
        revoke: unavailable,
      },
      interactions: {
        abort: unavailable,
        complete: unavailable,
        start: unavailable,
        status: unavailable,
      },
      issuer: 'https://craftlogin.com',
      minecraftBaseDomain: 'craftlogin.com',
      ...(options.players === undefined
        ? {}
        : {
            minecraft: {
              avatars: { findRawSkin: unavailable, render: unavailable },
              players: options.players,
              skins: { fetchSkin: (): Promise<undefined> => Promise.resolve(undefined) },
            },
          }),
      nodeEnvironment: 'test',
      oidcHandler: (_request: IncomingMessage, response: ServerResponse): void => {
        response.statusCode = 404;
        response.end();
      },
      readiness: { check: unavailable },
      users: { findCurrentUser: unavailable },
    });
    servers.push(server);
    await server.ready();
    return server;
  }
});

function createAuthentication(authenticated: boolean): DeveloperAuthentication {
  return {
    authenticate: (_request, reply): Promise<AuthenticatedDeveloperSession | undefined> => {
      if (!authenticated) {
        return Promise.resolve(undefined);
      }
      void reply.setCookie('__Host-craftlogin_developer_session', 'signed-test-session', {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      });
      return Promise.resolve(developerSession);
    },
    logout: (): Promise<void> => Promise.resolve(),
    require: (): Promise<AuthenticatedDeveloperSession> =>
      authenticated
        ? Promise.resolve(developerSession)
        : Promise.reject(
            new ApiError(
              401,
              'developer_unauthorized',
              'Sign in as a registered developer to continue.',
            ),
          ),
    requireAdministrator: (): void => undefined,
    requireCsrf: (): void => undefined,
  };
}

function cookiePair(setCookie: string | string[] | undefined): string {
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const pair = first?.split(';')[0];
  if (pair === undefined) {
    throw new Error('Expected a developer login cookie');
  }
  return pair;
}
