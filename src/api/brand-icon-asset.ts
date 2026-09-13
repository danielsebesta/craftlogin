import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { brandIconRouteSchema } from './schemas.js';

interface BrandIconAsset {
  readonly contentType: 'image/png' | 'image/svg+xml';
  readonly fileUrl: URL;
  readonly route: string;
}

/**
 * One brand mark for the browser tab, the page header, and the Minecraft server list.
 * The raster copy is the same file the ghost server advertises in its status ping.
 */
const brandIconAssets: readonly BrandIconAsset[] = [
  {
    contentType: 'image/svg+xml',
    fileUrl: new URL('../../public/icon.svg', import.meta.url),
    route: '/assets/icon.svg',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/server-icon.png', import.meta.url),
    route: '/assets/icon.png',
  },
];

export const BRAND_ICON_ROUTE = brandIconAssets[0]?.route ?? '/assets/icon.svg';

export function registerBrandIconAssetRoutes(server: FastifyInstance): void {
  for (const asset of brandIconAssets) {
    server.get(
      asset.route,
      { schema: brandIconRouteSchema },
      async (_request, reply): Promise<void> => {
        const payload = await readFile(asset.fileUrl);
        void reply.header('cache-control', 'public, max-age=31536000, immutable');
        await reply.type(`${asset.contentType}; charset=utf-8`).send(payload);
      },
    );
  }
}
