import { describe, expect, it } from 'vitest';

import {
  createSkinMarkerChallenge,
  skinMatchesMarker,
} from '../../src/verification/skin-marker.js';
import { createSkinPng, decodePng, readFixturePixel } from './support/skin-fixture.js';

describe('skin verification marker', (): void => {
  it.each([32, 64] as const)(
    'marks and verifies a 64x%s Java skin without changing mapped pixels',
    async (height): Promise<void> => {
      const original = await createSkinPng(
        [
          {
            color: { blue: 73, green: 51, red: 29 },
            height,
            width: 64,
            x: 0,
            y: 0,
          },
          {
            color: { alpha: 91, blue: 220, green: 130, red: 40 },
            height: 8,
            width: 8,
            x: 40,
            y: 8,
          },
        ],
        height,
      );

      const challenge = await createSkinMarkerChallenge(original, Buffer.alloc(24, 0xa5));

      expect(challenge.height).toBe(height);
      await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
      const before = await decodePng(original);
      const after = await decodePng(challenge.body);
      expect(readFixturePixel(after, 8, 0)).toEqual(readFixturePixel(before, 8, 0));
      expect(readFixturePixel(after, 40, 8)).toEqual(readFixturePixel(before, 40, 8));
      expect(readFixturePixel(after, 63, height - 1)).toEqual(
        readFixturePixel(before, 63, height - 1),
      );
    },
  );

  it('does not accept another marker or malformed expected hashes', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const first = await createSkinMarkerChallenge(skin, Buffer.alloc(24, 0x11));
    const second = await createSkinMarkerChallenge(skin, Buffer.alloc(24, 0x22));

    await expect(skinMatchesMarker(second.body, first.markerHash)).resolves.toBe(false);
    await expect(skinMatchesMarker(first.body, 'not-a-hash')).resolves.toBe(false);
  });

  it('rejects Minecraft-branded PNG dimensions outside Java skin formats', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const invalid = Buffer.from(skin);
    invalid.writeUInt32BE(128, 16);
    invalid.writeUInt32BE(128, 20);

    await expect(createSkinMarkerChallenge(invalid)).rejects.toThrow('format is unsupported');
  });
});
