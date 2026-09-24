import type { Logger } from 'pino';

import { getErrorKind } from '../logging/error-kind.js';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1_000;

export interface ExpiredRefreshTokenStore {
  readonly refreshToken: {
    deleteMany(options: { where: { expiresAt: { lt: Date } } }): Promise<{ count: number }>;
  };
}

// Expired rows are invisible to `find` but never removed on their own, so the
// table would grow forever. A periodic deleteMany keeps it bounded; concurrent
// instances may sweep the same rows harmlessly.
export class ExpiredRefreshTokenSweeper {
  private timer: NodeJS.Timeout | null = null;

  public constructor(
    private readonly database: ExpiredRefreshTokenStore,
    private readonly logger: Pick<Logger, 'info' | 'warn'>,
    private readonly intervalMs: number = DEFAULT_INTERVAL_MS,
  ) {}

  public start(): void {
    if (this.timer !== null) {
      return;
    }
    void this.sweep();
    this.timer = setInterval((): void => {
      void this.sweep();
    }, this.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sweep(): Promise<void> {
    try {
      const removed = await this.database.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      if (removed.count > 0) {
        this.logger.info({ removed: removed.count }, 'Expired refresh tokens were swept');
      }
    } catch (error: unknown) {
      this.logger.warn({ errorKind: getErrorKind(error) }, 'Expired refresh-token sweep failed');
    }
  }
}
