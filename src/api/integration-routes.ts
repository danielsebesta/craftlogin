import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { FastifyInstance, FastifyReply } from 'fastify';

import { integrationScript } from './integration-assets.js';
import { renderIntegrationPage } from './integration-page.js';
import type { IntegrationClientType, IntegrationStack } from './integration-prompt.js';
import {
  integrationIndexRouteSchema,
  integrationPageRouteSchema,
  integrationStackRouteSchema,
  integrationTextRouteSchema,
  landingAssetRouteSchema,
} from './schemas.js';

const INTEGRATION_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self'",
  "manifest-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
].join('; ');

interface IntegrationPageQuery {
  readonly clientId?: string;
  readonly clientType?: IntegrationClientType;
  readonly issuer?: string;
  readonly postLogoutRedirectUri?: string;
  readonly redirectUri?: string;
  readonly stack?: IntegrationStack;
}

export function registerIntegrationRoutes(server: FastifyInstance, issuer: string): void {
  server.get(
    '/docs/integrations',
    { schema: integrationIndexRouteSchema },
    async (_request, reply): Promise<void> => {
      await reply.redirect('/docs/integrations/ai');
    },
  );

  server.get<{ Params: { readonly stack: IntegrationStack } }>(
    '/docs/integrations/ai/:stack',
    { schema: integrationStackRouteSchema },
    async (request, reply): Promise<void> => {
      await reply.redirect(
        `/docs/integrations/ai?stack=${encodeURIComponent(request.params.stack)}`,
      );
    },
  );

  server.get<{
    Querystring: IntegrationPageQuery;
  }>(
    '/docs/integrations/ai',
    { schema: integrationPageRouteSchema },
    async (request, reply): Promise<void> => {
      setIntegrationHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(
        renderIntegrationPage({
          clientId: request.query.clientId ?? 'cl_your_client',
          clientType: request.query.clientType ?? 'confidential',
          issuer: request.query.issuer ?? issuer,
          postLogoutRedirectUri: request.query.postLogoutRedirectUri ?? 'https://example.com/',
          redirectUri: request.query.redirectUri ?? 'https://example.com/auth/craftlogin/callback',
          stack: request.query.stack ?? 'generic',
        }),
      );
    },
  );

  server.get(
    '/assets/integration.js',
    { schema: landingAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=0, must-revalidate');
      await reply.type('text/javascript; charset=utf-8').send(integrationScript);
    },
  );

  registerTextFile(server, '/llms.txt', 'llms.txt', 'text/markdown; charset=utf-8');
  registerTextFile(server, '/llms-full.txt', 'llms-full.txt', 'text/markdown; charset=utf-8');
  registerTextFile(server, '/openapi.yaml', 'openapi.yaml', 'application/yaml; charset=utf-8');
}

function registerTextFile(
  server: FastifyInstance,
  route: string,
  filename: string,
  mediaType: string,
): void {
  server.get(
    route,
    { schema: integrationTextRouteSchema },
    async (_request, reply): Promise<void> => {
      const content = await readFile(resolve(process.cwd(), filename), 'utf8');
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type(mediaType).send(content);
    },
  );
}

function setIntegrationHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'public, max-age=300',
    'content-security-policy': INTEGRATION_CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
