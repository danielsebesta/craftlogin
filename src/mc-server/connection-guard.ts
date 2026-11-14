import type { ServerClient } from 'minecraft-protocol';

declare module 'minecraft-protocol' {
  // Runtime members of the library's client that its shipped types omit
  // (see minecraft-protocol/src/client.js and transforms/framing.js).
  interface ServerClient {
    readonly splitter: FrameSplitter;
    setCompressionThreshold(threshold: number): void;
  }
}

interface FrameSplitter {
  readonly buffer: Buffer;
  readonly recognizeLegacyPing: boolean;
  _transform(chunk: Buffer, encoding: BufferEncoding, callback: () => void): void;
}

// Vanilla frames carry at most a three-byte length, and nothing this server
// accepts comes close to 64 KiB, so the cap also bounds per-connection buffering.
export const MAX_INBOUND_FRAME_BYTES = 64 * 1024;
const MAX_FRAME_HEADER_BYTES = 3;
const LEGACY_PING_PACKET_ID = 0xfe;
const MAX_LEGACY_PING_BYTES = 1_024;

export type ConnectionFailureHandler = (error: unknown) => void;

/**
 * The library's splitter trusts a 32-bit signed length prefix: a negative value
 * throws out of the socket callback or never advances its read loop. Rejecting
 * the header before it runs also stops an oversized claim from buffering.
 */
export function hasOnlyValidFrames(buffer: Buffer): boolean {
  let offset = 0;
  while (offset < buffer.length) {
    let length = 0;
    let headerBytes = 0;
    for (;;) {
      const byte = buffer[offset + headerBytes];
      if (byte === undefined) {
        // A partial header is not a violation; more bytes may complete it.
        return true;
      }
      length |= (byte & 0x7f) << (7 * headerBytes);
      headerBytes += 1;
      if ((byte & 0x80) === 0) {
        break;
      }
      if (headerBytes === MAX_FRAME_HEADER_BYTES) {
        return false;
      }
    }
    if (length === 0 || length > MAX_INBOUND_FRAME_BYTES) {
      return false;
    }
    offset += headerBytes + length;
  }
  return true;
}

/**
 * Packets are dispatched synchronously from the socket callback, so any listener
 * that throws, the library's own login and chat plugins included, would otherwise
 * become an uncaught exception that stops the whole process. A failure here costs
 * only the connection that caused it.
 */
export function installConnectionGuard(
  client: ServerClient,
  onFailure: ConnectionFailureHandler,
): void {
  let failed = false;
  const fail = (error: unknown): void => {
    if (failed) {
      return;
    }
    failed = true;
    client.socket.destroy();
    onFailure(error);
  };

  const emit = client.emit.bind(client);
  client.emit = (event: string | symbol, ...args: unknown[]): boolean => {
    // Frames already buffered in this read must not reach listeners after a
    // failure; 'end' still runs so connection slots get released.
    if (failed && event !== 'end') {
      return false;
    }
    try {
      return emit(event, ...args);
    } catch (error: unknown) {
      fail(error);
      return true;
    }
  };

  const splitter = client.splitter;
  const splitFrames = splitter._transform.bind(splitter);
  splitter._transform = (chunk, encoding, callback): void => {
    const pending = Buffer.concat([splitter.buffer, chunk]);
    const valid =
      splitter.recognizeLegacyPing && pending[0] === LEGACY_PING_PACKET_ID
        ? pending.length <= MAX_LEGACY_PING_BYTES
        : hasOnlyValidFrames(pending);
    if (failed || !valid) {
      fail(new InvalidMinecraftFrameError('A client sent an invalid packet frame'));
      callback();
      return;
    }
    try {
      splitFrames(chunk, encoding, callback);
    } catch (error: unknown) {
      fail(error);
      callback();
    }
  };

  disableCompression(client);
}

/** Ends a connection after a failure outside packet dispatch, such as a timer or a floating task. */
export function abortConnection(client: ServerClient, error: unknown): void {
  client.socket.destroy();
  client.emit('error', error);
}

// The library inflates inbound packets with an unbounded synchronous unzip, so
// one small frame from any logged-in account could exhaust memory. Vanilla
// clients skip compression when the server never announces it, and this server
// only exchanges a handful of packets per connection.
function disableCompression(client: ServerClient): void {
  const writePacket = client.write.bind(client);
  client.write = (packetName: string, params: unknown): void => {
    if (packetName !== 'compress') {
      writePacket(packetName, params);
    }
  };
  client.setCompressionThreshold = (): void => undefined;
}

export class InvalidMinecraftFrameError extends Error {
  public override readonly name = 'InvalidMinecraftFrameError';
}
