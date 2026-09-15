import { createCanvas } from '@napi-rs/canvas';

import type { SkinTexture } from './skin-texture.js';
import type { AvatarLayers, AvatarRenderOptions, AvatarView, MinecraftSkinModel } from './types.js';

// A front-biased isometric view keeps both limbs readable while still exposing
// the top and right-hand cube faces, matching Minecraft inventory-style renders.
const CAMERA = normalize({ x: 0.65, y: 0.55, z: 1 });
const SCREEN_RIGHT = normalize({ x: CAMERA.z, y: 0, z: -CAMERA.x });
const SCREEN_UP = normalize(cross(CAMERA, SCREEN_RIGHT));
const OUTPUT_PADDING_RATIO = 0.08;

type AvatarLayer = 'base' | 'outer';
type BodyPart = 'head' | 'leftArm' | 'leftLeg' | 'rightArm' | 'rightLeg' | 'torso';
type VisibleFace = 'front' | 'right' | 'top';

interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface BoxSize {
  readonly depth: number;
  readonly height: number;
  readonly width: number;
}

interface TextureBox {
  readonly depth: number;
  readonly height: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
}

export interface AvatarCuboid {
  readonly center: Vector3;
  readonly layer: AvatarLayer;
  readonly part: BodyPart;
  readonly size: BoxSize;
  readonly texture: TextureBox;
}

export interface AvatarRenderer {
  render(
    texture: SkinTexture,
    model: MinecraftSkinModel,
    options: AvatarRenderOptions,
  ): Promise<Buffer>;
}

export class CanvasAvatarRenderer implements AvatarRenderer {
  public async render(
    texture: SkinTexture,
    model: MinecraftSkinModel,
    options: AvatarRenderOptions,
  ): Promise<Buffer> {
    if (options.view === 'face') {
      return await renderFace(texture, options.layers, options.size);
    }
    const scene = buildAvatarScene(options.view, model, options.layers, texture.legacy);
    // Use the all-layers envelope for both modes so switching layers never
    // changes the camera framing and the outer cuboid visibly extends outward.
    const framingScene = buildAvatarScene(options.view, model, 'all', texture.legacy);
    // The isometric scene rasterizes at double resolution and averages each
    // 2x2 block back down. Together with per-pixel supersampling this gives
    // truly smooth cube edges; interior texels still use nearest-neighbor
    // lookup, so only geometric coverage is ever blended.
    const hiresSize = options.size * RENDER_UPSCALE;
    const projection = createProjection(framingScene, hiresSize);
    const faces = scene.flatMap((cuboid, cuboidIndex): readonly ProjectedFace[] =>
      projectCuboid(cuboid, projection, cuboidIndex * 3),
    );

    const canvas = createCanvas(options.size, options.size);
    const context = canvas.getContext('2d');
    const hires = context.createImageData(hiresSize, hiresSize);
    rasterizeFaces(texture, faces, hires.data, hiresSize);
    const output = context.createImageData(options.size, options.size);
    downsampleBox(hires.data, hiresSize, output.data, options.size);
    context.putImageData(output, 0, 0);

    return await canvas.encode('png');
  }
}

async function renderFace(
  texture: SkinTexture,
  layers: AvatarLayers,
  outputSize: number,
): Promise<Buffer> {
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);
  const pixelSize = outputSize / 8;
  const extrusion = Math.max(1, Math.round(pixelSize / 3));

  for (let y = 0; y < outputSize; y += 1) {
    const sourceY = Math.floor((y * 8) / outputSize);
    for (let x = 0; x < outputSize; x += 1) {
      const sourceX = Math.floor((x * 8) / outputSize);
      const base = { ...readColor(texture, 8 + sourceX, 8 + sourceY), alpha: 255 };
      writeColor(output.data, (y * outputSize + x) * 4, base);
    }
  }

  if (layers === 'all') {
    for (let y = 0; y < outputSize; y += 1) {
      const sourceY = Math.floor((y * 8) / outputSize);
      for (let x = 0; x < outputSize; x += 1) {
        const sourceX = Math.floor((x * 8) / outputSize);
        const overlay = readColor(texture, 40 + sourceX, 8 + sourceY);
        if (overlay.alpha === 0) {
          continue;
        }
        const shadowX = Math.min(outputSize - 1, x + extrusion);
        const shadowY = Math.min(outputSize - 1, y + extrusion);
        writeColor(
          output.data,
          (shadowY * outputSize + shadowX) * 4,
          compositeColor(readOutputColor(output.data, (shadowY * outputSize + shadowX) * 4), {
            ...shadeColor(overlay, 'right'),
            alpha: overlay.alpha,
          }),
        );
      }
    }
  }

  for (let y = 0; y < outputSize; y += 1) {
    const sourceY = Math.floor((y * 8) / outputSize);
    for (let x = 0; x < outputSize; x += 1) {
      const sourceX = Math.floor((x * 8) / outputSize);
      const color =
        layers === 'all'
          ? compositeColor(
              readOutputColor(output.data, (y * outputSize + x) * 4),
              readColor(texture, 40 + sourceX, 8 + sourceY),
            )
          : readOutputColor(output.data, (y * outputSize + x) * 4);
      const outputIndex = (y * outputSize + x) * 4;
      writeColor(output.data, outputIndex, color);
    }
  }

  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

