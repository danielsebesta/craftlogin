import type { FastifyInstance } from 'fastify';

import { english } from '../locales/en.js';
import type { AccessTokenAuthenticator } from './access-token-authenticator.js';
import type { CurrentUserLookup } from './current-user.js';
import { ApiError } from './errors.js';
import { currentUserRouteSchema } from './schemas.js';

interface AuthorizationHeaders {
  readonly authorization: string;
}

export function registerUserRoutes(
  server: FastifyInstance,
  accessTokens: AccessTokenAuthenticator,
  users: CurrentUserLookup,
): void {
  server.get<{ Headers: AuthorizationHeaders }>(
    '/api/users/@me',
    { schema: currentUserRouteSchema },
    async (request, reply): Promise<void> => {
      const authentication = await accessTokens.authenticate(request.headers.authorization);
      const user = await users.findCurrentUser(authentication.accountId);
      if (user === undefined) {
        throw new ApiError(401, 'unauthorized', english.api.errors.unauthorized);
      }
      await reply.send(user);
    },
  );
}
