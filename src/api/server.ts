import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import formBody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import type { AvatarService } from '../avatars/service.js';
import { APP_ICON_MAX_BYTES } from '../developers/app-icon.js';
import type { AppIconStore } from '../developers/app-icon-store.js';
import type { AppManager } from '../developers/app-management.js';
import type { DeveloperAccessRepository } from '../developers/developer-repository.js';
import type { DeveloperSessionService } from '../developers/session-service.js';
import type { MinecraftPlayerLookup } from '../mojang/client.js';
import type { SkinStore } from '../mojang/skin-store.js';
import type { AccessTokenAuthenticator } from './access-token-authenticator.js';
import { registerAccountRoutes, type AccountTokenStore } from './account-routes.js';
import { registerAgentGuidanceRoutes } from './agent-guidance-routes.js';
import { registerAppIconRoutes } from './app-icon-routes.js';
import type { AppRegistrar } from './app-registration.js';
import { registerAppRoutes } from './app-routes.js';
import { registerAvatarRoutes } from './avatar-routes.js';
import { registerBackgroundAssetRoute } from './background-asset.js';
import { registerCanonicalOriginRedirect } from './canonical-origin.js';
import type { RegisteredOriginLookup } from './client-directory.js';
import { CSP_REPORT_BODY_LIMIT, registerCspReportRoute } from './csp-report-route.js';
import type { CurrentUserLookup } from './current-user.js';
import type { DemoPlayer } from './demo-players.js';
import type { DeveloperAuthentication } from './developer-authentication.js';
import { registerDeveloperRoutes } from './developer-routes.js';
import { registerDocsRoutes } from './docs-routes.js';
import { registerErrorHandling } from './errors.js';
import { registerBrandAssetRoutes } from './brand-assets.js';
import { registerFaviconAssetRoutes } from './favicon-assets.js';
import { registerFontAssetRoutes } from './font-assets.js';
import { registerHealthRoute, type ReadinessCheck } from './health-route.js';
import {
  registerInteractionRoutes,
  type ApiInteractionService,
  type ClientDirectoryLookup,
} from './interaction-routes.js';
import { registerLandingRoutes } from './landing-routes.js';
import { registerLegalRoutes } from './legal-routes.js';
import { registerMicrosoftIdentityAssociationRoute } from './microsoft-identity-association-route.js';
import {
  registerMicrosoftOAuthRoutes,
  type MicrosoftOAuthRoutesOptions,
} from './microsoft-oauth-routes.js';
import { registerOidcHttpRoutes, type OidcHttpHandler } from './oauth-http-routes.js';
import { registerOpenApi } from './openapi.js';
import { PAGE_CSP_REPORT_ONLY } from './page-csp.js';
import { registerRateLimiting } from './rate-limit.js';
import { registerSharedSchemas } from './schemas.js';
import { PERMISSIONS_POLICY } from './security-headers.js';
import { registerSecurityTxtRoute } from './security-txt.js';
import { registerUserRoutes } from './user-routes.js';

export interface ApiServerOptions {
  readonly accessTokens: AccessTokenAuthenticator;
  readonly appManager: AppManager;
  readonly apps: AppRegistrar;
  readonly clients: ClientDirectoryLookup & RegisteredOriginLookup;
  readonly consoleClient: { readonly clientId: string };
  readonly cookieKeys: readonly string[];
  readonly database: AccountTokenStore;
  readonly demoPlayer?: DemoPlayer;
  readonly fetchImplementation?: typeof fetch;
  readonly developerAuthentication: DeveloperAuthentication;
  readonly developers: DeveloperAccessRepository;
  readonly developerSessions: Pick<DeveloperSessionService, 'create' | 'list' | 'revokeByKeyId'>;
  readonly httpPort: number;
  readonly icons: AppIconStore;
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
  readonly ownerUuid?: string;
  readonly rateLimitNamespace?: string;
  readonly rateLimitRedis?: Redis;
  readonly redis: Pick<Redis, 'eval' | 'get'>;
  readonly readiness: ReadinessCheck;
  readonly trustProxy?: boolean;
  readonly users: CurrentUserLookup;
}

