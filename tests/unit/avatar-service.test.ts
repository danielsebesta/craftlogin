import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { AvatarRenderer } from '../../src/avatars/renderer.js';
import { CachedAvatarService } from '../../src/avatars/service.js';
import type { SkinTexture, TexturePixels } from '../../src/avatars/skin-texture.js';
import type { AvatarRenderOptions, MinecraftSkinModel } from '../../src/avatars/types.js';
import type { CachedValue, MinecraftCache } from '../../src/mojang/cache.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import {
  offlinePlayerUuid,
  selectDefaultSkin,
  type DefaultSkinSource,
} from '../../src/mojang/default-skins.js';
import type { SkinStore } from '../../src/mojang/skin-store.js';
import { createSkinPng, decodePng, readFixturePixel } from './support/skin-fixture.js';

const playerUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
const capeHash = '9c8e7d6b5a4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e';
const secondUuid = '123e4567-e89b-42d3-a456-426614174000';
const textureHash = '7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5';

class RecordingCache implements MinecraftCache {
  public readonly entries = new Map<string, CachedValue>();
  public readonly writes: { readonly key: string; readonly ttlSeconds: number }[] = [];

  public read(key: string): Promise<CachedValue | undefined> {
    return Promise.resolve(this.entries.get(key));
  }

  public write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.writes.push({ key, ttlSeconds });
    this.entries.set(key, { fetchedAt: Date.now(), value });
    return Promise.resolve();
  }
}

class RecordingRenderer implements AvatarRenderer {
  public calls = 0;
  public fail = false;
  public readonly capeTextures: (TexturePixels | undefined)[] = [];
  public readonly models: MinecraftSkinModel[] = [];

  public render(
    _texture: SkinTexture,
    model: MinecraftSkinModel,
    options: AvatarRenderOptions,
    capeTexture?: TexturePixels,
  ): Promise<Buffer> {
    this.calls += 1;
    this.models.push(model);
    this.capeTextures.push(capeTexture);
    return this.fail
      ? Promise.reject(new Error('render failed'))
      : Promise.resolve(
          Buffer.from(`render:${options.view}:${options.layers}:${options.size.toString()}`),
        );
  }
}

