import { createHash } from 'node:crypto';

import { getErrorKind } from '../logging/error-kind.js';
import type { CachedValue, MinecraftCache } from '../mojang/cache.js';
import type { MinecraftPlayerLookup, MinecraftSkinTexture } from '../mojang/client.js';
import {
  isOfflinePlayerUuid,
  offlinePlayerUuid,
  selectDefaultSkin,
  type DefaultSkinSource,
} from '../mojang/default-skins.js';
import { canonicalMinecraftUuid, stripMinecraftUuidDashes } from '../mojang/uuid.js';
import type { SkinStore } from '../mojang/skin-store.js';
import { fetchThirdPartyCape, type PlayerIdentityForCapes } from './cape-providers.js';
import type { AvatarRenderer } from './renderer.js';
import {
  decodeSkinTexture,
  decodeTexturePixels,
  encodeProcessedSkin,
  inspectSkinPng,
  InvalidSkinImageError,
  isBoundedTexturePng,
  type TexturePixels,
} from './skin-texture.js';
import { parseAvatarSubject } from './subject.js';
import {
  SPECIFIC_CAPE_PROVIDERS,
  type AvatarRenderOptions,
  type AvatarView,
  type CapeProvider,
  type MinecraftSkinModel,
  type SpecificCapeProvider,
} from './types.js';

const RENDER_CACHE_SECONDS = 24 * 60 * 60;
const CAPE_CACHE_SECONDS = 60 * 60;
const CAPE_MISSING_CACHE_SECONDS = 10 * 60;
// Bump whenever the pixel output changes so stale renders are never served.
const RENDERER_VERSION = 'v17';
// Views that show the worn cape must key it into the render cache identity.
const CAPE_RENDER_VIEWS = new Set<AvatarView>(['back', 'duo', 'wings']);

export interface AvatarImage {
  readonly body: Buffer;
  readonly contentType: 'image/png';
  readonly etag: string;
}

export type AvatarLookupResult =
  | { readonly image: AvatarImage; readonly status: 'found' }
  | { readonly status: 'not-found' }
  | { readonly status: 'unavailable' };

export interface CapeLookupOptions {
  readonly provider?: CapeProvider | undefined;
}

export interface PlayerCapeStatus {
  readonly available: boolean;
  readonly url?: string;
}

export interface PlayerCapesSummary {
  readonly capes: Record<SpecificCapeProvider, PlayerCapeStatus>;
  readonly username: string;
  readonly uuid: string;
}

export type PlayerCapesLookupResult =
  | { readonly data: PlayerCapesSummary; readonly status: 'found' }
  | { readonly status: 'not-found' }
  | { readonly status: 'unavailable' };

export interface AvatarService {
  findAvailableCapes(subject: string): Promise<PlayerCapesLookupResult>;
  findCape(subject: string, options?: CapeLookupOptions): Promise<AvatarLookupResult>;
  findProcessedSkin(subject: string): Promise<AvatarLookupResult>;
  findRawSkin(subject: string): Promise<AvatarLookupResult>;
  render(subject: string, options: AvatarRenderOptions): Promise<AvatarLookupResult>;
}

export interface CachedAvatarServiceOptions {
  readonly cache: MinecraftCache;
  readonly defaultSkins: DefaultSkinSource;
  readonly fetch?: typeof globalThis.fetch;
  readonly logger?: AvatarLogger;
  readonly players: MinecraftPlayerLookup;
  readonly renderer: AvatarRenderer;
  readonly skins: SkinStore;
}

export interface AvatarLogger {
  warn(details: Record<string, unknown>, message: string): void;
}

export class CachedAvatarService implements AvatarService {
  private readonly inFlightRenders = new Map<string, Promise<AvatarLookupResult>>();
  private readonly inFlightRequests = new Map<string, Promise<AvatarLookupResult>>();
  private readonly inFlightTextures = new Map<string, Promise<Buffer>>();

  public constructor(private readonly options: CachedAvatarServiceOptions) {}

