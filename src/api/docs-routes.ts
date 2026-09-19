import type { FastifyInstance, FastifyReply } from 'fastify';

import { docsStyles } from './docs-assets.js';
import { renderDocsPage } from './docs-page.js';
import { landingAssetRouteSchema, landingPageRouteSchema } from './schemas.js';

const DOCS_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self'",
  "manifest-src 'self'",
  "style-src 'self'",
].join('; ');

export function registerDocsRoutes(server: FastifyInstance): void {
  const sendDocs = async (_request: unknown, reply: FastifyReply): Promise<void> => {
    setDocsHeaders(reply);
    await reply.type('text/html; charset=utf-8').send(renderDocsPage());
  };

  server.get('/docs', { schema: landingPageRouteSchema }, sendDocs);
  server.get('/docs/', { schema: landingPageRouteSchema }, sendDocs);
  server.get(
    '/assets/docs.css',
    { schema: landingAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=0, must-revalidate');
      await reply.type('text/css; charset=utf-8').send(docsStyles);
    },
  );
}

function setDocsHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'public, max-age=300',
    'content-security-policy': DOCS_CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
