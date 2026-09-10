import { describe, expect, it } from 'vitest';

import { MemoryMinecraftCache } from '../../src/mojang/cache.js';
import { HttpSkinStore } from '../../src/mojang/skin-store.js';

const hash = 'a'.repeat(64);

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

describe('HttpSkinStore', (): void => {
  it('fetches a skin once and serves later requests from cache', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ body: new Uint8Array([1, 2, 3]) }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    const first = await store.fetchSkin(hash);
    expect(first?.contentType).toBe('image/png');
    expect(first?.body.equals(Buffer.from([1, 2, 3]))).toBe(true);
    await expect(store.fetchSkin(hash)).resolves.toBeDefined();
    expect(calls).toHaveLength(1);
  });

  it('negatively caches a missing skin', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ status: 404 }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin(hash)).resolves.toBeUndefined();
    await expect(store.fetchSkin(hash)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('rejects an invalid hash without any request', async (): Promise<void> => {
    const { calls, fetch } = stubFetch(() => ({ body: new Uint8Array([1]) }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin('not-a-hash')).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-PNG response', async (): Promise<void> => {
    const { fetch } = stubFetch(() => ({ body: new Uint8Array([1]), contentType: 'text/html' }));
    const store = new HttpSkinStore({ cache: new MemoryMinecraftCache(), fetch });

    await expect(store.fetchSkin(hash)).resolves.toBeUndefined();
  });
});
