import type { PrismaClient } from '../generated/prisma/client.js';
import type { ClientNameLookup } from './interaction-routes.js';

export interface RegisteredOriginLookup {
  isAllowedOrigin(origin: string): Promise<boolean>;
}

export class PrismaClientDirectory implements ClientNameLookup, RegisteredOriginLookup {
  public constructor(private readonly database: PrismaClient) {}

  public async findClientName(clientId: string): Promise<string | undefined> {
    const client = await this.database.app.findUnique({
      where: { clientId },
      select: { name: true },
    });
    return client?.name;
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
