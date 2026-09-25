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
  // Vanilla overlays sit on inflated cuboids, so the helmet fills the frame
  // while the face insets by 5%.
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

// Flat projection laid out exactly like the skin file (arms beside the torso,
// legs below it), scaled to fill the square canvas height.
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

// Duo composites the flat front and back figures side by side on one square canvas.
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
  const mirrored = view === 'back';
  const armWidth = model === 'slim' ? 3 : 4;
  const projected = buildAvatarScene(view, model, layers, texture.legacy)
    .map((cuboid): ProjectedCuboid => projectCuboid(cuboid, armWidth, mirrored))
    .filter(
      (cuboid): boolean => cuboid.layer === 'base' || hasVisiblePixels(texture, cuboid.texture),
    );
  // Frame against the vanilla base model, not its inflated overlays, so
  // enabling layers can't shrink or shift the figure.
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

  // Figure bounds exclude the cape so a missing or oddly sized one can't shift framing.
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
  // Bases paint first so a limb base can't cover a neighbor's inflated outer layer.
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

// The worn cape cuboid is turned 180° on the model, so its visible face is the
// atlas's front panel.
const CAPE_TEXTURE_RECT: TextureRect = { height: 16, u: 1, v: 1, width: 10 };
const CAPE_TOP_Y = 8;

// Flat left profile: horizontal axis is front-to-back depth, face toward the
// left edge; near-side parts fully cover their far counterparts.
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

// The wings view is the flat back figure wearing the vanilla ElytraModel
// cuboids in their standing pose, depth-resolved against the body like in-game.
async function renderWingsFigure(
  texture: SkinTexture,
  model: MinecraftSkinModel,
  layers: AvatarLayers,
  outputSize: number,
  capeTexture?: TexturePixels,
): Promise<Buffer> {
  const scene = buildFlatScene('back', model, layers, texture);
  const atlasScale = capeTexture === undefined ? undefined : wingAtlasScale(capeTexture);
  const wings = atlasScale === undefined ? [] : buildWingQuads(scene.armWidth + 4);
  const bounds = wings.length === 0 ? scene.bounds : unionBounds(scene.bounds, quadBounds(wings));
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
  if (atlasScale !== undefined && capeTexture !== undefined) {
    paintDepthQuads(output.data, outputSize, capeTexture, atlasScale, wings, transform);
  }
  context.putImageData(output, 0, 0);
  return await canvas.encode('png');
}

// Vanilla ElytraModel geometry: a 10x20x2 cuboid at texOffs(22,0) inflated by
// 1, hinged beside the spine, pushed 2 units behind the body, and posed with a
// 15° pitch plus 15° roll toward the midline.
const WING_CUBOID = {
  max: { x: 1, y: 21, z: 3 },
  min: { x: -11, y: -1, z: -1 },
  texture: { depth: 2, height: 20, u: 22, v: 0, width: 10 },
} as const;
const WING_HINGE: Vector3 = { x: 5, y: 0, z: 2 };
const WING_PITCH = Math.PI / 12;
const WING_ROLL = Math.PI / 12;
// In-game cutout rendering discards texels below 10% alpha.
const CUTOUT_ALPHA = 26;

interface TexturedVertex {
  readonly u: number;
  readonly v: number;
  readonly x: number;
  readonly y: number;
  // Depth toward the viewer: larger values are nearer.
  readonly z: number;
}

type TexturedQuad = readonly [TexturedVertex, TexturedVertex, TexturedVertex, TexturedVertex];

// Both wings in figure units; the right wing is the left wing mirrored across the spine.
function buildWingQuads(spine: number): readonly TexturedQuad[] {
  const cosPitch = Math.cos(WING_PITCH);
  const sinPitch = Math.sin(WING_PITCH);
  const cosRoll = Math.cos(WING_ROLL);
  const sinRoll = Math.sin(WING_ROLL);
  const quads: TexturedQuad[] = [];
  for (const side of [1, -1] as const) {
    // ModelPart rotationZYX: pitch first, then roll; the mirrored right wing
    // negates the roll with x.
    const pose = (vertex: TexturedVertex): TexturedVertex => {
      const pitchedY = vertex.y * cosPitch - vertex.z * sinPitch;
      const pitchedZ = vertex.y * sinPitch + vertex.z * cosPitch;
      const rolledX = vertex.x * cosRoll + pitchedY * sinRoll;
      const rolledY = -vertex.x * sinRoll + pitchedY * cosRoll;
      return {
        u: vertex.u,
        v: vertex.v,
        x: spine - side * (WING_HINGE.x + rolledX),
        y: CAPE_TOP_Y + WING_HINGE.y + rolledY,
        z: WING_HINGE.z + pitchedZ,
      };
    };
    for (const face of modelCuboidFaces(WING_CUBOID.min, WING_CUBOID.max, WING_CUBOID.texture)) {
      quads.push([pose(face[0]), pose(face[1]), pose(face[2]), pose(face[3])]);
    }
  }
  return quads;
}

