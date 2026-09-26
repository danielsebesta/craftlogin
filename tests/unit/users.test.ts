import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerErrorHandling } from '../../src/api/errors.js';
import { registerSharedSchemas } from '../../src/api/schemas.js';
import { registerUserRoutes } from '../../src/api/user-routes.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import { offlinePlayerUuid } from '../../src/mojang/default-skins.js';
import { buildAccountClaims, type AccountUser } from '../../src/oauth/account-lookup.js';
import { MojangUsernameResolver, type UsernameStore } from '../../src/users/username-resolver.js';
import type { MinecraftUsernameResolver } from '../../src/users/username-resolver.js';

const playerUuid = '069a79f4-44e9-4726-a5be-fca90e38aaf5';
const resolverUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';

function lookup(
  profile: () => Promise<{ username: string; uuid: string } | undefined>,
): MinecraftPlayerLookup {
  return {
    findProfileById: profile,
    findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
  };
}

describe('MojangUsernameResolver', (): void => {
  it('persists and returns a refreshed username', async (): Promise<void> => {
    const updates: { username: string; uuid: string }[] = [];
    const store: UsernameStore = {
      updateUsername: (uuid, username) => {
        updates.push({ username, uuid });
        return Promise.resolve();
      },
    };
    const resolver = new MojangUsernameResolver(
      lookup(() => Promise.resolve({ username: 'NewName', uuid: resolverUuid })),
      store,
    );

    await expect(resolver.resolve(resolverUuid, 'OldName')).resolves.toBe('NewName');
    expect(updates).toEqual([{ username: 'NewName', uuid: resolverUuid }]);
  });

  it('keeps the stored username when it already matches or Minecraft is unavailable', async (): Promise<void> => {
    const store: UsernameStore = {
      updateUsername: () => Promise.reject(new Error('should not persist')),
    };

    const matching = new MojangUsernameResolver(
      lookup(() => Promise.resolve({ username: 'SameName', uuid: resolverUuid })),
      store,
    );
    await expect(matching.resolve(resolverUuid, 'SameName')).resolves.toBe('SameName');

    const offline = new MojangUsernameResolver(
      lookup(() => Promise.reject(new Error('offline'))),
      store,
    );
    await expect(offline.resolve(resolverUuid, 'StoredName')).resolves.toBe('StoredName');
  });
});

const user: AccountUser = {
  username: 'StoredName',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
};
const issuer = 'https://craftlogin.com';

describe('buildAccountClaims', (): void => {
  it('publishes the stored or refreshed username with an avatar picture URL', async (): Promise<void> => {
    const stored = await buildAccountClaims(user, { issuer })();
    expect(stored).toEqual({
      picture: `${issuer}/avatar/${user.uuid}`,
      preferred_username: 'StoredName',
      sub: user.uuid,
    });

    const usernames: MinecraftUsernameResolver = {
      resolve: (uuid, storedName) => Promise.resolve(uuid === user.uuid ? 'FreshName' : storedName),
    };
    const refreshed = await buildAccountClaims(user, { issuer, usernames })();
    expect(refreshed.preferred_username).toBe('FreshName');
    expect(refreshed.picture).toBe(`${issuer}/avatar/${user.uuid}`);
  });
});

describe('public player profile routes', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('resolves a username and UUID in either direction', async (): Promise<void> => {
    const names: string[] = [];
    const uuids: string[] = [];
    const server = await buildServer({
      findProfileById: (uuid) => {
        uuids.push(uuid);
        return Promise.resolve({ username: 'Notch', uuid });
      },
      findProfileByName: (username) => {
        names.push(username);
        return Promise.resolve({ username: 'Notch', uuid: playerUuid });
      },
    });

    const byName = await server.inject({
      headers: { origin: 'https://anonymous.example' },
      method: 'GET',
      url: '/api/users/Notch',
    });
    const byUuid = await server.inject({
      method: 'GET',
      url: `/api/users/${playerUuid.replaceAll('-', '')}`,
    });

    expect(byName.statusCode).toBe(200);
    expect(byName.json()).toEqual({ username: 'Notch', uuid: playerUuid });
    expect(byName.headers['access-control-allow-origin']).toBe('*');
    expect(byName.headers['cache-control']).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    );
    expect(byUuid.statusCode).toBe(200);
    expect(byUuid.json()).toEqual({ username: 'Notch', uuid: playerUuid });
    expect(names).toEqual(['Notch']);
    expect(uuids).toEqual([playerUuid]);

    const preflight = await server.inject({
      headers: {
        'access-control-request-method': 'GET',
        origin: 'https://anonymous.example',
      },
      method: 'OPTIONS',
      url: '/api/users/Notch',
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('*');
  });

  it('resolves unknown names to offline profiles with a short cache', async (): Promise<void> => {
    const server = await buildServer({
      findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    });

    const offline = await server.inject({ method: 'GET', url: '/api/users/UnknownPlayer' });

    expect(offline.statusCode).toBe(200);
    expect(offline.json()).toEqual({
      username: 'UnknownPlayer',
      uuid: offlinePlayerUuid('UnknownPlayer'),
    });
    expect(offline.headers['cache-control']).toBe(
      'public, max-age=300, stale-while-revalidate=3600',
    );
    expect(offlinePlayerUuid('UnknownPlayer')).toBe(offlinePlayerUuid('UnknownPlayer'));
  });

  it('returns shared errors for invalid, unknown-UUID, and unavailable profiles', async (): Promise<void> => {
    let unavailable = false;
    const server = await buildServer({
      findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
      findProfileByName: () => {
        if (unavailable) {
          return Promise.reject(new Error('Minecraft is unavailable'));
        }
        return Promise.resolve(undefined);
      },
    });

    const invalid = await server.inject({ method: 'GET', url: '/api/users/not-a-name!' });
    const missingUuid = await server.inject({
      method: 'GET',
      url: '/api/users/123e4567e89b42d3a456426614174000',
    });
    unavailable = true;
    const failed = await server.inject({ method: 'GET', url: '/api/users/UnknownPlayer' });

    expect(invalid.statusCode).toBe(400);
    expect(missingUuid.statusCode).toBe(404);
    expect(missingUuid.json()).toEqual({
      error: { code: 'not_found', message: 'That Minecraft Java player could not be found.' },
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.json()).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'The Minecraft profile service is temporarily unavailable.',
      },
    });
  });

  async function buildServer(players: MinecraftPlayerLookup): Promise<FastifyInstance> {
    const unavailable = (): never => {
      throw new Error('Unexpected authenticated user route call');
    };
    const server = Fastify({
      ajv: {
        customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false },
      },
    });
    servers.push(server);
    await server.register(cors, { credentials: false, origin: false });
    registerSharedSchemas(server);
    registerErrorHandling(server);
    registerUserRoutes(
      server,
      { authenticate: unavailable },
      { findCurrentUser: unavailable },
      players,
    );
    await server.ready();
    return server;
  }
});
