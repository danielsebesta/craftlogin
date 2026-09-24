import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AvatarLookupResult, AvatarService } from '../avatars/service.js';
import type {
  AvatarLayers,
  AvatarSize,
  AvatarView,
  CapeProvider,
  MinecraftSkinModel,
} from '../avatars/types.js';
import { english } from '../locales/en.js';
import type { SkinImage, SkinStore } from '../mojang/skin-store.js';
import { ApiError } from './errors.js';
import { avatarRawRateLimit, avatarRenderRateLimit } from './rate-limit.js';
import {
  avatarPreflightRouteSchema,
  avatarRouteSchema,
  capeAvatarRouteSchema,
  capesOverviewRouteSchema,
  rawAvatarRouteSchema,
  renderedAvatarRouteSchema,
  skinRouteSchema,
  textureAvatarRouteSchema,
} from './schemas.js';

const UUID_IMAGE_CACHE = 'public, max-age=3600, stale-while-revalidate=86400';
const HASH_IMAGE_CACHE = 'public, max-age=31536000, immutable';
const PUBLIC_IMAGE_CORS = {
  allowedHeaders: ['if-none-match'],
  credentials: false,
  exposedHeaders: ['etag'],
  methods: ['GET'],
  origin: '*',
};

interface AvatarParams {
  readonly identifier: string;
}

interface AvatarQuery {
  readonly layers?: AvatarLayers;
  readonly model?: MinecraftSkinModel;
  readonly provider?: CapeProvider;
  readonly size?: '128' | '256' | '32' | '64';
}

interface CapeQuery {
  readonly provider?: CapeProvider;
}

interface SkinParams {
  readonly hash: string;
}

export interface AvatarRoutesOptions {
  readonly avatars: AvatarService;
  readonly skins: SkinStore;
}

export function registerAvatarRoutes(server: FastifyInstance, options: AvatarRoutesOptions): void {
  registerPublicPreflight(server, '/api/avatars/:identifier/skin');
  registerPublicPreflight(server, '/api/avatars/:identifier/processed-skin');
  registerPublicPreflight(server, '/api/avatars/:identifier/capes');
  registerPublicPreflight(server, '/api/avatars/:identifier/cape');
  registerPublicPreflight(server, '/api/avatars/:identifier/elytra');
  registerPublicPreflight(server, '/api/avatars/:identifier/face');
  registerPublicPreflight(server, '/api/avatars/:identifier/bust');
  registerPublicPreflight(server, '/api/avatars/:identifier/body');
  registerPublicPreflight(server, '/api/avatars/:identifier/back');
  registerPublicPreflight(server, '/api/avatars/:identifier/side');
  registerPublicPreflight(server, '/api/avatars/:identifier/duo');
  registerPublicPreflight(server, '/api/avatars/:identifier/wings');

  server.get<{ Params: AvatarParams }>(
    '/avatar/:identifier',
    {
      config: { rateLimit: avatarRenderRateLimit },
      schema: avatarRouteSchema,
    },
    async (request, reply): Promise<void> => {
      await sendAvatarResult(
        request,
        reply,
        await options.avatars.render(request.params.identifier, {
          layers: 'all',
          size: 128,
          view: 'face',
        }),
      );
    },
  );

  server.get<{ Params: AvatarParams }>(
    '/api/avatars/:identifier/skin',
    {
      config: { cors: PUBLIC_IMAGE_CORS, rateLimit: avatarRawRateLimit },
      schema: rawAvatarRouteSchema,
    },
    async (request, reply): Promise<void> => {
      await sendAvatarResult(
        request,
        reply,
        await options.avatars.findRawSkin(request.params.identifier),
      );
    },
  );

  server.get<{ Params: AvatarParams }>(
    '/api/avatars/:identifier/capes',
    {
      config: { cors: PUBLIC_IMAGE_CORS, rateLimit: avatarRawRateLimit },
      schema: capesOverviewRouteSchema,
    },
    async (request, reply): Promise<void> => {
      const result = await options.avatars.findAvailableCapes(request.params.identifier);
      if (result.status === 'not-found') {
        throw new ApiError(404, 'not_found', english.api.errors.avatarNotFound);
      }
      if (result.status === 'unavailable') {
        throw new ApiError(503, 'service_unavailable', english.api.errors.avatarUnavailable);
      }
      void reply.header('cache-control', UUID_IMAGE_CACHE);
      await reply.send(result.data);
    },
  );

  registerRenderedRoute(server, options.avatars, 'face', 'avatarFace');
  registerRenderedRoute(server, options.avatars, 'bust', 'avatarBust');
  registerRenderedRoute(server, options.avatars, 'body', 'avatarBody');
  registerRenderedRoute(server, options.avatars, 'back', 'avatarBack');
  registerRenderedRoute(server, options.avatars, 'side', 'avatarSide');
  registerRenderedRoute(server, options.avatars, 'duo', 'avatarDuo');
  registerRenderedRoute(server, options.avatars, 'wings', 'avatarWings');
  registerProcessedSkinRoute(server, options.avatars);
  registerCapeRoute(server, options.avatars, 'cape', 'avatarCape');
  registerCapeRoute(server, options.avatars, 'elytra', 'avatarElytra');

  registerHashSkinRoute(server, options.skins, '/skin/:hash');
  registerHashSkinRoute(server, options.skins, '/skin/:hash.png');
}

