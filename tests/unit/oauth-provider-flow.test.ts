import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  type KeyObject,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';

import type { FastifyInstance } from 'fastify';
import {
  errors,
  type Adapter,
  type AdapterFactory,
  type AdapterPayload,
  type JWK,
} from 'oidc-provider';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { hashClientSecret } from '../../src/oauth/client-secret.js';
import { ProviderAccessTokenAuthenticator } from '../../src/api/access-token-authenticator.js';
import { renderAuthorizationError } from '../../src/api/authorization-error-page.js';
import { renderLogoutPage, renderLogoutSuccessPage } from '../../src/api/logout-page.js';
import { createApiServer } from '../../src/api/server.js';
import { ProviderInteractionGateway } from '../../src/oauth/interaction-gateway.js';
import { OAuthInteractionService } from '../../src/oauth/interaction-service.js';
import { createCraftLoginProvider } from '../../src/oauth/provider.js';
import {
  installSessionSignalLogging,
  type SessionSignal,
} from '../../src/oauth/session-security.js';
import type { VerifiedClaimResult } from '../../src/verification/redis-verification-store.js';
import type { VerificationMethod } from '../../src/verification/types.js';

const accountId = '123e4567-e89b-42d3-a456-426614174000';
const redirectUri = 'https://client.example/callback';
const verifier = 'correct-horse-battery-staple-with-enough-pkce-entropy-123456789';
const challenge = createHash('sha256').update(verifier, 'utf8').digest('base64url');
const tokenResponseSchema = z.object({
  access_token: z.string(),
  id_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
});
const identityClaimsSchema = z.object({
  picture: z.literal('https://craftlogin.test/avatar/player'),
  preferred_username: z.literal('VerifiedPlayer'),
  sub: z.literal(accountId),
});
const idTokenClaimsSchema = z.object({
  acr: z.string().optional(),
  amr: z.array(z.string()).optional(),
  sub: z.literal(accountId),
});
const FLOW_ICON_HASH = 'a1b2c3'.padEnd(64, '0');

interface StoredAdapterState {
  readonly records: Map<string, AdapterPayload>;
  readonly uidIndexes: Map<string, string>;
}

class TestMemoryAdapter implements Adapter {
  public constructor(
    private readonly model: string,
    private readonly state: StoredAdapterState,
  ) {}

  public upsert(id: string, payload: AdapterPayload): Promise<void> {
    this.state.records.set(this.key(id), { ...payload });
    if (this.model === 'Session' && typeof payload.uid === 'string') {
      this.state.uidIndexes.set(payload.uid, id);
    }
    return Promise.resolve();
  }

  public find(id: string): Promise<AdapterPayload | undefined> {
    return Promise.resolve(this.state.records.get(this.key(id)));
  }

  public findByUid(uid: string): Promise<AdapterPayload | undefined> {
    const id = this.state.uidIndexes.get(uid);
    return id === undefined ? Promise.resolve(undefined) : this.find(id);
  }

  public findByUserCode(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  public consume(id: string): Promise<void> {
    const key = this.key(id);
    const payload = this.state.records.get(key);
    if (payload === undefined || payload.consumed !== undefined) {
      return Promise.reject(new errors.InvalidGrant('OIDC artifact was already consumed'));
    }
    this.state.records.set(key, { ...payload, consumed: Math.floor(Date.now() / 1_000) });
    return Promise.resolve();
  }

  public destroy(id: string): Promise<void> {
    this.state.records.delete(this.key(id));
    return Promise.resolve();
  }

  public revokeByGrantId(grantId: string): Promise<void> {
    for (const [key, payload] of this.state.records) {
      if (payload.grantId === grantId) {
        this.state.records.delete(key);
      }
    }
    return Promise.resolve();
  }

  private key(id: string): string {
    return `${this.model}:${id}`;
  }
}

class VerifiedInteractionStore {
  public interactionId: string | undefined;
  public method: VerificationMethod = 'microsoft_oauth';
  public verified = false;
  public confirmCode: string | undefined;
  private claimed = false;

  public allocate(interactionId: string): Promise<string> {
    this.interactionId = interactionId;
    this.claimed = false;
    this.verified = false;
    return Promise.resolve('ABCDEFGH');
  }

