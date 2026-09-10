import { describe, expect, it } from 'vitest';

import { resolveDeveloperIdentifier } from '../../src/developers/developer-identifier.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';

const uuid = '069a79f4-44e9-4726-a5be-fca90e38aaf5';

function players(
  find: (name: string) => Promise<{ username: string; uuid: string } | undefined>,
): MinecraftPlayerLookup {
  return {
    findProfileById: (): Promise<undefined> => Promise.resolve(undefined),
    findProfileByName: find,
  };
}

describe('resolveDeveloperIdentifier', (): void => {
  it('canonicalizes a dashed or compact UUID without a lookup', async (): Promise<void> => {
    const offline = players((): Promise<undefined> => Promise.resolve(undefined));

    await expect(resolveDeveloperIdentifier(uuid, offline)).resolves.toBe(uuid);
    await expect(resolveDeveloperIdentifier(uuid.replaceAll('-', ''), offline)).resolves.toBe(uuid);
  });

  it('resolves a Minecraft name through the player lookup', async (): Promise<void> => {
    const lookup = players((name) =>
      Promise.resolve(name === 'Notch' ? { username: 'Notch', uuid } : undefined),
    );

    await expect(resolveDeveloperIdentifier('Notch', lookup)).resolves.toBe(uuid);
    await expect(resolveDeveloperIdentifier('  Notch  ', lookup)).resolves.toBe(uuid);
  });

  it('returns undefined for an unknown name, an empty value, or no lookup', async (): Promise<void> => {
    const lookup = players((): Promise<undefined> => Promise.resolve(undefined));

    await expect(resolveDeveloperIdentifier('Nobody', lookup)).resolves.toBeUndefined();
    await expect(resolveDeveloperIdentifier('', lookup)).resolves.toBeUndefined();
    await expect(resolveDeveloperIdentifier('Notch', undefined)).resolves.toBeUndefined();
  });

  it('returns undefined when the player lookup fails', async (): Promise<void> => {
    const failing = players((): Promise<undefined> => Promise.reject(new Error('offline')));

    await expect(resolveDeveloperIdentifier('Notch', failing)).resolves.toBeUndefined();
  });
});
