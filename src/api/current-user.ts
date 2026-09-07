import type { PrismaClient } from '../generated/prisma/client.js';

export interface CurrentUser {
  readonly username: string;
  readonly uuid: string;
}

export interface CurrentUserLookup {
  findCurrentUser(uuid: string): Promise<CurrentUser | undefined>;
}

export class PrismaCurrentUserLookup implements CurrentUserLookup {
  public constructor(private readonly database: PrismaClient) {}

  public async findCurrentUser(uuid: string): Promise<CurrentUser | undefined> {
    const user = await this.database.user.findUnique({
      where: { uuid },
      select: { username: true, uuid: true },
    });
    return user ?? undefined;
  }
}
