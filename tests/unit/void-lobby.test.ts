import minecraftProtocol from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import { markLoggedIn, markWorldReady } from '../../src/mc-server/disconnect.js';
import { MinecraftLobby } from '../../src/mc-server/lobby.js';
import { presentVoidWorld } from '../../src/mc-server/void-world.js';
import { findAvailablePort } from './support/tcp-port.js';

const chatComponentSchema = z.object({ text: z.string() });

describe('Minecraft void lobby', (): void => {
  it.each(['1.16.5', '1.19.4', '1.20.2', '1.21.4'])(
    'welcomes a player and answers chat on %s',
    async (version): Promise<void> => {
      const port = await findAvailablePort();
      const lobby = new MinecraftLobby({ maxPlayers: 4, lifetimeMs: 5_000, promptCooldownMs: 0 });
      const server = minecraftProtocol.createServer({
        host: '127.0.0.1',
        port,
        version: false,
        'online-mode': false,
        hideErrors: true,
        keepAlive: false,
        motd: 'CraftLogin lobby test',
        maxPlayers: 4,
      });

      server.on('login', (client): void => {
        markLoggedIn(client);
      });
      server.on('playerJoin', (client): void => {
        presentVoidWorld(client, { entityId: client.id, maxPlayers: 4 });
        markWorldReady(client);
        lobby.enter(client);
      });

      await new Promise<void>((resolve): void => {
        server.once('listening', resolve);
      });

      try {
        const messages = await collectLobbyMessages(port, version);

        expect(messages[0]).toContain(english.minecraft.lobbyWelcome);
        expect(
          messages.some((message): boolean => message.includes(english.minecraft.lobbyHint)),
        ).toBe(true);
      } finally {
        server.close();
      }
    },
    10_000,
  );
});

async function collectLobbyMessages(port: number, version: string): Promise<string[]> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'LobbyTest',
    version,
  });

  const messages: string[] = [];

  return await new Promise<string[]>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      resolve(messages);
    }, 4_000);

    const onChat = (data: { formattedMessage: string }): void => {
      const parsed: unknown = JSON.parse(data.formattedMessage);
      const component = chatComponentSchema.safeParse(parsed);
      if (!component.success) {
        return;
      }

      messages.push(component.data.text);
      if (messages.length === 1) {
        client.chat('hello CraftLogin');
      }
      if (messages.length >= 2) {
        clearTimeout(timeout);
        client.end();
        resolve(messages);
      }
    };

    client.on('systemChat', onChat);
    client.on('playerChat', onChat);
    client.once('error', (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
