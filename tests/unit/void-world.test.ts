import minecraftProtocol, { type PacketMeta } from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getChunkConstructor, getMinecraftData } from '../../src/mc-server/minecraft-data.js';
import { disconnect, markLoggedIn, markWorldReady } from '../../src/mc-server/disconnect.js';
import { installVersionedRegistryCodec } from '../../src/mc-server/registry-codec.js';
import {
  createChunkPacket,
  createJoinGamePacket,
  createPositionPacket,
  createVoidChatPacket,
  presentVoidWorld,
} from '../../src/mc-server/void-world.js';
import { findAvailablePort } from './support/tcp-port.js';

const kickMessage = 'Verification complete. You can return to your browser.';
const modernWorldStateSchema = z.object({
  gamemode: z.literal('spectator'),
  previousGamemode: z.literal(255),
  hashedSeed: z.tuple([z.literal(0), z.literal(0)]),
  isDebug: z.literal(false),
  isFlat: z.literal(true),
  portalCooldown: z.literal(0),
});

interface PacketSerializer {
  createPacketBuffer(packet: { name: string; params: Record<string, unknown> }): unknown;
}

describe('void world packet encoding', (): void => {
  it.each(minecraftProtocol.supportedVersions)(
    'encodes login, position, chat and chunk packets for %s',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const rawSerializer: unknown = minecraftProtocol.createSerializer({
        state: minecraftProtocol.states.PLAY,
        isServer: true,
        version,
        customPackets: {},
      });
      if (!isPacketSerializer(rawSerializer)) {
        throw new Error(`Minecraft serializer unavailable for ${version}`);
      }

      expect(() => {
        rawSerializer.createPacketBuffer({
          name: 'login',
          params: createJoinGamePacket(mcData, { entityId: 1, maxPlayers: 100 }),
        });
      }).not.toThrow();

      expect(() => {
        rawSerializer.createPacketBuffer({
          name: 'position',
          params: createPositionPacket(mcData),
        });
      }).not.toThrow();

      const chatPacket = createVoidChatPacket(mcData, 'Hello from CraftLogin');
      expect(() => {
        rawSerializer.createPacketBuffer({ name: chatPacket.name, params: chatPacket.params });
      }).not.toThrow();

      const chunkConstructor = getChunkConstructor(mcData);
      if (chunkConstructor !== null) {
        const chunk = new chunkConstructor();
        expect(() => {
          rawSerializer.createPacketBuffer({
            name: 'map_chunk',
            params: createChunkPacket(mcData, chunk, 0, 0),
          });
        }).not.toThrow();
      }
    },
  );

  it.each(['1.20.6', '1.21.4', '1.21.11', '26.1'])(
    'places modern clients in the spectator void on %s',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const packet = createJoinGamePacket(mcData, { entityId: 1, maxPlayers: 100 });

      expect(modernWorldStateSchema.safeParse(packet['worldState']).success).toBe(true);
      expect(packet['gameMode']).toBeUndefined();
    },
  );
});

describe('void world delivery', (): void => {
  // Representative release versions across every chunk and login packet generation.
  it.each(['1.8.8', '1.12.2', '1.16.5', '1.18.2', '1.20.2', '1.21.4'])(
    'presents the void and delivers a play-state kick on %s',
    async (version): Promise<void> => {
      const delivery = await runVoidSession(version);

      expect(delivery.login).toBe(true);
      expect(delivery.chunks).toBe(9);
      expect(delivery.position).toBe(true);
      expect(delivery.kick).toBe(kickMessage);

      const expectedChunks = Array.from({ length: 9 }, (): string => 'map_chunk');
      expect(delivery.chunkSequence).toEqual(
        version === '1.20.2' || version === '1.21.4'
          ? ['chunk_batch_start', ...expectedChunks, 'chunk_batch_finished']
          : expectedChunks,
      );
    },
    10_000,
  );

  it('delivers the friendly kick on 26.1 without sending chunk data first', async (): Promise<void> => {
    const delivery = await runVoidSession('26.1', false);

    expect(delivery).toEqual({
      login: true,
      chunks: 0,
      chunkSequence: [],
      position: true,
      kick: kickMessage,
    });
  });
});

interface VoidDelivery {
  readonly login: boolean;
  readonly chunks: number;
  readonly chunkSequence: readonly string[];
  readonly position: boolean;
  readonly kick?: string;
}

async function runVoidSession(version: string, sendChunks = true): Promise<VoidDelivery> {
  const port = await findAvailablePort();
  const server = minecraftProtocol.createServer({
    host: '127.0.0.1',
    port,
    version: false,
    'online-mode': false,
    hideErrors: true,
    keepAlive: false,
    motd: 'CraftLogin void test',
    maxPlayers: 100,
  });

  server.on('connection', installVersionedRegistryCodec);
  server.on('login', (client): void => {
    markLoggedIn(client);
  });
  server.on('playerJoin', (client): void => {
    presentVoidWorld(client, { entityId: client.id, maxPlayers: 100, sendChunks });
    markWorldReady(client);
    setTimeout((): void => {
      void disconnect(client, kickMessage);
    }, 150);
  });

  await new Promise<void>((resolve): void => {
    server.once('listening', resolve);
  });

  try {
    return await collectVoidDelivery(port, version);
  } finally {
    server.close();
  }
}

async function collectVoidDelivery(port: number, version: string): Promise<VoidDelivery> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'VoidDeliveryTest',
    version,
  });

  const chunkSequence: string[] = [];
  const result = {
    login: false,
    chunks: 0,
    chunkSequence,
    position: false,
  };

  return await new Promise<VoidDelivery>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      resolve({
        login: result.login,
        chunks: result.chunks,
        chunkSequence: result.chunkSequence,
        position: result.position,
      });
    }, 4_000);

    client.on('packet', (_packet: unknown, metadata: PacketMeta): void => {
      if (
        metadata.name === 'chunk_batch_start' ||
        metadata.name === 'map_chunk' ||
        metadata.name === 'chunk_batch_finished'
      ) {
        result.chunkSequence.push(metadata.name);
      }
    });

    client.on('login', (): void => {
      result.login = true;
    });
    client.on('map_chunk', (): void => {
      result.chunks += 1;
    });
    client.on('position', (): void => {
      result.position = true;
    });
    client.once('kick_disconnect', (packet: unknown): void => {
      clearTimeout(timeout);
      const parsed = z.object({ reason: z.unknown() }).safeParse(packet);
      const message = parsed.success ? extractKickMessage(parsed.data.reason) : null;
      client.end();
      resolve({
        login: result.login,
        chunks: result.chunks,
        chunkSequence: result.chunkSequence,
        position: result.position,
        ...(message === null ? {} : { kick: message }),
      });
    });
    client.once('error', (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function extractKickMessage(rawReason: unknown): string | null {
  if (typeof rawReason === 'string') {
    const parsed: unknown = JSON.parse(rawReason);
    const component = z.object({ text: z.string() }).safeParse(parsed);
    return component.success ? component.data.text : null;
  }

  const nbt = z
    .object({
      value: z.object({ text: z.object({ value: z.string() }) }),
    })
    .safeParse(rawReason);
  return nbt.success ? nbt.data.value.text.value : null;
}

function isPacketSerializer(value: unknown): value is PacketSerializer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'createPacketBuffer') === 'function'
  );
}
