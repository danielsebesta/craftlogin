import minecraftProtocol, { type PacketMeta } from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';

import {
  createTagsPacket,
  getTagBindings,
  installConfigurationTags,
} from '../../src/mc-server/configuration-tags.js';
import { getMinecraftData, type MinecraftData } from '../../src/mc-server/minecraft-data.js';
import { findAvailablePort } from './support/tcp-port.js';

const TAG_REFERENCE_PATTERN = /#([a-z0-9_.-]+:[a-z0-9_./-]+)/g;

describe('configuration tags', (): void => {
  it.each(minecraftProtocol.supportedVersions)(
    'encodes the tags packet for %s when the version uses configuration tags',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const packet = createTagsPacket(mcData);
      if (packet === null) {
        return;
      }

      const rawSerializer: unknown = minecraftProtocol.createSerializer({
        state: minecraftProtocol.states.CONFIGURATION,
        isServer: true,
        version,
        customPackets: {},
      });
      expect(isPacketSerializer(rawSerializer)).toBe(true);
      if (!isPacketSerializer(rawSerializer)) {
        return;
      }
      expect((): void => {
        rawSerializer.createPacketBuffer({ name: packet.name, params: packet.params });
      }).not.toThrow();
    },
  );

  it.each(['1.21.11', '26.1'])(
    'binds every tag referenced by the shipped registries on %s',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      // New references fail closed here so a data update cannot silently reintroduce the vanilla
      // "Missing tag" disconnect. Tags that vanilla code (not data) reads, such as dialog and
      // timeline tags, are asserted separately below.
      const bound = new Set(Object.values(getTagBindings()).flat());
      for (const reference of collectRegistryTagReferences(mcData)) {
        expect(bound.has(reference)).toBe(true);
      }
    },
  );

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
  });
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
    }, 5_000);

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

function isPacketSerializer(value: unknown): value is {
  createPacketBuffer(packet: { name: string; params: unknown }): unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'createPacketBuffer') === 'function'
  );
}
