import { describe, expect, it } from 'vitest';

import {
  decodeTexturePixels,
  inspectTexturePng,
  InvalidSkinImageError,
  isBoundedTexturePng,
} from '../../src/avatars/skin-texture.js';
import { MemoryMinecraftCache, type MinecraftCache } from '../../src/mojang/cache.js';
import type {
  MinecraftPlayerProfile,
  MinecraftPlayerProfileWithSkin,
} from '../../src/mojang/client.js';
import {
  DEFAULT_SKINS,
  defaultSkinUrl,
  HttpDefaultSkinStore,
  isOfflinePlayerUuid,
  javaUuidHashCode,
  offlinePlayerUuid,
  selectDefaultSkin,
  type DefaultSkin,
} from '../../src/mojang/default-skins.js';
import { HttpSkinStore, MinecraftSkinUnavailableError } from '../../src/mojang/skin-store.js';
import type { SkinImage } from '../../src/mojang/skin-store.js';
import type { VerifiedUserRepository } from '../../src/users/verified-user-repository.js';
import type { VerificationClaim } from '../../src/verification/redis-verification-store.js';
import type {
  SkinVerificationChallenge,
  SkinVerificationCheckClaim,
} from '../../src/verification/redis-skin-verification-store.js';
import {
  createSkinMarkerChallenge,
  deriveMarkerColors,
  hslToRgb,
  markerPalettes,
  skinMatchesMarker,
} from '../../src/verification/skin-marker.js';
import { SkinVerificationService } from '../../src/verification/skin-verification-service.js';
import type {
  AuthenticatedMinecraftPlayer,
  VerificationStatus,
} from '../../src/verification/types.js';
import { createSkinPng, decodePng, readFixturePixel } from './support/skin-fixture.js';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// A PNG needs only its signature and a valid IHDR for the dimension checks;
// the rest of the structure is irrelevant to the safety bound.
function craftedPngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(64);
  Buffer.from(PNG_SIGNATURE).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

function luminance(color: readonly [number, number, number]): number {
  return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
}

describe('inspectTexturePng', (): void => {
  it('returns declared dimensions for a valid texture PNG', async (): Promise<void> => {
    const png = await createSkinPng([]);
    expect(inspectTexturePng(png)).toEqual({ height: 64, width: 64 });
    expect(isBoundedTexturePng(png)).toBe(true);
  });

  it('rejects oversized declared dimensions before any decode', (): void => {
    const maximum = craftedPngHeader(0x7fffffff, 0x7fffffff);
    const oneSided = craftedPngHeader(4, 65_536);

    expect((): void => {
      inspectTexturePng(maximum);
    }).toThrow(InvalidSkinImageError);
    expect((): void => {
      inspectTexturePng(maximum);
    }).toThrow(/safety limit/u);
    expect((): void => {
      inspectTexturePng(oneSided);
    }).toThrow(InvalidSkinImageError);
    expect(isBoundedTexturePng(maximum)).toBe(false);
    expect(isBoundedTexturePng(oneSided)).toBe(false);
  });

  it('rejects zero dimensions and truncated or non-PNG input', (): void => {
    expect(isBoundedTexturePng(craftedPngHeader(0, 64))).toBe(false);
    expect(isBoundedTexturePng(craftedPngHeader(64, 0))).toBe(false);
    expect(isBoundedTexturePng(Buffer.alloc(0))).toBe(false);
    expect(isBoundedTexturePng(Buffer.from(PNG_SIGNATURE))).toBe(false);
    expect(isBoundedTexturePng(Buffer.from('NOT_A_PNG'))).toBe(false);

    const wrongChunk = craftedPngHeader(64, 64);
    wrongChunk.write('IDAT', 12, 'ascii');
    expect(isBoundedTexturePng(wrongChunk)).toBe(false);
  });
});

