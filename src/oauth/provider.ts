import Provider, {
  errors,
  type AdapterFactory,
  type Configuration,
  type FindAccount,
  type JWKS,
} from 'oidc-provider';
import { z } from 'zod';

import { english } from '../locales/en.js';
import { verifyClientSecret } from './client-secret.js';
import {
  MICROSOFT_OAUTH_ACR,
  MINECRAFT_ONLINE_MODE_ACR,
  MINECRAFT_PROFILE_SKIN_ACR,
} from './constants.js';
import { createMinecraftInteractionPolicy } from './interaction-policy.js';
import { oidcSessionTtl } from './session-security.js';

const ISSUER_SCHEMA = z
  .url()
  .refine((value): boolean => URL.parse(value)?.origin === value, 'Issuer must be an origin URL');
const COOKIE_KEY_SCHEMA = z.string().min(32);
const COOKIE_KEYS_SCHEMA = z
  .array(COOKIE_KEY_SCHEMA)
  .min(2)
  .refine((keys): boolean => new Set(keys).size === keys.length, 'Cookie keys must be distinct');
const STATE_MAX_LENGTH = 1_024;

export interface CraftLoginProviderOptions {
  readonly adapter: AdapterFactory;
  readonly cookieKeys: readonly string[];
  readonly findAccount: FindAccount;
  readonly issuer: string;
  readonly jwks: JWKS;
  readonly logoutSource?: LogoutSourceRenderer;
  readonly postLogoutSuccessSource?: PostLogoutSuccessRenderer;
  readonly renderError: NonNullable<Configuration['renderError']>;
}

type ProviderContext = Parameters<NonNullable<Configuration['renderError']>>[0];

export type LogoutSourceRenderer = (context: ProviderContext, form: string) => void;
export type PostLogoutSuccessRenderer = (context: ProviderContext) => void;

interface HashedSecretClient {
  readonly clientSecret?: string;
}

export function createCraftLoginProvider(options: CraftLoginProviderOptions): Provider {
  const issuer = ISSUER_SCHEMA.parse(options.issuer);
  const cookieKeys = COOKIE_KEYS_SCHEMA.parse(options.cookieKeys);
  if (options.jwks.keys.length === 0) {
    throw new TypeError('At least one private OIDC signing key is required');
  }

  const configuration: Configuration = {
    acrValues: [MINECRAFT_ONLINE_MODE_ACR, MINECRAFT_PROFILE_SKIN_ACR, MICROSOFT_OAUTH_ACR],
    adapter: options.adapter,
    allowOmittingSingleRegisteredRedirectUri: false,
    claims: {
      acr: null,
      openid: ['sub', 'amr'],
      profile: ['preferred_username', 'picture'],
    },
    clientAuthMethods: ['none', 'client_secret_basic'],
    clientBasedCORS: (_context, origin, client): boolean =>
      origin !== 'null' &&
      (client.redirectUris ?? []).some((redirectUri): boolean => {
        const parsed = URL.parse(redirectUri);
        return parsed?.origin === origin;
      }),
    clientDefaults: {
      grant_types: ['authorization_code', 'refresh_token'],
      id_token_signed_response_alg: 'RS256',
      response_types: ['code'],
    },
    conformIdTokenClaims: true,
    cookies: {
      keys: cookieKeys,
      names: {
        interaction: '__Secure-craftlogin_interaction',
        resume: '__Secure-craftlogin_resume',
        session: '__Host-craftlogin_session',
      },
      long: {
        httpOnly: true,
        overwrite: true,
        path: '/',
        priority: 'high',
        sameSite: 'lax',
        secure: true,
        signed: true,
      },
      short: {
        httpOnly: true,
        overwrite: true,
        priority: 'high',
        sameSite: 'lax',
        secure: true,
        signed: true,
      },
    },
    extraParams: {
      state: (_context, value): void => {
        if (value === undefined || value.length === 0 || value.length > STATE_MAX_LENGTH) {
          throw new errors.InvalidRequest(english.api.oauthStateRequired);
        }
      },
    },
    features: {
      dPoP: { enabled: false },
      devInteractions: { enabled: false },
      introspection: {
        allowedPolicy: (_context, client, token): boolean => client.clientId === token.clientId,
        enabled: true,
      },
      pushedAuthorizationRequests: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        ...(options.logoutSource === undefined ? {} : { logoutSource: options.logoutSource }),
        ...(options.postLogoutSuccessSource === undefined
          ? {}
          : { postLogoutSuccessSource: options.postLogoutSuccessSource }),
      },
      userinfo: { enabled: true },
    },
    findAccount: options.findAccount,
    interactions: {
      policy: createMinecraftInteractionPolicy(),
      url: (_context, interaction): string => `/interaction/${encodeURIComponent(interaction.uid)}`,
    },
    jwks: options.jwks,
    pkce: {
      required: (): boolean => true,
    },
    responseTypes: ['code'],
    renderError: options.renderError,
    rotateRefreshToken: true,
    routes: {
      authorization: '/oauth2/authorize',
      end_session: '/oauth2/logout',
      introspection: '/oauth2/introspect',
      jwks: '/oauth2/jwks',
      revocation: '/oauth2/revoke',
      token: '/oauth2/token',
      userinfo: '/oauth2/userinfo',
    },
    scopes: ['openid', 'offline_access', 'profile'],
    subjectTypes: ['public'],
    ttl: {
      AccessToken: 60 * 60,
      AuthorizationCode: 60,
      Grant: 30 * 24 * 60 * 60,
      IdToken: 60 * 60,
      Interaction: 5 * 60,
      RefreshToken: 30 * 24 * 60 * 60,
      Session: oidcSessionTtl,
    },
  };

  const provider = new Provider(issuer, configuration);
  installHashedClientSecretVerifier(provider);
  return provider;
}

function installHashedClientSecretVerifier(provider: Provider): void {
  // oidc-provider has no configuration hook for password-hash verification. Replacing this public
  // model method keeps all token endpoint parsing and authentication inside oidc-provider while
  // ensuring the adapter never returns or persists a plaintext client secret.
  Object.defineProperty(provider.Client.prototype, 'compareClientSecret', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: async function compareHashedClientSecret(
      this: HashedSecretClient,
      actual: string,
    ): Promise<boolean> {
      if (this.clientSecret === undefined) {
        return false;
      }
      return await verifyClientSecret(this.clientSecret, actual);
    },
  });
}
