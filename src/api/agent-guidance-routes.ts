import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { avatarLookupScript } from './avatar-lookup-asset.js';
import { promptCopyScript } from './prompt-copy-asset.js';
import { agentGuidanceTextRouteSchema, landingAssetRouteSchema } from './schemas.js';

export function registerAgentGuidanceRoutes(server: FastifyInstance): void {
  for (const [route, script] of [
    ['/assets/prompt-copy.js', promptCopyScript],
    ['/assets/avatar-lookup.js', avatarLookupScript],
  ] as const) {
    server.get(
      route,
      { schema: landingAssetRouteSchema },
      async (_request, reply): Promise<void> => {
        void reply.header('cache-control', 'public, max-age=0, must-revalidate');
        await reply.type('text/javascript; charset=utf-8').send(script);
      },
    );
  }

  registerTextFile(server, '/llms.txt', 'llms.txt', 'text/markdown; charset=utf-8');
  registerTextFile(server, '/llms-full.txt', 'llms-full.txt', 'text/markdown; charset=utf-8');
  registerTextFile(server, '/openapi.yaml', 'openapi.yaml', 'application/yaml; charset=utf-8');
}

function registerTextFile(
  server: FastifyInstance,
  route: string,
  filename: string,
  mediaType: string,
): void {
  // Committed build artifacts: read once per process.
  let cached: string | undefined;
  server.get(
    route,
    { schema: agentGuidanceTextRouteSchema },
    async (_request, reply): Promise<void> => {
      cached ??= await readFile(resolve(process.cwd(), filename), 'utf8');
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type(mediaType).send(cached);
    },
  );
}
