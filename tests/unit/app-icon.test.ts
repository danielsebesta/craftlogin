import { createHash } from 'node:crypto';

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import {
  APP_ICON_MAX_BYTES,
  APP_ICON_SIZE,
  AppIconError,
  normalizeAppIcon,
  type AppIconErrorCode,
} from '../../src/developers/app-icon.js';

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

  it('rejects icons larger than 64x64 without decoding them', async (): Promise<void> => {
    await expectIconError(pngOf(65, 64), 'too-large-dimensions');
    await expectIconError(pngOf(64, 65), 'too-large-dimensions');
    await expectIconError(pngOf(512, 512), 'too-large-dimensions');
  });

  it('rejects input that is not a PNG', async (): Promise<void> => {
    await expectIconError(Buffer.from('definitely not a png file'), 'not-png');
    await expectIconError(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]), 'not-png');
  });

  it('rejects a PNG header whose pixel data is unreadable', async (): Promise<void> => {
    const truncated = pngOf(APP_ICON_SIZE, APP_ICON_SIZE).subarray(0, 40);
    await expectIconError(truncated, 'invalid-image');
  });

  it('rejects an empty or oversized payload', async (): Promise<void> => {
    await expectIconError(Buffer.alloc(0), 'too-large-bytes');
    await expectIconError(Buffer.alloc(APP_ICON_MAX_BYTES + 1), 'too-large-bytes');
  });
});
