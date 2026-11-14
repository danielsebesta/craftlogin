import { request as httpRequest } from 'node:http';

import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ProviderAccessTokenAuthenticator } from '../../src/api/access-token-authenticator.js';
import { renderAuthorizationError } from '../../src/api/authorization-error-page.js';
import { renderLogoutPage, renderLogoutSuccessPage } from '../../src/api/logout-page.js';
import { createApiServer } from '../../src/api/server.js';
import { ProviderInteractionGateway } from '../../src/oauth/interaction-gateway.js';
import { OAuthInteractionService } from '../../src/oauth/interaction-service.js';
import { createCraftLoginProvider } from '../../src/oauth/provider.js';
import {
  accountId,
  challenge,
  createSigningKey,
  createTestAdapter,
  forwardTargetUrl,
  interactionChildUrl,
  localTestUrl,
  proxyHeaders,
  redirectUri,
  requiredLocation,
  verifier,
  VerifiedInteractionStore,
} from './support/oauth-flow-harness.js';
import { findAvailablePort } from './support/tcp-port.js';

const ONLINE_ACR = 'urn:craftlogin:minecraft-online-mode';
const SKIN_ACR = 'urn:craftlogin:minecraft-profile-skin';
const CONSOLE_CLIENT_ID = 'cl_developer_console';

const tokensSchema = z.object({ access_token: z.string(), id_token: z.string() });
const claimsSchema = z.object({ acr: z.string().optional(), amr: z.array(z.string()).optional() });

type CookieJar = Map<string, string>;

interface Harness {
  readonly createdSessions: readonly string[];
  readonly issuer: string;
  readonly port: number;
  readonly server: FastifyInstance;
  readonly verification: VerifiedInteractionStore;
}

function unavailable(): never {
  throw new Error('Unexpected dependency call during the identity hardening test');
}

function rememberCookies(jar: CookieJar, response: Response): void {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0] ?? '';
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value === '' || /max-age=0|expires=thu, 01 jan 1970/iu.test(cookie)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([name, value]): string => `${name}=${value}`).join('; ');
}

function idTokenClaims(idToken: string): z.infer<typeof claimsSchema> {
  const encoded = idToken.split('.')[1] ?? '';
  const payload: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  return claimsSchema.parse(payload);
}

async function buildHarness(trustProxy = true): Promise<Harness> {
  const port = await findAvailablePort();
  const issuer = `http://127.0.0.1:${port.toString()}`;
  const clientBase = {
    application_type: 'web' as const,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code' as const],
    token_endpoint_auth_method: 'none' as const,
  };
  const provider = createCraftLoginProvider({
    adapter: createTestAdapter({
      'first-client': { ...clientBase, client_id: 'first-client', redirect_uris: [redirectUri] },
      'strict-client': { ...clientBase, client_id: 'strict-client', redirect_uris: [redirectUri] },
      [CONSOLE_CLIENT_ID]: {
        ...clientBase,
        client_id: CONSOLE_CLIENT_ID,
        redirect_uris: [`${issuer}/developers/callback`],
      },
    }),
    cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
    findAccount: (_context, subject) =>
      Promise.resolve(
        subject === accountId
          ? {
              accountId,
              claims: (): { preferred_username: string; sub: string } => ({
                preferred_username: 'VerifiedPlayer',
                sub: accountId,
              }),
            }
          : undefined,
      ),
    issuer,
    jwks: { keys: [createSigningKey()] },
    logoutSource: renderLogoutPage,
    postLogoutSuccessSource: renderLogoutSuccessPage,
    renderError: renderAuthorizationError,
  });
  provider.proxy = true;
  const verification = new VerifiedInteractionStore();
  const createdSessions: string[] = [];
  const server = await createApiServer({
    icons: { findIcon: unavailable },
    accessTokens: new ProviderAccessTokenAuthenticator(provider),
    appManager: {
      decideVerification: unavailable,
      list: unavailable,
      remove: unavailable,
      removeIcon: unavailable,
      resetSecret: unavailable,
      setIcon: unavailable,
      setSkinVerification: unavailable,
      requestVerification: unavailable,
      updateRedirectUris: unavailable,
    },
    apps: { register: unavailable },
    clients: {
      findClient: () => Promise.resolve({ name: 'Test client', verified: false }),
      findClientOwnerUuid: () => Promise.resolve(undefined),
      isAllowedOrigin: () => Promise.resolve(false),
    },
    cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
    database: {
      oidcGrant: { updateMany: unavailable, findMany: unavailable },
      user: { deleteMany: unavailable },
    },
    developerAuthentication: {
      authenticate: () => Promise.resolve(undefined),
      logout: unavailable,
      require: unavailable,
      requireAdministrator: unavailable,
      requireCsrf: unavailable,
    },
    consoleClient: { clientId: CONSOLE_CLIENT_ID },
    developerSessions: {
      create: (uuid: string, role: 'admin' | 'developer') => {
        createdSessions.push(role);
        return Promise.resolve({
          csrfToken: 'csrf',
          expiresInSeconds: 60,
          role,
          sessionId: 'session',
          userUuid: uuid,
        });
      },
      list: () => Promise.resolve([]),
      revokeByKeyId: () => Promise.resolve(false),
    },
    developers: {
      find: (uuid: string) =>
        Promise.resolve(
          uuid === accountId
            ? { createdAt: '', role: 'admin' as const, uuid, verified: true }
            : undefined,
        ),
      grant: unavailable,
      list: unavailable,
      revoke: unavailable,
      setVerified: unavailable,
    },
    httpPort: port,
    interactions: new OAuthInteractionService(
      new ProviderInteractionGateway(provider),
      verification,
      { error: (): void => undefined },
      undefined,
      true,
    ),
    issuer,
    minecraftBaseDomain: 'craftlogin.com',
    nodeEnvironment: trustProxy ? 'test' : 'production',
    oidcHandler: provider.callback(),
    readiness: { check: () => Promise.resolve() },
    redis: { eval: unavailable, get: unavailable },
    trustProxy,
    users: {
      findCurrentUser: (uuid) =>
        Promise.resolve(
          uuid === accountId ? { username: 'VerifiedPlayer', uuid: accountId } : undefined,
        ),
    },
  });
  await server.listen({ host: '127.0.0.1', port });
  return { createdSessions, issuer, port, server, verification };
}

