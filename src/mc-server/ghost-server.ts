import debug from 'debug';
import { readFile } from 'node:fs/promises';
import minecraftProtocol, {
  type Server,
  type ServerClient,
  type ServerOptions,
} from 'minecraft-protocol';
import type { Logger } from 'pino';
import { z } from 'zod';

import { english } from '../locales/en.js';
import { getErrorKind } from '../logging/error-kind.js';
import type { RedisVerificationStore } from '../verification/redis-verification-store.js';
import {
  authenticatedMinecraftPlayerSchema,
  type AuthenticatedMinecraftPlayer,
} from '../verification/types.js';
import type {
  VerificationResolution,
  VerificationResolver,
} from '../verification/verification-resolver.js';
import { disconnect, isLoggedIn, markLoggedIn, markWorldReady } from './disconnect.js';
import { extractVerificationCode, isLobbyHost } from './hostname.js';
import { MinecraftLobby } from './lobby.js';
import { getProtocolErrorDetails, installProtocolTrace } from './protocol-trace.js';
import { installVersionedRegistryCodec } from './registry-codec.js';
import { presentVoidWorld, sendVoidMessage } from './void-world.js';

// Shutdown must not stall on a client that never completes configuration; the reason is best effort.
const SHUTDOWN_WORLD_WAIT_TIMEOUT_MS = 1_500;
const MAX_PLAYERS = 10_000;
const LOBBY_MAX_PLAYERS = 64;
const LOBBY_LIFETIME_MS = 10 * 60 * 1000;
const LOBBY_PROMPT_COOLDOWN_MS = 3_000;

const loginHandshakeSchema = z.object({
  nextState: z.literal(2),
  serverHost: z.string(),
});

const serverIconFileUrl = new URL('../../public/server-icon.png', import.meta.url);

interface ServerPingResponse {
  readonly favicon?: string;
  readonly [key: string]: unknown;
}

type CodeAvailability = 'available' | 'error' | 'unavailable';

type VerificationOutcome =
  | { readonly kind: 'resolution'; readonly value: VerificationResolution }
  | { readonly kind: 'failure'; readonly errorKind: string };

interface PendingVerification {
  readonly kind: 'verification';
  readonly code: string;
  readonly availability: Promise<CodeAvailability>;
  outcome: Promise<VerificationOutcome> | null;
}

interface PendingLobby {
  readonly kind: 'lobby';
}

type PendingClient = PendingVerification | PendingLobby;

export interface GhostServerConfig {
  readonly baseDomain: string;
  readonly host: string;
  readonly port: number;
  readonly protocolTrace: boolean;
}

interface PendingCodeLookup {
  hasPendingCode(code: string): Promise<boolean>;
}

interface ResolutionService {
  resolve(
    code: string,
    player: AuthenticatedMinecraftPlayer,
    verifiedAt: Date,
  ): Promise<VerificationResolution>;
}

export interface GhostServerDependencies {
  readonly logger: Logger;
  readonly pendingCodes: Pick<RedisVerificationStore, 'hasPendingCode'> | PendingCodeLookup;
  readonly resolver: Pick<VerificationResolver, 'resolve'> | ResolutionService;
}

export class GhostServerStartError extends Error {
  public override readonly name = 'GhostServerStartError';
}

export class MinecraftGhostServer {
  private closed = false;

  public constructor(
    private readonly server: Server,
    private readonly lobby: MinecraftLobby,
  ) {}

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const client of Object.values(this.server.clients)) {
      this.lobby.leave(client);
    }

    await Promise.all(
      Object.values(this.server.clients).map((client) =>
        disconnect(client, english.minecraft.shutdown, {
          worldWaitTimeoutMs: SHUTDOWN_WORLD_WAIT_TIMEOUT_MS,
        }),
      ),
    );

    await new Promise<void>((resolve): void => {
      this.server.once('close', resolve);
      this.server.close();
    });
  }
}

