import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AuthenticatedAccessToken } from '../../src/api/access-token-authenticator.js';
import type { AppRegistrationInput, RegisteredApp } from '../../src/api/app-registration.js';
import type { CurrentUser } from '../../src/api/current-user.js';
import { ApiError } from '../../src/api/errors.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';
import type { ApiInteractionService } from '../../src/api/interaction-routes.js';
import {
  appRegistrationRateLimit,
  avatarRawRateLimit,
  avatarRenderRateLimit,
  tokenRateLimit,
  verificationStatusRateLimit,
} from '../../src/api/rate-limit.js';
import { createApiServer } from '../../src/api/server.js';
import type {
  OAuthInteractionAbortion,
  OAuthInteractionCompletion,
} from '../../src/oauth/interaction-service.js';
import type { VerificationStatus } from '../../src/verification/types.js';
import type { SkinVerificationChallenge } from '../../src/verification/redis-skin-verification-store.js';

const errorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
const avatarUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';

class InteractionStub implements ApiInteractionService {
  public abortion: OAuthInteractionAbortion = { redirectTo: '/oauth2/error?error=access_denied' };
  public completion: OAuthInteractionCompletion = { status: 'pending' };
  public statusValue: VerificationStatus = { status: 'pending', code: 'ABCDEFGH' };
  public expectedIds: (string | undefined)[] = [];
  public skinChallenge: SkinVerificationChallenge | undefined;
  public skinUsername: string | undefined;

  public abort(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionAbortion> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve(this.abortion);
  }

  public start(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<{
    clientId: string;
    code: string;
    interactionId: string;
    kind: 'login';
    scope: string;
    skinChallenge?: { height: 32 | 64; model: 'classic' | 'slim'; username: string };
    allowsSkinVerification: boolean;
    allowsOnlineVerification: boolean;
  }> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve({
      clientId: 'client-id',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      kind: 'login',
      scope: 'openid profile',
      allowsOnlineVerification: true,
      allowsSkinVerification: true,
      ...(this.skinChallenge === undefined
        ? {}
        : {
            skinChallenge: {
              height: this.skinChallenge.height,
              model: this.skinChallenge.model,
              username: this.skinChallenge.username,
            },
          }),
    });
  }

  public startSkin(
    _request: IncomingMessage,
    _response: ServerResponse,
    username: string,
    expectedInteractionId?: string,
  ): Promise<void> {
    this.expectedIds.push(expectedInteractionId);
    this.skinUsername = username;
    return Promise.resolve();
  }

  public getSkinChallenge(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<SkinVerificationChallenge | undefined> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve(this.skinChallenge);
  }

  public checkSkin(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve(this.statusValue);
  }

  public status(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<VerificationStatus> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve(this.statusValue);
  }

  public complete(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<OAuthInteractionCompletion> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve(this.completion);
  }
}

