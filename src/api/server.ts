import cors from '@fastify/cors';
import formBody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import type { AccessTokenAuthenticator } from './access-token-authenticator.js';
import type { AppRegistrar } from './app-registration.js';
import { registerAppRoutes } from './app-routes.js';
import type { RegisteredOriginLookup } from './client-directory.js';
import type { CurrentUserLookup } from './current-user.js';
import { registerErrorHandling } from './errors.js';
import { registerHealthRoute, type ReadinessCheck } from './health-route.js';
import {
  registerInteractionRoutes,
  type ApiInteractionService,
  type ClientNameLookup,
} from './interaction-routes.js';
import { registerOidcHttpRoutes, type OidcHttpHandler } from './oauth-http-routes.js';
import { registerOpenApi } from './openapi.js';
import { registerRateLimiting } from './rate-limit.js';
import { registerSharedSchemas } from './schemas.js';
import { registerUserRoutes } from './user-routes.js';

export interface ApiServerOptions {
  readonly accessTokens: AccessTokenAuthenticator;
  readonly apps: AppRegistrar;
  readonly clients: ClientNameLookup & RegisteredOriginLookup;
  readonly interactions: ApiInteractionService;
  readonly issuer: string;
  readonly logger?: FastifyBaseLogger;
  readonly minecraftBaseDomain: string;
  readonly nodeEnvironment: 'development' | 'production' | 'test';
  readonly oidcHandler: OidcHttpHandler;
  readonly rateLimitNamespace?: string;
  readonly rateLimitRedis?: Redis;
  readonly readiness: ReadinessCheck;
  readonly trustProxy?: boolean;
  readonly users: CurrentUserLookup;
}

export async function createApiServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const server = createFastifyInstance(options);

  await registerOpenApi(server, {
    issuer: options.issuer,
    nodeEnvironment: options.nodeEnvironment,
  });
  await registerRateLimiting(server, options.rateLimitRedis, options.rateLimitNamespace);
  await server.register(formBody);
  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, {
    allowedHeaders: ['authorization', 'content-type'],
    credentials: false,
    hook: 'preHandler',
    maxAge: 600,
    methods: ['GET', 'POST'],
    origin: async (origin: string | undefined): Promise<boolean> =>
      origin !== undefined && (await options.clients.isAllowedOrigin(origin)),
  });

  registerSharedSchemas(server);
  registerErrorHandling(server);
  registerHealthRoute(server, options.readiness);
  registerOidcHttpRoutes(server, options.oidcHandler);
  registerInteractionRoutes(server, {
    clients: options.clients,
    interactions: options.interactions,
    minecraftBaseDomain: options.minecraftBaseDomain,
  });
  registerUserRoutes(server, options.accessTokens, options.users);
  registerAppRoutes(server, options.apps);

  return server;
}

function createFastifyInstance(options: ApiServerOptions): FastifyInstance {
  const sharedOptions = {
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: options.trustProxy ?? false,
  };

  return options.logger === undefined
    ? Fastify({ ...sharedOptions, logger: false })
    : Fastify({ ...sharedOptions, loggerInstance: options.logger });
}
