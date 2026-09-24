import { createHash } from 'node:crypto';

import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

/**
 * Applications use the same icon format as a Minecraft server icon: a square
 * PNG that developers already have on hand, so the consent screen keeps the
 * game's pixel look instead of a resampled logo.
 */
export const APP_ICON_SIZE = 64;
/** A 64x64 PNG is a few kilobytes; anything larger is not a server icon. */
export const APP_ICON_MAX_BYTES = 16 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_HEADER_BYTES = 24;
const IHDR_TYPE_OFFSET = 12;
const IHDR_WIDTH_OFFSET = 16;
const IHDR_HEIGHT_OFFSET = 20;

export type AppIconErrorCode =
  'invalid-image' | 'not-png' | 'too-large-bytes' | 'too-large-dimensions';

/** Carries a stable code so callers can map the failure to a localized message. */
export class AppIconError extends Error {
  public override readonly name = 'AppIconError';

  public constructor(
    public readonly code: AppIconErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface NormalizedAppIcon {
  readonly hash: string;
  readonly png: Buffer;
}

interface IconDimensions {
  readonly height: number;
  readonly width: number;
}

export async function normalizeAppIcon(input: Uint8Array): Promise<NormalizedAppIcon> {
  const dimensions = readPngDimensions(input);
  const image = await decodePng(input);
  const canvas = createCanvas(APP_ICON_SIZE, APP_ICON_SIZE);
  const context = canvas.getContext('2d');
  // Pixel art must never be resampled: a smaller icon is centered at its native
  // size on a transparent canvas, and larger icons were rejected above.
  context.imageSmoothingEnabled = false;
  context.drawImage(
    image,
    Math.floor((APP_ICON_SIZE - dimensions.width) / 2),
    Math.floor((APP_ICON_SIZE - dimensions.height) / 2),
  );

  const png = canvas.toBuffer('image/png');
  return { hash: createHash('sha256').update(png).digest('hex'), png };
}

function readPngDimensions(input: Uint8Array): IconDimensions {
  if (input.byteLength === 0 || input.byteLength > APP_ICON_MAX_BYTES) {
    throw new AppIconError(
      'too-large-bytes',
      `The icon must be at most ${APP_ICON_MAX_BYTES.toString()} bytes`,
    );
  }
  if (input.byteLength < IHDR_HEADER_BYTES) {
    throw new AppIconError('not-png', 'The icon must be a PNG image');
  }

  const bytes = Buffer.from(input);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new AppIconError('not-png', 'The icon must be a PNG image');
  }
  if (bytes.toString('latin1', IHDR_TYPE_OFFSET, IHDR_WIDTH_OFFSET) !== 'IHDR') {
    throw new AppIconError('not-png', 'The icon must be a PNG image');
  }

  const width = bytes.readUInt32BE(IHDR_WIDTH_OFFSET);
  const height = bytes.readUInt32BE(IHDR_HEIGHT_OFFSET);
  if (width === 0 || height === 0) {
    throw new AppIconError('invalid-image', 'The icon has no pixels');
  }
  // Reject oversized dimensions before decoding: a tiny file can describe a
  // huge bitmap, and decoding it would allocate that bitmap in memory.
  if (width > APP_ICON_SIZE || height > APP_ICON_SIZE) {
    throw new AppIconError(
      'too-large-dimensions',
      `The icon must be at most ${APP_ICON_SIZE.toString()}x${APP_ICON_SIZE.toString()} pixels`,
    );
  }

  return { height, width };
}

async function decodePng(input: Uint8Array): Promise<Image> {
  try {
    return await loadImage(Buffer.from(input));
  } catch {
    throw new AppIconError('invalid-image', 'The icon is not a readable PNG image');
  }
}
