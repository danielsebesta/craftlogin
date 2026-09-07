import type { Redis } from 'ioredis';
import type { Adapter, AdapterFactory } from 'oidc-provider';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PostgresClientAdapter, PostgresRefreshTokenAdapter } from './postgres-oidc-adapters.js';
import { RedisOidcAdapter } from './redis-oidc-adapter.js';

export function createOidcAdapterFactory(database: PrismaClient, redis: Redis): AdapterFactory {
  return (model: string): Adapter => {
    if (model === 'Client') {
      return new PostgresClientAdapter(database);
    }
    if (model === 'RefreshToken') {
      return new PostgresRefreshTokenAdapter(database);
    }
    return new RedisOidcAdapter(model, redis);
  };
}
