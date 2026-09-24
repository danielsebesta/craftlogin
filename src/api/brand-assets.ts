import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { brandAssetRouteSchema } from './schemas.js';

interface BrandAsset {
  readonly contentType: 'image/png' | 'image/webp';
  readonly fileUrl: URL;
  readonly route: string;
}

const brandAssets: readonly BrandAsset[] = [
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/brand-wordmark.png', import.meta.url),
    route: '/assets/brand-wordmark.png',
  },
  {
    contentType: 'image/webp',
    fileUrl: new URL('../../public/brand-wordmark.webp', import.meta.url),
    route: '/assets/brand-wordmark.webp',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/brand-wordmark-2x.png', import.meta.url),
    route: '/assets/brand-wordmark-2x.png',
  },
  {
    contentType: 'image/webp',
    fileUrl: new URL('../../public/brand-wordmark-2x.webp', import.meta.url),
    route: '/assets/brand-wordmark-2x.webp',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/craftlogin-title.png', import.meta.url),
    route: '/assets/craftlogin-title.png',
  },
  {
    contentType: 'image/webp',
    fileUrl: new URL('../../public/craftlogin-title.webp', import.meta.url),
    route: '/assets/craftlogin-title.webp',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/craftlogin-title-2x.png', import.meta.url),
    route: '/assets/craftlogin-title-2x.png',
  },
  {
    contentType: 'image/webp',
    fileUrl: new URL('../../public/craftlogin-title-2x.webp', import.meta.url),
    route: '/assets/craftlogin-title-2x.webp',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/craftlogin-title-master.png', import.meta.url),
    route: '/assets/craftlogin-title-master.png',
  },
  {
    contentType: 'image/webp',
    fileUrl: new URL('../../public/craftlogin-title-master.webp', import.meta.url),
    route: '/assets/craftlogin-title-master.webp',
  },
];

export function registerBrandAssetRoutes(server: FastifyInstance): void {
  for (const asset of brandAssets) {
    server.get(
      asset.route,
      { schema: brandAssetRouteSchema },
      async (_request, reply): Promise<void> => {
        const payload = await readFile(asset.fileUrl);
        void reply.header('cache-control', 'public, max-age=31536000, immutable');
        await reply.type(asset.contentType).send(payload);
      },
    );
  }
}
