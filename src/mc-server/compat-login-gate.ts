import type { ServerClient } from 'minecraft-protocol';

type ClientWrite = (packetName: string, params: unknown) => void;

/**
 * Keeps a client without minecraft-data support in the login state: withholding
 * the success packet means no unencodable play packets, so the verification
 * result still arrives as a login-state disconnect the client renders.
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
