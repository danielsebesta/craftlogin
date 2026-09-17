import minecraftProtocol, { type PacketMeta } from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import { markLoggedIn, markWorldReady } from '../../src/mc-server/disconnect.js';
import { MinecraftLobby, type LobbyCodeVerificationResult } from '../../src/mc-server/lobby.js';
import { presentVoidWorld } from '../../src/mc-server/void-world.js';
import { findAvailablePort } from './support/tcp-port.js';

const chatComponentSchema: z.ZodType<ChatComponent> = z.lazy(() =>
  z.object({
    text: z.string(),
    extra: z.array(chatComponentSchema).optional(),
  }),
);

interface ChatComponent {
  readonly text: string;
  readonly extra?: readonly ChatComponent[] | undefined;
}

describe('Minecraft void lobby', (): void => {
  it.each(['1.16.5', '1.19.4', '1.20.2', '1.21.4'])(
    'welcomes a player and answers chat on %s',
    async (version): Promise<void> => {
      const port = await findAvailablePort();
      const lobby = new MinecraftLobby({
        baseDomain: 'craftlogin.com',
        maxPlayers: 4,
        lifetimeMs: 5_000,
        promptCooldownMs: 0,
      });
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
        presentVoidWorld(client, {
          entityId: client.id,
          maxPlayers: 4,
          sendChunks: true,
        });
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

  it('verifies a code typed into lobby chat', async (): Promise<void> => {
    const port = await findAvailablePort();
    const lobby = new MinecraftLobby({
      baseDomain: 'craftlogin.com',
      maxPlayers: 4,
      lifetimeMs: 10_000,
      promptCooldownMs: 0,
      verifyCode: (_client, code): Promise<LobbyCodeVerificationResult> =>
        Promise.resolve(code === 'K7MPQ4RX' ? 'resolved' : 'unavailable'),
    });
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
      presentVoidWorld(client, {
        entityId: client.id,
        maxPlayers: 4,
        sendChunks: true,
      });
      markWorldReady(client);
      lobby.enter(client);
    });

    await new Promise<void>((resolve): void => {
      server.once('listening', resolve);
    });

    try {
      const outcome = await collectCodeVerification(port);

      expect(outcome.invalidReply).toBe(true);
      expect(outcome.kick).toContain(english.minecraft.success);
      // The limbo chamber on 1.21.4: Slowness, Blindness, Darkness by registry id.
      expect(outcome.effects).toEqual([1, 14, 32]);
    } finally {
      server.close();
    }
  }, 10_000);

  it('declares /verify as a valid command on 1.21.4', async (): Promise<void> => {
    const port = await findAvailablePort();
    const lobby = new MinecraftLobby({
      baseDomain: 'craftlogin.com',
      maxPlayers: 4,
      lifetimeMs: 10_000,
      promptCooldownMs: 0,
    });
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
      presentVoidWorld(client, {
        entityId: client.id,
        maxPlayers: 4,
        sendChunks: true,
      });
      markWorldReady(client);
      lobby.enter(client);
    });

    await new Promise<void>((resolve): void => {
      server.once('listening', resolve);
    });

    try {
      const declared = await collectDeclaredCommands(port);
      expect(declared).toBe(true);
    } finally {
      server.close();
    }
  }, 10_000);
});

function flattenChatComponent(component: ChatComponent): string {
  return component.text + (component.extra ?? []).map(flattenChatComponent).join('');
}

interface CodeVerificationOutcome {
  readonly invalidReply: boolean;
  readonly effects: readonly number[];
  readonly kick?: string | undefined;
}

async function collectCodeVerification(port: number): Promise<CodeVerificationOutcome> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'LobbyCodeTest',
    version: '1.21.4',
  });

  let welcomed = false;
  let invalidReply = false;
  const receivedEffects: number[] = [];

  return await new Promise<CodeVerificationOutcome>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      resolve({ invalidReply, effects: receivedEffects });
    }, 8_000);

    const onChat = (data: { formattedMessage: string }): void => {
      const parsed: unknown = JSON.parse(data.formattedMessage);
      const component = chatComponentSchema.safeParse(parsed);
      if (!component.success) {
        return;
      }

      const text = flattenChatComponent(component.data);
      if (!welcomed && text.includes(english.minecraft.lobbyWelcome)) {
        welcomed = true;
        client.chat('AAAAAAAA');
      } else if (welcomed && !invalidReply && text.includes(english.minecraft.lobbyInvalidCode)) {
        invalidReply = true;
        client.chat('/verify K7MPQ4RX');
      }
    };

    client.on('systemChat', onChat);
    client.on('playerChat', onChat);
    client.on('entity_effect', (packet: unknown): void => {
      const parsed = z.object({ effectId: z.number() }).safeParse(packet);
      if (parsed.success) {
        receivedEffects.push(parsed.data.effectId);
      }
    });
    client.once('kick_disconnect', (packet: unknown): void => {
      clearTimeout(timeout);
      const parsed = z.object({ reason: z.unknown() }).safeParse(packet);
      const kick = parsed.success ? extractLobbyKick(parsed.data.reason) : null;
      client.end();
      resolve({ invalidReply, effects: receivedEffects, ...(kick === null ? {} : { kick }) });
    });
    client.once('error', (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function extractLobbyKick(rawReason: unknown): string | null {
  if (typeof rawReason === 'string') {
    const parsed: unknown = JSON.parse(rawReason);
    const component = chatComponentSchema.safeParse(parsed);
    return component.success ? flattenChatComponent(component.data) : null;
  }

  return flattenNbtChatComponent(rawReason);
}

const nbtChatEntrySchema = z.object({
  text: z.object({ value: z.string() }),
  color: z.object({ value: z.string() }),
});

const nbtChatComponentSchema = z.object({
  value: z.object({
    text: z.object({ value: z.string() }),
    extra: z
      .object({
        value: z.object({ value: z.array(nbtChatEntrySchema) }),
      })
      .optional(),
  }),
});

function flattenNbtChatComponent(rawReason: unknown): string | null {
  const parsed = nbtChatComponentSchema.safeParse(rawReason);
  if (!parsed.success) {
    return null;
  }
  const extra = parsed.data.value.extra?.value.value ?? [];
  return parsed.data.value.text.value + extra.map((entry): string => entry.text.value).join('');
}

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
  let chatSent = false;

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

      const text = flattenChatComponent(component.data);
      messages.push(text);
      if (!chatSent && text.includes(english.minecraft.lobbyWelcome)) {
        chatSent = true;
        client.chat('hello CraftLogin');
      }
      if (text.includes(english.minecraft.lobbyHint)) {
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

async function collectDeclaredCommands(port: number): Promise<boolean> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'LobbyCommandTest',
    version: '1.21.4',
  });

  return await new Promise<boolean>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      resolve(false);
    }, 5_000);

    client.on('packet', (_packet: unknown, metadata: PacketMeta): void => {
      if (metadata.name === 'declare_commands') {
        clearTimeout(timeout);
        client.end();
        resolve(true);
      }
    });
    client.once('error', (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
