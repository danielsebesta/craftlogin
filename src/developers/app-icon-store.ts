import type { PrismaClient } from '../generated/prisma/client.js';

export interface StoredAppIcon {
  readonly data: Buffer;
  readonly hash: string;
}

export interface AppIconStore {
  findIcon(clientId: string): Promise<StoredAppIcon | undefined>;
}

export class PrismaAppIconStore implements AppIconStore {
  public constructor(private readonly database: PrismaClient) {}

  public async findIcon(clientId: string): Promise<StoredAppIcon | undefined> {
    const app = await this.database.app.findUnique({
      select: { iconHash: true, iconPng: true },
      where: { clientId },
    });
    const iconPng = app?.iconPng ?? null;
    const iconHash = app?.iconHash ?? null;
    if (iconPng === null || iconHash === null) {
      return undefined;
    }
    return { data: Buffer.from(iconPng), hash: iconHash };
  }
}
