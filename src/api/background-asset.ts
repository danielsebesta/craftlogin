import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { backgroundAssetRouteSchema } from './schemas.js';

const backgroundFileUrl = new URL('../../public/background.svg', import.meta.url);

export function registerBackgroundAssetRoute(server: FastifyInstance): void {
  server.get(
    '/assets/background.svg',
    { schema: backgroundAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      const payload = await readFile(backgroundFileUrl);
      void reply.header('cache-control', 'public, max-age=31536000, immutable');
      await reply.type('image/svg+xml; charset=utf-8').send(payload);
    },
  );
}
