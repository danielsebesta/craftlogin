import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { CanvasAvatarRenderer } from './avatars/renderer.js';
import { CachedAvatarService } from './avatars/service.js';
import { ProviderAccessTokenAuthenticator } from './api/access-token-authenticator.js';
import { PrismaAppRegistrar } from './api/app-registration.js';
import { renderAuthorizationError } from './api/authorization-error-page.js';
import { PrismaClientDirectory } from './api/client-directory.js';
import { PrismaCurrentUserLookup } from './api/current-user.js';
import { DeveloperRequestAuthenticator } from './api/developer-authentication.js';
import { renderLogoutPage, renderLogoutSuccessPage } from './api/logout-page.js';
import { createApiServer } from './api/server.js';
import { loadEnvironment } from './config/environment.js';
import { loadMicrosoftOAuthCredentials } from './config/microsoft-oauth.js';
import { loadOAuthCredentials } from './config/oauth-credentials.js';
import { PrismaAppManager } from './developers/app-management.js';
import { PrismaDeveloperAccessRepository } from './developers/developer-repository.js';
import { ensureConsoleClient } from './developers/console-client.js';
import { DeveloperSessionService } from './developers/session-service.js';
import { RedisDeveloperSessionStore } from './developers/session-store.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { createDatabaseClient } from './infrastructure/database.js';
import { InfrastructureReadinessCheck } from './infrastructure/readiness.js';
import { createRedisClient } from './infrastructure/redis.js';
import { getErrorKind } from './logging/error-kind.js';
import { createLogger } from './logging/logger.js';
import { RedisMinecraftCache } from './mojang/cache.js';
import { HttpMojangClient, type MojangLogger } from './mojang/client.js';
import { HttpSkinStore } from './mojang/skin-store.js';
import { startGhostServer, type MinecraftGhostServer } from './mc-server/ghost-server.js';
import { createOAuthRuntime } from './oauth/runtime.js';
import { installSessionSignalLogging } from './oauth/session-security.js';
import { PrismaVerifiedUserRepository } from './users/verified-user-repository.js';
import { MojangUsernameResolver, PrismaUsernameStore } from './users/username-resolver.js';
import { RedisVerificationStore } from './verification/redis-verification-store.js';
import { HttpMicrosoftOAuthClient } from './verification/microsoft-oauth-client.js';
import { MicrosoftOAuthVerificationService } from './verification/microsoft-oauth-verification-service.js';
import { RedisSkinVerificationStore } from './verification/redis-skin-verification-store.js';
import { SkinVerificationService } from './verification/skin-verification-service.js';
import { VerificationResolver } from './verification/verification-resolver.js';

