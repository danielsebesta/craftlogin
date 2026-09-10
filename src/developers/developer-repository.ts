import { z } from 'zod';

import {
  DeveloperRole as PrismaDeveloperRole,
  Prisma,
  type PrismaClient,
} from '../generated/prisma/client.js';
import { authenticatedMinecraftPlayerSchema } from '../verification/types.js';

const MAX_TRANSACTION_ATTEMPTS = 4;

export const developerRoleSchema = z.enum(['developer', 'admin']);
export const developerUuidSchema = authenticatedMinecraftPlayerSchema.shape.uuid;

export type DeveloperRole = z.infer<typeof developerRoleSchema>;

export interface DeveloperAccess {
  readonly createdAt: string;
  readonly role: DeveloperRole;
  readonly uuid: string;
}

export interface DeveloperAccessRepository {
  find(uuid: string): Promise<DeveloperAccess | undefined>;
  grant(uuid: string, role: DeveloperRole): Promise<DeveloperAccess>;
  list(): Promise<readonly DeveloperAccess[]>;
  revoke(uuid: string): Promise<boolean>;
}

export class LastAdministratorError extends Error {
  public override readonly name = 'LastAdministratorError';
}

export class PrismaDeveloperAccessRepository implements DeveloperAccessRepository {
  public constructor(private readonly database: PrismaClient) {}

  public async find(uuidInput: string): Promise<DeveloperAccess | undefined> {
    const uuid = developerUuidSchema.parse(uuidInput);
    const developer = await this.database.developer.findUnique({ where: { uuid } });
    return developer === null ? undefined : toDeveloperAccess(developer);
  }

  public async grant(uuidInput: string, roleInput: DeveloperRole): Promise<DeveloperAccess> {
    const uuid = developerUuidSchema.parse(uuidInput);
    const role = developerRoleSchema.parse(roleInput);

    return await this.withSerializableRetry(async (transaction): Promise<DeveloperAccess> => {
      const current = await transaction.developer.findUnique({ where: { uuid } });
      if (
        current?.role === PrismaDeveloperRole.ADMIN &&
        role === 'developer' &&
        (await transaction.developer.count({
          where: { role: PrismaDeveloperRole.ADMIN },
        })) <= 1
      ) {
        throw new LastAdministratorError('The final administrator cannot be demoted');
      }

      const developer = await transaction.developer.upsert({
        create: { role: toPrismaRole(role), uuid },
        update: { role: toPrismaRole(role) },
        where: { uuid },
      });
      return toDeveloperAccess(developer);
    });
  }

  public async list(): Promise<readonly DeveloperAccess[]> {
    const developers = await this.database.developer.findMany({
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }, { uuid: 'asc' }],
    });
    return developers.map(toDeveloperAccess);
  }

  public async revoke(uuidInput: string): Promise<boolean> {
    const uuid = developerUuidSchema.parse(uuidInput);
    return await this.withSerializableRetry(async (transaction): Promise<boolean> => {
      const current = await transaction.developer.findUnique({ where: { uuid } });
      if (current === null) {
        return false;
      }
      if (
        current.role === PrismaDeveloperRole.ADMIN &&
        (await transaction.developer.count({
          where: { role: PrismaDeveloperRole.ADMIN },
        })) <= 1
      ) {
        throw new LastAdministratorError('The final administrator cannot be revoked');
      }

      await transaction.developer.delete({ where: { uuid } });
      return true;
    });
  }

  private async withSerializableRetry<Result>(
    operation: (transaction: Prisma.TransactionClient) => Promise<Result>,
  ): Promise<Result> {
    for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.database.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error: unknown) {
        if (!isRetryableTransactionConflict(error) || attempt === MAX_TRANSACTION_ATTEMPTS - 1) {
          throw error;
        }
      }
    }
    throw new Error('Serializable developer access transaction did not complete');
  }
}

interface StoredDeveloper {
  readonly createdAt: Date;
  readonly role: (typeof PrismaDeveloperRole)[keyof typeof PrismaDeveloperRole];
  readonly uuid: string;
}

function toDeveloperAccess(developer: StoredDeveloper): DeveloperAccess {
  return {
    createdAt: developer.createdAt.toISOString(),
    role: developer.role === PrismaDeveloperRole.ADMIN ? 'admin' : 'developer',
    uuid: developer.uuid,
  };
}

function toPrismaRole(
  role: DeveloperRole,
): (typeof PrismaDeveloperRole)[keyof typeof PrismaDeveloperRole] {
  return role === 'admin' ? PrismaDeveloperRole.ADMIN : PrismaDeveloperRole.DEVELOPER;
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}
