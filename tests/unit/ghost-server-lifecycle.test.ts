import { createLogger } from '../../src/logging/logger.js';
import { startGhostServer } from '../../src/mc-server/ghost-server.js';
import { describe, expect, it } from 'vitest';

describe('Minecraft ghost server lifecycle', (): void => {
  it('listens with multi-version online-mode configuration and closes cleanly', async (): Promise<void> => {
    const server = await startGhostServer(
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

    await expect(server.close()).resolves.toBeUndefined();
  });
});
