import type { ServerClient } from 'minecraft-protocol';
import { z } from 'zod';

import { english } from '../locales/en.js';
import { disconnect } from './disconnect.js';
import { extractChatCode } from './chat-code.js';
import { sendVerifyCommand } from './verify-command.js';
import { getMinecraftData } from './minecraft-data.js';
import {
  createPositionPacket,
  pickWebColor,
  sendLimboEffects,
  sendVoidComponent,
  sendVoidTitle,
  WEB_ACCENT_COLOR,
  WEB_ACCENT_STRONG_COLOR,
  WEB_DANGER_COLOR,
  WEB_MUTED_COLOR,
  type MinecraftColor,
} from './void-world.js';

const chatMessageSchema = z.object({ message: z.string() });
const chatCommandSchema = z.object({ command: z.string() });

export type LobbyCodeVerificationResult = 'resolved' | 'unavailable' | 'error';

export type LobbyCodeVerification = (
  client: ServerClient,
  code: string,
) => Promise<LobbyCodeVerificationResult>;

export interface LobbyConfig {
  readonly baseDomain: string;
  readonly maxPlayers: number;
  readonly lifetimeMs: number;
  readonly promptCooldownMs: number;
  readonly verifyCode?: LobbyCodeVerification | undefined;
}

/**
 * Keeps verified Minecraft players in the void lobby and answers chat without exposing any
 * verification state. Every session is bounded by a lifetime timeout so a public endpoint cannot
 * accumulate idle connections.
 */
interface LobbyTimers {
  readonly lifetime: NodeJS.Timeout;
  readonly countdown: NodeJS.Timeout;
}

export class MinecraftLobby {
  private readonly timers = new Map<ServerClient, LobbyTimers>();
  private readonly lastPromptAt = new WeakMap<ServerClient, number>();

  public constructor(private readonly config: LobbyConfig) {}

  public get size(): number {
    return this.timers.size;
  }

