import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  hasJavaMinecraftEntitlement,
  HttpMicrosoftOAuthClient,
  MICROSOFT_OAUTH_SCOPE,
  MicrosoftJavaOwnershipRequiredError,
  MicrosoftOAuthUnavailableError,
} from '../../src/verification/microsoft-oauth-client.js';
import { MicrosoftOAuthVerificationService } from '../../src/verification/microsoft-oauth-verification-service.js';
import type {
  AuthenticatedMinecraftPlayer,
  InteractionVerifiedIdentity,
} from '../../src/verification/types.js';

const microsoftAccessToken = 'microsoft-access-token';
const xboxLiveToken = 'xbox-live-token';
const xstsToken = 'xsts-token';
const minecraftAccessToken = 'minecraft-access-token';
const userHash = 'xbox-user-hash';
const redirectUri = 'https://craftlogin.com/interaction/microsoft/callback';
const clientId = '7f143b3d-bf80-4896-86ee-bd902f90ca63';

const player: AuthenticatedMinecraftPlayer = {
  username: 'VerifiedPlayer',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
};

interface RecordedRequest {
  readonly body: string | undefined;
  readonly headers: Headers;
  readonly method: string | undefined;
  readonly url: string;
}

describe('HttpMicrosoftOAuthClient', (): void => {
  it('creates a personal-account authorization request with only XboxLive.signin and S256 PKCE', (): void => {
    const client = new HttpMicrosoftOAuthClient({ clientId, fetch: unusedFetch, redirectUri });
    const authorization = new URL(client.createAuthorizationUrl('state-value', 'challenge-value'));

    expect(authorization.origin).toBe('https://login.microsoftonline.com');
    expect(authorization.pathname).toBe('/consumers/oauth2/v2.0/authorize');
    expect(authorization.searchParams.get('client_id')).toBe(clientId);
    expect(authorization.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(authorization.searchParams.get('response_mode')).toBe('query');
    expect(authorization.searchParams.get('scope')).toBe(MICROSOFT_OAUTH_SCOPE);
    expect(authorization.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('prompt')).toBe('select_account');
    expect(authorization.search).not.toContain('offline_access');
    expect(authorization.search).not.toContain('openid');
    expect(authorization.search).not.toContain('profile');
    expect(authorization.search).not.toContain('email');
    expect(authorization.search).not.toContain('graph.microsoft.com');
  });

  it('exchanges request-local tokens and returns only the canonical Minecraft identity', async (): Promise<void> => {
    const requests: RecordedRequest[] = [];
    const client = new HttpMicrosoftOAuthClient({
      clientId,
      clientSecret: 'server-only-client-secret',
      fetch: queuedFetch(
        [
          { access_token: microsoftAccessToken, refresh_token: 'unexpected-refresh-token' },
          xboxResponse(xboxLiveToken),
          xboxResponse(xstsToken),
          { access_token: minecraftAccessToken },
          { items: [{ name: 'game_minecraft', signature: 'ignored' }] },
          { id: '123e4567e89b42d3a456426614174000', name: 'VerifiedPlayer' },
        ],
        requests,
      ),
      redirectUri,
    });

    await expect(
      client.verifyAuthorizationCode('microsoft-authorization-code', 'pkce-code-verifier'),
    ).resolves.toEqual({
      edition: 'java',
      player: {
        username: 'VerifiedPlayer',
        uuid: '123e4567-e89b-42d3-a456-426614174000',
      },
    });

    expect(requests.map((request): string => request.url)).toEqual([
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      'https://user.auth.xboxlive.com/user/authenticate',
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      'https://api.minecraftservices.com/authentication/login_with_xbox',
      'https://api.minecraftservices.com/entitlements/mcstore',
      'https://api.minecraftservices.com/minecraft/profile',
    ]);

    const tokenForm = new URLSearchParams(requests[0]?.body);
    expect(tokenForm.get('scope')).toBe(MICROSOFT_OAUTH_SCOPE);
    expect(tokenForm.get('code_verifier')).toBe('pkce-code-verifier');
    expect(tokenForm.get('client_secret')).toBe('server-only-client-secret');
    expect(tokenForm.has('refresh_token')).toBe(false);
    expect(requests[4]?.headers.get('authorization')).toBe(`Bearer ${minecraftAccessToken}`);
    expect(requests[5]?.headers.get('authorization')).toBe(`Bearer ${minecraftAccessToken}`);
    expect(requests[1]?.headers.get('x-xbl-contract-version')).toBe('1');
    expect(requests[2]?.headers.get('x-xbl-contract-version')).toBe('1');
    expect(requests[3]?.headers.get('x-xbl-contract-version')).toBeNull();
    expect(requests.map((request): string => request.body ?? '').join('\n')).toContain(
      `XBL3.0 x=${userHash};${xstsToken}`,
    );
  });

  it('uses public-client PKCE redemption when no server secret is configured', async (): Promise<void> => {
    const requests: RecordedRequest[] = [];
    const client = new HttpMicrosoftOAuthClient({
      clientId,
      fetch: queuedFetch(
        [
          { access_token: microsoftAccessToken },
          xboxResponse(xboxLiveToken),
          xboxResponse(xstsToken),
          { access_token: minecraftAccessToken },
          { items: [] },
        ],
        requests,
      ),
      redirectUri,
    });

    await expect(
      client.verifyAuthorizationCode('authorization-code', 'code-verifier'),
    ).rejects.toBeInstanceOf(MicrosoftJavaOwnershipRequiredError);
    expect(new URLSearchParams(requests[0]?.body).has('client_secret')).toBe(false);
    expect(requests).toHaveLength(5);
  });

  it('sanitizes malformed upstream responses without exposing token values', async (): Promise<void> => {
    const client = new HttpMicrosoftOAuthClient({
      clientId,
      fetch: queuedFetch([{ access_token: microsoftAccessToken }, { Token: xboxLiveToken }], []),
      redirectUri,
    });

    const error = await client
      .verifyAuthorizationCode('authorization-code', 'code-verifier')
      .catch((cause: unknown): unknown => cause);
    expect(error).toBeInstanceOf(MicrosoftOAuthUnavailableError);
    expect(String(error)).not.toContain(microsoftAccessToken);
    expect(String(error)).not.toContain(xboxLiveToken);
  });
});

describe('hasJavaMinecraftEntitlement', (): void => {
  it('classifies Java entitlements and rejects everything else', (): void => {
    const cases: readonly [unknown, boolean][] = [
      [{ items: [{ name: 'game_minecraft' }] }, true],
      [{ items: [{ name: 'product_minecraft' }] }, true],
      [{ items: [] }, false],
      [{ items: [{ name: 'product_minecraft_bedrock' }] }, false],
    ];
    for (const [fixture, expected] of cases) {
      expect(hasJavaMinecraftEntitlement(fixture), JSON.stringify(fixture)).toBe(expected);
    }
  });

  it('rejects malformed entitlement responses', (): void => {
    expect((): boolean => hasJavaMinecraftEntitlement({ entitlements: [] })).toThrow(
      MicrosoftOAuthUnavailableError,
    );
  });
});

describe('MicrosoftOAuthVerificationService', (): void => {
  it('keeps token handling behind the identity-only client boundary', async (): Promise<void> => {
    const resolutions: {
      readonly identity: InteractionVerifiedIdentity;
      readonly interactionId: string;
    }[] = [];
    const service = new MicrosoftOAuthVerificationService(
      {
        createAuthorizationUrl: (): string => 'https://login.microsoftonline.com/authorize',
        verifyAuthorizationCode: (
          authorizationCode,
          codeVerifier,
        ): Promise<{
          readonly edition: 'java';
          readonly player: AuthenticatedMinecraftPlayer;
        }> => {
          expect(authorizationCode).toBe('microsoft-authorization-code');
          expect(codeVerifier).toBe('pkce-code-verifier');
          return Promise.resolve({ edition: 'java', player });
        },
      },
      {
        resolveInteraction: (interactionId, identity): Promise<'resolved'> => {
          resolutions.push({ identity, interactionId });
          return Promise.resolve('resolved');
        },
      },
    );

    await expect(
      service.verify('interaction-id', 'microsoft-authorization-code', 'pkce-code-verifier'),
    ).resolves.toEqual({ edition: 'java', player });
    expect(resolutions).toEqual([
      {
        identity: { ...player, verifiedVia: 'microsoft-oauth' },
        interactionId: 'interaction-id',
      },
    ]);
    expect(JSON.stringify(resolutions)).not.toMatch(/token|authorization-code|code-verifier/iu);
  });

  it('keeps token-bearing modules free of storage dependencies', async (): Promise<void> => {
    const sources = await Promise.all(
      ['microsoft-oauth-client.ts', 'microsoft-oauth-verification-service.ts'].map(
        async (filename): Promise<string> =>
          await readFile(new URL(`../../src/verification/${filename}`, import.meta.url), 'utf8'),
      ),
    );
    expect(sources.join('\n')).not.toMatch(/(?:redis|prisma|repository|cache)/iu);
  });
});

function xboxResponse(token: string): unknown {
  return {
    DisplayClaims: { xui: [{ uhs: userHash }] },
    Token: token,
  };
}

function queuedFetch(
  payloads: readonly unknown[],
  requests: RecordedRequest[],
): typeof globalThis.fetch {
  let index = 0;
  return (input, init): Promise<Response> => {
    const payload = payloads[index];
    index += 1;
    const body =
      typeof init?.body === 'string' || init?.body instanceof URLSearchParams
        ? init.body.toString()
        : undefined;
    requests.push({
      body,
      headers: new Headers(init?.headers),
      method: init?.method,
      url: input instanceof Request ? input.url : input.toString(),
    });
    return Promise.resolve(
      payload === undefined ? new Response('{}', { status: 500 }) : Response.json(payload),
    );
  };
}

const unusedFetch: typeof globalThis.fetch = (): Promise<Response> =>
  Promise.reject(new Error('Unexpected fetch'));