  public claimVerified(
    interactionId: string,
    confirmationCode?: string,
  ): Promise<VerifiedClaimResult> {
    if (!this.verified || this.claimed || interactionId !== this.interactionId) {
      return Promise.resolve({ status: 'unavailable' });
    }
    if (this.confirmCode !== undefined && this.confirmCode !== confirmationCode) {
      return Promise.resolve({ status: 'code_mismatch' });
    }
    this.claimed = true;
    return Promise.resolve({
      status: 'claimed',
      claim: {
        claimId: 'finalization-claim',
        interactionKey: 'interaction-key',
        method: this.method,
        player: { uuid: accountId, username: 'VerifiedPlayer' },
        resolvedAt: '2026-09-06T12:00:00.000Z',
      },
    });
  }

  public completeFinalization(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public getStatus(interactionId: string): Promise<
    | { status: 'pending'; code: string }
    | {
        status: 'verified';
        player: { uuid: string; username: string };
        resolvedAt: string;
      }
  > {
    // Verification state is bound to one interaction, matching the real store.
    return Promise.resolve(
      this.verified && interactionId === this.interactionId
        ? {
            status: 'verified',
            player: { uuid: accountId, username: 'VerifiedPlayer' },
            resolvedAt: '2026-09-06T12:00:00.000Z',
          }
        : { status: 'pending', code: 'ABCDEFGH' },
    );
  }

  public releaseFinalization(): Promise<boolean> {
    this.claimed = false;
    return Promise.resolve(true);
  }

  public reset(interactionId: string): Promise<boolean> {
    if (!this.verified || interactionId !== this.interactionId) {
      return Promise.resolve(false);
    }
    this.verified = false;
    return Promise.resolve(true);
  }
}

describe('CraftLogin OIDC provider', (): void => {
  let server: FastifyInstance | undefined;

  afterEach(async (): Promise<void> => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }
  });