const bootstrapLogger = createLogger('info');

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const credentials = loadOAuthCredentials(process.env, environment.nodeEnvironment);
  const microsoftCredentials = loadMicrosoftOAuthCredentials(process.env);
  const logger = createLogger(environment.logLevel);
  const database = createDatabaseClient(environment.databaseUrl);
  const redis = createRedisClient(environment.redisUrl);
  redis.on('error', (error: Error): void => {
    logger.error({ errorKind: getErrorKind(error) }, 'Redis connection failed');
  });

  let api: FastifyInstance | null = null;
  let minecraft: MinecraftGhostServer | null = null;
  try {
    await Promise.all([database.$connect(), redis.connect()]);

    const verification = new RedisVerificationStore(redis);
    const verifiedUsers = new PrismaVerifiedUserRepository(database);
    const mojangLogger: MojangLogger = {
      warn: (details: Record<string, unknown>, message: string): void => {
        logger.warn(details, message);
      },
    };
    const mojangCache = new RedisMinecraftCache(redis);
    const players = new HttpMojangClient({ cache: mojangCache, logger: mojangLogger });
    const skins = new HttpSkinStore({ cache: mojangCache, logger });
    const avatars = new CachedAvatarService({
      cache: mojangCache,
      logger,
      players,
      renderer: new CanvasAvatarRenderer(),
      skins,
    });
    const usernames = new MojangUsernameResolver(players, new PrismaUsernameStore(database));
    const skinVerification = new SkinVerificationService(
      new RedisSkinVerificationStore(redis),
      verification,
      players,
      skins,
      verifiedUsers,
      logger,
    );
    const verificationResolver = new VerificationResolver(verification, verifiedUsers, players);
    const microsoftVerification = new MicrosoftOAuthVerificationService(
      new HttpMicrosoftOAuthClient({
        clientId: microsoftCredentials.clientId,
        ...(microsoftCredentials.clientSecret === undefined
          ? {}
          : { clientSecret: microsoftCredentials.clientSecret }),
        redirectUri: `${environment.oidcIssuer}/interaction/microsoft/callback`,
      }),
      verificationResolver,
    );
    minecraft = await startGhostServer(
      {
        baseDomain: environment.minecraftBaseDomain,
        host: environment.minecraftHost,
        port: environment.minecraftPort,
      },
      {
        logger,
        pendingCodes: verification,
        resolver: verificationResolver,
      },
    );

    const [developerSessionKey] = credentials.cookieKeys;
    if (developerSessionKey === undefined) {
      throw new TypeError('A cookie key is required for developer sessions');
    }
    const developers = new PrismaDeveloperAccessRepository(database);
    const developerSessions = new DeveloperSessionService(
      new RedisDeveloperSessionStore(redis),
      developers,
      logger,
      developerSessionKey,
    );
    const consoleClient = await ensureConsoleClient(database, environment.oidcIssuer);
    const oauth = createOAuthRuntime(
      {
        cookieKeys: credentials.cookieKeys,
        issuer: environment.oidcIssuer,
        jwks: credentials.jwks,
        logger,
        microsoftVerificationEnabled: true,
        logoutSource: renderLogoutPage,
        postLogoutSuccessSource: renderLogoutSuccessPage,
        renderError: renderAuthorizationError,
        skinVerification,
        usernames,
      },
      database,
      redis,
    );
    oauth.provider.proxy = environment.httpTrustProxy;
    installSessionSignalLogging(oauth.provider, logger, credentials.cookieKeys);
    const developerAuthentication = new DeveloperRequestAuthenticator(developerSessions);
    const clients = new PrismaClientDirectory(database);
    api = await createApiServer({
      accessTokens: new ProviderAccessTokenAuthenticator(oauth.provider),
      appManager: new PrismaAppManager(database),
      apps: new PrismaAppRegistrar(database),
      clients,
      cookieKeys: credentials.cookieKeys,
      developerAuthentication,
      consoleClient,
      developerSessions,
      httpPort: environment.httpPort,
      developers,
      interactions: oauth.interactions,
      issuer: environment.oidcIssuer,
      logger,
      minecraft: { avatars, players, skins },
      minecraftBaseDomain: environment.minecraftBaseDomain,
      microsoftOAuth: {
        clientId: microsoftCredentials.clientId,
      },
      microsoftVerification,
      nodeEnvironment: environment.nodeEnvironment,
      oidcHandler: oauth.provider.callback(),
      rateLimitRedis: redis,
      readiness: new InfrastructureReadinessCheck(database, redis),
      trustProxy: environment.httpTrustProxy,
      users: new PrismaCurrentUserLookup(database, usernames),
    });
    await api.listen({ host: environment.httpHost, port: environment.httpPort });
    logger.info(
      {
        httpHost: environment.httpHost,
        httpPort: environment.httpPort,
        minecraftHost: environment.minecraftHost,
        minecraftPort: environment.minecraftPort,
      },
      'CraftLogin is listening',
    );
  } catch (error: unknown) {
    await closeAfterStartupFailure(api, minecraft, redis, database, logger, error);
  }

  let shuttingDown = false;
  const requestShutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void closeResources(api, minecraft, redis, database, logger)
      .then((): void => {
        logger.info({ signal }, 'CraftLogin stopped');
      })
      .catch((error: unknown): void => {
        logger.fatal({ errorKind: getErrorKind(error), signal }, 'CraftLogin shutdown failed');
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
}

async function closeAfterStartupFailure(
  api: FastifyInstance | null,
  minecraft: MinecraftGhostServer | null,
  redis: Redis,
  database: PrismaClient,
  logger: Logger,
  startupError: unknown,
): Promise<never> {
  try {
    await closeResources(api, minecraft, redis, database, logger);
  } catch (cleanupError: unknown) {
    throw new AggregateError([startupError, cleanupError], 'Startup and cleanup failed', {
      cause: cleanupError,
    });
  }
  throw startupError;
}

async function closeResources(
  api: FastifyInstance | null,
  minecraft: MinecraftGhostServer | null,
  redis: Redis,
  database: PrismaClient,
  logger: Logger,
): Promise<void> {
  const failures: unknown[] = [];
  if (api !== null) {
    try {
      await api.close();
    } catch (error: unknown) {
      failures.push(error);
    }
  }
  if (minecraft !== null) {
    try {
      await minecraft.close();
    } catch (error: unknown) {
      failures.push(error);
    }
  }

  try {
    if (redis.status === 'ready') {
      await redis.quit();
    } else {
      redis.disconnect();
    }
  } catch (error: unknown) {
    redis.disconnect();
    failures.push(error);
  }
  try {
    await database.$disconnect();
  } catch (error: unknown) {
    failures.push(error);
  }

  if (failures.length > 0) {
    logger.error({ failureCount: failures.length }, 'One or more resources failed to close');
    throw new AggregateError(failures, 'Resource shutdown failed');
  }
}

void main().catch((error: unknown): void => {
  bootstrapLogger.fatal({ errorKind: getErrorKind(error) }, 'CraftLogin startup failed');
  process.exitCode = 1;
});
