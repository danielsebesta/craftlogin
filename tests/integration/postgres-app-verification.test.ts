import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClientDirectory } from '../../src/api/client-directory.js';
import { PrismaAppManager } from '../../src/developers/app-management.js';
import { PrismaDeveloperAccessRepository } from '../../src/developers/developer-repository.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createDatabaseClient } from '../../src/infrastructure/database.js';

const databaseUrl = requireDatabaseUrl();

describe('PostgreSQL application verification', (): void => {
  const ownerUuid = randomUUID();
  const otherDeveloperUuid = randomUUID();
  const clientId = `verification-test-${randomUUID()}`;
  const concurrentClientId = `verification-test-${randomUUID()}`;
  const clientIds = [clientId, concurrentClientId];
  let database: PrismaClient | null = null;

  beforeAll(async (): Promise<void> => {
    database = createDatabaseClient(databaseUrl);
    await database.$connect();
    // Plain inserts keep the setup out of the serializable access-registry
    // transactions that the developer-access suite runs in parallel.
    await database.developer.createMany({
      data: [{ uuid: ownerUuid }, { uuid: otherDeveloperUuid }],
      skipDuplicates: true,
    });
  });

  afterAll(async (): Promise<void> => {
    if (database === null) {
      return;
    }
    await database.app.deleteMany({ where: { clientId: { in: clientIds } } });
    await database.developer.deleteMany({
      where: { uuid: { in: [ownerUuid, otherDeveloperUuid] } },
    });
    await database.$disconnect();
  });

  it('moves an application through request, approval, withdrawal, and rejection', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const name = `Verification app ${clientId}`;
    const app = await createApp(databaseClient, { clientId, name, ownerUuid });
    const apps = new PrismaAppManager(databaseClient);
    const directory = new PrismaClientDirectory(databaseClient);

    await expect(apps.requestVerification(app.id, ownerUuid, 'Community project')).resolves.toBe(
      'applied',
    );
    // A queued request keeps the first submission: a second one must not overwrite
    // the note an administrator is about to review.
    await expect(apps.requestVerification(app.id, ownerUuid, 'Second note')).resolves.toBe(
      'unavailable',
    );
    const queued = await findApp(apps, ownerUuid, clientId);
    expect(queued.verification).toBe('requested');
    expect(queued.verificationNote).toBe('Community project');
    expect(queued.verificationRequestedAt).toBeTypeOf('string');
    // The consent screen stays unlabelled until an administrator decides.
    await expect(directory.findClient(clientId)).resolves.toEqual({ name, verified: false });

    await expect(apps.decideVerification(app.id, 'approve')).resolves.toBe('applied');
    const verified = await findApp(apps, ownerUuid, clientId);
    expect(verified.verification).toBe('verified');
    expect(verified.verificationNote).toBeUndefined();
    await expect(directory.findClient(clientId)).resolves.toEqual({ name, verified: true });

    // Every decision requires its own starting state.
    await expect(apps.decideVerification(app.id, 'approve')).resolves.toBe('unavailable');
    await expect(apps.decideVerification(app.id, 'reject')).resolves.toBe('unavailable');
    await expect(apps.requestVerification(app.id, ownerUuid, undefined)).resolves.toBe(
      'unavailable',
    );
    // Only the owner can queue an application.
    await expect(apps.requestVerification(app.id, otherDeveloperUuid, undefined)).resolves.toBe(
      'unavailable',
    );

    await expect(apps.decideVerification(app.id, 'revoke')).resolves.toBe('applied');
    const withdrawn = await findApp(apps, ownerUuid, clientId);
    expect(withdrawn.verification).toBe('none');
    expect(withdrawn.verificationRequestedAt).toBeUndefined();
    await expect(directory.findClient(clientId)).resolves.toEqual({ name, verified: false });
    // A withdrawn application can apply again, and rejection clears the queue.
    await expect(apps.requestVerification(app.id, ownerUuid, undefined)).resolves.toBe('applied');
    await expect(apps.decideVerification(app.id, 'reject')).resolves.toBe('applied');
    const rejected = await findApp(apps, ownerUuid, clientId);
    expect(rejected.verification).toBe('none');
    expect(rejected.verificationNote).toBeUndefined();
  });

  it('gives exactly one winner to concurrent verification requests', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const app = await createApp(databaseClient, {
      clientId: concurrentClientId,
      name: `Concurrent app ${concurrentClientId}`,
      ownerUuid,
    });
    const apps = new PrismaAppManager(databaseClient);

    const outcomes = await Promise.all([
      apps.requestVerification(app.id, ownerUuid, 'First claim'),
      apps.requestVerification(app.id, ownerUuid, 'Second claim'),
    ]);
    expect(outcomes.filter((outcome): boolean => outcome === 'applied')).toHaveLength(1);
  });

  it('labels a developer without touching the role registry', async (): Promise<void> => {
    const access = new PrismaDeveloperAccessRepository(requireDatabase(database));

    await expect(access.setVerified(ownerUuid, true)).resolves.toBe(true);
    await expect(access.setVerified(ownerUuid, true)).resolves.toBe(false);
    await expect(access.find(ownerUuid)).resolves.toMatchObject({
      role: 'developer',
      uuid: ownerUuid,
      verified: true,
    });
    // Re-granting access keeps the label; only an explicit decision clears it.
    await access.grant(ownerUuid, 'developer');
    await expect(access.find(ownerUuid)).resolves.toMatchObject({ verified: true });

    await expect(access.setVerified(ownerUuid, false)).resolves.toBe(true);
    await expect(access.setVerified(ownerUuid, false)).resolves.toBe(false);
    await expect(access.find(ownerUuid)).resolves.toMatchObject({ verified: false });
    await expect(access.setVerified(randomUUID(), true)).resolves.toBe(false);
  });
});

async function createApp(
  database: PrismaClient,
  input: { readonly clientId: string; readonly name: string; readonly ownerUuid: string },
): Promise<{ readonly id: string }> {
  return await database.app.create({
    data: {
      clientId: input.clientId,
      clientSecretHash: null,
      name: input.name,
      ownerUuid: input.ownerUuid,
      redirectUris: ['https://verification.example/callback'],
    },
    select: { id: true },
  });
}

async function findApp(
  apps: PrismaAppManager,
  ownerUuid: string,
  clientId: string,
): Promise<{
  readonly verification: string;
  readonly verificationNote?: string;
  readonly verificationRequestedAt?: string;
}> {
  const listed = await apps.list(ownerUuid, 'developer');
  const app = listed.find((candidate): boolean => candidate.clientId === clientId);
  if (app === undefined) {
    throw new Error('The verification test application was not listed for its owner');
  }
  return app;
}

function requireDatabase(database: PrismaClient | null): PrismaClient {
  if (database === null) {
    throw new Error('PostgreSQL integration test client is not initialized');
  }
  return database;
}

function requireDatabaseUrl(): string {
  const value = process.env['TEST_DATABASE_URL'];
  if (value === undefined) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL application verification tests');
  }
  return value;
}