describe('decodeTexturePixels', (): void => {
  it('decodes a small texture into RGBA pixels', async (): Promise<void> => {
    const png = await createSkinPng([]);
    const texture = await decodeTexturePixels(png);

    expect(texture.width).toBe(64);
    expect(texture.height).toBe(64);
    expect(texture.pixels.length).toBe(64 * 64 * 4);
  });

  it('rejects a decompression bomb before allocating a canvas', async (): Promise<void> => {
    await expect(decodeTexturePixels(craftedPngHeader(0x7fffffff, 0x7fffffff))).rejects.toThrow(
      /safety limit/u,
    );
  });

  it('rejects bodies that are not decodable PNGs', async (): Promise<void> => {
    const decodableHeader = craftedPngHeader(64, 64);
    await expect(decodeTexturePixels(decodableHeader)).rejects.toThrow(InvalidSkinImageError);
    await expect(decodeTexturePixels(Buffer.from('NOT_A_PNG'))).rejects.toThrow(
      InvalidSkinImageError,
    );
    await expect(decodeTexturePixels(Buffer.alloc(400 * 1_024))).rejects.toThrow(
      InvalidSkinImageError,
    );
  });
});

describe('skin verification marker', (): void => {
  it.each([32, 64] as const)(
    'marks and verifies a 64x%s Java skin without changing mapped pixels',
    async (height): Promise<void> => {
      const original = await createSkinPng(
        [
          {
            color: { blue: 73, green: 51, red: 29 },
            height,
            width: 64,
            x: 0,
            y: 0,
          },
          {
            color: { alpha: 91, blue: 220, green: 130, red: 40 },
            height: 8,
            width: 8,
            x: 40,
            y: 8,
          },
        ],
        height,
      );

      const challenge = await createSkinMarkerChallenge(original, Buffer.alloc(32, 0xa5));

      expect(challenge.height).toBe(height);
      await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
      const before = await decodePng(original);
      const after = await decodePng(challenge.body);
      expect(readFixturePixel(after, 8, 0)).toEqual(readFixturePixel(before, 8, 0));
      expect(readFixturePixel(after, 40, 8)).toEqual(readFixturePixel(before, 40, 8));
      expect(readFixturePixel(after, 63, height - 1)).toEqual(
        readFixturePixel(before, 63, height - 1),
      );
    },
  );

  it('renders the CL signature with the derived challenge colors', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    // All-zero entropy: red letters on a near-black red backdrop, shade 0 everywhere.
    const entropy = Buffer.alloc(32, 0x00);
    const challenge = await createSkinMarkerChallenge(skin, entropy);
    const image = await decodePng(challenge.body);
    const palettes = markerPalettes(entropy);

    const toFixture = (color: readonly [number, number, number]): unknown => ({
      alpha: 255,
      blue: color[2],
      green: color[1],
      red: color[0],
    });
    const letterC = toFixture(palettes.letterC[0] ?? [0, 0, 0]);
    const letterL = toFixture(palettes.letterL[0] ?? [0, 0, 0]);
    const background = toFixture(palettes.background[0] ?? [0, 0, 0]);

    // Top and bottom rows are background padding; the initials span rows 1-6.
    expect(readFixturePixel(image, 0, 0)).toEqual(background);
    expect(readFixturePixel(image, 4, 0)).toEqual(background);
    expect(readFixturePixel(image, 0, 7)).toEqual(background);
    expect(readFixturePixel(image, 7, 7)).toEqual(background);
    // Letter C: top bar, stem, bottom bar with a hollow middle.
    expect(readFixturePixel(image, 0, 1)).toEqual(letterC);
    expect(readFixturePixel(image, 2, 1)).toEqual(letterC);
    expect(readFixturePixel(image, 0, 3)).toEqual(letterC);
    expect(readFixturePixel(image, 1, 6)).toEqual(letterC);
    expect(readFixturePixel(image, 1, 3)).toEqual(background);
    // Gap column and letter L with its hollow middle and corner foot.
    expect(readFixturePixel(image, 3, 1)).toEqual(background);
    expect(readFixturePixel(image, 4, 1)).toEqual(letterL);
    expect(readFixturePixel(image, 4, 3)).toEqual(letterL);
    expect(readFixturePixel(image, 5, 6)).toEqual(letterL);
    expect(readFixturePixel(image, 7, 6)).toEqual(letterL);
    expect(readFixturePixel(image, 5, 3)).toEqual(background);

    await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
  });

  it('tints the marker palette from the surrounding skin color', async (): Promise<void> => {
    // A green-dominated 16x16 head corner around the 8x8 marker position.
    const skin = await createSkinPng([
      {
        color: { red: 40, green: 170, blue: 60 },
        height: 16,
        width: 16,
        x: 0,
        y: 0,
      },
    ]);
    const entropy = Buffer.alloc(32, 0x66);
    const challenge = await createSkinMarkerChallenge(skin, entropy);
    const image = await decodePng(challenge.body);

    // Both the backdrop and the embossed letters keep the skin's hue family.
    const markerPixels: readonly (readonly [number, number])[] = [
      [0, 0],
      [0, 1],
      [4, 3],
      [7, 7],
    ];
    for (const [x, y] of markerPixels) {
      const pixel = readFixturePixel(image, x, y);
      expect(pixel.green).toBeGreaterThan(pixel.red);
      expect(pixel.green).toBeGreaterThan(pixel.blue);
    }
    await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
  });

  it('keeps tinted letters embossed against the tinted backdrop', (): void => {
    for (const lightness of [10, 35, 50, 65, 90]) {
      for (const seed of [0x00, 0x55, 0xaa, 0xff]) {
        const entropy = Buffer.alloc(32, seed);
        const colors = deriveMarkerColors(entropy, {
          hue: 200,
          lightness,
          saturation: 60,
        });
        expect(
          Math.abs(colors.letterLightnessC - colors.backgroundLightness),
        ).toBeGreaterThanOrEqual(18);
        expect(
          Math.abs(colors.letterLightnessL - colors.backgroundLightness),
        ).toBeGreaterThanOrEqual(10);
        expect(colors.backgroundHue).toBeGreaterThanOrEqual(190);
        expect(colors.backgroundHue).toBeLessThanOrEqual(210);
      }
    }
  });

  it('keeps tinted challenges unique on the same skin', async (): Promise<void> => {
    const skin = await createSkinPng([
      {
        color: { red: 90, green: 60, blue: 140 },
        height: 16,
        width: 16,
        x: 0,
        y: 0,
      },
    ]);
    const first = await createSkinMarkerChallenge(skin, Buffer.alloc(32, 0x11));
    const second = await createSkinMarkerChallenge(skin, Buffer.alloc(32, 0x22));

    expect(first.markerHash).not.toBe(second.markerHash);
    await expect(skinMatchesMarker(second.body, second.markerHash)).resolves.toBe(true);
    await expect(skinMatchesMarker(second.body, first.markerHash)).resolves.toBe(false);
  });

  it('falls back to a random palette when the marker neighborhood is transparent', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const entropy = Buffer.alloc(32, 0x00);
    const challenge = await createSkinMarkerChallenge(skin, entropy);
    const image = await decodePng(challenge.body);
    const palettes = markerPalettes(entropy);

    // The all-transparent skin derives no base tone, so painted pixels match
    // the fully random palette for this entropy.
    expect(readFixturePixel(image, 0, 0)).toEqual({
      alpha: 255,
      blue: palettes.background[0]?.[2],
      green: palettes.background[0]?.[1],
      red: palettes.background[0]?.[0],
    });
    await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
  });

  it('derives distinct random colors per challenge', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const hashes = new Set<string>();
    for (let variant = 0; variant < 16; variant += 1) {
      const entropy = Buffer.alloc(32, 0x00);
      entropy[0] = variant * 17;
      entropy[4] = variant * 31 + 7;
      const challenge = await createSkinMarkerChallenge(skin, entropy);
      hashes.add(challenge.markerHash);
      await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
    }
    expect(hashes.size).toBe(16);
  });

  it('keeps the letter bands ordered and separated', (): void => {
    for (let hue = 0; hue < 256; hue += 1) {
      for (const lightness of [0, 85, 170, 255]) {
        const entropy = Buffer.alloc(32, 0x00);
        entropy[0] = hue;
        entropy[1] = lightness;
        entropy[2] = hue;
        entropy[3] = lightness;
        const colors = deriveMarkerColors(entropy);
        expect(colors.letterHue).toBeGreaterThanOrEqual(0);
        expect(colors.letterHue).toBeLessThanOrEqual(360);
        // The C band (70-90) never overlaps the L band (45-65).
        expect(colors.letterLightnessC).toBeGreaterThanOrEqual(70);
        expect(colors.letterLightnessC).toBeLessThanOrEqual(90);
        expect(colors.letterLightnessL).toBeGreaterThanOrEqual(45);
        expect(colors.letterLightnessL).toBeLessThanOrEqual(65);
        expect(colors.backgroundLightness).toBeGreaterThanOrEqual(4);
        expect(colors.backgroundLightness).toBeLessThanOrEqual(18);
      }
    }
  });

  it('keeps every random palette readable with distinct shades', (): void => {
    // Every letter shade must keep a luminance gap against every background shade.
    for (let hueHigh = 0; hueHigh < 256; hueHigh += 51) {
      for (let hueLow = 0; hueLow < 256; hueLow += 51) {
        for (const lightness of [0, 255]) {
          const entropy = Buffer.alloc(32, 0x00);
          entropy[0] = hueHigh;
          entropy[1] = hueLow;
          entropy[2] = lightness;
          entropy[3] = lightness;
          entropy[4] = hueLow;
          entropy[5] = lightness;
          entropy[6] = lightness;
          entropy[7] = lightness;
          const palettes = markerPalettes(entropy);
          for (const palette of [palettes.background, palettes.letterC, palettes.letterL]) {
            expect(palette).toHaveLength(8);
            const unique = new Set(palette.map((color): string => color.join(',')));
            expect(unique.size).toBe(8);
          }
          const backgroundLuminance = palettes.background.map(luminance);
          for (const shade of palettes.letterC) {
            for (const backdrop of backgroundLuminance) {
              expect(Math.abs(luminance(shade) - backdrop)).toBeGreaterThanOrEqual(0.2);
            }
          }
          for (const shade of palettes.letterL) {
            for (const backdrop of backgroundLuminance) {
              expect(Math.abs(luminance(shade) - backdrop)).toBeGreaterThanOrEqual(0.1);
            }
          }
        }
      }
    }
  });

  it('converts HSL to RGB along the primary axes', (): void => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255]);
    expect(hslToRgb(360, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(0, 0, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(0, 0, 100)).toEqual([255, 255, 255]);
    expect(hslToRgb(0, 0, 50)).toEqual([128, 128, 128]);
  });

  it('does not accept another marker or malformed expected hashes', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const first = await createSkinMarkerChallenge(skin, Buffer.alloc(32, 0x11));
    const second = await createSkinMarkerChallenge(skin, Buffer.alloc(32, 0x22));

    await expect(skinMatchesMarker(second.body, first.markerHash)).resolves.toBe(false);
    await expect(skinMatchesMarker(first.body, 'not-a-hash')).resolves.toBe(false);
  });

  it('rejects Minecraft-branded PNG dimensions outside Java skin formats', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const invalid = Buffer.from(skin);
    invalid.writeUInt32BE(128, 16);
    invalid.writeUInt32BE(128, 20);

    await expect(createSkinMarkerChallenge(invalid)).rejects.toThrow('format is unsupported');
  });
});

