import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { CanvasAvatarRenderer } from '../avatars/renderer.js';
import { CachedAvatarService } from '../avatars/service.js';
import { loadEnvironment } from '../config/environment.js';
import { loadMicrosoftOAuthCredentials } from '../config/microsoft-oauth.js';
import { loadOAuthCredentials } from '../config/oauth-credentials.js';
import { PrismaAppManager } from '../developers/app-management.js';
import { PrismaDeveloperAccessRepository } from '../developers/developer-repository.js';
import { DeveloperLoginService } from '../developers/login-service.js';
import { DeveloperSessionService } from '../developers/session-service.js';
import { RedisDeveloperSessionStore } from '../developers/session-store.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createDatabaseClient } from '../infrastructure/database.js';
import { createRedisClient } from '../infrastructure/redis.js';
import { InfrastructureReadinessCheck } from '../infrastructure/readiness.js';
import { getErrorKind } from '../logging/error-kind.js';
import { createLogger } from '../logging/logger.js';
import { RedisMinecraftCache } from '../mojang/cache.js';
import { HttpMojangClient } from '../mojang/client.js';
import { HttpSkinStore } from '../mojang/skin-store.js';
import { createOAuthRuntime } from '../oauth/runtime.js';
import { installSessionSignalLogging } from '../oauth/session-security.js';
import { RedisVerificationStore } from '../verification/redis-verification-store.js';
import { HttpMicrosoftOAuthClient } from '../verification/microsoft-oauth-client.js';
import { MicrosoftOAuthVerificationService } from '../verification/microsoft-oauth-verification-service.js';
import { RedisSkinVerificationStore } from '../verification/redis-skin-verification-store.js';
import { SkinVerificationService } from '../verification/skin-verification-service.js';
import { VerificationResolver } from '../verification/verification-resolver.js';
import { PrismaVerifiedUserRepository } from '../users/verified-user-repository.js';
import { ProviderAccessTokenAuthenticator } from './access-token-authenticator.js';
import { PrismaAppRegistrar } from './app-registration.js';
import { renderAuthorizationError } from './authorization-error-page.js';
import { PrismaClientDirectory } from './client-directory.js';
import { PrismaCurrentUserLookup } from './current-user.js';
import { DeveloperRequestAuthenticator } from './developer-authentication.js';
import { createApiServer } from './server.js';

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

  let server: Awaited<ReturnType<typeof createApiServer>> | null = null;
  try {
    await Promise.all([database.$connect(), redis.connect()]);
    const [developerSessionKey] = credentials.cookieKeys;
    if (developerSessionKey === undefined) {
      throw new TypeError('A cookie key is required for developer sessions');
    }
    const developers = new PrismaDeveloperAccessRepository(database);
    const verification = new RedisVerificationStore(redis);
    const developerSessions = new DeveloperSessionService(
      new RedisDeveloperSessionStore(redis),
      developers,
      logger,
      developerSessionKey,
    );
    const developerAuthentication = new DeveloperRequestAuthenticator(developerSessions);
    const clients = new PrismaClientDirectory(database);
    const mojangCache = new RedisMinecraftCache(redis);
    const players = new HttpMojangClient({ cache: mojangCache });
    const skins = new HttpSkinStore({ cache: mojangCache, logger });
    const verifiedUsers = new PrismaVerifiedUserRepository(database);
    const skinVerification = new SkinVerificationService(
      new RedisSkinVerificationStore(redis),
      verification,
      players,
      skins,
      verifiedUsers,
      logger,
    );
    const microsoftVerification = new MicrosoftOAuthVerificationService(
      new HttpMicrosoftOAuthClient({
        clientId: microsoftCredentials.clientId,
        ...(microsoftCredentials.clientSecret === undefined
          ? {}
          : { clientSecret: microsoftCredentials.clientSecret }),
        redirectUri: `${environment.oidcIssuer}/interaction/microsoft/callback`,
      }),
      new VerificationResolver(verification, verifiedUsers, players),
    );
    const oauth = createOAuthRuntime(
      {
        cookieKeys: credentials.cookieKeys,
        issuer: environment.oidcIssuer,
        jwks: credentials.jwks,
        logger,
        microsoftVerificationEnabled: true,
        renderError: renderAuthorizationError,
        skinVerification,
      },
      database,
      redis,
    );
    oauth.provider.proxy = environment.httpTrustProxy;
    installSessionSignalLogging(oauth.provider, logger, credentials.cookieKeys);
    const avatars = new CachedAvatarService({
      cache: mojangCache,
      logger,
      players,
      renderer: new CanvasAvatarRenderer(),
      skins,
    });
    server = await createApiServer({
      accessTokens: new ProviderAccessTokenAuthenticator(oauth.provider),
      appManager: new PrismaAppManager(database),
      apps: new PrismaAppRegistrar(database),
      clients,
      cookieKeys: credentials.cookieKeys,
      developerAuthentication,
      developerLogins: new DeveloperLoginService(
        verification,
        developers,
        developerSessions,
        skinVerification,
      ),
      developers,
      interactions: oauth.interactions,
      issuer: environment.oidcIssuer,
      logger,
      minecraft: { avatars, players, skins },
      minecraftBaseDomain: environment.minecraftBaseDomain,
      microsoftOAuth: {
        clientId: microsoftCredentials.clientId,
        verification: microsoftVerification,
      },
      nodeEnvironment: environment.nodeEnvironment,
      oidcHandler: oauth.provider.callback(),
      rateLimitRedis: redis,
      readiness: new InfrastructureReadinessCheck(database, redis),
      trustProxy: environment.httpTrustProxy,
      users: new PrismaCurrentUserLookup(database),
    });
    await server.listen({ host: environment.httpHost, port: environment.httpPort });
    logger.info(
      { host: environment.httpHost, port: environment.httpPort },
      'CraftLogin API is listening',
    );
  } catch (error: unknown) {
    try {
      await closeResources(server, redis, database, logger);
    } catch (cleanupError: unknown) {
      throw new AggregateError([error, cleanupError], 'API startup and cleanup failed', {
        cause: cleanupError,
      });
    }
    throw error;
  }

  let shuttingDown = false;
  const requestShutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    void closeResources(server, redis, database, logger)
      .then((): void => {
        logger.info({ signal }, 'CraftLogin API stopped');
      })
      .catch((error: unknown): void => {
        logger.fatal({ errorKind: getErrorKind(error), signal }, 'API shutdown failed');
        process.exitCode = 1;
      });
  };
  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
}

async function closeResources(
  server: Awaited<ReturnType<typeof createApiServer>> | null,
  redis: Redis,
  database: PrismaClient,
  logger: Logger,
): Promise<void> {
  const failures: unknown[] = [];

  if (server !== null) {
    try {
      await server.close();
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
    logger.error({ failureCount: failures.length }, 'One or more API resources failed to close');
    throw new AggregateError(failures, 'API resource shutdown failed');
  }
}

void main().catch((error: unknown): void => {
  bootstrapLogger.fatal({ errorKind: getErrorKind(error) }, 'CraftLogin API startup failed');
  process.exitCode = 1;
});
