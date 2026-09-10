import { z } from 'zod';

import type { CachedValue, MinecraftCache } from './cache.js';

const SKIN_HASH_PATTERN = /^[0-9a-f]{64}$/u;
const SKIN_BASE_URL = 'https://textures.minecraft.net/texture/';
const USER_AGENT = 'CraftLogin/0.1 (+https://github.com/danielsebesta/craftlogin)';

export interface SkinImage {
  readonly body: Buffer;
  readonly contentType: 'image/png';
}

export interface SkinStore {
  fetchSkin(hash: string): Promise<SkinImage | undefined>;
}

export interface HttpSkinStoreOptions {
  readonly baseUrl?: string;
  readonly cache: MinecraftCache;
  readonly fetch?: typeof globalThis.fetch;
  readonly maxBytes?: number;
  readonly notFoundTtlSeconds?: number;
  readonly timeoutMs?: number;
  readonly ttlSeconds?: number;
}

export class HttpSkinStore implements SkinStore {
  private readonly baseUrl: string;
  private readonly cache: MinecraftCache;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly maxBytes: number;
  private readonly notFoundTtlSeconds: number;
  private readonly timeoutMs: number;
  private readonly ttlSeconds: number;

  public constructor(options: HttpSkinStoreOptions) {
    this.baseUrl = options.baseUrl ?? SKIN_BASE_URL;
    this.cache = options.cache;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.maxBytes = options.maxBytes ?? 256 * 1_024;
    this.notFoundTtlSeconds = options.notFoundTtlSeconds ?? 60;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60;
  }

  public async fetchSkin(hash: string): Promise<SkinImage | undefined> {
    if (!SKIN_HASH_PATTERN.test(hash)) {
      return undefined;
    }

    const key = `skin-image:${hash}`;
    const cached = await this.cache.read(key);
    if (cached !== undefined) {
      const cachedImage = decodeSkinImage(cached, this.maxBytes);
      if (cachedImage !== undefined) {
        return cachedImage;
      }
      if (cached.value === null) {
        return undefined;
      }
    }

    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${hash}`, {
        headers: { accept: 'image/png', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok || !(response.headers.get('content-type') ?? '').startsWith('image/png')) {
        await this.cache.write(key, null, this.notFoundTtlSeconds);
        return undefined;
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0 || body.length > this.maxBytes) {
        await this.cache.write(key, null, this.notFoundTtlSeconds);
        return undefined;
      }
      await this.cache.write(key, body.toString('base64'), this.ttlSeconds);
      return { body, contentType: 'image/png' };
    } catch {
      return undefined;
    }
  }
}

const base64Schema = z.string();

function decodeSkinImage(cached: CachedValue | undefined, maxBytes: number): SkinImage | undefined {
  if (cached === undefined) {
    return undefined;
  }
  const parsed = base64Schema.safeParse(cached.value);
  if (!parsed.success) {
    return undefined;
  }
  const body = Buffer.from(parsed.data, 'base64');
  return body.length === 0 || body.length > maxBytes
    ? undefined
    : { body, contentType: 'image/png' };
}
