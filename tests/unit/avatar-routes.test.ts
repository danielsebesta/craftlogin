import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { CanvasAvatarRenderer } from '../../src/avatars/renderer.js';
import {
  CachedAvatarService,
  type AvatarLookupResult,
  type AvatarService,
} from '../../src/avatars/service.js';
import type { AvatarRenderOptions, AvatarSize, AvatarView } from '../../src/avatars/types.js';
import { registerAvatarRoutes } from '../../src/api/avatar-routes.js';
import { registerErrorHandling } from '../../src/api/errors.js';
import { registerSharedSchemas } from '../../src/api/schemas.js';
import { MemoryMinecraftCache } from '../../src/mojang/cache.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { SkinStore } from '../../src/mojang/skin-store.js';
import { createSkinPng, decodePng } from './support/skin-fixture.js';

const playerUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
const compactPlayerUuid = playerUuid.replaceAll('-', '');
const textureHash = '7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5';
const pngBody = Buffer.from('PNGDATA');
const found: AvatarLookupResult = {
  image: { body: pngBody, contentType: 'image/png', etag: '"avatar-etag"' },
  status: 'found',
};

class RecordingAvatars implements AvatarService {
  public rawResult: AvatarLookupResult = found;
  public renderResult: AvatarLookupResult = found;
  public readonly rawUuids: string[] = [];
  public readonly renders: { options: AvatarRenderOptions; uuid: string }[] = [];

  public findRawSkin(uuid: string): Promise<AvatarLookupResult> {
    this.rawUuids.push(uuid);
    return Promise.resolve(this.rawResult);
  }

  public render(uuid: string, options: AvatarRenderOptions): Promise<AvatarLookupResult> {
    this.renders.push({ options, uuid });
    return Promise.resolve(this.renderResult);
  }
}

function recordingSkins(): { readonly calls: string[]; readonly store: SkinStore } {
  const calls: string[] = [];
  return {
    calls,
    store: {
      fetchSkin: (hash): Promise<{ body: Buffer; contentType: 'image/png' } | undefined> => {
        calls.push(hash);
        return Promise.resolve(
          hash === textureHash ? { body: pngBody, contentType: 'image/png' } : undefined,
        );
      },
    },
  };
}

