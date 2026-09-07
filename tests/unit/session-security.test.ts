import { describe, expect, it } from 'vitest';

import {
  calculateSessionTtl,
  createSessionSignal,
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_SLIDING_TTL_SECONDS,
} from '../../src/oauth/session-security.js';

describe('OIDC session security', (): void => {
  it('uses a sliding expiry without extending beyond the absolute lifetime', (): void => {
    const now = 2_000_000_000;

    expect(calculateSessionTtl(undefined, now)).toBe(SESSION_SLIDING_TTL_SECONDS);
    expect(calculateSessionTtl(now - 60 * 60, now)).toBe(SESSION_SLIDING_TTL_SECONDS);
    expect(calculateSessionTtl(now - SESSION_ABSOLUTE_TTL_SECONDS + 600, now)).toBe(600);
    expect(calculateSessionTtl(now - SESSION_ABSOLUTE_TTL_SECONDS, now)).toBe(1);
  });

  it('correlates sanitized anomaly signals without exposing the session identifier', (): void => {
    const sessionUid = 'raw-session-identifier';
    const signal = createSessionSignal(
      sessionUid,
      ' 203.0.113.7\n',
      `CraftLogin\u0000Browser/${'x'.repeat(600)}`,
      'a'.repeat(32),
    );

    expect(signal.ipAddress).toBe('203.0.113.7\ufffd');
    expect(signal.sessionReference).toMatch(/^session_[A-Za-z0-9_-]{22}$/u);
    expect(signal.userAgent).toMatch(/^CraftLogin\ufffdBrowser\//u);
    expect(signal.userAgent).toHaveLength(512);
    expect(JSON.stringify(signal)).not.toContain(sessionUid);
  });
});
