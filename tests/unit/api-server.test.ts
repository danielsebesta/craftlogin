import type { IncomingMessage, ServerResponse } from 'node:http';
import { Writable } from 'node:stream';

import type { FastifyBaseLogger, FastifyInstance, LightMyRequestResponse } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { AuthenticatedAccessToken } from '../../src/api/access-token-authenticator.js';
import type { AppRegistrationInput, RegisteredApp } from '../../src/api/app-registration.js';
import type { CurrentUser } from '../../src/api/current-user.js';
import { ApiError } from '../../src/api/errors.js';
import { OAuthInteractionStateError } from '../../src/oauth/interaction-gateway.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';
import type { ApiInteractionService } from '../../src/api/interaction-routes.js';
import {
  appRegistrationRateLimit,
  avatarRawRateLimit,
  avatarRenderRateLimit,
  playerProfileRateLimit,
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
import {
  MicrosoftJavaOwnershipRequiredError,
  MicrosoftOAuthHttpError,
} from '../../src/verification/microsoft-oauth-client.js';
import type { MicrosoftMinecraftIdentity } from '../../src/verification/microsoft-oauth-client.js';

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
    allowsMicrosoftVerification: boolean;
  }> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve({
      clientId: 'client-id',
      code: 'ABCDEFGH',
      interactionId: 'interaction-id',
      kind: 'login',
      scope: 'openid profile',
      allowsOnlineVerification: true,
      allowsMicrosoftVerification: true,
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

  public prepareMicrosoft(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<{ readonly interactionId: string }> {
    this.expectedIds.push(expectedInteractionId);
    return Promise.resolve({ interactionId: expectedInteractionId ?? 'interaction-id' });
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

class MicrosoftVerificationStub {
  public error: Error | undefined;
  public verificationInput:
    | {
        readonly authorizationCode: string;
        readonly codeVerifier: string;
        readonly interactionId: string;
      }
    | undefined;

  public createAuthorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    return url.toString();
  }

  public verify(
    interactionId: string,
    authorizationCode: string,
    codeVerifier: string,
  ): Promise<MicrosoftMinecraftIdentity> {
    this.verificationInput = { authorizationCode, codeVerifier, interactionId };
    return this.error === undefined
      ? Promise.resolve({
          edition: 'java',
          player: { username: 'VerifiedPlayer', uuid: avatarUuid },
        })
      : Promise.reject(this.error);
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

  it('redirects HTTP aliases to the canonical HTTPS origin', async (): Promise<void> => {
    const server = await buildServer('production', new InteractionStub());
    const response = await server.inject({
      headers: { host: 'auth.craftlogin.com' },
      method: 'GET',
      url: '/oauth2/authorize?client_id=test',
    });

    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe(
      'https://craftlogin.com/oauth2/authorize?client_id=test',
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
    expect(response.headers['content-security-policy']).toContain("manifest-src 'self'");
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.body).toContain('<main id="main" class="container">');
    expect(response.body).toContain('<h1 id="hero-heading">Log in with Minecraft</h1>');
    expect(response.body).toContain('class="landing-steps"');
    expect(response.body).toContain('K7MPQ4RX.craftlogin.com');
    expect(response.body).toContain('href="/docs/"');
    expect(response.body).toContain('/assets/landing.css');
    expect(response.body).toContain('class="skip-link"');
    expect(response.body).toContain('name="color-scheme" content="dark"');
    expect(response.body).toContain(
      '<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />',
    );
    expect(response.body).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(response.body).toContain('class="brand-mark" src="/favicon.svg"');
    expect(response.body).toContain(
      'NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    );
    expect(response.body).toContain('Contact: contact@craftlogin.com.');
    expect(response.body).toContain('<link rel="shortcut icon" href="/favicon.ico" />');
    expect(response.body).toContain(
      '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />',
    );
    expect(response.body).toContain(
      '<meta name="apple-mobile-web-app-title" content="CraftLogin" />',
    );
    expect(response.body).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(response.body).toContain('id="implement-with-ai-heading"');
    expect(response.body).toContain('data-copy-target="#craftlogin-agent-prompt"');
    expect(response.body).toContain('https://craftlogin.com/llms-full.txt');
    expect(response.body).toContain('Never ask me to paste a client secret');
    expect(response.body).not.toContain('integration-form');
    expect(response.body).not.toContain('integration-stack');
    expect(response.body).toContain('<script src="/assets/prompt-copy.js" defer></script>');

    const script = await server.inject({ method: 'GET', url: '/assets/prompt-copy.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('text/javascript');
    expect(script.body).toContain('navigator.clipboard.writeText');

    const stylesheet = await server.inject({ method: 'GET', url: '/assets/landing.css' });
    expect(stylesheet.statusCode).toBe(200);
    expect(stylesheet.headers['content-type']).toContain('text/css');
    expect(stylesheet.headers['cache-control']).toBe('public, max-age=0, must-revalidate');
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

    const faviconSvg = await server.inject({ method: 'GET', url: '/favicon.svg' });
    expect(faviconSvg.statusCode).toBe(200);
    expect(faviconSvg.headers['content-type']).toContain('image/svg+xml');
    expect(faviconSvg.body).toContain('<svg');

    for (const route of [
      '/favicon-96x96.png',
      '/apple-touch-icon.png',
      '/web-app-manifest-192x192.png',
      '/web-app-manifest-512x512.png',
    ]) {
      const png = await server.inject({ method: 'GET', url: route });
      expect(png.statusCode).toBe(200);
      expect(png.headers['content-type']).toContain('image/png');
      expect(png.headers['cache-control']).toBe('public, max-age=86400');
      expect(png.rawPayload.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }

    const faviconIco = await server.inject({ method: 'GET', url: '/favicon.ico' });
    expect(faviconIco.statusCode).toBe(200);
    expect(faviconIco.headers['content-type']).toContain('image/x-icon');
    expect(faviconIco.rawPayload.subarray(0, 4).toString('hex')).toBe('00000100');

    const manifest = await server.inject({ method: 'GET', url: '/site.webmanifest' });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers['content-type']).toContain('application/manifest+json');
    expect(manifest.json()).toMatchObject({
      name: 'CraftLogin',
      short_name: 'CraftLogin',
      icons: [
        { sizes: '192x192', src: '/web-app-manifest-192x192.png' },
        { sizes: '512x512', src: '/web-app-manifest-512x512.png' },
      ],
    });
  });

  it('serves agent-ready OIDC integration guidance', async (): Promise<void> => {
    const server = await buildServer('production', new InteractionStub());
    const concise = await server.inject({ method: 'GET', url: '/llms.txt' });
    expect(concise.statusCode).toBe(200);
    expect(concise.headers['content-type']).toContain('text/markdown');
    expect(concise.headers['cache-control']).toBe('public, max-age=3600');
    expect(concise.body).toContain('PKCE S256');
    expect(concise.body).toContain('/llms-full.txt');

    const full = await server.inject({ method: 'GET', url: '/llms-full.txt' });
    expect(full.statusCode).toBe(200);
    expect(full.body).toContain('# CraftLogin integration guide for coding agents');
    expect(full.body).toContain('Never ask a user to paste a client secret');
    expect(full.body).toContain('## Review checklist');

    const removedGenerator = await server.inject({
      method: 'GET',
      url: '/docs/integrations/ai',
    });
    expect(removedGenerator.statusCode).toBe(404);

    const openApi = await server.inject({ method: 'GET', url: '/openapi.yaml' });
    expect(openApi.statusCode).toBe(200);
    expect(openApi.headers['content-type']).toContain('application/yaml');
    expect(openApi.body).toContain('openapi: 3.1.0');
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
    expect(response.body).toContain('verification-badge-verified');
    expect(response.body).toContain('Verified by CraftLogin');
    expect(response.body).toContain('class="consent-owner"');
    expect(response.body).toContain('by <bdi>VerifiedPlayer</bdi>');
    expect(response.body).toContain(
      '/api/avatars/123e4567-e89b-42d3-a456-426614174000/face?size=64&amp;layers=all',
    );
    expect(response.body).toContain('This app will receive:');
    expect(response.body).toContain('Your Minecraft identity (stable UUID)');
    expect(response.body).toContain('Your current username and avatar');
    expect(response.body).toContain('action="/interaction/interaction-id/abort"');
    expect(response.body).toContain('href="/interaction/interaction-id/microsoft/start"');
    expect(response.body).toContain('>Sign in with Microsoft</a>');
    expect(response.body).toContain('>Allow</button>');
    expect(interactions.expectedIds).toEqual(['interaction-id']);
  });

  it('renders a friendly page with a back button for unknown interactions', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.start = (): Promise<never> =>
      Promise.reject(new OAuthInteractionStateError('The interaction is unknown'));
    const server = await buildServer('test', interactions);
    const response = await server.inject({ method: 'GET', url: '/interaction/unknown-id' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('This sign-in request cannot continue.');
    expect(response.body).toContain('data-go-back');
    expect(response.body).toContain('>Go back</button>');
    expect(response.body).not.toContain('"error"');
  });

  it('renders a friendly expired page instead of an error envelope', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.start = (): Promise<never> =>
      Promise.reject(new ApiError(410, 'interaction_expired', 'expired'));
    const server = await buildServer('test', interactions);
    const response = await server.inject({ method: 'GET', url: '/interaction/expired-id' });

    expect(response.statusCode).toBe(410);
    expect(response.body).toContain('This sign-in request expired');
    expect(response.body).toContain('data-go-back');
  });

  it('renders the friendly expired page for malformed Microsoft callbacks', async (): Promise<void> => {
    const server = await buildServer(
      'test',
      new InteractionStub(),
      [],
      undefined,
      undefined,
      new MicrosoftVerificationStub(),
    );
    const response = await server.inject({
      method: 'GET',
      url: '/interaction/microsoft/callback?code=only-code-no-state',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('This sign-in attempt expired');
    expect(response.body).not.toContain('"error"');
  });

  it('redirects dead Microsoft starts back to the friendly interaction page', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.prepareMicrosoft = (): Promise<never> =>
      Promise.reject(new OAuthInteractionStateError('The interaction is gone'));
    const server = await buildServer(
      'test',
      interactions,
      [],
      undefined,
      undefined,
      new MicrosoftVerificationStub(),
    );
    const response = await server.inject({
      method: 'GET',
      url: '/interaction/dead-id/microsoft/start',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/interaction/dead-id');
  });

  it('redirects expired completions back to the friendly interaction page', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.completion = { status: 'expired' };
    const server = await buildServer('test', interactions);
    const response = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/complete',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/interaction/interaction-id');
  });

  it('completes Microsoft verification with signed state and the same OIDC completion path', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const microsoft = new MicrosoftVerificationStub();
    const server = await buildServer('test', interactions, [], undefined, undefined, microsoft);

    const started = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/microsoft/start',
    });
    expect(started.statusCode).toBe(303);
    const authorization = new URL(requiredHeader(started, 'location'));
    const state = authorization.searchParams.get('state');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(authorization.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    const setCookie = requiredHeader(started, 'set-cookie');
    expect(setCookie).toContain('Max-Age=300');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/interaction/microsoft/callback');
    const transactionCookie = setCookie.split(';', 1)[0];

    const callback = await server.inject({
      headers: { cookie: transactionCookie },
      method: 'GET',
      url: `/interaction/microsoft/callback?code=microsoft-code&state=${encodeURIComponent(state ?? '')}`,
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.headers['cache-control']).toBe('no-store');
    expect(callback.headers['content-security-policy']).toContain("default-src 'none'");
    expect(callback.body).toContain('Java Edition owner');
    expect(callback.body).toContain('VerifiedPlayer');
    expect(callback.body).toContain('action="/interaction/interaction-id/complete"');
    expect(microsoft.verificationInput).toMatchObject({
      authorizationCode: 'microsoft-code',
      interactionId: 'interaction-id',
    });
    expect(microsoft.verificationInput?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    interactions.completion = { status: 'complete', redirectTo: '/oauth2/authorize/resume-id' };
    const completed = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/complete',
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.headers['content-type']).toContain('text/html');
    expect(completed.body).toContain('http-equiv="refresh"');
    expect(completed.body).toContain('/oauth2/authorize/resume-id');
  });

  it('reports upstream Microsoft failures as unavailable and logs the failed stage', async (): Promise<void> => {
    const lines: string[] = [];
    const sink = new Writable({
      write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
      ): void {
        lines.push(chunk.toString());
        callback();
      },
    });
    const interactions = new InteractionStub();
    const microsoft = new MicrosoftVerificationStub();
    microsoft.error = new MicrosoftOAuthHttpError(
      400,
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    );
    const server = await buildServer(
      'test',
      interactions,
      [],
      undefined,
      undefined,
      microsoft,
      pino({ level: 'warn' }, sink),
    );

    const started = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/microsoft/start',
    });
    const state = new URL(requiredHeader(started, 'location')).searchParams.get('state');
    const transactionCookie = requiredHeader(started, 'set-cookie').split(';', 1)[0];
    const callback = await server.inject({
      headers: { cookie: transactionCookie },
      method: 'GET',
      url: `/interaction/microsoft/callback?code=microsoft-code&state=${encodeURIComponent(state ?? '')}`,
    });

    expect(callback.statusCode).toBe(503);
    expect(callback.headers['content-type']).toContain('text/html');
    expect(callback.body).toContain('Microsoft verification is unavailable right now');
    expect(callback.body).toContain('/interaction/interaction-id/microsoft/start');
    expect(
      lines.some(
        (line) =>
          line.includes('"msg":"Microsoft verification step failed"') &&
          line.includes('"upstreamStatusCode":400') &&
          line.includes(
            '"endpoint":"https://login.microsoftonline.com/consumers/oauth2/v2.0/token"',
          ),
      ),
    ).toBe(true);
  });

  it('rejects invalid Microsoft state and gives Java ownership failures a retry path', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const microsoft = new MicrosoftVerificationStub();
    const server = await buildServer('test', interactions, [], undefined, undefined, microsoft);

    const invalidState = await server.inject({
      method: 'GET',
      url: `/interaction/microsoft/callback?code=microsoft-code&state=${'a'.repeat(43)}`,
    });
    expect(invalidState.statusCode).toBe(400);
    expect(invalidState.headers['content-type']).toContain('text/html');
    expect(invalidState.body).toContain('This sign-in attempt expired');

    const cancellationStarted = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/microsoft/start',
    });
    const cancellationAuthorization = new URL(requiredHeader(cancellationStarted, 'location'));
    const cancellationState = cancellationAuthorization.searchParams.get('state') ?? '';
    const cancellationCookie = requiredHeader(cancellationStarted, 'set-cookie').split(';', 1)[0];
    const cancelled = await server.inject({
      headers: { cookie: cancellationCookie },
      method: 'GET',
      url: `/interaction/microsoft/callback?error=access_denied&state=${encodeURIComponent(cancellationState)}`,
    });
    expect(cancelled.statusCode).toBe(303);
    expect(cancelled.headers.location).toBe('/interaction/interaction-id');

    const started = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/microsoft/start',
    });
    const authorization = new URL(requiredHeader(started, 'location'));
    const state = authorization.searchParams.get('state') ?? '';
    const transactionCookie = requiredHeader(started, 'set-cookie').split(';', 1)[0];
    microsoft.error = new MicrosoftJavaOwnershipRequiredError('Java ownership not confirmed');

    const callback = await server.inject({
      headers: { cookie: transactionCookie },
      method: 'GET',
      url: `/interaction/microsoft/callback?code=microsoft-code&state=${encodeURIComponent(state)}`,
    });
    expect(callback.statusCode).toBe(403);
    expect(callback.body).toContain('Java Edition ownership not found');
    expect(callback.body).toContain('href="/interaction/interaction-id/microsoft/start"');
    expect(callback.body).toContain('Microsoft, Xbox Live, XSTS, and Minecraft access tokens');
  });

  it('denies the request through the abort endpoint with a client redirect', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const server = await buildServer('test', interactions);

    const denied = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/abort',
    });
    expect(denied.statusCode).toBe(200);
    expect(denied.headers['content-type']).toContain('text/html');
    expect(denied.body).toContain('http-equiv="refresh"');
    expect(denied.body).toContain('/oauth2/error?error=access_denied');
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
    expect(complete.statusCode).toBe(200);
    expect(complete.body).toContain('http-equiv="refresh"');
    expect(complete.body).toContain('/oauth2/authorize/resume-id');

    interactions.completion = { status: 'expired' };
    const expired = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/complete',
    });
    expect(expired.statusCode).toBe(303);
    expect(expired.headers.location).toBe('/interaction/interaction-id');
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

  it('serves the Microsoft identity association document at the well-known URL', async (): Promise<void> => {
    const server = await buildServer('test', new InteractionStub());
    const response = await server.inject({
      method: 'GET',
      url: '/.well-known/microsoft-identity-association.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json(?:;|$)/u);
    expect(response.headers.location).toBeUndefined();
    expect(response.json()).toEqual({
      associatedApplications: [{ applicationId: '7f143b3d-bf80-4896-86ee-bd902f90ca63' }],
    });
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
    expect(parsed.paths).toHaveProperty('/api/users/{identifier}');
    expect(parsed.paths).toHaveProperty('/api/apps');
    expect(parsed.paths).toHaveProperty('/oauth2/token');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/skin');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/processed-skin');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/cape');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/elytra');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/face');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/head');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/bust');
    expect(parsed.paths).toHaveProperty('/api/avatars/{uuid}/body');
    expect(parsed.paths).not.toHaveProperty('/avatar/{uuid}');
    expect(parsed.paths).not.toHaveProperty('/skin/{hash}');
    const documentation = await development.inject({ method: 'GET', url: '/docs/' });
    expect(documentation.statusCode).toBe(200);
    expect(documentation.body).toContain('craftlogin.css');
    const documentationTheme = await development.inject({
      method: 'GET',
      url: '/docs/static/theme/craftlogin.css',
    });
    expect(documentationTheme.statusCode).toBe(200);
    expect(documentationTheme.body).toContain('font-family: "Pixeloid Sans"');
    expect(documentationTheme.body).toContain('color: var(--text)');

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

    for (let index = 0; index < playerProfileRateLimit.max; index += 1) {
      const response = await server.inject({ method: 'GET', url: `/api/users/${avatarUuid}` });
      expect(response.statusCode).toBe(200);
    }
    const limitedProfile = await server.inject({
      headers: { origin: 'https://attacker.example' },
      method: 'GET',
      url: `/api/users/${avatarUuid}`,
    });
    expectRateLimited(limitedProfile);
    expect(limitedProfile.headers['access-control-allow-origin']).toBe('*');
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
    microsoftVerification: MicrosoftVerificationStub = new MicrosoftVerificationStub(),
    logger?: FastifyBaseLogger,
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
        decideVerification: (): Promise<'applied'> => Promise.resolve('applied'),
        list: (): Promise<[]> => Promise.resolve([]),
        remove: (): Promise<boolean> => Promise.resolve(true),
        requestVerification: (): Promise<'applied'> => Promise.resolve('applied'),
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
        findClient: (): Promise<{ name: string; verified: boolean }> =>
          Promise.resolve({ name: 'Maps & More', verified: true }),
        findClientOwnerUuid: (): Promise<string> =>
          Promise.resolve('123e4567-e89b-42d3-a456-426614174000'),
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
      consoleClient: { clientId: 'cl_api-server-test-console' },
      developerSessions: {
        create: (): never => {
          throw new Error('Unexpected developer session creation');
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
        setVerified: (): never => {
          throw new Error('Unexpected developer verification change');
        },
      },
      interactions,
      issuer: 'https://craftlogin.com',
      httpPort: 3000,
      minecraft: {
        avatars: {
          findCape: (): Promise<never> => Promise.reject(new Error('Unexpected cape lookup')),
          findProcessedSkin: (): Promise<never> =>
            Promise.reject(new Error('Unexpected processed skin lookup')),
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
          findProfileById: (uuid) => Promise.resolve({ username: 'VerifiedPlayer', uuid }),
          findProfileByName: (username) => Promise.resolve({ username, uuid: avatarUuid }),
        },
        skins: { fetchSkin: (): Promise<undefined> => Promise.resolve(undefined) },
      },
      minecraftBaseDomain: 'craftlogin.com',
      microsoftOAuth: {
        clientId: '7f143b3d-bf80-4896-86ee-bd902f90ca63',
      },
      microsoftVerification: microsoftVerification,
      ...(logger === undefined ? {} : { logger }),
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

  function requiredHeader(response: LightMyRequestResponse, name: string): string {
    const value = response.headers[name];
    if (Array.isArray(value)) {
      const first = value[0];
      if (first !== undefined) return first;
    } else if (value !== undefined) {
      return value.toString();
    }
    throw new Error(`Expected ${name} header`);
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
