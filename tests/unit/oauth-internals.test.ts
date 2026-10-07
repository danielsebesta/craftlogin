import type { Logger } from 'pino';
import { errors as oidcErrors } from 'oidc-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  asInteractionStateError,
  OAuthInteractionStateError,
} from '../../src/oauth/interaction-gateway.js';
import {
  ExpiredRefreshTokenSweeper,
  type ExpiredRefreshTokenStore,
} from '../../src/oauth/refresh-token-sweeper.js';
import {
  anonymizeIpAddress,
  calculateSessionTtl,
  createSessionSignal,
  SESSION_ABSOLUTE_TTL_SECONDS,
  SESSION_SLIDING_TTL_SECONDS,
} from '../../src/oauth/session-security.js';

describe('expired OIDC interaction mapping', (): void => {
  it('converts the provider SessionNotFound into a shared state error', (): void => {
    const expired = new oidcErrors.SessionNotFound('interaction is gone');

    const mapped = asInteractionStateError(expired);

    expect(mapped).toBeInstanceOf(OAuthInteractionStateError);
    expect(mapped).toMatchObject({ cause: expired });
  });

  it('leaves unrelated provider failures untouched', (): void => {
    const failure = new Error('provider exploded');

    expect(asInteractionStateError(failure)).toBe(failure);
  });
});

function recordingLogger(): { logger: Pick<Logger, 'info' | 'warn'>; records: unknown[][] } {
  const records: unknown[][] = [];
  return {
    logger: {
      info: (...args: unknown[]): void => {
        records.push(args);
      },
      warn: (...args: unknown[]): void => {
        records.push(args);
      },
    },
    records,
  };
}

describe('ExpiredRefreshTokenSweeper', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('sweeps on start, repeats on the interval, and stops cleanly', async (): Promise<void> => {
    vi.useFakeTimers();
    const calls: unknown[][] = [];
    const store: ExpiredRefreshTokenStore = {
      $executeRaw: (...args: unknown[]): Promise<number> => {
        calls.push(args);
        return Promise.resolve(3);
      },
    };
    const { logger, records } = recordingLogger();
    const sweeper = new ExpiredRefreshTokenSweeper(store, logger, 60_000);

    sweeper.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toBeInstanceOf(Date);
    expect(records[0]?.[0]).toEqual({ removed: 6 });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(4);

    sweeper.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(calls).toHaveLength(4);
    expect((): void => {
      sweeper.stop();
    }).not.toThrow();
  });

  it('logs sweep failures instead of rejecting the timer callback', async (): Promise<void> => {
    vi.useFakeTimers();
    const store: ExpiredRefreshTokenStore = {
      $executeRaw: (): Promise<number> => Promise.reject(new Error('database unavailable')),
    };
    const { logger, records } = recordingLogger();
    const sweeper = new ExpiredRefreshTokenSweeper(store, logger, 60_000);

    sweeper.start();
    await vi.advanceTimersByTimeAsync(0);
    sweeper.stop();

    expect(records[0]?.[0]).toEqual({ errorKind: 'Error' });
  });
});

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

    expect(signal.ipReference).toMatch(/^ip_[A-Za-z0-9_-]{22}$/u);
    expect(signal.sessionReference).toMatch(/^session_[A-Za-z0-9_-]{22}$/u);
    expect(signal.userAgent).toMatch(/^CraftLogin\ufffdBrowser\//u);
    expect(signal.userAgent).toHaveLength(512);
    expect(JSON.stringify(signal)).not.toContain(sessionUid);
    expect(JSON.stringify(signal)).not.toContain('203.0.113');
  });

  it('fingerprints networks instead of storing client IPs', (): void => {
    const key = 'a'.repeat(32);
    const signal = (ip: string): string => createSessionSignal('uid', ip, 'agent', key).ipReference;

    // The same /24 network fingerprints identically across host changes.
    expect(signal('203.0.113.7')).toBe(signal('203.0.113.200'));
    expect(signal('203.0.113.7')).not.toBe(signal('198.51.100.7'));
    expect(signal('2001:DB8:85a3::8a2e:370:7334')).toBe(signal('2001:db8:85a3:ffff::1'));
    expect(signal('::ffff:192.0.2.1')).toBe(signal('::ffff:192.0.2.99'));
    expect(signal('unknown')).toMatch(/^ip_[A-Za-z0-9_-]{22}$/u);
    expect(anonymizeIpAddress('203.0.113.7')).toBe('203.0.113.0/24');
    expect(anonymizeIpAddress('203.0.113.0/24')).toBe('203.0.113.0/24');
    expect(anonymizeIpAddress('not-an-ip')).toBe('not-an-ip');
  });
});
