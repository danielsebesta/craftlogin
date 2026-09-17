import minecraftProtocol from 'minecraft-protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { english } from '../../src/locales/en.js';
import { createLogger } from '../../src/logging/logger.js';
import { type MinecraftGhostServer, startGhostServer } from '../../src/mc-server/ghost-server.js';
import { findAvailablePort } from './support/tcp-port.js';

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const dataUriPrefix = 'data:image/png;base64,';
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

describe('Minecraft ghost server advertisement', (): void => {
  let ghostServer: MinecraftGhostServer | undefined;

  afterEach(async (): Promise<void> => {
    await ghostServer?.close();
    ghostServer = undefined;
  });

  it('advertises the formatted MOTD and a PNG favicon in the status ping', async (): Promise<void> => {
    const port = await findAvailablePort();
    ghostServer = await startGhostServer(
      { baseDomain: 'craftlogin.com', host: '127.0.0.1', port },
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
});
