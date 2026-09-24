import type { Logger } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ExpiredRefreshTokenSweeper,
  type ExpiredRefreshTokenStore,
} from '../../src/oauth/refresh-token-sweeper.js';

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
