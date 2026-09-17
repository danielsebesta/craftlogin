import type { FastifyInstance } from 'fastify';

interface IncomingLocation {
  readonly host: string;
  readonly path: string;
  readonly protocol: string;
}

export function canonicalRedirectTarget(
  incoming: IncomingLocation,
  issuer: string,
): string | undefined {
  const canonical = new URL(issuer);
  const incomingOrigin = URL.parse(`${incoming.protocol}://${incoming.host}`);
  if (incomingOrigin === null) {
    return undefined;
  }

  const hostname = withoutTrailingDot(incomingOrigin.hostname);
  const canonicalHostname = withoutTrailingDot(canonical.hostname);
  const acceptedHosts = new Set([
    canonicalHostname,
    `www.${canonicalHostname}`,
    `auth.${canonicalHostname}`,
  ]);
  if (!acceptedHosts.has(hostname) || incomingOrigin.origin === canonical.origin) {
    return undefined;
  }

  const requested = new URL(incoming.path, 'http://request.invalid');
  return `${canonical.origin}${requested.pathname}${requested.search}`;
}

export function registerCanonicalOriginRedirect(server: FastifyInstance, issuer: string): void {
  server.addHook('onRequest', async (request, reply): Promise<void> => {
    const target = canonicalRedirectTarget(
      {
        host: request.host,
        path: request.raw.url ?? '/',
        protocol: request.protocol,
      },
      issuer,
    );
    if (target !== undefined) {
      await reply.redirect(target, 308);
    }
  });
}

function withoutTrailingDot(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/u, '');
}
