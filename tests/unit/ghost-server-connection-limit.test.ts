import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logging/logger.js';
import { type MinecraftGhostServer, startGhostServer } from '../../src/mc-server/ghost-server.js';
import { findAvailablePort } from './support/tcp-port.js';

const MAX_CONNECTIONS_PER_ADDRESS = 64;

describe('Minecraft ghost server connection limits', (): void => {
  let ghostServer: MinecraftGhostServer | undefined;
  const sockets: Socket[] = [];

  afterEach(async (): Promise<void> => {
    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.length = 0;
    await ghostServer?.close();
    ghostServer = undefined;
  });

  it('rejects connections past the per-address cap and releases closed slots', async (): Promise<void> => {
    const port = await findAvailablePort();
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
      {
        logger: createLogger('silent'),
        pendingCodes: { hasPendingCode: (): Promise<boolean> => Promise.resolve(false) },
        resolver: { resolve: (): Promise<'unavailable'> => Promise.resolve('unavailable') },
      },
    );

    // Idle sockets up to the cap are accepted and stay open.
    for (let index = 0; index < MAX_CONNECTIONS_PER_ADDRESS; index += 1) {
      const socket = createConnection({ host: '127.0.0.1', port });
      await once(socket, 'connect');
      sockets.push(socket);
    }

    // The next socket is destroyed before any protocol work happens.
    const rejected = createConnection({ host: '127.0.0.1', port });
    await once(rejected, 'connect');
    await Promise.race([
      once(rejected, 'close'),
      new Promise((_resolve, reject): void => {
        setTimeout(() => {
          reject(new Error('Over-limit socket stayed open'));
        }, 2_000);
      }),
    ]);

    // Releasing an accepted socket frees its slot for a replacement.
    sockets.pop()?.destroy();
    let accepted = false;
    for (let attempt = 0; attempt < 20 && !accepted; attempt += 1) {
      const candidate = createConnection({ host: '127.0.0.1', port });
      await once(candidate, 'connect');
      const closedEarly = await Promise.race([
        once(candidate, 'close').then((): boolean => true),
        new Promise<boolean>((resolve): void => {
          setTimeout(() => {
            resolve(false);
          }, 200);
        }),
      ]);
      if (closedEarly) {
        await new Promise<void>((resolve): void => {
          setTimeout(resolve, 50);
        });
      } else {
        accepted = true;
        sockets.push(candidate);
      }
    }
    expect(accepted).toBe(true);
  }, 15_000);
});
