import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';

interface PngEntry {
  readonly buffer: Buffer;
  readonly height: number;
  readonly width: number;
}

function createIco(pngEntries: readonly PngEntry[]): Buffer {
  const count = pngEntries.length;
  const headerSize = 6 + 16 * count;
  let currentOffset = headerSize;
  const dirEntries: Buffer[] = [];

  for (const item of pngEntries) {
    const entry = Buffer.alloc(16);
    entry[0] = item.width >= 256 ? 0 : item.width;
    entry[1] = item.height >= 256 ? 0 : item.height;
    entry[2] = 0; // Palette size (0 = none)
    entry[3] = 0; // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // Image size in bytes
    entry.writeUInt32LE(currentOffset, 12); // Data offset
    dirEntries.push(entry);
    currentOffset += item.buffer.length;
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Icon resource type (1 = icon)
  header.writeUInt16LE(count, 4); // Number of images

  return Buffer.concat([header, ...dirEntries, ...pngEntries.map((p) => p.buffer)]);
}

function renderSquareIcon(
  sourceImage: Image,
  size: number,
  paddingFactor: number,
  backgroundColor?: string,
): { png: Buffer; webp: Buffer } {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  if (backgroundColor !== undefined) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, size, size);
  }

  const targetW = Math.round(size * paddingFactor);
  const targetH = Math.round(targetW * (sourceImage.height / sourceImage.width));
  const x = Math.round((size - targetW) / 2);
  const y = Math.round((size - targetH) / 2);

  ctx.drawImage(sourceImage, x, y, targetW, targetH);

  return {
    png: canvas.toBuffer('image/png'),
    webp: canvas.encodeSync('webp', 95),
  };
}

interface ContentBounds {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

// The master's soft drop shadow must not extend the measured content bounds.
const CONTENT_ALPHA_THRESHOLD = 8;

function readContentBounds(image: Image): ContentBounds {
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = data[(y * image.width + x) * 4 + 3];
      if (alpha !== undefined && alpha > CONTENT_ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('The source image has no visible content');
  }

  return { height: maxY - minY + 1, width: maxX - minX + 1, x: minX, y: minY };
}

// Renders an icon whose content survives a circular crop: a centered w×h box
// fits a circle of diameter d when sqrt(w²+h²) ≤ d.
function renderCircularSafeIcon(
  sourceImage: Image,
  size: number,
  circleDiameterFactor: number,
): { png: Buffer; webp: Buffer } {
  const bounds = readContentBounds(sourceImage);
  const scale = (size * circleDiameterFactor) / Math.hypot(bounds.width, bounds.height);
  const targetWidth = Math.max(1, Math.round(bounds.width * scale));
  const targetHeight = Math.max(1, Math.round(bounds.height * scale));
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    sourceImage,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    Math.round((size - targetWidth) / 2),
    Math.round((size - targetHeight) / 2),
    targetWidth,
    targetHeight,
  );

  return {
    png: canvas.toBuffer('image/png'),
    webp: canvas.encodeSync('webp', 95),
  };
}

function renderResized(
  sourceImage: Image,
  width: number,
  height: number,
  webpQuality = 98,
): { png: Buffer; webp: Buffer } {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceImage, 0, 0, width, height);

  return {
    png: canvas.toBuffer('image/png'),
    webp: canvas.encodeSync('webp', webpQuality),
  };
}

