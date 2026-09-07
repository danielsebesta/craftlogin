import { Redis } from 'ioredis';

export function createRedisClient(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    commandTimeout: 5_000,
    connectTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });
}
