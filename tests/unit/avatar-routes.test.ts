import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { registerAvatarRoutes } from '../../src/api/avatar-routes.js';
import { registerErrorHandling } from '../../src/api/errors.js';
import { registerSharedSchemas } from '../../src/api/schemas.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { SkinStore } from '../../src/mojang/skin-store.js';

const playerUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
const textureHash = '7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5';

function playerLookup(): MinecraftPlayerLookup {
  return {
    findProfileById: (uuid) =>
      Promise.resolve(
        uuid === playerUuid ? { textureHash, username: 'jeb_', uuid: playerUuid } : undefined,
      ),
    findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
  };
}

function skinStore(): SkinStore {
  return {
    fetchSkin: (hash) =>
      Promise.resolve(
        hash === textureHash
          ? { body: Buffer.from('PNGDATA'), contentType: 'image/png' }
          : undefined,
      ),
  };
}

describe('avatar routes', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('renders a skin-backed head for a known player and a placeholder otherwise', async (): Promise<void> => {
    const server = Fastify();
    servers.push(server);
    registerSharedSchemas(server);
    registerErrorHandling(server);
    registerAvatarRoutes(server, { players: playerLookup(), skins: skinStore() });

    const known = await server.inject({ method: 'GET', url: `/avatar/${playerUuid}` });
    expect(known.statusCode).toBe(200);
    expect(known.headers['content-type']).toContain('image/svg+xml');
    expect(known.body).toContain(`/skin/${textureHash}.png`);
    expect(known.headers['cache-control']).toBe('public, max-age=3600');

    const unknown = await server.inject({
      method: 'GET',
      url: '/avatar/00000000-0000-0000-0000-000000000000',
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).not.toContain('/skin/');
  });

  it('serves an immutable skin image and rejects an invalid hash', async (): Promise<void> => {
    const server = Fastify();
    servers.push(server);
    registerSharedSchemas(server);
    registerErrorHandling(server);
    registerAvatarRoutes(server, { players: playerLookup(), skins: skinStore() });

    const image = await server.inject({ method: 'GET', url: `/skin/${textureHash}` });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(image.rawPayload.toString('utf8')).toBe('PNGDATA');

    const missing = await server.inject({ method: 'GET', url: `/skin/${'a'.repeat(64)}` });
    expect(missing.statusCode).toBe(404);

    const invalid = await server.inject({ method: 'GET', url: '/skin/not-a-hash' });
    expect(invalid.statusCode).toBe(400);
  });
});