function compositeColor(base: Color, overlay: Color): Color {
  const overlayAlpha = overlay.alpha / 255;
  const baseAlpha = base.alpha / 255;
  const alpha = overlayAlpha + baseAlpha * (1 - overlayAlpha);
  if (alpha === 0) {
    return { alpha: 0, blue: 0, green: 0, red: 0 };
  }
  return {
    alpha: Math.round(alpha * 255),
    blue: Math.round(
      (overlay.blue * overlayAlpha + base.blue * baseAlpha * (1 - overlayAlpha)) / alpha,
    ),
    green: Math.round(
      (overlay.green * overlayAlpha + base.green * baseAlpha * (1 - overlayAlpha)) / alpha,
    ),
    red: Math.round(
      (overlay.red * overlayAlpha + base.red * baseAlpha * (1 - overlayAlpha)) / alpha,
    ),
  };
}

function readOutputColor(output: Uint8ClampedArray, index: number): Color {
  return {
    alpha: output[index + 3] ?? 0,
    blue: output[index + 2] ?? 0,
    green: output[index + 1] ?? 0,
    red: output[index] ?? 0,
  };
}

function writeColor(output: Uint8ClampedArray, index: number, color: Color): void {
  output[index] = color.red;
  output[index + 1] = color.green;
  output[index + 2] = color.blue;
  output[index + 3] = color.alpha;
}

export function buildAvatarScene(
  view: AvatarView,
  model: MinecraftSkinModel,
  layers: AvatarLayers,
  legacy: boolean,
): readonly AvatarCuboid[] {
  const armWidth = model === 'slim' ? 3 : 4;
  const armCenter = 4 + armWidth / 2;
  const parts: readonly PartDefinition[] = [
    {
      center: { x: 0, y: 28, z: 0 },
      part: 'head',
      size: { depth: 8, height: 8, width: 8 },
      texture: { depth: 8, height: 8, u: 0, v: 0, width: 8 },
      views: ['body', 'bust', 'head'],
    },
    {
      center: { x: 0, y: 18, z: 0 },
      part: 'torso',
      size: { depth: 4, height: 12, width: 8 },
      texture: { depth: 4, height: 12, u: 16, v: 16, width: 8 },
      views: ['body', 'bust'],
    },
    {
      center: { x: -armCenter, y: 18, z: 0 },
      part: 'rightArm',
      size: { depth: 4, height: 12, width: armWidth },
      texture: { depth: 4, height: 12, u: 40, v: 16, width: armWidth },
      views: ['body', 'bust'],
    },
    {
      center: { x: armCenter, y: 18, z: 0 },
      part: 'leftArm',
      size: { depth: 4, height: 12, width: armWidth },
      texture: { depth: 4, height: 12, u: 32, v: 48, width: armWidth },
      views: ['body', 'bust'],
    },
    {
      center: { x: -2, y: 6, z: 0 },
      part: 'rightLeg',
      size: { depth: 4, height: 12, width: 4 },
      texture: { depth: 4, height: 12, u: 0, v: 16, width: 4 },
      views: ['body'],
    },
    {
      center: { x: 2, y: 6, z: 0 },
      part: 'leftLeg',
      size: { depth: 4, height: 12, width: 4 },
      texture: { depth: 4, height: 12, u: 16, v: 48, width: 4 },
      views: ['body'],
    },
  ];

  const scene: AvatarCuboid[] = [];
  for (const definition of parts) {
    if (!definition.views.includes(view)) {
      continue;
    }
    scene.push({
      center: definition.center,
      layer: 'base',
      part: definition.part,
      size: definition.size,
      texture: definition.texture,
    });
    if (layers === 'all' && (!legacy || definition.part === 'head')) {
      scene.push({
        center: definition.center,
        layer: 'outer',
        part: definition.part,
        size: inflateOuterLayer(definition.part, definition.size),
        texture: outerTexture(definition),
      });
    }
  }
  return scene;
}