// Vanilla ModelPart cuboid faces with the game's texel-corner assignment.
// Model y points down; z points behind the player.
function modelCuboidFaces(
  min: Vector3,
  max: Vector3,
  texture: TextureBox,
): readonly TexturedQuad[] {
  const { depth, height, u, v, width } = texture;
  const corner = (x: number, y: number, z: number): Vector3 => ({ x, y, z });
  const v0 = corner(min.x, min.y, min.z);
  const v1 = corner(max.x, min.y, min.z);
  const v2 = corner(max.x, max.y, min.z);
  const v3 = corner(min.x, max.y, min.z);
  const v4 = corner(min.x, min.y, max.z);
  const v5 = corner(max.x, min.y, max.z);
  const v6 = corner(max.x, max.y, max.z);
  const v7 = corner(min.x, max.y, max.z);
  const face = (
    a: Vector3,
    b: Vector3,
    c: Vector3,
    d: Vector3,
    u1: number,
    v1: number,
    u2: number,
    v2: number,
  ): TexturedQuad => [
    { ...a, u: u2, v: v1 },
    { ...b, u: u1, v: v1 },
    { ...c, u: u1, v: v2 },
    { ...d, u: u2, v: v2 },
  ];
  return [
    face(v5, v4, v0, v1, u + depth, v, u + depth + width, v + depth),
    face(v2, v3, v7, v6, u + depth + width, v + depth, u + depth + 2 * width, v),
    face(v0, v4, v7, v3, u, v + depth, u + depth, v + depth + height),
    face(v1, v0, v3, v2, u + depth, v + depth, u + depth + width, v + depth + height),
    face(v5, v1, v2, v6, u + depth + width, v + depth, u + 2 * depth + width, v + depth + height),
    face(
      v4,
      v5,
      v6,
      v7,
      u + 2 * depth + width,
      v + depth,
      u + 2 * depth + 2 * width,
      v + depth + height,
    ),
  ];
}

function quadBounds(quads: readonly TexturedQuad[]): SceneBounds {
  const vertices = quads.flat();
  return {
    maxX: Math.max(...vertices.map((vertex): number => vertex.x)),
    maxY: Math.max(...vertices.map((vertex): number => vertex.y)),
    minX: Math.min(...vertices.map((vertex): number => vertex.x)),
    minY: Math.min(...vertices.map((vertex): number => vertex.y)),
  };
}

function unionBounds(first: SceneBounds, second: SceneBounds): SceneBounds {
  return {
    maxX: Math.max(first.maxX, second.maxX),
    maxY: Math.max(first.maxY, second.maxY),
    minX: Math.min(first.minX, second.minX),
    minY: Math.min(first.minY, second.minY),
  };
}

