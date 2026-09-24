import type { FastifyInstance } from 'fastify';

import type { AppIconStore } from '../developers/app-icon-store.js';
import { english } from '../locales/en.js';
import { ApiError } from './errors.js';
import { appIconReadRateLimit } from './rate-limit.js';
import { appIconRouteSchema } from './schemas.js';

export interface AppIconRoutesOptions {
  readonly icons: AppIconStore;
}

export function registerAppIconRoutes(
  server: FastifyInstance,
  options: AppIconRoutesOptions,
): void {
  server.get<{ Params: { clientId: string }; Querystring: { v?: string } }>(
    '/api/apps/:clientId/icon',
    { config: { rateLimit: appIconReadRateLimit }, schema: appIconRouteSchema },
    async (request, reply): Promise<void> => {
      const icon = await options.icons.findIcon(request.params.clientId);
      if (icon === undefined) {
        throw new ApiError(404, 'not_found', english.api.errors.notFound);
      }

      const etag = `"${icon.hash}"`;
      // A versioned URL is immutable; the bare URL revalidates so an icon change
      // is visible immediately wherever the page does not carry the version.
      void reply.headers({
        'cache-control':
          request.query.v === icon.hash
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=0, must-revalidate',
        etag,
      });
      if (request.headers['if-none-match'] === etag) {
        await reply.status(304).send();
        return;
      }
      await reply.type('image/png').send(icon.data);
    },
  );
}
