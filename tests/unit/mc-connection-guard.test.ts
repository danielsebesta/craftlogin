import { createCipheriv } from 'node:crypto';
import { once } from 'node:events';
import { createConnection, type Socket } from 'node:net';

import minecraftProtocol, { type Server, type ServerClient } from 'minecraft-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  hasOnlyValidFrames,
  installConnectionGuard,
  InvalidMinecraftFrameError,
  MAX_INBOUND_FRAME_BYTES,
} from '../../src/mc-server/connection-guard.js';
import { findAvailablePort } from './support/tcp-port.js';

function nextConnection(server: Server): Promise<ServerClient> {
  return new Promise((resolve): void => {
    server.once('connection', resolve);
  });
}

function nextJoin(server: Server): Promise<ServerClient> {
  return new Promise((resolve): void => {
    server.on('playerJoin', resolve);
  });
}

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  bytes.push(remaining);
  return Buffer.from(bytes);
}

describe('hasOnlyValidFrames', (): void => {
  it('accepts complete and still-arriving frames', (): void => {
    const frame = Buffer.concat([varint(3), Buffer.from([1, 2, 3])]);

    expect(hasOnlyValidFrames(Buffer.alloc(0))).toBe(true);
    expect(hasOnlyValidFrames(frame)).toBe(true);
    expect(hasOnlyValidFrames(Buffer.concat([frame, frame]))).toBe(true);
    // A partial body and a partial multi-byte length both wait for more bytes.
    expect(hasOnlyValidFrames(frame.subarray(0, 2))).toBe(true);
    expect(hasOnlyValidFrames(Buffer.from([0x80]))).toBe(true);
    expect(hasOnlyValidFrames(varint(MAX_INBOUND_FRAME_BYTES))).toBe(true);
  });

  it('rejects lengths the library splitter cannot handle safely', (): void => {
    // -5 as a five-byte varint: size + value is zero, so its read loop never advances.
    expect(hasOnlyValidFrames(Buffer.from([0xfb, 0xff, 0xff, 0xff, 0x0f]))).toBe(false);
    expect(hasOnlyValidFrames(Buffer.from([0xff, 0xff, 0xff, 0x7f]))).toBe(false);
    expect(hasOnlyValidFrames(varint(MAX_INBOUND_FRAME_BYTES + 1))).toBe(false);
    expect(hasOnlyValidFrames(varint(0))).toBe(false);
  });

  it('finds an invalid frame behind a valid one', (): void => {
    const valid = Buffer.concat([varint(1), Buffer.from([1])]);

    expect(hasOnlyValidFrames(Buffer.concat([valid, Buffer.from([0xff, 0xff, 0xff])]))).toBe(false);
  });
});

describe('installConnectionGuard', (): void => {
  let server: Server | undefined;
  let socket: Socket | undefined;

  afterEach((): void => {
    socket?.destroy();
    socket = undefined;
    server?.close();
    server = undefined;
  });

  async function connectGuardedClient(onFailure: (error: unknown) => void): Promise<ServerClient> {
    const port = await findAvailablePort();
    server = minecraftProtocol.createServer({
      host: '127.0.0.1',
      hideErrors: true,
      'online-mode': false,
      port,
      version: '1.21.4',
    });
    await once(server, 'listening');
    const connected = nextConnection(server);
    socket = createConnection({ host: '127.0.0.1', port });
    const client = await connected;
    installConnectionGuard(client, onFailure);
    return client;
  }

  it('keeps a throwing packet listener from escaping, and ends only that client', async (): Promise<void> => {
    const onFailure = vi.fn();
    const client = await connectGuardedClient(onFailure);
    // The same failure the library hits when a client supplies a bad shared secret.
    client.on('encryption_begin', (): void => {
      createCipheriv('aes-128-cfb8', Buffer.alloc(8), Buffer.alloc(8));
    });
    const lateListener = vi.fn();
    client.on('late_packet', lateListener);

    expect(client.emit('encryption_begin', {})).toBe(true);

    expect(onFailure).toHaveBeenCalledOnce();
    expect(client.socket.destroyed).toBe(true);
    // Frames already read from the socket stop reaching listeners.
    client.emit('late_packet', {});
    expect(lateListener).not.toHaveBeenCalled();
  });

  it('still releases connection slots after a failure', async (): Promise<void> => {
    const client = await connectGuardedClient(vi.fn());
    client.on('bad_packet', (): void => {
      throw new Error('listener failure');
    });
    const ended = once(client, 'end');

    client.emit('bad_packet', {});

    await expect(ended).resolves.toBeDefined();
  });

  it('fails only the sending connection on an invalid frame', async (): Promise<void> => {
    const onFailure = vi.fn();
    const client = await connectGuardedClient(onFailure);
    const callback = vi.fn();

    // Oversized rather than negative: without the guard this must fail an assertion, and a
    // negative length would spin the library's read loop forever and hang the whole run.
    client.splitter._transform(varint(MAX_INBOUND_FRAME_BYTES + 1), 'binary', callback);

    expect(callback).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith(expect.any(InvalidMinecraftFrameError));
    expect(client.socket.destroyed).toBe(true);
  });

  it('bounds a legacy ping that keeps growing', async (): Promise<void> => {
    const onFailure = vi.fn();
    const client = await connectGuardedClient(onFailure);

    client.splitter._transform(Buffer.alloc(2_048, 0xfe), 'binary', vi.fn());

    expect(onFailure).toHaveBeenCalledWith(expect.any(InvalidMinecraftFrameError));
  });

  it('never announces compression or enables its unbounded inflate', async (): Promise<void> => {
    const client = await connectGuardedClient(vi.fn());
    const serialized: unknown[] = [];
    client.serializer.on('data', (chunk: unknown): void => {
      serialized.push(chunk);
    });

    client.write('compress', { threshold: 256 });
    client.setCompressionThreshold(256);

    expect(serialized).toEqual([]);
    expect(Reflect.get(client, 'decompressor')).toBeNull();
  });

  it('lets a real client finish login and reach play without compression', async (): Promise<void> => {
    const port = await findAvailablePort();
    const onFailure = vi.fn();
    server = minecraftProtocol.createServer({
      host: '127.0.0.1',
      hideErrors: true,
      'online-mode': false,
      port,
      version: '1.21.4',
    });
    await once(server, 'listening');
    server.on('connection', (connection): void => {
      installConnectionGuard(connection, onFailure);
    });
    const joined = nextJoin(server);

    const client = minecraftProtocol.createClient({
      auth: 'offline',
      hideErrors: true,
      host: '127.0.0.1',
      port,
      username: 'GuardedPlayer',
      version: '1.21.4',
    });
    try {
      const player = await joined;
      expect(player.username).toBe('GuardedPlayer');
      expect(client.state).toBe(minecraftProtocol.states.PLAY);
      expect(onFailure).not.toHaveBeenCalled();
    } finally {
      client.end();
    }
  }, 15_000);
});
