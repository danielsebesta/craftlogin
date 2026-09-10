import minecraftProtocol from 'minecraft-protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import { createLogger } from '../../src/logging/logger.js';
import { type MinecraftGhostServer, startGhostServer } from '../../src/mc-server/ghost-server.js';
import { findAvailablePort } from './support/tcp-port.js';

const loginDisconnectSchema = z.object({ reason: z.string() });
const chatComponentSchema = z.object({ text: z.string() });

describe('Minecraft ghost server rejection', (): void => {
  let ghostServer: MinecraftGhostServer | undefined;

  afterEach(async (): Promise<void> => {
    await ghostServer?.close();
    ghostServer = undefined;
  });

  it('disconnects an expired or unknown code without attempting resolution', async (): Promise<void> => {
    const port = await findAvailablePort();
    let resolutionAttempts = 0;
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
      {
        logger: createLogger('silent'),
        pendingCodes: {
          hasPendingCode: (): Promise<boolean> => Promise.resolve(false),
        },
        resolver: {
          resolve: (): Promise<'unavailable'> => {
            resolutionAttempts += 1;
            return Promise.resolve('unavailable');
          },
        },
      },
    );

    const rawReason = await connectAndWaitForRejection(port);
    const parsedReason: unknown = JSON.parse(rawReason);

    expect(chatComponentSchema.parse(parsedReason).text).toBe(english.minecraft.unavailable);
    expect(resolutionAttempts).toBe(0);
  });
});

async function connectAndWaitForRejection(port: number): Promise<string> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    fakeHost: 'ABCDEFGH.craftlogin.com',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'ExpiredCodeTest',
    version: '1.20.2',
  });

  return await new Promise<string>((resolve, reject): void => {
    let settled = false;
    const timeout = setTimeout((): void => {
      settled = true;
      client.end();
      reject(new Error('Minecraft client did not receive a disconnect packet'));
    }, 5_000);

    client.once('disconnect', (packet: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.end();

      const parsedPacket = loginDisconnectSchema.safeParse(packet);
      if (!parsedPacket.success) {
        reject(new Error('Minecraft client received an invalid disconnect packet'));
        return;
      }
      resolve(parsedPacket.data.reason);
    });
    client.once('error', (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.end();
      reject(error);
    });
    client.once('end', (reason: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Minecraft connection ended before rejection: ${reason}`));
    });
  });
}