export async function startGhostServer(
  config: GhostServerConfig,
  dependencies: GhostServerDependencies,
): Promise<MinecraftGhostServer> {
  // minecraft-protocol's debug output serializes handshake packets, which contain verification codes.
  debug.disable();

  const serverIcon = await loadServerIcon(dependencies.logger);
  const lobby = new MinecraftLobby({
    maxPlayers: LOBBY_MAX_PLAYERS,
    lifetimeMs: LOBBY_LIFETIME_MS,
    promptCooldownMs: LOBBY_PROMPT_COOLDOWN_MS,
  });
  const pendingClients = new WeakMap<ServerClient, PendingClient>();
  const options: ServerOptions = {
    host: config.host,
    port: config.port,
    version: false,
    'online-mode': true,
    hideErrors: true,
    keepAlive: true,
    maxPlayers: MAX_PLAYERS,
    motd: english.minecraft.motd,
    motdMsg: {
      text: english.minecraft.motd,
      color: 'green',
      extra: [{ text: `\n${english.minecraft.motdDetail}`, color: 'gray' }],
    },
    ...(serverIcon === null
      ? {}
      : { favicon: serverIcon, beforePing: createPingIconHook(serverIcon) }),
    errorHandler: (client, error): void => {
      dependencies.logger.warn(
        {
          errorKind: getErrorKind(error),
          ...(config.protocolTrace ? getProtocolErrorDetails(error) : {}),
        },
        'Minecraft client connection failed',
      );
      void disconnect(client, english.minecraft.temporaryFailure);
    },
  };
  const server = minecraftProtocol.createServer(options);

  server.on('connection', (client): void => {
    if (config.protocolTrace) {
      installProtocolTrace(client, dependencies.logger);
    }
    // Install after tracing so only the version-correct replacement packets appear in diagnostics.
    installVersionedRegistryCodec(client);

    client.once('set_protocol', (packet: unknown): void => {
      const parsedHandshake = loginHandshakeSchema.safeParse(packet);

      if (!parsedHandshake.success) {
        return;
      }

      const { serverHost } = parsedHandshake.data;
      const code = extractVerificationCode(serverHost, config.baseDomain);
      if (code !== null) {
        const availability = lookupCodeAvailability(code, dependencies);
        pendingClients.set(client, { kind: 'verification', code, availability, outcome: null });
        void availability.then((result): void => {
          // A logged-in client is rejected after its world is presented so the reason renders.
          if (isLoggedIn(client)) {
            return;
          }
          if (result === 'unavailable') {
            void disconnect(client, english.minecraft.unavailable);
          } else if (result === 'error') {
            void disconnect(client, english.minecraft.temporaryFailure);
          }
        });
        return;
      }

      if (isLobbyHost(serverHost, config.baseDomain)) {
        pendingClients.set(client, { kind: 'lobby' });
        return;
      }

      void disconnect(client, english.minecraft.unavailable);
    });
  });

  // minecraft-protocol emits login only after online-mode session authentication populated the
  // UUID and username. Resolving earlier would treat an unauthenticated profile as verified.
  server.on('login', (client): void => {
    // Login success has been written, so the client is no longer addressable in the login state.
    markLoggedIn(client);

    const pending = pendingClients.get(client);
    if (pending?.kind === 'verification') {
      pending.outcome = settleVerification(client, pending, dependencies);
    }
  });

  // The play state exists here, so the Join Game packet can be written and a later kick is rendered.
  server.on('playerJoin', (client): void => {
    const pending = pendingClients.get(client);
    try {
      presentVoidWorld(client, {
        entityId: client.id,
        maxPlayers: MAX_PLAYERS,
        sendChunks: pending?.kind === 'lobby',
      });
    } catch (error: unknown) {
      dependencies.logger.warn(
        {
          errorKind: getErrorKind(error),
          ...(config.protocolTrace ? getProtocolErrorDetails(error) : {}),
        },
        'Minecraft void world could not be presented',
      );
    }
    markWorldReady(client);

    if (pending?.kind === 'lobby') {
      if (!lobby.enter(client)) {
        sendVoidMessage(client, english.minecraft.lobbyFull);
        void disconnect(client, english.minecraft.lobbyFull);
      }
      return;
    }
    if (pending?.kind === 'verification' && pending.outcome !== null) {
      void finalizeVerification(client, pending.outcome, dependencies.logger);
      return;
    }

    void disconnect(client, english.minecraft.unavailable);
  });

  let listening = false;
  return await new Promise<MinecraftGhostServer>((resolve, reject): void => {
    server.on('error', (error): void => {
      if (!listening) {
        reject(new GhostServerStartError('The Minecraft server could not start', { cause: error }));
        return;
      }

      dependencies.logger.error(
        { errorKind: getErrorKind(error) },
        'Minecraft server listener failed',
      );
    });
    server.once('listening', (): void => {
      listening = true;
      resolve(new MinecraftGhostServer(server, lobby));
    });
  });
}

