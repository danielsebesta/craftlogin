import type { IncomingMessage, ServerResponse } from 'node:http';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import { tokenRateLimit } from './rate-limit.js';
import {
  oauthAuthorizationRouteSchema,
  oauthDiscoveryRouteSchema,
  oauthEndSessionConfirmRouteSchema,
  oauthEndSessionRouteSchema,
  oauthEndSessionSuccessRouteSchema,
  oauthIntrospectionRouteSchema,
  oauthJwksRouteSchema,
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

  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthAuthorizationRouteSchema,
    url: '/oauth2/authorize',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthResumeRouteSchema,
    url: '/oauth2/authorize/:uid',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    // The limiter must precede the raw bridge because the bridge hijacks the Fastify lifecycle.
    onRequest: [limitTokenRequests, forward],
    schema: oauthTokenRouteSchema,
    url: '/oauth2/token',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    onRequest: [limitTokenRequests, forward],
    schema: oauthIntrospectionRouteSchema,
    url: '/oauth2/introspect',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: ['GET', 'POST'],
    onRequest: forward,
    schema: oauthEndSessionRouteSchema,
    url: '/oauth2/logout',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    onRequest: forward,
    schema: oauthEndSessionConfirmRouteSchema,
    url: '/oauth2/logout/confirm',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthEndSessionSuccessRouteSchema,
    url: '/oauth2/logout/success',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'POST',
    onRequest: forward,
    schema: oauthRevocationRouteSchema,
    url: '/oauth2/revoke',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: ['GET', 'POST'],
    onRequest: forward,
    schema: oauthUserInfoRouteSchema,
    url: '/oauth2/userinfo',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthJwksRouteSchema,
    url: '/oauth2/jwks',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthDiscoveryRouteSchema,
    url: '/.well-known/openid-configuration',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthDiscoveryRouteSchema,
    url: '/.well-known/oauth-authorization-server',
  });
  server.route({
    handler: unreachableOidcHandler,
    method: 'GET',
    onRequest: forward,
    schema: oauthWebfingerRouteSchema,
    url: '/.well-known/webfinger',
  });
}

function createOidcForwarder(
  handler: OidcHttpHandler,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply): Promise<void> => {
    reply.hijack();
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
