import type { Redis } from 'ioredis';
import type { Configuration, JWKS } from 'oidc-provider';

import type { PrismaClient } from '../generated/prisma/client.js';
import { RedisVerificationStore } from '../verification/redis-verification-store.js';
import { createOidcAdapterFactory } from './adapter-factory.js';
import { createAccountLookup } from './account-lookup.js';
import { ProviderInteractionGateway } from './interaction-gateway.js';
import { OAuthInteractionService } from './interaction-service.js';
import type { OAuthInteractionLogger } from './interaction-service.js';
import { createCraftLoginProvider } from './provider.js';

export interface OAuthRuntimeConfig {
  readonly cookieKeys: readonly string[];
  readonly issuer: string;
  readonly jwks: JWKS;
  readonly logger: OAuthInteractionLogger;
  readonly renderError: NonNullable<Configuration['renderError']>;
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
    findAccount: createAccountLookup(database),
    issuer: config.issuer,
    jwks: config.jwks,
    renderError: config.renderError,
  });
  const verification = new RedisVerificationStore(redis);

  return {
    interactions: new OAuthInteractionService(
      new ProviderInteractionGateway(provider),
      verification,
      config.logger,
    ),
    provider,
  };
}