  it('enforces state and S256 PKCE, then completes one standard code flow', async (): Promise<void> => {
    const port = await findAvailablePort();
    const issuer = `http://127.0.0.1:${port.toString()}`;
    const clientSecretHash = await hashClientSecret('confidential-client-secret');
    const adapter = createTestAdapter({
      'confidential-client': confidentialClient(clientSecretHash),
      'public-client': publicClient(),
    });
    const provider = createCraftLoginProvider({
      adapter,
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      findAccount: (_context, subject) =>
        Promise.resolve(
          subject === accountId
            ? {
                accountId,
                claims: (): {
                  picture: string;
                  preferred_username: string;
                  sub: string;
                } => ({
                  picture: 'https://craftlogin.test/avatar/player',
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
    const sessionSignals: SessionSignal[] = [];
    installSessionSignalLogging(
      provider,
      {
        info: (signal): void => {
          sessionSignals.push(signal);
        },
      },
      ['a'.repeat(32), 'b'.repeat(32)],
    );
    let providerError: Error | undefined;
    provider.on('server_error', (_context, error): void => {
      providerError = error;
    });
    provider.proxy = true;
    const confidential = await provider.Client.find('confidential-client');
    expect(await confidential?.compareClientSecret('confidential-client-secret')).toBe(true);
    expect(await confidential?.compareClientSecret('wrong-secret')).toBe(false);

    const verification = new VerifiedInteractionStore();
    const interactions = new OAuthInteractionService(
      new ProviderInteractionGateway(provider),
      verification,
      { error: (): void => undefined },
      undefined,
      true,
    );
    const accessTokens = new ProviderAccessTokenAuthenticator(provider);
    server = await createApiServer({
      icons: { findIcon: unavailable },
      accessTokens,
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
        findClient: (): Promise<{ iconHash: string; name: string; verified: boolean }> =>
          Promise.resolve({
            iconHash: FLOW_ICON_HASH,
            name: 'OAuth flow test client',
            verified: true,
          }),
        findClientOwnerUuid: (): Promise<undefined> => Promise.resolve(undefined),
        isAllowedOrigin: (): Promise<boolean> => Promise.resolve(false),
      },
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      database: {
        refreshToken: { deleteMany: unavailable, findMany: unavailable },
        user: { deleteMany: unavailable },
      },
      developerAuthentication: {
        authenticate: unavailable,
        logout: unavailable,
        require: unavailable,
        requireAdministrator: unavailable,
        requireCsrf: unavailable,
      },
      consoleClient: { clientId: 'cl_oauth-flow-test-console' },
      developerSessions: {
        create: unavailable,
        list: (): Promise<never[]> => Promise.resolve([]),
        revokeByKeyId: (): Promise<boolean> => Promise.resolve(false),
      },
      developers: {
        find: unavailable,
        grant: unavailable,
        list: unavailable,
        revoke: unavailable,
        setVerified: unavailable,
      },
      httpPort: port,
      interactions,
      issuer,
      minecraftBaseDomain: 'craftlogin.com',
      nodeEnvironment: 'test',
      oidcHandler: provider.callback(),
      readiness: { check: (): Promise<void> => Promise.resolve() },
      redis: { eval: unavailable, get: unavailable },
      trustProxy: true,
      users: {
        findCurrentUser: (uuid) =>
          Promise.resolve(
            uuid === accountId ? { username: 'VerifiedPlayer', uuid: accountId } : undefined,
          ),
      },
    });
    await server.listen({ host: '127.0.0.1', port });

    const missingState = authorizationUrl(issuer);
    missingState.searchParams.delete('state');
    const missingStateResponse = await fetch(missingState, {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    expect(redirectError(missingStateResponse)).toBe('invalid_request');

    const plainPkce = authorizationUrl(issuer);
    plainPkce.searchParams.set('code_challenge_method', 'plain');
    const plainPkceResponse = await fetch(plainPkce, {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    expect(redirectError(plainPkceResponse)).toBe('invalid_request');

    const mismatchedRedirect = authorizationUrl(issuer);
    mismatchedRedirect.searchParams.set('redirect_uri', 'https://attacker.example/callback');
    const mismatchedRedirectResponse = await fetch(mismatchedRedirect, {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    expect(mismatchedRedirectResponse.status).toBe(400);
    expect(mismatchedRedirectResponse.headers.get('location')).toBeNull();
    expect(mismatchedRedirectResponse.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(await mismatchedRedirectResponse.text()).toContain(
      'This sign-in request cannot continue.',
    );

    const microsoftAuthorization = authorizationUrl(issuer);
    microsoftAuthorization.searchParams.set('acr_values', 'urn:craftlogin:microsoft-oauth');
    const authorizationResponse = await fetch(microsoftAuthorization, {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    if (authorizationResponse.status !== 303) {
      throw new Error(
        `Authorization failed with ${authorizationResponse.status.toString()}: ${providerError?.message ?? (await authorizationResponse.text())}`,
      );
    }
    const interactionLocation = requiredLocation(authorizationResponse);
    const cookies = responseCookies(authorizationResponse);
    expect(requiredSetCookie(authorizationResponse, '__Secure-craftlogin_interaction')).toContain(
      'Secure',
    );
    requiredSetCookie(authorizationResponse, '__Secure-craftlogin_interaction.sig');
    expect(requiredSetCookie(authorizationResponse, '__Secure-craftlogin_resume')).toContain(
      'Secure',
    );
    requiredSetCookie(authorizationResponse, '__Secure-craftlogin_resume.sig');

    const interactionResponse = await fetch(localTestUrl(interactionLocation, issuer), {
      headers: proxyHeaders(cookies),
    });
    expect(interactionResponse.status).toBe(200);
    const interactionHtml = await interactionResponse.text();
    expect(interactionHtml).toContain('Sign in with Microsoft');
    // The consent screen shows the application icon the directory lookup reported.
    expect(interactionHtml).toContain(`/api/apps/public-client/icon?v=${FLOW_ICON_HASH}`);
    expect(verification.interactionId).toBe(
      new URL(interactionLocation, issuer).pathname.split('/').at(-1),
    );

    const prematureCompletionUrl = interactionChildUrl(interactionLocation, 'complete', issuer);
    const prematureCompletion = await fetch(prematureCompletionUrl, {
      body: '',
      headers: { ...proxyHeaders(cookies), 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      redirect: 'manual',
    });
    expect(prematureCompletion.status).toBe(303);
    expect(new URL(requiredLocation(prematureCompletion), issuer).pathname).toBe(
      new URL(interactionLocation, issuer).pathname,
    );

    verification.verified = true;
    const completionResponse = await fetch(
      interactionChildUrl(interactionLocation, 'complete', issuer),
      {
        body: '',
        headers: { ...proxyHeaders(cookies), 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      },
    );
    expect(completionResponse.status).toBe(200);
    const forwardTarget = forwardTargetUrl(await completionResponse.text());

    const resumeResponse = await fetch(localTestUrl(forwardTarget, issuer), {
      headers: proxyHeaders(cookies),
      redirect: 'manual',
    });
    expect(resumeResponse.status).toBe(303);
    const authenticatedSessionCookie = requiredSetCookie(
      resumeResponse,
      '__Host-craftlogin_session',
    );
    const normalizedSessionCookie = authenticatedSessionCookie.toLowerCase();
    requiredSetCookie(resumeResponse, '__Host-craftlogin_session.sig');
    expect(normalizedSessionCookie).toContain('path=/');
    expect(normalizedSessionCookie).toContain('httponly');
    expect(normalizedSessionCookie).toContain('secure');
    expect(normalizedSessionCookie).toContain('samesite=lax');
    expect(normalizedSessionCookie).toContain('priority=high');
    const callback = new URL(requiredLocation(resumeResponse));
    expect(callback.searchParams.get('state')).toBe('client-state');
    const authorizationCode = callback.searchParams.get('code');
    if (authorizationCode === null) {
      throw new Error('OIDC callback did not contain an authorization code');
    }

    const firstTokenResponse = await redeemAuthorizationCode(issuer, authorizationCode);
    expect(firstTokenResponse.status).toBe(200);
    const tokens = tokenResponseSchema.parse(await firstTokenResponse.json());
    expect(parseJwtPayload(tokens.id_token)).toMatchObject({
      acr: 'urn:craftlogin:microsoft-oauth',
      amr: ['microsoft_oauth'],
      sub: accountId,
    });
    await expect(accessTokens.authenticate(`Bearer ${tokens.access_token}`)).resolves.toEqual({
      accountId,
      clientId: 'public-client',
    });

    const introspectionResponse = await fetch(new URL('/oauth2/introspect', issuer), {
      body: new URLSearchParams({ client_id: 'public-client', token: tokens.access_token }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
    });
    expect(introspectionResponse.status).toBe(200);
    const introspection = z
      .object({ active: z.boolean(), sub: z.string().optional() })
      .parse(await introspectionResponse.json());
    expect(introspection.active).toBe(true);
    expect(introspection.sub).toBe(accountId);

    const foreignIntrospectionResponse = await fetch(new URL('/oauth2/introspect', issuer), {
      body: new URLSearchParams({ token: tokens.access_token }),
      headers: {
        authorization: `Basic ${Buffer.from('confidential-client:confidential-client-secret').toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
    });
    expect(foreignIntrospectionResponse.status).toBe(200);
    const foreignIntrospection = z
      .object({ active: z.boolean() })
      .parse(await foreignIntrospectionResponse.json());
    expect(foreignIntrospection.active).toBe(false);

    const currentUserResponse = await fetch(new URL('/api/users/@me', issuer), {
      headers: {
        ...proxyHeaders(),
        authorization: `Bearer ${tokens.access_token}`,
      },
    });
    expect(currentUserResponse.status).toBe(200);
    expect(await currentUserResponse.json()).toEqual({
      username: 'VerifiedPlayer',
      uuid: accountId,
    });

    const userInfoResponse = await fetch(new URL('/oauth2/userinfo', issuer), {
      headers: {
        ...proxyHeaders(),
        authorization: `Bearer ${tokens.access_token}`,
      },
    });
    expect(userInfoResponse.status).toBe(200);
    expect(identityClaimsSchema.parse(await userInfoResponse.json())).toEqual({
      picture: 'https://craftlogin.test/avatar/player',
      preferred_username: 'VerifiedPlayer',
      sub: accountId,
    });

    const refreshAttempts = await Promise.all([
      redeemRefreshToken(issuer, tokens.refresh_token),
      redeemRefreshToken(issuer, tokens.refresh_token),
    ]);
    expect(refreshAttempts.map((response) => response.status).toSorted()).toEqual([200, 400]);

    const replayResponse = await redeemAuthorizationCode(issuer, authorizationCode);
    expect(replayResponse.status).toBe(400);
    const replayBody = z
      .object({ error: z.literal('invalid_grant') })
      .parse(await replayResponse.json());
    expect(replayBody.error).toBe('invalid_grant');

    const secondAuthorizationUrl = authorizationUrl(issuer);
    secondAuthorizationUrl.searchParams.set('prompt', 'login');
    const secondAuthorization = await fetch(secondAuthorizationUrl, {
      headers: proxyHeaders(responseCookies(resumeResponse)),
      redirect: 'manual',
    });
    expect(secondAuthorization.status).toBe(303);
    const secondInteractionLocation = requiredLocation(secondAuthorization);
    const secondInteractionCookies = responseCookies(secondAuthorization);
    const secondInteractionPage = await fetch(localTestUrl(secondInteractionLocation, issuer), {
      headers: proxyHeaders(secondInteractionCookies),
    });
    expect(secondInteractionPage.status).toBe(200);
    await expect(
      fetch(interactionChildUrl(secondInteractionLocation, 'complete', issuer), {
        body: '',
        headers: {
          ...proxyHeaders(secondInteractionCookies),
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        redirect: 'manual',
      }).then((response): number => response.status),
    ).resolves.toBe(303);
    verification.verified = true;
    const secondCompletion = await fetch(
      interactionChildUrl(secondInteractionLocation, 'complete', issuer),
      {
        body: '',
        headers: {
          ...proxyHeaders(secondInteractionCookies),
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        redirect: 'manual',
      },
    );
    expect(secondCompletion.status).toBe(200);
    const secondForwardTarget = forwardTargetUrl(await secondCompletion.text());
    const secondResume = await fetch(localTestUrl(secondForwardTarget, issuer), {
      headers: proxyHeaders(secondInteractionCookies),
      redirect: 'manual',
    });
    expect(secondResume.status).toBe(303);
    const rotatedSessionCookie = requiredSetCookie(secondResume, '__Host-craftlogin_session');
    expect(cookiePair(rotatedSessionCookie)).not.toBe(cookiePair(authenticatedSessionCookie));

    expect(sessionSignals).toHaveLength(2);
    expect(sessionSignals[0]).toMatchObject({
      userAgent: 'CraftLogin flow test',
    });
    expect(sessionSignals[0]?.ipReference).toMatch(/^ip_[A-Za-z0-9_-]{22}$/u);
    expect(JSON.stringify(sessionSignals[0])).not.toContain('198.51.100');
    expect(sessionSignals[1]?.sessionReference).toBe(sessionSignals[0]?.sessionReference);

    const discoveryResponse = await fetch(new URL('/.well-known/openid-configuration', issuer));
    const discovery = z
      .object({
        acr_values_supported: z.array(z.string()),
        dpop_signing_alg_values_supported: z.array(z.string()),
        end_session_endpoint: z.string(),
        introspection_endpoint: z.string(),
        pushed_authorization_request_endpoint: z.string(),
      })
      .parse(await discoveryResponse.json());
    expect(discovery.end_session_endpoint).toBe(`${issuer}/oauth2/logout`);
    expect(discovery.introspection_endpoint).toBe(`${issuer}/oauth2/introspect`);
    expect(discovery.dpop_signing_alg_values_supported).toContain('ES256');
    expect(discovery.pushed_authorization_request_endpoint).toBe(`${issuer}/oauth2/par`);
    expect(discovery.acr_values_supported).toEqual([
      'urn:craftlogin:minecraft-online-mode',
      'urn:craftlogin:minecraft-profile-skin',
      'urn:craftlogin:microsoft-oauth',
    ]);

    const logoutPage = await fetch(new URL('/oauth2/logout', issuer), {
      headers: proxyHeaders(responseCookies(secondResume)),
      redirect: 'manual',
    });
    expect(logoutPage.status).toBe(200);
    expect(await logoutPage.text()).toContain('Sign out of CraftLogin?');
  }, 20_000);

  it('accepts a pushed authorization request once and binds tokens to DPoP proofs', async (): Promise<void> => {
    const port = await findAvailablePort();
    const issuer = `http://127.0.0.1:${port.toString()}`;
    const adapter = createTestAdapter({ 'public-client': publicClient() });
    const provider = createCraftLoginProvider({
      adapter,
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      findAccount: (_context, subject) =>
        Promise.resolve(
          subject === accountId
            ? {
                accountId,
                claims: (): {
                  picture: string;
                  preferred_username: string;
                  sub: string;
                } => ({
                  picture: 'https://craftlogin.test/avatar/player',
                  preferred_username: 'VerifiedPlayer',
                  sub: accountId,
                }),
              }
            : undefined,
        ),
      issuer,
      jwks: { keys: [createSigningKey()] },
      renderError: renderAuthorizationError,
    });
    provider.proxy = true;
    const verification = new VerifiedInteractionStore();
    const interactions = new OAuthInteractionService(
      new ProviderInteractionGateway(provider),
      verification,
      { error: (): void => undefined },
      undefined,
      true,
    );
    server = await createApiServer({
      icons: { findIcon: unavailable },
      accessTokens: new ProviderAccessTokenAuthenticator(provider),
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
        findClient: (): Promise<undefined> => Promise.resolve(undefined),
        findClientOwnerUuid: (): Promise<undefined> => Promise.resolve(undefined),
        isAllowedOrigin: (): Promise<boolean> => Promise.resolve(false),
      },
      cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
      database: {
        refreshToken: { deleteMany: unavailable, findMany: unavailable },
        user: { deleteMany: unavailable },
      },
      developerAuthentication: {
        authenticate: unavailable,
        logout: unavailable,
        require: unavailable,
        requireAdministrator: unavailable,
        requireCsrf: unavailable,
      },
      consoleClient: { clientId: 'cl_oauth-flow-test-console' },
      developerSessions: {
        create: unavailable,
        list: (): Promise<never[]> => Promise.resolve([]),
        revokeByKeyId: (): Promise<boolean> => Promise.resolve(false),
      },
      developers: {
        find: unavailable,
        grant: unavailable,
        list: unavailable,
        revoke: unavailable,
        setVerified: unavailable,
      },
      httpPort: port,
      interactions,
      issuer,
      minecraftBaseDomain: 'craftlogin.com',
      nodeEnvironment: 'test',
      oidcHandler: provider.callback(),
      readiness: { check: (): Promise<void> => Promise.resolve() },
      redis: { eval: unavailable, get: unavailable },
      trustProxy: true,
      users: {
        findCurrentUser: (uuid) =>
          Promise.resolve(
            uuid === accountId ? { username: 'VerifiedPlayer', uuid: accountId } : undefined,
          ),
      },
    });
    await server.listen({ host: '127.0.0.1', port });

    const parResponse = await fetch(new URL('/oauth2/par', issuer), {
      body: new URLSearchParams({
        client_id: 'public-client',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid offline_access profile',
        state: 'par-state',
      }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
    });
    expect(parResponse.status).toBe(201);
    const par = z
      .object({ expires_in: z.number(), request_uri: z.string() })
      .parse(await parResponse.json());
    expect(par.request_uri.startsWith('urn:ietf:params:oauth:request_uri:')).toBe(true);

    const authorizeUrl = new URL('/oauth2/authorize', issuer);
    authorizeUrl.search = new URLSearchParams({
      client_id: 'public-client',
      request_uri: par.request_uri,
    }).toString();
    const authorizationResponse = await fetch(authorizeUrl, {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    if (authorizationResponse.status !== 303) {
      throw new Error(
        `PAR authorization failed with ${authorizationResponse.status.toString()}: ${await authorizationResponse.text()}`,
      );
    }
    const interactionLocation = requiredLocation(authorizationResponse);
    const cookies = responseCookies(authorizationResponse);

    // Rendering the interaction allocates its verification record.
    const interactionResponse = await fetch(localTestUrl(interactionLocation, issuer), {
      headers: proxyHeaders(cookies),
    });
    expect(interactionResponse.status).toBe(200);

    verification.verified = true;
    const completionResponse = await fetch(
      interactionChildUrl(interactionLocation, 'complete', issuer),
      {
        body: '',
        headers: { ...proxyHeaders(cookies), 'content-type': 'application/x-www-form-urlencoded' },
        method: 'POST',
        redirect: 'manual',
      },
    );
    expect(completionResponse.status).toBe(200);
    const forwardTarget = forwardTargetUrl(await completionResponse.text());
    const resumeResponse = await fetch(localTestUrl(forwardTarget, issuer), {
      headers: proxyHeaders(cookies),
      redirect: 'manual',
    });
    const callback = new URL(requiredLocation(resumeResponse));
    expect(callback.searchParams.get('state')).toBe('par-state');
    const authorizationCode = callback.searchParams.get('code');
    if (authorizationCode === null) {
      throw new Error('PAR flow did not yield an authorization code');
    }

    // The pushed request is consumed when the authorization issues, so a
    // replayed request_uri must be rejected now.
    const parReplay = await fetch(authorizeUrl, {
      headers: proxyHeaders(),
      redirect: 'manual',
    });
    if (parReplay.status === 303) {
      expect(new URL(requiredLocation(parReplay), issuer).searchParams.get('error')).toBe(
        'invalid_request_uri',
      );
    } else {
      expect(parReplay.status).toBe(400);
      expect(await parReplay.text()).toContain('invalid_request_uri');
    }

    const dpopKeyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const dpopJwk = dpopKeyPair.publicKey.export({ format: 'jwk' });
    const publicJwk = { crv: dpopJwk.crv, kty: dpopJwk.kty, x: dpopJwk.x, y: dpopJwk.y };
    // The proof's htu must equal the URL the provider observes: the forwarded
    // proto makes it https even though the test listener is plain http.
    const forwardedIssuer = issuer.replace('http://', 'https://');
    const tokenUrl = `${issuer}/oauth2/token`;
    const tokenResponse = await fetch(tokenUrl, {
      body: new URLSearchParams({
        client_id: 'public-client',
        code: authorizationCode,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        dpop: createDpopProof(
          'POST',
          `${forwardedIssuer}/oauth2/token`,
          publicJwk,
          dpopKeyPair.privateKey,
        ),
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
    });
    expect(tokenResponse.status).toBe(200);
    const tokens = z
      .object({ access_token: z.string(), token_type: z.string() })
      .parse(await tokenResponse.json());
    expect(tokens.token_type).toBe('DPoP');

    const expectedThumbprint = createHash('sha256')
      .update(JSON.stringify(publicJwk), 'utf8')
      .digest('base64url');
    const introspectionResponse = await fetch(new URL('/oauth2/introspect', issuer), {
      body: new URLSearchParams({ client_id: 'public-client', token: tokens.access_token }),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-forwarded-proto': 'https',
      },
      method: 'POST',
    });
    const introspection = z
      .object({ active: z.boolean(), cnf: z.object({ jkt: z.string() }).optional() })
      .parse(await introspectionResponse.json());
    expect(introspection.active).toBe(true);
    expect(introspection.cnf?.jkt).toBe(expectedThumbprint);

    const userInfoUrl = `${issuer}/oauth2/userinfo`;
    const prooflessUserInfo = await fetch(userInfoUrl, {
      headers: { ...proxyHeaders(), authorization: `DPoP ${tokens.access_token}` },
    });
    expect(prooflessUserInfo.status).toBe(400);
    const missingProofError = z.object({ error: z.string() }).parse(await prooflessUserInfo.json());
    expect(missingProofError.error.startsWith('invalid_')).toBe(true);

    const provedUserInfo = await fetch(userInfoUrl, {
      headers: {
        ...proxyHeaders(),
        authorization: `DPoP ${tokens.access_token}`,
        dpop: createDpopProof(
          'GET',
          `${forwardedIssuer}/oauth2/userinfo`,
          publicJwk,
          dpopKeyPair.privateKey,
          tokens.access_token,
        ),
      },
    });
    expect(provedUserInfo.status).toBe(200);
    expect(await provedUserInfo.json()).toMatchObject({ sub: accountId });
  }, 20_000);
});

function createTestAdapter(clients: Record<string, AdapterPayload>): AdapterFactory {
  const state: StoredAdapterState = {
    records: new Map(
      Object.entries(clients).map(([clientId, payload]) => [`Client:${clientId}`, payload]),
    ),
    uidIndexes: new Map(),
  };
  return (model: string): Adapter => new TestMemoryAdapter(model, state);
}

function publicClient(): AdapterPayload {
  return {
    application_type: 'web',
    client_id: 'public-client',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [redirectUri],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}

function confidentialClient(clientSecretHash: string): AdapterPayload {
  return {
    ...publicClient(),
    client_id: 'confidential-client',
    client_secret: clientSecretHash,
    token_endpoint_auth_method: 'client_secret_basic',
  };
}

function createSigningKey(): JWK {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
  return {
    ...privateKey.export({ format: 'jwk' }),
    alg: 'RS256',
    kid: 'test-signing-key',
    use: 'sig',
  };
}

function parseJwtPayload(token: string): z.infer<typeof idTokenClaimsSchema> {
  const encodedPayload = token.split('.')[1];
  if (encodedPayload === undefined) {
    throw new Error('ID token is not a compact JWT');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (error: unknown) {
    throw new Error('ID token payload is not valid JSON', { cause: error });
  }
  return idTokenClaimsSchema.parse(payload);
}

function authorizationUrl(issuer: string): URL {
  const url = new URL('/oauth2/authorize', issuer);
  url.search = new URLSearchParams({
    client_id: 'public-client',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid offline_access profile',
    state: 'client-state',
  }).toString();
  return url;
}

async function redeemAuthorizationCode(issuer: string, code: string): Promise<Response> {
  return await fetch(new URL('/oauth2/token', issuer), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams({
      client_id: 'public-client',
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
}

async function redeemRefreshToken(issuer: string, refreshToken: string): Promise<Response> {
  return await fetch(new URL('/oauth2/token', issuer), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-proto': 'https',
    },
    body: new URLSearchParams({
      client_id: 'public-client',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
}

function proxyHeaders(cookie?: string): Record<string, string> {
  const headers = {
    'user-agent': 'CraftLogin flow test',
    'x-forwarded-for': '198.51.100.42',
    'x-forwarded-proto': 'https',
  };
  return cookie === undefined ? headers : { ...headers, cookie };
}

function localTestUrl(location: string, issuer: string): URL {
  const url = new URL(location, issuer);
  url.protocol = 'http:';
  return url;
}

function interactionChildUrl(location: string, child: string, issuer: string): URL {
  const url = localTestUrl(location, issuer);
  url.pathname = `${url.pathname.replace(/\/$/u, '')}/${child}`;
  url.search = '';
  return url;
}

function redirectError(response: Response): string | null {
  expect(response.status).toBe(303);
  return new URL(requiredLocation(response)).searchParams.get('error');
}

function forwardTargetUrl(body: string): string {
  const target = /http-equiv="refresh" content="0;url=([^"]+)"/u.exec(body)?.[1];
  if (target === undefined) {
    throw new Error('Expected an auto-forward page with a refresh target');
  }
  return target.replace(/&amp;/gu, '&');
}

function requiredLocation(response: Response): string {
  const location = response.headers.get('location');
  if (location === null) {
    throw new Error('Expected an HTTP redirect location');
  }
  return location;
}

function responseCookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie): string => cookie.split(';')[0] ?? '')
    .filter((cookie): boolean => cookie.length > 0)
    .join('; ');
}

function requiredSetCookie(response: Response, name: string): string {
  const cookie = response.headers
    .getSetCookie()
    .find((candidate): boolean => candidate.startsWith(`${name}=`));
  if (cookie === undefined) {
    throw new Error(`Expected ${name} response cookie`);
  }
  return cookie;
}

function cookiePair(setCookie: string): string {
  const pair = setCookie.split(';')[0];
  if (pair === undefined) {
    throw new Error('Expected a response cookie value');
  }
  return pair;
}

async function findAvailablePort(): Promise<number> {
  const listener = createServer();
  await listen(listener, 0);
  const address = listener.address();
  if (address === null || typeof address === 'string') {
    await closeServer(listener);
    throw new Error('Could not allocate an HTTP test port');
  }
  const { port } = address;
  await closeServer(listener);
  return port;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject): void => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject): void => {
    server.close((error?: Error): void => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function unavailable(): never {
  throw new Error('Unexpected app registration during OAuth flow test');
}

// RFC 9449 proof: a one-off ES256 JWT with htm/htu claims. The public JWK is
// embedded in the header so the server can bind the token to cnf.jkt.
function createDpopProof(
  method: string,
  url: string,
  publicJwk: {
    crv: string | undefined;
    kty: string | undefined;
    x: string | undefined;
    y: string | undefined;
  },
  privateKey: KeyObject,
  accessToken?: string,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', jwk: publicJwk, typ: 'dpop+jwt' }),
  ).toString('base64url');
  // Resource-server proofs additionally bind the access token hash (ath).
  const payload = Buffer.from(
    JSON.stringify({
      ...(accessToken === undefined
        ? {}
        : { ath: createHash('sha256').update(accessToken, 'utf8').digest('base64url') }),
      htm: method,
      htu: url,
      iat: Math.floor(Date.now() / 1_000),
      jti: randomUUID(),
    }),
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    dsaEncoding: 'ieee-p1363',
    key: privateKey,
  }).toString('base64url');
  return `${signingInput}.${signature}`;
}
