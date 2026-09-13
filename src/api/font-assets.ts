import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { fontAssetRouteSchema } from './schemas.js';

interface FontAsset {
  readonly cacheControl: string;
  readonly contentType: 'font/woff2' | 'text/plain; charset=utf-8';
  readonly fileUrl: URL;
  readonly route: string;
}

const fontAssets: readonly FontAsset[] = [
  {
    cacheControl: 'public, max-age=31536000, immutable',
    contentType: 'font/woff2',
    fileUrl: new URL('../../public/fonts/pixeloid-sans-3a54c9da.woff2', import.meta.url),
    route: '/assets/fonts/pixeloid-sans-3a54c9da.woff2',
  },
  {
    cacheControl: 'public, max-age=31536000, immutable',
    contentType: 'font/woff2',
    fileUrl: new URL('../../public/fonts/pixeloid-sans-bold-ac1b42f3.woff2', import.meta.url),
    route: '/assets/fonts/pixeloid-sans-bold-ac1b42f3.woff2',
  },
  {
    cacheControl: 'public, max-age=31536000, immutable',
    contentType: 'font/woff2',
    fileUrl: new URL('../../public/fonts/pixeloid-mono-2f3ecf92.woff2', import.meta.url),
    route: '/assets/fonts/pixeloid-mono-2f3ecf92.woff2',
  },
  {
    cacheControl: 'public, max-age=3600',
    contentType: 'text/plain; charset=utf-8',
    fileUrl: new URL('../../public/fonts/OFL.txt', import.meta.url),
    route: '/assets/fonts/OFL.txt',
  },
];

export function registerFontAssetRoutes(server: FastifyInstance): void {
  for (const asset of fontAssets) {
    server.get(
      asset.route,
      { schema: fontAssetRouteSchema },
      async (_request, reply): Promise<void> => {
        const payload = await readFile(asset.fileUrl);
        void reply.header('cache-control', asset.cacheControl);
        await reply.type(asset.contentType).send(payload);
      },
    );
  }
}
