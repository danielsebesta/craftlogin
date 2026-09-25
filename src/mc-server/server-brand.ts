import type { ServerClient } from 'minecraft-protocol';

import { getMinecraftData } from './minecraft-data.js';

const BRAND = 'CraftLogin';
const NAMESPACED_CHANNEL_MIN_PROTOCOL = 385;

/** Sends the server implementation name shown by vanilla in F3. */
export function sendServerBrand(client: ServerClient): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  // Plugin channels are namespaced since 1.13-pre3; the library installs the
  // channel API but sends no brand on its own.
  const channel =
    mcData.version.version >= NAMESPACED_CHANNEL_MIN_PROTOCOL ? 'minecraft:brand' : 'MC|Brand';
  client.registerChannel(channel, ['string', []]);
  client.writeChannel(channel, BRAND);
}