describe('CachedAvatarService', (): void => {
  it('returns raw skins and content-addressed renders with stable entity tags', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const renderer = new RecordingRenderer();
    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const raw = await service.findRawSkin(playerUuid);
    const first = await service.render(playerUuid, { layers: 'all', size: 128, view: 'face' });
    const second = await service.render(secondUuid, { layers: 'all', size: 128, view: 'face' });

    expect(raw.status).toBe('found');
    expect(first).toEqual(second);
    expect(renderer.calls).toBe(1);
    expect(cache.writes).toEqual([
      {
        key: `avatar-render:v15:${textureHash}:slim:face:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
    if (first.status === 'found') {
      expect(first.image.etag).toMatch(/^"[A-Za-z0-9_-]+"$/u);
    }
  });

  it('coalesces concurrent identical renders but separates semantic options', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const renderer = new RecordingRenderer();
    const skins = new RecordingSkinStore(skin);
    const cache = new RecordingCache();
    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer,
      skins,
    });
    const options = { layers: 'all', size: 64, view: 'body' } satisfies AvatarRenderOptions;

    await Promise.all([service.render(playerUuid, options), service.render(playerUuid, options)]);
    await service.render(playerUuid, { ...options, layers: 'base' });
    await service.render(playerUuid, { ...options, size: 128 });

    expect(renderer.calls).toBe(3);
    expect(skins.calls).toBe(3);
    expect(cache.writes).toEqual([
      {
        key: `avatar-render:v15:${textureHash}:slim:body:all:64`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v15:${textureHash}:slim:body:base:64`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v15:${textureHash}:slim:body:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('distinguishes missing and unavailable sources and never caches failed renders', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const missingCache = new RecordingCache();
    const missingRenderer = new RecordingRenderer();
    const missing = new CachedAvatarService({
      cache: missingCache,
      defaultSkins: defaultSkins(skin),
      players: {
        findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
        findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
      },
      renderer: missingRenderer,
      skins: skinStore(skin),
    });
    const unavailable = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: { fetchSkin: (): Promise<never> => Promise.reject(new Error('offline')) },
    });
    const failedCache = new RecordingCache();
    const failedRenderer = new RecordingRenderer();
    failedRenderer.fail = true;
    const failed = new CachedAvatarService({
      cache: failedCache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer: failedRenderer,
      skins: skinStore(skin),
    });
    const options = { layers: 'all', size: 128, view: 'face' } satisfies AvatarRenderOptions;

    const fallback = await missing.render(playerUuid, options);
    expect(fallback.status).toBe('found');
    expect(missingRenderer.calls).toBe(1);
    const expectedDefault = selectDefaultSkin(playerUuid);
    expect(missingCache.writes).toEqual([
      {
        key: `avatar-render:v15:default:${expectedDefault.name}:${expectedDefault.model}:face:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
    await expect(unavailable.render(playerUuid, options)).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(failed.render(playerUuid, options)).resolves.toEqual({ status: 'unavailable' });
    expect(failedCache.writes).toEqual([]);
  });

  it('reports unavailable when the default skin source fails for unknown players', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const missingPlayers: MinecraftPlayerLookup = {
      findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const rejected = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: {
        fetchDefaultSkin: (): Promise<never> => Promise.reject(new Error('offline')),
      },
      players: missingPlayers,
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });
    const absent = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: missingPlayers,
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });
    const options = { layers: 'all', size: 128, view: 'face' } satisfies AvatarRenderOptions;

    await expect(rejected.render(playerUuid, options)).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(absent.render(playerUuid, options)).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('serves processed skins normalized to the modern opaque-base layout', async (): Promise<void> => {
    const skin = await createSkinPng(
      [
        {
          color: { blue: 20, green: 20, red: 220 },
          height: 8,
          width: 8,
          x: 8,
          y: 8,
        },
        {
          color: { alpha: 64, blue: 20, green: 20, red: 220 },
          height: 1,
          width: 1,
          x: 16,
          y: 8,
        },
      ],
      32,
    );
    const cache = new RecordingCache();
    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });

    const result = await service.findProcessedSkin(playerUuid);
    expect(result.status).toBe('found');
    if (result.status !== 'found') {
      throw new Error('Expected a processed skin');
    }
    const image = await decodePng(result.image.body);
    expect({ height: image.height, width: image.width }).toEqual({ height: 64, width: 64 });
    expect(readFixturePixel(image, 8, 8)).toEqual({ alpha: 255, blue: 20, green: 20, red: 220 });
    expect(readFixturePixel(image, 16, 8).alpha).toBe(255);
    expect(readFixturePixel(image, 40, 8).alpha).toBe(0);
    // Fully transparent padding stays transparent instead of turning opaque.
    expect(readFixturePixel(image, 0, 0).alpha).toBe(0);
    expect(readFixturePixel(image, 0, 48).alpha).toBe(0);
    // A transparent pixel inside a used base-layer UV face becomes opaque.
    expect(readFixturePixel(image, 50, 16).alpha).toBe(255);
    expect(cache.writes).toEqual([
      { key: `avatar-processed:v15:${textureHash}`, ttlSeconds: 24 * 60 * 60 },
    ]);
  });

  it('serves capes and reports capeless accounts as not-found', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const caped = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithCape(),
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });
    const bare = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });

    const result = await caped.findCape(playerUuid);
    expect(result.status).toBe('found');
    if (result.status !== 'found') {
      throw new Error('Expected a cape');
    }
    expect(result.image.body).toEqual(skin);
    expect(cache.writes).toEqual([{ key: `avatar-cape:${capeHash}`, ttlSeconds: 24 * 60 * 60 }]);
    await expect(bare.findCape(playerUuid)).resolves.toEqual({ status: 'not-found' });
  });

  it('resolves third-party capes from OptiFine when player has no Mojang cape', async (): Promise<void> => {
    const optifineCape = await createSkinPng([]);
    const cache = new RecordingCache();
    const customFetch: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('s.optifine.net')) {
        return Promise.resolve(new Response(optifineCape, { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    };

    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      fetch: customFetch,
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: skinStore(optifineCape),
    });

    const anyResult = await service.findCape(playerUuid);
    expect(anyResult.status).toBe('found');
    if (anyResult.status === 'found') {
      expect(anyResult.image.body).toEqual(optifineCape);
      expect(anyResult.image.etag).toBeDefined();
    }

    const specificOptifine = await service.findCape(playerUuid, { provider: 'optifine' });
    expect(specificOptifine.status).toBe('found');

    const specificLabymod = await service.findCape(playerUuid, { provider: 'labymod' });
    expect(specificLabymod.status).toBe('not-found');

    const overview = await service.findAvailableCapes(playerUuid);
    expect(overview.status).toBe('found');
    if (overview.status === 'found') {
      expect(overview.data.capes.mojang.available).toBe(false);
      expect(overview.data.capes.optifine.available).toBe(true);
      expect(overview.data.capes.optifine.url).toBe(
        `/api/avatars/${playerUuid}/cape?provider=optifine`,
      );
      expect(overview.data.capes.labymod.available).toBe(false);
    }
  });

  it('passes the Mojang cape to cape-bearing renders and keys it into the cache', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const renderer = new RecordingRenderer();
    const caped = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithCape(),
      renderer,
      skins: skinStore(skin),
    });
    const bare = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const capedBack = await caped.render(playerUuid, {
      layers: 'all',
      size: 128,
      view: 'back',
    });
    const capedDuo = await caped.render(playerUuid, { layers: 'all', size: 128, view: 'duo' });
    const capedWings = await caped.render(playerUuid, {
      layers: 'all',
      size: 128,
      view: 'wings',
    });
    const bareBack = await bare.render(playerUuid, { layers: 'all', size: 128, view: 'back' });
    const face = await bare.render(playerUuid, { layers: 'all', size: 128, view: 'face' });

    expect(capedBack.status).toBe('found');
    expect(capedDuo.status).toBe('found');
    expect(capedWings.status).toBe('found');
    expect(bareBack.status).toBe('found');
    expect(face.status).toBe('found');
    expect(renderer.capeTextures).toEqual([
      expect.objectContaining({ height: 64, width: 64 }),
      expect.objectContaining({ height: 64, width: 64 }),
      expect.objectContaining({ height: 64, width: 64 }),
      undefined,
      undefined,
    ]);
    expect(cache.writes).toEqual([
      {
        key: `avatar-cape:${capeHash}`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v15:${textureHash}:classic:back:all:128:mojang:${capeHash}`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v15:${textureHash}:classic:duo:all:128:mojang:${capeHash}`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v15:${textureHash}:classic:wings:all:128:mojang:${capeHash}`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('resolves a third-party cape into cape-bearing renders and keys it by content', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const optifineCape = await createSkinPng([]);
    const cache = new RecordingCache();
    const renderer = new RecordingRenderer();
    const fetchCalls: string[] = [];
    const customFetch: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fetchCalls.push(url);
      if (url.includes('s.optifine.net')) {
        return Promise.resolve(new Response(optifineCape, { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    };
    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      fetch: customFetch,
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const wings = await service.render(playerUuid, {
      capeProvider: 'optifine',
      layers: 'all',
      size: 128,
      view: 'wings',
    });

    expect(wings.status).toBe('found');
    expect(fetchCalls).toEqual(['http://s.optifine.net/capes/FixturePlayer.png']);
    expect(renderer.capeTextures).toEqual([expect.objectContaining({ height: 64, width: 64 })]);
    const capeKey = createHash('sha256').update(optifineCape).digest('base64url');
    expect(cache.writes).toEqual([
      { key: `avatar-cape:optifine:${playerUuid}`, ttlSeconds: 60 * 60 },
      {
        key: `avatar-render:v15:${textureHash}:slim:wings:all:128:optifine:${capeKey}`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('walks the provider chain under any and prefers the Mojang cape', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const optifineCape = await createSkinPng([]);
    const renderer = new RecordingRenderer();
    const customFetch: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('s.optifine.net')) {
        return Promise.resolve(new Response(optifineCape, { status: 200 }));
      }
      return Promise.resolve(new Response('Not found', { status: 404 }));
    };
    // A player with only an OptiFine cape resolves it through the chain.
    const thirdParty = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      fetch: customFetch,
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });
    // A player with a Mojang cape never reaches third-party providers.
    const capedFetchCalls: string[] = [];
    const capedFetch: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      capedFetchCalls.push(url);
      return Promise.resolve(new Response('Not found', { status: 404 }));
    };
    const caped = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      fetch: capedFetch,
      players: playersWithCape(),
      renderer,
      skins: skinStore(skin),
    });

    const anyWings = await thirdParty.render(playerUuid, {
      layers: 'all',
      size: 128,
      view: 'wings',
    });
    const mojangBack = await caped.render(playerUuid, {
      layers: 'all',
      size: 128,
      view: 'back',
    });

    expect(anyWings.status).toBe('found');
    expect(mojangBack.status).toBe('found');
    expect(renderer.capeTextures).toEqual([
      expect.objectContaining({ height: 64, width: 64 }),
      expect.objectContaining({ height: 64, width: 64 }),
    ]);
    // The Mojang cape won before any third-party endpoint was contacted.
    expect(capedFetchCalls).toEqual([]);
  });

  it('honors an explicit provider over a present Mojang cape', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const optifineCape = await createSkinPng([
      { color: { blue: 10, green: 10, red: 250 }, height: 4, width: 4, x: 0, y: 0 },
    ]);
    const renderer = new RecordingRenderer();
    const customFetch: typeof fetch = (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.includes('s.optifine.net')
        ? Promise.resolve(new Response(optifineCape, { status: 200 }))
        : Promise.resolve(new Response('Not found', { status: 404 }));
    };
    const service = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      fetch: customFetch,
      players: playersWithCape(),
      renderer,
      skins: skinStore(skin),
    });

    const back = await service.render(playerUuid, {
      capeProvider: 'optifine',
      layers: 'all',
      size: 128,
      view: 'back',
    });

    expect(back.status).toBe('found');
    // The OptiFine body was decoded and passed through, not the Mojang skin.
    expect(renderer.capeTextures).toHaveLength(1);
    const passed = renderer.capeTextures[0];
    expect(passed).toBeDefined();
    if (passed !== undefined) {
      expect(readFixturePixel(passed, 0, 0)).toEqual({
        alpha: 255,
        blue: 10,
        green: 10,
        red: 250,
      });
    }
  });

  it('renders without a cape when the selected provider misses or fails', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const renderer = new RecordingRenderer();
    const missing = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      fetch: (): Promise<Response> => Promise.resolve(new Response('Not found', { status: 404 })),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });
    const failing = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      fetch: (): Promise<Response> => Promise.reject(new Error('upstream down')),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const missed = await missing.render(playerUuid, {
      capeProvider: 'labymod',
      layers: 'all',
      size: 128,
      view: 'duo',
    });
    const failed = await failing.render(playerUuid, {
      capeProvider: 'optifine',
      layers: 'all',
      size: 128,
      view: 'wings',
    });
    // The miss is cached, so the repeat render skips the provider entirely.
    const repeated = await missing.render(playerUuid, {
      capeProvider: 'labymod',
      layers: 'all',
      size: 128,
      view: 'duo',
    });

    expect(missed.status).toBe('found');
    expect(failed.status).toBe('found');
    expect(repeated.status).toBe('found');
    // The repeat render served from the render cache, so the renderer ran
    // only for the first miss and the failed provider.
    expect(renderer.capeTextures).toEqual([undefined, undefined]);
    expect(cache.writes).toEqual([
      { key: `avatar-cape-miss:labymod:${playerUuid}`, ttlSeconds: 10 * 60 },
      {
        key: `avatar-render:v15:${textureHash}:slim:duo:all:128:none`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('renders back views without a cape for texture-hash and default-skin subjects', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const renderer = new RecordingRenderer();
    const service = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: { fetchDefaultSkin: (): Promise<Buffer> => Promise.resolve(skin) },
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const byHash = await service.render(textureHash, {
      layers: 'all',
      model: 'classic',
      size: 128,
      view: 'back',
    });
    const byOfflineUuid = await service.render(offlinePlayerUuid('GhostPlayer'), {
      layers: 'all',
      size: 128,
      view: 'back',
    });

    expect(byHash.status).toBe('found');
    expect(byOfflineUuid.status).toBe('found');
    expect(renderer.capeTextures).toEqual([undefined, undefined]);
  });

  it('rejects unsupported skin dimensions before native decoding or rendering', async (): Promise<void> => {
    const unsupported = Buffer.from(await createSkinPng([]));
    unsupported.writeUInt32BE(32, 16);
    const renderer = new RecordingRenderer();
    const service = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(unsupported),
    });

    await expect(service.findRawSkin(playerUuid)).resolves.toEqual({ status: 'unavailable' });
    await expect(
      service.render(playerUuid, { layers: 'all', size: 128, view: 'face' }),
    ).resolves.toEqual({ status: 'unavailable' });
    expect(renderer.calls).toBe(0);
  });

  it('resolves username subjects through the profile lookup', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const lookedUpIds: string[] = [];
    const lookedUpNames: string[] = [];
    const players: MinecraftPlayerLookup = {
      findProfileById: (uuid) => {
        lookedUpIds.push(uuid);
        return Promise.resolve({
          texture: { hash: textureHash, model: 'slim' },
          username: 'FixturePlayer',
          uuid,
        });
      },
      findProfileByName: (username) => {
        lookedUpNames.push(username);
        return Promise.resolve(
          username === 'FixturePlayer'
            ? { username: 'FixturePlayer', uuid: playerUuid }
            : undefined,
        );
      },
    };
    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players,
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });
    const options = { layers: 'all', size: 128, view: 'face' } satisfies AvatarRenderOptions;

    const result = await service.render('FixturePlayer', options);

    expect(result.status).toBe('found');
    expect(lookedUpNames).toEqual(['FixturePlayer']);
    expect(lookedUpIds).toEqual([playerUuid]);
    expect(cache.writes).toEqual([
      {
        key: `avatar-render:v15:${textureHash}:slim:face:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('renders the deterministic default skin for unregistered names and offline UUIDs', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const lookedUpIds: string[] = [];
    const players: MinecraftPlayerLookup = {
      findProfileById: (uuid) => {
        lookedUpIds.push(uuid);
        return Promise.resolve(undefined);
      },
      findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
    };
    const service = new CachedAvatarService({
      cache,
      defaultSkins: defaultSkins(skin),
      players,
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });
    const options = { layers: 'all', size: 128, view: 'face' } satisfies AvatarRenderOptions;
    const offlineUuid = offlinePlayerUuid('GhostPlayer');

    const byName = await service.render('GhostPlayer', options);
    const byUuid = await service.render(offlineUuid, options);

    const expected = selectDefaultSkin(offlineUuid);
    expect(byName.status).toBe('found');
    expect(byUuid.status).toBe('found');
    // The version-3 UUID is autodetected as offline-mode and never reaches
    // Mojang's profile endpoint.
    expect(lookedUpIds).toEqual([]);
    expect(cache.writes).toEqual([
      {
        key: `avatar-render:v15:default:${expected.name}:${expected.model}:face:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('renders texture-hash subjects with the caller-selected model', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new RecordingCache();
    const renderer = new RecordingRenderer();
    const service = new CachedAvatarService({
      cache,
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const slim = await service.render(textureHash, {
      layers: 'all',
      model: 'slim',
      size: 128,
      view: 'bust',
    });
    const wide = await service.render(textureHash, {
      layers: 'all',
      size: 128,
      view: 'bust',
    });

    expect(slim.status).toBe('found');
    expect(wide.status).toBe('found');
    expect(renderer.models).toEqual(['slim', 'classic']);
    expect(cache.writes).toEqual([
      {
        key: `avatar-render:v15:${textureHash}:slim:bust:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v15:${textureHash}:classic:bust:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('reports missing and malformed texture-hash subjects as not-found', async (): Promise<void> => {
    const notSkin = Buffer.from(await createSkinPng([]));
    notSkin.writeUInt32BE(32, 16);
    const missing = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: new RecordingSkinStore(undefined),
    });
    const malformed = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: missingDefaultSkins(),
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: skinStore(notSkin),
    });

    await expect(missing.findRawSkin(textureHash)).resolves.toEqual({ status: 'not-found' });
    await expect(
      missing.render(textureHash, { layers: 'all', size: 128, view: 'face' }),
    ).resolves.toEqual({ status: 'not-found' });
    await expect(malformed.findRawSkin(textureHash)).resolves.toEqual({ status: 'not-found' });
  });

  it('maps name-lookup failures to unavailable and texture subjects capes to not-found', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const failingNames: MinecraftPlayerLookup = {
      findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
      findProfileByName: (): Promise<never> => Promise.reject(new Error('mojang down')),
    };
    const service = new CachedAvatarService({
      cache: new RecordingCache(),
      defaultSkins: defaultSkins(skin),
      players: failingNames,
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });

    await expect(
      service.render('FixturePlayer', { layers: 'all', size: 128, view: 'face' }),
    ).resolves.toEqual({ status: 'unavailable' });
    await expect(service.findCape('FixturePlayer')).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(service.findCape(textureHash)).resolves.toEqual({ status: 'not-found' });
    await expect(service.findAvailableCapes(textureHash)).resolves.toEqual({
      status: 'not-found',
    });
  });
});

function defaultSkins(body: Buffer): DefaultSkinSource {
  return {
    fetchDefaultSkin: (): Promise<Buffer> => Promise.resolve(body),
  };
}

function missingDefaultSkins(): DefaultSkinSource {
  return {
    fetchDefaultSkin: (): Promise<undefined> => Promise.resolve(undefined),
  };
}

function playersWithTexture(): MinecraftPlayerLookup {
  return {
    findProfileById: (uuid) =>
      Promise.resolve({
        texture: { hash: textureHash, model: 'slim' },
        username: 'FixturePlayer',
        uuid,
      }),
    findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
  };
}

function playersWithCape(): MinecraftPlayerLookup {
  return {
    findProfileById: (uuid) =>
      Promise.resolve({
        cape: { hash: capeHash },
        texture: { hash: textureHash, model: 'classic' },
        username: 'CapedPlayer',
        uuid,
      }),
    findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
  };
}

function skinStore(body: Buffer): SkinStore {
  return new RecordingSkinStore(body);
}

class RecordingSkinStore implements SkinStore {
  public calls = 0;

  public constructor(private readonly body: Buffer | undefined) {}

  public fetchSkin(): Promise<{ body: Buffer; contentType: 'image/png' } | undefined> {
    this.calls += 1;
    return this.body === undefined
      ? Promise.resolve(undefined)
      : Promise.resolve({ body: this.body, contentType: 'image/png' });
  }
}
