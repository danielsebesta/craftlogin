export type AvatarLayers = 'all' | 'base';
export type AvatarSize = 32 | 64 | 128 | 256;
export type AvatarView = 'body' | 'bust' | 'head';
export type MinecraftSkinModel = 'classic' | 'slim';

export const AVATAR_SIZES: readonly AvatarSize[] = [32, 64, 128, 256];

export interface AvatarRenderOptions {
  readonly layers: AvatarLayers;
  readonly size: AvatarSize;
  readonly view: AvatarView;
}
