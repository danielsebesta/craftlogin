import { describe, expect, it } from 'vitest';

import {
  fetch5zigCape,
  fetchLabymodCape,
  fetchMinecraftcapesCape,
  fetchOptifineCape,
  fetchSkinmcCape,
  fetchThirdPartyCape,
} from '../../src/avatars/cape-providers.js';
import { createSkinPng } from './support/skin-fixture.js';

const canonicalUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
const undashedUuid = '853c80ef3c3749fdaa49938b674adae6';
const username = 'TestPlayer';

function toUrlString(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

describe('cape providers', (): void => {
  it('fetches OptiFine cape when present and validates PNG', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const customFetch: typeof fetch = (input) => {
      const url = toUrlString(input);
      expect(url).toBe(`http://s.optifine.net/capes/${username}.png`);
      return Promise.resolve(
        new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }),
      );
    };

    const cape = await fetchOptifineCape(username, customFetch);
    expect(cape).toBeDefined();
    expect(cape).toEqual(png);
  });

  it('rejects OptiFine cape for invalid usernames or 404 responses', async (): Promise<void> => {
    const notFoundFetch: typeof fetch = () =>
      Promise.resolve(new Response('Not Found', { status: 404 }));

    await expect(fetchOptifineCape(username, notFoundFetch)).resolves.toBeUndefined();
    await expect(fetchOptifineCape('a', notFoundFetch)).resolves.toBeUndefined();
    await expect(
      fetchOptifineCape('way_too_long_username_for_minecraft', notFoundFetch),
    ).resolves.toBeUndefined();
  });

  it('fetches LabyMod cape with dashed UUID', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const customFetch: typeof fetch = (input) => {
      expect(toUrlString(input)).toBe(`https://dl.labymod.net/capes/${canonicalUuid}`);
      return Promise.resolve(new Response(png, { status: 200 }));
    };

    const cape = await fetchLabymodCape(canonicalUuid, customFetch);
    expect(cape).toEqual(png);
  });

  it('returns undefined when LabyMod responds with 404 or network fails', async (): Promise<void> => {
    const failingFetch: typeof fetch = () => Promise.reject(new Error('Network offline'));
    await expect(fetchLabymodCape(canonicalUuid, failingFetch)).resolves.toBeUndefined();
  });

  it('fetches MinecraftCapes with undashed UUID', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const customFetch: typeof fetch = (input) => {
      expect(toUrlString(input)).toBe(
        `https://api.minecraftcapes.net/profile/${undashedUuid}/cape`,
      );
      return Promise.resolve(new Response(png, { status: 200 }));
    };

    const cape = await fetchMinecraftcapesCape(undashedUuid, customFetch);
    expect(cape).toEqual(png);
  });

  it('fetches 5zig cape from base64 JSON payload', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const customFetch: typeof fetch = (input) => {
      expect(toUrlString(input)).toBe(`https://textures.5zigreborn.eu/profile/${canonicalUuid}`);
      return Promise.resolve(
        new Response(JSON.stringify({ d: png.toString('base64') }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    };

    const cape = await fetch5zigCape(canonicalUuid, customFetch);
    expect(cape).toEqual(png);
  });

  it('rejects 5zig cape with invalid JSON or non-PNG payload', async (): Promise<void> => {
    const corruptFetch: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ d: Buffer.from('NOT_A_PNG').toString('base64') }), {
          status: 200,
        }),
      );
    await expect(fetch5zigCape(canonicalUuid, corruptFetch)).resolves.toBeUndefined();

    const notFoundFetch: typeof fetch = () =>
      Promise.resolve(new Response('Not found', { status: 404 }));
    await expect(fetch5zigCape(canonicalUuid, notFoundFetch)).resolves.toBeUndefined();
  });

  it('rejects a cape whose declared size exceeds the bound', async (): Promise<void> => {
    const oversized = Buffer.alloc(300 * 1_024);
    const customFetch: typeof fetch = () =>
      Promise.resolve(
        new Response(oversized, {
          headers: { 'content-length': oversized.length.toString() },
          status: 200,
        }),
      );

    await expect(fetchOptifineCape(username, customFetch)).resolves.toBeUndefined();
    await expect(fetchLabymodCape(canonicalUuid, customFetch)).resolves.toBeUndefined();
    await expect(fetchSkinmcCape(canonicalUuid, customFetch)).resolves.toBeUndefined();
  });

  it('cuts off a streamed cape body that grows past the bound', async (): Promise<void> => {
    const chunk = Buffer.alloc(64 * 1_024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller): void {
        for (let index = 0; index < 8; index += 1) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });
    const customFetch: typeof fetch = () => Promise.resolve(new Response(stream, { status: 200 }));

    await expect(fetchMinecraftcapesCape(undashedUuid, customFetch)).resolves.toBeUndefined();
  });

  it('rejects an oversized 5zig base64 payload', async (): Promise<void> => {
    const oversized = Buffer.alloc(300 * 1_024);
    const customFetch: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ d: oversized.toString('base64') }), { status: 200 }),
      );

    await expect(fetch5zigCape(canonicalUuid, customFetch)).resolves.toBeUndefined();
  });

  it('fetches SkinMC cape with dashed UUID', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const customFetch: typeof fetch = (input) => {
      expect(toUrlString(input)).toBe(`https://skinmc.net/api/v1/skinmcCape/${canonicalUuid}`);
      return Promise.resolve(new Response(png, { status: 200 }));
    };

    await expect(fetchSkinmcCape(canonicalUuid, customFetch)).resolves.toEqual(png);
  });

  it('returns undefined when SkinMC has no cape, fails, or responds non-PNG', async (): Promise<void> => {
    const notFoundFetch: typeof fetch = () =>
      Promise.resolve(new Response('Not found', { status: 404 }));
    await expect(fetchSkinmcCape(canonicalUuid, notFoundFetch)).resolves.toBeUndefined();

    const failingFetch: typeof fetch = () => Promise.reject(new Error('Network offline'));
    await expect(fetchSkinmcCape(canonicalUuid, failingFetch)).resolves.toBeUndefined();

    const notPngFetch: typeof fetch = () =>
      Promise.resolve(new Response('{"message":"ok"}', { status: 200 }));
    await expect(fetchSkinmcCape(canonicalUuid, notPngFetch)).resolves.toBeUndefined();
  });

  it('dispatches to providers in fetchThirdPartyCape', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const customFetch: typeof fetch = () => Promise.resolve(new Response(png, { status: 200 }));
    const identity = { canonicalUuid, undashedUuid, username };

    await expect(fetchThirdPartyCape('optifine', identity, customFetch)).resolves.toEqual(png);
    await expect(fetchThirdPartyCape('labymod', identity, customFetch)).resolves.toEqual(png);
    await expect(fetchThirdPartyCape('minecraftcapes', identity, customFetch)).resolves.toEqual(
      png,
    );
    await expect(fetchThirdPartyCape('skinmc', identity, customFetch)).resolves.toEqual(png);
  });
});
