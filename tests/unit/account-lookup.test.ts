import { describe, expect, it } from 'vitest';

import { buildAccountClaims, type AccountUser } from '../../src/oauth/account-lookup.js';
import type { MinecraftUsernameResolver } from '../../src/users/username-resolver.js';

const user: AccountUser = {
  username: 'StoredName',
  uuid: '123e4567-e89b-42d3-a456-426614174000',
};
const issuer = 'https://craftlogin.com';

describe('buildAccountClaims', (): void => {
  it('publishes the stored username and an avatar picture URL', async (): Promise<void> => {
    const claims = await buildAccountClaims(user, { issuer })();

    expect(claims).toEqual({
      picture: `${issuer}/avatar/${user.uuid}`,
      preferred_username: 'StoredName',
      sub: user.uuid,
    });
  });

  it('uses a refreshed username when a resolver is configured', async (): Promise<void> => {
    const usernames: MinecraftUsernameResolver = {
      resolve: (uuid, stored) => Promise.resolve(uuid === user.uuid ? 'FreshName' : stored),
    };

    const claims = await buildAccountClaims(user, { issuer, usernames })();

    expect(claims.preferred_username).toBe('FreshName');
    expect(claims.picture).toBe(`${issuer}/avatar/${user.uuid}`);
  });
});
