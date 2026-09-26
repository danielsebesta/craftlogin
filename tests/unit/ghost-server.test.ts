import { once } from 'node:events';
import { createConnection, Socket } from 'node:net';

import minecraftProtocol from 'minecraft-protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import { createLogger } from '../../src/logging/logger.js';
import { type MinecraftGhostServer, startGhostServer } from '../../src/mc-server/ghost-server.js';
import { findAvailablePort } from './support/tcp-port.js';

// A protocol newer than minecraft-data's range (26.2 = 776); the handshake is
// hand-written so the client needs no protocol definitions for it.
const UNSUPPORTED_PROTOCOL_VERSION = 776;

const MAX_CONNECTIONS_PER_ADDRESS = 64;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dataUriPrefix = 'data:image/png;base64,';

const loginDisconnectSchema = z.object({ reason: z.string() });
const chatComponentSchema: z.ZodType<ChatComponent> = z.lazy(() =>
  z.object({
    text: z.string(),
    extra: z.array(chatComponentSchema).optional(),
  }),
);
const serverPingSchema = z.object({
  description: z.object({
    text: z.string(),
    color: z.string(),
    extra: z.array(z.object({ text: z.string(), color: z.string() })),
  }),
  favicon: z.string(),
  version: z.object({ name: z.string(), protocol: z.number() }),
  players: z.object({
    online: z.number(),
    max: z.number(),
    sample: z.array(z.object({ name: z.string() })),
  }),
});

interface ChatComponent {
  readonly text: string;
  readonly extra?: readonly ChatComponent[] | undefined;
}

interface HandshakeResult {
  readonly socket: Socket;
  readonly disconnectReason: Promise<string>;
}

