import minecraftProtocol, { type PacketMeta } from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  createTagsPacket,
  getTagBindings,
  installConfigurationTags,
} from '../../src/mc-server/configuration-tags.js';
import { getMinecraftData, type MinecraftData } from '../../src/mc-server/minecraft-data.js';
import { installVersionedRegistryCodec } from '../../src/mc-server/registry-codec.js';
import { createVerifyCommandPacket } from '../../src/mc-server/verify-command.js';
import { findAvailablePort } from './support/tcp-port.js';

const TAG_REFERENCE_PATTERN = /#([a-z0-9_.-]+:[a-z0-9_./-]+)/g;

const legacyRegistryPacketSchema = z.object({
  codec: z.object({ type: z.literal('compound'), value: z.record(z.string(), z.unknown()) }),
});
const segmentedRegistryPacketSchema = z.object({ id: z.string() });

const commandTreeSchema = z.object({
  nodes: z.tuple([
    z.object({ flags: z.number(), children: z.array(z.number()) }),
    z.object({
      flags: z.number(),
      children: z.array(z.number()),
      extraNodeData: z.object({ name: z.string() }),
    }),
    z.object({
      flags: z.number(),
      children: z.array(z.number()),
      extraNodeData: z.object({
        name: z.string(),
        parser: z.string(),
        properties: z.string(),
      }),
    }),
  ]),
  rootIndex: z.number(),
});

describe('verify command declaration', (): void => {
  it('skips the declaration on pre-1.13 clients and declares /verify <code> afterwards', (): void => {
    for (const version of ['1.7', '1.8.8', '1.12.2']) {
      const mcData = getMinecraftData(version);
      expect(mcData, version).not.toBeNull();
      if (mcData === null) {
        return;
      }

      // Pre-1.13 clients validate nothing client-side and deliver /verify as plain chat text.
      expect(createVerifyCommandPacket(mcData), version).toBeNull();
    }

    for (const version of ['1.13.2', '1.16.5', '1.19.4', '1.20.2', '1.21.4', '26.1']) {
      const mcData = getMinecraftData(version);
      expect(mcData, version).not.toBeNull();
      if (mcData === null) {
        continue;
      }

      const packet = createVerifyCommandPacket(mcData);
      expect(packet?.name, version).toBe('declare_commands');

      const parsed = commandTreeSchema.safeParse(packet?.params);
      expect(parsed.success, version).toBe(true);
      if (!parsed.success) {
        continue;
      }
      expect(parsed.data.rootIndex).toBe(0);
      expect(parsed.data.nodes[0].children).toEqual([1]);
      expect(parsed.data.nodes[1].extraNodeData.name).toBe('verify');
      expect(parsed.data.nodes[1].children).toEqual([2]);
      expect(parsed.data.nodes[2].extraNodeData).toEqual({
        name: 'code',
        parser: 'brigadier:string',
        properties: 'SINGLE_WORD',
      });

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
          name: 'declare_commands',
          params: packet?.params ?? {},
        });
      }, version).not.toThrow();
    }
  });
});

describe('configuration tags', (): void => {
  it('encodes the tags packet for every version that uses configuration tags', (): void => {
    for (const version of minecraftProtocol.supportedVersions) {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        continue;
      }

      const packet = createTagsPacket(mcData);
      if (packet === null) {
        continue;
      }

      const rawSerializer: unknown = minecraftProtocol.createSerializer({
        state: minecraftProtocol.states.CONFIGURATION,
        isServer: true,
        version,
        customPackets: {},
      });
      expect(isPacketSerializer(rawSerializer), version).toBe(true);
      if (!isPacketSerializer(rawSerializer)) {
        continue;
      }
      expect(() => {
        rawSerializer.createPacketBuffer({ name: packet.name, params: packet.params });
      }, version).not.toThrow();
    }
  });

  it('binds every tag referenced by the shipped registries', (): void => {
    for (const version of ['1.21.11', '26.1']) {
      const mcData = getMinecraftData(version);
      expect(mcData, version).not.toBeNull();
      if (mcData === null) {
        continue;
      }

      // New references fail closed so a data update can't silently reintroduce
      // the vanilla "Missing tag" disconnect.
      const bound = new Set(Object.values(getTagBindings()).flat());
      for (const reference of collectRegistryTagReferences(mcData)) {
        expect(bound.has(reference), `${version}: ${reference}`).toBe(true);
      }
    }
  });

  it('binds the code-driven dialog and timeline tags', (): void => {
    const bindings = getTagBindings();
    expect(bindings['minecraft:dialog']).toEqual([
      'minecraft:pause_screen_additions',
      'minecraft:quick_actions',
    ]);
    expect(bindings['minecraft:timeline']).toEqual([
      'minecraft:in_end',
      'minecraft:in_nether',
      'minecraft:in_overworld',
      'minecraft:universal',
    ]);
  });

  it('sends empty tag entries ahead of the configuration finish on 26.1', async (): Promise<void> => {
    const port = await findAvailablePort();
    const server = minecraftProtocol.createServer({
      host: '127.0.0.1',
      port,
      version: false,
      'online-mode': false,
      hideErrors: true,
      keepAlive: false,
      motd: 'CraftLogin tags test',
      maxPlayers: 10,
    });
    server.on('connection', installConfigurationTags);
    await new Promise<void>((resolve): void => {
      server.once('listening', resolve);
    });

    try {
      const sequence = await collectConfigurationSequence(port);
      const tagsIndex = sequence.indexOf('tags');
      const finishIndex = sequence.indexOf('finish_configuration');
      expect(tagsIndex).toBeGreaterThanOrEqual(0);
      expect(finishIndex).toBeGreaterThan(tagsIndex);
    } finally {
      server.close();
    }
  }, 15_000);
});

