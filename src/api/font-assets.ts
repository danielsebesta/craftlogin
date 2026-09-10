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

export const fontFaceStyles = `
@font-face {
  font-display: swap;
  font-family: "Pixeloid Sans";
  font-style: normal;
  font-weight: 400;
  src: url("/assets/fonts/pixeloid-sans-3a54c9da.woff2") format("woff2");
}

@font-face {
  font-display: swap;
  font-family: "Pixeloid Sans";
  font-style: normal;
  font-weight: 700;
  src: url("/assets/fonts/pixeloid-sans-bold-ac1b42f3.woff2") format("woff2");
}

@font-face {
  font-display: swap;
  font-family: "Pixeloid Mono";
  font-style: normal;
  font-weight: 400;
  src: url("/assets/fonts/pixeloid-mono-2f3ecf92.woff2") format("woff2");
}
`;

export const swaggerTypographyStyles = `${fontFaceStyles}
.swagger-ui,
.swagger-ui button,
.swagger-ui input,
.swagger-ui select,
.swagger-ui textarea {
  font-family: "Pixeloid Sans", sans-serif;
}

.swagger-ui .info .title,
.swagger-ui .opblock-tag,
.swagger-ui .opblock .opblock-summary-method,
.swagger-ui h1,
.swagger-ui h2,
.swagger-ui h3,
.swagger-ui h4,
.swagger-ui h5 {
  font-family: "Pixeloid Sans", sans-serif;
  font-weight: 700;
}

.swagger-ui code,
.swagger-ui pre,
.swagger-ui .parameter__name,
.swagger-ui .prop-name,
.swagger-ui .response-col_status {
  font-family: "Pixeloid Mono", monospace;
}
`;

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
