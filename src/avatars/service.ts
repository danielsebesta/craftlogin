import { createHash } from 'node:crypto';

import { getErrorKind } from '../logging/error-kind.js';
import type { CachedValue, MinecraftCache } from '../mojang/cache.js';
import type { MinecraftPlayerLookup, MinecraftSkinTexture } from '../mojang/client.js';
import type { SkinStore } from '../mojang/skin-store.js';
import type { AvatarRenderer } from './renderer.js';
import {
  decodeSkinTexture,
  encodeProcessedSkin,
  inspectSkinPng,
  isPngImage,
} from './skin-texture.js';
import type { AvatarRenderOptions } from './types.js';

const RENDER_CACHE_SECONDS = 24 * 60 * 60;
// Bump whenever the pixel output changes so stale renders are never served.
const RENDERER_VERSION = 'v2';

export interface AvatarImage {
  readonly body: Buffer;
  readonly contentType: 'image/png';
  readonly etag: string;
}

export type AvatarLookupResult =
  | { readonly image: AvatarImage; readonly status: 'found' }
  | { readonly status: 'not-found' }
  | { readonly status: 'unavailable' };

export interface AvatarService {
  findCape(uuid: string): Promise<AvatarLookupResult>;
  findProcessedSkin(uuid: string): Promise<AvatarLookupResult>;
  findRawSkin(uuid: string): Promise<AvatarLookupResult>;
  render(uuid: string, options: AvatarRenderOptions): Promise<AvatarLookupResult>;
}

export interface CachedAvatarServiceOptions {
  readonly cache: MinecraftCache;
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

  public async findRawSkin(uuid: string): Promise<AvatarLookupResult> {
    const source = await this.findSource(uuid);
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

  public async findProcessedSkin(uuid: string): Promise<AvatarLookupResult> {
    const source = await this.findSource(uuid);
    if (source.status !== 'found') {
      return source;
    }
    const cacheKey = `avatar-processed:${source.texture.hash}`;
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

  public async findCape(uuid: string): Promise<AvatarLookupResult> {
    let profile;
    try {
      profile = await this.options.players.findProfileById(uuid);
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-cape');
      return { status: 'unavailable' };
    }
    const cape = profile?.cape;
    if (cape === undefined) {
      return { status: 'not-found' };
    }
    const cacheKey = `avatar-cape:${cape.hash}`;
    const identity = `cape:${cape.hash}`;
    try {
      const body = await this.cachedTexture(cacheKey, async (): Promise<Buffer> => {
        const image = await this.options.skins.fetchSkin(cape.hash);
        if (image === undefined || !isPngImage(image.body)) {
          throw new CapeTextureMissingError('Minecraft cape texture is not available');
        }
        return image.body;
      });
      return foundRenderedImage(body, identity);
    } catch (error: unknown) {
      if (error instanceof CapeTextureMissingError) {
        return { status: 'not-found' };
      }
      this.logFailure(error, 'fetch-cape');
      return { status: 'unavailable' };
    }
  }

  public async render(
    uuid: string,
    renderOptions: AvatarRenderOptions,
  ): Promise<AvatarLookupResult> {
    const requestKey = [
      uuid,
      renderOptions.view,
      renderOptions.layers,
      renderOptions.size.toString(),
    ].join(':');
    const pending = this.inFlightRequests.get(requestKey);
    if (pending !== undefined) {
      return await pending;
    }
    const operation = this.renderForUuid(uuid, renderOptions);
    this.inFlightRequests.set(requestKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlightRequests.get(requestKey) === operation) {
        this.inFlightRequests.delete(requestKey);
      }
    }
  }

  private async renderForUuid(
    uuid: string,
    renderOptions: AvatarRenderOptions,
  ): Promise<AvatarLookupResult> {
    const source = await this.findSource(uuid);
    if (source.status !== 'found') {
      return source;
    }

    const identity = [
      RENDERER_VERSION,
      source.texture.hash,
      source.texture.model,
      renderOptions.view,
      renderOptions.layers,
      renderOptions.size.toString(),
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
    const operation = this.renderAndCache(cacheKey, identity, source, renderOptions);
    this.inFlightRenders.set(cacheKey, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlightRenders.get(cacheKey) === operation) {
        this.inFlightRenders.delete(cacheKey);
      }
    }
  }

  private async findSource(uuid: string): Promise<AvatarSourceResult> {
    try {
      const profile = await this.options.players.findProfileById(uuid);
      if (profile?.texture === undefined) {
        return { status: 'not-found' };
      }
      const image = await this.options.skins.fetchSkin(profile.texture.hash);
      if (image === undefined) {
        return { status: 'not-found' };
      }
      inspectSkinPng(image.body);
      return { body: image.body, status: 'found', texture: profile.texture };
    } catch (error: unknown) {
      this.logFailure(error, 'resolve-skin');
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
  ): Promise<AvatarLookupResult> {
    try {
      const texture = await decodeSkinTexture(source.body);
      const body = await this.options.renderer.render(texture, source.texture.model, renderOptions);
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
