import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import { appAvatarAssetRouteSchema } from './schemas.js';

const appAvatarFileUrl = new URL('../../public/app-avatar.jpg', import.meta.url);

export function registerAppAvatarAssetRoute(server: FastifyInstance): void {
  server.get(
    '/assets/app-avatar.jpg',
    { schema: appAvatarAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      const payload = await readFile(appAvatarFileUrl);
      void reply.header('cache-control', 'public, max-age=31536000, immutable');
      await reply.type('image/jpeg').send(payload);
    },
  );
}