const skinStoreHash = 'a'.repeat(64);

interface StubRoute {
  readonly body?: Uint8Array;
  readonly contentType?: string;
  readonly status?: number;
}

function stubFetch(route: (url: string) => StubRoute): {
  readonly calls: string[];
  readonly fetch: typeof globalThis.fetch;
} {
  const calls: string[] = [];
  const fetchImplementation: typeof globalThis.fetch = (input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const result = route(url);
    return Promise.resolve(
      new Response(result.body ?? null, {
        headers: { 'content-type': result.contentType ?? 'image/png' },
        status: result.status ?? 200,
      }),
    );
  };
  return { calls, fetch: fetchImplementation };
}

const PNG_BODY = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('HttpSkinStore', (): void => {
  it('fetches a skin once and serves later requests from cache', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ body: PNG_BODY }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    const first = await store.fetchSkin(skinStoreHash);
    expect(first?.contentType).toBe('image/png');
    expect(first?.body.equals(Buffer.from(PNG_BODY))).toBe(true);
    await expect(store.fetchSkin(skinStoreHash)).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it('accepts PNG bytes served as application/octet-stream, as Mojang cape textures are', async (): Promise<void> => {
    const { fetch } = stubFetch(() => ({
      body: PNG_BODY,
      contentType: 'application/octet-stream',
    }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin(skinStoreHash)).resolves.toEqual({
      body: Buffer.from(PNG_BODY),
      contentType: 'image/png',
    });
  });

  it('negatively caches a missing skin', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ status: 404 }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin(skinStoreHash)).resolves.toBeUndefined();
    await expect(store.fetchSkin(skinStoreHash)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('accepts texture ids shorter than 64 hex digits, as Mojang strips leading zeros', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ body: PNG_BODY }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin(skinStoreHash.slice(1))).resolves.toEqual({
      body: Buffer.from(PNG_BODY),
      contentType: 'image/png',
    });
    expect(calls).toHaveLength(1);
  });

  it('rejects an invalid hash without any request', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ body: new Uint8Array([1]) }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin('not-a-hash')).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-PNG response or a mislabeled body without a PNG signature', async (): Promise<void> => {
    const wrongType = new HttpSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: stubFetch(() => ({ body: new Uint8Array([1]), contentType: 'text/html' })).fetch,
    });
    await expect(wrongType.fetchSkin(skinStoreHash)).rejects.toBeInstanceOf(
      MinecraftSkinUnavailableError,
    );

    const mislabeled = new HttpSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: stubFetch(() => ({
        body: new Uint8Array([60, 33, 68, 79, 67]),
        contentType: 'application/octet-stream',
      })).fetch,
    });
    await expect(mislabeled.fetchSkin(skinStoreHash)).rejects.toBeInstanceOf(
      MinecraftSkinUnavailableError,
    );
  });

  it('reports upstream failures, network errors, and oversized bodies as unavailable', async (): Promise<void> => {
    const serverError = new HttpSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: stubFetch(() => ({ status: 503 })).fetch,
    });
    await expect(serverError.fetchSkin(skinStoreHash)).rejects.toBeInstanceOf(
      MinecraftSkinUnavailableError,
    );

    const offline = new HttpSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: (): Promise<Response> => Promise.reject(new Error('network unavailable')),
    });
    await expect(offline.fetchSkin(skinStoreHash)).rejects.toBeInstanceOf(
      MinecraftSkinUnavailableError,
    );

    const bounded = new HttpSkinStore({
      cache: new MemoryMinecraftCache(),
      fetch: stubFetch(() => ({ body: new Uint8Array([1, 2, 3]) })).fetch,
      maxBytes: 2,
    });
    await expect(bounded.fetchSkin(skinStoreHash)).rejects.toBeInstanceOf(
      MinecraftSkinUnavailableError,
    );
  });

  it('uses a stale valid image when the texture service is unavailable', async (): Promise<void> => {
    const body = Buffer.from([1, 2, 3]);
    const cache: MinecraftCache = {
      read: (): Promise<{ fetchedAt: number; value: string }> =>
        Promise.resolve({ fetchedAt: 0, value: body.toString('base64') }),
      write: (): Promise<void> => Promise.resolve(),
    };
    const fetch: typeof globalThis.fetch = (): Promise<Response> =>
      Promise.reject(new Error('network unavailable'));
    const store = new HttpSkinStore({ cache, fetch, ttlSeconds: 1 });

    await expect(store.fetchSkin(skinStoreHash)).resolves.toEqual({
      body,
      contentType: 'image/png',
    });
  });
});

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

  it('derives and detects stable offline-mode UUIDs for unregistered names', (): void => {
    // MD5("OfflinePlayer:Notch") with UUID version 3 and RFC 4122 variant bits.
    expect(offlinePlayerUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f');
    expect(offlinePlayerUuid('XqzFakeName99')).toBe('2a20a507-2d72-3353-a507-8b1cc4b70764');
    expect(offlinePlayerUuid('Notch')).not.toBe(offlinePlayerUuid('notch'));

    expect(isOfflinePlayerUuid(offlinePlayerUuid('Notch'))).toBe(true);
    expect(isOfflinePlayerUuid(offlinePlayerUuid('XqzFakeName99'))).toBe(true);
    // Version-4 Mojang account IDs are never offline identities.
    expect(isOfflinePlayerUuid('069a79f4-44e9-4726-a5be-fca90e38aaf5')).toBe(false);
    expect(isOfflinePlayerUuid('853c80ef-3c37-49fd-aa49-938b674adae6')).toBe(false);
    // A version-3 nibble without the RFC 4122 variant bits is not a name hash.
    expect(isOfflinePlayerUuid('069a79f4-44e9-3726-05be-fca90e38aaf5')).toBe(false);
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

const skinVerificationUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';
const originalHash = '1'.repeat(64);
const markedHash = '2'.repeat(64);

class MemoryChallenges {
  public challenge: SkinVerificationChallenge | undefined;
  public claimed = false;

  public claimCheck(): Promise<SkinVerificationCheckClaim | null> {
    if (this.challenge === undefined || this.claimed) return Promise.resolve(null);
    this.claimed = true;
    return Promise.resolve({
      claimId: 'skin-claim',
      interactionKey: 'skin-key',
      markerHash: this.challenge.markerHash,
      username: this.challenge.username,
      userUuid: this.challenge.userUuid,
    });
  }

  public create(
    _interactionId: string,
    challenge: Omit<SkinVerificationChallenge, 'status'>,
  ): Promise<SkinVerificationChallenge> {
    this.challenge ??= { ...challenge, status: 'pending' };
    return Promise.resolve(this.challenge);
  }

  public deleteClaimed(): Promise<boolean> {
    if (!this.claimed) return Promise.resolve(false);
    this.challenge = undefined;
    return Promise.resolve(true);
  }

  public discard(): Promise<void> {
    this.challenge = undefined;
    this.claimed = false;
    return Promise.resolve();
  }

  public get(): Promise<SkinVerificationChallenge | undefined> {
    return Promise.resolve(this.challenge);
  }

  public releaseCheck(): Promise<boolean> {
    if (!this.claimed) return Promise.resolve(false);
    this.claimed = false;
    return Promise.resolve(true);
  }
}

class MemoryVerification {
  public completedPlayer: AuthenticatedMinecraftPlayer | undefined;
  public claimed = false;

  public claimInteraction(): Promise<VerificationClaim | null> {
    if (this.claimed || this.completedPlayer !== undefined) return Promise.resolve(null);
    this.claimed = true;
    return Promise.resolve({
      claimId: 'verification-claim',
      code: 'ABCDEFGH',
      codeKey: 'code-key',
      interactionKey: 'interaction-key',
      keyId: 'a'.repeat(64),
    });
  }

  public complete(
    _claim: VerificationClaim,
    player: AuthenticatedMinecraftPlayer,
  ): Promise<boolean> {
    this.completedPlayer = player;
    return Promise.resolve(true);
  }

  public getStatus(): Promise<VerificationStatus> {
    return Promise.resolve(
      this.completedPlayer === undefined
        ? { code: 'ABCDEFGH', status: 'pending' }
        : {
            player: this.completedPlayer,
            resolvedAt: '2026-09-12T00:00:00.000Z',
            status: 'verified',
          },
    );
  }

  public release(): Promise<boolean> {
    this.claimed = false;
    return Promise.resolve(true);
  }
}

class Players {
  public fresh: MinecraftPlayerProfileWithSkin | undefined;
  public freshCalls = 0;
  public profile: MinecraftPlayerProfileWithSkin | undefined = {
    texture: { hash: originalHash, model: 'slim' },
    username: 'Player',
    uuid: skinVerificationUuid,
  };

  public findProfileByName(): Promise<MinecraftPlayerProfile | undefined> {
    return Promise.resolve({ username: 'Player', uuid: skinVerificationUuid });
  }

  public findProfileById(): Promise<MinecraftPlayerProfileWithSkin | undefined> {
    return Promise.resolve(this.profile);
  }

  public findFreshProfileById(): Promise<MinecraftPlayerProfileWithSkin | undefined> {
    this.freshCalls += 1;
    return Promise.resolve(this.fresh);
  }
}

class Skins {
  public readonly values = new Map<string, Buffer>();

  public fetchSkin(hash: string): Promise<SkinImage | undefined> {
    const body = this.values.get(hash);
    return Promise.resolve(body === undefined ? undefined : { body, contentType: 'image/png' });
  }
}

class Users implements VerifiedUserRepository {
  public writes: AuthenticatedMinecraftPlayer[] = [];

  public upsertVerifiedUser(player: AuthenticatedMinecraftPlayer): Promise<void> {
    this.writes.push(player);
    return Promise.resolve();
  }
}

describe('SkinVerificationService', (): void => {
  it('creates a format-preserving challenge and resolves only a fresh signed profile', async (): Promise<void> => {
    const challenges = new MemoryChallenges();
    const verification = new MemoryVerification();
    const players = new Players();
    const skins = new Skins();
    const users = new Users();
    skins.values.set(originalHash, await createSkinPng([], 32));
    const service = new SkinVerificationService(challenges, verification, players, skins, users, {
      error: (): void => undefined,
    });

    const challenge = await service.start('interaction', 'Player');
    expect(challenge).toMatchObject({
      height: 32,
      model: 'classic',
      username: 'Player',
      userUuid: skinVerificationUuid,
    });

    skins.values.set(markedHash, challenge.body);
    players.fresh = {
      texture: { hash: markedHash, model: 'classic' },
      username: 'RenamedPlayer',
      uuid: skinVerificationUuid,
    };
    await expect(service.check('interaction')).resolves.toMatchObject({
      player: { username: 'RenamedPlayer', uuid: skinVerificationUuid },
      status: 'verified',
    });
    expect(players.freshCalls).toBe(1);
    expect(users.writes).toEqual([{ username: 'RenamedPlayer', uuid: skinVerificationUuid }]);
    expect(verification.completedPlayer).toEqual({
      username: 'RenamedPlayer',
      uuid: skinVerificationUuid,
    });
  });

  it('keeps the challenge pending when the current signed skin has a different marker', async (): Promise<void> => {
    const challenges = new MemoryChallenges();
    const verification = new MemoryVerification();
    const players = new Players();
    const skins = new Skins();
    const users = new Users();
    const unmarked = await createSkinPng([]);
    skins.values.set(originalHash, unmarked);
    skins.values.set(markedHash, unmarked);
    players.fresh = {
      texture: { hash: markedHash, model: 'slim' },
      username: 'Player',
      uuid: skinVerificationUuid,
    };
    const service = new SkinVerificationService(challenges, verification, players, skins, users, {
      error: (): void => undefined,
    });

    await service.start('interaction', 'Player');
    await expect(service.check('interaction')).resolves.toEqual({
      code: 'ABCDEFGH',
      status: 'pending',
    });
    expect(users.writes).toHaveLength(0);
    expect(challenges.claimed).toBe(false);
    expect(challenges.challenge).toBeDefined();
  });

  it('provides a modern classic template when the signed profile uses a default skin', async (): Promise<void> => {
    const challenges = new MemoryChallenges();
    const players = new Players();
    players.profile = { username: 'Player', uuid: skinVerificationUuid };
    const service = new SkinVerificationService(
      challenges,
      new MemoryVerification(),
      players,
      new Skins(),
      new Users(),
      { error: (): void => undefined },
    );

    await expect(service.start('interaction', 'Player')).resolves.toMatchObject({
      height: 64,
      model: 'classic',
      username: 'Player',
    });
  });
});
