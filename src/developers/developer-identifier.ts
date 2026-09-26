import type { MinecraftPlayerLookup } from '../mojang/client.js';
import { canonicalMinecraftUuid } from '../mojang/uuid.js';

export async function resolveDeveloperIdentifier(
  identifier: string,
  players?: MinecraftPlayerLookup,
): Promise<string | undefined> {
  const trimmed = identifier.trim();
  const canonical = canonicalMinecraftUuid(trimmed);
  if (canonical !== undefined) {
    return canonical;
  }
  if (players === undefined || trimmed.length === 0) {
    return undefined;
  }
  const profile = await players.findProfileByName(trimmed).catch((): undefined => undefined);
  return profile?.uuid;
}

export interface OwnerProfile {
  readonly name: string;
  readonly uuid: string;
}

// The configured owner accepts either form; a name resolves through Mojang so
// the landing showcase shows the canonical casing. A failed lookup degrades to
// no owner rather than blocking startup on an upstream hiccup.
export async function resolveOwnerProfile(
  identifier: string | undefined,
  players: MinecraftPlayerLookup,
): Promise<OwnerProfile | undefined> {
  const trimmed = identifier?.trim() ?? '';
  if (trimmed.length === 0) {
    return undefined;
  }
  const canonical = canonicalMinecraftUuid(trimmed);
  if (canonical !== undefined) {
    const profile = await players.findProfileById(canonical).catch((): undefined => undefined);
    return { name: profile?.username ?? canonical, uuid: canonical };
  }
  const profile = await players.findProfileByName(trimmed).catch((): undefined => undefined);
  if (profile === undefined) {
    return undefined;
  }
  return { name: profile.username, uuid: profile.uuid };
}
