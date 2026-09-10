import minecraftProtocol from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { disconnect, markLoggedIn, markWorldReady } from '../../src/mc-server/disconnect.js';
import { findAvailablePort } from './support/tcp-port.js';

const message = 'Verification complete. You can return to your browser.';
const chatComponentSchema = z.object({ text: z.string() });
const nbtTextSchema = z.object({
  value: z.object({
    text: z.object({
      value: z.string(),
    }),
  }),
});

type DisconnectStage = 'after-login' | 'before-login';

describe('Minecraft disconnect delivery', (): void => {
  it('delivers a pre-login rejection as a login disconnect', async (): Promise<void> => {
    const delivery = await deliverDisconnect('before-login');

    expect(delivery.packet).toBe('disconnect');
    expect(delivery.text).toBe(message);
  });

  it('delivers a post-login kick as a play disconnect after configuration', async (): Promise<void> => {
    // Regression: a login-state disconnect sent after the login success packet is dropped by the
    // client, which then only surfaces a generic connection error to the player.
    const delivery = await deliverDisconnect('after-login');

    expect(delivery.packet).toBe('kick_disconnect');
    expect(delivery.text).toBe(message);
  });
});

async function deliverDisconnect(
  stage: DisconnectStage,
): Promise<{ packet: string; text: string }> {
  const port = await findAvailablePort();
  const server = minecraftProtocol.createServer({
    host: '127.0.0.1',
    port,
    version: false,
    'online-mode': false,
    hideErrors: true,
    keepAlive: false,
    motd: 'CraftLogin test server',
    maxPlayers: 1,
  });

  server.on('connection', (client): void => {
    if (stage === 'before-login') {
      client.once('set_protocol', (): void => {
        void disconnect(client, message);
      });
    }
  });
  server.on('login', (client): void => {
    if (stage === 'after-login') {
      markLoggedIn(client);
      // The kick must wait until the void world has been presented to be a valid play-state kick.
      void disconnect(client, message);
    }
  });
  server.on('playerJoin', (client): void => {
    if (stage === 'after-login') {
      markWorldReady(client);
    }
  });

  await new Promise<void>((resolve): void => {
    server.once('listening', resolve);
  });

  try {
    return await collectDisconnect(port);
  } finally {
    server.close();
  }
}

async function collectDisconnect(port: number): Promise<{ packet: string; text: string }> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'DisconnectTest',
    version: '1.21.4',
  });

  return await new Promise<{ packet: string; text: string }>((resolve, reject): void => {
    let settled = false;
    const timeout = setTimeout((): void => {
      settled = true;
      client.end();
      reject(new Error('Minecraft client did not receive a disconnect packet'));
    }, 5_000);

    const deliver = (packet: string, rawReason: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.end();

      try {
        resolve({ packet, text: extractMessage(packet, rawReason) });
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error('Invalid disconnect reason'));
      }
    };

    client.once('disconnect', (packet: unknown): void => {
      const parsed = z.object({ reason: z.unknown() }).safeParse(packet);
      if (parsed.success) {
        deliver('disconnect', parsed.data.reason);
      }
    });
    client.once('kick_disconnect', (packet: unknown): void => {
      const parsed = z.object({ reason: z.unknown() }).safeParse(packet);
      if (parsed.success) {
        deliver('kick_disconnect', parsed.data.reason);
      }
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
      reject(new Error(`Minecraft connection ended before disconnect: ${reason}`));
    });
  });
}

function extractMessage(packet: string, rawReason: unknown): string {
  if (packet === 'kick_disconnect' && typeof rawReason !== 'string') {
    const parsed = nbtTextSchema.safeParse(rawReason);
    if (!parsed.success) {
      throw new Error('Unrecognised NBT disconnect reason');
    }
    return parsed.data.value.text.value;
  }

  const parsedReason: unknown = JSON.parse(z.string().parse(rawReason));
  return chatComponentSchema.parse(parsedReason).text;
}
