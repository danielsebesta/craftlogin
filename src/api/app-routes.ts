import type { FastifyInstance } from 'fastify';

import type { AppRegistrar, AppRegistrationInput } from './app-registration.js';
import { appRegistrationRateLimit } from './rate-limit.js';
import { appRegistrationRouteSchema } from './schemas.js';

interface AppRegistrationBody {
  readonly clientType: 'confidential' | 'public';
  readonly name: string;
  readonly redirectUris: string[];
}

export function registerAppRoutes(server: FastifyInstance, apps: AppRegistrar): void {
  server.post<{ Body: AppRegistrationBody }>(
    '/api/apps',
    { config: { rateLimit: appRegistrationRateLimit }, schema: appRegistrationRouteSchema },
    async (request, reply): Promise<void> => {
      const input: AppRegistrationInput = {
        clientType: request.body.clientType,
        name: request.body.name,
        redirectUris: request.body.redirectUris,
      };
      const app = await apps.register(input);
      void reply.header('cache-control', 'no-store');
      await reply.status(201).send(app);
    },
  );
}
