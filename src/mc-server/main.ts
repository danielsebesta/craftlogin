import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import { loadEnvironment } from '../config/environment.js';
import { createDatabaseClient } from '../infrastructure/database.js';
import { createRedisClient } from '../infrastructure/redis.js';
import { getErrorKind } from '../logging/error-kind.js';
import { createLogger } from '../logging/logger.js';
import { PrismaVerifiedUserRepository } from '../users/verified-user-repository.js';
import { RedisVerificationStore } from '../verification/redis-verification-store.js';
import { VerificationResolver } from '../verification/verification-resolver.js';
import { startGhostServer, type MinecraftGhostServer } from './ghost-server.js';

const bootstrapLogger = createLogger('info');

async function main(): Promise<void> {
  const environment = loadEnvironment();
  const logger = createLogger(environment.logLevel);
  const database = createDatabaseClient(environment.databaseUrl);
  const redis = createRedisClient(environment.redisUrl);

  redis.on('error', (error: Error): void => {
    logger.error({ errorKind: getErrorKind(error) }, 'Redis connection failed');
  });

  let ghostServer: MinecraftGhostServer | null = null;

  try {
    await Promise.all([database.$connect(), redis.connect()]);

    const verificationStore = new RedisVerificationStore(redis);
    const users = new PrismaVerifiedUserRepository(database);
    const resolver = new VerificationResolver(verificationStore, users);
    ghostServer = await startGhostServer(
      {
        baseDomain: environment.minecraftBaseDomain,
        host: environment.minecraftHost,
        port: environment.minecraftPort,
      },
      { logger, pendingCodes: verificationStore, resolver },
    );

    logger.info(
      { host: environment.minecraftHost, port: environment.minecraftPort },
      'Minecraft ghost server is listening',
    );
  } catch (error: unknown) {
    try {
      await closeResources(ghostServer, redis, database.$disconnect.bind(database), logger);
    } catch (cleanupError: unknown) {
      throw new AggregateError(
        [error, cleanupError],
        'Minecraft ghost server startup and cleanup failed',
        { cause: cleanupError },
      );
    }
    throw error;
  }

  let shuttingDown = false;
  const requestShutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    void closeResources(ghostServer, redis, database.$disconnect.bind(database), logger)
      .then((): void => {
        logger.info({ signal }, 'Minecraft ghost server stopped');
      })
      .catch((error: unknown): void => {
        logger.fatal({ errorKind: getErrorKind(error), signal }, 'Graceful shutdown failed');
        process.exitCode = 1;
      });
  };

  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
}

async function closeResources(
  ghostServer: MinecraftGhostServer | null,
  redis: Redis,
  disconnectDatabase: () => Promise<void>,
  logger: Logger,
): Promise<void> {
  const failures: unknown[] = [];

  if (ghostServer !== null) {
    try {
      await ghostServer.close();
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
    await disconnectDatabase();
  } catch (error: unknown) {
    failures.push(error);
  }

  if (failures.length > 0) {
    logger.error({ failureCount: failures.length }, 'One or more resources failed to close');
    throw new AggregateError(failures, 'Resource shutdown failed');
  }
}

void main().catch((error: unknown): void => {
  bootstrapLogger.fatal(
    { errorKind: getErrorKind(error) },
    'Minecraft ghost server startup failed',
  );
  process.exitCode = 1;
});
