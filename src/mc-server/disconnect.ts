import minecraftProtocol, { type Client } from 'minecraft-protocol';

// A disconnecting client is addressed in the protocol state it currently occupies. Before the
// login success packet the login-state disconnect is shown immediately. After success the client
// switches protocol state, so a login-state disconnect is no longer parsed and surfaces to the
// player as a generic connection error. Play-state clients must therefore be kicked once they enter
// the play state, which is why logged-in clients are tracked separately from the login handshake.
const loggedInClients = new WeakSet<Client>();
const disconnectingClients = new WeakSet<Client>();

const DEFAULT_PLAY_WAIT_TIMEOUT_MS = 10_000;

// The declared States enum is not exported by the package's declarations, so derive it from the
// runtime enum object to keep the state comparison fully typed.
type ProtocolState = (typeof minecraftProtocol.states)[keyof typeof minecraftProtocol.states];

export interface DisconnectOptions {
  /** Upper bound for waiting until a logged-in client reaches the play state. */
  readonly playWaitTimeoutMs?: number;
}

export function markLoggedIn(client: Client): void {
  loggedInClients.add(client);
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

  // The login success was already sent. Wait for the client to finish configuration so the reason
  // is delivered as a play-state kick instead of being dropped as an out-of-state packet.
  await waitForPlayState(client, options.playWaitTimeoutMs ?? DEFAULT_PLAY_WAIT_TIMEOUT_MS);
  client.end(message);
}

async function waitForPlayState(client: Client, timeoutMs: number): Promise<void> {
  if (client.state === minecraftProtocol.states.PLAY) {
    return;
  }

  await new Promise<void>((resolve): void => {
    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      client.removeListener('state', onState);
      resolve();
    };
    const onState = (state: ProtocolState): void => {
      if (state === minecraftProtocol.states.PLAY) {
        finish();
      }
    };
    const timer = setTimeout(finish, timeoutMs);

    client.on('state', onState);
    // Re-check after subscribing to close the gap between the initial check and the listener.
    if (client.state === minecraftProtocol.states.PLAY) {
      finish();
    }
  });
}
