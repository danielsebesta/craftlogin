import { canonicalMinecraftUuid } from '../mojang/uuid.js';

export type AvatarSubject =
  | { readonly kind: 'name'; readonly username: string }
  | { readonly kind: 'texture'; readonly hash: string }
  | { readonly kind: 'uuid'; readonly uuid: string };

const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/u;
const TEXTURE_HASH_PATTERN = /^[0-9a-fA-F]{64}$/u;

export function parseAvatarSubject(value: string): AvatarSubject | undefined {
  const uuid = canonicalMinecraftUuid(value);
  if (uuid !== undefined) {
    return { kind: 'uuid', uuid };
  }
  const trimmed = value.trim();
  if (TEXTURE_HASH_PATTERN.test(trimmed)) {
    return { hash: trimmed.toLowerCase(), kind: 'texture' };
  }
  if (PLAYER_NAME_PATTERN.test(trimmed)) {
    return { kind: 'name', username: trimmed };
  }
  return undefined;
}
