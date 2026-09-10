import minecraftProtocol, { type Client } from 'minecraft-protocol';

// A disconnecting client is addressed in the protocol state it currently occupies. Before the
// login success packet the login-state disconnect is shown immediately. After success the client
// switches protocol state, so a login-state disconnect is no longer parsed and surfaces to the
// player as a generic connection error. Logged-in clients are therefore tracked separately and are
// only kicked once the void world has been presented, which is also when the play state exists.
const loggedInClients = new WeakSet<Client>();
const worldReadyClients = new WeakSet<Client>();
const worldReadyWaiters = new WeakMap<Client, Set<() => void>>();
const disconnectingClients = new WeakSet<Client>();

const DEFAULT_WORLD_WAIT_TIMEOUT_MS = 10_000;

export interface DisconnectOptions {
  /** Upper bound for waiting until a logged-in client enters its presented play world. */
  readonly worldWaitTimeoutMs?: number;
}

export function markLoggedIn(client: Client): void {
  loggedInClients.add(client);
}

export function isLoggedIn(client: Client): boolean {
  return loggedInClients.has(client);
}

export function markWorldReady(client: Client): void {
  worldReadyClients.add(client);

  const waiters = worldReadyWaiters.get(client);
  if (waiters === undefined) {
    return;
  }
  worldReadyWaiters.delete(client);
  for (const resolve of waiters) {
    resolve();
  }
}

export async function disconnect(
  client: Client,
  message: string,
  options: DisconnectOptions = {},
): Promise<void> {
  if (client.ended || disconnectingClients.has(client)) {
    return;
  }
  disconnectingClients.add(client);

  // The client has not completed login yet, so a login-state disconnect is valid and immediate.
  if (!loggedInClients.has(client) && client.state !== minecraftProtocol.states.PLAY) {
    client.end(message);
    return;
  }

  // The login success was already sent. Wait until the void world has been presented so the reason
  // is delivered as a play-state kick instead of being dropped as an out-of-state packet.
  await waitForWorldReady(client, options.worldWaitTimeoutMs ?? DEFAULT_WORLD_WAIT_TIMEOUT_MS);
  client.end(message);
}

async function waitForWorldReady(client: Client, timeoutMs: number): Promise<void> {
  if (worldReadyClients.has(client)) {
    return;
  }

  await new Promise<void>((resolve): void => {
    let settled = false;
    const waiters = getWaiters(client);
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      waiters.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);

    waiters.add(finish);
    // Re-check after subscribing to close the gap between the initial check and the listener.
    if (worldReadyClients.has(client)) {
      finish();
    }
  });
}

function getWaiters(client: Client): Set<() => void> {
  const existing = worldReadyWaiters.get(client);
  if (existing !== undefined) {
    return existing;
  }

  const created = new Set<() => void>();
  worldReadyWaiters.set(client, created);
  return created;
}
