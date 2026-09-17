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
import { installConfigurationTags } from './configuration-tags.js';
import { disconnect, isLoggedIn, markLoggedIn, markWorldReady } from './disconnect.js';
import { extractVerificationCode, isLobbyHost } from './hostname.js';
import { getMinecraftData } from './minecraft-data.js';
import { MinecraftLobby, type LobbyCodeVerificationResult } from './lobby.js';
import { installVersionedRegistryCodec } from './registry-codec.js';
import { sendServerBrand } from './server-brand.js';
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
    'online-mode': true,
    hideErrors: true,
    keepAlive: true,
    // Modern vanilla clients otherwise label the session as unverified even though online-mode
    // authentication succeeded. The library validates Mojang's signed profile key during login.
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
      // The library types this as a bare Client, but error paths always carry the server-side
      // client object; without it there is nothing to disconnect.
      if (isServerClient(client)) {
        void disconnect(client, english.minecraft.temporaryFailure, { tone: 'error' });
      }
    },
  };
  const server = minecraftProtocol.createServer(options);

  server.on('connection', (client): void => {
    installVersionedRegistryCodec(client);
    installConfigurationTags(client);

    client.once('set_protocol', (packet: unknown): void => {
      const parsedHandshake = loginHandshakeSchema.safeParse(packet);

      if (!parsedHandshake.success) {
        return;
      }

      const { serverHost, protocolVersion } = parsedHandshake.data;

      // minecraft-data only knows a fixed protocol range (currently up to 26.1). A newer client
      // would otherwise receive a login success encoded with an older protocol and fail with a
      // generic DecoderException. Stop before the library writes it and explain what to do.
      if (getMinecraftData(protocolVersion) === null) {
        // The server host is never logged: for code subdomains it carries the verification code.
        dependencies.logger.info(
          { protocolVersion },
          'Minecraft client uses an unsupported version',
        );
        client.removeAllListeners('login_start');
        void disconnect(client, english.minecraft.unsupportedVersion, { tone: 'error' });
        return;
      }

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
            void disconnect(client, english.minecraft.unavailable, { tone: 'error' });
          } else if (result === 'error') {
            void disconnect(client, english.minecraft.temporaryFailure, { tone: 'error' });
          }
        });
        return;
      }

      if (isLobbyHost(serverHost, config.baseDomain)) {
        pendingClients.set(client, { kind: 'lobby' });
        return;
      }

      void disconnect(client, english.minecraft.unavailable, { tone: 'error' });
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

// A code typed into lobby chat runs the same atomic claim as the subdomain handshake. The
// identity still comes from the online-mode-authenticated connection, so chat is only a
// transport for the code, never a source of identity.
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
    return 'error';
  }
  try {
    const resolution = await dependencies.resolver.resolve(code, parsedPlayer.data, new Date());
    if (resolution === 'resolved') {
      dependencies.logger.info({ username: client.username }, 'Minecraft verification resolved');
    }
    return resolution;
  } catch (error: unknown) {
    dependencies.logger.error({ errorKind: getErrorKind(error) }, 'Lobby chat verification failed');
    return 'error';
  }
}

async function finalizeVerification(
  client: ServerClient,
  outcome: Promise<VerificationOutcome>,
  logger: Logger,
): Promise<void> {
  const result = await outcome;
  if (result.kind === 'resolution' && result.value === 'resolved') {
    logger.info({ username: client.username }, 'Minecraft verification resolved');
  }
  const message =
    result.kind === 'failure'
      ? english.minecraft.temporaryFailure
      : result.value === 'resolved'
        ? english.minecraft.success
        : english.minecraft.unavailable;

  if (result.kind === 'failure') {
    logger.error({ errorKind: result.errorKind }, 'Authenticated Minecraft verification failed');
  }

  await disconnect(client, message, {
    tone: result.kind === 'resolution' && result.value === 'resolved' ? 'success' : 'error',
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

// The status ping expects a data URI, while the login exchange decodes raw base64. Keep the option
// as raw base64 and enrich the ping response so both paths receive the format they expect.
// version.name renders as small gray text under the MOTD and players.sample as the hover tooltip
// over the player count. The count slot itself is client-rendered "online/max" numbers with no
// text field, so custom text lives in those two places instead.
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
      // The static motdMsg stays in legacy colors as the fallback for ancient clients; modern
      // clients receive the exact website palette instead.
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