function authorizationRequest(issuer: string, clientId: string, acrValues?: string): URL {
  const url = new URL('/oauth2/authorize', issuer);
  url.search = new URLSearchParams({
    ...(acrValues === undefined ? {} : { acr_values: acrValues }),
    client_id: clientId,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state: 'client-state',
  }).toString();
  return url;
}

interface WalkResult {
  readonly callback: URL;
  /** How many interaction pages asked the player to verify again. */
  readonly loginPrompts: number;
}

async function walkToCallback(
  harness: Harness,
  start: URL,
  jar: CookieJar,
  callbackHost: string,
): Promise<WalkResult> {
  let next = start;
  let loginPrompts = 0;
  let lastInteractionId = harness.verification.interactionId;
  for (let step = 0; step < 12; step += 1) {
    const response = await fetch(next, {
      headers: proxyHeaders(cookieHeader(jar)),
      redirect: 'manual',
    });
    rememberCookies(jar, response);
    if ([302, 303, 307].includes(response.status)) {
      const target = new URL(requiredLocation(response), harness.issuer);
      if (target.host === callbackHost && target.pathname.endsWith('/callback')) {
        return { callback: target, loginPrompts };
      }
      next = localTestUrl(target.href, harness.issuer);
      continue;
    }
    if (response.status === 200 && next.pathname.startsWith('/interaction/')) {
      await response.text();
      // Only a login prompt allocates a verification record.
      if (harness.verification.interactionId !== lastInteractionId) {
        lastInteractionId = harness.verification.interactionId;
        loginPrompts += 1;
      }
      harness.verification.verified = true;
      const complete = await fetch(interactionChildUrl(next.pathname, 'complete', harness.issuer), {
        body: '',
        headers: {
          ...proxyHeaders(cookieHeader(jar)),
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        redirect: 'manual',
      });
      rememberCookies(jar, complete);
      expect(complete.status).toBe(200);
      next = localTestUrl(forwardTargetUrl(await complete.text()), harness.issuer);
      continue;
    }
    throw new Error(`Unexpected ${response.status.toString()} at ${next.pathname}`);
  }
  throw new Error('The authorization flow did not reach a callback');
}

async function redeem(harness: Harness, clientId: string, code: string | null): Promise<Response> {
  return await fetch(new URL('/oauth2/token', harness.issuer), {
    body: new URLSearchParams({
      client_id: clientId,
      code: code ?? '',
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-proto': 'https' },
    method: 'POST',
  });
}

async function signIn(
  harness: Harness,
  clientId: string,
  jar: CookieJar,
  acrValues?: string,
): Promise<WalkResult & { readonly tokens: z.infer<typeof tokensSchema> }> {
  const walk = await walkToCallback(
    harness,
    localTestUrl(authorizationRequest(harness.issuer, clientId, acrValues).href, harness.issuer),
    jar,
    'client.example',
  );
  const response = await redeem(harness, clientId, walk.callback.searchParams.get('code'));
  expect(response.status).toBe(200);
  return { ...walk, tokens: tokensSchema.parse(await response.json()) };
}

describe('Identity assurance', (): void => {
  let harness: Harness | undefined;

  afterEach(async (): Promise<void> => {
    await harness?.server.close();
    harness = undefined;
  });

  it('reports the verification method in the ID token without acr_values', async (): Promise<void> => {
    harness = await buildHarness();
    harness.verification.method = 'minecraft_profile_skin';

    const { tokens } = await signIn(harness, 'first-client', new Map());

    expect(idTokenClaims(tokens.id_token)).toMatchObject({
      acr: SKIN_ACR,
      amr: ['minecraft_profile_skin'],
    });
  }, 20_000);

  it('verifies again when a session does not satisfy the requested acr_values', async (): Promise<void> => {
    harness = await buildHarness();
    harness.verification.method = 'minecraft_profile_skin';
    const jar: CookieJar = new Map();
    await signIn(harness, 'first-client', jar);

    harness.verification.method = 'minecraft_online_mode';
    const strict = await signIn(harness, 'strict-client', jar, ONLINE_ACR);

    expect(strict.loginPrompts).toBe(1);
    expect(idTokenClaims(strict.tokens.id_token)).toMatchObject({
      acr: ONLINE_ACR,
      amr: ['minecraft_online_mode'],
    });
  }, 20_000);

  it('does not ask again when the session already satisfies acr_values', async (): Promise<void> => {
    harness = await buildHarness();
    harness.verification.method = 'minecraft_online_mode';
    const jar: CookieJar = new Map();
    await signIn(harness, 'first-client', jar);

    const strict = await signIn(harness, 'strict-client', jar, ONLINE_ACR);

    expect(strict.loginPrompts).toBe(0);
    expect(idTokenClaims(strict.tokens.id_token).acr).toBe(ONLINE_ACR);
  }, 20_000);

  it('revokes the grant when an authorization code is replayed', async (): Promise<void> => {
    harness = await buildHarness();
    const walk = await walkToCallback(
      harness,
      localTestUrl(authorizationRequest(harness.issuer, 'first-client').href, harness.issuer),
      new Map(),
      'client.example',
    );
    const code = walk.callback.searchParams.get('code');
    const first = await redeem(harness, 'first-client', code);
    const tokens = tokensSchema.parse(await first.json());

    const replay = await redeem(harness, 'first-client', code);

    expect(replay.status).toBe(400);
    const currentUser = await fetch(new URL('/api/users/@me', harness.issuer), {
      headers: { ...proxyHeaders(), authorization: `Bearer ${tokens.access_token}` },
    });
    expect(currentUser.status).toBe(401);
  }, 20_000);

  it('never reflects a foreign Host into discovery', async (): Promise<void> => {
    harness = await buildHarness(false);
    const { port } = harness;

    const body = await new Promise<string>((resolve, reject): void => {
      const request = httpRequest(
        {
          headers: { host: 'attacker.example' },
          host: '127.0.0.1',
          path: '/.well-known/openid-configuration',
          port,
        },
        (response): void => {
          let received = '';
          response.on('data', (chunk): void => {
            received += String(chunk);
          });
          response.on('end', (): void => {
            resolve(received);
          });
        },
      );
      request.on('error', reject);
      request.end();
    });

    expect(body).not.toContain('attacker.example');
    expect(body).toContain(`127.0.0.1:${port.toString()}/oauth2/authorize`);
  }, 20_000);
});

describe('Developer Console authentication', (): void => {
  let harness: Harness | undefined;

  afterEach(async (): Promise<void> => {
    await harness?.server.close();
    harness = undefined;
  });

  async function startConsoleLogin(active: Harness, jar: CookieJar): Promise<URL> {
    const login = await fetch(new URL('/developers/login', active.issuer), {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    rememberCookies(jar, login);
    return new URL(requiredLocation(login));
  }

  async function finishConsoleLogin(
    active: Harness,
    authorization: URL,
    jar: CookieJar,
  ): Promise<Response> {
    const { callback } = await walkToCallback(
      active,
      localTestUrl(authorization.href, active.issuer),
      jar,
      `127.0.0.1:${active.port.toString()}`,
    );
    return await fetch(localTestUrl(callback.href, active.issuer), {
      headers: proxyHeaders(cookieHeader(jar)),
      redirect: 'manual',
    });
  }

  it('asks only for methods that reach the player and accepts them', async (): Promise<void> => {
    harness = await buildHarness();
    harness.verification.method = 'minecraft_online_mode';
    const jar: CookieJar = new Map();

    const authorization = await startConsoleLogin(harness, jar);
    const acrValues = authorization.searchParams.get('acr_values');
    expect(acrValues).toContain(ONLINE_ACR);
    expect(acrValues).not.toContain(SKIN_ACR);

    const callback = await finishConsoleLogin(harness, authorization, jar);
    expect(callback.headers.get('location')).toBe('/developers');
    expect(harness.createdSessions).toEqual(['admin']);
  }, 20_000);

  it('refuses a skin sign-in even when the browser removes acr_values', async (): Promise<void> => {
    harness = await buildHarness();
    harness.verification.method = 'minecraft_profile_skin';
    const jar: CookieJar = new Map();

    const authorization = await startConsoleLogin(harness, jar);
    authorization.searchParams.delete('acr_values');

    const callback = await finishConsoleLogin(harness, authorization, jar);
    expect(callback.headers.get('location')).toBe('/developers/login');
    expect(harness.createdSessions).toEqual([]);
  }, 20_000);
});