async function resolveVerification(
  client: ServerClient,
  pending: PendingVerification,
  dependencies: GhostServerDependencies,
): Promise<VerificationResolution> {
  const availability = await pending.availability;
  if (availability !== 'available') {
    return 'unavailable';
  }

  const parsedPlayer = authenticatedMinecraftPlayerSchema.safeParse({
    uuid: client.uuid.toLowerCase(),
    username: client.username,
  });
  if (!parsedPlayer.success) {
    throw new Error('Authenticated Minecraft profile has an invalid shape');
  }

  return await dependencies.resolver.resolve(pending.code, parsedPlayer.data, new Date());
}

async function settleVerification(
  client: ServerClient,
  pending: PendingVerification,
  dependencies: GhostServerDependencies,
): Promise<VerificationOutcome> {
  try {
    return {
      kind: 'resolution',
      value: await resolveVerification(client, pending, dependencies),
    };
  } catch (error: unknown) {
    // The resolver starts before modern clients finish configuration. Settle failures immediately
    // so a fast persistence rejection cannot become unhandled while playerJoin is still pending.
    return { kind: 'failure', errorKind: getErrorKind(error) };
  }
}

async function finalizeVerification(
  client: ServerClient,
  outcome: Promise<VerificationOutcome>,
  logger: Logger,
): Promise<void> {
  const result = await outcome;
  const message =
    result.kind === 'failure'
      ? english.minecraft.temporaryFailure
      : result.value === 'resolved'
        ? english.minecraft.success
        : english.minecraft.unavailable;

  if (result.kind === 'failure') {
    logger.error({ errorKind: result.errorKind }, 'Authenticated Minecraft verification failed');
  }

  await disconnect(client, message);
}

async function lookupCodeAvailability(
  code: string,
  dependencies: GhostServerDependencies,
): Promise<CodeAvailability> {
  try {
    return (await dependencies.pendingCodes.hasPendingCode(code)) ? 'available' : 'unavailable';
  } catch (error: unknown) {
    dependencies.logger.error(
      { errorKind: getErrorKind(error) },
      'Minecraft verification lookup failed',
    );
    return 'error';
  }
}

// The status ping expects a data URI, while the login exchange decodes raw base64. Keep the option
// as raw base64 and enrich the ping response so both paths receive the format they expect.
function createPingIconHook(
  iconBase64: string,
): (response: ServerPingResponse) => ServerPingResponse {
  return (response: ServerPingResponse): ServerPingResponse => ({
    ...response,
    favicon: `data:image/png;base64,${iconBase64}`,
  });
}

async function loadServerIcon(logger: Logger): Promise<string | null> {
  try {
    return (await readFile(serverIconFileUrl)).toString('base64');
  } catch (error: unknown) {
    logger.warn({ errorKind: getErrorKind(error) }, 'Minecraft server icon could not be loaded');
    return null;
  }
}
