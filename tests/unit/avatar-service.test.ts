import { describe, expect, it } from 'vitest';

import type { AvatarRenderer } from '../../src/avatars/renderer.js';
import { CachedAvatarService } from '../../src/avatars/service.js';
import type { SkinTexture } from '../../src/avatars/skin-texture.js';
import type { AvatarRenderOptions, MinecraftSkinModel } from '../../src/avatars/types.js';
import type { CachedValue, MinecraftCache } from '../../src/mojang/cache.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { SkinStore } from '../../src/mojang/skin-store.js';
import { createSkinPng } from './support/skin-fixture.js';

const playerUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
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

  public render(
    _texture: SkinTexture,
    _model: MinecraftSkinModel,
    options: AvatarRenderOptions,
  ): Promise<Buffer> {
    this.calls += 1;
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
      players: playersWithTexture(),
      renderer,
      skins: skinStore(skin),
    });

    const raw = await service.findRawSkin(playerUuid);
    const first = await service.render(playerUuid, { layers: 'all', size: 128, view: 'head' });
    const second = await service.render(secondUuid, { layers: 'all', size: 128, view: 'head' });

    expect(raw.status).toBe('found');
    expect(first).toEqual(second);
    expect(renderer.calls).toBe(1);
    expect(cache.writes).toEqual([
      {
        key: `avatar-render:v1:${textureHash}:slim:head:all:128`,
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
        key: `avatar-render:v1:${textureHash}:slim:body:all:64`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v1:${textureHash}:slim:body:base:64`,
        ttlSeconds: 24 * 60 * 60,
      },
      {
        key: `avatar-render:v1:${textureHash}:slim:body:all:128`,
        ttlSeconds: 24 * 60 * 60,
      },
    ]);
  });

  it('distinguishes missing and unavailable sources and never caches failed renders', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const missing = new CachedAvatarService({
      cache: new RecordingCache(),
      players: {
        findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
        findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
      },
      renderer: new RecordingRenderer(),
      skins: skinStore(skin),
    });
    const unavailable = new CachedAvatarService({
      cache: new RecordingCache(),
      players: playersWithTexture(),
      renderer: new RecordingRenderer(),
      skins: { fetchSkin: (): Promise<never> => Promise.reject(new Error('offline')) },
    });
    const failedCache = new RecordingCache();
    const failedRenderer = new RecordingRenderer();
    failedRenderer.fail = true;
    const failed = new CachedAvatarService({
      cache: failedCache,
      players: playersWithTexture(),
      renderer: failedRenderer,
      skins: skinStore(skin),
    });
    const options = { layers: 'all', size: 128, view: 'head' } satisfies AvatarRenderOptions;

    await expect(missing.render(playerUuid, options)).resolves.toEqual({ status: 'not-found' });
    await expect(unavailable.render(playerUuid, options)).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(failed.render(playerUuid, options)).resolves.toEqual({ status: 'unavailable' });
    expect(failedCache.writes).toEqual([]);
  });

  it('rejects unsupported skin dimensions before native decoding or rendering', async (): Promise<void> => {
    const unsupported = Buffer.from(await createSkinPng([]));
    unsupported.writeUInt32BE(32, 16);
    const renderer = new RecordingRenderer();
    const service = new CachedAvatarService({
      cache: new RecordingCache(),
      players: playersWithTexture(),
      renderer,
      skins: skinStore(unsupported),
    });

    await expect(service.findRawSkin(playerUuid)).resolves.toEqual({ status: 'unavailable' });
    await expect(
      service.render(playerUuid, { layers: 'all', size: 128, view: 'head' }),
    ).resolves.toEqual({ status: 'unavailable' });
    expect(renderer.calls).toBe(0);
  });
});

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

function skinStore(body: Buffer): SkinStore {
  return new RecordingSkinStore(body);
}

class RecordingSkinStore implements SkinStore {
  public calls = 0;

  public constructor(private readonly body: Buffer) {}

  public fetchSkin(): Promise<{ body: Buffer; contentType: 'image/png' }> {
    this.calls += 1;
    return Promise.resolve({ body: this.body, contentType: 'image/png' });
  }
}
