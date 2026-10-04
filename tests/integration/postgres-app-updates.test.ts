import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaAppManager } from '../../src/developers/app-management.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createDatabaseClient } from '../../src/infrastructure/database.js';
import { hashClientSecret, verifyClientSecret } from '../../src/oauth/client-secret.js';

const databaseUrl = requireDatabaseUrl();

describe('PostgreSQL application updates', (): void => {
  const ownerUuid = randomUUID();
  const otherDeveloperUuid = randomUUID();
  // The admin path takes the role argument directly — a persisted admin row
  // would change the global count the developer-access suite asserts on.
  const adminRoleUuid = randomUUID();
  const confidentialClientId = `update-test-conf-${randomUUID()}`;
  const publicClientId = `update-test-pub-${randomUUID()}`;
  let database: PrismaClient | null = null;

  beforeAll(async (): Promise<void> => {
    database = createDatabaseClient(databaseUrl);
    await database.$connect();
    await database.developer.createMany({
      data: [{ uuid: ownerUuid }, { uuid: otherDeveloperUuid }],
      skipDuplicates: true,
    });
    await database.app.createMany({
      data: [
        {
          clientId: confidentialClientId,
          clientSecretHash: await hashClientSecret('cls_initial-secret'),
          name: 'Update test confidential client',
          ownerUuid,
          redirectUris: ['https://app.example/callback'],
        },
        {
          clientId: publicClientId,
          name: 'Update test public client',
          ownerUuid,
          redirectUris: ['https://app.example/callback'],
        },
      ],
    });
  });

  afterAll(async (): Promise<void> => {
    if (database === null) {
      return;
    }
    await database.app.deleteMany({
      where: { clientId: { in: [confidentialClientId, publicClientId] } },
    });
    await database.developer.deleteMany({
      where: { uuid: { in: [ownerUuid, otherDeveloperUuid] } },
    });
    await database.$disconnect();
  });

  it('replaces redirect URIs only for the owner or an administrator', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const apps = new PrismaAppManager(databaseClient);
    const appId = await requireAppId(databaseClient, confidentialClientId);

    // Another developer must not be able to change the list.
    await expect(
      apps.updateRedirectUris(appId, otherDeveloperUuid, 'developer', [
        'https://attacker.example/callback',
      ]),
    ).resolves.toBe(false);
    await expect(storedRedirectUris(databaseClient, appId)).resolves.toEqual([
      'https://app.example/callback',
    ]);

    const updatedList = [
      'https://app.example/callback',
      'https://app.example/secondary',
      'http://localhost:3000/oauth/return',
    ];
    await expect(apps.updateRedirectUris(appId, ownerUuid, 'developer', updatedList)).resolves.toBe(
      true,
    );
    await expect(storedRedirectUris(databaseClient, appId)).resolves.toEqual(updatedList);

    await expect(
      apps.updateRedirectUris(appId, adminRoleUuid, 'admin', ['https://admin.example/cb']),
    ).resolves.toBe(true);
    await expect(storedRedirectUris(databaseClient, appId)).resolves.toEqual([
      'https://admin.example/cb',
    ]);
  });

  it('rejects redirect lists that violate the exact-match rules', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const apps = new PrismaAppManager(databaseClient);
    const appId = await requireAppId(databaseClient, confidentialClientId);
    const before = await storedRedirectUris(databaseClient, appId);

    for (const redirectUris of [
      [],
      ['http://app.example/callback'],
      ['https://*.example/callback'],
      ['https://app.example/cb#fragment'],
      ['https://app.example/cb', 'https://app.example/cb'],
    ]) {
      await expect(
        apps.updateRedirectUris(appId, ownerUuid, 'developer', redirectUris),
      ).rejects.toThrow();
    }
    await expect(storedRedirectUris(databaseClient, appId)).resolves.toEqual(before);
  });

  it('rotates the confidential secret so only the new value verifies', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const apps = new PrismaAppManager(databaseClient);
    const appId = await requireAppId(databaseClient, confidentialClientId);

    // Another developer must not rotate the secret.
    await expect(apps.resetSecret(appId, otherDeveloperUuid, 'developer')).resolves.toBeUndefined();

    const rotated = await apps.resetSecret(appId, ownerUuid, 'developer');
    expect(rotated).toMatch(/^cls_[A-Za-z0-9_-]{43}$/u);
    expect(rotated).not.toBe('cls_initial-secret');

    const stored = await databaseClient.app.findUniqueOrThrow({
      select: { clientSecretHash: true },
      where: { id: appId },
    });
    expect(stored.clientSecretHash).not.toBeNull();
    const hash = stored.clientSecretHash ?? '';
    await expect(verifyClientSecret(hash, rotated ?? '')).resolves.toBe(true);
    await expect(verifyClientSecret(hash, 'cls_initial-secret')).resolves.toBe(false);
  });

  it('cannot rotate a secret for a public client or a missing application', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const apps = new PrismaAppManager(databaseClient);
    const publicAppId = await requireAppId(databaseClient, publicClientId);

    await expect(apps.resetSecret(publicAppId, ownerUuid, 'developer')).resolves.toBeUndefined();
    await expect(apps.resetSecret(randomUUID(), ownerUuid, 'developer')).resolves.toBeUndefined();

    const stored = await databaseClient.app.findUniqueOrThrow({
      select: { clientSecretHash: true },
      where: { id: publicAppId },
    });
    expect(stored.clientSecretHash).toBeNull();
  });

  async function requireAppId(databaseClient: PrismaClient, clientId: string): Promise<string> {
    const app = await databaseClient.app.findUnique({ select: { id: true }, where: { clientId } });
    if (app === null) {
      throw new Error('The update test application was not created');
    }
    return app.id;
  }

  async function storedRedirectUris(
    databaseClient: PrismaClient,
    appId: string,
  ): Promise<readonly string[]> {
    const app = await databaseClient.app.findUniqueOrThrow({
      select: { redirectUris: true },
      where: { id: appId },
    });
    return app.redirectUris;
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
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL application update tests');
  }
  return value;
}
