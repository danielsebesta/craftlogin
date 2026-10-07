import type { Redis } from 'ioredis';
import type { Adapter, AdapterFactory } from 'oidc-provider';

import type { PrismaClient } from '../generated/prisma/client.js';
import { PostgresClientAdapter, PostgresRefreshTokenAdapter } from './postgres-oidc-adapters.js';
import { RedisOidcAdapter } from './redis-oidc-adapter.js';
import { PostgresGrantAdapter } from './postgres-grant-adapter.js';

export function createOidcAdapterFactory(database: PrismaClient, redis: Redis): AdapterFactory {
  const grants = new PostgresGrantAdapter(database);
  return (model: string): Adapter => {
    if (model === 'Grant') return grants;
    if (model === 'Client') {
      return new PostgresClientAdapter(database);
    }
    if (model === 'RefreshToken') {
      return new PostgresRefreshTokenAdapter(database);
    }
    return new RedisOidcAdapter(
      model,
      redis,
      'craftlogin:oidc',
      async (id): Promise<boolean> => (await grants.find(id)) !== undefined,
    );
  };
}
