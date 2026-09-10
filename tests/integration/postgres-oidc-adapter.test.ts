import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createDatabaseClient } from '../../src/infrastructure/database.js';
import { PrismaAppRegistrar } from '../../src/api/app-registration.js';
import { verifyClientSecret } from '../../src/oauth/client-secret.js';
import {
  PostgresClientAdapter,
  PostgresRefreshTokenAdapter,
} from '../../src/oauth/postgres-oidc-adapters.js';

const databaseUrl = requireDatabaseUrl();

describe('PostgresRefreshTokenAdapter', (): void => {
  const userUuid = randomUUID();
  const clientId = `integration-${randomUUID()}`;
  const registeredClientIds: string[] = [];
  let database: PrismaClient | null = null;

  beforeAll(async (): Promise<void> => {
    database = createDatabaseClient(databaseUrl);
    await database.$connect();
    await database.user.create({
      data: {
        uuid: userUuid,
        username: 'OidcTest',
        lastVerifiedAt: new Date(),
      },
    });
    await database.developer.create({ data: { uuid: userUuid } });
    await database.app.create({
      data: {
        clientId,
        clientSecretHash: null,
        name: 'OIDC adapter integration test',
        redirectUris: ['http://127.0.0.1/callback'],
      },
    });
  });

  afterAll(async (): Promise<void> => {
    if (database === null) {
      return;
    }
    if (registeredClientIds.length > 0) {
      await database.app.deleteMany({ where: { clientId: { in: registeredClientIds } } });
    }
    await database.app.deleteMany({ where: { clientId } });
    await database.developer.deleteMany({ where: { uuid: userUuid } });
    await database.user.deleteMany({ where: { uuid: userUuid } });
    await database.$disconnect();
  });

  it('hashes refresh tokens and permits one concurrent consumption', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const adapter = new PostgresRefreshTokenAdapter(databaseClient);
    const refreshToken = `refresh-token-${randomUUID()}`;

    await adapter.upsert(
      refreshToken,
      {
        accountId: userUuid,
        clientId,
        grantId: `grant-${randomUUID()}`,
      },
      3_600,
    );

    const stored = await databaseClient.refreshToken.findFirstOrThrow({ where: { clientId } });
    expect(stored.tokenHash).not.toBe(refreshToken);
    expect(JSON.stringify(stored.adapterPayload)).not.toContain(refreshToken);

    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, async (): Promise<void> => {
        await adapter.consume(refreshToken);
      }),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(7);

    const consumed = await adapter.find(refreshToken);
    expect(consumed?.jti).toBe(refreshToken);
    expect(typeof consumed?.consumed).toBe('number');

    await adapter.upsert(
      refreshToken,
      {
        accountId: userUuid,
        clientId,
        grantId: `grant-${randomUUID()}`,
      },
      3_600,
    );
    await expect(adapter.consume(refreshToken)).rejects.toThrow();
  });

  it('maps public client metadata and rejects mismatched adapter ids', async (): Promise<void> => {
    const adapter = new PostgresClientAdapter(requireDatabase(database));

    await expect(adapter.find(clientId)).resolves.toMatchObject({
      client_id: clientId,
      redirect_uris: ['http://127.0.0.1/callback'],
      token_endpoint_auth_method: 'none',
    });
    await expect(
      adapter.upsert('different-client-id', {
        client_id: clientId,
        redirect_uris: ['http://127.0.0.1/callback'],
      }),
    ).rejects.toThrow('does not match client_id');
  });

  it('returns a confidential secret once and persists only its Argon2id hash', async (): Promise<void> => {
    const databaseClient = requireDatabase(database);
    const registered = await new PrismaAppRegistrar(databaseClient).register(
      {
        clientType: 'confidential',
        name: 'Confidential integration client',
        redirectUris: ['https://client.example/callback'],
      },
      userUuid,
    );
    registeredClientIds.push(registered.clientId);
    if (registered.clientSecret === undefined) {
      throw new Error('Expected a confidential client secret');
    }

    const stored = await databaseClient.app.findUniqueOrThrow({
      where: { clientId: registered.clientId },
      select: { clientSecretHash: true, ownerUuid: true },
    });
    expect(stored.ownerUuid).toBe(userUuid);
    expect(stored.clientSecretHash).not.toBe(registered.clientSecret);
    expect(stored.clientSecretHash).toMatch(/^\$argon2id\$/u);
    await expect(
      verifyClientSecret(stored.clientSecretHash ?? '', registered.clientSecret),
    ).resolves.toBe(true);
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
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL integration tests');
  }
  return value;
}
