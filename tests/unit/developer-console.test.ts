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
      url: `/developers/callback?code=console-code&state=${state ?? ''}&iss=${encodeURIComponent('https://craftlogin.com')}`,
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
    expect(response.body).toContain('class="card consent-card"');
    expect(response.body).toContain('href="/assets/interaction.css"');
    expect(response.body).not.toContain('href="/assets/developer.css"');
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

  it('restarts the login when the callback issuer does not match', async (): Promise<void> => {
    const fetchCalls: string[] = [];
    const server = await buildServer({ authenticated: false, allowlisted: true, fetchCalls });
    const login = await server.inject({ method: 'GET', url: '/developers/login' });
    const state = new URL(login.headers.location ?? '').searchParams.get('state');
    const response = await server.inject({
      headers: { cookie: cookiePair(login.headers['set-cookie']) },
      method: 'GET',
      url: `/developers/callback?code=console-code&state=${state ?? ''}&iss=${encodeURIComponent('https://attacker.example')}`,
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

  it('lists an unverified application with a request link for its owner', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true, role: 'developer' });
    const response = await server.inject({ method: 'GET', url: '/developers' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('class="console-workspace"');
    expect(response.body).toContain('class="app-grid"');
    expect(response.body).toContain('class="app-card"');
    expect(response.body).toContain('<article>');
    expect(response.body).toContain('Not verified');
    expect(response.body).toContain(
      'href="/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification"',
    );
    expect(response.body).toContain('Request verification');
    expect(response.body).not.toContain('Verification requests');
  });

  it('renders the request form for an unverified application', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true, role: 'developer' });
    const response = await server.inject({
      method: 'GET',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Request application verification?');
    expect(response.body).toContain('name="note"');
    expect(response.body).toContain(
      'action="/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification"',
    );
  });

  it('refuses the request form once an application is queued or verified', async (): Promise<void> => {
    const queued = await buildServer({
      appVerification: 'requested',
      authenticated: true,
      role: 'developer',
    });
    const refused = await queued.inject({
      method: 'GET',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(refused.statusCode).toBe(303);
    expect(refused.headers.location).toBe('/developers?notice=verification-unavailable');
  });

  it('records a verification request with its note', async (): Promise<void> => {
    const requests: { actorUuid: string; id: string; note?: string }[] = [];
    const server = await buildServer({
      authenticated: true,
      requests,
      role: 'developer',
    });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&note=Used+by+the+community+wiki',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers?notice=verification-requested');
    expect(requests).toEqual([
      {
        actorUuid: developerSession.userUuid,
        id: '123e4567-e89b-42d3-a456-426614174001',
        note: 'Used by the community wiki',
      },
    ]);
  });

  it('drops a whitespace-only note and reports an application that is no longer requestable', async (): Promise<void> => {
    const requests: { actorUuid: string; id: string; note?: string }[] = [];
    const server = await buildServer({
      authenticated: true,
      requestOutcome: 'unavailable',
      requests,
      role: 'developer',
    });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&note=+%0A+',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers?notice=verification-unavailable');
    expect(requests).toEqual([
      { actorUuid: developerSession.userUuid, id: '123e4567-e89b-42d3-a456-426614174001' },
    ]);
  });

  it('rejects control characters in a verification note', async (): Promise<void> => {
    const requests: { actorUuid: string; id: string; note?: string }[] = [];
    const server = await buildServer({ authenticated: true, requests, role: 'developer' });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&note=Line%00break',
      url: '/developers/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers?notice=invalid-form');
    expect(requests).toEqual([]);
  });

  it('reviews a pending request from the administration queue', async (): Promise<void> => {
    const decisions: { decision: string; id: string }[] = [];
    const server = await buildServer({
      appVerification: 'requested',
      authenticated: true,
      decisions,
      verificationNote: 'Community wiki used by 500 players',
    });
    const dashboard = await server.inject({ method: 'GET', url: '/developers' });
    expect(dashboard.body).toContain('Verification requests');
    expect(dashboard.body).toContain('Review pending');
    expect(dashboard.body).toContain('Community wiki used by 500 players');

    const approved = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&decision=approve',
      url: '/developers/admin/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });
    expect(approved.statusCode).toBe(303);
    expect(approved.headers.location).toBe('/developers?notice=verification-approved');
    expect(decisions).toEqual([
      { decision: 'approve', id: '123e4567-e89b-42d3-a456-426614174001' },
    ]);
  });

  it('rejects an unknown decision without touching the application', async (): Promise<void> => {
    const decisions: { decision: string; id: string }[] = [];
    const server = await buildServer({ authenticated: true, decisions });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&decision=destroy',
      url: '/developers/admin/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers?notice=invalid-form');
    expect(decisions).toEqual([]);
  });

  it('withdraws an existing application verification', async (): Promise<void> => {
    const decisions: { decision: string; id: string }[] = [];
    const server = await buildServer({
      appVerification: 'verified',
      authenticated: true,
      decisions,
    });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&decision=revoke',
      url: '/developers/admin/apps/123e4567-e89b-42d3-a456-426614174001/verification',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers?notice=verification-revoked');
    expect(decisions).toEqual([{ decision: 'revoke', id: '123e4567-e89b-42d3-a456-426614174001' }]);
  });

  it('shows a verified badge for a verified application', async (): Promise<void> => {
    const server = await buildServer({ appVerification: 'verified', authenticated: true });
    const response = await server.inject({ method: 'GET', url: '/developers' });

    expect(response.body).toContain('verification-badge-verified');
    expect(response.body).toContain('Verified');
  });

  it('verifies and unverifies a developer from the administration panel', async (): Promise<void> => {
    const verificationChanges: { uuid: string; verified: boolean }[] = [];
    const server = await buildServer({
      authenticated: true,
      developerVerified: true,
      verificationChanges,
    });
    const dashboard = await server.inject({ method: 'GET', url: '/developers' });
    expect(dashboard.body).toContain('Verified developer');

    const removed = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&decision=revoke',
      url: `/developers/admin/developers/${developerSession.userUuid}/verification`,
    });
    expect(removed.statusCode).toBe(303);
    expect(removed.headers.location).toBe('/developers?notice=developer-unverified');
    expect(verificationChanges).toEqual([{ uuid: developerSession.userUuid, verified: false }]);
  });

  it('reports a developer verification decision that no longer applies', async (): Promise<void> => {
    const server = await buildServer({ authenticated: true, setVerifiedOutcome: false });
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'csrfToken=developer-csrf-token&decision=verify',
      url: `/developers/admin/developers/${developerSession.userUuid}/verification`,
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/developers?notice=verification-unavailable');
  });

  async function buildServer(options: {
    readonly allowlisted?: boolean;
    readonly appVerification?: 'none' | 'requested' | 'verified';
    readonly authenticated: boolean;
    readonly decisionOutcome?: 'applied' | 'unavailable';
    readonly decisions?: { decision: string; id: string }[];
    readonly developerVerified?: boolean;
    readonly fetchCalls?: string[];
    readonly grantCalls?: { role: DeveloperRole; uuid: string }[];
    readonly players?: MinecraftPlayerLookup;
    readonly requestOutcome?: 'applied' | 'unavailable';
    readonly requests?: { actorUuid: string; id: string; note?: string }[];
    readonly role?: DeveloperRole;
    readonly setVerifiedOutcome?: boolean;
    readonly tokenBehavior?: 'failure' | 'ok';
    readonly verificationChanges?: { uuid: string; verified: boolean }[];
    readonly verificationNote?: string;
  }): Promise<FastifyInstance> {
    const unavailable = (): never => {
      throw new Error('Unexpected developer console test dependency call');
    };
    const session: AuthenticatedDeveloperSession = {
      ...developerSession,
      role: options.role ?? developerSession.role,
    };
    const authentication = createAuthentication(options.authenticated, session);
    const app: ManagedApp = {
      clientId: 'cl_local-map',
      clientType: 'public',
      createdAt: '2026-09-07T12:00:00.000Z',
      id: '123e4567-e89b-42d3-a456-426614174001',
      name: 'Local map client',
      ownerUuid: developerSession.userUuid,
      redirectUris: ['https://client.example/callback'],
      verification: options.appVerification ?? 'none',
      ...(options.verificationNote === undefined
        ? {}
        : {
            verificationNote: options.verificationNote,
            verificationRequestedAt: '2026-09-08T09:00:00.000Z',
          }),
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
        decideVerification: (id, decision) => {
          options.decisions?.push({ decision, id });
          return Promise.resolve(options.decisionOutcome ?? 'applied');
        },
        list: (): Promise<readonly ManagedApp[]> => Promise.resolve([app]),
        remove: unavailable,
        requestVerification: (id, actorUuid, note) => {
          options.requests?.push({ actorUuid, id, ...(note === undefined ? {} : { note }) });
          return Promise.resolve(options.requestOutcome ?? 'applied');
        },
      },
      apps: { register: unavailable },
      clients: {
        findClient: unavailable,
        findClientOwnerUuid: unavailable,
        isAllowedOrigin: unavailable,
      },
      consoleClient: { clientId: consoleClientId },
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      developerAuthentication: authentication,
      developerSessions: {
        create: (): Promise<AuthenticatedDeveloperSession> => Promise.resolve(session),
      },
      developers: {
        find: (uuid) =>
          Promise.resolve(
            options.allowlisted === true && uuid === developerSession.userUuid
              ? {
                  createdAt: '2026-09-07T12:00:00.000Z',
                  role: 'admin' as const,
                  uuid,
                  verified: options.developerVerified ?? false,
                }
              : undefined,
          ),
        grant: (uuid, role) => {
          options.grantCalls?.push({ role, uuid });
          return Promise.resolve({
            createdAt: '2026-09-07T12:00:00.000Z',
            role,
            uuid,
            verified: false,
          });
        },
        list: () =>
          Promise.resolve([
            {
              createdAt: '2026-09-07T12:00:00.000Z',
              role: 'admin',
              uuid: developerSession.userUuid,
              verified: options.developerVerified ?? false,
            },
          ]),
        revoke: unavailable,
        setVerified: (uuid, verified) => {
          options.verificationChanges?.push({ uuid, verified });
          return Promise.resolve(options.setVerifiedOutcome ?? true);
        },
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

function createAuthentication(
  authenticated: boolean,
  session: AuthenticatedDeveloperSession,
): DeveloperAuthentication {
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
      return Promise.resolve(session);
    },
    logout: (): Promise<void> => Promise.resolve(),
    require: (): Promise<AuthenticatedDeveloperSession> =>
      authenticated
        ? Promise.resolve(session)
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
