import { z } from 'zod';

import { canonicalMinecraftUuid } from '../mojang/uuid.js';
import { authenticatedMinecraftPlayerSchema, type AuthenticatedMinecraftPlayer } from './types.js';

const MICROSOFT_AUTHORIZE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const XBOX_LIVE_AUTHENTICATE_URL = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTHORIZE_URL = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const MINECRAFT_LOGIN_URL = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const MINECRAFT_ENTITLEMENTS_URL = 'https://api.minecraftservices.com/entitlements/mcstore';
const MINECRAFT_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile';
const XBOX_LIVE_RELYING_PARTY = 'http://auth.xboxlive.com';
const MINECRAFT_RELYING_PARTY = 'rp://api.minecraftservices.com/';
const TOKEN_MAX_LENGTH = 16_384;

export const MICROSOFT_OAUTH_SCOPE = 'XboxLive.signin';

const accessTokenSchema = z.object({
  access_token: z.string().min(1).max(TOKEN_MAX_LENGTH),
});
const xboxTokenSchema = z.object({
  DisplayClaims: z.object({
    xui: z
      .array(z.object({ uhs: z.string().min(1).max(512) }))
      .min(1)
      .max(10),
  }),
  Token: z.string().min(1).max(TOKEN_MAX_LENGTH),
});
const entitlementSchema = z.object({
  items: z.array(z.object({ name: z.string().min(1).max(128) })).max(100),
});
const minecraftProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const JAVA_ENTITLEMENTS = new Set(['game_minecraft', 'product_minecraft']);

export interface MicrosoftOAuthClientOptions {
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly redirectUri: string;
  readonly timeoutMs?: number;
}

export interface MicrosoftMinecraftIdentity {
  readonly edition: 'java';
  readonly player: AuthenticatedMinecraftPlayer;
}

export class MicrosoftOAuthUnavailableError extends Error {
  public override readonly name = 'MicrosoftOAuthUnavailableError';
}

export class MicrosoftJavaOwnershipRequiredError extends Error {
  public override readonly name = 'MicrosoftJavaOwnershipRequiredError';
}

