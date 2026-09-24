import type { FastifyInstance, FastifyReply } from 'fastify';

import { legalStyles } from './legal-assets.js';
import { renderLegalPage, type LegalPageKind } from './legal-page.js';
import { landingAssetRouteSchema, landingPageRouteSchema } from './schemas.js';

// Legal pages are static text: no scripts, no forms, no cross-origin requests.
const LEGAL_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self'",
  "manifest-src 'self'",
  "style-src 'self'",
].join('; ');

export function registerLegalRoutes(server: FastifyInstance): void {
  for (const kind of ['privacy', 'terms'] as const satisfies readonly LegalPageKind[]) {
    const sendPage = async (_request: unknown, reply: FastifyReply): Promise<void> => {
      setLegalHeaders(reply);
      await reply.type('text/html; charset=utf-8').send(renderLegalPage(kind));
    };
    server.get(`/${kind}`, { schema: landingPageRouteSchema }, sendPage);
    server.get(`/${kind}/`, { schema: landingPageRouteSchema }, sendPage);
  }

  server.get(
    '/assets/legal.css',
    { schema: landingAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=0, must-revalidate');
      await reply.type('text/css; charset=utf-8').send(legalStyles);
    },
  );
}

function setLegalHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'public, max-age=300',
    'content-security-policy': LEGAL_CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
