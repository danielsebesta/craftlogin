import { createHash } from 'node:crypto';

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseAppRegistrationInput } from '../../src/api/app-registration.js';
import { OriginAllowlistCache } from '../../src/api/client-directory.js';
import {
  APP_ICON_MAX_BYTES,
  APP_ICON_SIZE,
  AppIconError,
  normalizeAppIcon,
  type AppIconErrorCode,
} from '../../src/developers/app-icon.js';
import type { MinecraftPlayerLookup } from '../../src/mojang/client.js';
import type { VerifiedUserRepository } from '../../src/users/verified-user-repository.js';
import type { VerificationClaim } from '../../src/verification/redis-verification-store.js';
import type { AuthenticatedMinecraftPlayer } from '../../src/verification/types.js';
import {
  VerificationResolutionError,
  VerificationResolver,
} from '../../src/verification/verification-resolver.js';

describe('parseAppRegistrationInput', (): void => {
  it('accepts exact public-client redirect URIs', (): void => {
    expect(
      parseAppRegistrationInput({
        clientType: 'public',
        name: 'Map Viewer',
        redirectUris: ['https://maps.example/callback', 'http://127.0.0.1:4173/oauth/callback'],
      }),
    ).toEqual({
      clientType: 'public',
      name: 'Map Viewer',
      redirectUris: ['https://maps.example/callback', 'http://127.0.0.1:4173/oauth/callback'],
    });
  });

  it('rejects dangerous or malformed redirect URIs and reserved names', (): void => {
    const badUris: readonly [string, string[]][] = [
      ['wildcards', ['https://*.example/callback']],
      ['fragments', ['https://app.example/callback#fragment']],
      ['duplicates', ['https://app.example/callback', 'https://app.example/callback']],
      ['insecure non-loopback origins', ['http://app.example/callback']],
      ['embedded credentials', ['https://user:password@app.example/callback']],
    ];
    for (const [caseName, redirectUris] of badUris) {
      expect((): void => {
        parseAppRegistrationInput({
          clientType: 'confidential',
          name: 'Invalid app',
          redirectUris,
        });
      }, caseName).toThrow();
    }

    for (const name of ['Developer Console', 'developer console', 'DEVELOPER CONSOLE']) {
      expect((): void => {
        parseAppRegistrationInput({
          clientType: 'public',
          name,
          redirectUris: ['https://app.example/callback'],
        });
      }, name).toThrow();
    }
  });

  it('rejects silently normalized app names and unknown properties', (): void => {
    expect((): void => {
      parseAppRegistrationInput({
        clientType: 'public',
        name: ' Padded name ',
        redirectUris: ['https://app.example/callback'],
        unexpected: true,
      });
    }).toThrow();
  });
});

describe('OriginAllowlistCache', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('serves repeat reads from the snapshot within the TTL', async (): Promise<void> => {
    let loads = 0;
    const cache = new OriginAllowlistCache((): Promise<ReadonlySet<string>> => {
      loads += 1;
      return Promise.resolve(new Set(['https://app.example']));
    }, 30_000);

    expect(await cache.get()).toEqual(new Set(['https://app.example']));
    expect(await cache.get()).toEqual(new Set(['https://app.example']));
    expect(loads).toBe(1);
  });

  it('shares one in-flight scan across concurrent misses', async (): Promise<void> => {
    let loads = 0;
    let release: () => void = (): void => undefined;
    const gate = new Promise<void>((resolve): void => {
      release = resolve;
    });
    const cache = new OriginAllowlistCache(async (): Promise<ReadonlySet<string>> => {
      loads += 1;
      await gate;
      return new Set(['https://app.example']);
    });

    const pending = Promise.all([cache.get(), cache.get(), cache.get()]);
    release();
    await pending;
    expect(loads).toBe(1);
  });

  it('refreshes after the TTL and falls back to the stale snapshot on failure', async (): Promise<void> => {
    vi.useFakeTimers();
    let loads = 0;
    let failing = false;
    const cache = new OriginAllowlistCache((): Promise<ReadonlySet<string>> => {
      loads += 1;
      return failing
        ? Promise.reject(new Error('database unavailable'))
        : Promise.resolve(new Set([`https://app-${loads.toString()}.example`]));
    }, 30_000);

    expect(await cache.get()).toEqual(new Set(['https://app-1.example']));

    await vi.advanceTimersByTimeAsync(31_000);
    failing = true;
    expect(await cache.get()).toEqual(new Set(['https://app-1.example']));
    expect(loads).toBe(2);

    // A failed refresh does not extend the snapshot; the next read retries.
    failing = false;
    expect(await cache.get()).toEqual(new Set(['https://app-3.example']));
    expect(loads).toBe(3);
  });

  it('propagates the load failure when no snapshot exists yet', async (): Promise<void> => {
    const cache = new OriginAllowlistCache((): Promise<ReadonlySet<string>> =>
      Promise.reject(new Error('database unavailable')),
    );

    await expect(cache.get()).rejects.toThrow('database unavailable');
  });
});