function registerPublicPreflight(server: FastifyInstance, path: string): void {
  server.options<{ Params: AvatarParams }>(
    path,
    { config: { cors: PUBLIC_IMAGE_CORS }, schema: avatarPreflightRouteSchema },
    async (_request, reply): Promise<void> => {
      await reply.status(204).send();
    },
  );
}

function registerRenderedRoute(
  server: FastifyInstance,
  avatars: AvatarService,
  view: AvatarView,
  operation:
    | 'avatarBack'
    | 'avatarBody'
    | 'avatarBust'
    | 'avatarDuo'
    | 'avatarFace'
    | 'avatarSide'
    | 'avatarWings',
): void {
  server.get<{ Params: AvatarParams; Querystring: AvatarQuery }>(
    `/api/avatars/:identifier/${view}`,
    {
      config: { cors: PUBLIC_IMAGE_CORS, rateLimit: avatarRenderRateLimit },
      schema: renderedAvatarRouteSchema(operation),
    },
    async (request, reply): Promise<void> => {
      const size = parseAvatarSize(request.query.size);
      await sendAvatarResult(
        request,
        reply,
        await avatars.render(request.params.identifier, {
          layers: request.query.layers ?? 'all',
          size,
          view,
          ...(request.query.provider !== undefined ? { capeProvider: request.query.provider } : {}),
          ...(request.query.model !== undefined ? { model: request.query.model } : {}),
        }),
      );
    },
  );
}

function registerProcessedSkinRoute(server: FastifyInstance, avatars: AvatarService): void {
  server.get<{ Params: AvatarParams }>(
    '/api/avatars/:identifier/processed-skin',
    {
      config: { cors: PUBLIC_IMAGE_CORS, rateLimit: avatarRawRateLimit },
      schema: textureAvatarRouteSchema('avatarProcessedSkin'),
    },
    async (request, reply): Promise<void> => {
      const result = await avatars.findProcessedSkin(request.params.identifier);
      await sendAvatarResult(request, reply, result);
    },
  );
}

function registerCapeRoute(
  server: FastifyInstance,
  avatars: AvatarService,
  view: 'cape' | 'elytra',
  operation: 'avatarCape' | 'avatarElytra',
): void {
  server.get<{ Params: AvatarParams; Querystring: CapeQuery }>(
    `/api/avatars/:identifier/${view}`,
    {
      config: { cors: PUBLIC_IMAGE_CORS, rateLimit: avatarRawRateLimit },
      schema: capeAvatarRouteSchema(operation),
    },
    async (request, reply): Promise<void> => {
      const result = await avatars.findCape(request.params.identifier, {
        ...(request.query.provider !== undefined ? { provider: request.query.provider } : {}),
      });
      await sendAvatarResult(request, reply, result);
    },
  );
}

function registerHashSkinRoute(
  server: FastifyInstance,
  skins: SkinStore,
  path: '/skin/:hash' | '/skin/:hash.png',
): void {
  server.get<{ Params: SkinParams }>(
    path,
    {
      config: { rateLimit: avatarRawRateLimit },
      schema: skinRouteSchema,
    },
    async (request, reply): Promise<void> => {
      let image: SkinImage | undefined;
      try {
        image = await skins.fetchSkin(request.params.hash);
      } catch (error: unknown) {
        throw new ApiError(503, 'service_unavailable', english.api.errors.avatarUnavailable, {
          cause: error,
        });
      }
      if (image === undefined) {
        throw new ApiError(404, 'not_found', english.api.errors.avatarNotFound);
      }

      const etag = `"skin-${request.params.hash}"`;
      void reply.header('cache-control', HASH_IMAGE_CACHE);
      void reply.header('etag', etag);
      if (matchesEntityTag(request.headers['if-none-match'], etag)) {
        await reply.status(304).send();
        return;
      }
      await reply.type(image.contentType).send(image.body);
    },
  );
}

async function sendAvatarResult(
  request: FastifyRequest,
  reply: FastifyReply,
  result: AvatarLookupResult,
): Promise<void> {
  if (result.status === 'not-found') {
    throw new ApiError(404, 'not_found', english.api.errors.avatarNotFound);
  }
  if (result.status === 'unavailable') {
    throw new ApiError(503, 'service_unavailable', english.api.errors.avatarUnavailable);
  }
  void reply.header('cache-control', UUID_IMAGE_CACHE);
  void reply.header('etag', result.image.etag);
  if (matchesEntityTag(request.headers['if-none-match'], result.image.etag)) {
    await reply.status(304).send();
    return;
  }

  await reply.type(result.image.contentType).send(result.image.body);
}

function parseAvatarSize(value: AvatarQuery['size']): AvatarSize {
  switch (value) {
    case undefined:
    case '128':
      return 128;
    case '32':
      return 32;
    case '64':
      return 64;
    case '256':
      return 256;
  }
}

function matchesEntityTag(header: string | readonly string[] | undefined, etag: string): boolean {
  let values: readonly string[];
  if (header === undefined) {
    values = [];
  } else if (typeof header === 'string') {
    values = header.split(',');
  } else {
    values = header;
  }
  return values.some((value): boolean => {
    const candidate = value.trim();
    return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
  });
}
