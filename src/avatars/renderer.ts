import { createCanvas } from '@napi-rs/canvas';

import type { SkinTexture } from './skin-texture.js';
import type { AvatarLayers, AvatarRenderOptions, AvatarView, MinecraftSkinModel } from './types.js';

type AvatarLayer = 'base' | 'outer';
type BodyPart = 'head' | 'leftArm' | 'leftLeg' | 'rightArm' | 'rightLeg' | 'torso';

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
    // Every view is a front orthographic projection with nearest-neighbor texels.
    // Vanilla renders skin overlays on separately inflated cuboids, so their
    // projected texture is centered over, but larger than, the base surface.
    if (options.view === 'face' || options.view === 'head') {
      return await renderProjectedHead(texture, options.layers, options.size);
    }
    return await renderFlatFigure(texture, model, options.view, options.layers, options.size);
  }
}

async function renderProjectedHead(
  texture: SkinTexture,
  layers: AvatarLayers,
  outputSize: number,
): Promise<Buffer> {
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);
  // A flat face benefits from the same small visible separation as established
  // avatar services: the helmet fills the frame while the face is inset by 5%.
  // Full figure projections below retain the exact vanilla cuboid dimensions.
  const overlayRect = { height: 8, u: 40, v: 8, width: 8 };
  const showOverlay = layers === 'all' && hasVisiblePixels(texture, overlayRect);
  const overlayRatio = showOverlay ? 1.05 : 1;
  const baseSize = outputSize / overlayRatio;
  const baseOffset = (outputSize - baseSize) / 2;
  paintFlatRect(
    output.data,
    outputSize,
    texture,
    { height: 8, u: 8, v: 8, width: 8 },
    baseOffset,
    baseOffset,
    baseSize,
    baseSize,
    true,
  );
  if (showOverlay) {
    paintFlatRect(
      output.data,
      outputSize,
      texture,
      overlayRect,
      0,
      0,
      outputSize,
      outputSize,
      false,
    );
  }
  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

// Flat front projection for bust and body: the figure is laid out exactly like
// the skin file (arms beside the torso, legs below it) and scaled to fill the
// square canvas height. Axis-aligned texels stay crisp, and the viewer-facing
// layout mirrors limb placement.
function flatLayout(part: BodyPart, armWidth: number): { readonly x: number; readonly y: number } {
  switch (part) {
    case 'head':
      return { x: armWidth, y: 0 };
    case 'torso':
      return { x: armWidth, y: 8 };
    case 'rightArm':
      return { x: 0, y: 8 };
    case 'leftArm':
      return { x: armWidth + 8, y: 8 };
    case 'rightLeg':
      return { x: armWidth, y: 20 };
    case 'leftLeg':
      return { x: armWidth + 4, y: 20 };
  }
}

async function renderFlatFigure(
  texture: SkinTexture,
  model: MinecraftSkinModel,
  view: 'body' | 'bust',
  layers: AvatarLayers,
  outputSize: number,
): Promise<Buffer> {
  const scene = buildAvatarScene(view, model, layers, texture.legacy);
  const armWidth = model === 'slim' ? 3 : 4;
  const projected = scene
    .map((cuboid): ProjectedCuboid => projectCuboid(cuboid, armWidth))
    .filter(
      (cuboid): boolean => cuboid.layer === 'base' || hasVisiblePixels(texture, cuboid.texture),
    );
  // Frame against the vanilla base model, not its inflated overlays. Otherwise
  // enabling layers shrinks and shifts the entire player, which is especially
  // visible as detached seams at small output sizes.
  const bounds = projectedBounds(projected.filter((cuboid): boolean => cuboid.layer === 'base'));
  const scale = Math.min(
    outputSize / (bounds.maxX - bounds.minX),
    outputSize / (bounds.maxY - bounds.minY),
  );
  const offsetX = (outputSize - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale;
  const offsetY = (outputSize - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale;

  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);

  // Outer surfaces all sit in front of the base model. Painting every base first
  // prevents a neighboring limb base from incorrectly covering an inflated layer.
  const paintOrder = [
    ...projected.filter((cuboid): boolean => cuboid.layer === 'base'),
    ...projected.filter((cuboid): boolean => cuboid.layer === 'outer'),
  ];
  for (const cuboid of paintOrder) {
    paintFlatRect(
      output.data,
      outputSize,
      texture,
      cuboid.texture,
      offsetX + cuboid.x * scale,
      offsetY + cuboid.y * scale,
      cuboid.width * scale,
      cuboid.height * scale,
      cuboid.layer === 'base',
    );
  }

  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

interface ProjectedCuboid {
  readonly height: number;
  readonly layer: AvatarLayer;
  readonly texture: TextureRect;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

function projectCuboid(cuboid: AvatarCuboid, armWidth: number): ProjectedCuboid {
  const layout = flatLayout(cuboid.part, armWidth);
  const texture = frontTextureRect(cuboid.texture);
  return {
    height: cuboid.size.height,
    layer: cuboid.layer,
    texture,
    width: cuboid.size.width,
    x: layout.x + (texture.width - cuboid.size.width) / 2,
    y: layout.y + (texture.height - cuboid.size.height) / 2,
  };
}

function projectedBounds(projected: readonly ProjectedCuboid[]): {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
} {
  if (projected.length === 0) {
    throw new RangeError('Avatar projection has no cuboids');
  }
  return {
    maxX: Math.max(...projected.map((cuboid): number => cuboid.x + cuboid.width)),
    maxY: Math.max(...projected.map((cuboid): number => cuboid.y + cuboid.height)),
    minX: Math.min(...projected.map((cuboid): number => cuboid.x)),
    minY: Math.min(...projected.map((cuboid): number => cuboid.y)),
  };
}

function paintFlatRect(
  output: Uint8ClampedArray,
  outputSize: number,
  texture: SkinTexture,
  rect: TextureRect,
  destX: number,
  destY: number,
  destWidth: number,
  destHeight: number,
  base: boolean,
): void {
  const startX = Math.max(0, Math.floor(destX));
  const endX = Math.min(outputSize, Math.ceil(destX + destWidth));
  const startY = Math.max(0, Math.floor(destY));
  const endY = Math.min(outputSize, Math.ceil(destY + destHeight));
  for (let y = startY; y < endY; y += 1) {
    const sourceY =
      rect.v + Math.min(rect.height - 1, Math.floor(((y - destY) * rect.height) / destHeight));
    for (let x = startX; x < endX; x += 1) {
      const sourceX =
        rect.u + Math.min(rect.width - 1, Math.floor(((x - destX) * rect.width) / destWidth));
      const sampled = readColor(texture, sourceX, sourceY);
      const outputIndex = (y * outputSize + x) * 4;
      if (base) {
        writeColor(output, outputIndex, { ...sampled, alpha: 255 });
      } else if (sampled.alpha !== 0) {
        writeColor(
          output,
          outputIndex,
          compositeColor(readOutputColor(output, outputIndex), sampled),
        );
      }
    }
  }
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

interface Color {
  readonly alpha: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}

interface TextureRect {
  readonly height: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
}

function frontTextureRect(texture: TextureBox): TextureRect {
  return {
    height: texture.height,
    u: texture.u + texture.depth,
    v: texture.v + texture.depth,
    width: texture.width,
  };
}

function hasVisiblePixels(texture: SkinTexture, rect: TextureRect): boolean {
  for (let y = rect.v; y < rect.v + rect.height; y += 1) {
    for (let x = rect.u; x < rect.u + rect.width; x += 1) {
      if (readColor(texture, x, y).alpha !== 0) {
        return true;
      }
    }
  }
  return false;
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
