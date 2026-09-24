import { Socket } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import { createLogger } from '../../src/logging/logger.js';
import { type MinecraftGhostServer, startGhostServer } from '../../src/mc-server/ghost-server.js';
import { findAvailablePort } from './support/tcp-port.js';

// A protocol number newer than anything minecraft-data ships (26.2 = 776). The handshake is
// written by hand so the client does not need protocol definitions for the unknown version.
const UNSUPPORTED_PROTOCOL_VERSION = 776;

const loginDisconnectSchema = z.object({ reason: z.string() });
const chatComponentSchema: z.ZodType<ChatComponent> = z.lazy(() =>
  z.object({
    text: z.string(),
    extra: z.array(chatComponentSchema).optional(),
  }),
);

interface ChatComponent {
  readonly text: string;
  readonly extra?: readonly ChatComponent[] | undefined;
}

interface HandshakeResult {
  readonly socket: Socket;
  readonly disconnectReason: Promise<string>;
}

describe('Minecraft ghost server compat login', (): void => {
  let ghostServer: MinecraftGhostServer | undefined;

  afterEach(async (): Promise<void> => {
    await ghostServer?.close();
    ghostServer = undefined;
  });

  it('keeps an unsupported-protocol code-host client connected for verification', async (): Promise<void> => {
    const port = await findAvailablePort();
    const checkedCodes: string[] = [];
    let resolutionAttempts = 0;
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
      {
        logger: createLogger('silent'),
        pendingCodes: {
          hasPendingCode: (code: string): Promise<boolean> => {
            checkedCodes.push(code);
            return Promise.resolve(true);
          },
        },
        resolver: {
          resolve: (): Promise<'resolved'> => {
            resolutionAttempts += 1;
            return Promise.resolve('resolved');
          },
        },
      },
    );

    const { socket, disconnectReason } = await sendHandshake(port, 'ABCDEFGH.craftlogin.com');
    const disconnectWatch = disconnectReason.then(
      (reason): string => reason,
      (): string => 'still connected',
    );

    // Give the server room to wrongly kick the client before asserting it stayed.
    const outcome = await Promise.race([
      disconnectWatch,
      new Promise<string>((resolve): void => {
        setTimeout((): void => {
          resolve('still connected');
        }, 400);
      }),
    ]);

    expect(outcome).toBe('still connected');
    expect(checkedCodes).toHaveLength(1);
    expect(resolutionAttempts).toBe(0);
    socket.destroy();
  });

  it('rejects an unsupported-protocol code-host client when the code is unavailable', async (): Promise<void> => {
    const port = await findAvailablePort();
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
      {
        logger: createLogger('silent'),
        pendingCodes: {
          hasPendingCode: (): Promise<boolean> => Promise.resolve(false),
        },
        resolver: {
          resolve: (): Promise<'resolved'> => Promise.resolve('resolved'),
        },
      },
    );

    const { socket, disconnectReason } = await sendHandshake(port, 'ABCDEFGH.craftlogin.com');
    const reason = await disconnectReason;
    socket.destroy();

    expect(flattenChatComponent(chatComponentSchema.parse(JSON.parse(reason)))).toBe(
      english.minecraft.unavailable,
    );
  });

  it('rejects an unsupported-protocol lobby client before login', async (): Promise<void> => {
    const port = await findAvailablePort();
    let codeLookups = 0;
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
      {
        logger: createLogger('silent'),
        pendingCodes: {
          hasPendingCode: (): Promise<boolean> => {
            codeLookups += 1;
            return Promise.resolve(true);
          },
        },
        resolver: {
          resolve: (): Promise<'resolved'> => Promise.resolve('resolved'),
        },
      },
    );

    const { socket, disconnectReason } = await sendHandshake(port, 'craftlogin.com');
    const reason = await disconnectReason;
    socket.destroy();

    expect(flattenChatComponent(chatComponentSchema.parse(JSON.parse(reason)))).toBe(
      english.minecraft.unsupportedVersion,
    );
    expect(codeLookups).toBe(0);
  });
});

function flattenChatComponent(component: ChatComponent): string {
  return component.text + (component.extra ?? []).map(flattenChatComponent).join('');
}

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value >>> 0;
  do {
    let byte = remaining & 0x7f;
    remaining = remaining >>> 7;
    if (remaining !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining !== 0);
  return Buffer.from(bytes);
}

function encodeString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarint(data.length), data]);
}

function decodeVarint(buffer: Buffer, offset: number): { value: number; offset: number } {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  for (;;) {
    const byte = buffer[cursor];
    if (byte === undefined) {
      throw new Error('Truncated VarInt');
    }
    value |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) {
      return { value, offset: cursor };
    }
    shift += 7;
  }
}

function handshakeFrame(protocolVersion: number, host: string, port: number): Buffer {
  const serverPort = Buffer.alloc(2);
  serverPort.writeUInt16BE(port);
  const body = Buffer.concat([
    encodeVarint(0x00),
    encodeVarint(protocolVersion),
    encodeString(host),
    serverPort,
    encodeVarint(2),
  ]);
  return Buffer.concat([encodeVarint(body.length), body]);
}

async function sendHandshake(port: number, serverHost: string): Promise<HandshakeResult> {
  const socket = new Socket();
  await new Promise<void>((resolve, reject): void => {
    socket.once('error', reject);
    socket.connect(port, '127.0.0.1', resolve);
  });
  socket.write(handshakeFrame(UNSUPPORTED_PROTOCOL_VERSION, serverHost, port));

  const disconnectReason = new Promise<string>((resolve, reject): void => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      const lengthPrefix = safeDecodeVarint(buffer, 0);
      if (lengthPrefix === null || buffer.length < lengthPrefix.offset + lengthPrefix.value) {
        return;
      }
      const frame = buffer.subarray(lengthPrefix.offset, lengthPrefix.offset + lengthPrefix.value);
      // Login-state disconnect: packet id VarInt followed by the JSON chat reason string.
      const packetId = decodeVarint(frame, 0);
      const reasonLength = decodeVarint(frame, packetId.offset);
      const reason = frame
        .subarray(reasonLength.offset, reasonLength.offset + reasonLength.value)
        .toString('utf8');
      const parsedReason = loginDisconnectSchema.safeParse({ reason });
      if (!parsedReason.success) {
        reject(new Error('Minecraft server sent a malformed disconnect frame'));
        return;
      }
      resolve(parsedReason.data.reason);
    };
    socket.on('data', onData);
    socket.once('error', reject);
    socket.once('close', (): void => {
      reject(new Error('Minecraft connection closed before a disconnect packet'));
    });
  });

  return { socket, disconnectReason };
}

function safeDecodeVarint(
  buffer: Buffer,
  offset: number,
): { value: number; offset: number } | null {
  try {
    return decodeVarint(buffer, offset);
  } catch {
    return null;
  }
}
