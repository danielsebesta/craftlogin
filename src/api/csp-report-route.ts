import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { cspReportRateLimit } from './rate-limit.js';
import { cspReportRouteSchema } from './schemas.js';

// Both the legacy csp-report envelope and the Reporting API array land here;
// anything else is still answered with 204 so the sink never errors visibly.
const legacyReportSchema = z.looseObject({
  'csp-report': z.looseObject({
    'blocked-uri': z.string().optional(),
    'document-uri': z.string().optional(),
    'effective-directive': z.string().optional(),
    'violated-directive': z.string().optional(),
  }),
});

export const CSP_REPORT_BODY_LIMIT = 16_384;

export function registerCspReportRoute(server: FastifyInstance): void {
  server.post(
    '/api/csp-report',
    { config: { rateLimit: cspReportRateLimit }, schema: cspReportRouteSchema },
    async (request, reply): Promise<void> => {
      const report = legacyReportSchema.safeParse(request.body).data?.['csp-report'];
      if (report !== undefined) {
        // Only the directive and a summarized blocked URI are logged; document
        // URIs carry interaction identifiers and stay out of the telemetry.
        request.log.warn(
          {
            blockedUri: summarizeBlockedUri(report['blocked-uri']),
            directive: report['violated-directive']?.slice(0, 128),
            event: 'csp_violation',
          },
          'csp violation reported',
        );
      }
      await reply.status(204).send();
    },
  );
}

function summarizeBlockedUri(uri: string | undefined): string {
  if (uri === undefined) {
    return 'unknown';
  }
  return URL.parse(uri)?.origin ?? uri.slice(0, 64);
}
