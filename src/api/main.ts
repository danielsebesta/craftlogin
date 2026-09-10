import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { loadEnvironment } from '../config/environment.js';
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
import { createOAuthRuntime } from '../oauth/runtime.js';
import { installSessionSignalLogging } from '../oauth/session-security.js';
import { RedisVerificationStore } from '../verification/redis-verification-store.js';
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
  const logger = createLogger(environment.logLevel);
  const database = createDatabaseClient(environment.databaseUrl);
  const redis = createRedisClient(environment.redisUrl);

  redis.on('error', (error: Error): void => {
    logger.error({ errorKind: getErrorKind(error) }, 'Redis connection failed');
  });

  let server: Awaited<ReturnType<typeof createApiServer>> | null = null;
  try {
    await Promise.all([database.$connect(), redis.connect()]);
    const oauth = createOAuthRuntime(
      {
        cookieKeys: credentials.cookieKeys,
        issuer: environment.oidcIssuer,
        jwks: credentials.jwks,
        logger,
        renderError: renderAuthorizationError,
      },
      database,
      redis,
    );
    oauth.provider.proxy = environment.httpTrustProxy;
    installSessionSignalLogging(oauth.provider, logger, credentials.cookieKeys);
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
    server = await createApiServer({
      accessTokens: new ProviderAccessTokenAuthenticator(oauth.provider),
      appManager: new PrismaAppManager(database),
      apps: new PrismaAppRegistrar(database),
      clients,
      cookieKeys: credentials.cookieKeys,
      developerAuthentication,
      developerLogins: new DeveloperLoginService(verification, developers, developerSessions),
      developers,
      interactions: oauth.interactions,
      issuer: environment.oidcIssuer,
      logger,
      minecraftBaseDomain: environment.minecraftBaseDomain,
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
