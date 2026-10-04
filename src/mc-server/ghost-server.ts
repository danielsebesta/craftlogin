import debug from 'debug';
import { readFile } from 'node:fs/promises';
import minecraftProtocol, {
  type Client,
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
import { installCompatLoginGate } from './compat-login-gate.js';
import { installConfigurationTags } from './configuration-tags.js';
import { disconnect, isLoggedIn, markLoggedIn, markWorldReady } from './disconnect.js';
import { extractVerificationCode, isLobbyHost } from './hostname.js';
import { getMinecraftData } from './minecraft-data.js';
import { MinecraftLobby, type LobbyCodeVerificationResult } from './lobby.js';
import { installVersionedRegistryCodec } from './registry-codec.js';
import { sendServerBrand } from './server-brand.js';
import { verificationSuccessMessage } from './verification-message.js';
import {
  presentVoidWorld,
  sendVoidMessage,
  supportsHexColors,
  WEB_ACCENT_COLOR,
  WEB_MUTED_COLOR,
} from './void-world.js';

// Shutdown must not stall on a client that never completes configuration; the reason is best effort.
const SHUTDOWN_WORLD_WAIT_TIMEOUT_MS = 1_500;
const MAX_PLAYERS = 10_000;
// minecraft-protocol never refuses a TCP connection itself, so these gates
// bound pre-login socket floods.
const MAX_CONNECTIONS = 10_000;
const MAX_CONNECTIONS_PER_ADDRESS = 64;
// New-connection pacing bound per address, independent of the concurrent cap:
// churning sockets would otherwise keep every slot below 64 while still
// forcing handshake parsing and Mojang session-auth lookups at full speed.
// Sized well above legitimate churn (players reconnect a handful of times)
// so a released slot always admits its replacement.
const CONNECTION_PACING_WINDOW_MS = 10_000;
const CONNECTION_PACING_MAX_PER_ADDRESS = 128;
const CONNECTION_PACING_MAP_MAX_ENTRIES = 100_000;
// Concurrent pending verifications per address — each one costs a Mojang
// session check plus a Redis code lookup, so they need a tighter bound than
// raw connections.
const MAX_PENDING_VERIFICATIONS_PER_ADDRESS = 8;
const CONNECTION_LIMIT_LOG_INTERVAL_MS = 10_000;
const LOBBY_MAX_PLAYERS = 64;
const LOBBY_LIFETIME_MS = 40 * 1000;
const LOBBY_PROMPT_COOLDOWN_MS = 3_000;

const loginHandshakeSchema = z.object({
  nextState: z.literal(2),
  serverHost: z.string(),
  protocolVersion: z.number(),
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
  /** True when the negotiated protocol has no minecraft-data support; the client stays in the login state. */
  readonly compat: boolean;
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
          tone: 'neutral',
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
    baseDomain: config.baseDomain,
    maxPlayers: LOBBY_MAX_PLAYERS,
    lifetimeMs: LOBBY_LIFETIME_MS,
    promptCooldownMs: LOBBY_PROMPT_COOLDOWN_MS,
    verifyCode: (client, code): Promise<LobbyCodeVerificationResult> =>
      resolveLobbyCode(client, code, dependencies),
  });
  const pendingClients = new WeakMap<ServerClient, PendingClient>();
  const options: ServerOptions = {
    host: config.host,
    port: config.port,
    version: false,
    // Newer-than-known protocols still get login-state serializers from the
    // newest known version, so they finish auth and get a login-state disconnect.
    fallbackVersion: minecraftProtocol.defaultVersion,
    'online-mode': true,
    hideErrors: true,
    keepAlive: true,
    // Without this, modern clients label the session unverified despite
    // successful online-mode auth.
    enforceSecureProfile: true,
    maxPlayers: MAX_PLAYERS,
    motd: english.minecraft.motd,
    motdMsg: {
      text: english.minecraft.motd,
      color: 'green',
      extra: [{ text: `\n${english.minecraft.motdDetail}`, color: 'gray' }],
    },
    ...(serverIcon === null ? {} : { favicon: serverIcon }),
    beforePing: createPingHook(serverIcon),
    errorHandler: (client, error): void => {
      dependencies.logger.warn(
        { errorKind: getErrorKind(error) },
        'Minecraft client connection failed',
      );
      // Error paths always carry the server-side client despite the bare Client typing.
      if (isServerClient(client)) {
        void disconnect(client, english.minecraft.temporaryFailure, { tone: 'error' });
      }
    },
  };
  const server = minecraftProtocol.createServer(options);

  let activeConnections = 0;
  const connectionsByAddress = new Map<string, number>();
  const connectionPacing = new Map<string, { attempts: number; resetAt: number }>();
  const pendingVerificationsByAddress = new Map<string, number>();
  let lastConnectionLimitLogAt = 0;

  const rejectConnection = (client: ServerClient): void => {
    client.socket.destroy();
    // Rejection floods must not become log floods; one line per interval is enough signal.
    const now = Date.now();
    if (now - lastConnectionLimitLogAt >= CONNECTION_LIMIT_LOG_INTERVAL_MS) {
      lastConnectionLimitLogAt = now;
      dependencies.logger.warn(
        { activeConnections },
        'Minecraft connection limit rejected a client',
      );
    }
  };

  server.on('connection', (client): void => {
    const address = client.socket.remoteAddress ?? '';
    const addressConnections = connectionsByAddress.get(address) ?? 0;
    const now = Date.now();
    let pacing = connectionPacing.get(address);
    if (pacing === undefined || now >= pacing.resetAt) {
      pacing = { attempts: 0, resetAt: now + CONNECTION_PACING_WINDOW_MS };
      if (connectionPacing.size >= CONNECTION_PACING_MAP_MAX_ENTRIES) {
        // Bound the map under a rotating-source flood: expired buckets are dead weight.
        for (const [key, entry] of connectionPacing) {
          if (now >= entry.resetAt) {
            connectionPacing.delete(key);
          }
        }
      }
      connectionPacing.set(address, pacing);
    }
    pacing.attempts += 1;
    if (
      pacing.attempts > CONNECTION_PACING_MAX_PER_ADDRESS ||
      activeConnections >= MAX_CONNECTIONS ||
      addressConnections >= MAX_CONNECTIONS_PER_ADDRESS
    ) {
      rejectConnection(client);
      return;
    }
    activeConnections += 1;
    connectionsByAddress.set(address, addressConnections + 1);
    client.once('end', (): void => {
      activeConnections -= 1;
      const remaining = (connectionsByAddress.get(address) ?? 1) - 1;
      if (remaining <= 0) {
        connectionsByAddress.delete(address);
      } else {
        connectionsByAddress.set(address, remaining);
      }
    });

    installVersionedRegistryCodec(client);
    installConfigurationTags(client);
    installCompatLoginGate(client, (): boolean => {
      const pending = pendingClients.get(client);
      return pending?.kind === 'verification' && pending.compat;
    });

    client.once('set_protocol', (packet: unknown): void => {
      const parsedHandshake = loginHandshakeSchema.safeParse(packet);

      if (!parsedHandshake.success) {
        return;
      }

      const { serverHost, protocolVersion } = parsedHandshake.data;

      // A newer-than-known client completes login but never enters the world,
      // so only a code subdomain can verify it.
      const protocolSupported = getMinecraftData(protocolVersion) !== null;
      if (!protocolSupported) {
        // The server host is never logged: for code subdomains it carries the verification code.
        dependencies.logger.info(
          { protocolVersion },
          'Minecraft client uses an unsupported version',
        );
      }

      const code = extractVerificationCode(serverHost, config.baseDomain);
      if (code !== null) {
        const pendingForAddress = pendingVerificationsByAddress.get(address) ?? 0;
        if (pendingForAddress >= MAX_PENDING_VERIFICATIONS_PER_ADDRESS) {
          client.socket.destroy();
          return;
        }
        pendingVerificationsByAddress.set(address, pendingForAddress + 1);
        client.once('end', (): void => {
          const remaining = (pendingVerificationsByAddress.get(address) ?? 1) - 1;
          if (remaining <= 0) {
            pendingVerificationsByAddress.delete(address);
          } else {
            pendingVerificationsByAddress.set(address, remaining);
          }
        });
        const availability = lookupCodeAvailability(code, dependencies);
        pendingClients.set(client, {
          kind: 'verification',
          code,
          availability,
          compat: !protocolSupported,
          outcome: null,
        });
        void availability.then((result): void => {
          // A logged-in client is rejected after its world is presented so the reason renders.
          if (isLoggedIn(client)) {
            return;
          }
          if (result === 'unavailable') {
            void disconnect(client, english.minecraft.unavailable, { tone: 'error' });
          } else if (result === 'error') {
            void disconnect(client, english.minecraft.temporaryFailure, { tone: 'error' });
          }
        });
        return;
      }

      if (!protocolSupported) {
        // The lobby needs play-state chat, which this client's protocol lacks.
        client.removeAllListeners('login_start');
        void disconnect(client, english.minecraft.unsupportedVersion, { tone: 'error' });
        return;
      }

      if (isLobbyHost(serverHost, config.baseDomain)) {
        pendingClients.set(client, { kind: 'lobby' });
        return;
      }

      void disconnect(client, english.minecraft.unavailable, { tone: 'error' });
    });
  });

  // 'login' fires only after online-mode auth populated the UUID; resolving
  // earlier would trust an unauthenticated profile.
  server.on('login', (client): void => {
    const pending = pendingClients.get(client);
    if (pending?.kind === 'verification') {
      pending.outcome = settleVerification(client, pending, dependencies);
      if (pending.compat) {
        // This client stays in the login state, so the outcome goes out as a
        // login-state disconnect rather than a play-state kick.
        void finalizeVerification(client, pending.outcome, dependencies.logger);
        return;
      }
    }

    // Login success is written, so the client is no longer addressable in login state.
    markLoggedIn(client);
  });

  // Play state exists here, so a later kick renders instead of dropping silently.
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
        { errorKind: getErrorKind(error) },
        'Minecraft void world could not be presented',
      );
    }
    markWorldReady(client);
    sendServerBrand(client);

    if (pending?.kind === 'lobby') {
      if (!lobby.enter(client)) {
        sendVoidMessage(client, english.minecraft.lobbyFull);
        void disconnect(client, english.minecraft.lobbyFull, { tone: 'error' });
      }
      return;
    }
    if (pending?.kind === 'verification' && pending.outcome !== null) {
      void finalizeVerification(client, pending.outcome, dependencies.logger);
      return;
    }

    void disconnect(client, english.minecraft.unavailable, { tone: 'error' });
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
    return { status: 'unavailable' };
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
    // Settle failures immediately so a fast rejection can't become unhandled
    // while playerJoin is still pending.
    return { kind: 'failure', errorKind: getErrorKind(error) };
  }
}

