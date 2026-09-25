import { describe, expect, it } from 'vitest';

import { PAGE_CONTENT_SECURITY_POLICY } from '../../src/api/page-csp.js';

describe('page content security policy', (): void => {
  it('keeps every page restricted to same-origin form submissions', (): void => {
    // Cross-origin hand-offs use plain links or meta-refresh: Chromium blocks
    // form POST redirects under form-action 'self'.
    expect(PAGE_CONTENT_SECURITY_POLICY).toBe(
      [
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
      ].join('; '),
    );
  });
});
