import type { PrismaClient } from '../generated/prisma/client.js';
import type { MinecraftPlayerLookup } from '../mojang/client.js';

export interface MinecraftUsernameResolver {
  resolve(uuid: string, storedUsername: string): Promise<string>;
}

export interface UsernameStore {
  updateUsername(uuid: string, username: string): Promise<void>;
}

export class PrismaUsernameStore implements UsernameStore {
  public constructor(private readonly database: PrismaClient) {}

  public async updateUsername(uuid: string, username: string): Promise<void> {
    await this.database.user.update({ data: { username }, where: { uuid } });
  }
}

export class MojangUsernameResolver implements MinecraftUsernameResolver {
  public constructor(
    private readonly players: MinecraftPlayerLookup,
    private readonly store: UsernameStore,
  ) {}

  public async resolve(uuid: string, storedUsername: string): Promise<string> {
    try {
      const profile = await this.players.findProfileById(uuid);
      if (profile === undefined || profile.username === storedUsername) {
        return storedUsername;
      }
      await this.store.updateUsername(uuid, profile.username);
      return profile.username;
    } catch {
      // A stale username is preferable to failing an authenticated request.
      return storedUsername;
    }
  }
}
