import { describe, expect, it } from 'vitest';

import { buildAvatarScene, CanvasAvatarRenderer } from '../../src/avatars/renderer.js';
import {
  decodeSkinTexture,
  inspectSkinPng,
  InvalidSkinImageError,
} from '../../src/avatars/skin-texture.js';
import type { AvatarSize, AvatarView, MinecraftSkinModel } from '../../src/avatars/types.js';
import {
  createSkinPng,
  decodePng,
  readFixturePixel,
  type DecodedPng,
  type FixtureColor,
  type FixtureRegion,
} from './support/skin-fixture.js';

const BASE_REGIONS: readonly FixtureRegion[] = [
  { color: { blue: 20, green: 20, red: 220 }, height: 8, width: 8, x: 8, y: 8 },
  { color: { blue: 20, green: 220, red: 20 }, height: 8, width: 8, x: 16, y: 8 },
  { color: { blue: 220, green: 20, red: 20 }, height: 8, width: 8, x: 8, y: 0 },
];
const OUTER_REGIONS: readonly FixtureRegion[] = [
  { color: { blue: 10, green: 230, red: 230 }, height: 8, width: 8, x: 40, y: 8 },
  { color: { blue: 230, green: 20, red: 230 }, height: 8, width: 8, x: 48, y: 8 },
  { color: { blue: 230, green: 230, red: 20 }, height: 8, width: 8, x: 40, y: 0 },
  { color: { alpha: 0, blue: 0, green: 0, red: 0 }, height: 2, width: 2, x: 43, y: 11 },
];

describe('Minecraft avatar texture boundary', (): void => {
  it('accepts only supported 64-pixel-wide RGB/RGBA skin PNGs', async (): Promise<void> => {
    const modern = await createSkinPng(BASE_REGIONS);
    const legacy = await createSkinPng(BASE_REGIONS, 32);

    expect(inspectSkinPng(modern)).toEqual({ height: 64, legacy: false, width: 64 });
    expect(inspectSkinPng(legacy)).toEqual({ height: 32, legacy: true, width: 64 });
    expect((): void => {
      inspectSkinPng(Buffer.from('not png'));
    }).toThrow(InvalidSkinImageError);
    expect((): void => {
      inspectSkinPng(modern.subarray(0, 32));
    }).toThrow(InvalidSkinImageError);
    expect((): void => {
      inspectSkinPng(Buffer.concat([modern, Buffer.alloc(256 * 1_024)]));
    }).toThrow(InvalidSkinImageError);

    const wrongWidth = Buffer.from(modern);
    wrongWidth.writeUInt32BE(32, 16);
    expect((): void => {
      inspectSkinPng(wrongWidth);
    }).toThrow(InvalidSkinImageError);
  });

  it('normalizes legacy left limbs by mirroring their right-side regions', async (): Promise<void> => {
    const legacy = await createSkinPng(
      [
        { color: { blue: 30, green: 20, red: 10 }, height: 1, width: 1, x: 4, y: 16 },
        { color: { blue: 60, green: 50, red: 40 }, height: 1, width: 1, x: 0, y: 20 },
        { color: { blue: 90, green: 80, red: 70 }, height: 1, width: 1, x: 44, y: 20 },
      ],
      32,
    );
    const texture = await decodeSkinTexture(legacy);

    expect(texture.legacy).toBe(true);
    expect(texturePixel(texture.pixels, 23, 48)).toEqual({
      alpha: 255,
      blue: 30,
      green: 20,
      red: 10,
    });
    expect(texturePixel(texture.pixels, 27, 52)).toEqual({
      alpha: 255,
      blue: 60,
      green: 50,
      red: 40,
    });
    expect(texturePixel(texture.pixels, 39, 52)).toEqual({
      alpha: 255,
      blue: 90,
      green: 80,
      red: 70,
    });
    expect(texturePixel(texture.pixels, 20, 48).alpha).toBe(0);
  });

  it('clears compatibility overlays when a skin was saved fully opaque', async (): Promise<void> => {
    const texture = await decodeSkinTexture(
      await createSkinPng([
        {
          color: { blue: 30, green: 20, red: 10 },
          height: 64,
          width: 64,
          x: 0,
          y: 0,
        },
      ]),
    );

    expect(texturePixel(texture.pixels, 40, 8).alpha).toBe(0);
    expect(texturePixel(texture.pixels, 20, 36).alpha).toBe(0);
    expect(texturePixel(texture.pixels, 52, 52).alpha).toBe(0);
    expect(texturePixel(texture.pixels, 20, 52).alpha).toBe(255);
  });
});

