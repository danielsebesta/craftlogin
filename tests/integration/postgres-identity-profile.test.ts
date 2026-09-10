import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaCurrentUserLookup } from '../../src/api/current-user.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createDatabaseClient } from '../../src/infrastructure/database.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import { buildAccountClaims, PrismaAccountUserStore } from '../../src/oauth/account-lookup.js';
import { MojangUsernameResolver, PrismaUsernameStore } from '../../src/users/username-resolver.js';

const databaseUrl = requireDatabaseUrl();
const issuer = 'https://craftlogin.test';

describe('PostgreSQL identity profile', (): void => {
  const uuid = randomUUID();
  let database: PrismaClient | null = null;

  beforeAll(async (): Promise<void> => {
    database = createDatabaseClient(databaseUrl);
    await database.$connect();
    const now = new Date();
    await database.user.upsert({
      create: { firstVerifiedAt: now, lastVerifiedAt: now, username: 'StoredName', uuid },
      update: { username: 'StoredName' },
      where: { uuid },
    });
  });

  afterAll(async (): Promise<void> => {
    if (database === null) {
      return;
    }
    await database.user.deleteMany({ where: { uuid } });
    await database.$disconnect();
  });

  it('refreshes a changed username and publishes the avatar claim', async (): Promise<void> => {
    const db = requireDatabase(database);
    const players: MinecraftPlayerLookup = {
      findProfileById: () => Promise.resolve({ username: 'FreshName', uuid }),
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const usernames = new MojangUsernameResolver(players, new PrismaUsernameStore(db));
    const store = new PrismaAccountUserStore(db);

    const user = await store.findAccountUser(uuid);
    if (user === undefined) {
      throw new Error('Expected the stored account user');
    }
    expect(user.username).toBe('StoredName');

    const claims = await buildAccountClaims(user, { issuer, usernames })();
    expect(claims.preferred_username).toBe('FreshName');
    expect(claims.picture).toBe(`${issuer}/avatar/${uuid}`);

    const stored = await db.user.findUnique({ select: { username: true }, where: { uuid } });
    expect(stored?.username).toBe('FreshName');

    const currentUser = await new PrismaCurrentUserLookup(db, usernames).findCurrentUser(uuid);
    expect(currentUser).toEqual({ username: 'FreshName', uuid });
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
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL identity tests');
  }
  return value;
}
