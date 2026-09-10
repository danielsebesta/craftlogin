import { createPublicKey, verify, type KeyObject } from 'node:crypto';

import { z } from 'zod';

import type { CachedValue, MinecraftCache } from './cache.js';
import { canonicalMinecraftUuid, stripMinecraftUuidDashes } from './uuid.js';

const USER_AGENT = 'CraftLogin/0.1 (+https://github.com/danielsebesta/craftlogin)';
const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/u;
const TEXTURE_HASH_PATTERN = /^[0-9a-f]{64}$/u;

const PROFILE_BY_NAME_URL = 'https://api.mojang.com/users/profiles/minecraft/';
const PROFILE_BY_ID_URL = 'https://sessionserver.mojang.com/session/minecraft/profile/';
const PROFILE_KEYS_URL = 'https://api.minecraftservices.com/publickeys';

const nameProfileSchema = z.object({ id: z.string(), name: z.string() });
const texturePropertySchema = z.object({
  name: z.string(),
  signature: z.string().optional(),
  value: z.string(),
});
const sessionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  properties: z.array(texturePropertySchema).optional(),
});
const profileKeysSchema = z.object({
  profilePropertyKeys: z.array(z.object({ publicKey: z.string() })),
});
const texturesPayloadSchema = z.object({
  textures: z.object({ SKIN: z.object({ url: z.string() }).optional() }).optional(),
});

export interface MinecraftPlayerProfile {
  readonly uuid: string;
  readonly username: string;
}

export interface MinecraftPlayerProfileWithSkin extends MinecraftPlayerProfile {
  readonly textureHash?: string;
}

export interface MinecraftPlayerLookup {
  findProfileByName(username: string): Promise<MinecraftPlayerProfile | undefined>;
  findProfileById(uuid: string): Promise<MinecraftPlayerProfileWithSkin | undefined>;
}

export interface MojangLogger {
  warn(details: Record<string, unknown>, message: string): void;
}

export class MinecraftUnavailableError extends Error {
  public override readonly name = 'MinecraftUnavailableError';
}

export class MinecraftSignatureError extends Error {
  public override readonly name = 'MinecraftSignatureError';
}

export interface HttpMojangClientOptions {
  readonly cache: MinecraftCache;
  readonly fetch?: typeof globalThis.fetch;
  readonly freshTtlSeconds?: number;
  readonly keysTtlSeconds?: number;
  readonly logger?: MojangLogger;
  readonly notFoundTtlSeconds?: number;
  readonly profileByIdUrl?: string;
  readonly profileByNameUrl?: string;
  readonly profileKeysUrl?: string;
  readonly staleTtlSeconds?: number;
  readonly timeoutMs?: number;
}

export class HttpMojangClient implements MinecraftPlayerLookup {
  private readonly cache: MinecraftCache;
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly freshTtlMs: number;
  private readonly keysTtlSeconds: number;
  private readonly logger: MojangLogger | undefined;
  private readonly notFoundTtlSeconds: number;
  private readonly profileByIdUrl: string;
  private readonly profileByNameUrl: string;
  private readonly profileKeysUrl: string;
  private readonly staleTtlSeconds: number;
  private readonly timeoutMs: number;

  public constructor(options: HttpMojangClientOptions) {
    this.cache = options.cache;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.freshTtlMs = (options.freshTtlSeconds ?? 60 * 60) * 1_000;
    this.keysTtlSeconds = options.keysTtlSeconds ?? 60 * 60;
    this.logger = options.logger;
    this.notFoundTtlSeconds = options.notFoundTtlSeconds ?? 60;
    this.profileByIdUrl = options.profileByIdUrl ?? PROFILE_BY_ID_URL;
    this.profileByNameUrl = options.profileByNameUrl ?? PROFILE_BY_NAME_URL;
    this.profileKeysUrl = options.profileKeysUrl ?? PROFILE_KEYS_URL;
    this.staleTtlSeconds = options.staleTtlSeconds ?? 24 * 60 * 60;
    this.timeoutMs = options.timeoutMs ?? 4_000;
  }

