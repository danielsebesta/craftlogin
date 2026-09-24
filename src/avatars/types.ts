export type AvatarLayers = 'all' | 'base';
export type AvatarSize = 32 | 64 | 128 | 256;
export type AvatarView = 'back' | 'body' | 'bust' | 'duo' | 'face' | 'side' | 'wings';
export type MinecraftSkinModel = 'classic' | 'slim';

export type SpecificCapeProvider =
  '5zig' | 'labymod' | 'minecraftcapes' | 'mojang' | 'optifine' | 'skinmc';
export type CapeProvider = SpecificCapeProvider | 'any';

export const SPECIFIC_CAPE_PROVIDERS: readonly SpecificCapeProvider[] = [
  'mojang',
  'optifine',
  'labymod',
  'minecraftcapes',
  '5zig',
  'skinmc',
];

export const CAPE_PROVIDERS: readonly CapeProvider[] = [
  '5zig',
  'any',
  'labymod',
  'minecraftcapes',
  'mojang',
  'optifine',
  'skinmc',
];

export const AVATAR_SIZES: readonly AvatarSize[] = [32, 64, 128, 256];

export interface AvatarRenderOptions {
  readonly layers: AvatarLayers;
  readonly size: AvatarSize;
  readonly view: AvatarView;
  // Cape-bearing views (back, duo, wings) resolve the worn cape through this
  // provider; 'any' walks the provider chain in order like the cape endpoint.
  readonly capeProvider?: CapeProvider;
  // Texture-hash subjects carry no Mojang model metadata, so this hint picks
  // the arm width; player subjects always use their signed profile model.
  readonly model?: MinecraftSkinModel;
}
