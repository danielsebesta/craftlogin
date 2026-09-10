import type { FastifyInstance } from 'fastify';

import type { AppManager } from '../developers/app-management.js';
import { english } from '../locales/en.js';
import type { AppRegistrar, AppRegistrationInput } from './app-registration.js';
import type { DeveloperAuthentication } from './developer-authentication.js';
import { ApiError } from './errors.js';
import { appRegistrationRateLimit } from './rate-limit.js';
import { appDeleteRouteSchema, appListRouteSchema, appRegistrationRouteSchema } from './schemas.js';

interface AppRegistrationBody {
  readonly clientType: 'confidential' | 'public';
  readonly name: string;
  readonly redirectUris: string[];
}

interface AppDeleteParams {
  readonly id: string;
}

interface CsrfHeaders {
  readonly 'x-csrf-token': string;
}

export function registerAppRoutes(
  server: FastifyInstance,
  apps: AppRegistrar,
  appManager: AppManager,
  authentication: DeveloperAuthentication,
): void {
  server.get('/api/apps', { schema: appListRouteSchema }, async (request, reply): Promise<void> => {
    const session = await authentication.require(request, reply);
    void reply.header('cache-control', 'no-store');
    await reply.send(await appManager.list(session.userUuid, session.role));
  });

  server.post<{ Body: AppRegistrationBody; Headers: CsrfHeaders }>(
    '/api/apps',
    { config: { rateLimit: appRegistrationRateLimit }, schema: appRegistrationRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await authentication.require(request, reply);
      authentication.requireCsrf(session, request.headers['x-csrf-token']);
      const input: AppRegistrationInput = {
        clientType: request.body.clientType,
        name: request.body.name,
        redirectUris: request.body.redirectUris,
      };
      const app = await apps.register(input, session.userUuid);
      void reply.header('cache-control', 'no-store');
      await reply.status(201).send(app);
    },
  );

  server.delete<{ Headers: CsrfHeaders; Params: AppDeleteParams }>(
    '/api/apps/:id',
    { schema: appDeleteRouteSchema },
    async (request, reply): Promise<void> => {
      const session = await authentication.require(request, reply);
      authentication.requireCsrf(session, request.headers['x-csrf-token']);
      if (!(await appManager.remove(request.params.id, session.userUuid, session.role))) {
        throw new ApiError(404, 'not_found', english.api.errors.appNotFound);
      }
      void reply.header('cache-control', 'no-store');
      await reply.status(204).send();
    },
  );
}
