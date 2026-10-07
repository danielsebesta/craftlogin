import type { Logger } from 'pino';

import { getErrorKind } from '../logging/error-kind.js';

const DEFAULT_INTERVAL_MS = 60 * 1_000;
export interface ExpiredRefreshTokenStore {
  $executeRaw(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<number>;
}

// Indexed, bounded batches prevent an expiry backlog from holding long table locks.
export class ExpiredRefreshTokenSweeper {
  private sweeping = false;
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
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const cutoff = new Date(Date.now() - 60_000);
      const tokens = await this.database.$executeRaw`
        DELETE FROM "RefreshToken" WHERE "tokenHash" IN (
          SELECT "tokenHash" FROM "RefreshToken" WHERE "expiresAt" < ${cutoff}
          ORDER BY "expiresAt" LIMIT 500 FOR UPDATE SKIP LOCKED
        )`;
      const grants = await this.database.$executeRaw`
        DELETE FROM "OidcGrant" WHERE "grantIdHash" IN (
          SELECT "grantIdHash" FROM "OidcGrant" WHERE "expiresAt" < ${cutoff}
          ORDER BY "expiresAt" LIMIT 500 FOR UPDATE SKIP LOCKED
        )`;
      if (tokens + grants > 0)
        this.logger.info({ removed: tokens + grants }, 'Expired authorizations were swept');
    } catch (error: unknown) {
      this.logger.warn({ errorKind: getErrorKind(error) }, 'Expired authorization sweep failed');
    } finally {
      this.sweeping = false;
    }
  }
}
