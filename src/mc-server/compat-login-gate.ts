import type { ServerClient } from 'minecraft-protocol';

type ClientWrite = (packetName: string, params: unknown) => void;

/**
 * Keeps a client whose protocol version has no minecraft-data support in the login state. With a
 * fallback version the login sequence (encryption, Mojang session authentication) still works,
 * but the login success packet would move the client into configuration and play, whose packets
 * cannot be encoded without version data. Withholding it lets the server resolve the verification
 * and deliver the result as a login-state disconnect, which the client still renders.
 */
export function installCompatLoginGate(client: ServerClient, isCompatClient: () => boolean): void {
  const writePacket: ClientWrite = client.write.bind(client);

  client.write = (packetName: string, params: unknown): void => {
    if (isCompatClient() && packetName === 'success') {
      return;
    }
    writePacket(packetName, params);
  };
}
