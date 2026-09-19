import { describe, expect, it } from 'vitest';

import { MemoryMinecraftCache } from '../../src/mojang/cache.js';
import {
  DEFAULT_SKINS,
  defaultSkinUrl,
  HttpDefaultSkinStore,
  javaUuidHashCode,
  offlinePlayerUuid,
  selectDefaultSkin,
  type DefaultSkin,
} from '../../src/mojang/default-skins.js';
import { createSkinPng } from './support/skin-fixture.js';

function requireSkin(name: DefaultSkin['name']): DefaultSkin {
  const skin = DEFAULT_SKINS.find((candidate): boolean => candidate.name === name);
  if (skin === undefined) {
    throw new Error(`Default skin is missing: ${name}`);
  }
  return skin;
}

describe('Minecraft default skins', (): void => {
  it('ships all nine vanilla characters with their documented models', (): void => {
    expect(DEFAULT_SKINS.map((skin): string => skin.name)).toEqual([
      'alex',
      'ari',
      'efe',
      'kai',
      'makena',
      'noor',
      'steve',
      'sunny',
      'zuri',
    ]);
    expect(
      DEFAULT_SKINS.filter((skin): boolean => skin.model === 'classic').map(
        (skin): string => skin.name,
      ),
    ).toEqual(['ari', 'kai', 'steve', 'sunny', 'zuri']);
    expect(
      DEFAULT_SKINS.filter((skin): boolean => skin.model === 'slim').map(
        (skin): string => skin.name,
      ),
    ).toEqual(['alex', 'efe', 'makena', 'noor']);
    for (const skin of DEFAULT_SKINS) {
      expect(defaultSkinUrl(skin)).toMatch(/^https:\/\/[^/]+\/.+\/1\.21\.5\/.+\.png$/u);
    }
  });

  it('derives stable offline-mode UUIDs for unregistered names', (): void => {
    // MD5("OfflinePlayer:Notch") with UUID version 3 and RFC 4122 variant bits.
    expect(offlinePlayerUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    expect(offlinePlayerUuid('XqzFakeName99')).toBe('2a20a507-2d72-3353-a507-8b1cc4b70764');
    expect(offlinePlayerUuid('Notch')).not.toBe(offlinePlayerUuid('notch'));
  });

  it('selects a deterministic catalogue entry for any UUID', (): void => {
    const first = selectDefaultSkin('b50ad385-829d-3141-a216-7e7d7539ba7f');
    expect(selectDefaultSkin('b50ad385-829d-3141-a216-7e7d7539ba7f')).toEqual(first);
    expect(javaUuidHashCode('b50ad385-829d-3141-a216-7e7d7539ba7f')).toBe(-524802362);
    const names = new Set(
      [
        '069a79f4-44e9-4726-a5be-fca90e38aaf5',
        'b50ad385-829d-3141-a216-7e7d7539ba7f',
        '2a20a507-2d72-3353-a507-8b1cc4b70764',
        '4b362f3d-48d9-41a2-b19d-7e41cfc08a05',
      ].map((uuid): string => selectDefaultSkin(uuid).name),
    );
    expect(names.size).toBeGreaterThan(1);
  });

  it('rejects non-UUID input for hash selection', (): void => {
    expect((): unknown => selectDefaultSkin('Notch')).toThrow(RangeError);
    expect((): unknown => javaUuidHashCode('nope')).toThrow(RangeError);
  });

  it('fetches pinned assets with caching and honest errors', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const cache = new MemoryMinecraftCache();
    let calls = 0;
    const store = new HttpDefaultSkinStore({
      cache,
      fetch: (): Promise<Response> => {
        calls += 1;
        return Promise.resolve(new Response(skin, { headers: { 'content-type': 'image/png' } }));
      },
    });

    const steve = requireSkin('steve');
    const first = await store.fetchDefaultSkin(steve);
    const second = await store.fetchDefaultSkin(steve);
    expect(first?.equals(skin)).toBe(true);
    expect(second?.equals(skin)).toBe(true);
    expect(calls).toBe(1);
  });

  it('reports missing assets as undefined and failures as unavailable', async (): Promise<void> => {
    const missing = new HttpDefaultSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: (): Promise<Response> => Promise.resolve(new Response('nope', { status: 404 })),
    });
    await expect(missing.fetchDefaultSkin(requireSkin('alex'))).resolves.toBeUndefined();

    const broken = new HttpDefaultSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: (): Promise<Response> =>
        Promise.resolve(new Response('nope', { headers: { 'content-type': 'text/html' } })),
    });
    await expect(broken.fetchDefaultSkin(requireSkin('alex'))).rejects.toThrow(
      'Default skin service returned a non-PNG',
    );
  });
});