  public async findProfileByName(username: string): Promise<MinecraftPlayerProfile | undefined> {
    const normalized = username.trim();
    if (!PLAYER_NAME_PATTERN.test(normalized)) {
      return undefined;
    }

    const key = `profile-by-name:${normalized.toLowerCase()}`;
    const cached = await this.cache.read(key);
    const fresh = this.readFreshProfile(cached);
    if (fresh !== undefined) {
      return fresh;
    }

    try {
      const payload = await this.fetchJson(
        `${this.profileByNameUrl}${encodeURIComponent(normalized)}`,
      );
      if (payload === undefined) {
        await this.cache.write(key, null, this.notFoundTtlSeconds);
        return undefined;
      }
      const profile = profileFromNamePayload(payload);
      if (profile === undefined) {
        throw new MinecraftUnavailableError('Minecraft returned an unexpected profile payload');
      }
      await this.cache.write(key, profile, this.staleTtlSeconds);
      return profile;
    } catch (error: unknown) {
      return this.staleFallback(cached, error, 'profile-by-name');
    }
  }

  public async findProfileById(uuid: string): Promise<MinecraftPlayerProfileWithSkin | undefined> {
    const canonical = canonicalMinecraftUuid(uuid);
    if (canonical === undefined) {
      return undefined;
    }

    const key = `profile-by-id:${canonical}`;
    const cached = await this.cache.read(key);
    const fresh = this.readFreshProfileWithSkin(cached);
    if (fresh !== undefined) {
      return fresh;
    }

    try {
      const payload = await this.fetchJson(
        `${this.profileByIdUrl}${stripMinecraftUuidDashes(canonical)}?unsigned=false`,
      );
      if (payload === undefined) {
        await this.cache.write(key, null, this.notFoundTtlSeconds);
        return undefined;
      }
      const profile = await this.profileFromSessionPayload(payload, canonical);
      await this.cache.write(key, profile, this.staleTtlSeconds);
      return profile;
    } catch (error: unknown) {
      return this.staleFallback(cached, error, 'profile-by-id');
    }
  }

  private async profileFromSessionPayload(
    payload: unknown,
    fallbackUuid: string,
  ): Promise<MinecraftPlayerProfileWithSkin> {
    const parsed = sessionProfileSchema.safeParse(payload);
    if (!parsed.success) {
      throw new MinecraftUnavailableError('Minecraft returned an unexpected session payload');
    }
    const uuid = canonicalMinecraftUuid(parsed.data.id) ?? fallbackUuid;
    const textureHash = await this.readTextureHash(parsed.data.properties ?? []);
    return textureHash === undefined
      ? { uuid, username: parsed.data.name }
      : { textureHash, uuid, username: parsed.data.name };
  }

  private async readTextureHash(
    properties: readonly z.infer<typeof texturePropertySchema>[],
  ): Promise<string | undefined> {
    const textures = properties.find(
      (property): boolean => property.name === 'textures' && property.signature !== undefined,
    );
    if (textures?.signature === undefined) {
      return undefined;
    }

    const keys = await this.readProfileKeys();
    const signedValue = Buffer.from(textures.value, 'utf8');
    const signature = Buffer.from(textures.signature, 'base64');
    const verified = keys.some((key): boolean => {
      try {
        return verify('RSA-SHA1', signedValue, key, signature);
      } catch {
        return false;
      }
    });
    if (!verified) {
      throw new MinecraftSignatureError('Minecraft texture signature could not be verified');
    }

    return textureHashFromValue(textures.value);
  }

  private async readProfileKeys(): Promise<readonly KeyObject[]> {
    const key = 'profile-keys';
    const cached = await this.cache.read(key);
    const fresh = this.keysFromCache(cached);
    if (fresh !== undefined) {
      return fresh;
    }

    try {
      const payload = await this.fetchJson(this.profileKeysUrl);
      const parsed = profileKeysSchema.safeParse(payload);
      if (!parsed.success) {
        throw new MinecraftUnavailableError('Minecraft returned unexpected profile keys');
      }
      await this.cache.write(key, parsed.data, this.keysTtlSeconds);
      return parsed.data.profilePropertyKeys.map((entry): KeyObject =>
        createPublicKey({
          format: 'der',
          key: Buffer.from(entry.publicKey, 'base64'),
          type: 'spki',
        }),
      );
    } catch (error: unknown) {
      if (cached !== undefined) {
        const stale = this.keysFromCache(cached, true);
        if (stale !== undefined) {
          this.logger?.warn({ errorKind: errorKind(error) }, 'Using stale Minecraft profile keys');
          return stale;
        }
      }
      throw error;
    }
  }

