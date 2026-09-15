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

const developerSession: AuthenticatedDeveloperSession = {
  csrfToken: 'developer-csrf-token',
  expiresInSeconds: 3_600,
  role: 'admin',
  sessionId: `ds_${'a'.repeat(43)}`,
  userUuid: '123e4567-e89b-42d3-a456-426614174000',
};

const consoleClientId = 'cl_console-test-client';

describe('Developer Console', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(async (server): Promise<void> => {
        await server.close();
      }),
    );
  });

  it('redirects anonymous developers into the standard authorization flow', async (): Promise<void> => {
    const server = await buildServer({ authenticated: false });
    const response = await server.inject({ method: 'GET', url: '/developers/login' });

    expect(response.statusCode).toBe(303);
    const location = response.headers.location ?? '';
    expect(location).toContain('https://craftlogin.com/oauth2/authorize?');
    expect(location).toContain(`client_id=${consoleClientId}`);
    expect(location).toContain('redirect_uri=https%3A%2F%2Fcraftlogin.com%2Fdevelopers%2Fcallback');
    expect(location).toContain('code_challenge_method=S256');
    expect(location).toContain('scope=openid');
    const cookie = response.headers['set-cookie'] ?? '';
    expect(cookie).toContain('__Secure-craftlogin_console_oauth=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('sends authenticated developers straight to the console', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true });
    const response = await server.inject({ method: 'GET', url: '/developers/login' });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers');
  });

  it('completes the standard code flow for an allowlisted developer', async (): Promise<void> => {
    const fetchCalls: string[] = [];
    const server = await buildServer({ authenticated: false, allowlisted: true, fetchCalls });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const state = new URL(login.headers.location ?? '').searchParams.get('state');
    expect(state).toBeTypeOf('string');
    const response = await server.inject({
      headers: { cookie: cookiePair(login.headers['set-cookie']) },
      method: 'GET',
      url: `/developers/callback?code=console-code&state=${state ?? ''}`,
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers');
    expect(setCookies(response.headers['set-cookie'])).toContain(
      '__Host-craftlogin_developer_session=',
    );
    expect(fetchCalls).toEqual([
      'http://127.0.0.1:3000/oauth2/token',
      'http://127.0.0.1:3000/oauth2/userinfo',
    ]);
  });

  it('shows the access-denied page when the Minecraft account is not allowlisted', async (): Promise<void> => {
    const server = await buildServer({ authenticated: false });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const state = new URL(login.headers.location ?? '').searchParams.get('state');
    const response = await server.inject({
      headers: { cookie: cookiePair(login.headers['set-cookie']) },
      method: 'GET',
      url: `/developers/callback?code=console-code&state=${state ?? ''}`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('This account is not on the list.');
    expect(setCookies(response.headers['set-cookie'])).not.toContain(
      '__Host-craftlogin_developer_session=',
    );
  });

  it('restarts the login when the callback state does not match', async (): Promise<void> => {
    const fetchCalls: string[] = [];
    const server = await buildServer({ authenticated: false, allowlisted: true, fetchCalls });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const response = await server.inject({
      headers: { cookie: cookiePair(login.headers['set-cookie']) },
      method: 'GET',
      url: '/developers/callback?code=console-code&state=tampered-state',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers/login');
    expect(fetchCalls).toEqual([]);
  });

  it('restarts the login when the provider reports an error', async (): Promise<void> => {
    const fetchCalls: string[] = [];
    const server = await buildServer({ authenticated: false, allowlisted: true, fetchCalls });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const state = new URL(login.headers.location ?? '').searchParams.get('state');
    const response = await server.inject({
      headers: { cookie: cookiePair(login.headers['set-cookie']) },
      method: 'GET',
      url: `/developers/callback?error=access_denied&state=${state ?? ''}`,
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers/login');
    expect(fetchCalls).toEqual([]);
  });

  it('restarts the login when the token exchange fails', async (): Promise<void> => {
    const server = await buildServer({
      authenticated: false,
      allowlisted: true,
      tokenBehavior: 'failure',
    });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const state = new URL(login.headers.location ?? '').searchParams.get('state');
    const response = await server.inject({
      headers: { cookie: cookiePair(login.headers['set-cookie']) },
      method: 'GET',
      url: `/developers/callback?code=console-code&state=${state ?? ''}`,
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers/login');
  });

  async function buildServer(options: {
    readonly allowlisted?: boolean;
    readonly authenticated: boolean;
    readonly fetchCalls?: string[];
    readonly grantCalls?: { role: DeveloperRole; uuid: string }[];
    readonly players?: MinecraftPlayerLookup;
    readonly tokenBehavior?: 'failure' | 'ok';
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
    const fetchImplementation: typeof fetch = (input, init) => {
      const target =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      options.fetchCalls?.push(target);
      if (options.tokenBehavior === 'failure' && target.endsWith('/oauth2/token')) {
        return Promise.resolve(new Response('unavailable', { status: 500 }));
      }
      if (target.endsWith('/oauth2/token')) {
        expect(init?.method).toBe('POST');
        return Promise.resolve(
          Response.json({ access_token: 'console-access-token', token_type: 'Bearer' }),
        );
      }
      return Promise.resolve(Response.json({ sub: developerSession.userUuid }));
    };
    const server = await createApiServer({
      accessTokens: { authenticate: unavailable },
      appManager: {
        list: (): Promise<readonly ManagedApp[]> => Promise.resolve([app]),
        remove: unavailable,
      },
      apps: { register: unavailable },
      clients: {
        findClientName: unavailable,
        findClientOwnerUuid: unavailable,
        isAllowedOrigin: unavailable,
      },
      consoleClient: { clientId: consoleClientId },
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      developerAuthentication: authentication,
      developerSessions: {
        create: (): Promise<AuthenticatedDeveloperSession> => Promise.resolve(developerSession),
      },
      developers: {
        find: (uuid) =>
          Promise.resolve(
            options.allowlisted === true && uuid === developerSession.userUuid
              ? {
                  createdAt: '2026-09-07T12:00:00.000Z',
                  role: 'admin' as const,
                  uuid,
                }
              : undefined,
          ),
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
      fetchImplementation,
      httpPort: 3000,
      interactions: {
        abort: unavailable,
        complete: unavailable,
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
      users: {
        findCurrentUser: (uuid) => Promise.resolve({ username: 'VerifiedPlayer', uuid }),
      },
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

function setCookies(setCookie: string | string[] | undefined): string {
  if (typeof setCookie === 'string') {
    return setCookie;
  }
  if (Array.isArray(setCookie)) {
    return setCookie.join(';');
  }
  return '';
}
