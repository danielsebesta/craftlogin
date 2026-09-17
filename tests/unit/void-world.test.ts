import minecraftProtocol, { type PacketMeta } from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getChunkConstructor, getMinecraftData } from '../../src/mc-server/minecraft-data.js';
import {
  disconnect,
  markLoggedIn,
  markWorldReady,
  toneColor,
} from '../../src/mc-server/disconnect.js';
import { installVersionedRegistryCodec } from '../../src/mc-server/registry-codec.js';
import {
  createChunkPacket,
  createFrozenAbilitiesPacket,
  createLimboPackets,
  createJoinGamePacket,
  createKickReason,
  createLevelLoadStartPacket,
  createPositionPacket,
  createTitlePackets,
  createViewPackets,
  createVoidChatPacket,
  presentVoidWorld,
} from '../../src/mc-server/void-world.js';
import { findAvailablePort } from './support/tcp-port.js';

const kickMessage = 'Verification complete. You can return to your browser.';
const modernWorldStateSchema = z.object({
  dimension: z.literal(2),
  name: z.literal('minecraft:the_end'),
  gamemode: z.literal('spectator'),
  previousGamemode: z.literal(255),
  hashedSeed: z.tuple([z.literal(0), z.literal(0)]),
  isDebug: z.literal(false),
  isFlat: z.literal(true),
  portalCooldown: z.literal(0),
  seaLevel: z.literal(0),
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
          params: createJoinGamePacket(mcData, {
            entityId: 1,
            maxPlayers: 100,
          }),
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
      const actionBarPacket = createVoidChatPacket(mcData, 'Lobby closes soon', true);
      expect(() => {
        rawSerializer.createPacketBuffer({
          name: actionBarPacket.name,
          params: actionBarPacket.params,
        });
      }).not.toThrow();

      const abilities = createFrozenAbilitiesPacket(mcData);
      expect(abilities).not.toBeNull();
      if (abilities !== null) {
        expect(() => {
          rawSerializer.createPacketBuffer({ name: abilities.name, params: abilities.params });
        }).not.toThrow();
      }

      const titlePackets = createTitlePackets(mcData, 'CraftLogin', 'Minecraft verification');
      for (const packet of titlePackets) {
        expect(() => {
          rawSerializer.createPacketBuffer({ name: packet.name, params: packet.params });
        }).not.toThrow();
      }

      const limbo = createLimboPackets(mcData, 1);
      for (const packet of limbo) {
        expect(() => {
          rawSerializer.createPacketBuffer({ name: packet.name, params: packet.params });
        }).not.toThrow();
      }

      const chunkConstructor = getChunkConstructor(mcData);
      if (chunkConstructor !== null) {
        const chunk = new chunkConstructor({ minY: 0, worldHeight: 256 });
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
    'sends vanilla-valid empty chunk light on %s',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const chunkConstructor = getChunkConstructor(mcData);
      expect(chunkConstructor).not.toBeNull();
      if (chunkConstructor === null) {
        return;
      }

      // Every light section must sit in either a data mask or an empty mask; zeroed masks with
      // no empty marks is what vanilla rejects with a network protocol error.
      const packet = createChunkPacket(
        mcData,
        new chunkConstructor({ minY: 0, worldHeight: 256 }),
        0,
        0,
      );
      expect(packet['skyLight']).toEqual([]);
      expect(packet['blockLight']).toEqual([]);
      expect(packet['skyLightMask']).toEqual([[0, 0]]);
      expect(packet['blockLightMask']).toEqual([[0, 0]]);
      expect(packet['emptySkyLightMask']).toEqual([[0, 0x3ffff]]);
      expect(packet['emptyBlockLightMask']).toEqual([[0, 0x3ffff]]);
    },
  );

  it('freezes a 26.1 player and keeps the title visible for the 40-second lobby', (): void => {
    const mcData = getMinecraftData('26.1');
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    expect(createFrozenAbilitiesPacket(mcData)).toEqual({
      name: 'abilities',
      params: { flags: 0x06, flyingSpeed: 0, walkingSpeed: 0 },
    });
    // The 40-second lobby needs a longer stay so the title survives until the kick.
    const packets = createTitlePackets(mcData, 'ᴄʀᴀꜰᴛʟᴏɢɪɴ', 'Minecraft account verification');
    expect(packets[0]).toEqual({
      name: 'set_title_time',
      params: { fadeIn: 10, stay: 1200, fadeOut: 20 },
    });
    expect(packets).toHaveLength(3);
    const subtitleParams = z.object({ text: z.unknown() }).safeParse(packets[1]?.params);
    expect(subtitleParams.success).toBe(true);
    if (subtitleParams.success) {
      expect(subtitleParams.data.text).toEqual({
        type: 'compound',
        value: {
          text: { type: 'string', value: 'Minecraft account verification' },
          color: { type: 'string', value: '#E9ECE9' },
        },
      });
    }
    const titleParams = z.object({ text: z.unknown() }).safeParse(packets[2]?.params);
    expect(titleParams.success).toBe(true);
    if (titleParams.success) {
      expect(titleParams.data.text).toMatchObject({
        type: 'compound',
        value: {
          text: { type: 'string', value: '' },
          bold: { type: 'byte', value: 1 },
        },
      });
      const extrasResult = z
        .object({
          value: z.object({
            extra: z.object({
              value: z.object({
                value: z.array(
                  z.object({
                    text: z.object({ value: z.string() }),
                    color: z.object({ value: z.string() }),
                    bold: z.object({ value: z.number() }),
                  }),
                ),
              }),
            }),
          }),
        })
        .safeParse(titleParams.data.text);
      expect(extrasResult.success).toBe(true);
      if (extrasResult.success) {
        const extras = extrasResult.data.value.extra.value.value;
        expect(extras).toHaveLength(Array.from('ᴄʀᴀꜰᴛʟᴏɢɪɴ').length);
        expect(extras[0]?.text.value).toBe('ᴄ');
        expect(extras[0]?.color.value).toBe('#B6E86E');
        expect(extras[extras.length - 1]?.color.value).toBe('#A2D060');
        for (const entry of extras) {
          expect(entry.color.value).toMatch(/^#[0-9A-F]{6}$/);
          expect(entry.bold.value).toBe(1);
        }
      }
    }
  });

  it.each([
    ['1.18.2', [2, 15]],
    ['1.19.4', [2, 15, 33]],
    ['1.20.1', [2, 15, 33]],
    ['1.20.2', [1, 14, 32]],
    ['26.1', [1, 14, 32]],
  ] as const)('sends the version-correct limbo effects on %s', (version, effectIds): void => {
    const mcData = getMinecraftData(version);
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    // IDs resolve from the per-version registry; Darkness is unknown pre-1.19 and skipped.
    const packets = createLimboPackets(mcData, 7);
    expect(packets.map((packet): string => packet.name)).toEqual(
      effectIds.map((): string => 'entity_effect'),
    );
    const paramsSchema = z.object({
      entityId: z.number(),
      effectId: z.number(),
      amplifier: z.number(),
      duration: z.number(),
    });
    const parsedIds: number[] = [];
    for (const packet of packets) {
      const parsed = paramsSchema.safeParse(packet.params);
      expect(parsed.success).toBe(true);
      if (!parsed.success) {
        continue;
      }
      expect(parsed.data.entityId).toBe(7);
      expect(parsed.data.duration).toBe(32767);
      parsedIds.push(parsed.data.effectId);
    }
    expect(parsedIds).toEqual([...effectIds]);
  });

  it.each([
    ['26.1', 'success', false, '#A2D060'],
    ['26.1', 'error', false, '#F47B74'],
    ['26.1', 'neutral', false, '#E9ECE9'],
    ['26.1', 'error', true, '#F47B74'],
    ['1.12.2', 'success', false, 'green'],
    ['1.12.2', 'error', false, 'red'],
    ['1.12.2', 'neutral', true, 'white'],
  ] as const)('encodes a %s kick reason on %s', (version, tone, loginState, color): void => {
    const mcData = getMinecraftData(version);
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    const reason = createKickReason(mcData, 'Kicked', toneColor(mcData, tone), loginState);
    if (typeof reason === 'string') {
      const parsed: unknown = JSON.parse(reason);
      expect(parsed).toEqual({ text: 'Kicked', color, bold: true });
      return;
    }
    const nbt = z
      .object({
        value: z.object({
          text: z.object({ value: z.string() }),
          color: z.object({ value: z.string() }),
        }),
      })
      .safeParse(reason);
    expect(nbt.success).toBe(true);
    if (nbt.success) {
      expect(nbt.data.value.text.value).toBe('Kicked');
      expect(nbt.data.value.color.value).toBe(color);
    }
  });

  it.each([
    ['26.1', false, '#A2D060', '#A7ADA7'],
    ['26.1', true, '#A2D060', '#A7ADA7'],
    ['1.12.2', false, 'green', 'gray'],
  ] as const)(
    'breaks a multiline kick into a bold heading and a muted detail on %s',
    (version, loginState, headingColor, bodyColor): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const reason = createKickReason(
        mcData,
        'Head\nBody',
        toneColor(mcData, 'success'),
        loginState,
      );
      const componentSchema = z.object({
        text: z.string(),
        extra: z.array(z.object({ text: z.string(), color: z.string() })),
      });
      if (typeof reason === 'string') {
        const parsed: unknown = JSON.parse(reason);
        const component = componentSchema.safeParse(parsed);
        expect(component.success).toBe(true);
        if (component.success) {
          expect(component.data.text).toBe('');
          expect(component.data.extra[0]).toMatchObject({
            text: 'Head',
            color: headingColor,
          });
          expect(component.data.extra[1]).toEqual({ text: '\nBody', color: bodyColor });
        }
        return;
      }
      const nbt = z
        .object({
          value: z.object({
            text: z.object({ value: z.string() }),
            extra: z.object({
              value: z.object({
                value: z.tuple([
                  z.object({
                    text: z.object({ value: z.string() }),
                    color: z.object({ value: z.string() }),
                  }),
                  z.object({
                    text: z.object({ value: z.string() }),
                    color: z.object({ value: z.string() }),
                  }),
                ]),
              }),
            }),
          }),
        })
        .safeParse(reason);
      expect(nbt.success).toBe(true);
      if (nbt.success) {
        const [heading, body] = nbt.data.value.extra.value.value;
        expect(heading.text.value).toBe('Head');
        expect(heading.color.value).toBe(headingColor);
        expect(body.text.value).toBe('\nBody');
        expect(body.color.value).toBe(bodyColor);
      }
    },
  );

  it('falls back to legacy title colors before 1.16 hex support', (): void => {
    const mcData = getMinecraftData('1.12.2');
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    const packets = createTitlePackets(mcData, 'ᴄʀᴀꜰᴛʟᴏɢɪɴ', 'Start sign-in in your browser');
    const timing = packets.find((packet): boolean => packet.name === 'title');
    expect(timing?.params).toMatchObject({ fadeIn: 10, stay: 1200, fadeOut: 20 });
    const paramsSchema = z.object({ action: z.number(), text: z.string() });
    const findByAction = (action: number): string | undefined => {
      for (const packet of packets) {
        if (packet.name !== 'title') {
          continue;
        }
        const parsed = paramsSchema.safeParse(packet.params);
        if (parsed.success && parsed.data.action === action) {
          return parsed.data.text;
        }
      }
      return undefined;
    };
    expect(findByAction(1)).toBe(
      JSON.stringify({ text: 'Start sign-in in your browser', color: 'white' }),
    );
    expect(findByAction(0)).toBe(
      JSON.stringify({ text: 'ᴄʀᴀꜰᴛʟᴏɢɪɴ', color: 'green', bold: true }),
    );
  });

  it.each([
    ['1.21.5', false],
    ['1.21.6', true],
    ['1.21.11', true],
    ['26.1', true],
  ] as const)(
    'sends the level-load start event only when %s defines it (%s)',
    (version, expected): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const packet = createLevelLoadStartPacket(mcData);
      expect(packet !== null).toBe(expected);
      if (packet === null) {
        return;
      }

      expect(packet).toEqual({
        name: 'game_state_change',
        params: { reason: 'level_chunks_load_start', gameMode: 0 },
      });
      const rawSerializer: unknown = minecraftProtocol.createSerializer({
        state: minecraftProtocol.states.PLAY,
        isServer: true,
        version,
        customPackets: {},
      });
      expect(isPacketSerializer(rawSerializer)).toBe(true);
      if (isPacketSerializer(rawSerializer)) {
        expect((): void => {
          rawSerializer.createPacketBuffer({ name: packet.name, params: packet.params });
        }).not.toThrow();
      }
    },
  );

  it.each([
    ['1.8.8', 0],
    ['1.16.5', 2],
    ['1.20.6', 3],
    ['1.21.4', 3],
    ['1.21.11', 3],
    ['26.1', 3],
  ] as const)('sends the view packets %s supports (%i packets)', (version, expectedCount): void => {
    const mcData = getMinecraftData(version);
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    const packets = createViewPackets(mcData, {
      chunkX: 0,
      chunkZ: 0,
      viewDistance: 2,
      simulationDistance: 2,
    });
    expect(packets).toHaveLength(expectedCount);

    const rawSerializer: unknown = minecraftProtocol.createSerializer({
      state: minecraftProtocol.states.PLAY,
      isServer: true,
      version,
      customPackets: {},
    });
    expect(isPacketSerializer(rawSerializer)).toBe(true);
    if (!isPacketSerializer(rawSerializer)) {
      return;
    }
    for (const packet of packets) {
      expect((): void => {
        rawSerializer.createPacketBuffer({ name: packet.name, params: packet.params });
      }).not.toThrow();
    }

    if (packets.length === 3) {
      expect(packets[0]).toEqual({
        name: 'update_view_position',
        params: { chunkX: 0, chunkZ: 0 },
      });
      expect(packets[1]).toEqual({
        name: 'update_view_distance',
        params: { viewDistance: 2 },
      });
      expect(packets[2]).toEqual({
        name: 'simulation_distance',
        params: { distance: 2 },
      });
    }
  });

  it.each(['1.20.6', '1.21.4', '1.21.11', '26.1'])(
    'places modern clients in the spectator void on %s',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const packet = createJoinGamePacket(mcData, {
        entityId: 1,
        maxPlayers: 100,
      });

      expect(modernWorldStateSchema.safeParse(packet['worldState']).success).toBe(true);
      expect(packet['gameMode']).toBeUndefined();
      // The template defaults this to false, which makes clients show a
      // "Chat messages can't be verified" warning despite server-side enforcement.
      expect(packet['enforcesSecureChat']).toBe(true);
    },
  );

  it('leaves pre-1.19 join packets without a secure-chat flag', (): void => {
    const mcData = getMinecraftData('1.18.2');
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    const packet = createJoinGamePacket(mcData, {
      entityId: 1,
      maxPlayers: 100,
    });
    expect('enforcesSecureChat' in packet).toBe(false);
  });

  it.each([
    ['1.7', 1],
    ['1.8.8', 3],
    ['1.12.2', 3],
    ['1.16.5', 3],
  ] as const)('uses spectator mode when supported on %s (%i)', (version, gameMode): void => {
    const mcData = getMinecraftData(version);
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    const packet = createJoinGamePacket(mcData, {
      entityId: 1,
      maxPlayers: 100,
    });
    expect(packet['gameMode']).toBe(gameMode);
  });
});