  private keysFromCache(
    cached: CachedValue | undefined,
    includeStale = false,
  ): readonly KeyObject[] | undefined {
    if (cached === undefined || (!includeStale && !this.isFresh(cached))) {
      return undefined;
    }
    const parsed = profileKeysSchema.safeParse(cached.value);
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data.profilePropertyKeys.map((entry): KeyObject =>
      createPublicKey({ format: 'der', key: Buffer.from(entry.publicKey, 'base64'), type: 'spki' }),
    );
  }

  private readFreshProfile(cached: CachedValue | undefined): MinecraftPlayerProfile | undefined {
    if (cached === undefined || !this.isFresh(cached)) {
      return undefined;
    }
    const parsed = cachedProfileSchema.safeParse(cached.value);
    return parsed.success ? { username: parsed.data.username, uuid: parsed.data.uuid } : undefined;
  }

  private readFreshProfileWithSkin(
    cached: CachedValue | undefined,
  ): MinecraftPlayerProfileWithSkin | undefined {
    if (cached === undefined || !this.isFresh(cached)) {
      return undefined;
    }
    const parsed = cachedProfileSchema.safeParse(cached.value);
    return parsed.success ? toProfileWithSkin(parsed.data) : undefined;
  }

  private staleFallback(
    cached: CachedValue | undefined,
    error: unknown,
    operation: string,
  ): MinecraftPlayerProfileWithSkin | undefined {
    if (cached !== undefined && cached.value !== null) {
      const parsed = cachedProfileSchema.safeParse(cached.value);
      if (parsed.success) {
        this.logger?.warn(
          { errorKind: errorKind(error), operation },
          'Using stale Minecraft profile',
        );
        return toProfileWithSkin(parsed.data);
      }
    }
    throw error;
  }

  private isFresh(cached: CachedValue): boolean {
    return Date.now() - cached.fetchedAt <= this.freshTtlMs;
  }

  private async fetchJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: unknown) {
      throw new MinecraftUnavailableError('Minecraft service is unreachable', { cause: error });
    }

    if (response.status === 204 || response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new MinecraftUnavailableError(
        `Minecraft service returned HTTP ${response.status.toString()}`,
      );
    }
    try {
      return await response.json();
    } catch (error: unknown) {
      throw new MinecraftUnavailableError('Minecraft service returned invalid JSON', {
        cause: error,
      });
    }
  }
}

const cachedProfileSchema = z.object({
  textureHash: z.string().optional(),
  username: z.string(),
  uuid: z.string(),
});

type CachedProfile = z.infer<typeof cachedProfileSchema>;

function toProfileWithSkin(profile: CachedProfile): MinecraftPlayerProfileWithSkin {
  return {
    username: profile.username,
    uuid: profile.uuid,
    ...(profile.textureHash === undefined ? {} : { textureHash: profile.textureHash }),
  };
}

function profileFromNamePayload(payload: unknown): MinecraftPlayerProfile | undefined {
  const parsed = nameProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return undefined;
  }
  const uuid = canonicalMinecraftUuid(parsed.data.id);
  return uuid === undefined ? undefined : { uuid, username: parsed.data.name };
}

function textureHashFromValue(value: string): string | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  } catch {
    return undefined;
  }
  const parsed = texturesPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return undefined;
  }
  const url = parsed.data.textures?.SKIN?.url;
  if (url === undefined) {
    return undefined;
  }
  const hash = url.split('/').at(-1);
  return hash !== undefined && TEXTURE_HASH_PATTERN.test(hash) ? hash : undefined;
}

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
