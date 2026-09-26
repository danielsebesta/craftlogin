import minecraftProtocol, { type PacketMeta } from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import {
  disconnect,
  markLoggedIn,
  markWorldReady,
  type DisconnectTone,
} from '../../src/mc-server/disconnect.js';
import { MinecraftLobby, type LobbyCodeVerificationResult } from '../../src/mc-server/lobby.js';
import { presentVoidWorld } from '../../src/mc-server/void-world.js';
import { findAvailablePort } from './support/tcp-port.js';

const message = 'Verification complete. You can return to your browser.';

const chatComponentSchema: z.ZodType<ChatComponent> = z.lazy(() =>
  z.object({
    text: z.string(),
    extra: z.array(chatComponentSchema).optional(),
  }),
);
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
const flatReasonSchema = z.object({ text: z.string(), color: z.string() });
const nbtTextSchema = z.object({
  value: z.object({
    text: z.object({
      value: z.string(),
    }),
    color: z.object({
      value: z.string(),
    }),
  }),
});

interface ChatComponent {
  readonly text: string;
  readonly extra?: readonly ChatComponent[] | undefined;
}

type DisconnectStage = 'after-login' | 'before-login';

async function createTestServer(
  lobby?: MinecraftLobby,
): Promise<{ port: number; server: ReturnType<typeof minecraftProtocol.createServer> }> {
  const port = await findAvailablePort();
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
    lobby?.enter(client);
  });

  await new Promise<void>((resolve): void => {
    server.once('listening', resolve);
  });
  return { port, server };
}

describe('Minecraft void lobby', (): void => {
  it.each(['1.16.5', '1.19.4', '1.20.2', '1.21.4'])(
    'welcomes a player and answers chat on %s',
    async (version): Promise<void> => {
      const lobby = new MinecraftLobby({
        baseDomain: 'craftlogin.com',
        maxPlayers: 4,
        lifetimeMs: 5_000,
        promptCooldownMs: 0,
      });
      const { port, server } = await createTestServer(lobby);

      try {
        const messages = await collectLobbyMessages(port, version);

        expect(messages[0]).toContain(english.minecraft.lobbyWelcome);
        expect(messages.some((entry): boolean => entry.includes(english.minecraft.lobbyHint))).toBe(
          true,
        );
      } finally {
        server.close();
      }
    },
    10_000,
  );

  it('verifies a code typed into lobby chat', async (): Promise<void> => {
    const lobby = new MinecraftLobby({
      baseDomain: 'craftlogin.com',
      maxPlayers: 4,
      lifetimeMs: 10_000,
      promptCooldownMs: 0,
      verifyCode: (_client, code): Promise<LobbyCodeVerificationResult> =>
        Promise.resolve(code === 'K7MPQ4RX' ? 'resolved' : 'unavailable'),
    });
    const { port, server } = await createTestServer(lobby);

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
    const lobby = new MinecraftLobby({
      baseDomain: 'craftlogin.com',
      maxPlayers: 4,
      lifetimeMs: 10_000,
      promptCooldownMs: 0,
    });
    const { port, server } = await createTestServer(lobby);

    try {
      const declared = await collectDeclaredCommands(port);
      expect(declared).toBe(true);
    } finally {
      server.close();
    }
  }, 10_000);
});

describe('Minecraft disconnect delivery', (): void => {
  it('delivers a pre-login rejection as a neutral login disconnect', async (): Promise<void> => {
    const delivery = await deliverDisconnect('before-login');

    expect(delivery.packet).toBe('disconnect');
    expect(delivery.text).toBe(message);
    expect(delivery.color).toBe('#E9ECE9');
  });

  it('delivers post-login kicks in the requested tone after configuration', async (): Promise<void> => {
    // Regression: a login-state disconnect sent after login success is dropped,
    // surfacing to the player as a generic connection error.
    for (const [tone, color] of [
      [undefined, '#E9ECE9'],
      ['success', '#A2D060'],
      ['error', '#F47B74'],
    ] as const) {
      const delivery = await deliverDisconnect('after-login', tone);
      expect(delivery.packet, tone ?? 'default').toBe('kick_disconnect');
      expect(delivery.text, tone ?? 'default').toBe(message);
      expect(delivery.color, tone ?? 'default').toBe(color);
    }
  });
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

async function deliverDisconnect(
  stage: DisconnectStage,
  tone?: DisconnectTone,
): Promise<{ packet: string; text: string; color: string }> {
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
        void disconnect(client, message, tone === undefined ? {} : { tone });
      });
    }
  });
  server.on('login', (client): void => {
    if (stage === 'after-login') {
      markLoggedIn(client);
      // The kick must wait until the void world has been presented to be a valid play-state kick.
      void disconnect(client, message, tone === undefined ? {} : { tone });
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

async function collectDisconnect(port: number): Promise<{
  packet: string;
  text: string;
  color: string;
}> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'DisconnectTest',
    version: '1.21.4',
  });

  return await new Promise<{ packet: string; text: string; color: string }>(
    (resolve, reject): void => {
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
          resolve({ packet, ...extractComponent(packet, rawReason) });
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
    },
  );
}

function extractComponent(packet: string, rawReason: unknown): { text: string; color: string } {
  if (packet === 'kick_disconnect' && typeof rawReason !== 'string') {
    const parsed = nbtTextSchema.safeParse(rawReason);
    if (!parsed.success) {
      throw new Error('Unrecognised NBT disconnect reason');
    }
    return { text: parsed.data.value.text.value, color: parsed.data.value.color.value };
  }

  const parsedReason: unknown = JSON.parse(z.string().parse(rawReason));
  return flatReasonSchema.parse(parsedReason);
}
