import type { Account, FindAccount } from 'oidc-provider';

import type { PrismaClient } from '../generated/prisma/client.js';
import type { MinecraftUsernameResolver } from '../users/username-resolver.js';

export interface AccountUser {
  readonly username: string;
  readonly uuid: string;
}

export interface AccountUserStore {
  findAccountUser(uuid: string): Promise<AccountUser | undefined>;
}

export class PrismaAccountUserStore implements AccountUserStore {
  public constructor(private readonly database: PrismaClient) {}

  public async findAccountUser(uuid: string): Promise<AccountUser | undefined> {
    const user = await this.database.user.findUnique({
      where: { uuid },
      select: { username: true, uuid: true },
    });
    return user ?? undefined;
  }
}

export interface AccountLookupOptions {
  readonly issuer: string;
  readonly usernames?: MinecraftUsernameResolver;
}

export interface AccountClaims {
  readonly [claim: string]: unknown;
  readonly picture: string;
  readonly preferred_username: string;
  readonly sub: string;
}

export function buildAccountClaims(
  user: AccountUser,
  options: AccountLookupOptions,
): () => Promise<AccountClaims> {
  return async (): Promise<AccountClaims> => {
    const username =
      options.usernames === undefined
        ? user.username
        : await options.usernames.resolve(user.uuid, user.username);
    return {
      picture: `${options.issuer}/avatar/${user.uuid}`,
      preferred_username: username,
      sub: user.uuid,
    };
  };
}

export function createAccountLookup(
  store: AccountUserStore,
  options: AccountLookupOptions,
): FindAccount {
  return async (_context, accountId): Promise<Account | undefined> => {
    const user = await store.findAccountUser(accountId);
    if (user === undefined) {
      return undefined;
    }

    return {
      accountId: user.uuid,
      claims: buildAccountClaims(user, options),
    };
  };
}
