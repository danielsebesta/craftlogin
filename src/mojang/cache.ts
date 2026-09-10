import type { Redis } from 'ioredis';
import { z } from 'zod';

export interface CachedValue {
  readonly fetchedAt: number;
  readonly value: unknown;
}

export interface MinecraftCache {
  read(key: string): Promise<CachedValue | undefined>;
  write(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

const cachedValueSchema = z.object({ fetchedAt: z.number(), value: z.unknown() });

export class RedisMinecraftCache implements MinecraftCache {
  public constructor(
    private readonly redis: Pick<Redis, 'get' | 'set'>,
    private readonly namespace = 'craftlogin:mojang:',
  ) {}

  public async read(key: string): Promise<CachedValue | undefined> {
    const raw = await this.redis.get(`${this.namespace}${key}`);
    if (raw === null) {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const result = cachedValueSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  }

  public async write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(
      `${this.namespace}${key}`,
      JSON.stringify({ fetchedAt: Date.now(), value }),
      'EX',
      ttlSeconds,
    );
  }
}

interface MemoryEntry {
  readonly expiresAt: number;
  readonly value: CachedValue;
}

export class MemoryMinecraftCache implements MinecraftCache {
  private readonly entries = new Map<string, MemoryEntry>();

  public read(key: string): Promise<CachedValue | undefined> {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return Promise.resolve(undefined);
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  public write(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1_000,
      value: { fetchedAt: Date.now(), value },
    });
    return Promise.resolve();
  }
}