export async function createApiServer(options: ApiServerOptions): Promise<FastifyInstance> {
  const server = createFastifyInstance(options);
  // Helmet's onRequest hooks must precede the canonical redirect so 308
  // protocol-upgrade replies still carry the baseline security headers.
  await server.register(helmet, { contentSecurityPolicy: false });
  if (options.nodeEnvironment === 'production') {
    registerCanonicalOriginRedirect(server, options.issuer);
  }

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
  // CSP violation reports arrive under their own media types; malformed bodies
  // degrade to an empty object and the collector route still answers 204.
  server.addContentTypeParser(
    ['application/csp-report', 'application/reports+json'],
    { bodyLimit: CSP_REPORT_BODY_LIMIT, parseAs: 'string' },
    (_request, body, done) => {
      try {
        done(null, JSON.parse(String(body)));
      } catch {
        done(null, {});
      }
    },
  );
  // Multipart keeps the icon form working without JavaScript; truncation lets
  // the route answer with its own HTML notice rather than a generic JSON error.
  await server.register(multipart, {
    limits: { fields: 4, fileSize: APP_ICON_MAX_BYTES, files: 1 },
    throwFileSizeLimit: false,
  });
  // Helmet 8 has no Permissions-Policy plugin; the OIDC forwarder covers
  // hijacked replies with its own baseline.
  server.addHook('onSend', async (_request, reply): Promise<void> => {
    if (!reply.hasHeader('permissions-policy')) {
      void reply.header('permissions-policy', PERMISSIONS_POLICY);
    }
    const contentType = reply.getHeader('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('text/html') &&
      !reply.hasHeader('content-security-policy-report-only')
    ) {
      void reply.header('content-security-policy-report-only', PAGE_CSP_REPORT_ONLY);
    }
  });

  registerSharedSchemas(server);
  registerErrorHandling(server);
  registerFontAssetRoutes(server);
  registerFaviconAssetRoutes(server);
  registerBrandAssetRoutes(server);
  registerBackgroundAssetRoute(server);
  if (options.microsoftOAuth !== undefined) {
    registerMicrosoftIdentityAssociationRoute(server, options.microsoftOAuth.clientId);
  }
  if (options.minecraft !== undefined) {
    registerAvatarRoutes(server, options.minecraft);
  }
  registerLandingRoutes(server, {
    showDocumentation: true,
    ...(options.demoPlayer === undefined ? {} : { demoPlayer: options.demoPlayer }),
  });
  registerLegalRoutes(server);
  registerDocsRoutes(server);
  registerAgentGuidanceRoutes(server);
  registerHealthRoute(server, options.readiness);
  registerCspReportRoute(server);
  registerSecurityTxtRoute(server);
  registerOidcHttpRoutes(server, options.oidcHandler);
  registerInteractionRoutes(server, {
    accounts: options.users,
    clients: options.clients,
    interactions: options.interactions,
    minecraftBaseDomain: options.minecraftBaseDomain,
    ...(options.minecraft === undefined ? {} : { players: options.minecraft.players }),
  });
  registerAccountRoutes(server, {
    cookieKeys: options.cookieKeys,
    database: options.database,
    developers: options.developers,
    logger: server.log,
    redis: options.redis,
    users: options.users,
  });
  if (
    options.microsoftVerification !== undefined &&
    options.interactions.prepareMicrosoft !== undefined &&
    options.interactions.prepareMicrosoftCallback !== undefined
  ) {
    registerMicrosoftOAuthRoutes(server, {
      interactions: {
        prepareMicrosoft: options.interactions.prepareMicrosoft.bind(options.interactions),
        prepareMicrosoftCallback: options.interactions.prepareMicrosoftCallback.bind(
          options.interactions,
        ),
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
    ...(options.ownerUuid === undefined ? {} : { ownerUuid: options.ownerUuid }),
    sessions: options.developerSessions,
    showDocumentation: true,
    users: options.users,
    ...(options.minecraft === undefined ? {} : { players: options.minecraft.players }),
  });
  registerAppRoutes(server, options.apps, options.appManager, options.developerAuthentication);
  registerAppIconRoutes(server, { icons: options.icons });

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
