import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import { ApiError } from './errors.js';
import {
  authorizeRateLimit,
  publicOidcRateLimit,
  tokenEndpointGlobalRateLimit,
  tokenRateLimit,
} from './rate-limit.js';
import { applyBaselineSecurityHeaders } from './security-headers.js';
import {
  oauthAuthorizationRouteSchema,
  oauthDiscoveryRouteSchema,
  oauthEndSessionConfirmRouteSchema,
  oauthEndSessionRouteSchema,
  oauthEndSessionSuccessRouteSchema,
  oauthIntrospectionRouteSchema,
  oauthJwksRouteSchema,
  oauthParRouteSchema,
  oauthResumeRouteSchema,
  oauthRevocationRouteSchema,
  oauthTokenRouteSchema,
  oauthUserInfoRouteSchema,
  oauthWebfingerRouteSchema,
} from './schemas.js';

export type OidcHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> | void;

export function registerOidcHttpRoutes(server: FastifyInstance, handler: OidcHttpHandler): void {
  const forward = createOidcForwarder(handler);
  const limitTokenRequests = server.rateLimit(tokenRateLimit);
  const limitAuthorizeRequests = server.rateLimit(authorizeRateLimit);
  const limitPublicOidcRequests = server.rateLimit(publicOidcRateLimit);
  // Hook limiters skip the chain once one runs, so the shared ceiling uses
  // createRateLimit(), which only inspects the store.
  const checkGlobalTokenBudget = server.createRateLimit(tokenEndpointGlobalRateLimit);
  const enforceGlobalTokenBudget = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await checkGlobalTokenBudget(request);
    if (!result.isAllowed && result.isExceeded) {
      void reply
        .header('x-ratelimit-limit', result.max)
        .header('x-ratelimit-remaining', 0)
        .header('x-ratelimit-reset', result.ttlInSeconds)
        .header('retry-after', result.ttlInSeconds);
      throw new ApiError(429, 'rate_limited', english.api.errors.rateLimited);
    }
  };

  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    // The limiter precedes the raw bridge, which hijacks the Fastify lifecycle.
    onRequest: [limitAuthorizeRequests, forward],
    schema: oauthAuthorizationRouteSchema,
    url: '/oauth2/authorize',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: [limitAuthorizeRequests, forward],
    schema: oauthResumeRouteSchema,
    url: '/oauth2/authorize/:uid',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    // The global ceiling runs first so an over-limit request doesn't spend
    // per-address budget.
    onRequest: [enforceGlobalTokenBudget, limitTokenRequests, forward],
    schema: oauthTokenRouteSchema,
    url: '/oauth2/token',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    onRequest: [enforceGlobalTokenBudget, limitTokenRequests, forward],
    schema: oauthIntrospectionRouteSchema,
    url: '/oauth2/introspect',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    // PAR authenticates the client (secret compares hit Argon2) and writes a
    // pushed request record, so it shares the token-endpoint budgets.
    onRequest: [enforceGlobalTokenBudget, limitTokenRequests, forward],
    schema: oauthParRouteSchema,
    url: '/oauth2/par',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: ['GET', 'POST'],
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthEndSessionRouteSchema,
    url: '/oauth2/logout',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthEndSessionConfirmRouteSchema,
    url: '/oauth2/logout/confirm',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthEndSessionSuccessRouteSchema,
    url: '/oauth2/logout/success',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthRevocationRouteSchema,
    url: '/oauth2/revoke',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: ['GET', 'POST'],
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthUserInfoRouteSchema,
    url: '/oauth2/userinfo',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthJwksRouteSchema,
    url: '/oauth2/jwks',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthDiscoveryRouteSchema,
    url: '/.well-known/openid-configuration',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthDiscoveryRouteSchema,
    url: '/.well-known/oauth-authorization-server',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: [limitPublicOidcRequests, forward],
    schema: oauthWebfingerRouteSchema,
    url: '/.well-known/webfinger',
  });
}

function createOidcForwarder(
  handler: OidcHttpHandler,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply): Promise<void> => {
    reply.hijack();
    // The provider writes directly to the raw response, so the fallback CSP
    // and frame policy helmet cannot supply are applied here; headers the
    // provider sets afterwards still win.
    applyBaselineSecurityHeaders(reply.raw);
    try {
      await handler(request.raw, reply.raw);
    } catch (error: unknown) {
      request.log.error(
        { errorKind: getErrorKind(error), requestId: request.id },
        'OIDC request failed',
      );
      if (!reply.raw.headersSent) {
        reply.raw.statusCode = 500;
        reply.raw.setHeader('cache-control', 'no-store');
        reply.raw.setHeader('content-type', 'application/json; charset=utf-8');
      }
      if (!reply.raw.writableEnded) {
        reply.raw.end(
          JSON.stringify({
            error: 'server_error',
            error_description: english.api.oauthServerError,
          }),
        );
      }
    }
  };
}

function unreachableOidcHandler(): never {
  throw new Error('OIDC request escaped its raw onRequest handler');
}
