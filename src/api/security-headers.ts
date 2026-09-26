import type { ServerResponse } from 'node:http';

// Helmet 8 dropped the permissions-policy plugin, so the value is shared
// between the global onSend hook and the raw OIDC baseline below.
export const PERMISSIONS_POLICY = 'camera=(), geolocation=(), microphone=(), payment=(), usb=()';

// The raw OIDC bridge hijacks replies after @fastify/helmet's onRequest hook
// already wrote its headers, so only the pieces helmet cannot provide belong
// here: a restrictive fallback CSP (helmet's CSP is disabled in favor of
// page-specific policies) and the frame policy the project's pages all use.
export const BASELINE_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'permissions-policy': PERMISSIONS_POLICY,
  'x-frame-options': 'DENY',
};

// Overwriting here is still safe: the provider writes its response later, so
// headers it sets itself (e.g. the custom renderError page CSP) always win.
export function applyBaselineSecurityHeaders(response: ServerResponse): void {
  if (response.headersSent) {
    return;
  }
  for (const [name, value] of Object.entries(BASELINE_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}
