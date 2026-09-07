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
    await this.database.user.upsert({
      where: { uuid: player.uuid },
      create: {
        uuid: player.uuid,
        username: player.username,
        firstVerifiedAt: verifiedAt,
        lastVerifiedAt: verifiedAt,
      },
      update: {
        username: player.username,
        lastVerifiedAt: verifiedAt,
      },
    });
  }
}
