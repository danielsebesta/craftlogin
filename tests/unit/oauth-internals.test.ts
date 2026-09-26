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

interface DeleteManyCall {
  readonly where: { readonly expiresAt: { readonly lt: Date } };
}

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
    const calls: DeleteManyCall[] = [];
    const store: ExpiredRefreshTokenStore = {
      refreshToken: {
        deleteMany: (options: DeleteManyCall): Promise<{ count: number }> => {
          calls.push(options);
          return Promise.resolve({ count: 3 });
        },
      },
    };
    const { logger, records } = recordingLogger();
    const sweeper = new ExpiredRefreshTokenSweeper(store, logger, 60_000);

    sweeper.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.where.expiresAt.lt).toBeInstanceOf(Date);
    expect(records[0]?.[0]).toEqual({ removed: 3 });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(2);

    sweeper.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(calls).toHaveLength(2);
    expect((): void => {
      sweeper.stop();
    }).not.toThrow();
  });

  it('logs sweep failures instead of rejecting the timer callback', async (): Promise<void> => {
    vi.useFakeTimers();
    const store: ExpiredRefreshTokenStore = {
      refreshToken: {
        deleteMany: (): Promise<{ count: number }> =>
          Promise.reject(new Error('database unavailable')),
      },
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

    expect(signal.ipAddress).toBe('203.0.113.7\ufffd');
    expect(signal.sessionReference).toMatch(/^session_[A-Za-z0-9_-]{22}$/u);
    expect(signal.userAgent).toMatch(/^CraftLogin\ufffdBrowser\//u);
    expect(signal.userAgent).toHaveLength(512);
    expect(JSON.stringify(signal)).not.toContain(sessionUid);
  });
});
