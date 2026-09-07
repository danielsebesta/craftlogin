import debug from 'debug';
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
import { disconnect } from './disconnect.js';
import { extractVerificationCode } from './hostname.js';

const loginHandshakeSchema = z.object({
  nextState: z.literal(2),
  serverHost: z.string(),
});

type CodeAvailability = 'available' | 'error' | 'unavailable';

interface PendingClientVerification {
  readonly availability: Promise<CodeAvailability>;
  readonly code: string;
}

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

  public constructor(private readonly server: Server) {}

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    for (const client of Object.values(this.server.clients)) {
      disconnect(client, english.minecraft.shutdown);
    }

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

  const pendingClients = new WeakMap<ServerClient, PendingClientVerification>();
  const options: ServerOptions = {
    host: config.host,
    port: config.port,
    version: false,
    'online-mode': true,
    hideErrors: true,
    keepAlive: false,
    maxPlayers: 10_000,
    motd: english.minecraft.motd,
    errorHandler: (client, error): void => {
      dependencies.logger.warn(
        { errorKind: getErrorKind(error) },
        'Minecraft client connection failed',
      );
      disconnect(client, english.minecraft.temporaryFailure);
    },
  };
  const server = minecraftProtocol.createServer(options);

  server.on('connection', (client): void => {
    client.once('set_protocol', (packet: unknown): void => {
      const parsedHandshake = loginHandshakeSchema.safeParse(packet);

      if (!parsedHandshake.success) {
        return;
      }

      const code = extractVerificationCode(parsedHandshake.data.serverHost, config.baseDomain);
      if (code === null) {
        disconnect(client, english.minecraft.unavailable);
        return;
      }

      const availability = lookupCodeAvailability(code, dependencies);
      pendingClients.set(client, { availability, code });
      void availability.then((result): void => {
        if (result === 'unavailable') {
          disconnect(client, english.minecraft.unavailable);
        } else if (result === 'error') {
          disconnect(client, english.minecraft.temporaryFailure);
        }
      });
    });
  });

  // minecraft-protocol emits login only after online-mode session authentication populated the
  // UUID and username. Resolving earlier would treat an unauthenticated profile as verified.
  server.on('login', (client): void => {
    void handleAuthenticatedLogin(client, pendingClients, dependencies).catch(
      (error: unknown): void => {
        dependencies.logger.error(
          { errorKind: getErrorKind(error) },
          'Authenticated Minecraft verification failed',
        );
        disconnect(client, english.minecraft.temporaryFailure);
      },
    );
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
      resolve(new MinecraftGhostServer(server));
    });
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

async function handleAuthenticatedLogin(
  client: ServerClient,
  pendingClients: WeakMap<ServerClient, PendingClientVerification>,
  dependencies: GhostServerDependencies,
): Promise<void> {
  const pending = pendingClients.get(client);
  if (pending === undefined) {
    disconnect(client, english.minecraft.unavailable);
    return;
  }

  const availability = await pending.availability;
  if (availability !== 'available') {
    return;
  }

  const parsedPlayer = authenticatedMinecraftPlayerSchema.safeParse({
    uuid: client.uuid.toLowerCase(),
    username: client.username,
  });
  if (!parsedPlayer.success) {
    throw new Error('Authenticated Minecraft profile has an invalid shape');
  }

  const resolution = await dependencies.resolver.resolve(
    pending.code,
    parsedPlayer.data,
    new Date(),
  );
  disconnect(
    client,
    resolution === 'resolved' ? english.minecraft.success : english.minecraft.unavailable,
  );
}
