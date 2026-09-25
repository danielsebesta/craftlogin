import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClientDirectory } from '../../src/api/client-directory.js';
import { PrismaAppIconStore } from '../../src/developers/app-icon-store.js';
import { PrismaAppManager } from '../../src/developers/app-management.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createDatabaseClient } from '../../src/infrastructure/database.js';

const databaseUrl = requireDatabaseUrl();

// A real 1x1 PNG, so the stored bytes exercise the same path as an upload.
const ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const ICON_HASH = createHash('sha256').update(ICON_PNG).digest('hex');

describe('PostgreSQL application icons', (): void => {
  const ownerUuid = randomUUID();
  const otherDeveloperUuid = randomUUID();
  // The admin path takes the role argument directly — a persisted admin row
  // would change the global count the developer-access suite asserts on.
  const adminRoleUuid = randomUUID();
  const clientId = `icon-test-${randomUUID()}`;
  let database: PrismaClient | null = null;

  beforeAll(async (): Promise<void> => {
    database = createDatabaseClient(databaseUrl);
    await database.$connect();
    await database.developer.createMany({
      data: [{ uuid: ownerUuid }, { uuid: otherDeveloperUuid }],
      skipDuplicates: true,
    });
    await database.app.create({
      data: { clientId, name: 'Icon test client', ownerUuid, redirectUris: [] },
    });
  });

  afterAll(async (): Promise<void> => {
    if (database === null) {
      return;
    }
    await database.app.deleteMany({ where: { clientId } });
    await database.developer.deleteMany({
      where: { uuid: { in: [ownerUuid, otherDeveloperUuid] } },
    });
    await database.$disconnect();
  });

  it('stores, exposes, and removes an icon through the owner-scoped writes', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const apps = new PrismaAppManager(databaseClient);
    const icons = new PrismaAppIconStore(databaseClient);
    const directory = new PrismaClientDirectory(databaseClient);
    const appId = await requireAppId(databaseClient);

    await expect(icons.findIcon(clientId)).resolves.toBeUndefined();

    // Another developer must not be able to touch the icon.
    await expect(
      apps.setIcon(appId, otherDeveloperUuid, 'developer', { hash: ICON_HASH, png: ICON_PNG }),
    ).resolves.toBe(false);
    await expect(icons.findIcon(clientId)).resolves.toBeUndefined();

    await expect(
      apps.setIcon(appId, ownerUuid, 'developer', { hash: ICON_HASH, png: ICON_PNG }),
    ).resolves.toBe(true);

    const stored = await icons.findIcon(clientId);
    expect(stored?.hash).toBe(ICON_HASH);
    expect(stored?.data.equals(ICON_PNG)).toBe(true);
    await expect(directory.findClient(clientId)).resolves.toEqual({
      iconHash: ICON_HASH,
      name: 'Icon test client',
      verified: false,
    });

    const listed = await apps.list(ownerUuid, 'developer');
    expect(listed[0]?.iconHash).toBe(ICON_HASH);

    // The removal is conditional, so a second one reports the row as unavailable.
    await expect(apps.removeIcon(appId, otherDeveloperUuid, 'developer')).resolves.toBe(false);
    await expect(apps.removeIcon(appId, ownerUuid, 'developer')).resolves.toBe(true);
    await expect(apps.removeIcon(appId, ownerUuid, 'developer')).resolves.toBe(false);
    await expect(icons.findIcon(clientId)).resolves.toBeUndefined();
  });

  it('lets an administrator manage an icon for an unowned application', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const apps = new PrismaAppManager(databaseClient);
    const appId = await requireAppId(databaseClient);

    await expect(
      apps.setIcon(appId, adminRoleUuid, 'admin', { hash: ICON_HASH, png: ICON_PNG }),
    ).resolves.toBe(true);
    await expect(apps.removeIcon(appId, adminRoleUuid, 'admin')).resolves.toBe(true);
  });

  async function requireAppId(databaseClient: PrismaClient): Promise<string> {
    const app = await databaseClient.app.findUnique({ select: { id: true }, where: { clientId } });
    if (app === null) {
      throw new Error('The icon test application was not created');
    }
    return app.id;
  }
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
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL application icon tests');
  }
  return value;
}