// Chat is only a transport for the code; identity always comes from the
// online-mode-authenticated connection.
async function resolveLobbyCode(
  client: ServerClient,
  code: string,
  dependencies: GhostServerDependencies,
): Promise<LobbyCodeVerificationResult> {
  const parsedPlayer = authenticatedMinecraftPlayerSchema.safeParse({
    uuid: client.uuid.toLowerCase(),
    username: client.username,
  });
  if (!parsedPlayer.success) {
    dependencies.logger.warn('Lobby chat verification found an invalid authenticated profile');
    return { status: 'error' };
  }
  try {
    const resolution = await dependencies.resolver.resolve(code, parsedPlayer.data, new Date());
    if (resolution.status === 'resolved') {
      dependencies.logger.info({ username: client.username }, 'Minecraft verification resolved');
      return { status: 'resolved', message: verificationSuccessMessage(resolution) };
    }
    return { status: 'unavailable' };
  } catch (error: unknown) {
    dependencies.logger.error({ errorKind: getErrorKind(error) }, 'Lobby chat verification failed');
    return { status: 'error' };
  }
}

async function finalizeVerification(
  client: ServerClient,
  outcome: Promise<VerificationOutcome>,
  logger: Logger,
): Promise<void> {
  const result = await outcome;
  const resolved = result.kind === 'resolution' && result.value.status === 'resolved';
  if (resolved) {
    logger.info({ username: client.username }, 'Minecraft verification resolved');
  }
  const message =
    result.kind === 'failure'
      ? english.minecraft.temporaryFailure
      : result.value.status === 'resolved'
        ? verificationSuccessMessage(result.value)
        : english.minecraft.unavailable;

  if (result.kind === 'failure') {
    logger.error({ errorKind: result.errorKind }, 'Authenticated Minecraft verification failed');
  }

  await disconnect(client, message, {
    tone: resolved ? 'success' : 'error',
  });
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

// The ping wants a data URI while the login exchange wants raw base64. Custom
// text lives in version.name (under the MOTD) and players.sample (hover
// tooltip); the online/max count itself has no text field.
const pingVersionSchema = z.looseObject({ name: z.string(), protocol: z.number() });
const pingPlayersSchema = z.looseObject({
  online: z.number(),
  max: z.number(),
  sample: z.array(z.unknown()).optional(),
});
const LIST_SAMPLE_ID = '00000000-0000-0000-0000-000000000000';

function createPingHook(
  iconBase64: string | null,
): (response: ServerPingResponse, client: Client) => ServerPingResponse {
  return (response: ServerPingResponse, client: Client): ServerPingResponse => {
    const mcData = getMinecraftData(client.protocolVersion);
    const hex = mcData !== null && supportsHexColors(mcData);
    const version = pingVersionSchema.safeParse(response['version']);
    const players = pingPlayersSchema.safeParse(response['players']);
    return {
      ...response,
      ...(iconBase64 === null ? {} : { favicon: `data:image/png;base64,${iconBase64}` }),
      // The protocol number must stay untouched: the client uses it for compatibility display.
      ...(version.success
        ? { version: { ...version.data, name: english.minecraft.listVersion } }
        : {}),
      // max reflects the 64-seat lobby capacity rather than the 10000 connection gate.
      ...(players.success
        ? {
            players: {
              ...players.data,
              max: LOBBY_MAX_PLAYERS,
              sample: english.minecraft.listHover.map((text) => ({
                name: text,
                id: LIST_SAMPLE_ID,
              })),
            },
          }
        : {}),
      // motdMsg stays in legacy colors for ancient clients; modern clients get
      // the exact website palette.
      ...(hex
        ? {
            description: {
              text: english.minecraft.motd,
              color: WEB_ACCENT_COLOR,
              extra: [{ text: `\n${english.minecraft.motdDetail}`, color: WEB_MUTED_COLOR }],
            },
          }
        : {}),
    };
  };
}

function isServerClient(client: Client): client is ServerClient {
  return 'id' in client;
}

async function loadServerIcon(logger: Logger): Promise<string | null> {
  try {
    return (await readFile(serverIconFileUrl)).toString('base64');
  } catch (error: unknown) {
    logger.warn({ errorKind: getErrorKind(error) }, 'Minecraft server icon could not be loaded');
    return null;
  }
}
