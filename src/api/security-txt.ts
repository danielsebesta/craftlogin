import type { FastifyInstance } from 'fastify';

import { publicOidcRateLimit } from './rate-limit.js';
import { securityTxtRouteSchema } from './schemas.js';

// RFC 9116 disclosure contact. Expires is a hard requirement of the format and
// must be moved forward whenever this file is touched.
const SECURITY_TXT = [
  'Contact: https://github.com/danielsebesta/craftlogin/security/advisories/new',
  'Expires: 2027-01-01T00:00:00.000Z',
  'Preferred-Languages: en, cs',
].join('\n');

export function registerSecurityTxtRoute(server: FastifyInstance): void {
  server.get(
    '/.well-known/security.txt',
    { config: { rateLimit: publicOidcRateLimit }, schema: securityTxtRouteSchema },
    async (_request, reply): Promise<void> => {
      void reply.header('cache-control', 'public, max-age=86400');
      await reply.type('text/plain; charset=utf-8').send(SECURITY_TXT);
    },
  );
}