interface PartDefinition {
  readonly center: Vector3;
  readonly part: BodyPart;
  readonly size: BoxSize;
  readonly texture: TextureBox;
  readonly views: readonly AvatarView[];
}

function inflateOuterLayer(part: BodyPart, size: BoxSize): BoxSize {
  const increase = part === 'head' ? 1 : 0.5;
  return {
    depth: size.depth + increase,
    height: size.height + increase,
    width: size.width + increase,
  };
}

function outerTexture(definition: PartDefinition): TextureBox {
  const origin = outerTextureOrigin(definition.part);
  return { ...definition.texture, u: origin.u, v: origin.v };
}

function outerTextureOrigin(part: BodyPart): { readonly u: number; readonly v: number } {
  switch (part) {
    case 'head':
      return { u: 32, v: 0 };
    case 'torso':
      return { u: 16, v: 32 };
    case 'rightArm':
      return { u: 40, v: 32 };
    case 'leftArm':
      return { u: 48, v: 48 };
    case 'rightLeg':
      return { u: 0, v: 32 };
    case 'leftLeg':
      return { u: 0, v: 48 };
  }
}

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

interface Projection {
  project(point: Vector3): ScreenPoint;
}

function createProjection(scene: readonly AvatarCuboid[], outputSize: number): Projection {
  const projectedCorners = scene.flatMap((cuboid): readonly ScreenPoint[] =>
    cuboidCorners(cuboid).map(projectPoint),
  );
  const xValues = projectedCorners.map((point): number => point.x);
  const yValues = projectedCorners.map((point): number => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const padding = outputSize * OUTPUT_PADDING_RATIO;
  const drawableSize = outputSize - padding * 2;
  const scale = Math.min(drawableSize / (maxX - minX), drawableSize / (maxY - minY));
  const offsetX = (outputSize - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (outputSize - (maxY - minY) * scale) / 2 - minY * scale;

  return {
    project: (point): ScreenPoint => {
      const projected = projectPoint(point);
      return { x: projected.x * scale + offsetX, y: projected.y * scale + offsetY };
    },
  };
}

function cuboidCorners(cuboid: AvatarCuboid): readonly Vector3[] {
  const halfWidth = cuboid.size.width / 2;
  const halfHeight = cuboid.size.height / 2;
  const halfDepth = cuboid.size.depth / 2;
  return [-1, 1].flatMap((xSign): readonly Vector3[] =>
    [-1, 1].flatMap((ySign): readonly Vector3[] =>
      [-1, 1].map((zSign): Vector3 => ({
        x: cuboid.center.x + xSign * halfWidth,
        y: cuboid.center.y + ySign * halfHeight,
        z: cuboid.center.z + zSign * halfDepth,
      })),
    ),
  );
}

function projectPoint(point: Vector3): ScreenPoint {
  return { x: dot(point, SCREEN_RIGHT), y: -dot(point, SCREEN_UP) };
}

interface Color {
  readonly alpha: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

interface ProjectedFace {
  readonly cuboid: AvatarCuboid;
  readonly depths: readonly [number, number, number, number];
  readonly face: VisibleFace;
  readonly order: number;
  readonly points: readonly [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];
  readonly texture: TextureRect;
}

function projectCuboid(
  cuboid: AvatarCuboid,
  projection: Projection,
  startingOrder: number,
): readonly ProjectedFace[] {
  const faces: readonly VisibleFace[] = ['top', 'right', 'front'];
  return faces.map((face, faceIndex): ProjectedFace => {
    const worldPoints = faceCorners(cuboid, face);
    const [first, second, third, fourth] = worldPoints;
    return {
      cuboid,
      depths: [dot(first, CAMERA), dot(second, CAMERA), dot(third, CAMERA), dot(fourth, CAMERA)],
      face,
      order: startingOrder + faceIndex,
      points: [
        projection.project(first),
        projection.project(second),
        projection.project(third),
        projection.project(fourth),
      ],
      texture: textureRect(cuboid.texture, face),
    };
  });
}

interface FaceSample {
  readonly color: Color;
  readonly depth: number;
  readonly order: number;
}

// Sub-pixel samples per axis. Nine coverage samples per output pixel smooth the
// projected cuboid edges the way launchers downscale a large off-screen render.
// Interior texels stay crisp because every sub-sample keeps nearest-neighbor
// texture lookup; only geometric coverage is averaged.
const SUPERSAMPLE_GRID = 3;
const RENDER_UPSCALE = 2;

function rasterizeFaces(
  texture: SkinTexture,
  faces: readonly ProjectedFace[],
  output: Uint8ClampedArray,
  outputSize: number,
): void {
  const samples: FaceSample[] = [];
  for (let y = 0; y < outputSize; y += 1) {
    for (let x = 0; x < outputSize; x += 1) {
      // Accumulate premultiplied color so partially covered edges blend
      // against transparency instead of darkening toward black.
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let subY = 0; subY < SUPERSAMPLE_GRID; subY += 1) {
        for (let subX = 0; subX < SUPERSAMPLE_GRID; subX += 1) {
          samples.length = 0;
          const sampleX = x + (subX + 0.5) / SUPERSAMPLE_GRID;
          const sampleY = y + (subY + 0.5) / SUPERSAMPLE_GRID;
          for (const face of faces) {
            const sample = sampleFace(texture, face, sampleX, sampleY);
            if (sample !== undefined) {
              samples.push(sample);
            }
          }
          if (samples.length === 0) {
            continue;
          }
          samples.sort((left, right): number =>
            left.depth === right.depth ? left.order - right.order : left.depth - right.depth,
          );
          const color = compositeSamples(samples);
          const weight = color.alpha / 255;
          red += color.red * weight;
          green += color.green * weight;
          blue += color.blue * weight;
          alpha += weight;
        }
      }
      const coverage = SUPERSAMPLE_GRID * SUPERSAMPLE_GRID;
      const pixelAlpha = alpha / coverage;
      if (pixelAlpha === 0) {
        continue;
      }
      const outputIndex = (y * outputSize + x) * 4;
      output[outputIndex] = Math.round(red / coverage / pixelAlpha);
      output[outputIndex + 1] = Math.round(green / coverage / pixelAlpha);
      output[outputIndex + 2] = Math.round(blue / coverage / pixelAlpha);
      output[outputIndex + 3] = Math.round(pixelAlpha * 255);
    }
  }
}

function sampleFace(
  texture: SkinTexture,
  face: ProjectedFace,
  x: number,
  y: number,
): FaceSample | undefined {
  const [origin, horizontalEnd, , verticalEnd] = face.points;
  const horizontalX = horizontalEnd.x - origin.x;
  const horizontalY = horizontalEnd.y - origin.y;
  const verticalX = verticalEnd.x - origin.x;
  const verticalY = verticalEnd.y - origin.y;
  const determinant = horizontalX * verticalY - horizontalY * verticalX;
  const offsetX = x - origin.x;
  const offsetY = y - origin.y;
  const horizontal = (offsetX * verticalY - offsetY * verticalX) / determinant;
  const vertical = (horizontalX * offsetY - horizontalY * offsetX) / determinant;
  if (horizontal < 0 || horizontal > 1 || vertical < 0 || vertical > 1) {
    return undefined;
  }

  const textureX =
    face.texture.u + Math.min(face.texture.width - 1, Math.floor(horizontal * face.texture.width));
  const textureY =
    face.texture.v + Math.min(face.texture.height - 1, Math.floor(vertical * face.texture.height));
  let color = shadeColor(readColor(texture, textureX, textureY), face.face);
  if (face.cuboid.layer === 'outer' && color.alpha === 0) {
    return undefined;
  }
  if (face.cuboid.layer === 'base') {
    color = { ...color, alpha: 255 };
  }

  const [originDepth, horizontalDepth, , verticalDepth] = face.depths;
  return {
    color,
    depth:
      originDepth +
      horizontal * (horizontalDepth - originDepth) +
      vertical * (verticalDepth - originDepth),
    order: face.order,
  };
}

function downsampleBox(
  source: Uint8ClampedArray,
  sourceSize: number,
  target: Uint8ClampedArray,
  targetSize: number,
): void {
  const ratio = sourceSize / targetSize;
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let blockY = 0; blockY < ratio; blockY += 1) {
        for (let blockX = 0; blockX < ratio; blockX += 1) {
          const sourceIndex = ((y * ratio + blockY) * sourceSize + (x * ratio + blockX)) * 4;
          const weight = (source[sourceIndex + 3] ?? 0) / 255;
          red += (source[sourceIndex] ?? 0) * weight;
          green += (source[sourceIndex + 1] ?? 0) * weight;
          blue += (source[sourceIndex + 2] ?? 0) * weight;
          alpha += weight;
        }
      }
      const samples = ratio * ratio;
      const pixelAlpha = alpha / samples;
      if (pixelAlpha === 0) {
        continue;
      }
      const targetIndex = (y * targetSize + x) * 4;
      target[targetIndex] = Math.round(red / samples / pixelAlpha);
      target[targetIndex + 1] = Math.round(green / samples / pixelAlpha);
      target[targetIndex + 2] = Math.round(blue / samples / pixelAlpha);
      target[targetIndex + 3] = Math.round(pixelAlpha * 255);
    }
  }
}