  public async findRawSkin(subject: string): Promise<AvatarLookupResult> {
    const source = await this.findSource(subject);
    if (source.status !== 'found') {
      return source;
    }
    try {
      await decodeSkinTexture(source.body);
    } catch (error: unknown) {
      this.logFailure(error, 'decode-raw-skin');
      return { status: 'unavailable' };
    }
    return {
      image: {
        body: source.body,
        contentType: 'image/png',
        etag: createEntityTag(`skin:${source.texture.hash}`),
      },
      status: 'found',
    };
  }

  public async findProcessedSkin(subject: string): Promise<AvatarLookupResult> {
    const source = await this.findSource(subject);
    if (source.status !== 'found') {
      return source;
    }
    const cacheKey = `avatar-processed:${RENDERER_VERSION}:${source.texture.hash}`;
    const identity = `processed:${source.texture.hash}`;
    try {
      const body = await this.cachedTexture(cacheKey, async (): Promise<Buffer> => {
        const texture = await decodeSkinTexture(source.body);
        return await encodeProcessedSkin(texture);
      });
      return foundRenderedImage(body, identity);
    } catch (error: unknown) {
      this.logFailure(error, 'process-skin');
      return { status: 'unavailable' };
    }
  }

  public async findCape(
    subject: string,
    options: CapeLookupOptions = {},
  ): Promise<AvatarLookupResult> {
    let canonical: string | undefined;
    try {
      canonical = await this.resolveCapeUuid(subject);
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-cape-subject');
      return { status: 'unavailable' };
    }
    if (canonical === undefined) {
      return { status: 'not-found' };
    }
    const provider = options.provider ?? 'any';
    const requestKey = `cape:${canonical}:${provider}`;
    const pending = this.inFlightRequests.get(requestKey);
    if (pending !== undefined) {
      return await pending;
    }
    const operation = this.resolveCape(canonical, provider);
    this.inFlightRequests.set(requestKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlightRequests.get(requestKey) === operation) {
        this.inFlightRequests.delete(requestKey);
      }
    }
  }

  public async findAvailableCapes(subject: string): Promise<PlayerCapesLookupResult> {
    let canonical: string | undefined;
    try {
      canonical = await this.resolveCapeUuid(subject);
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-cape-subject');
      return { status: 'unavailable' };
    }
    if (canonical === undefined) {
      return { status: 'not-found' };
    }
    let profile;
    try {
      profile = await this.options.players.findProfileById(canonical);
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-capes-overview');
      return { status: 'unavailable' };
    }
    if (profile === undefined) {
      return { status: 'not-found' };
    }

    const identity: PlayerIdentityForCapes = {
      canonicalUuid: canonical,
      undashedUuid: stripMinecraftUuidDashes(canonical),
      username: profile.username,
    };

    const results = await Promise.all(
      SPECIFIC_CAPE_PROVIDERS.map(async (candidate): Promise<[SpecificCapeProvider, boolean]> => {
        const res = await this.resolveSpecificCape(profile, identity, candidate);
        return [candidate, res.status === 'found'];
      }),
    );

    const capes: Record<SpecificCapeProvider, PlayerCapeStatus> = {
      '5zig': { available: false },
      labymod: { available: false },
      minecraftcapes: { available: false },
      mojang: { available: false },
      optifine: { available: false },
      skinmc: { available: false },
    };

    for (const [candidate, available] of results) {
      capes[candidate] = {
        available,
        ...(available ? { url: `/api/avatars/${canonical}/cape?provider=${candidate}` } : {}),
      };
    }

    return {
      data: {
        capes,
        username: profile.username,
        uuid: canonical,
      },
      status: 'found',
    };
  }

  private async resolveCape(
    canonical: string,
    provider: CapeProvider,
  ): Promise<AvatarLookupResult> {
    let profile;
    try {
      profile = await this.options.players.findProfileById(canonical);
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-cape');
      return { status: 'unavailable' };
    }
    if (profile === undefined) {
      return { status: 'not-found' };
    }

    const identity: PlayerIdentityForCapes = {
      canonicalUuid: canonical,
      undashedUuid: stripMinecraftUuidDashes(canonical),
      username: profile.username,
    };

    if (provider === 'any') {
      for (const candidate of SPECIFIC_CAPE_PROVIDERS) {
        const result = await this.resolveSpecificCape(profile, identity, candidate);
        if (result.status === 'found' || result.status === 'unavailable') {
          return result;
        }
      }
      return { status: 'not-found' };
    }

    return await this.resolveSpecificCape(profile, identity, provider);
  }

  private async resolveSpecificCape(
    profile: NonNullable<Awaited<ReturnType<MinecraftPlayerLookup['findProfileById']>>>,
    identity: PlayerIdentityForCapes,
    provider: SpecificCapeProvider,
  ): Promise<AvatarLookupResult> {
    if (provider === 'mojang') {
      const cape = profile.cape;
      if (cape === undefined) {
        return { status: 'not-found' };
      }
      const cacheKey = `avatar-cape:${cape.hash}`;
      const identityKey = `cape:${cape.hash}`;
      try {
        const body = await this.cachedTexture(cacheKey, async (): Promise<Buffer> => {
          const image = await this.options.skins.fetchSkin(cape.hash);
          if (image === undefined || !isBoundedTexturePng(image.body)) {
            throw new CapeTextureMissingError('Minecraft cape texture is not available');
          }
          return image.body;
        });
        return foundRenderedImage(body, identityKey);
      } catch (error: unknown) {
        if (error instanceof CapeTextureMissingError) {
          return { status: 'not-found' };
        }
        this.logFailure(error, 'fetch-cape');
        return { status: 'unavailable' };
      }
    }

    const result = await this.thirdPartyCapeBody(identity, provider);
    if (result.status !== 'found') {
      return { status: result.status === 'failed' ? 'unavailable' : 'not-found' };
    }
    return foundRenderedImage(result.body, `cape:${provider}:${identity.canonicalUuid}`);
  }

  public async render(
    subject: string,
    renderOptions: AvatarRenderOptions,
  ): Promise<AvatarLookupResult> {
    const requestKey = [
      subject.toLowerCase(),
      renderOptions.view,
      renderOptions.layers,
      renderOptions.size.toString(),
      renderOptions.model ?? '',
      renderOptions.capeProvider ?? '',
    ].join(':');
    const pending = this.inFlightRequests.get(requestKey);
    if (pending !== undefined) {
      return await pending;
    }
    const operation = this.renderForSubject(subject, renderOptions);
    this.inFlightRequests.set(requestKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlightRequests.get(requestKey) === operation) {
        this.inFlightRequests.delete(requestKey);
      }
    }
  }

  private async renderForSubject(
    subject: string,
    renderOptions: AvatarRenderOptions,
  ): Promise<AvatarLookupResult> {
    const source = await this.findSource(subject, renderOptions.model);
    if (source.status !== 'found') {
      return source;
    }

    const cape = await this.resolveRenderCape(
      source,
      renderOptions.view,
      renderOptions.capeProvider ?? 'any',
    );
    const identity = [
      RENDERER_VERSION,
      source.texture.hash,
      source.texture.model,
      renderOptions.view,
      renderOptions.layers,
      renderOptions.size.toString(),
      ...(CAPE_RENDER_VIEWS.has(renderOptions.view) ? [cape?.identity ?? 'none'] : []),
    ].join(':');
    const cacheKey = `avatar-render:${identity}`;
    let cached: CachedValue | undefined;
    try {
      cached = await this.options.cache.read(cacheKey);
    } catch (error: unknown) {
      this.logFailure(error, 'read-render-cache');
    }
    const cachedBody = cachedImageBody(cached?.value);
    if (cachedBody !== undefined) {
      return foundRenderedImage(cachedBody, identity);
    }

    const pending = this.inFlightRenders.get(cacheKey);
    if (pending !== undefined) {
      return await pending;
    }
    const operation = this.renderAndCache(cacheKey, identity, source, renderOptions, cape?.body);
    this.inFlightRenders.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlightRenders.get(cacheKey) === operation) {
        this.inFlightRenders.delete(cacheKey);
      }
    }
  }

  private async findSource(
    subject: string,
    model?: MinecraftSkinModel,
  ): Promise<AvatarSourceResult> {
    const parsed = parseAvatarSubject(subject);
    if (parsed === undefined) {
      return { status: 'not-found' };
    }
    if (parsed.kind === 'texture') {
      return await this.findTextureSource(parsed.hash, model ?? 'classic');
    }

    let uuid: string;
    let signedProfile: boolean;
    try {
      if (parsed.kind === 'name') {
        const named = await this.options.players.findProfileByName(parsed.username);
        // Unregistered names render as their deterministic offline-mode identity.
        uuid = named?.uuid ?? offlinePlayerUuid(parsed.username);
        signedProfile = named !== undefined;
      } else {
        uuid = parsed.uuid;
        // Version-3 UUIDs are offline-mode name hashes; Mojang accounts are always v4.
        signedProfile = !isOfflinePlayerUuid(uuid);
      }
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-subject');
      return { status: 'unavailable' };
    }

    let capeInfo:
      { readonly hash?: string; readonly identity?: PlayerIdentityForCapes } | undefined;
    if (signedProfile) {
      try {
        const profile = await this.options.players.findProfileById(uuid);
        const canonical = canonicalMinecraftUuid(uuid);
        if (profile !== undefined && canonical !== undefined) {
          capeInfo = {
            identity: {
              canonicalUuid: canonical,
              undashedUuid: stripMinecraftUuidDashes(canonical),
              username: profile.username,
            },
            ...(profile.cape !== undefined ? { hash: profile.cape.hash } : {}),
          };
        }
        if (profile?.texture !== undefined) {
          const image = await this.options.skins.fetchSkin(profile.texture.hash);
          if (image !== undefined) {
            inspectSkinPng(image.body);
            return {
              body: image.body,
              ...(profile.cape !== undefined ? { capeHash: profile.cape.hash } : {}),
              ...(capeInfo?.identity !== undefined ? { capeIdentity: capeInfo.identity } : {}),
              status: 'found',
              texture: profile.texture,
            };
          }
        }
      } catch (error: unknown) {
        this.logFailure(error, 'resolve-skin');
        return { status: 'unavailable' };
      }
    }
    const fallback = await this.findDefaultSource(uuid);
    // Some accounts own capes while wearing no custom skin, so cape info survives the fallback.
    return fallback.status === 'found' && capeInfo !== undefined
      ? {
          ...fallback,
          ...(capeInfo.hash !== undefined ? { capeHash: capeInfo.hash } : {}),
          ...(capeInfo.identity !== undefined ? { capeIdentity: capeInfo.identity } : {}),
        }
      : fallback;
  }

  private async findTextureSource(
    hash: string,
    model: MinecraftSkinModel,
  ): Promise<AvatarSourceResult> {
    try {
      const image = await this.options.skins.fetchSkin(hash);
      if (image === undefined) {
        return { status: 'not-found' };
      }
      inspectSkinPng(image.body);
      return { body: image.body, status: 'found', texture: { hash, model } };
    } catch (error: unknown) {
      // A texture hash can point at a non-skin texture (e.g. a cape) — a missing
      // subject, not an upstream failure.
      if (error instanceof InvalidSkinImageError) {
        return { status: 'not-found' };
      }
      this.logFailure(error, 'resolve-texture');
      return { status: 'unavailable' };
    }
  }

  // Capes exist only on signed Mojang profiles.
  private async resolveCapeUuid(subject: string): Promise<string | undefined> {
    const parsed = parseAvatarSubject(subject);
    if (parsed === undefined || parsed.kind === 'texture') {
      return undefined;
    }
    if (parsed.kind === 'uuid') {
      return isOfflinePlayerUuid(parsed.uuid) ? undefined : parsed.uuid;
    }
    return (await this.options.players.findProfileByName(parsed.username))?.uuid;
  }

  private async findDefaultSource(uuid: string): Promise<AvatarSourceResult> {
    // Players without a Mojang texture get a deterministic vanilla default skin;
    // transient upstream failures above return unavailable, never a default.
    const canonical = canonicalMinecraftUuid(uuid);
    if (canonical === undefined) {
      return { status: 'not-found' };
    }
    const skin = selectDefaultSkin(canonical);
    try {
      const body = await this.options.defaultSkins.fetchDefaultSkin(skin);
      if (body === undefined) {
        this.logFailure(
          new Error(`Default skin asset is missing: ${skin.name}`),
          'fetch-default-skin',
        );
        return { status: 'unavailable' };
      }
      inspectSkinPng(body);
      return {
        body,
        status: 'found',
        texture: { hash: `default:${skin.name}`, model: skin.model },
      };
    } catch (error: unknown) {
      this.logFailure(error, 'fetch-default-skin');
      return { status: 'unavailable' };
    }
  }

  private async cachedTexture(cacheKey: string, compute: () => Promise<Buffer>): Promise<Buffer> {
    try {
      const cached = await this.options.cache.read(cacheKey);
      const cachedBody = cachedImageBody(cached?.value);
      if (cachedBody !== undefined) {
        return cachedBody;
      }
    } catch (error: unknown) {
      this.logFailure(error, 'read-texture-cache');
    }

    const pending = this.inFlightTextures.get(cacheKey);
    if (pending !== undefined) {
      return await pending;
    }
    const operation = this.computeAndCacheTexture(cacheKey, compute);
    this.inFlightTextures.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlightTextures.get(cacheKey) === operation) {
        this.inFlightTextures.delete(cacheKey);
      }
    }
  }

  private async computeAndCacheTexture(
    cacheKey: string,
    compute: () => Promise<Buffer>,
  ): Promise<Buffer> {
    const body = await compute();
    try {
      await this.options.cache.write(cacheKey, body.toString('base64'), RENDER_CACHE_SECONDS);
    } catch (error: unknown) {
      this.logFailure(error, 'write-texture-cache');
    }
    return body;
  }

  private async renderAndCache(
    cacheKey: string,
    identity: string,
    source: AvatarSource,
    renderOptions: AvatarRenderOptions,
    capeBody: Buffer | undefined,
  ): Promise<AvatarLookupResult> {
    try {
      let capePixels: TexturePixels | undefined;
      if (capeBody !== undefined) {
        try {
          capePixels = await decodeTexturePixels(capeBody);
        } catch (error: unknown) {
          // A corrupt or non-PNG provider body degrades to a plain render.
          this.logFailure(error, 'decode-cape-texture');
        }
      }
      const texture = await decodeSkinTexture(source.body);
      const body = await this.options.renderer.render(
        texture,
        source.texture.model,
        renderOptions,
        capePixels,
      );
      try {
        await this.options.cache.write(cacheKey, body.toString('base64'), RENDER_CACHE_SECONDS);
      } catch (error: unknown) {
        this.logFailure(error, 'write-render-cache');
      }
      return foundRenderedImage(body, identity);
    } catch (error: unknown) {
      this.logFailure(error, 'render-avatar');
      return { status: 'unavailable' };
    }
  }

  // A provider failure surfaces as a miss so a broken upstream never blocks a skin render.
  private async thirdPartyCapeBody(
    identity: PlayerIdentityForCapes,
    provider: Exclude<SpecificCapeProvider, 'mojang'>,
  ): Promise<
    { readonly body: Buffer; readonly status: 'found' } | { readonly status: 'failed' | 'missing' }
  > {
    const cacheKey = `avatar-cape:${provider}:${identity.canonicalUuid}`;
    const missingKey = `avatar-cape-miss:${provider}:${identity.canonicalUuid}`;

    try {
      const missing = await this.options.cache.read(missingKey);
      if (missing?.value !== undefined) {
        return { status: 'missing' };
      }
      const cached = await this.options.cache.read(cacheKey);
      const cachedBody = cachedImageBody(cached?.value);
      // Cached entries predate the dimension bound; an oversized texture is a miss.
      if (cachedBody !== undefined && isBoundedTexturePng(cachedBody)) {
        return { body: cachedBody, status: 'found' };
      }
    } catch (error: unknown) {
      this.logFailure(error, `read-${provider}-cape-cache`);
    }

    let body: Buffer | undefined;
    try {
      body = await fetchThirdPartyCape(provider, identity, this.options.fetch);
    } catch (error: unknown) {
      this.logFailure(error, `fetch-${provider}-cape`);
      return { status: 'failed' };
    }

    if (body === undefined) {
      try {
        await this.options.cache.write(missingKey, '1', CAPE_MISSING_CACHE_SECONDS);
      } catch (error: unknown) {
        this.logFailure(error, `write-${provider}-cape-missing-cache`);
      }
      return { status: 'missing' };
    }

    try {
      await this.options.cache.write(cacheKey, body.toString('base64'), CAPE_CACHE_SECONDS);
    } catch (error: unknown) {
      this.logFailure(error, `write-${provider}-cape-cache`);
    }

    return { body, status: 'found' };
  }

  // 'any' resolves providers in priority order so the official Mojang cape wins when it exists.
  private async resolveRenderCape(
    source: AvatarSource,
    view: AvatarView,
    provider: CapeProvider,
  ): Promise<{ readonly body: Buffer; readonly identity: string } | undefined> {
    if (!CAPE_RENDER_VIEWS.has(view)) {
      return undefined;
    }
    if (provider !== 'any') {
      return await this.renderCapeForProvider(source, provider);
    }
    // The Mojang cape rides on the resolved profile, so it wins without an upstream call.
    const mojang = await this.renderCapeForProvider(source, 'mojang');
    if (mojang !== undefined) {
      return mojang;
    }
    if (source.capeIdentity === undefined) {
      return undefined;
    }
    const thirdParty = SPECIFIC_CAPE_PROVIDERS.filter(
      (candidate): candidate is Exclude<SpecificCapeProvider, 'mojang'> => candidate !== 'mojang',
    );
    const results = await Promise.all(
      thirdParty.map((candidate) => this.renderCapeForProvider(source, candidate)),
    );
    return results.find((result) => result !== undefined);
  }

  private async renderCapeForProvider(
    source: AvatarSource,
    provider: SpecificCapeProvider,
  ): Promise<{ readonly body: Buffer; readonly identity: string } | undefined> {
    let body: Buffer | undefined;
    let key: string | undefined;
    if (provider === 'mojang') {
      if (source.capeHash === undefined) {
        return undefined;
      }
      const capeHash = source.capeHash;
      try {
        body = await this.cachedTexture(`avatar-cape:${capeHash}`, async (): Promise<Buffer> => {
          const image = await this.options.skins.fetchSkin(capeHash);
          if (image === undefined || !isBoundedTexturePng(image.body)) {
            throw new CapeTextureMissingError('Minecraft cape texture is not available');
          }
          return image.body;
        });
        key = capeHash;
      } catch (error: unknown) {
        // A cape is decoration: failures degrade to a plain render.
        if (!(error instanceof CapeTextureMissingError)) {
          this.logFailure(error, 'fetch-mojang-cape');
        }
      }
    } else if (source.capeIdentity !== undefined) {
      const fetched = await this.thirdPartyCapeBody(source.capeIdentity, provider);
      if (fetched.status === 'found') {
        body = fetched.body;
        key = createHash('sha256').update(body).digest('base64url');
      }
    }
    if (body === undefined || key === undefined) {
      return undefined;
    }
    return { body, identity: `${provider}:${key}` };
  }

  private logFailure(error: unknown, operation: string): void {
    this.options.logger?.warn(
      { errorKind: getErrorKind(error), operation },
      'Avatar image operation failed',
    );
  }
}

class CapeTextureMissingError extends Error {
  public override readonly name = 'CapeTextureMissingError';
}

interface AvatarSource {
  readonly body: Buffer;
  readonly capeHash?: string;
  readonly capeIdentity?: PlayerIdentityForCapes;
  readonly status: 'found';
  readonly texture: MinecraftSkinTexture;
}

type AvatarSourceResult =
  AvatarSource | { readonly status: 'not-found' } | { readonly status: 'unavailable' };

function foundRenderedImage(body: Buffer, identity: string): AvatarLookupResult {
  return {
    image: { body, contentType: 'image/png', etag: createEntityTag(identity) },
    status: 'found',
  };
}

function createEntityTag(identity: string): string {
  return `"${createHash('sha256').update(identity).digest('base64url')}"`;
}

function cachedImageBody(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  const body = Buffer.from(value, 'base64');
  return body.length === 0 ? undefined : body;
}
