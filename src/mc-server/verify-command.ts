import type { ServerClient } from 'minecraft-protocol';

import { getMinecraftData, hasPacket, type MinecraftData } from './minecraft-data.js';

export interface DeclareCommandsPacket {
  readonly name: string;
  readonly params: Record<string, unknown>;
}

// Brigadier flags: node type in the low two bits plus the executable bit. Both
// literal and argument are executable so even a bare /verify is sendable.
const ROOT_NODE_FLAGS = 0;
const LITERAL_NODE_FLAGS = 0x05;
const ARGUMENT_NODE_FLAGS = 0x06;

/** Declares `/verify <code>` so 1.13+ clients offer tab-completion; SINGLE_WORD matches codes and pasted subdomains. */
export function createVerifyCommandPacket(mcData: MinecraftData): DeclareCommandsPacket | null {
  // Pre-1.13 clients send /verify as plain chat, which the lobby already parses.
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