function compositeSamples(samples: readonly FaceSample[]): Color {
  let alpha = 0;
  let blue = 0;
  let green = 0;
  let red = 0;
  for (const sample of samples) {
    const sourceAlpha = sample.color.alpha / 255;
    const remaining = 1 - sourceAlpha;
    red = sample.color.red * sourceAlpha + red * remaining;
    green = sample.color.green * sourceAlpha + green * remaining;
    blue = sample.color.blue * sourceAlpha + blue * remaining;
    alpha = sourceAlpha + alpha * remaining;
  }
  if (alpha === 0) {
    return { alpha: 0, blue: 0, green: 0, red: 0 };
  }
  return {
    alpha: Math.round(alpha * 255),
    blue: Math.round(blue / alpha),
    green: Math.round(green / alpha),
    red: Math.round(red / alpha),
  };
}

interface TextureRect {
  readonly height: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
}

function textureRect(texture: TextureBox, face: VisibleFace): TextureRect {
  switch (face) {
    case 'front':
      return {
        height: texture.height,
        u: texture.u + texture.depth,
        v: texture.v + texture.depth,
        width: texture.width,
      };
    case 'right':
      return {
        height: texture.height,
        u: texture.u + texture.depth + texture.width,
        v: texture.v + texture.depth,
        width: texture.depth,
      };
    case 'top':
      return {
        height: texture.depth,
        u: texture.u + texture.depth,
        v: texture.v,
        width: texture.width,
      };
  }
}

