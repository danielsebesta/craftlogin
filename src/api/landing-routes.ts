import type { FastifyInstance, FastifyReply } from 'fastify';

import { landingStyles } from './landing-assets.js';
import { renderLandingPage } from './landing-page.js';
import { landingAssetRouteSchema, landingPageRouteSchema } from './schemas.js';

const LANDING_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "font-src 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'self'",
  "style-src 'self'",
].join('; ');

export interface LandingRoutesOptions {
  readonly showDocumentation: boolean;
}

export function registerLandingRoutes(
  server: FastifyInstance,
  options: LandingRoutesOptions,
): void {
  server.get('/', { schema: landingPageRouteSchema }, async (_request, reply): Promise<void> => {
    setLandingHeaders(reply);
    await reply
      .type('text/html; charset=utf-8')
      .send(renderLandingPage({ showDocumentation: options.showDocumentation }));
  });

  server.get(
    '/assets/landing.css',
    { schema: landingAssetRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=3600');
      await reply.type('text/css; charset=utf-8').send(landingStyles);
    },
  );
}

function setLandingHeaders(reply: FastifyReply): void {
  void reply.headers({
    'cache-control': 'public, max-age=300',
    'content-security-policy': LANDING_CSP,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
}
