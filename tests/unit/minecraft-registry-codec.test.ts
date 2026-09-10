import minecraftProtocol from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getMinecraftData } from '../../src/mc-server/minecraft-data.js';
import { installVersionedRegistryCodec } from '../../src/mc-server/registry-codec.js';
import { findAvailablePort } from './support/tcp-port.js';

const legacyRegistryPacketSchema = z.object({
  codec: z.object({ type: z.literal('compound'), value: z.record(z.string(), z.unknown()) }),
});
const segmentedRegistryPacketSchema = z.object({ id: z.string() });

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
    }, 5_000);
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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
