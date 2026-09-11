import { createHash } from 'node:crypto';

import { getErrorKind } from '../logging/error-kind.js';
import type { CachedValue, MinecraftCache } from '../mojang/cache.js';
import type { MinecraftPlayerLookup, MinecraftSkinTexture } from '../mojang/client.js';
import type { SkinStore } from '../mojang/skin-store.js';
import type { AvatarRenderer } from './renderer.js';
import { decodeSkinTexture, inspectSkinPng } from './skin-texture.js';
import type { AvatarRenderOptions } from './types.js';

const RENDER_CACHE_SECONDS = 24 * 60 * 60;
const RENDERER_VERSION = 'v1';

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