function pngOf(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

async function decode(png: Buffer): Promise<{
  readonly height: number;
  readonly pixel: (x: number, y: number) => readonly number[];
  readonly width: number;
}> {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  return {
    height: image.height,
    pixel: (x: number, y: number): readonly number[] => {
      const offset = (y * image.width + x) * 4;
      return [
        data[offset] ?? -1,
        data[offset + 1] ?? -1,
        data[offset + 2] ?? -1,
        data[offset + 3] ?? -1,
      ];
    },
    width: image.width,
  };
}

async function expectIconError(input: Uint8Array, code: AppIconErrorCode): Promise<void> {
  const failure = await normalizeAppIcon(input).then(
    (): undefined => undefined,
    (error: unknown): Error =>
      error instanceof Error ? error : new Error('Icon normalization failed unexpectedly'),
  );
  expect(failure).toBeInstanceOf(AppIconError);
  expect(failure instanceof AppIconError ? failure.code : undefined).toBe(code);
}

describe('application icon normalization', (): void => {
  it('keeps a 64x64 icon at its native pixels and hashes the stored PNG', async (): Promise<void> => {
    const normalized = await normalizeAppIcon(pngOf(APP_ICON_SIZE, APP_ICON_SIZE));
    const decoded = await decode(normalized.png);

    expect(decoded.width).toBe(APP_ICON_SIZE);
    expect(decoded.height).toBe(APP_ICON_SIZE);
    expect(decoded.pixel(0, 0)).toEqual([255, 0, 0, 255]);
    expect(decoded.pixel(63, 63)).toEqual([255, 0, 0, 255]);
    expect(normalized.hash).toBe(createHash('sha256').update(normalized.png).digest('hex'));
  });

  it('centers a smaller icon without scaling it', async (): Promise<void> => {
    const normalized = await normalizeAppIcon(pngOf(32, 32));
    const decoded = await decode(normalized.png);

    expect(decoded.width).toBe(APP_ICON_SIZE);
    // 32x32 content centered: 16..47 on both axes, transparent everywhere else.
    expect(decoded.pixel(16, 16)).toEqual([255, 0, 0, 255]);
    expect(decoded.pixel(47, 47)).toEqual([255, 0, 0, 255]);
    expect(decoded.pixel(15, 15)[3]).toBe(0);
    expect(decoded.pixel(48, 48)[3]).toBe(0);
  });

  it('rejects icons that are too large, not a PNG, unreadable, or oversized', async (): Promise<void> => {
    await expectIconError(pngOf(65, 64), 'too-large-dimensions');
    await expectIconError(pngOf(64, 65), 'too-large-dimensions');
    await expectIconError(pngOf(512, 512), 'too-large-dimensions');

    await expectIconError(Buffer.from('definitely not a png file'), 'not-png');
    await expectIconError(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), 'not-png');

    await expectIconError(pngOf(APP_ICON_SIZE, APP_ICON_SIZE).subarray(0, 40), 'invalid-image');

    await expectIconError(Buffer.alloc(0), 'too-large-bytes');
    await expectIconError(Buffer.alloc(APP_ICON_MAX_BYTES + 1), 'too-large-bytes');
  });
});

