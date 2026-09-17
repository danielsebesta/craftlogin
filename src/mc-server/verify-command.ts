import type { ServerClient } from 'minecraft-protocol';

import { getMinecraftData, hasPacket, type MinecraftData } from './minecraft-data.js';

export interface DeclareCommandsPacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

// Brigadier node flags: the node type in the low two bits (0 root, 1 literal, 2 argument) plus
// the executable bit. Both the bare literal and its argument are executable so the client treats
// even a bare /verify as sendable; the lobby answers it with usage help. The 26.1
// allows_restricted bit stays cleared so every player may run the command.
const ROOT_NODE_FLAGS = 0;
const LITERAL_NODE_FLAGS = 0x05;
const ARGUMENT_NODE_FLAGS = 0x06;

/**
 * Declares `/verify <code>` so 1.13+ clients offer tab-completion and do not underline the
 * command as unknown. The single-word string argument matches verification codes and pasted
 * subdomains, neither of which contains whitespace.
 */
export function createVerifyCommandPacket(mcData: MinecraftData): DeclareCommandsPacket | null {
  // Pre-1.13 clients have no client-side command validation at all; they deliver /verify as
  // plain chat text, which the lobby already parses.
  if (!hasPacket(mcData, 'packet_declare_commands')) {
    return null;
  }
  return {
    name: 'declare_commands',
    params: {
      nodes: [
        { flags: ROOT_NODE_FLAGS, children: [1] },
        { flags: LITERAL_NODE_FLAGS, children: [2], extraNodeData: { name: 'verify' } },
        {
          flags: ARGUMENT_NODE_FLAGS,
          children: [],
          extraNodeData: { name: 'code', parser: 'brigadier:string', properties: 'SINGLE_WORD' },
        },
      ],
      rootIndex: 0,
    },
  };
}

export function sendVerifyCommand(client: ServerClient): void {
  const mcData = getMinecraftData(client.version);
  if (mcData === null) {
    return;
  }

  const packet = createVerifyCommandPacket(mcData);
  if (packet === null) {
    return;
  }
  client.write(packet.name, packet.params);
}