function startTestServer(
  port: number,
  pending: (code: string) => boolean = (): boolean => false,
): Promise<MinecraftGhostServer> {
  return startGhostServer(
    { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
    {
      logger: createLogger('silent'),
      pendingCodes: {
        hasPendingCode: (code: string): Promise<boolean> => Promise.resolve(pending(code)),
      },
      resolver: {
        resolve: (): Promise<'unavailable'> => Promise.resolve('unavailable'),
      },
    },
  );
}

describe('Minecraft ghost server', (): void => {
  let ghostServer: MinecraftGhostServer | undefined;
  const sockets: Socket[] = [];

  afterEach(async (): Promise<void> => {
    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.length = 0;
    await ghostServer?.close();
    ghostServer = undefined;
  });

  it('listens with multi-version online-mode configuration and closes cleanly', async (): Promise<void> => {
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port: 0 },
      {
        logger: createLogger('silent'),
        pendingCodes: {
          hasPendingCode: (): Promise<boolean> => Promise.resolve(false),
        },
        resolver: {
          resolve: (): Promise<'unavailable'> => Promise.resolve('unavailable'),
        },
      },
    );

    await expect(ghostServer.close()).resolves.toBeUndefined();
    ghostServer = undefined;
  });

  it('advertises the formatted MOTD and a PNG favicon in the status ping', async (): Promise<void> => {
    const port = await findAvailablePort();
    ghostServer = await startTestServer(port);

    const result: unknown = await minecraftProtocol.ping({ host: '127.0.0.1', port });
    const parsedPing = serverPingSchema.parse(result);

    expect(parsedPing.description.text).toBe(english.minecraft.motd);
    expect(parsedPing.description.color).toBe('#A2D060');
    expect(parsedPing.description.extra[0]).toEqual({
      text: `\n${english.minecraft.motdDetail}`,
      color: '#A7ADA7',
    });

    expect(parsedPing.version.name).toBe(english.minecraft.listVersion);
    expect(parsedPing.version.protocol).toBeGreaterThan(0);
    expect(parsedPing.players.max).toBe(64);
    expect(parsedPing.players.sample.map((entry): string => entry.name)).toEqual([
      ...english.minecraft.listHover,
    ]);

    expect(parsedPing.favicon.startsWith(dataUriPrefix)).toBe(true);
    const iconBytes = Buffer.from(parsedPing.favicon.slice(dataUriPrefix.length), 'base64');
    expect(iconBytes.subarray(0, pngSignature.length)).toEqual(pngSignature);
  });

  it('disconnects an expired or unknown code without attempting resolution', async (): Promise<void> => {
    const port = await findAvailablePort();
    let resolutionAttempts = 0;
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
      {
        logger: createLogger('silent'),
        pendingCodes: {
          hasPendingCode: (): Promise<boolean> => Promise.resolve(false),
        },
        resolver: {
          resolve: (): Promise<'unavailable'> => {
            resolutionAttempts += 1;
            return Promise.resolve('unavailable');
          },
        },
      },
    );

    const rawReason = await connectAndWaitForRejection(port);
    const parsedReason: unknown = JSON.parse(rawReason);

    expect(flattenChatComponent(chatComponentSchema.parse(parsedReason))).toBe(
      english.minecraft.unavailable,
    );
    expect(resolutionAttempts).toBe(0);
  });

  it('rejects connections past the per-address cap and releases closed slots', async (): Promise<void> => {
    const port = await findAvailablePort();
    ghostServer = await startTestServer(port);

    // Idle sockets up to the cap are accepted and stay open.
    for (let index = 0; index < MAX_CONNECTIONS_PER_ADDRESS; index += 1) {
      const socket = createConnection({ host: '127.0.0.1', port });
      await once(socket, 'connect');
      sockets.push(socket);
    }

    // The next socket is destroyed before any protocol work happens.
    const rejected = createConnection({ host: '127.0.0.1', port });
    await once(rejected, 'connect');
    await Promise.race([
      once(rejected, 'close'),
      new Promise((_resolve, reject): void => {
        setTimeout(() => {
          reject(new Error('Over-limit socket stayed open'));
        }, 2_000);
      }),
    ]);

    // Releasing an accepted socket frees its slot for a replacement.
    sockets.pop()?.destroy();
    let accepted = false;
    for (let attempt = 0; attempt < 20 && !accepted; attempt += 1) {
      const candidate = createConnection({ host: '127.0.0.1', port });
      await once(candidate, 'connect');
      const closedEarly = await Promise.race([
        once(candidate, 'close').then((): boolean => true),
        new Promise<boolean>((resolve): void => {
          setTimeout(() => {
            resolve(false);
          }, 200);
        }),
      ]);
      if (closedEarly) {
        await new Promise<void>((resolve): void => {
          setTimeout(resolve, 50);
        });
      } else {
        accepted = true;
        sockets.push(candidate);
      }
    }
    expect(accepted).toBe(true);
  }, 15_000);

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
    sockets.push(socket);
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
  });

  it('rejects an unsupported-protocol code-host client when the code is unavailable', async (): Promise<void> => {
    const port = await findAvailablePort();
    ghostServer = await startTestServer(port);

    const { socket, disconnectReason } = await sendHandshake(port, 'ABCDEFGH.craftlogin.com');
    sockets.push(socket);
    const reason = await disconnectReason;

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
    sockets.push(socket);
    const reason = await disconnectReason;

    expect(flattenChatComponent(chatComponentSchema.parse(JSON.parse(reason)))).toBe(
      english.minecraft.unsupportedVersion,
    );
    expect(codeLookups).toBe(0);
  });
});

function flattenChatComponent(component: ChatComponent): string {
  return component.text + (component.extra ?? []).map(flattenChatComponent).join('');
}

async function connectAndWaitForRejection(port: number): Promise<string> {
  const client = minecraftProtocol.createClient({
    auth: 'offline',
    fakeHost: 'ABCDEFGH.craftlogin.com',
    hideErrors: true,
    host: '127.0.0.1',
    port,
    username: 'ExpiredCodeTest',
    version: '1.20.2',
  });

  return await new Promise<string>((resolve, reject): void => {
    let settled = false;
    const timeout = setTimeout((): void => {
      settled = true;
      client.end();
      reject(new Error('Minecraft client did not receive a disconnect packet'));
    }, 5_000);

    client.once('disconnect', (packet: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.end();

      const parsedPacket = loginDisconnectSchema.safeParse(packet);
      if (!parsedPacket.success) {
        reject(new Error('Minecraft client received an invalid disconnect packet'));
        return;
      }
      resolve(parsedPacket.data.reason);
    });
    client.once('error', (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      client.end();
      reject(error);
    });
    client.once('end', (reason: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Minecraft connection ended before rejection: ${reason}`));
    });
  });
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
