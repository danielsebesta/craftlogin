import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import formBody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import type { AvatarService } from '../avatars/service.js';
import type { AppManager } from '../developers/app-management.js';
import type { DeveloperAccessRepository } from '../developers/developer-repository.js';
import type { DeveloperSessionService } from '../developers/session-service.js';
import type { MinecraftPlayerLookup } from '../mojang/client.js';
import type { SkinStore } from '../mojang/skin-store.js';
import type { AccessTokenAuthenticator } from './access-token-authenticator.js';
import type { AppRegistrar } from './app-registration.js';
import { registerAppRoutes } from './app-routes.js';
import { registerAvatarRoutes } from './avatar-routes.js';
import { registerBackgroundAssetRoute } from './background-asset.js';
import type { RegisteredOriginLookup } from './client-directory.js';
import type { CurrentUserLookup } from './current-user.js';
import type { DeveloperAuthentication } from './developer-authentication.js';
import { registerDeveloperRoutes } from './developer-routes.js';
import { registerErrorHandling } from './errors.js';
import { registerFaviconAssetRoutes } from './favicon-assets.js';
import { registerFontAssetRoutes } from './font-assets.js';
import { registerHealthRoute, type ReadinessCheck } from './health-route.js';
import {
  registerInteractionRoutes,
  type ApiInteractionService,
  type ClientDirectoryLookup,
} from './interaction-routes.js';
import { registerLandingRoutes } from './landing-routes.js';
import { registerMicrosoftIdentityAssociationRoute } from './microsoft-identity-association-route.js';
import {
  registerMicrosoftOAuthRoutes,
  type MicrosoftOAuthRoutesOptions,
} from './microsoft-oauth-routes.js';
import { registerOidcHttpRoutes, type OidcHttpHandler } from './oauth-http-routes.js';
import { registerOpenApi } from './openapi.js';
import { registerRateLimiting } from './rate-limit.js';
import { registerSharedSchemas } from './schemas.js';
import { registerUserRoutes } from './user-routes.js';

export interface ApiServerOptions {
  readonly accessTokens: AccessTokenAuthenticator;
  readonly appManager: AppManager;
  readonly apps: AppRegistrar;
  readonly clients: ClientDirectoryLookup & RegisteredOriginLookup;
  readonly consoleClient: { readonly clientId: string };
  readonly cookieKeys: readonly string[];
  readonly fetchImplementation?: typeof fetch;
  readonly developerAuthentication: DeveloperAuthentication;
  readonly developers: DeveloperAccessRepository;
  readonly developerSessions: Pick<DeveloperSessionService, 'create'>;
  readonly httpPort: number;
  readonly interactions: ApiInteractionService;
  readonly issuer: string;
  readonly logger?: FastifyBaseLogger;
  readonly minecraft?: {
    readonly avatars: AvatarService;
    readonly players: MinecraftPlayerLookup;
    readonly skins: SkinStore;
  };
  readonly minecraftBaseDomain: string;
  readonly microsoftOAuth?: {
    readonly clientId: string;
  };
  readonly microsoftVerification?: MicrosoftOAuthRoutesOptions['verification'];
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
  await server.register(cors, {
    allowedHeaders: ['authorization', 'content-type', 'if-none-match', 'x-csrf-token'],
    credentials: false,
    hook: 'onRequest',
    maxAge: 600,
    methods: ['GET', 'POST'],
    origin: async (origin: string | undefined): Promise<boolean> =>
      origin !== undefined && (await options.clients.isAllowedOrigin(origin)),
  });
  await registerRateLimiting(server, options.rateLimitRedis, options.rateLimitNamespace);
  await server.register(cookie, { secret: [...options.cookieKeys] });
  await server.register(formBody);
  await server.register(helmet, { contentSecurityPolicy: false });

  registerSharedSchemas(server);
  registerErrorHandling(server);
  registerFontAssetRoutes(server);
  registerFaviconAssetRoutes(server);
  registerBackgroundAssetRoute(server);
  if (options.microsoftOAuth !== undefined) {
    registerMicrosoftIdentityAssociationRoute(server, options.microsoftOAuth.clientId);
  }
  if (options.minecraft !== undefined) {
    registerAvatarRoutes(server, options.minecraft);
  }
  registerLandingRoutes(server, { showDocumentation: options.nodeEnvironment !== 'production' });
  registerHealthRoute(server, options.readiness);
  registerOidcHttpRoutes(server, options.oidcHandler);
  registerInteractionRoutes(server, {
    accounts: options.users,
    clients: options.clients,
    interactions: options.interactions,
    minecraftBaseDomain: options.minecraftBaseDomain,
    ...(options.minecraft === undefined ? {} : { players: options.minecraft.players }),
  });
  if (
    options.microsoftVerification !== undefined &&
    options.interactions.prepareMicrosoft !== undefined
  ) {
    registerMicrosoftOAuthRoutes(server, {
      interactions: {
        prepareMicrosoft: options.interactions.prepareMicrosoft.bind(options.interactions),
      },
      logger: server.log,
      verification: options.microsoftVerification,
    });
  }
  registerUserRoutes(server, options.accessTokens, options.users, options.minecraft?.players);
  registerDeveloperRoutes(server, {
    appManager: options.appManager,
    apps: options.apps,
    authentication: options.developerAuthentication,
    consoleClient: options.consoleClient,
    developers: options.developers,
    ...(options.fetchImplementation === undefined
      ? {}
      : { fetchImplementation: options.fetchImplementation }),
    httpPort: options.httpPort,
    issuer: options.issuer,
    logger: server.log,
    sessions: options.developerSessions,
    users: options.users,
    ...(options.minecraft === undefined ? {} : { players: options.minecraft.players }),
  });
  registerAppRoutes(server, options.apps, options.appManager, options.developerAuthentication);

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