describe('CraftLogin API server', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(
      servers.splice(0).map(async (server): Promise<void> => {
        await server.close();
      }),
    );
  });

  it('serves a simple accessible project overview at the default route', async (): Promise<void> => {
    const server = await buildServer('development', new InteractionStub());
    const response = await server.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("font-src 'self'");
    expect(response.headers['content-security-policy']).toContain("img-src 'self'");
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body).toContain('<main id="main">');
    expect(response.body).toContain(
      '<h1 id="hero-heading">OIDC identity for Minecraft Java accounts</h1>',
    );
    expect(response.body).toContain('K7MPQ4RX.craftlogin.com');
    expect(response.body).toContain('href="/docs/"');
    expect(response.body).toContain('/assets/landing.css');
    expect(response.body).toContain('class="skip-link"');
    expect(response.body).toContain('name="color-scheme" content="dark"');
    expect(response.body).not.toContain('<script');

    const stylesheet = await server.inject({ method: 'GET', url: '/assets/landing.css' });
    expect(stylesheet.statusCode).toBe(200);
    expect(stylesheet.headers['content-type']).toContain('text/css');
    expect(stylesheet.headers['cache-control']).toBe('public, max-age=3600');
    expect(stylesheet.body).toContain('@font-face');
    expect(stylesheet.body).toContain('font-family: "Pixeloid Sans"');
    expect(stylesheet.body).toContain(':focus-visible');

    const font = await server.inject({
      method: 'GET',
      url: '/assets/fonts/pixeloid-sans-3a54c9da.woff2',
    });
    expect(font.statusCode).toBe(200);
    expect(font.headers['content-type']).toContain('font/woff2');
    expect(font.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(font.rawPayload.subarray(0, 4).toString('ascii')).toBe('wOF2');

    const fontLicense = await server.inject({ method: 'GET', url: '/assets/fonts/OFL.txt' });
    expect(fontLicense.statusCode).toBe(200);
    expect(fontLicense.body).toContain('SIL OPEN FONT LICENSE Version 1.1');

    const background = await server.inject({ method: 'GET', url: '/assets/background.svg' });
    expect(background.statusCode).toBe(200);
    expect(background.headers['content-type']).toContain('image/svg+xml');
    expect(background.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(background.body).toContain('<svg');
  });

  it('renders a secure semantic interaction page with a no-JavaScript fallback', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const server = await buildServer('test', interactions);
    const response = await server.inject({ method: 'GET', url: '/interaction/interaction-id' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('<main');
    expect(response.body).toContain('<h1 id="verification-heading">');
    expect(response.body).toContain('<noscript>');
    expect(response.body).toContain('ABCDEFGH.craftlogin.com');
    expect(response.body).toContain('Maps &amp; More');
    expect(response.body).not.toContain('Maps & More</strong>');
    expect(response.body).toContain('This app will receive:');
    expect(response.body).toContain('Your Minecraft identity (stable UUID)');
    expect(response.body).toContain('Your current username and avatar');
    expect(response.body).toContain('action="/interaction/interaction-id/abort"');
    expect(response.body).toContain('>Allow</button>');
    expect(interactions.expectedIds).toEqual(['interaction-id']);
  });

  it('denies the request through the abort endpoint with a client redirect', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const server = await buildServer('test', interactions);

    const denied = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/abort',
    });
    expect(denied.statusCode).toBe(303);
    expect(denied.headers.location).toBe('/oauth2/error?error=access_denied');
    expect(interactions.expectedIds).toEqual(['interaction-id']);
  });

  it('starts, downloads, and checks a skin verification challenge bound to the interaction', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const server = await buildServer('test', interactions);

    const malformed = await server.inject({
      method: 'POST',
      payload: { username: 'not a minecraft name' },
      url: '/interaction/interaction-id/skin/start',
    });
    expect(malformed.statusCode).toBe(400);

    const started = await server.inject({
      method: 'POST',
      payload: { username: 'VerifiedPlayer' },
      url: '/interaction/interaction-id/skin/start',
    });
    expect(started.statusCode).toBe(303);
    expect(started.headers.location).toBe('/interaction/interaction-id');
    expect(interactions.skinUsername).toBe('VerifiedPlayer');

    interactions.skinChallenge = {
      body: Buffer.from('png-body'),
      height: 64,
      markerHash: 'a'.repeat(64),
      model: 'slim',
      status: 'pending',
      username: 'VerifiedPlayer',
      userUuid: avatarUuid,
    };
    const page = await server.inject({ method: 'GET', url: '/interaction/interaction-id' });
    expect(page.body).toContain('Download verification skin');
    expect(page.body).toContain('modern 64×64');
    expect(page.body).toContain('slim arms');
    expect(page.body).toContain('data-status-url="/interaction/interaction-id/skin/status"');

    const download = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/skin/download',
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(download.headers['content-disposition']).toContain('craftlogin-VerifiedPlayer.png');
    expect(download.rawPayload).toEqual(Buffer.from('png-body'));

    const status = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/skin/status',
    });
    expect(status.json()).toEqual({ status: 'pending' });
  });

  it('returns only verification state and redirects native completion safely', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const server = await buildServer('test', interactions);

    const status = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/status',
    });
    expect(status.json()).toEqual({ status: 'pending' });
    expect(status.body).not.toContain('ABCDEFGH');

    const pending = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/complete',
    });
    expect(pending.statusCode).toBe(303);
    expect(pending.headers.location).toBe('/interaction/interaction-id');

    interactions.completion = { status: 'complete', redirectTo: '/oauth2/authorize/resume-id' };
    const complete = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/complete',
    });
    expect(complete.statusCode).toBe(303);
    expect(complete.headers.location).toBe('/oauth2/authorize/resume-id');

    interactions.completion = { status: 'expired' };
    const expired = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/complete',
    });
    expect(expired.statusCode).toBe(410);
    expect(errorResponseSchema.parse(expired.json()).error.code).toBe('interaction_expired');
  });

  it('authenticates the current-user endpoint and keeps every error in one shape', async (): Promise<void> => {
    const server = await buildServer('test', new InteractionStub());

    const missing = await server.inject({ method: 'GET', url: '/api/users/@me' });
    expect(missing.statusCode).toBe(401);
    expect(errorResponseSchema.parse(missing.json()).error.code).toBe('unauthorized');
    expect(missing.headers['www-authenticate']).toBe('Bearer');

    const accepted = await server.inject({
      headers: { authorization: 'Bearer valid-token' },
      method: 'GET',
      url: '/api/users/@me',
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({
      username: 'VerifiedPlayer',
      uuid: '123e4567-e89b-42d3-a456-426614174000',
    });

    const allowedCors = await server.inject({
      headers: {
        authorization: 'Bearer valid-token',
        origin: 'https://maps.example',
      },
      method: 'GET',
      url: '/api/users/@me',
    });
    expect(allowedCors.headers['access-control-allow-origin']).toBe('https://maps.example');

    const rejectedCors = await server.inject({
      headers: {
        authorization: 'Bearer valid-token',
        origin: 'https://attacker.example',
      },
      method: 'GET',
      url: '/api/users/@me',
    });
    expect(rejectedCors.headers['access-control-allow-origin']).toBeUndefined();

    const publicAvatarCors = await server.inject({
      headers: { origin: 'https://attacker.example' },
      method: 'GET',
      url: `/api/avatars/${avatarUuid}/head`,
    });
    expect(publicAvatarCors.statusCode).toBe(200);
    expect(publicAvatarCors.headers['access-control-allow-origin']).toBe('*');
    expect(publicAvatarCors.headers['access-control-expose-headers']).toContain('etag');

    const publicAvatarPreflight = await server.inject({
      headers: {
        'access-control-request-headers': 'if-none-match',
        'access-control-request-method': 'GET',
        origin: 'https://attacker.example',
      },
      method: 'OPTIONS',
      url: `/api/avatars/${avatarUuid}/head`,
    });
    expect(publicAvatarPreflight.statusCode).toBe(204);
    expect(publicAvatarPreflight.headers['access-control-allow-origin']).toBe('*');
    expect(publicAvatarPreflight.headers['access-control-allow-methods']).toBe('GET');
    expect(publicAvatarPreflight.headers['access-control-allow-headers']).toContain(
      'if-none-match',
    );

    const missingRoute = await server.inject({ method: 'GET', url: '/not-a-route' });
    expect(missingRoute.statusCode).toBe(404);
    expect(errorResponseSchema.parse(missingRoute.json()).error.code).toBe('not_found');
  });

  it('reports dependency readiness without caching health responses', async (): Promise<void> => {
    const readyServer = await buildServer('test', new InteractionStub());
    const ready = await readyServer.inject({ method: 'GET', url: '/health' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ok' });
    expect(ready.headers['cache-control']).toBe('no-store');

    const unavailableServer = await buildServer(
      'test',
      new InteractionStub(),
      [],
      undefined,
      (): Promise<void> => Promise.reject(new Error('dependency unavailable')),
    );
    const unavailable = await unavailableServer.inject({ method: 'GET', url: '/health' });
    expect(unavailable.statusCode).toBe(500);
    expect(errorResponseSchema.parse(unavailable.json()).error.code).toBe('internal_error');
    expect(unavailable.headers['cache-control']).toBe('no-store');
  });

  it('rejects malformed app registration before calling its service', async (): Promise<void> => {
    const registeredInputs: AppRegistrationInput[] = [];
    const server = await buildServer('test', new InteractionStub(), registeredInputs);

    const malformed = await server.inject({
      method: 'POST',
      payload: {
        clientType: 'public',
        name: ' Map viewer ',
        redirectUris: ['https://maps.example/callback'],
        unknown: true,
      },
      url: '/api/apps',
    });
    expect(malformed.statusCode).toBe(400);
    expect(errorResponseSchema.parse(malformed.json()).error.code).toBe('bad_request');
    expect(registeredInputs).toHaveLength(0);

    const unsupported = await server.inject({
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
      payload: 'not-json',
      url: '/api/apps',
    });
    expect(unsupported.statusCode).toBe(400);
    expect(errorResponseSchema.parse(unsupported.json()).error.code).toBe('bad_request');

    const valid = await server.inject({
      headers: { 'x-csrf-token': 'test-csrf-token' },
      method: 'POST',
      payload: {
        clientType: 'confidential',
        name: 'Map viewer',
        redirectUris: ['https://maps.example/callback'],
      },
      url: '/api/apps',
    });
    expect(valid.statusCode).toBe(201);
    expect(valid.json()).toMatchObject({
      clientId: 'cl_test',
      clientSecret: 'cls_returned-once',
      clientType: 'confidential',
    });
    expect(registeredInputs).toHaveLength(1);
  });

  it('generates OpenAPI 3.1 from routes and exposes Swagger UI outside production', async (): Promise<void> => {
    const development = await buildServer('development', new InteractionStub());
    const document: unknown = development.swagger();
    const parsed = z
      .object({
        openapi: z.literal('3.1.0'),
        paths: z.record(z.string(), z.unknown()),
      })
      .parse(document);
    expect(parsed.paths).toHaveProperty('/api/users/@me');
    expect(parsed.paths).toHaveProperty('/api/apps');
    expect(parsed.paths).toHaveProperty('/oauth2/token');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/skin');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/head');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/bust');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/body');
    expect(parsed.paths).not.toHaveProperty('/avatar/{uuid}');
    expect(parsed.paths).not.toHaveProperty('/skin/{hash}');
    const documentation = await development.inject({ method: 'GET', url: '/docs/' });
    expect(documentation.statusCode).toBe(200);
    expect(documentation.body).toContain('pixeloid.css');
    const documentationTheme = await development.inject({
      method: 'GET',
      url: '/docs/static/theme/pixeloid.css',
    });
    expect(documentationTheme.statusCode).toBe(200);
    expect(documentationTheme.body).toContain('font-family: "Pixeloid Sans"');

    const production = await buildServer('production', new InteractionStub());
    expect((await production.inject({ method: 'GET', url: '/docs/' })).statusCode).toBe(404);
    const productionLanding = await production.inject({ method: 'GET', url: '/' });
    expect(productionLanding.statusCode).toBe(200);
    expect(productionLanding.body).not.toContain('href="/docs/"');
  });

  it('forwards OIDC routes before Fastify consumes their request bodies', async (): Promise<void> => {
    let bodyWasReadable = false;
    const server = await buildServer(
      'test',
      new InteractionStub(),
      [],
      (request, response): void => {
        bodyWasReadable = !request.readableEnded;
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end('{"token_type":"Bearer","access_token":"opaque"}');
      },
    );

    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'grant_type=authorization_code&code=secret-code',
      url: '/oauth2/token',
    });
    expect(response.statusCode).toBe(200);
    expect(bodyWasReadable).toBe(true);
  });

  it('rate-limits token exchange, app registration, and verification polling independently', async (): Promise<void> => {
    let oidcCalls = 0;
    const server = await buildServer(
      'test',
      new InteractionStub(),
      [],
      (_request, response): void => {
        oidcCalls += 1;
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.end('{}');
      },
    );

    for (let index = 0; index < appRegistrationRateLimit.max; index += 1) {
      const response = await registerTestApp(server);
      expect(response.statusCode).toBe(201);
    }
    const limitedRegistration = await registerTestApp(server);
    expectRateLimited(limitedRegistration);

    for (let index = 0; index < verificationStatusRateLimit.max; index += 1) {
      const response = await server.inject({
        method: 'GET',
        url: '/interaction/interaction-id/status',
      });
      expect(response.statusCode).toBe(200);
    }
    const limitedStatus = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/status',
    });
    expectRateLimited(limitedStatus);

    for (let index = 0; index < tokenRateLimit.max; index += 1) {
      const response = await exchangeTestToken(server);
      expect(response.statusCode).toBe(200);
    }
    const limitedToken = await exchangeTestToken(server);
    expectRateLimited(limitedToken);
    expect(oidcCalls).toBe(tokenRateLimit.max);

    for (let index = 0; index < avatarRenderRateLimit.max; index += 1) {
      const response = await server.inject({
        headers: { origin: 'https://attacker.example' },
        method: 'GET',
        url: `/api/avatars/${avatarUuid}/head`,
      });
      expect(response.statusCode).toBe(200);
    }
    const limitedRender = await server.inject({
      headers: { origin: 'https://attacker.example' },
      method: 'GET',
      url: `/api/avatars/${avatarUuid}/head`,
    });
    expectRateLimited(limitedRender);
    expect(limitedRender.headers['access-control-allow-origin']).toBe('*');

    for (let index = 0; index < avatarRawRateLimit.max; index += 1) {
      const response = await server.inject({
        method: 'GET',
        url: `/api/avatars/${avatarUuid}/skin`,
      });
      expect(response.statusCode).toBe(200);
    }
    const limitedRaw = await server.inject({
      method: 'GET',
      url: `/api/avatars/${avatarUuid}/skin`,
    });
    expectRateLimited(limitedRaw);
  });

  async function buildServer(
    nodeEnvironment: 'development' | 'production' | 'test',
    interactions: InteractionStub,
    registeredInputs: AppRegistrationInput[] = [],
    oidcHandler: (request: IncomingMessage, response: ServerResponse) => void = (
      _request,
      response,
    ): void => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    },
    readinessCheck: () => Promise<void> = (): Promise<void> => Promise.resolve(),
  ): Promise<FastifyInstance> {
    const developerSession = {
      csrfToken: 'test-csrf-token',
      expiresInSeconds: 60,
      role: 'developer',
      sessionId: `ds_${'a'.repeat(43)}`,
      userUuid: '123e4567-e89b-42d3-a456-426614174000',
    } satisfies AuthenticatedDeveloperSession;
    const server = await createApiServer({
      accessTokens: {
        authenticate: (header): Promise<AuthenticatedAccessToken> =>
          header === 'Bearer valid-token'
            ? Promise.resolve({ accountId: 'account-id', clientId: 'client-id' })
            : Promise.reject(new ApiError(401, 'unauthorized', 'Unauthorized')),
      },
      appManager: {
        list: (): Promise<[]> => Promise.resolve([]),
        remove: (): Promise<boolean> => Promise.resolve(true),
      },
      apps: {
        register: (input): Promise<RegisteredApp> => {
          registeredInputs.push(input);
          return Promise.resolve({
            clientId: 'cl_test',
            clientSecret: 'cls_returned-once',
            clientType: 'confidential',
            createdAt: '2026-09-06T12:00:00.000Z',
            id: '123e4567-e89b-42d3-a456-426614174001',
            name: input.name,
            redirectUris: input.redirectUris,
          });
        },
      },
      clients: {
        findClientName: (): Promise<string> => Promise.resolve('Maps & More'),
        isAllowedOrigin: (origin): Promise<boolean> =>
          Promise.resolve(origin === 'https://maps.example'),
      },
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      developerAuthentication: {
        authenticate: (): Promise<undefined> => Promise.resolve(undefined),
        logout: (): Promise<void> => Promise.resolve(),
        require: (): Promise<typeof developerSession> => Promise.resolve(developerSession),
        requireAdministrator: (): void => undefined,
        requireCsrf: (_session, candidate): void => {
          if (candidate !== developerSession.csrfToken) {
            throw new ApiError(403, 'forbidden', 'Invalid CSRF token');
          }
        },
      },
      developerLogins: {
        complete: (): never => {
          throw new Error('Unexpected developer login completion');
        },
        start: (): never => {
          throw new Error('Unexpected developer login start');
        },
        status: (): never => {
          throw new Error('Unexpected developer login status');
        },
      },
      developers: {
        find: (): Promise<undefined> => Promise.resolve(undefined),
        grant: (): never => {
          throw new Error('Unexpected developer grant');
        },
        list: (): Promise<[]> => Promise.resolve([]),
        revoke: (): never => {
          throw new Error('Unexpected developer revoke');
        },
      },
      interactions,
      issuer: 'https://craftlogin.com',
      minecraft: {
        avatars: {
          findRawSkin: (): Promise<{
            image: { body: Buffer; contentType: 'image/png'; etag: string };
            status: 'found';
          }> =>
            Promise.resolve({
              image: {
                body: Buffer.from('PNGDATA'),
                contentType: 'image/png',
                etag: '"test-avatar"',
              },
              status: 'found',
            }),
          render: (): Promise<{
            image: { body: Buffer; contentType: 'image/png'; etag: string };
            status: 'found';
          }> =>
            Promise.resolve({
              image: {
                body: Buffer.from('PNGDATA'),
                contentType: 'image/png',
                etag: '"test-avatar"',
              },
              status: 'found',
            }),
        },
        players: {
          findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
          findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
        },
        skins: { fetchSkin: (): Promise<undefined> => Promise.resolve(undefined) },
      },
      minecraftBaseDomain: 'craftlogin.com',
      nodeEnvironment,
      oidcHandler,
      readiness: { check: readinessCheck },
      users: {
        findCurrentUser: (): Promise<CurrentUser> =>
          Promise.resolve({
            username: 'VerifiedPlayer',
            uuid: '123e4567-e89b-42d3-a456-426614174000',
          }),
      },
    });
    servers.push(server);
    await server.ready();
    return server;
  }

  async function registerTestApp(server: FastifyInstance): Promise<LightMyRequestResponse> {
    return await server.inject({
      headers: { 'x-csrf-token': 'test-csrf-token' },
      method: 'POST',
      payload: {
        clientType: 'public',
        name: 'Rate limit client',
        redirectUris: ['https://rate-limit.example/callback'],
      },
      url: '/api/apps',
    });
  }

  async function exchangeTestToken(server: FastifyInstance): Promise<LightMyRequestResponse> {
    return await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'grant_type=authorization_code&code=not-a-real-code',
      url: '/oauth2/token',
    });
  }

  function expectRateLimited(response: LightMyRequestResponse): void {
    expect(response.statusCode).toBe(429);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe('rate_limited');
    expect(response.headers['retry-after']).toBeTypeOf('string');
    expect(response.headers['cache-control']).toBe('no-store');
  }
});