function faceCorners(
  cuboid: AvatarCuboid,
  face: VisibleFace,
): readonly [Vector3, Vector3, Vector3, Vector3] {
  const left = cuboid.center.x - cuboid.size.width / 2;
  const right = cuboid.center.x + cuboid.size.width / 2;
  const top = cuboid.center.y + cuboid.size.height / 2;
  const bottom = cuboid.center.y - cuboid.size.height / 2;
  const front = cuboid.center.z + cuboid.size.depth / 2;
  const back = cuboid.center.z - cuboid.size.depth / 2;

  switch (face) {
    case 'front':
      return [
        { x: left, y: top, z: front },
        { x: right, y: top, z: front },
        { x: right, y: bottom, z: front },
        { x: left, y: bottom, z: front },
      ];
    case 'right':
      return [
        { x: right, y: top, z: front },
        { x: right, y: top, z: back },
        { x: right, y: bottom, z: back },
        { x: right, y: bottom, z: front },
      ];
    case 'top':
      return [
        { x: left, y: top, z: back },
        { x: right, y: top, z: back },
        { x: right, y: top, z: front },
        { x: left, y: top, z: front },
      ];
  }
}

function readColor(texture: SkinTexture, x: number, y: number): Color {
  const index = (y * texture.width + x) * 4;
  const red = texture.pixels.at(index);
  const green = texture.pixels.at(index + 1);
  const blue = texture.pixels.at(index + 2);
  const alpha = texture.pixels.at(index + 3);
  if (red === undefined || green === undefined || blue === undefined || alpha === undefined) {
    throw new RangeError('Minecraft skin UV points outside the decoded texture');
  }
  return { alpha, blue, green, red };
}

function shadeColor(color: Color, face: VisibleFace): Color {
  const factor = face === 'top' ? 1 : face === 'front' ? 0.9 : 0.72;
  return {
    alpha: color.alpha,
    blue: Math.round(color.blue * factor),
    green: Math.round(color.green * factor),
    red: Math.round(color.red * factor),
  };
}

function dot(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}
