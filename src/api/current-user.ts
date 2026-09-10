import type { PrismaClient } from '../generated/prisma/client.js';
import type { MinecraftUsernameResolver } from '../users/username-resolver.js';

export interface CurrentUser {
  readonly username: string;
  readonly uuid: string;
}

export interface CurrentUserLookup {
  findCurrentUser(uuid: string): Promise<CurrentUser | undefined>;
}

export class PrismaCurrentUserLookup implements CurrentUserLookup {
  public constructor(
    private readonly database: PrismaClient,
    private readonly usernames?: MinecraftUsernameResolver,
  ) {}

  public async findCurrentUser(uuid: string): Promise<CurrentUser | undefined> {
    const user = await this.database.user.findUnique({
      where: { uuid },
      select: { username: true, uuid: true },
    });
    if (user === null) {
      return undefined;
    }
    const username =
      this.usernames === undefined
        ? user.username
        : await this.usernames.resolve(user.uuid, user.username);
    return { username, uuid: user.uuid };
  }
}
