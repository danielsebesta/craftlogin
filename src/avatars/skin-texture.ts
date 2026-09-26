import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_HEADER_LENGTH = 33;
const PNG_IHDR_LENGTH = 13;
const MAX_SKIN_BYTES = 256 * 1024;
const SKIN_WIDTH = 64;
// Cape/elytra textures arrive from third-party providers — cleartext OptiFine
// included — so declared IHDR dimensions are bounded before decode: a tiny PNG
// could otherwise force a multi-gigabyte canvas allocation. Real capes stay
// well under 1024x512; 2048 leaves generous headroom.
const MAX_TEXTURE_DIMENSION = 2_048;

export class InvalidSkinImageError extends Error {
  public override readonly name = 'InvalidSkinImageError';
}

export interface SkinPngHeader {
  readonly height: 32 | 64;
  readonly legacy: boolean;
  readonly width: 64;
}

export interface TexturePixels {
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
}

export interface SkinTexture extends SkinPngHeader {
  readonly height: 64;
  readonly pixels: Uint8ClampedArray;
}

export function inspectSkinPng(body: Buffer): SkinPngHeader {
  if (body.length < PNG_HEADER_LENGTH || body.length > MAX_SKIN_BYTES) {
    throw new InvalidSkinImageError('Minecraft skin PNG has an invalid size');
  }
  if (!body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new InvalidSkinImageError('Minecraft skin has an invalid PNG signature');
  }
  if (
    body.readUInt32BE(8) !== PNG_IHDR_LENGTH ||
    body.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new InvalidSkinImageError('Minecraft skin has an invalid PNG header');
  }

  const width = body.readUInt32BE(16);
  const height = body.readUInt32BE(20);
  const bitDepth = body.at(24);
  const colorType = body.at(25);
  const compression = body.at(26);
  const filter = body.at(27);
  const interlace = body.at(28);
  if (
    width !== SKIN_WIDTH ||
    (height !== 32 && height !== 64) ||
    bitDepth !== 8 ||
    // Indexed (palette) PNGs are valid skins; the decoder expands them to RGBA.
    (colorType !== 2 && colorType !== 3 && colorType !== 6) ||
    compression !== 0 ||
    filter !== 0 ||
    interlace !== 0
  ) {
    throw new InvalidSkinImageError('Minecraft skin PNG format is unsupported');
  }

  return { height, legacy: height === 32, width };
}

export function isPngImage(body: Buffer): boolean {
  return (
    body.length >= PNG_SIGNATURE.length &&
    body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  );
}

export interface TexturePngDimensions {
  readonly height: number;
  readonly width: number;
}

export function inspectTexturePng(body: Buffer): TexturePngDimensions {
  if (body.length < PNG_HEADER_LENGTH || body.length > MAX_SKIN_BYTES) {
    throw new InvalidSkinImageError('Minecraft texture PNG has an invalid size');
  }
  if (
    !isPngImage(body) ||
    body.readUInt32BE(8) !== PNG_IHDR_LENGTH ||
    body.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    throw new InvalidSkinImageError('Minecraft texture has an invalid PNG header');
  }
  const width = body.readUInt32BE(16);
  const height = body.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width > MAX_TEXTURE_DIMENSION ||
    height > MAX_TEXTURE_DIMENSION
  ) {
    throw new InvalidSkinImageError('Minecraft texture PNG dimensions exceed the safety limit');
  }
  return { height, width };
}

export function isBoundedTexturePng(body: Buffer): boolean {
  try {
    inspectTexturePng(body);
    return true;
  } catch {
    return false;
  }
}

// Decodes a non-skin texture (cape, elytra) into raw RGBA — unlike
// decodeSkinTexture, no layout validation or normalization applies.
export async function decodeTexturePixels(body: Buffer): Promise<TexturePixels> {
  const header = inspectTexturePng(body);
  let image: Image;
  try {
    image = await loadImage(body);
  } catch (error: unknown) {
    throw new InvalidSkinImageError('Minecraft texture PNG could not be decoded', {
      cause: error,
    });
  }
  if (image.width !== header.width || image.height !== header.height) {
    throw new InvalidSkinImageError('Minecraft texture PNG dimensions changed during decode');
  }
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    height: image.height,
    pixels: context.getImageData(0, 0, image.width, image.height).data,
    width: image.width,
  };
}

export async function decodeSkinTexture(body: Buffer): Promise<SkinTexture> {
  const header = inspectSkinPng(body);
  let image: Image;
  try {
    image = await loadImage(body);
  } catch (error: unknown) {
    throw new InvalidSkinImageError('Minecraft skin PNG could not be decoded', { cause: error });
  }
  if (image.width !== header.width || image.height !== header.height) {
    throw new InvalidSkinImageError('Minecraft skin PNG dimensions changed during decode');
  }

  const canvas = createCanvas(header.width, header.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const decoded = context.getImageData(0, 0, header.width, header.height).data;
  const pixels = header.legacy ? normalizeLegacySkin(decoded) : new Uint8ClampedArray(decoded);
  if (isFullyOpaque(decoded)) {
    clearOpaqueCompatibilityLayers(pixels, header.legacy);
  }

  return { height: 64, legacy: header.legacy, pixels, width: 64 };
}

function isFullyOpaque(pixels: Uint8ClampedArray): boolean {
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] !== 255) {
      return false;
    }
  }
  return true;
}

