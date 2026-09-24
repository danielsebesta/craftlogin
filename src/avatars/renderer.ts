import { createCanvas } from '@napi-rs/canvas';

import type { SkinTexture, TexturePixels } from './skin-texture.js';
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
    capeTexture?: TexturePixels,
  ): Promise<Buffer>;
}

export class CanvasAvatarRenderer implements AvatarRenderer {
  public async render(
    texture: SkinTexture,
    model: MinecraftSkinModel,
    options: AvatarRenderOptions,
    capeTexture?: TexturePixels,
  ): Promise<Buffer> {
    // Vanilla renders skin overlays on separately inflated cuboids, so their
    // projected texture is centered over, but larger than, the base surface.
    if (options.view === 'face') {
      return await renderProjectedHead(texture, options.layers, options.size);
    }
    if (options.view === 'side') {
      return await renderSideFigure(texture, model, options.layers, options.size);
    }
    if (options.view === 'duo') {
      return await renderDuo(texture, model, options.layers, options.size, capeTexture);
    }
    if (options.view === 'wings') {
      return await renderWingsFigure(texture, model, options.layers, options.size, capeTexture);
    }
    return await renderFlatFigure(
      texture,
      model,
      options.view,
      options.layers,
      options.size,
      capeTexture,
    );
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

// Flat front projection for bust, body, and back: the figure is laid out
// exactly like the skin file (arms beside the torso, legs below it) and scaled
// to fill the square canvas height. Axis-aligned texels stay crisp, and the
// viewer-facing layout mirrors limb placement.
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
  view: 'back' | 'body' | 'bust',
  layers: AvatarLayers,
  outputSize: number,
  capeTexture?: TexturePixels,
): Promise<Buffer> {
  const scene = buildFlatScene(view, model, layers, texture);
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);
  paintFlatScene(
    output.data,
    outputSize,
    scene,
    { height: outputSize, width: outputSize, x: 0, y: 0 },
    view === 'back' ? capeTexture : undefined,
  );
  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

// The duo composites the flat front and back figures side by side: the same
// square canvas carries both, so each half keeps the figure's 1:2 proportions.
async function renderDuo(
  texture: SkinTexture,
  model: MinecraftSkinModel,
  layers: AvatarLayers,
  outputSize: number,
  capeTexture?: TexturePixels,
): Promise<Buffer> {
  const front = buildFlatScene('body', model, layers, texture);
  const back = buildFlatScene('back', model, layers, texture);
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);
  const half = outputSize / 2;
  const gutter = outputSize / 32;
  paintFlatScene(output.data, outputSize, front, {
    height: outputSize,
    width: half - gutter,
    x: 0,
    y: 0,
  });
  paintFlatScene(
    output.data,
    outputSize,
    back,
    {
      height: outputSize,
      width: outputSize - half - gutter,
      x: half + gutter,
      y: 0,
    },
    capeTexture,
  );
  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

interface FlatScene {
  readonly armWidth: number;
  readonly bounds: SceneBounds;
  readonly projected: readonly ProjectedCuboid[];
  readonly source: TexturePixels;
}

function buildFlatScene(
  view: 'back' | 'body' | 'bust',
  model: MinecraftSkinModel,
  layers: AvatarLayers,
  texture: SkinTexture,
): FlatScene {
  // The back view mirrors the figure horizontally and samples each part's back
  // face instead of the front.
  const mirrored = view === 'back';
  const armWidth = model === 'slim' ? 3 : 4;
  const projected = buildAvatarScene(view, model, layers, texture.legacy)
    .map((cuboid): ProjectedCuboid => projectCuboid(cuboid, armWidth, mirrored))
    .filter(
      (cuboid): boolean => cuboid.layer === 'base' || hasVisiblePixels(texture, cuboid.texture),
    );
  // Frame against the vanilla base model, not its inflated overlays. Otherwise
  // enabling layers shrinks and shifts the entire player, which is especially
  // visible as detached seams at small output sizes.
  return {
    armWidth,
    bounds: projectedBounds(projected.filter((cuboid): boolean => cuboid.layer === 'base')),
    projected,
    source: texture,
  };
}

interface PaintRegion {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

function paintFlatScene(
  output: Uint8ClampedArray,
  outputSize: number,
  scene: FlatScene,
  region: PaintRegion,
  capeTexture?: TexturePixels,
): void {
  const transform = fitFlatTransform(scene.bounds, region);
  paintFlatCuboids(output, outputSize, scene, transform);

  // A worn cape hangs behind the torso, so it drapes over the body's back
  // faces in a back view. The figure bounds stay cape-free so a missing or
  // differently sized cape can never shift the framing.
  const capeRect = capeTexture === undefined ? undefined : scaledCapeRect(capeTexture);
  if (capeRect !== undefined && capeTexture !== undefined) {
    paintFlatRect(
      output,
      outputSize,
      capeTexture,
      capeRect,
      transform.offsetX + (scene.armWidth - 1) * transform.scale,
      transform.offsetY + CAPE_TOP_Y * transform.scale,
      10 * transform.scale,
      16 * transform.scale,
      false,
    );
  }
}

interface FlatTransform {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
}

interface SceneBounds {
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
}

function fitFlatTransform(bounds: SceneBounds, region: PaintRegion): FlatTransform {
  const scale = Math.min(
    region.width / (bounds.maxX - bounds.minX),
    region.height / (bounds.maxY - bounds.minY),
  );
  return {
    offsetX:
      region.x + (region.width - (bounds.maxX - bounds.minX) * scale) / 2 - bounds.minX * scale,
    offsetY:
      region.y + (region.height - (bounds.maxY - bounds.minY) * scale) / 2 - bounds.minY * scale,
    scale,
  };
}

function paintFlatCuboids(
  output: Uint8ClampedArray,
  outputSize: number,
  scene: FlatScene,
  transform: FlatTransform,
): void {
  // Outer surfaces all sit in front of the base model. Painting every base first
  // prevents a neighboring limb base from incorrectly covering an inflated layer.
  const paintOrder = [
    ...scene.projected.filter((cuboid): boolean => cuboid.layer === 'base'),
    ...scene.projected.filter((cuboid): boolean => cuboid.layer === 'outer'),
  ];
  for (const cuboid of paintOrder) {
    paintFlatRect(
      output,
      outputSize,
      scene.source,
      cuboid.texture,
      transform.offsetX + cuboid.x * transform.scale,
      transform.offsetY + cuboid.y * transform.scale,
      cuboid.width * transform.scale,
      cuboid.height * transform.scale,
      cuboid.layer === 'base',
    );
  }
}

// The cape's outward face in the shared cape atlas layout: the worn cuboid is
// turned 180° on the model, so the visible face is the net's front panel.
const CAPE_TEXTURE_RECT: TextureRect = { height: 16, u: 1, v: 1, width: 10 };
// The cape hangs from the shoulders, which sit at the torso's top edge.
const CAPE_TOP_Y = 8;

// The side view is a flat left profile: the horizontal axis is the character's
// front-to-back depth with the face toward the image's left edge. Near-side
// parts (left arm and leg) fully cover their far counterparts.
async function renderSideFigure(
  texture: SkinTexture,
  model: MinecraftSkinModel,
  layers: AvatarLayers,
  outputSize: number,
): Promise<Buffer> {
  const projected = buildAvatarScene('side', model, layers, texture.legacy)
    .map((cuboid): ProjectedCuboid => ({
      height: cuboid.size.height,
      layer: cuboid.layer,
      texture: leftTextureRect(cuboid.texture),
      width: cuboid.size.depth,
      x: 4 - cuboid.size.depth / 2,
      y: 32 - cuboid.center.y - cuboid.size.height / 2,
    }))
    .filter(
      (cuboid): boolean => cuboid.layer === 'base' || hasVisiblePixels(texture, cuboid.texture),
    );
  const scene: FlatScene = {
    armWidth: 0,
    bounds: projectedBounds(projected.filter((cuboid): boolean => cuboid.layer === 'base')),
    projected,
    source: texture,
  };
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);
  paintFlatScene(output.data, outputSize, scene, {
    height: outputSize,
    width: outputSize,
    x: 0,
    y: 0,
  });
  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

// The wings view is the flat back figure wearing deployed elytra instead of a
// cape: each wing is the back face of the wing cuboid in the Mojang cape atlas
// (a 10x20x2 box at u22,v0), rotated outward around a spine hinge. The atlas
// artwork is pre-sheared, so the rotated silhouette reads as a spread wing.
async function renderWingsFigure(
  texture: SkinTexture,
  model: MinecraftSkinModel,
  layers: AvatarLayers,
  outputSize: number,
  capeTexture?: TexturePixels,
): Promise<Buffer> {
  const scene = buildFlatScene('back', model, layers, texture);
  const wingRect = capeTexture === undefined ? undefined : scaledWingRect(capeTexture);
  let { bounds } = scene;
  if (wingRect !== undefined) {
    bounds = {
      maxX: Math.max(bounds.maxX, WING_HINGE_X + scene.armWidth + WING_FOOTPRINT.maxX),
      maxY: Math.max(bounds.maxY, WING_HINGE_Y + WING_FOOTPRINT.maxY),
      minX: Math.min(bounds.minX, WING_HINGE_X + scene.armWidth - WING_FOOTPRINT.maxX),
      minY: Math.min(bounds.minY, WING_HINGE_Y + WING_FOOTPRINT.minY),
    };
  }
  const transform = fitFlatTransform(bounds, {
    height: outputSize,
    width: outputSize,
    x: 0,
    y: 0,
  });
  const canvas = createCanvas(outputSize, outputSize);
  const context = canvas.getContext('2d');
  const output = context.createImageData(outputSize, outputSize);
  paintFlatCuboids(output.data, outputSize, scene, transform);
  if (wingRect !== undefined && capeTexture !== undefined) {
    const { scale } = transform;
    const hingeY = transform.offsetY + WING_HINGE_Y * scale;
    // Vanilla pivots each wing 5 units to its own side while the plate itself
    // stays centered on the spine, so the pair crosses over the midline instead
    // of splaying apart; the right wing samples the same atlas face mirrored.
    const leftHingeX = transform.offsetX + (scene.armWidth + WING_HINGE_X - 5) * scale;
    const rightHingeX = transform.offsetX + (scene.armWidth + WING_HINGE_X + 5) * scale;
    paintWing(
      output.data,
      outputSize,
      capeTexture,
      wingRect,
      leftHingeX,
      hingeY,
      WING_SPREAD,
      false,
      -1 * scale,
      (WING_WIDTH - 1) * scale,
      WING_HEIGHT * scale,
    );
    paintWing(
      output.data,
      outputSize,
      capeTexture,
      wingRect,
      rightHingeX,
      hingeY,
      -WING_SPREAD,
      true,
      -(WING_WIDTH - 1) * scale,
      1 * scale,
      WING_HEIGHT * scale,
    );
  }
  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

// The wing cuboid's visible rear face in the 64x32 atlas. The front face
// (u24-34) is the hidden inner side; the Mojang layout shares this region
// between both wings and mirrors it for the right one.
const WING_TEXTURE_RECT: TextureRect = { height: 20, u: 36, v: 2, width: 10 };
// Model-space wing plate: the 10x20x2 cuboid inflated by 1, like vanilla.
const WING_WIDTH = 12;
const WING_HEIGHT = 22;
const WING_HINGE_Y = 9;
// Vanilla tilts the folded wings 15° outward while standing; the pair overlaps
// at the spine and only the tips part, which is the canonical worn look.
const WING_SPREAD = Math.PI / 12;
// The spine sits at the torso's horizontal center; each wing pivots
// WING_PIVOT_OFFSET to its own side of it, near the neckline.
const WING_HINGE_X = 4;

// Half-extent of the rotated wing pair relative to the spine: each plate is
// centered on the midline but pivots 5 units to its own side, so a tip lands
// WING_PIVOT + corner-dx out while the plates cross over the center. The pair
// is symmetric, so one wing's corners bound both sides.
const WING_PIVOT_OFFSET = 5;
const WING_FOOTPRINT = ((): {
  readonly maxX: number;
  readonly maxY: number;
  readonly minY: number;
} => {
  const cos = Math.cos(WING_SPREAD);
  const sin = Math.sin(WING_SPREAD);
  let maxX = 0;
  let maxY = 0;
  let minY = 0;
  for (const lx of [-1, WING_WIDTH - 1]) {
    for (const ly of [0, WING_HEIGHT]) {
      maxX = Math.max(maxX, Math.abs(-WING_PIVOT_OFFSET + lx * cos - ly * sin));
      const dy = lx * sin + ly * cos;
      maxY = Math.max(maxY, dy);
      minY = Math.min(minY, dy);
    }
  }
  return { maxX, maxY, minY };
})();

// The cape face sits at the same coordinates in every supported atlas, scaled
// by the atlas factor; empty faces simply paint nothing.
function scaledCapeRect(capeTexture: TexturePixels): TextureRect | undefined {
  const atlasScale = capeAtlasScale(capeTexture);
  if (atlasScale === undefined) {
    return undefined;
  }
  const rect = {
    height: CAPE_TEXTURE_RECT.height * atlasScale,
    u: CAPE_TEXTURE_RECT.u * atlasScale,
    v: CAPE_TEXTURE_RECT.v * atlasScale,
    width: CAPE_TEXTURE_RECT.width * atlasScale,
  };
  return hasVisiblePixels(capeTexture, rect) ? rect : undefined;
}

// Mojang canvases are 64x32 while OptiFine ships the same layout cropped to
// its 46x22 content; both repeat at integer scales for HD textures, and any
// other size carries no usable atlas faces.
function capeAtlasScale(capeTexture: TexturePixels): number | undefined {
  const mojang = capeTexture.width / 64;
  if (Number.isInteger(mojang) && mojang >= 1 && capeTexture.height === mojang * 32) {
    return mojang;
  }
  const optifine = capeTexture.width / 46;
  if (Number.isInteger(optifine) && optifine >= 1 && capeTexture.height === optifine * 22) {
    return optifine;
  }
  return undefined;
}

// Third-party atlases share the Mojang face coordinates, so the wing face
// scales with whatever atlas family the texture matches.
function scaledWingRect(capeTexture: TexturePixels): TextureRect | undefined {
  const atlasScale = capeAtlasScale(capeTexture);
  if (atlasScale === undefined) {
    return undefined;
  }
  const rect = {
    height: WING_TEXTURE_RECT.height * atlasScale,
    u: WING_TEXTURE_RECT.u * atlasScale,
    v: WING_TEXTURE_RECT.v * atlasScale,
    width: WING_TEXTURE_RECT.width * atlasScale,
  };
  return hasVisiblePixels(capeTexture, rect) ? rect : undefined;
}

// Paints a wing plate rotated around its pivot: the rect spans [lo, hi]
// relative to the pivot — vanilla pivots sit near the plate's outer top corner
// so most of the plate reaches across the spine — and `mirror` flips the
// texture's horizontal axis for the right wing. Sampling is nearest-texel,
// matching the flat rect painter.
function paintWing(
  output: Uint8ClampedArray,
  outputSize: number,
  texture: TexturePixels,
  rect: TextureRect,
  hingeX: number,
  hingeY: number,
  angle: number,
  mirror: boolean,
  lo: number,
  hi: number,
  height: number,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const width = hi - lo;
  let minX = hingeX;
  let maxX = hingeX;
  let minY = hingeY;
  let maxY = hingeY;
  for (const lx of [lo, hi]) {
    for (const ly of [0, height]) {
      minX = Math.min(minX, hingeX + lx * cos - ly * sin);
      maxX = Math.max(maxX, hingeX + lx * cos - ly * sin);
      minY = Math.min(minY, hingeY + lx * sin + ly * cos);
      maxY = Math.max(maxY, hingeY + lx * sin + ly * cos);
    }
  }
  const startX = Math.max(0, Math.floor(minX));
  const endX = Math.min(outputSize, Math.ceil(maxX));
  const startY = Math.max(0, Math.floor(minY));
  const endY = Math.min(outputSize, Math.ceil(maxY));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const dx = x + 0.5 - hingeX;
      const dy = y + 0.5 - hingeY;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      if (lx < lo || lx >= hi || ly < 0 || ly >= height) {
        continue;
      }
      const along = mirror ? 1 - (lx - lo) / width : (lx - lo) / width;
      const texelX = Math.min(rect.width - 1, Math.floor(along * rect.width));
      const texelY = Math.min(rect.height - 1, Math.floor((ly / height) * rect.height));
      const sampled = readColor(texture, rect.u + texelX, rect.v + texelY);
      if (sampled.alpha === 0) {
        continue;
      }
      const outputIndex = (y * outputSize + x) * 4;
      writeColor(
        output,
        outputIndex,
        compositeColor(readOutputColor(output, outputIndex), sampled),
      );
    }
  }
}

interface ProjectedCuboid {
  readonly height: number;
  readonly layer: AvatarLayer;
  readonly texture: TextureRect;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

function projectCuboid(cuboid: AvatarCuboid, armWidth: number, mirrored: boolean): ProjectedCuboid {
  const layout = flatLayout(cuboid.part, armWidth);
  const texture = mirrored ? backTextureRect(cuboid.texture) : frontTextureRect(cuboid.texture);
  // Mirroring a painted rect inside the 2*armWidth+8 wide figure is a flip of
  // its painted extent, not just its layout origin.
  const frontX = layout.x + (texture.width - cuboid.size.width) / 2;
  const x = mirrored ? 2 * armWidth + 8 - frontX - cuboid.size.width : frontX;
  return {
    height: cuboid.size.height,
    layer: cuboid.layer,
    texture,
    width: cuboid.size.width,
    x,
    y: layout.y + (texture.height - cuboid.size.height) / 2,
  };
}

function projectedBounds(projected: readonly ProjectedCuboid[]): SceneBounds {
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
  texture: TexturePixels,
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
      const texelX = Math.min(rect.width - 1, Math.floor(((x - destX) * rect.width) / destWidth));
      // Back faces are already pre-mirrored by the skin atlas layout: their
      // left edge borders the character's left side, which is the viewer's
      // left in a rear view. Both projections therefore sample unflipped.
      const sourceX = rect.u + texelX;
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
      views: ['back', 'body', 'bust', 'side'],
    },
    {
      center: { x: 0, y: 18, z: 0 },
      part: 'torso',
      size: { depth: 4, height: 12, width: 8 },
      texture: { depth: 4, height: 12, u: 16, v: 16, width: 8 },
      views: ['back', 'body', 'bust', 'side'],
    },
    {
      center: { x: -armCenter, y: 18, z: 0 },
      part: 'rightArm',
      size: { depth: 4, height: 12, width: armWidth },
      texture: { depth: 4, height: 12, u: 40, v: 16, width: armWidth },
      views: ['back', 'body', 'bust'],
    },
    {
      center: { x: armCenter, y: 18, z: 0 },
      part: 'leftArm',
      size: { depth: 4, height: 12, width: armWidth },
      texture: { depth: 4, height: 12, u: 32, v: 48, width: armWidth },
      views: ['back', 'body', 'bust', 'side'],
    },
    {
      center: { x: -2, y: 6, z: 0 },
      part: 'rightLeg',
      size: { depth: 4, height: 12, width: 4 },
      texture: { depth: 4, height: 12, u: 0, v: 16, width: 4 },
      views: ['back', 'body'],
    },
    {
      center: { x: 2, y: 6, z: 0 },
      part: 'leftLeg',
      size: { depth: 4, height: 12, width: 4 },
      texture: { depth: 4, height: 12, u: 16, v: 48, width: 4 },
      views: ['back', 'body', 'side'],
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

// The back face sits after the right side, front, and left side in the UV row.
function backTextureRect(texture: TextureBox): TextureRect {
  return {
    height: texture.height,
    u: texture.u + 2 * texture.depth + texture.width,
    v: texture.v + texture.depth,
    width: texture.width,
  };
}

// The left side sits between the front and back faces in the UV row.
function leftTextureRect(texture: TextureBox): TextureRect {
  return {
    height: texture.height,
    u: texture.u + texture.depth + texture.width,
    v: texture.v + texture.depth,
    width: texture.depth,
  };
}

function hasVisiblePixels(texture: TexturePixels, rect: TextureRect): boolean {
  for (let y = rect.v; y < rect.v + rect.height; y += 1) {
    for (let x = rect.u; x < rect.u + rect.width; x += 1) {
      if (readColor(texture, x, y).alpha !== 0) {
        return true;
      }
    }
  }
  return false;
}

function readColor(texture: TexturePixels, x: number, y: number): Color {
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
