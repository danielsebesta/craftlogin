import type { PrismaClient } from '../generated/prisma/client.js';
import type { ClientDirectoryEntry, ClientDirectoryLookup } from './interaction-routes.js';

export interface RegisteredOriginLookup {
  isAllowedOrigin(origin: string): Promise<boolean>;
}

export class PrismaClientDirectory implements ClientDirectoryLookup, RegisteredOriginLookup {
  public constructor(private readonly database: PrismaClient) {}

  public async findClient(clientId: string): Promise<ClientDirectoryEntry | undefined> {
    const client = await this.database.app.findUnique({
      select: { name: true, verifiedAt: true },
      where: { clientId },
    });
    return client === null
      ? undefined
      : { name: client.name, verified: client.verifiedAt !== null };
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

    const clients = await this.database.app.findMany({ select: { redirectUris: true } });
    return clients.some((client): boolean =>
      client.redirectUris.some((redirectUri): boolean => URL.parse(redirectUri)?.origin === origin),
    );
  }
}
