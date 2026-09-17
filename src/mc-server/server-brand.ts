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

  // Plugin channels became namespaced in 1.13-pre3. minecraft-protocol installs the channel API
  // during login but deliberately does not choose or send an application brand on its own.
  const channel =
    mcData.version.version >= NAMESPACED_CHANNEL_MIN_PROTOCOL ? 'minecraft:brand' : 'MC|Brand';
  client.registerChannel(channel, ['string', []]);
  client.writeChannel(channel, BRAND);
}