describe('void world delivery', (): void => {
  // Representative release versions across every chunk and login packet generation, including the
  // lobby path that streams chunk data (previously only the chunk-free verification path ran 26.1).
  it.each(['1.8.8', '1.12.2', '1.16.5', '1.18.2', '1.20.2', '1.21.4', '26.1'])(
    'presents the void and delivers a play-state kick on %s',
    async (version): Promise<void> => {
      const delivery = await runVoidSession(version);

      expect(delivery.login).toBe(true);
      expect(delivery.chunks).toBe(25);
      expect(delivery.position).toBe(true);
      expect(delivery.positionPacketIndex).toBeGreaterThanOrEqual(0);
      expect(delivery.firstChunkPacketIndex).toBeGreaterThan(delivery.positionPacketIndex);
      expect(delivery.kick).toBe(kickMessage);

      const expectedChunks = Array.from({ length: 25 }, (): string => 'map_chunk');
      expect(delivery.chunkSequence).toEqual(
        version === '1.20.2' || version === '1.21.4' || version === '26.1'
          ? ['chunk_batch_start', ...expectedChunks, 'chunk_batch_finished']
          : expectedChunks,
      );
    },
    10_000,
  );

  it('delivers the friendly kick on 26.1 without sending chunk data first', async (): Promise<void> => {
    const delivery = await runVoidSession('26.1', false);

    expect(delivery.login).toBe(true);
    expect(delivery.chunks).toBe(0);
    expect(delivery.chunkSequence).toEqual([]);
    expect(delivery.position).toBe(true);
    expect(delivery.positionPacketIndex).toBeGreaterThanOrEqual(0);
    expect(delivery.firstChunkPacketIndex).toBe(-1);
    expect(delivery.kick).toBe(kickMessage);
  });
});

