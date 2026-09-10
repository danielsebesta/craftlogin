import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaAppManager } from '../../src/developers/app-management.js';
import {
  LastAdministratorError,
  PrismaDeveloperAccessRepository,
} from '../../src/developers/developer-repository.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createDatabaseClient } from '../../src/infrastructure/database.js';

const databaseUrl = requireDatabaseUrl();

describe('PostgreSQL developer access', (): void => {
  const firstAdminUuid = randomUUID();
  const secondAdminUuid = randomUUID();
  const developerUuid = randomUUID();
  const ownedClientId = `developer-test-${randomUUID()}`;
  const unownedClientId = `developer-test-${randomUUID()}`;
  const clientIds = [ownedClientId, unownedClientId];
  let database: PrismaClient | null = null;

  beforeAll(async (): Promise<void> => {
    database = createDatabaseClient(databaseUrl);
    await database.$connect();
  });

  afterAll(async (): Promise<void> => {
    if (database === null) {
      return;
    }
    await database.app.deleteMany({ where: { clientId: { in: clientIds } } });
    await database.developer.deleteMany({
      where: { uuid: { in: [firstAdminUuid, secondAdminUuid, developerUuid] } },
    });
    await database.$disconnect();
  });

  it('preserves at least one administrator during concurrent revocation', async (): Promise<void> => {
    const access = new PrismaDeveloperAccessRepository(requireDatabase(database));
    await access.grant(firstAdminUuid, 'admin');
    await access.grant(secondAdminUuid, 'admin');

    const attempts = await Promise.allSettled([
      access.revoke(firstAdminUuid),
      access.revoke(secondAdminUuid),
    ]);
    expect(attempts.filter((attempt): boolean => attempt.status === 'fulfilled')).toHaveLength(1);
    const rejected = attempts.find((attempt): boolean => attempt.status === 'rejected');
    expect(rejected).toBeDefined();
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(LastAdministratorError);
    }
    const remaining = await access.list();
    expect(remaining.filter((developer): boolean => developer.role === 'admin')).toHaveLength(1);
  });

  it('isolates developer-owned apps while allowing administrators to manage all clients', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const access = new PrismaDeveloperAccessRepository(databaseClient);
    await access.grant(developerUuid, 'developer');
    await databaseClient.app.createMany({
      data: [
        {
          clientId: ownedClientId,
          clientSecretHash: null,
          name: 'Owned app',
          ownerUuid: developerUuid,
          redirectUris: ['https://owned.example/callback'],
        },
        {
          clientId: unownedClientId,
          clientSecretHash: null,
          name: 'Unowned app',
          redirectUris: ['https://unowned.example/callback'],
        },
      ],
    });
    const apps = new PrismaAppManager(databaseClient);

    await expect(apps.list(developerUuid, 'developer')).resolves.toHaveLength(1);
    const visibleToAdministrator = await apps.list(firstAdminUuid, 'admin');
    expect(
      visibleToAdministrator.filter((app): boolean => clientIds.includes(app.clientId)),
    ).toHaveLength(2);
    await expect(
      apps.remove(
        visibleToAdministrator.find((app): boolean => app.clientId === unownedClientId)?.id ??
          randomUUID(),
        developerUuid,
        'developer',
      ),
    ).resolves.toBe(false);
  });
});

function requireDatabase(database: PrismaClient | null): PrismaClient {
  if (database === null) {
    throw new Error('PostgreSQL integration test client is not initialized');
  }
  return database;
}

function requireDatabaseUrl(): string {
  const value = process.env['TEST_DATABASE_URL'];
  if (value === undefined) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL developer-access tests');
  }
  return value;
}
