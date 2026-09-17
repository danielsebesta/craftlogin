import { createRequire } from 'node:module';

import { z } from 'zod';

// minecraft-data and prismarine-chunk are CommonJS packages whose generated declarations do not
// describe the protocol tables and chunk runtime surface we consume. Validate the runtime shape
// once at load and expose a narrow, typed adapter instead of leaking `any` through the module.
const require = createRequire(import.meta.url);

export interface PacketField {
  readonly name: string;
  readonly type: unknown;
}

export interface ChunkOptions {
  readonly minY?: number;
  readonly worldHeight?: number;
}

export interface ChunkLike {
  dump(): Buffer;
  getMask(): unknown;
  dumpBiomes?(): readonly number[];
}

export type ChunkConstructor = new (options?: ChunkOptions) => ChunkLike;

export interface MinecraftEffectData {
  readonly id: number;
}

export interface MinecraftData {
  readonly version: {
    readonly version: number;
    readonly majorVersion: string;
    readonly minecraftVersion: string;
    readonly type: string;
  };
  readonly loginPacket?: Readonly<Record<string, unknown>> | undefined;
  // Version-specific effect registry (classic numeric IDs up to 1.20.1, data-driven registry
  // IDs from 1.20.2). Effects unknown to a version are simply absent, e.g. Darkness pre-1.19.
  readonly effectsByName?: Readonly<Record<string, MinecraftEffectData>> | undefined;
  readonly protocol: {
    readonly play: {
      readonly toClient: {
        readonly types: Readonly<Record<string, unknown>>;
      };
    };
    // Versions before 1.20.2 have no configuration state at all.
    readonly configuration?:
      | {
          readonly toClient: {
            readonly types: Readonly<Record<string, unknown>>;
          };
        }
      | undefined;
  };
}

const minecraftDataSchema = z.looseObject({
  version: z.looseObject({
    version: z.number(),
    majorVersion: z.string(),
    minecraftVersion: z.string(),
    type: z.string(),
  }),
  loginPacket: z.record(z.string(), z.unknown()).optional(),
  effectsByName: z.record(z.string(), z.object({ id: z.number() })).optional(),
  protocol: z.object({
    play: z.object({
      toClient: z.object({
        types: z.record(z.string(), z.unknown()),
      }),
    }),
    configuration: z
      .object({
        toClient: z.object({
          types: z.record(z.string(), z.unknown()),
        }),
      })
      .optional(),
  }),
});

const packetFieldSchema = z.object({
  name: z.string(),
  type: z.unknown(),
});

type MinecraftDataLoader = (version: string | number) => unknown;
type ChunkLoader = (registry: unknown) => ChunkConstructor;

const loadedMinecraftData: unknown = require('minecraft-data');
if (!isMinecraftDataLoader(loadedMinecraftData)) {
  throw new Error('The minecraft-data loader is unavailable');
}
const loadMinecraftData = loadedMinecraftData;

const loadedPrismarineChunk: unknown = require('prismarine-chunk');
if (!isChunkLoader(loadedPrismarineChunk)) {
  throw new Error('The prismarine-chunk loader is unavailable');
}
const loadChunkConstructor = loadedPrismarineChunk;

export function getMinecraftData(version: string | number): MinecraftData | null {
  const parsed = minecraftDataSchema.safeParse(loadMinecraftData(version));
  return parsed.success ? parsed.data : null;
}

export function getChunkConstructor(mcData: MinecraftData): ChunkConstructor | null {
  try {
    return loadChunkConstructor(mcData);
  } catch {
    // prismarine-chunk throws for protocol versions without a chunk implementation (for example
    // 1.7). The caller then presents the void without chunks and still disconnects cleanly.
    return null;
  }
}

export function getPacketFields(mcData: MinecraftData, packetType: string): readonly PacketField[] {
  const raw = mcData.protocol.play.toClient.types[packetType];
  if (!Array.isArray(raw) || raw.length < 2) {
    return [];
  }

  const parsed = z.array(packetFieldSchema).safeParse(raw[1]);
  return parsed.success ? parsed.data : [];
}

export function hasPacket(mcData: MinecraftData, packetType: string): boolean {
  return Object.hasOwn(mcData.protocol.play.toClient.types, packetType);
}

export function hasConfigurationPacket(mcData: MinecraftData, packetType: string): boolean {
  const types = mcData.protocol.configuration?.toClient.types;
  return types !== undefined && Object.hasOwn(types, packetType);
}

export function getFieldType(fields: readonly PacketField[], fieldName: string): unknown {
  return fields.find((field): boolean => field.name === fieldName)?.type;
}

function isMinecraftDataLoader(value: unknown): value is MinecraftDataLoader {
  return typeof value === 'function';
}

function isChunkLoader(value: unknown): value is ChunkLoader {
  return typeof value === 'function';
}
