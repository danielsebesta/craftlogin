import type { FastifyInstance } from 'fastify';

import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import type { MinecraftPlayerLookup, MinecraftPlayerProfile } from '../mojang/client.js';
import { canonicalMinecraftUuid } from '../mojang/uuid.js';
import type { AccessTokenAuthenticator } from './access-token-authenticator.js';
import type { CurrentUserLookup } from './current-user.js';
import { ApiError } from './errors.js';
import { playerProfileRateLimit } from './rate-limit.js';
import {
  currentUserRouteSchema,
  playerProfilePreflightRouteSchema,
  playerProfileRouteSchema,
} from './schemas.js';

const PUBLIC_PROFILE_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
const PUBLIC_PROFILE_CORS = {
  credentials: false,
  methods: ['GET'],
  origin: '*',
};

interface AuthorizationHeaders {
  readonly authorization: string;
}

interface PlayerProfileParams {
  readonly identifier: string;
}

export function registerUserRoutes(
  server: FastifyInstance,
  accessTokens: AccessTokenAuthenticator,
  users: CurrentUserLookup,
  players?: MinecraftPlayerLookup,
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

  if (players === undefined) {
    return;
  }

  server.options<{ Params: PlayerProfileParams }>(
    '/api/users/:identifier',
    { config: { cors: PUBLIC_PROFILE_CORS }, schema: playerProfilePreflightRouteSchema },
    async (_request, reply): Promise<void> => {
      await reply.status(204).send();
    },
  );

  server.get<{ Params: PlayerProfileParams }>(
    '/api/users/:identifier',
    {
      config: { cors: PUBLIC_PROFILE_CORS, rateLimit: playerProfileRateLimit },
      schema: playerProfileRouteSchema,
    },
    async (request, reply): Promise<void> => {
      let profile: MinecraftPlayerProfile | undefined;
      try {
        const uuid = canonicalMinecraftUuid(request.params.identifier);
        profile =
          uuid === undefined
            ? await players.findProfileByName(request.params.identifier)
            : await players.findProfileById(uuid);
      } catch (error: unknown) {
        request.log.warn(
          { errorKind: getErrorKind(error), operation: 'resolve-player-profile' },
          'Minecraft profile lookup failed',
        );
        throw new ApiError(
          503,
          'service_unavailable',
          english.api.errors.minecraftProfileUnavailable,
          { cause: error },
        );
      }

      if (profile === undefined) {
        throw new ApiError(404, 'not_found', english.api.errors.minecraftPlayerNotFound);
      }

      void reply.header('cache-control', PUBLIC_PROFILE_CACHE);
      await reply.send({ username: profile.username, uuid: profile.uuid });
    },
  );
}
