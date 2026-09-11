import { createCanvas, loadImage } from '@napi-rs/canvas';

export interface FixtureColor {
  readonly alpha?: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

export interface FixtureRegion {
  readonly color: FixtureColor;
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface DecodedPng {
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
}

export async function createSkinPng(
  regions: readonly FixtureRegion[],
  height: 32 | 64 = 64,
): Promise<Buffer> {
  const canvas = createCanvas(64, height);
  const context = canvas.getContext('2d');
  const image = context.createImageData(64, height);
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        const index = (y * 64 + x) * 4;
        image.data.set(
          [region.color.red, region.color.green, region.color.blue, region.color.alpha ?? 255],
          index,
        );
      }
    }
  }
  context.putImageData(image, 0, 0);
  return await canvas.encode('png');
}

export async function decodePng(body: Buffer): Promise<DecodedPng> {
  const image = await loadImage(body);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  return { height: image.height, pixels, width: image.width };
}

export function readFixturePixel(image: DecodedPng, x: number, y: number): FixtureColor {
  const index = (y * image.width + x) * 4;
  const red = image.pixels.at(index);
  const green = image.pixels.at(index + 1);
  const blue = image.pixels.at(index + 2);
  const alpha = image.pixels.at(index + 3);
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    throw new RangeError('Fixture pixel is outside the decoded PNG');
  }
  return { alpha, blue, green, red };
}
