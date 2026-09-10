import type { PrismaClient } from '../generated/prisma/client.js';
import {
  developerRoleSchema,
  developerUuidSchema,
  type DeveloperRole,
} from './developer-repository.js';
import { z } from 'zod';

const appIdSchema = z.uuid();

export interface ManagedApp {
  readonly clientId: string;
  readonly clientType: 'confidential' | 'public';
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly ownerUuid?: string;
  readonly redirectUris: readonly string[];
}

export interface AppManager {
  list(actorUuid: string, actorRole: DeveloperRole): Promise<readonly ManagedApp[]>;
  remove(appId: string, actorUuid: string, actorRole: DeveloperRole): Promise<boolean>;
}

export class PrismaAppManager implements AppManager {
  public constructor(private readonly database: PrismaClient) {}

  public async list(actorUuid: string, actorRole: DeveloperRole): Promise<readonly ManagedApp[]> {
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const where = role === 'admin' ? {} : { ownerUuid: uuid };
    const apps = await this.database.app.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      where,
    });

    return apps.map((app): ManagedApp => ({
      clientId: app.clientId,
      clientType: app.clientSecretHash === null ? 'public' : 'confidential',
      createdAt: app.createdAt.toISOString(),
      id: app.id,
      name: app.name,
      ...(app.ownerUuid === null ? {} : { ownerUuid: app.ownerUuid }),
      redirectUris: app.redirectUris,
    }));
  }

  public async remove(
    appId: string,
    actorUuid: string,
    actorRole: DeveloperRole,
  ): Promise<boolean> {
    const id = appIdSchema.parse(appId);
    const uuid = developerUuidSchema.parse(actorUuid);
    const role = developerRoleSchema.parse(actorRole);
    const removed = await this.database.app.deleteMany({
      where: {
        id,
        ...(role === 'admin' ? {} : { ownerUuid: uuid }),
      },
    });
    return removed.count === 1;
  }
}
