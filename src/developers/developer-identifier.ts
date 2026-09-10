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
