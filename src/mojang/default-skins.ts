import { createHash } from 'node:crypto';

import { getErrorKind } from '../logging/error-kind.js';
import type { MinecraftCache } from './cache.js';
import { canonicalMinecraftUuid } from './uuid.js';

const USER_AGENT = 'CraftLogin/0.1 (+https://github.com/danielsebesta/craftlogin)';
// Pinned vanilla asset release. The nine default skins rarely change; when they
// do, update this version together with the catalogue below.
const DEFAULT_SKIN_VERSION = '1.21.5';
const DEFAULT_SKIN_BASE_URL = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${DEFAULT_SKIN_VERSION}/assets/minecraft/textures/entity/player/`;

export type MinecraftSkinModel = 'classic' | 'slim';

export interface DefaultSkin {
  readonly assetPath: string;
  readonly model: MinecraftSkinModel;
  readonly name: 'alex' | 'ari' | 'efe' | 'kai' | 'makena' | 'noor' | 'steve' | 'sunny' | 'zuri';
}

// The nine default skins Mojang ships since 1.19.3 (Steve and Alex plus seven
// new characters). Wide-armed characters use the classic model, slim-armed the
// slim model. Order is the CraftLogin catalogue order, used for deterministic
// hash selection, not a vanilla claim.
export const DEFAULT_SKINS: readonly DefaultSkin[] = [
  { assetPath: 'slim/alex.png', model: 'slim', name: 'alex' },
  { assetPath: 'wide/ari.png', model: 'classic', name: 'ari' },
  { assetPath: 'slim/efe.png', model: 'slim', name: 'efe' },
  { assetPath: 'wide/kai.png', model: 'classic', name: 'kai' },
  { assetPath: 'slim/makena.png', model: 'slim', name: 'makena' },
  { assetPath: 'slim/noor.png', model: 'slim', name: 'noor' },
  { assetPath: 'wide/steve.png', model: 'classic', name: 'steve' },
  { assetPath: 'wide/sunny.png', model: 'classic', name: 'sunny' },
  { assetPath: 'wide/zuri.png', model: 'classic', name: 'zuri' },
];

export function defaultSkinUrl(skin: DefaultSkin): string {
  return `${DEFAULT_SKIN_BASE_URL}${skin.assetPath}`;
}

// Offline-mode UUID from vanilla servers: MD5("OfflinePlayer:" + name) with
// UUID version 3 and RFC 4122 variant bits, exactly like
// java.util.UUID.nameUUIDFromBytes. Fake or unregistered names resolve to this
// synthetic identity; it must never be treated as a verified Mojang identity.
export function offlinePlayerUuid(username: string): string {
  const digest = createHash('md5').update(`OfflinePlayer:${username}`, 'utf8').digest();
  const versionByte = digest.at(6);
  const variantByte = digest.at(8);
  if (versionByte === undefined || variantByte === undefined) {
    throw new RangeError('MD5 digest is shorter than a UUID');
  }
  digest[6] = (versionByte & 0x0f) | 0x30;
  digest[8] = (variantByte & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Replicates java.util.UUID.hashCode so hash-derived selection matches JVM
// behavior: (int)((msb ^ lsb) >>> 32) ^ (int)(msb ^ lsb).
export function javaUuidHashCode(uuid: string): number {
  const hex = uuid.replaceAll('-', '');
  if (!/^[0-9a-fA-F]{32}$/u.test(hex)) {
    throw new RangeError('Default skin selection requires a UUID');
  }
  const mask = (1n << 64n) - 1n;
  const hilo = (BigInt(`0x${hex.slice(0, 16)}`) ^ BigInt(`0x${hex.slice(16)}`)) & mask;
  const xored = Number(((hilo >> 32n) ^ (hilo & 0xffffffffn)) & 0xffffffffn);
  return xored > 0x7fffffff ? xored - 0x100000000 : xored;
}

export function selectDefaultSkin(uuid: string): DefaultSkin {
  const canonical = canonicalMinecraftUuid(uuid);
  if (canonical === undefined) {
    throw new RangeError('Default skin selection requires a UUID');
  }
  const hash = javaUuidHashCode(canonical);
  const index = ((hash % DEFAULT_SKINS.length) + DEFAULT_SKINS.length) % DEFAULT_SKINS.length;
  const skin = DEFAULT_SKINS[index];
  if (skin === undefined) {
    throw new RangeError('Default skin catalogue is empty');
  }
  return skin;
}

export interface DefaultSkinSource {
  fetchDefaultSkin(skin: DefaultSkin): Promise<Buffer | undefined>;
}

export class DefaultSkinUnavailableError extends Error {
  public override readonly name = 'DefaultSkinUnavailableError';
}

export interface HttpDefaultSkinStoreOptions {
  readonly cache: MinecraftCache;
  readonly fetch?: typeof globalThis.fetch;
  readonly logger?: DefaultSkinLogger;
  readonly maxBytes?: number;
  readonly notFoundTtlSeconds?: number;
  readonly staleTtlSeconds?: number;
  readonly timeoutMs?: number;
  readonly ttlSeconds?: number;
}

export interface DefaultSkinLogger {
  warn(details: Record<string, unknown>, message: string): void;
}

export class HttpDefaultSkinStore implements DefaultSkinSource {
  private readonly cache: MinecraftCache;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly logger: DefaultSkinLogger | undefined;
  private readonly maxBytes: number;
  private readonly notFoundTtlSeconds: number;
  private readonly staleTtlSeconds: number;
  private readonly timeoutMs: number;
  private readonly ttlSeconds: number;

  public constructor(options: HttpDefaultSkinStoreOptions) {
    this.cache = options.cache;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.logger = options.logger;
    this.maxBytes = options.maxBytes ?? 256 * 1_024;
    this.notFoundTtlSeconds = options.notFoundTtlSeconds ?? 60;
    this.timeoutMs = options.timeoutMs ?? 4_000;
    // Pinned immutable assets: a long TTL keeps fallback renders available.
    this.ttlSeconds = options.ttlSeconds ?? 7 * 24 * 60 * 60;
    this.staleTtlSeconds = Math.max(this.ttlSeconds, options.staleTtlSeconds ?? 30 * 24 * 60 * 60);
  }

  public async fetchDefaultSkin(skin: DefaultSkin): Promise<Buffer | undefined> {
    const key = `default-skin:${skin.name}`;
    const cached = await this.cache.read(key);
    const cachedBody = cachedImageBody(cached?.value);
    if (
      cachedBody !== undefined &&
      cached !== undefined &&
      Date.now() - cached.fetchedAt <= this.ttlSeconds * 1_000
    ) {
      return cachedBody;
    }
    if (cached?.value === null) {
      return undefined;
    }

    try {
      const response = await this.fetchImplementation(defaultSkinUrl(skin), {
        headers: { accept: 'image/png', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 404) {
        await this.cache.write(key, null, this.notFoundTtlSeconds);
        return undefined;
      }
      if (!response.ok) {
        throw new DefaultSkinUnavailableError(
          `Default skin service returned HTTP ${response.status.toString()}`,
        );
      }
      if (!(response.headers.get('content-type') ?? '').startsWith('image/png')) {
        throw new DefaultSkinUnavailableError('Default skin service returned a non-PNG');
      }
      const body = await readBoundedResponseBody(response, this.maxBytes);
      if (body.length === 0) {
        throw new DefaultSkinUnavailableError('Default skin service returned an invalid image');
      }
      await this.cache.write(key, body.toString('base64'), this.staleTtlSeconds);
      return body;
    } catch (error: unknown) {
      if (cachedBody !== undefined) {
        this.logger?.warn(
          { errorKind: getErrorKind(error), operation: 'default-skin-fetch' },
          'Using stale default skin',
        );
        return cachedBody;
      }
      if (error instanceof DefaultSkinUnavailableError) {
        throw error;
      }
      throw new DefaultSkinUnavailableError('Default skin service is unreachable', {
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
      throw new DefaultSkinUnavailableError('Default skin image exceeds the size limit');
    }
  }
  if (response.body === null) {
    return Buffer.alloc(0);
  }

  const readerCandidate: unknown = response.body.getReader();
  if (!isStreamReader(readerCandidate)) {
    throw new DefaultSkinUnavailableError('Default skin stream is unavailable');
  }
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let result = readStreamResult(await readerCandidate.read());
  while (!result.done) {
    receivedBytes += result.value.byteLength;
    if (receivedBytes > maxBytes) {
      await readerCandidate.cancel().catch((): undefined => undefined);
      throw new DefaultSkinUnavailableError('Default skin image exceeds the size limit');
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
    throw new DefaultSkinUnavailableError('Default skin stream returned invalid data');
  }
  const done: unknown = Reflect.get(value, 'done');
  if (done === true) {
    return { done: true };
  }
  const chunk: unknown = Reflect.get(value, 'value');
  if (done !== false || !(chunk instanceof Uint8Array)) {
    throw new DefaultSkinUnavailableError('Default skin stream returned invalid data');
  }
  return { done: false, value: chunk };
}

function cachedImageBody(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  const body = Buffer.from(value, 'base64');
  return body.length === 0 ? undefined : body;
}