describe('avatar routes', (): void => {
  const servers: FastifyInstance[] = [];

  afterEach(async (): Promise<void> => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('serves every anonymous UUID image view with bounded options', async (): Promise<void> => {
    const avatars = new RecordingAvatars();
    const skins = recordingSkins();
    const server = await buildServer(avatars, skins.store);

    const raw = await server.inject({
      headers: { origin: 'https://anonymous.example' },
      method: 'GET',
      url: `/api/avatars/${compactPlayerUuid}/skin`,
    });
    const head = await server.inject({ method: 'GET', url: `/api/avatars/${playerUuid}/head` });
    const bust = await server.inject({
      method: 'GET',
      url: `/api/avatars/${playerUuid}/bust?size=256&layers=base`,
    });
    const body = await server.inject({
      method: 'GET',
      url: `/api/avatars/${playerUuid}/body?size=32`,
    });

    for (const response of [raw, head, bust, body]) {
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers.etag).toBe('"avatar-etag"');
      expect(response.headers['cache-control']).toBe(
        'public, max-age=3600, stale-while-revalidate=86400',
      );
    }
    expect(raw.headers['access-control-allow-origin']).toBe('*');
    expect(avatars.rawUuids).toEqual([playerUuid]);
    expect(avatars.renders).toEqual([
      { options: { layers: 'all', size: 128, view: 'head' }, uuid: playerUuid },
      { options: { layers: 'base', size: 256, view: 'bust' }, uuid: playerUuid },
      { options: { layers: 'all', size: 32, view: 'body' }, uuid: playerUuid },
    ]);
  });

  it('returns correctly sized PNGs through the complete render service', async (): Promise<void> => {
    const skin = await createSkinPng([
      {
        color: { blue: 90, green: 140, red: 210 },
        height: 64,
        width: 64,
        x: 0,
        y: 0,
      },
      { color: { alpha: 0, blue: 0, green: 0, red: 0 }, height: 1, width: 1, x: 63, y: 63 },
    ]);
    const players: MinecraftPlayerLookup = {
      findProfileById: (uuid) =>
        Promise.resolve({
          texture: { hash: textureHash, model: 'classic' },
          username: 'FixturePlayer',
          uuid,
        }),
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const skins: SkinStore = {
      fetchSkin: (): Promise<{ body: Buffer; contentType: 'image/png' }> =>
        Promise.resolve({ body: skin, contentType: 'image/png' }),
    };
    const avatars = new CachedAvatarService({
      cache: new MemoryMinecraftCache(),
      players,
      renderer: new CanvasAvatarRenderer(),
      skins,
    });
    const server = await buildServer(avatars, skins);

    const raw = await server.inject({
      method: 'GET',
      url: `/api/avatars/${playerUuid}/skin`,
    });
    expect(raw.rawPayload).toEqual(skin);

    const requests: readonly { readonly size: AvatarSize; readonly view: AvatarView }[] = [
      { size: 32, view: 'head' },
      { size: 64, view: 'bust' },
      { size: 128, view: 'body' },
    ];
    for (const request of requests) {
      const response = await server.inject({
        method: 'GET',
        url: `/api/avatars/${playerUuid}/${request.view}?size=${request.size.toString()}&layers=all`,
      });
      const image = await decodePng(response.rawPayload);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect({ height: image.height, width: image.width }).toEqual({
        height: request.size,
        width: request.size,
      });
    }
  });

  it('keeps the OIDC picture alias and honors conditional requests', async (): Promise<void> => {
    const avatars = new RecordingAvatars();
    const server = await buildServer(avatars, recordingSkins().store);

    const response = await server.inject({
      headers: { origin: 'https://anonymous.example' },
      method: 'GET',
      url: `/avatar/${playerUuid}`,
    });
    const unchanged = await server.inject({
      headers: { 'if-none-match': '"other", W/"avatar-etag"' },
      method: 'GET',
      url: `/avatar/${playerUuid}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(pngBody);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(unchanged.statusCode).toBe(304);
    expect(unchanged.body).toBe('');
    expect(unchanged.headers.etag).toBe('"avatar-etag"');
    expect(unchanged.headers['cache-control']).toBe(
      'public, max-age=3600, stale-while-revalidate=86400',
    );
    expect(avatars.renders).toHaveLength(2);
  });

  it('serves both immutable hash compatibility routes', async (): Promise<void> => {
    const skins = recordingSkins();
    const server = await buildServer(new RecordingAvatars(), skins.store);

    const raw = await server.inject({
      headers: { origin: 'https://anonymous.example' },
      method: 'GET',
      url: `/skin/${textureHash}`,
    });
    const suffixed = await server.inject({ method: 'GET', url: `/skin/${textureHash}.png` });
    const invalid = await server.inject({ method: 'GET', url: `/skin/${textureHash}.jpg` });

    expect(raw.statusCode).toBe(200);
    expect(suffixed.statusCode).toBe(200);
    expect(raw.rawPayload).toEqual(suffixed.rawPayload);
    expect(raw.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(raw.headers['access-control-allow-origin']).toBeUndefined();
    expect(invalid.statusCode).toBe(400);
    expect(skins.calls).toEqual([textureHash, textureHash]);
  });

  it('returns shared errors for missing, unavailable, and invalid requests', async (): Promise<void> => {
    const avatars = new RecordingAvatars();
    const server = await buildServer(avatars, recordingSkins().store);

    avatars.renderResult = { status: 'not-found' };
    const missing = await server.inject({ method: 'GET', url: `/api/avatars/${playerUuid}/head` });
    avatars.renderResult = { status: 'unavailable' };
    const unavailable = await server.inject({
      method: 'GET',
      url: `/api/avatars/${playerUuid}/head`,
    });
    const badSize = await server.inject({
      headers: { origin: 'https://anonymous.example' },
      method: 'GET',
      url: `/api/avatars/${playerUuid}/head?size=1024`,
    });
    const badUuid = await server.inject({ method: 'GET', url: '/api/avatars/not-a-uuid/head' });
    const unexpectedQuery = await server.inject({
      method: 'GET',
      url: `/api/avatars/${playerUuid}/skin?size=128`,
    });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      error: { code: 'not_found', message: 'The Minecraft skin was not found.' },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({
      error: {
        code: 'service_unavailable',
        message: 'The Minecraft skin service is temporarily unavailable.',
      },
    });
    expect(badSize.statusCode).toBe(400);
    expect(badSize.headers['access-control-allow-origin']).toBe('*');
    expect(badUuid.statusCode).toBe(400);
    expect(unexpectedQuery.statusCode).toBe(400);
  });

  async function buildServer(avatars: AvatarService, skins: SkinStore): Promise<FastifyInstance> {
    const server = Fastify({
      ajv: {
        customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false },
      },
    });
    servers.push(server);
    await server.register(cors, { credentials: false, origin: false });
    registerSharedSchemas(server);
    registerErrorHandling(server);
    registerAvatarRoutes(server, { avatars, skins });
    await server.ready();
    return server;
  }
});
