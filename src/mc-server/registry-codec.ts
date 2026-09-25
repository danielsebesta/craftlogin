import type { ServerClient } from 'minecraft-protocol';

import { getMinecraftData } from './minecraft-data.js';

type ClientWrite = (packetName: string, params: unknown) => void;

/**
 * Replaces the process-wide default registry codec with this connection's
 * negotiated version; with `version: false` the library otherwise sends the
 * newest codec to every client, which vanilla rejects.
 */
export function installVersionedRegistryCodec(client: ServerClient): void {
  const writePacket: ClientWrite = client.write.bind(client);
  let registryCodecWritten = false;

  client.write = (packetName: string, params: unknown): void => {
    if (packetName !== 'registry_data') {
      writePacket(packetName, params);
      return;
    }

    // The library writes the default registry once per entry; replace the first
    // write with the negotiated codec and suppress the rest.
    if (registryCodecWritten) {
      return;
    }
    registryCodecWritten = true;

    const minecraftData = getMinecraftData(client.version);
    const registryCodec = minecraftData?.loginPacket?.['dimensionCodec'];
    if (registryCodec === undefined) {
      throw new Error(`Registry codec data is unavailable for Minecraft ${client.version}`);
    }

    if (client._supportFeature('segmentedRegistryCodecData')) {
      if (!isRecord(registryCodec)) {
        throw new Error(`Segmented registry codec data is invalid for Minecraft ${client.version}`);
      }
      for (const registry of Object.values(registryCodec)) {
        writePacket('registry_data', registry);
      }
      return;
    }

    writePacket('registry_data', { codec: registryCodec });
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
