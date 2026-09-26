export const CSP_REPORT_PATH = '/api/csp-report';

export const PAGE_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self'",
  "manifest-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
].join('; ');

// Report-only mirrors the enforced policy so a future loosening of the enforced
// header still produces violation telemetry instead of silently shipping.
export const PAGE_CSP_REPORT_ONLY = `${PAGE_CONTENT_SECURITY_POLICY}; report-uri ${CSP_REPORT_PATH}`;
