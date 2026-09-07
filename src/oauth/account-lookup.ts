import type { Account, FindAccount } from 'oidc-provider';

import type { PrismaClient } from '../generated/prisma/client.js';

export function createAccountLookup(database: PrismaClient): FindAccount {
  return async (_context, accountId): Promise<Account | undefined> => {
    const user = await database.user.findUnique({
      where: { uuid: accountId },
      select: { uuid: true, username: true },
    });
    if (user === null) {
      return undefined;
    }

    return {
      accountId: user.uuid,
      claims: (): { sub: string; preferred_username: string } => ({
        sub: user.uuid,
        preferred_username: user.username,
      }),
    };
  };
}
