import { describe, expect, it } from 'vitest';

import {
  createSkinMarkerChallenge,
  deriveMarkerColors,
  hslToRgb,
  markerPalettes,
  skinMatchesMarker,
} from '../../src/verification/skin-marker.js';
import { createSkinPng, decodePng, readFixturePixel } from './support/skin-fixture.js';

function luminance(color: readonly [number, number, number]): number {
  return (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]) / 255;
}

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

      const challenge = await createSkinMarkerChallenge(original, Buffer.alloc(32, 0xa5));

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

  it('renders the CL signature with the derived challenge colors', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    // All-zero entropy: red letters (hue 0) on a near-black red-tinted backdrop,
    // shade index 0 in every region.
    const entropy = Buffer.alloc(32, 0x00);
    const challenge = await createSkinMarkerChallenge(skin, entropy);
    const image = await decodePng(challenge.body);
    const palettes = markerPalettes(entropy);

    const toFixture = (color: readonly [number, number, number]): unknown => ({
      alpha: 255,
      blue: color[2],
      green: color[1],
      red: color[0],
    });
    const letterC = toFixture(palettes.letterC[0] ?? [0, 0, 0]);
    const letterL = toFixture(palettes.letterL[0] ?? [0, 0, 0]);
    const background = toFixture(palettes.background[0] ?? [0, 0, 0]);

    // Top and bottom rows are background padding; the initials span rows 1-6.
    expect(readFixturePixel(image, 0, 0)).toEqual(background);
    expect(readFixturePixel(image, 4, 0)).toEqual(background);
    expect(readFixturePixel(image, 0, 7)).toEqual(background);
    expect(readFixturePixel(image, 7, 7)).toEqual(background);
    // Letter C: top bar, stem, bottom bar with a hollow middle.
    expect(readFixturePixel(image, 0, 1)).toEqual(letterC);
    expect(readFixturePixel(image, 2, 1)).toEqual(letterC);
    expect(readFixturePixel(image, 0, 3)).toEqual(letterC);
    expect(readFixturePixel(image, 1, 6)).toEqual(letterC);
    expect(readFixturePixel(image, 1, 3)).toEqual(background);
    // Gap column and letter L with its hollow middle and corner foot.
    expect(readFixturePixel(image, 3, 1)).toEqual(background);
    expect(readFixturePixel(image, 4, 1)).toEqual(letterL);
    expect(readFixturePixel(image, 4, 3)).toEqual(letterL);
    expect(readFixturePixel(image, 5, 6)).toEqual(letterL);
    expect(readFixturePixel(image, 7, 6)).toEqual(letterL);
    expect(readFixturePixel(image, 5, 3)).toEqual(background);

    await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
  });

  it('derives distinct random colors per challenge', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const hashes = new Set<string>();
    for (let variant = 0; variant < 16; variant += 1) {
      const entropy = Buffer.alloc(32, 0x00);
      entropy[0] = variant * 17;
      entropy[4] = variant * 31 + 7;
      const challenge = await createSkinMarkerChallenge(skin, entropy);
      hashes.add(challenge.markerHash);
      await expect(skinMatchesMarker(challenge.body, challenge.markerHash)).resolves.toBe(true);
    }
    expect(hashes.size).toBe(16);
  });

  it('keeps the letter bands ordered and separated', (): void => {
    for (let hue = 0; hue < 256; hue += 1) {
      for (const lightness of [0, 85, 170, 255]) {
        const entropy = Buffer.alloc(32, 0x00);
        entropy[0] = hue;
        entropy[1] = lightness;
        entropy[2] = hue;
        entropy[3] = lightness;
        const colors = deriveMarkerColors(entropy);
        expect(colors.letterHue).toBeGreaterThanOrEqual(0);
        expect(colors.letterHue).toBeLessThanOrEqual(360);
        // The C band (70-90) never overlaps the L band (45-65).
        expect(colors.letterLightnessC).toBeGreaterThanOrEqual(70);
        expect(colors.letterLightnessC).toBeLessThanOrEqual(90);
        expect(colors.letterLightnessL).toBeGreaterThanOrEqual(45);
        expect(colors.letterLightnessL).toBeLessThanOrEqual(65);
        expect(colors.backgroundLightness).toBeGreaterThanOrEqual(4);
        expect(colors.backgroundLightness).toBeLessThanOrEqual(18);
      }
    }
  });

  it('keeps every random palette readable with distinct shades', (): void => {
    // Sweep hues, lightness corners, and saturations; every letter shade must
    // keep a luminance gap against every background shade.
    for (let hueHigh = 0; hueHigh < 256; hueHigh += 51) {
      for (let hueLow = 0; hueLow < 256; hueLow += 51) {
        for (const lightness of [0, 255]) {
          const entropy = Buffer.alloc(32, 0x00);
          entropy[0] = hueHigh;
          entropy[1] = hueLow;
          entropy[2] = lightness;
          entropy[3] = lightness;
          entropy[4] = hueLow;
          entropy[5] = lightness;
          entropy[6] = lightness;
          entropy[7] = lightness;
          const palettes = markerPalettes(entropy);
          for (const palette of [palettes.background, palettes.letterC, palettes.letterL]) {
            expect(palette).toHaveLength(8);
            const unique = new Set(palette.map((color): string => color.join(',')));
            expect(unique.size).toBe(8);
          }
          const backgroundLuminance = palettes.background.map(luminance);
          for (const shade of palettes.letterC) {
            for (const backdrop of backgroundLuminance) {
              expect(Math.abs(luminance(shade) - backdrop)).toBeGreaterThanOrEqual(0.2);
            }
          }
          for (const shade of palettes.letterL) {
            for (const backdrop of backgroundLuminance) {
              expect(Math.abs(luminance(shade) - backdrop)).toBeGreaterThanOrEqual(0.1);
            }
          }
        }
      }
    }
  });

  it('converts HSL to RGB along the primary axes', (): void => {
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255]);
    expect(hslToRgb(360, 100, 50)).toEqual([255, 0, 0]);
    expect(hslToRgb(0, 0, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(0, 0, 100)).toEqual([255, 255, 255]);
    expect(hslToRgb(0, 0, 50)).toEqual([128, 128, 128]);
  });

  it('does not accept another marker or malformed expected hashes', async (): Promise<void> => {
    const skin = await createSkinPng([]);
    const first = await createSkinMarkerChallenge(skin, Buffer.alloc(32, 0x11));
    const second = await createSkinMarkerChallenge(skin, Buffer.alloc(32, 0x22));

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