describe('Minecraft configuration registry codec', (): void => {
  it('sends each concurrent client the registry data for its negotiated version', async (): Promise<void> => {
    const port = await findAvailablePort();
    const server = minecraftProtocol.createServer({
      host: '127.0.0.1',
      port,
      version: false,
      'online-mode': false,
      hideErrors: true,
      keepAlive: false,
      motd: 'CraftLogin registry test',
      maxPlayers: 3,
    });
    server.on('connection', installVersionedRegistryCodec);
    await new Promise<void>((resolve): void => {
      server.once('listening', resolve);
    });

    try {
      const [legacyPackets, oldSegmentedPackets, currentPackets] = await Promise.all([
        collectRegistryPackets(port, '1.20.2', 'LegacyRegistry'),
        collectRegistryPackets(port, '1.20.6', 'OldRegistry'),
        collectRegistryPackets(port, '26.1', 'CurrentRegistry'),
      ]);

      expect(legacyPackets).toHaveLength(1);
      expect(legacyRegistryPacketSchema.parse(legacyPackets[0]).codec.type).toBe('compound');
      expect(registryIds(oldSegmentedPackets)).toEqual(expectedRegistryIds('1.20.6'));
      expect(registryIds(currentPackets)).toEqual(expectedRegistryIds('26.1'));
    } finally {
      server.close();
    }
  }, 10_000);
});

function collectRegistryTagReferences(mcData: MinecraftData): readonly string[] {
  const codec: unknown = mcData.loginPacket?.['dimensionCodec'];
  if (!isRecord(codec)) {
    return [];
  }
  const references: string[] = [];
  for (const registry of Object.values(codec)) {
    const matches = JSON.stringify(registry ?? {}).matchAll(TAG_REFERENCE_PATTERN);
    for (const match of matches) {
      const reference = match[1] ?? '';
      if (reference.length > 0) {
        references.push(reference);
      }
    }
  }
  return [...new Set(references)].sort();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function collectConfigurationSequence(port: number): Promise<readonly string[]> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'TagsDeliveryTest',
    version: '26.1',
  });

  const sequence: string[] = [];
  return await new Promise<readonly string[]>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      reject(new Error('Minecraft client did not finish configuration'));
    }, 10_000);

    client.on('packet', (_packet: unknown, metadata: PacketMeta): void => {
      sequence.push(metadata.name);
      if (metadata.name === 'finish_configuration') {
        clearTimeout(timeout);
        client.end();
        resolve(sequence);
      }
    });
    client.once('error', (error: Error): void => {
      clearTimeout(timeout);
      client.end();
      reject(error);
    });
  });
}

async function collectRegistryPackets(
  port: number,
  version: string,
  username: string,
): Promise<unknown[]> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username,
    version,
  });
  const packets: unknown[] = [];
  client.on('registry_data', (packet: unknown): void => {
    packets.push(packet);
  });

  return await new Promise<unknown[]>((resolve, reject): void => {
    const timeout = setTimeout((): void => {
      client.end();
      reject(new Error(`Minecraft ${version} did not finish configuration`));
    }, 10_000);
    client.once('playerJoin', (): void => {
      clearTimeout(timeout);
      client.end();
      resolve(packets);
    });
    client.once('end', (): void => {
      clearTimeout(timeout);
      reject(new Error(`Minecraft ${version} disconnected during configuration`));
    });
    client.once('error', (error: Error): void => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function registryIds(packets: readonly unknown[]): string[] {
  return packets.map((packet): string => segmentedRegistryPacketSchema.parse(packet).id);
}

function expectedRegistryIds(version: string): string[] {
  const codec = getMinecraftData(version)?.loginPacket?.['dimensionCodec'];
  if (!isRecord(codec)) {
    throw new Error(`Expected segmented registry data for Minecraft ${version}`);
  }
  return Object.keys(codec);
}

function isPacketSerializer(value: unknown): value is {
  createPacketBuffer(packet: { name: string; params: unknown }): unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'createPacketBuffer') === 'function'
  );
}
