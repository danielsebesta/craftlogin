import type { PrismaClient } from '../generated/prisma/client.js';
import type { ClientDirectoryEntry, ClientDirectoryLookup } from './interaction-routes.js';

export interface RegisteredOriginLookup {
  isAllowedOrigin(origin: string): Promise<boolean>;
}

// The origin allowlist is read on every CORS-bearing request, so the full app
// scan runs at most once per window. A stale answer for up to 30 seconds is
// acceptable: CORS here only gates read access to public endpoints.
const ALLOWED_ORIGINS_TTL_MS = 30 * 1_000;

interface AllowedOriginsSnapshot {
  readonly origins: ReadonlySet<string>;
  readonly readAt: number;
}

export class OriginAllowlistCache {
  private inflight: Promise<ReadonlySet<string>> | null = null;
  private snapshot: AllowedOriginsSnapshot | undefined;

  public constructor(
    private readonly load: () => Promise<ReadonlySet<string>>,
    private readonly ttlMs: number = ALLOWED_ORIGINS_TTL_MS,
  ) {}

  public async get(): Promise<ReadonlySet<string>> {
    const snapshot = this.snapshot;
    if (snapshot !== undefined && Date.now() - snapshot.readAt <= this.ttlMs) {
      return snapshot.origins;
    }
    // Concurrent misses share one scan instead of stampeding the database.
    this.inflight ??= this.loadOnce();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async loadOnce(): Promise<ReadonlySet<string>> {
    try {
      const origins = await this.load();
      this.snapshot = { origins, readAt: Date.now() };
      return origins;
    } catch (error: unknown) {
      // A transient database failure must not break CORS for known origins.
      if (this.snapshot !== undefined) {
        return this.snapshot.origins;
      }
      throw error;
    }
  }
}

export class PrismaClientDirectory implements ClientDirectoryLookup, RegisteredOriginLookup {
  private readonly allowedOrigins: OriginAllowlistCache;

  public constructor(private readonly database: PrismaClient) {
    this.allowedOrigins = new OriginAllowlistCache((): Promise<ReadonlySet<string>> =>
      this.scanOrigins(),
    );
  }

  public async findClient(clientId: string): Promise<ClientDirectoryEntry | undefined> {
    const client = await this.database.app.findUnique({
      select: { iconHash: true, name: true, verifiedAt: true },
      where: { clientId },
    });
    return client === null
      ? undefined
      : {
          ...(client.iconHash === null ? {} : { iconHash: client.iconHash }),
          name: client.name,
          verified: client.verifiedAt !== null,
        };
  }

  public async findClientOwnerUuid(clientId: string): Promise<string | undefined> {
    const client = await this.database.app.findUnique({
      select: { ownerUuid: true },
      where: { clientId },
    });
    return client?.ownerUuid ?? undefined;
  }

  public async isAllowedOrigin(origin: string): Promise<boolean> {
    const parsedOrigin = URL.parse(origin);
    if (parsedOrigin?.origin !== origin) {
      return false;
    }

    return (await this.allowedOrigins.get()).has(origin);
  }

  private async scanOrigins(): Promise<ReadonlySet<string>> {
    const clients = await this.database.app.findMany({ select: { redirectUris: true } });
    const origins = new Set<string>();
    for (const client of clients) {
      for (const redirectUri of client.redirectUris) {
        const origin = URL.parse(redirectUri)?.origin;
        if (origin !== undefined && origin !== 'null') {
          origins.add(origin);
        }
      }
    }
    return origins;
  }
}