export class HttpMicrosoftOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string | undefined;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly redirectUri: string;
  private readonly timeoutMs: number;

  public constructor(options: MicrosoftOAuthClientOptions) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.redirectUri = options.redirectUri;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  public createAuthorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL(MICROSOFT_AUTHORIZE_URL);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', MICROSOFT_OAUTH_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  public async verifyAuthorizationCode(
    authorizationCode: string,
    codeVerifier: string,
  ): Promise<MicrosoftMinecraftIdentity> {
    const microsoftAccessToken = await this.exchangeMicrosoftCode(authorizationCode, codeVerifier);
    const xbox = await this.exchangeXboxLiveToken(microsoftAccessToken);
    const xsts = await this.exchangeXstsToken(xbox.token);
    const minecraftAccessToken = await this.exchangeMinecraftToken(xsts.userHash, xsts.token);
    const entitlements = await this.fetchMinecraftEntitlements(minecraftAccessToken);
    if (!hasJavaMinecraftEntitlement(entitlements)) {
      throw new MicrosoftJavaOwnershipRequiredError('Minecraft Java ownership was not confirmed');
    }
    const player = await this.fetchMinecraftProfile(minecraftAccessToken);
    return { edition: 'java', player };
  }

  private async exchangeMicrosoftCode(
    authorizationCode: string,
    codeVerifier: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      code: authorizationCode,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      scope: MICROSOFT_OAUTH_SCOPE,
    });
    if (this.clientSecret !== undefined) {
      body.set('client_secret', this.clientSecret);
    }
    const payload = await this.fetchJson(MICROSOFT_TOKEN_URL, {
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    const parsed = accessTokenSchema.safeParse(payload);
    if (!parsed.success) {
      throw this.invalidResponse('Microsoft token');
    }
    return parsed.data.access_token;
  }

  private async exchangeXboxLiveToken(
    microsoftAccessToken: string,
  ): Promise<{ readonly token: string; readonly userHash: string }> {
    const payload = await this.postJson(
      XBOX_LIVE_AUTHENTICATE_URL,
      {
        Properties: {
          AuthMethod: 'RPS',
          RpsTicket: `d=${microsoftAccessToken}`,
          SiteName: 'user.auth.xboxlive.com',
        },
        RelyingParty: XBOX_LIVE_RELYING_PARTY,
        TokenType: 'JWT',
      },
      true,
    );
    return this.readXboxToken(payload, 'Xbox Live');
  }

  private async exchangeXstsToken(
    xboxLiveToken: string,
  ): Promise<{ readonly token: string; readonly userHash: string }> {
    const payload = await this.postJson(
      XSTS_AUTHORIZE_URL,
      {
        Properties: {
          SandboxId: 'RETAIL',
          UserTokens: [xboxLiveToken],
        },
        RelyingParty: MINECRAFT_RELYING_PARTY,
        TokenType: 'JWT',
      },
      true,
    );
    return this.readXboxToken(payload, 'XSTS');
  }

  private readXboxToken(
    payload: unknown,
    stage: string,
  ): { readonly token: string; readonly userHash: string } {
    const parsed = xboxTokenSchema.safeParse(payload);
    const user = parsed.success ? parsed.data.DisplayClaims.xui[0] : undefined;
    if (!parsed.success || user === undefined) {
      throw this.invalidResponse(stage);
    }
    return { token: parsed.data.Token, userHash: user.uhs };
  }

  private async exchangeMinecraftToken(userHash: string, xstsToken: string): Promise<string> {
    const payload = await this.postJson(MINECRAFT_LOGIN_URL, {
      identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
    });
    const parsed = accessTokenSchema.safeParse(payload);
    if (!parsed.success) {
      throw this.invalidResponse('Minecraft token');
    }
    return parsed.data.access_token;
  }

  private async fetchMinecraftEntitlements(minecraftAccessToken: string): Promise<unknown> {
    return await this.fetchJson(MINECRAFT_ENTITLEMENTS_URL, {
      headers: { authorization: `Bearer ${minecraftAccessToken}` },
      method: 'GET',
    });
  }

  private async fetchMinecraftProfile(
    minecraftAccessToken: string,
  ): Promise<AuthenticatedMinecraftPlayer> {
    let payload: unknown;
    try {
      payload = await this.fetchJson(MINECRAFT_PROFILE_URL, {
        headers: { authorization: `Bearer ${minecraftAccessToken}` },
        method: 'GET',
      });
    } catch (error: unknown) {
      if (error instanceof MicrosoftOAuthHttpError && error.statusCode === 404) {
        throw new MicrosoftJavaOwnershipRequiredError('A Minecraft Java profile was not available');
      }
      throw error;
    }
    const parsed = minecraftProfileSchema.safeParse(payload);
    const uuid = parsed.success ? canonicalMinecraftUuid(parsed.data.id) : undefined;
    const player = authenticatedMinecraftPlayerSchema.safeParse({
      username: parsed.success ? parsed.data.name : undefined,
      uuid,
    });
    if (!player.success) {
      throw this.invalidResponse('Minecraft profile');
    }
    return player.data;
  }

  private async postJson(url: string, body: unknown, xboxContract = false): Promise<unknown> {
    return await this.fetchJson(url, {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        ...(xboxContract ? { 'x-xbl-contract-version': '1' } : {}),
      },
      method: 'POST',
    });
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new MicrosoftOAuthUnavailableError('A Microsoft authentication service is unavailable');
    }
    if (!response.ok) {
      throw new MicrosoftOAuthHttpError(response.status);
    }
    try {
      const payload: unknown = await response.json();
      return payload;
    } catch {
      throw this.invalidResponse('Microsoft authentication');
    }
  }

  private invalidResponse(stage: string): MicrosoftOAuthUnavailableError {
    return new MicrosoftOAuthUnavailableError(`${stage} returned an invalid response`);
  }
}

class MicrosoftOAuthHttpError extends MicrosoftOAuthUnavailableError {
  public constructor(public readonly statusCode: number) {
    super('A Microsoft authentication service rejected the request');
  }
}

export function hasJavaMinecraftEntitlement(payload: unknown): boolean {
  const parsed = entitlementSchema.safeParse(payload);
  if (!parsed.success) {
    throw new MicrosoftOAuthUnavailableError('Minecraft entitlements returned an invalid response');
  }
  return parsed.data.items.some((item): boolean => JAVA_ENTITLEMENTS.has(item.name));
}
