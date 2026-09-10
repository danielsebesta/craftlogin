import minecraftProtocol from 'minecraft-protocol';
import { describe, expect, it } from 'vitest';

import { createLogger } from '../../src/logging/logger.js';
import {
  getProtocolErrorDetails,
  installProtocolTrace,
} from '../../src/mc-server/protocol-trace.js';
import { installVersionedRegistryCodec } from '../../src/mc-server/registry-codec.js';
import { findAvailablePort } from './support/tcp-port.js';

describe('Minecraft protocol trace', (): void => {
  it('logs packet metadata without handshake payloads or verification codes', async (): Promise<void> => {
    let output = '';
    const logger = createLogger('trace', {
      write: (message): void => {
        output += message;
      },
    });
    const port = await findAvailablePort();
    const server = minecraftProtocol.createServer({
      host: '127.0.0.1',
      port,
      version: false,
      'online-mode': false,
      hideErrors: true,
      keepAlive: false,
      motd: 'CraftLogin trace test',
      maxPlayers: 1,
    });
    server.on('connection', (client): void => {
      installProtocolTrace(client, logger);
      installVersionedRegistryCodec(client);
    });
    server.on('playerJoin', (client): void => {
      client.end('Trace test complete');
    });

    await new Promise<void>((resolve): void => {
      server.once('listening', resolve);
    });

    const client = minecraftProtocol.createClient({
      auth: 'offline',
      fakeHost: 'ABCDEFGH.craftlogin.com',
      hideErrors: true,
      host: '127.0.0.1',
      port,
      username: 'TraceTest',
      version: '26.1',
    });

    try {
      await new Promise<void>((resolve, reject): void => {
        const timeout = setTimeout((): void => {
          client.end();
          reject(new Error('Minecraft trace test did not finish'));
        }, 5_000);
        client.once('end', (): void => {
          clearTimeout(timeout);
          resolve();
        });
        client.once('error', (error: Error): void => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } finally {
      server.close();
    }

    expect(output).toContain('Minecraft protocol packet');
    expect(output).toContain('"packetName":"set_protocol"');
    expect(output).toContain('"direction":"serverbound"');
    expect(output).toContain('"direction":"clientbound"');
    expect(output).not.toContain('ABCDEFGH');
    expect(output).not.toContain('craftlogin.com');
  });

  it('sanitizes secrets embedded in diagnostic error text', (): void => {
    const error = new Error(
      'Failed at abcdefgh.craftlogin.com/callback?code=raw-code&state=raw-state Bearer raw-token',
    );
    const details = JSON.stringify(getProtocolErrorDetails(error));

    expect(details).toContain('[REDACTED]');
    expect(details).not.toContain('ABCDEFGH');
    expect(details).not.toContain('abcdefgh');
    expect(details).not.toContain('raw-code');
    expect(details).not.toContain('raw-state');
    expect(details).not.toContain('raw-token');
  });
});
