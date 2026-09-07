import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createConfigurationDisconnectReason } from '../../src/mc-server/disconnect.js';

interface PacketSerializer {
  createPacketBuffer(packet: { name: string; params: { reason: unknown } }): unknown;
}

interface PacketDeserializer {
  parsePacketBuffer(buffer: Buffer): unknown;
}

interface ProtocolCodecFactory {
  createDeserializer(options: ProtocolCodecOptions): unknown;
  createSerializer(options: ProtocolCodecOptions): unknown;
  states: { CONFIGURATION: unknown };
}

interface ProtocolCodecOptions {
  customPackets: Record<string, never>;
  isServer: boolean;
  state: unknown;
  version: string;
}

const decodedDisconnectSchema = z.object({
  data: z.object({
    name: z.literal('disconnect'),
    params: z.object({ reason: z.unknown() }),
  }),
});
const nbtTextSchema = z.object({
  type: z.literal('compound'),
  value: z.object({
    text: z.object({
      type: z.literal('string'),
      value: z.string(),
    }),
  }),
});

const require = createRequire(import.meta.url);
const loadedProtocol: unknown = require('minecraft-protocol');
if (!isProtocolCodecFactory(loadedProtocol)) {
  throw new Error('The Minecraft protocol serializer is unavailable');
}
const protocol = loadedProtocol;

describe('configuration-state disconnect reason', (): void => {
  it('round-trips the JSON chat component used by Minecraft 1.20.2', (): void => {
    const message = 'Verification complete. Return to your browser.';
    const decodedReason = serializeAndDecode(message, false, '1.20.2');

    expect(decodedReason).toBe(JSON.stringify({ text: message }));
  });

  it('round-trips the NBT chat component used by Minecraft 1.20.3+', (): void => {
    const message = 'Verification complete. Return to your browser.';
    const decodedReason = serializeAndDecode(message, true, '1.20.3');
    const parsedReason = nbtTextSchema.safeParse(decodedReason);

    expect(parsedReason.success).toBe(true);
    if (parsedReason.success) {
      expect(parsedReason.data.value.text.value).toBe(message);
    }
  });
});

function serializeAndDecode(message: string, useNbtComponents: boolean, version: string): unknown {
  const options: ProtocolCodecOptions = {
    customPackets: {},
    isServer: true,
    state: protocol.states.CONFIGURATION,
    version,
  };
  const serializer = protocol.createSerializer(options);
  if (!isPacketSerializer(serializer)) {
    throw new Error('The Minecraft packet serializer has an invalid shape');
  }

  const encoded = serializer.createPacketBuffer({
    name: 'disconnect',
    params: {
      reason: createConfigurationDisconnectReason(message, useNbtComponents),
    },
  });
  if (!Buffer.isBuffer(encoded)) {
    throw new Error('The Minecraft disconnect packet was not serialized to a buffer');
  }

  const deserializer = protocol.createDeserializer({ ...options, isServer: false });
  if (!isPacketDeserializer(deserializer)) {
    throw new Error('The Minecraft packet deserializer has an invalid shape');
  }

  const decoded = decodedDisconnectSchema.safeParse(deserializer.parsePacketBuffer(encoded));
  if (!decoded.success) {
    throw new Error('The serialized Minecraft disconnect packet could not be decoded');
  }
  return decoded.data.data.params.reason;
}

function isProtocolCodecFactory(value: unknown): value is ProtocolCodecFactory {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const states: unknown = Reflect.get(value, 'states');
  return (
    typeof Reflect.get(value, 'createSerializer') === 'function' &&
    typeof Reflect.get(value, 'createDeserializer') === 'function' &&
    typeof states === 'object' &&
    states !== null &&
    Reflect.has(states, 'CONFIGURATION')
  );
}

function isPacketSerializer(value: unknown): value is PacketSerializer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'createPacketBuffer') === 'function'
  );
}

function isPacketDeserializer(value: unknown): value is PacketDeserializer {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'parsePacketBuffer') === 'function'
  );
}
