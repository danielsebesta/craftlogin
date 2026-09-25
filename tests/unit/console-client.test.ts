import { describe, expect, it } from 'vitest';

import {
  CONSOLE_CLIENT_ID,
  CONSOLE_CLIENT_NAME,
  type ConsoleClientStore,
  ensureConsoleClient,
} from '../../src/developers/console-client.js';

type UpsertOptions = Parameters<ConsoleClientStore['app']['upsert']>[0];
type UpdateManyOptions = Parameters<ConsoleClientStore['app']['updateMany']>[0];

describe('ensureConsoleClient', (): void => {
  it('seeds the console atomically by its fixed client id', async (): Promise<void> => {
    const upserts: UpsertOptions[] = [];
    const updates: UpdateManyOptions[] = [];
    const store: ConsoleClientStore = {
      app: {
        upsert: (options: UpsertOptions): Promise<{ clientId: string; id: string }> => {
          upserts.push(options);
          return Promise.resolve({ clientId: options.create.clientId, id: 'internal-id' });
        },
        updateMany: (options: UpdateManyOptions): Promise<{ count: number }> => {
          updates.push(options);
          return Promise.resolve({ count: 1 });
        },
      },
    };

    const client = await ensureConsoleClient(store, 'https://craftlogin.com');

    expect(client).toEqual({
      clientId: CONSOLE_CLIENT_ID,
      redirectUri: 'https://craftlogin.com/developers/callback',
    });
    // One atomic upsert keyed on the stable client id — no separate create that could race.
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.where).toEqual({ clientId: CONSOLE_CLIENT_ID });
    expect(upserts[0]?.create).toMatchObject({
      clientId: CONSOLE_CLIENT_ID,
      clientSecretHash: null,
      name: CONSOLE_CLIENT_NAME,
      ownerUuid: null,
      redirectUris: ['https://craftlogin.com/developers/callback'],
    });
    expect(upserts[0]?.create.verifiedAt).toBeInstanceOf(Date);
    // The update path repairs name and callback but never touches ownership.
    expect(upserts[0]?.update).toEqual({
      name: CONSOLE_CLIENT_NAME,
      redirectUris: ['https://craftlogin.com/developers/callback'],
    });
    // The first-party label is restored only when it was stripped.
    expect(updates).toHaveLength(1);
    expect(updates[0]?.where).toEqual({ id: 'internal-id', verifiedAt: null });
  });
});