function clearOpaqueCompatibilityLayers(pixels: Uint8ClampedArray, legacy: boolean): void {
  const regions: readonly AlphaRegion[] = [
    { height: 16, width: 32, x: 32, y: 0 },
    ...(legacy
      ? []
      : [
          { height: 16, width: 64, x: 0, y: 32 },
          { height: 16, width: 16, x: 0, y: 48 },
          { height: 16, width: 16, x: 48, y: 48 },
        ]),
  ];
  for (const region of regions) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        pixels[(y * SKIN_WIDTH + x) * 4 + 3] = 0;
      }
    }
  }
}

// Base-layer UV faces in the modern 64x64 layout. Only pixels inside these
// rects become opaque; atlas padding keeps its alpha so holes stay transparent.
const SKIN_BASE_REGIONS: readonly AlphaRegion[] = [
  { height: 8, width: 16, x: 8, y: 0 },
  { height: 8, width: 32, x: 0, y: 8 },
  { height: 4, width: 16, x: 20, y: 16 },
  { height: 12, width: 24, x: 16, y: 20 },
  { height: 4, width: 8, x: 44, y: 16 },
  { height: 12, width: 16, x: 40, y: 20 },
  { height: 4, width: 8, x: 4, y: 16 },
  { height: 12, width: 16, x: 0, y: 20 },
  { height: 4, width: 8, x: 36, y: 48 },
  { height: 12, width: 16, x: 32, y: 52 },
  { height: 4, width: 8, x: 20, y: 48 },
  { height: 12, width: 16, x: 16, y: 52 },
];

// Re-encodes a texture the way the vanilla client treats it: modern layout,
// opaque base faces, overlay translucency preserved.
export async function encodeProcessedSkin(texture: SkinTexture): Promise<Buffer> {
  const pixels = new Uint8ClampedArray(texture.pixels);
  for (const region of SKIN_BASE_REGIONS) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      for (let x = region.x; x < region.x + region.width; x += 1) {
        pixels[(y * SKIN_WIDTH + x) * 4 + 3] = 255;
      }
    }
  }
  const canvas = createCanvas(SKIN_WIDTH, SKIN_WIDTH);
  const context = canvas.getContext('2d');
  const output = context.createImageData(SKIN_WIDTH, SKIN_WIDTH);
  output.data.set(pixels);
  context.putImageData(output, 0, 0);
  return Buffer.from(await canvas.encode('png'));
}

interface AlphaRegion {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

function normalizeLegacySkin(source: Uint8ClampedArray): Uint8ClampedArray {
  const target = new Uint8ClampedArray(SKIN_WIDTH * SKIN_WIDTH * 4);
  target.set(source);

  // The 1.8 conversion mirrors each face into the left-limb layout and swaps
  // inner/outer sides; mirroring the whole 16x16 block would flip pixels.
  const mirroredFaces: readonly MirrorRegion[] = [
    { height: 4, sourceX: 4, sourceY: 16, targetX: 20, targetY: 48, width: 4 },
    { height: 4, sourceX: 8, sourceY: 16, targetX: 24, targetY: 48, width: 4 },
    { height: 12, sourceX: 0, sourceY: 20, targetX: 24, targetY: 52, width: 4 },
    { height: 12, sourceX: 4, sourceY: 20, targetX: 20, targetY: 52, width: 4 },
    { height: 12, sourceX: 8, sourceY: 20, targetX: 16, targetY: 52, width: 4 },
    { height: 12, sourceX: 12, sourceY: 20, targetX: 28, targetY: 52, width: 4 },
    { height: 4, sourceX: 44, sourceY: 16, targetX: 36, targetY: 48, width: 4 },
    { height: 4, sourceX: 48, sourceY: 16, targetX: 40, targetY: 48, width: 4 },
    { height: 12, sourceX: 40, sourceY: 20, targetX: 40, targetY: 52, width: 4 },
    { height: 12, sourceX: 44, sourceY: 20, targetX: 36, targetY: 52, width: 4 },
    { height: 12, sourceX: 48, sourceY: 20, targetX: 32, targetY: 52, width: 4 },
    { height: 12, sourceX: 52, sourceY: 20, targetX: 44, targetY: 52, width: 4 },
  ];
  for (const face of mirroredFaces) {
    copyAndMirrorRegion(source, target, face);
  }
  return target;
}

interface MirrorRegion {
  readonly height: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly width: number;
}

function copyAndMirrorRegion(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  region: MirrorRegion,
): void {
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const sourcePixel =
        ((region.sourceY + y) * SKIN_WIDTH + region.sourceX + region.width - 1 - x) * 4;
      const targetPixel = ((region.targetY + y) * SKIN_WIDTH + region.targetX + x) * 4;
      target.set(source.subarray(sourcePixel, sourcePixel + 4), targetPixel);
    }
  }
}
