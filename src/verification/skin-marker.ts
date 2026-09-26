import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

import { inspectSkinPng } from '../avatars/skin-texture.js';

const MARKER_SIZE = 8;
const MARKER_SYMBOLS = MARKER_SIZE * MARKER_SIZE;
// 8 color bytes (jitter around the skin-derived base tone, or fully random
// hues when no base tone can be sampled) + 24 shade bytes (192 bits).
const MARKER_ENTROPY_BYTES = 32;
const MARKER_SHADE_OFFSET = 8;

// The fixed glyph stays recognizable while skin-tinted palettes and 192 raw
// shade bits prevent reuse of a previously marked skin.
const MARKER_BACKGROUND = 0;
const MARKER_LETTER_C = 1;
const MARKER_LETTER_L = 2;
const MARKER_GLYPH: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 0, 2, 0, 0, 0],
  [1, 0, 0, 0, 2, 0, 0, 0],
  [1, 0, 0, 0, 2, 0, 0, 0],
  [1, 0, 0, 0, 2, 0, 0, 0],
  [1, 0, 0, 0, 2, 0, 0, 0],
  [1, 1, 1, 0, 2, 2, 2, 2],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

type Rgb = readonly [number, number, number];

export interface SkinMarkerBase {
  readonly hue: number;
  readonly lightness: number;
  readonly saturation: number;
}

export interface SkinMarkerColors {
  readonly backgroundHue: number;
  readonly backgroundLightness: number;
  readonly backgroundSaturation: number;
  readonly letterHue: number;
  readonly letterLightnessC: number;
  readonly letterLightnessL: number;
  readonly letterSaturation: number;
}

export function deriveMarkerColors(entropy: Buffer, base?: SkinMarkerBase): SkinMarkerColors {
  if (base === undefined) {
    return {
      backgroundHue: (readUint16(entropy, 4) / 65535) * 360,
      backgroundLightness: 4 + ((entropy[6] ?? 0) % 15),
      backgroundSaturation: 8 + ((entropy[7] ?? 0) % 13),
      letterHue: (readUint16(entropy, 0) / 65535) * 360,
      letterLightnessC: 70 + ((entropy[2] ?? 0) % 21),
      letterLightnessL: 45 + ((entropy[3] ?? 0) % 21),
      letterSaturation: 70 + ((entropy[5] ?? 0) % 31),
    };
  }
  // A skin-tinted marker blends in when it is accidentally left on the skin:
  // same hue family, slightly darkened backdrop, letters embossed toward the
  // opposite lightness pole so the CL stays faintly readable.
  const hue = base.hue + signedBand(entropy[0], 6);
  const direction = base.lightness >= 50 ? -1 : 1;
  const backgroundLightness = clampPercent(base.lightness - 9 - ((entropy[6] ?? 0) % 5), 6, 90);
  return {
    backgroundHue: hue,
    backgroundLightness,
    backgroundSaturation: clampPercent(base.saturation + signedBand(entropy[7], 5), 8, 70),
    letterHue: hue,
    letterLightnessC: clampPercent(
      backgroundLightness + direction * (26 + ((entropy[2] ?? 0) % 7)),
      8,
      95,
    ),
    letterLightnessL: clampPercent(
      backgroundLightness + direction * (15 + ((entropy[3] ?? 0) % 7)),
      6,
      93,
    ),
    letterSaturation: clampPercent(base.saturation + 10 + signedBand(entropy[5], 5), 12, 80),
  };
}

function signedBand(byte: number | undefined, span: number): number {
  return ((byte ?? 0) % (2 * span + 1)) - span;
}

function clampPercent(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function readUint16(entropy: Buffer, offset: number): number {
  return ((entropy[offset] ?? 0) << 8) | (entropy[offset + 1] ?? 0);
}

export function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = (((hue % 360) + 360) % 360) / 60;
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] =
    h < 1
      ? [chroma, x, 0]
      : h < 2
        ? [x, chroma, 0]
        : h < 3
          ? [0, chroma, x]
          : h < 4
            ? [0, x, chroma]
            : h < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const shift = l - chroma / 2;
  return [
    Math.round((r + shift) * 255),
    Math.round((g + shift) * 255),
    Math.round((b + shift) * 255),
  ];
}