describe('Minecraft avatar geometry', (): void => {
  it('builds independently inflated vanilla base and outer cuboids', (): void => {
    const scene = buildAvatarScene('body', 'classic', 'all', false);

    expect(findCuboid(scene, 'head', 'base').size).toEqual({ depth: 8, height: 8, width: 8 });
    expect(findCuboid(scene, 'head', 'outer').size).toEqual({ depth: 9, height: 9, width: 9 });
    expect(findCuboid(scene, 'torso', 'outer').size).toEqual({
      depth: 4.5,
      height: 12.5,
      width: 8.5,
    });
    expect(findCuboid(scene, 'rightArm', 'outer').size).toEqual({
      depth: 4.5,
      height: 12.5,
      width: 4.5,
    });
    expect(
      findCuboid(buildAvatarScene('body', 'slim', 'all', false), 'rightArm', 'outer').size,
    ).toEqual({ depth: 4.5, height: 12.5, width: 3.5 });
  });

  it('keeps only the head outer layer on a legacy skin', (): void => {
    const outerParts = buildAvatarScene('body', 'classic', 'all', true)
      .filter((cuboid): boolean => cuboid.layer === 'outer')
      .map((cuboid): string => cuboid.part);

    expect(outerParts).toEqual(['head']);
  });

  it('renders visible isometric outer faces separately from the base head', async (): Promise<void> => {
    const texture = await decodeSkinTexture(
      await createSkinPng([...BASE_REGIONS, ...OUTER_REGIONS]),
    );
    const renderer = new CanvasAvatarRenderer();
    const base = await decodePng(
      await renderer.render(texture, 'classic', { layers: 'base', size: 128, view: 'head' }),
    );
    const layered = await decodePng(
      await renderer.render(texture, 'classic', { layers: 'all', size: 128, view: 'head' }),
    );

    expect(countPixels(layered, isOuterColor)).toBeGreaterThan(0);
    expect(countPixels(base, isOuterColor)).toBe(0);
    expect(countPixels(base, (pixel): boolean => pixel.alpha !== 0 && pixel.alpha !== 255)).toBe(0);
    expect(
      countPixels(base, (pixel): boolean => pixel.alpha === 255 && !isBaseFaceColor(pixel)),
    ).toBe(0);
    expect(
      countPixels(
        layered,
        (pixel): boolean => pixel.red > 150 && pixel.green < 50 && pixel.blue < 50,
      ),
    ).toBeGreaterThan(0);

    const baseBounds = opaqueBounds(base);
    expect(
      countPixelsAt(
        layered,
        (pixel, x, y): boolean =>
          isOuterColor(pixel) &&
          (x < baseBounds.minX ||
            x > baseBounds.maxX ||
            y < baseBounds.minY ||
            y > baseBounds.maxY),
      ),
    ).toBeGreaterThan(0);
  });

  it('renders a crisp front face with the Minecraft head overlay and no interpolation', async (): Promise<void> => {
    const texture = await decodeSkinTexture(
      await createSkinPng([
        { color: { blue: 20, green: 20, red: 220 }, height: 8, width: 8, x: 8, y: 8 },
        { color: { blue: 10, green: 230, red: 230 }, height: 8, width: 8, x: 40, y: 8 },
        { color: { alpha: 0, blue: 0, green: 0, red: 0 }, height: 2, width: 2, x: 43, y: 11 },
      ]),
    );
    const image = await decodePng(
      await new CanvasAvatarRenderer().render(texture, 'classic', {
        layers: 'all',
        size: 32,
        view: 'face',
      }),
    );

    expect(readFixturePixel(image, 0, 0)).toEqual({
      alpha: 255,
      blue: 10,
      green: 230,
      red: 230,
    });
    expect(readFixturePixel(image, 14, 14)).toEqual({
      alpha: 255,
      blue: 20,
      green: 20,
      red: 220,
    });
    expect(readFixturePixel(image, 14, 14)).toEqual(readFixturePixel(image, 15, 15));
    expect(readFixturePixel(image, 15, 15)).not.toEqual(readFixturePixel(image, 20, 20));
    expect(readFixturePixel(image, 0, 0)).toEqual(readFixturePixel(image, 3, 3));
  });

  it.each<{ readonly model: MinecraftSkinModel; readonly view: AvatarView }>([
    { model: 'slim', view: 'bust' },
    { model: 'classic', view: 'body' },
  ])(
    'renders a non-empty transparent $model $view view',
    async ({ model, view }): Promise<void> => {
      const texture = await decodeSkinTexture(await createSkinPng(BASE_REGIONS));
      const image = await decodePng(
        await new CanvasAvatarRenderer().render(texture, model, {
          layers: 'base',
          size: 128,
          view,
        }),
      );

      expect(countPixels(image, (pixel): boolean => (pixel.alpha ?? 0) > 0)).toBeGreaterThan(0);
      expect(readFixturePixel(image, 0, 0).alpha).toBe(0);
    },
  );

  it.each<AvatarSize>([32, 64, 128, 256])(
    'produces a deterministic transparent square PNG at %i pixels',
    async (size): Promise<void> => {
      const texture = await decodeSkinTexture(
        await createSkinPng([...BASE_REGIONS, ...OUTER_REGIONS]),
      );
      const renderer = new CanvasAvatarRenderer();
      const first = await decodePng(
        await renderer.render(texture, 'classic', { layers: 'all', size, view: 'head' }),
      );
      const second = await decodePng(
        await renderer.render(texture, 'classic', { layers: 'all', size, view: 'head' }),
      );

      expect({ height: first.height, width: first.width }).toEqual({ height: size, width: size });
      expect(first.pixels).toEqual(second.pixels);
      expect(readFixturePixel(first, 0, 0).alpha).toBe(0);
    },
  );
});

