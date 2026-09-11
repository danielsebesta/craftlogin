import { z } from 'zod';

import { getErrorKind } from '../logging/error-kind.js';
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
      if (!(response.headers.get('content-type') ?? '').startsWith('image/png')) {
        throw new MinecraftSkinUnavailableError('Minecraft texture service returned a non-PNG');
      }
      const body = await readBoundedResponseBody(response, this.maxBytes);
      if (body.length === 0) {
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

async function readBoundedResponseBody(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new MinecraftSkinUnavailableError('Minecraft texture image exceeds the size limit');
    }
  }
  if (response.body === null) {
    return Buffer.alloc(0);
  }

  const readerCandidate: unknown = response.body.getReader();
  if (!isStreamReader(readerCandidate)) {
    throw new MinecraftSkinUnavailableError('Minecraft texture stream is unavailable');
  }
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let result = readStreamResult(await readerCandidate.read());
  while (!result.done) {
    receivedBytes += result.value.byteLength;
    if (receivedBytes > maxBytes) {
      await readerCandidate.cancel().catch((): undefined => undefined);
      throw new MinecraftSkinUnavailableError('Minecraft texture image exceeds the size limit');
    }
    chunks.push(result.value);
    result = readStreamResult(await readerCandidate.read());
  }
  return Buffer.concat(chunks, receivedBytes);
}

interface UnknownStreamReader {
  cancel(): Promise<unknown>;
  read(): Promise<unknown>;
}

function isStreamReader(value: unknown): value is UnknownStreamReader {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const read: unknown = Reflect.get(value, 'read');
  const cancel: unknown = Reflect.get(value, 'cancel');
  return typeof read === 'function' && typeof cancel === 'function';
}

type StreamReadResult =
  { readonly done: false; readonly value: Uint8Array } | { readonly done: true };

function readStreamResult(value: unknown): StreamReadResult {
  if (typeof value !== 'object' || value === null) {
    throw new MinecraftSkinUnavailableError('Minecraft texture stream returned invalid data');
  }
  const done: unknown = Reflect.get(value, 'done');
  if (done === true) {
    return { done: true };
  }
  const chunk: unknown = Reflect.get(value, 'value');
  if (done !== false || !(chunk instanceof Uint8Array)) {
    throw new MinecraftSkinUnavailableError('Minecraft texture stream returned invalid data');
  }
  return { done: false, value: chunk };
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
