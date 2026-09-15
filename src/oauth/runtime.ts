import type { Redis } from 'ioredis';
import type { Configuration, JWKS } from 'oidc-provider';

import type { PrismaClient } from '../generated/prisma/client.js';
import type { MinecraftUsernameResolver } from '../users/username-resolver.js';
import { RedisVerificationStore } from '../verification/redis-verification-store.js';
import type { SkinVerificationService } from '../verification/skin-verification-service.js';
import { createOidcAdapterFactory } from './adapter-factory.js';
import { createAccountLookup, PrismaAccountUserStore } from './account-lookup.js';
import { ProviderInteractionGateway } from './interaction-gateway.js';
import { OAuthInteractionService } from './interaction-service.js';
import type { OAuthInteractionLogger } from './interaction-service.js';
import {
  createCraftLoginProvider,
  type PostLogoutSuccessRenderer,
  type LogoutSourceRenderer,
} from './provider.js';

export interface OAuthRuntimeConfig {
  readonly cookieKeys: readonly string[];
  readonly issuer: string;
  readonly jwks: JWKS;
  readonly logger: OAuthInteractionLogger;
  readonly microsoftVerificationEnabled?: boolean;
  readonly logoutSource?: LogoutSourceRenderer;
  readonly postLogoutSuccessSource?: PostLogoutSuccessRenderer;
  readonly renderError: NonNullable<Configuration['renderError']>;
  readonly skinVerification?: SkinVerificationService;
  readonly usernames?: MinecraftUsernameResolver;
}

export function createOAuthRuntime(
  config: OAuthRuntimeConfig,
  database: PrismaClient,
  redis: Redis,
): {
  interactions: OAuthInteractionService;
  provider: ReturnType<typeof createCraftLoginProvider>;
} {
  const provider = createCraftLoginProvider({
    adapter: createOidcAdapterFactory(database, redis),
    cookieKeys: config.cookieKeys,
    findAccount: createAccountLookup(new PrismaAccountUserStore(database), {
      issuer: config.issuer,
      ...(config.usernames === undefined ? {} : { usernames: config.usernames }),
    }),
    issuer: config.issuer,
    jwks: config.jwks,
    renderError: config.renderError,
    ...(config.logoutSource === undefined ? {} : { logoutSource: config.logoutSource }),
    ...(config.postLogoutSuccessSource === undefined
      ? {}
      : { postLogoutSuccessSource: config.postLogoutSuccessSource }),
  });
  const verification = new RedisVerificationStore(redis);

  return {
    interactions: new OAuthInteractionService(
      new ProviderInteractionGateway(provider),
      verification,
      config.logger,
      config.skinVerification,
      config.microsoftVerificationEnabled ?? false,
    ),
    provider,
  };
}
