import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerErrorHandling } from '../../src/api/errors.js';
import { registerSharedSchemas } from '../../src/api/schemas.js';
import { registerUserRoutes } from '../../src/api/user-routes.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';

const playerUuid = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

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

  it('returns shared errors for invalid, unknown, and unavailable profiles', async (): Promise<void> => {
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
    const missing = await server.inject({ method: 'GET', url: '/api/users/UnknownPlayer' });
    unavailable = true;
    const failed = await server.inject({ method: 'GET', url: '/api/users/UnknownPlayer' });

    expect(invalid.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
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
