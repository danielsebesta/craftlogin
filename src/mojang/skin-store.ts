import { z } from 'zod';

import { getErrorKind } from '../logging/error-kind.js';
import { BoundedResponseError, readBoundedResponseBody } from './bounded-body.js';
import type { CachedValue, MinecraftCache } from './cache.js';

const SKIN_HASH_PATTERN = /^[0-9a-f]{64}$/u;
const SKIN_BASE_URL = 'https://textures.minecraft.net/texture/';
const USER_AGENT = 'CraftLogin/0.1 (+https://github.com/danielsebesta/craftlogin)';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface SkinImage {
  readonly body: Buffer;
  readonly contentType: 'image/png';
}

export interface SkinStore {
  fetchSkin(hash: string): Promise<SkinImage | undefined>;
}

export class MinecraftSkinUnavailableError extends Error {
  public override readonly name = 'MinecraftSkinUnavailableError';
}

export interface HttpSkinStoreOptions {
  readonly baseUrl?: string;
  readonly cache: MinecraftCache;
  readonly fetch?: typeof globalThis.fetch;
  readonly logger?: SkinStoreLogger;
  readonly maxBytes?: number;
  readonly notFoundTtlSeconds?: number;
  readonly staleTtlSeconds?: number;
  readonly timeoutMs?: number;
  readonly ttlSeconds?: number;
}

export interface SkinStoreLogger {
  warn(details: Record<string, unknown>, message: string): void;
}

export class HttpSkinStore implements SkinStore {
  private readonly baseUrl: string;
  private readonly cache: MinecraftCache;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly maxBytes: number;
  private readonly logger: SkinStoreLogger | undefined;
  private readonly notFoundTtlSeconds: number;
  private readonly staleTtlSeconds: number;
  private readonly timeoutMs: number;
  private readonly ttlSeconds: number;

  public constructor(options: HttpSkinStoreOptions) {
    this.baseUrl = options.baseUrl ?? SKIN_BASE_URL;
    this.cache = options.cache;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.logger = options.logger;
    this.maxBytes = options.maxBytes ?? 256 * 1_024;
    this.notFoundTtlSeconds = options.notFoundTtlSeconds ?? 60;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    this.ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60;
    this.staleTtlSeconds = Math.max(this.ttlSeconds, options.staleTtlSeconds ?? 7 * 24 * 60 * 60);
  }

  public async fetchSkin(hash: string): Promise<SkinImage | undefined> {
    if (!SKIN_HASH_PATTERN.test(hash)) {
      return undefined;
    }

    const key = `skin-image:${hash}`;
    const cached = await this.cache.read(key);
    const cachedImage = decodeSkinImage(cached, this.maxBytes);
    if (
      cachedImage !== undefined &&
      cached !== undefined &&
      Date.now() - cached.fetchedAt <= this.ttlSeconds * 1_000
    ) {
      return cachedImage;
    }
    if (cached?.value === null) {
      return undefined;
    }

    try {
      const response = await this.fetchImplementation(`${this.baseUrl}${hash}`, {
        headers: { accept: 'image/png', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 204 || response.status === 404) {
        await this.cache.write(key, null, this.notFoundTtlSeconds);
        return undefined;
      }
      if (!response.ok) {
        throw new MinecraftSkinUnavailableError(
          `Minecraft texture service returned HTTP ${response.status.toString()}`,
        );
      }
      // Mojang mislabels cape textures as octet-stream; the signature check
      // below is what guarantees PNG content.
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/png') && contentType !== 'application/octet-stream') {
        throw new MinecraftSkinUnavailableError('Minecraft texture service returned a non-PNG');
      }
      const body = await readBoundedResponseBody(
        response,
        this.maxBytes,
        'Minecraft texture',
      ).catch((cause: unknown): never => {
        throw cause instanceof BoundedResponseError
          ? new MinecraftSkinUnavailableError(cause.message, { cause })
          : cause;
      });
      if (!body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
        throw new MinecraftSkinUnavailableError(
          'Minecraft texture service returned an invalid image',
        );
      }
      await this.cache.write(key, body.toString('base64'), this.staleTtlSeconds);
      return { body, contentType: 'image/png' };
    } catch (error: unknown) {
      if (cachedImage !== undefined) {
        this.logger?.warn(
          { errorKind: getErrorKind(error), operation: 'skin-fetch' },
          'Using stale Minecraft skin',
        );
        return cachedImage;
      }
      if (error instanceof MinecraftSkinUnavailableError) {
        throw error;
      }
      throw new MinecraftSkinUnavailableError('Minecraft texture service is unreachable', {
        cause: error,
      });
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
