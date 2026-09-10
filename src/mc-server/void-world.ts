import type { ServerClient } from 'minecraft-protocol';

import {
  getChunkConstructor,
  getFieldType,
  getMinecraftData,
  getPacketFields,
  type ChunkLike,
  type MinecraftData,
  type PacketField,
} from './minecraft-data.js';

// A spectator stays above the void instead of falling out of the world, which keeps the lobby
// stable without generating terrain or handling movement. Spectator was added in 1.8 (protocol 47).
const SPECTATOR_GAME_MODE = 3;
const CREATIVE_GAME_MODE = 1;
const SPECTATOR_MIN_PROTOCOL = 47;
const VOID_CHUNK_RADIUS = 1;
const VOID_SPAWN = { x: 0.5, y: 64, z: 0.5 } as const;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
// 1.21.5+ serializes heightmaps as {type, data} entries. MOTION_BLOCKING is type 4 and an empty
// void needs 37 zeroed longs for a 384-block-tall dimension.
const MOTION_BLOCKING_HEIGHTMAP_ID = 4;
const EMPTY_HEIGHTMAP: readonly (readonly [number, number])[] = Array.from(
  { length: 37 },
  (): readonly [number, number] => [0, 0],
);

const NUMBER_FIELD_TYPES = new Set([
  'i8',
  'u8',
  'i16',
  'u16',
  'i32',
  'u32',
  'i64',
  'u64',
  'varint',
  'varlong',
  'f32',
  'f64',
]);

export interface VoidWorldOptions {
  readonly entityId: number;
  readonly maxPlayers: number;
}

export interface VoidChatPacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

export function presentVoidWorld(client: ServerClient, options: VoidWorldOptions): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  client.write('login', createJoinGamePacket(mcData, options));

  const chunkConstructor = getChunkConstructor(mcData);
  if (chunkConstructor !== null) {
    const chunk = new chunkConstructor();
    writeChunks(client, mcData, chunk);
  }

  client.write('position', createPositionPacket(mcData));
}

export function sendVoidMessage(client: ServerClient, message: string): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  const packet = createVoidChatPacket(mcData, message);
  client.write(packet.name, packet.params);
}

export function createJoinGamePacket(
  mcData: MinecraftData,
  options: VoidWorldOptions,
): Record<string, unknown> {
  const fields = getPacketFields(mcData, 'packet_login');
  const packet: Record<string, unknown> = { ...mcData.loginPacket };
  fillPrimitiveDefaults(packet, fields);

  packet['entityId'] = options.entityId;
  packet['gameMode'] =
    mcData.version.version >= SPECTATOR_MIN_PROTOCOL ? SPECTATOR_GAME_MODE : CREATIVE_GAME_MODE;
  packet['isHardcore'] = false;
  packet['isDebug'] = false;
  packet['isFlat'] = true;
  packet['reducedDebugInfo'] = false;
  packet['enableRespawnScreen'] = true;
  packet['viewDistance'] = VOID_CHUNK_RADIUS + 1;
  packet['simulationDistance'] = VOID_CHUNK_RADIUS + 1;
  packet['maxPlayers'] = options.maxPlayers;
  packet['difficulty'] = 0;
  packet['levelType'] = 'flat';
  packet['hashedSeed'] = [0, 0];
  packet['portalCooldown'] = 0;

  const previousGameModeType = getFieldType(fields, 'previousGameMode');
  if (previousGameModeType === 'u8') {
    packet['previousGameMode'] = 255;
  } else if (previousGameModeType !== undefined) {
    packet['previousGameMode'] = -1;
  }

  if (getFieldType(fields, 'worldName') !== undefined) {
    packet['worldName'] = 'minecraft:overworld';
  }
  if (getFieldType(fields, 'worldNames') !== undefined) {
    packet['worldNames'] = ['minecraft:overworld'];
  }
  if (getFieldType(fields, 'dimension') === 'i8' || getFieldType(fields, 'dimension') === 'i32') {
    packet['dimension'] = 0;
  }

  return packet;
}

export function createPositionPacket(mcData: MinecraftData): Record<string, unknown> {
  const fields = getPacketFields(mcData, 'packet_position');
  const packet: Record<string, unknown> = { yaw: 0, pitch: 0 };

  if (getFieldType(fields, 'x') !== undefined) {
    packet['x'] = VOID_SPAWN.x;
    packet['y'] = VOID_SPAWN.y;
    packet['z'] = VOID_SPAWN.z;
  }
  if (getFieldType(fields, 'dx') !== undefined) {
    packet['dx'] = 0;
    packet['dy'] = 0;
    packet['dz'] = 0;
  }
  if (getFieldType(fields, 'flags') !== undefined) {
    packet['flags'] = 0;
  }
  if (getFieldType(fields, 'teleportId') !== undefined) {
    packet['teleportId'] = 1;
  }
  if (getFieldType(fields, 'dismountVehicle') !== undefined) {
    packet['dismountVehicle'] = false;
  }

  return packet;
}

