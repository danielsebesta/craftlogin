import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { faviconAssetRouteSchema } from './schemas.js';

interface FaviconAsset {
  readonly contentType:
    | 'application/manifest+json; charset=utf-8'
    | 'image/png'
    | 'image/svg+xml; charset=utf-8'
    | 'image/x-icon';
  readonly fileUrl: URL;
  readonly route: string;
}

const faviconAssets: readonly FaviconAsset[] = [
  {
    contentType: 'image/svg+xml; charset=utf-8',
    fileUrl: new URL('../../public/favicon.svg', import.meta.url),
    route: '/favicon.svg',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/favicon-96x96.png', import.meta.url),
    route: '/favicon-96x96.png',
  },
  {
    contentType: 'image/x-icon',
    fileUrl: new URL('../../public/favicon.ico', import.meta.url),
    route: '/favicon.ico',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/apple-touch-icon.png', import.meta.url),
    route: '/apple-touch-icon.png',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/web-app-manifest-192x192.png', import.meta.url),
    route: '/web-app-manifest-192x192.png',
  },
  {
    contentType: 'image/png',
    fileUrl: new URL('../../public/web-app-manifest-512x512.png', import.meta.url),
    route: '/web-app-manifest-512x512.png',
  },
  {
    contentType: 'application/manifest+json; charset=utf-8',
    fileUrl: new URL('../../public/site.webmanifest', import.meta.url),
    route: '/site.webmanifest',
  },
];

export function registerFaviconAssetRoutes(server: FastifyInstance): void {
  for (const asset of faviconAssets) {
    server.get(
      asset.route,
      { schema: faviconAssetRouteSchema },
      async (_request, reply): Promise<void> => {
        const payload = await readFile(asset.fileUrl);
        void reply.header('cache-control', 'public, max-age=86400');
        await reply.type(asset.contentType).send(payload);
      },
    );
  }
}
