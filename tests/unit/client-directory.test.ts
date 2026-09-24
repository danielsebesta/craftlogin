import { afterEach, describe, expect, it, vi } from 'vitest';

import { OriginAllowlistCache } from '../../src/api/client-directory.js';

describe('OriginAllowlistCache', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('serves repeat reads from the snapshot within the TTL', async (): Promise<void> => {
    let loads = 0;
    const cache = new OriginAllowlistCache((): Promise<ReadonlySet<string>> => {
      loads += 1;
      return Promise.resolve(new Set(['https://app.example']));
    }, 30_000);

    expect(await cache.get()).toEqual(new Set(['https://app.example']));
    expect(await cache.get()).toEqual(new Set(['https://app.example']));
    expect(loads).toBe(1);
  });

  it('shares one in-flight scan across concurrent misses', async (): Promise<void> => {
    let loads = 0;
    let release: () => void = (): void => undefined;
    const gate = new Promise<void>((resolve): void => {
      release = resolve;
    });
    const cache = new OriginAllowlistCache(async (): Promise<ReadonlySet<string>> => {
      loads += 1;
      await gate;
      return new Set(['https://app.example']);
    });

    const pending = Promise.all([cache.get(), cache.get(), cache.get()]);
    release();
    await pending;
    expect(loads).toBe(1);
  });

  it('refreshes after the TTL and falls back to the stale snapshot on failure', async (): Promise<void> => {
    vi.useFakeTimers();
    let loads = 0;
    let failing = false;
    const cache = new OriginAllowlistCache((): Promise<ReadonlySet<string>> => {
      loads += 1;
      return failing
        ? Promise.reject(new Error('database unavailable'))
        : Promise.resolve(new Set([`https://app-${loads.toString()}.example`]));
    }, 30_000);

    expect(await cache.get()).toEqual(new Set(['https://app-1.example']));

    await vi.advanceTimersByTimeAsync(31_000);
    failing = true;
    expect(await cache.get()).toEqual(new Set(['https://app-1.example']));
    expect(loads).toBe(2);

    // A failed refresh does not extend the snapshot; the next read retries.
    failing = false;
    expect(await cache.get()).toEqual(new Set(['https://app-3.example']));
    expect(loads).toBe(3);
  });

  it('propagates the load failure when no snapshot exists yet', async (): Promise<void> => {
    const cache = new OriginAllowlistCache((): Promise<ReadonlySet<string>> =>
      Promise.reject(new Error('database unavailable')),
    );

    await expect(cache.get()).rejects.toThrow('database unavailable');
  });
});
