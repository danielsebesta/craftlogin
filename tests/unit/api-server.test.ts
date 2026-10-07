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
import { english } from '../../src/locales/en.js';
import { OAuthInteractionStateError } from '../../src/oauth/interaction-gateway.js';
import type { AuthenticatedDeveloperSession } from '../../src/developers/session-service.js';
import type { AppIconStore } from '../../src/developers/app-icon-store.js';
import type { ApiInteractionService } from '../../src/api/interaction-routes.js';
import {
  appRegistrationRateLimit,
  authorizeRateLimit,
  avatarRawRateLimit,
  avatarRenderRateLimit,
  playerProfileRateLimit,
  publicOidcRateLimit,
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
  public verifiedPlayer: { uuid: string; username: string } | undefined;
  public requiresConfirmCode = false;
  public submittedCode: string | undefined;

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
    requiresConfirmCode?: boolean;
    verifiedPlayer?: { uuid: string; username: string };
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
      ...(this.requiresConfirmCode ? { requiresConfirmCode: true } : {}),
      ...(this.verifiedPlayer === undefined ? {} : { verifiedPlayer: this.verifiedPlayer }),
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

  public prepareMicrosoftCallback(
    interactionId: string,
  ): Promise<{ readonly interactionId: string }> {
    this.expectedIds.push(interactionId);
    return Promise.resolve({ interactionId });
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

  public resetVerification(
    _request: IncomingMessage,
    _response: ServerResponse,
    expectedInteractionId?: string,
  ): Promise<void> {
    this.expectedIds.push(expectedInteractionId);
    this.verifiedPlayer = undefined;
    return Promise.resolve();
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
    confirmationCode?: string,
  ): Promise<OAuthInteractionCompletion> {
    this.expectedIds.push(expectedInteractionId);
    this.submittedCode = confirmationCode;
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
    expect(response.body).toContain('<main id="main" class="page-backdrop container">');
    expect(response.body).toContain(
      '<h1 id="hero-heading">Let your players log in with Minecraft</h1>',
    );
    expect(response.body).toContain('<ol class="handoff">');
    expect(response.body).toContain('href="/docs/"');
    expect(response.body).toContain('/assets/landing.css');
    expect(response.body).toContain('class="skip-link"');
    expect(response.body).toContain('name="color-scheme" content="dark"');
    expect(response.body).toContain(
      '<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />',
    );
    expect(response.body).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    expect(response.body).toContain('class="brand-wordmark"');
    expect(response.body).toContain('class="brand-wordmark-image"');
    expect(response.body).toContain(
      'NOT AN OFFICIAL MINECRAFT SERVICE.<br>NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    );
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
    expect(response.body).toContain('class="bench-stage"');
    expect(response.body).toContain('/api/avatars/');
    expect(response.body).not.toContain('/processed-skin');
    expect(response.body).not.toContain('/cape');
    expect(response.body).not.toContain('integration-form');
    expect(response.body).not.toContain('integration-stack');
    expect(response.body).toContain('<script src="/assets/prompt-copy.js" defer></script>');
    expect(response.body).toContain('<script src="/assets/method-switch.js" defer></script>');

    const script = await server.inject({ method: 'GET', url: '/assets/prompt-copy.js' });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toContain('text/javascript');
    expect(script.body).toContain('navigator.clipboard.writeText');

    const methodSwitch = await server.inject({
      method: 'GET',
      url: '/assets/method-switch.js',
    });
    expect(methodSwitch.statusCode).toBe(200);
    expect(methodSwitch.headers['content-type']).toContain('text/javascript');
    expect(methodSwitch.body).toContain('data-method-panel');

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

    const gridFade = await server.inject({ method: 'GET', url: '/assets/grid-fade.svg' });
    expect(gridFade.statusCode).toBe(200);
    expect(gridFade.headers['content-type']).toContain('image/svg+xml');
    expect(gridFade.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(gridFade.body).toContain('<svg');

    // The glow grid must never place the same fill on orthogonally adjacent cells.
    const gridCells = new Map<number, Map<number, string>>();
    const cellSizes = new Set<number>();
    for (const rect of gridFade.body.matchAll(
      /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]+)"/g,
    )) {
      const x = Number(rect[1]);
      const y = Number(rect[2]);
      const cellW = Number(rect[3]);
      const cellH = Number(rect[4]);
      const fill = rect[5];
      if (Number.isNaN(x) || Number.isNaN(y) || !(cellW > 0) || !(cellH > 0) || fill === undefined)
        continue;
      cellSizes.add(cellW);
      const column = gridCells.get(x / cellW) ?? new Map<number, string>();
      column.set(y / cellH, fill);
      gridCells.set(x / cellW, column);
    }
    expect(cellSizes.size).toBe(1);
    expect(gridCells.size).toBeGreaterThan(0);
    for (const [col, column] of gridCells) {
      for (const [row, fill] of column) {
        expect(gridCells.get(col + 1)?.get(row)).not.toBe(fill);
        expect(gridCells.get(col)?.get(row + 1)).not.toBe(fill);
      }
    }

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

    for (const route of [
      '/favicon-96x96.webp',
      '/apple-touch-icon.webp',
      '/web-app-manifest-192x192.webp',
      '/web-app-manifest-512x512.webp',
    ]) {
      const webp = await server.inject({ method: 'GET', url: route });
      expect(webp.statusCode).toBe(200);
      expect(webp.headers['content-type']).toContain('image/webp');
      expect(webp.headers['cache-control']).toBe('public, max-age=86400');
      expect(webp.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(webp.rawPayload.subarray(8, 12).toString('ascii')).toBe('WEBP');
    }

    for (const route of [
      '/assets/brand-wordmark.png',
      '/assets/brand-wordmark-2x.png',
      '/assets/craftlogin-title.png',
      '/assets/craftlogin-title-2x.png',
    ]) {
      const brandPng = await server.inject({ method: 'GET', url: route });
      expect(brandPng.statusCode).toBe(200);
      expect(brandPng.headers['content-type']).toContain('image/png');
      expect(brandPng.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(brandPng.rawPayload.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }

    for (const route of [
      '/assets/brand-wordmark.webp',
      '/assets/brand-wordmark-2x.webp',
      '/assets/craftlogin-title.webp',
      '/assets/craftlogin-title-2x.webp',
    ]) {
      const brandWebp = await server.inject({ method: 'GET', url: route });
      expect(brandWebp.statusCode).toBe(200);
      expect(brandWebp.headers['content-type']).toContain('image/webp');
      expect(brandWebp.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(brandWebp.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(brandWebp.rawPayload.subarray(8, 12).toString('ascii')).toBe('WEBP');
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
        { sizes: '192x192', src: '/web-app-manifest-192x192.webp' },
        { sizes: '512x512', src: '/web-app-manifest-512x512.webp' },
      ],
    });
  });

  it('applies baseline security headers to provider-written OIDC responses', async (): Promise<void> => {
    const server = await buildServer('test', new InteractionStub());
    const urls = [
      '/oauth2/authorize',
      '/oauth2/introspect',
      '/oauth2/jwks',
      '/oauth2/userinfo',
      '/oauth2/revoke',
      '/oauth2/logout',
      '/oauth2/token',
      '/.well-known/openid-configuration',
      '/.well-known/oauth-authorization-server',
      '/.well-known/webfinger',
    ];
    const methods = new Map<string, readonly ('GET' | 'POST')[]>([
      ['/oauth2/introspect', ['POST']],
      ['/oauth2/logout', ['GET', 'POST']],
      ['/oauth2/revoke', ['POST']],
      ['/oauth2/token', ['POST']],
      ['/oauth2/userinfo', ['GET', 'POST']],
    ]);
    for (const url of urls) {
      for (const method of methods.get(url) ?? ['GET']) {
        const response = await server.inject({ method, url });
        expect(response.statusCode, `${method} ${url}`).toBe(200);
        expect(response.headers['strict-transport-security']).toBe(
          'max-age=31536000; includeSubDomains',
        );
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['referrer-policy']).toBe('no-referrer');
        expect(response.headers['cross-origin-opener-policy']).toBe('same-origin');
        expect(response.headers['permissions-policy']).toContain('camera=()');
        expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      }
    }

    // Permissions-Policy reaches normal replies through the global onSend hook.
    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.headers['permissions-policy']).toContain('camera=()');
  });

  it('keeps provider-written headers ahead of the baseline', async (): Promise<void> => {
    const server = await buildServer(
      'test',
      new InteractionStub(),
      [],
      (_request, response): void => {
        response.statusCode = 200;
        response.setHeader(
          'content-security-policy',
          "default-src 'self'; style-src 'self' 'unsafe-inline'",
        );
        response.setHeader('cache-control', 'no-store');
        response.setHeader('content-type', 'application/json');
        response.end('{}');
      },
    );
    const response = await server.inject({ method: 'GET', url: '/oauth2/jwks' });
    expect(response.statusCode).toBe(200);
    // The provider's own CSP must not be clobbered by the restrictive baseline.
    expect(response.headers['content-security-policy']).toBe(
      "default-src 'self'; style-src 'self' 'unsafe-inline'",
    );
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
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
    expect(openApi.body).toContain('/oauth2/authorize:');
    expect(openApi.body).not.toContain('/interaction/{uid}:');
    expect(openApi.body).not.toContain('/api/apps:');
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
    expect(response.body).toContain(
      'Your Minecraft identity: UUID, username, skin, cape, and avatar (all public data)',
    );
    expect(response.body).toContain('This app will never receive:');
    expect(response.body).toContain('Your Microsoft or Minecraft password');
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

  it('redirects expired Microsoft callbacks back to the friendly interaction page', async (): Promise<void> => {
    const interactions = new InteractionStub();
    // The callback guard is cookie-less, so expiry is armed on the callback:
    // start succeeds, callback fails.
    interactions.prepareMicrosoftCallback = (): Promise<never> =>
      Promise.reject(new OAuthInteractionStateError('The interaction is gone'));
    const server = await buildServer(
      'test',
      interactions,
      [],
      undefined,
      undefined,
      new MicrosoftVerificationStub(),
    );
    const started = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/microsoft/start',
    });
    expect(started.statusCode).toBe(303);
    const state = new URL(requiredHeader(started, 'location')).searchParams.get('state');
    const transactionCookie = requiredHeader(started, 'set-cookie').split(';', 1)[0];

    const callback = await server.inject({
      headers: { cookie: transactionCookie },
      method: 'GET',
      url: `/interaction/microsoft/callback?code=microsoft-code&state=${encodeURIComponent(state ?? '')}`,
    });

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('/interaction/interaction-id');
    expect(callback.body).not.toContain('"error"');
  });

  it('redirects expired skin downloads back to the friendly interaction page', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.getSkinChallenge = (): Promise<never> =>
      Promise.reject(new OAuthInteractionStateError('The interaction is gone'));
    const server = await buildServer('test', interactions);
    const expired = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id/skin/download',
    });
    expect(expired.statusCode).toBe(303);
    expect(expired.headers.location).toBe('/interaction/interaction-id');
    expect(expired.body).not.toContain('"error"');

    const missingInteractions = new InteractionStub();
    missingInteractions.skinChallenge = undefined;
    const missingServer = await buildServer('test', missingInteractions);
    const missing = await missingServer.inject({
      method: 'GET',
      url: '/interaction/interaction-id/skin/download',
    });
    expect(missing.statusCode).toBe(303);
    expect(missing.headers.location).toBe('/interaction/interaction-id');
  });

  it('redirects expired completions back to the friendly interaction page', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.completion = { status: 'expired' };
    const server = await buildServer('test', interactions);
    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: '',
      url: '/interaction/interaction-id/complete',
    });

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe('/interaction/interaction-id');
  });

  it('completes Microsoft verification with signed state and the shared confirmation screen', async (): Promise<void> => {
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
    // A successful Microsoft verification converges on the same confirm/not-you
    // page as the online-mode and skin flows.
    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('/interaction/interaction-id');
    expect(microsoft.verificationInput).toMatchObject({
      authorizationCode: 'microsoft-code',
      interactionId: 'interaction-id',
    });
    expect(microsoft.verificationInput?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    interactions.verifiedPlayer = { uuid: avatarUuid, username: 'VerifiedPlayer' };
    const page = await server.inject({ method: 'GET', url: '/interaction/interaction-id' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.body).toContain('Is this you?');
    expect(page.body).toContain('VerifiedPlayer');
    expect(page.body).toContain('action="/interaction/interaction-id/not-you"');
    expect(page.body).toContain('action="/interaction/interaction-id/complete"');
    expect(page.body).not.toContain('method-picker');
    expect(page.body).not.toContain('signin-address');

    interactions.completion = { status: 'complete', redirectTo: '/oauth2/authorize/resume-id' };
    const completed = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: '',
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

  it('shows the verified identity for explicit confirmation on the shared screen', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.verifiedPlayer = { uuid: avatarUuid, username: 'VerifiedPlayer' };
    const server = await buildServer('test', interactions);

    const page = await server.inject({ method: 'GET', url: '/interaction/interaction-id' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    // The confirmation shows the server-verified identity, never a submitted one.
    expect(page.body).toContain('Is this you?');
    expect(page.body).toContain(`Signed in as`);
    expect(page.body).toContain('<bdi>VerifiedPlayer</bdi>');
    expect(page.body).toContain(`/api/avatars/${avatarUuid}/face`);
    expect(page.body).toContain('action="/interaction/interaction-id/complete"');
    expect(page.body).toContain('action="/interaction/interaction-id/not-you"');
    // Method panels stay hidden while the confirmation is up.
    expect(page.body).not.toContain('method-picker');
    expect(page.body).not.toContain('signin-address');
    expect(page.body).not.toContain('skin-verification');
    expect(page.body).not.toContain('microsoft-verification');
    // No in-game code was resolved, so no confirmation input renders.
    expect(page.body).not.toContain('id="confirm-code"');
  });

  it('requires the in-game confirmation code on the shared screen for online-mode joins', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.verifiedPlayer = { uuid: avatarUuid, username: 'VerifiedPlayer' };
    interactions.requiresConfirmCode = true;
    const server = await buildServer('test', interactions);

    const page = await server.inject({ method: 'GET', url: '/interaction/interaction-id' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('id="confirm-code"');
    expect(page.body).toContain('name="code"');
    expect(page.body).toContain(english.interaction.confirmation.codeLabel);
    // The code itself never ships in page markup; the player types it in.
    expect(page.body).not.toMatch(/value="[A-Z0-9]{6}"/u);

    const resubmitted = await server.inject({
      method: 'GET',
      url: '/interaction/interaction-id?confirm=incorrect',
    });
    expect(resubmitted.statusCode).toBe(200);
    expect(resubmitted.body).toContain(english.interaction.confirmation.codeMismatch);
  });

  it('passes the submitted confirmation code into interaction completion', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.completion = { status: 'complete', redirectTo: '/oauth2/authorize/resume-id' };
    const server = await buildServer('test', interactions);

    const completed = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'code=K7X2QM',
      url: '/interaction/interaction-id/complete',
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.body).toContain('/oauth2/authorize/resume-id');
    expect(interactions.submittedCode).toBe('K7X2QM');
  });

  it('redirects back to the confirmation screen when the code does not match', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.completion = { status: 'code_mismatch' };
    const server = await buildServer('test', interactions);

    const rejected = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: 'code=ZZZZ99',
      url: '/interaction/interaction-id/complete',
    });
    expect(rejected.statusCode).toBe(303);
    expect(rejected.headers.location).toBe('/interaction/interaction-id?confirm=incorrect');
    expect(interactions.submittedCode).toBe('ZZZZ99');
  });

  it('rejects a malformed confirmation code at the schema boundary', async (): Promise<void> => {
    const interactions = new InteractionStub();
    const server = await buildServer('test', interactions);

    const response = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: `code=${'A'.repeat(64)}`,
      url: '/interaction/interaction-id/complete',
    });
    expect(response.statusCode).toBe(400);
    expect(errorResponseSchema.parse(response.json()).error.code).toBe('bad_request');
    expect(interactions.submittedCode).toBeUndefined();
  });

  it('restarts verification when the confirmed identity is rejected', async (): Promise<void> => {
    const interactions = new InteractionStub();
    interactions.verifiedPlayer = { uuid: avatarUuid, username: 'VerifiedPlayer' };
    const server = await buildServer('test', interactions);

    const rejected = await server.inject({
      method: 'POST',
      url: '/interaction/interaction-id/not-you',
    });
    expect(rejected.statusCode).toBe(303);
    expect(rejected.headers.location).toBe('/interaction/interaction-id');
    expect(interactions.expectedIds).toContain('interaction-id');
    expect(interactions.verifiedPlayer).toBeUndefined();

    // The same page now offers the verification methods again.
    const page = await server.inject({ method: 'GET', url: '/interaction/interaction-id' });
    expect(page.body).toContain('method-picker');
    expect(page.body).toContain('ABCDEFGH.craftlogin.com');
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
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: '',
      url: '/interaction/interaction-id/complete',
    });
    expect(pending.statusCode).toBe(303);
    expect(pending.headers.location).toBe('/interaction/interaction-id');

    interactions.completion = { status: 'complete', redirectTo: '/oauth2/authorize/resume-id' };
    const complete = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: '',
      url: '/interaction/interaction-id/complete',
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.body).toContain('http-equiv="refresh"');
    expect(complete.body).toContain('/oauth2/authorize/resume-id');

    interactions.completion = { status: 'expired' };
    const expired = await server.inject({
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      payload: '',
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
      url: `/api/avatars/${avatarUuid}/face`,
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
      url: `/api/avatars/${avatarUuid}/face`,
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

  it('fails the health probe when a dependency check stalls', async (): Promise<void> => {
    const stalledServer = await buildServer(
      'test',
      new InteractionStub(),
      [],
      undefined,
      (): Promise<void> => new Promise<void>((): void => undefined),
    );
    const stalled = await stalledServer.inject({ method: 'GET', url: '/health' });
    expect(stalled.statusCode).toBe(500);
    expect(errorResponseSchema.parse(stalled.json()).error.code).toBe('internal_error');
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

  it('serves the security.txt disclosure document', async (): Promise<void> => {
    const server = await buildServer('test', new InteractionStub());
    const response = await server.inject({
      method: 'GET',
      url: '/.well-known/security.txt',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/u);
    expect(response.body).toContain('Contact: https://');
    expect(response.body).toContain('Expires: ');
  });

  it('marks HTML responses with a report-only CSP and accepts violation reports', async (): Promise<void> => {
    const server = await buildServer('test', new InteractionStub());

    const page = await server.inject({ method: 'GET', url: '/' });
    expect(page.headers['content-security-policy-report-only']).toContain('report-uri');
    expect(page.headers['content-security-policy-report-only']).toContain('/api/csp-report');

    const cases: [string, string][] = [
      ['application/csp-report', '{"csp-report":{"violated-directive":"img-src"}}'],
      ['application/reports+json', '[{"type":"csp-violation","body":{}}]'],
      ['application/csp-report', 'not-json'],
    ];
    for (const [contentType, payload] of cases) {
      const report = await server.inject({
        headers: { 'content-type': contentType },
        method: 'POST',
        payload,
        url: '/api/csp-report',
      });
      expect(report.statusCode).toBe(204);
    }
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

  it('publishes integration documentation and keeps interactive Swagger outside production', async (): Promise<void> => {
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
    expect(parsed.paths).toHaveProperty('/oauth2/token');
    expect(parsed.paths).toHaveProperty('/oauth2/logout');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/skin');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/processed-skin');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/cape');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/elytra');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/face');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/face');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/bust');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/body');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/back');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/side');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/duo');
    expect(parsed.paths).toHaveProperty('/api/avatars/{identifier}/wings');
    expect(parsed.paths).not.toHaveProperty('/api/apps');
    expect(parsed.paths).not.toHaveProperty('/interaction/{uid}');
    expect(parsed.paths).not.toHaveProperty('/privacy');
    expect(parsed.paths).not.toHaveProperty('/terms');
    expect(parsed.paths).not.toHaveProperty('/avatar/{identifier}');
    expect(parsed.paths).not.toHaveProperty('/skin/{hash}');

    const documentation = await development.inject({ method: 'GET', url: '/docs/' });
    expect(documentation.statusCode).toBe(200);
    expect(documentation.headers['content-security-policy']).toContain("default-src 'none'");
    expect(documentation.body).toContain('CraftLogin developer documentation');
    expect(documentation.body).toContain('/assets/docs.css');
    expect(documentation.body).toContain('id="security"');
    const documentationTheme = await development.inject({
      method: 'GET',
      url: '/assets/docs.css',
    });
    expect(documentationTheme.statusCode).toBe(200);
    expect(documentationTheme.body).toContain('font-family: "Pixeloid Sans"');
    expect(documentationTheme.body).toContain('.docs-shell');
    expect((await development.inject({ method: 'GET', url: '/docs/swagger/' })).statusCode).toBe(
      200,
    );

    const production = await buildServer('production', new InteractionStub());
    expect((await production.inject({ method: 'GET', url: '/docs/' })).statusCode).toBe(200);
    expect((await production.inject({ method: 'GET', url: '/docs/swagger/' })).statusCode).toBe(
      404,
    );
    const productionLanding = await production.inject({ method: 'GET', url: '/' });
    expect(productionLanding.statusCode).toBe(200);
    expect(productionLanding.body).toContain('href="/docs/"');

    const privacy = await production.inject({ method: 'GET', url: '/privacy' });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.headers['content-type']).toContain('text/html');
    expect(privacy.headers['content-security-policy']).toContain("default-src 'none'");
    expect(privacy.body).toContain('Privacy policy');
    expect(privacy.body).toContain('/assets/legal.css');
    expect(privacy.body).not.toContain('<script');

    const terms = await production.inject({ method: 'GET', url: '/terms/' });
    expect(terms.statusCode).toBe(200);
    expect(terms.body).toContain('Terms of service');
    expect(terms.body).toContain('href="/privacy"');

    const legalTheme = await production.inject({ method: 'GET', url: '/assets/legal.css' });
    expect(legalTheme.statusCode).toBe(200);
    expect(legalTheme.body).toContain('font-family: "Pixeloid Sans"');
    expect(legalTheme.body).toContain('.legal-page');
  });

  it('serves versioned application icons and reports clients without one', async (): Promise<void> => {
    const iconBytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const iconHash = 'c'.repeat(64);
    const clientId = `cl_${'b'.repeat(32)}`;
    const server = await buildServer(
      'test',
      new InteractionStub(),
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      {
        findIcon: (candidate: string): Promise<{ data: Buffer; hash: string } | undefined> =>
          Promise.resolve(candidate === clientId ? { data: iconBytes, hash: iconHash } : undefined),
      },
    );

    const versioned = await server.inject({
      method: 'GET',
      url: `/api/apps/${clientId}/icon?v=${iconHash}`,
    });
    expect(versioned.statusCode).toBe(200);
    expect(versioned.headers['content-type']).toBe('image/png');
    expect(versioned.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(versioned.headers.etag).toBe(`"${iconHash}"`);
    expect(versioned.rawPayload.equals(iconBytes)).toBe(true);

    const bare = await server.inject({ method: 'GET', url: `/api/apps/${clientId}/icon` });
    expect(bare.statusCode).toBe(200);
    expect(bare.headers['cache-control']).toBe('public, max-age=0, must-revalidate');

    const cached = await server.inject({
      headers: { 'if-none-match': `"${iconHash}"` },
      method: 'GET',
      url: `/api/apps/${clientId}/icon`,
    });
    expect(cached.statusCode).toBe(304);

    const missing = await server.inject({
      method: 'GET',
      url: `/api/apps/cl_${'d'.repeat(32)}/icon`,
    });
    expect(missing.statusCode).toBe(404);
    expect(errorResponseSchema.parse(missing.json()).error.code).toBe('not_found');

    const malformed = await server.inject({ method: 'GET', url: '/api/apps/not-a-client/icon' });
    expect(malformed.statusCode).toBe(400);
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

    for (let index = 0; index < authorizeRateLimit.max; index += 1) {
      const response = await server.inject({ method: 'GET', url: '/oauth2/authorize' });
      expect(response.statusCode).toBe(200);
    }
    const limitedAuthorize = await server.inject({ method: 'GET', url: '/oauth2/authorize' });
    expectRateLimited(limitedAuthorize);
    expect(oidcCalls).toBe(tokenRateLimit.max + authorizeRateLimit.max);

    for (let index = 0; index < publicOidcRateLimit.max; index += 1) {
      const response = await server.inject({ method: 'GET', url: '/oauth2/jwks' });
      expect(response.statusCode).toBe(200);
    }
    const limitedJwks = await server.inject({ method: 'GET', url: '/oauth2/jwks' });
    expectRateLimited(limitedJwks);
    // The public bucket is shared across the cheap unauthenticated OIDC endpoints.
    const limitedUserinfo = await server.inject({ method: 'GET', url: '/oauth2/userinfo' });
    expectRateLimited(limitedUserinfo);

    for (let index = 0; index < avatarRenderRateLimit.max; index += 1) {
      const response = await server.inject({
        headers: { origin: 'https://attacker.example' },
        method: 'GET',
        url: `/api/avatars/${avatarUuid}/face`,
      });
      expect(response.statusCode).toBe(200);
    }
    const limitedRender = await server.inject({
      headers: { origin: 'https://attacker.example' },
      method: 'GET',
      url: `/api/avatars/${avatarUuid}/face`,
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
    icons: AppIconStore = { findIcon: (): Promise<undefined> => Promise.resolve(undefined) },
  ): Promise<FastifyInstance> {
    const developerSession = {
      csrfToken: 'test-csrf-token',
      expiresInSeconds: 60,
      role: 'developer',
      sessionId: `ds_${'a'.repeat(43)}`,
      userUuid: '123e4567-e89b-42d3-a456-426614174000',
    } satisfies AuthenticatedDeveloperSession;
    const server = await createApiServer({
      icons,
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
        removeIcon: (): Promise<boolean> => Promise.resolve(true),
        resetSecret: (): Promise<string | undefined> => Promise.resolve(undefined),
        setIcon: (): Promise<boolean> => Promise.resolve(true),
        requestVerification: (): Promise<'applied'> => Promise.resolve('applied'),
        updateRedirectUris: (): Promise<boolean> => Promise.resolve(true),
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
      database: {
        oidcGrant: {
          updateMany: (): Promise<never> =>
            Promise.reject(new Error('Unexpected refresh-token delete')),
          findMany: (): Promise<never> =>
            Promise.reject(new Error('Unexpected refresh-token list')),
        },
        user: {
          deleteMany: (): Promise<never> => Promise.reject(new Error('Unexpected user delete')),
        },
      },
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
        list: (): Promise<never[]> => Promise.resolve([]),
        revokeByKeyId: (): Promise<boolean> => Promise.resolve(false),
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
          findAvailableCapes: (): Promise<never> =>
            Promise.reject(new Error('Unexpected capes overview lookup')),
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
      redis: {
        eval: (): Promise<never> => Promise.reject(new Error('Unexpected Redis eval')),
        get: (): Promise<null> => Promise.resolve(null),
      },
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