// Depth-buffered quad rasterizer. The painted figure acts as the body's back
// plane at the wing hinge depth, so wing corners vanilla tucks inside the
// torso stay hidden.
function paintDepthQuads(
  output: Uint8ClampedArray,
  outputSize: number,
  texture: TexturePixels,
  atlasScale: number,
  quads: readonly TexturedQuad[],
  transform: FlatTransform,
): void {
  const depth = new Float32Array(outputSize * outputSize);
  for (let index = 0; index < depth.length; index += 1) {
    depth[index] = (output[index * 4 + 3] ?? 0) === 0 ? Number.NEGATIVE_INFINITY : WING_HINGE.z;
  }
  const project = (vertex: TexturedVertex): TexturedVertex => ({
    ...vertex,
    x: transform.offsetX + vertex.x * transform.scale,
    y: transform.offsetY + vertex.y * transform.scale,
  });
  for (const quad of quads) {
    const projected = quad.map(project);
    const faceU = quad.map((vertex): number => vertex.u);
    const faceV = quad.map((vertex): number => vertex.v);
    const texelRect: TextureRect = {
      height: (Math.max(...faceV) - Math.min(...faceV)) * atlasScale,
      u: Math.min(...faceU) * atlasScale,
      v: Math.min(...faceV) * atlasScale,
      width: (Math.max(...faceU) - Math.min(...faceU)) * atlasScale,
    };
    for (const [a, b, c] of [
      [projected[0], projected[1], projected[2]],
      [projected[0], projected[2], projected[3]],
    ]) {
      if (a === undefined || b === undefined || c === undefined) {
        continue;
      }
      paintDepthTriangle(output, outputSize, depth, texture, atlasScale, texelRect, a, b, c);
    }
  }
}

function paintDepthTriangle(
  output: Uint8ClampedArray,
  outputSize: number,
  depth: Float32Array,
  texture: TexturePixels,
  atlasScale: number,
  texelRect: TextureRect,
  a: TexturedVertex,
  b: TexturedVertex,
  c: TexturedVertex,
): void {
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  // Edge-on faces of the orthographic projection cover no pixels.
  if (Math.abs(area) < 1e-9) {
    return;
  }
  const startX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const endX = Math.min(outputSize, Math.ceil(Math.max(a.x, b.x, c.x)));
  const startY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const endY = Math.min(outputSize, Math.ceil(Math.max(a.y, b.y, c.y)));
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const weightA = ((b.x - px) * (c.y - py) - (c.x - px) * (b.y - py)) / area;
      const weightB = ((c.x - px) * (a.y - py) - (a.x - px) * (c.y - py)) / area;
      const weightC = 1 - weightA - weightB;
      if (weightA < 0 || weightB < 0 || weightC < 0) {
        continue;
      }
      const z = weightA * a.z + weightB * b.z + weightC * c.z;
      const index = y * outputSize + x;
      if (z <= (depth[index] ?? Number.NEGATIVE_INFINITY)) {
        continue;
      }
      const u = (weightA * a.u + weightB * b.u + weightC * c.u) * atlasScale;
      const v = (weightA * a.v + weightB * b.v + weightC * c.v) * atlasScale;
      const texelX = Math.min(
        texelRect.u + texelRect.width - 1,
        Math.max(texelRect.u, Math.floor(u)),
      );
      const texelY = Math.min(
        texelRect.v + texelRect.height - 1,
        Math.max(texelRect.v, Math.floor(v)),
      );
      const sampled = readColor(texture, texelX, texelY);
      if (sampled.alpha < CUTOUT_ALPHA) {
        continue;
      }
      depth[index] = z;
      writeColor(output, index * 4, { ...sampled, alpha: 255 });
    }
  }
}

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

// Mojang cape atlases are 64x32; OptiFine crops the same layout to 46x22. Both
// repeat at integer scales for HD textures; other sizes carry no usable faces.
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

// A wing texture net without any cutout-visible texel paints no wings.
function wingAtlasScale(capeTexture: TexturePixels): number | undefined {
  const atlasScale = capeAtlasScale(capeTexture);
  if (atlasScale === undefined) {
    return undefined;
  }
  const { depth, height, u, v, width } = WING_CUBOID.texture;
  const net: TextureRect = {
    height: (depth + height) * atlasScale,
    u: u * atlasScale,
    v: v * atlasScale,
    width: (2 * depth + 2 * width) * atlasScale,
  };
  return hasVisiblePixels(capeTexture, net, CUTOUT_ALPHA) ? atlasScale : undefined;
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
  // Mirroring flips the cuboid's painted extent, not just its layout origin.
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
      // Back faces are pre-mirrored by the skin atlas layout, so both
      // projections sample unflipped.
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

function hasVisiblePixels(texture: TexturePixels, rect: TextureRect, minAlpha = 1): boolean {
  for (let y = rect.v; y < rect.v + rect.height; y += 1) {
    for (let x = rect.u; x < rect.u + rect.width; x += 1) {
      if (readColor(texture, x, y).alpha >= minAlpha) {
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