function findCuboid(
  scene: ReturnType<typeof buildAvatarScene>,
  part: 'head' | 'rightArm' | 'torso',
  layer: 'base' | 'outer',
): (typeof scene)[number] {
  const cuboid = scene.find(
    (candidate): boolean => candidate.part === part && candidate.layer === layer,
  );
  if (cuboid === undefined) {
    throw new Error(`Missing ${part} ${layer} cuboid`);
  }
  return cuboid;
}

function texturePixel(pixels: Uint8ClampedArray, x: number, y: number): FixtureColor {
  const index = (y * 64 + x) * 4;
  const red = pixels.at(index);
  const green = pixels.at(index + 1);
  const blue = pixels.at(index + 2);
  const alpha = pixels.at(index + 3);
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    throw new RangeError('Texture pixel is unavailable');
  }
  return { alpha, blue, green, red };
}

function countPixels(
  image: DecodedPng,
  predicate: (pixel: ReturnType<typeof readFixturePixel>) => boolean,
): number {
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (predicate(readFixturePixel(image, x, y))) {
        count += 1;
      }
    }
  }
  return count;
}

function countPixelsAt(
  image: DecodedPng,
  predicate: (pixel: ReturnType<typeof readFixturePixel>, x: number, y: number) => boolean,
): number {
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (predicate(readFixturePixel(image, x, y), x, y)) {
        count += 1;
      }
    }
  }
  return count;
}

function isOuterColor(pixel: ReturnType<typeof readFixturePixel>): boolean {
  return (
    (pixel.red > 180 && pixel.green > 180 && pixel.blue < 30) ||
    (pixel.red > 130 && pixel.green < 30 && pixel.blue > 130) ||
    (pixel.red < 30 && pixel.green > 180 && pixel.blue > 180)
  );
}

function isBaseFaceColor(pixel: ReturnType<typeof readFixturePixel>): boolean {
  return (
    (pixel.red === 198 && pixel.green === 18 && pixel.blue === 18) ||
    (pixel.red === 14 && pixel.green === 158 && pixel.blue === 14) ||
    (pixel.red === 20 && pixel.green === 20 && pixel.blue === 220)
  );
}

interface PixelBounds {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
}

function opaqueBounds(image: DecodedPng): PixelBounds {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  countPixelsAt(image, (pixel, x, y): boolean => {
    if ((pixel.alpha ?? 0) > 0) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return false;
  });
  if (maxX < 0 || maxY < 0) {
    throw new Error('Expected an opaque pixel');
  }
  return { maxX, maxY, minX, minY };
}