export async function generateAssets(options?: {
  readonly outputDir?: string;
  readonly smallTitlePath?: string;
  readonly titlePath?: string;
}): Promise<void> {
  const publicDir = resolve(import.meta.dirname, '../public');
  const smallTitlePath = options?.smallTitlePath ?? resolve(publicDir, 'brand-icon-master.png');
  const titlePath = options?.titlePath ?? resolve(publicDir, 'craftlogin-title-master.png');
  const outputDir = options?.outputDir ?? publicDir;

  process.stdout.write('Loading source images...\n');
  const [smallTitleImg, titleImg] = await Promise.all([
    loadImage(smallTitlePath),
    loadImage(titlePath),
  ]);
  process.stdout.write(
    `Small title dimensions: ${smallTitleImg.width.toString()}x${smallTitleImg.height.toString()}\n`,
  );
  process.stdout.write(
    `Title dimensions: ${titleImg.width.toString()}x${titleImg.height.toString()}\n`,
  );

  const THEME_BACKGROUND = '#111611';

  const fav96 = renderSquareIcon(smallTitleImg, 96, 0.94);
  await writeFile(resolve(outputDir, 'favicon-96x96.png'), fav96.png);
  await writeFile(resolve(outputDir, 'favicon-96x96.webp'), fav96.webp);
  process.stdout.write(
    `Wrote favicon-96x96 (PNG: ${fav96.png.length.toString()}b, WebP: ${fav96.webp.length.toString()}b)\n`,
  );

  const serverIcon = renderSquareIcon(smallTitleImg, 64, 0.94);
  await writeFile(resolve(outputDir, 'server-icon.png'), serverIcon.png);
  process.stdout.write(`Wrote server-icon.png (${serverIcon.png.length.toString()}b)\n`);

  const appleTouch = renderSquareIcon(smallTitleImg, 180, 0.84, THEME_BACKGROUND);
  await writeFile(resolve(outputDir, 'apple-touch-icon.png'), appleTouch.png);
  await writeFile(resolve(outputDir, 'apple-touch-icon.webp'), appleTouch.webp);
  process.stdout.write(
    `Wrote apple-touch-icon (PNG: ${appleTouch.png.length.toString()}b, WebP: ${appleTouch.webp.length.toString()}b)\n`,
  );

  const manifest192 = renderSquareIcon(smallTitleImg, 192, 0.78, THEME_BACKGROUND);
  await writeFile(resolve(outputDir, 'web-app-manifest-192x192.png'), manifest192.png);
  await writeFile(resolve(outputDir, 'web-app-manifest-192x192.webp'), manifest192.webp);
  process.stdout.write(
    `Wrote web-app-manifest-192x192 (PNG: ${manifest192.png.length.toString()}b, WebP: ${manifest192.webp.length.toString()}b)\n`,
  );

  const manifest512 = renderSquareIcon(smallTitleImg, 512, 0.78, THEME_BACKGROUND);
  await writeFile(resolve(outputDir, 'web-app-manifest-512x512.png'), manifest512.png);
  await writeFile(resolve(outputDir, 'web-app-manifest-512x512.webp'), manifest512.webp);
  process.stdout.write(
    `Wrote web-app-manifest-512x512 (PNG: ${manifest512.png.length.toString()}b, WebP: ${manifest512.webp.length.toString()}b)\n`,
  );

  const ico16 = renderSquareIcon(smallTitleImg, 16, 0.94);
  const ico32 = renderSquareIcon(smallTitleImg, 32, 0.94);
  const ico48 = renderSquareIcon(smallTitleImg, 48, 0.94);
  const icoBuffer = createIco([
    { width: 48, height: 48, buffer: ico48.png },
    { width: 32, height: 32, buffer: ico32.png },
    { width: 16, height: 16, buffer: ico16.png },
  ]);
  await writeFile(resolve(outputDir, 'favicon.ico'), icoBuffer);
  process.stdout.write(`Wrote favicon.ico (${icoBuffer.length.toString()}b)\n`);

  const highResSquare = renderSquareIcon(smallTitleImg, 512, 0.92);
  const pngBase64 = highResSquare.png.toString('base64');
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <image width="512" height="512" href="data:image/png;base64,${pngBase64}"/>
</svg>
`;
  await writeFile(resolve(outputDir, 'favicon.svg'), faviconSvg, 'utf-8');
  process.stdout.write(`Wrote favicon.svg (${Buffer.byteLength(faviconSvg).toString()}b)\n`);

  const wordmark1x = renderResized(titleImg, 210, 32, 98);
  const wordmark2x = renderResized(titleImg, 420, 64, 98);
  await writeFile(resolve(outputDir, 'brand-wordmark.png'), wordmark1x.png);
  await writeFile(resolve(outputDir, 'brand-wordmark.webp'), wordmark1x.webp);
  await writeFile(resolve(outputDir, 'brand-wordmark-2x.png'), wordmark2x.png);
  await writeFile(resolve(outputDir, 'brand-wordmark-2x.webp'), wordmark2x.webp);
  process.stdout.write(
    `Wrote brand-wordmark 1x/2x (WebP 1x: ${wordmark1x.webp.length.toString()}b, 2x: ${wordmark2x.webp.length.toString()}b)\n`,
  );

  // The title master PNG is the committed source asset; regenerate only its
  // derived sizes and its WebP copy, otherwise every run would re-encode the
  // master and the generated assets would drift between runs.
  const titleHero1x = renderResized(titleImg, 640, 97, 98);
  const titleHero2x = renderResized(titleImg, 1280, 194, 98);
  const titleMaster = renderResized(titleImg, titleImg.width, titleImg.height, 98);
  await writeFile(resolve(outputDir, 'craftlogin-title.png'), titleHero1x.png);
  await writeFile(resolve(outputDir, 'craftlogin-title.webp'), titleHero1x.webp);
  await writeFile(resolve(outputDir, 'craftlogin-title-2x.png'), titleHero2x.png);
  await writeFile(resolve(outputDir, 'craftlogin-title-2x.webp'), titleHero2x.webp);
  await writeFile(resolve(outputDir, 'craftlogin-title-master.webp'), titleMaster.webp);
  process.stdout.write(
    `Wrote craftlogin-title hero 1x/2x/master (WebP 1x: ${titleHero1x.webp.length.toString()}b, 2x: ${titleHero2x.webp.length.toString()}b, master: ${titleMaster.webp.length.toString()}b)\n`,
  );

  const brandIcon = renderCircularSafeIcon(smallTitleImg, 512, 0.92);
  const brandIconSmall = renderCircularSafeIcon(smallTitleImg, 192, 0.92);
  await writeFile(resolve(outputDir, 'brand-icon.png'), brandIcon.png);
  await writeFile(resolve(outputDir, 'brand-icon.webp'), brandIcon.webp);
  await writeFile(resolve(outputDir, 'brand-icon-192.png'), brandIconSmall.png);
  process.stdout.write(
    `Wrote brand-icon 512/192 (PNG 512: ${brandIcon.png.length.toString()}b, 192: ${brandIconSmall.png.length.toString()}b)\n`,
  );

  process.stdout.write('Asset generation complete.\n');
}

if (process.argv[1] === import.meta.filename) {
  generateAssets().catch((error: unknown): void => {
    const kind = error instanceof Error ? error.message : typeof error;
    process.stderr.write(`Asset generation failed: ${kind}\n`);
    process.exitCode = 1;
  });
}
