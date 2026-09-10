import type { FastifyInstance } from 'fastify';

import type { MinecraftPlayerLookup } from '../mojang/client.js';
import type { SkinStore } from '../mojang/skin-store.js';
import { avatarRateLimit } from './rate-limit.js';
import { avatarRouteSchema, skinRouteSchema } from './schemas.js';

interface AvatarParams {
  readonly uuid: string;
}

interface SkinParams {
  readonly hash: string;
}

export interface AvatarRoutesOptions {
  readonly players: MinecraftPlayerLookup;
  readonly skins: SkinStore;
}

const PLACEHOLDER_HEAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="#39413b"/><rect width="8" height="3" fill="#2a312c"/><rect x="1.5" y="4" width="1.5" height="1.5" fill="#202622"/><rect x="5" y="4" width="1.5" height="1.5" fill="#202622"/></svg>`;

export function registerAvatarRoutes(server: FastifyInstance, options: AvatarRoutesOptions): void {
  server.get<{ Params: AvatarParams }>(
    '/avatar/:uuid',
    { config: { rateLimit: avatarRateLimit }, schema: avatarRouteSchema },
    async (request, reply): Promise<void> => {
      const profile = await options.players
        .findProfileById(request.params.uuid)
        .catch((): undefined => undefined);
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('image/svg+xml; charset=utf-8').send(renderHeadSvg(profile?.textureHash));
    },
  );

  server.get<{ Params: SkinParams }>(
    '/skin/:hash',
    { config: { rateLimit: avatarRateLimit }, schema: skinRouteSchema },
    async (request, reply): Promise<void> => {
      const image = await options.skins.fetchSkin(request.params.hash);
      if (image === undefined) {
        await reply.status(404).send();
        return;
      }
      void reply.header('cache-control', 'public, max-age=31536000, immutable');
      await reply.type(image.contentType).send(image.body);
    },
  );
}

function renderHeadSvg(textureHash: string | undefined): string {
  if (textureHash === undefined) {
    return PLACEHOLDER_HEAD_SVG;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 8 8" shape-rendering="crispEdges"><defs><clipPath id="head"><rect width="8" height="8"/></clipPath></defs><g clip-path="url(#head)"><image href="/skin/${textureHash}.png" x="-8" y="-8" width="64" height="64" image-rendering="pixelated"/></g><g clip-path="url(#head)"><image href="/skin/${textureHash}.png" x="-40" y="-8" width="64" height="64" image-rendering="pixelated"/></g></svg>`;
}