  public enter(client: ServerClient): boolean {
    if (this.timers.size >= this.config.maxPlayers) {
      return false;
    }

    sendVoidComponent(client, {
      text: english.minecraft.lobbyWelcome,
      color: lobbyPalette(client).muted,
    });
    sendVoidTitle(client, english.minecraft.lobbyTitle, english.minecraft.lobbySubtitle);
    sendVerifyCommand(client);
    // Limbo chamber dressing: heavy, dark and foggy, with no HUD trace. One shot outlives the
    // lobby, and unknown effects are skipped per version (Darkness needs 1.19+).
    sendLimboEffects(client, client.id);

    const expiresAt = Date.now() + this.config.lifetimeMs;
    const updateCountdown = (): void => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1_000));
      const palette = lobbyPalette(client);
      sendVoidComponent(
        client,
        {
          text: english.minecraft.lobbyCountdownLabel,
          color: palette.muted,
          extra: [
            {
              text: `${String(seconds)}s`,
              color: getCountdownColor(palette, seconds),
              bold: true,
            },
          ],
        },
        true,
      );
    };
    updateCountdown();

    const onChat = (packet: unknown): void => {
      this.answerChat(client, packet);
    };
    client.on('chat', onChat);
    client.on('chat_message', onChat);
    // 1.19+ delivers slash commands through dedicated packets (with the slash stripped) instead
    // of plain chat; pre-1.19 clients keep sending them as chat text with the slash included.
    client.on('chat_command', onChat);
    client.on('chat_command_signed', onChat);

    const lifetime = setTimeout((): void => {
      void disconnect(client, english.minecraft.lobbyTimeout, { tone: 'neutral' });
    }, this.config.lifetimeMs);
    const countdown = setInterval(updateCountdown, 1_000);
    this.timers.set(client, { lifetime, countdown });
    // Vanilla has no camera-lock packet, so a reported look change is answered with the spawn
    // teleport carrying fixed yaw/pitch. Correcting only on look packets instead of a blind timer
    // keeps the connection quiet while the mouse is still and avoids teleport artifacts.
    // 'look'/'position_look' carry rotation on every supported version; if a future version
    // renames them, the listener simply never fires and the view stays free.
    let teleportId = 2;
    const correctOrientation = (): void => {
      const mcData = getMinecraftData(client.version);
      if (mcData === null) {
        return;
      }
      const teleport = createPositionPacket(mcData);
      if ('teleportId' in teleport) {
        teleport['teleportId'] = teleportId;
        teleportId += 1;
      }
      client.write('position', teleport);
    };
    client.on('look', correctOrientation);
    client.on('position_look', correctOrientation);
    client.once('end', (): void => {
      this.leave(client);
    });
    return true;
  }

  public leave(client: ServerClient): void {
    const timers = this.timers.get(client);
    if (timers === undefined) {
      return;
    }
    clearTimeout(timers.lifetime);
    clearInterval(timers.countdown);
    this.timers.delete(client);
  }

  private answerChat(client: ServerClient, packet: unknown): void {
    const text = extractChatText(packet);
    if (text === null) {
      return;
    }

    const now = Date.now();
    const lastPromptAt = this.lastPromptAt.get(client) ?? 0;
    // The shared cooldown also throttles code attempts: at most one verification claim every
    // few seconds, which keeps the 31^8 code space out of reach of chat brute force.
    if (now - lastPromptAt < this.config.promptCooldownMs) {
      return;
    }

    this.lastPromptAt.set(client, now);
    if (this.config.verifyCode !== undefined) {
      const code = extractChatCode(text, this.config.baseDomain);
      if (code !== null) {
        void this.verifyChatCode(client, code);
        return;
      }
    }
    sendVoidComponent(client, {
      text: english.minecraft.lobbyHint,
      color: lobbyPalette(client).muted,
    });
  }

  private async verifyChatCode(client: ServerClient, code: string): Promise<void> {
    if (this.config.verifyCode === undefined) {
      return;
    }
    let result: LobbyCodeVerificationResult;
    try {
      result = await this.config.verifyCode(client, code);
    } catch {
      result = 'error';
    }
    if (result === 'resolved') {
      this.leave(client);
      await disconnect(client, english.minecraft.success, { tone: 'success' });
      return;
    }
    sendVoidComponent(client, {
      text:
        result === 'error'
          ? english.minecraft.temporaryFailure
          : english.minecraft.lobbyInvalidCode,
      color: lobbyPalette(client).muted,
    });
  }
}

function extractChatText(packet: unknown): string | null {
  const asMessage = chatMessageSchema.safeParse(packet);
  if (asMessage.success) {
    return asMessage.data.message;
  }
  const asCommand = chatCommandSchema.safeParse(packet);
  if (asCommand.success) {
    return asCommand.data.command;
  }
  return null;
}

interface LobbyPalette {
  readonly accent: MinecraftColor;
  readonly accentStrong: MinecraftColor;
  readonly muted: MinecraftColor;
  readonly danger: MinecraftColor;
}

// Website roles applied to chat: gray body text, lime highlights, coral urgency. Pre-1.16 clients
// receive the closest legacy names.
function lobbyPalette(client: ServerClient): LobbyPalette {
  const mcData = getMinecraftData(client.version);
  return {
    accent: pickWebColor(mcData, WEB_ACCENT_COLOR, 'green'),
    accentStrong: pickWebColor(mcData, WEB_ACCENT_STRONG_COLOR, 'green'),
    muted: pickWebColor(mcData, WEB_MUTED_COLOR, 'gray'),
    danger: pickWebColor(mcData, WEB_DANGER_COLOR, 'red'),
  };
}

function getCountdownColor(palette: LobbyPalette, seconds: number): MinecraftColor {
  if (seconds <= 5) {
    return palette.danger;
  }
  if (seconds <= 10) {
    return palette.accentStrong;
  }
  return palette.accent;
}
