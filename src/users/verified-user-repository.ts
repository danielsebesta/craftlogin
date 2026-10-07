import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthenticatedMinecraftPlayer } from '../verification/types.js';

export interface VerifiedUserRepository {
  upsertVerifiedUser(player: AuthenticatedMinecraftPlayer, verifiedAt: Date): Promise<void>;
}

export class PrismaVerifiedUserRepository implements VerifiedUserRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async upsertVerifiedUser(
    player: AuthenticatedMinecraftPlayer,
    verifiedAt: Date,
  ): Promise<void> {
    // Arrival order is not verification order. Keep both timestamps monotonic
    // and never let a slower, older verification overwrite the current name.
    await this.database.$executeRaw`
      INSERT INTO "User" ("uuid", "username", "firstVerifiedAt", "lastVerifiedAt")
      VALUES (${player.uuid}::uuid, ${player.username}, ${verifiedAt}, ${verifiedAt})
      ON CONFLICT ("uuid") DO UPDATE SET
        "firstVerifiedAt" = LEAST("User"."firstVerifiedAt", EXCLUDED."firstVerifiedAt"),
        "lastVerifiedAt" = GREATEST("User"."lastVerifiedAt", EXCLUDED."lastVerifiedAt"),
        "username" = CASE WHEN EXCLUDED."lastVerifiedAt" > "User"."lastVerifiedAt"
          THEN EXCLUDED."username" ELSE "User"."username" END
    `;
  }
}