const BACKGROUND_SHADE_DELTAS: readonly number[] = [0, 3, -2, 5, -4, 1, -1, 2];
const LETTER_SHADE_DELTAS: readonly number[] = [0, 6, -6, 10, -10, 3, -3, 8];

export interface SkinMarkerPalettes {
  readonly background: readonly Rgb[];
  readonly letterC: readonly Rgb[];
  readonly letterL: readonly Rgb[];
}

export function markerPalettes(entropy: Buffer, base?: SkinMarkerBase): SkinMarkerPalettes {
  const colors = deriveMarkerColors(entropy, base);
  return {
    background: expandShades(
      colors.backgroundHue,
      colors.backgroundSaturation,
      colors.backgroundLightness,
      BACKGROUND_SHADE_DELTAS,
    ),
    letterC: expandShades(
      colors.letterHue,
      colors.letterSaturation,
      colors.letterLightnessC,
      LETTER_SHADE_DELTAS,
    ),
    letterL: expandShades(
      colors.letterHue,
      colors.letterSaturation,
      colors.letterLightnessL,
      LETTER_SHADE_DELTAS,
    ),
  };
}

function expandShades(
  hue: number,
  saturation: number,
  lightness: number,
  deltas: readonly number[],
): readonly Rgb[] {
  return deltas.map((delta): Rgb => hslToRgb(hue, saturation, lightness + delta));
}

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
    throw new TypeError('Skin verification marker entropy must be exactly 32 bytes');
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
  const palettes = markerPalettes(
    entropy,
    sampleMarkerBaseColor(pixels.data, header.width, header.height),
  );
  for (let symbol = 0; symbol < MARKER_SYMBOLS; symbol += 1) {
    const paletteIndex = readThreeBits(entropy, MARKER_SHADE_OFFSET * 8 + symbol * 3);
    const region = MARKER_GLYPH[Math.floor(symbol / MARKER_SIZE)]?.[symbol % MARKER_SIZE];
    if (region !== MARKER_BACKGROUND && region !== MARKER_LETTER_C && region !== MARKER_LETTER_L) {
      throw new TypeError('Skin verification marker palette is invalid');
    }
    const palette =
      region === MARKER_LETTER_C
        ? palettes.letterC
        : region === MARKER_LETTER_L
          ? palettes.letterL
          : palettes.background;
    const color = palette[paletteIndex];
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

// The marker covers the top-left 8x8 corner, so the base tone comes from the
// surrounding 16x16 head corner; a nearly transparent neighborhood falls back
// to the whole image, and an empty skin keeps the fully random palette.
export function sampleMarkerBaseColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): SkinMarkerBase | undefined {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  const sample = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let y = y0; y < Math.min(y1, height); y += 1) {
      for (let x = x0; x < Math.min(x1, width); x += 1) {
        const index = (y * width + x) * 4;
        if ((pixels[index + 3] ?? 0) < 128) continue;
        red += pixels[index] ?? 0;
        green += pixels[index + 1] ?? 0;
        blue += pixels[index + 2] ?? 0;
        count += 1;
      }
    }
  };
  sample(MARKER_SIZE, 0, 2 * MARKER_SIZE, MARKER_SIZE);
  sample(0, MARKER_SIZE, 2 * MARKER_SIZE, 2 * MARKER_SIZE);
  if (count < 16) {
    red = 0;
    green = 0;
    blue = 0;
    count = 0;
    sample(0, 0, width, height);
  }
  if (count < 16) {
    return undefined;
  }
  return rgbToHsl(red / count, green / count, blue / count);
}

function rgbToHsl(red: number, green: number, blue: number): SkinMarkerBase {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  if (delta === 0) {
    return { hue: 0, lightness: lightness * 100, saturation: 0 };
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const sector =
    maximum === r
      ? ((g - b) / delta) % 6
      : maximum === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  const hue = 60 * sector;
  return {
    hue: ((hue % 360) + 360) % 360,
    lightness: lightness * 100,
    saturation: saturation * 100,
  };
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
