import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

import { inspectSkinPng } from '../avatars/skin-texture.js';

const MARKER_SIZE = 8;
const MARKER_SYMBOLS = MARKER_SIZE * MARKER_SIZE;
const MARKER_ENTROPY_BYTES = 24;
const MARKER_PALETTE: readonly (readonly [number, number, number])[] = [
  [35, 74, 62],
  [47, 107, 82],
  [65, 143, 102],
  [96, 181, 125],
  [41, 72, 110],
  [54, 101, 153],
  [76, 136, 194],
  [113, 169, 219],
];

export interface SkinMarkerChallenge {
  readonly body: Buffer;
  readonly height: 32 | 64;
  readonly markerHash: string;
}

export async function createFallbackJavaSkin(): Promise<Buffer> {
  const canvas = createCanvas(64, 64);
  const context = canvas.getContext('2d');
  context.fillStyle = '#6f8277';
  context.fillRect(0, 0, 64, 64);
  return await canvas.encode('png');
}

export async function createSkinMarkerChallenge(
  source: Buffer,
  entropy: Buffer = randomBytes(MARKER_ENTROPY_BYTES),
): Promise<SkinMarkerChallenge> {
  if (entropy.length !== MARKER_ENTROPY_BYTES) {
    throw new TypeError('Skin verification marker entropy must be exactly 24 bytes');
  }
  const header = inspectSkinPng(source);
  let image: Image;
  try {
    image = await loadImage(source);
  } catch (error: unknown) {
    throw new TypeError('Minecraft skin PNG could not be decoded', { cause: error });
  }

  const canvas = createCanvas(header.width, header.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, header.width, header.height);
  for (let symbol = 0; symbol < MARKER_SYMBOLS; symbol += 1) {
    const paletteIndex = readThreeBits(entropy, symbol * 3);
    const color = MARKER_PALETTE[paletteIndex];
    if (color === undefined) {
      throw new TypeError('Skin verification marker palette is invalid');
    }
    const pixel = (Math.floor(symbol / MARKER_SIZE) * header.width + (symbol % MARKER_SIZE)) * 4;
    pixels.data[pixel] = color[0];
    pixels.data[pixel + 1] = color[1];
    pixels.data[pixel + 2] = color[2];
    pixels.data[pixel + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const body = await canvas.encode('png');
  return { body, height: header.height, markerHash: hashMarkerPixels(pixels.data, header.width) };
}

export async function skinMatchesMarker(body: Buffer, expectedHash: string): Promise<boolean> {
  const header = inspectSkinPng(body);
  let image: Image;
  try {
    image = await loadImage(body);
  } catch {
    return false;
  }
  const canvas = createCanvas(header.width, header.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, header.width, header.height).data;
  const actual = Buffer.from(hashMarkerPixels(pixels, header.width), 'hex');
  const expected = /^[0-9a-f]{64}$/u.test(expectedHash)
    ? Buffer.from(expectedHash, 'hex')
    : Buffer.alloc(0);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readThreeBits(entropy: Buffer, bitOffset: number): number {
  let value = 0;
  for (let bit = 0; bit < 3; bit += 1) {
    const absoluteBit = bitOffset + bit;
    const byte = entropy[Math.floor(absoluteBit / 8)];
    if (byte === undefined) {
      throw new TypeError('Skin verification marker entropy is incomplete');
    }
    value = (value << 1) | ((byte >> (7 - (absoluteBit % 8))) & 1);
  }
  return value;
}

function hashMarkerPixels(pixels: Uint8ClampedArray, width: number): string {
  const marker = Buffer.alloc(MARKER_SYMBOLS * 4);
  for (let y = 0; y < MARKER_SIZE; y += 1) {
    for (let x = 0; x < MARKER_SIZE; x += 1) {
      const source = (y * width + x) * 4;
      const target = (y * MARKER_SIZE + x) * 4;
      marker[target] = pixels[source] ?? 0;
      marker[target + 1] = pixels[source + 1] ?? 0;
      marker[target + 2] = pixels[source + 2] ?? 0;
      marker[target + 3] = pixels[source + 3] ?? 0;
    }
  }
  return createHash('sha256').update(marker).digest('hex');
}
