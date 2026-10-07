import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabaseClient(databaseUrl: string, maxConnections = 10): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: maxConnections,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
    statement_timeout: 10_000,
  });

  return new PrismaClient({ adapter });
}
