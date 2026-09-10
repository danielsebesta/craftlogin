import { describe, expect, it } from 'vitest';

import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import { MojangUsernameResolver, type UsernameStore } from '../../src/users/username-resolver.js';

const playerUuid = '853c80ef-3c37-49fd-aa49-938b674adae6';

function lookup(
  profile: () => Promise<{ username: string; uuid: string } | undefined>,
): MinecraftPlayerLookup {
  return {
    findProfileById: profile,
    findProfileByName: (): Promise<undefined> => Promise.resolve(undefined),
  };
}

describe('MojangUsernameResolver', (): void => {
  it('persists and returns a refreshed username', async (): Promise<void> => {
    const updates: { username: string; uuid: string }[] = [];
    const store: UsernameStore = {
      updateUsername: (uuid, username) => {
        updates.push({ username, uuid });
        return Promise.resolve();
      },
    };
    const resolver = new MojangUsernameResolver(
      lookup(() => Promise.resolve({ username: 'NewName', uuid: playerUuid })),
      store,
    );

    await expect(resolver.resolve(playerUuid, 'OldName')).resolves.toBe('NewName');
    expect(updates).toEqual([{ username: 'NewName', uuid: playerUuid }]);
  });

  it('keeps the stored username when it already matches', async (): Promise<void> => {
    const store: UsernameStore = {
      updateUsername: () => Promise.reject(new Error('should not persist')),
    };
    const resolver = new MojangUsernameResolver(
      lookup(() => Promise.resolve({ username: 'SameName', uuid: playerUuid })),
      store,
    );

    await expect(resolver.resolve(playerUuid, 'SameName')).resolves.toBe('SameName');
  });

  it('falls back to the stored username when Minecraft is unavailable', async (): Promise<void> => {
    const store: UsernameStore = {
      updateUsername: () => Promise.reject(new Error('should not persist')),
    };
    const resolver = new MojangUsernameResolver(
      lookup(() => Promise.reject(new Error('offline'))),
      store,
    );

    await expect(resolver.resolve(playerUuid, 'StoredName')).resolves.toBe('StoredName');
  });
});
