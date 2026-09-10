import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { MemoryMinecraftCache } from '../../src/mojang/cache.js';
import {
  HttpMojangClient,
  MinecraftSignatureError,
  type MojangLogger,
} from '../../src/mojang/client.js';

const textureHash = '7fd9ba42a7c81eeea22f1524271ae85a8e045ce0af5a6ae16c6406ae917e68b5';
const playerUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';

interface StubResponse {
  readonly body: unknown;
  readonly status?: number;
}

function stubFetch(routes: (url: string) => StubResponse): {
  readonly calls: string[];
  readonly fetch: typeof globalThis.fetch;
} {
  const calls: string[] = [];
  const fetchImplementation: typeof globalThis.fetch = (input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes(url);
    return Promise.resolve(
      new Response(JSON.stringify(route.body), {
        headers: { 'content-type': 'application/json' },
        status: route.status ?? 200,
      }),
    );
  };
  return { calls, fetch: fetchImplementation };
}

function signedTextures(privateKey: KeyObject): { signature: string; value: string } {
  const value = Buffer.from(
    JSON.stringify({
      textures: { SKIN: { url: `http://textures.minecraft.net/texture/${textureHash}` } },
    }),
    'utf8',
  ).toString('base64');
  return {
    signature: sign('RSA-SHA1', Buffer.from(value, 'utf8'), privateKey).toString('base64'),
    value,
  };
}

function profilePublicKey(publicKey: KeyObject): string {
  return publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
}

function silentLogger(): MojangLogger {
  return { warn: (): void => undefined };
}

describe('HttpMojangClient', (): void => {
  it('verifies the texture signature and caches the profile', async (): Promise<void> => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
    const textures = signedTextures(privateKey);
    const { calls, fetch } = stubFetch((url) => {
      if (url.includes('/publickeys')) {
        return { body: { profilePropertyKeys: [{ publicKey: profilePublicKey(publicKey) }] } };
      }
      return {
        body: {
          id: playerUuid.replaceAll('-', ''),
          name: 'jeb_',
          properties: [{ name: 'textures', signature: textures.signature, value: textures.value }],
        },
      };
    });
    const client = new HttpMojangClient({
      cache: new MemoryMinecraftCache(),
      fetch,
      logger: silentLogger(),
    });

    const profile = await client.findProfileById(playerUuid);
    expect(profile).toEqual({ textureHash, username: 'jeb_', uuid: playerUuid });

    const callCount = calls.length;
    const cachedProfile = await client.findProfileById(playerUuid);
    expect(cachedProfile).toEqual(profile);
    expect(calls).toHaveLength(callCount);
  });

  it('rejects a profile whose texture signature does not verify', async (): Promise<void> => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
    const textures = signedTextures(privateKey);
    const { fetch } = stubFetch((url) => {
      if (url.includes('/publickeys')) {
        return { body: { profilePropertyKeys: [{ publicKey: profilePublicKey(publicKey) }] } };
      }
      return {
        body: {
          id: playerUuid.replaceAll('-', ''),
          name: 'jeb_',
          properties: [
            {
              name: 'textures',
              signature: `${textures.signature.slice(0, -4)}AAAA`,
              value: textures.value,
            },
          ],
        },
      };
    });
    const client = new HttpMojangClient({
      cache: new MemoryMinecraftCache(),
      fetch,
      logger: silentLogger(),
    });

    await expect(client.findProfileById(playerUuid)).rejects.toBeInstanceOf(
      MinecraftSignatureError,
    );
  });

  it('falls back to a stale profile when Minecraft is rate limited', async (): Promise<void> => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2_048 });
    const textures = signedTextures(privateKey);
    const cache = new MemoryMinecraftCache();
    let rateLimited = false;
    const { fetch } = stubFetch((url) => {
      if (url.includes('/publickeys')) {
        return { body: { profilePropertyKeys: [{ publicKey: profilePublicKey(publicKey) }] } };
      }
      if (rateLimited) {
        return { body: { error: 'rate limited' }, status: 429 };
      }
      return {
        body: {
          id: playerUuid.replaceAll('-', ''),
          name: 'jeb_',
          properties: [{ name: 'textures', signature: textures.signature, value: textures.value }],
        },
      };
    });
    const client = new HttpMojangClient({
      cache,
      fetch,
      freshTtlSeconds: 0,
      logger: silentLogger(),
    });

    await expect(client.findProfileById(playerUuid)).resolves.toEqual({
      textureHash,
      username: 'jeb_',
      uuid: playerUuid,
    });

    rateLimited = true;
    await expect(client.findProfileById(playerUuid)).resolves.toEqual({
      textureHash,
      username: 'jeb_',
      uuid: playerUuid,
    });
  });

  it('canonicalizes a name lookup response into a dashed UUID', async (): Promise<void> => {
    const { fetch } = stubFetch(() => ({
      body: { id: playerUuid.replaceAll('-', ''), name: 'jeb_' },
    }));
    const client = new HttpMojangClient({
      cache: new MemoryMinecraftCache(),
      fetch,
      logger: silentLogger(),
    });

    await expect(client.findProfileByName('jeb_')).resolves.toEqual({
      username: 'jeb_',
      uuid: playerUuid,
    });
    await expect(client.findProfileByName('not a name')).resolves.toBeUndefined();
  });
});
