import type { Redis } from 'ioredis';

import type { ReadinessCheck } from '../api/health-route.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export class InfrastructureReadinessCheck implements ReadinessCheck {
  public constructor(
    private readonly database: PrismaClient,
    private readonly redis: Redis,
  ) {}

  public async check(): Promise<void> {
    await Promise.all([this.database.$queryRaw`SELECT 1`, this.redis.ping()]);
  }
}