interface VoidDelivery {
  readonly login: boolean;
  readonly chunks: number;
  readonly chunkSequence: readonly string[];
  readonly position: boolean;
  readonly positionPacketIndex: number;
  readonly firstChunkPacketIndex: number;
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
    presentVoidWorld(client, {
      entityId: client.id,
      maxPlayers: 100,
      sendChunks,
    });
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
    packetIndex: 0,
    positionPacketIndex: -1,
    firstChunkPacketIndex: -1,
  };

  return await new Promise<VoidDelivery>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      resolve({
        login: result.login,
        chunks: result.chunks,
        chunkSequence: result.chunkSequence,
        position: result.position,
        positionPacketIndex: result.positionPacketIndex,
        firstChunkPacketIndex: result.firstChunkPacketIndex,
      });
    }, 4_000);

    client.on('packet', (_packet: unknown, metadata: PacketMeta): void => {
      if (metadata.name === 'position') {
        result.positionPacketIndex = result.packetIndex;
      } else if (metadata.name === 'map_chunk' && result.firstChunkPacketIndex === -1) {
        result.firstChunkPacketIndex = result.packetIndex;
      }
      result.packetIndex += 1;

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
        positionPacketIndex: result.positionPacketIndex,
        firstChunkPacketIndex: result.firstChunkPacketIndex,
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