const player: AuthenticatedMinecraftPlayer = {
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  username: 'VerifiedPlayer',
};
const verifiedAt = new Date('2026-09-06T12:00:00.000Z');

class SingleWinnerStore {
  public completed = 0;
  public method: string | undefined;
  public released = 0;
  private claimed = false;

  public claim(code: string): Promise<VerificationClaim | null> {
    if (this.claimed) {
      return Promise.resolve(null);
    }
    this.claimed = true;

    return Promise.resolve({
      claimId: 'claim-id',
      code,
      codeKey: 'code-key',
      interactionKey: 'interaction-key',
      keyId: 'a'.repeat(64),
    });
  }

  public claimInteraction(): Promise<VerificationClaim | null> {
    return this.claim('ABCDEFGH');
  }

  public complete(
    _claim: VerificationClaim,
    _player: AuthenticatedMinecraftPlayer,
    _verifiedAt: Date,
    method?: string,
  ): Promise<boolean> {
    this.completed += 1;
    this.method = method;
    return Promise.resolve(true);
  }

  public release(): Promise<boolean> {
    this.released += 1;
    return Promise.resolve(true);
  }
}

class RecordingUsers implements VerifiedUserRepository {
  public readonly writes: {
    player: AuthenticatedMinecraftPlayer;
    verifiedAt: Date;
  }[] = [];

  public upsertVerifiedUser(
    authenticatedPlayer: AuthenticatedMinecraftPlayer,
    verificationTime: Date,
  ): Promise<void> {
    this.writes.push({ player: authenticatedPlayer, verifiedAt: verificationTime });
    return Promise.resolve();
  }
}

class FailingUsers implements VerifiedUserRepository {
  public upsertVerifiedUser(): Promise<void> {
    return Promise.reject(new Error('database unavailable'));
  }
}

class RecordingProfiles implements MinecraftPlayerLookup {
  public readonly lookups: string[] = [];

  public findProfileById(uuid: string): Promise<{ username: string; uuid: string }> {
    this.lookups.push(uuid);
    return Promise.resolve({ username: 'VerifiedPlayer', uuid });
  }

  public findProfileByName(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

describe('VerificationResolver', (): void => {
  it('allows only one concurrent resolver to persist and complete a code', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const users = new RecordingUsers();
    const resolver = new VerificationResolver(store, users);

    const results = await Promise.all([
      resolver.resolve('ABCDEFGH', player, verifiedAt),
      resolver.resolve('ABCDEFGH', player, verifiedAt),
    ]);

    expect(results.toSorted()).toEqual(['resolved', 'unavailable']);
    expect(users.writes).toEqual([{ player, verifiedAt }]);
    expect(store.completed).toBe(1);
    expect(store.released).toBe(0);
  });

  it('releases a claim when the user upsert fails', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const resolver = new VerificationResolver(store, new FailingUsers());

    await expect(resolver.resolve('ABCDEFGH', player, verifiedAt)).rejects.toBeInstanceOf(
      VerificationResolutionError,
    );
    expect(store.completed).toBe(0);
    expect(store.released).toBe(1);
  });

  it('warms the Minecraft profile cache after a successful resolve', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const profiles = new RecordingProfiles();
    const resolver = new VerificationResolver(store, new RecordingUsers(), profiles);

    await expect(resolver.resolve('ABCDEFGH', player, verifiedAt)).resolves.toBe('resolved');
    expect(profiles.lookups).toEqual([player.uuid]);
  });

  it('resolves Microsoft identity through the same atomic interaction claim', async (): Promise<void> => {
    const store = new SingleWinnerStore();
    const users = new RecordingUsers();
    const resolver = new VerificationResolver(store, users);

    await expect(
      resolver.resolveInteraction(
        'interaction-id',
        { ...player, verifiedVia: 'microsoft-oauth' },
        verifiedAt,
      ),
    ).resolves.toBe('resolved');
    expect(users.writes).toEqual([{ player, verifiedAt }]);
    expect(store.method).toBe('microsoft_oauth');
  });
});
