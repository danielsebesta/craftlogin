import type { Redis } from 'ioredis';

import type { ReadinessCheck } from '../api/health-route.js';

export class InfrastructureReadinessCheck implements ReadinessCheck {
  private pending: Promise<void> | undefined;
  private healthyUntil = 0;

  public constructor(
    private readonly database: { $queryRaw(query: TemplateStringsArray): Promise<unknown> },
    private readonly redis: Pick<Redis, 'ping'>,
  ) {}

  public async check(): Promise<void> {
    if (Date.now() < this.healthyUntil) return;
    this.pending ??= Promise.allSettled([this.database.$queryRaw`SELECT 1`, this.redis.ping()])
      .then((results): void => {
        const failed = results.find((result) => result.status === 'rejected');
        if (failed !== undefined) throw failed.reason;
        this.healthyUntil = Date.now() + 1000;
      })
      .finally((): void => {
        this.pending = undefined;
      });
    // The route timeout does not clear this promise: timed-out probes cannot multiply work.
    await this.pending;
  }
}