export function createChunkPacket(
  mcData: MinecraftData,
  chunk: ChunkLike,
  chunkX: number,
  chunkZ: number,
): Record<string, unknown> {
  const fields = getPacketFields(mcData, 'packet_map_chunk');
  const packet: Record<string, unknown> = { x: chunkX, z: chunkZ };

  if (getFieldType(fields, 'groundUp') !== undefined) {
    packet['groundUp'] = true;
  }
  if (getFieldType(fields, 'bitMap') !== undefined) {
    packet['bitMap'] = chunk.getMask();
  }
  const heightmapType = getFieldType(fields, 'heightmaps');
  if (heightmapType === 'anonymousNbt') {
    packet['heightmaps'] = { type: 'compound', value: {} };
  } else if (heightmapType === 'nbt') {
    packet['heightmaps'] = { type: 'compound', name: '', value: {} };
  } else if (Array.isArray(heightmapType) && heightmapType[0] === 'array') {
    packet['heightmaps'] = [{ type: MOTION_BLOCKING_HEIGHTMAP_ID, data: EMPTY_HEIGHTMAP }];
  }
  if (getFieldType(fields, 'biomes') !== undefined) {
    packet['biomes'] = chunk.dumpBiomes?.() ?? [];
  }
  packet['chunkData'] = chunk.dump();
  if (getFieldType(fields, 'blockEntities') !== undefined) {
    packet['blockEntities'] = [];
  }
  if (getFieldType(fields, 'trustEdges') !== undefined) {
    packet['trustEdges'] = true;
  }

  const light = chunk.dumpLight?.();
  if (getFieldType(fields, 'skyLightMask') !== undefined && light !== undefined) {
    packet['skyLightMask'] = light.skyLightMask;
    packet['blockLightMask'] = light.blockLightMask;
    packet['emptySkyLightMask'] = light.emptySkyLightMask;
    packet['emptyBlockLightMask'] = light.emptyBlockLightMask;
    packet['skyLight'] = light.skyLight;
    packet['blockLight'] = light.blockLight;
  }

  return packet;
}

export function createVoidChatPacket(mcData: MinecraftData, message: string): VoidChatPacket {
  const systemChatFields = getPacketFields(mcData, 'packet_system_chat');
  if (systemChatFields.length > 0) {
    const content =
      getFieldType(systemChatFields, 'content') === 'anonymousNbt'
        ? { type: 'compound', value: { text: { type: 'string', value: message } } }
        : JSON.stringify({ text: message });
    return { name: 'system_chat', params: { content, isActionBar: false } };
  }

  const chatFields = getPacketFields(mcData, 'packet_chat');
  const params: Record<string, unknown> = {
    message: JSON.stringify({ text: message }),
    position: 1,
  };
  if (getFieldType(chatFields, 'sender') !== undefined) {
    params['sender'] = NIL_UUID;
  }
  return { name: 'chat', params };
}

function writeChunks(client: ServerClient, mcData: MinecraftData, chunk: ChunkLike): void {
  const batchStartFields = getPacketFields(mcData, 'packet_chunk_batch_start');
  if (batchStartFields.length > 0) {
    client.write('chunk_batch_start', {});
  }

  let batchSize = 0;
  for (let chunkX = -VOID_CHUNK_RADIUS; chunkX <= VOID_CHUNK_RADIUS; chunkX += 1) {
    for (let chunkZ = -VOID_CHUNK_RADIUS; chunkZ <= VOID_CHUNK_RADIUS; chunkZ += 1) {
      client.write('map_chunk', createChunkPacket(mcData, chunk, chunkX, chunkZ));
      batchSize += 1;
    }
  }

  const batchFinishedFields = getPacketFields(mcData, 'packet_chunk_batch_finished');
  if (batchFinishedFields.length > 0) {
    client.write('chunk_batch_finished', { batchSize });
  }
}

function fillPrimitiveDefaults(
  packet: Record<string, unknown>,
  fields: readonly PacketField[],
): void {
  for (const field of fields) {
    if (field.name in packet) {
      continue;
    }
    if (field.type === 'bool') {
      packet[field.name] = false;
    } else if (field.type === 'string') {
      packet[field.name] = '';
    } else if (typeof field.type === 'string' && NUMBER_FIELD_TYPES.has(field.type)) {
      packet[field.name] = 0;
    } else if (Array.isArray(field.type) && field.type[0] === 'array') {
      packet[field.name] = [];
    }
  }
}
