import minecraftProtocol from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getMinecraftData } from '../../src/mc-server/minecraft-data.js';
import { createVerifyCommandPacket } from '../../src/mc-server/verify-command.js';

interface PacketSerializer {
  createPacketBuffer(packet: { name: string; params: Record<string, unknown> }): unknown;
}

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
  it.each(['1.7', '1.8.8', '1.12.2'])('skips the declaration on %s', (version): void => {
    const mcData = getMinecraftData(version);
    expect(mcData).not.toBeNull();
    if (mcData === null) {
      return;
    }

    // Pre-1.13 clients validate nothing client-side and deliver /verify as plain chat text.
    expect(createVerifyCommandPacket(mcData)).toBeNull();
  });

  it.each(['1.13.2', '1.16.5', '1.19.4', '1.20.2', '1.21.4', '26.1'])(
    'declares /verify <code> on %s',
    (version): void => {
      const mcData = getMinecraftData(version);
      expect(mcData).not.toBeNull();
      if (mcData === null) {
        return;
      }

      const packet = createVerifyCommandPacket(mcData);
      expect(packet?.name).toBe('declare_commands');

      const parsed = commandTreeSchema.safeParse(packet?.params);
      expect(parsed.success).toBe(true);
      if (!parsed.success) {
        return;
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
      }).not.toThrow();
    },
  );
});

function isPacketSerializer(value: unknown): value is PacketSerializer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'createPacketBuffer') === 'function'
  );
}
