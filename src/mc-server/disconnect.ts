import { createRequire } from 'node:module';

import minecraftProtocol, { type Client } from 'minecraft-protocol';

interface NbtBuilder {
  comp(value: { text: unknown }): unknown;
  string(value: string): unknown;
}

const require = createRequire(import.meta.url);
// The package's published declarations pull in malformed ProtoDef types, so validate its runtime
// surface instead of weakening type checking for the rest of the application.
const loadedNbt: unknown = require('prismarine-nbt');
if (!isNbtBuilder(loadedNbt)) {
  throw new Error('The Minecraft NBT serializer is unavailable');
}
const nbt = loadedNbt;
const disconnectingClients = new WeakSet<Client>();

export function disconnect(client: Client, message: string): void {
  if (client.ended || disconnectingClients.has(client)) {
    return;
  }
  disconnectingClients.add(client);

  if (client.state === minecraftProtocol.states.CONFIGURATION) {
    const reason = createConfigurationDisconnectReason(
      message,
      client._supportFeature('chatPacketsUseNbtComponents'),
    );
    client.write('disconnect', { reason });
    client.end();
    return;
  }

  client.end(message);
}

export function createConfigurationDisconnectReason(
  message: string,
  useNbtComponents: boolean,
): unknown {
  return useNbtComponents
    ? nbt.comp({ text: nbt.string(message) })
    : JSON.stringify({ text: message });
}

function isNbtBuilder(value: unknown): value is NbtBuilder {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'comp') === 'function' &&
    typeof Reflect.get(value, 'string') === 'function'
  );
}
