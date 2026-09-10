import type { ServerClient } from 'minecraft-protocol';
import { z } from 'zod';

import { english } from '../locales/en.js';
import { disconnect } from './disconnect.js';
import { sendVoidMessage } from './void-world.js';

const chatMessageSchema = z.object({ message: z.string() });

export interface LobbyConfig {
  /** Maximum number of simultaneous lobby players. */
  readonly maxPlayers: number;
  /** Hard lifetime of a lobby session; the connection is closed afterwards. */
  readonly lifetimeMs: number;
  /** Minimum delay between automatic replies to player chat. */
  readonly promptCooldownMs: number;
}

/**
 * Keeps verified Minecraft players in the void lobby and answers chat without exposing any
 * verification state. Every session is bounded by a lifetime timeout so a public endpoint cannot
 * accumulate idle connections.
 */
export class MinecraftLobby {
  private readonly timers = new Map<ServerClient, NodeJS.Timeout>();
  private readonly lastPromptAt = new WeakMap<ServerClient, number>();

  public constructor(private readonly config: LobbyConfig) {}

  public get size(): number {
    return this.timers.size;
  }

  public enter(client: ServerClient): boolean {
    if (this.timers.size >= this.config.maxPlayers) {
      return false;
    }

    sendVoidMessage(client, english.minecraft.lobbyWelcome);

    const onChat = (packet: unknown): void => {
      this.answerChat(client, packet);
    };
    client.on('chat', onChat);
    client.on('chat_message', onChat);

    const timer = setTimeout((): void => {
      void disconnect(client, english.minecraft.lobbyTimeout);
    }, this.config.lifetimeMs);
    this.timers.set(client, timer);
    client.once('end', (): void => {
      this.leave(client);
    });
    return true;
  }

  public leave(client: ServerClient): void {
    const timer = this.timers.get(client);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    this.timers.delete(client);
  }

  private answerChat(client: ServerClient, packet: unknown): void {
    if (!chatMessageSchema.safeParse(packet).success) {
      return;
    }

    const now = Date.now();
    const lastPromptAt = this.lastPromptAt.get(client) ?? 0;
    if (now - lastPromptAt < this.config.promptCooldownMs) {
      return;
    }

    this.lastPromptAt.set(client, now);
    sendVoidMessage(client, english.minecraft.lobbyHint);
  }
}
